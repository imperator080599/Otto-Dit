import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { lireIpe, enregistrerIpe, obstaclesIpe, proposerRedaction, decouperCle } from './ipe';
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

  it('la clé du fichier distingue une PIÈCE d’un IMPORT', () => {
    expect(decouperCle('f:abc')).toEqual({ evidenceId: null, importFileId: 'abc' });
    expect(decouperCle('e:abc')).toEqual({ evidenceId: 'abc', importFileId: null });
    expect(decouperCle(null)).toEqual({ evidenceId: null, importFileId: null });
  });
});
