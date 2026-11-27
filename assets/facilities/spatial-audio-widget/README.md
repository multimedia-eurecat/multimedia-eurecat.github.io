# Standalone spatial audio widget

A contained extraction of the Möbius sphere controls and CatArt binaural renderer. Everything needed at runtime is inside this folder. No build, package installation, CDN, Python application, or connection to the original project is required.

## Try it

From the repository root:

```sh
python3 -m http.server 8000 --directory assets/facilities/spatial-audio-widget
```

Open **http://localhost:8000/**, put on headphones, then press **Play Loop**. The bundled `drumloop.wav` loads automatically; use the file picker or drop a WAV to replace it. Audio starts only when you press Play. The widget starts in spherical mode: drag a curved handle to change an angle, the straight arrow to change distance, or the orange sphere to change both angles at a fixed distance. Drag the background to orbit the view and scroll to zoom.

Use **Spherical / Cartesian** at the top left to switch coordinate systems without moving the source or interrupting playback. Spherical mode (the default) has azimuth (horizontal), elevation (vertical) and distance sliders, curved angular handles on the listener-centred sphere, and a straight radial distance arrow. Dragging the source ball in spherical mode changes azimuth horizontally and elevation vertically while keeping its radius fixed. Faint circles show the angular paths. Camera-relative depth shading keeps the near side saturated and fades the far side into the scene background; solid objects naturally hide handles behind them. These cues follow the camera when orbiting or zooming. Cartesian sliders follow first-order ACN associations: Y (ACN 1) for left/right, Z (ACN 2) for up/down, and X (ACN 3) for front/back, with positive values left, up and front respectively. Straight axis handles follow the same physical directions. The reference grid and FRONT/BACK/LEFT/RIGHT labels sit at head height (displayed Z = 0, also zero spherical elevation); TOP/BOTTOM mark the vertical direction. The projection circle, its vertical dashed line, and the X/Y projection guides appear only in Cartesian mode.

Both modes use the same muted red, green and blue palette and base shaft/arrowhead dimensions. Arrow lengths, widths, and heads in both modes grow continuously with listener distance along a normalized `log(1 + distance)` curve. At zero distance the arrows fit inside the source sphere; growth slows as distance increases and reaches each mode's previous maximum size only at 7 m. There are no fixed-size stretches within that range. Their world dimensions remain independent of camera zoom, and their hit areas follow the arrows through to the tips. Cartesian arrow pickers stay inactive while the arrows are inside the source sphere; the sphere retains its central drag target. Both handle designs connect their arrow shafts to the source ball and respect solid-object occlusion. The plane handles are removed; dragging the ball still moves it in the viewing plane. Hovering an arrow highlights its dimension in yellow, and the highlight stays on while dragging. Hovering the source sphere in spherical mode highlights both azimuth and elevation. Cartesian arrows and the source sphere show a hand cursor on hover and a grabbing cursor during dragging. Both modes share the same listener-centred reference for camera-relative colour and opacity fading: nearer arrow sections stay saturated while farther sections soften into the background, including during yellow highlighting.

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

WAV selection → browser decoding and mono mixdown → looping buffer source → KU100 distance-crossfade audio worklet → distance gain → volume → peak protection → stereo headphones.

The source starts and resets at **azimuth 0°, elevation 0°, distance 2 m**. For the current listening test, playback uses the closest and farthest near-field KU100 recordings (**0.50 m and 1.50 m**), plus the **3.25 m far-field** recording. Neighboring outputs blend linearly by radius; at 2 m, the weights are approximately 71.4% for 1.50 m and 28.6% for 3.25 m. The controls still span **0–7 m**. Below 0.50 m, the nearest HRTF fades progressively into unfiltered mono sent identically to both ears; the output is fully centered at zero distance. Beyond 3.25 m the far-field recording is held. The 0.75 m and 1.00 m recordings remain available in the asset manifest but are not fetched or processed. `PLAYBACK_DISTANCES` in `distance-model.js` selects the active recordings.

