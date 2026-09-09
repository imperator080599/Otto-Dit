import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT CONTRÔLE INTERNE, TRANCHE 3 — LA LECTURE « CTRL-07 » DE /api/sante.
//
// CTRL-07 (mandat §3.2) : la table de tailles d'échantillon OE du pack est livrée VIDE
// (`pcaob-sox.ts`) — `drawAttributeSample` (sox.ts) refuse tout tirage sans justification écrite
// tant qu'aucune fréquence n'y a de taille vérifiée. Cette lecture ne peut donc rougir que si un
// tirage a CONTOURNÉ ce garde (un SQL direct, une régression du garde) — exactement comme
// CTRL-01/02/03 (mêmes fichiers de sonde), elle ne prouve pas que le garde fonctionne pour un
// tirage qui n'a pas encore eu lieu (aucun cas à rougir tant qu'aucun tirage n'existe).

// di_status = 'not_assessed' délibérément : CTRL-01/02/03 (mêmes lectures GLOBALES) ne
// portent que sur les contrôles CONCLUS ('effective'/'ineffective'), et cette sonde teste
// CTRL-07 seule — un tirage posé directement, hors du chemin gardé, sans faire rougir les
// trois autres lectures pour une raison qui leur est étrangère.
async function poserControle(code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde CTRL-07', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code])).id;
}

async function poserTirageDirect(
  controlId: string, code: string, override: string | null,
): Promise<{ procedureId: string; sampleId: string }> {
  const procedure = (await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, control_id, title, status, nature)
     values ($1,'pcaob-sox',$2,'control_test',$3,'sonde CTRL-07','in_progress','tests_de_controles') returning id::text`,
    [IDS.engNep, `OE-${code}`, controlId],
  )).id;
  const sample = (await q1<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, rationale, status)
     values ($1,$2,'attribute_frequency',$3,'sonde-seed','sonde-hash',3,'sonde CTRL-07','drawn') returning id::text`,
    [IDS.engNep, procedure, JSON.stringify({ size: 3, frequency: 'monthly', override })],
  )).id;
  return { procedureId: procedure, sampleId: sample };
}

describe('CTRL-07 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucun tirage OE : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-07'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun tirage OE');
  });

  it('cas connu mauvais (règle 17) : un tirage SANS justification écrite, sur une fréquence non vérifiée, fait rougir /api/sante entier', async () => {
    const controlId = await poserControle('SONDE-CTRL07-A');
    const { procedureId, sampleId } = await poserTirageDirect(controlId, 'SONDE-CTRL07-A', null);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-07'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('ni justification écrite, ni taille vérifiée');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from sample where id = $1`, [sampleId]);
      await q(`delete from procedure_instance where id = $1`, [procedureId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : un tirage AVEC justification écrite ne fait pas rougir, même sur une fréquence non vérifiée', async () => {
    const { rapprocherPopulationControle } = await import('@/lib/services/sox');
    const controlId = await poserControle('SONDE-CTRL07-B');
    // CTRL-04 est une lecture GLOBALE (tranche 6) : sans population rapprochée, ce tirage de
    // sonde ferait aussi rougir CTRL-04, pour une raison étrangère à ce que ce test isole.
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing')`,
      [controlId],
    );
    await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de sonde revue et complète.');
    const { procedureId, sampleId } = await poserTirageDirect(
      controlId, 'SONDE-CTRL07-B', 'Table du cabinet non fournie — taille interimaire retenue et justifiée (sonde).',
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-07'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('tirage(s) OE');
    } finally {
      await q(`delete from sample where id = $1`, [sampleId]);
      await q(`delete from procedure_instance where id = $1`, [procedureId]);
      await q(`delete from control_population_reconciliation where control_id = $1`, [controlId]);
      await q(`delete from control_instance where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais, legacy (règle 17) : le tirage réel du 2026-09-01, antérieur à CTRL-07, ne rougit pas', async () => {
    /* Trouvé EN PRODUCTION le jour de l'expédition (2026-09-09, `deploye` a rougi) : deux
       tirages réels (C-BR-01, C-REV-01), tirés le 2026-09-01 sous l'ancien défaut de pack —
       avant que CTRL-07 n'existe — portent un vrai travail de dossier (control_test 'complete',
       déviations, workpapers signés) qu'on ne détruit ni ne réécrit (règle 28). La lecture les
       nomme par leur id EXACT (LEGACY_AVANT_CTRL07, route.ts) plutôt que d'inventer une
       justification a posteriori (règle 31). Ce test prouve que le VRAI id de production est
       traité comme legacy ; le test précédent (« cas connu mauvais ») prouve, avec un id
       différent construit par la sonde, que la liste ne dispense PAS les autres tirages —
       la liste compare l'ID exact, jamais le code du contrôle ni la date. */
    const controlId = await poserControle('SONDE-CTRL07-LEGACY');
    const procedure = (await q1<{ id: string }>(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, control_id, title, status, nature)
       values ($1,'pcaob-sox','OE-SONDE-CTRL07-LEGACY','control_test',$2,'sonde CTRL-07 legacy','in_progress','tests_de_controles') returning id::text`,
      [IDS.engNep, controlId],
    )).id;
    // Le VRAI id de production (C-BR-01, 2026-09-01) — doit être traité comme legacy, pas rougir.
    const LEGACY_ID = '1a158f98-869b-4cee-a655-2262a9d847b0';
    await q(
      `insert into sample (id, engagement_id, procedure_id, method, params, seed, population_hash, population_size, rationale, status)
       values ($1,$2,$3,'attribute_frequency',$4,'sonde-seed','sonde-hash',3,'sonde CTRL-07 legacy','drawn')`,
      [LEGACY_ID, IDS.engNep, procedure, JSON.stringify({ size: 3, frequency: 'monthly', override: null })],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-07'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('legacy');
    } finally {
      await q(`delete from sample where id = $1`, [LEGACY_ID]);
      await q(`delete from procedure_instance where id = $1`, [procedure]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('le vrai chemin gardé (drawAttributeSample avec dérogation ADR-010) reste vert', async () => {
    const {
      attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus,
      documenterFacteurDesign, lierRisqueControle, declarerIuc, drawAttributeSample, importInstances,
      rapprocherPopulationControle,
    } = await import('@/lib/services/sox');
    const { ingestEvidence } = await import('@/lib/services/evidence');
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-CTRL07-C', 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
       returning id::text`,
      [IDS.engNep])).id;
    const risque = await q1<{ id: string }>(
      `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id::text`,
      [IDS.engNep],
    );
    try {
      const { evidenceId } = await ingestEvidence({
        engagementId: IDS.engNep, filename: 'walkthrough-ctrl07.txt', mime: 'text/plain',
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
      await importInstances(controlId, 'label;occurred_on;performer_name\nA1;2026-01-05;Alice\nA2;2026-01-12;Alice\nA3;2026-01-19;Bob\n', IDS.users.karim);
      // CTRL-04 (tranche 6) : la population doit être rapprochée avant tout tirage.
      await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de sonde conclue pour isoler CTRL-07.');
      await drawAttributeSample(controlId, IDS.users.karim, 2, 'Table du cabinet non fournie (CTRL-07) — taille de sonde justifiée.');

      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('CTRL-07'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
    } finally {
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
      await q(`delete from control_population_reconciliation where control_id = $1`, [controlId]);
      await q(`delete from risk where id = $1`, [risque.id]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
