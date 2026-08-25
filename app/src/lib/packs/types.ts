// Framework pack = content/configuration, never code (D1/P3, docs/03 §3).
// Packs are versioned TS content modules; engagement.framework_set binds them.

import type { DocRuleSetId } from '@/lib/kernel/retention';

export type Lang = 'fr' | 'en';
export type Frequency = 'many_daily' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'adhoc';

export interface FsliDef {
  code: string;
  statement: 'BS' | 'IS';
  name: Record<Lang, string>;
}

export interface CoaMapRule {
  prefix: string; // account number prefix
  fsli: string;
  priority?: number; // longer/more specific prefixes win via priority
}

export interface AccountingMapPack {
  id: string; // 'pcg' | 'ifrs' | 'usgaap'
  name: string;
  fslis: FsliDef[];
  rules: CoaMapRule[];
}

export interface BenchmarkDef {
  code: string; // 'pbt' | 'revenue' | 'total_assets' | 'equity'
  label: Record<Lang, string>;
  pctRange: [number, number];
  pctDefault: number;
}

export interface MaterialityConfig {
  benchmarks: BenchmarkDef[];
  perfPctDefault: number; // performance materiality as % of materiality
  cttPctDefault: number; // clearly trivial threshold as % of materiality
  tePctDefault: number; // tolerable misstatement as % of materiality (Gate 2)
}

export interface VouchingTolerances {
  amountAbs: number; // absolute € tolerance
  amountPct: number; // relative tolerance
  dateDays: number; // |invoice date - piece date| window
  pricePct: number;
  qtyAbs: number;
}

export interface SubstantiveConfig {
  // High-value coverage: every item ≥ coverageCapPctOfPM × performance materiality is
  // selected; random remainder of randomSizeDefault items from the rest (Q3).
  coverageCapPctOfPM: number;
  randomSizeDefault: number;
  seedDefault: string; // deterministic pack default, overridable at L3
  tolerances: VouchingTolerances;
}

export interface TaxonomyEntry {
  code: string;
  label: Record<Lang, string>;
}

export interface DeficiencyLadderConfig {
  // Rules-first severity proposal (Q7): thresholds as % of materiality.
  significantPctOfMateriality: number;
  materialPctOfMateriality: number;
}

export interface VerificationConfig {
  // ADR-012.3 spot-check on machine-passed items.
  spotcheckPct: number;
  spotcheckMin: number;
  seedDefault: string;
}

export interface DocRules {
  /** Which legal rule set governs the file. The numbers themselves live in the kernel
   *  with their citations (ADR-014 rev. 2): a pack names the regime, it does not restate
   *  a duration that a decree can change under it. */
  ruleSet: DocRuleSetId;
  basisNote: string;
}

export interface WorkpaperStrings {
  objective: string;
  scope: string;
  method: string;
  sampleTable: string;
  exceptions: string;
  evaluation: string; // "Évaluation des anomalies" / "Evaluation of misstatements" (Gate 2)
  verification: string;
  conclusion: string;
  signoffs: string;
  modifications: string;
  performedBy: string; // attribution template (ADR-012.4)
  validatedBy: string;
}

export interface AssurancePack {
  id: string;
  name: string;
  language: Lang;
  materiality: MaterialityConfig;
  substantive?: SubstantiveConfig;
  attributeSampleSizes?: Record<Frequency, number>;
  attributeSampleBasis?: string;
  attributeSeedDefault?: string;
  exceptionTaxonomy: TaxonomyEntry[];
  deviationTaxonomy?: TaxonomyEntry[];
  deficiencyLadder?: DeficiencyLadderConfig;
  verification: VerificationConfig;
  docRules: DocRules;
  extractionConfidenceThreshold: number; // below ⇒ human verify (rungs 3-4 always verify in v1, ADR-012)
  wp: WorkpaperStrings;
}

export interface FrameworkSet {
  assurance_packs: string[];
  accounting_map: string;
  language: Lang;
}
