import { q, q01, q1, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { primaryPack } from '@/lib/packs';
import { proposeMateriality, computeMateriality, benchmarkAggregates, type MaterialityProposal } from '@/lib/kernel/materiality';
import type { TbRow } from '@/lib/kernel/types';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { assertMembre } from '@/lib/core/membre';

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
  await assertMembre(engagementId, userId, 'propose');
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
  /* P1-01 (AUD-01) — import différé : `propositions.ts` importe `applicateurs.ts`, qui importe
     CE fichier (`materiality.validate`) ; un import statique ici ferait un cycle. Même patron
     que `notifications.ts` (`await import('./workpapers/atelier')`). */
  const { proposer } = await import('./propositions');
  await proposer({
    engagementId,
    objectType: 'materiality',
    objectId: row.id,
    valeur: { benchmarkCode: p.benchmarkCode, pct: p.pct },
    aiRunId: null, // moteur déterministe — `proposed_by_ai_run` n'est jamais posé ici, vérifié plus haut dans ce fichier
    engineRunId: run.id,
    sourceKind: 'engine_run',
  });
  return row.id;
}

/** Validate the proposal as-is, or adjust benchmark/% first (L3).
 *
 *  P1-06 (AUD-10) : ajuster ne MUTE plus la version proposée en place — l'écart entre la
 *  proposition ORIGINALE du moteur (déterministe, L0) et la décision AJUSTÉE de l'auditeur
 *  (L3) devenait illisible après coup, la ligne « proposée » ayant elle-même changé de valeur.
 *  L'ajustement crée désormais la version N+1, `status='validated'`, `supersedes_id` vers la
 *  proposition ; la version proposée elle-même passe à `superseded`, INCHANGÉE dans son contenu
 *  d'origine. Valider TEL QUEL (sans ajustement) continue de muter la même ligne en place — rien
 *  n'y est perdu puisque rien n'y change. */
