import type { DeficiencyLadderConfig } from '@/lib/packs/types';

// Deficiency severity proposal — rules-first (Q7, L3: human decides). Inputs are facts the
// tester recorded; the output carries its full basis for the workpaper and the aggregation
// view. Severity language per PCAOB/COSO pack taxonomy.

export interface DeficiencyInput {
  deviationsCount: number;
  sampleSize: number;
  isKeyControl: boolean;
  compensatingControl: boolean; // an effective compensating control exists
  // magnitude that could plausibly be misstated given the control's coverage
  magnitudeExposureCents: number;
  materialityCents: number;
  ladder: DeficiencyLadderConfig;
}

export interface DeficiencyProposal {
  severity: 'deficiency' | 'significant_deficiency' | 'material_weakness';
  basis: {
    deviationRate: number;
    isKeyControl: boolean;
    compensatingControl: boolean;
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

  let severity: DeficiencyProposal['severity'] = 'deficiency';
  let rule =
    'operating deviations noted; magnitude exposure below the significant threshold or compensating control effective ⇒ deficiency';

  if (input.magnitudeExposureCents >= materialCents && input.isKeyControl && !input.compensatingControl) {
    severity = 'material_weakness';
    rule =
      'key control, no effective compensating control, potential magnitude ≥ materiality ⇒ reasonable possibility of material misstatement — material weakness proposed';
  } else if (input.magnitudeExposureCents >= significantCents && !input.compensatingControl) {
    severity = 'significant_deficiency';
    rule =
      'potential magnitude ≥ significant threshold without compensating control ⇒ significant deficiency proposed (merits attention of those responsible for oversight)';
  }

  return {
    severity,
    basis: {
      deviationRate: Number(rate.toFixed(4)),
      isKeyControl: input.isKeyControl,
      compensatingControl: input.compensatingControl,
      magnitudeExposureCents: input.magnitudeExposureCents,
      materialityCents: input.materialityCents,
      thresholds: { significantCents, materialCents },
      rule,
    },
  };
}
