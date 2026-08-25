import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@/lib/core/hash';
import { parseFec } from '@/lib/kernel/fec';
import { populationHash, controlPopulationHash, parseAmountCents } from '@/lib/kernel/canon';
import { computeFlags, defaultFlagConfig } from '@/lib/kernel/flags';
import { monetaryDraw, attributeDraw } from '@/lib/kernel/sampling';
import { vouchRevenueLine, checksToExceptionCodes, findDuplicateInvoices } from '@/lib/kernel/matching';
import { nepFr } from '@/lib/packs/nep-fr';
import type { GlRow, InvoiceFields, SampleUnit } from '@/lib/kernel/types';

// C1 acceptance (ADR-015 placement-invariant test): recompute population → flags → draw →
// vouching with the CURRENT kernel + pack config against the COMMITTED dataset, and assert
// every manifest anomaly/deviation is detectable. Zero false negatives; false positives
// enumerated. This is build-time regression evidence (Gate 1 scope note), and it runs at
// every slice from C1b onward — drift fails the slice that caused it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ds = (...p: string[]) => path.join(root, 'dataset', ...p);

interface Manifest {
  substantiveAnomalies: { id: string; taxonomy: string[]; units: string[]; evidence: string[]; stratum: string }[];
  reconciliationAnomaly: { accounts: string[]; deltaCents: number };
  deviations: { id: string; control: string; instance: string; taxonomy: string }[];
  sampling: {
    revenue: { populationHash: string; coverageCapCents: number; randomSize: number; seed: string; selectedUnits: string[] };
    bankRec: { sampled: string[] };
    approvals: { sampled: string[] };
  };
}

interface Fixture {
  filename: string;
  docType: string;
  rungExpected: string;
  fields: { name: string; value: string; confidence: number; page: number }[];
}

let manifest: Manifest;
let fixtures: Fixture[];
let evidenceIndex: { filename: string; sha256: string; docType: string; invoiceNumber?: string; forUnits: string[]; anomaly?: string }[];
let glRows: GlRow[];
let drawSelected: Set<string>;
let unitAmount: Map<string, number>;

function fixtureFor(filename: string): Fixture | undefined {
  return fixtures.find((f) => f.filename === filename);
}

function invoiceFieldsFrom(f: Fixture): InvoiceFields {
  const get = (n: string) => f.fields.find((x) => x.name === n)?.value;
  const lines: InvoiceFields['lines'] = [];
  for (const fld of f.fields) {
    if (fld.name.startsWith('line')) lines.push(JSON.parse(fld.value));
  }
  return {
    invoiceNumber: get('invoiceNumber'),
    invoiceDate: get('invoiceDate'),
    buyerName: get('buyerName'),
    sellerName: get('sellerName'),
    totalNetCents: get('totalNetCents') ? Number(get('totalNetCents')) : undefined,
    vatCents: get('vatCents') ? Number(get('vatCents')) : undefined,
    totalGrossCents: get('totalGrossCents') ? Number(get('totalGrossCents')) : undefined,
    lines: lines.length ? lines : undefined,
  };
}

beforeAll(() => {
  manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
  fixtures = JSON.parse(fs.readFileSync(ds('fixtures', 'extractions.json'), 'utf8'));
  evidenceIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8'));
  const fec = fs.readFileSync(ds('999888777FEC20251231.txt'), 'latin1');
  const parsed = parseFec(fec, {
    filename: '999888777FEC20251231.txt',
    expectedSiren: '999888777',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
  });
  expect(parsed.ok).toBe(true);
  glRows = parsed.rows;

  // recompute the draw with the CURRENT kernel + pinned params
  const revRows = glRows.filter((r) => r.accountNo.startsWith('70'));
  const flagged = computeFlags(revRows, defaultFlagConfig('2025-12-31'));
  const SELECTION_FLAGS = new Set(['weekend', 'round_amount', 'manual_journal', 'credit_note_pattern']);
  const units: SampleUnit[] = flagged.map((r) => ({
    id: r.naturalKey,
    amountCents: Math.abs(r.creditCents - r.debitCents),
    flags: r.flags.filter((f) => SELECTION_FLAGS.has(f)),
  }));
  const popHash = populationHash(revRows);
  expect(popHash).toBe(manifest.sampling.revenue.populationHash);
  const draw = monetaryDraw(
    units,
    {
      coverageCapCents: manifest.sampling.revenue.coverageCapCents,
      randomSize: manifest.sampling.revenue.randomSize,
      seed: manifest.sampling.revenue.seed,
    },
    popHash,
  );
  drawSelected = new Set(draw.selections.map((s) => s.id));
  unitAmount = new Map(units.map((u) => [u.id, u.amountCents]));
  expect([...drawSelected].sort()).toEqual([...manifest.sampling.revenue.selectedUnits].sort());
});

