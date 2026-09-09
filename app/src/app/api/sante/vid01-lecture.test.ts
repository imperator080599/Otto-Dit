import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { ingestEvidence } from '@/lib/services/evidence';
import { GET } from './route';

// MANDAT DU 9 SEPTEMBRE, §3 — LA LECTURE « VID-01 » DE /api/sante.
//
// VID-01 : « conclure ou maintenir conclu un D&I dont la vidéo d'inquiry a été supprimée, sans
// qu'une autre preuve d'inquiry la remplace. » `setDiStatus` (sox.ts) garde le premier cas À
// L'ÉCRITURE ; cette lecture couvre le second — « maintenir conclu » — un contrôle DÉJÀ conclu
// dont la vidéo est supprimée APRÈS coup, par un chemin qui ne repasse jamais par `setDiStatus`.
//
// Les contrôles de sonde satisfont CTRL-01/02/03 DIRECTEMENT (tâche au-delà de l'inquiry, quatre
// facteurs, risque lié, IUC déclarée) — sinon un contrôle « effective » de sonde ferait rougir
// CES lectures-LÀ, pas VID-01, et le cas connu mauvais ne prouverait rien sur ce qu'il vise
// (règle 16 : ne jamais présenter comme preuve un artefact produit par un autre objet).

async function controleConclu(code: string, diWalkthroughEvidenceId: string | null): Promise<{ controlId: string; riskId: string }> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status, di_walkthrough_evidence_id)
     values ($1, $2, 'Contrôle de sonde VID-01', 'fictif', 'monthly', 'manual', 'preventive', 'effective', $3)
     returning id::text`,
    [IDS.engNep, code, diWalkthroughEvidenceId],
  )).id;
  const taskId = (await q1<{ id: string }>(
    `insert into control_task (engagement_id, control_id, seq_no, description) values ($1,$2,1,'tâche de sonde') returning id::text`,
    [IDS.engNep, controlId],
  )).id;
  await q(`insert into control_task_procedure (engagement_id, task_id, procedure, notes) values ($1,$2,'inspection','inspection de sonde')`, [IDS.engNep, taskId]);
  for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation']) {
    await q(`insert into control_design_factor (engagement_id, control_id, factor, conclusion) values ($1,$2,$3,'conclusion de sonde')`, [IDS.engNep, controlId, f]);
  }
  const riskId = (await q1<{ id: string }>(
    `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id::text`,
    [IDS.engNep],
  )).id;
  await q(`insert into control_risk (engagement_id, control_id, risk_id) values ($1,$2,$3)`, [IDS.engNep, controlId, riskId]);
  await q(`insert into control_iuc (engagement_id, control_id, utilisee) values ($1,$2,false)`, [IDS.engNep, controlId]);
  return { controlId, riskId };
}

async function nettoyer(controlId: string, riskId: string): Promise<void> {
  await q(`delete from control_iuc where control_id = $1`, [controlId]);
  await q(`delete from control_risk where control_id = $1`, [controlId]);
  await q(`delete from control_design_factor where control_id = $1`, [controlId]);
  await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
  await q(`delete from control_task where control_id = $1`, [controlId]);
  await q(`delete from control where id = $1`, [controlId]);
  await q(`delete from risk where id = $1`, [riskId]);
}

async function pieceSupprimee(filename: string): Promise<string> {
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engNep, filename, mime: 'text/plain',
    bytes: new TextEncoder().encode('synthetic walkthrough transcript'), source: 'auditor',
    uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
  });
  await q(`update evidence set deleted_at = now(), deleted_by = $2, deleted_reason = 'sonde VID-01' where id = $1`, [evidenceId, IDS.users.karim]);
  return evidenceId;
}

describe('VID-01 : la lecture /api/sante', () => {
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
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun contrôle conclu');
  });

  it('cas connu mauvais (règle 17) : un D&I conclu dont la vidéo d’inquiry est supprimée fait rougir /api/sante entier', async () => {
    const evidenceId = await pieceSupprimee('walkthrough-vid01lec-a.txt');
    const { controlId, riskId } = await controleConclu('SONDE-VID01LEC-A', evidenceId);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-VID01LEC-A');
      expect(lectureRouge.detail).toContain('jamais remplacée');
      expect(rouge.status).toBe(500);
    } finally {
      await nettoyer(controlId, riskId);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : un D&I conclu SANS aucun walkthrough jamais attaché ne fait pas rougir', async () => {
    // VID-01, au sens strict du mandat, ne parle que d'une vidéo qui A EXISTÉ puis a été
    // supprimée — jamais de son absence d'origine (un trou distinct, non nommé par ce mandat).
    const { controlId, riskId } = await controleConclu('SONDE-VID01LEC-B', null);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
    } finally {
      await nettoyer(controlId, riskId);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : un D&I conclu avec une vidéo NON supprimée ne fait pas rougir', async () => {
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'walkthrough-vid01lec-c.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('x'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    const { controlId, riskId } = await controleConclu('SONDE-VID01LEC-C', evidenceId);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toMatch(/avec vidéo attachée/);
    } finally {
      await nettoyer(controlId, riskId);
    }
  });

  it('défaut retiré : ré-attacher un enregistrement NEUF sur un contrôle dont la vidéo était supprimée fait revenir la lecture au vert', async () => {
    const supprimee = await pieceSupprimee('walkthrough-vid01lec-d-avant.txt');
    const { controlId, riskId } = await controleConclu('SONDE-VID01LEC-D', supprimee);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      expect(bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01')).ok).toBe(false);

      const { evidenceId: remplacement } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'walkthrough-vid01lec-d-apres.txt', mime: 'text/plain',
        bytes: new TextEncoder().encode('y'), source: 'auditor',
        uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
      });
      await q(`update control set di_walkthrough_evidence_id = $2 where id = $1`, [controlId, remplacement]);

      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('VID-01'));
      expect(lectureVert.ok).toBe(true);
      expect(vert.status).toBe(200);
    } finally {
      await nettoyer(controlId, riskId);
    }
  });
});
