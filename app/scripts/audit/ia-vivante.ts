import fs from 'node:fs';
import path from 'node:path';

// L'ENUMÉRATION DE LA SURFACE « IA VIVANTE », ENGENDRÉE (règle 21) — pas rédigée à la main.
//
// Demande du fondateur (2026-09-13, en relisant le correctif entretiens.ts) : « enumerate
// every site that can reach the provider or read ANTHROPIC_API_KEY... as a generated
// artifact ». Ce script produit `docs/instantanes/ia-vivante.json` (la donnée) et
// `docs/IA_VIVANTE_SURFACE.md` (le rendu lisible) depuis un balayage RÉEL du disque.
//
// DEUX FAÇONS D'ATTEINDRE LE FOURNISSEUR, TOUTES DEUX SUIVIES : (1) appeler une FABRIQUE
// exportée (`export function get...`) qui choisit et construit l'adaptateur réel ; (2)
// INSTANCIER DIRECTEMENT une classe réelle (`new AnthropicXxx(...)`), en court-circuitant sa
// fabrique — trouvé le 2026-09-13 : `scripts/eval/entretien.ts` fait exactement ça
// (`new AnthropicAnalyste()`), invisible à la première version de ce script, qui ne suivait
// que les fabriques. Les classes réelles sont reconnues par un nom `Anthropic<Quelque
// chose>` — une convention DÉJÀ établie par les trois classes connues
// (AnthropicAnalyste, AnthropicDocAdapter, AnthropicQueryPlanner), suivie ici plutôt qu'une
// liste de noms tapée à la main qui manquerait la prochaine.
//
// DEUX RACINES BALAYÉES : `src/` ET `scripts/` — la première version ne regardait que `src/`
// et ratait donc TOUT `scripts/eval/*.ts`, exactement le dossier des harnais conçus pour
// atteindre le fournisseur pour de vrai.
//
// CE QUE CE SCRIPT NE REGARDE PAS (règle 19, à ne pas découvrir plus tard) : il ne vérifie
// PAS que la garde est appelée AVANT l'adaptateur (ordre des lignes) — une lecture humaine
// reste nécessaire pour ça, et chaque site listé ici est relu à la main avant d'être marqué
// « fermé ». `gardeeParAssertBudget` teste si `assertBudgetActifEnBase(` apparaît N'IMPORTE OÙ
// dans le FICHIER de l'appelant, pas près du site d'appel précis ni lié à l'adaptateur précis
// qu'il appelle (revue hostile du 2026-09-13, voix 2) : un fichier avec deux sites d'adaptateur
// réel, l'un gardé et l'autre non, marquerait les DEUX « GARDÉ ». Aucun fichier connu n'a deux
// sites distincts aujourd'hui — chaque entrée reste relue à la main avant d'être fermée — mais
// un futur fichier pourrait. Il ne suit pas un ré-export ou un alias d'import renommé
// (`import { getOcrAdapter as x }`, `import { AnthropicAnalyste as X }`) — aucun site connu
// ne fait ça, mais un futur pourrait. Une fabrique écrite `export const getX = () => ...`
// (une constante fléchée) plutôt que `export function getX(` lui échapperait aussi — aucune
// fabrique connue n'est écrite ainsi aujourd'hui (revue hostile du 2026-09-13, voix 1), mais
// rien ne l'empêche demain. Une classe réelle qui ne suivrait PAS la convention de nom
// `Anthropic...` (un futur fournisseur, par exemple) lui échapperait entièrement ; c'est
// pour ÇA que la garde structurelle (`scripts/audit/ia-vivante.test.ts`) revérifie le
// MÊME balayage à chaque `vitest run` plutôt que de se fier une fois pour toutes à cet
// instantané, ET nomme explicitement le nombre de classes/fabriques attendu — un compte qui
// change sans que ce fichier ne change serait lui-même le signal d'un site non suivi.

const APP = path.join(import.meta.dirname, '..', '..');

interface SiteReel { fichier: string; ligne: number; forme: string; }
interface PointDAcces { fichier: string; ligne: number; nom: string; genre: 'fabrique' | 'classe'; }
interface Appelant { fichier: string; ligne: number; gardeeParAssertBudget: boolean; }
interface EntreeSurface {
  point: PointDAcces;
  sitesReels: SiteReel[];
  appelants: Appelant[];
}

function tousLesFichiersTs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tousLesFichiersTs(p, acc);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function relatif(p: string): string {
  return path.relative(APP, p);
}

/** Remplace le CONTENU des commentaires par des espaces — jamais des lignes retirées, pour
 *  que les numéros de ligne restent vrais. Sans ça, un nom cité en PROSE dans un commentaire
 *  multi-lignes (sans `*` en tête de chaque ligne continuée) se lisait comme un appel réel —
 *  trouvé en écrivant ce script (faux positif dans le propre commentaire IA-BUDGET-01 de
 *  `route.ts`). Ne gère pas une chaîne de caractères contenant `//` ou un bloc de commentaire
 *  (aucun site connu n'en a une sur ces motifs ; règle 19). */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length));
}

