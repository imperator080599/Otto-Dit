import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCorpus, type EvalDoc } from '../../../scripts/eval/corpus';
import { runLadder } from '@/lib/services/extraction/ladder';
import { pdfText } from '@/lib/services/extraction/textlayer';
import { compareDoc, falsePositiveRate, normalizeValue, score, tally } from './metrics';

// ADR-018 — the eval harness itself is tested: a measurement tool that lies is worse than
// no measurement. Zero network: the corpus is generated locally and the mock adapter runs.

describe('extraction eval harness (ADR-018)', () => {
  let dir: string;
  let docs: EvalDoc[];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-eval-'));
    docs = await buildCorpus(dir);
  }, 120000);

  it('generates a synthetic corpus with ground truth and neutral filenames', () => {
    expect(docs.length).toBe(28);
    expect(fs.existsSync(path.join(dir, 'ground_truth.json'))).toBe(true);
    for (const d of docs) {
      expect(fs.existsSync(path.join(dir, d.filename))).toBe(true);
      // the classifier must work from content: the filename may not leak the doc type
      expect(d.filename).toMatch(/^eval-\d{4}\.pdf$/);
      expect(Number(d.truth.totalNetCents) + Number(d.truth.vatCents)).toBe(Number(d.truth.totalGrossCents));
    }
    expect(new Set(docs.map((d) => d.variant)).size).toBe(6);
  });

  it('regenerates byte-identically (seeded, no wall clock)', async () => {
    const again = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-eval2-'));
    await buildCorpus(again);
    for (const d of docs) {
      expect(fs.readFileSync(path.join(again, d.filename)).equals(fs.readFileSync(path.join(dir, d.filename)))).toBe(true);
    }
  }, 120000);

  it('the "scan" documents really carry NO text layer', async () => {
    for (const d of docs.filter((x) => x.rendering === 'bitmap')) {
      const text = await pdfText(new Uint8Array(fs.readFileSync(path.join(dir, d.filename))));
      expect(text.trim(), `${d.filename} (${d.degradation}) leaked a text layer`).toBe('');
    }
    for (const d of docs.filter((x) => x.rendering === 'text_layer')) {
      const text = await pdfText(new Uint8Array(fs.readFileSync(path.join(dir, d.filename))));
      expect(text.length).toBeGreaterThan(50);
    }
  }, 120000);

  it('scores the layout rung 2 was written for at 100 %, and reports the rest as misses', async () => {
    const comparisons = [];
    for (const d of docs.filter((x) => x.variant === 'fr-canonical' && x.rendering === 'text_layer')) {
      const res = await runLadder(new Uint8Array(fs.readFileSync(path.join(dir, d.filename))), d.filename);
      expect(res.rung).toBe('text_layer');
      comparisons.push(...compareDoc(d.truth as unknown as Record<string, string>, res.fields).comparisons);
    }
    const s = score(comparisons.reduce((c, x) => ({ ...c, [x.verdict]: c[x.verdict] + 1 }), { tp: 0, fp: 0, fn: 0 }));
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    // no confident wrong amount and no confident wrong date on the covered layout
    expect(falsePositiveRate(comparisons, 'amount').wrong).toBe(0);
    expect(falsePositiveRate(comparisons, 'date').wrong).toBe(0);
  }, 120000);

  it('foreign layouts and scans fall through to the human rung with the mock adapter', async () => {
    for (const d of docs.filter((x) => x.variant === 'de' || x.rendering === 'bitmap').slice(0, 6)) {
      const res = await runLadder(new Uint8Array(fs.readFileSync(path.join(dir, d.filename))), d.filename);
      expect(res.rung, `${d.filename} unexpectedly parsed`).toBe('human');
      expect(res.fields.length).toBe(0);
      expect(res.ai).toBeNull(); // offline: no OCR/LLM call happened
    }
  }, 120000);

  it('counts a wrong returned value as a false positive, not as a miss', () => {
    const truth = { docType: 'invoice', invoiceDate: '2025-03-14', totalNetCents: '123400', vatCents: '24680' };
    const { comparisons } = compareDoc(truth, [
      { name: 'invoiceDate', value: '2025-04-14', confidence: 0.9, page: 1 }, // wrong → fp
      { name: 'totalNetCents', value: '123400', confidence: 0.9, page: 1 },   // right → tp
      { name: 'line1', value: '{}', confidence: 0.9, page: 1 },               // not scored
      // vatCents absent → fn
    ]);
    const byField = tally(comparisons, (c) => c.field);
    expect(byField.invoiceDate).toMatchObject({ tp: 0, fp: 1, fn: 0 });
    expect(byField.totalNetCents).toMatchObject({ tp: 1, fp: 0, fn: 0 });
    expect(byField.vatCents).toMatchObject({ tp: 0, fp: 0, fn: 1 });
    expect(falsePositiveRate(comparisons, 'date')).toEqual({ returned: 1, wrong: 1, rate: 1 });
    expect(falsePositiveRate(comparisons, 'amount').rate).toBe(0);
  });

  it('normalises values before comparing, without hiding a real difference', () => {
    expect(normalizeValue('amount', '123400')).toBe('123400');
    expect(normalizeValue('date', '2025-03-14T00:00:00Z')).toBe('2025-03-14');
    expect(normalizeValue('text', 'Menuiseries  Caillat SARL')).toBe('MENUISERIES CAILLAT SARL');
    expect(normalizeValue('text', 'Ménuiseries Caillat, SARL')).toBe('MENUISERIES CAILLAT SARL');
    expect(normalizeValue('text', 'Menuiseries Caillat SAS')).not.toBe(normalizeValue('text', 'Menuiseries Caillat SARL'));
  });
});