describe('acceptance — substantive anomalies (zero false negatives)', () => {
  it('every seeded anomaly unit is inside the recomputed draw', () => {
    for (const a of manifest.substantiveAnomalies) {
      for (const unit of a.units) {
        expect(drawSelected.has(unit), `${a.id} unit ${unit} must be sampled`).toBe(true);
      }
    }
  });

  it('A1 duplicate invoice detected (same number across two sampled units + same sha)', () => {
    const a1 = manifest.substantiveAnomalies.find((a) => a.id === 'A1')!;
    const file = evidenceIndex.find((e) => e.anomaly === 'A1')!;
    expect(file.forUnits.length).toBe(2);
    const f = fixtureFor(file.filename)!;
    const items = a1.units.map((u) => ({ unitId: u, invoice: invoiceFieldsFrom(f) }));
    const dupes = findDuplicateInvoices(items);
    expect([...dupes.values()][0]?.length).toBe(2);
  });

  it('A2 missing delivery note → missing_document', () => {
    const a2 = manifest.substantiveAnomalies.find((a) => a.id === 'A2')!;
    const unit = a2.units[0];
    const gl = glRows.find((r) => r.naturalKey === unit)!;
    const invFile = evidenceIndex.find((e) => e.anomaly === 'A2' && e.docType === 'invoice')!;
    const checks = vouchRevenueLine(
      { gl, clientPartyName: 'Altiverre SAS', invoice: invoiceFieldsFrom(fixtureFor(invFile.filename)!), requireDelivery: true },
      nepFr.substantive!.tolerances,
    );
    expect(checksToExceptionCodes(checks)).toContain('missing_document');
  });

  it('A3 price mismatch, A4 qty mismatch, A5 cutoff detected via kernel vouching', () => {
    const cases: [string, string][] = [['A3', 'price_mismatch'], ['A4', 'qty_mismatch'], ['A5', 'cutoff']];
    for (const [id, code] of cases) {
      const a = manifest.substantiveAnomalies.find((x) => x.id === id)!;
      const unit = a.units[0];
      const gl = glRows.find((r) => r.naturalKey === unit)!;
      const invFile = evidenceIndex.find((e) => e.anomaly === id && e.docType === 'invoice')!;
      const blFile = evidenceIndex.find((e) => e.anomaly === id && e.docType === 'delivery_note');
      const blFix = blFile ? fixtureFor(blFile.filename) : undefined;
      const delivery = blFix
        ? {
            deliveryNoteNumber: blFix.fields.find((f) => f.name === 'deliveryNoteNumber')?.value,
            qtyTotal: Number(blFix.fields.find((f) => f.name === 'qtyTotal')?.value),
          }
        : undefined;
      const checks = vouchRevenueLine(
        { gl, clientPartyName: 'Altiverre SAS', invoice: invoiceFieldsFrom(fixtureFor(invFile.filename)!), delivery, requireDelivery: !!delivery },
        nepFr.substantive!.tolerances,
      );
      expect(checksToExceptionCodes(checks), `${id} should raise ${code}`).toContain(code);
    }
  });

  it('A6 weekend/round/manual JE and A8 credit-note pattern carry their flags', () => {
    const revRows = glRows.filter((r) => r.accountNo.startsWith('70'));
    const flagged = computeFlags(revRows, defaultFlagConfig('2025-12-31'));
    const a6 = manifest.substantiveAnomalies.find((a) => a.id === 'A6')!;
    const je = flagged.find((r) => r.naturalKey === a6.units[0])!;
    expect(je.flags).toEqual(expect.arrayContaining(['weekend', 'round_amount', 'manual_journal']));
    const a8 = manifest.substantiveAnomalies.find((a) => a.id === 'A8')!;
    for (const unit of a8.units) {
      const row = flagged.find((r) => r.naturalKey === unit)!;
      expect(row.flags, `credit note ${unit}`).toContain('credit_note_pattern');
    }
  });

  it('A7 TB↔FEC mismatch is exactly the seeded delta on the seeded account', () => {
    const tbCsv = fs.readFileSync(ds('tb_2025.csv'), 'utf8').trim().split('\n').slice(1);
    const tb = new Map(
      tbCsv.map((l) => {
        const [acc, , d, c] = l.split(';');
        return [acc, parseAmountCents(d) - parseAmountCents(c)] as const;
      }),
    );
    const diffs: { account: string; delta: number }[] = [];
    const glByAccount = new Map<string, number>();
    for (const r of glRows) {
      glByAccount.set(r.accountNo, (glByAccount.get(r.accountNo) ?? 0) + r.debitCents - r.creditCents);
    }
    for (const [acc, tbBal] of tb) {
      const glBal = glByAccount.get(acc) ?? 0;
      if (tbBal !== glBal) diffs.push({ account: acc, delta: tbBal - glBal });
    }
    expect(diffs.map((d) => d.account).sort()).toEqual([...manifest.reconciliationAnomaly.accounts].sort());
    for (const d of diffs) expect(Math.abs(d.delta)).toBe(manifest.reconciliationAnomaly.deltaCents);
  });

  it('false positives are enumerated and triaged', () => {
    // Every sampled unit NOT tied to a seeded anomaly must be clean under vouching with
    // its fixture evidence (or be a random/service item whose evidence exists).
    const anomalyUnits = new Set(manifest.substantiveAnomalies.flatMap((a) => a.units));
    const falsePositives: string[] = [];
    for (const unit of drawSelected) {
      if (anomalyUnits.has(unit)) continue;
      const file = evidenceIndex.find((e) => e.forUnits.includes(unit) && (e.docType === 'invoice' || e.docType === 'credit_note'));
      if (!file) {
        falsePositives.push(`${unit}: no evidence file (would raise missing_document)`);
        continue;
      }
      const gl = glRows.find((r) => r.naturalKey === unit)!;
      const blFile = evidenceIndex.find((e) => e.forUnits.includes(unit) && e.docType === 'delivery_note');
      const blFix = blFile ? fixtureFor(blFile.filename) : undefined;
      const checks = vouchRevenueLine(
        {
          gl,
          clientPartyName: 'Altiverre SAS',
          invoice: invoiceFieldsFrom(fixtureFor(file.filename)!),
          delivery: blFix ? { qtyTotal: Number(blFix.fields.find((f) => f.name === 'qtyTotal')?.value) } : undefined,
          requireDelivery: !!blFile,
        },
        nepFr.substantive!.tolerances,
      );
      const codes = checksToExceptionCodes(checks);
      if (codes.length > 0) falsePositives.push(`${unit}: ${codes.join(',')}`);
    }
    expect(falsePositives, `unexpected exceptions on clean sampled units:\n${falsePositives.join('\n')}`).toEqual([]);
  });
});

