import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { evaluateSample } from '@/lib/kernel/projection';
import { centsToNum, numToCents } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { validatedThresholds } from './materiality';

// Gate 2 (audit partner): sample evaluation inside the procedure workpaper — known +
// projected misstatement vs tolerable misstatement, computed L0, concluded L4. The
// conclusion gate is: all exceptions dispositioned AND the aggregate evaluated vs TE.

export async function computeSampleEvaluation(engagementId: string, userId: string | null): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const thresholds = await validatedThresholds(engagementId);
  if (!thresholds) throw new Error('validated materiality required');
  const sample = await q1<{ id: string; population_amount: string; coverage_amount: string | null }>(
    `select s.id, s.population_amount::text, s.coverage_amount::text
     from sample s join procedure_instance p on p.id = s.procedure_id
     where s.engagement_id = $1 and p.template_code = 'REV-SUBST' and s.status = 'drawn'
     order by s.created_at desc limit 1`,
    [engagementId],
  );
  // stratum amounts + misstatements: 100%-examined strata = high_value + risk_flag
  const strata = await q<{ selection_reason: string; tested: string }>(
    `select si.selection_reason, coalesce(sum(si.amount),0)::text tested
     from sample_item si where si.sample_id = $1 group by si.selection_reason`,
    [sample.id],
  );
  const testedBy = (r: string) => numToCents(strata.find((s) => s.selection_reason === r)?.tested ?? '0');
  const coverageTested = testedBy('high_value') + testedBy('risk_flag');
  const randomTested = testedBy('random');

  const mis = await q<{ selection_reason: string; amount: string }>(
    `select si.selection_reason, m.amount::text
     from misstatement m
     join exception x on x.id = m.exception_id
     join sample_item si on si.id = x.sample_item_id
     where m.engagement_id = $1 and m.status in ('proposed','confirmed') and m.corrected = false`,
    [engagementId],
  );
  const coverageMis = mis.filter((m) => m.selection_reason !== 'random').reduce((s, m) => s + numToCents(m.amount), 0);
  const randomMis = mis.filter((m) => m.selection_reason === 'random').reduce((s, m) => s + numToCents(m.amount), 0);

  const result = evaluateSample({
    populationAmountCents: numToCents(sample.population_amount),
    coverageAmountCents: coverageTested,
    randomTestedAmountCents: randomTested,
    coverageMisstatementCents: coverageMis,
    randomMisstatementCents: randomMis,
    teAmountCents: thresholds.teCents,
  });

  await q(`update sample_evaluation set status = 'superseded' where sample_id = $1 and status = 'draft'`, [sample.id]);
  const prev = await q<{ version: number }>(`select version from sample_evaluation where sample_id = $1 order by version desc limit 1`, [sample.id]);
  const row = await q1<{ id: string }>(
    `insert into sample_evaluation (sample_id, version, known_misstatement, projected_misstatement,
       projection_method, tested_coverage_amount, tested_random_amount, untested_amount, te_amount, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') returning id`,
    [
      sample.id, (prev[0]?.version ?? 0) + 1,
      centsToNum(result.knownMisstatementCents), centsToNum(result.projectedMisstatementCents),
      result.projectionMethod, centsToNum(coverageTested), centsToNum(randomTested),
      centsToNum(result.untestedAmountCents), centsToNum(result.teAmountCents),
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'sample_evaluation_computed', objectType: 'sample_evaluation', objectId: row.id,
    payload: {
      known: centsToNum(result.knownMisstatementCents),
      projected: centsToNum(result.projectedMisstatementCents),
      withinTolerable: result.withinTolerable,
      requestedBy: userId,
    },
  });
  return row.id;
}

export async function concludeEvaluation(evaluationId: string, userId: string, basis: string): Promise<void> {
  if (!basis.trim()) throw new Error('conclusion basis required (L4)');
  const e = await q1<{ id: string; sample_id: string }>(`select id, sample_id from sample_evaluation where id = $1`, [evaluationId]);
  const s = await q1<{ engagement_id: string }>(`select engagement_id from sample where id = $1`, [e.sample_id]);
  const ctx = await engagementCtx(s.engagement_id);
  await q(
    `update sample_evaluation set status = 'concluded', conclusion_basis = $2, concluded_by = $3, concluded_at = now() where id = $1`,
    [evaluationId, basis, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'sample_evaluation_concluded', objectType: 'sample_evaluation', objectId: evaluationId,
    payload: { basis },
  });
}

export async function currentEvaluation(engagementId: string) {
  return q01<{
    id: string; version: number; known_misstatement: string; projected_misstatement: string;
    projection_method: string; tested_coverage_amount: string; tested_random_amount: string;
    untested_amount: string; te_amount: string; status: string; conclusion_basis: string | null;
    concluded_by: string | null; concluded_at: string | null;
  }>(
    `select se.id, se.version, se.known_misstatement::text, se.projected_misstatement::text,
            se.projection_method, se.tested_coverage_amount::text, se.tested_random_amount::text,
            se.untested_amount::text, se.te_amount::text, se.status, se.conclusion_basis,
            se.concluded_by, se.concluded_at::text
     from sample_evaluation se
     join sample s on s.id = se.sample_id
     where s.engagement_id = $1 and se.status in ('draft','concluded')
     order by se.version desc limit 1`,
    [engagementId],
  );
}

/** The conclusion gate (Gate 2): every exception dispositioned AND evaluation concluded. */
export async function conclusionGate(engagementId: string): Promise<{ ok: boolean; openExceptions: number; evaluationConcluded: boolean; withinTolerable: boolean | null }> {
  const open = await q1<{ n: string }>(
    `select count(*) n from exception where engagement_id = $1 and status in ('open','clarification_requested','explained')`,
    [engagementId],
  );
  const ev = await currentEvaluation(engagementId);
  const withinTolerable = ev
    ? Math.abs(numToCents(ev.known_misstatement) + numToCents(ev.projected_misstatement)) <= numToCents(ev.te_amount)
    : null;
  return {
    ok: Number(open.n) === 0 && ev?.status === 'concluded',
    openExceptions: Number(open.n),
    evaluationConcluded: ev?.status === 'concluded',
    withinTolerable,
  };
}
