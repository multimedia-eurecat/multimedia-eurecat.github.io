#!/usr/bin/env python3
"""
Convert a SimpleFreeFieldHRIR SOFA distance shell to ACN/SN3D binaural FIRs.

Uses spaudiopy's MagLS decoder (default), or its least-squares SH transform
with spherical Voronoi weights. FOA is the default; --max-order generates
independently fitted banks from order 1 through the requested order.

Dependencies:
    pip install -r requirements-sofa.txt

Usage:
    python sofa_to_foa.py --input path/to/file.sofa --list-distances
    python sofa_to_foa.py --input path/to/file.sofa --distance 0.50
    python sofa_to_foa.py --input path/to/archive.zip --distance 0.50

If a ZIP contains multiple SOFA files, use --sofa-name to select one:
    python sofa_to_foa.py --input NFHRIR_L2702_SOFA.zip \\
        --sofa-name "some_file.sofa" --distance 0.50

Distance units are metres. --tolerance defines the maximum absolute
difference from the requested radius.

Important:
- This produces a fixed, linear ambisonic-to-binaural decoder for ONE radius.
- It does not create a distance-varying decoder. Run once per radius.
- ReceiverPosition must identify the ears, or use --ear-order explicitly.
- Only zero Data.Delay and a listener at the origin facing +X with +Z up
  are supported. Unsupported metadata stops conversion.
- Output is oN/left/Left_01.wav etc. for pack-decoder.py, plus decoder.json.
- MagLS uses equal weights (the upstream function has no weights argument).
"""

from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import version
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import h5py
import numpy as np
import soundfile as sf
import spaudiopy as spa
from scipy.spatial import ConvexHull, SphericalVoronoi


def _decode_attr(value):
    """Convert HDF5 attribute values to a readable Python string."""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.ndarray) and value.size == 1:
        return _decode_attr(value.reshape(-1)[0])
    return str(value)


def _dataset_units(dataset, default=""):
    return _decode_attr(dataset.attrs.get("Units", default)).lower()


def _dataset_type(dataset, default=""):
    return _decode_attr(dataset.attrs.get("Type", default)).lower()


def _require_finite(name, values):
    if not np.size(values) or not np.all(np.isfinite(values)):
        raise ValueError(f"{name} must contain finite, non-empty data.")


def _check_listener_frame(f):
    """Reject coordinate frames which would require a listener transform."""
    for name, expected in (("ListenerPosition", [0, 0, 0]),
                           ("ListenerView", [1, 0, 0]),
                           ("ListenerUp", [0, 0, 1]),
                           ("EmitterPosition", [0, 0, 0])):
        if name not in f:
            continue  # SimpleFreeFieldHRIR defaults.
        ds = f[name]
        values = np.asarray(ds, dtype=float)
        _require_finite(name, values)
        if _dataset_type(ds, "cartesian") != "cartesian":
            raise ValueError(f"{name} must be Cartesian.")
        if name in ("ListenerPosition", "EmitterPosition"):
            _length_scale(_dataset_units(ds, "metre"))
        if name == "EmitterPosition" and values.shape == (1, 3, 1):
            values = values[:, :, 0]
        if values.ndim != 2 or values.shape[1] != 3:
            raise ValueError(f"Unsupported {name} shape {values.shape}.")
        if not np.allclose(values, expected, rtol=0, atol=1e-10):
            raise ValueError(
                f"Unsupported {name}: requires {expected}. "
                "Transform the SOFA data to the default listener frame first."
            )


