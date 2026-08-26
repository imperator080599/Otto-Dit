// Chargement du catalogue méthodologique dans l'application.
//
// Le catalogue vit dans methodology/, à la racine du dépôt, PAS dans app/ :
// c'est de la méthode, pas du code applicatif, et le prototype le consomme
// aussi. Il est lu depuis le disque et validé par methodology/valider.mjs —
// le même validateur que celui du générateur du prototype. Une seule
// implémentation, une seule source, deux consommateurs.
//
// Module SERVEUR : il lit le disque. Les composants client passent par une
// route ou un composant serveur.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import type {
  Catalogue, Procedure, Source, SensDeTest, QuestionResiduelle, NatureRi,
  ParametreIndependance, GabaritPapier, ColonneGabarit,
} from './types';

type Valideur = {
  chargerCatalogue: (racine?: string) => Catalogue;
  validerCatalogue: (cat: unknown, src: unknown, schema: unknown) => string[];
  validerQuestionnaire: (q: unknown, src: unknown, schema: unknown) => string[];
  validerIndependance: (i: unknown, src: unknown, schema: unknown) => string[];
  validerRisque: (r: unknown, src: unknown, schema: unknown) => string[];
  racineDepot: () => string;
};

/**
 * Racine du dépôt — celle qui contient `methodology/valider.mjs`.
 *
 * Elle était déduite de `import.meta.url` seul. En développement, Next conserve
 * les chemins source et cela tombait juste ; dans un bundle de production, non.
 * On cherche donc le dossier, et on ÉCHOUE EN LE DISANT si on ne le trouve pas
 * — plutôt que de rendre un chemin plausible dont le seul symptôme serait un
 * MODULE_NOT_FOUND illisible à l'exécution.
 */
export function racineDepot(): string {
  const candidats = [
    path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..', '..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
  ];
  for (const c of candidats) {
    if (fs.existsSync(path.join(c, 'methodology', 'valider.mjs'))) return c;
  }
  throw new Error(
    'methodology/valider.mjs introuvable — cherché depuis : ' + candidats.join(' | ')
    + '. La méthode est du contenu du dépôt : le processus doit tourner avec le dépôt sur disque.',
  );
}

/**
 * Charge le validateur, qui vit HORS du bundle de l'application.
 *
 * `await import(chemin)` était réécrit par le bundler de Next et échouait à
 * l'exécution avec « Cannot find module 'file:///…/valider.mjs' » — alors que
 * la suite de tests, qui tourne en ESM Node nu, passait. Les écrans qui
 * chargent une méthode rendaient donc 500 pendant que les tests étaient verts.
 *
 * `new Function` rend l'import opaque à l'analyse statique : c'est un import
 * ESM réel, à l'exécution, du fichier qui est sur le disque. C'est la seule
 * façon de garder UN validateur pour le dépôt et pour l'application.
 */
export async function importerValideur<T>(racine = racineDepot()): Promise<T> {
  const chemin = url.pathToFileURL(path.join(racine, 'methodology', 'valider.mjs')).href;
  /* DEUX CHEMINS, PARCE QU'IL Y A DEUX EXÉCUTIONS, et qu'aucun des deux ne
     marche dans l'autre.
       · Next (webpack) réécrit `import(variable)` et échoue à l'exécution.
         `new Function` le rend opaque à l'analyse statique.
       · Vitest exécute dans un contexte vm sans « dynamic import callback » :
         `new Function` y lève une TypeError, et c'est l'import transformé par
         Vite qui fonctionne.
     On tente donc le premier et on retombe sur le second. `racineDepot()` a
     déjà vérifié que le fichier existe : ce qu'on rattrape ici est
     l'indisponibilité du MÉCANISME, pas un fichier manquant — un vrai
     MODULE_NOT_FOUND ressortirait du second appel, non avalé. */
  try {
    const opaque = new Function('u', 'return import(u)') as (u: string) => Promise<T>;
    return await opaque(chemin);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return (await import(/* @vite-ignore */ chemin)) as T;
  }
}

let _cache: Catalogue | null = null;

/**
 * Charge le catalogue DU DÉPÔT — la méthode livrée avec le produit.
 *
 * ⚠ AUCUN SERVICE NE DOIT L'APPELER. Un service qui lit cette méthode-ci fait
 * tourner le dossier d'un cabinet sur la méthode de l'ÉDITEUR, et rien à
 * l'écran ne le dit. La méthode d'une mission se charge par
 * `depot.catalogueDeLaMission(engagementId)`, qui refuse plutôt que de replier.
 *
 * Ce qui reste légitime ici : les tests qui exercent des fonctions pures sur un
 * catalogue quelconque, et le peuplement — qui PUBLIE ce contenu pour le
 * cabinet de démonstration au lieu de le lire à chaque requête.
 *
 * Lève si les données sont invalides.
 */
