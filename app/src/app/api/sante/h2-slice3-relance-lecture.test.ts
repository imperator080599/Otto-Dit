import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend } from '@/lib/services/requests';
import { assignerProprietairePointAction, relancerPointAction } from '@/lib/services/matching';
import { GET } from './route';

// H-2, slice 3 (Lot 7, migration 0168) — LA LECTURE /api/sante « la relance du point d'action
// client ». Ajoutée LE MÊME JOUR que la tranche (règle 22, leçon déjà tirée en slice 2 — pas
// répétée cette fois).
//
// La lecture RE-DÉRIVE indépendamment (jointure SQL directe sur `reminder`/`request_item`,
// jamais un appel à `relancerPointAction` ou `constatEtPointAction`, règle 16) et reste
// INFORMATIVE tant que `reminder.request_id` (dénormalisé à l'écriture) coïncide avec le
// `request_id` réel de l'item qu'elle cible. Le SEUL cas qui la fait échouer : une dérive de
// cette dénormalisation — un état que `relancerPointAction` ne peut jamais produire (il dérive
// toujours `request_id` DANS la même requête), donc atteint ici seulement par mutation directe
// hors du chemin gardé (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-2 slice 3'))!;
}

async function creerPointAction() {
  const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
  await approveSend(requestId, IDS.users.karim);
  const exc = await q1<{ id: string }>(
    `insert into exception (engagement_id, taxonomy_code, status, description)
     values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 3 lecture') returning id::text`,
    [IDS.engNep],
  );
  const item = await q1<{ id: string }>(
    `insert into request_item (request_id, kind, description, exception_id, status)
     values ($1, 'explanation', 'sonde H-2 slice 3 lecture', $2, 'pending') returning id::text`,
    [requestId, exc.id],
  );
  return { requestId, excId: exc.id, itemId: item.id };
}

describe('H-2 slice 3 : la lecture /api/sante sur la relance du point d’action client', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, sans relance encore émise par ce chemin, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('cas connu bon : une relance émise sur un point d’action assigné reste informative, jamais une panne', async () => {
    const { excId, itemId } = await creerPointAction();
    try {
      await assignerProprietairePointAction(itemId, IDS.contacts.sophie, '2026-10-15', IDS.users.karim);
      await relancerPointAction(itemId, IDS.users.karim);
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok).toBe(true);
      expect(lecture.vide).toBeFalsy();
      expect(lecture.detail).toContain('1 relance');
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from reminder where request_item_id = $1`, [itemId]);
      await q(`delete from request_item where id = $1`, [itemId]);
      await q(`delete from exception where id = $1`, [excId]);
    }
  });

  it('cas connu mauvais (règle 17) : une dérive du request_id dénormalisé, introduite hors du chemin gardé, fait échouer la lecture', async () => {
    const { requestId, excId, itemId } = await creerPointAction();
    await assignerProprietairePointAction(itemId, IDS.contacts.theo, null, IDS.users.karim);
    await relancerPointAction(itemId, IDS.users.karim);
    /* Une AUTRE demande du même dossier, pour fournir un request_id RÉEL mais FAUX vers lequel
       dériver — mutation SQL DIRECTE, hors du chemin gardé (aucun geste produit ne peut la
       causer, relancerPointAction dérive toujours request_id dans la même requête). */
    const autreRequestId = await demanderDetailDeCompte(IDS.engNep, 'PAYROLL', IDS.users.karim);
    await q(`update reminder set request_id = $2 where request_item_id = $1`, [itemId, autreRequestId]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter la dérive du request_id dénormalisé').toBe(false);
      expect(res.status).toBe(500);
    } finally {
      await q(`update reminder set request_id = $2 where request_item_id = $1`, [itemId, requestId]);
      await q(`delete from reminder where request_item_id = $1`, [itemId]);
      await q(`delete from request_item where id = $1`, [itemId]);
      await q(`delete from exception where id = $1`, [excId]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });
});
