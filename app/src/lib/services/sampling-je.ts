import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { monetaryDraw } from '@/lib/kernel/sampling';
import { centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { validatedThresholds } from './materiality';
import { journalEntryPopulation, type JournalEntryPredicate, type PopulationRow } from './population';
import { planifierProcedure } from './programme';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// Lot 6, tranche 3 (NEP 240, ISA 240) — test des écritures de journal à risque : MANUEL
// (ecritures_manuelles, méthodologie/procedures.json) et FRAUDE (ecritures_marqueurs_fraude,
// même fichier). MÊME PATRON que sampling.ts (propose L3 → valide humain → tire L0), jamais
// une variante : `validateSampleParams` (sampling.ts) est déjà générique sur `sample.id`,
// réutilisée ici SANS DUPLICATION. Ce qui EST dupliqué (propose/draw/current) l'est parce que
// `sampling.ts` les câble en dur sur `revenuePopulation()`/`template_code = 'REV-SUBST'`
// (ADR-016 : jamais toucher ce chemin, le plus exercé du dépôt) — ce fichier est le chemin
// PARALLÈLE que le mandat de nuit demandait, générique sur `templateCode` au lieu de figé.
//
// LE TIRAGE EST TOUJOURS EXHAUSTIF SUR LA POPULATION FILTRÉE, ET C'EST UN EFFET DE BORD
// VOULU DE monetaryDraw (kernel/sampling.ts), PAS UNE RÉÉCRITURE : `journalEntryPopulation`
// ne retient QUE les lignes déjà marquées par le prédicat (`flags.length > 0` pour chacune),
// et monetaryDraw sélectionne INCONDITIONNELLEMENT tout élément flaggé (`risk_flag`), même
// sous le seuil de couverture. Toute ligne manuelle/marquée fraude entre donc dans
// l'échantillon — la pratique NEP 240 (examiner les écritures identifiées, pas un sondage
// dessus) — sans qu'aucune branche spéciale n'ait été écrite pour l'obtenir.
//
// CE QUE CE FICHIER NE FAIT PAS (règle 19) : il ne construit AUCUN atelier interactif — la
// grille de test de REV-SUBST (`testing/grille.ts`) reste câblée sur ce seul template. Une
// procédure MANUEL/FRAUDE planifiée et tirée n'a donc pas d'écran où revoir chaque ligne une
// par une (disclosed R104, docs/BACKLOG_REPORTE.md). `flows/part1.ts` ne plante PAS ces
// procédures dans le monde semé pour cette même raison — même choix que CLIENTS-AVOIRS/R92 et
// IMMO_COR-TAB/IMMO_COR-ACQ/R95 (programme.ts) : commandée, planifiable par un geste réel
// (bouton « planifier » de `/programme`, déjà générique), sans atelier construit cette tranche.
// « saisie par la direction » (le second volet du `population.filtre` de MANUEL ET de FRAUDE
// dans la méthode) reste NON calculé — `gl_entry` ne porte aucune colonne auteur/rôle
// (0001_core.sql vérifié avant d'écrire ce fichier) ; disclosed R104 aussi.

const TEMPLATE_PREDICATE: Record<'MANUEL' | 'FRAUDE', JournalEntryPredicate> = {
  MANUEL: 'ecritures_manuelles',
  FRAUDE: 'ecritures_marqueurs_fraude',
};

export async function proposeJournalEntrySample(
  engagementId: string,
  fsliCode: string,
  templateCode: 'MANUEL' | 'FRAUDE',
  userId: string,
): Promise<string> {
  await assertMembre(engagementId, userId, 'proposeJournalEntrySample');
  const ctx = await engagementCtx(engagementId);
  const thresholds = await validatedThresholds(engagementId);
  if (!thresholds) throw new Error('validated materiality required before sampling');
  const pop = await journalEntryPopulation(engagementId, fsliCode, TEMPLATE_PREDICATE[templateCode]);

  const { id: procedureId } = await planifierProcedure({ engagementId, fsliCode, code: templateCode, userId });
  const params = {
    coverageCapCents: Math.round(thresholds.perfCents),
    randomSize: 0, // la population est déjà filtrée par le prédicat (voir en-tête) : rien à tirer en plus
    seed: `${templateCode.toLowerCase()}-v1`,
  };
  const rationale = templateCode === 'MANUEL'
    ? `NEP 240 : examen de toutes les écritures manuelles identifiées sur le poste, `
      + `population de ${pop.units.length} écriture(s).`
    : `NEP 240 : examen de toutes les écritures porteuses d'un indicateur de risque de fraude `
      + `(week-end, montant rond au millier, validation après la clôture), population de ${pop.units.length} écriture(s).`;

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
    payload: { params, populationHash: pop.hash, templateCode, fsliCode, requestedBy: userId },
  });
  return row.id;
}

export async function drawJournalEntrySample(
  sampleId: string,
  userId: string,
  fsliCode: string,
  templateCode: 'MANUEL' | 'FRAUDE',
): Promise<{ items: number }> {
  await assertMembreDe('sample', sampleId, userId, 'tirer un échantillon');
  const s = await q1<{ id: string; engagement_id: string; params: { coverageCapCents: number; randomSize: number; seed: string }; status: string; population_hash: string }>(
    `select id, engagement_id, params, status, population_hash from sample where id = $1`,
    [sampleId],
  );
  if (s.status !== 'validated') throw new Error('validate the sampling parameters first (L3)');
  const ctx = await engagementCtx(s.engagement_id);
  const pop = await journalEntryPopulation(s.engagement_id, fsliCode, TEMPLATE_PREDICATE[templateCode]);
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
  const byNk = new Map<string, PopulationRow>(pop.rows.map((r) => [r.naturalKey, r]));
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
    payload: { items: draw.selections.length, engineRun: run.id, seed: s.params.seed, populationHash: pop.hash, templateCode, requestedBy: userId },
  });
  return { items: draw.selections.length };
}

export async function currentJournalEntrySample(engagementId: string, templateCode: 'MANUEL' | 'FRAUDE') {
  const s = await q01<{
    id: string; status: string; params: { coverageCapCents: number; randomSize: number; seed: string };
    seed: string; population_hash: string; population_size: number; population_amount: string;
    coverage_amount: string | null; rationale: string | null; validated_at: string | null;
  }>(
    `select s.id, s.status, s.params, s.seed, s.population_hash, s.population_size,
            s.population_amount::text, s.coverage_amount::text, s.rationale, s.validated_at::text
     from sample s join procedure_instance p on p.id = s.procedure_id
     where s.engagement_id = $1 and p.template_code = $2 and s.status <> 'superseded'
     order by s.created_at desc limit 1`,
    [engagementId, templateCode],
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
     order by si.amount desc`,
    [s.id],
  );
  return { ...s, items };
}
