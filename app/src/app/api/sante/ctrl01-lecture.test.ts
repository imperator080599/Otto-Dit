import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1, repoRoot, getDb } from '@/lib/db/client';
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

  it('0149 : un contrôle CONCLU sans tâche (le motif trouvé en production, 2026-09-08) redevient not_assessed, sans toucher ce qui existe ailleurs', async () => {
    /* Reproduit EXACTEMENT ce que `importRcm` écrivait avant sa propre
       correction (0148) : di_status posé directement, aucune control_task.
       C'est ce motif précis qui a fait rougir /api/sante en production
       quelques minutes après le déploiement de 0148 — /rcm mesuré via
       mcp__Vercel__web_fetch_vercel_url, verdict CTRL-01 cassé sur les six
       contrôles concluants du dossier SOX. */
    const controlId = await poserControle('effective', 'SONDE-0149');
    const testId = (await q1<{ id: string }>(
      `insert into control_test (control_id, status, conclusion) values ($1,'complete','sonde') returning id::text`,
      [controlId])).id;
    try {
      const avantRouge = await GET();
      const avantBody = await avantRouge.json();
      expect(avantBody.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01')).ok).toBe(false);

      const sql = fs.readFileSync(path.join(repoRoot(), 'supabase', 'migrations', '0149_ctrl01_correction_di_status.sql'), 'utf8');
      const db = await getDb();
      await db.exec(sql); // REJOUABLE — comme 0140 (rls-couverture.test.ts) : pas de garde-fou à casser en la rejouant

      const c = await q1<{ di_status: string; di_conclusion: string | null }>(`select di_status, di_conclusion from control where id = $1`, [controlId]);
      expect(c.di_status).toBe('not_assessed');
      expect(c.di_conclusion).toBeNull();
      // Rien d'autre n'a bougé : le control_test posé pour la sonde reste au dossier (règle 28).
      const testEncore = await q1<{ id: string }>(`select id::text id from control_test where id = $1`, [testId]);
      expect(testEncore.id).toBe(testId);

      const apresVert = await GET();
      const apresBody = await apresVert.json();
      expect(apresBody.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-01')).ok).toBe(true);
    } finally {
      await q(`delete from control_test where id = $1`, [testId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('0149 : le moitié protectrice du prédicat (règle 17) — un contrôle avec une VRAIE tâche documentée ne bouge pas', async () => {
    // La revue hostile (voix 1, H2) l'a prouvé en mutant la migration : retirer le
    // `not exists (select 1 from control_task …)` de 0149 laisse passer toute la suite
    // existante inchangée, parce qu'AUCUN test n'exerçait la moitié protectrice du
    // prédicat — seule sa moitié déclenchante (contrôle SANS tâche) était couverte.
    // Celui-ci ferme ce trou : un contrôle conclu par le vrai chemin gardé (walkthrough
    // → tâche → procédure non-inquiry → setDiStatus) doit rester INTACT après 0149.
    const { attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus } = await import('@/lib/services/sox');
    const { ingestEvidence } = await import('@/lib/services/evidence');
    const controlId = await poserControle('not_assessed', 'SONDE-0149-PROTEGE');
    try {
      const { evidenceId } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'walkthrough-protege.txt', mime: 'text/plain',
        bytes: new TextEncoder().encode('x'), source: 'auditor',
        uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
      });
      await attacherWalkthrough(controlId, IDS.users.karim, evidenceId);
      const taskId = await ajouterTacheControle(controlId, IDS.users.karim, 'tâche réelle protégée');
      await documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'inspection réelle');
      await setDiStatus(controlId, IDS.users.karim, 'effective', 'conclusion réelle, à protéger');

      const sql = fs.readFileSync(path.join(repoRoot(), 'supabase', 'migrations', '0149_ctrl01_correction_di_status.sql'), 'utf8');
      const db = await getDb();
      await db.exec(sql);

      const c = await q1<{ di_status: string; di_conclusion: string | null }>(`select di_status, di_conclusion from control where id = $1`, [controlId]);
      expect(c.di_status).toBe('effective');
      expect(c.di_conclusion).toBe('conclusion réelle, à protéger');
    } finally {
      await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
      await q(`delete from control_task where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('0149 échoue BRUYAMMENT (n\'écrase rien en silence) si le dossier visé est verrouillé', async () => {
    // Vérifié contre la production réelle (mcp__Supabase__execute_sql, 2026-09-08) : les deux
    // dossiers SOX qui portaient les douze violations sont `fieldwork`, pas `locked` — 0149
    // s'applique donc sans heurter cette garde aujourd'hui. Ce test prouve le CAS QUE 0149
    // NE RENCONTRE PAS EN PRODUCTION, mais dont le comportement doit rester correct si la
    // migration est un jour rejouée sur une base où le dossier a été verrouillé entre-temps :
    // `assert_engagement_unlocked()` (0003) doit lever, pas laisser 0149 réécrire un dossier
    // clos sous couvert d'un `set_config` que la migration pose délibérément PAS (voir son
    // en-tête).
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-LOCK-0149', 'Contrôle de sonde verrouillé', 'fictif', 'monthly', 'manual', 'preventive', 'effective')
       returning id::text`,
      [IDS.engSox])).id;
    const avant = await q1<{ status: string }>(`select status from engagement where id = $1`, [IDS.engSox]);
    await q(`update engagement set status = 'locked', locked_at = now() where id = $1`, [IDS.engSox]);
    try {
      const sql = fs.readFileSync(path.join(repoRoot(), 'supabase', 'migrations', '0149_ctrl01_correction_di_status.sql'), 'utf8');
      const db = await getDb();
      await expect(db.exec(sql)).rejects.toThrow(/is locked/);

      const c = await q1<{ di_status: string }>(`select di_status from control where id = $1`, [controlId]);
      expect(c.di_status).toBe('effective'); // inchangé : l'exception a arrêté l'UPDATE, rien n'a été écrasé
    } finally {
      await q(`update engagement set status = $2, locked_at = null where id = $1`, [IDS.engSox, avant.status]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
