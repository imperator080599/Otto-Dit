import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper, } from '@/lib/services/workpapers/draft';
import { signWorkpaper, notesDeLaMission } from '@/lib/services/workpapers/lifecycle';
import { sectionsDuDossier } from '@/lib/services/sections';
import { obstaclesAuVisa } from '@/lib/services/obstacles';
import { questionnaireObstacles } from '@/lib/services/questionnaire';
import { vuePoste } from '@/lib/services/poste';
import { lireProcessus } from '@/lib/services/processus';
import { enrichirMondeDemo, joursOuvresAvant } from './enrichir';
import { planifierProcedure, redigerPapierDeProcedure } from '@/lib/services/programme';

// LE MONDE ENRICHI (mandat de nuit n°2, 1.1) — additif, rejouable, et ce
// qu'il promet se lit dans les services que les écrans lisent.
//
// Le cas connu MAUVAIS de l'idempotence : deux passages doivent laisser les
// MÊMES comptes de lignes ; un enrichissement qui doublerait les notes ou les
// papiers au second passage est exactement ce qu'un déploiement quotidien
// ferait sur la démonstration publique.

const ENG = IDS.engNep;

describe('joursOuvresAvant', () => {
  it('saute les samedis et dimanches', () => {
    /* Lundi 7 septembre 2026 : 1 jour ouvré avant = vendredi 4. */
    const lundi = new Date('2026-09-07T10:00:00Z');
    expect(joursOuvresAvant(1, lundi).toISOString().slice(0, 10)).toBe('2026-09-04');
    expect(joursOuvresAvant(5, lundi).toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(joursOuvresAvant(0, lundi).toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('enrichirMondeDemo', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    const wpId = await draftRevenueWorkpaper(ENG, IDS.users.karim);
    const { enregistrerIpe } = await import('@/lib/services/ipe');
    const fec = await q01<{ id: string }>(`select id::text from import_file where engagement_id = $1 and kind in ('fec','gl_generic') order by created_at desc limit 1`, [ENG]);
    await enregistrerIpe(wpId, {
      utilisee: true, nature: 'systeme', rapportCode: 'FEC-2025', importFileId: fec!.id,
      exhaustivite: 'Total rapproché.', exactitude: 'Quatre lignes rapprochées.', dateDocument: '2025-12-31', approprie: true,
    }, IDS.users.karim);
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
  }, 300000);

  const comptes = async () => q01<Record<string, string>>(
    `select (select count(*) from workpaper where engagement_id = $1)::text papiers,
            (select count(*) from review_note where engagement_id = $1)::text notes,
            (select count(*) from procedure_instance where engagement_id = $1)::text procedures,
            (select count(*) from section_state where engagement_id = $1)::text sections,
            (select count(*) from control where engagement_id = $1)::text controles,
            (select count(*) from process_model where engagement_id = $1)::text processus,
            (select count(*) from test_line_conclusion where engagement_id = $1)::text conclues,
            (select count(*) from fsli_analytique where engagement_id = $1)::text analytique,
            (select count(*) from engagement_member where engagement_id = $1 and exited_on is null)::text membres,
            /* LA PISTE D'AUDIT COMPTE (revue hostile n°7, constat 2) : le
               compteur regardait neuf tables et pas event_log — un geste
               humain fabriqué à chaque déploiement (risque évalué, périmètre
               reconfirmé) passait donc pour de l'idempotence. Le cas connu
               mauvais existait et l'instrument ne le voyait pas (règle 17). */
            (select count(*) from event_log where engagement_id = $1)::text evenements`, [ENG]);

  it('refuse de fabriquer une procédure hors méthode ou hors périmètre (PROG-01/02/03)', async () => {
    await expect(planifierProcedure({ engagementId: ENG, fsliCode: 'REVENUE', code: 'PROCEDURE-INVENTEE', userId: IDS.users.karim })).rejects.toThrow(/PROG-01/);
    await expect(planifierProcedure({ engagementId: ENG, fsliCode: 'REVENUE', code: 'STOCKS-INV', userId: IDS.users.karim })).rejects.toThrow(/PROG-02/);
    await expect(planifierProcedure({ engagementId: ENG, fsliCode: 'PAYROLL', code: 'RA', userId: IDS.users.karim })).rejects.toThrow(/PROG-03/);
  });

  it('enrichit sans remplacer : quatre états de section, papiers à visas différents dont un périmé, notes datées dont une sur une cellule, processus et matrice, lignes conclues', async () => {
    const avant = await comptes();
    const famillesAvant = new Set((await obstaclesAuVisa(ENG)).map((o) => o.famille));
    const r = await enrichirMondeDemo();
    const manques = r.etapes.filter((e) => !e.fait);
    expect(manques, manques.map((e) => `${e.nom} : ${e.detail}`).join('\n')).toEqual([]);

    /* Rien n'a été remplacé : REV-01 est toujours visé, et il y a PLUS de tout. */
    const apres = await comptes();
    const rev01 = await q01<{ status: string }>(`select status from workpaper where engagement_id = $1 and code = 'REV-01' order by version desc limit 1`, [ENG]);
    expect(rev01!.status).toBe('signed');
    for (const k of Object.keys(avant!)) expect(Number(apres![k]), k).toBeGreaterThanOrEqual(Number(avant![k]));
    expect(Number(apres!.membres)).toBe(Number(avant!.membres) + 1);

    /* Les quatre états, et quatre membres qui détiennent ou répondent. */
    const secs = await sectionsDuDossier(ENG);
    expect(new Set(secs.map((s) => s.statut))).toEqual(new Set(['not_started', 'in_preparation', 'completed', 'reviewed']));
    const personnes = new Set(secs.flatMap((s) => [s.ownerId, s.holderId]).filter(Boolean));
    expect(personnes.size).toBe(4);

    /* Les papiers du poste : un visé (au-delà de REV-01), un en préparation, un dont le visa est périmé. */
    const v = (await vuePoste(ENG, 'REVENUE'))!;
    const statuts = new Set(v.papiers.map((p) => p.status));
    expect(v.papiers.length).toBeGreaterThanOrEqual(5);
    expect(statuts.has('draft') && statuts.has('in_review') && statuts.has('signed') && statuts.has('outdated')).toBe(true);
    expect(v.visas.find((x) => x.role === 'preparer_validator')!.etat).toBe('perime');
    expect(v.visas.find((x) => x.role === 'partner')!.etat).toBe('vise');

    /* Les notes : ouvertes, d'ancienneté variable, une sur une cellule de grille, une sur une cellule de leadsheet. */
    const notes = (await notesDeLaMission(ENG)).filter((n) => n.status === 'open');
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((n) => n.anchor_kind === 'sample_item' && n.anchor_field === 'montant_ht')).toBe(true);
    expect(notes.some((n) => n.anchor_kind === 'compte')).toBe(true);
    const ages = new Set(notes.map((n) => n.created_at.slice(0, 10)));
    expect(ages.size).toBeGreaterThanOrEqual(3);

    /* Le processus (N et N-1, rien à statuer) et la matrice. */
    const proc = await lireProcessus(ENG, 'REVENUE');
    expect(Boolean(proc.n && proc.n1)).toBe(true);
    expect(Number(apres!.controles)).toBeGreaterThan(0);
    expect(Number(apres!.conclues)).toBeGreaterThan(0);
    expect(Number(apres!.analytique)).toBe(1);

    /* AUCUNE nouvelle famille d'obstacles : le monde enrichi est aussi signable
       qu'avant — les familles d'après sont un sous-ensemble de celles d'avant
       (le monde de base en porte déjà, ce n'est pas l'enrichissement qui les
       crée), et le poste ajouté n'apporte ni « programme », ni « ipe », ni
       « indépendance ». */
    const obstacles = await obstaclesAuVisa(ENG);
    const familles = new Set(obstacles.map((o) => o.famille));
    for (const fam of familles) expect(famillesAvant.has(fam), `famille nouvelle : ${fam}`).toBe(true);
    expect(familles.has('programme')).toBe(false);
    expect(familles.has('independance')).toBe(false);
    expect(familles.has('ipe')).toBe(false);
    /* Le poste AJOUTÉ n'apporte aucune question sans réponse (les facteurs non
       statués sont globaux au dossier et ne viennent pas de lui). */
    const duPoste = (await questionnaireObstacles(ENG, 'TRADE_RECEIVABLES')).filter((m) => m.cle !== 'obst.facteursNonStatues');
    expect(duPoste).toEqual([]);
  }, 300000);

  it('CAS CONNU MAUVAIS de l’idempotence : un second passage ne crée rien', async () => {
    const avant = await comptes();
    const r = await enrichirMondeDemo();
    expect(r.etapes.filter((e) => !e.fait)).toEqual([]);
    expect(await comptes()).toEqual(avant);
  }, 300000);

  it('CONSTAT 4 : l’information produite par l’entité est déclarée VRAIE sur les papiers rédigés', async () => {
    /* Cinq papiers portaient « utilisée : non » alors que leur population EST
       le grand livre de la cliente : la famille d'obstacles « ipe » se taisait
       sur une réponse fausse. La déclaration suit désormais la source écrite
       dans la méthode, et reprend le rapport déjà documenté (0036). */
    const lignes = await q<{ code: string; utilisee: boolean; rapport: string | null }>(
      `select w.code, i.utilisee, r.nom rapport
       from ipe i join workpaper w on w.id = i.workpaper_id
       left join ipe_rapport r on r.id = i.rapport_id
       where w.engagement_id = $1 and w.code <> 'REV-01'`, [ENG]);
    expect(lignes.length).toBeGreaterThanOrEqual(5);
    for (const l of lignes) {
      expect(l.utilisee, `${l.code} : la population vient du grand livre ou de la balance`).toBe(true);
      expect(l.rapport, `${l.code} : la déclaration cite le rapport`).toBeTruthy();
    }
  });

  it('CONSTAT 5 : une note antidatée le DIT au journal', async () => {
    const notes = await q<{ id: string; created_at: string }>(
      `select id::text, created_at::text from review_note where engagement_id = $1 and created_at < now() - interval '12 hours'`, [ENG]);
    expect(notes.length).toBeGreaterThanOrEqual(4);
    for (const n of notes) {
      const dit = await q01<{ n: string }>(
        `select count(*)::text n from event_log where engagement_id = $1 and verb = 'review_note_backdated' and object_id = $2`, [ENG, n.id]);
      expect(Number(dit!.n), `note ${n.id} antidatée sans événement`).toBeGreaterThan(0);
    }
  });

  it('CONSTAT 7 : un papier DÉPASSÉ n’est plus une section de travail', async () => {
    const depasses = await q<{ id: string; code: string }>(
      `select id::text, code from workpaper where engagement_id = $1 and status = 'outdated'`, [ENG]);
    expect(depasses.length).toBeGreaterThan(0);
    const secs = await sectionsDuDossier(ENG);
    for (const d of depasses) {
      expect(secs.some((s) => s.kind === 'papier' && s.ref === d.id), `${d.code} v-1 est encore une section`).toBe(false);
    }
    /* Et le libellé ne redouble pas le code (« REV-06 — REV-06 — … »). */
    for (const s of secs) expect(/^([A-Z]+-\d+) — \1\b/.test(s.label), s.label).toBe(false);
  });

  it('CONSTAT 8 et 9 : le gabarit suit le sens du test, et l’empreinte distingue les versions', async () => {
    const ra = await q01<{ id: string }>(
      `select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'RA'`, [ENG]);
    const papier = await q01<{ sections: { key: string; body: string }[]; based_on_hash: string }>(
      `select sections, based_on_hash from workpaper where procedure_id = $1 order by version desc limit 1`, [ra!.id]);
    const bloc = (k: string) => papier!.sections.find((x) => x.key === k)?.body ?? '';
    /* La procédure RA ne s'échantillonne pas : les deux blocs le disent au lieu
       d'annoncer un testing qui n'aura pas lieu. */
    expect(bloc('tableau_echantillon')).toMatch(/ne s’échantillonne pas|not sampled/);
    expect(bloc('verification')).not.toMatch(/après le testing|after testing/);
    /* Le repli de gabarit est ÉCRIT dans le papier et dans le moteur. */
    expect(bloc('objectif')).toMatch(/gabarit « analytique »/);
    const run = await q01<{ params: { repliDeGabarit: string | null; gabarit: string } }>(
      `select params from engine_run where engagement_id = $1 and engine = 'workpaper_draft' order by finished_at desc limit 1`, [ENG]);
    expect(run!.params.gabarit).toBe('substantif');
    /* Deux versions du même papier n'ont pas la même empreinte (constat 9). */
    const seq = await q01<{ id: string }>(
      `select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'SEQ'`, [ENG]);
    const hs = await q<{ based_on_hash: string }>(
      `select based_on_hash from workpaper where procedure_id = $1 order by version`, [seq!.id]);
    expect(hs.length).toBe(2);
    expect(hs[0].based_on_hash).not.toBe(hs[1].based_on_hash);
  });

  it('CONSTAT 10 : rédiger exige d’être du dossier (PROG-05) et de motiver le dépassement d’un visa (PROG-06)', async () => {
    const seq = await q01<{ id: string }>(
      `select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'MANUEL'`, [ENG]);
    /* Une personne du cabinet qui n'est PAS de l'équipe : refusée. */
    /* Quelqu'un du cabinet qui n'est PAS de l'équipe de la mission — le monde
       de démonstration n'en porte aucun : on en pose un (fictif). */
    const etranger = await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role)
       values ($1, 'Nadia Ferrand', 'nadia.ferrand@vermeil-audit.test', 'senior') returning id::text`, [IDS.tenant]);
    /* ETANCH-01/03 REMPLACE PROG-05 ICI, ET C'EST LA CORRECTION D'UN DÉFAUT
       (revue hostile n°9, constat 6) : PROG-05 ne consultait QUE
       `engagement_member`, jamais `tenant_id`. Il distinguait donc « procédure
       inconnue » de « pas membre du dossier » — ce qui APPREND à un intrus
       d'un autre cabinet que la procédure existe. L'étanchéité passe avant. */
    await expect(redigerPapierDeProcedure({ procedureId: seq!.id, userId: etranger.id, motif: 'essai' })).rejects.toThrow(/ETANCH-01|ETANCH-03/);
    /* MANUEL porte trois visas : une version nouvelle sans motif est refusée. */
    await expect(redigerPapierDeProcedure({ procedureId: seq!.id, userId: IDS.users.karim })).rejects.toThrow(/PROG-06/);
  });

  it('CONSTAT 1 et 6 : une décision humaine de périmètre survit, et un refus de service est une étape « NON », pas une exception', async () => {
    /* Le fondateur SORT « Clients » du périmètre, avec son motif — un geste
       ordinaire de l'écran de périmètre. */
    const { confirmScoping } = await import('@/lib/services/fsli');
    const tr = await q01<{ id: string }>(`select id::text from fsli where engagement_id = $1 and code = 'TRADE_RECEIVABLES'`, [ENG]);
    await confirmScoping(tr!.id, IDS.users.claire, 'ns_confirmed', 'Poste non significatif après revue : sorti du périmètre par l’associée.');
    const r = await enrichirMondeDemo();
    const apres = await q01<{ scoping: string; confirmed_by: string | null }>(
      `select scoping, confirmed_by::text from fsli where engagement_id = $1 and code = 'TRADE_RECEIVABLES'`, [ENG]);
    expect(apres!.scoping, 'la décision de l’associée a été réécrite').toBe('ns_confirmed');
    expect(apres!.confirmed_by).toBe(IDS.users.claire);
    const etape = r.etapes.find((e) => e.nom.startsWith('périmètre'))!;
    expect(etape.fait).toBe(false);
    expect(etape.detail).toMatch(/ne se réécrit pas/);
    /* Et le flux ENTIER a rendu son rapport : aucune exception n'est remontée. */
    expect(r.etapes.length).toBeGreaterThanOrEqual(9);
  }, 300000);

  it('redigerPapierDeProcedure : une rédaction nouvelle dépasse la précédente, le code est stable', async () => {
    const proc = await q01<{ id: string }>(`select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'RA'`, [ENG]);
    expect(proc).not.toBeNull();
    const v2 = await redigerPapierDeProcedure({ procedureId: proc!.id, userId: IDS.users.karim, motif: 'rédaction refaite pour le test du versionnement' });
    const versions = await q<{ code: string; version: number; status: string }>(
      `select code, version, status from workpaper where procedure_id = $1 order by version`, [proc!.id]);
    expect(versions.map((x) => x.status)).toEqual(['outdated', 'draft']);
    expect(new Set(versions.map((x) => x.code)).size).toBe(1);
    expect(v2.version).toBe(2);
  });
});
