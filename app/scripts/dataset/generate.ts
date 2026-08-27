import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import { sha256 } from '../../src/lib/core/hash';
import { populationHash } from '../../src/lib/kernel/canon';
import { computeFlags, defaultFlagConfig } from '../../src/lib/kernel/flags';
import { monetaryDraw } from '../../src/lib/kernel/sampling';
import { proposeMateriality } from '../../src/lib/kernel/materiality';
import { parseFec } from '../../src/lib/kernel/fec';
import type { GlRow, SampleUnit } from '../../src/lib/kernel/types';
import { nepFr } from '../../src/lib/packs/nep-fr';
import { buildWorld, type SalesInvoice, type Entry } from './ledger';
import { entriesToGlRows, serializeFec } from './fecout';
import { aggregateTb, applyTbMismatch, priorYearTb, serializeTbCsv, TB_MISMATCH } from './tb';
import { renderInvoicePdf, renderDeliveryNotePdf, renderBankStatementPdf, renderBankRecPdf, renderApprovalPdf } from './pdf';
import { renderFacturxPdf } from './facturx';
import { buildSox, serializeRcmCsv, serializeInstancesCsv, RCM } from './sox';
import { DEMO_SAMPLING, ENTITY } from './config';

// C1b — dataset generator (ADR-015): imports the SAME kernel the app runs, computes the
// real draw under pinned demo params, places anomalies inside deterministic strata, and
// emits every PDF together with its extraction fixture + the expected-anomaly manifest.
// Deterministic: fixed seed + pinned PDF metadata ⇒ byte-identical regeneration.

export interface EvidenceIndexEntry {
  filename: string;
  sha256: string;
  docType: string;
  invoiceNumber?: string;
  forUnits: string[]; // gl naturalKeys or control instance labels
  anomaly?: string;
  note?: string;
}

export interface ExtractionFixture {
  filename: string;
  docType: string;
  rungExpected: 'xml' | 'text_layer' | 'ocr';
  fields: { name: string; value: string; confidence: number; page: number }[];
}

export interface DatasetManifest {
  seedVersion: string;
  substantiveAnomalies: {
    id: string;
    taxonomy: string[];
    units: string[];
    evidence: string[];
    description: string;
    stratum: 'high_value' | 'risk_flag';
  }[];
  reconciliationAnomaly: { id: string; accounts: string[]; deltaCents: number };
  deviations: { id: string; control: string; instance: string; taxonomy: string; note: string }[];
  sampling: {
    revenue: { populationHash: string; populationSize: number; coverageCapCents: number; randomSize: number; seed: string; selectedUnits: string[] };
    bankRec: { sampled: string[] };
    approvals: { sampled: string[] };
  };
  robustness: string;
}

