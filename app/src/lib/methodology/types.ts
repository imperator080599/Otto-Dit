// Types du catalogue méthodologique (methodology/*.json).
//
// Le catalogue est de la DONNÉE versionnée, pas du code : ces types en décrivent
// la forme, ils ne la définissent pas. La forme fait foi dans
// methodology/schema.json, et methodology/valider.mjs la fait respecter — au
// chargement de l'application comme à la construction du prototype.
//
// Frontière (ADR-050) : le catalogue NOMME une population (`predicat`) et une
// référence de contrôle (`reference`) ; le code SAIT les calculer. Un catalogue
// ne contient jamais d'expression exécutable.

/**
 * Une assertion est une CHAÎNE, pas une union figée.
 *
 * Le jeu d'assertions est un découpage de MÉTHODE : certains cabinets séparent
 * « présentation » et « informations à fournir », d'autres suivent le découpage
 * PCAOB. Il vit dans `methodology/assertions.json`, et procédures, questions et
 * facteurs y sont tous comparés au chargement — plus strict qu'une union, parce
 * que cela attrape en plus une divergence entre fichiers.
 */
export type Assertion = string;

/** Une assertion du jeu du cabinet. */
export interface AssertionDef {
  code: string;
  libelle: string;
  /** Ce qu'elle affirme, en toutes lettres : sans quoi elle ne se conteste pas en revue. */
  definition: string;
  sens_naturel?: string;
}

export interface JeuAssertions {
  version: string;
  liste: AssertionDef[];
}

/** Le SENS du test — la donnée qui manquait le plus au programme de travail. */
export type SensDeTest =
  | 'gl_vers_piece'   // du grand livre vers la pièce : réalité
  | 'piece_vers_gl'   // de la pièce vers le grand livre : exhaustivité
  | 'recalcul' | 'confirmation' | 'observation' | 'analytique' | 'inspection';

export type TypeChamp = 'montant' | 'date' | 'texte' | 'nombre' | 'bool';
/**
 * Un niveau de risque est une CHAÎNE, pas une union figée.
 *
 * Les niveaux appartiennent au cabinet : ils vivent dans
 * `methodology/risque.json` → `echelle.niveaux`, ils peuvent être deux, trois
 * ou quatre, et s'appeler « limité / normal / accru ». Les figer ici en union
 * TypeScript signifierait « votre méthode reste la vôtre, à condition qu'elle
 * ressemble à la nôtre » — et un auditeur le teste en trente secondes.
 *
 * Ce qui les valide n'est donc pas le type mais le validateur, qui compare
 * chaque `risque_minimum` à l'échelle du cabinet : plus strict qu'une
 * énumération, parce qu'il attrape en plus une divergence entre les fichiers.
 */
export type NiveauRisque = string;

/** « exhaustive_au_seuil » : aucun tirage, l'étendue se règle par le seuil. */
export type ModeSelection = 'sondage' | 'exhaustive_au_seuil';

export interface ChampJustificatif {
  code: string;
  libelle: string;
  type: TypeChamp;
  /** Ce à quoi la valeur relevée se compare, en toutes lettres. */
  controle_contre: string;
  /** Nom du résolveur qui sait calculer la référence. */
  reference: string;
  regle?: string;
  tolerance: string;
  /** Le champ se relève et ne se contrôle pas : il ne produit jamais d'écart. */
  releve_seul?: boolean;
}

export interface Justificatif {
  document: string;
  champs: ChampJustificatif[];
}

export interface Population {
  libelle: string;
  source: string;
  periode: string;
  filtre: string;
  /** Nom du prédicat implémenté côté code ; « non_implemente » = non exécutable. */
  predicat?: string;
  parametres?: Record<string, unknown>;
}

export interface Procedure {
  code: string;
  /** Code du poste, ou « * » pour une procédure transverse. */
  cycle: string;
  libelle: string;
  objectif: string;
  assertion: Assertion;
  sens: SensDeTest;
  unite: string;
  population: Population;
  justificatifs: Justificatif[];
  justificatifs_par_cycle?: Record<string, Justificatif[]>;
  controle: string;
  exceptions?: string[];
  sources: string[];
  risque_minimum: NiveauRisque;
  echantillonnee: boolean;
  selection?: ModeSelection;
  note?: string;
  si_facteur?: string;
  postes?: string[];
}

export interface Source {
  type: string;
  referentiel?: string;
  reference: string;
  objet: string;
  /** Faux tant que le TEXTE PRIMAIRE n'a pas été atteint. Jamais supposé. */
  verifie: boolean;
  raison_non_verifie?: string;
  corrobore_par?: string[];
  url?: string;
}

/** Nature de risque inhérent portée par une question résiduelle. */
export interface NatureRi {
  libelle: string;
  definition: string;
  sources: string[];
}

/**
 * Question du questionnaire RÉSIDUEL de risque : uniquement ce qu'aucune autre
 * source du dossier ne peut lever. `pourquoi` porte la raison pour laquelle la
 * question existe encore — si cette raison tombe, la question doit disparaître,
 * pas rester « au cas où ». `disparait_quand` nomme cette échéance quand elle
 * est connue.
 */
export interface QuestionResiduelle {
  code: string;
  /** entite : posée une fois. section : posée dans chaque section retenue. */
  portee: 'entite' | 'section';
  assertion: Assertion;
  /** Clé de natures_ri. */
  nature: string;
  question: string;
  pourquoi: string;
  effet: string;
  disparait_quand?: string;
  sources: string[];
}

export interface Questionnaire {
  version: string;
  naturesRi: Record<string, NatureRi>;
  questions: QuestionResiduelle[];
}

/** Une rubrique de la déclaration d'indépendance. Contenu de cabinet. */
export interface RubriqueIndependance {
  code: string;
  libelle: string;
  /** Ce que la rubrique couvre, en toutes lettres : sans quoi on répond « non » par défaut. */
  definition: string;
}

/**
 * Un seuil d'indépendance. C'est une règle juridique devenue constante : elle
 * NOMME sa source et ce qu'elle commande, et son état de vérification se lit
 * dans le registre des sources.
 */
export interface ParametreIndependance {
  valeur: number;
  libelle: string;
  unite: string;
  pourquoi: string;
  sources: string[];
}

export interface Independance {
  version: string;
  rubriques: RubriqueIndependance[];
  parametres: Record<string, ParametreIndependance>;
  naturesSacc: Record<string, string>;
}

/** Une règle de facteur observé. La méthode NOMME le prédicat ; le code le calcule. */
export interface FacteurObserve {
  code: string;
  assertion: Assertion;
  libelle: string;
  /** Ce que le facteur craint. Sans cela ce n'est pas un facteur, c'est une statistique. */
  pourquoi: string;
  predicat: string;
  parametres: Record<string, unknown>;
  sources: string[];
}

export interface Risque {
  version: string;
  facteurs: FacteurObserve[];
  /** Les niveaux du cabinet, du plus faible au plus élevé. */
  niveaux: string[];
  paliers: { facteurs_min: number; niveau: string }[];
  tailles: Record<string, number>;
  /** Prédicats que le schéma autorise — le code doit les implémenter tous. */
  predicats: string[];
}

export interface Catalogue {
  version: string;
  sensDeTest: Record<SensDeTest, { libelle: string; d: string }>;
  procedures: Procedure[];
  sources: Record<string, Source>;
  questionnaire: Questionnaire;
  independance: Independance;
  risque: Risque;
  assertions: JeuAssertions;
}