export async function chargerCatalogue(racine = racineDepot()): Promise<Catalogue> {
  if (_cache) return _cache;
  const m = await importerValideur<Valideur>(racine);
  _cache = m.chargerCatalogue(racine);
  return _cache;
}

/** Vide le cache — utile aux tests qui chargent depuis une autre racine. */
export function oublierCatalogue(): void { _cache = null; }

/* ── accès ────────────────────────────────────────────────────────────────
   Les accesseurs ne filtrent JAMAIS sur autre chose que ce que la donnée
   déclare : le niveau de risque exigé, le cycle, le poste. La décision
   « cette procédure est-elle requise ici » appartient au moteur de risque,
   pas au catalogue.                                                        */

/* ── le gabarit du papier de travail ──────────────────────────────────────
   Le format d'un papier n'est ni un nom ni un calcul : c'est de la
   présentation, donc la signature du cabinet. Les accesseurs ci-dessous
   n'appliquent AUCUN défaut de secours : un gabarit incomplet a été refusé au
   chargement, et retomber sur une valeur du produit ici masquerait ce que le
   validateur vient d'interdire (ADR-079).                                   */

/** Le gabarit d'une nature de papier. */
export function gabarit(cat: Catalogue, nature: string): GabaritPapier {
  const g = cat.papier.papiers[nature];
  if (!g) {
    throw new Error(
      `gabarit « ${nature} » absent de la méthode du cabinet `
      + `(présents : ${Object.keys(cat.papier.papiers).join(', ')})`,
    );
  }
  return g;
}

/** Les intitulés d'un tableau, dans l'ordre du cabinet. */
export function colonnes(cat: Catalogue, nature: string, tableau: string): ColonneGabarit[] {
  const t = gabarit(cat, nature).tableaux[tableau];
  if (!t) throw new Error(`tableau « ${tableau} » absent du gabarit « ${nature} »`);
  return t.colonnes;
}

/**
 * La référence d'un papier dans le plan de classement DU CABINET.
 *
 * C'est ce dont un réviseur se sert pour savoir où les travaux ont été faits.
 * Une variable inconnue laisserait un trou : le validateur les a énumérées au
 * chargement, donc ici toute variable non résolue est un défaut du moteur, pas
 * de la méthode — et elle lève plutôt que de laisser un trou.
 */
export function referencePapier(
  cat: Catalogue,
  v: { poste: string; sequence: number; code: string; version: number },
): string {
  const r = cat.papier.referencement;
  const lettre = r.lettres_par_poste[v.poste] ?? r.lettres_par_poste._defaut;
  const valeurs: Record<string, string> = {
    lettre,
    sequence: String(v.sequence).padStart(r.sequence_chiffres, '0'),
    code: v.code,
    version: String(v.version),
  };
  return r.modele.replace(/\{(\w+)\}/g, (_m, nom: string) => {
    const val = valeurs[nom];
    if (val === undefined) throw new Error(`référence : variable « ${nom} » non résolue par le moteur`);
    return val;
  });
}

/** Les critères d'acceptation posés pour une PORTÉE donnée. */
export function criteres(cat: Catalogue, portee: 'acceptation' | 'maintien') {
  return cat.acceptation.criteres.filter((c) => c.portees.includes(portee));
}

/** Le libellé d'une assertion, depuis le jeu du cabinet. */
export function libAssertion(cat: Catalogue, code: string): string {
  return cat.assertions.liste.find((a) => a.code === code)?.libelle ?? code;
}

/**
 * Le rang d'un niveau dans l'échelle DU CABINET.
 *
 * Il y avait ici une table `{ faible:0, moyen:1, eleve:2 }` écrite en dur —
 * un doublon de la même logique dans `services/risk.ts`, et le seul endroit du
 * dépôt qui empêchait un cabinet de travailler à quatre niveaux. Elle est
 * remplacée par une lecture de l'échelle chargée.
 */
export function rangNiveau(cat: Catalogue, niveau: string): number {
  const i = cat.risque.niveaux.indexOf(niveau);
  if (i < 0) throw new Error(`niveau « ${niveau} » absent de l’échelle du cabinet (${cat.risque.niveaux.join(', ')})`);
  return i;
}

/** Procédures d'un cycle : celles du cycle et les transverses (« * »). */
export function proceduresDuCycle(cat: Catalogue, cycle: string): Procedure[] {
  return cat.procedures.filter(
    (p) => (p.cycle === '*' || p.cycle === cycle) && (!p.postes || p.postes.includes(cycle)),
  );
}

