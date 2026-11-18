import { SceneView } from './scene-view.js';

const stylesheetURL = new URL('./spatial-audio-widget.css', import.meta.url).href;
const workletURL = new URL('./binaural-worklet.js', import.meta.url).href;
const initialPosition = { x: 1.5, y: 0.6, z: 1.6 };

/** Visual axes: +X right, +Y up, +Z in front of the listener. Units: metres. */
export class SpatialAudioWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._position = { ...initialPosition };
    this._volume = 0.65;
    this._state = 'empty';
    this._context = null;
    this._buffer = null;
    this._source = null;
    this._worklet = null;
    this._gain = null;
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
            <span class="scene-label"><span class="live-dot"></span>3D SOUND FIELD</span>
            <button class="quiet-button" data-action="camera" type="button">Reset view <span aria-hidden="true">↗</span></button>
          </div>
          <div class="viewport" data-role="viewport"></div>
          <div class="stage-bottom">
            <span><i class="key source-key"></i>Sound source</span>
            <span><i class="key listener-key"></i>Listener</span>
            <span class="orbit-hint">Drag background to orbit · Scroll to zoom</span>
          </div>
        </div>
        <div class="controls">
          <div class="control-heading"><span class="eyebrow">YOUR AUDIO</span><span class="pill">LOOP</span></div>
          <label class="file-picker">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>
            <span class="file-title">Choose a WAV file</span>
            <span class="file-caption">or drop it here</span>
            <input type="file" accept=".wav,audio/wav,audio/x-wav,audio/wave" aria-label="Choose a WAV file">
          </label>
          <div class="file-info">
            <span data-role="filename">No audio selected</span>
            <span class="file-detail" data-role="file-detail">Your file stays in your browser.</span>
          </div>
          <button class="play-button" data-action="play" type="button" disabled>
            <span data-role="play-icon" aria-hidden="true">▶</span><span data-role="play-label">Play loop</span>
          </button>
          <label class="volume-row"><span>Volume</span><input data-role="volume" type="range" min="0" max="100" value="65" aria-label="Volume"><output data-role="volume-value">65%</output></label>
          <div class="divider"></div>
          <div class="control-heading"><span class="eyebrow">SOURCE POSITION</span><button class="text-button" data-action="position" type="button">Reset</button></div>
          <p class="position-hint">Drag the sphere’s axis handles, or use the sliders.</p>
          ${['x', 'y', 'z'].map((axis, index) => `
            <label class="axis-row">
              <span class="axis-label axis-${axis}">${axis.toUpperCase()}<span>${['Right', 'Up', 'Front'][index]}</span></span>
              <output data-output="${axis}">0.00 m</output>
              <input data-axis="${axis}" type="range" min="-4" max="4" step="0.05" value="0" aria-label="${['Left to right', 'Below to above', 'Behind to in front'][index]} position in metres">
            </label>`).join('')}
          <p class="status" data-role="status" role="status" aria-live="polite">Choose a WAV to start listening.</p>
          <p class="headphone-note"><span aria-hidden="true">◖◗</span> Headphones required</p>
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
      fileDetail: query('[data-role="file-detail"]'),
      fileInput: query('input[type="file"]'),
      picker: query('.file-picker'),
    };
    query('[data-role="volume"]').value = Math.round(this._volume * 100);
    query('[data-role="volume-value"]').textContent = `${Math.round(this._volume * 100)}%`;

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
      input.addEventListener('input', () => this.setPosition({ ...this._position, [input.dataset.axis]: Number(input.value) }), { signal });
    });
    query('[data-action="position"]').addEventListener('click', () => this.setPosition(initialPosition), { signal });
    query('[data-action="camera"]').addEventListener('click', () => this._scene?.resetCamera(), { signal });

    try {
      this._scene = new SceneView(query('[data-role="viewport"]'), {
        position: this._position,
        onChange: (position) => this.setPosition(position),
      });
    } catch (error) {
      query('[data-role="viewport"]').textContent = 'The 3D view requires WebGL. You can still position the sound with the sliders.';
      console.warn('Spatial audio widget: 3D view unavailable.', error);
    }
    this._refreshPosition();
    this._refreshPlayback();
  }

  disconnectedCallback() {
    this.destroy();
  }

  get audioContext() { return this._context; }
  get playing() { return this._source !== null; }
  get state() { return this._state; }

  getPosition() { return { ...this._position }; }

  setPosition(position) {
    const next = {};
    for (const axis of ['x', 'y', 'z']) {
      const value = position[axis] ?? this._position[axis];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Position coordinates must be finite numbers.');
      next[axis] = Math.max(-4, Math.min(4, value));
    }
    this._position = next;
    this._scene?.setPosition(next);
    this._refreshPosition();
    this._syncAudioPosition();
    this.dispatchEvent(new CustomEvent('positionchange', { detail: { position: this.getPosition() }, bubbles: true, composed: true }));
  }

  _refreshPosition() {
    if (!this._mounted) return;
    for (const axis of ['x', 'y', 'z']) {
      const value = this._position[axis];
      const input = this.shadowRoot.querySelector(`[data-axis="${axis}"]`);
      input.value = value;
      input.setAttribute('aria-valuetext', `${value.toFixed(2)} metres`);
      this.shadowRoot.querySelector(`[data-output="${axis}"]`).textContent = `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;
    }
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

  async loadFile(file) {
    const request = ++this._loadRequest;
    this.pause();
    this._setState('loading', 'Reading your WAV file…');
    try {
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
      this._ui.fileDetail.textContent = `${decoded.duration.toFixed(1)} s · ${decoded.numberOfChannels === 1 ? 'Mono' : 'Mixed to mono'} · Looped`;
      this._setState('ready', 'Ready. Press play and move the sound.');
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
      await context.audioWorklet.addModule(workletURL);
      if (!this._mounted || generation !== this._generation) return;
      const node = new AudioWorkletNode(context, 'moebius-binaural-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
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
          if (data.type === 'ready') finish();
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
      this._gain = context.createGain();
      this._gain.gain.value = this._volume;
      node.connect(this._gain).connect(context.destination);
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
        if (this._pendingWorklet === pendingNode) this._pendingWorklet = null;
      }
      throw error;
    } finally {
      if (generation === this._generation) this._enginePromise = null;
    }
  }

  _handleProcessorFailure(node, error) {
    if (this._worklet !== node) return;
    this.pause();
    node.onprocessorerror = null;
    node.port.onmessage = null;
    node.port.postMessage({ type: 'dispose' });
    node.port.close();
    node.disconnect();
    this._gain?.disconnect();
    this._worklet = null;
    this._gain = null;
    this._showError(error);
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
    this._ui.playLabel.textContent = this.playing ? 'Pause loop' : 'Play loop';
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
    this._gain?.disconnect();
    if (this._context && this._context.state !== 'closed') this._context.close().catch(() => {});
    this._context = null;
    this._worklet = null;
    this._pendingWorklet = null;
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
