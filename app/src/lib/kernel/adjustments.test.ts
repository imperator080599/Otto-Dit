import { describe, expect, it } from 'vitest';
import {
  adjustmentAmountCents, adjustmentImpact, reconcile,
  type Adjustment, type Misstatement,
} from './adjustments';

const fix = (over: Partial<Adjustment> = {}): Adjustment => ({
  ref: 'OD-V4-001', version: 4, nature: 'audit_fix', label: 'extourne',
  answers: 'FA2025-0702', support: 'grand livre 411/701', author: 'Paul Nguyen',
  lines: [
    { account: '701000', debitCents: 3_680_000, creditCents: 0 },
    { account: '411000', debitCents: 0, creditCents: 3_680_000 },
  ],
  ...over,
});
const mis = (over: Partial<Misstatement> = {}): Misstatement => ({
  key: 'je|VE00002', label: 'même facture comptabilisée deux fois',
  piece: 'FA2025-0702', identifiedCents: 3_680_000, explainedCents: 0,
  ...over,
});

describe('impact of an adjustment', () => {
  it('moves profit and net assets by the same amount — double entry', () => {
    const i = adjustmentImpact(fix());
    expect(i.balanced).toBe(true);
    expect(i.profitCents).toBe(-3_680_000);
    expect(i.netAssetsCents).toBe(-3_680_000);
    expect(i.equityCents).toBe(-3_680_000);
  });

  it('a pure reclassification inside the balance sheet leaves profit untouched', () => {
    const i = adjustmentImpact(fix({
      nature: 'restatement',
      lines: [
        { account: '205000', debitCents: 1_800_000, creditCents: 0 },
        { account: '213000', debitCents: 0, creditCents: 1_800_000 },
      ],
    }));
    expect(i.profitCents).toBe(0);
    expect(i.netAssetsCents).toBe(0);
    expect(i.balanced).toBe(true);
  });

  it('a movement taken directly to capital hits equity without hitting profit', () => {
    const i = adjustmentImpact(fix({
      lines: [
        { account: '512000', debitCents: 5_000_000, creditCents: 0 },
        { account: '101000', debitCents: 0, creditCents: 5_000_000 },
      ],
    }));
    expect(i.profitCents).toBe(0);
    expect(i.equityCents).toBe(5_000_000);
  });

  it('reports an entry whose two sides disagree rather than hiding it', () => {
    const i = adjustmentImpact(fix({
      lines: [{ account: '701000', debitCents: 100, creditCents: 0 }],
    }));
    expect(i.balanced).toBe(false);
  });
});

