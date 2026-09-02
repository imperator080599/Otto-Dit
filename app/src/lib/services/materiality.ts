import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { primaryPack } from '@/lib/packs';
import { proposeMateriality, computeMateriality, benchmarkAggregates, type MaterialityProposal } from '@/lib/kernel/materiality';
import type { TbRow } from '@/lib/kernel/types';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';

// S2 framework-aware materiality: deterministic proposal rule + template rationale (L3 —
// the human validates or adjusts; arithmetic L0). In live mode an LLM can redraft the
// rationale prose (purpose 'drafting', logged as ai_run); the demo path is the
// deterministic template (P4: no LLM where a rule suffices).

async function tbRows(engagementId: string): Promise<TbRow[]> {
  const rows = await q<{ number: string; label: string; debit: string; credit: string; balance: string }>(
    `select a.number, a.label, a.debit::text, a.credit::text, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  );
  if (rows.length === 0) throw new Error('no active current TB — import it first');
  return rows.map((r) => ({
    accountNo: r.number,
    label: r.label,
    debitCents: numToCents(r.debit),
    creditCents: numToCents(r.credit),
    balanceCents: numToCents(r.balance),
  }));
}

function rationaleText(p: MaterialityProposal, lang: 'fr' | 'en'): string {
  const eur = (c: number) => (c / 100).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 0 }) + ' €';
  if (lang === 'fr') {
    return (
      `Référentiel retenu : ${p.benchmarkCode === 'pbt' ? 'résultat courant avant impôt' : p.benchmarkCode} ` +
      `(${eur(p.benchmarkAmountCents)}), taux ${(p.pct * 100).toFixed(1)} %. Règle appliquée : ${p.basis.rule}. ` +
      `Seuil de signification : ${eur(p.amountCents)}. Seuil de planification (${(p.perfPct * 100).toFixed(0)} %) : ${eur(p.perfAmountCents)}. ` +
      `Seuil de remontée des anomalies (${(p.cttPct * 100).toFixed(0)} %) : ${eur(p.cttAmountCents)}. ` +
      `Anomalie tolérable (échantillonnage) : ${eur(p.teAmountCents)}. ` +
      `Agrégats: CA ${eur(p.basis.aggregates.revenueCents)}, RCAI ${eur(p.basis.aggregates.pbtCents)}, ` +
      `total actif ${eur(p.basis.aggregates.totalAssetsCents)}.`
    );
  }
  return (
    `Benchmark: ${p.benchmarkCode} (${eur(p.benchmarkAmountCents)}) at ${(p.pct * 100).toFixed(1)}%. Rule: ${p.basis.rule}. ` +
    `Materiality ${eur(p.amountCents)}; performance materiality (${(p.perfPct * 100).toFixed(0)}%) ${eur(p.perfAmountCents)}; ` +
    `clearly trivial threshold (${(p.cttPct * 100).toFixed(0)}%) ${eur(p.cttAmountCents)}; tolerable misstatement ${eur(p.teAmountCents)}.`
  );
}

export async function propose(engagementId: string, userId: string): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const tb = await tbRows(engagementId);
  /* LE RÉFÉRENTIEL PRÉFÉRÉ À LA CRÉATION (1.1) voyage dans framework_set ; la
     règle du pack décide s'il n'y en a pas, et le motif nomme les deux. */
  const prefere = (fs as { materiality_benchmark?: string }).materiality_benchmark;
  const p = proposeMateriality(tb, pack, prefere === 'pbt' || prefere === 'revenue' ? prefere : undefined);

  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'materiality_proposal','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, engagementId, pack.id, hashObject(pack.materiality), JSON.stringify({ rule: p.basis.rule })],
  );

  const prev = await q<{ version: number }>(
    `select version from materiality where engagement_id = $1 order by version desc limit 1`,
    [engagementId],
  );
  const version = (prev[0]?.version ?? 0) + 1;
  const row = await q1<{ id: string }>(
    `insert into materiality (engagement_id, version, benchmark_code, benchmark_amount, pct,
       amount, perf_pct, perf_amount, ctt_pct, ctt_amount, te_pct, te_amount, rationale, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'proposed') returning id`,
    [
      engagementId, version, p.benchmarkCode, centsToNum(p.benchmarkAmountCents), p.pct,
      centsToNum(p.amountCents), p.perfPct, centsToNum(p.perfAmountCents), p.cttPct,
      centsToNum(p.cttAmountCents), p.tePct, centsToNum(p.teAmountCents),
      rationaleText(p, fs.language),
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'system',
    actorId: null,
    verb: 'materiality_proposed',
    objectType: 'materiality',
    objectId: row.id,
    payload: { version, benchmark: p.benchmarkCode, amount: centsToNum(p.amountCents), engineRun: run.id, requestedBy: userId },
  });
  return row.id;
}

/** Validate the proposal as-is, or adjust benchmark/% first (L3). */
export async function validate(
  materialityId: string,
  userId: string,
  adjust?: { benchmarkCode: string; pct: number },
): Promise<void> {
  const row = await q1<{ id: string; engagement_id: string; version: number; status: string }>(
    `select id, engagement_id, version, status from materiality where id = $1`,
    [materialityId],
  );
  if (row.status !== 'proposed') throw new Error('only a proposed version can be validated');
  const ctx = await engagementCtx(row.engagement_id);
  const fs = await frameworkSet(row.engagement_id);
  const pack = primaryPack(fs as never);

  if (adjust) {
    const tb = await tbRows(row.engagement_id);
    const agg = benchmarkAggregates(tb);
    const base =
      adjust.benchmarkCode === 'pbt' ? agg.pbtCents :
      adjust.benchmarkCode === 'revenue' ? agg.revenueCents :
      adjust.benchmarkCode === 'total_assets' ? agg.totalAssetsCents : agg.equityCents;
    const p = computeMateriality(adjust.benchmarkCode, base, adjust.pct, pack, agg, `manually adjusted by validator (${adjust.benchmarkCode} @ ${(adjust.pct * 100).toFixed(2)}%)`);
    await q(
      `update materiality set benchmark_code=$2, benchmark_amount=$3, pct=$4, amount=$5,
        perf_amount=$6, ctt_amount=$7, te_amount=$8, rationale = rationale || $9 where id = $1`,
      [
        materialityId, p.benchmarkCode, centsToNum(p.benchmarkAmountCents), p.pct, centsToNum(p.amountCents),
        centsToNum(p.perfAmountCents), centsToNum(p.cttAmountCents), centsToNum(p.teAmountCents),
        `\n[Ajusté par le validateur : ${adjust.benchmarkCode} @ ${(adjust.pct * 100).toFixed(2)} %]`,
      ],
    );
  }
  await q(`update materiality set status = 'superseded' where engagement_id = $1 and status = 'validated'`, [row.engagement_id]);
  await q(`update materiality set status = 'validated', validated_by = $2, validated_at = now() where id = $1`, [materialityId, userId]);
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: row.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'materiality_validated',
    objectType: 'materiality',
    objectId: materialityId,
    payload: { version: row.version, adjusted: !!adjust },
  });
}

export async function currentMateriality(engagementId: string) {
  return q01<{
    id: string; version: number; benchmark_code: string; benchmark_amount: string; pct: number;
    amount: string; perf_pct: number; perf_amount: string; ctt_pct: number; ctt_amount: string;
    te_pct: number; te_amount: string; rationale: string; status: string; validated_by: string | null; validated_at: string | null;
  }>(
    `select id, version, benchmark_code, benchmark_amount::text, pct::float, amount::text,
            perf_pct::float, perf_amount::text, ctt_pct::float, ctt_amount::text,
            te_pct::float, te_amount::text, rationale, status, validated_by, validated_at::text
     from materiality where engagement_id = $1 and status in ('proposed','validated')
     order by case status when 'validated' then 0 else 1 end, version desc limit 1`,
    [engagementId],
  );
}

export async function materialityVersions(engagementId: string) {
  return q<{ id: string; version: number; benchmark_code: string; amount: string; status: string; validated_at: string | null }>(
    `select id, version, benchmark_code, amount::text, status, validated_at::text
     from materiality where engagement_id = $1 order by version desc`,
    [engagementId],
  );
}

/** The validated thresholds in cents (used by sampling, scoping, evaluation). */
export async function validatedThresholds(engagementId: string) {
  const m = await q01<{ amount: string; perf_amount: string; ctt_amount: string; te_amount: string }>(
    `select amount::text, perf_amount::text, ctt_amount::text, te_amount::text
     from materiality where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
    [engagementId],
  );
  if (!m) return null;
  return {
    materialityCents: numToCents(m.amount),
    perfCents: numToCents(m.perf_amount),
    cttCents: numToCents(m.ctt_amount),
    teCents: numToCents(m.te_amount),
  };
}