async function main() {
  const outDir = path.join(repoRoot(), 'dataset');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'sox', 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'fixtures'), { recursive: true });

  // ---------- world + FEC + TB ----------
  const world = buildWorld();
  const glRows = entriesToGlRows(world.entries);
  const fecText = serializeFec(world.entries);
  const fecName = `${ENTITY.siren}FEC20251231.txt`;
  fs.writeFileSync(path.join(outDir, fecName), fecText, 'latin1');

  // self-validation: the kernel FEC parser must accept our own file (C1b DoD)
  const parsed = parseFec(fecText, {
    filename: fecName,
    expectedSiren: ENTITY.siren,
    periodStart: ENTITY.periodStart,
    periodEnd: ENTITY.periodEnd,
  });
  if (!parsed.ok) {
    throw new Error('generated FEC fails own validator: ' + JSON.stringify(parsed.violations.filter((v) => v.severity === 'error').slice(0, 5)));
  }
  if (parsed.rows.length !== glRows.length) throw new Error('FEC roundtrip row-count mismatch');

  /* LE FEC DÉFINITIF — et pourquoi il fallait un SECOND fichier.
     Le FEC de la démonstration est PROVISOIRE : il ne porte pas l'écriture de
     situation (Dr 411000 / Cr 706000, 25 000 €) que la balance contient déjà.
     C'est ce qui produit l'écart de rapprochement A7, la limitation de
     périmètre, et le drapeau qui BLOQUE la conclusion définitive.
     Tant qu'aucun second fichier n'existait, le seul moyen de lever ce drapeau
     était de le mettre à jour en SQL — ce que le test faisait en le disant.
     Un dossier qui ne peut se clore que par une écriture directe en base n'est
     pas un dossier qui se clôt : le dernier geste du parcours passait à côté du
     produit. Le fichier définitif est le même grand livre PLUS l'écriture
     manquante ; il se réimporte par l'écran, il rend le rapprochement propre,
     et c'est CE rapprochement qui lève le drapeau. */
  const ecritureDeSituation: Entry = {
    journal: 'OD', journalLib: 'Opérations diverses', entryNo: 'OD2025-9001',
    date: ENTITY.periodEnd, pieceRef: 'SIT-2025-12', pieceDate: ENTITY.periodEnd,
    label: 'Écriture de situation — facturation de fin d’exercice',
    lines: [
      { account: TB_MISMATCH.debitAccount, accountLabel: 'Clients — collectif', debitCents: TB_MISMATCH.deltaCents, creditCents: 0 },
      { account: TB_MISMATCH.creditAccount, accountLabel: 'Ventes de marchandises', debitCents: 0, creditCents: TB_MISMATCH.deltaCents },
    ],
  };
  /* IL PORTE LE MÊME NOM, et ce n'est pas un détail : le format du nom de
     fichier est imposé (SirenFECAAAAMMJJ) et notre propre validateur le refuse
     autrement. Un second envoi du client s'appelle donc comme le premier —
     c'est précisément pourquoi le ré-import exige une confirmation explicite
     d'invalidation de l'aval (ADR-016). Il vit dans un sous-dossier. */
  const fecDefinitifName = fecName;
  fs.mkdirSync(path.join(outDir, 'definitif'), { recursive: true });
  const fecDefinitif = serializeFec([...world.entries, ecritureDeSituation]);
  fs.writeFileSync(path.join(outDir, 'definitif', fecDefinitifName), fecDefinitif, 'latin1');
  const parsedDef = parseFec(fecDefinitif, {
    filename: fecDefinitifName, expectedSiren: ENTITY.siren,
    periodStart: ENTITY.periodStart, periodEnd: ENTITY.periodEnd,
  });
  if (!parsedDef.ok) {
    throw new Error('FEC définitif refusé par notre propre validateur : '
      + JSON.stringify(parsedDef.violations.filter((v) => v.severity === 'error').slice(0, 5)));
  }

  const tbFromFec = aggregateTb(glRows);
  const tb2025 = applyTbMismatch(tbFromFec);
  const tb2024 = priorYearTb(tb2025);
  fs.writeFileSync(path.join(outDir, 'tb_2025.csv'), serializeTbCsv(tb2025), 'utf8');
  fs.writeFileSync(path.join(outDir, 'tb_2024.csv'), serializeTbCsv(tb2024), 'utf8');

  // ---------- sanity: P&L in the pinned envelope ----------
  const { revenueCents, pbtCents, lineCount } = world.stats;
  if (revenueCents < 450000000 || revenueCents > 950000000) throw new Error(`revenue out of envelope: ${revenueCents / 100} €`);
  if (pbtCents < 40000000 || pbtCents > 120000000) throw new Error(`PBT out of envelope: ${pbtCents / 100} €`);
  if (pbtCents < 0.02 * revenueCents) throw new Error('PBT below 2% of revenue — proposal rule would flip benchmark');
  if (lineCount < 3000 || lineCount > 6000) throw new Error(`FEC line count out of 3000–6000: ${lineCount}`);

  // ---------- materiality (pinned, computed on the TB the auditor sees) ----------
  const tbForKernel = tb2025.map((t) => ({ ...t }));
  const proposal = proposeMateriality(tbForKernel, nepFr);

  // ---------- revenue population + flags + pinned draw ----------
  const revRows = glRows.filter((r) => r.accountNo.startsWith('70'));
  const flagCfg = defaultFlagConfig(ENTITY.periodEnd);
  const flagged = computeFlags(revRows, flagCfg);
  const SELECTION_FLAGS = new Set(['weekend', 'round_amount', 'manual_journal', 'credit_note_pattern']);
  const units: SampleUnit[] = flagged.map((r) => ({
    id: r.naturalKey,
    amountCents: Math.abs(r.creditCents - r.debitCents),
    flags: r.flags.filter((f) => SELECTION_FLAGS.has(f)),
  }));
  const popHash = populationHash(revRows);
  const coverageCapCents = proposal.perfAmountCents;
  const draw = monetaryDraw(units, { coverageCapCents, randomSize: DEMO_SAMPLING.revenue.randomSize, seed: DEMO_SAMPLING.revenue.seed }, popHash);
  const selectedIds = new Set(draw.selections.map((s) => s.id));

  /* LE TIRAGE SUR LE GRAND LIVRE DÉFINITIF — et pourquoi il faut ses pièces.
     Le fichier définitif ajoute une écriture de situation au chiffre
     d'affaires : la POPULATION change, donc l'empreinte change, donc le tirage
     change. C'est la règle ADR-016 qui l'exige — une sélection tirée sur un
     grand livre remplacé est périmée — et le dossier REFAIT le sondage.
     Si le jeu de données ne portait que les pièces du premier tirage, la
     seconde sélection désignerait des factures qui n'existent nulle part : le
     client ne pourrait pas répondre, et le dossier ne pourrait jamais se
     clore. Ce ne serait pas une limitation d'audit, ce serait un trou du jeu
     de données déguisé en constatation. On rend donc les pièces des DEUX
     tirages. */
  const glRowsDef = entriesToGlRows([...world.entries, ecritureDeSituation]);
  const revRowsDef = glRowsDef.filter((r) => r.accountNo.startsWith('70'));
  const unitsDef: SampleUnit[] = computeFlags(revRowsDef, flagCfg).map((r) => ({
    id: r.naturalKey,
    amountCents: Math.abs(r.creditCents - r.debitCents),
    flags: r.flags.filter((f) => SELECTION_FLAGS.has(f)),
  }));
  const drawDef = monetaryDraw(
    unitsDef,
    { coverageCapCents, randomSize: DEMO_SAMPLING.revenue.randomSize, seed: DEMO_SAMPLING.revenue.seed },
    populationHash(revRowsDef),
  );
  /* Les deux tirages réunis, sans doublon : le manifeste reste celui du tirage
     ÉPINGLÉ (c'est lui que la suite d'acceptation rejoue), seules les pièces
     sont produites pour les deux. */
  const selectionsAProduire = [...draw.selections];
  for (const sd of drawDef.selections) {
    if (!selectionsAProduire.some((x) => x.id === sd.id)) selectionsAProduire.push(sd);
  }

  // map invoices → their revenue GL line
  const revLineByEntry = new Map<string, GlRow>();
  for (const r of revRows) revLineByEntry.set(r.entryNo, r);
  const unitOfInvoice = (inv: SalesInvoice): string => {
    const row = revLineByEntry.get(inv.entryNo);
    if (!row) throw new Error(`no revenue line for invoice ${inv.number}`);
    return row.naturalKey;
  };

  // assert anomaly placement (ADR-015): every seeded substantive anomaly is in the draw
  const anomalies = world.invoices.filter((i) => i.anomaly);
  for (const inv of anomalies) {
    const unit = unitOfInvoice(inv);
    if (!selectedIds.has(unit)) throw new Error(`anomaly ${inv.anomaly} (${inv.number}) NOT in the draw — placement broken`);
    if (!inv.isCreditNote && inv.totalNetCents < coverageCapCents * 1.1) {
      throw new Error(`anomaly ${inv.anomaly} too close to the coverage cap: ${inv.totalNetCents} vs ${coverageCapCents}`);
    }
  }
  const jeUnit = glRows.find((r) => r.entryNo === 'OD-2025-0001' && r.accountNo === '706000');
  const jeUnitKey = glRows.find((r) => r.journalCode === 'OD' && r.accountNo === '706000' && r.creditCents === 5000000)!.naturalKey;
  if (!selectedIds.has(jeUnitKey)) throw new Error('A6 weekend JE not in the draw');
  void jeUnit;

  // ---------- evidence PDFs + fixtures ----------
  const index: EvidenceIndexEntry[] = [];
  const fixtures: ExtractionFixture[] = [];
  const invoiceByUnit = new Map<string, SalesInvoice>();
  for (const inv of world.invoices) invoiceByUnit.set(unitOfInvoice(inv), inv);

  const selectedInvoices: SalesInvoice[] = [];
  for (const sel of selectionsAProduire) {
    const inv = invoiceByUnit.get(sel.id);
    if (inv && !selectedInvoices.includes(inv)) selectedInvoices.push(inv);
  }

  const writtenInvoices = new Set<string>();
  let plainLayoutAssigned = false;
  for (const inv of selectedInvoices) {
    const isFacturx = (inv as SalesInvoice & { facturx?: boolean }).facturx === true;
    const unit = unitOfInvoice(inv);
    const fname = inv.isCreditNote ? `${inv.number}.pdf` : isFacturx ? `${inv.number}_facturx.pdf` : `${inv.number}.pdf`;
    if (!writtenInvoices.has(fname)) {
      writtenInvoices.add(fname);
      // one random-stratum goods invoice gets the unlabeled "scan" so Part 1 shows the
      // OCR-mock + verify-UI path (rung 2 fails ⇒ rung 3 fixture below threshold)
      const sel = selectionsAProduire.find((s) => s.id === unit)!;
      const plain = !isFacturx && !inv.anomaly && !inv.isCreditNote && sel.reason === 'random' && !plainLayoutAssigned && inv.kind === 'goods';
      let bytes: Uint8Array;
      if (isFacturx) bytes = await renderFacturxPdf(inv);
      else if (plain) {
        plainLayoutAssigned = true;
        bytes = await renderPlainInvoice(inv);
      } else bytes = await renderInvoicePdf(inv);
      fs.writeFileSync(path.join(outDir, 'evidence', fname), bytes);
      index.push({
        filename: `evidence/${fname}`,
        sha256: sha256(bytes),
        docType: inv.isCreditNote ? 'credit_note' : 'invoice',
        invoiceNumber: inv.number,
        forUnits: world.invoices.filter((x) => x.number === inv.number).map((x) => unitOfInvoice(x)),
        anomaly: inv.anomaly,
        note: plain ? 'unlabeled layout — falls to OCR rung with sub-threshold confidence' : undefined,
      });
      fixtures.push({
        filename: `evidence/${fname}`,
        docType: inv.isCreditNote ? 'credit_note' : 'invoice',
        rungExpected: isFacturx ? 'xml' : plain ? 'ocr' : 'text_layer',
        fields: invoiceFields(inv, plain),
      });
    }
    // delivery note (goods, unless the A2 missing-BL anomaly)
    if (inv.deliveryNote && inv.anomaly !== 'A2' && !inv.isCreditNote) {
      const bl = inv.deliveryNote;
      const blName = `${bl.number}.pdf`;
      if (!writtenInvoices.has(blName)) {
        writtenInvoices.add(blName);
        const bytes = await renderDeliveryNotePdf(inv);
        fs.writeFileSync(path.join(outDir, 'evidence', blName), bytes);
        index.push({
          filename: `evidence/${blName}`,
          sha256: sha256(bytes),
          docType: 'delivery_note',
          invoiceNumber: inv.number,
          forUnits: [unit],
          anomaly: inv.anomaly === 'A4' ? 'A4' : undefined,
        });
        fixtures.push({
          filename: `evidence/${blName}`,
          docType: 'delivery_note',
          rungExpected: 'text_layer',
          fields: [
            { name: 'deliveryNoteNumber', value: bl.number, confidence: 1, page: 1 },
            { name: 'deliveryDate', value: bl.date, confidence: 1, page: 1 },
            { name: 'invoiceRef', value: inv.number, confidence: 1, page: 1 },
            { name: 'qtyTotal', value: String(bl.qtyPrinted), confidence: 1, page: 1 },
            { name: 'buyerName', value: inv.customer.name, confidence: 1, page: 1 },
          ],
        });
      }
    }
  }

  // bank statements (standing evidence): Nov + Dec 2025 built from actual BQ rows
  for (const month of ['2025-11', '2025-12']) {
    const moves = glRows
      .filter((r) => r.accountNo === '512100' && r.entryDate.startsWith(month))
      .map((r) => ({ date: r.entryDate, label: r.label ?? '', debitCents: r.creditCents || undefined, creditCents: r.debitCents || undefined }));
    const opening = glRows
      .filter((r) => r.accountNo === '512100' && r.entryDate < `${month}-01`)
      .reduce((s, r) => s + r.debitCents - r.creditCents, 0);
    const lastDay = month === '2025-11' ? '2025-11-30' : '2025-12-31';
    const bytes = await renderBankStatementPdf({
      label: month,
      periodStart: `${month}-01`,
      periodEnd: lastDay,
      openingCents: opening,
      movements: moves.slice(0, 40), // first page only — enough for the demo
    });
    const fname = `releve_512100_${month}.pdf`;
    fs.writeFileSync(path.join(outDir, 'evidence', fname), bytes);
    index.push({ filename: `evidence/${fname}`, sha256: sha256(bytes), docType: 'bank_statement', forUnits: [], note: `bank statement ${month} (truncated to first page)` });
  }

  // ---------- SOX ----------
  const sox = buildSox();
  fs.writeFileSync(path.join(outDir, 'sox', 'rcm.csv'), serializeRcmCsv(), 'utf8');
  fs.writeFileSync(path.join(outDir, 'sox', 'instances_C-BR-01.csv'), serializeInstancesCsv(sox.bankRecInstances), 'utf8');
  fs.writeFileSync(path.join(outDir, 'sox', 'instances_C-REV-01.csv'), serializeInstancesCsv(sox.approvalInstances), 'utf8');
  for (const spec of sox.bankRecSpecs) {
    const bytes = await renderBankRecPdf(spec);
    const fname = `bankrec_${spec.month}.pdf`;
    fs.writeFileSync(path.join(outDir, 'sox', 'evidence', fname), bytes);
    index.push({ filename: `sox/evidence/${fname}`, sha256: sha256(bytes), docType: 'reconciliation_sheet', forUnits: [spec.month] });
    fixtures.push({
      filename: `sox/evidence/${fname}`,
      docType: 'reconciliation_sheet',
      rungExpected: 'text_layer',
      fields: [
        { name: 'month', value: spec.month, confidence: 1, page: 1 },
        { name: 'preparedBy', value: spec.preparedBy, confidence: 1, page: 1 },
        { name: 'preparedOn', value: spec.preparedOn, confidence: 1, page: 1 },
        { name: 'approvedBy', value: spec.approvedBy ?? '', confidence: 1, page: 1 },
        { name: 'approvedOn', value: spec.approvedOn ?? '', confidence: 1, page: 1 },
      ],
    });
  }
  for (const spec of sox.approvalSpecs) {
    const bytes = await renderApprovalPdf(spec);
    const fname = `credit_approval_${spec.week}.pdf`;
    fs.writeFileSync(path.join(outDir, 'sox', 'evidence', fname), bytes);
    index.push({ filename: `sox/evidence/${fname}`, sha256: sha256(bytes), docType: 'approval_record', forUnits: [spec.week], note: spec.unlabeled ? 'unlabeled — OCR mock path' : undefined });
    fixtures.push({
      filename: `sox/evidence/${fname}`,
      docType: 'approval_record',
      rungExpected: spec.unlabeled ? 'ocr' : 'text_layer',
      fields: [
        { name: 'week', value: spec.week, confidence: spec.unlabeled ? 0.93 : 1, page: 1 },
        { name: 'customer', value: spec.customer, confidence: spec.unlabeled ? 0.88 : 1, page: 1 },
        { name: 'reviewedBy', value: spec.reviewedBy, confidence: spec.unlabeled ? 0.85 : 1, page: 1 },
        { name: 'approvedBy', value: spec.approvedBy, confidence: spec.unlabeled ? 0.72 : 1, page: 1 },
        { name: 'date', value: spec.date, confidence: spec.unlabeled ? 0.9 : 1, page: 1 },
      ],
    });
  }

  // ---------- pinned demo params ----------
  const demoParams = {
    materiality: {
      benchmarkCode: proposal.benchmarkCode,
      benchmarkAmountCents: proposal.benchmarkAmountCents,
      pct: proposal.pct,
      amountCents: proposal.amountCents,
      perfPct: proposal.perfPct,
      perfAmountCents: proposal.perfAmountCents,
      cttPct: proposal.cttPct,
      cttAmountCents: proposal.cttAmountCents,
      tePct: proposal.tePct,
      teAmountCents: proposal.teAmountCents,
      basisRule: proposal.basis.rule,
    },
    revenueSampling: {
      seed: DEMO_SAMPLING.revenue.seed,
      coverageCapCents,
      randomSize: DEMO_SAMPLING.revenue.randomSize,
    },
    soxSampling: { seed: DEMO_SAMPLING.sox.seed, sizes: { 'C-BR-01': 3, 'C-REV-01': 5 } },
    verification: DEMO_SAMPLING.verification,
    deficiencyInputs: { 'C-BR-01': { magnitudeExposureCents: 1500000, compensatingControl: false } },
  };
  fs.writeFileSync(path.join(outDir, 'demo-params.json'), JSON.stringify(demoParams, null, 2) + '\n', 'utf8');

  // ---------- manifest ----------
  const anomalyDefs: DatasetManifest['substantiveAnomalies'] = [
    { id: 'A1', taxonomy: ['duplicate_document'], units: world.invoices.filter((i) => i.anomaly === 'A1').map(unitOfInvoice), evidence: index.filter((e) => e.anomaly === 'A1').map((e) => e.filename), description: 'Same invoice booked twice (June + July), same invoice number and amount.', stratum: 'high_value' },
    { id: 'A2', taxonomy: ['missing_document'], units: world.invoices.filter((i) => i.anomaly === 'A2').map(unitOfInvoice), evidence: [], description: 'Goods invoice without any delivery note — client cannot provide it.', stratum: 'high_value' },
    { id: 'A3', taxonomy: ['price_mismatch'], units: world.invoices.filter((i) => i.anomaly === 'A3').map(unitOfInvoice), evidence: index.filter((e) => e.anomaly === 'A3').map((e) => e.filename), description: 'Invoice line: qty × unit price ≠ printed line total (1 800,00 € overbilling).', stratum: 'high_value' },
    { id: 'A4', taxonomy: ['qty_mismatch'], units: world.invoices.filter((i) => i.anomaly === 'A4').map(unitOfInvoice), evidence: index.filter((e) => e.anomaly === 'A4').map((e) => e.filename), description: 'Delivery note shows 238 units delivered; invoice bills 260.', stratum: 'high_value' },
    { id: 'A5', taxonomy: ['cutoff'], units: world.invoices.filter((i) => i.anomaly === 'A5').map(unitOfInvoice), evidence: index.filter((e) => e.anomaly === 'A5').map((e) => e.filename), description: 'Invoice dated 2026-01-06 recognized in FY2025 (entry 2025-12-31).', stratum: 'high_value' },
    { id: 'A6', taxonomy: ['manual_journal_flag'], units: [jeUnitKey], evidence: [], description: 'Round 50 000,00 € manual revenue JE posted on a Saturday (weekend + round + manual flags).', stratum: 'risk_flag' },
    { id: 'A8', taxonomy: ['credit_note_pattern'], units: world.invoices.filter((i) => i.anomaly === 'A8').map(unitOfInvoice), evidence: index.filter((e) => e.anomaly === 'A8').map((e) => e.filename), description: '3 credit notes to the same customer (C009) across the year — unexplained pattern.', stratum: 'risk_flag' },
  ];

  const manifest: DatasetManifest = {
    seedVersion: 'otto-altiverre-fy2025-v1',
    substantiveAnomalies: anomalyDefs,
    reconciliationAnomaly: { id: 'A7', accounts: [TB_MISMATCH.creditAccount, TB_MISMATCH.debitAccount], deltaCents: TB_MISMATCH.deltaCents },
    deviations: sox.deviations,
    sampling: {
      revenue: {
        populationHash: popHash,
        populationSize: units.length,
        coverageCapCents,
        randomSize: DEMO_SAMPLING.revenue.randomSize,
        seed: DEMO_SAMPLING.revenue.seed,
        selectedUnits: draw.selections.map((s) => s.id),
      },
      bankRec: { sampled: sox.bankRecSampled },
      approvals: { sampled: sox.approvalSampled },
    },
    robustness:
      'Substantive anomalies A1–A5 sit in the 100%-coverage stratum (each ≥ 1.1 × the pinned coverage cap of ' +
      `${coverageCapCents} cents), A6/A8 in the risk-flag stratum — detection is invariant to the random seed and to ` +
      'any coverage cap below the smallest anomaly amount. SOX deviations are placed inside the pinned attribute draw ' +
      '(seed otto-demo-sox-1); changing that seed re-draws other months and the deviations may fall outside the sample.',
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'fixtures', 'evidence_index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'fixtures', 'extractions.json'), JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

  // clarification answers (portal fixtures used by the demo)
  const answers = {
    A1: "Vous avez raison : la facture a été comptabilisée deux fois suite à un doublon d'intégration. Une correction sera passée (extourne de la seconde écriture).",
    A2: "Le bon de livraison n'a pas été archivé par le transporteur. Nous ne sommes pas en mesure de le fournir.",
    A3: 'Erreur de facturation identifiée : le prix unitaire appliqué diffère du tarif catalogue. Un avoir de 1 800,00 € sera émis.',
    A4: 'Litige transport : 22 m² cassés à la livraison, refacturés par erreur. Avoir en préparation.',
    A5: "La prestation a été livrée début janvier 2026 ; la facturation a été anticipée pour atteindre l'objectif annuel.",
    A6: "Écriture d'ajustement passée par la direction pour reconnaître un contrat signé fin d'année ; la prestation démarre en janvier 2026.",
    A7: 'La balance transmise incluait un ajustement manuel de 25 000,00 € non repris dans le FEC (écriture de situation).',
    A8: 'Les avoirs concernent des litiges qualité récurrents avec ce client ; un plan d’action qualité est en cours.',
  };
  fs.writeFileSync(path.join(outDir, 'fixtures', 'answers.json'), JSON.stringify(answers, null, 2) + '\n', 'utf8');

  // ---------- ANOMALIES.md (generator-emitted — docs cannot drift, ADR-008) ----------
  const md = buildAnomaliesMd(manifest, demoParams, world.stats, parsed.rows.length);
  fs.writeFileSync(path.join(outDir, 'ANOMALIES.md'), md, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `dataset generated: ${parsed.rows.length} FEC lines, revenue ${(revenueCents / 100 / 1e6).toFixed(2)}M€, ` +
    `PBT ${(pbtCents / 100 / 1e6).toFixed(2)}M€, M ${(proposal.amountCents / 100).toFixed(0)}€, ` +
    `sample ${draw.selections.length} units (${draw.selections.filter((s) => s.reason === 'high_value').length} high-value, ` +
    `${draw.selections.filter((s) => s.reason === 'risk_flag').length} flagged, ${DEMO_SAMPLING.revenue.randomSize} random), ` +
    `${index.length} evidence files`,
  );
}

