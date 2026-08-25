// numeric(18,2) ⇄ integer cents. PGlite returns numerics as strings; the kernel computes
// in cents only (no float audit math).

export function numToCents(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Math.round(n * 100);
}

export function centsToNum(cents: number): string {
  return (cents / 100).toFixed(2);
}