The original SOFA decoder levels are used as supplied, with the distance gain applied separately after the crossfade. **Distance gain is `1 / sqrt(max(distance, 0.0875))`**: unity at 1 m, approximately +3 dB at 0.5 m, −3 dB at 2 m, and −6 dB at 4 m. The exponent is 0.5, halving the change in decibels per doubling of distance compared with a `1 / distance` curve. The initial/reset position stays at 2 m, independently of the 1 m gain reference. The nominal 8.75 cm head radius caps close-range gain while the controls can still reach zero. Gain changes smoothly over 15 ms and the Volume control remains independent. This gain curve continues to follow distance across the full control range, including the centered fade below 0.50 m. This is a softened distance-gain model for listening tests; the publisher's level-restoration factors are not applied.

All three selected native decoder scenes run continuously inside one WASM instance, receiving the same mono input. This keeps their convolution histories ready during distance changes. Blend weights sum to one and change smoothly over 15 ms, in addition to the existing position ramps. Native distance attenuation is disabled and every scene uses direction on a fixed 2 m sphere. At the origin the last direction is retained internally for returning to spatial rendering, while the audible output is identical in both ears. The Volume control remains independent of distance. A stereo-linked compressor and the existing transient peak guard protect the output.

Inside the closest measured radius, target HRTF weight is `distance / 0.50` and centered-mono weight is `1 - distance / 0.50`: 100% HRTF at 0.50 m, 50/50 at 0.25 m, and 100% centered at zero. Both paths use the same 15 ms weight smoothing; the centered path remains fed even while inaudible. A common **0.5 ms delay** on the centered path approximates the closest decoder's frontal latency without adding an interaural delay. The centered signal is the original mono input reduced by **21 dB** (amplitude multiplier approximately **0.0891**) in each channel before the existing distance gain, Volume control, and peak protection. This attenuation applies only to the centered path, including its contribution during the crossfade. The transition adds no decoder scene. Fixed-decoder worklet mode used by comparison tests retains its original behavior.

The widget loads `decoders/ku100/manifest.json` and only the selected three `.bindec` files on first playback, before creating the audio processor. Each decoder contains orders 1–5; fifth order has **36 ACN/SN3D channels per ear**, **1024 taps**, at **48 kHz**. The copied `vendor/catart.wasm.js` remains unchanged. The Aachen package is retained for comparison and regression tests; the widget's playback uses KU100. Audio remains local to the browser.

The context requests 44.1 kHz and the engine uses the context's actual rate. The worklet processes 128-frame blocks, updates every coordinate including zero, feeds zeros during missing input, and refreshes its typed-array views if the WASM heap grows. Playback pauses without resetting the loop offset, and pausing suspends the audio context to avoid continuing DSP work.

The public worklet coordinates are +X front, +Y left, +Z up, bounded to the same 7 m range as the visual control. The visual adapter exchanges axes accordingly. Tests against the real decoder found that its native positive Y renders on the right; the worklet normalizes that sign so visual movement to the right favors the right ear. Position and volume changes use short AudioParam ramps.

To rebuild the retained Aachen comparison package from the supplied WAV folder (Python standard library only):

```sh
python3 assets/facilities/spatial-audio-widget/tools/pack-decoder.py \
  ~/Downloads/ambisonic_filters_AACHEN_MRT40 \
  assets/facilities/spatial-audio-widget/decoders/aachen-mrt40.bindec \
  --normalization SN3D
```

The companion JSON records the source-file checksums, channel counts, sample rate and assumed normalisation. WAV names `Left_01.wav` / `Right_01.wav` correspond to ACN channel 0. The packer checks every channel and preserves the original impulse samples and relative ear gains. The original runtime bundle is unchanged; worklet clients without custom decoder data retain its original filters.

### Convert SOFA files offline