def _read_sofa(path: Path):
    """Read the SOFA variables needed by this converter."""
    with h5py.File(path, "r") as f:
        convention = _decode_attr(f.attrs.get("SOFAConventions", "unknown"))
        if convention != "SimpleFreeFieldHRIR":
            raise ValueError(f"Unsupported SOFA convention {convention!r}; "
                             "expected SimpleFreeFieldHRIR.")
        if _decode_attr(f.attrs.get("DataType", "FIR")) != "FIR":
            raise ValueError("Only FIR SOFA data is supported.")
        _check_listener_frame(f)
        required = ("Data.IR", "Data.SamplingRate", "SourcePosition")
        missing = [key for key in required if key not in f]
        if missing:
            raise ValueError(f"SOFA file is missing variables: {missing}")

        ir = np.asarray(f["Data.IR"], dtype=np.float64)
        rates = np.asarray(f["Data.SamplingRate"], dtype=float).reshape(-1)
        _require_finite("Data.SamplingRate", rates)
        fs = float(rates[0])
        if (_dataset_units(f["Data.SamplingRate"], "hertz") != "hertz"
                or fs <= 0 or not fs.is_integer() or not np.all(rates == fs)):
            raise ValueError("Data.SamplingRate must be a uniform positive integer in hertz.")
        source = np.asarray(f["SourcePosition"], dtype=np.float64)
        source_type = _dataset_type(f["SourcePosition"], "spherical")
        source_units = _dataset_units(
            f["SourcePosition"], "degree, degree, metre"
        )

        delay = np.asarray(f["Data.Delay"]) if "Data.Delay" in f else None
        receiver = (
            np.asarray(f["ReceiverPosition"], dtype=np.float64)
            if "ReceiverPosition" in f else None
        )
        receiver_type = (
            _dataset_type(f["ReceiverPosition"], "cartesian")
            if "ReceiverPosition" in f else ""
        )
        receiver_units = (
            _dataset_units(f["ReceiverPosition"], "metre")
            if "ReceiverPosition" in f else ""
        )

        title = _decode_attr(f.attrs.get("Title", path.name))

    # SimpleFreeFieldHRIR Data.IR dimensions are M x R x N.
    if ir.ndim != 3:
        raise ValueError(
            f"Expected Data.IR with 3 dimensions (M,R,N); got {ir.shape}. "
            "This script currently supports single-listener HRIR SOFA files."
        )
    if ir.shape[1] != 2:
        raise ValueError(
            f"Expected exactly two receivers (ears); got {ir.shape[1]}."
        )
    if source.ndim != 2 or source.shape[1] != 3:
        raise ValueError(
            f"Expected SourcePosition with shape (M,3); got {source.shape}."
        )
    if source.shape[0] != ir.shape[0]:
        raise ValueError(
            f"SourcePosition count ({source.shape[0]}) does not match "
            f"Data.IR measurement count ({ir.shape[0]})."
        )
    if rates.size not in (1, ir.shape[0]):
        raise ValueError("Data.SamplingRate must be scalar or one value per measurement.")
    _require_finite("Data.IR", ir)
    _require_finite("SourcePosition", source)
    if delay is not None:
        _require_finite("Data.Delay", delay)
        if delay.shape not in ((1, 2), (ir.shape[0], 2)):
            raise ValueError(f"Unsupported Data.Delay shape {delay.shape}.")

    return {
        "ir": ir,
        "fs": fs,
        "source": source[:, :3],
        "source_type": source_type,
        "source_units": source_units,
        "delay": delay,
        "receiver": receiver,
        "receiver_type": receiver_type,
        "receiver_units": receiver_units,
        "convention": convention,
        "title": title,
    }


def _length_scale(unit):
    unit = unit.strip().lower()
    scales = {"metre": 1, "meter": 1, "m": 1,
              "centimetre": .01, "centimeter": .01, "cm": .01,
              "millimetre": .001, "millimeter": .001, "mm": .001}
    if unit not in scales:
        raise ValueError(f"Unsupported length unit {unit!r}.")
    return scales[unit]


def _source_spherical(source, source_type, units):
    """
    Return azimuth [rad], elevation [rad], radius [m].
    SOFA spherical coordinates are azimuth, elevation, radius.
    """
    unit_list = [u.strip().lower() for u in units.split(",")]
    if source_type == "spherical":
        az = source[:, 0].copy()
        el = source[:, 1].copy()
        radius = source[:, 2].copy()

        if len(unit_list) != 3 or unit_list[0] != unit_list[1]:
            raise ValueError(f"Unsupported spherical SourcePosition units: {units}")
        if unit_list[0] in ("degree", "degrees"):
            az = np.deg2rad(az)
            el = np.deg2rad(el)
        elif unit_list[0] not in ("radian", "radians"):
            raise ValueError(f"Unrecognized spherical SourcePosition units: {units}")

        radius *= _length_scale(unit_list[2])
    elif source_type == "cartesian":
        xyz = source * _length_scale(units)
        radius = np.linalg.norm(xyz, axis=1)
        if np.any(radius <= 0):
            raise ValueError("SourcePosition contains a zero-radius point.")
        az = np.arctan2(xyz[:, 1], xyz[:, 0])
        el = np.arcsin(np.clip(xyz[:, 2] / radius, -1.0, 1.0))
    else:
        raise ValueError(
            f"Unsupported SourcePosition:Type={source_type!r}; "
            "expected spherical or cartesian."
        )

    if np.any(radius <= 0) or np.any(np.abs(el) > np.pi / 2 + 1e-10):
        raise ValueError("Source positions require positive radii and valid elevations.")
    return az, el, radius


