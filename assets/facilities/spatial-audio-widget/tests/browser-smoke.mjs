#!/usr/bin/env node
// Run with Node 22+ and Chrome installed. No npm dependencies are required.
// CHROME_PATH=/path/to/chrome node spatial-audio-widget/tests/browser-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const widgetDirectory = path.dirname(testDirectory);
const chromePath = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const errors = [];
const requests = [];
const mimeTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json',
  '.wav': 'audio/wav',
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push(pathname);
  if (pathname === '/nested/embedding.html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
      <div style="width: 680px; max-width: 100%"><spatial-audio-widget></spatial-audio-widget></div>
      <script type="module" src="/spatial-audio-widget.js"></script></body></html>`);
    return;
  }
  if (pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  const filename = path.resolve(widgetDirectory, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!filename.startsWith(`${widgetDirectory}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream' });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end();
  }
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function until(read, description, timeout = 20000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try {
      const result = await read();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(75);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

let chrome;
let profileDirectory;
let socket;
let stderr = '';
const calls = new Map();
let nextId = 0;
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      calls.delete(id);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 30000);
    calls.set(id, {
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}
async function ready() {
  await until(() => evaluate(`(() => {
    const widget = document.querySelector('spatial-audio-widget');
    return Boolean(customElements.get('spatial-audio-widget') && widget?.shadowRoot?.querySelector('canvas'));
  })()`), 'the widget canvas');
}

// Serialized into the browser, so the fixture does not depend on repository media.
function makeWavFile() {
  const sampleRate = 44100;
  const count = sampleRate / 2;
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * 440) * 4000, true);
  }
  return new File([bytes], 'smoke.wav', { type: 'audio/wav' });
}

