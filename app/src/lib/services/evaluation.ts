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

/** A documented response to exceeding tolerable misstatement (migration 0009).
 *  Once known + projected exceeds TE the sample no longer provides a reasonable basis for
 *  a conclusion on the population (ISA/NEP 530 logic): the work is extended, the strategy
 *  is reconsidered, or it is documented why the conclusion holds regardless. Concluding
 *  without recording one of the three is refused. */
export type BlockerCode =
  | 'exceptions_open'
  | 'evaluation_not_concluded'
  | 'tolerable_exceeded_unanswered'
  | 'ledger_provisional';

const BLOCKER_TEXT: Record<BlockerCode, { fr: (d?: string) => string; en: (d?: string) => string }> = {
  exceptions_open: {
    fr: (d) => `${d} anomalie(s) non traitée(s)`,
    en: (d) => `${d} exception(s) not dispositioned`,
  },
  evaluation_not_concluded: {
    fr: () => 'évaluation de l’échantillon non conclue',
    en: () => 'sample evaluation not concluded',
  },
  tolerable_exceeded_unanswered: {
    fr: () => 'anomalie tolérable dépassée sans réponse enregistrée',
    en: () => 'tolerable misstatement exceeded with no recorded response',
  },
  ledger_provisional: {
    fr: (d) => `grand livre provisoire — ${d ?? 'FEC définitif non rapproché'}`,
    en: (d) => `ledger is provisional — ${d ?? 'final ledger not reconciled'}`,
  },
};

export function blockerText(b: { code: BlockerCode; detail?: string }, lang: 'fr' | 'en'): string {
  return BLOCKER_TEXT[b.code][lang](b.detail);
}

export type ResponseKind = 'extend_testing' | 'revise_strategy' | 'conclude_with_justification';

