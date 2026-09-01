// LE POINTAGE DES ÉTATS FINANCIERS (point 9).
//
// Ce qui se vérifie : que deux natures se CALCULENT seules, que la troisième
// exige une explication ET une pièce, et qu'une ligne non pointée BLOQUE. Un
// dossier qui teste le chiffre d'affaires sans pointer la ligne « Chiffre
// d'affaires » conclut sur quelque chose qu'il n'a jamais regardé.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import {
  declarerLignes, pointer, documenter, expliquerEcart, lignes,
  obstaclesPointage, totaux, TieOutError,
} from './tieout';

async function unePiece(): Promise<string> {
  const e = await q1<{ id: string }>(
    `select id from evidence where engagement_id = $1 and quarantined = false limit 1`, [IDS.engNep]);
  return e.id;
}

describe('on pointe le montant PRÉSENTÉ, pas le sien', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  });

  /* ═══ 1. LA NATURE SE DÉCLARE, ELLE NE SE DEVINE PAS ═════════════════ */

  it('une ligne calculée sans compte est refusée', async () => {
    /* Deviner qu'une ligne est un agrégat parce qu'elle ressemble à une somme
       produirait un pointage plausible et faux — pire qu'un pointage absent. */
    await expect(declarerLignes(IDS.engNep, IDS.users.lea, [
      { statement: 'IS', ref: 'X1', label: 'Sans compte', presented: 100, nature: 'agregat_comptes' },
    ])).rejects.toThrow(/ne pourrait rien calculer/);
  });

  it('un « calcul à documenter » rattaché à des comptes est refusé', async () => {
    await expect(declarerLignes(IDS.engNep, IDS.users.lea, [
      { statement: 'NOTES', ref: 'X2', label: 'Incohérent', presented: 1,
        nature: 'calcul_documente', accounts: ['706000'] },
    ])).rejects.toThrow(/si des comptes la fondent, c'est un agrégat/);
  });

  /* ═══ 2. CE QUI SE CALCULE SE CALCULE ════════════════════════════════ */

  it('un agrégat exact se pointe SEUL', async () => {
    const total = await q1<{ t: string }>(
      `select abs(sum(a.balance))::text t from account a
       join tb_snapshot s on s.id = a.tb_snapshot_id
       where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'
         and a.number like '70%'`,
      [IDS.engNep]);
    await declarerLignes(IDS.engNep, IDS.users.lea, [{
      statement: 'IS', ref: 'CA', label: 'Chiffre d’affaires net',
      presented: Number(total.t), sortOrder: 1,
      nature: 'agregat_comptes',
      accounts: (await q<{ number: string }>(
        `select distinct a.number from account a join tb_snapshot s on s.id = a.tb_snapshot_id
         where s.engagement_id = $1 and s.status = 'active' and s.period_kind = 'current'
           and a.number like '70%'`, [IDS.engNep])).map((x) => x.number),
    }]);
    const l = (await pointer(IDS.engNep, IDS.users.lea)).find((x) => x.ref === 'CA')!;
    expect(l.status).toBe('tied');
    expect(Number(l.difference)).toBe(0);
    expect(l.tied_at).toBeTruthy();
  });

  it('un écart se voit tout seul, et la ligne reste OUVERTE tant qu’il n’est pas expliqué', async () => {
    const total = await q1<{ t: string }>(
      `select abs(sum(a.balance))::text t from account a
       join tb_snapshot s on s.id = a.tb_snapshot_id
       where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'
         and a.number like '70%'`,
      [IDS.engNep]);
    await declarerLignes(IDS.engNep, IDS.users.lea, [{
      statement: 'IS', ref: 'CA-FAUX', label: 'Chiffre d’affaires (présenté avec un écart)',
      presented: Number(total.t) + 1234.56, sortOrder: 2,
      nature: 'agregat_comptes',
      accounts: (await q<{ number: string }>(
        `select distinct a.number from account a join tb_snapshot s on s.id = a.tb_snapshot_id
         where s.engagement_id = $1 and s.status = 'active' and s.period_kind = 'current'
           and a.number like '70%'`, [IDS.engNep])).map((x) => x.number),
    }]);
    const l = (await pointer(IDS.engNep, IDS.users.lea)).find((x) => x.ref === 'CA-FAUX')!;
    /* Le statut est DÉRIVÉ : un écart sans explication ne devient pas
       « difference », il reste OUVERT — et il bloque. */
    expect(l.status).toBe('open');
    expect(Number(l.difference)).toBeCloseTo(-1234.56, 2);
  });

  it('expliquer l’écart le fait passer de « ouvert » à « écart documenté »', async () => {
    const cible = (await lignes(IDS.engNep)).find((x) => x.ref === 'CA-FAUX')!;
    await expect(expliquerEcart(IDS.engNep, IDS.users.lea, cible.id, '  '))
      .rejects.toThrow(/indistinguable d’un oubli/);
    await expliquerEcart(IDS.engNep, IDS.users.lea, cible.id,
      'Écart de reclassement : les remises de fin d’année sont présentées en déduction du chiffre d’affaires.');
    const apres = (await lignes(IDS.engNep)).find((x) => x.ref === 'CA-FAUX')!;
    expect(apres.status).toBe('difference');
  });

  it('une ligne sans écart ne se « explique » pas — il n’y a rien à expliquer', async () => {
    const ok = (await lignes(IDS.engNep)).find((x) => x.ref === 'CA')!;
    await expect(expliquerEcart(IDS.engNep, IDS.users.lea, ok.id, 'peu importe'))
      .rejects.toThrow(/rien à expliquer/);
  });

  /* ═══ 3. CE QUI NE SE CALCULE PAS SE JUSTIFIE — AVEC UNE PIÈCE ═══════ */

  it('un « calcul à documenter » exige une explication ET une pièce', async () => {
    await declarerLignes(IDS.engNep, IDS.users.lea, [{
      statement: 'NOTES', ref: 'EFF', label: 'Effectif moyen de l’exercice',
      presented: 42, sortOrder: 1, nature: 'calcul_documente',
    }]);
    const l = (await lignes(IDS.engNep)).find((x) => x.ref === 'EFF')!;
    expect(l.status).toBe('open');

    await expect(documenter(IDS.engNep, IDS.users.lea, l.id, '', await unePiece()))
      .rejects.toThrow(/explication écrite/);
    await expect(documenter(IDS.engNep, IDS.users.lea, l.id, 'Calculé sur les DSN mensuelles.', ''))
      .rejects.toThrow(/sans pièce n’est pas une justification/);
    await expect(documenter(IDS.engNep, IDS.users.lea, l.id, 'x',
      '00000000-0000-0000-0000-0000000000ff'))
      .rejects.toThrow(/pièce inconnue/);

    await documenter(IDS.engNep, IDS.users.lea, l.id,
      'Effectif moyen calculé sur les douze déclarations sociales nominatives de l’exercice.',
      await unePiece());
    const apres = (await lignes(IDS.engNep)).find((x) => x.ref === 'EFF')!;
    expect(apres.status).toBe('documented');
    expect(apres.evidence_id).toBeTruthy();
  });

  it('une ligne qui SE CALCULE ne se documente pas à la main', async () => {
    /* Ce serait déclarer pointé ce que le moteur n'a pas rapproché. */
    const ca = (await lignes(IDS.engNep)).find((x) => x.ref === 'CA')!;
    await expect(documenter(IDS.engNep, IDS.users.lea, ca.id, 'je certifie', await unePiece()))
      .rejects.toThrow(/se CALCULE/);
  });

  it('la base refuse aussi un « documenté » sans pièce', async () => {
    const l = (await lignes(IDS.engNep)).find((x) => x.ref === 'EFF')!;
    await expect(q(
      `update fs_tie set status = 'documented', evidence_id = null where fs_line_id = $1`, [l.id],
    )).rejects.toThrow(/documented_needs_explanation_and_evidence/);
  });

  /* ═══ 4. CE QUI BLOQUE ═══════════════════════════════════════════════ */

  it('une ligne non pointée est un obstacle au visa, et l’obstacle la NOMME', async () => {
    await declarerLignes(IDS.engNep, IDS.users.lea, [{
      statement: 'BS_ASSET', ref: 'CLI', label: 'Créances clients',
      presented: 999999, sortOrder: 1, nature: 'solde_balance', accounts: ['411000'],
    }]);
    await pointer(IDS.engNep, IDS.users.lea);
    const obstacles = await obstaclesPointage(IDS.engNep);
    expect(obstacles.some((o) => String(o.vars?.ref).includes('CLI'))).toBe(true);
    expect(obstacles.some((o) => o.cle === 'obst.pointageEcart')).toBe(true);
  });

  it('tout pointer ferme les obstacles', async () => {
    const cli = (await lignes(IDS.engNep)).find((x) => x.ref === 'CLI')!;
    await expliquerEcart(IDS.engNep, IDS.users.lea, cli.id,
      'Ligne de test : montant présenté volontairement faux.');
    expect(await obstaclesPointage(IDS.engNep)).toEqual([]);
  });

  it('les totaux disent combien de lignes sont pointées, par état', async () => {
    const t = await totaux(IDS.engNep);
    expect(t.length).toBeGreaterThan(1);
    for (const x of t) expect(Number(x.pointees)).toBe(Number(x.lignes));
  });

  it('sans balance retenue, le pointage le DIT au lieu de rendre des zéros', async () => {
    await expect(pointer(IDS.engSox, IDS.users.lea)).rejects.toThrow(/aucune balance retenue/);
  });
});
