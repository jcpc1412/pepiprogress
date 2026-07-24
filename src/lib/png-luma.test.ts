import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { base64ToBytes, inflate, inflateRaw, pngAverageLuma } from '@/lib/png-luma';

// ── PNG construction helpers ────────────────────────────────────────────────
// Real PNGs, built with node's zlib so the tests exercise a genuine deflate
// stream rather than a hand-rolled one. CRCs are left zero: the decoder does not
// verify them, and inventing a CRC implementation here would test nothing.

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Build a PNG from raw pixel rows, encoding every scanline with `filter`.
 * Lets the tests drive all five filter types, which no fixture set would.
 */
function makePng(
  width: number,
  height: number,
  channels: number,
  pixels: number[],
  filter = 0,
): Uint8Array {
  const colorType = channels === 1 ? 0 : channels === 2 ? 4 : channels === 3 ? 2 : 6;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;

  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const cur = pixels[y * stride + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const encoded =
        filter === 0
          ? cur
          : filter === 1
            ? cur - left
            : filter === 2
              ? cur - above
              : filter === 3
                ? cur - ((left + above) >> 1)
                : cur - paeth(left, above, upLeft);
      raw[y * (stride + 1) + 1 + x] = encoded & 0xff;
    }
  }
  const idat = new Uint8Array(zlib.deflateSync(Buffer.from(raw)));
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

const solid = (w: number, h: number, channels: number, value: number[]) =>
  Array.from({ length: w * h * channels }, (_, i) => value[i % channels]);

describe('inflate', () => {
  it('round-trips random data against zlib', () => {
    const original = new Uint8Array(4096);
    // Deterministic pseudo-random: incompressible enough to exercise dynamic
    // Huffman, reproducible enough to debug a failure.
    let seed = 12345;
    for (let i = 0; i < original.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 0xff;
    }
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(original)));
    expect(Array.from(inflate(deflated))).toEqual(Array.from(original));
  });

  it('round-trips highly repetitive data (exercises back-references)', () => {
    const original = new TextEncoder().encode('progress photo '.repeat(500));
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(original)));
    expect(new TextDecoder().decode(inflate(deflated))).toBe(
      new TextDecoder().decode(original),
    );
  });

  it('handles stored (uncompressed) blocks', () => {
    const original = new TextEncoder().encode('stored block payload');
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(original), { level: 0 }));
    expect(new TextDecoder().decode(inflate(deflated))).toBe('stored block payload');
  });

  it('handles fixed-Huffman blocks', () => {
    const original = new TextEncoder().encode('abc');
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(original), { strategy: zlib.constants.Z_FIXED }));
    expect(new TextDecoder().decode(inflate(deflated))).toBe('abc');
  });

  it('round-trips an empty payload', () => {
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(new Uint8Array(0))));
    expect(inflate(deflated).length).toBe(0);
  });

  it('handles a multi-block stream', () => {
    const original = new Uint8Array(200_000).fill(7);
    const deflated = new Uint8Array(zlib.deflateSync(Buffer.from(original)));
    const out = inflate(deflated);
    expect(out.length).toBe(original.length);
    expect(out[0]).toBe(7);
    expect(out[out.length - 1]).toBe(7);
  });

  it('rejects a non-deflate stream rather than returning garbage', () => {
    expect(() => inflate(new Uint8Array([0x00, 0x00, 0x00]))).toThrow();
  });

  it('exposes the raw (headerless) stream too', () => {
    const original = new TextEncoder().encode('raw deflate');
    const raw = new Uint8Array(zlib.deflateRawSync(Buffer.from(original)));
    expect(new TextDecoder().decode(inflateRaw(raw))).toBe('raw deflate');
  });
});

