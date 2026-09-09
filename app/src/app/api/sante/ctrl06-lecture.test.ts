import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT CONTRÔLE INTERNE, TRANCHE 7 — LA LECTURE « CTRL-06 » DE /api/sante.
//
// CTRL-06 (mandat §3.3) : « L'inquiry de l'OE est une inquiry NEUVE... au moins une procédure
// parmi inspection/observation/reperformance (CTRL-01 s'applique identiquement). » Cette lecture
// ne peut rougir que si le garde de `runAttributeTesting` a été contourné — même discipline que
// CTRL-01/04/05/07 (mêmes fichiers de sonde).

async function poserControleTeste(code: string): Promise<string> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde CTRL-06', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code])).id;
  await q(
    `insert into control_test (control_id, status) values ($1,'complete')`,
    [controlId],
  );
  return controlId;
}

describe('CTRL-06 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucun test OE conclu : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-06'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun test OE conclu');
  });

  it('cas connu mauvais (règle 17) : un test OE conclu SANS aucune procédure OE fait rougir /api/sante entier', async () => {
    const controlId = await poserControleTeste('SONDE-CTRL06LEC-A');
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-06'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL06LEC-A');
      expect(lectureRouge.detail).toContain('inquiry neuve');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_test where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais (règle 17) : un test OE conclu avec inquiry SEULE (sans procédure au-delà) fait rougir, en nommant la manque exacte', async () => {
    const controlId = await poserControleTeste('SONDE-CTRL06LEC-B');
    await q(
      `insert into control_oe_procedure (engagement_id, control_id, procedure, notes, performed_at)
       values ($1,$2,'inquiry','entretien de sonde', now())`,
      [IDS.engNep, controlId],
    );
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-06'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('procédure au-delà de l’inquiry');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_oe_procedure where control_id = $1`, [controlId]);
      await q(`delete from control_test where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : inquiry + une autre procédure ne font pas rougir', async () => {
    const controlId = await poserControleTeste('SONDE-CTRL06LEC-C');
    await q(
      `insert into control_oe_procedure (engagement_id, control_id, procedure, notes, performed_at) values
       ($1,$2,'inquiry','entretien de sonde', now()),
       ($1,$2,'inspection','inspection de sonde', now())`,
      [IDS.engNep, controlId],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-06'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('inquiry neuve et procédure au-delà');
    } finally {
      await q(`delete from control_oe_procedure where control_id = $1`, [controlId]);
      await q(`delete from control_test where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('le vrai chemin gardé (documenterProcedureOe puis runAttributeTesting) reste vert', async () => {
    const {
      attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus,
      documenterFacteurDesign, lierRisqueControle, declarerIuc, drawAttributeSample,
      rapprocherPopulationControle, documenterProcedureOe, runAttributeTesting,
    } = await import('@/lib/services/sox');
    const { ingestEvidence } = await import('@/lib/services/evidence');
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-CTRL06LEC-D', 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
       returning id::text`,
      [IDS.engNep])).id;
    const risque = await q1<{ id: string }>(
      `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id::text`,
      [IDS.engNep],
    );
    try {
      const { evidenceId } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'walkthrough-ctrl06.txt', mime: 'text/plain',
        bytes: new TextEncoder().encode('x'), source: 'auditor',
        uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
      });
      await attacherWalkthrough(controlId, IDS.users.karim, evidenceId);
      const taskId = await ajouterTacheControle(controlId, IDS.users.karim, 'tâche réelle');
      await documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'inspection réelle');
      for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
        await documenterFacteurDesign(controlId, IDS.users.karim, f, `Conclusion pour ${f}.`);
      }
      await lierRisqueControle(controlId, IDS.users.karim, risque.id);
      await declarerIuc(controlId, IDS.users.karim, false);
      await setDiStatus(controlId, IDS.users.karim, 'effective', 'conclusion de sonde');
      await q(
        `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing')`,
        [controlId],
      );
      await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de sonde revue et complète.');
      await drawAttributeSample(controlId, IDS.users.karim, 1, 'Table du cabinet non fournie (sonde) — taille justifiée.');
      const { evidenceId: oeEvidenceId } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'oe-inquiry-ctrl06.txt', mime: 'text/plain',
        bytes: new TextEncoder().encode('y'), source: 'auditor',
        uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
      });
      const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien neuf, sonde', oeEvidenceId, demain);
      await documenterProcedureOe(controlId, IDS.users.karim, 'inspection', 'inspection de sonde', undefined, demain);
      await runAttributeTesting(controlId, IDS.users.karim);

      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-06'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from attribute_result where sample_item_id in (select id from sample_item where sample_id in (select id from sample where procedure_id in (select id from procedure_instance where control_id = $1)))`, [controlId]);
      await q(`delete from deviation where control_id = $1`, [controlId]);
      await q(`delete from sample_item where sample_id in (select id from sample where procedure_id in (select id from procedure_instance where control_id = $1))`, [controlId]);
      await q(`delete from request_item where request_id in (select id from request where procedure_id in (select id from procedure_instance where control_id = $1))`, [controlId]);
      await q(`delete from request where procedure_id in (select id from procedure_instance where control_id = $1)`, [controlId]);
      await q(`delete from control_test where control_id = $1`, [controlId]);
      await q(`delete from sample where procedure_id in (select id from procedure_instance where control_id = $1)`, [controlId]);
      await q(`delete from procedure_instance where control_id = $1`, [controlId]);
      await q(`delete from control_instance where control_id = $1`, [controlId]);
      await q(`delete from control_iuc where control_id = $1`, [controlId]);
      await q(`delete from control_risk where control_id = $1`, [controlId]);
      await q(`delete from control_design_factor where control_id = $1`, [controlId]);
      await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
      await q(`delete from control_task where control_id = $1`, [controlId]);
      await q(`delete from control_oe_procedure where control_id = $1`, [controlId]);
      await q(`delete from control_population_reconciliation where control_id = $1`, [controlId]);
      await q(`delete from risk where id = $1`, [risque.id]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
