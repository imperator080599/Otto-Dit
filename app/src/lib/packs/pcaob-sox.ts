import type { AssurancePack } from './types';
import { basisNote } from '@/lib/kernel/retention';

// PCAOB AS / SOX 404(b) + COSO 2013 pack — English ICFR content.
//
// CTRL-07 (mandat contrôle interne, 2026-09-08, §3.2 ; redessiné par l'annexe sourcée du
// 10 septembre, docs/MANDATS/2026-09-10_annexe_echantillonnage.md) : `attributeSampleSizes`
// (indexé par fréquence) était d'abord rempli de tailles « common practice derived from AICPA
// Audit Sampling guidance » — exactement ce que le mandat interdit : « aucune valeur n'y est
// écrite de mémoire, ni recopiée d'une méthodologie propriétaire ». Livré VIDE ensuite, puis
// RETIRÉ : la fréquence n'indexe pas la table — elle produit la POPULATION (déjà :
// FREQUENCES_DERIVABLES/occurrencesDeLaPeriode, sox.ts), et c'est la population qui indexe la
// table ci-dessous. Celle-ci EST sourcée (HUD Handbook 2000.04 REV-2 CHG-10, Appendix A — un
// guide d'audit fédéral américain publié, pas la méthode d'un cabinet) et se livre donc PLEINE.
// Ce qui reste un jugement de cabinet, non posé sciemment : `attributeSampleConfidenceLevel`,
// `attributeSampleTolerableRate`, `attributeImportance` — `drawAttributeSample` (sox.ts) refuse
// (CTRL-07) tout tirage sur une population > 200 sans eux, sauf saisie explicite avec
// justification écrite (ADR-010, chemin déjà existant, inchangé). Les populations ≤ 200 ne
// demandent aucun de ces trois jugements : leurs minima sont déjà vérifiés (§2.2 de l'annexe).

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
  attributeSamplingTable: {
    sourceText: 'HUD Handbook 2000.04 REV-2 CHG-10, Appendix A — "Attribute Sampling", U.S. '
      + 'Department of Housing and Urban Development, Office of Inspector General, mars–avril '
      + '2011 (docs/MANDATS/2026-09-10_annexe_echantillonnage.md §1-§2).',
    // §2.2 : cité mot pour mot. La borne haute de la première ligne (200, pas 199) suit le TITRE
    // de la section (« populations de 200 éléments ou moins ») plutôt que le paragraphe cité, qui
    // ne nomme explicitement que « between 100 and 199 items » — la source elle-même ne couvre
    // jamais 200 par un chiffre exact ; cette lecture évite un trou entre les deux sections (200
    // exactement n'appartiendrait alors ni à §2.1 ni à §2.2), documentée ici plutôt que devinée
    // en silence (règle 19). Aucune autre interpolation n'est faite.
    minimaPopulationsFaibles: [
      { min: 100, max: 200, valeur: 20, texte: '(1) 20 items when the population being tested contains between 100 and 199 items' },
      { min: 50, max: 99, valeur: 10, texte: '(2) 10 items when the population being tested contains between 50 and 99 items' },
      { min: 20, max: 49, valeur: 5, texte: '(3) 5 items when the population being tested contains between 20 and 49 items' },
      { min: 0, max: 19, valeur: null, texte: '(4) Fewer than 5 items for smaller populations' },
    ],
    // §2.1 : les quatre lignes publiées, verbatim. Aucune autre combinaison n'existe dans la
    // source (faible+95%, élevée+90%, etc. ne sont PAS publiées — une population dont le cabinet
    // choisirait une telle combinaison reste non vérifiée, jamais devinée par interpolation).
    grillePopulationsElevees: [
      { importance: 'faible', niveauConfiance: '90', tauxTolerable: '5', valeur: 50 },
      { importance: 'faible', niveauConfiance: '90', tauxTolerable: '10', valeur: 25 },
      { importance: 'elevee', niveauConfiance: '95', tauxTolerable: '5', valeur: 65 },
      { importance: 'elevee', niveauConfiance: '95', tauxTolerable: '10', valeur: 35 },
    ],
  },
  // attributeSampleConfidenceLevel / attributeSampleTolerableRate / attributeImportance : NON
  // POSÉS sciemment (annexe §4) — deux jugements de cabinet, verifie:false tant qu'ils ne le sont
  // pas. Seules les populations > 200 en ont besoin ; ADR-010 reste l'échappatoire écrite.
  attributeSeedDefault: 'otto-demo-sox-1',
  attributeSampleBasis:
    'Firm sampling table (CTRL-07) — population-band table sourced (HUD Handbook 2000.04, '
    + 'Appendix A); confidence level, tolerable rate and attribute importance remain unset firm '
    + 'judgments for populations above 200. Every draw without them runs on an explicit, '
    + 'justified override (ADR-010).',
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
