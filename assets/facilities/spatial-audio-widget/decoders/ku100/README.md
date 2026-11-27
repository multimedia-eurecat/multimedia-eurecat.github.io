# THK KU100 distance decoders

Five packages converted from the SOFA files in `~/Downloads/NFHRIR_L2702_SOFA`.
The source SOFAs are unchanged and are not copied into this repository.

The far-field release is archived on
[Zenodo, DOI 10.5281/zenodo.3928297](https://zenodo.org/records/3928297).
Its `HRIR_FULL2DEG.sofa` is byte-for-byte identical to the supplied
`HRIR_FULL2DEG_FF325.sofa`: both have MD5
`aa48acb20c1fb8ff3d8de116107b73c2`. The published filename and checksum are
recorded alongside our SHA-256 source checksum in the manifest and far-field
companion JSON. The build script verifies this match locally without a download.

| Distance | Decoder | Source SOFA | Directions |
| --- | --- | --- | --- |
| 0.50 m | [ku100-050cm.bindec](ku100-050cm.bindec) | `HRIR_L2702_NF050.sofa` | 2702 |
| 0.75 m | [ku100-075cm.bindec](ku100-075cm.bindec) | `HRIR_L2702_NF075.sofa` | 2702 |
| 1.00 m | [ku100-100cm.bindec](ku100-100cm.bindec) | `HRIR_L2702_NF100.sofa` | 2702 |
| 1.50 m | [ku100-150cm.bindec](ku100-150cm.bindec) | `HRIR_L2702_NF150.sofa` | 2702 |
| 3.25 m | [ku100-325cm.bindec](ku100-325cm.bindec) | `HRIR_FULL2DEG_FF325.sofa` | 16020 |

Each package contains independently fitted **orders 1–5**, using real ACN/SN3D
input: 36 filters per ear at fifth order, **48 kHz**, **1024 samples per filter**.
Each binary is 1,675,820 bytes; five together are about 8.38 MB before compression.
[manifest.json](manifest.json) lists the distances in ascending order, asset
paths, sizes, and source/binary SHA-256 checksums. Each binary's companion JSON
also records the conversion parameters, WAV checksums, source attribution,
receiver mapping, and measured/reconstructed cardinal-direction diagnostics.

## Conversion

The fit uses spaudiopy 0.2.0 `magls_bin`, equal weights, average phase
continuation, and an explicit transition frequency of `order * 600 Hz`.
The returned coefficients are adapted from spaudiopy's orthonormal real SH
basis to **decoder kernels for SN3D input**, then packed using `pack-decoder.py`.
The measurement grids are not equally distributed in area; MagLS's equal
weights are an upstream limitation, recorded here rather than described as
Voronoi weighting. No resampling or additional level normalization is applied.

The 128-sample source HRIRs receive the same four-sample leading delay and
zero-padding to 1024 samples before fitting. The full MagLS result is retained,
including spaudiopy's first-four-tap and final-32-tap tapers. No per-ear onset
alignment or cross-distance phase/delay alignment has been applied. MagLS
intentionally changes high-frequency phase; broadband peak positions are not
a reliable measure of the preserved low-frequency interaural timing.

**Ear mapping:** all packages explicitly retain receiver 0 as left and receiver
1 as right. In the four near-field SOFAs, `ReceiverPosition` labels receiver 0
at negative Y, which conflicts with the response data under SOFA's +Y-left
source convention. At +90° azimuth, receiver 0 is earlier and stronger; at
270°, receiver 1 is earlier and stronger. The 3.25 m file's receiver positions
agree with this response mapping. These observations and the explicit
`--ear-order left-right` override are recorded in each companion JSON.

Rebuild into a **new or empty** directory using the pinned Python environment
described in the [widget README](../../README.md):

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 .venv-sofa/bin/python \
  assets/facilities/spatial-audio-widget/tools/build_ku100_decoders.py \
  --source ~/Downloads/NFHRIR_L2702_SOFA --out /tmp/ku100-rebuilt
```

The builder inspects all inputs, verifies the lateral ear responses, converts
each distance, packs the filters, and checks their formats and checksums.
Intermediate WAV files are temporary; all parameters and source hashes needed
to reproduce them are retained in the companion JSONs.

## Levels and later distance crossfading

These packages preserve the **supplied SOFA levels**. The near-field datasets
were independently normalized during their original post-processing, while
the far-field data underwent center-response magnitude and phase compensation.
They therefore
contain distance-dependent spectral and binaural differences, but do not carry
the natural overall attenuation between distances. The publisher supplies
[level-restoration factors](https://audiogroup.web.th-koeln.de/FILES/NF_Datasets_Gains_infos.pdf)
for the near-field data:

| Distance | Published amplitude multiplier, relative to the 0.25 m dataset |
| --- | --- |
| 0.50 m | 0.33 |
| 0.75 m | 0.25 |
| 1.00 m | 0.16 |
| 1.50 m | 0.095 |
| 3.25 m | Not specified by that reference |

These multipliers are recorded in the manifest and **have not been applied**.
The 3.25 m file is a separate far-field measurement campaign with a different
speaker and grid, not an additional shell from the near-field session. Its
relative level calibration is left unknown. For the current listening test,
the widget loads and processes only the **0.50 m, 1.50 m, and 3.25 m** packages at their
supplied levels and blends neighboring outputs linearly by radius, with smoothed weights.
The 0.75 m and 1.00 m packages remain in the manifest for later comparisons.
The decoder files retain their supplied levels; no level-restoration factors
are baked into them. The widget separately applies a smoothed distance gain of
`1 / sqrt(max(distance, 0.0875))` after crossfading, with unity at 1 m and
half the dB change per doubling of distance of a `1 / distance` curve. This is
followed by the Volume control
and peak protection. Beyond 3.25 m, the far-field recording is held. Below 0.50 m, the widget
fades the nearest HRTF into unfiltered mono duplicated in both ears, reaching
a fully centered image at zero. The centered path is attenuated by 21 dB, has a shared 0.5 ms delay,
and uses the same smoothed weights. The visual controls still span 0–7 m and
the separate distance gain follows that full range. Cross-distance phase/delay alignment has not
been added, so this version can be assessed directly in listening tests.

The [far-field paper](https://audiogroup.web.th-koeln.de/FILES/AIA-DAGA2013_HRIRs.pdf)
confirms approximately 3.25 m between speaker and head center and describes
the compensation and reduction to 128 taps. It notes that overall latency can
be removed after compensation; the file's short HRIRs therefore should not
be treated as containing the full 3.25 m propagation delay. Neither that paper
nor the Zenodo record supplies a gain factor tying this far-field session to
the near-field sessions. Any later extrapolation of distance gain must be
identified as a model rather than a published calibration.

## Validation

[validation.json](validation.json) records tests of all five binaries through
the actual CatArt WASM engine in fixed-decoder mode, plus the three active
distance decoders, at **44.1 and 48 kHz**. Checks cover binary hashes, successful loading, finite
audio, left/right energy, low-frequency interaural delay, front/back, and
elevation. The worklet's existing lateral sign correction passes with these
packages. The crossfade mode additionally matches all three active measured distances
against their standalone decoders, checks both midpoint mixes sample by sample, and
checks far-end clamping, centered mixes below 0.50 m, identical centered
channels, smooth jumps, unity-sum weights, heap growth, silence,
and disposal. These automated checks do not constitute a subjective listening
test.

```sh
node --experimental-vm-modules \
  assets/facilities/spatial-audio-widget/tests/ku100-decoders.test.mjs \
  /tmp/ku100-validation.json
```

## Source attribution and license

Near-field measurements: **Johannes M. Arend, Annika Neidhardt, and Christoph
Pörschmann**, TH Köln. See the
[near-field dataset page](https://audiogroup.web.th-koeln.de/ku100nfhrir.html)
and *Measurement and Perceptual Evaluation of a Spherical Near-Field HRTF Set*,
Tonmeistertagung 2016 ([paper](https://audiogroup.web.th-koeln.de/PUBLIKATIONEN/Arend_TMT2016.pdf)).

Far-field measurements: **Benjamin Bernschütz**, TH Köln. See the
[archived release](https://zenodo.org/records/3928297),
[far-field dataset page](https://audiogroup.web.th-koeln.de/ku100hrir.html)
and *A Spherical Far Field HRIR/HRTF Compilation of the Neumann KU100*,
AIA/DAGA 2013 ([paper](https://audiogroup.web.th-koeln.de/PUBLIKATIONEN/Bernschuetz_DAGA2013.pdf)).

All five supplied SOFAs declare **`CC 3.0 BY-SA`** in their license metadata
([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)); that wording
is preserved in the companion JSONs. The near-field paper additionally
describes its release as CC BY-SA 4.0. These decoder files are adaptations of
the supplied measurements: spherical-harmonic reduction, MagLS phase
processing, shared input delay/padding, tapering, and binary packaging as
described above. Retain attribution and the source license information with
redistributed decoder data.

The far-field Zenodo record lists `cc-by-3.0`, whereas the supplied SOFA and
the original far-field paper state CC BY-SA 3.0. Both declarations are recorded;
the original SOFA license metadata is retained.
