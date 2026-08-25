import type { AssurancePack } from './types';

// PCAOB AS / SOX 404(b) + COSO 2013 pack — English ICFR content. Sample sizes are common
// practice derived from AICPA Audit Sampling guidance — NOT a PCAOB/SEC requirement
// (ADR-010, 10_D13_RESEARCH §D); overridable per engagement with justification.

export const pcaobSox: AssurancePack = {
  id: 'pcaob-sox',
  name: 'PCAOB AS / SOX 404 + COSO 2013 (ICFR)',
  language: 'en',
  materiality: {
    benchmarks: [
      { code: 'pbt', label: { fr: 'Résultat avant impôt', en: 'Pre-tax income' }, pctRange: [0.05, 0.1], pctDefault: 0.05 },
      { code: 'revenue', label: { fr: "Chiffre d'affaires", en: 'Revenue' }, pctRange: [0.005, 0.01], pctDefault: 0.005 },
      { code: 'total_assets', label: { fr: 'Total actif', en: 'Total assets' }, pctRange: [0.005, 0.01], pctDefault: 0.005 },
      { code: 'equity', label: { fr: 'Capitaux propres', en: 'Equity' }, pctRange: [0.01, 0.02], pctDefault: 0.01 },
    ],
    perfPctDefault: 0.75,
    cttPctDefault: 0.05,
    tePctDefault: 0.75,
  },
  attributeSampleSizes: {
    many_daily: 25,
    daily: 25,
    weekly: 5,
    monthly: 3,
    quarterly: 2,
    annual: 1,
    adhoc: 10,
  },
  attributeSeedDefault: 'otto-demo-sox-1',
  attributeSampleBasis:
    'Common-practice frequency table derived from AICPA Audit Sampling guidance (see docs/10_D13_RESEARCH §D). Firm-methodology convention, not a PCAOB/SEC requirement; overridable with justification.',
  exceptionTaxonomy: [
    { code: 'reconciliation_diff', label: { fr: 'Écart de rapprochement', en: 'Reconciliation difference' } },
    { code: 'verification_disagreement', label: { fr: 'Désaccord de re-exécution', en: 'Verification spot-check disagreement' } },
    { code: 'quarantined_evidence', label: { fr: 'Pièce en quarantaine', en: 'Quarantined evidence' } },
  ],
  deviationTaxonomy: [
    { code: 'missing_approval', label: { fr: 'Approbation manquante', en: 'Missing approval' } },
    { code: 'late_performance', label: { fr: 'Contrôle exécuté en retard', en: 'Control performed late' } },
    { code: 'wrong_performer', label: { fr: 'Exécutant non habilité / conflit de séparation des tâches', en: 'Wrong performer / SoD conflict' } },
    { code: 'missing_evidence', label: { fr: 'Preuve manquante', en: 'Missing evidence for instance' } },
    { code: 'attribute_fail', label: { fr: 'Attribut non satisfait', en: 'Attribute not met' } },
  ],
  deficiencyLadder: {
    significantPctOfMateriality: 0.2,
    materialPctOfMateriality: 1.0,
  },
  verification: { spotcheckPct: 0.1, spotcheckMin: 2, seedDefault: 'otto-demo-verif-1' },
  docRules: {
    assemblyDays: 14,
    retentionYears: 7,
    basisNote:
      'Documentation completion ≤14 days after report release (AS 1215.15 as amended; 45-day legacy tier configurable); retention 7 years from report release (AS 1215.14; SEC Rule 2-06).',
  },
  extractionConfidenceThreshold: 0.9,
  wp: {
    objective: 'Objective',
    scope: 'Scope and population',
    method: 'Method and selection',
    sampleTable: 'Items tested',
    exceptions: 'Deviations noted and disposition',
    evaluation: 'Deviation evaluation and deficiency assessment',
    verification: 'Reliability spot-check (re-performance of passed items)',
    conclusion: 'Conclusion',
    signoffs: 'Sign-offs',
    modifications: 'Manual modifications (justified)',
    performedBy: 'Performed by OTTO — engine run',
    validatedBy: 'Validated by',
  },
};
