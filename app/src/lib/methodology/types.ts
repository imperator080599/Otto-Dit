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

export type Assertion =
  | 'realite' | 'exhaustivite' | 'mesure' | 'evaluation'
  | 'separation' | 'droits' | 'presentation';

/** Le SENS du test — la donnée qui manquait le plus au programme de travail. */
export type SensDeTest =
  | 'gl_vers_piece'   // du grand livre vers la pièce : réalité
  | 'piece_vers_gl'   // de la pièce vers le grand livre : exhaustivité
  | 'recalcul' | 'confirmation' | 'observation' | 'analytique' | 'inspection';

export type TypeChamp = 'montant' | 'date' | 'texte' | 'nombre' | 'bool';
export type NiveauRisque = 'faible' | 'moyen' | 'eleve';

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

export interface Catalogue {
  version: string;
  sensDeTest: Record<SensDeTest, { libelle: string; d: string }>;
  procedures: Procedure[];
  sources: Record<string, Source>;
}
