import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from '@/lib/services/imports';
import { computeTbGl, latestTbGl, documentDifference } from '@/lib/services/reconciliation';
import { rebuildFslis, proposeScoping, confirmScoping, listFslis } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from '@/lib/services/sampling';
import { generatePbcFromSample, approveSend, requestDetail } from '@/lib/services/requests';
import { ingestEvidence, answerExplanation } from '@/lib/services/evidence';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { runMatching, listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import { computeSampleEvaluation, concludeEvaluation, currentEvaluation } from '@/lib/services/evaluation';

// Part 1 demo flow (07 §6) executed programmatically — the SAME service calls the UI
// makes. Used by `npm run demo:seed` (turnkey demo state) and by the test suites.

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

interface IndexEntry { filename: string; sha256: string; docType: string; forUnits: string[]; anomaly?: string }
interface ManifestT { substantiveAnomalies: { id: string; taxonomy: string[]; units: string[] }[] }

export async function bootstrapNep(): Promise<void> {
  const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
  await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv', content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
  const tbPrior = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
  await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2024.csv', content: tbPrior, mapping: detectTbMapping(tbPrior.split('\n')[0]), periodKind: 'prior' });
  await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
  await computeTbGl(IDS.engNep, IDS.users.karim);
  for (const item of (await latestTbGl(IDS.engNep))!.items) {
    await documentDifference(item.id, IDS.users.karim, 'Écriture de situation (Dr 411000 / Cr 706000, 25 000 €) non reprise dans le FEC — expliquée par le client, correction attendue au FEC définitif.');
  }
  await rebuildFslis(IDS.engNep, IDS.users.karim);
  await validate(await propose(IDS.engNep, IDS.users.lea), IDS.users.lea);
  await proposeScoping(IDS.engNep, IDS.users.lea);
  const fslis = await listFslis(IDS.engNep);
  for (const f of fslis) {
    if (f.scoping === 'ns_proposed' && !f.confirmed_by) {
      if (f.code === 'INTANGIBLES') {
        await confirmScoping(f.id, IDS.users.lea, 'in_scope_qualitative', 'Immobilisations incorporelles conservées dans le périmètre (nouvelles licences en cours d’exercice).');
      } else {
        await confirmScoping(f.id, IDS.users.lea, 'ns_confirmed');
      }
    }
  }
}

export async function samplingAndRequest(): Promise<string> {
  const sampleId = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
  await validateSampleParams(sampleId, IDS.users.lea);
  await drawRevenueSample(sampleId, IDS.users.lea);
  const requestId = await generatePbcFromSample(IDS.engNep, sampleId, IDS.users.karim);
  await approveSend(requestId, IDS.users.karim);
  return requestId;
}

export async function clientUploads(requestId: string): Promise<void> {
  const evidenceIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8')) as IndexEntry[];
  const detail = await requestDetail(requestId);
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));
  for (const item of detail!.items.filter((i) => i.kind === 'document' && i.sample_item_id)) {
    const nk = nkBySampleItem.get(item.sample_item_id!);
    const isBl = /livraison|delivery/i.test(item.description);
    const entry = evidenceIndex.find(
      (e) => e.forUnits.includes(nk!) && (isBl ? e.docType === 'delivery_note' : e.docType === 'invoice' || e.docType === 'credit_note'),
    );
    if (!entry) continue; // A2: the delivery note cannot be provided
    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename: path.basename(entry.filename),
      mime: 'application/pdf',
      bytes: fs.readFileSync(ds(...entry.filename.split('/'))),
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
  }
  for (const item of detail!.items.filter((i) => !i.sample_item_id && /Relevé|statement/i.test(i.description))) {
    const month = /novembre|November/.test(item.description) ? '2025-11' : '2025-12';
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

export async function extractAndVerify(): Promise<void> {
  await extractAll(IDS.engNep, IDS.users.karim);
  for (const p of await pendingVerifications(IDS.engNep)) {
    await verifyExtraction(p.id, IDS.users.karim);
  }
}

export async function matchAndClarify(): Promise<void> {
  await runMatching(IDS.engNep, IDS.users.karim);
  const clarifId = await draftClarificationRequest(IDS.engNep, IDS.users.karim);
  await approveSend(clarifId, IDS.users.karim);
  const answers = JSON.parse(fs.readFileSync(ds('fixtures', 'answers.json'), 'utf8')) as Record<string, string>;
  const manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8')) as ManifestT;
  const detail = await requestDetail(clarifId);
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));
  for (const item of detail!.items) {
    const nk = item.sample_item_id ? nkBySampleItem.get(item.sample_item_id) : undefined;
    const anomaly = manifest.substantiveAnomalies.find((a) => nk && a.units.includes(nk));
    await answerExplanation(item.id, IDS.contacts.theo, answers[anomaly?.id ?? 'A1'] ?? 'Réponse du client (démo).');
  }
}

export async function dispositions(): Promise<void> {
  const exceptions = await listExceptions(IDS.engNep);
  const cutoff = exceptions.find((x) => x.taxonomy_code === 'cutoff' && x.status === 'explained');
  if (cutoff) {
    await escalateToMisstatement(cutoff.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: 3633000,
      corrected: false,
      notes: 'Produit de janvier 2026 constaté sur 2025 (séparation des exercices) — non corrigé à date.',
    });
  }
  for (const x of await listExceptions(IDS.engNep)) {
    if (x.status === 'explained') {
      await resolveException(x.id, IDS.users.lea, 'Réponse du client examinée et corroborée — traité (voir état des anomalies le cas échéant).');
    }
  }
}

export async function spotcheckAndEvaluate(): Promise<void> {
  const runId = await startVerificationRun(IDS.engNep, IDS.users.lea);
  const run = await currentVerificationRun(IDS.engNep);
  for (const it of run!.items) {
    const ev = await q1<{ fields: { name: string; value: string }[] }>(
      `select x.fields from extraction x
       join evidence e on e.id = x.evidence_id
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note')
       order by x.created_at desc limit 1`,
      [it.sample_item_id],
    );
    // the demo verifier re-performs from the source documents; here the fixture values ARE
    // the source-document values (blind agreement path)
    await submitBlindCheck({
      verificationRunId: runId,
      sampleItemId: it.sample_item_id,
      verifierId: IDS.users.lea,
      blind: {
        totalNetCents: Number(ev.fields.find((f) => f.name === 'totalNetCents')!.value),
        invoiceDate: ev.fields.find((f) => f.name === 'invoiceDate')!.value,
      },
      secondsSpent: 110,
    });
  }
  await computeSampleEvaluation(IDS.engNep, IDS.users.lea);
  const evaluation = await currentEvaluation(IDS.engNep);
  await concludeEvaluation(
    evaluation!.id,
    IDS.users.lea,
    'Total connu + projeté de 36 330 € supérieur à l’anomalie tolérable (27 000 €) : anomalie de séparation des exercices portée à l’état des anomalies et communiquée à la direction pour correction ; en dehors de cet élément, les travaux ne révèlent pas d’autre anomalie significative.',
  );
}

/** Run the whole Part 1 flow up to (not including) the workpaper. */
export async function runPart1UpToWorkpaper(): Promise<void> {
  await bootstrapNep();
  const requestId = await samplingAndRequest();
  await clientUploads(requestId);
  await extractAndVerify();
  await matchAndClarify();
  await dispositions();
  await spotcheckAndEvaluate();
}
