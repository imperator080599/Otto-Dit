import type { ExtractedField } from '@/lib/services/extraction/fields';

// ADR-018 — per-field extraction metrics. Slot-filling convention, stated explicitly so
// the numbers in docs/EVAL_EXTRACTION.md cannot be read two ways:
//   tp = a value was returned and it is correct
//   fp = a value was returned and it is WRONG  ← the number that matters for an auditor:
//        a wrong amount that looks confident is worse than no amount at all
//   fn = no value was returned for a field the document carries
//   precision = tp / (tp + fp)      recall = tp / (tp + fp + fn)

export type FieldKind = 'amount' | 'date' | 'text';

export const FIELD_KINDS: Record<string, FieldKind> = {
  invoiceNumber: 'text',
  invoiceDate: 'date',
  buyerName: 'text',
  sellerName: 'text',
  totalNetCents: 'amount',
  vatCents: 'amount',
  totalGrossCents: 'amount',
};

export type Verdict = 'tp' | 'fp' | 'fn';

export interface Comparison {
  field: string;
  kind: FieldKind;
  expected: string;
  got: string | null;
  verdict: Verdict;
}

export function normalizeValue(kind: FieldKind, raw: string): string {
  const v = raw.trim();
  if (kind === 'amount') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? String(Math.round(n)) : v;
  }
  if (kind === 'date') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : v;
  }
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Fields the corpus does not carry ground truth for — reported, never scored. */
export function isScored(name: string): boolean {
  return name in FIELD_KINDS;
}

export function compareDoc(truth: Record<string, string>, fields: ExtractedField[]): {
  comparisons: Comparison[];
  extraFields: string[];
} {
  const got = new Map(fields.map((f) => [f.name, f.value]));
  const comparisons: Comparison[] = [];
  for (const [field, kind] of Object.entries(FIELD_KINDS)) {
    const expected = truth[field];
    if (expected === undefined) continue;
    const raw = got.get(field);
    if (raw === undefined || raw === '') {
      comparisons.push({ field, kind, expected, got: null, verdict: 'fn' });
      continue;
    }
    const ok = normalizeValue(kind, raw) === normalizeValue(kind, expected);
    comparisons.push({ field, kind, expected, got: raw, verdict: ok ? 'tp' : 'fp' });
  }
  const extraFields = fields.map((f) => f.name).filter((n) => !isScored(n));
  return { comparisons, extraFields };
}

export interface Counts { tp: number; fp: number; fn: number }

export const emptyCounts = (): Counts => ({ tp: 0, fp: 0, fn: 0 });

export function add(c: Counts, v: Verdict): Counts {
  c[v] += 1;
  return c;
}

export interface Scored extends Counts { precision: number; recall: number; f1: number }

export function score(c: Counts): Scored {
  const precision = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fp + c.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...c, precision, recall, f1 };
}

export function tally(comparisons: Comparison[], key: (c: Comparison) => string): Record<string, Scored> {
  const buckets: Record<string, Counts> = {};
  for (const c of comparisons) {
    const k = key(c);
    buckets[k] = buckets[k] ?? emptyCounts();
    add(buckets[k], c.verdict);
  }
  return Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, score(v)]));
}

/** The founder's headline number: of the values the system DID return for amounts (resp.
 *  dates), what share were wrong? A silent miss is a different problem from a wrong figure. */
export function falsePositiveRate(comparisons: Comparison[], kind: FieldKind): { returned: number; wrong: number; rate: number } {
  const returned = comparisons.filter((c) => c.kind === kind && c.verdict !== 'fn');
  const wrong = returned.filter((c) => c.verdict === 'fp');
  return { returned: returned.length, wrong: wrong.length, rate: returned.length === 0 ? 0 : wrong.length / returned.length };
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}