describe('pngAverageLuma', () => {
  it('reads solid black as 0 and solid white as 1', () => {
    expect(pngAverageLuma(makePng(4, 4, 3, solid(4, 4, 3, [0, 0, 0])))).toBeCloseTo(0, 5);
    expect(pngAverageLuma(makePng(4, 4, 3, solid(4, 4, 3, [255, 255, 255])))).toBeCloseTo(1, 5);
  });

  it('reads mid grey as ~0.5', () => {
    expect(pngAverageLuma(makePng(8, 8, 3, solid(8, 8, 3, [128, 128, 128])))).toBeCloseTo(0.502, 2);
  });

  it('weights channels by Rec.601 rather than averaging them', () => {
    // Pure green is far brighter to the eye than pure blue; a naive mean would
    // score both at 1/3.
    const green = pngAverageLuma(makePng(2, 2, 3, solid(2, 2, 3, [0, 255, 0])));
    const blue = pngAverageLuma(makePng(2, 2, 3, solid(2, 2, 3, [0, 0, 255])));
    expect(green).toBeCloseTo(0.587, 2);
    expect(blue).toBeCloseTo(0.114, 2);
  });

  it('averages a mixed image', () => {
    // Half black, half white.
    const pixels = [...solid(2, 1, 3, [0, 0, 0]), ...solid(2, 1, 3, [255, 255, 255])];
    expect(pngAverageLuma(makePng(2, 2, 3, pixels))).toBeCloseTo(0.5, 2);
  });

  it('supports greyscale, RGB and RGBA', () => {
    expect(pngAverageLuma(makePng(2, 2, 1, solid(2, 2, 1, [255])))).toBeCloseTo(1, 5);
    expect(pngAverageLuma(makePng(2, 2, 4, solid(2, 2, 4, [255, 255, 255, 255])))).toBeCloseTo(1, 5);
  });

  it('ignores alpha, so a transparent corner cannot skew exposure', () => {
    const opaque = solid(2, 2, 4, [200, 200, 200, 255]);
    const transparent = solid(2, 2, 4, [200, 200, 200, 0]);
    expect(pngAverageLuma(makePng(2, 2, 4, transparent))).toBeCloseTo(
      pngAverageLuma(makePng(2, 2, 4, opaque)),
      5,
    );
  });

  it.each([0, 1, 2, 3, 4])('reconstructs correctly through filter type %i', (filter) => {
    // A gradient, so every filter predictor actually does work; a solid colour
    // would pass even with a broken unfilter.
    const w = 6;
    const h = 5;
    const pixels: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) pixels.push((x * 17 + y * 43) % 256, (x * 5) % 256, (y * 31) % 256);
    }
    const expected =
      pixels.reduce((sum, _, i) => {
        if (i % 3 !== 0) return sum;
        return sum + 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }, 0) /
      (w * h) /
      255;
    expect(pngAverageLuma(makePng(w, h, 3, pixels, filter))).toBeCloseTo(expected, 5);
  });

  it('rejects rather than guesses on an unsupported PNG', () => {
    const png = makePng(2, 2, 3, solid(2, 2, 3, [0, 0, 0]));
    png[8 + 8 + 9] = 3; // colour type 3 = palette
    expect(() => pngAverageLuma(png)).toThrow(/colour type/);
  });

  it('rejects a non-PNG', () => {
    expect(() => pngAverageLuma(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/signature/);
  });
});

describe('base64ToBytes', () => {
  it('decodes without relying on Buffer or atob', () => {
    const original = new Uint8Array([0, 1, 127, 128, 254, 255, 42]);
    const b64 = Buffer.from(original).toString('base64');
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(original));
  });

  it('handles every padding length', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd']) {
      const b64 = Buffer.from(text).toString('base64');
      expect(new TextDecoder().decode(base64ToBytes(b64))).toBe(text);
    }
  });

  it('survives whitespace and newlines in the input', () => {
    const b64 = Buffer.from('hello world').toString('base64');
    const withNoise = b64.slice(0, 4) + '\n  ' + b64.slice(4);
    expect(new TextDecoder().decode(base64ToBytes(withNoise))).toBe('hello world');
  });
});