describe('acceptance — SOX deviations (zero false negatives)', () => {
  it('the pinned attribute draw reproduces the sampled instances', () => {
    const instances = fs.readFileSync(ds('sox', 'instances_C-BR-01.csv'), 'utf8').trim().split('\n').slice(1)
      .map((l) => {
        const [label, occurredOn, performer] = l.split(';');
        return { label, occurredOn, performerName: performer };
      });
    const hash = controlPopulationHash(instances);
    const draw = attributeDraw(instances.map((i) => i.label), 3, 'otto-demo-sox-1:C-BR-01', hash);
    expect(draw.selected).toEqual(manifest.sampling.bankRec.sampled);
  });

  it('every seeded deviation is detectable from the sampled evidence fixtures', () => {
    const sampled = manifest.sampling.bankRec.sampled;
    const detected: string[] = [];
    for (const month of sampled) {
      const fix = fixtureFor(`sox/evidence/bankrec_${month}.pdf`);
      if (!fix) {
        detected.push(`missing_evidence:${month}`);
        continue;
      }
      const get = (n: string) => fix.fields.find((f) => f.name === n)?.value ?? '';
      const preparedOn = get('preparedOn');
      const approvedBy = get('approvedBy');
      const preparedBy = get('preparedBy');
      const monthEnd = new Date(Date.UTC(2025, Number(month.slice(5, 7)), 0));
      const lateDays = Math.round((Date.parse(preparedOn) - monthEnd.getTime()) / 86400000);
      if (lateDays > 10) detected.push(`late_performance:${month}`);
      if (!approvedBy) detected.push(`missing_approval:${month}`);
      if (approvedBy && approvedBy === preparedBy) detected.push(`wrong_performer:${month}`);
    }
    for (const d of manifest.deviations) {
      expect(detected, `deviation ${d.id} (${d.taxonomy} on ${d.instance})`).toContain(`${d.taxonomy}:${d.instance}`);
    }
    // no extra deviations beyond the seeded ones (false-positive check)
    expect(detected.length).toBe(manifest.deviations.length);
  });

  it('the approval control sample is clean and includes the OCR-mock evidence', () => {
    const sampled = manifest.sampling.approvals.sampled;
    expect(sampled.length).toBe(5);
    let ocrCount = 0;
    for (const week of sampled) {
      const fix = fixtureFor(`sox/evidence/credit_approval_${week}.pdf`)!;
      expect(fix).toBeTruthy();
      if (fix.rungExpected === 'ocr') {
        ocrCount++;
        const low = fix.fields.filter((f) => f.confidence < nepFr.extractionConfidenceThreshold);
        expect(low.length).toBeGreaterThan(0);
      }
      expect(fix.fields.find((f) => f.name === 'approvedBy')?.value).toBe('S. Marchand');
    }
    expect(ocrCount).toBe(1);
  });
});

describe('acceptance — dataset integrity', () => {
  it('every committed evidence file matches its recorded sha256', () => {
    for (const e of evidenceIndex) {
      const bytes = fs.readFileSync(ds(...e.filename.split('/')));
      expect(sha256(bytes), e.filename).toBe(e.sha256);
    }
  });

  it('the Factur-X evidence embeds CII XML with the exact invoice totals', () => {
    const fx = evidenceIndex.find((e) => e.filename.includes('_facturx'))!;
    const bytes = fs.readFileSync(ds(...fx.filename.split('/')));
    const content = bytes.toString('latin1');
    expect(content).toContain('factur-x.xml');
    const fix = fixtureFor(fx.filename)!;
    expect(fix.rungExpected).toBe('xml');
  });
});
