import type { AssurancePack } from './types';

// NEP/France pack — French statutory audit content. Public-standards-shaped content only
// (input hygiene §2): benchmark menus and % ranges are common published practice, not any
// firm's methodology. Retention/lock per ADR-014.

export const nepFr: AssurancePack = {
  id: 'nep-fr',
  name: 'NEP — Audit légal (France)',
  language: 'fr',
  materiality: {
    benchmarks: [
      { code: 'pbt', label: { fr: 'Résultat courant avant impôt', en: 'Profit before tax' }, pctRange: [0.05, 0.1], pctDefault: 0.05 },
      { code: 'revenue', label: { fr: "Chiffre d'affaires", en: 'Revenue' }, pctRange: [0.005, 0.01], pctDefault: 0.007 },
      { code: 'total_assets', label: { fr: 'Total bilan', en: 'Total assets' }, pctRange: [0.005, 0.01], pctDefault: 0.01 },
      { code: 'equity', label: { fr: 'Capitaux propres', en: 'Equity' }, pctRange: [0.01, 0.02], pctDefault: 0.02 },
    ],
    perfPctDefault: 0.75,
    cttPctDefault: 0.05,
    tePctDefault: 0.75, // TE = performance materiality by default (Gate 2)
  },
  substantive: {
    coverageCapPctOfPM: 1.0, // every item ≥ 100% of PM is covered individually
    randomSizeDefault: 4,
    seedDefault: 'otto-demo-rev-1',
    tolerances: { amountAbs: 1, amountPct: 0.005, dateDays: 5, pricePct: 0.01, qtyAbs: 0 },
  },
  exceptionTaxonomy: [
    { code: 'amount_mismatch', label: { fr: 'Écart de montant', en: 'Amount mismatch' } },
    { code: 'price_mismatch', label: { fr: 'Écart de prix unitaire', en: 'Unit price mismatch' } },
    { code: 'qty_mismatch', label: { fr: 'Écart de quantité', en: 'Quantity mismatch' } },
    { code: 'date_mismatch', label: { fr: 'Écart de date (séparation des exercices)', en: 'Date/cut-off mismatch' } },
    { code: 'counterparty_mismatch', label: { fr: 'Écart de tiers', en: 'Counterparty mismatch' } },
    { code: 'missing_document', label: { fr: 'Justificatif manquant', en: 'Missing document' } },
    { code: 'duplicate_document', label: { fr: 'Document en double', en: 'Duplicate document' } },
    { code: 'cutoff', label: { fr: 'Erreur de séparation des exercices', en: 'Cut-off error' } },
    { code: 'reconciliation_diff', label: { fr: 'Écart de rapprochement GL/Balance', en: 'TB/GL reconciliation difference' } },
    { code: 'verification_disagreement', label: { fr: 'Désaccord lors du contrôle de fiabilité', en: 'Verification spot-check disagreement' } },
    { code: 'quarantined_evidence', label: { fr: 'Pièce mise en quarantaine', en: 'Quarantined evidence' } },
    { code: 'manual_journal_flag', label: { fr: 'Écriture manuelle atypique (week-end / montant rond)', en: 'Atypical manual journal entry' } },
    { code: 'credit_note_pattern', label: { fr: 'Avoirs récurrents inexpliqués (même tiers)', en: 'Recurring unexplained credit notes' } },
  ],
  verification: { spotcheckPct: 0.1, spotcheckMin: 3, seedDefault: 'otto-demo-verif-1' },
  docRules: {
    assemblyDays: 60,
    retentionYears: 10,
    basisNote:
      'Conservation 10 ans, même après cessation des fonctions (C. com., anc. art. R.823-10); assemblage du dossier ~60 jours (pratique ISA 230).',
  },
  extractionConfidenceThreshold: 0.9,
  wp: {
    objective: 'Objectif du contrôle',
    scope: 'Périmètre et population',
    method: 'Méthode et sélection',
    sampleTable: 'Tableau des éléments testés',
    exceptions: 'Anomalies relevées et suites données',
    evaluation: 'Évaluation des anomalies (projection et comparaison au seuil)',
    verification: 'Contrôle de fiabilité (re-exécution sur éléments conformes)',
    conclusion: 'Conclusion',
    signoffs: 'Visas',
    modifications: 'Modifications manuelles (justifiées)',
    performedBy: 'Travaux exécutés par OTTO — run moteur',
    validatedBy: 'Validé par',
  },
};
