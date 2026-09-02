import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import {
  lireIpe, enregistrerIpe, obstaclesIpe, proposerRedaction, decouperCle,
  creerRapport, utiliserRapport, rapportsDuDossier, lireRapport,
} from './ipe';
import { obstaclesAuVisa } from './obstacles';

// L'IPE SE PROUVE PAR SES REFUS. Dire « oui » sans documenter l'exhaustivité
// et l'exactitude est exactement le défaut que les inspections relèvent ; le
// produit doit le rendre IMPOSSIBLE, pas le rappeler.

describe('l’information produite par l’entité', () => {
  let wpId = '';

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 180000);

  it('un papier sans réponse LÈVE un obstacle au visa', async () => {
    expect(await lireIpe(wpId)).toBeNull();
    const o = await obstaclesIpe(IDS.engNep);
    expect(o.map((x) => x.code)).toContain('ipe:REV-01');
    /* Et il remonte dans la liste UNIQUE qui commande la clôture. */
    const tous = await obstaclesAuVisa(IDS.engNep);
    expect(tous.some((x) => x.famille === 'ipe')).toBe(true);
  });

  it('« oui » sans exhaustivité, exactitude, date, nature ou fichier est REFUSÉ', async () => {
    await expect(enregistrerIpe(wpId, { utilisee: true }, IDS.users.karim))
      .rejects.toThrow(/exhaustivité/);
    await expect(enregistrerIpe(wpId, {
      utilisee: true, nature: 'systeme', exhaustivite: 'rapproché', exactitude: 'rapproché',
      dateDocument: '2025-12-31', approprie: true,
    }, IDS.users.karim)).rejects.toThrow(/fichier client/);
  });

  it('le fichier désigné doit être un objet DU DOSSIER — jamais une pièce orpheline', async () => {
    await expect(enregistrerIpe(wpId, {
      utilisee: true, nature: 'systeme',
      importFileId: '00000000-0000-4000-8000-0000000000ff',
      exhaustivite: 'x', exactitude: 'y', dateDocument: '2025-12-31', approprie: true,
    }, IDS.users.karim)).rejects.toThrow(/pas une pièce de ce dossier|orpheline/);
  });

  it('« non » se répond seul, et lève l’obstacle', async () => {
    await enregistrerIpe(wpId, { utilisee: false }, IDS.users.karim);
    const l = await lireIpe(wpId);
    expect(l!.utilisee).toBe(false);
    expect((await obstaclesIpe(IDS.engNep)).map((x) => x.code)).not.toContain('ipe:REV-01');
  });

  it('« oui » complet s’enregistre, avec la pièce du dossier et la trace humaine', async () => {
    const fec = await q01<{ id: string; filename: string }>(
      `select id::text, filename from import_file
       where engagement_id = $1 and kind in ('fec','gl_generic') limit 1`, [IDS.engNep]);
    const red = proposerRedaction({ nature: 'systeme', rapportCode: 'FEC-2025', nomFichier: fec!.filename });
    /* La rédaction PROPOSÉE nomme la source et se marque comme à revoir : une
       conclusion d'audit écrite par la machine et versée sans relecture n'en
       est pas une (plafond L2). */
    expect(red.exhaustivite).toContain(fec!.filename);
    expect(red.exhaustivite).toMatch(/à revoir/);

    await enregistrerIpe(wpId, {
      utilisee: true, nature: 'systeme', rapportCode: 'FEC-2025', importFileId: fec!.id,
      exhaustivite: red.exhaustivite, exactitude: red.exactitude,
      dateDocument: '2025-12-31', approprie: true, redigeParIa: true,
    }, IDS.users.karim);

    const l = await lireIpe(wpId);
    expect(l!.utilisee).toBe(true);
    expect(l!.importFileId).toBe(fec!.id);
    expect(l!.evidenceNom).toBe(fec!.filename);
    expect(l!.redigeParIa).toBe(true);
    expect(l!.validePar, 'une proposition n’entre au dossier que validée').toBe(IDS.users.karim);
  });

  it('un papier VISÉ ne se modifie plus', async () => {
    const { signWorkpaper } = await import('./workpapers/lifecycle');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    await expect(enregistrerIpe(wpId, { utilisee: false }, IDS.users.karim))
      .rejects.toThrow(/visé/);
  });

  /* ── LE RAPPORT, UN SEUL OBJET (1.8) ─────────────────────────────────── */

  it('« oui » a créé UN rapport, désigné par le papier, avec l’empreinte du fichier', async () => {
    const l = await lireIpe(wpId);
    expect(l!.rapportId).not.toBeNull();
    const r = await lireRapport(l!.rapportId!);
    expect(r).toMatchObject({ nom: 'FEC-2025', periodeFin: '2025-12-31', nature: 'systeme', papiers: 1 });
    const f = await q01<{ sha256: string }>(`select sha256 from import_file where id = $1`, [r!.importFileId]);
    expect(r!.empreinte).toBe(f!.sha256);
    expect((await rapportsDuDossier(IDS.engNep)).map((x) => x.id)).toContain(r!.id);
  });

  it('un rapport se crée avec ses deux éléments testés, un fichier DU dossier, et un arrêté — chaque manque est nommé', async () => {
    const fec = await q01<{ id: string }>(`select id::text from import_file where engagement_id = $1 limit 1`, [IDS.engNep]);
    const base = { nom: 'Balance âgée clients', periodeFin: '2025-12-31', nature: 'systeme' as const, importFileId: fec!.id,
      exhaustivite: 'total rapproché', exactitude: 'lignes rapprochées' };
    await expect(creerRapport(IDS.engNep, { ...base, nom: ' ' }, IDS.users.karim)).rejects.toThrow(/se nomme/);
    await expect(creerRapport(IDS.engNep, { ...base, periodeFin: '31/12/2025' }, IDS.users.karim)).rejects.toThrow(/arrêté/);
    await expect(creerRapport(IDS.engNep, { ...base, exactitude: '' }, IDS.users.karim)).rejects.toThrow(/deux éléments testés/);
    await expect(creerRapport(IDS.engNep, { ...base, importFileId: null }, IDS.users.karim)).rejects.toThrow(/exactement UN fichier/);
    await expect(creerRapport(IDS.engNep, { ...base, importFileId: '00000000-0000-4000-8000-0000000000ff' }, IDS.users.karim))
      .rejects.toThrow(/pas une pièce de ce dossier/);
    const r = await creerRapport(IDS.engNep, base, IDS.users.karim);
    await expect(creerRapport(IDS.engNep, base, IDS.users.karim)).rejects.toThrow(/existe déjà/);
    /* Un AUTRE arrêté, même nom : c'est un autre test IPE — permis. */
    const r2 = await creerRapport(IDS.engNep, { ...base, periodeFin: '2026-01-15' }, IDS.users.karim);
    expect(r2.id).not.toBe(r.id);
  });

  it('réutiliser un rapport pour un AUTRE arrêté est refusé, les deux dates côte à côte', async () => {
    const r = (await rapportsDuDossier(IDS.engNep)).find((x) => x.nom === 'Balance âgée clients' && x.periodeFin === '2025-12-31')!;
    /* Un second papier du dossier, pour partager le rapport. */
    const wp2 = await q01<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'REV-02', 'Second papier', 'draft', '[]'::jsonb) returning id::text`, [IDS.engNep]);
    await expect(utiliserRapport(wp2!.id, r.id, '2026-01-15', IDS.users.karim))
      .rejects.toThrow(/arrêté au 2025-12-31.*arrêté du 2026-01-15|2025-12-31[\s\S]*2026-01-15/);
    /* Sans dire si le rapport est approprié à CE test : refusé — c'est un fait
       du papier, que la base n'exige plus depuis 0036 (revue hostile n°6). */
    await expect(utiliserRapport(wp2!.id, r.id, '2025-12-31', IDS.users.karim, null)).rejects.toThrow(/approprié/);
    await expect(utiliserRapport(wp2!.id, r.id, '2025-13-45', IDS.users.karim)).rejects.toThrow(/date qui existe/);
    await utiliserRapport(wp2!.id, r.id, '2025-12-31', IDS.users.karim);
    expect((await lireRapport(r.id))!.papiers).toBe(1);
    const l2 = await lireIpe(wp2!.id);
    expect(l2).toMatchObject({ utilisee: true, rapportId: r.id, rapportNom: 'Balance âgée clients', exhaustivite: 'total rapproché' });
    /* PARTAGÉ : un troisième papier désigne le même rapport — deux papiers. */
    const wp3 = await q01<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'REV-03', 'Troisième papier', 'draft', '[]'::jsonb) returning id::text`, [IDS.engNep]);
    await utiliserRapport(wp3!.id, r.id, '2025-12-31', IDS.users.karim);
    expect((await lireRapport(r.id))!.papiers).toBe(2);
    expect((await lireIpe(wp3!.id))!.papiers).toBe(2);
  });

  it('« oui » sur un nom et un arrêté déjà pris avec une AUTRE documentation est refusé — rien ne se reprend en silence', async () => {
    const r = (await rapportsDuDossier(IDS.engNep)).find((x) => x.nom === 'Balance âgée clients' && x.periodeFin === '2025-12-31')!;
    const wp4 = await q01<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'REV-04', 'Quatrième papier', 'draft', '[]'::jsonb) returning id::text`, [IDS.engNep]);
    await expect(enregistrerIpe(wp4!.id, {
      utilisee: true, nature: 'manuelle', rapportCode: 'Balance âgée clients', importFileId: r.importFileId,
      exhaustivite: 'AUTRE texte', exactitude: 'AUTRE texte', dateDocument: '2025-12-31', approprie: true,
    }, IDS.users.karim)).rejects.toThrow(/existe déjà.*autre documentation/);
    /* La même documentation, elle, désigne le rapport existant. */
    await enregistrerIpe(wp4!.id, {
      utilisee: true, nature: 'systeme', rapportCode: 'Balance âgée clients', importFileId: r.importFileId,
      exhaustivite: 'total rapproché', exactitude: 'lignes rapprochées', dateDocument: '2025-12-31', approprie: true,
    }, IDS.users.karim);
    expect((await lireIpe(wp4!.id))!.rapportId).toBe(r.id);
    /* Et « non » rend une nature NULLE, pas « systeme » (le CASE à `when null`
       ne s'exécutait jamais). */
    await enregistrerIpe(wp4!.id, { utilisee: false }, IDS.users.karim);
    expect((await lireIpe(wp4!.id))!.nature).toBeNull();
  });

  it('un dossier SCELLÉ refuse toute écriture IPE — rapport comme désignation', async () => {
    const r = (await rapportsDuDossier(IDS.engNep))[0];
    await q01(`update engagement set status = 'locked' where id = $1`, [IDS.engNep]);
    try {
      await expect(creerRapport(IDS.engNep, { nom: 'Scellé', periodeFin: '2025-12-31', nature: 'systeme',
        importFileId: r.importFileId, exhaustivite: 'x', exactitude: 'y' }, IDS.users.karim)).rejects.toThrow(/scellé/);
      const wp5 = await q01<{ id: string }>(`select id::text from workpaper where engagement_id = $1 and code = 'REV-03'`, [IDS.engNep]);
      await expect(utiliserRapport(wp5!.id, r.id, r.periodeFin, IDS.users.karim)).rejects.toThrow(/scellé|locked/);
    } finally {
      await q01(`update engagement set status = 'fieldwork' where id = $1`, [IDS.engNep]);
    }
  });

  it('la clé du fichier distingue une PIÈCE d’un IMPORT', () => {
    expect(decouperCle('f:abc')).toEqual({ evidenceId: null, importFileId: 'abc' });
    expect(decouperCle('e:abc')).toEqual({ evidenceId: 'abc', importFileId: null });
    expect(decouperCle(null)).toEqual({ evidenceId: null, importFileId: null });
  });
});
