import type { AssurancePack } from '@/lib/packs/types';
import type { TbRow } from './types';

// Framework-aware materiality (S2): deterministic benchmark aggregation + proposal rules
// (L3 — human validates), arithmetic L0. Rationale text is drafted from a template (the
// mock LLM path) or a live model in production; either way the numbers are code.

export interface BenchmarkAggregates {
  revenueCents: number;
  pbtCents: number;
  totalAssetsCents: number;
  equityCents: number;
}

/** Aggregate benchmark bases from the TB (PCG-shaped sign conventions: class 7 credit,
 *  class 6 debit; assets = classes 2/3/4(debit)/5). */
export function benchmarkAggregates(tb: TbRow[]): BenchmarkAggregates {
  const revenue = -sum(tb, (a) => (a.accountNo.startsWith('70') ? a.balanceCents : 0));
  const totalProducts = -sum(tb, (a) => (a.accountNo[0] === '7' ? a.balanceCents : 0));
  const expenses = sum(tb, (a) => (a.accountNo[0] === '6' ? a.balanceCents : 0));
  const assets = sum(tb, (a) => {
    const c = a.accountNo[0];
    return c === '2' || c === '3' || c === '4' || c === '5' ? Math.max(a.balanceCents, 0) : 0;
  });
  const equity = -sum(tb, (a) =>
    a.accountNo[0] === '1' &&
    !a.accountNo.startsWith('15') && !a.accountNo.startsWith('16') &&
    !a.accountNo.startsWith('17') && !a.accountNo.startsWith('18')
      ? a.balanceCents
      : 0,
  );
  const pbt = totalProducts - expenses;
  return { revenueCents: revenue, pbtCents: pbt, totalAssetsCents: assets, equityCents: equity };
}

function sum(tb: TbRow[], f: (a: TbRow) => number): number {
  return tb.reduce((s, a) => s + f(a), 0);
}

export interface MaterialityProposal {
  benchmarkCode: string;
  benchmarkAmountCents: number;
  pct: number;
  amountCents: number;
  perfPct: number;
  perfAmountCents: number;
  cttPct: number;
  cttAmountCents: number;
  tePct: number;
  teAmountCents: number;
  basis: { rule: string; aggregates: BenchmarkAggregates };
}

/** Round a threshold down to a presentable step (nearest 1000 € below). */
export function roundThresholdCents(cents: number): number {
  const step = 100000; // 1 000 €
  return Math.max(step, Math.floor(cents / step) * step);
}

/** Deterministic proposal rule (documented in the rationale): profit-oriented entity with
 *  meaningful PBT (≥2% of revenue) ⇒ PBT at pack default %; else revenue at default %. */
export function proposeMateriality(tb: TbRow[], pack: AssurancePack): MaterialityProposal {
  const agg = benchmarkAggregates(tb);
  const meaningfulPbt = agg.revenueCents > 0 && agg.pbtCents >= 0.02 * agg.revenueCents;
  const code = meaningfulPbt ? 'pbt' : 'revenue';
  const def = pack.materiality.benchmarks.find((b) => b.code === code)!;
  const base = code === 'pbt' ? agg.pbtCents : agg.revenueCents;
  return computeMateriality(code, base, def.pctDefault, pack, agg, meaningfulPbt
    ? `profit-oriented entity with stable pre-tax result (PBT ≥ 2% of revenue) ⇒ benchmark PBT at ${def.pctDefault * 100}%`
    : `result not representative (PBT < 2% of revenue) ⇒ benchmark revenue at ${def.pctDefault * 100}%`);
}

export function computeMateriality(
  benchmarkCode: string,
  benchmarkAmountCents: number,
  pct: number,
  pack: AssurancePack,
  aggregates: BenchmarkAggregates,
  rule: string,
): MaterialityProposal {
  const m = roundThresholdCents(benchmarkAmountCents * pct);
  const perf = roundThresholdCents(m * pack.materiality.perfPctDefault);
  const ctt = Math.max(10000, Math.floor((m * pack.materiality.cttPctDefault) / 10000) * 10000);
  const te = roundThresholdCents(m * pack.materiality.tePctDefault);
  return {
    benchmarkCode,
    benchmarkAmountCents,
    pct,
    amountCents: m,
    perfPct: pack.materiality.perfPctDefault,
    perfAmountCents: perf,
    cttPct: pack.materiality.cttPctDefault,
    cttAmountCents: ctt,
    tePct: pack.materiality.tePctDefault,
    teAmountCents: te,
    basis: { rule, aggregates },
  };
}
