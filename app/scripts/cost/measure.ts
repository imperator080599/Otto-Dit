import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import { runLadder } from '../../src/lib/services/extraction/ladder';
import { getOcrAdapter } from '../../src/lib/services/extraction/adapters';
import { rateFor } from '../../src/lib/core/pricing';

// `npm run cost:measure` — runs the extraction ladder end to end over the synthetic
// dataset with a LIVE adapter and writes what it actually cost into COST.md, replacing
// the extrapolation with a measurement (founder retour #4).
//
// Guards, in order: a live adapter must be selected, its key must be present, today's
// token prices must be supplied (otherwise a dollar budget cannot be enforced at all),
// and --yes must be passed. Every call is metered; the run aborts the moment cumulative
// spend would exceed the budget. Nothing here can spend money by accident.

const BEGIN = '<!-- MEASURED:BEGIN -->';
const END = '<!-- MEASURED:END -->';

interface DocRun {
  filename: string;
  rung: string;
  fields: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  error: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  const budget = Number((args.find((a) => a.startsWith('--budget=')) ?? '--budget=20').split('=')[1]);
  const confirmed = args.includes('--yes');
  const root = repoRoot();
  const dir = path.join(root, 'dataset', 'evidence');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort();

  const which = process.env.OTTO_OCR_ADAPTER ?? 'mock';
  const model = process.env.OTTO_EXTRACT_MODEL ?? 'claude-sonnet-4-5';
  const rate = rateFor(model);

  const blockers: string[] = [];
  if (which === 'mock') blockers.push('OTTO_OCR_ADAPTER is `mock` — a replay adapter measures nothing. Set it to a live adapter.');
  if (which === 'anthropic' && !process.env.ANTHROPIC_API_KEY) blockers.push('ANTHROPIC_API_KEY is not set in this environment.');
  if (rate.inPerMTok === 0 && rate.outPerMTok === 0) {
    blockers.push('OTTO_PRICE_IN_PER_MTOK / OTTO_PRICE_OUT_PER_MTOK are not set — without today’s price list a $ budget cannot be enforced, so the run is refused rather than run blind.');
  }
  if (!confirmed) blockers.push('--yes was not passed (this command spends real money).');

  console.log(`documents: ${files.length} · adapter: ${which} · model: ${model} · budget: $${budget.toFixed(2)}`);
  if (blockers.length) {
    console.log('\nRUN NOT PERFORMED — blockers:');
    for (const b of blockers) console.log(`  - ${b}`);
    // record the attempt honestly: a blocked run is a fact about this environment,
    // not a reason to leave an extrapolation looking like a measurement
    writeBlock(root, blockedBlock(which, model, files.length, budget, blockers));
    console.log('\nCOST.md updated with the blocked-run record.');
    return;
  }

  const adapter = getOcrAdapter();
  const runs: DocRun[] = [];
  let spent = 0;
  let stoppedAt: string | null = null;