def _receiver_order(receiver, receiver_type, receiver_units, override=None):
    """Identify left/right from a fixed receiver layout, or an explicit override."""
    if override:
        return (0, 1) if override == "left-right" else (1, 0)
    if receiver is not None and receiver_type == "cartesian":
        r = np.asarray(receiver, dtype=float) * _length_scale(receiver_units)
        _require_finite("ReceiverPosition", r)
        if r.ndim == 3 and r.shape[:2] == (2, 3):
            if not np.allclose(r, r[:, :, :1], rtol=0, atol=1e-10):
                raise ValueError("Receiver positions must be fixed across measurements.")
            r = r[:, :, 0]
        if r.shape == (2, 3) and r[0, 1] * r[1, 1] < 0:
            return (0, 1) if r[0, 1] > r[1, 1] else (1, 0)
    raise ValueError("Cannot identify ears from ReceiverPosition; specify "
                     "--ear-order left-right or right-left after checking the SOFA metadata.")


def _sn3d_scales(order):
    # spaudiopy.sh_matrix uses orthonormal real SH: W=1/sqrt(4*pi).
    # Y_spa = Y_SN3D * sqrt((2*n+1)/(4*pi)). For decoder kernels the
    # factor MULTIPLIES the fitted coefficients, since input uses SN3D.
    degrees = np.floor(np.sqrt(np.arange((order + 1) ** 2))).astype(int)
    return np.sqrt((2 * degrees + 1) / (4 * np.pi))


def _sn3d_basis(order, azimuth, elevation):
    return spa.sph.sh_matrix(order, azimuth, np.pi / 2 - elevation,
                             sh_type="real") / _sn3d_scales(order)


def _unique_directions(azimuth, elevation, ir):
    xyz = np.column_stack((np.cos(elevation) * np.cos(azimuth),
                           np.cos(elevation) * np.sin(azimuth),
                           np.sin(elevation)))
    _, first, inverse, counts = np.unique(
        np.round(xyz, 9), axis=0, return_index=True,
        return_inverse=True, return_counts=True)
    merged = np.zeros((len(first), *ir.shape[1:]))
    np.add.at(merged, inverse, ir)
    merged /= counts[:, None, None]
    return azimuth[first], elevation[first], xyz[first], merged


def _direction_weights(xyz):
    # Full rank alone permits a small cap; reject single-hemisphere grids.
    hull = ConvexHull(xyz)
    if np.any(hull.equations[:, -1] >= -1e-8):
        raise ValueError("Directions must surround the listener, spanning both hemispheres.")
    areas = SphericalVoronoi(xyz, radius=1, center=np.zeros(3)).calculate_areas()
    return areas / np.mean(areas)


def _validate_basis(basis):
    rank = np.linalg.matrix_rank(basis)
    if rank < basis.shape[1]:
        raise ValueError(f"Selected directions have SH rank {rank}; "
                         f"need {basis.shape[1]}. Reduce --max-order or use a fuller grid.")
    cond = float(np.linalg.cond(basis))
    if cond > 1e6:
        raise ValueError(f"SH design matrix is ill-conditioned ({cond:.3g}).")
    return cond


