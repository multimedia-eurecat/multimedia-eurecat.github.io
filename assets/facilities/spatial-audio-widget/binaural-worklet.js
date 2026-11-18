import createCatArtModule from './vendor/catart.wasm.js';

const BLOCK_SIZE = 128;

/** One mono sound object, rendered through the bundled HRIR-derived decoder. */
export class MoebiusBinauralProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'x', defaultValue: 0, minValue: -5, maxValue: 5, automationRate: 'k-rate' },
      { name: 'y', defaultValue: 0, minValue: -5, maxValue: 5, automationRate: 'k-rate' },
      { name: 'z', defaultValue: 0, minValue: -5, maxValue: 5, automationRate: 'k-rate' },
      { name: 'distance', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this._disposed = false;
    this._ready = false;
    this._inputPointer = 0;
    this._outputPointer = 0;
    this._sourceId = null;
    this._distance = 0.5;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'dispose') this._dispose();
    };

    try {
      // This build embeds its WASM binary and both decoder assets. Its factory
      // initializes synchronously, as required by the audio worklet constructor.
      this._module = createCatArtModule({ print() {} });
      const module = this._module;
      this._scene = new module.Scene(module.Scene.REAL_TIME, 5, BLOCK_SIZE, sampleRate);
      this._listenerId = this._scene.createListener();
      this._listenerPosition = new module.Cartesian(0, 0, 0);
      this._scene.updateListenerPosition(this._listenerId, this._listenerPosition);
      this._scene.initDecoder(module.BINAURAL, '/assets/default.bindec');
      this._scene.initReverbPattern('/assets/default.distpat');
      this._scene.setSceneSize(10);
      this._scene.setDistanceRolloffMode(module.LOGARITHMIC_LPF);
      this._scene.setDistanceAttenuation(this._distance);
      this._scene.setDistanceDryWetRatio(1);

      this._sourceId = this._scene.createSoundObject();
      // Public coordinates are +x front, +y left, +z up. The bundled
      // decoder renders positive engine y on the right; process() flips it.
      this._position = new module.Cartesian(1, 0, 0);
      this._scene.updateSoundObjectPosition(this._sourceId, this._position);
      this._scene.updateSoundObjectReverb(this._sourceId, 0);

      this._inputPointer = module._malloc(BLOCK_SIZE * Float32Array.BYTES_PER_ELEMENT);
      this._outputPointer = module._malloc(BLOCK_SIZE * 2 * Float32Array.BYTES_PER_ELEMENT);
      if (!this._inputPointer || !this._outputPointer) throw new Error('Could not allocate audio buffers.');
      this._refreshViews();
      this._inputView.fill(0);
      this._outputView.fill(0);
      this._ready = true;
      this.port.postMessage({ type: 'ready' });
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
    if (this._scene && this._sourceId !== null) {
      release(() => this._scene.destroySoundObject(this._sourceId));
    }
    if (this._inputPointer) release(() => module._free(this._inputPointer));
    if (this._outputPointer) release(() => module._free(this._outputPointer));
    if (this._position) release(() => module.destroy(this._position));
    if (this._listenerPosition) release(() => module.destroy(this._listenerPosition));
    if (this._scene) release(() => module.destroy(this._scene));
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
      const x = parameters.x[0];
      const y = -parameters.y[0];
      const z = parameters.z[0];
      if (this._position.x !== x || this._position.y !== y || this._position.z !== z) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
        this._scene.updateSoundObjectPosition(this._sourceId, this._position);
      }
      if (this._distance !== parameters.distance[0]) {
        this._distance = parameters.distance[0];
        this._scene.setDistanceAttenuation(this._distance);
      }

      // Updating position can grow the WASM heap. Rebuild views only when its
      // backing buffer changes; the usual render path allocates no JS buffers.
      this._refreshViews();
      const input = inputs[0] && inputs[0][0];
      for (let i = 0; i < BLOCK_SIZE; i++) {
        this._inputView[i] = input && i < input.length ? input[i] : 0;
      }
      this._scene.updateSoundObjectAudio(this._sourceId, this._inputPointer);
      this._scene.renderListenerInterleaved(this._listenerId, this._outputPointer, BLOCK_SIZE);
      this._refreshViews();
      for (let i = 0; i < BLOCK_SIZE; i++) {
        output[0][i] = this._outputView[i * 2];
        output[1][i] = this._outputView[i * 2 + 1];
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