export async function recordEvaluationResponse(
  evaluationId: string,
  userId: string,
  kind: ResponseKind,
  rationale: string,
): Promise<string> {
  if (!rationale.trim()) throw new Error('a rationale is required for the response to the tolerable-misstatement breach');
  const e = await q1<{ sample_id: string }>(`select sample_id from sample_evaluation where id = $1`, [evaluationId]);
  const s = await q1<{ engagement_id: string }>(`select engagement_id from sample where id = $1`, [e.sample_id]);
  const ctx = await engagementCtx(s.engagement_id);
  const row = await q1<{ id: string }>(
    `insert into evaluation_response (engagement_id, evaluation_id, kind, rationale, decided_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [s.engagement_id, evaluationId, kind, rationale, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'evaluation_response_recorded', objectType: 'evaluation_response', objectId: row.id,
    payload: { kind, rationale: rationale.slice(0, 500), evaluationId },
  });
  return row.id;
}

export async function evaluationResponses(evaluationId: string) {
  return q<{ id: string; kind: string; rationale: string; decided_at: string; user_name: string }>(
    `select r.id, r.kind, r.rationale, r.decided_at::text, u.name user_name
     from evaluation_response r join app_user u on u.id = r.decided_by
     where r.evaluation_id = $1 order by r.decided_at`,
    [evaluationId],
  );
}

export async function concludeEvaluation(evaluationId: string, userId: string, basis: string): Promise<void> {
  if (!basis.trim()) throw new Error('conclusion basis required (L4)');
  const e = await q1<{ id: string; sample_id: string; known_misstatement: string; projected_misstatement: string; te_amount: string }>(
    `select id, sample_id, known_misstatement::text, projected_misstatement::text, te_amount::text
     from sample_evaluation where id = $1`,
    [evaluationId],
  );
  const s = await q1<{ engagement_id: string }>(`select engagement_id from sample where id = $1`, [e.sample_id]);

  // gate 1 — exceeding tolerable misstatement blocks the conclusion until answered
  const total = numToCents(e.known_misstatement) + numToCents(e.projected_misstatement);
  const te = numToCents(e.te_amount);
  if (Math.abs(total) > te) {
    const responses = await evaluationResponses(evaluationId);
    if (responses.length === 0) {
      throw new Error(
        `known + projected misstatement (${centsToNum(total)}) exceeds tolerable misstatement (${centsToNum(te)}): ` +
        'the sample is no longer a reasonable basis for a conclusion on the population. Record a response ' +
        '(extend_testing | revise_strategy | conclude_with_justification) before concluding.',
      );
    }
  }

  // gate 2 — a quantified exception may not sit unresolved-but-forgotten
  const gaps = await probativeGaps(s.engagement_id);
  if (gaps.length > 0) {
    throw new Error(
      `cannot conclude while ${gaps.length} exception(s) lack a probative disposition: ` +
      gaps.map((g) => `${g.taxonomy_code} (${g.reason})`).join('; '),
    );
  }

  const ctx = await engagementCtx(s.engagement_id);
  await q(
    `update sample_evaluation set status = 'concluded', conclusion_basis = $2, concluded_by = $3, concluded_at = now() where id = $1`,
    [evaluationId, basis, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'sample_evaluation_concluded', objectType: 'sample_evaluation', objectId: evaluationId,
    payload: { basis, known: e.known_misstatement, projected: e.projected_misstatement, te: e.te_amount },
  });
}

/** Exceptions that are still holding the file open, with the reason each one blocks.
 *  A quantified exception that is neither escalated nor probatively resolved is the exact
 *  hole the founder found: 36 800 € that left the accumulation without an explanation. */
export async function probativeGaps(engagementId: string): Promise<{ id: string; taxonomy_code: string; amount_impact: string | null; reason: string }[]> {
  const rows = await q<{ id: string; taxonomy_code: string; status: string; amount_impact: string | null; disposition: string | null }>(
    `select id, taxonomy_code, status, amount_impact::text, disposition
     from exception where engagement_id = $1 and status not in ('resolved','escalated','scope_limitation')`,
    [engagementId],
  );
  return rows.map((r) => ({
    id: r.id,
    taxonomy_code: r.taxonomy_code,
    amount_impact: r.amount_impact,
    reason:
      r.amount_impact
        ? `quantified ${r.amount_impact} and still ${r.status} — escalate it or resolve it with corroboration`
        : `still ${r.status}`,
  }));
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

/** The conclusion gate (Gate 2): every exception dispositioned, the evaluation concluded,
 *  a tolerable-misstatement breach answered, and the ledger no longer provisional. */
export async function conclusionGate(engagementId: string): Promise<{
  ok: boolean; openExceptions: number; evaluationConcluded: boolean; withinTolerable: boolean | null;
  breachAnswered: boolean; ledgerProvisional: boolean; blockers: { code: BlockerCode; detail?: string }[];
  limitations: { id: string; taxonomy_code: string; amount_impact: string | null }[];
}> {
  const open = await q1<{ n: string }>(
    `select count(*) n from exception where engagement_id = $1 and status in ('open','clarification_requested','explained')`,
    [engagementId],
  );
  const ev = await currentEvaluation(engagementId);
  const withinTolerable = ev
    ? Math.abs(numToCents(ev.known_misstatement) + numToCents(ev.projected_misstatement)) <= numToCents(ev.te_amount)
    : null;
  const responses = ev ? await evaluationResponses(ev.id) : [];
  const breachAnswered = withinTolerable !== false || responses.length > 0;
  const eng = await q1<{ ledger_is_provisional: boolean; ledger_provisional_reason: string | null }>(
    `select ledger_is_provisional, ledger_provisional_reason from engagement where id = $1`,
    [engagementId],
  );

  const limitations = await q<{ id: string; taxonomy_code: string; amount_impact: string | null }>(
    `select id, taxonomy_code, amount_impact::text from exception where engagement_id = $1 and status = 'scope_limitation'`,
    [engagementId],
  );

  // blockers are CODES, not sentences: the workpaper renders them in the pack's language
  // (ADR-023 — no engine string reaches a page)
  const blockers: { code: BlockerCode; detail?: string }[] = [];
  if (Number(open.n) > 0) blockers.push({ code: 'exceptions_open', detail: open.n });
  if (ev?.status !== 'concluded') blockers.push({ code: 'evaluation_not_concluded' });
  if (!breachAnswered) blockers.push({ code: 'tolerable_exceeded_unanswered' });
  if (eng.ledger_is_provisional) {
    blockers.push({ code: 'ledger_provisional', detail: eng.ledger_provisional_reason ?? undefined });
  }
  return {
    ok: blockers.length === 0,
    limitations,
    openExceptions: Number(open.n),
    evaluationConcluded: ev?.status === 'concluded',
    withinTolerable,
    breachAnswered,
    ledgerProvisional: eng.ledger_is_provisional,
    blockers,
  };
}