/** Procédures exigibles au niveau de risque atteint sur l'assertion. */
export function proceduresRequises(
  cat: Catalogue,
  cycle: string,
  niveauParAssertion: (a: Procedure['assertion']) => Procedure['risque_minimum'],
): Procedure[] {
  return proceduresDuCycle(cat, cycle).filter(
    (p) => rangNiveau(cat, niveauParAssertion(p.assertion)) >= rangNiveau(cat, p.risque_minimum),
  );
}

export function procedure(cat: Catalogue, code: string): Procedure | undefined {
  return cat.procedures.find((p) => p.code === code);
}

/** Justificatifs attendus : ceux du cycle s'ils existent, sinon les généraux. */
export function justificatifs(p: Procedure, cycle: string) {
  return (p.justificatifs_par_cycle && p.justificatifs_par_cycle[cycle]) || p.justificatifs;
}

/** Une procédure cataloguée sans population calculable n'est pas exécutable. */
export function executable(p: Procedure): boolean {
  return !!p.population.predicat && p.population.predicat !== 'non_implemente';
}

/** Aucun tirage : l'étendue se règle par le seuil de remontée. */
export function selectionExhaustive(p: Procedure): boolean {
  return p.selection === 'exhaustive_au_seuil';
}

export function sens(cat: Catalogue, code: SensDeTest) {
  return cat.sensDeTest[code];
}

/** Sources d'une procédure, dans l'ordre où elle les cite. */
export function sources(cat: Catalogue, p: Procedure): Array<{ code: string; source: Source }> {
  return p.sources.map((code) => ({ code, source: cat.sources[code] })).filter((x) => !!x.source);
}

/**
 * Références NON vérifiées portées par une procédure.
 * Tant qu'un texte primaire n'a pas été atteint, la référence est marquée
 * UNVERIFIED — dans la donnée, dans l'application et à l'écran. Une méthode
 * ne se cite pas depuis une source secondaire.
 */
export function referencesNonVerifiees(cat: Catalogue, p: Procedure): string[] {
  return sources(cat, p).filter((x) => !x.source.verifie).map((x) => x.code);
}

/* ── questionnaire résiduel de risque ─────────────────────────────────────
   Il vit dans le même dossier de méthode, pour la même raison : les questions,
   la nature de risque qu'elles portent et la raison de leur survivance se
   relisent et se versionnent, elles ne se codent pas.                       */

/** Questions d'une portée donnée. */
export function questions(cat: Catalogue, portee: QuestionResiduelle['portee']): QuestionResiduelle[] {
  return cat.questionnaire.questions.filter((q) => q.portee === portee);
}

/** La nature de risque inhérent d'une question, depuis le registre. */
export function natureRi(cat: Catalogue, q: QuestionResiduelle): NatureRi | undefined {
  return cat.questionnaire.naturesRi[q.nature];
}

/**
 * Questions dont la raison d'exister est datée : elles DOIVENT disparaître
 * quand la condition écrite se réalise. Les lister est le seul moyen qu'un
 * questionnaire résiduel ne devienne pas un questionnaire de confort.
 */
export function questionsADurerLimitee(cat: Catalogue): QuestionResiduelle[] {
  return cat.questionnaire.questions.filter((q) => !!q.disparait_quand);
}

/** Références non vérifiées portées par une question. Même règle que plus haut. */
export function referencesNonVerifieesQuestion(cat: Catalogue, q: QuestionResiduelle): string[] {
  return q.sources.filter((code) => cat.sources[code] && !cat.sources[code].verifie);
}

/* ── indépendance : rubriques et seuils, contenu de cabinet ───────────────
   Un seuil affiché à l'écran doit savoir dire d'où il vient. Ces deux
   accesseurs sont là pour que l'écran n'ait pas à le deviner.              */

export function parametreIndependance(cat: Catalogue, code: string): ParametreIndependance | undefined {
  return cat.independance.parametres[code];
}

/** Vrai tant que le texte primaire du seuil n'a pas été atteint. */
export function parametreNonVerifie(cat: Catalogue, code: string): boolean {
  const p = cat.independance.parametres[code];
  return !!p && p.sources.some((s) => !cat.sources[s]?.verifie);
}

export type {
  Catalogue, Procedure, Source, QuestionResiduelle, NatureRi,
  Independance, RubriqueIndependance, ParametreIndependance,
  Risque, FacteurObserve, JeuAssertions, AssertionDef,
  Papier, GabaritPapier, SectionGabarit, ColonneGabarit,
  Acceptation, CritereAcceptation, JalonMethode, PorteeAcceptation,
} from './types';
