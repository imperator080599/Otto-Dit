import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { documenterProcedureOe, proceduresOeDuControle, runAttributeTesting } from './sox';
import { ingestEvidence } from './evidence';

// LOT CONTRÔLE INTERNE, §3.3 (mandat), TRANCHE 7 — CTRL-06.
//
// « L'inquiry de l'OE est une inquiry NEUVE. Elle ne réutilise jamais celle du D&I... Elle porte
// sa propre date, postérieure. Réutiliser l'enregistrement du D&I est refusé. » Et, comme au D&I,
// au moins une procédure parmi inspection/observation/reperformance (CTRL-01 s'applique
// identiquement). Le garde vit dans `runAttributeTesting` (sox.ts) — il fire AVANT toute lecture
// de `control_test`/`sample`, donc un contrôle sans aucun tirage réel suffit à l'éprouver.

async function poserControleAvecDiInquiry(code: string): Promise<{ controlId: string; taskId: string; walkthroughEvidenceId: string }> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde CTRL-06', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code])).id;
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engNep, filename: 'walkthrough-sonde.txt', mime: 'text/plain',
    bytes: new TextEncoder().encode('walkthrough de sonde'), source: 'auditor',
    uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
  });
  await q(`update control set di_walkthrough_evidence_id = $2 where id = $1`, [controlId, evidenceId]);
  const task = await q1<{ id: string }>(
    `insert into control_task (engagement_id, control_id, seq_no, description) values ($1,$2,1,'tâche de sonde') returning id::text`,
    [IDS.engNep, controlId],
  );
  await q(
    `insert into control_task_procedure (engagement_id, task_id, procedure, notes, evidence_id)
     values ($1,$2,'inquiry','Entretien — walkthrough enregistré.',$3)`,
    [IDS.engNep, task.id, evidenceId],
  );
  return { controlId, taskId: task.id, walkthroughEvidenceId: evidenceId };
}

async function poserPieceNeuve(filename: string): Promise<string> {
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engNep, filename, mime: 'text/plain',
    bytes: new TextEncoder().encode(`pièce de sonde ${filename}`), source: 'auditor',
    uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
  });
  return evidenceId;
}

describe('CTRL-06 : inquiry OE neuve (service)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('proceduresOeDuControle : aucune procédure OE documentée → liste vide', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-VIDE');
    expect(await proceduresOeDuControle(controlId)).toEqual([]);
  });

  it('documenterProcedureOe(inquiry) refuse sans pièce — l’inquiry OE a besoin de sa PROPRE pièce', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-A');
    await expect(documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien', undefined, '2026-09-10'))
      .rejects.toThrow(/CTRL-06.*PROPRE pièce/);
  });

  it('cas connu mauvais (règle 17) : réutiliser la pièce du walkthrough D&I pour l’inquiry OE refuse, en nommant CTRL-06', async () => {
    const { controlId, walkthroughEvidenceId } = await poserControleAvecDiInquiry('SONDE-CTRL06-B');
    await expect(documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien', walkthroughEvidenceId, '2026-09-10'))
      .rejects.toThrow(/CTRL-06.*NEUVE/);
  });

  it('cas connu mauvais (règle 17) : une date d’inquiry OE non postérieure à l’inquiry D&I refuse', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-C');
    const pieceNeuve = await poserPieceNeuve('inquiry-oe-sonde-c.txt');
    // La tâche D&I (poserControleAvecDiInquiry) est créée AUJOURD'HUI (created_at = now()) —
    // une date d'inquiry OE fixée à AUJOURD'HUI aussi (même jour calendaire) n'est pas postérieure.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    await expect(documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien', pieceNeuve, aujourdhui))
      .rejects.toThrow(/CTRL-06.*POSTÉRIEURE/);
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : une pièce neuve ET une date postérieure (demain) sont acceptées', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-D');
    const pieceNeuve = await poserPieceNeuve('inquiry-oe-sonde-d.txt');
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien neuf, rien n’a changé', pieceNeuve, demain);
    const procs = await proceduresOeDuControle(controlId);
    expect(procs).toHaveLength(1);
    expect(procs[0].procedure).toBe('inquiry');
    expect(procs[0].performedAt.slice(0, 10)).toBe(demain);
  });

  it('cas connu mauvais (règle 17) : conclure le test d’attributs sans AUCUNE inquiry OE refuse, en nommant CTRL-06', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-E');
    await expect(runAttributeTesting(controlId, IDS.users.lea)).rejects.toThrow(/CTRL-06/);
  });

  it('cas connu mauvais (règle 17) : une inquiry OE seule, sans procédure au-delà, refuse en nommant CTRL-01', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-F');
    const pieceNeuve = await poserPieceNeuve('inquiry-oe-sonde-f.txt');
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien neuf', pieceNeuve, demain);
    await expect(runAttributeTesting(controlId, IDS.users.lea)).rejects.toThrow(/CTRL-01/);
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : inquiry OE + inspection débloquent le passage du garde CTRL-06/CTRL-01 (le reste échoue ensuite pour une raison étrangère — aucun tirage réel)', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-G');
    const pieceNeuve = await poserPieceNeuve('inquiry-oe-sonde-g.txt');
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await documenterProcedureOe(controlId, IDS.users.karim, 'inquiry', 'entretien neuf', pieceNeuve, demain);
    await documenterProcedureOe(controlId, IDS.users.karim, 'inspection', 'inspection réelle', undefined, demain);
    // Le garde CTRL-06/CTRL-01 est franchi ; l'échec suivant (aucun control_test réel pour ce
    // contrôle de sonde) prouve que le franchissement a bien eu lieu — pas un refus CTRL-06/01.
    await expect(runAttributeTesting(controlId, IDS.users.lea)).rejects.not.toThrow(/CTRL-06|CTRL-01/);
  });

  it('une valeur de procédure invalide est refusée à l’exécution, pas seulement par le type TypeScript', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-H');
    // @ts-expect-error — sonde volontaire d'une valeur hors du type, comme un FormData posté à la main
    await expect(documenterProcedureOe(controlId, IDS.users.karim, 'autre-chose', 'x')).rejects.toThrow(/documentable/);
  });

  it('étanchéité (ETANCH) : un intrus d’un autre cabinet ne peut pas documenter une procédure OE sur un contrôle qui n’est pas le sien', async () => {
    const { controlId } = await poserControleAvecDiInquiry('SONDE-CTRL06-ETANCH');
    const cabinet = await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet Étranger (sonde CTRL-06)') returning id::text`);
    const intrus = (await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1, 'Sonde Intrus', 'intrus-ctrl06@sonde.test', 'partner') returning id::text`,
      [cabinet.id],
    )).id;
    await expect(documenterProcedureOe(controlId, intrus, 'inspection', 'x')).rejects.toThrow(/ETANCH/);
    expect(await proceduresOeDuControle(controlId)).toEqual([]);
  });
});
