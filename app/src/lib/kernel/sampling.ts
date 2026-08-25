import { seededRng, drawWithoutReplacement } from '@/lib/core/rng';
import { sha256 } from '@/lib/core/hash';
import type { MonetaryDrawParams, MonetaryDrawResult, SampleUnit, Selection } from './types';

// Sampling engine — one engine, three methods (docs/03 §2): monetary (coverage + seeded
// random remainder), attribute (frequency-based size), verification subsample
// (ADR-012.3). Deterministic: same (population, seed, params) ⇒ same draw, test-asserted.
// The RNG stream is keyed to seed + population hash so a changed population re-draws.

function unitsHash(units: SampleUnit[]): string {
  const body = units
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((u) => `${u.id}|${u.amountCents}`)
    .join('\n');
  return 'unithash-v1:' + sha256(body);
}

/** Monetary method: high-value coverage (≥ cap) + all risk-flagged + seeded random
 *  remainder up to randomSize. Selection order inside the result is stable:
 *  high_value by amount desc, then risk_flag by id, then random in draw order. */
export function monetaryDraw(units: SampleUnit[], params: MonetaryDrawParams, populationHash: string): MonetaryDrawResult {
  const populationAmountCents = units.reduce((s, u) => s + Math.abs(u.amountCents), 0);

  const highValue = units
    .filter((u) => Math.abs(u.amountCents) >= params.coverageCapCents)
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents) || (a.id < b.id ? -1 : 1));
  const highIds = new Set(highValue.map((u) => u.id));

  const flagged = units
    .filter((u) => !highIds.has(u.id) && (u.flags?.length ?? 0) > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const flaggedIds = new Set(flagged.map((u) => u.id));

  const remainder = units
    .filter((u) => !highIds.has(u.id) && !flaggedIds.has(u.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rng = seededRng(`${params.seed}:${populationHash}`);
  const randomPick = drawWithoutReplacement(remainder, params.randomSize, rng);

  const selections: Selection[] = [
    ...highValue.map((u) => ({ id: u.id, reason: 'high_value' as const, amountCents: u.amountCents })),
    ...flagged.map((u) => ({ id: u.id, reason: 'risk_flag' as const, amountCents: u.amountCents })),
    ...randomPick.map((u) => ({ id: u.id, reason: 'random' as const, amountCents: u.amountCents })),
  ];

  return {
    selections,
    populationHash,
    populationSize: units.length,
    populationAmountCents,
    coverageAmountCents: highValue.reduce((s, u) => s + Math.abs(u.amountCents), 0),
    params,
  };
}

/** Attribute method: seeded draw of `size` instances from the control population. */
export function attributeDraw(
  instanceLabels: string[],
  size: number,
  seed: string,
  populationHash: string,
): { selected: string[]; populationHash: string; populationSize: number } {
  const sorted = instanceLabels.slice().sort();
  const rng = seededRng(`${seed}:${populationHash}`);
  const selected = drawWithoutReplacement(sorted, size, rng).sort();
  return { selected, populationHash, populationSize: sorted.length };
}

/** Verification subsample (ADR-012.3): seeded draw over machine-PASSED item ids. */
export function verificationDraw(
  passedItemIds: string[],
  rate: number,
  minItems: number,
  seed: string,
): { selected: string[]; machinePassedPopulationHash: string; size: number } {
  const sorted = passedItemIds.slice().sort();
  const hash = 'pophash-v1:' + sha256(sorted.join('\n'));
  const size = Math.min(sorted.length, Math.max(minItems, Math.ceil(sorted.length * rate)));
  const rng = seededRng(`${seed}:${hash}`);
  const selected = drawWithoutReplacement(sorted, size, rng).sort();
  return { selected, machinePassedPopulationHash: hash, size };
}

export { unitsHash };