def _fit_decoder(ir, azimuth, elevation, fs, order, method, weights,
                 regularization=0, transition=None):
    """Return (ears, ACN channels, taps), explicitly for SN3D input."""
    zenith = np.pi / 2 - elevation
    basis = _sn3d_basis(order, azimuth, elevation)
    # Check the unregularized matrix even when using a ridge penalty.
    cond = _validate_basis(basis * np.sqrt(weights)[:, None])
    if method == "ls":
        a = basis * np.sqrt(weights)[:, None]
        b = ir.reshape(len(ir), -1) * np.sqrt(weights)[:, None]
        if regularization:
            a = np.vstack((a, np.sqrt(regularization) * np.eye(a.shape[1])))
            b = np.vstack((b, np.zeros((basis.shape[1], b.shape[1]))))
        # Supply the weighted/augmented matrix; spaudiopy performs the solve.
        coeff = spa.sph.sht_lstsq(b, order, azimuth, zenith, "real", Y_nm=a)
        filters = coeff.reshape((order + 1) ** 2, 2, ir.shape[-1]).transpose(1, 0, 2)
        return filters, cond, None

    _validate_basis(basis)  # MagLS itself uses equal weights.
    f_trans = float(transition if transition is not None else order * 600)
    # Pad to the FFT length explicitly, retaining all returned taps. Upstream
    # otherwise crops the FIR to the original HRIR length after its IFFT.
    # Upstream also tapers the first four taps. Add a shared four-sample
    # delay to protect early onsets without changing relative ear timing.
    nfft = 1 << max(10, (ir.shape[-1] + 4 - 1).bit_length())
    cuton = int(np.argmin(np.abs(np.fft.rfftfreq(nfft, 1 / fs) - f_trans)))
    if not 5 < cuton < nfft // 2 or not 0 < f_trans < fs / 2:
        raise ValueError("MagLS transition needs at least six FFT bins below it "
                         "and must be below Nyquist. Change --transition-frequency.")
    padded = np.pad(ir, ((0, 0), (0, 0), (4, nfft - ir.shape[-1] - 4)))
    hrirs = spa.sig.HRIRs(padded[:, 0], padded[:, 1], azimuth, zenith, fs)
    filters = spa.decoder.magls_bin(hrirs, order, f_trans=f_trans, hf_cont="avg")
    filters *= _sn3d_scales(order)[None, :, None]
    return filters, cond, f_trans


def _list_shells(radius, tolerance):
    """Print clusters of measurement radii."""
    order = np.argsort(radius)
    sorted_r = radius[order]
    clusters = []
    start = 0
    for i in range(1, len(sorted_r) + 1):
        if i == len(sorted_r) or sorted_r[i] - sorted_r[start] > tolerance:
            vals = sorted_r[start:i]
            clusters.append((float(np.median(vals)), len(vals),
                             float(vals.min()), float(vals.max())))
            start = i
    print("Distance shells (metres; grouped by --tolerance):")
    for median, count, lo, hi in clusters:
        print(
            f"  median={median:.5f} m  points={count:4d}  "
            f"range=[{lo:.5f}, {hi:.5f}] m"
        )


def _resolve_input(input_path: Path, sofa_name: str | None, temp_dir: Path):
    """Return a SOFA file path, extracting ZIP input if necessary."""
    if input_path.suffix.lower() == ".sofa":
        if not input_path.exists():
            raise FileNotFoundError(input_path)
        return input_path

    if input_path.suffix.lower() != ".zip":
        raise ValueError("--input must be a .sofa file or a ZIP archive.")

    with zipfile.ZipFile(input_path, "r") as zf:
        names = [
            n for n in zf.namelist()
            if n.lower().endswith(".sofa") and not n.endswith("/")
        ]
        if not names:
            raise ValueError("No .sofa files found inside the ZIP archive.")

        if sofa_name:
            matches = [n for n in names if n == sofa_name or n.endswith("/" + sofa_name)]
            if len(matches) != 1:
                raise ValueError(
                    f"--sofa-name {sofa_name!r} matched {len(matches)} files. "
                    "Use one of the listed archive paths."
                )
            selected = matches[0]
        elif len(names) == 1:
            selected = names[0]
        else:
            print("The ZIP contains multiple SOFA files:")
            for n in names:
                print("  " + n)
            raise ValueError(
                "Please rerun with --sofa-name and one of the paths above."
            )

        target = temp_dir / Path(selected).name
        with zf.open(selected) as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst)
        return target


