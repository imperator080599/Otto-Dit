import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from '@/lib/services/imports';
import { computeTbGl, latestTbGl, documentDifference } from '@/lib/services/reconciliation';
import { rebuildFslis, proposeScoping, confirmScoping, listFslis } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from '@/lib/services/sampling';
import { generatePbcFromSample, approveSend, requestDetail } from '@/lib/services/requests';
import { ingestEvidence, answerExplanation, markAllSubmitted, attachEvidenceToItem } from '@/lib/services/evidence';
import { processInbound } from '@/lib/services/inbound';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { runMatching, listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement, recordScopeLimitation } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import { computeSampleEvaluation, concludeEvaluation, currentEvaluation, recordEvaluationResponse } from '@/lib/services/evaluation';

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

/**
 * The client answers the request. The auditor uploads nothing — that is the product.
 *
 * Every document below enters exactly as it would in production: through the portal
 * (`ingestEvidence`, the same call `/portal/[token]/[rid]` makes when a client attaches a
 * file) or through the engagement's inbound address (`processInbound`, the same pipeline
 * the mail webhook feeds). Two deliberate cases exercise the parts that matter: one
 * delivery note sent by e-mail instead of the portal, and one message from an address that
 * is not on the engagement's contact list — quarantined, never silently ingested.
 */
export async function clientDeposits(requestId: string): Promise<void> {
  const evidenceIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8')) as IndexEntry[];
  const detail = await requestDetail(requestId);
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));

  let byEmail = 0;
  for (const item of detail!.items.filter((i) => i.kind === 'document' && i.sample_item_id)) {
    const nk = nkBySampleItem.get(item.sample_item_id!);
    const isBl = /livraison|delivery/i.test(item.description);
    const entry = evidenceIndex.find(
      (e) => e.forUnits.includes(nk!) && (isBl ? e.docType === 'delivery_note' : e.docType === 'invoice' || e.docType === 'credit_note'),
    );
    if (!entry) continue; // A2: the delivery note cannot be provided at all
    const bytes = fs.readFileSync(ds(...entry.filename.split('/')));
    const filename = path.basename(entry.filename);

    // the first delivery note comes back by e-mail, the way half of them really do
    if (isBl && byEmail === 0) {
      byEmail += 1;
      const inbound = await processInbound(IDS.engNep, {
        from: 'theo.girard@altiverre.example',
        subject: `RE: ${detail!.request.title} — ${filename}`,
        attachments: [{ filename, mime: 'application/pdf', bytes }],
      });
      // mail does not arrive pre-filed: an auditor triages it onto the item it answers
      for (const evId of inbound.evidenceIds) {
        await attachEvidenceToItem(evId, item.id, IDS.users.karim);
      }
      continue;
    }

    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename,
      mime: 'application/pdf',
      bytes,
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
  }

  // an unknown sender forwards a document: allow-listing holds, it is quarantined and an
  // auditor has to look at it before it can ever support a conclusion
  await processInbound(IDS.engNep, {
    from: 'compta@fournisseur-inconnu.example',
    subject: 'Facture jointe',
    attachments: [{
      filename: 'piece_expediteur_inconnu.pdf',
      mime: 'application/pdf',
      bytes: fs.readFileSync(ds(...evidenceIndex.find((e) => e.docType === 'invoice')!.filename.split('/'))),
    }],
  });

  await markAllSubmitted(requestId, IDS.contacts.sophie);
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

/**
 * Disposition of every exception, one nature at a time.
 *
 * There is no generic "reviewed and corroborated" path any more: the engine refuses a
 * resolution without the client's words, a link to what corroborates them, and a
 * disposition saying what happened to the money (migration 0009). Read against the
 * client's own answers (dataset/fixtures/answers.json), five of the eight seeded
 * anomalies are admitted misstatements — the corrections are all promised, none is
 * booked at the reporting date — so they accumulate rather than disappear.
 */
