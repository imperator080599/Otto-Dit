import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT CONTRÔLE INTERNE, TRANCHE 1 — LA LECTURE « CTRL-01 » DE /api/sante.
//
// CAS CONNU MAUVAIS #1 (règle 17), trouvé par la revue hostile du 2026-09-08 (voix 1) : la
// PREMIÈRE version de cette lecture partait des TÂCHES (`join control_task`) — un contrôle
// CONCLU sans AUCUNE tâche ne rejoignait donc rien et se lisait vert, EXACTEMENT le défaut que
// `importRcm` produisait avant sa propre correction ce jour-là (di_status='effective' importé
// directement du listing client, jamais passé par `setDiStatus`). Ce fichier prouve que la
// lecture CORRIGÉE voit ce cas — et le cas « une tâche à la seule inquiry » — en les provoquant
// tous les deux par une écriture directe, hors des fonctions gardées (le seul moyen de les
// produire, puisque `setDiStatus`/`documenterProcedureTache` les refusent désormais).

async function poserControle(diStatus: string, code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', $3)
     returning id::text`,
    [IDS.engNep, code, diStatus])).id;
}

describe('CTRL-01 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucun contrôle conclu : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun contrôle conclu');
  });

  it('cas connu mauvais A (règle 17) : un contrôle CONCLU sans aucune tâche fait rougir /api/sante entier', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL01-A');
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL01-A : conclu sans aucune tâche documentée');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais B (règle 17) : une tâche d’un contrôle CONCLU documentée par la seule inquiry fait rougir', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL01-B');
    try {
      const taskId = (await q1<{ id: string }>(
        `insert into control_task (engagement_id, control_id, seq_no, description) values ($1,$2,1,'tâche de sonde') returning id::text`,
        [IDS.engNep, controlId])).id;
      await q(
        `insert into control_task_procedure (engagement_id, task_id, procedure, notes) values ($1,$2,'inquiry','entretien')`,
        [IDS.engNep, taskId]);

      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('inquiry seule');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
      await q(`delete from control_task where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('un contrôle conclu par le vrai chemin gardé (walkthrough → tâche → procédure → setDiStatus) reste vert', async () => {
    const { attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus } = await import('@/lib/services/sox');
    const { ingestEvidence } = await import('@/lib/services/evidence');
    const controlId = await poserControle('not_assessed', 'SONDE-CTRL01-C');
    try {
      const { evidenceId } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'walkthrough-sonde.txt', mime: 'text/plain',
        bytes: new TextEncoder().encode('x'), source: 'auditor',
        uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
      });
      await attacherWalkthrough(controlId, IDS.users.karim, evidenceId);
      const taskId = await ajouterTacheControle(controlId, IDS.users.karim, 'tâche réelle');
      await documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'inspection réelle');
      await setDiStatus(controlId, IDS.users.karim, 'effective', 'conclusion de sonde');

      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('contrôle(s) conclu(s)');
    } finally {
      await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
      await q(`delete from control_task where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
