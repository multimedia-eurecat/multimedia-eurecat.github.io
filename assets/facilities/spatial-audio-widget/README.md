# Standalone spatial audio widget

A contained extraction of the Möbius sphere controls and CatArt binaural renderer. Everything needed at runtime is inside this folder. No build, package installation, CDN, Python application, or connection to the original project is required.

## Try it

From the repository root:

```sh
python3 -m http.server 8000 --directory assets/facilities/spatial-audio-widget
```

Open **http://localhost:8000/**, put on headphones, then press **Play Loop**. The bundled `drumloop.wav` loads automatically; use the file picker or drop a WAV to replace it. Audio starts only when you press Play. The widget starts in spherical mode: drag a curved handle to change an angle, the straight arrow to change distance, or the orange sphere to change both angles at a fixed distance. Drag the background to orbit the view and scroll to zoom.

Use **Spherical / Cartesian** at the top left to switch coordinate systems without moving the source or interrupting playback. Spherical mode (the default) has azimuth (horizontal), elevation (vertical) and distance sliders, curved angular handles on the listener-centred sphere, and a straight radial distance arrow. Dragging the source ball in spherical mode changes azimuth horizontally and elevation vertically while keeping its radius fixed. Faint circles show the angular paths. Camera-relative depth shading keeps the near side saturated and fades the far side into the scene background; solid objects naturally hide handles behind them. These cues follow the camera when orbiting or zooming. Cartesian sliders follow first-order ACN associations: Y (ACN 1) for left/right, Z (ACN 2) for up/down, and X (ACN 3) for front/back, with positive values left, up and front respectively. Straight axis handles follow the same physical directions. The reference grid and FRONT/BACK/LEFT/RIGHT labels sit at head height (displayed Z = 0, also zero spherical elevation); TOP/BOTTOM mark the vertical direction. The projection circle, its vertical dashed line, and the X/Y projection guides appear only in Cartesian mode.

Both modes use the same muted red, green and blue palette and base shaft/arrowhead dimensions. Cartesian handles and their hit areas keep fixed world-space dimensions regardless of distance to the listener, so they zoom with the scene and retain the same proportions as the source ball; their interaction targets extend to the tips. Both handle designs connect their arrow shafts to the source ball and respect solid-object occlusion. The plane handles are removed; dragging the ball still moves it in the viewing plane. Hovering an arrow highlights its dimension in yellow, and the highlight stays on while dragging. Hovering the source sphere in spherical mode highlights both azimuth and elevation. Cartesian arrows and the source sphere show a hand cursor on hover and a grabbing cursor during dragging. Both modes share the same listener-centred reference for camera-relative colour and opacity fading: nearer arrow sections stay saturated while farther sections soften into the background, including during yellow highlighting.

When the 3D view is focused, arrow keys move azimuth/elevation in spherical mode or left/right and front/back in Cartesian mode. Shift + Up/Down changes spherical distance or Cartesian height. Alt gives smaller steps. **Reset** restores the source position; **Reset view** restores only the camera. Azimuth is 0° in front and +90° to the listener's right; elevation is +90° overhead. Distance is bounded to 0–7 m in both modes. Cartesian movement stops at that spherical boundary along the requested path; dragging or changing one axis leaves the other two coordinates unchanged. Cartesian slider ranges expand when needed to represent the same position. At the origin and poles, the last azimuth is retained so dragging outward or away from a pole remains predictable.

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

The API retains the scene coordinate frame below. Cartesian slider values use the Ambisonic display frame: `X = scene.z`, `Y = -scene.x`, `Z = scene.y`.

