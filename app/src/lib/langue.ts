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
     Leur compte est publié par ce test pour qu'il ne se perde pas.
   · TOUT `new Error(…)`, ET PAS SEULEMENT DANS CES FICHIERS-LÀ. L'en-tête
     disait « les actions serveur » ; le code, lui, efface le message de CHAQUE
     `new Error` de chaque fichier lu — et dix refus rédigés dans des `page.tsx`
     remontent bel et bien à l'utilisateur par `?erreur=`. La règle ne les
     juge pas ; elle les COMPTE, et cette phrase dit désormais la vérité sur son
     périmètre plutôt que de le rétrécir sur le papier. */
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
     « des », « la ». On l'efface par ce qu'il EST.
     ON DÉCOUPE SUR LES ACCENTS GRAVES AU LIEU DE LES CHERCHER PAR EXPRESSION
     RÉGULIÈRE, et ce n'est pas un raffinement. Le motif `` `[^`]*…[^`]*` ``
     n'exige pas que la zone capturée soit À L'INTÉRIEUR d'un gabarit : elle
     peut commencer au backtick FERMANT d'un `className={`…`}` et finir au
     backtick OUVRANT du suivant — c'est-à-dire manger le JSX qui les sépare.
     Il suffisait qu'il contienne un `<select>` ou le mot « selected ».
     Mesuré : 63 785 caractères effacés dans 25 écrans, 108 chaînes affichées
     rendues invisibles à la règle, dont « Seuil de signification ». La règle
     effaçait de nouveau avant de lire, par une autre porte. */
  const morceaux = code.split('`');
  for (let i = 1; i < morceaux.length; i += 2) {
    if (/\b(select|insert into|update |delete from|alter table|create )/i.test(morceaux[i])) morceaux[i] = ' ';
  }
  code = morceaux.join('`');
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
  /* LES DEUX BRANCHES D'UN TERNAIRE PLACÉ EN ENFANT JSX SONT AFFICHÉES, comme
     un nœud. Elles étaient relevées comme des LITTÉRAUX, où un mot minuscule
     d'un seul tenant passe pour un identifiant : `{m.can_sign ? 'oui' : 'non'}`
     a survécu à cinq versions de cette règle pour cette seule raison.

     EN ENFANT, ET PAS AILLEURS : `defaultValue={x ? 'oui' : 'non'}` choisit la
     VALEUR d'une option, `sp.cote === 'fournisseurs' ? …` choisit un paramètre
     d'URL. Les compter serait crier faux, et une règle qui crie faux se fait
     taire. On exige donc l'accolade d'enfant — celle qui suit `>` ou `}`. */
  const TERNAIRE_AFFICHE =
    /[>}]\{[^{}]*\?\s*(['"])([^'"\n]{2,60})\1\s*:\s*(['"])([^'"\n]{2,60})\3[^{}]*\}/g;
  for (const m of code.matchAll(TERNAIRE_AFFICHE)) {
    /* Un ternaire CHOISIT parfois une clé (`cond ? 'bal.clientsN' : 'bal.…'`)
       avant de la donner à `t()` : c'est le catalogue, pas une phrase. */
    for (const v of [m[2], m[4]]) if (!/^[a-z]\w*\.[\w.]+$/.test(v)) texte.push(v);
  }
  /* LES ENTITÉS SONT DU TEXTE AFFICHÉ, PAS DU CODE. « Approve &amp; send »
     porte un POINT-VIRGULE, et le filtre qui écarte le code écartait la phrase
     avec lui : sept chaînes d'écran — dont « Draw & request evidence » et
     « > 90 j (N) » — étaient invisibles à la règle pour cette seule raison. On
     les décode APRÈS le découpage des balises (décoder « &gt; » avant ferait
     naître de fausses balises), et la règle lit ce que l'utilisateur lit. */
  const decoder = (x: string) => x
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&rarr;/g, '→').replace(/&hellip;/g, '…').replace(/&times;/g, '×')
    .replace(/&(?:middot|bull);/g, '·').replace(/&(?:mdash|ndash);/g, '—');
  return {
    chaines: out.map((s) => decoder(s).trim()),
    texte: texte.map((s) => decoder(s).trim()),
    refus,
  };
}

const CODE = /=>|===|!==|&&|\|\||;|\?\s*\w*\(|\bcatch\s*\(|\b(await|const|let|return|function|async|Promise|FormData|null|undefined|typeof|import|export|useState|type|select|from|where|order by|join)\b/;
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
  /* DEUX LETTRES DE SUITE, SAUF DANS UN NŒUD JSX. « > 90 j (N) » est un
     en-tête de colonne — « j » pour jours, français — et n'en a aucune : il a
     échappé à la règle pour cette seule raison. Dans un littéral, l'exigence
     reste : elle écarte les valeurs. */
  if (!(jsx ? /[A-Za-zÀ-ÿ]/ : /[A-Za-zÀ-ÿ]{2}/).test(nu)) return false;
  if (/^[a-z_]+\|/.test(s)) return false;                // clé d'ancre composée
  if (s.length < 3) return false;
  if (s === 'use server' || s === 'use client') return false;
  /* CE QUE LA RÈGLE A ELLE-MÊME LAISSÉ : `t('cle')` est remplacé par `T( `
     avant la lecture, et le résidu (« ) : T( , ») ressemble à du texte dès
     qu'on n'exige plus deux lettres de suite. */
  if (/^[\s)(,:;.]*T\([\s)(,:;.]*$/.test(nu)) return false;
  /* UN MOT SEUL PEUT ÊTRE UN TITRE. « Missions » est un `<h1>` ; `sample_item`
     est une clé. On distingue par la FORME de l'identifiant, pas par la
     présence d'espace — sinon tout titre d'un mot sort du champ de la règle. */
  if (!jsx && /^[a-z][a-zA-Z0-9]*$/.test(s)) return false;   // camelCase ou minuscule
  if (/^[A-Z0-9_-]+$/.test(s)) return false;             // code (REVENUE, REV-01)
  if (/^[\w]+(-[\w]+)+$/.test(s)) return false;          // valeur kebab (force-dynamic, break-all)
  /* Un nom de TOUCHE, un suffixe de champ, un mot-clé : dans un littéral, ce
     sont des identifiants ; dans un nœud JSX, c'est ce que l'utilisateur lit.
     « Control » est en tête d'une colonne du RCM, pas dans un `keydown`. */
  if (!jsx && TOUCHES.has(s)) return false;
  /* `} else {` donne « else » entre deux accolades : c'est du code, dans les
     deux seaux. Ces quatre mots-là ne sont un libellé dans aucune langue. */
  if (RESTES_DE_CODE.has(s)) return false;
  if (/^\w+\$\{/.test(s)) return false;                  // nom de champ construit (nom${i})
  if (!jsx && SUFFIXES_CHAMP.has(s)) return false;         // suffixe de nom de champ (…Cents)
  /* Un POINT seul ne fait pas un identifiant quand la chaîne est affichée :
     « Freq. » est un en-tête de colonne. On ne garde le filtre, sur un nœud
     JSX, que pour ce qui porte vraiment une marque de chemin ou de clé. */
  if ((!jsx || /[_/@:#]/.test(s))
    && /^[\w.$/#?=@:{}[\]-]*[_/.@:#][\w.$/#?=@:{}[\]-]*$/.test(s) && !/\s/.test(s)) return false;
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


/** Les écrans à éprouver : tout `src/app`, moins ce que la règle ne vise pas. */
export function ecransDe(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ecransDe(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !ecarte(p)) out.push(p);
  }
  return out;
}

// LA RÈGLE SUIT LE LIBELLÉ JUSQUE DANS LES SERVICES (revue n°3, point 1).
//
// Un écran peut être irréprochable et afficher du français quand même : il
// suffit qu'il rende une TABLE DE LIBELLÉS tenue dans un service. C'est
// exactement ce qui se passait — `NOTE_TYPES` porte « à corriger (bloquante) »
// dans `services/workpapers/lifecycle.ts`, et l'écran des notes l'affiche tel
// quel. La règle ne regardait que `src/app` : elle ne pouvait pas le voir, et
// elle annonçait « 0 reste ».
//
// LA RÈGLE EST STRUCTURELLE, ICI AUSSI : une propriété qui s'APPELLE un libellé
// (`libelle`, `label`, `titre`, `phrase`) tient une CLÉ du catalogue, jamais
// une phrase. Beaucoup de services le font déjà (`loop.ts`, `completion.ts`,
// `poste.ts`) : la règle constate ce que le dépôt fait de mieux, elle ne
// l'invente pas.

/* CE QUE LA RÈGLE NE VISE PAS, ET POURQUOI. Les DONNÉES du monde synthétique
   portent des libellés qui SONT la donnée : « Chiffre d'affaires net » est une
   ligne d'états financiers fabriquée, pas un mot de l'interface, et la traduire
   par le catalogue reviendrait à traduire le jeu d'essai. Ces fichiers sont
   nommés ici, un par un, plutôt que devinés par un motif. */
const DONNEES_SYNTHETIQUES = new Set([
  'services/monde-demo.ts', 'services/tieout-demo.ts', 'seed.ts', 'flows/part2.ts',
]);

/* CE QUE LA RÈGLE NE PEUT PAS ENCORE TENIR, ET POURQUOI — dit ici plutôt que
   caché. Ces trois modules écrivent une phrase qui est ENSUITE STOCKÉE : le
   texte d'une réponse d'OTTO dans une note, l'interprétation figée d'une
   colonne ajoutée, un maillon de chaîne de provenance. Une phrase déjà écrite
   au dossier ne se relit pas dans une autre langue : la langue s'y décide à
   L'ÉCRITURE, ce qui demande que le service reçoive la locale du cabinet — un
   chantier de conception, nommé au registre, pas un `t()` de plus.

   Leur compte est PUBLIÉ par la règle, comme celui des messages de refus :
   une exception qui ne se compte pas est une exception qui s'oublie. */
export const DIFFERES: Record<string, string> = {
  'services/notes/otto.ts':
    'texte d’une réponse d’OTTO, ÉCRIT PUIS STOCKÉ dans la note — la langue s’y décide à l’écriture',
  'services/workpapers/colonne.ts':
    'interprétation d’une colonne, FIGÉE en base à l’ajout — se relit telle qu’elle a été écrite',
  'services/provenance.ts':
    'maillons de chaîne de provenance, mêlés à des données (nom de fichier, empreinte, date)',
  /* ET UNE SECONDE RAISON, D'UNE AUTRE NATURE : ces phrases COTOIENT du contenu
     de pack (le catalogue de méthode NEP, en français) ou des codes bruts. Les
     traduire seules donnerait une liste moitié anglaise moitié française — pire
     que l'état actuel. Le pack est du CONTENU, et le périmètre est gelé
     (règle 14) : le chantier est nommé au registre, pas bâclé ici. */
  'services/acceptance.ts':
    'liste de manques dont les autres entrées sont du contenu de pack (français)',
  'services/reunions.ts':
    'titre affiché à côté de rôles bruts (`manager`, `partner`) que le catalogue ne couvre pas non plus',
};

const PROPS_LIBELLE = /\b(libelle|label|titre|phrase|raison)\s*:\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g;

/**
 * Les libellés que les SERVICES tiennent en dur, au lieu d'une clé du
 * catalogue. `cles` est l'ensemble des clés connues — passé par l'appelant,
 * pour que ce module reste sans dépendance.
 */
export function libellesDeService(
  lib: string, cles: Set<string>,
): { restes: string[]; differes: string[] } {
  const out: string[] = [];
  const differes: string[] = [];
  for (const f of modulesDe(lib)) {
    const rel = path.relative(lib, f).split(path.sep).join('/');
    if (DONNEES_SYNTHETIQUES.has(rel)) continue;
    let code = fs.readFileSync(f, 'utf8');
    code = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    /* UN PAYLOAD DE JOURNAL EST UNE DONNÉE, PAS UN LIBELLÉ. « conservation
       échue » est écrit une fois dans `event_log` et ne se réécrit jamais :
       le traduire au rendu réécrirait l'histoire du dossier. */
    code = code.replace(/payload:\s*\{[^}]*\}/g, 'payload: { }');
    for (const m of code.matchAll(PROPS_LIBELLE)) {
      const v = m[3];
      if (cles.has(v)) continue;             // c'est une clé : la règle est tenue
      if (!lisible(v, true)) continue;        // un code, une valeur, un chemin
      if (rel in DIFFERES) { differes.push(`${rel} → ${m[1]} (${DIFFERES[rel]})`); continue; }
      out.push(`${rel} → ${m[1]}: « ${v.slice(0, 70)} »`);
    }
  }
  return { restes: out, differes };
}

/** Les modules de `src/lib`, hors tests et hors catalogue lui-même. */
function modulesDe(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') modulesDe(p, out); }
    else if (/\.ts$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

// LE CATALOGUE EST L'ANGLE MORT DE LA RÈGLE, ET C'EST LE PIRE ENDROIT POSSIBLE.
//
// La règle compte les chaînes qui ne passent PAS par le catalogue. Elle ne
// regarde donc jamais ce que le catalogue CONTIENT — si bien que la manière la
// plus simple de rendre une phrase française invisible à la règle est de
// l'écrire dans la colonne `en`. Sept entrées l'étaient : sur l'instance
// anglaise, l'écran des seuils affichait « Seuil de signification » à côté de
// « Materiality » pour le même concept.
//
// LA RÈGLE EST LINGUISTIQUE ICI, ET ELLE A LE DROIT DE L'ÊTRE. Ailleurs,
// deviner la langue d'une chaîne était le défaut ; dans un DICTIONNAIRE
// bilingue, c'est la seule question qui se pose. On ne devine pas la langue
// d'une phrase quelconque : on constate qu'une entrée porte, du mauvais côté,
// des mots-outils qui n'existent que dans l'autre langue.
//
// CE QU'ELLE NE VOIT PAS, DIT ICI : une inversion d'un seul mot sans
// mot-outil ni accent (« Joindre » contre « Attach ») lui échappe. Elle attrape
// six des sept inversions constatées ; la septième a été trouvée à l'œil.

const OUTILS_FR = /(^|[\s(«"'])(de|du|des|la|le|les|un|une|puis|et|aux|sur|pour|avec|sans|dans|par|qui|que|ne|pas|est|sont|au|à|ce|cette|ses|son|leur|plus|moins|tout|toute)([\s.,;:!?)»"']|$)/i;
const OUTILS_EN = /(^|[\s("'])(the|of|and|to|then|for|with|without|is|are|not|by|on|in|from|this|that|its|their|each|any|all|no|yet|has|have|been|be)([\s.,;:!?)"']|$)/i;
const ACCENTS = /[àâäçéèêëîïôöùûüœ]/i;

/**
 * Les entrées du catalogue dont les deux colonnes semblent ÉCHANGÉES : du
 * français côté `en`, de l'anglais côté `fr`.
 */
export function inversions(libelles: Record<string, { en: string; fr: string }>): string[] {
  const out: string[] = [];
  for (const [cle, e] of Object.entries(libelles)) {
    /* On n'exige pas que `fr` ait l'air anglais — « Attach » n'a aucun mot-outil.
       On exige que `en` ait l'air français ET que `fr` ne le soit pas : c'est le
       déséquilibre, pas la langue de chaque colonne, qui dénonce l'échange. */
    const enFrancais = OUTILS_FR.test(e.en) || ACCENTS.test(e.en);
    const frFrancais = OUTILS_FR.test(e.fr) || ACCENTS.test(e.fr);
    if (enFrancais && !frFrancais) out.push(`${cle} : en=« ${e.en} » / fr=« ${e.fr} »`);
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
