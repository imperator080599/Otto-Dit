import fs from 'node:fs';
import path from 'node:path';

// UN FAIT STOCKÉ QUE PLUS AUCUN ÉCRAN NE REND N'EXISTE PAS (règle 13).
//
// PREMIÈRE VERSION, ET POURQUOI ELLE ÉTAIT VIDE. Elle comparait les écrans à
// `origin/main`. Le jour où le commit atteint `main`, la référence ÉGALE HEAD :
// le diff est vide, le garde dit « rien à vérifier » et sort 0. Le « lectures 0 »
// de la chaîne était un zéro VACANT, et il l'était en permanence. Pire : une
// lecture perdue puis poussée devenait invisible au passage suivant — la
// référence avait avancé avec le défaut.
//
// LA RÈGLE EST DONC UN INSTANTANÉ FIGÉ, pas un diff. `docs/LECTURES.json`
// enregistre, pour chaque écran, chaque CHEMIN DE CHAMP rendu et COMBIEN DE
// FOIS. Le garde recompte et refuse toute baisse. Mettre l'instantané à jour
// est un geste EXPLICITE (`npm run lectures:figer`), donc relu.
//
// POURQUOI DES COMPTES ET NON UNE PRÉSENCE. `.retentionUntil` apparaissait deux
// fois : une fois pour l'AFFICHER, une fois dans un prédicat `some()` qui
// n'affiche rien. Supprimer l'affichage laissait le champ dans le fichier, et
// un garde « le champ est-il encore là ? » n'y voyait rien.
//
// POURQUOI LE CHEMIN DE CHAMP ET NON L'EXPRESSION. Renommer `t` en `x` dans un
// `map` n'est pas perdre une lecture, et un détecteur qui crie faux se fait
// taire — c'est le défaut qu'on traque, pas un travers acceptable.

/** Toutes les manières d'atteindre un champ, y compris celles qu'on oublie. */
const CHAMPS = [
  /\.([A-Za-z_][A-Za-z0-9_]*)/g,        // obj.champ, obj?.champ (le « ? » précède le point)
  /\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,  // obj['champ']
];

/* CE QUI N'EST PAS UNE LECTURE DE DONNÉE : les méthodes, les modules, les
   attributs de style. Sans cette liste l'instantané pèserait des milliers
   d'entrées de bruit et personne ne le relirait — un instantané qu'on ne relit
   pas ne protège rien. */
const BRUIT = new Set([
  'map', 'filter', 'find', 'some', 'every', 'reduce', 'slice', 'split', 'join', 'push',
  'length', 'toFixed', 'toUpperCase', 'toLowerCase', 'replace', 'includes', 'startsWith',
  'endsWith', 'trim', 'sort', 'flat', 'flatMap', 'keys', 'values', 'entries', 'from',
  'test', 'match', 'concat', 'indexOf', 'padStart', 'padEnd', 'toString', 'json', 'text',
  'catch', 'then', 'log', 'warn', 'error', 'env', 'now', 'random', 'round', 'max', 'min',
  'abs', 'floor', 'ceil', 'sign', 'currentTarget', 'target', 'preventDefault', 'stopPropagation',
  'current', 'first', 'get', 'set', 'has', 'add', 'delete', 'size', 'default', 'tsx', 'ts',
]);

export function champsRendus(code: string): Map<string, number> {
  /* Les commentaires ne rendent rien, et les imports non plus. */
  const nu = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];$/gm, ' ')
    /* UNE CLÉ DU CATALOGUE N'EST PAS UNE LECTURE DE DONNÉE. `t('proc.conserva-
       tionJusquAu')` contient un point : l'instantané y voyait un champ nommé
       `conservationJusquAu`, et renommer une clé faisait crier le garde comme
       si un écran avait cessé d'afficher une donnée — c'est arrivé dans cette
       tranche même. On efface la CLÉ (le premier argument), jamais les
       variables qui suivent : celles-là sont de vraies lectures. */
    .replace(/\b(t\w*|traduire)\(\s*(?:[^,()]+,\s*)?(['"])[\w.]+\2/g, '$1( ');
  const out = new Map<string, number>();
  for (const re of CHAMPS) {
    for (const m of nu.matchAll(re)) {
      const champ = m[1];
      if (BRUIT.has(champ)) continue;
      out.set(champ, (out.get(champ) ?? 0) + 1);
    }
  }
  return out;
}

export function ecrans(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ecrans(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

export type Instantane = Record<string, Record<string, number>>;

export function instantane(app: string): Instantane {
  const out: Instantane = {};
  for (const f of ecrans(app)) {
    const champs = champsRendus(fs.readFileSync(f, 'utf8'));
    if (champs.size === 0) continue;
    out[path.relative(app, f).split(path.sep).join('/')] =
      Object.fromEntries([...champs.entries()].sort());
  }
  return out;
}

export interface Perte { fichier: string; champ: string; avant: number; apres: number }

/** Ce qui a BAISSÉ depuis l'instantané — un écran disparu compte pour zéro. */
export function pertes(fige: Instantane, courant: Instantane): Perte[] {
  const out: Perte[] = [];
  for (const [fichier, champs] of Object.entries(fige)) {
    const maintenant = courant[fichier] ?? {};
    for (const [champ, avant] of Object.entries(champs)) {
      const apres = maintenant[champ] ?? 0;
      if (apres < avant) out.push({ fichier, champ, avant, apres });
    }
  }
  return out;
}
