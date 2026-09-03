import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { monetaryDraw } from '@/lib/kernel/sampling';
import { primaryPack } from '@/lib/packs';
import { centsToNum, numToCents } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { validatedThresholds } from './materiality';
import { revenuePopulation } from './population';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// S3 sampling flows: propose (L3, pack defaults + rationale) → validate (human, may edit)
// → draw (L0, kernel, engine_run recorded). Deterministic given (population, seed, params).

export async function ensureRevenueProcedure(engagementId: string): Promise<string> {
  const existing = await q01<{ id: string }>(
    `select id from procedure_instance where engagement_id = $1 and template_code = 'REV-SUBST'`,
    [engagementId],
  );
  if (existing) return existing.id;
  const fs = await frameworkSet(engagementId);
  const row = await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, status)
     values ($1, $2, 'REV-SUBST', 'substantive', 'REVENUE', $3, 'in_progress') returning id`,
    [engagementId, fs.assurance_packs[0], fs.language === 'fr' ? 'Contrôle substantif du chiffre d’affaires' : 'Revenue substantive testing'],
  );
  return row.id;
}

export async function proposeRevenueSample(engagementId: string, userId: string): Promise<string> {
  await assertMembre(engagementId, userId, 'proposeRevenueSample');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const sub = pack.substantive!;
  const thresholds = await validatedThresholds(engagementId);
  if (!thresholds) throw new Error('validated materiality required before sampling');
  const pop = await revenuePopulation(engagementId);
  if (!pop.gate.ok) {
    throw new Error(`population gate: open reconciliation differences on ${pop.gate.blocking.join(', ')} — document or resolve first`);
  }
  const procedureId = await ensureRevenueProcedure(engagementId);
  const coverageCapCents = Math.round(thresholds.perfCents * sub.coverageCapPctOfPM);
  const params = {
    coverageCapCents,
    randomSize: sub.randomSizeDefault,
    seed: sub.seedDefault,
  };
  const rationale =
    `Méthode : couverture exhaustive des éléments ≥ seuil de planification (${centsToNum(coverageCapCents)} €, ` +
    `${(sub.coverageCapPctOfPM * 100).toFixed(0)} % du seuil de planification), sélection de tous les éléments ` +
    `porteurs d'indicateurs de risque (week-end, montant rond, OD manuelle, avoirs récurrents), puis tirage aléatoire ` +
    `de ${sub.randomSizeDefault} éléments (germe déterministe « ${sub.seedDefault} », reproductible). ` +
    `Anomalie tolérable : ${centsToNum(thresholds.teCents)} € (évaluation par projection sur la strate aléatoire).`;

  await q(`update sample set status = 'superseded' where engagement_id = $1 and procedure_id = $2 and status = 'proposed'`, [engagementId, procedureId]);
  const row = await q1<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash,
       population_size, population_amount, rationale, status)
     values ($1,$2,'monetary_coverage_random',$3,$4,$5,$6,$7,$8,'proposed') returning id`,
    [
      engagementId, procedureId, JSON.stringify(params), params.seed, pop.hash,
      pop.units.length, centsToNum(pop.totalCents), rationale,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'sample_proposed', objectType: 'sample', objectId: row.id,
    payload: { params, populationHash: pop.hash, requestedBy: userId },
  });
  return row.id;
}

export async function validateSampleParams(
  sampleId: string,
  userId: string,
  edits?: { coverageCapCents?: number; randomSize?: number; seed?: string },
): Promise<void> {
  await assertMembreDe('sample', sampleId, userId, 'valider les paramètres d’un échantillon');
  const s = await q1<{ id: string; engagement_id: string; params: { coverageCapCents: number; randomSize: number; seed: string }; status: string }>(
    `select id, engagement_id, params, status from sample where id = $1`,
    [sampleId],
  );
  if (s.status !== 'proposed') throw new Error('only a proposed sample can be validated');
  const ctx = await engagementCtx(s.engagement_id);
  const params = { ...s.params, ...Object.fromEntries(Object.entries(edits ?? {}).filter(([, v]) => v !== undefined && v !== '')) };
  await q(
    `update sample set params = $2, seed = $3, status = 'validated', validated_by = $4, validated_at = now() where id = $1`,
    [sampleId, JSON.stringify(params), params.seed, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'sample_params_validated', objectType: 'sample', objectId: sampleId,
    payload: { params, edited: !!edits && Object.keys(edits).length > 0 },
  });
}

export async function drawRevenueSample(sampleId: string, userId: string): Promise<{ items: number }> {
  await assertMembreDe('sample', sampleId, userId, 'tirer un échantillon');
  const s = await q1<{ id: string; engagement_id: string; procedure_id: string; params: { coverageCapCents: number; randomSize: number; seed: string }; status: string; population_hash: string }>(
    `select id, engagement_id, procedure_id, params, status, population_hash from sample where id = $1`,
    [sampleId],
  );
  if (s.status !== 'validated') throw new Error('validate the sampling parameters first (L3)');
  const ctx = await engagementCtx(s.engagement_id);
  const pop = await revenuePopulation(s.engagement_id);
  if (pop.hash !== s.population_hash) {
    throw new Error('population changed since the proposal (hash mismatch) — re-propose the sample (ADR-016)');
  }
  const fs = await frameworkSet(s.engagement_id);
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'sampling','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, s.engagement_id, fs.assurance_packs[0], hashObject(s.params), JSON.stringify({ populationHash: pop.hash, ...s.params })],
  );
  const draw = monetaryDraw(pop.units, s.params, pop.hash);
  const byNk = new Map(pop.rows.map((r) => [r.naturalKey, r]));
  for (const sel of draw.selections) {
    const row = byNk.get(sel.id)!;
    await q(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason, amount)
       values ($1, 'gl_entry', $2, $3, $4)`,
      [sampleId, row.id, sel.reason, centsToNum(Math.abs(sel.amountCents))],
    );
  }
  await q(
    `update sample set status = 'drawn', engine_run_id = $2, coverage_amount = $3 where id = $1`,
    [sampleId, run.id, centsToNum(draw.coverageAmountCents)],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'system', actorId: null,
    verb: 'sample_drawn', objectType: 'sample', objectId: sampleId,
    payload: { items: draw.selections.length, engineRun: run.id, seed: s.params.seed, populationHash: pop.hash, requestedBy: userId },
  });
  return { items: draw.selections.length };
}

