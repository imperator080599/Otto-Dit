import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
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
            (select count(*) from engagement_member where engagement_id = $1 and exited_on is null)::text membres`, [ENG]);

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

  it('redigerPapierDeProcedure : une rédaction nouvelle dépasse la précédente, le code est stable', async () => {
    const proc = await q01<{ id: string }>(`select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'RA'`, [ENG]);
    expect(proc).not.toBeNull();
    const v2 = await redigerPapierDeProcedure({ procedureId: proc!.id, userId: IDS.users.karim, motif: 'test' });
    const versions = await q<{ code: string; version: number; status: string }>(
      `select code, version, status from workpaper where procedure_id = $1 order by version`, [proc!.id]);
    expect(versions.map((x) => x.status)).toEqual(['outdated', 'draft']);
    expect(new Set(versions.map((x) => x.code)).size).toBe(1);
    expect(v2.version).toBe(2);
  });
});