function invoiceFields(inv: SalesInvoice, lowConfidence: boolean): ExtractionFixture['fields'] {
  const c = (full: number, low: number) => (lowConfidence ? low : full);
  const fields: ExtractionFixture['fields'] = [
    { name: 'invoiceNumber', value: inv.number, confidence: c(1, 0.95), page: 1 },
    { name: 'invoiceDate', value: inv.date, confidence: c(1, 0.9), page: 1 },
    { name: 'buyerName', value: inv.customer.name, confidence: c(1, 0.91), page: 1 },
    { name: 'sellerName', value: 'Altiverre SAS', confidence: 1, page: 1 },
    { name: 'totalNetCents', value: String(inv.totalNetCents), confidence: c(1, 0.85), page: 1 },
    { name: 'vatCents', value: String(inv.vatCents), confidence: c(1, 0.88), page: 1 },
    { name: 'totalGrossCents', value: String(inv.ttcCents), confidence: c(1, 0.87), page: 1 },
  ];
  inv.lines.forEach((l, i) => {
    fields.push({ name: `line${i + 1}`, value: JSON.stringify({ description: l.label, qty: l.qty, unitPriceCents: l.unitPriceCents, netCents: l.netCents }), confidence: c(1, 0.86), page: 1 });
  });
  if (inv.deliveryNote) fields.push({ name: 'deliveryNoteRef', value: inv.deliveryNote.number, confidence: 1, page: 1 });
  return fields;
}

