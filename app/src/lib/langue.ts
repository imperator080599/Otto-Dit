import fs from 'node:fs';
import path from 'node:path';

// PLUS UNE SEULE CHAÎNE D'ÉCRAN HORS CATALOGUE (revue n°3, point 1).
//
// LA PREMIÈRE VERSION DE CE TEST MENTAIT, ET C'EST LE DÉFAUT LE PLUS GRAVE
// QU'ELLE POUVAIT AVOIR. Elle cherchait « des chaînes FRANÇAISES dans les nœuds
// JSX », et pour éviter d'accuser le SQL elle commençait par EFFACER tous les
// littéraux. Or c'est exactement là que le français vivait : dans les tables de
// libellés (`FAMILLES`, `NATURES`, `ETATS`), dans les ternaires
// (`cond ? 'oui' : 'non'`), dans les services qui rendent les obstacles au visa.
// Le test disait « 0 reste » sur cent quatre-vingts chaînes affichées. Un
// instrument qui déclare finie une migration à moitié faite est pire que pas
// d'instrument : c'est le silence lu comme un succès (règle 13).
//
// LA RÈGLE EST DONC STRUCTURELLE, PAS LINGUISTIQUE. On ne devine plus la langue
// d'une chaîne — deviner, c'est se tromper. On compte les chaînes LISIBLES d'un
// écran qui ne passent pas par le catalogue. Un `t('cle')` n'est pas un
// littéral ; « Motif : » en est un, dans quelque langue qu'il soit écrit.

/* CE QUE LA RÈGLE NE VISE PAS, ET POURQUOI — dit ici plutôt que caché :
   · `api/**` et `route.ts` : ce ne sont pas des écrans. La sonde de santé se
     lit dans un terminal, pas dans la langue d'un cabinet.
   · `*actions*.ts` : ce sont les MESSAGES DE REFUS des actions serveur. Ils
     portent des faits variables (« l'écart de 1 250,00 € n'est pas expliqué ») ;
     les figer en libellés recopierait le défaut ailleurs. Ils appellent des
     CODES d'erreur paramétrés — un chantier de conception, nommé au registre.
     Leur compte est publié par ce test pour qu'il ne se perde pas. */
export function ecarte(p: string): boolean {
  return /(^|\/)api\//.test(p) || /route\.ts$/.test(p)
    || /actions[\w-]*\.ts$/.test(p) || /-actions\.ts$/.test(p);
}

