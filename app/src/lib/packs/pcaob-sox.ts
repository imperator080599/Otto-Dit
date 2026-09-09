import type { AssurancePack } from './types';
import { basisNote } from '@/lib/kernel/retention';

// PCAOB AS / SOX 404(b) + COSO 2013 pack — English ICFR content.
//
// CTRL-07 (mandat contrôle interne, 2026-09-08, §3.2) : `attributeSampleSizes` était rempli de
// tailles « common practice derived from AICPA Audit Sampling guidance » — exactement ce que le
// mandat interdit : « aucune valeur n'y est écrite de mémoire, ni recopiée d'une méthodologie
// propriétaire, quelle qu'elle soit — la table interne d'un cabinet est confidentielle et
// n'appartient pas à ce produit. » Livré VIDE : aucune fréquence n'a de taille vérifiée tant que
// le cabinet ne l'a pas fournie ; `drawAttributeSample` (sox.ts) refuse (CTRL-07) sauf saisie
// explicite avec justification écrite (ADR-010, chemin déjà existant, inchangé).

export const pcaobSox: AssurancePack = {
  id: 'pcaob-sox',
  name: 'PCAOB AS / SOX 404 + COSO 2013 (ICFR)',
  language: 'en',
  vocabulaire: {
    materialite: 'Matérialité',
    scoping: 'Scoping',
    poste: 'Poste',
    postes: 'Postes',
    obstacles: 'Ce qui empêche de signer',
  },
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
  attributeSampleSizes: {},
  attributeSeedDefault: 'otto-demo-sox-1',
  attributeSampleBasis:
    'Firm sampling table (CTRL-07) — shipped empty. No size is verified until the firm supplies its own table; every draw today runs on an explicit, justified override (ADR-010).',
  // VID-01 (mandat du 9 septembre, §3.2) : `videoRetentionDays` reste NON POSÉ — aucune durée de
  // conservation n'est écrite de mémoire. Le compteur (sox.ts, compteurConservationVideo) l'affiche
  // « à fixer par le cabinet » tant que le champ est absent.
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
    ruleSet: 'pcaob-as1215',
    basisNote: basisNote('pcaob-as1215', 'en'),
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
    appendices: {
      parameters: 'Appendix A — Parameters and provenance (self-contained)',
      evidence: 'Appendix B — Evidence cited (sha256)',
      modifications: 'Appendix C — Manual modifications (visible flag)',
      reviewNotes: 'Appendix D — Review notes',
      signoffs: 'Appendix E — Sign-offs (dates, immutable)',
    },
  },
};
