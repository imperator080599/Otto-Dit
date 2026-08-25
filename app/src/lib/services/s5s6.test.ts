import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, documentDifference } from './reconciliation';
import { rebuildFslis } from './fsli';
import { propose, validate } from './materiality';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from './sampling';
import { generatePbcFromSample, approveSend, requestDetail } from './requests';
import { ingestEvidence, answerExplanation } from './evidence';
import { extractAll, pendingVerifications, verifyExtraction } from './extraction/ladder';
import { runMatching, listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement } from './matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from './verification';
import { computeSampleEvaluation, concludeEvaluation, currentEvaluation, conclusionGate } from './evaluation';

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
      await documentDifference(item.id, IDS.users.karim, 'Écriture de situation non reprise au FEC — documentée.');
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

  it('dispositions: resolve explained exceptions, escalate the cut-off to an uncorrected misstatement', async () => {
    const exceptions = await listExceptions(IDS.engNep);
    const cutoff = exceptions.find((x) => x.taxonomy_code === 'cutoff')!;
    const mId = await escalateToMisstatement(cutoff.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: 3633000, // the A5 invoice net booked in the wrong period
      corrected: false,
      notes: 'Produit 2026 constaté en 2025 — non corrigé par le client à date.',
    });
    expect(mId).toBeTruthy();
    for (const x of await listExceptions(IDS.engNep)) {
      if (x.status === 'explained') {
        await resolveException(x.id, IDS.users.lea, 'Réponse client examinée — anomalie sans incidence significative ou corrigée.');
      }
    }
    const after = await listExceptions(IDS.engNep);
    expect(after.every((x) => ['resolved', 'escalated'].includes(x.status))).toBe(true);
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
    await resolveException(disagree.exceptionId!, IDS.users.lea, 'Vérification approfondie : divergence due à une saisie test — élément re-testé conforme.');
    // append-only: verification checks cannot be updated
    await expect(q(`update verification_check set result = 'agree'`)).rejects.toThrow(/append-only/);
  });

  it('sample evaluation: known + projected vs TE computed (L0), concluded (L4); conclusion gate opens', async () => {
    await computeSampleEvaluation(IDS.engNep, IDS.users.lea);
    const ev = await currentEvaluation(IDS.engNep);
    expect(Number(ev!.known_misstatement)).toBeCloseTo(36330, 2); // the A5 uncorrected misstatement
    expect(ev!.projection_method).toBe('none'); // misstatement sits in the 100%-coverage stratum
    const gateBefore = await conclusionGate(IDS.engNep);
    expect(gateBefore.ok).toBe(false); // evaluation not yet concluded
    await concludeEvaluation(ev!.id, IDS.users.lea, 'Anomalie non corrigée de 36 330 € strictement inférieure à l’anomalie tolérable (27 000 €) ? Non — au-dessus : à reporter dans l’état des anomalies et à discuter avec la direction. Conclusion sur l’assertion maintenue sous réserve du dénouement.');
    const gate = await conclusionGate(IDS.engNep);
    expect(gate.evaluationConcluded).toBe(true);
    expect(gate.openExceptions).toBe(0);
    expect(gate.ok).toBe(true);
  });
});
