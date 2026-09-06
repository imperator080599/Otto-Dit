/**
 * docs/REPRISE.md EST ENGENDRÉ — jamais rédigé (règle 21 ; protocole de reprise, CLAUDE.md §0).
 *
 * POURQUOI. Le rapport du réveil J4 portait huit erreurs de comptage relevées par le fondateur :
 * des chiffres écrits à la main qui ne tenaient pas d'un paragraphe à l'autre. Un compte rendu
 * dont les chiffres viennent d'un script ne peut pas se contredire ; il peut seulement être
 * périmé, et il porte sa date.
 *
 * CE QU'IL LIT : le gabarit `docs/reprise.src.md` ; les instantanés `docs/instantanes/*.json`
 * (SHA servi, exécutions de la chaîne `verify`, état de chaque fil) ; `docs/BACKLOG_REPORTE.md`
 * (l'énoncé des fils) ; `docs/CHASSE.md` (ses sections) ; `app/package.json` (la chaîne
 * `verify`) ; git (HEAD, arbre, amont) ; `pgrep` (ce qui tourne).
 *
 * CE QU'IL REFUSE, plutôt que de taire (règle 13) :
 *   · un fil du backlog (R24 et suivants, N2-x) sans état NON VIDE dans fils.json — une entrée
 *     présente mais vide est le même manque qu'une entrée absente ;
 *   · un fil de fils.json qui n'est ni au backlog ni porteur de son propre titre ;
 *   · un gabarit dont une balise `{{…}}` n'a pas été remplie, ou remplie deux fois ;
 *   · une exécution de `verify.json` dont `quand` n'est pas une date lisible.
 * Une commande de `verify` sans exécution consignée n'est pas un refus : elle est IMPRIMÉE
 * « aucune exécution consignée », parce que c'est exactement l'information qu'on cherche. Une
 * exécution qui porte un `variante` (la commande RÉELLEMENT lancée diffère du maillon nu — par
 * exemple `fumee` contre l'URL déployée plutôt qu'en local) n'efface pas le maillon nu de « non
 * exécutées » : elle y reste, avec la variante nommée à côté.
 *
 * OÙ IL CESSE DE REGARDER : il ne mesure rien lui-même — il ne lance ni test ni navigateur, il
 * ne joint pas l'URL. Il rapporte des mesures consignées PAR D'AUTRES, avec leur SHA et leur
 * source ; si l'instantané ment, le rapport ment avec lui, en citant sa source. Il ne lit pas
 * STATUS.md ni les ADR : la prose du §1 du gabarit est écrite à la main, et les chiffres qu'elle
 * cite (un commit, un SHA, un ADR) sont ceux de git ou d'un document déjà commis — jamais une
 * mesure que ce script aurait pu produire lui-même. Il ne sait pas si HEAD est poussé : il
 * compare à l'amont tel que la dernière synchronisation locale le connaît, et le dit. Il ne lit
 * pas les fichiers `.github/workflows/*.yml` : la liste de ce qui tourne sans qu'on le lance est
 * écrite à la main dans le gabarit, et peut donc périmer sans que le script le voie.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export interface Fil { id: string; etat: string; titre?: string; depuis?: string; note?: string }
export interface Execution {
  commande: string;
  sha: string;
  quand: string;
  resultat: string;
  source: string;
  /** La commande RÉELLEMENT lancée, quand elle diffère du maillon nu de la chaîne `verify`. */
  variante?: string;
}
export interface Verify { executions: Execution[]; precedent: { source: string; nonExecutees: string[] } }
export interface Servi {
  url: string;
  sha: string;
  mesure: { quand: string; par: string; commande?: string };
  historique?: { sha: string; quand: string; par: string }[];
}
export interface Git { head: string; sujet: string; modifies: number; amont: string | null; amontSha: string | null }

export interface Entrees {
  /** ISO — fournie, jamais lue dans le script pur (le test la fige). */
  date: string;
  git: Git;
  servi: Servi;
  fils: Fil[];
  backlog: string;
  verify: Verify;
  chaine: string[];
  processus: string[];
  chasse: string;
  gabarit: string;
}

export class TransfertIncomplet extends Error {}

