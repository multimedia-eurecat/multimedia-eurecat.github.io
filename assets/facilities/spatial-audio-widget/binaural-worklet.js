import createCatArtModule from './vendor/catart.wasm.js';
import { MAX_DISTANCE } from './coordinates.js';
import { REFERENCE_DISTANCE, writeDistanceWeights } from './distance-model.js';

const BLOCK_SIZE = 128;

/** One mono source, rendered through continuously running distance decoders. */
export class MoebiusBinauralProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'x', defaultValue: REFERENCE_DISTANCE, minValue: -MAX_DISTANCE, maxValue: MAX_DISTANCE, automationRate: 'k-rate' },
      { name: 'y', defaultValue: 0, minValue: -MAX_DISTANCE, maxValue: MAX_DISTANCE, automationRate: 'k-rate' },
      { name: 'z', defaultValue: 0, minValue: -MAX_DISTANCE, maxValue: MAX_DISTANCE, automationRate: 'k-rate' },
    ];
  }

  constructor(options = {}) {
    super();
    this._disposed = false;
    this._ready = false;
    this._inputPointer = 0;
    this._outputPointer = 0;
    this._sourceId = null;
    this._banks = [];
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'dispose') this._dispose();
    };

    try {
      // This build embeds its WASM binary and both decoder assets. Its factory
      // initializes synchronously, as required by the audio worklet constructor.
      const decoder = options.processorOptions?.decoder;
      const distanceDecoders = options.processorOptions?.distanceDecoders;
      if (distanceDecoders !== undefined) {
        if (!Array.isArray(distanceDecoders) || !distanceDecoders.length || decoder) {
          throw new Error('Supply a nonempty distance decoder list or one fixed decoder.');
        }
        for (let i = 0; i < distanceDecoders.length; i++) {
          const entry = distanceDecoders[i];
          if (!Number.isFinite(entry?.distance) || entry.distance <= 0
              || (i && entry.distance <= distanceDecoders[i - 1].distance)
              || !entry.decoder?.byteLength) {
            throw new Error('Distance decoders require ascending positive radii and nonempty data.');
          }
        }
      }
      // Retain fixed-decoder support for the standalone engine and regression
      // checks. Each distance bank has its own Scene/convolution history inside
      // one WASM instance; install every asset before native initialization.
      const configs = distanceDecoders || [{ distance: REFERENCE_DISTANCE, decoder }];
      this._distances = configs.map((entry) => entry.distance);
      this._weights = new Float64Array(configs.length);
      this._targetWeights = new Float64Array(configs.length);
      this._weightFrames = new Float64Array(configs.length * BLOCK_SIZE);
      this._weightsInitialized = false;
      this._weightSmoothing = 1 - Math.exp(-1 / (0.015 * sampleRate));
      this._module = createCatArtModule({
        print() {},
        preRun: configs[0].decoder ? [(module) => {
          module.FS_unlink('/assets/default.bindec');
          for (let i = 0; i < configs.length; i++) {
            const name = i ? `distance-${i}.bindec` : 'default.bindec';
            module.FS_createDataFile('/assets', name, new Uint8Array(configs[i].decoder), true, true, false);
          }
        }] : [],
      });
      const module = this._module;
      this._listenerPosition = new module.Cartesian(0, 0, 0);
      // Public coordinates: +X front, +Y left, +Z up. Native positive Y
      // renders on the right for these decoders, so process() reflects it.
      this._position = new module.Cartesian(REFERENCE_DISTANCE, 0, 0);
      for (let i = 0; i < configs.length; i++) {
        const bank = { scene: new module.Scene(module.Scene.REAL_TIME, 5, BLOCK_SIZE, sampleRate), sourceId: null };
        this._banks.push(bank); // Include partial initialization in disposal.
        bank.scene.initDecoder(module.BINAURAL, i ? `/assets/distance-${i}.bindec` : '/assets/default.bindec');
        const listenerId = bank.scene.createListener();
        bank.scene.updateListenerPosition(listenerId, this._listenerPosition);
        bank.scene.initReverbPattern('/assets/default.distpat');
        bank.scene.setSceneSize(10);
        bank.scene.setDistanceRolloffMode(module.LOGARITHMIC_LPF);
        bank.scene.setDistanceAttenuation(0);
        bank.scene.setDistanceDryWetRatio(1);
        bank.listenerId = listenerId;
        bank.sourceId = bank.scene.createSoundObject();
        bank.scene.updateSoundObjectPosition(bank.sourceId, this._position);
        bank.scene.updateSoundObjectReverb(bank.sourceId, 0);
      }
      // Keep the fixed-bank inspection fields used by the DSP harness.
      this._scene = this._banks[0].scene;
      this._sourceId = this._banks[0].sourceId;
      this._listenerId = this._banks[0].listenerId;

      this._inputPointer = module._malloc(BLOCK_SIZE * Float32Array.BYTES_PER_ELEMENT);
      this._outputPointer = module._malloc(BLOCK_SIZE * 2 * Float32Array.BYTES_PER_ELEMENT);
      if (!this._inputPointer || !this._outputPointer) throw new Error('Could not allocate audio buffers.');
      this._refreshViews();
      this._inputView.fill(0);
      this._outputView.fill(0);
      this._ready = true;
      this.port.postMessage({
        type: 'ready',
        decoderBytes: configs.reduce((total, entry) => total + (entry.decoder?.byteLength || 0), 0),
        distances: distanceDecoders ? this._distances : [],
      });
    } catch (error) {
      this._fail(error);
    }
  }

  _refreshViews() {
    const buffer = this._module.HEAPF32.buffer;
    if (buffer !== this._heapBuffer) {
      this._heapBuffer = buffer;
      this._inputView = new Float32Array(buffer, this._inputPointer, BLOCK_SIZE);
      this._outputView = new Float32Array(buffer, this._outputPointer, BLOCK_SIZE * 2);
    }
  }

  _dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._ready = false;
    const module = this._module;
    if (!module) return;

    // A failed initialization may leave only some of these resources alive.
    // Attempt each cleanup independently, including after a WASM exception.
    const release = (action) => { try { action(); } catch (_) { /* Continue cleanup. */ } };
    for (const bank of this._banks) {
      if (bank.sourceId !== null) release(() => bank.scene.destroySoundObject(bank.sourceId));
      release(() => module.destroy(bank.scene));
    }
    this._banks = [];
    if (this._inputPointer) release(() => module._free(this._inputPointer));
    if (this._outputPointer) release(() => module._free(this._outputPointer));
    if (this._position) release(() => module.destroy(this._position));
    if (this._listenerPosition) release(() => module.destroy(this._listenerPosition));
    this._scene = null;
    this._position = null;
    this._listenerPosition = null;
    this._sourceId = null;
    this._inputPointer = 0;
    this._outputPointer = 0;
    this._module = null;
    this._inputView = null;
    this._outputView = null;
    this._heapBuffer = null;
  }

  _fail(error) {
    this.port.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
    this._dispose();
  }

  process(inputs, outputs, parameters) {
    if (!this._ready || this._disposed) return false;
    const output = outputs[0];
    if (!output || output.length < 2 || output[0].length !== BLOCK_SIZE || output[1].length !== BLOCK_SIZE) {
      this._fail(new Error('The binaural engine requires stereo output in 128-frame blocks.'));
      return false;
    }

    try {
      const radius = Math.hypot(parameters.x[0], parameters.y[0], parameters.z[0]);
      if (!Number.isFinite(radius)) throw new Error('Source coordinates must be finite.');
      // Native scenes supply direction only. Radius selects the measured
      // decoders; at the origin retain the last direction and use the nearest.
      const scale = radius > 1e-8 ? REFERENCE_DISTANCE / radius : 0;
      const x = scale ? parameters.x[0] * scale : this._position.x;
      const y = scale ? -parameters.y[0] * scale : this._position.y;
      const z = scale ? parameters.z[0] * scale : this._position.z;
      if (this._position.x !== x || this._position.y !== y || this._position.z !== z) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
        for (const bank of this._banks) bank.scene.updateSoundObjectPosition(bank.sourceId, this._position);
      }

      // Updating position can grow the WASM heap. Rebuild views only when its
      // backing buffer changes; the usual render path allocates no JS buffers.
      this._refreshViews();
      const input = inputs[0] && inputs[0][0];
      for (let i = 0; i < BLOCK_SIZE; i++) {
        this._inputView[i] = input && i < input.length ? input[i] : 0;
      }
      writeDistanceWeights(radius, this._distances, this._targetWeights);
      if (!this._weightsInitialized) {
        this._weights.set(this._targetWeights);
        this._weightsInitialized = true;
      }
      for (let bank = 0; bank < this._banks.length; bank++) {
        let weight = this._weights[bank];
        for (let frame = 0; frame < BLOCK_SIZE; frame++) {
          weight += this._weightSmoothing * (this._targetWeights[bank] - weight);
          this._weightFrames[bank * BLOCK_SIZE + frame] = weight;
        }
        this._weights[bank] = weight;
      }
      output[0].fill(0);
      output[1].fill(0);
      // Keep every bank fed, including zero-weight ones. Moving across a shell
      // boundary then blends warm FIR histories without reinitializing DSP.
      for (let index = 0; index < this._banks.length; index++) {
        const bank = this._banks[index];
        bank.scene.updateSoundObjectAudio(bank.sourceId, this._inputPointer);
        bank.scene.renderListenerInterleaved(bank.listenerId, this._outputPointer, BLOCK_SIZE);
        this._refreshViews();
        for (let frame = 0; frame < BLOCK_SIZE; frame++) {
          const weight = this._weightFrames[index * BLOCK_SIZE + frame];
          output[0][frame] += this._outputView[frame * 2] * weight;
          output[1][frame] += this._outputView[frame * 2 + 1] * weight;
        }
      }
      return true;
    } catch (error) {
      output[0].fill(0);
      output[1].fill(0);
      this._fail(error);
      return false;
    }
  }
}

registerProcessor('moebius-binaural-processor', MoebiusBinauralProcessor);
