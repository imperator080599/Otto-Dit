// MES TRAVAUX : ce qui attend QUELQU'UN, dérivé — jamais tenu à la main.
//
// Ce qui se vérifie ici, c'est le tri du produit : une note adressée à un
// autre n'est pas mon travail, une note close non plus, un dossier dont je ne
// suis pas membre ne me regarde pas, et le visa attendu est le PREMIER de
// l'ordre qui manque — pas n'importe lequel.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { mesTravaux } from './travaux';

const KARIM = IDS.users.karim;
const LEA = IDS.users.lea;
const HUGO = IDS.users.hugo;   // membre du cabinet, d'AUCUN dossier

async function papier(code: string, statut: string): Promise<string> {
  const r = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
     values ($1, 'nep-fr', $2, $3, $4, '[]'::jsonb) returning id::text`,
    [IDS.engNep, code, `Papier ${code}`, statut]);
  return r.id;
}

describe('mes travaux — la liste se DÉRIVE', () => {
  beforeAll(async () => {
    await initTestDb();

    const wp = await papier('W-NOTE', 'in_review');
    // trois notes : pour Karim (ouverte), pour Karim (close), pour Léa
    await q(
      `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, status, text, note_type)
       values ($1,$2,$3,$4,'open','Reprendre la conclusion.','a_corriger'),
              ($1,$2,$3,$4,'closed','Note déjà close.','question'),
              ($1,$2,$4,$3,'open','Pour Léa.','a_documenter')`,
      [IDS.engNep, wp, LEA, KARIM]);

    // un papier au premier visa manquant, un autre où le préparateur a signé
    const w1 = await papier('W-VISA-1', 'draft');
    const w2 = await papier('W-VISA-2', 'in_review');
    await q(`insert into signoff (workpaper_id, user_id, sign_role) values ($1,$2,'preparer_validator')`, [w2, KARIM]);
    // un papier SIGNÉ n'attend plus rien
    const w3 = await papier('W-SIGNE', 'signed');
    await q(`insert into signoff (workpaper_id, user_id, sign_role) values ($1,$2,'preparer_validator')`, [w3, KARIM]);

    // deux demandes : une échue, une à échoir
    await q(
      `insert into request (engagement_id, seq_no, title, status, due_date)
       values ($1, 901, 'Contrats de vente', 'sent', current_date - 5),
              ($1, 902, 'Relevés bancaires', 'sent', current_date + 30)`,
      [IDS.engNep]);
  });

  it('une note adressée à un AUTRE, ou close, n’est pas mon travail', async () => {
    const t = await mesTravaux(KARIM);
    const notes = t.filter((l) => l.nature === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0].titre).toContain('Reprendre la conclusion');
    expect(notes[0].detail).toContain('bloquante');
  });

  it('un dossier dont je ne suis pas membre ne me regarde pas', async () => {
    expect(await mesTravaux(HUGO)).toEqual([]);
  });

  it('le visa attendu est le PREMIER de l’ordre qui manque, et un papier signé sort', async () => {
    const visas = (await mesTravaux(KARIM)).filter((l) => l.nature === 'visa');
    const par = Object.fromEntries(visas.map((v) => [v.titre.split(' — ')[0], v.detail]));
    expect(par['W-VISA-1']).toContain('préparateur');
    expect(par['W-VISA-2']).toContain('réviseur');
    expect(par['W-SIGNE']).toBeUndefined();
  });

  it('seule la demande ÉCHUE remonte, et elle mène à la demande elle-même', async () => {
    const d = (await mesTravaux(KARIM)).filter((l) => l.nature === 'demande');
    expect(d).toHaveLength(1);
    expect(d[0].titre).toContain('R-901');
    expect(d[0].href).toMatch(/^\/eng\/[^/]+\/requests\/[^/]+$/);
  });

  it('ce qui est en retard passe devant — l’ordre d’une liste de travail est une décision', async () => {
    const t = await mesTravaux(KARIM);
    expect(t[0].retard).toBe(true);
    const dernier = t[t.length - 1];
    expect(dernier.retard).toBe(false);
  });

  it('chaque ligne mène à l’objet en UN clic (le critère se compte depuis ici)', async () => {
    for (const l of await mesTravaux(KARIM)) {
      expect(l.href.startsWith(`/eng/${l.engagementId}/`)).toBe(true);
    }
  });
});