async function renderPlainInvoice(inv: SalesInvoice): Promise<Uint8Array> {
  // unlabeled layout: same data, no parseable labels (simulated scan) — see index note
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date('2026-01-15T09:00:00Z'));
  doc.setModificationDate(new Date('2026-01-15T09:00:00Z'));
  doc.setProducer('OTTO synthetic dataset generator');
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([595, 842]);
  const lines = [
    'altiverre lyon',
    `${inv.number}   ${inv.date}`,
    `${inv.customer.name}`,
    ...inv.lines.map((l) => `${l.qty} ${l.label.toLowerCase().slice(0, 30)} ${(l.netCents / 100).toFixed(2)}`),
    `${(inv.totalNetCents / 100).toFixed(2)} / ${(inv.vatCents / 100).toFixed(2)} / ${(inv.ttcCents / 100).toFixed(2)}`,
    'document fictif - donnees synthetiques (demo OTTO)',
  ];
  let y = 780;
  for (const l of lines) {
    page.drawText(l, { x: 60, y, size: 11, font, color: rgb(0.25, 0.25, 0.3) });
    y -= 26;
  }
  return doc.save({ useObjectStreams: false });
}

function buildAnomaliesMd(manifest: DatasetManifest, demoParams: Record<string, unknown>, stats: { revenueCents: number; pbtCents: number }, fecLines: number): string {
  const m = manifest;
  const dp = demoParams as { materiality: { amountCents: number; perfAmountCents: number; cttAmountCents: number; teAmountCents: number } };
  const eur = (c: number) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' €';
  return `# ANOMALIES.md — the acceptance suite (generator-emitted, do not edit by hand)

Dataset: **Altiverre SAS FY2025** (fictional French subsidiary of Meridian Industrial
Group, Inc. — fictional US-listed parent). Seed \`${m.seedVersion}\`. ${fecLines} FEC lines,
revenue ${eur(stats.revenueCents)}, PBT ${eur(stats.pbtCents)}. Pinned materiality: M ${eur(dp.materiality.amountCents)},
PM ${eur(dp.materiality.perfAmountCents)}, CTT ${eur(dp.materiality.cttAmountCents)}, TE ${eur(dp.materiality.teAmountCents)}
(demo-params.json). **Every item below must be auto-detected — zero false negatives; false
positives are listed and triaged by the acceptance suite** (build-time regression evidence
only, per Gate 1: not extraction-reliability evidence).

## Substantive anomalies (NEP revenue cycle)

| id | What was seeded | Where it hides | Expected detection | Stratum |
|---|---|---|---|---|
${m.substantiveAnomalies.map((a) => `| ${a.id} | ${a.description} | units: ${a.units.join(', ')} | ${a.taxonomy.join(', ')} | ${a.stratum} |`).join('\n')}
| A7 | Unposted top-side entry (Dr 411000 / Cr 706000, ${eur(m.reconciliationAnomaly.deltaCents)}) present only in the TB export | tb_2025.csv vs FEC — accounts ${m.reconciliationAnomaly.accounts.join(' and ')} | reconciliation_diff on both accounts | reconciliation gate |

Notes: A6 surfaces through the deterministic JE risk flags (ADR-003) and enters the sample
as a risk-flag selection requiring an explanation; A8 surfaces as the credit-note-pattern
flag on customer C009 (3 credit notes). A1's two bookings share one evidence PDF — the
duplicate is detected both by sha256 dedupe and by duplicate invoice number across sampled
items.

## Control deviations (SOX OE cycle)

| id | Control | Instance | Expected deviation | Note |
|---|---|---|---|---|
${m.deviations.map((d) => `| ${d.id} | ${d.control} | ${d.instance} | ${d.taxonomy} | ${d.note} |`).join('\n')}

Sampled instances (pinned seed): C-BR-01 → ${m.sampling.bankRec.sampled.join(', ')};
C-REV-01 → ${m.sampling.approvals.sampled.join(', ')}. C-REV-01's sampled evidence is
clean (control concludes effective); one approval form is an unlabeled scan exercising the
OCR-mock + human-verify path.

## Placement robustness (ADR-015)

${m.robustness}

## Sampling record

Revenue population: ${m.sampling.revenue.populationSize} GL lines on 70x accounts,
population_hash \`${m.sampling.revenue.populationHash}\`; coverage cap ${eur(m.sampling.revenue.coverageCapCents)};
random size ${m.sampling.revenue.randomSize}; seed \`${m.sampling.revenue.seed}\`;
${m.sampling.revenue.selectedUnits.length} units selected.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
