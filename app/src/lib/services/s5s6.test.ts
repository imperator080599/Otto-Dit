import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { dispositions } from '@/lib/flows/part1';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from './reconciliation';
import { rebuildFslis } from './fsli';
import { propose, validate } from './materiality';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from './sampling';
import { generatePbcFromSample, approveSend, requestDetail } from './requests';
import { ingestEvidence, answerExplanation } from './evidence';
import { extractAll, pendingVerifications, verifyExtraction } from './extraction/ladder';
import { runMatching, listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement } from './matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from './verification';
import { computeSampleEvaluation, concludeEvaluation, currentEvaluation, conclusionGate, recordEvaluationResponse } from './evaluation';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

interface IndexEntry { filename: string; sha256: string; docType: string; invoiceNumber?: string; forUnits: string[]; anomaly?: string }
interface ManifestT {
  substantiveAnomalies: { id: string; taxonomy: string[]; units: string[] }[];
  sampling: { revenue: { selectedUnits: string[] } };
}

let manifest: ManifestT;
let evidenceIndex: IndexEntry[];
let requestId: string;

async function uploadClientEvidence(): Promise<void> {
  // simulate the client: upload every dataset evidence file to its matching request item
  const detail = await requestDetail(requestId);
  const items = detail!.items;
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));
  const pieceBySampleItem = new Map(sample!.items.map((i) => [i.id, i.piece_ref]));

  for (const item of items.filter((i) => i.kind === 'document' && i.sample_item_id)) {
    const nk = nkBySampleItem.get(item.sample_item_id!);
    const piece = pieceBySampleItem.get(item.sample_item_id!);
    const isBl = /livraison|delivery/i.test(item.description);
    const entry = evidenceIndex.find(
      (e) => e.forUnits.includes(nk!) && (isBl ? e.docType === 'delivery_note' : e.docType === 'invoice' || e.docType === 'credit_note'),
    );
    if (!entry) continue; // A2's delivery note has no file — the client cannot provide it
    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename: path.basename(entry.filename),
      mime: 'application/pdf',
      bytes: fs.readFileSync(ds(...entry.filename.split('/'))),
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
    void piece;
  }
  // standing items: bank statements
  for (const item of items.filter((i) => !i.sample_item_id && /Relevé|statement/i.test(i.description))) {
    const month = item.description.includes('novembre') || item.description.includes('November') ? '2025-11' : '2025-12';
    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename: `releve_512100_${month}.pdf`,
      mime: 'application/pdf',
      bytes: fs.readFileSync(ds('evidence', `releve_512100_${month}.pdf`)),
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
  }
}