  for (const f of files) {
    if (spent >= budget) { stoppedAt = f; break; }
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    try {
      const res = await runLadder(bytes, f, adapter);
      spent += res.ai?.costUsd ?? 0;
      runs.push({
        filename: f, rung: res.rung, fields: res.fields.length, latencyMs: res.latencyMs,
        tokensIn: res.ai?.tokensIn ?? 0, tokensOut: res.ai?.tokensOut ?? 0,
        costUsd: res.ai?.costUsd ?? 0, error: null,
      });
    } catch (e) {
      runs.push({
        filename: f, rung: 'failed', fields: 0, latencyMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    console.log(`  ${f} → ${runs[runs.length - 1].rung} · $${spent.toFixed(4)} cumulative`);
  }

  writeBlock(root, measuredBlock(which, model, rate, runs, budget, stoppedAt, files.length));
  const llm = runs.filter((r) => r.rung === 'ocr');
  console.log(
    `\nmeasured: ${runs.length} documents, ${llm.length} reached the model rung, ` +
    `$${spent.toFixed(4)} spent. COST.md updated.`,
  );
}

function writeBlock(root: string, block: string) {
  const p = path.join(root, 'COST.md');
  const md = fs.readFileSync(p, 'utf8');
  if (!md.includes(BEGIN) || !md.includes(END)) throw new Error('COST.md is missing the MEASURED markers');
  fs.writeFileSync(p, md.slice(0, md.indexOf(BEGIN) + BEGIN.length) + '\n' + block + '\n' + md.slice(md.indexOf(END)));
}

function blockedBlock(which: string, model: string, docs: number, budget: number, blockers: string[]): string {
  return `
**Status: the live run has NOT been executed. Measured spend remains $0.00 — because no
call was made, not because calls were free.**

Attempted: \`npm run cost:measure\` over the ${docs} synthetic evidence documents, adapter
\`${which}\`, model \`${model}\`, budget $${budget.toFixed(2)}. The command refused to start:

${blockers.map((b) => `- ${b}`).join('\n')}

Everything below the "Extrapolated" heading is therefore still an **extrapolation, not a
measurement**. To turn it into one, from an environment that has the credentials:

\`\`\`bash
export OTTO_OCR_ADAPTER=anthropic
export ANTHROPIC_API_KEY=…
export OTTO_PRICE_IN_PER_MTOK=…      # today's price list, in USD per million tokens
export OTTO_PRICE_OUT_PER_MTOK=…
cd app && npm run cost:measure -- --budget=20 --yes
\`\`\`

The command meters every call through \`ai_run\`, stops the moment cumulative spend reaches
the budget, and rewrites this block with measured cost per document, cost per engagement,
latency, failure rate and the gap against the ≈$0.30 extrapolation.
`;
}

function measuredBlock(
  which: string, model: string, rate: { inPerMTok: number; outPerMTok: number },
  runs: DocRun[], budget: number, stoppedAt: string | null, total: number,
): string {
  const llm = runs.filter((r) => r.rung === 'ocr');
  const failures = runs.filter((r) => r.error);
  const spent = runs.reduce((s, r) => s + r.costUsd, 0);
  const lat = runs.filter((r) => r.rung === 'ocr').map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0;
  const p95 = lat[Math.floor(lat.length * 0.95)] ?? 0;
  const perDoc = runs.length ? spent / runs.length : 0;
  const perLlmDoc = llm.length ? spent / llm.length : 0;
  // an engagement is assumed at ~100 evidence documents (same basis as the extrapolation)
  const perEngagement = perDoc * 100;
  const rungCount: Record<string, number> = {};
  for (const r of runs) rungCount[r.rung] = (rungCount[r.rung] ?? 0) + 1;

  return `
**Status: measured.** Adapter \`${which}\`, model \`${model}\`, prices
$${rate.inPerMTok}/$${rate.outPerMTok} per MTok (supplied at run time), budget
$${budget.toFixed(2)}.${stoppedAt ? ` **Stopped early at \`${stoppedAt}\` on the budget guard** — ${runs.length} of ${total} documents.` : ''}

| Measure | Value |
|---|---|
| Documents processed | ${runs.length} / ${total} |
| Reached the model rung (3–4) | ${llm.length} (${((llm.length / Math.max(runs.length, 1)) * 100).toFixed(1)} %) |
| Rungs reached | ${Object.entries(rungCount).map(([k, v]) => `${k}: ${v}`).join(', ')} |
| Tokens in / out | ${runs.reduce((s, r) => s + r.tokensIn, 0)} / ${runs.reduce((s, r) => s + r.tokensOut, 0)} |
| **Total spend** | **$${spent.toFixed(4)}** |
| Cost per document (all documents) | $${perDoc.toFixed(4)} |
| Cost per document that reached the model | $${perLlmDoc.toFixed(4)} |
| **Cost per engagement (×100 documents)** | **$${perEngagement.toFixed(2)}** |
| Gap vs the ≈$0.30 extrapolation | ${perEngagement === 0 ? 'n/a' : `${(perEngagement / 0.3).toFixed(1)}× (${perEngagement > 0.3 ? 'higher' : 'lower'})`} |
| Model-rung latency p50 / p95 | ${p50} ms / ${p95} ms |
| Failure rate (call raised) | ${failures.length}/${runs.length} (${((failures.length / Math.max(runs.length, 1)) * 100).toFixed(1)} %) |

${failures.length ? `Failures:\n${failures.slice(0, 5).map((f) => `- \`${f.filename}\`: ${f.error?.slice(0, 200)}`).join('\n')}\n` : 'No call failed.\n'}
Per-document detail:

| Document | Rung | Fields | Tokens in/out | Cost | Latency |
|---|---|---|---|---|---|
${runs.map((r) => `| \`${r.filename}\` | ${r.rung} | ${r.fields} | ${r.tokensIn}/${r.tokensOut} | $${r.costUsd.toFixed(4)} | ${r.latencyMs} ms |`).join('\n')}
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
