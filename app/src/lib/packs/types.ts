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
  /** Appendix headings. Chrome is content too: an English workpaper may not carry French
   *  appendix titles (ADR-023). */
  appendices: {
    parameters: string;
    evidence: string;
    modifications: string;
    reviewNotes: string;
    signoffs: string;
  };
}

/**
 * LE VOCABULAIRE DU PACK (DA-15, R-11).
 *
 * Le Code de commerce dit « seuil de signification » ; les cabinets disent
 * « matérialité ». Les deux ont raison dans leur registre, et le produit n'a
 * pas à trancher pour tout le monde : le MOT est une donnée du référentiel,
 * comme les seuils et les taxonomies. Le code, lui, ne change pas.
 *
 * La règle n'est donc pas « le mot est libre » : c'est « le mot vient du pack,
 * et un écran ne mélange jamais deux mots pour un concept ».
 */
export interface Vocabulaire {
  /** Le seuil au-delà duquel une anomalie compte. */
  materialite: string;
  /** Le choix des postes des comptes qui seront travaillés. */
  scoping: string;
  /** Un poste des états financiers (FSLI). */
  poste: string;
  postes: string;
  /** Ce qui reste à lever avant de signer. */
  obstacles: string;
}

/* §1 de l'annexe sourcée (docs/MANDATS/2026-09-10_annexe_echantillonnage.md) : « la fréquence
 * n'indexe pas la table — la fréquence produit la POPULATION, et c'est la population qui indexe
 * la table. » Ces trois types portent le vocabulaire EXACT de la source (HUD Handbook 2000.04
 * REV-2 CHG-10, Appendix A) — aucune valeur, aucune bande, aucune combinaison ajoutée qui n'y
 * figure (annexe §5). */
export type NiveauConfianceOe = '90' | '95';
export type TauxTolerableOe = '5' | '10';
export type ImportanceAttribut = 'faible' | 'elevee';

/** Annexe §2.2 (populations ≤ 200) : un minimum SOURCÉ, public — PAS un paramètre de cabinet,
 *  contrairement au reste de cette table. `valeur: null` pour la bande la plus basse : la source
 *  ne publie qu'un texte (« fewer than 5 »), jamais un nombre exact — l'inventer serait la faute
 *  que l'annexe §5 interdit. Bornes inclusives des deux côtés. */
export interface MinimumPopulationFaible {
  min: number;
  max: number;
  valeur: number | null;
  /** le texte exact de la source, affiché tel quel — « minimum suggéré, jamais un verdict » (§2.2) */
  texte: string;
}

/** Annexe §2.1 (populations > 200) : les QUATRE lignes publiées, verbatim — aucune autre
 *  combinaison confiance × taux × importance n'existe dans la source. Une combinaison absente
 *  d'ici reste non vérifiée, jamais devinée par interpolation. */
export interface LigneGrilleAttribut {
  importance: ImportanceAttribut;
  niveauConfiance: NiveauConfianceOe;
  tauxTolerable: TauxTolerableOe;
  valeur: number;
}

export interface TableEchantillonnageAttribut {
  sourceText: string;
  minimaPopulationsFaibles: MinimumPopulationFaible[];
  grillePopulationsElevees: LigneGrilleAttribut[];
}

export interface AssurancePack {
  id: string;
  name: string;
  language: Lang;
  vocabulaire: Vocabulaire;
  materiality: MaterialityConfig;
  substantive?: SubstantiveConfig;
  /**
   * Les DRAPEAUX du pack : ce qu'une famille d'obstacles au visa fait quand
   * elle se déclenche. Une famille neuve naît en AVERTISSEMENT (drapeau à
   * false) : un dossier de démonstration insignable détruit le seul fichier
   * que le fondateur ouvrira (mandat du jour, règle permanente 2).
   */
  flags?: {
    /** `unsupported_sample_items` : des lignes de l'échantillon non conclues bloquent-elles le visa ? */
    unsupportedSampleItemsBlocking?: boolean;
  };
  /* CTRL-07 (mandat contrôle interne §3.2, redessiné par l'annexe sourcée du 10 septembre) :
     `attributeSamplingTable` est un contenu SOURCÉ, public, non confidentiel (HUD Handbook, pas
     la méthode d'un cabinet) — elle se livre PLEINE (contrairement à l'ancien
     `attributeSampleSizes`, indexé par fréquence, retiré, qui se livrait vide). Ce qui reste un
     jugement de cabinet, `verifie:false` par défaut (`undefined` = non posé, même forme que
     `videoRetentionDays` juste en dessous) : LEQUEL des quatre couples de la grille §2.1
     s'applique — `attributeSampleConfidenceLevel`/`attributeSampleTolerableRate` (annexe §4,
     point 1, choisis ensemble) et `attributeImportance` (point 2, « un jugement d'auditeur, pas
     un calcul »). Les minima ≤ 200 (§2.2) ne demandent AUCUN de ces trois jugements — ils sont
     déjà vérifiés dès que la population est connue. */
  attributeSamplingTable?: TableEchantillonnageAttribut;
  attributeSampleConfidenceLevel?: NiveauConfianceOe;
  attributeSampleTolerableRate?: TauxTolerableOe;
  attributeImportance?: ImportanceAttribut;
  attributeSampleBasis?: string;
  attributeSeedDefault?: string;
  /* VID-01 (mandat du 9 septembre, §3.2) : « X est un paramètre de pack, verifie:false, affiché
     "à fixer par le cabinet". Aucune durée n'est inventée. » Même forme que `attributeSampleSizes`
     juste au-dessus (CTRL-07) : `undefined` EST la forme de « non vérifié » — jamais un nombre de
     jours choisi de mémoire. `pcaob-sox.ts` la livre non posée sciemment. */
  videoRetentionDays?: number;
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
