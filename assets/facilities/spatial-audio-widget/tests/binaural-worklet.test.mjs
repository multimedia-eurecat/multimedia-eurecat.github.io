// Run from any directory with:
// node --experimental-vm-modules spatial-audio-widget/tests/binaural-worklet.test.mjs
// The VM models AudioWorkletGlobalScope while running the real bundled WASM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workletPath = fileURLToPath(new URL('../binaural-worklet.js', import.meta.url));
const decoderBytes = await readFile(new URL('../decoders/aachen-mrt40.bindec', import.meta.url));
const decoder = decoderBytes.buffer.slice(decoderBytes.byteOffset, decoderBytes.byteOffset + decoderBytes.byteLength);

async function loadProcessor(sampleRate) {
  const registered = new Map();
  const context = vm.createContext({
    console, WebAssembly, TextDecoder, TextEncoder, sampleRate,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { messages: [], postMessage(message) { this.messages.push(message); } };
      }
    },
    registerProcessor(name, Processor) { registered.set(name, Processor); },
  });
  async function loadModule(filename) {
    const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), {
      context,
      identifier: filename,
      initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
    });
    await module.link((specifier, importer) => loadModule(path.resolve(path.dirname(importer.identifier), specifier)));
    return module;
  }
  const module = await loadModule(workletPath);
  await module.evaluate();
  const Processor = registered.get('moebius-binaural-processor');
  assert.ok(Processor, 'Worklet registered under the public processor name.');
  return Processor;
}

function params(x, y, z) {
  return {
    x: new Float32Array([x]), y: new Float32Array([y]), z: new Float32Array([z]),
  };
}

function renderImpulse(processor, parameters) {
  const input = new Float32Array(128);
  const output = [new Float32Array(128), new Float32Array(128)];
  // The engine interpolates directional coefficients. Settle the target before
  // measuring an impulse so startup interpolation cannot hide a panning defect.
  for (let block = 0; block < 400; block++) {
    assert.equal(processor.process([[input]], [output], parameters), true);
  }
  input[0] = 1;
  const energy = [0, 0];
  const peakFrame = [-1, -1];
  const peaks = [0, 0];
  for (let block = 0; block < 80; block++) {
    assert.equal(processor.process([[input]], [output], parameters), true);
    for (let channel = 0; channel < 2; channel++) {
      for (let frame = 0; frame < 128; frame++) {
        const value = output[channel][frame];
        assert.ok(Number.isFinite(value), 'Stereo samples must remain finite.');
        energy[channel] += value * value;
        if (Math.abs(value) > peaks[channel]) {
          peaks[channel] = Math.abs(value);
          peakFrame[channel] = block * 128 + frame;
        }
      }
    }
    input.fill(0);
  }
  assert.ok(energy[0] > 1e-8 && energy[1] > 1e-8, 'Both ears receive rendered audio.');
  return { energy, peakFrame };
}

for (const rate of [44100, 48000]) {
  const Processor = await loadProcessor(rate);
  for (const bank of ['bundled', 'AACHEN MRT40']) {
    const processor = new Processor(bank === 'bundled' ? {} : { processorOptions: { decoder } });
    assert.equal(processor.port.messages[0]?.type, 'ready');
    assert.equal(processor.port.messages[0].decoderBytes, bank === 'bundled' ? 0 : decoder.byteLength, 'The requested decoder was installed.');
    const left = renderImpulse(processor, params(0, 1, 0));
    const right = renderImpulse(processor, params(0, -1, 0));
    assert.ok(left.energy[0] > left.energy[1] * 5, '+y places the source on the listener’s left.');
    assert.ok(right.energy[1] > right.energy[0] * 5, '-y places the source on the listener’s right.');
    assert.ok(left.peakFrame[0] < left.peakFrame[1], 'A left source reaches the left ear first.');
    assert.ok(right.peakFrame[1] < right.peakFrame[0], 'A right source reaches the right ear first.');

    const front = renderImpulse(processor, params(1, 0, 0));
    const back = renderImpulse(processor, params(-1, 0, 0));
    const above = renderImpulse(processor, params(0, 0, 1));
    const below = renderImpulse(processor, params(0, 0, -1));
    assert.ok(Math.abs(front.energy[0] - back.energy[0]) > 1e-4, 'Front and back use different filters.');
    assert.ok(Math.abs(above.energy[0] - below.energy[0]) > 1e-4, 'Elevation changes the rendered filters.');
    const further = renderImpulse(processor, params(4, 0, 0));
    assert.ok(Math.abs(front.energy[0] - further.energy[0]) < 1e-5, 'Native rendering does not add a second distance attenuation curve.');
    assert.equal(processor._position.x, 2, 'The native directional renderer stays on the reference sphere.');
    renderImpulse(processor, params(0, 0, 0));
    assert.equal(processor._position.x, 2, 'The origin retains the last valid direction.');
    renderImpulse(processor, params(5, 5, 5));
    renderImpulse(processor, params(0, 7, 0));

    const output = [new Float32Array(128), new Float32Array(128)];
    const parameters = params(1, 0, 0);
    for (let block = 0; block < 800; block++) {
      assert.equal(processor.process([], [output], parameters), true);
    }
    assert.ok(output.every((channel) => channel.every((value) => value === 0)), 'Missing input feeds silence rather than stale samples.');

    if (rate === 44100) {
      const module = processor._module;
      const oldBuffer = module.HEAPF32.buffer;
      const allocation = module._malloc(oldBuffer.byteLength);
      assert.ok(allocation);
      assert.notEqual(module.HEAPF32.buffer, oldBuffer, 'Test forces actual WASM heap growth.');
      assert.equal(processor.process([], [output], parameters), true);
      assert.equal(processor._heapBuffer, module.HEAPF32.buffer);
      module._free(allocation);
    }

    assert.equal(processor.port.messages.some((message) => message.type === 'error'), false);
    processor.port.onmessage({ data: { type: 'dispose' } });
    assert.equal(processor.process([], [output], parameters), false);
    assert.equal(processor._module, null);

    const invalidOutput = new Processor();
    assert.equal(invalidOutput.process([], [[new Float32Array(64), new Float32Array(64)]], parameters), false);
    assert.equal(invalidOutput.port.messages.at(-1).type, 'error');
    assert.match(invalidOutput.port.messages.at(-1).message, /128-frame/);
    assert.equal(invalidOutput._module, null);
    console.log(`PASS ${bank}, ${rate} Hz: direction, ear timing, elevation, origin, bounds, missing input, disposal, block guard${rate === 44100 ? ', heap growth' : ''}.`);
  }
}
