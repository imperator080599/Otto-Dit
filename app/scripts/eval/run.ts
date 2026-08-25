import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import { loadEnvLocal, keyFingerprint } from '../../src/lib/core/env';
import { runLadder } from '../../src/lib/services/extraction/ladder';
import { getOcrAdapter } from '../../src/lib/services/extraction/adapters';
import {
  compareDoc, falsePositiveRate, pct, score, tally, emptyCounts, add,
  type Comparison, type Counts, type Scored,
} from '../../src/lib/eval/metrics';
import { buildCorpus, type EvalDoc } from './corpus';

// ADR-018 — `npm run eval:extraction`. Measures the extraction ladder on a PUBLIC and
// SYNTHETIC corpus. No client document ever enters this repo: an eval on real documents
// happens only at a pilot client, in their environment, with written authorization.
//
// It runs the SAME runLadder() the app runs, so every number below describes shipped code.

interface DocResult {
  doc: EvalDoc;
  corpus: 'synthetic' | 'public';
  rung: string;
  docType: string;
  classOk: boolean;
  latencyMs: number;
  costUsd: number;
  comparisons: Comparison[];
  extraFields: string[];
  error: string | null;
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const skipGenerate = args.includes('--no-generate');
  const flag = (name: string, dflt: string) =>
    (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=')[1];
  // the adapter is selected per run, never by exporting a key into a shell (ADR-020)
  process.env.OTTO_OCR_ADAPTER = flag('adapter', process.env.OTTO_OCR_ADAPTER ?? 'mock');
  // a $ ceiling on the eval itself: at these volumes it is a BUG DETECTOR, not a budget —
  // reaching it means a loop or a retry storm, so the run stops and says so (ADR-020)
  const budget = Number(flag('budget', '5'));
  const adapter = getOcrAdapter();
  console.log(`adapter: ${adapter.name} · key: ${keyFingerprint()} · budget guard: $${budget.toFixed(2)}`);
  const root = repoRoot();
  const synthDir = path.join(root, 'dataset', 'eval', 'synthetic');
  const publicDir = path.join(root, 'dataset', 'eval', 'public');

  const synthetic = skipGenerate && fs.existsSync(path.join(synthDir, 'ground_truth.json'))
    ? (JSON.parse(fs.readFileSync(path.join(synthDir, 'ground_truth.json'), 'utf8')) as EvalDoc[])
    : await buildCorpus(synthDir);
  console.log(`synthetic corpus: ${synthetic.length} documents in ${path.relative(root, synthDir)}`);

  const publicDocs = loadPublicCorpus(publicDir);
  if (publicDocs.length) console.log(`public corpus: ${publicDocs.length} documents in ${path.relative(root, publicDir)}`);

  const results: DocResult[] = [];
  let spent = 0;
  let budgetStop: string | null = null;
  for (const [corpus, dir, docs] of [
    ['synthetic', synthDir, synthetic],
    ['public', publicDir, publicDocs],
  ] as const) {
    for (const doc of docs) {
      if (spent >= budget) { budgetStop = doc.filename; break; }
      const bytes = new Uint8Array(fs.readFileSync(path.join(dir, doc.filename)));
      const t0 = Date.now();
      try {
        const res = await runLadder(bytes, doc.filename, adapter);
        spent += res.ai?.costUsd ?? 0;
        const cmp = compareDoc(doc.truth as unknown as Record<string, string>, res.fields);
        results.push({
          doc, corpus,
          rung: res.rung,
          docType: res.docType,
          classOk: res.docType === doc.truth.docType,
          latencyMs: res.latencyMs,
          costUsd: res.ai?.costUsd ?? 0,
          comparisons: cmp.comparisons,
          extraFields: cmp.extraFields,
          error: null,
        });
      } catch (e) {
        results.push({
          doc, corpus, rung: 'failed', docType: 'unknown', classOk: false,
          latencyMs: Date.now() - t0, costUsd: 0,
          comparisons: compareDoc(doc.truth as unknown as Record<string, string>, []).comparisons,
          extraFields: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (budgetStop) {
    console.error(`\nBUDGET GUARD TRIPPED at ${budgetStop} after $${spent.toFixed(4)} — this is a bug detector, not a budget. Find the loop or the retry storm before re-running.`);
  }
  const report = buildReport(results, adapter.name, budgetStop);
  const out = path.join(root, 'docs', 'EVAL_EXTRACTION.md');
  fs.writeFileSync(out, report);
  console.log(`\n${summary(results)}\nreport written to ${path.relative(root, out)}`);
}

/** The public-corpus slot: documents the founder drops in, with a ground_truth.json in the
 *  same shape as the synthetic one. Never committed — see that directory's README. */
function loadPublicCorpus(dir: string): EvalDoc[] {
  const gt = path.join(dir, 'ground_truth.json');
  if (!fs.existsSync(gt)) return [];
  const docs = JSON.parse(fs.readFileSync(gt, 'utf8')) as EvalDoc[];
  return docs.filter((d) => fs.existsSync(path.join(dir, d.filename)));
}

function table(rows: string[][], headers: string[]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

// every rate is printed next to the count it was computed from — a 100 % on n=3 and a
// 100 % on n=196 are not the same claim
const sc = (s: Scored) => [
  String(s.tp), String(s.fp), String(s.fn),
  `${pct(s.precision)} (n=${s.tp + s.fp})`,
  `${pct(s.recall)} (n=${s.tp + s.fp + s.fn})`,
  pct(s.f1),
];

function summary(results: DocResult[]): string {
  const all = results.flatMap((r) => r.comparisons);
  const s = score(all.reduce((c: Counts, x) => add(c, x.verdict), emptyCounts()));
  const amt = falsePositiveRate(all, 'amount');
  const dt = falsePositiveRate(all, 'date');
  return (
    `${results.length} documents · precision ${pct(s.precision)} · recall ${pct(s.recall)} · ` +
    `wrong amounts ${amt.wrong}/${amt.returned} · wrong dates ${dt.wrong}/${dt.returned}`
  );
}

function buildReport(results: DocResult[], adapterName: string, budgetStop: string | null): string {
  const all = results.flatMap((r) => r.comparisons);
  const overall = score(all.reduce((c: Counts, x) => add(c, x.verdict), emptyCounts()));
  const byField = tally(all, (c) => c.field);
  const byVariant: Record<string, Scored> = {};
  for (const r of results) {
    const key = `${r.doc.variant}${r.doc.degradation ? ` / ${r.doc.degradation}` : ''} (${r.doc.rendering})`;
    const counts = (byVariant[key] as unknown as Counts) ?? emptyCounts();
    for (const c of r.comparisons) add(counts, c.verdict);
    byVariant[key] = counts as unknown as Scored;
  }
  const variantRows = Object.entries(byVariant).map(([k, v]) => {
    const n = results.filter((r) => `${r.doc.variant}${r.doc.degradation ? ` / ${r.doc.degradation}` : ''} (${r.doc.rendering})` === k).length;
    const rungs = [...new Set(results
      .filter((r) => `${r.doc.variant}${r.doc.degradation ? ` / ${r.doc.degradation}` : ''} (${r.doc.rendering})` === k)
      .map((r) => r.rung))].join(', ');
    return [k, String(n), rungs, ...sc(score(v as unknown as Counts))];
  });

  const rungCount: Record<string, number> = {};
  for (const r of results) rungCount[r.rung] = (rungCount[r.rung] ?? 0) + 1;

  const amt = falsePositiveRate(all, 'amount');
  const dt = falsePositiveRate(all, 'date');
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const cost = results.reduce((s, r) => s + r.costUsd, 0);
  const failures = results.filter((r) => r.error).length;
  const noField = results.filter((r) => !r.error && r.comparisons.every((c) => c.verdict === 'fn')).length;
  const classOk = results.filter((r) => r.classOk).length;
  const publicCount = results.filter((r) => r.corpus === 'public').length;

  return `# EVAL_EXTRACTION.md — extraction ladder measurement (ADR-018)

**Generated by \`npm run eval:extraction\`.** Do not hand-edit: rerun the command.

## Corpus rule (non-negotiable)

This eval runs on a **public and synthetic** corpus only. No client document is ever placed
in this repository — professional secrecy and contractual obligations forbid it. An eval on
real documents takes place **only at a pilot client, in that client's environment, with
written authorization**, and its outputs stay there. The synthetic corpus below is generated
deterministically (\`scripts/eval/corpus.ts\`, seeded); every company, number and address in
it is fabricated. The public slot (\`dataset/eval/public/\`) is where published annual
reports and vendor sample invoices are dropped locally; those files are **not committed**.

- Adapter under test (rungs 3–4): \`${adapterName}\`${adapterName === 'mock' ? ' — record/replay, so no OCR/LLM ran: rung 3 is *not* measured in this run' : ` (${process.env.OTTO_EXTRACT_MODEL ?? 'claude-opus-5'}, effort ${process.env.OTTO_EXTRACT_EFFORT ?? 'low'})`}
${budgetStop ? `- **RUN TRUNCATED BY THE BUDGET GUARD** at \`${budgetStop}\` — the numbers below cover only the documents processed before that point.\n` : ''}
- Documents scored: **${results.length}** (${results.length - publicCount} synthetic, ${publicCount} public)
- Same code path as the app: \`runLadder()\` in \`src/lib/services/extraction/ladder.ts\`

## Metric convention

\`tp\` a value was returned and it is correct · \`fp\` a value was returned and it is **wrong**
· \`fn\` no value was returned. precision = tp/(tp+fp), recall = tp/(tp+fp+fn). For an auditor
\`fp\` is the dangerous column: a confident wrong amount costs more than a blank.

## Headline

| Measure | Value |
|---|---|
| Fields scored | ${overall.tp + overall.fp + overall.fn} (n) |
| Precision | **${pct(overall.precision)}** (${overall.tp}/${overall.tp + overall.fp} returned values correct) |
| Recall | **${pct(overall.recall)}** (${overall.tp}/${overall.tp + overall.fp + overall.fn} fields present in the documents) |
| F1 | ${pct(overall.f1)} |
| **False-positive rate on amounts** | **${pct(amt.rate)}** (${amt.wrong} wrong of ${amt.returned} returned) |
| **False-positive rate on dates** | **${pct(dt.rate)}** (${dt.wrong} wrong of ${dt.returned} returned) |
| Document classification correct | ${classOk}/${results.length} (${pct(classOk / results.length)}, n=${results.length}) |
| Documents yielding no field at all | ${noField}/${results.length} |
| Adapter failures (exception raised) | ${failures}/${results.length} |
| Latency p50 / p95 | ${p50} ms / ${p95} ms |
| Measured spend for this run | $${cost.toFixed(4)} |

## Rung reached

${table(Object.entries(rungCount).map(([k, v]) => [k, `${v}/${results.length}`, pct(v / results.length)]), ['Rung', 'Documents (n)', 'Share'])}

## Per field

${table(Object.entries(byField).map(([k, v]) => [k, ...sc(v)]), ['Field', 'tp', 'fp', 'fn', 'Precision', 'Recall', 'F1'])}

## Per corpus variant

${table(variantRows, ['Variant', 'Docs', 'Rung(s)', 'tp', 'fp', 'fn', 'Precision', 'Recall', 'F1'])}

## What this run does NOT establish

- ${adapterName === 'mock'
    ? '**Rungs 3–4 are unmeasured.** The record/replay adapter returns nothing for corpus documents, so bitmap scans fall straight to rung 5 (human). Re-run with `OTTO_OCR_ADAPTER=<live adapter>` and a key to measure OCR/LLM precision, latency and cost.'
    : 'Nothing about documents unlike this corpus: layouts, languages and degradations outside the table above are untested.'}
- Nothing about **real client documents**: their layouts, their scan quality, their edge
  cases. That measurement belongs to a pilot, under A12 in docs/ASSUMPTIONS.md.
- Nothing about **human verification time** (A11) — that is a stopwatch measurement at a
  pilot, not a corpus measurement.
- The handwritten variant is a **stylised proxy** (per-glyph jitter and slant on a printed
  value), not real handwriting. It stresses the raster path, not human penmanship.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