export async function dispositions(): Promise<void> {
  const byTaxonomy = async (code: string) =>
    (await listExceptions(IDS.engNep)).filter((x) => x.taxonomy_code === code && (x.status === 'explained' || x.status === 'open'));

  const amountOf = async (sampleItemId: string | null): Promise<number> => {
    if (!sampleItemId) return 0;
    const r = await q1<{ amount: string }>(`select amount::text from sample_item where id = $1`, [sampleItemId]);
    return Math.round(Number(r.amount) * 100);
  };

  // A5 — cut-off: invoice dated 2026-01-06 recognised in FY2025. Admitted by the client
  // ("facturation anticipée pour atteindre l'objectif annuel"). Uncorrected.
  for (const x of await byTaxonomy('cutoff')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : await amountOf(x.sample_item_id),
      corrected: false,
      notes: 'Produit de janvier 2026 constaté sur 2025 (séparation des exercices). Le client indique une facturation anticipée pour atteindre l’objectif annuel — non corrigé à la date du rapport.',
    });
  }

  // A1 — the same invoice booked twice. The client admits it and says a reversal "sera
  // passée": promised, not booked, so it is an uncorrected misstatement.
  //
  // The pair raises one exception per booking, but the accounts are overstated ONCE. The
  // later booking carries the misstatement; its twin is closed as already_accumulated,
  // linked to the same invoice — visible, not deleted, and not counted twice.
  const dupes = await byTaxonomy('duplicate_document');
  const dupesDated = await Promise.all(
    dupes.map(async (x) => ({
      x,
      date: x.sample_item_id
        ? (await q1<{ d: string }>(
            `select g.entry_date::text d from sample_item si join gl_entry g on g.id = si.unit_id where si.id = $1`,
            [x.sample_item_id],
          )).d
        : '',
    })),
  );
  dupesDated.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < dupesDated.length; i++) {
    const { x, date } = dupesDated[i];
    const isLater = i === dupesDated.length - 1;
    if (isLater) {
      await escalateToMisstatement(x.id, IDS.users.lea, {
        kind: 'factual',
        amountCents: await amountOf(x.sample_item_id),
        corrected: false,
        notes: `Double comptabilisation de la même facture (${dupesDated.map((d) => d.date).join(' et ')}), reconnue par le client : « la facture a été comptabilisée deux fois suite à un doublon d’intégration. Une correction sera passée ». L’extourne n’est pas comptabilisée à la date du rapport — produit surévalué une fois, retenu sur l’écriture du ${date}.`,
      });
    } else {
      const inv = await q01<{ id: string }>(
        `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
         where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note') and e.quarantined = false limit 1`,
        [x.sample_item_id],
      );
      if (!inv) continue;
      await resolveException(x.id, IDS.users.lea, {
        explanation: 'Vous avez raison : la facture a été comptabilisée deux fois suite à un doublon d’intégration. Une correction sera passée (extourne de la seconde écriture).',
        conclusion: `Les deux écritures s’appuient sur la même facture. La surévaluation est unique : elle est portée à l’état des anomalies sur l’écriture du ${dupesDated[dupesDated.length - 1].date}. Cette occurrence est close pour éviter un double décompte, sans disparaître du dossier.`,
        disposition: 'already_accumulated',
        corroboration: { evidenceId: inv.id },
      });
    }
  }

  // A3 — overbilling of 1 800,00 €; credit note announced, not issued.
  for (const x of await byTaxonomy('price_mismatch')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : 180000,
      corrected: false,
      notes: 'Écart de prix unitaire reconnu par le client (« un avoir de 1 800,00 € sera émis »). Avoir non émis à la date du rapport.',
    });
  }

  // A4 — 22 units billed but not delivered; credit note "en préparation".
  for (const x of await byTaxonomy('qty_mismatch')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : 0,
      corrected: false,
      notes: 'Quantité facturée supérieure à la quantité livrée (litige transport reconnu par le client, « avoir en préparation »). Avoir non émis à la date du rapport.',
    });
  }

  // A6 — 50 000 € manual journal on a Saturday. The client's own answer places the service
  // in January 2026: this is a cut-off misstatement, not merely an unusual entry.
  for (const x of await byTaxonomy('manual_journal_flag')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: await amountOf(x.sample_item_id),
      corrected: false,
      notes: 'Écriture manuelle de 50 000,00 € passée un samedi. Explication du client : contrat signé en fin d’exercice, « la prestation démarre en janvier 2026 » — produit rattaché au mauvais exercice.',
    });
  }

  // A8 — recurring credit notes to one customer. No amount impact on the period result:
  // genuinely explained, and corroborated by the credit notes themselves.
  for (const x of await byTaxonomy('credit_note_pattern')) {
    const cn = await q01<{ id: string }>(
      `select id from evidence where engagement_id = $1 and doc_type = 'credit_note' and quarantined = false order by filename limit 1`,
      [IDS.engNep],
    );
    if (!cn) continue;
    await resolveException(x.id, IDS.users.lea, {
      explanation: 'Les avoirs concernent des litiges qualité récurrents avec ce client ; un plan d’action qualité est en cours.',
      conclusion:
        'Les trois avoirs ont été rapprochés des pièces : ils portent sur des livraisons distinctes, sont émis dans l’exercice et ne présentent pas de caractère de dissimulation de chiffre d’affaires. Aucune anomalie de rattachement relevée sur ces pièces.',
      disposition: 'no_misstatement',
      corroboration: { evidenceId: cn.id },
    });
  }

  // A2 — the delivery note was never archived by the carrier and cannot be obtained. There
  // is nothing to link, so the platform cannot let this be "resolved". It becomes a
  // recorded scope limitation: what could not be obtained, what was done instead, and how
  // much is at risk — carried through to the conclusion rather than absorbed by it.
  for (const x of await byTaxonomy('missing_document')) {
    await recordScopeLimitation(x.id, IDS.users.lea, {
      explanation: 'Le bon de livraison n’a pas été archivé par le transporteur. Nous ne sommes pas en mesure de le fournir.',
      alternativeProcedures:
        'Procédures alternatives mises en œuvre : rapprochement de la facture avec la commande client et avec l’encaissement figurant au relevé bancaire ; aucune preuve de livraison n’a pu être obtenue. La réalité de la livraison n’est pas corroborée par un élément externe.',
      amountAtRiskCents: await amountOf(x.sample_item_id),
    });
  }

  // A7 — the trial balance carries a 25 000 € situation entry the FEC does not. The ledger
  // audited is therefore not the final one: that is a limitation until the definitive FEC
  // is reconciled, and it flags the engagement (migration 0009) so the file cannot be
  // closed on a provisional ledger.
  const recDiffs = await byTaxonomy('reconciliation_diff');
  for (const x of recDiffs) {
    await recordScopeLimitation(x.id, IDS.users.lea, {
      explanation: 'La balance transmise incluait un ajustement manuel de 25 000,00 € non repris dans le FEC (écriture de situation).',
      alternativeProcedures:
        'Écart documenté et rapproché ligne à ligne ; il correspond à une écriture de situation non reprise dans le FEC provisoire. Le rapprochement balance/grand livre sera re-exécuté sur le FEC définitif avant conclusion définitive.',
    });
  }
  if (recDiffs.length > 0) {
    await q(
      `update engagement set ledger_is_provisional = true, ledger_provisional_reason = $2 where id = $1`,
      [
        IDS.engNep,
        'FEC provisoire : écriture de situation de 25 000,00 € (Dr 411000 / Cr 706000) présente dans la balance et absente du FEC. Rapprochement à re-exécuter sur le FEC définitif.',
      ],
    );
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

  // Known misstatements (127 545,80 €) exceed both tolerable misstatement (27 000 €) and
  // materiality (37 000 €). The engine refuses a conclusion until that is answered
  // (migration 0009): the sample no longer provides a reasonable basis for a conclusion on
  // the population, so the strategy is revised before concluding.
  await recordEvaluationResponse(
    evaluation!.id,
    IDS.users.lea,
    'revise_strategy',
    'Les anomalies non corrigées relevées (127 545,80 €) dépassent le seuil de signification (37 000 €) et l’anomalie tolérable (27 000 €). L’échantillon ne fournit plus une base raisonnable de conclusion sur la population : extension des travaux au chiffre d’affaires du quatrième trimestre, demande de correction adressée à la direction, et re-exécution du rapprochement balance/grand livre sur le FEC définitif avant conclusion définitive.',
  );
  await concludeEvaluation(
    evaluation!.id,
    IDS.users.lea,
    'Anomalies non corrigées de 127 545,80 € (rattachement 36 330 €, double comptabilisation 36 800 €, surfacturation 1 800 €, quantités non livrées 2 615,80 €, écriture manuelle de 50 000 € rattachée au mauvais exercice), supérieures au seuil de signification de 37 000 €. Conclusion en l’état : le chiffre d’affaires est surévalué de façon significative si les corrections annoncées par la direction ne sont pas comptabilisées. Deux limitations sont par ailleurs consignées (bon de livraison non obtenu, FEC provisoire) : la conclusion est provisoire jusqu’au rapprochement du FEC définitif.',
  );
}

/** Run the whole Part 1 flow up to (not including) the workpaper. */
export async function runPart1UpToWorkpaper(): Promise<void> {
  await bootstrapNep();
  const requestId = await samplingAndRequest();
  await clientDeposits(requestId);
  await extractAndVerify();
  await matchAndClarify();
  await dispositions();
  await spotcheckAndEvaluate();
}
