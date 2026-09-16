import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend, numeroDemande } from '@/lib/services/requests';
import { now, DAY_MS } from '@/lib/core/clock';
import { GET } from './route';

// H-1, slice 2 (Lot 7, tranche 2 — REGISTRE_IDEES.md) — LA LECTURE /api/sante.
//
// La lecture rejoue `obstaclesDemandes` (obstacles.ts) sur l'état RÉEL du dossier — le même
// chemin que `/obstacles`. Cette suite prouve DEUX choses : le monde de démonstration, où toute
// demande générée par `generatePbcFromSample` porte une échéance à +10 jours, ne rougit pas
// (VIDE, informatif) ; et une demande dont l'échéance est muée dans le passé HORS du chemin gardé
// (SQL direct, jamais une attente calendaire) fait apparaître la demande dans CETTE lecture, non
// vide, sans pour autant la faire échouer (`ok: true`) — une demande en retard est le travail
// normal d'un dossier en cours, pas une panne (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-1'))!;
}

describe('H-1 : la lecture /api/sante sur les demandes en retard', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, où toute demande porte une échéance à +10 jours, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toBe('VIDE — aucune demande en retard');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une échéance muée hors du chemin gardé fait apparaître la demande dans la lecture, sans la faire échouer', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const avant = await q1<{ seq_no: number }>(`select seq_no from request where id = $1`, [requestId]);
    const t = await now();
    const dueDate = new Date(t.getTime() - 4 * DAY_MS).toISOString().slice(0, 10);
    await q(`update request set due_date = $2 where id = $1`, [requestId, dueDate]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'une demande en retard est informative, jamais une panne de CETTE lecture').toBe(true);
      expect(lecture.vide).toBeFalsy();
      expect(lecture.detail).toContain(numeroDemande(avant.seq_no));
      expect(res.status).toBe(200);
    } finally {
      await q(`update request set due_date = null where id = $1`, [requestId]);
    }
  });
});