export function auditer(): EntreeSurface[] {
  const fichiers = [
    ...tousLesFichiersTs(path.join(APP, 'src')),
    ...tousLesFichiersTs(path.join(APP, 'scripts')),
  ];
  const propreParFichier = new Map<string, string>();
  for (const f of fichiers) propreParFichier.set(f, sansCommentaires(fs.readFileSync(f, 'utf8')));

  const sitesReelsParFichier = new Map<string, SiteReel[]>();
  for (const [f, contenu] of propreParFichier) {
    const sites: SiteReel[] = [];
    contenu.split('\n').forEach((l, i) => {
      if (/process\.env\.ANTHROPIC_API_KEY/.test(l)) sites.push({ fichier: relatif(f), ligne: i + 1, forme: 'ANTHROPIC_API_KEY' });
      if (/new Anthropic\(/.test(l)) sites.push({ fichier: relatif(f), ligne: i + 1, forme: 'new Anthropic( (SDK)' });
    });
    if (sites.length) sitesReelsParFichier.set(f, sites);
  }

  // Les points d'accès : une fabrique `export function get...` DANS un fichier qui porte un
  // site réel, ET toute classe `Anthropic<Quelque chose>` (définie n'importe où — sa classe
  // peut vivre dans le même fichier qu'un site réel sans que la fabrique le soit).
  const points: PointDAcces[] = [];
  for (const [f, contenu] of propreParFichier) {
    contenu.split('\n').forEach((l, i) => {
      if (sitesReelsParFichier.has(f)) {
        const mf = /export function (get\w+)\(/.exec(l);
        if (mf) points.push({ fichier: relatif(f), ligne: i + 1, nom: mf[1], genre: 'fabrique' });
      }
      const mc = /class (Anthropic\w+)/.exec(l);
      if (mc) points.push({ fichier: relatif(f), ligne: i + 1, nom: mc[1], genre: 'classe' });
    });
  }

  const entrees: EntreeSurface[] = [];
  for (const pt of points) {
    const sitesReels = [...sitesReelsParFichier.entries()]
      .filter(([f]) => relatif(f) === pt.fichier)
      .flatMap(([, s]) => s);

    const appelants: Appelant[] = [];
    const motif = pt.genre === 'classe' ? `new ${pt.nom}\\(` : `\\b${pt.nom}\\(`;
    for (const [f, contenuPropre] of propreParFichier) {
      /* Le fichier qui DÉFINIT le point d'accès n'est pas son propre appelant : une fabrique
         qui construit SA classe pour la retourner, ou une classe qu'une AUTRE fabrique du
         même fichier construit, n'est pas un site de risque distinct — le risque vit chez
         qui appelle la fabrique, déjà suivi séparément. */
      if (relatif(f) === pt.fichier) continue;
      const re = new RegExp(motif);
      contenuPropre.split('\n').forEach((l, i) => {
        if (re.test(l)) {
          appelants.push({
            fichier: relatif(f),
            ligne: i + 1,
            gardeeParAssertBudget: /assertBudgetActifEnBase\(/.test(contenuPropre),
          });
        }
      });
    }
    entrees.push({ point: pt, sitesReels, appelants });
  }
  return entrees.sort((a, b) => a.point.fichier.localeCompare(b.point.fichier) || a.point.ligne - b.point.ligne);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const surface = auditer();
  const dossier = path.join(APP, '..', 'docs', 'instantanes');
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, 'ia-vivante.json'), JSON.stringify(surface, null, 2) + '\n');

  const md: string[] = [
    '# La surface « IA vivante » — engendré par `npx tsx app/scripts/audit/ia-vivante.ts`',
    '',
    '> Ne pas éditer à la main : ce fichier est réécrit à chaque exécution du script. Ce qui',
    '> manque ici est ce que le balayage ne voit pas (voir l\'en-tête du script) — pas ce qui',
    '> n\'existe pas.',
    '',
  ];
  let ouvert = 0;
  for (const e of surface) {
    md.push(`## \`${e.point.nom}\` — ${e.point.genre} (${e.point.fichier}:${e.point.ligne})`);
    md.push('');
    md.push(`Sites réels dans ce fichier : ${e.sitesReels.map((s) => `${s.forme} @ L${s.ligne}`).join(', ') || '(aucun — vérifier à la main)'}`);
    md.push('');
    if (!e.appelants.length) {
      md.push('Aucun appelant trouvé (fabrique ou classe non utilisée ailleurs).');
    } else {
      for (const a of e.appelants) {
        const etat = a.gardeeParAssertBudget ? 'GARDÉ (assertBudgetActifEnBase présent dans le fichier)' : '**NON GARDÉ**';
        if (!a.gardeeParAssertBudget) ouvert++;
        md.push(`- ${a.fichier}:${a.ligne} — ${etat}`);
      }
    }
    md.push('');
  }
  md.push(`---\n\n**${ouvert} appel(s) NON gardé(s)** au moment de cette exécution.`);
  fs.writeFileSync(path.join(dossier, '..', 'IA_VIVANTE_SURFACE.md'), md.join('\n') + '\n');
  console.log(`surface IA vivante : ${surface.length} point(s) d'accès, ${ouvert} appel(s) non gardé(s) — docs/IA_VIVANTE_SURFACE.md écrit`);
}