export async function currentRevenueSample(engagementId: string) {
  const s = await q01<{
    id: string; status: string; params: { coverageCapCents: number; randomSize: number; seed: string };
    seed: string; population_hash: string; population_size: number; population_amount: string;
    coverage_amount: string | null; rationale: string | null; validated_at: string | null;
  }>(
    `select s.id, s.status, s.params, s.seed, s.population_hash, s.population_size,
            s.population_amount::text, s.coverage_amount::text, s.rationale, s.validated_at::text
     from sample s join procedure_instance p on p.id = s.procedure_id
     where s.engagement_id = $1 and p.template_code = 'REV-SUBST' and s.status <> 'superseded'
     order by s.created_at desc limit 1`,
    [engagementId],
  );
  if (!s) return null;
  const items = await q<{
    id: string; unit_id: string; selection_reason: string; amount: string; status: string;
    natural_key: string; entry_no: string; entry_date: string; account_no: string;
    piece_ref: string | null; aux_label: string | null; label: string | null; flags: string[];
  }>(
    `select si.id, si.unit_id, si.selection_reason, si.amount::text, si.status,
            g.natural_key, g.entry_no, g.entry_date::text, g.account_no, g.piece_ref, g.aux_label, g.label, g.flags
     from sample_item si join gl_entry g on g.id = si.unit_id
     where si.sample_id = $1
     order by case si.selection_reason when 'high_value' then 0 when 'risk_flag' then 1 else 2 end, si.amount desc`,
    [s.id],
  );
  return { ...s, items };
}

export { numToCents };
