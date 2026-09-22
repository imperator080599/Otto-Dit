import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox } from '@/lib/flows/part2';
import { bootstrapNep } from '@/lib/flows/part1';
import { lierControleAuPoste, importRcm } from './sox';
import { controlesDuPoste } from './poste';
import { processusDuPoste, deposerFlowchartClient } from './processus';
import { ingestEvidence } from './evidence';

// P1-03 (AUD-03) : le rattachement poste↔contrôle et poste↔processus se PROUVE en l'exerçant
// (règle 15), jamais lu en base sans passer par le chemin.

describe('P1-03 : processus et contrôles (AUD-03)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapSox();
  }, 120000);

  it('controlesDuPoste(REVENUE) rend C-REV-* seulement — le semeur pose control_fsli explicitement', async () => {
    const rows = await controlesDuPoste(IDS.engSox, 'REVENUE');
    expect(rows.map((r) => r.code).sort()).toEqual(['C-REV-01', 'C-REV-02', 'C-REV-03', 'C-REV-04']);
    expect(rows.every((r) => r.assertions.length > 0)).toBe(true);
  });

  it('un contrôle sans poste rattaché (C-BR-01, trésorerie) n\'apparaît PAS sur REVENUE', async () => {
    const rows = await controlesDuPoste(IDS.engSox, 'REVENUE');
    expect(rows.some((r) => r.code === 'C-BR-01')).toBe(false);
  });

  it('AUD-03 : aucun risk créé par rcm_import ne porte un niveau déduit d\'is_key', async () => {
    const orphelins = await q1<{ n: string }>(
      `select count(*)::text n from risk where source = 'rcm_import' and level is not null`, []);
    expect(orphelins.n).toBe('0');
  });

  it('lierControleAuPoste refuse un contrôle d\'un autre dossier (ETANCH)', async () => {
    const autre = await q01<{ id: string }>(`select id from control where engagement_id != $1 limit 1`, [IDS.engSox]);
    if (!autre) return;
    await expect(lierControleAuPoste(IDS.engSox, autre.id, 'REVENUE', [], IDS.users.karim))
      .rejects.toThrow(/n'appartient pas à ce dossier/);
  });

  it('lierControleAuPoste est un upsert — reposer le même lien met à jour, ne duplique pas', async () => {
    const c = await q1<{ id: string }>(`select id from control where engagement_id = $1 and code = 'C-REV-01'`, [IDS.engSox]);
    await lierControleAuPoste(IDS.engSox, c.id, 'REVENUE', ['realite'], IDS.users.karim);
    const compte = await q1<{ n: string }>(
      `select count(*)::text n from control_fsli where control_id = $1 and fsli_code = 'REVENUE'`, [c.id]);
    expect(compte.n).toBe('1');
    const ligne = await q1<{ assertions: string[] }>(
      `select assertions from control_fsli where control_id = $1 and fsli_code = 'REVENUE'`, [c.id]);
    expect(ligne.assertions).toEqual(['realite']);
  });

  it('deux process_model ACTIFS sur le même cycle (codes distincts) sont acceptés — AUD-03', async () => {
    await bootstrapNep();
    const ev1 = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'sonde1.json', mime: 'application/json',
      bytes: new TextEncoder().encode('{}'), source: 'auditor', audience: 'internal',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim },
    });
    const ev2 = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'sonde2.json', mime: 'application/json',
      bytes: new TextEncoder().encode('{}'), source: 'auditor', audience: 'internal',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim },
    });
    await q1(
      `insert into process_model (engagement_id, cycle_ref, exercice, name, evidence_id, created_by, code, fsli_code)
       values ($1,'REVENUE','n','Premier processus ventes',$2,$3,'REVENUE-1','REVENUE') returning id`,
      [IDS.engNep, ev1.evidenceId, IDS.users.karim],
    );
    await q1(
      `insert into process_model (engagement_id, cycle_ref, exercice, name, evidence_id, created_by, code, fsli_code)
       values ($1,'REVENUE','n','Second processus ventes',$2,$3,'REVENUE-2','REVENUE') returning id`,
      [IDS.engNep, ev2.evidenceId, IDS.users.karim],
    );
    const actifs = await q1<{ n: string }>(
      `select count(*)::text n from process_model where engagement_id = $1 and cycle_ref = 'REVENUE' and exercice = 'n' and status = 'active'`,
      [IDS.engNep],
    );
    expect(Number(actifs.n)).toBeGreaterThanOrEqual(2);
  });

  it('processusDuPoste(REVENUE) rend les process_model actifs rattachés, par code', async () => {
    const rows = await processusDuPoste(IDS.engNep, 'REVENUE');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cycleRef === 'REVENUE')).toBe(true);
  });

  it('deposerFlowchartClient refuse un processus d\'un autre dossier (ETANCH), accepte le sien', async () => {
    const modele = await q1<{ id: string }>(
      `select id from process_model where engagement_id = $1 and cycle_ref = 'REVENUE' limit 1`, [IDS.engNep]);
    const ev = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'flowchart.png', mime: 'image/png',
      bytes: new TextEncoder().encode('sonde'), source: 'portal', audience: 'client_provided',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim },
    });
    await expect(deposerFlowchartClient(IDS.engSox, modele.id, ev.evidenceId, IDS.users.karim))
      .rejects.toThrow(/n'appartient pas à ce dossier/);

    const evOk = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'flowchart.png', mime: 'image/png',
      bytes: new TextEncoder().encode('sonde'), source: 'portal', audience: 'client_provided',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim },
    });
    await deposerFlowchartClient(IDS.engNep, modele.id, evOk.evidenceId, IDS.users.karim);
    const relu = await q1<{ id: string | null }>(
      `select client_flowchart_evidence_id id from process_model where id = $1`, [modele.id]);
    expect(relu.id).toBe(evOk.evidenceId);
  });

  it('control_fsli : colonne CSV optionnelle "fsli" backfille le lien à l\'import', async () => {
    const csv = 'code;name;description;frequency;nature;effect;is_key;itgc_area;owner;process;risk_desc;assertions;coso_component;fsli\n'
      + 'C-SONDE-01;Contrôle sonde;Description;monthly;manual;preventive;yes;;Owner;Sonde;Risque sonde;realite;Control Activities;REVENUE';
    await importRcm(IDS.engNep, csv, IDS.users.karim, 'sonde.csv');
    const lien = await q01<{ fsli_code: string }>(
      `select cf.fsli_code from control_fsli cf join control c on c.id = cf.control_id
       where c.engagement_id = $1 and c.code = 'C-SONDE-01'`, [IDS.engNep]);
    expect(lien?.fsli_code).toBe('REVENUE');
  });
});
