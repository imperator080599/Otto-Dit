// Sample evaluation & misstatement projection (Gate 2, audit-partner lens; ISA/NEP
// 530-shaped, pure arithmetic). Known misstatement = sum of identified misstatements.
// Projection (ratio method): misstatement rate observed in the RANDOM stratum extrapolated
// to the untested population. 100%-coverage (high-value + risk-flag) items carry their
// known value only — nothing is projected from them.

export interface EvaluationInput {
  populationAmountCents: number;
  coverageAmountCents: number; // high-value + risk-flag tested amounts (100% examined strata)
  randomTestedAmountCents: number; // amount tested in the random stratum
  coverageMisstatementCents: number; // known misstatements found in 100% strata
  randomMisstatementCents: number; // known misstatements found in the random stratum
  teAmountCents: number;
}

export interface EvaluationResult {
  knownMisstatementCents: number;
  projectedMisstatementCents: number;
  projectionMethod: 'ratio' | 'none';
  untestedAmountCents: number;
  totalKnownPlusProjectedCents: number;
  teAmountCents: number;
  withinTolerable: boolean;
}

export function evaluateSample(input: EvaluationInput): EvaluationResult {
  const untested = Math.max(
    0,
    input.populationAmountCents - input.coverageAmountCents - input.randomTestedAmountCents,
  );
  const known = input.coverageMisstatementCents + input.randomMisstatementCents;
  let projected = 0;
  let method: 'ratio' | 'none' = 'none';
  if (input.randomTestedAmountCents > 0 && input.randomMisstatementCents !== 0 && untested > 0) {
    method = 'ratio';
    projected = Math.round((input.randomMisstatementCents / input.randomTestedAmountCents) * untested);
  }
  const total = known + projected;
  return {
    knownMisstatementCents: known,
    projectedMisstatementCents: projected,
    projectionMethod: method,
    untestedAmountCents: untested,
    totalKnownPlusProjectedCents: total,
    teAmountCents: input.teAmountCents,
    withinTolerable: Math.abs(total) <= input.teAmountCents,
  };
}
