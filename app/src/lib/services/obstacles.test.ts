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

  it('un poste RETENU sans aucune procédure planifiée est un obstacle', async () => {
    /* LE TROU QUE RIEN NE SIGNALAIT. La boucle ne parle que des postes qui
       portent un échantillon : un poste retenu puis jamais touché ne produisait
       donc AUCUN obstacle, et le dossier se clôturait dessus. Soit on le
       travaille, soit on le sort du périmètre avec un motif. */
    const code = 'POSTE_SANS_PROGRAMME';
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping, scoping_basis)
       values ($1, $2, 'Poste retenu et jamais travaillé (fictif)', 'BS', 100000, 'in_scope', 'test')
       on conflict (engagement_id, code) do update set scoping = 'in_scope'`,
      [IDS.engNep, code],
    );
    const avec = await obstaclesAuVisa(IDS.engNep);
    const mien = avec.filter((o) => o.famille === 'programme' && o.libelle.includes(code));
    expect(mien, 'un poste retenu sans procédure doit bloquer le visa').toHaveLength(1);
    expect(mien[0].ou).toBe('testing');

    /* …et il se lève des DEUX façons prévues. D'abord en le sortant du
       périmètre — c'est la sortie légitime, pas un contournement. */
    await q(`update fsli set scoping = 'ns_confirmed' where engagement_id = $1 and code = $2`,
      [IDS.engNep, code]);
    const sorti = await obstaclesAuVisa(IDS.engNep);
    expect(sorti.filter((o) => o.libelle.includes(code))).toHaveLength(0);

    // Ensuite en le travaillant : une procédure planifiée suffit à lever l'obstacle.
    await q(`update fsli set scoping = 'in_scope' where engagement_id = $1 and code = $2`,
      [IDS.engNep, code]);
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title)
       values ($1, 'nep-fr', 'TEST-PROG', 'substantive', $2, 'Procédure de test')`,
      [IDS.engNep, code],
    );
    const travaille = await obstaclesAuVisa(IDS.engNep);
    expect(travaille.filter((o) => o.famille === 'programme' && o.libelle.includes(code))).toHaveLength(0);

    // Remettre le monde comme on l'a trouvé : les tests suivants lisent la même liste.
    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, code]);
    await q(`delete from fsli where engagement_id = $1 and code = $2`, [IDS.engNep, code]);
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