def main():
    parser = argparse.ArgumentParser(
        description="Convert a SOFA HRIR shell to ACN/SN3D binaural decoder banks."
    )
    parser.add_argument("--input", required=True, type=Path,
                        help="SOFA file or ZIP containing SOFA file(s).")
    parser.add_argument("--sofa-name", default=None,
                        help="SOFA member path/name when ZIP contains multiple files.")
    parser.add_argument("--distance", type=float, default=None,
                        help="Target source radius in metres.")
    parser.add_argument("--tolerance", type=float, default=0.015,
                        help="Maximum |measured radius - target| in metres (default 0.015).")
    parser.add_argument("--list-distances", action="store_true",
                        help="List distance shells and exit.")
    parser.add_argument("--out", type=Path, default=Path("foa_decoder"),
                        help="Output directory (default: ./foa_decoder).")
    parser.add_argument("--regularization", type=float, default=0.0,
                        help="Optional ridge parameter; default 0 (ordinary LS).")
    parser.add_argument("--subtype", default="FLOAT",
                        choices=("FLOAT", "PCM_16", "PCM_24", "PCM_32"),
                        help="WAV encoding (default FLOAT).")
    parser.add_argument("--max-order", type=int, default=1,
                        help="Generate orders 1 through N (default: 1, FOA).")
    parser.add_argument("--method", choices=("ls", "magls"), default="magls",
                        help="Weighted LS or spaudiopy MagLS (default magls, equal weights).")
    parser.add_argument("--transition-frequency", type=float,
                        help="MagLS transition in Hz (default: order * 600).")
    parser.add_argument("--ear-order", choices=("left-right", "right-left"),
                        help="Explicit receiver mapping if metadata cannot identify ears.")
    args = parser.parse_args()

    if not np.isfinite(args.tolerance) or args.tolerance < 0:
        parser.error("--tolerance must be non-negative.")
    if not np.isfinite(args.regularization) or args.regularization < 0:
        parser.error("--regularization must be non-negative.")

    if args.max_order < 1:
        parser.error("--max-order must be at least 1.")
    if args.distance is not None and (not np.isfinite(args.distance) or args.distance <= 0):
        parser.error("--distance must be finite and positive.")
    if args.method == "magls" and args.regularization:
        parser.error("--regularization is only supported with --method ls.")
    if args.transition_frequency is not None:
        if args.method != "magls" or not np.isfinite(args.transition_frequency):
            parser.error("--transition-frequency requires magls and a finite value.")

    with tempfile.TemporaryDirectory(prefix="sofa_foa_") as td:
        sofa_path = _resolve_input(args.input, args.sofa_name, Path(td))
        data = _read_sofa(sofa_path)

        az, el, radius = _source_spherical(
            data["source"], data["source_type"], data["source_units"]
        )

        print(f"SOFA file: {sofa_path.name}")
        print(f"SOFA convention: {data['convention']}")
        print(f"Title: {data['title']}")
        print(f"Sample rate: {data['fs']:.0f} Hz")
        print(f"Data.IR shape: {data['ir'].shape} (M, ears, samples)")
        print(f"SourcePosition type/units: {data['source_type']} / {data['source_units']}")
        print(f"Radius range: {radius.min():.5f}–{radius.max():.5f} m")

        if args.list_distances:
            _list_shells(radius, args.tolerance)
            return

        if args.distance is None:
            parser.error("Specify --distance in metres, or use --list-distances.")

        mask = np.abs(radius - args.distance) <= args.tolerance
        count = int(mask.sum())
        if count < 4:
            raise ValueError(
                f"Only {count} measurements fall within {args.tolerance:g} m "
                f"of {args.distance:g} m. Increase --tolerance or inspect "
                "the available shells with --list-distances."
            )

        selected_radius = radius[mask]
        print(
            f"Selected {count}/{len(radius)} measurements for target "
            f"{args.distance:.4f} m; actual median radius "
            f"{np.median(selected_radius):.5f} m "
            f"(range {selected_radius.min():.5f}–{selected_radius.max():.5f} m)."
        )

        if data["delay"] is not None and np.any(data["delay"] != 0):
            raise ValueError("Nonzero Data.Delay is unsupported. Bake the SOFA delays "
                             "into Data.IR, preserving relative ear timing, before conversion.")
        left_idx, right_idx = _receiver_order(
            data["receiver"], data["receiver_type"], data["receiver_units"], args.ear_order
        )
        if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
            raise ValueError(f"Output must be a new or empty directory: {args.out}")
        selected_ir = data["ir"][mask][:, [left_idx, right_idx], :]
        az, el, xyz, ir = _unique_directions(az[mask], el[mask], selected_ir)
        # Check rank before the hull calculation for a useful horizontal-grid error.
        _validate_basis(_sn3d_basis(args.max_order, az, el))
        spatial_weights = _direction_weights(xyz)
        weights = spatial_weights if args.method == "ls" else np.ones(len(ir))
        print(f"Unique directions: {len(ir)}; method: {args.method}; "
              f"weighting: {'spherical Voronoi' if args.method == 'ls' else 'equal (spaudiopy MagLS)'}")
        if args.method == "magls" and np.max(spatial_weights) / np.min(spatial_weights) > 2:
            print("WARNING: Uneven measurement grid; MagLS uses equal weights. "
                  "Use --method ls for Voronoi-weighted fitting.", file=sys.stderr)

        banks = []
        order_info = []
        for order in range(1, args.max_order + 1):
            filters, cond, transition = _fit_decoder(
                ir, az, el, data["fs"], order, args.method, weights,
                args.regularization, args.transition_frequency)
            _require_finite("Decoder filters", filters)
            if np.max(np.abs(filters)) > np.finfo(np.float32).max:
                raise ValueError("Decoder filters exceed float32 range.")
            if args.subtype != "FLOAT" and np.max(np.abs(filters)) >= 1:
                raise ValueError("PCM output would clip. Use --subtype FLOAT to preserve gains.")
            banks.append(filters)
            order_info.append({"order": order, "channelsPerEar": (order + 1) ** 2,
                               "conditionNumber": cond, "transitionFrequencyHz": transition})
            print(f"Order {order}: {(order + 1) ** 2} channels/ear, "
                  f"{filters.shape[-1]} taps, condition number {cond:.3f}")

        metadata = {
            "name": data["title"], "sourceFile": sofa_path.name,
            "sourceSha256": hashlib.sha256(sofa_path.read_bytes()).hexdigest(),
            "sofaConvention": data["convention"], "method": args.method,
            "weighting": "spherical-voronoi" if args.method == "ls" else "equal",
            "regularization": args.regularization,
            "phaseContinuation": "avg" if args.method == "magls" else None,
            "channelOrdering": "ACN", "inputNormalization": "SN3D",
            "coordinates": "+X front, +Y left, +Z up",
            "earReceiverIndices": {"left": left_idx, "right": right_idx},
            "earOrderOverride": args.ear_order,
            "targetDistanceMetres": args.distance,
            "actualDistanceMetres": {"min": float(selected_radius.min()),
                                     "median": float(np.median(selected_radius)),
                                     "max": float(selected_radius.max())},
            "selectedMeasurements": count, "uniqueDirections": len(ir),
            "duplicateDirections": "averaged before fitting",
            "sampleRate": int(data["fs"]), "resampled": False,
            "sourceSamplesPerHRIR": data["ir"].shape[-1],
            "samplesPerFilter": banks[0].shape[-1], "wavSubtype": args.subtype,
            "dataDelay": "zero", "trimmed": False, "gainNormalized": False,
            "addedCommonDelaySamples": 4 if args.method == "magls" else 0,
            "taper": "spaudiopy: first 4 and last 32 taps" if args.method == "magls" else None,
            "orders": order_info,
            "dependencies": {pkg: version(pkg) for pkg in
                             ("spaudiopy", "numpy", "scipy", "h5py", "soundfile")},
            "wavSha256": {},
        }
        args.out.mkdir(parents=True, exist_ok=True)
        for order, filters in enumerate(banks, 1):
            for ear_index, ear in enumerate(("left", "right")):
                folder = args.out / f"o{order}" / ear
                folder.mkdir(parents=True)
                for channel in range((order + 1) ** 2):
                    out_file = folder / f"{ear.capitalize()}_{channel + 1:02d}.wav"
                    sf.write(out_file, filters[ear_index, channel].astype(np.float32),
                             int(data["fs"]), subtype=args.subtype)
                    metadata["wavSha256"][str(out_file.relative_to(args.out))] = (
                        hashlib.sha256(out_file.read_bytes()).hexdigest())
        (args.out / "decoder.json").write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n")
        print(f"Wrote banks and decoder.json to {args.out}")
        print("Convolve each ACN/SN3D input channel with its matching filter "
              "and sum channels per ear. FOA channel order: W, Y, Z, X.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
