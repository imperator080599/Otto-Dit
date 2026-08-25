import { createHash } from 'node:crypto';

// Deterministic seeded RNG (mulberry32 over a string seed). Sampling and the dataset
// generator both use this — same (seed, sequence of calls) ⇒ same numbers, forever.

export function seededRng(seed: string): () => number {
  const h = createHash('sha256').update(seed).digest();
  let a = h.readUInt32LE(0) ^ h.readUInt32LE(16);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** Draw n distinct items deterministically. */
export function drawWithoutReplacement<T>(items: T[], n: number, rng: () => number): T[] {
  return shuffle(items, rng).slice(0, Math.min(n, items.length));
}
