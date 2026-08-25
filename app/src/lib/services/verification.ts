import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { verificationDraw } from '@/lib/kernel/sampling';
import { primaryPack } from '@/lib/packs';
import { centsToNum, numToCents } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import type { ExtractedField } from './extraction/fields';

// ADR-012.3 — the engagement-level tool-reliability control: a seeded, reproducible
// subsample of machine-PASSED items is BLIND re-performed by a human (independent values
// captured before the machine result is revealed). Disagreement auto-raises an exception
// and records an escalation decision. All stored — never recomputed (Gate 2).

export async function startVerificationRun(engagementId: string, userId: string): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const passed = await q<{ id: string; procedure_id: string }>(
    `select si.id, s.procedure_id from sample_item si
     join sample s on s.id = si.sample_id
     join match m on m.sample_item_id = si.id
     where s.engagement_id = $1 and s.status = 'drawn' and m.status = 'matched'`,
    [engagementId],
  );
  if (passed.length === 0) throw new Error('no machine-passed items yet — run matching first');
  const draw = verificationDraw(
    passed.map((p) => p.id),
    pack.verification.spotcheckPct,
    pack.verification.spotcheckMin,
    pack.verification.seedDefault,
  );
  const run = await q1<{ id: string }>(
    `insert into verification_run (engagement_id, procedure_id, seed, rate, min_items,
       machine_passed_population_hash, machine_passed_count, drawn_count)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      engagementId, passed[0].procedure_id, pack.verification.seedDefault,
      pack.verification.spotcheckPct, pack.verification.spotcheckMin,
      draw.machinePassedPopulationHash, passed.length, draw.selected.length,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'verification_run_started', objectType: 'verification_run', objectId: run.id,
    payload: { drawn: draw.selected.length, of: passed.length, seed: pack.verification.seedDefault, requestedBy: userId, selected: draw.selected },
  });
  return run.id;
}

export async function currentVerificationRun(engagementId: string) {
  const run = await q01<{ id: string; procedure_id: string; seed: string; rate: number; drawn_count: number; machine_passed_count: number; created_at: string }>(
    `select id, procedure_id, seed, rate::float, drawn_count, machine_passed_count, created_at::text
     from verification_run where engagement_id = $1 order by created_at desc limit 1`,
    [engagementId],
  );
  if (!run) return null;
  const ev = await q<{ payload: { selected?: string[] } }>(
    `select payload from event_log where object_type = 'verification_run' and object_id = $1 and verb = 'verification_run_started'`,
    [run.id],
  );
  const selected = ev[0]?.payload?.selected ?? [];
  const items = await q<{
    sample_item_id: string; piece_ref: string | null; aux_label: string | null; amount: string;
    check_id: string | null; result: string | null; seconds_spent: number | null;
  }>(
    `select si.id sample_item_id, g.piece_ref, g.aux_label, si.amount::text,
            vc.id check_id, vc.result, vc.seconds_spent
     from sample_item si
     join gl_entry g on g.id = si.unit_id
     left join verification_check vc on vc.sample_item_id = si.id and vc.verification_run_id = $2
     where si.id = any($1::uuid[])`,
    [selected, run.id],
  );
  return { ...run, items };
}

/** Blind capture: the verifier enters independent values BEFORE seeing the machine result;
 *  agreement is computed by the engine against the stored extraction. */
export async function submitBlindCheck(opts: {
  verificationRunId: string;
  sampleItemId: string;
  verifierId: string;
  blind: { totalNetCents: number; invoiceDate: string; buyerName?: string };
  secondsSpent?: number;
  escalationOnDisagree?: 'expand_subsample' | 'reperform_procedure';
}): Promise<{ result: 'agree' | 'disagree'; exceptionId: string | null }> {
  const run = await q1<{ id: string; engagement_id: string; procedure_id: string }>(
    `select id, engagement_id, procedure_id from verification_run where id = $1`,
    [opts.verificationRunId],
  );
  const ctx = await engagementCtx(run.engagement_id);
  // machine view: the extraction fields behind the matched invoice for this item
  const evRow = await q01<{ fields: ExtractedField[] }>(
    `select x.fields from extraction x
     join evidence e on e.id = x.evidence_id
     join request_item ri on ri.id = e.request_item_id
     where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note')
       and x.status in ('complete','verified')
     order by x.created_at desc limit 1`,
    [opts.sampleItemId],
  );
  const machineNet = evRow ? Number(evRow.fields.find((f) => f.name === 'totalNetCents')?.value ?? NaN) : NaN;
  const machineDate = evRow?.fields.find((f) => f.name === 'invoiceDate')?.value;
  const agreeAmount = Number.isFinite(machineNet) && Math.abs(machineNet - opts.blind.totalNetCents) <= 100;
  const agreeDate = machineDate === opts.blind.invoiceDate;
  const result: 'agree' | 'disagree' = agreeAmount && agreeDate ? 'agree' : 'disagree';

  let exceptionId: string | null = null;
  if (result === 'disagree') {
    const x = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, kind, sample_item_id, severity, description)
       values ($1, 'verification_disagreement', 'verification', $2, 'high', $3) returning id`,
      [
        run.engagement_id,
        opts.sampleItemId,
        `Contrôle de fiabilité : la re-exécution indépendante (montant ${centsToNum(opts.blind.totalNetCents)} €, date ${opts.blind.invoiceDate}) diverge du résultat machine (montant ${Number.isFinite(machineNet) ? centsToNum(machineNet) : '?'} €, date ${machineDate ?? '?'}). Décision : ${opts.escalationOnDisagree ?? 'expand_subsample'}.`,
      ],
    );
    exceptionId = x.id;
  }
  await q(
    `insert into verification_check (engagement_id, procedure_id, sample_item_id, verifier_id,
       result, disagreement_note, exception_id, seconds_spent, verification_run_id, blind_values, escalation)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      run.engagement_id, run.procedure_id, opts.sampleItemId, opts.verifierId, result,
      result === 'disagree' ? `blind ${centsToNum(opts.blind.totalNetCents)} € / machine ${Number.isFinite(machineNet) ? centsToNum(machineNet) : '?'} €` : null,
      exceptionId, opts.secondsSpent ?? null, opts.verificationRunId,
      JSON.stringify(opts.blind), result === 'disagree' ? (opts.escalationOnDisagree ?? 'expand_subsample') : 'none',
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: run.engagement_id, actorKind: 'user', actorId: opts.verifierId,
    verb: 'verification_check_performed', objectType: 'sample_item', objectId: opts.sampleItemId,
    payload: { result, runId: opts.verificationRunId, escalation: result === 'disagree' ? (opts.escalationOnDisagree ?? 'expand_subsample') : 'none' },
  });
  return { result, exceptionId };
}

export { numToCents };
