import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend } from '@/lib/services/requests';
import { GET } from './route';

// H-2, slice 1 (Lot 7 — docs/REGISTRE_IDEES.md ligne 270) — LA LECTURE /api/sante.
//
// La lecture RE-DÉRIVE indépendamment (jointure directe request_item/exception, jamais un appel
// à `constatEtPointAction` comparé à lui-même, règle 16) et reste INFORMATIVE tant que rien
// d'anormal n'est détecté (un point d'action en attente est le travail normal d'un dossier en
// cours). Le SEUL cas qui la fait échouer (`ok:false`) : un point d'action client toujours
// `pending` dont le constat est redevenu `open` — signe qu'un geste a rouvert le dossier sans
// reprendre la clarification déjà envoyée, un silence que règle 13 traque.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-2'))!;
}

describe('H-2 slice 1 : la lecture /api/sante sur le constat vs le point d’action client', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, sans point d’action client encore engendré par ce chemin, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('cas connu bon : une clarification envoyée puis répondue reste informative (jamais VIDE à tort, jamais une panne)', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 lecture : bon cas') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 lecture', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok).toBe(true);
      expect(lecture.vide).toBeFalsy();
      expect(lecture.detail).toContain('pending');
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it("cas connu mauvais (règle 17) : un constat redevenu 'open' avec un point d'action toujours pending fait échouer la lecture", async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'open', 'sonde H-2 lecture : mauvais cas') returning id::text`,
      [IDS.engNep],
    );
    /* Mutation SQL DIRECTE, hors du chemin gardé : aucun geste produit ne referme une
       clarification `pending` puis ne rouvre le dossier sans y toucher — exactement le
       scénario que la lecture doit attraper (règle 17). */
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 lecture', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter le constat rouvert sans reprise').toBe(false);
      expect(lecture.detail).toContain('1');
      expect(res.status).toBe(500);
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });
});
