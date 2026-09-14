import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { evaluateSample, type MisstatementLine, type ExtrapolationMethod } from '@/lib/kernel/projection';
import { centsToNum, numToCents } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { validatedThresholds } from './materiality';
import { frameworkSet } from './fsli';
import { primaryPack } from '@/lib/packs';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// Gate 2 (audit partner): sample evaluation inside the procedure workpaper — known +
// projected misstatement vs tolerable misstatement, computed L0, concluded L4. The
// conclusion gate is: all exceptions dispositioned AND the aggregate evaluated vs TE.

export async function computeSampleEvaluation(
  engagementId: string, userId: string | null,
  /** RECOUVREMENT DE MÉTHODE, réservé aux tests (jamais un chemin humain/écran — la méthode
   *  RÉELLE vit dans `SubstantiveConfig.extrapolationMethod`, un paramètre de pack, EXTRAP-04).
   *  Nécessaire pour éprouver le chemin « méthode vérifiée » avant que le cabinet ne l'ait
   *  posée dans `nep-fr.ts` — même patron que `_reinitialiserGardeBudgetEnBasePourSonde`
   *  (budget.ts) : un recouvrement nommé, jamais un défaut silencieux. */
  methodOverrideForTest?: ExtrapolationMethod | null,
): Promise<string> {
  await assertMembre(engagementId, userId, 'computeSampleEvaluation');
  const ctx = await engagementCtx(engagementId);
  const thresholds = await validatedThresholds(engagementId);
  if (!thresholds) throw new Error('validated materiality required');
  const sample = await q1<{ id: string; population_amount: string; coverage_amount: string | null; population_size: number }>(
    `select s.id, s.population_amount::text, s.coverage_amount::text, s.population_size
     from sample s join procedure_instance p on p.id = s.procedure_id
     where s.engagement_id = $1 and p.template_code = 'REV-SUBST' and s.status = 'drawn'
     order by s.created_at desc limit 1`,
    [engagementId],
  );
  // stratum amounts + counts: 100%-examined strata = high_value + risk_flag (EXTRAP-02 :
  // ces deux strates n'entrent JAMAIS dans la strate « sondée » ci-dessous).
  //
  // CE QUE CE REGROUPEMENT NE COUVRE PAS (règle 19) : `sample_item.selection_reason` admet
  // aussi 'carried_forward' (0002_testing.sql) — ni `coverageTested`/`coverageCount` (exhaustif)
  // ni `randomTested`/`randomCount` (sondé) ne le comptent, donc un élément reporté de N-1
  // n'entrerait dans AUCUNE strate ici : sa valeur comptable et tout écart qui lui serait
  // attaché disparaîtraient du connu ET du projeté. Vérifié à l'écriture de cette tranche
  // (2026-09-14) : aucun chemin du dépôt n'écrit encore 'carried_forward' dans cette colonne
  // (seule `atelier.ts` porte le LIBELLÉ, jamais la valeur) — le trou est donc RÉEL mais pas
  // encore ATTEIGNABLE. S'il le devient, ce regroupement devra le rattacher explicitement
  // (probablement à la strate exhaustive, puisqu'un report de N-1 n'est jamais un tirage
  // aléatoire nouveau) avant que cette tranche puisse rester vraie.
  const strata = await q<{ selection_reason: string; tested: string; n: string }>(
    `select si.selection_reason, coalesce(sum(si.amount),0)::text tested, count(*)::text n
     from sample_item si where si.sample_id = $1 group by si.selection_reason`,
    [sample.id],
  );
  const testedBy = (r: string) => numToCents(strata.find((s) => s.selection_reason === r)?.tested ?? '0');
  const countBy = (r: string) => Number(strata.find((s) => s.selection_reason === r)?.n ?? '0');
  const coverageTested = testedBy('high_value') + testedBy('risk_flag');
  const coverageCount = countBy('high_value') + countBy('risk_flag');
  const randomTested = testedBy('random');
  const randomCount = countBy('random');

  const mis = await q<{ selection_reason: string; amount: string; item_amount: string | null }>(
    `select si.selection_reason, m.amount::text, si.amount::text item_amount
     from misstatement m
     join exception x on x.id = m.exception_id
     join sample_item si on si.id = x.sample_item_id
     where m.engagement_id = $1 and m.status in ('proposed','confirmed') and m.corrected = false`,
    [engagementId],
  );
  const coverageMis = mis.filter((m) => m.selection_reason !== 'random').reduce((s, m) => s + numToCents(m.amount), 0);
  const randomMis: MisstatementLine[] = mis
    .filter((m) => m.selection_reason === 'random')
    .map((m) => ({ amountCents: numToCents(m.amount), itemAmountCents: numToCents(m.item_amount) }));

  // EXTRAP-04 : la méthode est un paramètre de CABINET (SubstantiveConfig.extrapolationMethod,
  // packs/types.ts), `undefined` = non vérifié — jamais devinée ici.
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const method = methodOverrideForTest !== undefined ? methodOverrideForTest : (pack.substantive?.extrapolationMethod ?? null);

  const result = evaluateSample({
    method,
    populationAmountCents: numToCents(sample.population_amount),
    coverageAmountCents: coverageTested,
    populationSize: sample.population_size,
    coverageCount,
    randomTestedAmountCents: randomTested,
    randomTestedCount: randomCount,
    coverageMisstatementCents: coverageMis,
    randomMisstatements: randomMis,
    teAmountCents: thresholds.teCents,
  });

  await q(`update sample_evaluation set status = 'superseded' where sample_id = $1 and status = 'draft'`, [sample.id]);
  const prev = await q<{ version: number }>(`select version from sample_evaluation where sample_id = $1 order by version desc limit 1`, [sample.id]);
  const row = await q1<{ id: string }>(
    `insert into sample_evaluation (sample_id, version, known_misstatement, projected_misstatement,
       projection_method, tested_coverage_amount, tested_random_amount, untested_amount, te_amount,
       random_misstatement, random_misstatement_count, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft') returning id`,
    [
      sample.id, (prev[0]?.version ?? 0) + 1,
      centsToNum(result.knownMisstatementCents), centsToNum(result.projectedMisstatementCents),
      result.projectionMethod, centsToNum(coverageTested), centsToNum(randomTested),
      centsToNum(result.untestedAmountCents), centsToNum(result.teAmountCents),
      centsToNum(result.randomMisstatementCents), result.randomMisstatementCount,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'sample_evaluation_computed', objectType: 'sample_evaluation', objectId: row.id,
    payload: {
      known: centsToNum(result.knownMisstatementCents),
      projected: centsToNum(result.projectedMisstatementCents),
      method: result.projectionMethod,
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
  await assertMembreDe('sample_evaluation', evaluationId, userId, 'répondre à une évaluation d’échantillon');
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
  await assertMembreDe('sample_evaluation', evaluationId, userId, 'conclure une évaluation d’échantillon');
  if (!basis.trim()) throw new Error('conclusion basis required (L4)');
  const e = await q1<{
    id: string; sample_id: string; known_misstatement: string; projected_misstatement: string;
    te_amount: string; projection_method: string; tested_random_amount: string; random_misstatement: string;
    random_misstatement_count: number;
  }>(
    `select id, sample_id, known_misstatement::text, projected_misstatement::text, te_amount::text,
            projection_method, tested_random_amount::text, random_misstatement::text, random_misstatement_count
     from sample_evaluation where id = $1`,
    [evaluationId],
  );
  const s = await q1<{ engagement_id: string }>(`select engagement_id from sample where id = $1`, [e.sample_id]);

  // EXTRAP-01 (mandat 2026-09-14, §1.2/§1.6 point 1 : « un poste sondé AVEC UN ÉCART ne se
  // conclut pas sans projection »). RÉVISÉ le 2026-09-14 à DEUX REPRISES (revue hostile, quatre
  // voix indépendantes au total sur les deux rounds, toutes convergentes) :
  //   round 1 : la première version déclenchait ce refus dès qu'une strate sondée EXISTAIT
  //   (`tested_random_amount > 0`), sans regarder si elle portait un écart — plus large que ce
  //   que le mandat exige, INCONCLUABLE tout poste dont la strate aléatoire était simplement
  //   PROPRE. Corrigé avec `random_misstatement` (migration 0160, la somme SIGNÉE des écarts).
  //   round 2 : `random_misstatement` étant une somme signée, deux écarts RÉELS qui se
  //   compensent exactement (ex. +500 € et -500 €, deux factures distinctes, chacune un vrai
  //   écart non corrigé) sommaient à 0 — la strate se lisait PROPRE alors que deux écarts non
  //   investigués existent. Le mandat parle de la PRÉSENCE d'écarts, jamais de leur somme nette.
  // `random_misstatement_count` (migration 0161) porte le NOMBRE de lignes, indépendant du
  // signe : ce refus déclenche désormais quand AU MOINS UNE ligne d'écart existe dans la strate
  // sondée ET que la méthode reste non vérifiée — une strate sondée propre (compte nul), ou une
  // méthode déjà vérifiée, reste conclûable sans ce refus.
  if (e.random_misstatement_count > 0 && e.projection_method === 'none') {
    throw new Error(
      'EXTRAP-01 : la strate sondée de ce poste porte un écart mais aucune projection à la '
      + 'population n\'a été calculée — la méthode d\'extrapolation du cabinet '
      + '(SubstantiveConfig.extrapolationMethod) n\'est pas encore vérifiée (EXTRAP-04). '
      + 'Impossible de conclure sans elle.',
    );
  }

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
    untested_amount: string; te_amount: string; random_misstatement: string;
    random_misstatement_count: number; status: string;
    conclusion_basis: string | null; concluded_by: string | null; concluded_at: string | null;
  }>(
    `select se.id, se.version, se.known_misstatement::text, se.projected_misstatement::text,
            se.projection_method, se.tested_coverage_amount::text, se.tested_random_amount::text,
            se.untested_amount::text, se.te_amount::text, se.random_misstatement::text,
            se.random_misstatement_count, se.status,
            se.conclusion_basis, se.concluded_by, se.concluded_at::text
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