describe('reconciliation with the misstatement summary', () => {
  it('flips a misstatement to corrected with no entry from the auditor', () => {
    const r = reconcile([fix()], [mis()], 4);
    const m = r.misstatements[0];
    expect(m.correctedCents).toBe(3_680_000);
    expect(m.residualCents).toBe(0);
    expect(m.correctedBy).toEqual([{ ref: 'OD-V4-001', version: 4, amountCents: 3_680_000 }]);
    expect(r.totals.residualCents).toBe(0);
    expect(r.matched[0].unappliedCents).toBe(0);
  });

  it('a partial correction leaves the rest in the accumulation', () => {
    const partial = fix({
      ref: 'OD-V4-003', answers: 'OD-2025-089',
      lines: [
        { account: '706000', debitCents: 3_000_000, creditCents: 0 },
        { account: '487000', debitCents: 0, creditCents: 3_000_000 },
      ],
    });
    const r = reconcile([partial], [mis({ key: 'je|OD00001', piece: 'OD-2025-089', identifiedCents: 5_000_000 })], 4);
    expect(r.misstatements[0].correctedCents).toBe(3_000_000);
    expect(r.misstatements[0].residualCents).toBe(2_000_000);
  });

  it('never removes more than the misstatement, nor reverses its sign', () => {
    const tooBig = fix({
      lines: [
        { account: '701000', debitCents: 9_000_000, creditCents: 0 },
        { account: '411000', debitCents: 0, creditCents: 9_000_000 },
      ],
    });
    const r = reconcile([tooBig], [mis()], 4);
    expect(r.misstatements[0].correctedCents).toBe(3_680_000);
    expect(r.misstatements[0].residualCents).toBe(0);
    expect(r.matched[0].unappliedCents).toBe(9_000_000 - 3_680_000);

    // and on a negative misstatement, the correction keeps the sign
    const neg = reconcile([fix()], [mis({ identifiedCents: -3_680_000 })], 4);
    expect(neg.misstatements[0].correctedCents).toBe(-3_680_000);
    expect(neg.misstatements[0].residualCents).toBe(0);
  });

  it('takes the probative resolution first: only the residual can be corrected', () => {
    const r = reconcile([fix()], [mis({ explainedCents: 1_680_000 })], 4);
    expect(r.misstatements[0].correctedCents).toBe(2_000_000);
    expect(r.misstatements[0].residualCents).toBe(0);
    expect(r.matched[0].unappliedCents).toBe(3_680_000 - 2_000_000);
  });

  it('serves the largest residual first, so list order never decides the accumulation', () => {
    const petit = mis({ key: 'a', identifiedCents: 1_000_000 });
    const gros = mis({ key: 'b', identifiedCents: 3_000_000 });
    const entree = fix({ lines: [
      { account: '701000', debitCents: 3_000_000, creditCents: 0 },
      { account: '411000', debitCents: 0, creditCents: 3_000_000 },
    ] });
    const a = reconcile([entree], [petit, gros], 4);
    const b = reconcile([entree], [gros, petit], 4);
    const cle = (r: ReturnType<typeof reconcile>) =>
      Object.fromEntries(r.misstatements.map((m) => [m.key, m.correctedCents]));
    expect(cle(a)).toEqual(cle(b));
    expect(cle(a)).toEqual({ a: 0, b: 3_000_000 });
  });

  it('a correction announced but not taken into account corrects nothing', () => {
    const r = reconcile([fix()], [mis()], 2, [3, 4]);
    expect(r.misstatements[0].correctedCents).toBe(0);
    expect(r.misstatements[0].residualCents).toBe(3_680_000);
    expect(r.announced.map((a) => a.ref)).toEqual(['OD-V4-001']);
    expect(r.matched).toHaveLength(0);
  });

  it('closing entries and restatements never touch the accumulation', () => {
    const l: Adjustment[] = [
      fix({ ref: 'OD-V2-002', version: 2, nature: 'closing', answers: 'FA2025-0702' }),
      fix({ ref: 'OD-V3-003', version: 3, nature: 'restatement', answers: 'FA2025-0702' }),
    ];
    const r = reconcile(l, [mis()], 4);
    expect(r.misstatements[0].correctedCents).toBe(0);
    expect(r.matched).toHaveLength(0);
  });

  describe('the two signals', () => {
    it('signal 1 — a misstatement called corrected with no entry carrying it', () => {
      const r = reconcile([], [mis({ disposition: 'corrected' })], 4);
      expect(r.misstatementsWithoutEntry.map((m) => m.key)).toEqual(['je|VE00002']);
      expect(r.fixesWithoutMisstatement).toHaveLength(0);
    });

    it('signal 1 stays silent once an entry actually carries the correction', () => {
      const r = reconcile([fix()], [mis({ disposition: 'corrected' })], 4);
      expect(r.misstatementsWithoutEntry).toHaveLength(0);
    });

    it('signal 2 — an entry answering a finding the file does not carry', () => {
      const r = reconcile([fix({ answers: 'FF2025-0355' })], [mis()], 4);
      expect(r.fixesWithoutMisstatement.map((a) => a.ref)).toEqual(['OD-V4-001']);
      expect(r.misstatements[0].residualCents).toBe(3_680_000);
    });

    it('a misstatement with no document reference is never matched by accident', () => {
      const r = reconcile([fix({ answers: undefined })], [mis({ piece: undefined })], 4);
      expect(r.fixesWithoutMisstatement).toHaveLength(1);
      expect(r.misstatements[0].correctedCents).toBe(0);
    });
  });

  it('the totals add up: identified − explained − corrected = residual', () => {
    const r = reconcile(
      [fix(), fix({ ref: 'OD-V4-002', answers: 'FA2025-0706',
        lines: [
          { account: '701000', debitCents: 3_633_000, creditCents: 0 },
          { account: '411000', debitCents: 0, creditCents: 3_633_000 },
        ] })],
      [mis(), mis({ key: 'je|VE00003', piece: 'FA2025-0706', identifiedCents: 3_633_000 }),
       mis({ key: 'je|OD00001', piece: 'OD-2025-089', identifiedCents: 5_000_000, explainedCents: 1_000_000 })],
      4,
    );
    const t = r.totals;
    expect(t.identifiedCents - t.explainedCents - t.correctedCents).toBe(t.residualCents);
    expect(t.residualCents).toBe(4_000_000);
  });

  it('amount of an entry is the sum of its debits', () => {
    expect(adjustmentAmountCents(fix())).toBe(3_680_000);
  });
});
