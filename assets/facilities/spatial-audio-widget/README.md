# Standalone spatial audio widget

A contained extraction of the Möbius sphere controls and CatArt binaural renderer. Everything needed at runtime is inside this folder. No build, package installation, CDN, Python application, or connection to the original project is required.

## Try it

From the repository root:

```sh
python3 -m http.server 8000 --directory spatial-audio-widget
```

Open **http://localhost:8000/**, choose a WAV, then press **Play loop**. Put on headphones and drag the orange sphere's axis handles. The square handles move in a plane; the small center handle moves in the camera plane. Drag the background to orbit the view and scroll to zoom.

Use the sliders for precise positions. When the 3D view is focused, arrow keys move the source along X/Z; Shift + Up/Down changes height. Alt gives smaller steps. **Reset** restores the source position; **Reset view** restores only the camera.

Audio processing requires **localhost or HTTPS**. Opening `index.html` directly as a `file://` URL will not work. The browser must support JavaScript modules, Web Audio/AudioWorklet, and WebGL for the 3D view. The sliders and audio remain usable if WebGL is unavailable. Chrome is covered by the included browser smoke test; other browsers have not been verified here.

## Embed in another page

Copy this entire folder into the page's static assets. Import its module and add the element:

```html
<script type="module" src="/spatial-audio-widget/spatial-audio-widget.js"></script>

<div style="max-width: 1000px; margin: auto;">
  <spatial-audio-widget></spatial-audio-widget>
</div>
```

Adjust the script URL to wherever you copied the folder. The widget resolves its own CSS, libraries, and worklet relative to that module URL, even when the embedding page is in another directory. Its UI styles are contained in a shadow root. It adapts to its container's width, and multiple elements have independent scenes and audio state. Keep the assets on the same origin as the host page, or configure the host's CORS/CSP rules to permit them.

The test page is only a host for the element; none of its styling or JavaScript is needed for embedding.

### JavaScript API

```js
await customElements.whenDefined('spatial-audio-widget');
const widget = document.querySelector('spatial-audio-widget');

// Coordinates are metres relative to the fixed listener at the origin.
// +X = right, +Y = up, +Z = in front. Each axis is limited to [-4, 4].
widget.setPosition({ x: 1, y: 0, z: 2 });
console.log(widget.getPosition()); // Returns a copy.

await widget.loadFile(file); // Browser File, containing a WAV.
await widget.play();         // Invoke from a user gesture to allow audio.
widget.pause();              // Retains the current loop offset.

widget.addEventListener('positionchange', (event) => {
  console.log(event.detail.position);
});
widget.addEventListener('audioload', (event) => {
  console.log(event.detail.name, event.detail.duration);
});
widget.addEventListener('audioerror', (event) => {
  console.log(event.detail.message);
});

console.log(widget.playing, widget.state, widget.audioContext);
widget.remove(); // Automatically releases its audio and WebGL resources.
```

`loadFile()` and `play()` return promises and report errors in the widget as well as through the `audioerror` event. Public getters `playing`, `state`, and `audioContext` are read-only. `destroy()` explicitly releases resources and empties the element; removing and reinserting the element rebuilds an empty widget. Source position and volume are retained, while the WAV must be selected again.

## Audio path

WAV selection → browser decoding and mono mixdown → looping buffer source → one-source CatArt audio worklet → volume → stereo headphones.

The copied `vendor/catart.wasm.js` contains the compiled DSP and fixed `default.bindec` and `default.distpat` assets. There are no additional decoder downloads. The binaural decoder contains fifth-order, HRIR-derived left/right filter banks. This widget uses that existing decoder; it does not import a raw SOFA file. Audio remains local to the browser.

The context requests 44.1 kHz and the engine uses the context's actual rate. The worklet processes 128-frame blocks, updates every coordinate including zero, feeds zeros during missing input, and refreshes its typed-array views if the WASM heap grows. Playback pauses without resetting the loop offset, and pausing suspends the audio context to avoid continuing DSP work.

The public worklet coordinates are +X front, +Y left, +Z up. The visual adapter exchanges axes accordingly. Tests against the real decoder found that its native positive Y renders on the right; the new worklet normalizes that sign so visual movement to the right favors the right ear. Position and volume changes use short AudioParam ramps.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Minimal standalone test host. |
| `spatial-audio-widget.js` | Custom element, UI, WAV decoding, playback, public API. |
| `spatial-audio-widget.css` | Widget styles, loaded inside its shadow root. |
| `scene-view.js` | Independent Three.js scene and controls. |
| `binaural-worklet.js` | New single-source adapter for the copied CatArt engine. |
| `vendor/` | Unmodified copies of the necessary original libraries/runtime. |
| `tests/` | Dependency-free DSP and browser smoke checks. |

The runtime bundle is approximately 8.3 MB before compression; this is the original embedded WASM/decoder bundle. The head model, DAW, timeline worklet, offline export, and alignment server are not included.

## Verification

The DSP integration harness uses the actual copied WASM engine with a simulated worklet environment:

```sh
node --experimental-vm-modules spatial-audio-widget/tests/binaural-worklet.test.mjs
```

It verifies directional left/right energy and arrival times, front/back and elevation differences, finite output at the origin and bounds, silence with missing input, heap growth, block-size validation, and disposal at 44.1 and 48 kHz.

The browser smoke runner starts its own local static server and launches an installed Chrome via the DevTools Protocol:

```sh
node spatial-audio-widget/tests/browser-smoke.mjs
```

It needs a recent Node with built-in `WebSocket` (tested with Node 24). It uses the standard macOS Chrome location; set `CHROME_PATH` for other installations. It installs no packages. Its temporary browser profile is created inside `tests/` and removed afterward.

Automated checks verify processing and interaction. A subjective headphone listening check is still useful for assessing the fixed decoder's spatial impression.
