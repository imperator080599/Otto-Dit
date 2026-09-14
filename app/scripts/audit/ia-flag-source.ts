import fs from 'node:fs';
import path from 'node:path';

// LA GARDE DE RÉGRESSION SUR LE MARQUEUR « PRÉPARÉ PAR L'IA » (R59/ADR-103, mandat du
// fondateur du 2026-09-13, option b).
//
// `src/app/ia-flag.tsx` (le composant `IaFlag`) est désormais la SEULE façon de marquer un
// contenu préparé par l'IA : il pose `data-ia-prepare="true"` en même temps que la classe
// visuelle `.ai-flag`. Ce script balaye `src/` (comme `ia-vivante.ts`, règle 21 : engendré, pas
// rédigé à la main) et refuse tout usage de la classe `ai-flag` ÉCRIT EN DUR EN DEHORS de
// `ia-flag.tsx` lui-même — un écran qui reviendrait à l'ancienne forme (l'apparence sans la
// propriété testable) serait invisible à l'œil (même pastille violette) mais absent du DOM sous
// `data-ia-prepare`, exactement le défaut que R59 corrige.
//
// RÉVISÉ le 2026-09-14 (revue hostile, R59/ADR-103) : la première version ne cherchait que
// `className="ai-flag"` et un littéral SEUL sur sa ligne — un bypass RÉEL et CONFIRMÉ par la
// revue : `className={\`ai-flag ${x}\`}` (un gabarit AVEC interpolation, l'idiome DÉJÀ en usage
// ailleurs dans ce dépôt — carry-forward/page.tsx, team/page.tsx, suivi/page.tsx) et
// `clsx('ai-flag', x)` passaient tous deux inaperçus, et l'en-tête d'alors AFFIRMAIT à tort
// couvrir le premier cas. Corrigé en extrayant CHAQUE chaîne et CHAQUE gabarit du fichier (pas
// ligne par ligne — un gabarit peut courir sur plusieurs lignes) et en cherchant le mot
// `ai-flag` À L'INTÉRIEUR de chaque empan, quel que soit ce qui l'entoure dans les guillemets.
//
// CE QUE CE SCRIPT NE PROUVE TOUJOURS PAS (règle 19) : il ne prouve PAS que tout contenu
// réellement préparé par l'IA porte le marqueur (voir l'en-tête de `ia-flag.tsx`) — les sites
// CONNUS sont couverts séparément par `scripts/clics/scenario.ts`, qui lit `[data-ia-prepare]`
// sur du DOM RENDU. Et il NE PEUT PAS attraper une classe CONSTRUITE PAR CONCATÉNATION ou calcul
// (`'ai-' + 'flag'`, `['ai', 'flag'].join('-')`) — aucune chaîne unique du fichier ne contient
// alors le mot entier ; seule une lecture humaine du diff, ou une règle ESLint sur l'AST plutôt
// que sur le texte, attraperait cette forme-là. Un usage brut dans un COMMENTAIRE (une prose
// citant `'ai-flag'` entre guillemets à titre d'exemple, comme ce fichier le fait lui-même plus
// haut) resterait aussi un faux positif possible — aucun neutralisateur de commentaire ici,
// contrairement à `ia-vivante.ts` ; jamais observé pour l'instant.

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

interface Empan { texte: string; index: number; }

/** Chaque gabarit (`` `...` ``, potentiellement multi-lignes, interpolations comprises) et
 *  chaque chaîne simple/double (une seule ligne en JS/TSX valide) du fichier — le TEXTE ENTIER
 *  entre guillemets, pour que `ai-flag` soit trouvé qu'il soit seul ou entouré d'autre chose
 *  (une interpolation, un autre nom de classe). */
function empans(contenu: string): Empan[] {
  const trouves: Empan[] = [];
  const reGabarit = /`(?:\\.|[^\\`])*`/g;
  const reChaine = /'(?:\\.|[^\\'\n])*'|"(?:\\.|[^\\"\n])*"/g;
  for (const re of [reGabarit, reChaine]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(contenu))) trouves.push({ texte: m[0], index: m.index });
  }
  return trouves;
}

export function auditer(): SiteBrut[] {
  const sites: SiteBrut[] = [];
  for (const f of tousLesTsx(path.join(APP, 'src'))) {
    if (path.resolve(f) === path.resolve(EXEMPTE)) continue;
    const contenu = fs.readFileSync(f, 'utf8');
    for (const { texte, index } of empans(contenu)) {
      if (/\bai-flag\b/.test(texte)) {
        const ligne = contenu.slice(0, index).split('\n').length;
        sites.push({ fichier: path.relative(APP, f), ligne, extrait: texte.replace(/\s+/g, ' ').slice(0, 120) });
      }
    }
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
