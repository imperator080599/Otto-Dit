import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT CONTRÔLE INTERNE, TRANCHE 2 — LES LECTURES « CTRL-02 » ET « CTRL-03 » DE /api/sante.
//
// Même discipline que ctrl01-lecture.test.ts (règle 17) : chaque lecture part des CONTRÔLES
// conclus, jamais des facteurs/de l'IUC (un contrôle CONCLU sans AUCUN facteur, ou sans AUCUNE
// déclaration IUC, ne rejoindrait rien et se lirait vert si la lecture partait de ces tables).

async function poserControle(diStatus: string, code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', $3)
     returning id::text`,
    [IDS.engNep, code, diStatus])).id;
}

/** Une tâche + procédure au-delà de l'inquiry, pour que CTRL-01 (déjà en place) reste vert
 *  pendant qu'on éprouve CTRL-02/CTRL-03 spécifiquement — sinon un contrôle `effective` posé
 *  directement (sans passer par le chemin gardé) rougirait sur CTRL-01, pas sur ce qu'on teste
 *  ici (règle 16 : ne pas présenter comme preuve un artefact produit par un autre objet). */
async function poserTacheDocumentee(controlId: string): Promise<void> {
  const t = await q1<{ id: string }>(
    `insert into control_task (engagement_id, control_id, seq_no, description) values ($1,$2,1,'tâche de sonde') returning id::text`,
    [IDS.engNep, controlId],
  );
  await q(
    `insert into control_task_procedure (engagement_id, task_id, procedure, notes) values ($1,$2,'inspection','x')`,
    [IDS.engNep, t.id],
  );
}

/** Les quatre facteurs de design + un lien de risque réel, pour que CTRL-02 (déjà en place)
 *  reste vert pendant qu'on éprouve CTRL-03 spécifiquement — même raison que ci-dessus : les
 *  trois lectures partagent le même bassin de « contrôles conclus », donc un contrôle de sonde
 *  satisfaisant CTRL-03 seul rougirait quand même sur CTRL-02 s'il n'est pas aussi complet. */
async function poserFacteursEtRisque(controlId: string): Promise<string> {
  for (const factor of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation']) {
    await q(
      `insert into control_design_factor (engagement_id, control_id, factor, conclusion) values ($1,$2,$3,'x')`,
      [IDS.engNep, controlId, factor],
    );
  }
  const risque = await q1<{ id: string }>(
    `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id::text`,
    [IDS.engNep],
  );
  await q(`insert into control_risk (engagement_id, control_id, risk_id) values ($1,$2,$3)`, [IDS.engNep, controlId, risque.id]);
  return risque.id;
}

async function nettoyerControleComplet(controlId: string, risqueId?: string): Promise<void> {
  await q(`delete from control_iuc_preuve where iuc_id in (select id from control_iuc where control_id = $1)`, [controlId]);
  await q(`delete from control_iuc where control_id = $1`, [controlId]);
  await q(`delete from control_risk where control_id = $1`, [controlId]);
  await q(`delete from control_design_factor where control_id = $1`, [controlId]);
  await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
  await q(`delete from control_task where control_id = $1`, [controlId]);
  if (risqueId) await q(`delete from risk where id = $1`, [risqueId]);
  await q(`delete from control where id = $1`, [controlId]);
}

describe('CTRL-02/CTRL-03 : les lectures /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('CTRL-02 : sans aucun contrôle conclu, la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-02'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun contrôle conclu');
  });

  it('CTRL-02 : cas connu mauvais — un contrôle CONCLU sans aucun facteur de design fait rougir /api/sante entier', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL02-A');
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-02'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL02-A : facteur(s) manquant(s)');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('CTRL-02 : cas connu mauvais — les quatre facteurs documentés mais aucun lien de risque fait rougir', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL02-B');
    try {
      for (const factor of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation']) {
        await q(
          `insert into control_design_factor (engagement_id, control_id, factor, conclusion) values ($1,$2,$3,'x')`,
          [IDS.engNep, controlId, factor],
        );
      }
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-02'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL02-B : réponse au risque sans lien vers un risque réel');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_design_factor where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('CTRL-02 : les quatre facteurs et un lien de risque réel restent verts', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL02-C');
    let risqueId: string | undefined;
    try {
      await poserTacheDocumentee(controlId); // CTRL-01
      risqueId = await poserFacteursEtRisque(controlId); // ce qu'on teste
      await q(`insert into control_iuc (engagement_id, control_id, utilisee) values ($1,$2,false)`, [IDS.engNep, controlId]); // CTRL-03
      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-02'));
      expect(lectureVert.ok).toBe(true);
      expect(vert.status).toBe(200);
    } finally {
      await nettoyerControleComplet(controlId, risqueId);
    }
  });

  it('CTRL-03 : sans aucun contrôle conclu, la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-03'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun contrôle conclu');
  });

  it('CTRL-03 : cas connu mauvais — un contrôle CONCLU sans aucune déclaration IUC fait rougir', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL03-A');
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-03'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL03-A : aucune déclaration IUC');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('CTRL-03 : cas connu mauvais — une IUC déclarée utilisée sans preuve d’exactitude ni d’exhaustivité fait rougir', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL03-B');
    try {
      await q(`insert into control_iuc (engagement_id, control_id, utilisee) values ($1,$2,true)`, [IDS.engNep, controlId]);
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-03'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTRL03-B : IUC utilisée sans exactitude ni exhaustivite');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_iuc where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('CTRL-03 : IUC déclarée NON utilisée reste verte sans aucune preuve', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL03-C');
    let risqueId: string | undefined;
    try {
      await poserTacheDocumentee(controlId); // CTRL-01
      risqueId = await poserFacteursEtRisque(controlId); // CTRL-02
      await q(`insert into control_iuc (engagement_id, control_id, utilisee) values ($1,$2,false)`, [IDS.engNep, controlId]); // ce qu'on teste
      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-03'));
      expect(lectureVert.ok).toBe(true);
      expect(vert.status).toBe(200);
    } finally {
      await nettoyerControleComplet(controlId, risqueId);
    }
  });

  it('CTRL-03 : IUC déclarée utilisée avec les deux volets documentés reste verte', async () => {
    const controlId = await poserControle('effective', 'SONDE-CTRL03-D');
    let risqueId: string | undefined;
    try {
      await poserTacheDocumentee(controlId); // CTRL-01
      risqueId = await poserFacteursEtRisque(controlId); // CTRL-02
      const iuc = await q1<{ id: string }>(
        `insert into control_iuc (engagement_id, control_id, utilisee) values ($1,$2,true) returning id::text`,
        [IDS.engNep, controlId],
      );
      await q(
        `insert into control_iuc_preuve (engagement_id, iuc_id, volet, conclusion) values ($1,$2,'exactitude','x'), ($1,$2,'exhaustivite','y')`,
        [IDS.engNep, iuc.id],
      );
      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-03'));
      expect(lectureVert.ok).toBe(true);
      expect(vert.status).toBe(200);
    } finally {
      await nettoyerControleComplet(controlId, risqueId);
    }
  });
});
