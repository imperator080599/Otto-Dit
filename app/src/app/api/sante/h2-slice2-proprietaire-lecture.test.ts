import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend } from '@/lib/services/requests';
import { assignerProprietairePointAction } from '@/lib/services/matching';
import { GET } from './route';

// H-2, slice 2 (Lot 7, migration 0166) — LA LECTURE /api/sante « le propriétaire du point
// d'action client ». AJOUTÉE APRÈS COUP (revue hostile, les deux voix : la tranche touchait le
// modèle de données sans sa propre lecture le jour même — violation de la règle 22, corrigée
// avant de clore la tranche).
//
// La lecture RE-DÉRIVE indépendamment (jointure SQL directe, jamais un appel à
// `constatEtPointAction`, règle 16) et reste INFORMATIVE tant qu'un propriétaire assigné reste
// actif et de la bonne entité. Le SEUL cas qui la fait échouer : un `owner_contact_id` qui ne
// pointe plus un `client_contact` actif de la même entité que le dossier — un état que
// `assignerProprietairePointAction` refuse à l'écriture, donc atteint ici seulement par mutation
// directe hors du chemin gardé (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-2 slice 2'))!;
}

async function creerPointAction() {
  const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
  await approveSend(requestId, IDS.users.karim);
  const exc = await q1<{ id: string }>(
    `insert into exception (engagement_id, taxonomy_code, status, description)
     values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 2 lecture') returning id::text`,
    [IDS.engNep],
  );
  const item = await q1<{ id: string }>(
    `insert into request_item (request_id, kind, description, exception_id, status)
     values ($1, 'explanation', 'sonde H-2 slice 2 lecture', $2, 'pending') returning id::text`,
    [requestId, exc.id],
  );
  return { excId: exc.id, itemId: item.id };
}

describe('H-2 slice 2 : la lecture /api/sante sur le propriétaire du point d’action client', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, sans propriétaire encore assigné par ce chemin, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('cas connu bon : un propriétaire assigné actif reste informatif, jamais une panne', async () => {
    const { excId, itemId } = await creerPointAction();
    try {
      await assignerProprietairePointAction(itemId, IDS.contacts.sophie, '2026-10-15', IDS.users.karim);
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok).toBe(true);
      expect(lecture.vide).toBeFalsy();
      expect(lecture.detail).toContain('1 point');
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from request_item where id = $1`, [itemId]);
      await q(`delete from exception where id = $1`, [excId]);
    }
  });

  it("cas connu mauvais (règle 17) : un propriétaire désactivé APRÈS assignation fait échouer la lecture", async () => {
    const { excId, itemId } = await creerPointAction();
    await assignerProprietairePointAction(itemId, IDS.contacts.theo, null, IDS.users.karim);
    /* Mutation SQL DIRECTE, hors du chemin gardé : aucun geste produit ne désactive un contact
       déjà assigné à un point d'action — exactement le scénario que la lecture doit attraper. */
    await q(`update client_contact set active = false where id = $1`, [IDS.contacts.theo]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter le propriétaire désactivé').toBe(false);
      expect(res.status).toBe(500);
    } finally {
      await q(`update client_contact set active = true where id = $1`, [IDS.contacts.theo]);
      await q(`delete from request_item where id = $1`, [itemId]);
      await q(`delete from exception where id = $1`, [excId]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });
});
