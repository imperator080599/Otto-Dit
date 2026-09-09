import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { detecterBasculesMaterialite, basculesMaterialite } from './fsli';

// LA BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) — « voir si on a loupé du testing ».
//
// LE CAS QUI COMPTE N'EST PAS CELUI QUE `proposeScoping` CORRIGE DÉJÀ SEUL. `bootstrapNep`
// confirme CHAQUE poste hors chiffre d'affaires en `ns_confirmed` (part1.ts) — une décision
// HUMAINE que `proposeScoping` ne touchera plus jamais (D9). C'est exactement le poste dont ce
// test simule le solde qui grossit après un nouvel import — le cas que `detecterBasculesMaterialite`
// existe pour attraper, puisque rien d'autre dans le produit ne le corrige de lui-même.

describe('bascule de matérialité (mandat §2.1)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('un poste CONFIRMÉ non matériel dont le solde dépasse la matérialité de travail se flague — CTRL comme les autres, jamais deux fois', async () => {
    const poste = (await q1<{ id: string; code: string; scoping: string; confirmed_by: string | null }>(
      `select id, code, scoping, confirmed_by from fsli
       where engagement_id = $1 and scoping = 'ns_confirmed' and confirmed_by is not null limit 1`,
      [IDS.engNep],
    ));
    expect(poste.confirmed_by, 'bootstrapNep confirme des postes ns_confirmed — sinon ce test n’a rien à éprouver').toBeTruthy();

    const mat = (await q1<{ perf_amount: string }>(
      `select perf_amount::text from materiality where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
      [IDS.engNep],
    ));
    /* SIMULE UN NOUVEL IMPORT : le solde du poste, déjà confirmé non matériel, grossit au-delà
       de la matérialité de travail — comme un client qui a eu une grosse année sur un poste
       jusque-là petit. `detecterBasculesMaterialite` ne rejoue pas l'import lui-même (couvert par
       imports.test.ts ailleurs) : il lit l'état `fsli` tel qu'un import l'aurait laissé. */
    await q(`update fsli set balance = $2 where id = $1`, [poste.id, Number(mat.perf_amount) * 2]);

    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-bascule.csv', 'sonde-sha', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));

    const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
    expect(posees.map((b) => b.fsliCode)).toContain(poste.code);

    const liste = await basculesMaterialite(IDS.engNep);
    const ligne = liste.find((b) => b.fsliCode === poste.code);
    expect(ligne).toBeDefined();
    expect(ligne!.importFilename).toBe('sonde-bascule.csv');
    /* Aucune procédure n'a jamais été planifiée pour ce poste (hors chiffre d'affaires, jamais
       retenu au périmètre) — « ce qui n'a pas été testé » est donc tout, honnêtement compté. */
    expect(Number(ligne!.procedureCount)).toBe(0);

    /* CAS CONNU MAUVAIS PROTECTEUR (règle 17) : un second appel (un ré-import ultérieur) ne
       pose PAS une seconde ligne — le premier import qui a franchi le seuil garde le dossier. */
    const rejoue = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
    expect(rejoue.map((b) => b.fsliCode)).not.toContain(poste.code);
    const compte = (await q1<{ n: string }>(
      `select count(*) n from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`,
      [IDS.engNep, poste.code],
    ));
    expect(Number(compte.n)).toBe(1);
  });

  it('cas connu mauvais (règle 17) : un poste SYSTÈME (jamais confirmé), sous le seuil, ne se flague pas', async () => {
    /* FIXTURE CONSTRUITE, PAS UN ÉTAT ACCIDENTEL DU MONDE DE DÉMONSTRATION (revue hostile, deux
       voix indépendantes, même constat) : la première version cherchait un FSLI système déjà
       présent dans le monde `bootstrapNep` — après cette même tranche, `bootstrapNep` confirme
       TOUS les postes non-CA en `ns_confirmed` (part1.ts), donc `confirmed_by is null` n'y existe
       plus jamais pour un poste non-CA. Le test se déclarait « rien à éprouver » à chaque run —
       la protection qu'il prétendait garder n'a jamais tourné une seule fois (règle 17 : un
       détecteur qui n'a jamais échoué exprès n'a jamais été testé). Posé ici directement, sous
       le seuil, système, pour que le cas existe à coup sûr. */
    const code = 'SONDE-SYSTEME-SOUS-SEUIL';
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping)
       values ($1, $2, 'Poste de sonde, système, sous le seuil', 'BS', 100, 'ns_proposed')`,
      [IDS.engNep, code],
    );
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-bascule-neg.csv', 'sonde-sha-2', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    try {
      const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
      expect(posees.map((b) => b.fsliCode)).not.toContain(code);
      const compte = (await q1<{ n: string }>(
        `select count(*) n from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`,
        [IDS.engNep, code],
      ));
      expect(Number(compte.n)).toBe(0);
    } finally {
      await q(`delete from fsli where engagement_id = $1 and code = $2`, [IDS.engNep, code]);
    }
  });

  it('sans matérialité validée : aucune erreur, aucune bascule (rien à comparer)', async () => {
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-sans-mat.csv', 'sonde-sha-3', 'validated', 1) returning id::text`,
      [IDS.engSox],
    ));
    await expect(detecterBasculesMaterialite(IDS.engSox, fichier.id, IDS.users.karim)).resolves.toEqual([]);
  });
});