describe('S5/S6 — extraction ladder, matching, exceptions, verification, evaluation (app path)', () => {
  beforeAll(async () => {
    await initTestDb();
    manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
    evidenceIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8'));
    // bootstrap through S4
    const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv', content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
    await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
    await computeTbGl(IDS.engNep, IDS.users.karim);
    for (const item of (await latestTbGl(IDS.engNep))!.items) {
      await noteReconciliationLimitation(item.id, IDS.users.karim, {
      explanation: 'Écriture de situation (Dr 411000 / Cr 706000, 25 000 €) passée après l’extraction du fichier des écritures.',
      alternativeProcedures: 'Rapprochement re-exécuté sur la balance et sur le détail des comptes 411000 et 706000 ; écart isolé, de sens opposé et de même montant. Fichier marqué provisoire, rapprochement à rejouer sur le FEC définitif.',
    });
    }
    await rebuildFslis(IDS.engNep, IDS.users.karim);
    await validate(await propose(IDS.engNep, IDS.users.lea), IDS.users.lea);
    const sampleId = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
    await validateSampleParams(sampleId, IDS.users.lea);
    await drawRevenueSample(sampleId, IDS.users.lea);
    requestId = await generatePbcFromSample(IDS.engNep, sampleId, IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    await uploadClientEvidence();
  }, 180000);

  it('the extraction ladder runs: Factur-X exact, text-layer for born-digital, OCR replay pending verify', async () => {
    const res = await extractAll(IDS.engNep, IDS.users.karim);
    expect(res.processed).toBeGreaterThan(10);
    const rungs = await q<{ rung: string; n: string }>(
      `select x.rung, count(*) n from extraction x join evidence e on e.id = x.evidence_id
       where e.engagement_id = $1 group by x.rung`,
      [IDS.engNep],
    );
    const byRung = Object.fromEntries(rungs.map((r) => [r.rung, Number(r.n)]));
    expect(byRung.xml).toBe(1); // the Factur-X invoice
    expect(byRung.text_layer).toBeGreaterThan(10);
    expect(byRung.ocr).toBe(1); // the unlabeled "scan" invoice
    // Factur-X fields are exact (confidence 1.0, rung 1)
    const fx = await q1<{ fields: { name: string; value: string; confidence: number }[] }>(
      `select x.fields from extraction x join evidence e on e.id = x.evidence_id
       where e.engagement_id = $1 and x.rung = 'xml'`,
      [IDS.engNep],
    );
    expect(fx.fields.every((f) => f.confidence === 1)).toBe(true);
    expect(fx.fields.find((f) => f.name === 'invoiceNumber')).toBeTruthy();
  });

  it('OCR-rung extraction queues for verification (ADR-012: never a bypass) and is verified side-by-side', async () => {
    const pending = await pendingVerifications(IDS.engNep);
    expect(pending.length).toBe(1);
    expect(pending[0].rung).toBe('ocr');
    expect(pending[0].overall_confidence).toBeLessThan(0.9);
    await verifyExtraction(pending[0].id, IDS.users.karim);
    const after = await pendingVerifications(IDS.engNep);
    expect(after.length).toBe(0);
  });

  it('matching raises every seeded anomaly as a typed exception — zero false negatives, false positives triaged', async () => {
    const res = await runMatching(IDS.engNep, IDS.users.karim);
    expect(res.exceptions).toBeGreaterThan(0);
    const exceptions = await listExceptions(IDS.engNep);
    const substantive = exceptions.filter((x) => x.kind !== 'reconciliation');

    const sample = await currentRevenueSample(IDS.engNep);
    const sampleItemByNk = new Map(sample!.items.map((i) => [i.natural_key, i.id]));

    // zero false negatives: each manifest anomaly has an exception of the expected taxonomy
    for (const a of manifest.substantiveAnomalies) {
      for (const taxonomy of a.taxonomy) {
        const hit = a.units.some((u) =>
          substantive.some((x) => x.taxonomy_code === taxonomy && x.sample_item_id === sampleItemByNk.get(u)),
        );
        expect(hit, `${a.id}: expected ${taxonomy} exception`).toBe(true);
      }
    }
    // false positives: exceptions not attributable to a seeded anomaly, enumerated
    const anomalyItems = new Set(
      manifest.substantiveAnomalies.flatMap((a) => a.units.map((u) => sampleItemByNk.get(u))),
    );
    const falsePositives = substantive.filter((x) => x.sample_item_id && !anomalyItems.has(x.sample_item_id));
    expect(falsePositives.map((f) => `${f.taxonomy_code}:${f.piece_ref}`)).toEqual([]);
  });

  it('clarification follow-ups: drafted (L2), sent, answered from portal fixtures → explained', async () => {
    const clarifId = await draftClarificationRequest(IDS.engNep, IDS.users.karim);
    await approveSend(clarifId, IDS.users.karim);
    const answers = JSON.parse(fs.readFileSync(ds('fixtures', 'answers.json'), 'utf8')) as Record<string, string>;
    const detail = await requestDetail(clarifId);
    const sample = await currentRevenueSample(IDS.engNep);
    const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));
    for (const item of detail!.items) {
      const nk = item.sample_item_id ? nkBySampleItem.get(item.sample_item_id) : undefined;
      const anomaly = manifest.substantiveAnomalies.find((a) => nk && a.units.includes(nk));
      await answerExplanation(item.id, IDS.contacts.theo, answers[anomaly?.id ?? 'A1'] ?? 'Réponse du client.');
    }
    const exceptions = await listExceptions(IDS.engNep);
    expect(exceptions.filter((x) => x.status === 'clarification_requested').length).toBe(0);
    expect(exceptions.filter((x) => x.status === 'explained').length).toBeGreaterThan(0);
  });

  it('refuses a resolution that rests on an explanation alone (NEP 500)', async () => {
    const x = (await listExceptions(IDS.engNep)).find((e) => e.status === 'explained')!;
    await expect(
      resolveException(x.id, IDS.users.lea, {
        explanation: 'Réponse du client.',
        conclusion: 'Examiné et corroboré — traité.',
        disposition: 'no_misstatement',
        corroboration: {},
      }),
    ).rejects.toThrow(/explanation alone|corroborating/i);

    // and the same emptiness cannot be written straight into the row either: the CHECK
    // constraint is the backstop behind the service
    await expect(
      q(`update exception set status = 'resolved', resolution = 'ok', resolved_by = $2, resolved_at = now() where id = $1`, [x.id, IDS.users.lea]),
    ).rejects.toThrow(/exception_resolution_is_probative/);
  });

  it('dispositions: every admitted misstatement accumulates, the unprovable one stays open', async () => {
    await dispositions();
    const after = await listExceptions(IDS.engNep);

    // the client admits five of them; none of the promised corrections is booked
    const escalated = after.filter((x) => x.status === 'escalated').map((x) => x.taxonomy_code).sort();
    expect(escalated).toEqual(['cutoff', 'duplicate_document', 'manual_journal_flag', 'price_mismatch', 'qty_mismatch'].sort());

    // 36 800 € of double booking may not leave the accumulation
    const mis = await q<{ amount: string; notes: string }>(
      `select amount::text, notes from misstatement where engagement_id = $1 and corrected = false`,
      [IDS.engNep],
    );
    expect(mis.some((m) => Number(m.amount) === 36800)).toBe(true);
    expect(mis.some((m) => /doublon d.intégration|comptabilisée deux fois/i.test(m.notes))).toBe(true);

    // the delivery note that does not exist cannot be "resolved": nothing links to it.
    // It becomes a recorded limitation instead — with the amount at risk and the
    // alternative procedures attempted.
    const missing = after.find((x) => x.taxonomy_code === 'missing_document')!;
    expect(missing.status).toBe('scope_limitation');
    const lim = await q1<{ alternative_procedures: string; amount_impact: string | null; corroboration_evidence_id: string | null }>(
      `select alternative_procedures, amount_impact::text, corroboration_evidence_id from exception where id = $1`,
      [missing.id],
    );
    expect(lim.alternative_procedures).toMatch(/aucune preuve de livraison/i);
    expect(Number(lim.amount_impact)).toBeGreaterThan(0);
    expect(lim.corroboration_evidence_id).toBeNull(); // it never pretends to be corroborated

    // and the provisional ledger is flagged on the engagement, not buried in a note
    const eng = await q1<{ ledger_is_provisional: boolean; ledger_provisional_reason: string }>(
      `select ledger_is_provisional, ledger_provisional_reason from engagement where id = $1`,
      [IDS.engNep],
    );
    expect(eng.ledger_is_provisional).toBe(true);
    expect(eng.ledger_provisional_reason).toMatch(/FEC définitif/);

    // the genuinely explained one is resolved, and carries its corroboration
    const cn = after.find((x) => x.taxonomy_code === 'credit_note_pattern')!;
    expect(cn.status).toBe('resolved');
    const row = await q1<{ client_explanation: string; disposition: string; corroboration_evidence_id: string | null }>(
      `select client_explanation, disposition, corroboration_evidence_id from exception where id = $1`,
      [cn.id],
    );
    expect(row.client_explanation).toMatch(/litiges qualité/);
    expect(row.disposition).toBe('no_misstatement');
    expect(row.corroboration_evidence_id).toBeTruthy();
  });

  it('verification spot-check: seeded blind re-performance; agree stores, disagree raises + escalates', async () => {
    const runId = await startVerificationRun(IDS.engNep, IDS.users.lea);
    const run = await currentVerificationRun(IDS.engNep);
    expect(run!.drawn_count).toBeGreaterThanOrEqual(3);
    expect(run!.items.length).toBe(run!.drawn_count);

    // blind agree: re-enter the true invoice values for the first item
    const first = run!.items[0];
    const ev = await q1<{ fields: { name: string; value: string }[] }>(
      `select x.fields from extraction x
       join evidence e on e.id = x.evidence_id
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note')
       order by x.created_at desc limit 1`,
      [first.sample_item_id],
    );
    const net = Number(ev.fields.find((f) => f.name === 'totalNetCents')!.value);
    const date = ev.fields.find((f) => f.name === 'invoiceDate')!.value;
    const agree = await submitBlindCheck({
      verificationRunId: runId,
      sampleItemId: first.sample_item_id,
      verifierId: IDS.users.lea,
      blind: { totalNetCents: net, invoiceDate: date },
      secondsSpent: 95,
    });
    expect(agree.result).toBe('agree');

    // blind disagree on the second item
    const second = run!.items[1];
    const disagree = await submitBlindCheck({
      verificationRunId: runId,
      sampleItemId: second.sample_item_id,
      verifierId: IDS.users.lea,
      blind: { totalNetCents: 999999, invoiceDate: '2025-01-01' },
      secondsSpent: 120,
      escalationOnDisagree: 'expand_subsample',
    });
    expect(disagree.result).toBe('disagree');
    expect(disagree.exceptionId).toBeTruthy();
    const reperformed = await q1<{ id: string }>(
      `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.quarantined = false limit 1`,
      [second.sample_item_id],
    );
    await resolveException(disagree.exceptionId!, IDS.users.lea, {
      explanation: 'Saisie de test introduite lors du contrôle de fiabilité (valeur arbitraire).',
      conclusion: 'Élément re-testé sur la pièce d’origine : montant et date conformes à l’extraction initiale.',
      disposition: 'no_misstatement',
      corroboration: { evidenceId: reperformed.id },
    });
    // append-only: verification checks cannot be updated
    await expect(q(`update verification_check set result = 'agree'`)).rejects.toThrow(/append-only/);
  });

  it('sample evaluation: the breach blocks the conclusion until a response is recorded', async () => {
    await computeSampleEvaluation(IDS.engNep, IDS.users.lea);
    const ev = await currentEvaluation(IDS.engNep);
    // 36 330 cut-off + 36 800 double booking + 1 800 overbilling + 2 615,80 undelivered
    // units + 50 000 manual journal — every one admitted by the client, none corrected
    expect(Number(ev!.known_misstatement)).toBeCloseTo(127545.8, 2);
    expect(ev!.projection_method).toBe('none'); // all of it sits in the 100 %-coverage stratum
    expect(Number(ev!.known_misstatement)).toBeGreaterThan(Number(ev!.te_amount));

    // the engine refuses to conclude on a sample that no longer supports a conclusion
    await expect(
      concludeEvaluation(ev!.id, IDS.users.lea, 'Rien à signaler par ailleurs.'),
    ).rejects.toThrow(/exceeds tolerable misstatement/);

    const gateBefore = await conclusionGate(IDS.engNep);
    expect(gateBefore.ok).toBe(false);
    expect(gateBefore.breachAnswered).toBe(false);
    expect(gateBefore.blockers.map((b) => b.code)).toContain('tolerable_exceeded_unanswered');

    // record the response, then the conclusion is allowed
    await recordEvaluationResponse(
      ev!.id, IDS.users.lea, 'revise_strategy',
      'Les anomalies non corrigées (127 545,80 €) dépassent le seuil de signification : l’échantillon ne fournit plus une base raisonnable de conclusion sur la population. Extension des travaux au chiffre d’affaires du dernier trimestre et demande de correction adressée à la direction avant conclusion définitive.',
    );
    const gateMid = await conclusionGate(IDS.engNep);
    expect(gateMid.breachAnswered).toBe(true);

    await concludeEvaluation(
      ev!.id, IDS.users.lea,
      'Anomalies non corrigées de 127 545,80 € supérieures au seuil de signification (37 000 €) : conclusion défavorable en l’état sur l’assertion de rattachement, sous réserve des corrections annoncées par la direction.',
    );
    const gate = await conclusionGate(IDS.engNep);
    expect(gate.evaluationConcluded).toBe(true);
    expect(gate.openExceptions).toBe(0);
  });
});
