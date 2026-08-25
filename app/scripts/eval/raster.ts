import zlib from 'node:zlib';

// Bitmap rendering for the extraction eval corpus (ADR-018). A "scan" must have NO text
// layer, otherwise the eval would silently measure rung 2 while claiming to measure rung
// 3–4. So pages are drawn glyph by glyph into a grayscale raster, degraded, and embedded
// as an image. Everything here is deterministic (seeded PRNG) — no wall clock, no entropy.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 5x7 glyphs, MSB = leftmost column. Unknown characters render as a space.
const G: Record<string, string> = {
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110',
  C: '01110,10001,10000,10000,10000,10001,01110', D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001',
  I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100',
  K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,11001,10101,10011,10001,10001,10001',
  O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100',
  W: '10001,10001,10001,10101,10101,11011,10001', X: '10001,01010,00100,00100,00100,01010,10001',
  Y: '10001,01010,00100,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
  '0': '01110,10001,10011,10101,11001,10001,01110', '1': '00100,01100,00100,00100,00100,00100,01110',
  '2': '01110,10001,00001,00010,00100,01000,11111', '3': '11111,00010,00100,00010,00001,10001,01110',
  '4': '00010,00110,01010,10010,11111,00010,00010', '5': '11111,10000,11110,00001,00001,10001,01110',
  '6': '00110,01000,10000,11110,10001,10001,01110', '7': '11111,00001,00010,00100,01000,01000,01000',
  '8': '01110,10001,10001,01110,10001,10001,01110', '9': '01110,10001,10001,01111,00001,00010,01100',
  '.': '00000,00000,00000,00000,00000,01100,01100', ',': '00000,00000,00000,00000,01100,01100,01000',
  ':': '00000,01100,01100,00000,01100,01100,00000', '/': '00001,00010,00010,00100,01000,01000,10000',
  '-': '00000,00000,00000,11111,00000,00000,00000', '(': '00010,00100,01000,01000,01000,00100,00010',
  ')': '01000,00100,00010,00010,00010,00100,01000', '%': '11001,11010,00010,00100,01000,01011,10011',
  '#': '01010,11111,01010,01010,11111,01010,00000', '+': '00000,00100,00100,11111,00100,00100,00000',
  "'": '00100,00100,00000,00000,00000,00000,00000', '*': '00000,10101,01110,11111,01110,10101,00000',
  '=': '00000,00000,11111,00000,11111,00000,00000', '_': '00000,00000,00000,00000,00000,00000,11111',
};

export class Bitmap {
  data: Uint8Array;
  constructor(readonly w: number, readonly h: number, fill = 255) {
    this.data = new Uint8Array(w * h).fill(fill);
  }
  set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (v < this.data[i]) this.data[i] = v; // ink darkens, never lightens
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 255;
    return this.data[y * this.w + x];
  }
}

export interface TextStyle {
  scale?: number;
  ink?: number;
  /** Per-glyph baseline/spacing wobble + slant: a stylised stand-in for handwriting. */
  hand?: boolean;
  bold?: boolean;
  rnd?: () => number;
}

/** Draws uppercase text; returns the x cursor after the last glyph. */
export function drawText(bm: Bitmap, x0: number, y0: number, text: string, st: TextStyle = {}): number {
  const s = st.scale ?? 2;
  const ink = st.ink ?? 25;
  const rnd = st.rnd ?? (() => 0.5);
  let x = x0;
  for (const ch of text.toUpperCase()) {
    const rows = (G[ch] ?? '').split(',');
    const dy = st.hand ? Math.round((rnd() - 0.5) * 2 * s) : 0;
    const slant = st.hand ? (rnd() - 0.5) * 0.35 : 0;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] !== '1') continue;
        const sx = x + Math.round(c * s + slant * (6 - r) * s);
        const sy = y0 + r * s + dy;
        for (let py = 0; py < s; py++) {
          for (let px = 0; px < s; px++) {
            bm.set(sx + px, sy + py, ink);
            if (st.bold) bm.set(sx + px + 1, sy + py, ink);
          }
        }
      }
    }
    x += 6 * s + (st.hand ? Math.round((rnd() - 0.5) * s) : 0);
  }
  return x;
}

export function line(bm: Bitmap, x0: number, y: number, x1: number, ink = 120) {
  for (let x = x0; x <= x1; x++) bm.set(x, y, ink);
}

/** Nearest-neighbour rotation about the centre — the "page was fed in crooked" case. */
export function rotate(bm: Bitmap, degrees: number): Bitmap {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = bm.w / 2, cy = bm.h / 2;
  const out = new Bitmap(bm.w, bm.h);
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      out.data[y * bm.w + x] = bm.get(sx, sy);
    }
  }
  return out;
}

export function noise(bm: Bitmap, amount: number, rnd: () => number): Bitmap {
  for (let i = 0; i < bm.data.length; i++) {
    const v = bm.data[i] + Math.round((rnd() - 0.5) * 2 * amount);
    bm.data[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return bm;
}

/** Uneven illumination — the "photographed with a phone" case. */
export function gradient(bm: Bitmap, strength: number): Bitmap {
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      const f = 1 - strength * ((x / bm.w) * 0.6 + (y / bm.h) * 0.4);
      const i = y * bm.w + x;
      bm.data[i] = Math.max(0, Math.min(255, Math.round(bm.data[i] * f)));
    }
  }
  return bm;
}

export function blur(bm: Bitmap): Bitmap {
  const out = new Bitmap(bm.w, bm.h);
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += bm.get(x + dx, y + dy);
      out.data[y * bm.w + x] = Math.round(sum / 9);
    }
  }
  return out;
}

/** Speckles and a fold line — scanner dust and a creased page. */
export function speckle(bm: Bitmap, count: number, rnd: () => number): Bitmap {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * bm.w), y = Math.floor(rnd() * bm.h);
    const r = 1 + Math.floor(rnd() * 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) bm.set(x + dx, y + dy, 60);
  }
  return bm;
}

/** Posterise to `step` grey levels. Real scans carry far more entropy than a repo should
 *  store: quantising keeps the degradation visible while letting PNG compress it. */
export function quantize(bm: Bitmap, step: number): Bitmap {
  for (let i = 0; i < bm.data.length; i++) {
    bm.data[i] = Math.max(0, Math.min(255, Math.round(bm.data[i] / step) * step));
  }
  return bm;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Minimal 8-bit grayscale PNG encoder (no dependencies, deterministic output). */
export function encodePng(bm: Bitmap): Uint8Array {
  const raw = new Uint8Array((bm.w + 1) * bm.h);
  for (let y = 0; y < bm.h; y++) {
    raw[y * (bm.w + 1)] = 0; // filter: none
    raw.set(bm.data.subarray(y * bm.w, (y + 1) * bm.w), y * (bm.w + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, bm.w);
  dv.setUint32(4, bm.h);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = new Uint8Array(zlib.deflateSync(Buffer.from(raw), { level: 9 }));
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
