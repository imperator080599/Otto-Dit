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
  /* LA REPRISE DU TIRAGE PRÉCÉDENT (ADR-133, étage 1.2). Ré-importer le grand
     livre définitif recrée chaque écriture avec un NOUVEL identifiant ; sans
     ceci, le nouveau tirage désigne les mêmes écritures par des identifiants
     neufs et tout le travail déjà fait — les demandes envoyées, les pièces
     déposées par le client — reste accroché aux anciennes lignes, qu'aucun
     écran n'atteint plus. Mesuré sur le dossier de démonstration : douze
     écritures communes, TRENTE-TROIS pièces devenues inatteignables.

     ON RAPPROCHE PAR `natural_key`, ET C'EST LA MÊME RELATION QUE
     `gl_entry_supersession` : cette table est construite, à l'import, en
     appariant l'ancien et le nouveau PAR CETTE CLÉ (`oldByNk`, imports.ts).
     La lire par jointure donnerait le même résultat en manquant les écritures
     sans prédécesseur enregistré. RIEN N'EST DÉPLACÉ : la ligne neuve DÉSIGNE
     celle dont elle reprend le travail, et les chemins de lecture suivent la
     chaîne — la piste se lit dans les deux sens. */
  const repris = await q<{ id: string }>(
    `update sample_item n set repris_de = p.id
       from gl_entry gn,
            (select distinct on (g.natural_key) g.natural_key nk, si.id
               from sample_item si
               join sample s on s.id = si.sample_id
               join gl_entry g on g.id = si.unit_id
              where s.engagement_id = $2 and s.id <> $1 and s.status = 'superseded'
                and s.procedure_id = $3
              order by g.natural_key, s.created_at desc) p
      where n.sample_id = $1 and gn.id = n.unit_id and gn.natural_key = p.nk
        and n.repris_de is null
      returning n.id::text`,
    [sampleId, s.engagement_id, s.procedure_id]);
  await q(
    `update sample set status = 'drawn', engine_run_id = $2, coverage_amount = $3 where id = $1`,
    [sampleId, run.id, centsToNum(draw.coverageAmountCents)],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: s.engagement_id, actorKind: 'system', actorId: null,
    verb: 'sample_drawn', objectType: 'sample', objectId: sampleId,
    payload: {
      items: draw.selections.length, engineRun: run.id, seed: s.params.seed,
      populationHash: pop.hash, requestedBy: userId,
      /* CE QUE LE TIRAGE A REPRIS, dans le journal : un re-tirage qui récupère
         du travail sans le dire serait aussi opaque qu'un re-tirage qui le
         perd. */
      reprises: repris.length,
    },
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

/* ═══ CE QUI SORT DU TIRAGE, ET QUI NE DISPARAÎT PAS ══════════════════════ */

// LA SECONDE MOITIÉ DE LA RÈGLE (ADR-133, étage 1.2). La première — la reprise
// — évite de perdre le travail des lignes qui RESTENT. Celle-ci s'occupe de
// celles qui PARTENT : une ligne du tirage précédent qui portait du travail et
// que le nouveau tirage ne reprend pas ne s'efface pas de la vue. Elle est
// « hors échantillon courant », elle garde tout ce qu'elle porte, et elle
// BLOQUE le visa tant qu'une personne n'a pas écrit ce qu'on en fait.
//
// POURQUOI BLOQUER, ET NON AVERTIR. Les pièces obtenues d'un client, les écarts
// relevés, les conclusions écrites sont du travail d'audit. Les laisser sortir
// du dossier parce qu'un tirage a changé, sans qu'aucune personne l'ait décidé,
// c'est perdre de la preuve en silence — et un inspecteur qui trouve la trace
// de ce travail dans le journal sans en trouver la conclusion au dossier posera
// exactement cette question.
//
// LES REFUS, nommés :
//   TIRAGE-02  cette ligne n'est pas sortie du tirage — il n'y a rien à statuer
//   TIRAGE-03  une décision sans motif écrit
//   TIRAGE-04  cette ligne est déjà statuée — on ne récrit pas une décision en silence
//
// IL N'Y A PAS DE « TIRAGE-01 : ligne inconnue », ET C'EST VOULU. Une première
// version l'annonçait ici sans qu'aucun `throw` ne le porte — un prédicat
// déclaré et non implémenté, règle 13 mot pour mot, trouvé par la revue
// hostile. Une ligne inconnue est refusée en amont par ETANCH-04, qui donne
// LA MÊME phrase qu'une ligne d'un autre cabinet : un intrus n'apprend pas
// qu'un objet existe (ADR-069/082). Le catalogue dit donc ce que le code fait.

/* UNE SEULE DÉCISION, ET C'EST UNE CORRECTION DE LA NUIT MÊME. La première
   version en offrait deux — « sans suite » et « remise au tirage ». La revue
   hostile a emprunté le second chemin : il écrit la décision, lève l'obstacle,
   et NE REMET RIEN au tirage — la ligne n'apparaît ni dans l'échantillon
   courant ni à l'atelier. Un mot qui promet un geste que rien n'exécute, et
   qui ferme le seul verrou qui aurait rappelé la ligne : c'est pire que son
   absence. Le geste « remettre une ligne au tirage » modifie une sélection
   tirée et signée ; il se conçoit avec un auditeur, pas à deux heures du
   matin. Il est au backlog (R31). Reste la décision qui suffit à la règle :
   constater par écrit que le travail ne suit pas. */
export interface LigneSortie {
  id: string;
  piece: string;
  naturalKey: string;
  montant: string;
  travail: { pieces: number; ecarts: number; cellules: number };
  decision: { quoi: 'sans_suite'; motif: string; qui: string; quand: string } | null;
}

/**
 * Les lignes sorties du tirage qui portent du travail — statuées ou non.
 *
 * OÙ CETTE RÈGLE S'ARRÊTE DE REGARDER, dit ici — et le second point a été
 * trouvé par le parcours de bout en bout, pas prévu :
 *
 * 1. Elle ne compte comme « travail » que ce qui vient d'une personne ou du
 *    client — une pièce reçue, un écart relevé, une cellule de grille remplie.
 *    Le calcul de la machine (un rapprochement, une extraction) se refait : ce
 *    n'est pas une perte.
 *
 * 2. ELLE SE TAIT S'IL N'Y A PAS DE TIRAGE COURANT. « Sortir du tirage »
 *    suppose qu'un nouveau tirage existe. Le parcours de bout en bout importe
 *    le grand livre définitif À LA FIN, une fois tout le testing fait : le
 *    ré-import supersède la sélection (ADR-016) et personne ne re-tire. Sans
 *    cette clause, les seize lignes travaillées devenaient seize obstacles au
 *    visa sur un dossier qui n'a jamais re-tiré — une famille neuve rendant
 *    insignable une mission achevée. C'est le quatrième cas de faux positif,
 *    et c'est `tests/parcours.test.ts` qui l'a trouvé, pas mes trois fixtures.
 *
 * CE QUE CETTE SECONDE CLAUSE LAISSE OUVERT, ET QUI N'EST PAS DE CETTE TRANCHE :
 * un dossier dont la sélection est superseded et qui n'a jamais re-tiré reste
 * signable. C'est le comportement du dépôt AVANT cette nuit (le parcours de
 * bout en bout l'affirme depuis des semaines) ; le corriger serait changer la
 * règle du ré-import, pas celle du re-tirage. Écrit ici plutôt que corrigé en
 * passant — et porté au backlog.
 */
export async function lignesSortiesDuTirage(engagementId: string): Promise<LigneSortie[]> {
  /* LE TIRAGE COURANT DE CHAQUE PROCÉDURE, ET NON « le dernier tiré du
     dossier » (revue hostile de la nuit, constat 1). Un test d'efficacité de
     contrôle (`sox.ts`) insère lui aussi un `sample` en statut `drawn` dans le
     même dossier : s'il était le plus récent, la chaîne des reprises partait de
     SES lignes, aucune reprise du chiffre d'affaires n'y figurait, et les douze
     lignes reprises ressurgissaient comme « sorties » — treize obstacles
     bloquants sur du travail parfaitement atteignable. Mesuré par la revue :
     4 sorties → 15, obstacles 0 → 13. La comparaison se fait donc PROCÉDURE
     PAR PROCÉDURE, comme la reprise (`drawRevenueSample`) la pose. */
  const courants = await q<{ id: string }>(
    `select distinct on (procedure_id) id::text from sample
      where engagement_id = $1 and status = 'drawn'
      order by procedure_id, created_at desc`, [engagementId]);
  if (courants.length === 0) return [];
  return q<LigneSortie & { pieces: string; ecarts: string; cellules: string }>(
    `with recursive courant as (
       select unnest($2::uuid[]) id
     ),
     /* LA CHAÎNE DES REPRISES depuis le tirage courant. Elle est RÉCURSIVE, et
        c'est nécessaire : après un second re-tirage, la ligne d'aujourd'hui
        reprend celle d'hier, qui reprenait celle d'avant-hier. S'arrêter au
        premier maillon ferait ressurgir comme « sortie » une ligne dont le
        travail est parfaitement atteignable — un obstacle au visa fabriqué de
        toutes pièces. */
     chaine(id) as (
       select si.id from sample_item si where si.sample_id in (select id from courant)
       union
       select si.repris_de from sample_item si join chaine c on c.id = si.id
        where si.repris_de is not null
     )
     select si.id::text, g.piece_ref piece, g.natural_key "naturalKey", si.amount::text montant,
            si.sortie_decision, si.sortie_motif, si.sortie_le::text, u.name sortie_qui,
            (select count(*) from request_item ri join evidence e on e.request_item_id = ri.id
              where ri.sample_item_id = si.id and e.quarantined = false)::text pieces,
            (select count(*) from exception x where x.sample_item_id = si.id)::text ecarts,
            (select count(*) from test_cell c where c.sample_item_id = si.id)::text cellules
       from sample_item si
       join sample s on s.id = si.sample_id
       join gl_entry g on g.id = si.unit_id
       left join app_user u on u.id = si.sortie_par
      where s.engagement_id = $1 and s.status = 'superseded'
        and si.id not in (select id from chaine)
        and (exists (select 1 from request_item ri join evidence e on e.request_item_id = ri.id
                      where ri.sample_item_id = si.id and e.quarantined = false)
             or exists (select 1 from exception x where x.sample_item_id = si.id)
             or exists (select 1 from test_cell c where c.sample_item_id = si.id))
        and s.procedure_id in (select procedure_id from sample where id = any($2::uuid[]))
      order by si.amount desc`,
    [engagementId, courants.map((c) => c.id)],
  ).then((rows) => rows.map((r) => {
    const x = r as unknown as Record<string, string | null>;
    return {
      id: r.id, piece: r.piece ?? r.naturalKey, naturalKey: r.naturalKey, montant: r.montant,
      travail: { pieces: Number(r.pieces), ecarts: Number(r.ecarts), cellules: Number(r.cellules) },
      decision: x.sortie_decision
        ? {
            quoi: x.sortie_decision as 'sans_suite',
            motif: x.sortie_motif ?? '', qui: x.sortie_qui ?? '', quand: (x.sortie_le ?? '').slice(0, 10),
          }
        : null,
    };
  }));
}

/** Ce qui reste à statuer — ce que l'obstacle au visa compte. */
export async function sortiesNonStatuees(engagementId: string): Promise<LigneSortie[]> {
  return (await lignesSortiesDuTirage(engagementId)).filter((l) => l.decision === null);
}

/** STATUER une ligne sortie du tirage : constater par écrit que le travail ne suit pas. */
export async function statuerSortie(o: {
  sampleItemId: string; decision: 'sans_suite'; motif: string; userId: string;
}): Promise<void> {
  const engagementId = await assertMembreDe('sample_item', o.sampleItemId, o.userId,
    'statuer une ligne sortie du tirage');
  if (!o.motif?.trim()) {
    throw new Error('TIRAGE-03 : une ligne sortie du tirage se statue par écrit — le motif est la décision');
  }
  const sorties = await lignesSortiesDuTirage(engagementId);
  const ligne = sorties.find((l) => l.id === o.sampleItemId);
  if (!ligne) {
    throw new Error('TIRAGE-02 : cette ligne n’est pas sortie du tirage courant — il n’y a rien à y statuer');
  }
  /* ON NE RÉCRIT PAS UNE DÉCISION EN SILENCE (revue hostile, constat 7). La
     première version laissait la seconde décision écraser la première : celle
     de Léa ne survivait que dans le journal, et l'écran ne montrait que la
     dernière — « une décision qu'on ne peut plus revoir », règle 13. */
  if (ligne.decision) {
    throw new Error(`TIRAGE-04 : cette ligne est déjà statuée par ${ligne.decision.qui} le ${ligne.decision.quand} `
      + '— revenir sur une décision écrite se fait par une note de revue, pas en la recouvrant');
  }
  await q(
    `update sample_item set sortie_decision = $2, sortie_motif = $3, sortie_par = $4, sortie_le = now()
      where id = $1`,
    [o.sampleItemId, o.decision, o.motif.trim(), o.userId],
  );
  const ctx = await engagementCtx(engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: o.userId,
    verb: 'sample_item_sortie_statuee', objectType: 'sample_item', objectId: o.sampleItemId,
    payload: { decision: o.decision, motif: o.motif.trim() },
  });
}

export { numToCents };
