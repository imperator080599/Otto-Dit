import fs from 'node:fs';
import path from 'node:path';

// LA GARDE DE RÉGRESSION SUR LE MARQUEUR « PRÉPARÉ PAR L'IA » (R59/ADR-103, mandat du
// fondateur du 2026-09-13, option b).
//
// `src/app/ia-flag.tsx` (le composant `IaFlag`) est désormais la SEULE façon de marquer un
// contenu préparé par l'IA : il pose `data-ia-prepare="true"` en même temps que la classe
// visuelle `.ai-flag`. Ce script balaye `src/` (comme `ia-vivante.ts`, règle 21 : engendré, pas
// rédigé à la main) et refuse tout usage de la classe `ai-flag` ÉCRIT EN DUR (`className=`, un
// littéral `'ai-flag'`/`"ai-flag"`) EN DEHORS de `ia-flag.tsx` lui-même — un écran qui reviendrait
// à l'ancienne forme (l'apparence sans la propriété testable) serait invisible à l'œil (même
// pastille violette) mais absent du DOM sous `data-ia-prepare`, exactement le défaut que R59
// corrige.
//
// CE QUE CE SCRIPT NE PROUVE PAS (règle 19) : il ne prouve PAS que tout contenu réellement
// préparé par l'IA porte le marqueur — ça, aucun balayage de source ne peut le dire sans
// connaître le sens métier de chaque champ (voir l'en-tête de `ia-flag.tsx`). Il prouve
// seulement qu'AUCUN écran ne peut afficher la même apparence SANS la propriété — la classe et
// l'attribut ne peuvent plus se séparer. Les sites CONNUS aujourd'hui (IPE rédigée, cellule non
// vérifiée, écart de walkthrough candidat, sévérité de déficience proposée) sont couverts par
// `scripts/clics/scenario.ts`, qui lit `[data-ia-prepare]` sur du DOM RENDU avec des données
// RÉELLEMENT préparées par l'IA (monde de démonstration) — cette garde-ci ne remplace pas
// celle-là, elle l'empêche de devenir un mensonge silencieux plus tard.

const APP = path.join(import.meta.dirname, '..', '..');
const EXEMPTE = path.join(APP, 'src', 'app', 'ia-flag.tsx');

function tousLesTsx(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tousLesTsx(p, acc);
    else if (/\.tsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

export interface SiteBrut { fichier: string; ligne: number; extrait: string; }

/** Cherche `className="ai-flag"`, `className={\`...ai-flag...\`}` ou un littéral `'ai-flag'` /
 *  `"ai-flag"` isolé — jamais un simple `.ai-flag` dans un commentaire ou une prose (règle 19 :
 *  aucun neutralisateur de commentaire ici, contrairement à `ia-vivante.ts` — un futur faux
 *  positif dans un commentaire citant `className="ai-flag"` à titre d'exemple resterait possible
 *  et n'a jamais été observé). */
export function auditer(): SiteBrut[] {
  const sites: SiteBrut[] = [];
  for (const f of tousLesTsx(path.join(APP, 'src'))) {
    if (path.resolve(f) === path.resolve(EXEMPTE)) continue;
    const lignes = fs.readFileSync(f, 'utf8').split('\n');
    lignes.forEach((l, i) => {
      if (/className\s*=\s*["'`][^"'`]*\bai-flag\b/.test(l) || /^\s*['"]ai-flag['"]\s*,?\s*$/.test(l)) {
        sites.push({ fichier: path.relative(APP, f), ligne: i + 1, extrait: l.trim() });
      }
    });
  }
  return sites;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sites = auditer();
  if (sites.length) {
    console.error(`${sites.length} usage(s) BRUT(S) de la classe ai-flag hors du composant IaFlag :`);
    for (const s of sites) console.error(`  ${s.fichier}:${s.ligne} — ${s.extrait}`);
    process.exit(1);
  }
  console.log('aucun usage brut de la classe ai-flag hors de src/app/ia-flag.tsx — le marqueur data-ia-prepare est inséparable de l’apparence.');
}
