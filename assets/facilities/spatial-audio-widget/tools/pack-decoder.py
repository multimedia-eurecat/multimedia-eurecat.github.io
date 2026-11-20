#!/usr/bin/env python3
"""Package ACN-ordered, mono float WAV filters for the bundled CatArt engine."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct


def read_impulse(path):
    data = path.read_bytes()
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise ValueError(f'{path}: expected a RIFF/WAVE file')
    position = 12
    fmt = samples = None
    while position + 8 <= len(data):
        kind, length = struct.unpack_from('<4sI', data, position)
        chunk = data[position + 8:position + 8 + length]
        if len(chunk) != length:
            raise ValueError(f'{path}: truncated WAV chunk')
        if kind == b'fmt ':
            fmt = struct.unpack_from('<HHIIHH', chunk)
        elif kind == b'data':
            samples = chunk
        position += 8 + length + (length % 2)
    if not fmt or samples is None or fmt[0] != 3 or fmt[1] != 1 or fmt[5] != 32:
        raise ValueError(f'{path}: expected a mono, 32-bit IEEE float WAV')
    values = list(struct.unpack(f'<{len(samples) // 4}f', samples))
    if not values or not all(math.isfinite(value) for value in values):
        raise ValueError(f'{path}: empty or non-finite impulse')
    return fmt[2], values


def ubjson(value):
    """Use the same unoptimized UBJSON representation as default.bindec."""
    if isinstance(value, str):
        text = value.encode('utf-8')
        return b'S' + ubjson(len(text)) + text
    if isinstance(value, int):
        return b'l' + struct.pack('>i', value)
    if isinstance(value, float):
        return b'D' + struct.pack('>d', value)
    if isinstance(value, list):
        return b'[' + b''.join(ubjson(item) for item in value) + b']'
    if isinstance(value, dict):
        return b'{' + b''.join(ubjson(len(key.encode())) + key.encode() + ubjson(item) for key, item in value.items()) + b'}'
    raise TypeError(type(value))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--normalization', choices=['SN3D', 'N3D'], required=True)
    parser.add_argument('--name', default='AACHEN MRT40')
    args = parser.parse_args()
    orders = sorted(int(folder.name[1:]) for folder in args.source.glob('o[1-9]*') if folder.is_dir())
    if orders != list(range(1, max(orders, default=0) + 1)) or not orders:
        raise ValueError('Expected complete, consecutive order folders starting at o1')
    decoder = {'formatVersion': '0.0.1', 'maxOrder': max(orders), 'name': args.name,
               'metaInfo': f'ACN/{args.normalization}; one-based WAV filenames map to zero-based ACN channels.'}
    source_hashes = {}
    formats = set()
    for output_channel, ear in enumerate(['left', 'right']):
        banks = []
        for order in orders:
            folder = args.source / f'o{order}' / ear
            expected = [folder / f'{ear.capitalize()}_{channel + 1:02d}.wav' for channel in range((order + 1) ** 2)]
            if set(folder.glob('*.wav')) != set(expected):
                raise ValueError(f'{folder}: missing or unexpected filter channels')
            bank = []
            for channel, filename in enumerate(expected):
                rate, impulse = read_impulse(filename)
                formats.add((rate, len(impulse)))
                # The native encoder uses ACN/SN3D. Adapt N3D decoder kernels
                # by applying the input-channel scaling to their FIR taps.
                degree = math.isqrt(channel)
                factor = math.sqrt(2 * degree + 1) if args.normalization == 'N3D' else 1
                bank.append({'delay': 0.0, 'filter': [value * factor for value in impulse],
                             'gain': 1.0, 'length': len(impulse), 'samplerate': float(rate)})
                source_hashes[str(filename.relative_to(args.source))] = hashlib.sha256(filename.read_bytes()).hexdigest()
            banks.append(bank)
        decoder[f'{ear}Speaker'] = {'filters': banks, 'metaInfo': f'{args.name}, {ear} ear', 'outChannel': output_channel}
    if len(formats) != 1:
        raise ValueError('All filters must have the same sample rate and length')
    payload = ubjson(decoder)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    rate, length = formats.pop()
    metadata = {'name': args.name, 'maxOrder': max(orders), 'orders': orders,
                'channelsPerEar': (max(orders) + 1) ** 2, 'sampleRate': rate,
                'samplesPerFilter': length, 'channelOrdering': 'ACN',
                'sourceNormalization': args.normalization, 'engineNormalization': 'SN3D',
                'normalizationAssumed': True, 'binarySha256': hashlib.sha256(payload).hexdigest(),
                'sourceWavSha256': source_hashes}
    args.output.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'{args.name}: orders {orders}, {(max(orders) + 1) ** 2} channels per ear, '
          f'{rate} Hz, {length} samples/filter, {len(payload):,} bytes')


if __name__ == '__main__':
    main()