```js
await customElements.whenDefined('spatial-audio-widget');
const widget = document.querySelector('spatial-audio-widget');

// Coordinates are metres relative to the fixed listener at the origin.
// +X = right, +Y = up, +Z = in front. Maximum distance from the listener: 7 m.
widget.setPosition({ x: 1, y: 0, z: 2 });
console.log(widget.getPosition()); // Returns a copy.

widget.setCoordinateSystem('spherical'); // Or 'cartesian'.
widget.setSphericalPosition({ azimuth: 45, elevation: 20, distance: 2.5 });
console.log(widget.getSphericalPosition()); // Degrees, degrees, metres.
console.log(widget.coordinateSystem); // Read-only getter.

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

`loadFile()` and `play()` return promises and report errors in the widget as well as through the `audioerror` event. Public getters `playing`, `state`, and `audioContext` are read-only. Position events include both `detail.position` (Cartesian) and `detail.spherical`; coordinate-mode changes emit `coordinatemodechange`. `destroy()` explicitly releases resources and empties the element; removing and reinserting the element rebuilds the widget and reloads the default drum loop. Source position, coordinate mode and volume are retained. Uploads replace the default sample, including while it is still loading; uploaded files stay in the visitor's browser.

## Audio path

WAV selection → browser decoding and mono mixdown → looping buffer source → one-source CatArt audio worklet → distance gain → volume → peak protection → stereo headphones.

The source starts and resets at **azimuth 0°, elevation 0°, distance 2 m**. This is also the reference distance: distance gain is `2 / max(distance, 0.0875)`. Halving distance raises the level by about 6 dB, and doubling it lowers the level by about 6 dB. Gain stops increasing at a nominal **8.75 cm head radius** (17.5 cm diameter); visual coordinates and the spherical distance control still reach zero. This radius is a modelling approximation, not a measured head size ([spherical-head model reference](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/Anthropometric-parameterisation-Gamper.pdf)).

The native HRTF renderer uses direction on a fixed 2 m sphere, with its own distance attenuation disabled, so it cannot compound the gain curve. At the origin it retains the last valid direction. Distance gain changes smoothly over 15 ms and remains separate from the Volume control. A stereo-linked compressor controls boosted close-range peaks, followed by a peak guard that is linear below 0.9 and catches transient overshoots. The fixed Aachen HRTFs still provide the directional cues; this level model does not synthesize new near-field HRTFs.

The copied `vendor/catart.wasm.js` contains the compiled DSP and its original embedded assets. The widget loads `decoders/aachen-mrt40.bindec` and installs it in the runtime's virtual filesystem before native initialization. It uses the supplied **AACHEN MRT40 fifth-order decoder**, with 36 ACN channels per ear. The package also preserves the supplied first- through fourth-order banks. Each source impulse is 279 samples at 48 kHz. **SN3D normalisation is assumed**, as requested; the supplied `metadata.sfeardecoder` file was empty. Native encoder scaling was checked against synthetic ACN/SN3D impulses through fifth order. Audio remains local to the browser.

The context requests 44.1 kHz and the engine uses the context's actual rate. The worklet processes 128-frame blocks, updates every coordinate including zero, feeds zeros during missing input, and refreshes its typed-array views if the WASM heap grows. Playback pauses without resetting the loop offset, and pausing suspends the audio context to avoid continuing DSP work.

The public worklet coordinates are +X front, +Y left, +Z up, bounded to the same 7 m range as the visual control. The visual adapter exchanges axes accordingly. Tests against the real decoder found that its native positive Y renders on the right; the worklet normalizes that sign so visual movement to the right favors the right ear. Position and volume changes use short AudioParam ramps.

To rebuild the decoder from the supplied WAV folder (Python standard library only):

```sh
python3 assets/facilities/spatial-audio-widget/tools/pack-decoder.py \
  ~/Downloads/ambisonic_filters_AACHEN_MRT40 \
  assets/facilities/spatial-audio-widget/decoders/aachen-mrt40.bindec \
  --normalization SN3D
```

The companion JSON records the source-file checksums, channel counts, sample rate and assumed normalisation. WAV names `Left_01.wav` / `Right_01.wav` correspond to ACN channel 0. The packer checks every channel and preserves the original impulse samples and relative ear gains. The original runtime bundle is unchanged; worklet clients without custom decoder data retain its original filters.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Minimal standalone test host. |
| `spatial-audio-widget.js` | Custom element, UI, WAV decoding, playback, public API. |
| `spatial-audio-widget.css` | Widget styles, loaded inside its shadow root. |
| `drumloop.wav` | Default sample, loaded automatically and replaceable with a visitor's WAV. |
| `scene-view.js` | Independent Three.js scene and controls. |
| `coordinates.js` | Shared Cartesian/spherical conversions, conventions and limits. |
| `distance-model.js` | Shared 2 m default/reference distance, nominal head radius, gain curve and output peak protection. |
| `spherical-controls.js` | Surface-aligned angular handles, radial handle and constrained pointer dragging. |
| `handle-appearance.js` | Shared handle colours and Cartesian gizmo geometry styling. |
| `binaural-worklet.js` | New single-source adapter for the copied CatArt engine. |
| `decoders/aachen-mrt40.bindec` | Supplied Aachen filters, packaged for the native decoder. |
| `decoders/aachen-mrt40.json` | Decoder metadata, assumptions and source checksums. |
| `tools/pack-decoder.py` | Rebuilds the decoder package from ACN-ordered WAV files. |
| `vendor/` | Unmodified copies of the necessary original libraries/runtime. |
| `tests/` | Dependency-free DSP and browser smoke checks. |

The runtime bundle is approximately 8.3 MB before compression, plus a 469 kB Aachen decoder package loaded on first playback. The head model, DAW, timeline worklet, offline export, and alignment server are not included.

## Verification

The DSP integration harness uses the actual copied WASM engine with a simulated worklet environment:

```sh
node --experimental-vm-modules assets/facilities/spatial-audio-widget/tests/binaural-worklet.test.mjs
```

It verifies the original and Aachen banks: directional left/right energy and arrival times, front/back and elevation differences, finite output at the origin and bounds, silence with missing input, heap growth, block-size validation, and disposal at 44.1 and 48 kHz.

The browser smoke runner starts its own local static server and launches an installed Chrome via the DevTools Protocol:

```sh
node assets/facilities/spatial-audio-widget/tests/browser-smoke.mjs
```

It needs a recent Node with built-in `WebSocket` (tested with Node 24). It uses the standard macOS Chrome location; set `CHROME_PATH` for other installations. It installs no packages. Its temporary browser profile is created inside `tests/` and removed afterward.

Automated checks verify processing and interaction. A subjective headphone listening check is still useful for assessing the fixed decoder's spatial impression.
