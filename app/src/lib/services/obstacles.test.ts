// LES OBSTACLES AU VISA — une seule liste, calculée (point 8).
//
// Ce qui se vérifie : que la liste est bien la RÉUNION de ce que chaque service
// refuse, qu'elle ne rédige rien, et qu'un dossier non accepté n'affiche QUE
// cet obstacle-là — noyer le seul qui compte sous quarante autres reviendrait à
// ne rien dire.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { obstaclesAuVisa, comptesParFamille, visaPossible } from './obstacles';
import { independenceObstacles } from './team';
import { questionnaireObstacles } from './questionnaire';
import { obstaclesReprise } from './carryforward';
import { obstaclesPointage } from './tieout';
import { proposerReprise } from './carryforward';
import { construireDossierN1 } from '@/lib/flows/prior-year';

describe('les obstacles au visa sont UNE liste, et elle est calculée', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  });

  it('un dossier NON ACCEPTÉ n’affiche QUE cet obstacle', async () => {
    /* Lister quarante obstacles sur un dossier qu'on n'a pas accepté noierait
       le seul qui compte. */
    const neuve = '00000000-0000-4000-8000-0000000000d5';
    const per = await q1<{ id: string }>(
      `select id from period where entity_id = $1 order by end_date limit 1`, [IDS.entity]);
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
       values ($1,$2,$3,$4,'integrated','Mission non acceptée (obstacles)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}','setup',$5)`,
      [neuve, IDS.tenant, IDS.entity, per.id, IDS.methodology]);

    const l = await obstaclesAuVisa(neuve);
    expect(l).toHaveLength(1);
    expect(l[0].famille).toBe('acceptation');
    expect(await visaPossible(neuve)).toBe(false);
  });

  it('la liste est la RÉUNION de ce que chaque service refuse — rien n’est rédigé ici', async () => {
    const l = await obstaclesAuVisa(IDS.engNep);
    const libelles = l.map((o) => o.libelle);

    for (const attendu of await independenceObstacles(IDS.engNep)) {
      expect(libelles).toContain(attendu);
    }
    for (const attendu of await questionnaireObstacles(IDS.engNep, null)) {
      expect(libelles).toContain(attendu);
    }
    for (const attendu of await obstaclesPointage(IDS.engNep)) {
      expect(libelles).toContain(attendu);
    }
  });

  it('chaque obstacle dit OÙ aller le lever — un obstacle sans destination se contemple', async () => {
    const l = await obstaclesAuVisa(IDS.engNep);
    expect(l.length).toBeGreaterThan(0);
    for (const o of l) {
      expect(o.ou.length).toBeGreaterThan(2);
      expect(o.libelle.length).toBeGreaterThan(5);
    }
  });

  it('un obstacle de reprise apparaît dès qu’une proposition n’est pas statuée', async () => {
    await construireDossierN1();
    await proposerReprise(IDS.engNep, IDS.users.lea);
    const attendus = await obstaclesReprise(IDS.engNep);
    expect(attendus.length).toBeGreaterThan(0);

    const l = await obstaclesAuVisa(IDS.engNep);
    expect(l.some((o) => o.famille === 'reprise')).toBe(true);
    expect(l.filter((o) => o.famille === 'reprise')).toHaveLength(attendus.length);
  });

  it('les comptes par famille correspondent à la liste — pas de compteur à part', async () => {
    /* Un compteur tenu à part diverge un jour de ce qu'il compte. */
    const l = await obstaclesAuVisa(IDS.engNep);
    const comptes = await comptesParFamille(IDS.engNep);
    const total = Object.values(comptes).reduce((a, b) => a + b, 0);
    expect(total).toBe(l.length);
    for (const [f, n] of Object.entries(comptes)) {
      expect(l.filter((o) => o.famille === f)).toHaveLength(n);
    }
  });

  it('l’ordre suit celui du dossier : on ne pointe pas les états d’une mission non acceptée', async () => {
    const l = await obstaclesAuVisa(IDS.engNep);
    const rang = (f: string) => l.findIndex((o) => o.famille === f);
    const independance = rang('independance');
    const pointage = rang('pointage');
    if (independance >= 0 && pointage >= 0) expect(independance).toBeLessThan(pointage);
  });

  it('rien n’est stocké : aucune table d’obstacles', async () => {
    const tables = await q<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name like '%obstacle%'`);
    expect(tables).toEqual([]);
  });
});
