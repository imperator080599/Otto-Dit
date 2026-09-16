import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { obstaclesDemandes } from './obstacles';
import { demanderDetailDeCompte, approveSend, numeroDemande } from './requests';
import { now, DAY_MS } from '@/lib/core/clock';

// H-1, slice 2 (Lot 7, tranche 2 — REGISTRE_IDEES.md, docs/MANDATS) : « ce qui reste dû est un
// obstacle au visa », le critère d'admission de H-1 lui-même. `generatePbcFromSample` pose son
// `due_date` à now()+10 jours (requests.ts:213) : aucune demande du monde semé n'est donc en
// retard à la sortie de `runPart1UpToWorkpaper()` (vérifié directement ci-dessous, jamais
// supposé) — ce test fabrique son propre cas, comme s3s4.test.ts le fait déjà pour ses cas
// connus mauvais, plutôt que de chercher une demande naturellement périmée qui n'existe pas.

describe('obstaclesDemandes (H-1) : une demande en retard bloque le visa', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('aucune demande du monde de démonstration, fraîchement envoyée à échéance +10 jours, ne lève d’obstacle', async () => {
    /* Cas connu BON, protecteur du faux positif (règle 25) : une famille neuve ne doit jamais
       rendre la démonstration insignable. Vérifié directement plutôt que supposé : aucune
       demande ouverte du monde semé ne porte une échéance déjà dépassée. */
    const t = await now();
    const enRetard = await q<{ n: string }>(
      `select count(*)::text n from request
       where engagement_id = $1 and status in ('sent','partially_submitted','reopened')
         and due_date is not null and due_date < $2`,
      [IDS.engNep, t.toISOString().slice(0, 10)],
    );
    expect(enRetard[0].n, 'ce test suppose le monde semé sans demande en retard').toBe('0');
    const obstacles = await obstaclesDemandes(IDS.engNep);
    expect(obstacles).toEqual([]);
  });

  it('cas connu mauvais (règle 17) : une échéance mutée dans le passé fait lever l’obstacle, et le revert l’efface', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const avant = await q1<{ seq_no: number; title: string; due_date: string | null }>(
      `select seq_no, title, due_date::text from request where id = $1`,
      [requestId],
    );
    expect(avant.due_date, 'demanderDetailDeCompte ne pose pas d’échéance — le test la fabrique').toBeNull();
    const t = await now();
    const joursEnRetard = 4;
    const dueDate = new Date(t.getTime() - joursEnRetard * DAY_MS).toISOString().slice(0, 10);
    /* Mutation SQL DIRECTE, hors du chemin gardé — le seul moyen de placer une échéance dans le
       passé sans attendre le calendrier réel, exactement le scénario que l'obstacle doit
       attraper (règle 17). */
    await q(`update request set due_date = $2 where id = $1`, [requestId, dueDate]);
    try {
      const obstacles = await obstaclesDemandes(IDS.engNep);
      const trouve = obstacles.find((o) => o.cle === 'obst.demandeEnRetard' && o.vars?.numero === numeroDemande(avant.seq_no));
      expect(trouve, 'obstaclesDemandes doit lever quand une demande envoyée dépasse son échéance').toBeDefined();
      expect(trouve?.vars?.titre).toBe(avant.title);
      expect(trouve?.vars?.jours).toBe(joursEnRetard);
    } finally {
      await q(`update request set due_date = null where id = $1`, [requestId]);
    }
    const apresRevert = await obstaclesDemandes(IDS.engNep);
    expect(apresRevert.find((o) => o.vars?.numero === numeroDemande(avant.seq_no))).toBeUndefined();
  });

  it('une demande RÉSOLUE (submitted) même en retard ne bloque pas ici (règle 19 : le périmètre de cette famille)', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const t = await now();
    const dueDate = new Date(t.getTime() - 4 * DAY_MS).toISOString().slice(0, 10);
    await q(`update request set due_date = $2, status = 'submitted' where id = $1`, [requestId, dueDate]);
    try {
      const obstacles = await obstaclesDemandes(IDS.engNep);
      const avant = await q1<{ seq_no: number }>(`select seq_no from request where id = $1`, [requestId]);
      expect(obstacles.find((o) => o.vars?.numero === numeroDemande(avant.seq_no))).toBeUndefined();
    } finally {
      await q(`update request set due_date = null, status = 'sent' where id = $1`, [requestId]);
    }
  });
});