const court = (s: string | null | undefined): string => (s ? s.slice(0, 7) : '(aucun)');
const memeSha = (a: string, b: string): boolean => a.slice(0, 7) === b.slice(0, 7);
const cellule = (s: string | undefined): string => (s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
/** Le maillon tel qu'on le tape : tsc et vitest ne sont pas des scripts npm. */
const libelle = (c: string): string => (c === 'tsc' ? 'npx tsc --noEmit' : c === 'vitest' ? 'npx vitest run' : `npm run ${c}`);

/** La chaîne de `npm run verify`, telle que package.json l'écrit : une commande par maillon. */
export function chaineVerify(script: string): string[] {
  return script
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^npm run (\S+)/.exec(s);
      if (m) return m[1];
      if (/^tsc\b/.test(s)) return 'tsc';
      if (/^vitest\b/.test(s)) return 'vitest';
      return s;
    });
}

export interface FilBacklog { id: string; titre: string }

/** Les fils que le backlog énonce : `**Rnn — titre**` (le titre peut courir sur plusieurs lignes) et `| N2-n | … |`. */
export function filsDuBacklog(backlog: string): FilBacklog[] {
  const fils: FilBacklog[] = [];
  const r = /\*\*(R\d+) — ([\s\S]*?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = r.exec(backlog))) fils.push({ id: m[1], titre: m[2].replace(/\s+/g, ' ').trim() });
  const n = /^\| (N2-\d+) \| ([^|]+) \|/gm;
  while ((m = n.exec(backlog))) {
    const gras = /\*\*(.+?)\*\*/.exec(m[2]);
    const titre = (gras ? gras[1] : m[2]).replace(/~~/g, '').replace(/\s+/g, ' ').trim();
    fils.push({ id: m[1], titre });
  }
  return fils;
}

/**
 * Le tableau des fils : l'énoncé vient du backlog, l'état de fils.json ; un fil de la fenêtre
 * R24+/N2-x sans état NON VIDE refuse. `aPartirDe` ne borne QUE l'obligation d'avoir un état
 * (R1–R23 sont des reports du plan de nuit, en tableau, pas des fils suivis ici) — le TITRE,
 * lui, se cherche sur tout le backlog : un vieux R-nn qui rouvrirait avec un état dans fils.json
 * doit pouvoir retrouver son titre, pas seulement les fils de la fenêtre.
 */
export function tableFils(fils: Fil[], backlog: string, aPartirDe = 24): string {
  const tousConnus = filsDuBacklog(backlog);
  const titres = new Map(tousConnus.map((f) => [f.id, f.titre]));
  const fenetre = tousConnus.filter((f) => !/^R\d+$/.test(f.id) || Number(f.id.slice(1)) >= aPartirDe);
  const etats = new Map(fils.map((f) => [f.id, f]));
  const sansEtat = fenetre.filter((f) => !(etats.get(f.id)?.etat ?? '').trim()).map((f) => f.id);
  if (sansEtat.length) {
    throw new TransfertIncomplet(
      `fil(s) du backlog sans état (non vide) dans docs/instantanes/fils.json : ${sansEtat.join(', ')} — un fil sans état est un fil oublié (règle 23)`,
    );
  }
  const sansTitre = fils.filter((f) => !titres.has(f.id) && !f.titre).map((f) => f.id);
  if (sansTitre.length) {
    throw new TransfertIncomplet(`fil(s) de fils.json absents du backlog et sans titre : ${sansTitre.join(', ')}`);
  }
  return fils
    .map((f) => `| ${f.id} | ${cellule(titres.get(f.id) ?? f.titre)} | ${cellule(f.etat)} | ${cellule(f.depuis)} | ${cellule(f.note)} |`)
    .join('\n');
}

export interface RenduVerify { table: string; nonExecutees: string[]; listeNonExecutees: string; precedent: string; autres: string }

/** Une date ISO valide, ou lève en nommant la commande et le SHA fautifs — jamais un TypeError nu. */
function quandValide(e: Execution): number {
  const t = Date.parse(e.quand);
  if (Number.isNaN(t)) {
    throw new TransfertIncomplet(
      `docs/instantanes/verify.json : \`quand\` illisible pour \`${e.commande}\` (sha ${court(e.sha)}) : « ${e.quand} »`,
    );
  }
  return t;
}