try {
  await stat(chromePath);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  profileDirectory = await mkdtemp(path.join(testDirectory, '.chrome-smoke-'));
  chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-default-apps',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (data) => { stderr = `${stderr}${data}`.slice(-12000); });
  chrome.on('error', (error) => { stderr += error.message; });
  const debuggerPort = await until(async () => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    const contents = await readFile(path.join(profileDirectory, 'DevToolsActivePort'), 'utf8');
    return Number(contents.split('\n')[0]);
  }, 'Chrome remote debugging');
  const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json();
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target, 'Chrome exposes a page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = calls.get(message.id);
      if (!call) return;
      calls.delete(message.id);
      if (message.error) call.reject(new Error(message.error.message));
      else call.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      errors.push(detail.exception?.description || detail.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((item) => item.value ?? item.description).join(' '));
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      errors.push(message.params.entry.text);
    }
  });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: origin });
  await ready();
  if (process.env.WIDGET_SCREENSHOT === '1') {
    await until(() => evaluate(`Boolean(document.querySelector('spatial-audio-widget').shadowRoot.querySelector('link[rel="stylesheet"]')?.sheet)`), 'widget styles');
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(testDirectory, 'preview.png'), Buffer.from(screenshot.data, 'base64'));
  }
  assert.equal(await evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelectorAll('input[type="file"]').length`), 1);
  assert.equal(await evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelectorAll('[data-axis]').length`), 3);

  await until(() => evaluate(`document.querySelector('spatial-audio-widget').state === 'ready'`), 'the default drum loop');
  const defaultAudio = await evaluate(`(() => {
    const widget = document.querySelector('spatial-audio-widget');
    return {
      filename: widget.shadowRoot.querySelector('[data-role="filename"]').textContent,
      canPlay: !widget.shadowRoot.querySelector('[data-action="play"]').disabled,
      playing: widget.playing,
      channels: widget._buffer.numberOfChannels,
      coordinateSystem: widget.coordinateSystem,
      distance: widget.getSphericalPosition().distance,
      position: widget.getPosition(),
    };
  })()`);
  assert.equal(defaultAudio.filename, 'drumloop.wav', 'The bundled sample is loaded by default');
  assert.equal(defaultAudio.canPlay, true, 'The sample is ready without an upload');
  assert.equal(defaultAudio.playing, false, 'Loading the sample does not start playback');
  assert.equal(defaultAudio.channels, 1, 'The default sample is mixed to mono for spatial rendering');
  assert.equal(defaultAudio.coordinateSystem, 'spherical', 'The widget starts in spherical mode');
  assert.ok(Math.abs(defaultAudio.distance - 2) < 1e-10, 'The source starts at 2 m');
  for (const failure of ['manifest', 'recording']) {
    const failedLoad = await evaluate(`(async () => {
      const widget = document.querySelector('spatial-audio-widget');
      const originalFetch = window.fetch;
      window.fetch = (input, options) => {
        const url = String(input);
        if (${JSON.stringify(failure)} === 'manifest' && url.endsWith('/ku100/manifest.json')) {
          return Promise.resolve(new Response('null', { status: 200 }));
        }
        if (${JSON.stringify(failure)} === 'recording' && url.endsWith('/ku100-050cm.bindec')) {
          return Promise.resolve(new Response('', { status: 503 }));
        }
        return originalFetch(input, options);
      };
      try {
        await widget.play();
        return { rejected: false };
      } catch (error) {
        return { rejected: true, state: widget.state, message: error.message,
          noProcessor: widget._worklet === null && !widget._pendingWorklet };
      } finally {
        window.fetch = originalFetch;
      }
    })()`);
    assert.equal(failedLoad.rejected, true, `${failure} loading failure rejects playback`);
    assert.equal(failedLoad.state, 'error');
    assert.equal(failedLoad.noProcessor, true, 'Incomplete distance assets do not start an audio processor');
    assert.match(failedLoad.message, failure === 'manifest' ? /manifest is invalid/ : /0.5 m could not be loaded/);
  }
  await evaluate(`document.querySelector('spatial-audio-widget').play()`);
  await until(() => evaluate(`document.querySelector('spatial-audio-widget').playing`), 'default sample playback');
  assert.deepEqual(await evaluate(`document.querySelector('spatial-audio-widget')._decoderDistances`), [.5, 1.5, 3.25], 'Only closest/farthest near-field and far-field recordings are installed');
  assert.equal(await evaluate(`document.querySelector('spatial-audio-widget')._centerFadeDistance`), .5, 'Centered stereo fade starts below the closest HRTF');
  assert.ok(Math.abs(await evaluate(`document.querySelector('spatial-audio-widget')._distanceGain.gain.value`) - Math.SQRT1_2) < 1e-5, 'The initial 2 m position has half-strength attenuation');
  for (const [distance, gain] of [[1, 1], [2, Math.SQRT1_2], [4, .5], [.5, Math.SQRT2], [.25, 2], [.01, 1 / Math.sqrt(.0875)], [0, 1 / Math.sqrt(.0875)], [7, 1 / Math.sqrt(7)]]) {
    await evaluate(`document.querySelector('spatial-audio-widget').setSphericalPosition({ distance: ${distance} })`);
    await until(() => evaluate(`Math.abs(document.querySelector('spatial-audio-widget')._worklet.parameters.get('x').value - ${distance}) < 0.001`), 'distance reaches the crossfade worklet');
    await until(() => evaluate(`Math.abs(document.querySelector('spatial-audio-widget')._distanceGain.gain.value - ${gain}) < 0.001`), 'smoothed inverse-square-root gain with unity at 1 m and a close-range cap');
    assert.ok(Math.abs(await evaluate(`document.querySelector('spatial-audio-widget')._gain.gain.value`) - .65) < 1e-5, 'Distance does not change the volume gain');
    assert.ok(Math.abs(await evaluate(`document.querySelector('spatial-audio-widget').getSphericalPosition().distance`) - distance) < 1e-10, 'Visual distance can reach zero');
  }
  await evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelector('[data-action="position"]').click()`);
  assert.deepEqual(await evaluate(`document.querySelector('spatial-audio-widget').getPosition()`), defaultAudio.position, 'Reset restores the original direction at 2 m');
  await until(() => evaluate(`Math.abs(document.querySelector('spatial-audio-widget')._distanceGain.gain.value - ${Math.SQRT1_2}) < 0.001`), 'reset restores the gain for 2 m');
  await evaluate(`document.querySelector('spatial-audio-widget').pause()`);

  await evaluate(`(async () => {
    window.sphericalChecks = await import('/tests/spherical-checks.js');
    window.sphericalWidget = document.querySelector('spatial-audio-widget');
    window.originalSphericalTestPosition = sphericalWidget.getPosition();
    sphericalChecks.runSphericalChecks(sphericalWidget);
    sphericalChecks.runCartesianBoundaryChecks(sphericalWidget);
    sphericalChecks.runDepthCueChecks(sphericalWidget);
    sphericalChecks.runLabelOcclusionChecks(sphericalWidget);
    sphericalChecks.checkHandleGrowth(sphericalWidget);
  })()`);
  for (const orbited of [false, true]) {
    for (const dimension of ['surface', 'azimuth', 'elevation', 'distance']) {
      await evaluate(`(() => {
        sphericalWidget.setCoordinateSystem('spherical');
        sphericalWidget.setSphericalPosition({ azimuth: 35, elevation: 20, distance: 2.5 });
        const view = sphericalWidget._scene;
        view.resetCamera();
        if (${orbited}) { view.camera.position.set(-6, 5, 6); view.controls.update(); }
      })()`);
      const start = await evaluate(`sphericalChecks.dragStart(sphericalWidget, '${dimension}')`);
      const units = dimension === 'distance' ? 0.5 : 12;
      const dx = dimension === 'surface' ? 42 : start.derivative.x * units;
      const dy = dimension === 'surface' ? -28 : start.derivative.y * units;
      await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
      await evaluate(`sphericalChecks.checkSphericalHighlight(sphericalWidget, '${dimension}')`);
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + dx * step / 6, y: start.y + dy * step / 6, button: 'left', buttons: 1 });
      }
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + dx, y: start.y + dy, button: 'left', buttons: 0, clickCount: 1 });
      await evaluate(`sphericalChecks.checkDrag(sphericalWidget, ${JSON.stringify(start.before)}, '${dimension}')`);
      await evaluate(`sphericalChecks.checkSphericalHighlight(sphericalWidget, null)`);
    }
  }
  await evaluate(`sphericalWidget.setCoordinateSystem('cartesian'); sphericalWidget.setPosition(originalSphericalTestPosition); sphericalWidget._scene.resetCamera()`);
  for (const axis of ['X', 'Y', 'Z']) {
    const tip = await evaluate(`sphericalChecks.cartesianHandlePoint(sphericalWidget, '${axis}')`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tip.x, y: tip.y });
    assert.equal(await evaluate(`sphericalWidget._scene.transform.axis`), axis, 'Enlarged Cartesian arrow tips remain hittable');
    assert.equal(await evaluate(`sphericalWidget._scene.renderer.domElement.style.cursor`), 'grab', 'Cartesian handles show the hand cursor');
  }
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });

  const mirror = await evaluate(`(() => {
    const widget = document.querySelector('spatial-audio-widget');
    const view = widget._scene;
    const original = widget.getPosition();
    const vector = ({ x, y, z }) => ({ x, y, z });
    const world = (object) => object.getWorldPosition(view.source.position.clone());
    const labels = view.content.children.filter((child) => child.isSprite);
    let callbackPosition;
    const record = (event) => { callbackPosition = event.detail.position; };
    widget.addEventListener('positionchange', record);
    widget.setPosition({ x: 1.25, y: 0.5, z: 1.75 });
    const report = {
      logical: widget.getPosition(),
      local: vector(view.source.position),
      world: vector(world(view.source)),
      gizmo: vector(view.transform.worldPosition),
      callback: callbackPosition,
      cameraOutsideMirror: view.camera.parent !== view.content,
      controlsOutsideMirror: view.transform.parent === view.scene,
      guidesShareMirror: [view.sourceLine, view.projectionLine, view.projection].every((object) => object.parent === view.content),
      labels: labels.map((label) => ({
        local: vector(label.position),
        world: vector(world(label)),
        sprite: label.isSprite,
        textureRepeatX: label.material.map.repeat.x,
        textureWidth: label.material.map.image.width,
      })),
    };
    const nearLabel = (label) => {
      widget.setPosition({ x: label.position.x / 2, y: 0, z: 0 });
      return { logical: widget.getPosition(), world: vector(world(view.source)), callback: callbackPosition };
    };
    report.nearLeft = nearLabel(labels[2]);
    report.nearRight = nearLabel(labels[3]);
    widget.removeEventListener('positionchange', record);
    widget.setPosition(original);
    return report;
  })()`);
  const fixedPosition = { x: 1.25, y: 0.5, z: 1.75 };
  assert.deepEqual(mirror.logical, fixedPosition, 'Visual reflection preserves the public position');
  assert.deepEqual(mirror.local, fixedPosition, 'Visual reflection preserves the source local position');
  assert.deepEqual(mirror.callback, fixedPosition, 'Position callbacks retain the original logical coordinates');
  assert.deepEqual(mirror.world, { x: -1.25, y: 0.5, z: 1.75 }, 'Only the displayed world X coordinate is mirrored');
  assert.deepEqual(mirror.gizmo, mirror.world, 'Unreflected controls align with the reflected source');
  assert.ok(mirror.cameraOutsideMirror && mirror.controlsOutsideMirror && mirror.guidesShareMirror, 'The camera and controls stay outside the reflected visual content');
  assert.equal(mirror.labels.length, 6, 'All six direction labels remain present');
  assert.ok(mirror.labels.every((label) => label.sprite && label.textureRepeatX === 1 && label.textureWidth === 512), 'Direction labels retain unflipped billboard text textures');
  assert.ok(mirror.labels[2].local.x < 0 && mirror.labels[2].world.x > 0, 'The original left-label anchor is visually mirrored');
  assert.ok(mirror.labels[3].local.x > 0 && mirror.labels[3].world.x < 0, 'The original right-label anchor is visually mirrored');
  assert.ok(mirror.nearLeft.logical.x < 0 && mirror.nearLeft.world.x > 0, 'The original negative-X source remains associated with the mirrored left label');
  assert.ok(mirror.nearRight.logical.x > 0 && mirror.nearRight.world.x < 0, 'The original positive-X source remains associated with the mirrored right label');
  assert.deepEqual(mirror.nearLeft.callback, mirror.nearLeft.logical, 'Left-label movement retains the original callback sign');
  assert.deepEqual(mirror.nearRight.callback, mirror.nearRight.logical, 'Right-label movement retains the original callback sign');

  for (const orbited of [false, true]) {
    const dragStart = await evaluate(`(() => {
      const widget = document.querySelector('spatial-audio-widget');
      const canvas = widget.shadowRoot.querySelector('canvas');
      canvas.scrollIntoView({ block: 'center' });
      const view = widget._scene;
      widget.setPosition({ x: 1.5, y: 0.6, z: 1.6 });
      if (${orbited}) {
        view.camera.position.set(-6.2, 4.6, 7.4);
        view.controls.update();
      } else view.resetCamera();
      window.lastDragPosition = null;
      widget.addEventListener('positionchange', (event) => { window.lastDragPosition = event.detail.position; }, { once: true });
      const projected = view.source.getWorldPosition(view.source.position.clone()).project(view.camera);
      const bounds = canvas.getBoundingClientRect();
      return {
        x: bounds.left + (projected.x + 1) * bounds.width / 2,
        y: bounds.top + (1 - projected.y) * bounds.height / 2,
        position: widget.getPosition(),
      };
    })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragStart.x, y: dragStart.y });
    assert.ok(await evaluate(`document.querySelector('spatial-audio-widget')._scene.transform.axis`), 'Reflected sphere center exposes a drag handle');
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragStart.x, y: dragStart.y, button: 'left', buttons: 1, clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragStart.x + 45, y: dragStart.y - 25, button: 'left', buttons: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragStart.x + 45, y: dragStart.y - 25, button: 'left', buttons: 0, clickCount: 1 });
    const dragged = await evaluate(`(() => {
      const widget = document.querySelector('spatial-audio-widget');
      const view = widget._scene;
      const world = view.source.getWorldPosition(view.source.position.clone());
      const projected = world.clone().project(view.camera);
      const bounds = view.renderer.domElement.getBoundingClientRect();
      return {
        logical: widget.getPosition(),
        local: { x: view.source.position.x, y: view.source.position.y, z: view.source.position.z },
        world: { x: world.x, y: world.y, z: world.z },
        callback: lastDragPosition,
        x: bounds.left + (projected.x + 1) * bounds.width / 2,
        y: bounds.top + (1 - projected.y) * bounds.height / 2,
      };
    })()`);
    assert.ok(['x', 'y', 'z'].some((axis) => Math.abs(dragged.logical[axis] - dragStart.position[axis]) > 0.01), `Mouse dragging changes the sphere position in the ${orbited ? 'orbited' : 'default'} view`);
    assert.deepEqual(dragged.logical, dragged.local, 'Dragging emits the unmodified local position');
    assert.deepEqual(dragged.callback, dragged.logical, 'Dragging callbacks retain the original logical coordinates');
    assert.ok(Math.abs(dragged.world.x + dragged.logical.x) < 1e-8, 'Dragging keeps displayed X opposite logical X');
    assert.ok((dragged.x - dragStart.x) * 45 + (dragged.y - dragStart.y) * -25 > 0, 'The displayed sphere follows the pointer direction');
  }
  await evaluate(`document.querySelector('spatial-audio-widget')._scene.resetCamera()`);

  const states = await evaluate(`(() => {
    const first = document.querySelector('spatial-audio-widget');
    const second = document.createElement('spatial-audio-widget');
    second.style.display = 'block';
    second.style.width = '420px';
    document.body.append(second);
    window.smokeWidgets = { first, second };
    const original = second.getPosition();
    first.setPosition({ x: 0, y: 0, z: 0 });
    return { first: first.getPosition(), second: second.getPosition(), original };
  })()`);
  assert.deepEqual(states.first, { x: 0, y: 0, z: 0 }, 'Zero coordinates apply');
  assert.deepEqual(states.second, states.original, 'Widget instances keep independent positions');
  await until(() => evaluate(`smokeWidgets.second.shadowRoot.querySelector('canvas')?.width > 0`), 'second independent scene');
  assert.ok(await evaluate(`window.innerWidth > 760`), 'Narrow embedding is tested in a desktop viewport');
  await evaluate(`smokeWidgets.second.style.width = '500px'`);
  await until(() => evaluate(`getComputedStyle(smokeWidgets.second.shadowRoot.querySelector('.widget')).gridTemplateColumns.trim().split(/\\s+/).length === 1`), 'stacked controls inside a narrow desktop container');

  await evaluate(`(() => {
    const widget = smokeWidgets.first;
    const slider = widget.shadowRoot.querySelector('[data-axis="x"]');
    slider.value = '-2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  assert.equal(await evaluate(`smokeWidgets.first.getPosition().x`), 2, 'Negative Ambisonic Y moves right in scene coordinates');
  assert.notEqual(await evaluate(`smokeWidgets.second.getPosition().x`), 2);
  await evaluate(`smokeWidgets.first.shadowRoot.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }))`);
  assert.equal(await evaluate(`smokeWidgets.first.getPosition().y`), 0.05, 'Canvas keyboard controls update the widget state');
  await evaluate(`(() => {
    window.oldSecondCanvas = smokeWidgets.second.shadowRoot.querySelector('canvas');
    smokeWidgets.second.remove();
    document.body.append(smokeWidgets.second);
  })()`);
  await until(() => evaluate(`(() => {
    const canvas = smokeWidgets.second.shadowRoot.querySelector('canvas');
    return canvas && canvas !== oldSecondCanvas && canvas.width > 0;
  })()`), 'reconnected widget scene');
  assert.deepEqual(await evaluate(`smokeWidgets.second.getPosition()`), states.original, 'Reconnection preserves source position');

  const invalid = await evaluate(`(async () => {
    try {
      await smokeWidgets.first.loadFile(new File(['not a WAV'], 'invalid.wav', { type: 'audio/wav' }));
      return { rejected: false };
    } catch {
      return {
        rejected: true,
        state: smokeWidgets.first.state,
        status: smokeWidgets.first.shadowRoot.querySelector('[data-role="status"]').textContent,
      };
    }
  })()`);
  assert.equal(invalid.rejected, true, 'Invalid WAV files reject');
  assert.equal(invalid.state, 'error');
  assert.match(invalid.status, /valid WAV/i, 'Invalid WAV files explain the problem');

  const loaded = await evaluate(`(async () => {
    window.smokeFile = (${makeWavFile.toString()})();
    await smokeWidgets.first.loadFile(smokeFile);
    return {
      filename: smokeWidgets.first.shadowRoot.querySelector('[data-role="filename"]').textContent,
      status: smokeWidgets.first.shadowRoot.querySelector('[data-role="status"]').textContent,
    };
  })()`);
  assert.match(loaded.filename, /smoke\.wav/, 'Decoded WAV is shown');
  await evaluate(`smokeWidgets.first.play()`);
  await until(() => evaluate(`smokeWidgets.first.audioContext?.state === 'running' && smokeWidgets.first.playing`), 'binaural audio playback');
  assert.equal(await evaluate(`smokeWidgets.first._source.loop`), true, 'Audio source loops');
  await evaluate(`(() => {
    window.positionBeforeVisualCheck = smokeWidgets.first.getPosition();
    smokeWidgets.first.setPosition({ x: 1.25, y: 0.5, z: 1.75 });
  })()`);
  await until(() => evaluate(`(() => {
    const parameters = smokeWidgets.first._worklet.parameters;
    return Math.abs(parameters.get('x').value - 1.75) < 0.005
      && Math.abs(parameters.get('y').value + 1.25) < 0.005
      && Math.abs(parameters.get('z').value - 0.5) < 0.005;
  })()`), 'the original audio parameters with reflected visuals');
  await evaluate(`smokeWidgets.first.setPosition(positionBeforeVisualCheck)`);
  await evaluate(`(() => {
    const slider = smokeWidgets.first.shadowRoot.querySelector('[data-role="volume"]');
    slider.value = '25';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await until(() => evaluate(`Math.abs(smokeWidgets.first._gain.gain.value - 0.25) < 0.005`), 'volume gain update');
  const failedProcessor = await evaluate(`(() => {
    const widget = smokeWidgets.first;
    window.failedWorklet = widget._worklet;
    widget._worklet.onprocessorerror(new Event('processorerror'));
    return { state: widget.state, playing: widget.playing, worklet: widget._worklet };
  })()`);
  assert.equal(failedProcessor.state, 'error', 'Processor failures are reported');
  assert.equal(failedProcessor.playing, false, 'Processor failures stop playback');
  assert.equal(failedProcessor.worklet, null, 'Failed processor is released');
  await evaluate(`smokeWidgets.first.play()`);
  await until(() => evaluate(`smokeWidgets.first.playing && smokeWidgets.first.audioContext.state === 'running' && smokeWidgets.first._worklet !== failedWorklet`), 'playback retry with a new processor');
  await evaluate(`smokeWidgets.first.pause()`);
  await until(() => evaluate(`!smokeWidgets.first.playing`), 'paused playback');
  await until(() => evaluate(`smokeWidgets.first.audioContext?.state === 'suspended'`), 'suspended audio context');
  await evaluate(`smokeWidgets.first.play()`);
  await until(() => evaluate(`smokeWidgets.first.playing`), 'resumed playback');
  await evaluate(`smokeWidgets.first.setPosition({ x: 2, y: 1, z: -2 })`);
  assert.deepEqual(await evaluate(`smokeWidgets.first.getPosition()`), { x: 2, y: 1, z: -2 });
  await evaluate(`smokeWidgets.first.pause()`);

  const cancelled = await evaluate(`(async () => {
    await smokeWidgets.second.loadFile(smokeFile);
    const context = smokeWidgets.second.audioContext;
    const pending = smokeWidgets.second.play().then(() => true, () => false);
    smokeWidgets.second.destroy();
    await pending;
    return { playing: smokeWidgets.second.playing, state: context.state };
  })()`);
  assert.equal(cancelled.playing, false, 'Destroy cancels pending playback');
  assert.equal(cancelled.state, 'closed', 'Destroy closes the audio context');

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await until(() => evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelector('canvas').clientWidth <= 390`), 'responsive canvas width');
  await evaluate(`(() => { smokeWidgets.second.destroy(); smokeWidgets.second.remove(); smokeWidgets.first.destroy(); })()`);

  await command('Page.navigate', { url: `${origin}/nested/embedding.html` });
  await ready();
  await until(() => evaluate(`document.querySelector('spatial-audio-widget').state === 'ready'`), 'the default sample on a nested host');
  assert.equal(await evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelector('[data-role="filename"]').textContent`), 'drumloop.wav');
  assert.equal(await evaluate(`document.querySelector('spatial-audio-widget').shadowRoot.querySelector('canvas').width > 0`), true);
  await evaluate(`(async () => {
    const widget = document.querySelector('spatial-audio-widget');
    await widget.loadFile((${makeWavFile.toString()})());
    await widget.play();
  })()`);
  await until(() => evaluate(`document.querySelector('spatial-audio-widget').playing`), 'playback embedded on a nested page');
  await evaluate(`document.querySelector('spatial-audio-widget').destroy()`);
  assert.ok(requests.includes('/spatial-audio-widget.js'), 'Nested host imports the widget module');
  assert.ok(requests.includes('/drumloop.wav'), 'The default sample resolves relative to the widget module');
  assert.ok(requests.includes('/decoders/ku100/manifest.json'), 'The distance manifest resolves relative to the widget module');
  for (const name of ['050', '150', '325']) {
    assert.ok(requests.includes(`/decoders/ku100/ku100-${name}cm.bindec`), `KU100 ${name} cm resolves relative to the widget module`);
  }
  for (const name of ['075', '100']) {
    assert.equal(requests.includes(`/decoders/ku100/ku100-${name}cm.bindec`), false, `Intermediate KU100 ${name} cm is not fetched`);
  }
  assert.equal(requests.includes('/decoders/aachen-mrt40.bindec'), false, 'Playback uses the KU100 recordings');
  assert.ok(requests.some((name) => name.includes('binaural') && name.endsWith('.js')), 'Spatial worklet was fetched');
  assert.deepEqual(errors, [], 'Browser console has no errors');
  console.log('PASS: KU100 manifest/recording loading and failure retry, logarithmic arrow growth in both modes, smoothed distance rolloff with close-range cap, independent volume, demo mount, mouse dragging, independent instances, zero coordinates, sliders and keyboard, reconnect, invalid WAV handling, WAV decoding, looping playback/pause/resume, processor-failure retry, pending-play cleanup, resizing, nested-page embedding, and no browser errors.');
} catch (error) {
  console.error(error.stack || error);
  if (errors.length) console.error('Browser errors:', errors);
  if (stderr) console.error('Chrome output:', stderr);
  process.exitCode = 1;
} finally {
  socket?.close();
  for (const call of calls.values()) call.reject(new Error('Browser test ended'));
  if (chrome && chrome.exitCode === null) {
    const exited = once(chrome, 'exit');
    chrome.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (profileDirectory) await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
