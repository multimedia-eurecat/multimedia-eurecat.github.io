// Real WASM checks for the generated KU100 packages, through the current worklet.
// node --experimental-vm-modules tests/ku100-decoders.test.mjs [report.json]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLAYBACK_DISTANCES } from '../distance-model.js';

const decoderRoot = fileURLToPath(new URL('../decoders/ku100/', import.meta.url));
const workletPath = fileURLToPath(new URL('../binaural-worklet.js', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(decoderRoot, 'manifest.json'), 'utf8'));
const allDistanceDecoders = [];
for (const entry of manifest.distances) {
  const bytes = await readFile(path.join(decoderRoot, entry.decoder));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.binarySha256);
  allDistanceDecoders.push({
    distance: entry.distanceMetres,
    decoder: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
}

assert.deepEqual(PLAYBACK_DISTANCES, [.5, 1.5, 3.25], 'Listening test uses closest/farthest near-field and far-field recordings');
const activeIndices = manifest.distances.flatMap((entry, index) => PLAYBACK_DISTANCES.includes(entry.distanceMetres) ? [index] : []);
const distanceDecoders = activeIndices.map((index) => allDistanceDecoders[index]);
assert.equal(distanceDecoders.length, PLAYBACK_DISTANCES.length);

async function loadProcessor(sampleRate) {
  let Processor;
  const context = vm.createContext({
    console, WebAssembly, TextDecoder, TextEncoder, sampleRate,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { messages: [], postMessage(message) { this.messages.push(message); } };
      }
    },
    registerProcessor(name, candidate) { Processor = candidate; },
  });
  async function loadModule(filename) {
    const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), {
      context, identifier: filename,
      initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
    });
    await module.link((specifier, importer) => loadModule(path.resolve(path.dirname(importer.identifier), specifier)));
    return module;
  }
  const module = await loadModule(workletPath);
  await module.evaluate();
  return Processor;
}

function render(processor, xyz) {
  const parameters = Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, new Float32Array([xyz[i]])]));
  const input = new Float32Array(128);
  const output = [new Float32Array(128), new Float32Array(128)];
  for (let block = 0; block < 400; block++) {
    assert.equal(processor.process([[input]], [output], parameters), true);
  }
  const response = [new Float64Array(4096), new Float64Array(4096)];
  input[0] = 1;
  for (let block = 0; block < 32; block++) {
    assert.equal(processor.process([[input]], [output], parameters), true);
    for (let ear = 0; ear < 2; ear++) response[ear].set(output[ear], block * 128);
    input.fill(0);
  }
  const energyPerEar = response.map((ear) => ear.reduce((sum, x) => {
    assert.ok(Number.isFinite(x));
    return sum + x * x;
  }, 0));
  assert.ok(energyPerEar.every((energy) => energy > 1e-8));
  return { response, energyPerEar };
}

function interauralDelaySamples(response, sampleRate) {
  // Phase slope below the fifth-order 3 kHz MagLS transition. High-frequency
  // MagLS phase is intentionally optimized, so broadband peak timing is not
  // a reliable check of low-frequency ITD.
  const frequencies = Array.from({ length: 8 }, (_, i) => (i + 1) * 187.5);
  const phase = [];
  for (const frequency of frequencies) {
    const angles = response.map((ear) => {
      let real = 0, imaginary = 0;
      for (let n = 0; n < ear.length; n++) {
        const angle = 2 * Math.PI * frequency * n / sampleRate;
        real += ear[n] * Math.cos(angle);
        imaginary -= ear[n] * Math.sin(angle);
      }
      return Math.atan2(imaginary, real);
    });
    let difference = angles[0] - angles[1];
    const previous = phase.at(-1) ?? 0;
    while (difference - previous > Math.PI) difference -= 2 * Math.PI;
    while (difference - previous < -Math.PI) difference += 2 * Math.PI;
    phase.push(difference);
  }
  const meanF = frequencies.reduce((a, b) => a + b) / frequencies.length;
  const meanP = phase.reduce((a, b) => a + b) / phase.length;
  const slope = frequencies.reduce((sum, f, i) => sum + (f - meanF) * (phase[i] - meanP), 0)
    / frequencies.reduce((sum, f) => sum + (f - meanF) ** 2, 0);
  return slope * sampleRate / (2 * Math.PI);
}