export async function validate(
  materialityId: string,
  userId: string,
  adjust?: { benchmarkCode: string; pct: number },
): Promise<void> {
  const row = await q1<{
    id: string; engagement_id: string; version: number; status: string; rationale: string;
    perf_pct: number; ctt_pct: number; te_pct: number;
  }>(
    `select id, engagement_id, version, status, rationale, perf_pct::float, ctt_pct::float, te_pct::float
     from materiality where id = $1`,
    [materialityId],
  );
  await assertMembre(row.engagement_id, userId, 'valider une matérialité');
  if (row.status !== 'proposed') throw new Error('only a proposed version can be validated');
  const ctx = await engagementCtx(row.engagement_id);
  const fs = await frameworkSet(row.engagement_id);
  const pack = primaryPack(fs as never);

  /* CORRECTIF DE REVUE HOSTILE (P1-06, voix 1, CONFIRMÉ HAUTE, V1-04) : la lecture `row` ci-dessus
     ne CLAME rien — deux appels concurrents sur la MÊME proposition (double clic, deux onglets)
     passaient tous deux `status !== 'proposed'` avant que l'un des deux n'écrive. Chacun créait sa
     propre version validée puis supersédait TOUTE AUTRE ligne validée, y compris celle que l'autre
     venait de poser : l'entrelacement pouvait laisser ZÉRO ligne `validated` au dossier — plus
     aucun seuil pour le sondage ni le scoping. Le CLAIM (l'UPDATE conditionnel `where status =
     'proposed'`) est désormais la PREMIÈRE écriture, atomique, et le reste de la séquence est
     regroupé dans UNE transaction (`tx()`) — un appel qui perd la course s'arrête ici, avec un
     refus clair, avant d'avoir rien écrit d'autre. */
  /* CORRECTIF DE REVUE HOSTILE (P1-08, HAUTE/MOYENNE, convergé indépendamment par les deux
     voix — jugé par lecture de code, ni l'une ni l'autre n'a pu le reproduire : PGlite sérialise
     toutes les transactions, aucune vraie course n'est possible en local). Deux PROPOSITIONS
     DIFFÉRENTES du même dossier, validées quasi simultanément (l'écran affiche bien un second
     panneau « nouvelle proposition en attente » pendant qu'une validation est en cours,
     materiality/page.tsx), peuvent désormais heurter `materiality_validated_unique` — pas le
     CLAIM conditionnel ci-dessus (qui protège la MÊME proposition), un vrai doublon d'index entre
     deux lignes DIFFÉRENTES. Sans ce filet, l'erreur Postgres brute (23505) remonterait telle
     quelle jusqu'au bandeau de refus (`app/refus.ts::executer()` l'affiche verbatim) — même
     patron que `ladder.ts::verifyExtraction` pour `extraction_supersedes_once`. */
  let finalId = materialityId;
  try {
    await tx(async () => {
      /* DÉMOTION AVANT VALIDATION (P1-08, migration 0180) : `materiality_validated_unique`
         (index partiel unique, jamais différable — Postgres n'autorise pas de contrainte unique
         PARTIELLE différée) refuse désormais IMMÉDIATEMENT toute seconde ligne `validated`, y
         compris de façon transitoire DANS cette même transaction. L'ordre d'origine (valider LA
         NOUVELLE ligne, puis démoter l'ancienne) laissait les deux `validated` à la fois pendant
         l'instant entre les deux écritures — l'index le refuse maintenant, cassant la validation
         normale (trouvé par le cas connu mauvais de supersede-lecture.test.ts, règle 17, en
         s'auto-testant). Démoter D'ABORD élimine la fenêtre : au pire une transition
         validated→superseded, jamais deux `validated` en même temps, même transitoirement. */
      await q(`update materiality set status = 'superseded' where engagement_id = $1 and status = 'validated'`, [row.engagement_id]);
      if (adjust) {
        const tb = await tbRows(row.engagement_id);
        const agg = benchmarkAggregates(tb);
        const base =
          adjust.benchmarkCode === 'pbt' ? agg.pbtCents :
          adjust.benchmarkCode === 'revenue' ? agg.revenueCents :
          adjust.benchmarkCode === 'total_assets' ? agg.totalAssetsCents : agg.equityCents;
        const p = computeMateriality(adjust.benchmarkCode, base, adjust.pct, pack, agg, `manually adjusted by validator (${adjust.benchmarkCode} @ ${(adjust.pct * 100).toFixed(2)}%)`);
        /* LE CLAIM : bascule l'originale en `superseded` SEULEMENT si elle est encore `proposed`.
           Aucune ligne rendue → une autre validation a gagné la course entre-temps. */
        const claimee = await q01<{ id: string }>(`update materiality set status = 'superseded' where id = $1 and status = 'proposed' returning id`, [materialityId]);
        if (!claimee) throw new Error('cette proposition vient d’être validée par ailleurs (course concurrente) — rechargez avant de rejouer.');
        const nouvelle = await q1<{ id: string }>(
          `insert into materiality (engagement_id, version, benchmark_code, benchmark_amount, pct,
             amount, perf_pct, perf_amount, ctt_pct, ctt_amount, te_pct, te_amount, rationale, status,
             supersedes_id, validated_by, validated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'validated',$14,$15,now()) returning id`,
          [
            row.engagement_id, row.version + 1, p.benchmarkCode, centsToNum(p.benchmarkAmountCents), p.pct,
            centsToNum(p.amountCents), row.perf_pct, centsToNum(p.perfAmountCents), row.ctt_pct,
            centsToNum(p.cttAmountCents), row.te_pct, centsToNum(p.teAmountCents),
            row.rationale + `\n[Ajusté par le validateur : ${adjust.benchmarkCode} @ ${(adjust.pct * 100).toFixed(2)} %]`,
            materialityId, userId,
          ],
        );
        finalId = nouvelle.id;
      } else {
        /* LE CLAIM, forme « tel quel » : la validation elle-même EST l'écriture conditionnelle. */
        const claimee = await q01<{ id: string }>(
          `update materiality set status = 'validated', validated_by = $2, validated_at = now() where id = $1 and status = 'proposed' returning id`,
          [materialityId, userId],
        );
        if (!claimee) throw new Error('cette proposition vient d’être validée par ailleurs (course concurrente) — rechargez avant de rejouer.');
      }
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === '23505') throw new Error('une autre proposition de ce dossier vient d’être validée par ailleurs (course concurrente) — rechargez avant de rejouer.');
    throw e;
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: row.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'materiality_validated',
    objectType: 'materiality',
    objectId: finalId,
    payload: { version: row.version, adjusted: !!adjust, supersedes: adjust ? materialityId : undefined },
  });
  /* P1-01 (AUD-01) — referme la proposition en attente, qu'on soit venu ici PAR
     `propositions.accepter/modifier` (l'applicateur — elle est déjà refermée, rien à faire) ou
     DIRECTEMENT par l'écran existant (`/eng/[id]/materiality`, le seul chemin aujourd'hui). La
     proposition a été posée sous l'id ORIGINAL (materialityId) — c'est CET id qu'il faut
     résoudre, jamais le nouveau (même patron que verifyExtraction). Import différé : cycle avec
     `propositions/applicateurs.ts`, qui importe `validate`. */
  const { resoudreParObjet } = await import('./propositions');
  await resoudreParObjet(row.engagement_id, 'materiality', materialityId, adjust ? 'modifiee' : 'acceptee', userId,
    adjust ? { benchmarkCode: adjust.benchmarkCode, pct: adjust.pct } : undefined);
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
