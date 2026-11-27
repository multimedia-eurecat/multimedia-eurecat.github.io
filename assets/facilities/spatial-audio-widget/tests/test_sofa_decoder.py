"""Numerical and CLI checks; run with the converter's Python dependencies."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

import h5py
import numpy as np
import soundfile as sf


TOOLS = Path(__file__).resolve().parents[1] / "tools"
spec = importlib.util.spec_from_file_location("sofa_decoder", TOOLS / "sofa_to_foa.py")
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
spec = importlib.util.spec_from_file_location("packer", TOOLS / "pack-decoder.py")
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


def directions(count=100):
    # Uniform Fibonacci sphere, with no downloaded grid or HRIR data.
    z = 1 - 2 * (np.arange(count) + .5) / count
    az = np.arange(count) * np.pi * (3 - np.sqrt(5))
    el = np.arcsin(z)
    return az, el


def known_ir(az, el, taps=64):
    # Independent ACN/SN3D FOA definition and known per-ear delays/gains.
    basis = np.column_stack((np.ones(len(az)), np.cos(el) * np.sin(az),
                             np.sin(el), np.cos(el) * np.cos(az)))
    kernels = np.zeros((2, 4, taps))
    kernels[0, :, 16] = [.2, .04, .02, .03]
    kernels[1, :, 21] = [.1, -.03, .01, -.02]
    return np.einsum("qc,ecn->qen", basis, kernels), kernels


def write_sofa(path, az, el, ir):
    with h5py.File(path, "w") as f:
        f.attrs["SOFAConventions"] = "SimpleFreeFieldHRIR"
        f.attrs["DataType"] = "FIR"
        f.attrs["Title"] = "Synthetic directional HRIRs"
        f["Data.IR"] = ir
        f["Data.SamplingRate"] = [48000.]
        f["Data.SamplingRate"].attrs["Units"] = "hertz"
        f["Data.Delay"] = [[0., 0.]]
        f["SourcePosition"] = np.column_stack((np.rad2deg(az), np.rad2deg(el),
                                               np.full(len(az), .5)))
        f["SourcePosition"].attrs["Type"] = "spherical"
        f["SourcePosition"].attrs["Units"] = "degree, degree, metre"
        f["ReceiverPosition"] = np.array([[0, .09, 0], [0, -.09, 0]])[:, :, None]
        f["ReceiverPosition"].attrs["Type"] = "cartesian"
        f["ReceiverPosition"].attrs["Units"] = "metre"
        f["ListenerPosition"] = [[0., 0., 0.]]
        f["ListenerView"] = [[1., 0., 0.]]
        f["ListenerUp"] = [[0., 0., 1.]]
        f["EmitterPosition"] = np.zeros((1, 3, 1))


class NumericalTests(unittest.TestCase):
    def test_sn3d_channel_order_and_degree_scaling(self):
        az, el = directions()
        x, y, z = np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)
        expected = np.column_stack((np.ones(len(az)), y, z, x,
                                    np.sqrt(3) * x * y, np.sqrt(3) * y * z,
                                    (3 * z * z - 1) / 2, np.sqrt(3) * x * z,
                                    np.sqrt(3) / 2 * (x * x - y * y)))
        basis = decoder._sn3d_basis(5, az, el)
        np.testing.assert_allclose(basis[:, :9], expected, atol=1e-14)
        for degree in range(6):
            np.testing.assert_allclose(np.sum(basis[:, degree**2:(degree+1)**2]**2,
                                              axis=1), 1, atol=1e-14)

    def test_ls_and_magls_preserve_known_ear_gains_and_timing(self):
        az, el = directions()
        ir, expected = known_ir(az, el)
        for method in ("ls", "magls"):
            for order in (1, 2, 5):
                with self.subTest(method=method, order=order):
                    filters, _, _ = decoder._fit_decoder(
                        ir, az, el, 48000, order, method, np.ones(len(az)))
                    target = np.zeros_like(filters)
                    delay = 4 if method == "magls" else 0
                    target[:, :4, delay:delay+expected.shape[-1]] = expected
                    np.testing.assert_allclose(filters, target, atol=1e-12)

    def test_weighted_regularized_fit_and_rank_guard(self):
        az, el = directions()
        ir, expected = known_ir(az, el)
        filters, _, _ = decoder._fit_decoder(
            ir, az, el, 48000, 1, "ls", np.linspace(.1, 2, len(az)))
        np.testing.assert_allclose(filters, expected, atol=1e-14)
        ridge, _, _ = decoder._fit_decoder(
            ir, az, el, 48000, 1, "ls", np.ones(len(az)), regularization=1)
        self.assertLess(np.linalg.norm(ridge), np.linalg.norm(expected))
        with self.assertRaisesRegex(ValueError, "rank"):
            decoder._fit_decoder(ir, az, np.zeros_like(el), 48000, 1, "ls",
                                 np.ones(len(az)), regularization=1)

    def test_duplicate_merging_and_hemisphere_guard(self):
        az, el = directions()
        ir, _ = known_ir(az, el)
        a, e, xyz, merged = decoder._unique_directions(
            np.tile(az, 2), np.tile(el, 2), np.concatenate((ir, ir)))
        np.testing.assert_allclose(known_ir(a, e)[0], merged)
        weights = decoder._direction_weights(xyz)
        self.assertTrue(np.all(weights > 0))
        with self.assertRaisesRegex(ValueError, "surround"):
            decoder._direction_weights(xyz[xyz[:, 2] > 0])


class CLITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.sofa = self.folder / "input.sofa"
        self.az, self.el = directions()
        self.ir, self.expected = known_ir(self.az, self.el)
        write_sofa(self.sofa, self.az, self.el, self.ir)
        self.out = self.folder / "output"

    def run_cli(self, *args, source=None, success=True):
        result = subprocess.run(
            [sys.executable, str(TOOLS / "sofa_to_foa.py"), "--input",
             str(source or self.sofa), "--out", str(self.out), *args],
            capture_output=True, text=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.out.exists(), "Failure must not export incomplete filters")
        return result

    def test_zip_magls_banks_and_packer(self):
        archive = self.folder / "input.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.write(self.sofa, "nested/input.sofa")
        self.run_cli("--distance", ".5", "--max-order", "2", source=archive)
        meta = json.loads((self.out / "decoder.json").read_text())
        self.assertEqual(meta["inputNormalization"], "SN3D")
        self.assertEqual(meta["addedCommonDelaySamples"], 4)
        self.assertEqual(len(meta["wavSha256"]), 2 * (4 + 9))
        for name, digest in meta["wavSha256"].items():
            path = self.out / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
            rate, values = packer.read_impulse(path)
            self.assertEqual(rate, 48000)
            self.assertEqual(len(values), meta["samplesPerFilter"])
        for ear, label in enumerate(("Left", "Right")):
            for channel in range(4):
                samples, _ = sf.read(self.out / "o1" / label.lower() / f"{label}_{channel+1:02d}.wav")
                np.testing.assert_allclose(samples[4:68], self.expected[ear, channel], atol=1e-8)
        result = subprocess.run([sys.executable, str(TOOLS / "pack-decoder.py"),
                                 str(self.out), str(self.folder / "decoder.bindec"),
                                 "--normalization", "SN3D", "--name", "Synthetic"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.folder / "decoder.json").read_text())["maxOrder"], 2)

    def test_ls_swapped_receivers_and_shell_listing(self):
        with h5py.File(self.sofa, "r+") as f:
            f["Data.IR"][...] = self.ir[:, ::-1]
            f["ReceiverPosition"][...] = f["ReceiverPosition"][...][::-1]
        self.assertIn("0.50000", self.run_cli("--list-distances").stdout)
        self.run_cli("--distance", ".5", "--method", "ls")
        samples, _ = sf.read(self.out / "o1/left/Left_02.wav")
        np.testing.assert_allclose(samples, self.expected[0, 1], atol=1e-8)

    def test_rejects_nonzero_delays_and_bad_conventions(self):
        with h5py.File(self.sofa, "r+") as f:
            f["Data.Delay"][0, 1] = 2
        self.assertIn("Nonzero Data.Delay", self.run_cli("--distance", ".5", success=False).stderr)
        with h5py.File(self.sofa, "r+") as f:
            f.attrs["SOFAConventions"] = "FreeFieldHRIR"
        self.assertIn("Unsupported SOFA convention", self.run_cli("--distance", ".5", success=False).stderr)

    def test_rejects_rotated_listener_variable_rates_and_nan(self):
        for name in ("ListenerView", "Data.SamplingRate", "Data.IR"):
            with self.subTest(variable=name):
                write_sofa(self.sofa, self.az, self.el, self.ir)
                with h5py.File(self.sofa, "r+") as f:
                    if name == "ListenerView":
                        f[name][...] = [[0., 1., 0.]]
                    elif name == "Data.SamplingRate":
                        del f[name]
                        f[name] = [48000., 44100.]
                    else:
                        f[name][0, 0, 0] = np.nan
                self.run_cli("--distance", ".5", success=False)

    def test_rejects_pcm_clipping_and_invalid_transition(self):
        with h5py.File(self.sofa, "r+") as f:
            f["Data.IR"][...] = self.ir * 10
        self.assertIn("clip", self.run_cli("--distance", ".5", "--method", "ls",
                                          "--subtype", "PCM_16", success=False).stderr)
        self.assertIn("transition", self.run_cli("--distance", ".5",
                                                 "--transition-frequency", "10", success=False).stderr)


if __name__ == "__main__":
    unittest.main()
