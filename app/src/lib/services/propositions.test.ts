// P1-01 (AUD-01, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §426-433). Les six opérations,
// PROP-01/02, le verrou (dossier scellé), l'étanchéité (membre étranger), l'immuabilité de
// `valeur_proposee` (UPDATE direct refusé par le déclencheur) — l'épreuve nommée en §432.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import {
  proposer, accepter, modifier, refuser, perimer, enAttente, parObjet,
  PropositionExistante, PropositionDejaStatuee, ApplicateurNonBranche,
} from './propositions';

const KARIM = IDS.users.karim;   // senior sur IDS.engNep — can_sign = false (seed.ts)
const LEA = IDS.users.lea;       // manager sur IDS.engNep — can_sign = true (seed.ts)

let deficiencyId: string;
let controlDef: string;

async function nouvelleDeficience(suffixe: string): Promise<{ controlId: string; deficiencyId: string }> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1,$2,'Contrôle de sonde (proposition)','fictif','monthly','manual','preventive','not_assessed')
     returning id::text`,
    [IDS.engNep, `C-PROP-${suffixe}`],
  )).id;
  const defId = (await q1<{ id: string }>(
    `insert into deficiency (engagement_id, control_id, severity_proposed, narrative, status, magnitude_basis)
     values ($1,$2,'deficiency','Narrative fictive de sonde (proposition)','proposed','base fictive de sonde')
     returning id::text`,
    [IDS.engNep, controlId],
  )).id;
  return { controlId, deficiencyId: defId };
}

describe('propositions — le mécanisme générique (P1-01, AUD-01)', () => {
  beforeAll(async () => {
    await initTestDb();
    ({ controlId: controlDef, deficiencyId } = await nouvelleDeficience('BASE'));
  });

  it('proposer() écrit une ligne « proposee » ; PROP-01 refuse la seconde tant que la première tient', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('DEDUP');
    const id = await proposer({
      engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' },
    });
    expect(id).toBeTruthy();
    await expect(proposer({
      engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' },
    })).rejects.toThrow(PropositionExistante);
    const enAttentePourD = (await parObjet('deficiency', d)).filter((p) => p.status === 'proposee');
    expect(enAttentePourD).toHaveLength(1);
  });

  it('accepter() applique la valeur proposée telle quelle — l’objet porteur est mis à jour, decided_by posé, l’événement écrit', async () => {
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'deficiency', objectId: deficiencyId, valeur: { severity: 'deficiency' },
    });
    await accepter(propId, LEA);
    const p = (await parObjet('deficiency', deficiencyId)).find((x) => x.id === propId)!;
    expect(p.status).toBe('acceptee');
    expect(p.decidedBy).toBe(LEA);
    expect(p.decidedAt).not.toBeNull();
    const d = await q1<{ status: string; severity_final: string }>(
      `select status, severity_final from deficiency where id = $1`, [deficiencyId]);
    expect(d.status).toBe('confirmed');
    expect(d.severity_final).toBe('deficiency');
    const ev = await q<{ verb: string }>(
      `select verb from event_log where object_type = 'proposition' and object_id = $1 order by id`, [propId]);
    expect(ev.map((e) => e.verb)).toEqual(['proposition.creee', 'proposition.acceptee']);
  });

  it('modifier() applique une valeur corrigée par l’humain, différente de celle proposée', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('MODIFIER');
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' },
    });
    await modifier(propId, LEA, { severity: 'significant_deficiency', rationale: 'aggravée par sonde' });
    const p = (await parObjet('deficiency', d)).find((x) => x.id === propId)!;
    expect(p.status).toBe('modifiee');
    expect(p.valeurRetenue).toEqual({ severity: 'significant_deficiency', rationale: 'aggravée par sonde' });
    const dd = await q1<{ severity_final: string }>(`select severity_final from deficiency where id = $1`, [d]);
    expect(dd.severity_final).toBe('significant_deficiency');
  });

  it('PROP-02 — une proposition déjà statuée ne se restatue pas (accepter, modifier, refuser)', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('DEJASTATUEE');
    const propId = await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' } });
    await accepter(propId, LEA);
    await expect(accepter(propId, LEA)).rejects.toThrow(PropositionDejaStatuee);
    await expect(modifier(propId, LEA, { severity: 'material_weakness' })).rejects.toThrow(PropositionDejaStatuee);
    await expect(refuser(propId, LEA, 'motif fictif')).rejects.toThrow(PropositionDejaStatuee);
  });

  it('PROP-02R — refuser sans motif écrit ne se relit pas ; avec motif, la proposition passe « refusee »', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('REFUS');
    const propId = await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' } });
    await expect(refuser(propId, LEA, '')).rejects.toThrow(/PROP-02R/);
    await refuser(propId, LEA, 'motif fictif de sonde');
    const p = (await parObjet('deficiency', d)).find((x) => x.id === propId)!;
    expect(p.status).toBe('refusee');
    expect(p.motif).toBe('motif fictif de sonde');
    /* refuser() ne touche pas l'objet porteur — c'est ce qui la distingue d'accepter/modifier. */
    const dd = await q1<{ status: string }>(`select status from deficiency where id = $1`, [d]);
    expect(dd.status).toBe('proposed');
  });

  it('perimer() ne touche jamais une proposition déjà statuée par un humain (règle 28)', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('PERIMER');
    const propId = await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' } });
    await accepter(propId, LEA);
    await perimer(propId, 'recalcul fictif de sonde');
    const p = (await parObjet('deficiency', d)).find((x) => x.id === propId)!;
    expect(p.status).toBe('acceptee'); // inchangée, pas 'perimee'

    const { deficiencyId: d2 } = await nouvelleDeficience('PERIMER2');
    const propId2 = await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d2, valeur: { severity: 'deficiency' } });
    await perimer(propId2, 'recalcul fictif de sonde');
    const p2 = (await parObjet('deficiency', d2)).find((x) => x.id === propId2)!;
    expect(p2.status).toBe('perimee');
  });

  it('PROP-03 — un type catalogué mais non branché refuse nommément, jamais une écriture devinée', async () => {
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'scoping', objectId: '00000000-0000-0000-0000-0000000000f1', valeur: { decision: 'in_scope' },
    });
    await expect(accepter(propId, LEA)).rejects.toThrow(ApplicateurNonBranche);
  });

  it('PROP-05 — un écart de walkthrough n’a pas de valeur par défaut : accepter() nu refuse, modifier() applique la décision', async () => {
    const control = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'C-PROP-GAP','Contrôle de sonde (gap)','fictif','monthly','manual','preventive','not_assessed')
       returning id::text`,
      [IDS.engNep],
    )).id;
    const gapId = (await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, citation, description)
       values ($1,$2,1,'omission_doc','citation fictive','écart fictif de sonde')
       returning id::text`,
      [IDS.engNep, control],
    )).id;
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'walkthrough_gap', objectId: gapId,
      valeur: { kind: 'omission_doc', citation: 'citation fictive', description: 'écart fictif de sonde' },
    });
    await expect(accepter(propId, LEA)).rejects.toThrow(/PROP-05/);
    await modifier(propId, LEA, { decision: 'dismissed', reason: 'motif fictif de sonde' });
    const g = await q1<{ status: string }>(`select status from control_walkthrough_gap where id = $1`, [gapId]);
    expect(g.status).toBe('dismissed');
  });

  it('extraction_field — accepter() vérifie l’extraction telle que proposée', async () => {
    const evidenceId = (await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, storage_path, source, uploaded_by_kind)
       values ($1,'piece-de-sonde-prop.pdf','application/pdf','sha-fictif-sonde-prop','blob://fictif/sonde-prop','auditor','app_user')
       returning id::text`,
      [IDS.engNep],
    )).id;
    const extractionId = (await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields)
       values ($1,'ocr','pending_verify','[{"name":"amount","value":"100","confidence":0.4}]'::jsonb)
       returning id::text`,
      [evidenceId],
    )).id;
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'extraction_field', objectId: extractionId,
      valeur: { fields: [{ name: 'amount', value: '100', confidence: 0.4 }] },
    });
    await accepter(propId, LEA);
    const x = await q1<{ status: string; verified_by: string }>(
      `select status, verified_by from extraction where id = $1`, [extractionId]);
    expect(x.status).toBe('verified');
    expect(x.verified_by).toBe(LEA);
  });

  it('materiality — accepter() exige un signataire (can_sign) ou un manager/partner (PROP-04)', async () => {
    const materialityId = (await q1<{ id: string }>(
      `insert into materiality (engagement_id, version, benchmark_code, benchmark_amount, pct,
         amount, perf_pct, perf_amount, ctt_pct, ctt_amount, te_pct, te_amount, rationale, status)
       values ($1,99,'pbt',100000,0.05,5000,0.75,3750,0.5,2500,0.1,500,'Rationale fictive de sonde (proposition)','proposed')
       returning id::text`,
      [IDS.engNep],
    )).id;
    const propId = await proposer({
      engagementId: IDS.engNep, objectType: 'materiality', objectId: materialityId, valeur: { benchmarkCode: 'pbt', pct: 0.05 },
    });
    /* KARIM est senior, can_sign=false (seed.ts) — refusé. */
    await expect(accepter(propId, KARIM)).rejects.toThrow(/PROP-04/);
    /* LÉA est manager, can_sign=true — accepté. */
    await accepter(propId, LEA);
    const m = await q1<{ status: string }>(`select status from materiality where id = $1`, [materialityId]);
    expect(m.status).toBe('validated');
  });

  it('étanchéité — statuer une proposition d’un AUTRE cabinet est refusé (ETANCH-01), le dossier étranger n’apprend rien', async () => {
    const autre = await q1<{ id: string }>(`insert into tenant (name) values ('Autre cabinet (fictif, sonde proposition)') returning id::text`);
    const ent = await q1<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
       values ($1, 'Étrangère SA (fictive, sonde proposition)', 'FR', 'fictional', null, 'EUR') returning id::text`, [autre.id]);
    const per = await q1<{ id: string }>(
      `insert into period (entity_id, label, start_date, end_date) values ($1, 'FY2026', '2026-01-01', '2026-12-31') returning id::text`, [ent.id]);
    const eng = await q1<{ id: string }>(
      `insert into engagement (tenant_id, entity_id, period_id, kind, name, framework_set, status)
       values ($1, $2, $3, 'statutory_audit', 'Dossier étranger (fictif, sonde proposition)', '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}'::jsonb, 'setup')
       returning id::text`, [autre.id, ent.id, per.id]);
    const controlEtranger = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'C-PROP-ETR','Contrôle étranger (fictif)','fictif','monthly','manual','preventive','not_assessed')
       returning id::text`, [eng.id],
    )).id;
    const defEtrangere = (await q1<{ id: string }>(
      `insert into deficiency (engagement_id, control_id, severity_proposed, narrative, status)
       values ($1,$2,'deficiency','Narrative fictive (étranger)','proposed') returning id::text`,
      [eng.id, controlEtranger],
    )).id;
    const propId = await proposer({
      engagementId: eng.id, objectType: 'deficiency', objectId: defEtrangere, valeur: { severity: 'deficiency' },
    });
    await expect(accepter(propId, KARIM)).rejects.toThrow(/ETANCH-01/);
  });

  /* CAS CONNU MAUVAIS (règle 17) — le dossier scellé. La garde générique
     (`assert_engagement_unlocked`, même déclencheur que toutes les autres tables du dossier)
     doit refuser une ÉCRITURE sur `proposition`, exactement comme sur les autres. */
  it('CAS CONNU MAUVAIS — un dossier scellé refuse une nouvelle proposition (verrou générique)', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('VERROU');
    await q(`update engagement set status = 'locked' where id = $1`, [IDS.engNep]);
    try {
      await expect(proposer({
        engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' },
      })).rejects.toThrow(/writes rejected/);
    } finally {
      await q(`update engagement set status = 'fieldwork' where id = $1`, [IDS.engNep]);
    }
  });

  /* CAS CONNU MAUVAIS — l'immuabilité de `valeur_proposee`. Direct SQL, PAS le service : c'est
     le déclencheur qui doit refuser, pas seulement l'absence d'une fonction pour le faire. */
  it('CAS CONNU MAUVAIS — valeur_proposee ne s’édite jamais après création (déclencheur)', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('FIGEE');
    const propId = await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' } });
    await expect(q(
      `update proposition set valeur_proposee = '{"severity":"material_weakness"}'::jsonb where id = $1`, [propId],
    )).rejects.toThrow(/ne s'édite jamais|ne s’édite jamais/);
    /* FAUX POSITIF, DANS LE MÊME TEST : une colonne AUTRE que `valeur_proposee` (ici `motif`,
       via refuser()) s'édite normalement — le déclencheur ne bloque QUE le champ qu'il nomme. */
    await refuser(propId, LEA, 'motif fictif de sonde (édition normale)');
    const p = (await parObjet('deficiency', d)).find((x) => x.id === propId)!;
    expect(p.status).toBe('refusee');
  });

  it('enAttente() ne rend que les propositions « proposee » du dossier, et refuse un non-membre', async () => {
    const { deficiencyId: d } = await nouvelleDeficience('ENATTENTE');
    await proposer({ engagementId: IDS.engNep, objectType: 'deficiency', objectId: d, valeur: { severity: 'deficiency' } });
    const liste = await enAttente(IDS.engNep, { userId: LEA });
    expect(liste.some((p) => p.objectId === d)).toBe(true);
    for (const p of liste) expect(p.status).toBe('proposee');
    /* HUGO est du même cabinet mais pas de l'équipe d'IDS.engNep (même fixture que
       notifications.test.ts, « un dossier dont on n'est pas membre ne rend rien ») — ETANCH-03. */
    const hugo = IDS.users.hugo;
    await expect(enAttente(IDS.engNep, { userId: hugo })).rejects.toThrow(/ETANCH-03/);
  });
});