/** La chaîne `verify` contre le registre des exécutions : ce qui a tourné sur HEAD, ce qui n'a pas tourné. */
export function tableVerify(chaine: string[], verify: Verify, head: string): RenduVerify {
  /* Validée pour CHAQUE exécution, pas seulement au tri : un tableau d'un seul élément ne
     déclenche jamais le comparateur de `.sort()`, et une date illisible passerait donc à
     travers si elle n'était vérifiée qu'à l'intérieur du tri. */
  for (const e of verify.executions) quandValide(e);
  const parCommande = new Map<string, Execution[]>();
  for (const e of verify.executions) {
    const l = parCommande.get(e.commande) ?? [];
    l.push(e);
    parCommande.set(e.commande, l);
  }
  /** La dernière exécution qui porte le MAILLON NU (une variante ne compte pas comme le maillon). */
  const derniereNue = (c: string): Execution | undefined =>
    (parCommande.get(c) ?? [])
      .filter((e) => !e.variante)
      .slice()
      .sort((a, b) => quandValide(b) - quandValide(a))[0];
  /** La dernière exécution, variante comprise — pour l'afficher même quand seule une variante existe. */
  const derniereQuelconque = (c: string): Execution | undefined =>
    (parCommande.get(c) ?? []).slice().sort((a, b) => quandValide(b) - quandValide(a))[0];

  const lignes: string[] = [];
  const nonExecutees: string[] = [];
  for (const c of chaine) {
    const nue = derniereNue(c);
    const variante = derniereQuelconque(c);
    if (!nue) {
      if (variante) {
        lignes.push(`| \`${libelle(c)}\` | **PAS EXÉCUTÉ TEL QUEL** — seule la variante \`${cellule(variante.variante)}\` a tourné : ${cellule(variante.resultat)} | \`${court(variante.sha)}\` | ${variante.quand} | ${cellule(variante.source)} |`);
      } else {
        lignes.push(`| \`${libelle(c)}\` | **AUCUNE EXÉCUTION CONSIGNÉE** | — | — | — |`);
      }
      nonExecutees.push(c);
      continue;
    }
    const surHead = memeSha(nue.sha, head);
    lignes.push(`| \`${libelle(c)}\` | ${cellule(nue.resultat)} | \`${court(nue.sha)}\`${surHead ? '' : ' (PAS le HEAD)'} | ${nue.quand} | ${cellule(nue.source)} |`);
    if (!surHead) nonExecutees.push(c);
  }
  const listeNonExecutees = nonExecutees.length
    ? nonExecutees.map((c) => {
      const nue = derniereNue(c);
      const variante = derniereQuelconque(c);
      if (nue) return `- \`${libelle(c)}\` — dernière exécution sur \`${court(nue.sha)}\` le ${nue.quand} : ${cellule(nue.resultat)}`;
      if (variante) return `- \`${libelle(c)}\` — jamais exécuté TEL QUEL ; seule la variante \`${cellule(variante.variante)}\` l'a été, sur \`${court(variante.sha)}\` le ${variante.quand} : ${cellule(variante.resultat)}`;
      return `- \`${libelle(c)}\` — jamais consignée`;
    }).join('\n')
    : '- (aucune : chaque maillon de la chaîne a une exécution consignée sur ce HEAD)';

  const precedent = verify.precedent.nonExecutees.length
    ? verify.precedent.nonExecutees.map((c) => {
      const horsChaineMarque = chaine.includes(c) ? '' : ' [absente de la chaîne verify actuelle]';
      const nue = derniereNue(c);
      const variante = derniereQuelconque(c);
      if (!nue && !variante) return `- \`${libelle(c)}\` (${cellule(verify.precedent.source)})${horsChaineMarque} → **toujours non exécutée**`;
      if (!nue && variante) return `- \`${libelle(c)}\` (${cellule(verify.precedent.source)})${horsChaineMarque} → toujours non exécutée TELLE QUELLE ; seule la variante \`${cellule(variante.variante)}\` a tourné, sur \`${court(variante.sha)}\` le ${variante.quand} : ${cellule(variante.resultat)} — ${cellule(variante.source)}`;
      return `- \`${libelle(c)}\` (${cellule(verify.precedent.source)})${horsChaineMarque} → a tourné depuis : \`${court(nue!.sha)}\`${memeSha(nue!.sha, head) ? '' : ' (pas le HEAD)'}, ${nue!.quand}, ${cellule(nue!.resultat)} — ${cellule(nue!.source)}`;
    }).join('\n')
    : '- (le rapport précédent n\'en nommait aucune)';

  const horsChaine = verify.executions
    .filter((e) => !chaine.includes(e.commande))
    .sort((a, b) => quandValide(b) - quandValide(a));
  const autres = horsChaine.length
    ? horsChaine.map((e) => `- \`${e.commande}\` sur \`${court(e.sha)}\` le ${e.quand} : ${cellule(e.resultat)} — ${cellule(e.source)}`).join('\n')
    : '- (aucune)';

  return { table: lignes.join('\n'), nonExecutees, listeNonExecutees, precedent, autres };
}

