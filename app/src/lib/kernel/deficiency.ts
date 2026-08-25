import type { DeficiencyLadderConfig } from '@/lib/packs/types';

// Deficiency severity proposal — rules-first (Q7, L3: human decides). Inputs are facts the
// tester recorded; the output carries its full basis for the workpaper and the aggregation
// view. Severity language per PCAOB/COSO pack taxonomy.
//
// Founder review 2026-08-25: magnitude alone was deciding severity, so a key cash control
// that failed on EVERY tested instance — including one prepared and approved by the same
// person, and one with no evidence at all — came out as a plain "deficiency". Rate and
// nature now weigh too, and they weigh first: a control that failed every time it was
// tested is not a control with exceptions, it is a control that did not operate.

export type DeviationNature =
  | 'missing_evidence'  // nothing was produced: the control cannot be shown to have operated
  | 'wrong_performer'   // preparer and approver are the same person (segregation of duties)
  | 'missing_approval'  // performed but never approved
  | 'late_performance'  // performed outside the required window
  | 'other';

/** Natures that are qualitative red flags whatever the amount: a control nobody can
 *  evidence, and a control whose maker approves their own work, are not small problems
 *  because the balance happens to be small. */
export const SEVERE_NATURES: DeviationNature[] = ['missing_evidence', 'wrong_performer'];

export interface DeficiencyInput {
  deviationsCount: number;
  sampleSize: number;
  isKeyControl: boolean;
  compensatingControl: boolean; // an effective compensating control exists
  // magnitude that could plausibly be misstated given the control's coverage
  magnitudeExposureCents: number;
  materialityCents: number;
  ladder: DeficiencyLadderConfig;
  /** What kind of failures, not just how many. */
  deviationNatures?: DeviationNature[];
}

export interface DeficiencyProposal {
  severity: 'deficiency' | 'significant_deficiency' | 'material_weakness';
  /** True when the sample can no longer support a conclusion about the population. */
  populationExtensionRequired: boolean;
  basis: {
    deviationRate: number;
    deviationsCount: number;
    sampleSize: number;
    isKeyControl: boolean;
    compensatingControl: boolean;
    severeNatures: DeviationNature[];
    magnitudeExposureCents: number;
    materialityCents: number;
    thresholds: { significantCents: number; materialCents: number };
    rule: string;
  };
}

export function proposeDeficiencySeverity(input: DeficiencyInput): DeficiencyProposal {
  const rate = input.sampleSize > 0 ? input.deviationsCount / input.sampleSize : 0;
  const significantCents = Math.round(input.materialityCents * input.ladder.significantPctOfMateriality);
  const materialCents = Math.round(input.materialityCents * input.ladder.materialPctOfMateriality);
  const natures = input.deviationNatures ?? [];
  const severeNatures = [...new Set(natures.filter((n) => SEVERE_NATURES.includes(n)))];

  let severity: DeficiencyProposal['severity'] = 'deficiency';
  let rule =
    'operating deviations noted; magnitude exposure below the significant threshold or compensating control effective ⇒ deficiency';

  // magnitude rules (unchanged)
  if (input.magnitudeExposureCents >= materialCents && input.isKeyControl && !input.compensatingControl) {
    severity = 'material_weakness';
    rule =
      'key control, no effective compensating control, potential magnitude ≥ materiality ⇒ reasonable possibility of material misstatement — material weakness proposed';
  } else if (input.magnitudeExposureCents >= significantCents && !input.compensatingControl) {
    severity = 'significant_deficiency';
    rule =
      'potential magnitude ≥ significant threshold without compensating control ⇒ significant deficiency proposed (merits attention of those responsible for oversight)';
  }

  // nature: a segregation-of-duties failure or an absence of evidence is a qualitative
  // indicator on its own — it is not netted off against a small amount
  if (severeNatures.length > 0 && severity === 'deficiency') {
    severity = 'significant_deficiency';
    rule =
      `qualitative indicator (${severeNatures.join(', ')}) ⇒ significant deficiency proposed regardless of magnitude`;
  }

  // rate: every tested instance failed. On a key control that is the absence of a control,
  // and the default proposal is a material weakness — to be argued down by a human, not up.
  if (rate >= 1 && input.deviationsCount > 0 && input.isKeyControl) {
    severity = 'material_weakness';
    rule =
      `every tested instance failed (${input.deviationsCount}/${input.sampleSize}) on a key control` +
      (severeNatures.length ? `, including ${severeNatures.join(' and ')}` : '') +
      ' ⇒ the control did not operate during the period tested: material weakness proposed by default, to be reduced only by a documented human decision';
  }

  return {
    severity,
    // a 100 % deviation rate is not a sample result: the population must be tested in full
    populationExtensionRequired: rate >= 1 && input.deviationsCount > 0,
    basis: {
      deviationRate: Number(rate.toFixed(4)),
      deviationsCount: input.deviationsCount,
      sampleSize: input.sampleSize,
      isKeyControl: input.isKeyControl,
      compensatingControl: input.compensatingControl,
      severeNatures,
      magnitudeExposureCents: input.magnitudeExposureCents,
      materialityCents: input.materialityCents,
      thresholds: { significantCents, materialCents },
      rule,
    },
  };
}
