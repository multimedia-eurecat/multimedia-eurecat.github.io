import { SceneView } from './scene-view.js';
import { MAX_DISTANCE, constrainCartesian, constrainSpherical, toCartesian, toSpherical } from './coordinates.js';
import { DEFAULT_POSITION, PLAYBACK_DISTANCES, gainForDistance, createOutputLimiter } from './distance-model.js';

const stylesheetURL = new URL('./spatial-audio-widget.css', import.meta.url).href;
const workletURL = new URL('./binaural-worklet.js?v=ku100-three-1', import.meta.url).href;
const decoderManifestURL = new URL('./decoders/ku100/manifest.json', import.meta.url).href;
const defaultSampleURL = new URL('./drumloop.wav', import.meta.url).href;
const initialPosition = DEFAULT_POSITION;

/** Scene/API axes: +x right, +y up, +z front. Controls display Ambisonic axes. */
export class SpatialAudioWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._position = { ...initialPosition };
    this._sphericalPosition = toSpherical(initialPosition);
    this._coordinateSystem = 'spherical';
    this._volume = 0.65;
    this._state = 'empty';
    this._context = null;
    this._buffer = null;
    this._source = null;
    this._worklet = null;
    this._gain = null;
    this._distanceGain = null;
    this._decoderDistances = [];
    this._limiter = null;
    this._scene = null;
    this._enginePromise = null;
    this._playPromise = null;
    this._playRequest = 0;
    this._loadRequest = 0;
    this._generation = 0;
    this._offset = 0;
    this._startedAt = 0;
    this._mounted = false;
  }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    this._events = new AbortController();
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${stylesheetURL}">
      <section class="widget" aria-label="Binaural audio panner">
        <div class="stage">
          <div class="stage-top">
            <div class="coordinate-mode" role="group" aria-label="Position coordinate system">
              <button type="button" data-mode="spherical" aria-pressed="true">Spherical</button>
              <button type="button" data-mode="cartesian" aria-pressed="false">Cartesian</button>
            </div>
            <button class="view-reset" data-action="camera" type="button">Reset view</button>
          </div>
          <div class="viewport" data-role="viewport"></div>
          <div class="stage-bottom">
            <span class="scene-label"><span class="live-dot"></span>3D SOUND FIELD</span>
            <span class="orbit-hint">Drag background to orbit · Scroll to zoom</span>
          </div>
        </div>
        <div class="controls">
          <div class="control-heading"><span class="eyebrow">YOUR AUDIO</span></div>
          <p class="status" data-role="status" role="status" aria-live="polite">Loading the default drum loop…</p>
          <button class="play-button" data-action="play" type="button" disabled>
            <span data-role="play-icon" aria-hidden="true">▶</span><span data-role="play-label">Play Loop</span>
          </button>
          <label class="volume-row"><span>Volume</span><input data-role="volume" type="range" min="0" max="100" value="65" aria-label="Volume"><output data-role="volume-value">65%</output></label>
          <label class="file-picker">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>
            <span class="file-title">Choose another WAV</span>
            <span class="file-caption">or drop it here</span>
            <input type="file" accept=".wav,audio/wav,audio/x-wav,audio/wave" aria-label="Choose a WAV file">
          </label>
          <div class="file-info">
            <div class="current-audio">
              <span class="current-audio-label">Current audio:</span>
              <div class="filename-viewport">
                <span data-role="filename" tabindex="0" role="region" aria-label="Current audio filename">No audio selected</span>
              </div>
            </div>
            <span class="file-detail" data-role="file-detail">Your file stays in your browser.</span>
          </div>
          <div class="divider"></div>
          <div class="control-heading"><span class="eyebrow">SOURCE POSITION</span><button class="text-button" data-action="position" type="button">Reset</button></div>
          ${['x', 'y', 'z'].map((axis, index) => `
            <label class="axis-row" data-position-row="${index}">
              <span class="axis-label axis-${axis}">${['Y', 'Z', 'X'][index]}<span>${['Left / Right', 'Up / Down', 'Front / Back'][index]}</span></span>
              <output data-output="${axis}">0.00 m</output>
              <input data-axis="${axis}" data-sign="${index === 0 ? -1 : 1}" type="range" min="-4" max="4" step="0.05" value="0" aria-label="${['Y, left/right', 'Z, up/down', 'X, front/back'][index]} position in metres">
            </label>`).join('')}
          <p class="distance-note">Blending the 0.50 m, 1.50 m and 3.25 m recordings. Outside this range, the nearest recording is used.</p>
          <p class="headphone-note"><span class="headphone-pulse" aria-hidden="true">◖◗</span> Headphones required</p>
        </div>
      </section>`;

    const signal = this._events.signal;
    const query = (selector) => this.shadowRoot.querySelector(selector);
    this._ui = {
      play: query('[data-action="play"]'),
      playLabel: query('[data-role="play-label"]'),
      playIcon: query('[data-role="play-icon"]'),
      status: query('[data-role="status"]'),
      filename: query('[data-role="filename"]'),
      filenameViewport: query('.filename-viewport'),
      fileDetail: query('[data-role="file-detail"]'),
      fileInput: query('input[type="file"]'),
      picker: query('.file-picker'),
    };
    query('[data-role="volume"]').value = Math.round(this._volume * 100);
    query('[data-role="volume-value"]').textContent = `${Math.round(this._volume * 100)}%`;
    this._ui.filename.addEventListener('scroll', () => this._refreshFilenameOverflow(), { signal, passive: true });
    this._filenameObserver = new ResizeObserver(() => this._refreshFilenameOverflow());
    this._filenameObserver.observe(this._ui.filename);

    query('[data-action="play"]').addEventListener('click', () => {
      if (this.playing || this._playPromise) this.pause();
      else this.play().catch(() => {}); // play() reports errors in the widget.
    }, { signal });
    this._ui.fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) this.loadFile(file).catch(() => {});
      event.target.value = '';
    }, { signal });
    for (const eventName of ['dragenter', 'dragover']) {
      this._ui.picker.addEventListener(eventName, (event) => {
        event.preventDefault();
        this._ui.picker.classList.add('drag-over');
      }, { signal });
    }
    this._ui.picker.addEventListener('dragleave', () => this._ui.picker.classList.remove('drag-over'), { signal });
    this._ui.picker.addEventListener('drop', (event) => {
      event.preventDefault();
      this._ui.picker.classList.remove('drag-over');
      const file = event.dataTransfer.files[0];
      if (file) this.loadFile(file).catch(() => {});
    }, { signal });
    query('[data-role="volume"]').addEventListener('input', (event) => {
      this._volume = Number(event.target.value) / 100;
      query('[data-role="volume-value"]').textContent = `${event.target.value}%`;
      if (this._gain) this._gain.gain.setTargetAtTime(this._volume, this._context.currentTime, 0.015);
    }, { signal });
    this.shadowRoot.querySelectorAll('[data-axis]').forEach((input) => {
      input.addEventListener('input', () => {
        const change = { [input.dataset.axis]: Number(input.value) * Number(input.dataset.sign) };
        if (this._coordinateSystem === 'spherical') this.setSphericalPosition(change);
        else this.setPosition(change);
      }, { signal });
    });
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => this.setCoordinateSystem(button.dataset.mode), { signal });
    });
    query('[data-action="position"]').addEventListener('click', () => this.setPosition(initialPosition), { signal });
    query('[data-action="camera"]').addEventListener('click', () => this._scene?.resetCamera(), { signal });

    try {
      this._scene = new SceneView(query('[data-role="viewport"]'), {
        position: this._position,
        onChange: (position, spherical) => spherical ? this.setSphericalPosition(spherical) : this.setPosition(position),
      });
    } catch (error) {
      query('[data-role="viewport"]').textContent = 'The 3D view requires WebGL. You can still position the sound with the sliders.';
      console.warn('Spatial audio widget: 3D view unavailable.', error);
    }
    this._refreshCoordinateSystem();
    this._refreshPlayback();
    this._loadDefaultSample().catch(() => {}); // Loading errors are shown beside the upload control.
  }

  disconnectedCallback() {
    this.destroy();
  }

  get audioContext() { return this._context; }
  get playing() { return this._source !== null; }
  get state() { return this._state; }
  get coordinateSystem() { return this._coordinateSystem; }

  getPosition() { return { ...this._position }; }
  getSphericalPosition() { return { ...this._sphericalPosition }; }

  setPosition(position) {
    const next = {};
    for (const axis of ['x', 'y', 'z']) {
      next[axis] = position[axis] ?? this._position[axis];
    }
    const bounded = constrainCartesian(next, this._position);
    this._applyPosition(bounded, toSpherical(bounded, this._sphericalPosition));
  }

  setSphericalPosition(position) {
    const spherical = constrainSpherical({ ...this._sphericalPosition, ...position });
    this._applyPosition(toCartesian(spherical), spherical);
  }

  _applyPosition(position, spherical) {
    this._position = { ...position };
    this._sphericalPosition = { ...spherical };
    this._scene?.setPosition(position, spherical);
    this._refreshPosition();
    this._syncAudioPosition();
    this.dispatchEvent(new CustomEvent('positionchange', { detail: { position: this.getPosition(), spherical: this.getSphericalPosition() }, bubbles: true, composed: true }));
  }

  setCoordinateSystem(mode) {
    if (!['cartesian', 'spherical'].includes(mode)) throw new TypeError('Coordinate system must be cartesian or spherical.');
    if (mode === this._coordinateSystem) return;
    this._coordinateSystem = mode;
    this._refreshCoordinateSystem();
    this.dispatchEvent(new CustomEvent('coordinatemodechange', { detail: { mode }, bubbles: true, composed: true }));
  }

  _refreshCoordinateSystem() {
    if (!this._mounted) return;
    const spherical = this._coordinateSystem === 'spherical';
    const coordinates = spherical ? [
      ['azimuth', 'AZ', 'Azimuth', -180, 180, 1, 'Azimuth in degrees; zero is front, positive is right'],
      ['elevation', 'EL', 'Elevation', -90, 90, 1, 'Elevation in degrees'],
      ['distance', 'D', 'Distance', 0, MAX_DISTANCE, 0.05, 'Distance from listener in metres'],
    ] : [
      ['x', 'Y', 'Left / Right', -4, 4, 0.05, 'Y (ACN 1), left/right position in metres; positive is left', -1],
      ['y', 'Z', 'Up / Down', -4, 4, 0.05, 'Z (ACN 2), up/down position in metres; positive is up'],
      ['z', 'X', 'Front / Back', -4, 4, 0.05, 'X (ACN 3), front/back position in metres; positive is front'],
    ];
    this.shadowRoot.querySelectorAll('[data-position-row]').forEach((row, index) => {
      const [key, label, description, min, max, step, ariaLabel, sign = 1] = coordinates[index];
      row.querySelector('.axis-label').innerHTML = `${label}<span>${description}</span>`;
      const input = row.querySelector('input');
      Object.assign(input, { min, max, step });
      input.dataset.axis = key;
      input.dataset.sign = sign;
      input.setAttribute('aria-label', ariaLabel);
      row.querySelector('output').dataset.output = key;
    });
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === this._coordinateSystem)));
    this._scene?.setCoordinateSystem(this._coordinateSystem);
    this._scene?.setPosition(this._position, this._sphericalPosition);
    this._refreshPosition();
  }

  _refreshPosition() {
    if (!this._mounted) return;
    const spherical = this._coordinateSystem === 'spherical';
    const values = spherical ? this._sphericalPosition : this._position;
    const extent = Math.max(4, Math.ceil(Math.max(...Object.values(this._position).map(Math.abs))));
    for (const [axis, value] of Object.entries(values)) {
      const input = this.shadowRoot.querySelector(`[data-axis="${axis}"]`);
      if (!spherical) { input.min = -extent; input.max = extent; }
      const displayValue = value * Number(input.dataset.sign);
      input.value = displayValue;
      const angle = spherical && axis !== 'distance';
      const formatted = `${displayValue > 0 && axis !== 'distance' ? '+' : ''}${displayValue.toFixed(angle ? 1 : 2)}`;
      input.setAttribute('aria-valuetext', `${formatted} ${angle ? 'degrees' : 'metres'}`);
      this.shadowRoot.querySelector(`[data-output="${axis}"]`).textContent = `${formatted}${angle ? '°' : ' m'}`;
    }
  }

  _refreshFilenameOverflow() {
    if (!this._mounted) return;
    const filename = this._ui.filename;
    const hiddenAtRight = filename.scrollWidth - filename.clientWidth - filename.scrollLeft > 1;
    this._ui.filenameViewport.classList.toggle('has-overflow', hiddenAtRight);
  }

  _getContext() {
    if (!this._mounted) throw new Error('Connect the widget to the page before loading audio.');
    if (!window.isSecureContext) throw new Error('Open this page through localhost or HTTPS to enable audio processing.');
    if (!this._context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support Web Audio.');
      // Match the original engine’s rate; decodeAudioData resamples the uploaded WAV.
      this._context = new AudioContextClass({ sampleRate: 44100 });
      this._context.addEventListener('statechange', () => {
        if (this._context?.state === 'interrupted' && this.playing) this.pause();
      }, { signal: this._events.signal });
    }
    return this._context;
  }

  loadFile(file) {
    return this._loadAudio(() => file, 'Reading your WAV file…');
  }

  _loadDefaultSample() {
    return this._loadAudio(async () => {
      const response = await fetch(defaultSampleURL, { signal: this._events.signal });
      if (!response.ok) throw new Error('The default drum loop could not be loaded. Choose a WAV file to continue.');
      return new File([await response.arrayBuffer()], 'drumloop.wav', { type: 'audio/wav' });
    }, 'Loading the default drum loop…');
  }

  async _loadAudio(readFile, message) {
    const request = ++this._loadRequest;
    this.pause();
    this._setState('loading', message);
    try {
      const file = await readFile();
      if (request !== this._loadRequest || !this._mounted) return;
      const context = this._getContext();
      const bytes = await file.arrayBuffer();
      const header = new TextDecoder('ascii').decode(bytes.slice(0, 12));
      if (bytes.byteLength < 12 || !['RIFF', 'RIFX', 'RF64'].includes(header.slice(0, 4)) || header.slice(8, 12) !== 'WAVE') {
        throw new Error('Please choose a valid WAV audio file.');
      }
      const decoded = await context.decodeAudioData(bytes);
      if (request !== this._loadRequest || !this._mounted) return;
      if (!decoded.length) throw new Error('This WAV file contains no audio.');
      const mono = context.createBuffer(1, decoded.length, decoded.sampleRate);
      const samples = mono.getChannelData(0);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const input = decoded.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += input[i] / decoded.numberOfChannels;
      }
      this._buffer = mono;
      this._offset = 0;
      this._ui.filename.textContent = file.name;
      this._ui.filename.title = file.name;
      this._ui.filename.scrollLeft = 0;
      this._refreshFilenameOverflow();
      this._ui.fileDetail.textContent = `${decoded.duration.toFixed(1)} s · ${decoded.numberOfChannels === 1 ? 'Mono' : 'Mixed to mono'} · Looped`;
      this._setState('ready', 'Ready. Press Play Loop to listen.');
      this.dispatchEvent(new CustomEvent('audioload', { detail: { name: file.name, duration: decoded.duration }, bubbles: true, composed: true }));
    } catch (error) {
      if (request !== this._loadRequest || !this._mounted) return;
      this._showError(error);
      throw error;
    }
  }

  async _ensureEngine() {
    if (this._worklet) return;
    if (this._enginePromise) return this._enginePromise;
    const context = this._getContext();
    const generation = this._generation;
    let pendingNode = null;
    this._enginePromise = (async () => {
      if (!context.audioWorklet) throw new Error('AudioWorklet is unavailable. Use a browser with Web Audio and open the page on localhost or HTTPS.');
      const [distanceDecoders] = await Promise.all([
        this._loadDistanceDecoders(),
        context.audioWorklet.addModule(workletURL),
      ]);
      if (!this._mounted || generation !== this._generation) return;
      const node = new AudioWorkletNode(context, 'moebius-binaural-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: { distanceDecoders },
      });
      pendingNode = node;
      this._pendingWorklet = node;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('The binaural audio engine did not become ready.')), 20000);
        const finish = (error) => {
          clearTimeout(timeout);
          this._cancelEngine = null;
          if (error) reject(error);
          else resolve();
        };
        this._cancelEngine = () => finish(new Error('Audio initialization was cancelled.'));
        node.onprocessorerror = () => finish(new Error('The binaural audio processor could not start.'));
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready') {
            this._decoderDistances = data.distances;
            finish();
          }
          if (data.type === 'error') finish(new Error(data.message));
        };
      });
      if (!this._mounted || generation !== this._generation) {
        node.port.postMessage({ type: 'dispose' });
        node.port.close();
        return;
      }
      this._worklet = node;
      this._pendingWorklet = null;
      this._distanceGain = context.createGain();
      this._distanceGain.gain.value = gainForDistance(this._sphericalPosition.distance);
      this._gain = context.createGain();
      this._gain.gain.value = this._volume;
      this._limiter = createOutputLimiter(context);
      node.connect(this._distanceGain).connect(this._gain).connect(this._limiter.input);
      this._limiter.output.connect(context.destination);
      node.onprocessorerror = () => {
        this._handleProcessorFailure(node, new Error('The binaural processor stopped. Press play to retry.'));
      };
      node.port.onmessage = ({ data }) => {
        if (data.type === 'error') {
          this._handleProcessorFailure(node, new Error(`${data.message} Press play to retry.`));
        }
      };
      this._syncAudioPosition(true);
    })();
    try {
      await this._enginePromise;
    } catch (error) {
      if (pendingNode) {
        pendingNode.port.postMessage({ type: 'dispose' });
        pendingNode.port.close();
        pendingNode.disconnect();
        if (this._worklet === pendingNode) {
          this._worklet = null;
          this._disconnectAudioOutput();
        }
        if (this._pendingWorklet === pendingNode) this._pendingWorklet = null;
      }
      throw error;
    } finally {
      if (generation === this._generation) this._enginePromise = null;
    }
  }

  async _loadDistanceDecoders() {
    const signal = this._events.signal;
    const response = await fetch(decoderManifestURL, { signal });
    if (!response.ok) throw new Error('The KU100 distance recordings could not be loaded. Press play to retry.');
    const manifest = await response.json();
    const entries = manifest?.distances;
    if (!Array.isArray(entries) || !entries.length || manifest.maxOrder !== 5
        || manifest.channelOrdering !== 'ACN' || manifest.inputNormalization !== 'SN3D'
        || entries.some((entry, index) => !Number.isFinite(entry?.distanceMetres)
          || entry.distanceMetres <= 0 || typeof entry.decoder !== 'string' || !entry.decoder
          || !Number.isInteger(entry.bytes) || entry.bytes <= 0
          || (index && entry.distanceMetres <= entries[index - 1].distanceMetres))) {
      throw new Error('The KU100 distance recording manifest is invalid.');
    }
    const selected = entries.filter((entry) => PLAYBACK_DISTANCES.includes(entry.distanceMetres));
    if (selected.length !== PLAYBACK_DISTANCES.length) {
      throw new Error('The selected KU100 distance recordings are missing from the manifest.');
    }
    return Promise.all(selected.map(async (entry) => {
      const response = await fetch(new URL(entry.decoder, decoderManifestURL), { signal });
      if (!response.ok) throw new Error(`The KU100 recording at ${entry.distanceMetres} m could not be loaded. Press play to retry.`);
      const decoder = await response.arrayBuffer();
      if (!decoder.byteLength || decoder.byteLength !== entry.bytes) {
        throw new Error(`The KU100 recording at ${entry.distanceMetres} m is incomplete. Press play to retry.`);
      }
      return { distance: entry.distanceMetres, decoder };
    }));
  }

  _handleProcessorFailure(node, error) {
    if (this._worklet !== node) return;
    this.pause();
    node.onprocessorerror = null;
    node.port.onmessage = null;
    node.port.postMessage({ type: 'dispose' });
    node.port.close();
    node.disconnect();
    this._disconnectAudioOutput();
    this._worklet = null;
    this._showError(error);
  }

  _disconnectAudioOutput() {
    for (const key of ['_distanceGain', '_gain', '_limiter']) {
      this[key]?.disconnect();
      this[key] = null;
    }
  }

  _syncAudioPosition(immediate = false) {
    if (!this._worklet) return;
    // Visual +X right/+Y up/+Z front -> public worklet +X front/+Y left/+Z up.
    // The worklet also corrects the bundled decoder’s measured horizontal sign.
    const coordinates = { x: this._position.z, y: -this._position.x, z: this._position.y };
    const now = this._context.currentTime;
    for (const [axis, value] of Object.entries(coordinates)) {
      const parameter = this._worklet.parameters.get(axis);
      parameter.cancelScheduledValues(now);
      if (immediate) parameter.setValueAtTime(value, now);
      else parameter.setTargetAtTime(value, now, 0.015);
    }
    const gain = this._distanceGain.gain;
    const value = gainForDistance(this._sphericalPosition.distance);
    gain.cancelScheduledValues(now);
    if (immediate) gain.setValueAtTime(value, now);
    else gain.setTargetAtTime(value, now, 0.015);
  }

  play() {
    if (this.playing) return Promise.resolve();
    if (this._playPromise) return this._playPromise;
    if (!this._buffer) return Promise.reject(new Error('Choose a WAV file before starting playback.'));
    const request = ++this._playRequest;
    const generation = this._generation;
    this._playPromise = (async () => {
      try {
        const context = this._getContext();
        this._setState('ready', 'Preparing binaural audio…');
        // Resume within the click handler to satisfy browser autoplay policies.
        await Promise.all([context.resume(), this._ensureEngine()]);
        if (!this._mounted || request !== this._playRequest || generation !== this._generation) return;
        const source = context.createBufferSource();
        source.buffer = this._buffer;
        source.loop = true;
        source.connect(this._worklet);
        this._source = source;
        this._startedAt = context.currentTime;
        source.start(0, this._offset % this._buffer.duration);
        this._setState('playing', 'Looping. Move the sphere to pan the sound.');
      } catch (error) {
        if (this._mounted && request === this._playRequest && generation === this._generation) this._showError(error);
        throw error;
      } finally {
        if (request === this._playRequest) this._playPromise = null;
      }
    })();
    return this._playPromise;
  }

  pause() {
    ++this._playRequest;
    this._playPromise = null;
    if (this._source) {
      if (this._buffer) this._offset = (this._offset + this._context.currentTime - this._startedAt) % this._buffer.duration;
      this._source.stop();
      this._source.disconnect();
      this._source = null;
    }
    if (this._context?.state === 'running') this._context.suspend().catch(() => {});
    if (this._mounted && this._buffer) this._setState('paused', 'Paused. Press play to continue.');
  }

  _setState(state, message) {
    this._state = state;
    if (!this._mounted) return;
    this._ui.status.textContent = message;
    this._ui.status.classList.toggle('error', state === 'error');
    this._refreshPlayback();
  }

  _refreshPlayback() {
    if (!this._mounted) return;
    this._ui.play.disabled = !this._buffer || this._state === 'loading';
    this._ui.playLabel.textContent = this.playing ? 'Pause Loop' : 'Play Loop';
    this._ui.playIcon.textContent = this.playing ? 'Ⅱ' : '▶';
    this._ui.play.setAttribute('aria-pressed', String(this.playing));
  }

  _showError(error) {
    this._setState('error', error.message || 'The audio could not be loaded.');
    this.dispatchEvent(new CustomEvent('audioerror', { detail: { message: error.message }, bubbles: true, composed: true }));
  }

  /** Release the audio context, event listeners, and WebGL resources. */
  destroy() {
    this.pause();
    ++this._loadRequest;
    ++this._generation;
    this._mounted = false;
    this._cancelEngine?.();
    this._cancelEngine = null;
    this._events?.abort();
    this._filenameObserver?.disconnect();
    this._filenameObserver = null;
    this._scene?.dispose();
    this._scene = null;
    for (const node of [this._worklet, this._pendingWorklet]) {
      if (!node) continue;
      node.onprocessorerror = null;
      node.port.onmessage = null;
      node.port.postMessage({ type: 'dispose' });
      node.port.close();
      node.disconnect();
    }
    this._disconnectAudioOutput();
    if (this._context && this._context.state !== 'closed') this._context.close().catch(() => {});
    this._context = null;
    this._worklet = null;
    this._pendingWorklet = null;
    this._decoderDistances = [];
    this._gain = null;
    this._buffer = null;
    this._enginePromise = null;
    this._state = 'empty';
    this._offset = 0;
    this.shadowRoot.replaceChildren();
  }
}

if (!customElements.get('spatial-audio-widget')) {
  customElements.define('spatial-audio-widget', SpatialAudioWidget);
}