/** Les sections de docs/CHASSE.md, pour que le lecteur sache ce qui est en cours sans l'ouvrir. */
export function sectionsChasse(chasse: string): string {
  const titres = chasse.split('\n').filter((l) => /^## /.test(l)).map((l) => l.replace(/^## /, ''));
  return titres.length ? titres.map((t) => `- ${t}`).join('\n') : '- (docs/CHASSE.md ne porte aucune section)';
}

const heures = (de: string, a: string): string => {
  const h = (Date.parse(a) - Date.parse(de)) / 3_600_000;
  return Number.isFinite(h) ? `il y a ${Math.round(h)} h` : 'âge non calculable';
};

/**
 * Remplit CHAQUE balise `{{X}}` par une fonction de remplacement (jamais une chaîne) : un état,
 * une note ou un titre contenant `$&`, `$'`, `` $` `` ou `$1` ne doit RIEN interpréter — sinon
 * String.replace le ferait en silence (cas connu mauvais dans reprise.test.ts). Une balise
 * absente du gabarit ne lève pas ici ; le garde-fou final la nomme si elle survit.
 */
function remplir(gabarit: string, valeurs: Record<string, string>): string {
  let texte = gabarit;
  for (const [balise, valeur] of Object.entries(valeurs)) {
    texte = texte.replaceAll(`{{${balise}}}`, () => valeur);
  }
  return texte;
}

export function rendre(e: Entrees): string {
  const g = e.git;
  const head = `\`${court(g.head)}\` — « ${g.sujet} »`;
  const arbre = g.modifies === 0
    ? 'arbre propre : le disque est HEAD'
    : `arbre MODIFIÉ (${g.modifies} fichier(s), docs/REPRISE.md excepté — son changement à chaque engendrement ne compte pas) : le disque n'est PAS HEAD — ce qui suit vaut pour HEAD, pas pour les modifications en cours`;
  const amont = g.amontSha
    ? (memeSha(g.head, g.amontSha)
      ? `HEAD = \`${g.amont}\` selon la dernière synchronisation locale (\`git fetch\` pour le confirmer)`
      : `\`${g.amont}\` est à \`${court(g.amontSha)}\` selon la dernière synchronisation locale : HEAD N'EST PAS POUSSÉ, ou la synchronisation est périmée — \`git fetch\` tranche`)
    : 'aucune branche amont connue';
  const headEtat = `${arbre} · ${amont}`;

  const s = e.servi;
  const servi = `\`${court(s.sha)}\` sur ${s.url}, mesuré le ${s.mesure.quand} (${heures(s.mesure.quand, e.date)}) par ${s.mesure.par}`
    + (memeSha(s.sha, g.head)
      ? ' — **ÉGAL au HEAD**'
      : ` — **DIFFÈRE du HEAD** \`${court(g.head)}\` : ce que l'URL sert n'est pas ce que le disque porte, ou la mesure est périmée ; relancer \`${s.mesure.commande ?? 'la mesure'}\` (depuis la CI ou une machine qui joint l'URL — le bac à sable de l'agent ne la joint pas)`)
    + (s.historique?.length
      ? `\n  Historique : ${s.historique.map((h) => `\`${court(h.sha)}\` le ${h.quand} (${h.par})`).join(' · ')}`
      : '');

  const fils = tableFils(e.fils, e.backlog);
  const processus = e.processus.length
    ? e.processus.map((p) => `- \`${p.replace(/`/g, '\'')}\``).join('\n')
    : '- aucun processus de harnais en cours (next, vitest, tsx, playwright, chromium)';
  const v = tableVerify(e.chaine, e.verify, g.head);

  const rempli = remplir(e.gabarit, {
    DATE: e.date,
    HEAD: head,
    HEAD_ETAT: headEtat,
    SERVI: servi,
    FILS: fils,
    PROCESSUS: processus,
    VERIFY: v.table,
    VERIFY_NON_EXECUTEES: v.listeNonExecutees,
    VERIFY_PRECEDENT: v.precedent,
    VERIFY_AUTRES: v.autres,
    CHASSE: sectionsChasse(e.chasse),
  });

  const restes = rempli.match(/\{\{[A-Z_]+\}\}/g);
  if (restes) throw new TransfertIncomplet(`balise(s) du gabarit non remplie(s) : ${[...new Set(restes)].join(', ')}`);
  return rempli;
}

