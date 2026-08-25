import { createHash } from 'node:crypto';

/** Deterministic demo UUID from a stable name (uuid-v4 format, stable across reseeds). */
export function demoId(name: string): string {
  const h = createHash('sha256').update('otto-demo:' + name).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}
