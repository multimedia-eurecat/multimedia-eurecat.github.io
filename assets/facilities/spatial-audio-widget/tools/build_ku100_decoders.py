#!/usr/bin/env python3
"""Build the five THK KU100 distance decoders from NFHRIR_L2702_SOFA.

Uses the pinned requirements-sofa.txt environment. Source SOFAs are read only;
intermediate WAVs live in a temporary directory. Supplied levels are preserved.
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import h5py
import numpy as np
import soundfile as sf

import sofa_to_foa as converter


TOOLS = Path(__file__).resolve().parent
GAIN_REFERENCE = "https://audiogroup.web.th-koeln.de/FILES/NF_Datasets_Gains_infos.pdf"
FAR_FIELD_PUBLICATION = {
    "url": "https://zenodo.org/records/3928297",
    "doi": "10.5281/zenodo.3928297",
    "title": "Spherical Far-Field HRIR Compilation of the Neumann KU100",
    "publishedFilename": "HRIR_FULL2DEG.sofa",
    "publishedChecksum": "md5:aa48acb20c1fb8ff3d8de116107b73c2",
    "recordLicense": "cc-by-3.0",
    "paperUrl": "https://audiogroup.web.th-koeln.de/FILES/AIA-DAGA2013_HRIRs.pdf",
}
DATASETS = (
    ("HRIR_L2702_NF050.sofa", "ku100-050cm", .50, 2702, .33),
    ("HRIR_L2702_NF075.sofa", "ku100-075cm", .75, 2702, .25),
    ("HRIR_L2702_NF100.sofa", "ku100-100cm", 1., 2702, .16),
    ("HRIR_L2702_NF150.sofa", "ku100-150cm", 1.5, 2702, .095),
    ("HRIR_FULL2DEG_FF325.sofa", "ku100-325cm", 3.25, 16020, None),
)
LANDMARKS = {"front": (0, 0), "left": (90, 0), "right": (270, 0),
             "back": (180, 0), "up": (0, 90), "down": (0, -90)}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_publication(path):
    """Verify the known far-field release offline, retaining its original name."""
    if path.name != "HRIR_FULL2DEG_FF325.sofa":
        return None
    checksum = "md5:" + hashlib.md5(path.read_bytes()).hexdigest()
    if checksum != FAR_FIELD_PUBLICATION["publishedChecksum"]:
        raise ValueError(f"{path.name} does not match the documented Zenodo release.")
    return {**FAR_FIELD_PUBLICATION, "checksumVerified": True}


def stats(ir):
    energy = np.sum(ir * ir, axis=-1)
    return {"energyPerEar": energy.tolist(),
            "leftMinusRightEnergyDb": float(10 * np.log10(energy[0] / energy[1])),
            "peakSamplePerEar": np.argmax(np.abs(ir), axis=-1).tolist()}


def inspect_source(path, distance, measurements):
    data = converter._read_sofa(path)
    az, el, radius = converter._source_spherical(
        data["source"], data["source_type"], data["source_units"])
    if (data["ir"].shape != (measurements, 2, 128) or data["fs"] != 48000
            or not np.allclose(radius, distance, rtol=0, atol=1e-8)):
        raise ValueError(f"Unexpected measurement layout/radius in {path.name}")
    # All five files' responses support [left,right]: +90 degrees has an
    # earlier, stronger receiver 0, and 270 degrees has receiver 1. The four
    # NF files label their ReceiverPosition Y coordinates the opposite way.
    landmarks = {}
    for name, (a, e) in LANDMARKS.items():
        delta = np.abs(np.angle(np.exp(1j * (az - np.deg2rad(a)))))
        index = int(np.argmin(delta + np.abs(el - np.deg2rad(e))))
        landmarks[name] = {"measurement": index,
                           "azimuthDegrees": float(np.rad2deg(az[index])),
                           "elevationDegrees": float(np.rad2deg(el[index])),
                           **stats(data["ir"][index])}
    if (landmarks["left"]["leftMinusRightEnergyDb"] < 10
            or landmarks["right"]["leftMinusRightEnergyDb"] > -10
            or landmarks["left"]["peakSamplePerEar"][0] >= landmarks["left"]["peakSamplePerEar"][1]
            or landmarks["right"]["peakSamplePerEar"][1] >= landmarks["right"]["peakSamplePerEar"][0]):
        raise ValueError(f"Ear/direction checks failed for {path.name}; inspect the data.")
    with h5py.File(path) as f:
        attributes = {}
        for key in ("Author", "License", "Organization", "ListenerDescription",
                    "SourceDescription", "References", "DateModified"):
            value = f.attrs.get(key, "")
            if isinstance(value, bytes):
                try:
                    value = value.decode("utf-8")
                except UnicodeDecodeError:
                    value = value.decode("latin-1")  # Legacy THK metadata.
            attributes[key] = str(value)
    return {"attributes": attributes, "landmarks": landmarks,
            "receiverPositionMetres": np.squeeze(data["receiver"]).tolist(),
            "sourceSha256": sha256(path)}


def inspect_filters(wavs):
    filters = np.array([
        [sf.read(wavs / "o5" / ear / f"{ear.capitalize()}_{c+1:02d}.wav")[0]
         for c in range(36)] for ear in ("left", "right")])
    landmarks = {}
    for name, (az, el) in LANDMARKS.items():
        basis = converter._sn3d_basis(5, np.deg2rad([az]), np.deg2rad([el]))[0]
        landmarks[name] = stats(np.einsum("c,ecn->en", basis, filters))
    if (landmarks["left"]["leftMinusRightEnergyDb"] < 5
            or landmarks["right"]["leftMinusRightEnergyDb"] > -5):
        raise ValueError("Fifth-order kernel ear-direction check failed.")
    return landmarks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path,
                        default=Path.home() / "Downloads/NFHRIR_L2702_SOFA")
    parser.add_argument("--out", type=Path, default=TOOLS.parent / "decoders/ku100")
    args = parser.parse_args()
    if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
        parser.error("--out must be a new or empty directory.")
    # Inspect every input before writing output, including the known ear-label
    # inconsistency. The SOFA source checksums are recorded, not changed.
    source_info = [inspect_source(args.source / name, distance, count)
                   for name, _, distance, count, _ in DATASETS]
    publications = [source_publication(args.source / name)
                    for name, *_ in DATASETS]
    manifest = {
        "schemaVersion": 1, "name": "THK KU100 distance decoders",
        "method": "magls", "maxOrder": 5, "sampleRate": 48000,
        "samplesPerFilter": 1024, "channelsPerEar": 36,
        "channelOrdering": "ACN", "inputNormalization": "SN3D",
        "coordinates": "+X front, +Y left, +Z up",
        "levelPolicy": "Preserve supplied SOFA levels; no cross-distance level restoration.",
        "naturalLevelRestorationApplied": False,
        "naturalLevelRestorationReference": GAIN_REFERENCE,
        "naturalLevelRestorationReferenceDistanceMetres": .25,
        "farFieldLevelCalibration": None,
        "timingPolicy": "Retain SOFA timing; shared 4-sample MagLS input padding; "
                        "no cross-distance alignment or added propagation delay.",
        "phasePolicy": "Independent MagLS per order and distance; avg continuation; "
                       "transition = order * 600 Hz.",
        "distances": [],
    }
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ku100-wavs-") as temp:
        for (filename, stem, distance, _, gain), info, publication in zip(
                DATASETS, source_info, publications):
            print(f"\nBuilding {stem} ({distance:g} m)", flush=True)
            wavs = Path(temp) / stem
            subprocess.run([
                sys.executable, str(TOOLS / "sofa_to_foa.py"),
                "--input", str(args.source / filename), "--distance", str(distance),
                "--tolerance", "0.000001", "--max-order", "5", "--method", "magls",
                "--ear-order", "left-right", "--out", str(wavs)], check=True)
            conversion = json.loads((wavs / "decoder.json").read_text())
            decoded_metrics = inspect_filters(wavs)
            binary = args.out / f"{stem}.bindec"
            subprocess.run([
                sys.executable, str(TOOLS / "pack-decoder.py"), str(wavs), str(binary),
                "--normalization", "SN3D", "--name", f"THK KU100 {distance:.2f} m"], check=True)
            metadata_path = binary.with_suffix(".json")
            metadata = json.loads(metadata_path.read_text())
            if (metadata["maxOrder"] != 5 or metadata["sampleRate"] != 48000
                    or metadata["samplesPerFilter"] != 1024
                    or metadata["binarySha256"] != sha256(binary)
                    or conversion["sourceSha256"] != info["sourceSha256"]
                    or metadata["sourceWavSha256"] != conversion["wavSha256"]):
                raise ValueError(f"Package consistency check failed for {stem}.")
            metadata.update({
                "normalizationAssumed": False, "distanceMetres": distance,
                "conversion": conversion, "sourceInspection": info,
                "fifthOrderKernelLandmarks": decoded_metrics,
                "earMappingReason": "Explicit [left,right], checked against lateral energy "
                                    "and arrival timing; NF ReceiverPosition labels conflict.",
                "naturalLevelRestorationFactor": gain,
                "naturalLevelRestorationApplied": False,
                "naturalLevelRestorationReference": GAIN_REFERENCE,
            })
            if publication:
                metadata["sourcePublication"] = publication
            metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False,
                                               allow_nan=False) + "\n")
            manifest["distances"].append({
                "distanceMetres": distance, "decoder": binary.name,
                "metadata": metadata_path.name, "bytes": binary.stat().st_size,
                "binarySha256": metadata["binarySha256"],
                "sourceFile": filename, "sourceSha256": info["sourceSha256"],
                "naturalLevelRestorationFactor": gain,
            })
            if publication:
                manifest["distances"][-1]["sourcePublication"] = publication
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n")
    print(f"\nBuilt and checked five distance decoders in {args.out}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
