import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LE SUIVI DE MISSION (mandat contrôle interne, §5, §7.4) — LA LECTURE DE /api/sante.
//
// `requestsEnAttente` (requests.ts) ne compte que les demandes ENVOYÉES : `approveSend` pose
// `status = 'sent'` et `sent_at` ENSEMBLE, dans la MÊME instruction — aucun chemin du produit ne
// peut poser l'un sans l'autre. Cette lecture ne peut donc rougir que si ce chemin a été CONTOURNÉ
// (un SQL direct, une régression du garde) — même famille que CTRL-01/02/03/07 (mêmes fichiers de
// sonde) : elle ne prouve pas que le chemin gardé fonctionne pour une demande qui n'a pas encore
// été envoyée, seulement qu'un contournement RÉEL la fait rougir (règle 17).

async function poserDemandeDirecte(seqNo: number, status: string, sentAt: string | null): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status, sent_at)
     values ($1, $2, 'demande de sonde suivi', 'fr', $3, $4) returning id::text`,
    [IDS.engNep, seqNo, status, sentAt],
  )).id;
}

describe('suivi de mission : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune demande orpheline : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('suivi de mission'));
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une demande « sent » SANS date d’envoi (SQL direct, hors approveSend) fait rougir /api/sante entier', async () => {
    const seq = 9001;
    const reqId = await poserDemandeDirecte(seq, 'sent', null);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('suivi de mission'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SANS date d’envoi');
      expect(lectureRouge.detail).toContain(`R-${String(seq).padStart(3, '0')}:sent`);
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from request where id = $1`, [reqId]);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : une demande « sent » AVEC sa date d’envoi ne fait pas rougir', async () => {
    const seq = 9002;
    const reqId = await poserDemandeDirecte(seq, 'sent', new Date().toISOString());
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('suivi de mission'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from request where id = $1`, [reqId]);
    }
  });

  it('le vrai chemin gardé (approveSend) reste vert, et la demande envoyée compte dans l’attente', async () => {
    const { demanderDetailDeCompte, approveSend } = await import('@/lib/services/requests');
    const reqId = await demanderDetailDeCompte(IDS.engNep, 'REVENUE', IDS.users.karim);
    await approveSend(reqId, IDS.users.lea);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('suivi de mission'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('demande(s) en attente');
    } finally {
      await q(`delete from request_item where request_id = $1`, [reqId]);
      await q(`delete from request where id = $1`, [reqId]);
    }
  });
});
