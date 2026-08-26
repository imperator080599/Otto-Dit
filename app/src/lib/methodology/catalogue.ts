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

import path from 'node:path';
import url from 'node:url';
import type { Catalogue, Procedure, Source, SensDeTest } from './types';

type Valideur = {
  chargerCatalogue: (racine?: string) => Catalogue;
  validerCatalogue: (cat: unknown, src: unknown, schema: unknown) => string[];
  racineDepot: () => string;
};

/** Racine du dépôt, déduite de l'emplacement de ce fichier. */
export function racineDepot(): string {
  const ici = path.dirname(url.fileURLToPath(import.meta.url));
  return path.resolve(ici, '..', '..', '..', '..');
}

let _cache: Catalogue | null = null;

/** Charge (une fois) le catalogue validé. Lève si les données sont invalides. */
export async function chargerCatalogue(racine = racineDepot()): Promise<Catalogue> {
  if (_cache) return _cache;
  const chemin = url.pathToFileURL(path.join(racine, 'methodology', 'valider.mjs')).href;
  const m = (await import(/* @vite-ignore */ chemin)) as Valideur;
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

const RANG: Record<string, number> = { faible: 0, moyen: 1, eleve: 2 };

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
    (p) => RANG[niveauParAssertion(p.assertion)] >= RANG[p.risque_minimum],
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

export type { Catalogue, Procedure, Source } from './types';