/* ── ce que la machine sait, lu ici et injecté (le rendu reste pur) ────────── */

export function etatGit(cwd: string): Git {
  const g = (args: string[]): string =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
  const head = g(['rev-parse', 'HEAD']);
  const sujet = g(['log', '-1', '--format=%s']);
  /* docs/REPRISE.md est réécrit par CE script à chaque exécution (son horodatage change) : le
     compter comme une « modification » ferait dire « arbre modifié » après un simple
     ré-engendrement sur un arbre par ailleurs propre. Il est exclu du compte. */
  const modifies = g(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.endsWith('docs/REPRISE.md')).length;
  let amont: string | null = null;
  let amontSha: string | null = null;
  try {
    amont = g(['rev-parse', '--abbrev-ref', '@{u}']);
    amontSha = g(['rev-parse', '@{u}']);
  } catch {
    /* pas d'amont : dit tel quel dans le rendu */
  }
  return { head, sujet, modifies, amont, amontSha };
}

export function processusEnCours(): string[] {
  const r = spawnSync('pgrep', ['-af', 'next|vitest|tsx|playwright|chrom'], { encoding: 'utf8' });
  if (r.error) return [`pgrep indisponible (${r.error.message}) : non mesuré`];
  /* pgrep : 0 = trouvé, 1 = rien trouvé (les deux sont un résultat) ; 2 = motif invalide,
     3 = erreur interne — un stdout vide sur ces codes n'est PAS « aucun processus », c'est un
     instrument muet (règle 13). */
  if (r.status !== 0 && r.status !== 1) {
    return [`pgrep a échoué (code ${r.status}) : non mesuré, pas « aucun processus »`];
  }
  return (r.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/\bpgrep\b|\bnpm run reprise\b|scripts\/reprise\.ts/.test(l))
    .map((l) => (l.length > 200 ? `${l.slice(0, 90)} … ${l.slice(-100)}` : l));
}

/* ── conduite en ligne de commande ────────────────────────────────────────── */
if (process.argv[1]?.endsWith('reprise.ts')) {
  const racine = path.resolve(import.meta.dirname, '..', '..');
  const lire = (p: string): string => fs.readFileSync(path.join(racine, p), 'utf8');
  try {
    const pkg = JSON.parse(lire('app/package.json')) as { scripts: Record<string, string> };
    const e: Entrees = {
      date: new Date().toISOString(),
      git: etatGit(racine),
      servi: JSON.parse(lire('docs/instantanes/servi.json')) as Servi,
      fils: (JSON.parse(lire('docs/instantanes/fils.json')) as { fils: Fil[] }).fils,
      backlog: lire('docs/BACKLOG_REPORTE.md'),
      verify: JSON.parse(lire('docs/instantanes/verify.json')) as Verify,
      chaine: chaineVerify(pkg.scripts.verify),
      processus: processusEnCours(),
      chasse: lire('docs/CHASSE.md'),
      gabarit: lire('docs/reprise.src.md'),
    };
    const texte = rendre(e);
    fs.writeFileSync(path.join(racine, 'docs/REPRISE.md'), texte);
    const v = tableVerify(e.chaine, e.verify, e.git.head);
    console.log(
      `docs/REPRISE.md engendré — HEAD ${court(e.git.head)} (${e.git.modifies} fichier(s) modifié(s), REPRISE.md excepté), servi ${court(e.servi.sha)}`
      + `${memeSha(e.servi.sha, e.git.head) ? ' = HEAD' : ' ≠ HEAD'}, ${e.fils.length} fil(s), `
      + `${v.nonExecutees.length} commande(s) de verify sans exécution sur ce HEAD : ${v.nonExecutees.join(', ') || '(aucune)'}.`,
    );
  } catch (err) {
    console.error(`REFUS — ${(err as Error).message}`);
    process.exit(1);
  }
}