function assertResponse(actual, expected, description) {
  let maxError = 0;
  for (let ear = 0; ear < 2; ear++) {
    for (let sample = 0; sample < actual[ear].length; sample++) {
      maxError = Math.max(maxError, Math.abs(actual[ear][sample] - expected[ear][sample]));
    }
  }
  assert.ok(maxError < 2e-6, `${description}: maximum sample error ${maxError}`);
}

const report = { method: 'Actual CatArt WASM through fixed decoders and the selected distance decoders', activeDistances: PLAYBACK_DISTANCES, checks: [], crossfadeChecks: [] };
for (const sampleRate of [44100, 48000]) {
  const Processor = await loadProcessor(sampleRate);
  const references = [];
  for (const entry of manifest.distances) {
    const bytes = await readFile(path.join(decoderRoot, entry.decoder));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.binarySha256);
    const decoder = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const processor = new Processor({ processorOptions: { decoder } });
    assert.equal(processor.port.messages[0]?.type, 'ready');
    assert.equal(processor.port.messages[0].decoderBytes, bytes.length);
    const directions = {};
    const responses = {};
    for (const [name, xyz] of Object.entries({
      left: [0, 1, 0], right: [0, -1, 0], front: [1, 0, 0],
      back: [-1, 0, 0], up: [0, 0, 1], down: [0, 0, -1],
    })) {
      const rendered = render(processor, xyz);
      responses[name] = rendered.response;
      directions[name] = {
        energyPerEar: rendered.energyPerEar,
        rightMinusLeftDelaySamples: interauralDelaySamples(rendered.response, sampleRate),
      };
    }
    assert.ok(directions.left.energyPerEar[0] > 5 * directions.left.energyPerEar[1], '+Y must favor the left ear');
    assert.ok(directions.right.energyPerEar[1] > 5 * directions.right.energyPerEar[0], '-Y must favor the right ear');
    assert.ok(directions.left.rightMinusLeftDelaySamples > 5, 'Low-frequency left-ear arrival must precede right');
    assert.ok(directions.right.rightMinusLeftDelaySamples < -5, 'Low-frequency right-ear arrival must precede left');
    assert.ok(Math.abs(directions.front.energyPerEar[0] - directions.back.energyPerEar[0]) > 1e-4);
    assert.ok(Math.abs(directions.up.energyPerEar[0] - directions.down.energyPerEar[0]) > 1e-4);
    assert.equal(processor.port.messages.some((m) => m.type === 'error'), false);
    processor.port.onmessage({ data: { type: 'dispose' } });
    references.push(responses);
    report.checks.push({ decoder: entry.decoder, sampleRate, directions });
    console.log(`PASS ${entry.decoder}, ${sampleRate} Hz: loading, checksum, finite audio, ear direction, low-frequency ITD, front/back, elevation.`);
  }
  const processor = new Processor({ processorOptions: { distanceDecoders } });
  assert.equal(processor.port.messages[0]?.type, 'ready');
  assert.equal(processor.port.messages[0].decoderBytes, distanceDecoders.reduce((sum, entry) => sum + entry.decoder.byteLength, 0));
  assert.equal(processor._banks.length, PLAYBACK_DISTANCES.length, 'Only the selected native decoder scenes run');
  for (let i = 0; i < distanceDecoders.length; i++) {
    const distance = distanceDecoders[i].distance;
    assertResponse(render(processor, [distance, 0, 0]).response, references[activeIndices[i]].front, `Exact ${distance} m endpoint`);
    assertResponse(render(processor, [0, distance, 0]).response, references[activeIndices[i]].left, `Left at ${distance} m`);
    if (i < distanceDecoders.length - 1) {
      const midpoint = (distance + distanceDecoders[i + 1].distance) / 2;
      const expected = references[activeIndices[i]].front.map((ear, e) => ear.map((value, n) => (value + references[activeIndices[i + 1]].front[e][n]) / 2));
      assertResponse(render(processor, [midpoint, 0, 0]).response, expected, `50/50 blend at ${midpoint} m`);
    }
  }
  assertResponse(render(processor, [7, 0, 0]).response, references[activeIndices.at(-1)].front, 'Hold farthest recording beyond 3.25 m');
  assertResponse(render(processor, [.01, 0, 0]).response, references[activeIndices[0]].front, 'Hold nearest recording below 0.5 m without gain boost');
  render(processor, [0, 1, 0]);
  assertResponse(render(processor, [0, 0, 0]).response, references[activeIndices[0]].left, 'At origin retain direction and use nearest recording');

  const input = new Float32Array(128).fill(.05);
  const output = [new Float32Array(128), new Float32Array(128)];
  const processingTimes = [];
  const started = performance.now();
  for (let block = 0; block < 500; block++) {
    const parameters = { x: new Float32Array([block % 2 ? .5 : 3.25]), y: new Float32Array([0]), z: new Float32Array([0]) };
    const processingStart = performance.now();
    const processed = processor.process([[input]], [output], parameters);
    processingTimes.push(performance.now() - processingStart);
    assert.equal(processed, true);
    let weightSum = 0;
    for (const weight of processor._weights) {
      assert.ok(weight >= 0 && weight <= 1);
      weightSum += weight;
    }
    assert.ok(Math.abs(weightSum - 1) < 1e-12, 'Smoothed weights retain unity sum');
    for (const ear of output) assert.ok(ear.every(Number.isFinite));
    // A jump across the full range must ramp its weight over many samples.
    for (let bank = 0; bank < distanceDecoders.length; bank++) {
      const frames = processor._weightFrames;
      for (let n = 1; n < 128; n++) {
        assert.ok(Math.abs(frames[bank * 128 + n] - frames[bank * 128 + n - 1]) < .002);
      }
    }
  }
  const averageBlockMs = (performance.now() - started) / 500;
  const oldBuffer = processor._module.HEAPF32.buffer;
  const allocation = processor._module._malloc(oldBuffer.byteLength);
  assert.notEqual(processor._module.HEAPF32.buffer, oldBuffer);
  const parameters = { x: new Float32Array([1]), y: new Float32Array([0]), z: new Float32Array([0]) };
  for (let block = 0; block < 100; block++) assert.equal(processor.process([], [output], parameters), true);
  assert.ok(output.every((ear) => ear.every((value) => value === 0)), 'All banks drain to silence without input');
  assert.equal(processor._heapBuffer, processor._module.HEAPF32.buffer);
  processor._module._free(allocation);
  processor.port.onmessage({ data: { type: 'dispose' } });
  assert.equal(processor._module, null);
  assert.equal(processor._banks.length, 0);
  assert.equal(processor.process([], [output], parameters), false);
  for (const invalid of [[], [distanceDecoders[1], distanceDecoders[0]], [{ distance: 0, decoder: distanceDecoders[0].decoder }]]) {
    const invalidProcessor = new Processor({ processorOptions: { distanceDecoders: invalid } });
    assert.equal(invalidProcessor.port.messages[0]?.type, 'error');
    assert.equal(invalidProcessor._module, undefined);
  }
  processingTimes.sort((a, b) => a - b);
  const processingP95Ms = processingTimes[Math.floor(processingTimes.length * .95)];
  const blockBudgetMs = 128 / sampleRate * 1000;
  report.crossfadeChecks.push({ sampleRate, activeDistances: PLAYBACK_DISTANCES, endpoints: distanceDecoders.length, midpoints: distanceDecoders.length - 1,
    averageBlockMs, processingP95Ms, blockBudgetMs,
    blocksOverBudget: processingTimes.filter((ms) => ms > blockBudgetMs).length });
  console.log(`PASS ${distanceDecoders.length} distance decoders, ${sampleRate} Hz: exact endpoints, midpoint mixes, range clamping, origin, smooth jumps, unity weights, heap growth, silence, disposal; ${averageBlockMs.toFixed(3)} ms/block, processing p95 ${processingP95Ms.toFixed(3)} ms (budget ${blockBudgetMs.toFixed(3)} ms).`);
}
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
