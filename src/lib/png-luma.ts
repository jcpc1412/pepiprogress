/**
 * Average image brightness, decoded in pure JS (photo-quality `light` signal).
 *
 * The quality score has had a `light` criterion since it was written, weighted
 * 0.3 and fully tested, but nothing ever measured brightness so it sat at
 * `unknown` forever and the score ran on tilt (plus framing, once a baseline
 * exists). Closing that is harder than it sounds: `expo-image-manipulator`
 * hands back files and base64, never pixels, and `expo-camera` exposes no
 * exposure reading on native. So the pixels have to come out of an encoded
 * image, and the only lossless format all three platforms encode is PNG.
 *
 * Hence a small inflate (RFC 1951) plus a PNG reader. It runs on a thumbnail of
 * a few hundred pixels, so speed is irrelevant and correctness is everything;
 * the inflate is round-tripped against node's zlib in the tests rather than
 * trusted by inspection.
 */

// ── inflate (RFC 1951) ───────────────────────────────────────────────────────
// The decode loop is the classic puff.c formulation: walk the canonical code
// lengths bit by bit instead of building a lookup table. Slower per symbol and
// far easier to verify, which is the right trade for a 16x16 thumbnail.

type Huffman = { counts: number[]; symbols: number[] };

function buildHuffman(lengths: number[]): Huffman {
  const counts = new Array(16).fill(0);
  for (const l of lengths) counts[l]++;
  counts[0] = 0;
  const offsets = new Array(16).fill(0);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
  const symbols = new Array(lengths.length).fill(0);
  for (let sym = 0; sym < lengths.length; sym++) {
    if (lengths[sym]) symbols[offsets[lengths[sym]]++] = sym;
  }
  return { counts, symbols };
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** Raw DEFLATE stream -> bytes. Throws on a malformed stream. */
export function inflateRaw(data: Uint8Array): Uint8Array {
  let pos = 0; // byte index
  let bitBuf = 0;
  let bitCount = 0;

  const bit = (): number => {
    if (bitCount === 0) {
      if (pos >= data.length) throw new Error('inflate: out of input');
      bitBuf = data[pos++];
      bitCount = 8;
    }
    const b = bitBuf & 1;
    bitBuf >>= 1;
    bitCount--;
    return b;
  };
  const bits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= bit() << i;
    return v;
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bit();
      const count = h.counts[len];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('inflate: bad code');
  };

  let out = new Uint8Array(1024);
  let outLen = 0;
  const push = (byte: number) => {
    if (outLen === out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[outLen++] = byte;
  };

  let fixedLit: Huffman | null = null;
  let fixedDist: Huffman | null = null;

  for (;;) {
    const final = bit();
    const type = bits(2);

    if (type === 0) {
      // Stored: discard the partial byte, then a length/complement pair.
      bitCount = 0;
      if (pos + 4 > data.length) throw new Error('inflate: truncated stored block');
      const len = data[pos] | (data[pos + 1] << 8);
      pos += 4;
      for (let i = 0; i < len; i++) push(data[pos++]);
    } else if (type === 1 || type === 2) {
      let lit: Huffman;
      let dist: Huffman;
      if (type === 1) {
        if (!fixedLit) {
          const litLengths = new Array(288);
          for (let i = 0; i < 288; i++) {
            litLengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
          }
          fixedLit = buildHuffman(litLengths);
          fixedDist = buildHuffman(new Array(30).fill(5));
        }
        lit = fixedLit;
        dist = fixedDist as Huffman;
      } else {
        const hlit = bits(5) + 257;
        const hdist = bits(5) + 1;
        const hclen = bits(4) + 4;
        const clenLengths = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clenLengths[CLEN_ORDER[i]] = bits(3);
        const clen = buildHuffman(clenLengths);

        const lengths: number[] = [];
        while (lengths.length < hlit + hdist) {
          const sym = decode(clen);
          if (sym < 16) {
            lengths.push(sym);
          } else if (sym === 16) {
            const prev = lengths[lengths.length - 1];
            if (prev === undefined) throw new Error('inflate: repeat with no previous length');
            const n = 3 + bits(2);
            for (let i = 0; i < n; i++) lengths.push(prev);
          } else if (sym === 17) {
            const n = 3 + bits(3);
            for (let i = 0; i < n; i++) lengths.push(0);
          } else {
            const n = 11 + bits(7);
            for (let i = 0; i < n; i++) lengths.push(0);
          }
        }
        lit = buildHuffman(lengths.slice(0, hlit));
        dist = buildHuffman(lengths.slice(hlit));
      }

      for (;;) {
        const sym = decode(lit);
        if (sym === 256) break;
        if (sym < 256) {
          push(sym);
          continue;
        }
        const li = sym - 257;
        if (li >= LENGTH_BASE.length) throw new Error('inflate: bad length symbol');
        const length = LENGTH_BASE[li] + bits(LENGTH_EXTRA[li]);
        const di = decode(dist);
        if (di >= DIST_BASE.length) throw new Error('inflate: bad distance symbol');
        const distance = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        if (distance > outLen) throw new Error('inflate: distance before start');
        for (let i = 0; i < length; i++) push(out[outLen - distance]);
      }
    } else {
      throw new Error('inflate: reserved block type');
    }

    if (final) break;
  }
  return out.slice(0, outLen);
}

/** zlib wrapper (RFC 1950) -> raw deflate. */
export function inflate(data: Uint8Array): Uint8Array {
  if (data.length < 2) throw new Error('inflate: too short');
  // CMF/FLG: low nibble of CMF must be 8 (deflate), and FDICT is unsupported.
  if ((data[0] & 0x0f) !== 8) throw new Error('inflate: not a deflate stream');
  if (data[1] & 0x20) throw new Error('inflate: preset dictionary unsupported');
  return inflateRaw(data.subarray(2));
}

// ── PNG ──────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel for the PNG colour types we accept. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Mean Rec.601 luma of an 8-bit PNG, 0..1.
 *
 * Deliberately narrow: 8-bit, non-interlaced, greyscale or truecolour with or
 * without alpha — exactly what a platform encoder produces for a resized photo.
 * Palette and 16-bit throw rather than being half-supported, because a silently
 * wrong brightness would feed the quality score a confident lie.
 */
export function pngAverageLuma(bytes: Uint8Array): number {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('png: bad signature');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];

  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const dataStart = p + 8;
    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      if (bytes[dataStart + 12] !== 0) throw new Error('png: interlaced unsupported');
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataStart + len));
    } else if (type === 'IEND') {
      break;
    }
    p = dataStart + len + 4; // skip data + CRC
  }

  if (bitDepth !== 8) throw new Error(`png: bit depth ${bitDepth} unsupported`);
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`png: colour type ${colorType} unsupported`);
  if (!width || !height || idat.length === 0) throw new Error('png: no image data');

  let total = 0;
  for (const chunk of idat) total += chunk.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of idat) {
    joined.set(chunk, at);
    at += chunk.length;
  }

  const raw = inflate(joined);
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error('png: truncated image data');

  // Unfilter in place, one scanline at a time, into a single contiguous buffer.
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[src + x];
      const left = x >= channels ? pixels[dst + x - channels] : 0;
      const above = y > 0 ? pixels[up + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[up + x - channels] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + above;
          break;
        case 3:
          value = rawByte + ((left + above) >> 1);
          break;
        case 4:
          value = rawByte + paeth(left, above, upLeft);
          break;
        default:
          throw new Error(`png: bad filter ${filter}`);
      }
      pixels[dst + x] = value & 0xff;
    }
  }

  // Rec.601 luma. Alpha is ignored: a progress photo is opaque, and weighting by
  // it would let a transparent corner drag the exposure reading around.
  const grey = channels <= 2;
  let sum = 0;
  const count = width * height;
  for (let i = 0; i < count; i++) {
    const o = i * channels;
    sum += grey
      ? pixels[o]
      : 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
  }
  return sum / count / 255;
}

/** base64 -> bytes, without depending on Buffer or atob being present. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let outPos = 0;
  let buffer = 0;
  let bitsIn = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i]);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bitsIn += 6;
    if (bitsIn >= 8) {
      bitsIn -= 8;
      out[outPos++] = (buffer >> bitsIn) & 0xff;
    }
  }
  return out.subarray(0, outPos);
}