const ATTR_TECH = /\s(?:className|style|href|src|id|key|name|type|action|method|accept|rel|target|role|htmlFor|colSpan|rowSpan|width|height|d|viewBox|fill|stroke|data-[\w-]+)=(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g;

/** Les chaînes d'un fichier, une fois retiré ce qui n'est pas de l'interface. */
export function chaines(code: string): { chaines: string[]; texte: string[]; refus: string[] } {
  code = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];$/gm, ' ');
  /* Le SQL n'est pas de l'interface : un `select … join … on …` porte « on »,
     « des », « la ». On l'efface par ce qu'il EST, pas par ce qu'il ressemble. */
  code = code.replace(/`[^`]*\b(select|insert into|update |delete from|alter table|create )[^`]*`/gi, '` `');
  const refus = [...code.matchAll(/new Error\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)].map((m) => m[2]);
  code = code.replace(/new Error\(\s*(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, 'new Error( )');
  /* LES ATTRIBUTS DE LIBELLÉ SONT AFFICHÉS PAR CONSTRUCTION, exactement comme
     un nœud JSX — ils partent donc dans le même seau et échappent aux filtres
     qui écartent les identifiants. Un `placeholder="motif"` a survécu à deux
     versions de cette règle parce qu'il était relevé comme un LITTÉRAL, et
     qu'un mot minuscule d'un seul tenant y passe pour un nom de variable. */
  const attributs: string[] = [];
  for (const m of code.matchAll(
    /(?:placeholder|title|aria-label|alt|label|summary)=\{?["'`]([^"'`]+)["'`]\}?/g)) attributs.push(m[1]);
  code = code.replace(ATTR_TECH, ' ');
  /* Un appel au catalogue n'est pas un littéral d'écran. */
  code = code.replace(/\bt\w*\(\s*['"`][^'"`]*['"`]/g, 'T( ');
  code = code.replace(/traduire\(\s*[^,]+,\s*['"`][^'"`]*['"`]/g, 'T( ');
  const out: string[] = [];
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) out.push(m[2]);
  /* Le texte d'un nœud JSX n'est pas un littéral : il se relève une fois les
     littéraux effacés, et les lignes repliées — un nœud écrit sur trois lignes
     reste UNE phrase. */
  const sans = code.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, ' ').replace(/\s*\n\s*/g, ' ');
  const texte: string[] = [...attributs];
  for (const m of sans.matchAll(/[>}]([^<>{}]+)[<{]/g)) texte.push(m[1]);
  return { chaines: out.map((s) => s.trim()), texte: texte.map((s) => s.trim()), refus };
}

const CODE = /=>|===|!==|&&|\|\||;|\?\s*\(|\bcatch\s*\(|\b(await|const|let|return|function|async|Promise|FormData|null|undefined|typeof|import|export|useState|type|select|from|where|order by|join)\b/;
const CSS = /(\b(px|rem|em|solid|dashed|flex|grid|nowrap|pre-wrap|space-between|inline-block)\b|var\(--|#[0-9a-f]{3,6}\b|^\d+(\.\d+)?(px|%|rem)$)/i;
const SUFFIXES_CHAMP = new Set(['Cents', 'Id', 'At', 'By']);
const RESTES_DE_CODE = new Set(['else', 'return', 'try', 'catch']);
const TOUCHES = new Set(['Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backspace', 'Delete', 'Shift', 'Control', 'Alt', 'Meta']);
const CLASSES = /^(badge|btn|panel|callout|row|grid|mono|faint|muted|num|data|stack|kpi|sel|warn|small|secondary|green|amber|red|gray|blue|violet|mt|ok|compare-ko|ai-flag|progressbar|table-scroll)(\s+[\w-]+)*$/;

/**
 * Une chaîne qu'un utilisateur LIT — par opposition à ce qui reste du code.
 *
 * `jsx` DIT D'OÙ VIENT LA CHAÎNE, et ce n'est pas un détail : un nœud JSX est
 * affiché PAR CONSTRUCTION. Les filtres qui écartent les identifiants
 * (`retenir`, `motif`, `sample_item`) n'ont donc aucun sens sur lui — c'est
 * ainsi que deux boutons français ont survécu à la migration. Sur un littéral,
 * au contraire, ces filtres sont indispensables.
 */
export function lisible(s: string, jsx = false): boolean {
  const nu = s.replace(/\$\{[^}]*\}/g, '').trim();
  if (!/[A-Za-zÀ-ÿ]{2}/.test(nu)) return false;          // que des valeurs : pas une phrase
  if (/^[a-z_]+\|/.test(s)) return false;                // clé d'ancre composée
  if (s.length < 3) return false;
  if (s === 'use server' || s === 'use client') return false;
  /* UN MOT SEUL PEUT ÊTRE UN TITRE. « Missions » est un `<h1>` ; `sample_item`
     est une clé. On distingue par la FORME de l'identifiant, pas par la
     présence d'espace — sinon tout titre d'un mot sort du champ de la règle. */
  if (!jsx && /^[a-z][a-zA-Z0-9]*$/.test(s)) return false;   // camelCase ou minuscule
  if (/^[A-Z0-9_-]+$/.test(s)) return false;             // code (REVENUE, REV-01)
  if (/^[\w]+(-[\w]+)+$/.test(s)) return false;          // valeur kebab (force-dynamic, break-all)
  if (TOUCHES.has(s) || RESTES_DE_CODE.has(s)) return false;                      // nom de touche clavier
  if (/^\w+\$\{/.test(s)) return false;                  // nom de champ construit (nom${i})
  if (SUFFIXES_CHAMP.has(s)) return false;                // suffixe de nom de champ (…Cents)
  if (/^[\w.$/#?=@:{}[\]-]*[_/.@:#][\w.$/#?=@:{}[\]-]*$/.test(s) && !/\s/.test(s)) return false;
  if (/^\/|^https?:|^\.\//.test(s)) return false;
  if (CODE.test(s)) return false;
  if (CSS.test(s)) return false;
  if (/^[\s|·—:,()%€$]*(\$\{[^}]*\}[\s|·—:,()%€$]*)+$/.test(s)) return false;
  if (/^(badge|btn|panel|callout|row|grid)\s+\$\{/.test(s)) return false;
  if (/\d+(px|%)\s/.test(s) || /^[\d\s.]*px\b/.test(s)) return false;
  if (/^[=,]\s/.test(s)) return false;
  if (/^[,\s]*\w+:$/.test(s)) return false;
  if (/\w=$/.test(s)) return false;
  if (CLASSES.test(s)) return false;
  if (/[(?]$/.test(s.trim())) return false;
  if (/^\w+\($/.test(s)) return false;
  if (/^\d+\s*\?/.test(s)) return false;
  if (/\.(csv|zip|pdf|xlsx|json|txt)$/i.test(s)) return false;
  if (/^\$\{[^}]*\}\s*(kB|ko|Mo|MB|%|€)$/.test(s)) return false;
  if (/^(annotable|badge|btn|panel|callout|row|grid|compare|piece|atelier|rail)[\w-]*\$\{/.test(s)) return false;
  return true;
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !ecarte(p)) out.push(p);
  }
  return out;
}


/** Les écrans à éprouver : tout `src/app`, moins ce que la règle ne vise pas. */
export function ecransDe(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ecransDe(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !ecarte(p)) out.push(p);
  }
  return out;
}

/** Ce que la règle trouve : les chaînes d'écran hors catalogue, et les refus. */
export function horsCatalogue(app: string): { restes: string[]; refus: number } {
  const restes: string[] = [];
  let refus = 0;
  for (const f of ecransDe(app)) {
    const r = chaines(fs.readFileSync(f, 'utf8'));
    refus += r.refus.length;
    for (const s of r.chaines) if (lisible(s)) restes.push(`${path.relative(app, f)} → « ${s.slice(0, 70)} »`);
    for (const s of r.texte) if (lisible(s, true)) restes.push(`${path.relative(app, f)} → « ${s.slice(0, 70)} »`);
  }
  return { restes, refus };
}