`tools/sofa_to_foa.py` converts one source-distance shell into per-ear **decoder kernels for ACN/SN3D input**. It uses [spaudiopy](https://spaudiopy.readthedocs.io/en/latest/)'s `decoder.magls_bin` for MagLS, or `sph.sht_lstsq` for weighted LS. First order (FOA: W, Y, Z, X) is the default. `--max-order N` fits all banks from 1 through N independently.

Install the pinned conversion dependencies once with Python **3.10–3.12** (tested with 3.10). These are development tools; the browser needs no Python dependencies:

```sh
python3.12 -m venv .venv-sofa
.venv-sofa/bin/python -m pip install -r assets/facilities/spatial-audio-widget/tools/requirements-sofa.txt
```

Conversion then runs without network access or downloaded HRIR/grid assets:

```sh
.venv-sofa/bin/python assets/facilities/spatial-audio-widget/tools/sofa_to_foa.py \
  --input subject.sofa --list-distances

# Eight mono float32 WAVs for first-order rendering at 0.5 m.
.venv-sofa/bin/python assets/facilities/spatial-audio-widget/tools/sofa_to_foa.py \
  --input subject.sofa --distance 0.50 --method magls --out /tmp/subject-foa

# Independently fit orders 1–5, then package the WAV banks.
.venv-sofa/bin/python assets/facilities/spatial-audio-widget/tools/sofa_to_foa.py \
  --input subject.sofa --distance 0.50 --max-order 5 --out /tmp/subject-hoa
.venv-sofa/bin/python assets/facilities/spatial-audio-widget/tools/pack-decoder.py \
  /tmp/subject-hoa /tmp/subject.bindec --normalization SN3D --name "Subject at 0.5 m"
```

Use a new or empty output directory. Output follows `o1/left/Left_01.wav`, `o1/right/Right_01.wav`, etc., with one-based filenames mapping to zero-based ACN. `decoder.json` records the source and WAV checksums, actual selected radius range, method, weights, conditioning, ear mapping, filter length, and dependency versions. The original ZIP input and `--sofa-name` selection are also supported. No output kernels are peak-normalized or resampled. FLOAT is required by the packer; optional PCM exports reject clipping.

**Methods:** MagLS uses the upstream function's equal directional weighting and average phase continuation. The transition is explicitly `order * 600 Hz`, overridable with `--transition-frequency`. Repeated directions are averaged before either fit. On an uneven grid, the converter warns about MagLS's equal weights; `--method ls` instead uses spherical Voronoi areas and optionally `--regularization`. Rank-deficient, severely ill-conditioned, and single-hemisphere grids are rejected even with regularization. Spaudiopy's orthonormal SH coefficients are explicitly adapted to kernels for SN3D input, including the global `sqrt(4π)` factor.

MagLS inputs receive a shared **four-sample delay** to protect early onsets from spaudiopy's first-four-tap taper. Inputs are padded to a power of two of at least 1024 samples; the full returned FIR is retained, including spaudiopy's final 32-tap taper. LS preserves the source length and adds no delay. Neither method changes relative input ear timing through separate onset alignment. MagLS can change high-frequency phase by design.

**Supported SOFA subset:** `SimpleFreeFieldHRIR`, two receivers, finite `M × 2 × N` FIRs, a uniform integer sample rate, zero `Data.Delay`, and a listener at the origin facing +X with +Z up. Source coordinates can be spherical (degrees/radians) or Cartesian, with metres, centimetres, or millimetres. Nonzero delays must first be baked into the HRIRs while preserving ear timing; conversion stops rather than dropping them. Receiver Y positions identify the ears; ambiguous layouts require an explicit `--ear-order left-right` or `right-left`. Listener transforms and other SOFA conventions are rejected.

Each bank represents one fixed measurement radius; it does not implement distance interpolation. The converter does not install filters in the browser. The widget requests fifth order and applies a lateral-axis correction validated against both Aachen and KU100. New datasets need complete order-1–5 packages and verification of ear direction, gain, and timing through the actual renderer.

The five supplied THK KU100 SOFAs have been converted into packages at **0.50, 0.75, 1.00, 1.50, and 3.25 m** in [`decoders/ku100/`](decoders/ku100/README.md), with a sorted distance manifest, source attribution, reproducible build command, and actual-WASM validation report. These packages retain the source datasets' normalized levels; the published near-field level-restoration factors are recorded separately. The widget currently loads only the 0.50 m, 1.50 m, and 3.25 m recordings for listening tests at their supplied levels.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Minimal standalone test host. |
| `spatial-audio-widget.js` | Custom element, UI, WAV decoding, playback, public API. |
| `spatial-audio-widget.css` | Widget styles, loaded inside its shadow root. |
| `drumloop.wav` | Default sample, loaded automatically and replaceable with a visitor's WAV. |
| `scene-view.js` | Independent Three.js scene and controls. |
| `coordinates.js` | Shared Cartesian/spherical conversions, conventions and limits. |
| `distance-model.js` | Default position, interpolation weights for measured radii, and output peak protection. |
| `spherical-controls.js` | Surface-aligned angular handles, radial handle and constrained pointer dragging. |
| `handle-appearance.js` | Shared handle colours and Cartesian gizmo geometry styling. |
| `binaural-worklet.js` | New single-source adapter for the copied CatArt engine. |
| `decoders/aachen-mrt40.bindec` | Supplied Aachen filters, packaged for the native decoder. |
| `decoders/aachen-mrt40.json` | Decoder metadata, assumptions and source checksums. |
| `tools/pack-decoder.py` | Rebuilds the decoder package from ACN-ordered WAV files. |
| `tools/sofa_to_foa.py` | Offline SOFA-shell conversion using spaudiopy MagLS or weighted LS. |
| `tools/requirements-sofa.txt` | Pinned Python conversion dependencies. |
| `tools/build_ku100_decoders.py` | Rebuilds and checks the five supplied KU100 distance packages. |
| `decoders/ku100/` | KU100 distance packages, manifest, attribution, and validation report. |
| `vendor/` | Unmodified copies of the necessary original libraries/runtime. |
| `tests/` | Dependency-free DSP and browser smoke checks. |

The runtime bundle is approximately 8.3 MB before compression, plus approximately 5.03 MB for the three active KU100 decoder packages loaded on first playback. Only three DSP banks run for this listening test, reducing processing work from the previous five-bank configuration. The head model, DAW, timeline worklet, offline export, and alignment server are not included.

## Verification

The SOFA converter tests use synthetic responses with known gains and delays to check ACN/SN3D scaling through fifth order, both solvers, geometry checks, metadata rejection, ZIP handling, WAV export, and packaging:

```sh
.venv-sofa/bin/python -m unittest discover \
  -s assets/facilities/spatial-audio-widget/tests -p test_sofa_decoder.py -v
```

The DSP integration harness uses the actual copied WASM engine with a simulated worklet environment:

```sh
node --experimental-vm-modules assets/facilities/spatial-audio-widget/tests/binaural-worklet.test.mjs
```

It verifies the original and Aachen banks: directional left/right energy and arrival times, front/back and elevation differences, finite output at the origin and bounds, silence with missing input, heap growth, block-size validation, and disposal at 44.1 and 48 kHz.

The KU100 integration harness checks all five standalone decoder assets and the three active distance decoders:

```sh
node --experimental-vm-modules assets/facilities/spatial-audio-widget/tests/ku100-decoders.test.mjs
```

It checks the worklet output before the separate distance-gain node: all three active measured distances match their standalone decoders sample by sample, both midpoint blends are verified, and checks cover the far endpoint, five mixes below 0.50 m, bit-identical centered channels carrying the delayed original input at −21 dB, smooth weight transitions, warm filter histories, heap growth, silence, and disposal. Both 44.1 and 48 kHz are checked. The saved [validation report](decoders/ku100/validation.json) includes those checks and host processing timings; those timings cannot establish whether another device has audio dropouts.

The browser smoke runner checks unity at 1 m, the softened distance gain, close-range cap, reset, independent volume, playback, loading failures, and cleanup. It starts its own local static server and launches an installed Chrome via the DevTools Protocol:

```sh
node assets/facilities/spatial-audio-widget/tests/browser-smoke.mjs
```

It needs a recent Node with built-in `WebSocket` (tested with Node 24). It uses the standard macOS Chrome location; set `CHROME_PATH` for other installations. It installs no packages. Its temporary browser profile is created inside `tests/` and removed afterward.

Automated checks verify processing and interaction. A subjective headphone listening check is still useful for assessing the distance blends and spatial impression.
