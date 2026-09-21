import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium, conseilChromium } from '../lib/portable.mjs';
import { chromium } from 'playwright';
import { getDb } from '../../src/lib/db/client';
import { baseSemee } from '../screens/routes';
import { contexte } from './contexte';
import { conduire, type Etape, type Geste } from './scenario';
import { preconditionDe } from './preconditions';
import {
  stationsDe, jamaisAtteintes, empreintes, classerPageerrors, depassementsDePlafond,
  type Fige, type Avertissements,
} from '../../src/lib/parcours';
import type { Station } from '../../src/lib/parcours';
import { poserLaSonde } from './hydratation';

// npm run clics [-- --dev] : CONDUIT le parcours dans un navigateur, sur un
// build de production, et sort en échec sur la première règle qui ne tient pas.
//
// POURQUOI IL EXISTE À CÔTÉ DE `npm run screens` : le balayage ouvre les 60
// routes et vérifie qu'elles RENDENT. Il ne clique sur rien, donc il n'a rien
// vu quand six formulaires étaient inertes en production (ADR-078), ni quand un
// dossier créé était inatteignable (ADR-088). Les deux fois, le contrôle
// manquant n'était pas difficile : il était absent de ce qu'on lance.

const PORT = Number(process.env.CLICS_PORT ?? 3211);
const NAVIGATEUR = cheminChromium();

const BIN_NEXT = binaireDe('next', process.cwd());
function lancer(args: string[]): ChildProcess {
  /* `next` exécuté par le Node courant, jamais via `npx` (introuvable sous
     Windows sans shell — scripts/lib/portable.mjs). Sur POSIX `detached` crée
     un GROUPE : sans lui `kill` laisse `next-server` tenir le port. */
  if (!BIN_NEXT) throw new Error('next est absent de node_modules — lancez `npm install` dans app/');
  return spawn(process.execPath, [BIN_NEXT, ...args], {
    env: {
      ...process.env,
      PORT: String(PORT),
      /* AUCUN APPEL PAYANT DEPUIS UN HARNAIS. L'échelle d'extraction sait
         monter jusqu'à un modèle ; un harnais lancé à chaque `npm run verify`
         qui dépenserait sur un budget prépayé serait un défaut, pas une
         fonctionnalité. Le barreau de rejeu est le défaut du produit — on le
         RÉAFFIRME ici pour que l'environnement ne puisse pas en décider. */
      OTTO_OCR_ADAPTER: 'mock',
      OTTO_QUERY_PLANNER: 'mock',
      OTTO_TRANSCRIPT_ADAPTER: 'mock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: groupeDetache(),
  });
}
function tuer(p: ChildProcess | null): void {
  if (p?.pid) tuerArbre(p.pid);
}
async function portLibre(port: number): Promise<boolean> {
  try { await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }); return false; }
  catch { return true; }
}
async function attendre(url: string, enfant: ChildProcess, secondes = 150): Promise<void> {
  const fin = Date.now() + secondes * 1000;
  while (Date.now() < fin) {
    if (enfant.exitCode !== null || enfant.signalCode !== null) {
      throw new Error(`le serveur s'est arrêté immédiatement (code ${enfant.exitCode ?? enfant.signalCode})`);
    }
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.status > 0) return; }
    catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`le serveur n'est pas debout après ${secondes}s sur ${url}`);
}

async function main() {
  const dev = process.argv.includes('--dev');
  /* P0-04 (AUD-17). `--station=<préfixe>` : une station se rejoue seule (voir le filtre dans
     `scenario.ts`, `station()`). Le registre de préconditions (`preconditions.ts`) tourne ICI,
     PENDANT que le script tient encore la base — jamais dans `conduire()`, où le serveur (donc
     un AUTRE processus) l'aurait déjà prise (PGlite n'admet qu'un écrivain). */
  const stationFiltre = process.argv.find((a) => a.startsWith('--station='))?.slice('--station='.length);

  if (!(await baseSemee())) {
    throw new Error('base vide : lancez `npm run db:setup && npm run demo:seed`. '
      + 'Cliquer dans une base vide ne prouve rien.');
  }
  if (!(await portLibre(PORT))) {
    /* Vérifier ce qu'on n'a pas démarré soi-même, c'est ne rien vérifier : un
       serveur oublié garde SA base en mémoire et répond des vérités périmées. */
    throw new Error(`le port ${PORT} est occupé — un serveur d'un lancement précédent, probablement. `
      + `Le parcours REFUSE de conduire un serveur qu'il n'a pas lancé. Libérez-le, ou CLICS_PORT=<autre>.`);
  }

  /* Tout ce dont le parcours a besoin est lu AVANT que le serveur ne prenne la
     base : PGlite n'admet qu'un écrivain. */
  const c = await contexte();
  if (stationFiltre) {
    const precondition = preconditionDe(stationFiltre);
    if (precondition) {
      console.log(`  précondition « ${stationFiltre} » : posée par service (voir preconditions.ts)…`);
      await precondition(c);
    } else {
      console.log(`  aucune précondition déclarée pour « ${stationFiltre} » — la base semée par défaut est le seul état posé.`);
    }
  }
  await (await getDb()).close();

  console.log(`\nParcours cliqué — mode ${dev ? 'développement' : 'PRODUCTION'}, dossier ${c.eng}`);
  console.log(`  identités : ${c.preparateur.nom} (préparateur) · ${c.reviewer.nom} (reviewer) · ${c.associe.nom} (associé)\n`);

  if (!dev) {
    console.log('  build…');
    const build = lancer(['build']);
    const sortie: string[] = [];
    build.stdout?.on('data', (d) => sortie.push(String(d)));
    build.stderr?.on('data', (d) => sortie.push(String(d)));
    const code = await new Promise<number>((r) => build.on('close', (c) => r(c ?? 1)));
    if (code !== 0) { console.log(sortie.join('')); throw new Error('le build de production a échoué'); }
  }

  const serveur = lancer(dev ? ['dev', '-p', String(PORT)] : ['start', '-p', String(PORT)]);
  const journal: string[] = [];
  serveur.stdout?.on('data', (d) => journal.push(String(d)));
  serveur.stderr?.on('data', (d) => journal.push(String(d)));

  let etapes: Etape[] = [];
  let gestes: Geste[] = [];
  const durs: string[] = [];
  /* P0-02 (AUD-16) : les `pageerror` seules — jamais `console`/HTTP 5xx —, DANS L'ORDRE de
     survenue, pour être corrélées positionnellement à `sonde.incidents` après coup (les deux
     écoutent le même événement, la sonde en async — la corrélation ne peut se faire qu'une fois
     le navigateur fermé, quand tout a fini de résoudre). */
  const pageerrors: string[] = [];
  let sonde: import('./hydratation').Sonde | null = null;
  try {
    await attendre(`http://localhost:${PORT}/`, serveur);
    const nav = await chromium.launch({ executablePath: NAVIGATEUR })
      .catch((e) => { throw new Error(`${conseilChromium()}\n${e.message}`); });
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    /* Une exception côté navigateur ne fait pas échouer une étape : elle passe
       inaperçue si personne ne l'écoute. C'est un échec à part entière. */
    /* DIRE OÙ. « EXCEPTION : Minified React error #418 » sans l'écran qui l'a
       levée oblige à tout refaire à la main pour l'attribuer — le harnais
       reproduit alors le défaut qu'il cherche : une panne qu'on ne sait pas
       lire est une panne qu'on impute au mauvais changement. */
    const ou = () => page.url().replace(`http://localhost:${PORT}`, '') || '(page inconnue)';
    /* LA SONDE D'HYDRATATION (fil n°7). Elle N'ENLÈVE RIEN : l'exception reste
       comptée en dur ci-dessous (sauf classification P0-02 explicite, plus bas).
       Elle ajoute ce qui manquait pour conclure — le HTML SERVI et le DOM au
       moment de l'erreur, côte à côte. */
    sonde = poserLaSonde(page, `http://localhost:${PORT}`, path.join(process.cwd(), '.hydratation'));
    page.on('pageerror', (e) => {
      const ligne = `EXCEPTION sur ${ou()} : ${e.message}`;
      durs.push(ligne);
      pageerrors.push(ligne);
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|DevTools/.test(m.text())) {
        durs.push(`CONSOLE sur ${ou()} : ${m.text()}`);
      }
    });
    page.on('response', (r) => { if (r.status() >= 500) durs.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      ({ etapes, gestes } = await conduire(page, ctx, `http://localhost:${PORT}`, c));
      /* REVUE HOSTILE (2026-09-20, P0-02, finding #1) : sans cette attente, `sonde.incidents`
         pouvait être lu avant que tous ses incidents en cours ne soient résolus — attendre ICI,
         page encore ouverte, avant `nav.close()` (un `page.evaluate()` sur une page fermée
         dégraderait l'incident au lieu de le compléter). */
      if (sonde) await sonde.attendre();
    } finally {
      await nav.close();
    }
  } finally {
    tuer(serveur);
  }

  for (const e of etapes) console.log(`  ${e.ok ? 'ok  ' : 'ÉCHEC'}  ${e.nom}\n         ${e.detail}`);
  if (sonde) for (const l of sonde.rapport()) console.log(l);

  /* P0-02 (AUD-16) : classer les `pageerror` de signature CONNUE en avertissement compté, sous
     plafond figé — jamais « toute erreur navigateur », seulement celles que `classifierIncident`
     reconnaît sur leur PREMIÈRE divergence d'hydratation. Corrélation par POSITION : `pageerrors`
     (toutes) et `sonde.incidents` (uniquement les codes 418/419/422/423/425) avancent au même
     rythme, dans le même ordre — un `pageerror` qui ne correspond à aucun de ces codes n'a jamais
     d'entrée dans `sonde.incidents` et reste donc, à raison, non classable. */
  const { dursReels, avertissementsComptes } = classerErreursNavigateur(durs, pageerrors, sonde?.incidents ?? []);
  if (Object.keys(avertissementsComptes).length) {
    console.log('\nAvertissements de signature connue (P0-02) :');
    for (const [id, n] of Object.entries(avertissementsComptes)) console.log(`  · ${id} : ${n}`);
  }

  /* LE HARNAIS NE DOIT PAS POUVOIR SE TAIRE. Zéro étape conduite est une panne
     du harnais, pas un parcours réussi. Un SEUIL ne suffit pas — il dit combien,
     jamais LESQUELLES : la garde nominative est plus bas (défaut n°22). */
  if (etapes.length < 30) {
    console.log(`\nseulement ${etapes.length} étape(s) conduites — le parcours s'est interrompu\n`);
    process.exit(1);
  }
  /* UN RUN FILTRÉ (`--station=`) N'EST PAS LA SOURCE DE VÉRITÉ DE docs/CLICS.md : il n'a conduit
     qu'une poignée de gestes, et l'écrire écraserait le compte du parcours ENTIER par une mesure
     partielle qui se lirait comme le tout (règle 16 : une preuve empruntée). Seul un run complet
     l'engendre. */
  if (!stationFiltre) ecrireClics(gestes);
  const depassements = plafondsDepasses(avertissementsComptes);
  if (depassements.length) {
    console.log('\nPlafond d’avertissement DÉPASSÉ (P0-02) :');
    for (const d of depassements) console.log(`  · ${d}`);
  }
  /* FIGER N'EST PAS UN EFFET DE BORD : un parcours qui figerait tout seul ce
     qu'il vient d'atteindre accepterait sa propre maigreur. On ne fige que sur
     demande explicite, et seulement si tout est vert — les avertissements de
     signature connue, SOUS leur plafond, sont admis (P0-02) ; les dépasser ne
     l'est jamais. */
  /* Un run filtré ne fige jamais : les stations hors filtre n'y figurent que sous leur entrée
     « ignorée », et les y figer écrirait un figé qui ne distingue plus « conduite » de
     « sautée ». Figer reste le geste d'un parcours COMPLET, jamais d'une tranche. */
  const figeMaintenant = !stationFiltre && process.argv.includes('--figer') && etapes.every((e) => e.ok)
    && dursReels.length === 0 && depassements.length === 0;
  if (figeMaintenant) figer(etapes);

  const echecs = etapes.filter((e) => !e.ok);
  /* LA GARDE NOMINATIVE DU PARCOURS (défaut n°22). Une station derrière un
     `if` — « si le bouton est là, clique » — s'éteint le jour où le bouton
     change de nom : le rapport reste VERT avec moins d'étapes, et personne ne
     voit que la clôture n'est plus vérifiée. On compare donc les stations
     CONDUITES à celles d'une exécution verte figée dans docs/PARCOURS.json —
     ce que la garde statique (`npm run parcours`) ne peut pas voir, puisqu'elle
     lit le code et non ce qui a été atteint.
     UN RUN FILTRÉ (`--station=`) NE PEUT PAS PASSER CETTE GARDE, ET C'EST ATTENDU, PAS UN DÉFAUT :
     le figé porte les `dire(...)` INDIVIDUELS (plus fins que le nom du `station(nom, fn)` extérieur
     — une seule station « rail » en déclare cinq), et l'entrée « ignorée » posée par le filtre n'en
     couvre qu'UN, sous le nom extérieur. Comparer un run partiel au figé d'un run COMPLET dirait
     à tort que tout le reste s'est éteint. La garde reste donc réservée au run NON filtré — dit
     ici, jamais tue en silence (règle 19 : une garde qui cesse de regarder le dit). */
  const eteintes = stationFiltre ? [] : manquantes(etapes);
  /* UNE GARDE QUI NE VÉRIFIE RIEN DOIT LE DIRE. Avec un figé vide — première
     exécution, fichier absent, mauvais répertoire de lancement — `jamais-
     Atteintes` rend une liste vide et se laisse lire comme un succès. C'est le
     défaut que cette garde existe pour attraper, appliqué à elle-même. */
  const figees = lireFige().conduites.length;
  /* UN LANCEMENT `--figer` NE VÉRIFIE RIEN : il vient d'écrire la liste qu'il
     relit. Le dire, sinon la ligne se lit comme un contrôle passé. */
  /* ET UN `--figer` SUR UN PARCOURS ROUGE N'A RIEN FIGÉ : le dire aussi. La
     ligne annonçait « FIGÉES à l'instant » alors que le figé précédent était
     resté tel quel — un figé daté d'avant, lu comme un figé du jour. */
  console.log(figeMaintenant
    ? `\ngarde du parcours : ${figees} station(s) FIGÉES à l’instant — rien n’a été vérifié contre elles.`
    : process.argv.includes('--figer')
      ? `\ngarde du parcours : parcours ROUGE, RIEN n’a été figé — le figé précédent (${figees} station(s)) est inchangé.`
      : stationFiltre
        ? `\ngarde du parcours : NON vérifiée — run filtré --station=${stationFiltre} (${figees} station(s) dans le figé, non comparées).`
        : `\ngarde du parcours : ${figees} station(s) figée(s) vérifiée(s).`);
  /* Un run filtré ne peut jamais satisfaire cette garde (il ne fige jamais, voir ci-dessus) : la
     lui appliquer ferait échouer À TORT tout `--station=` tant que le figé existant est vide —
     un cas aujourd'hui impossible (docs/PARCOURS.json en porte 325) mais latent (revue hostile,
     Phase 0). La garde reste réservée au run complet. */
  if (!stationFiltre && figees === 0 && !process.argv.includes('--figer')) {
    console.log('LA GARDE D’EXÉCUTION NE VÉRIFIE RIEN — figez un parcours vert : '
      + '`npm run clics -- --figer`.\n');
    process.exit(1);
  }
  if (dursReels.length) { console.log('\nErreurs côté navigateur (non classées) :'); for (const d of dursReels.slice(0, 12)) console.log('  ' + d); }
  const total = gestes.reduce((n, g) => n + g.clics, 0);
  console.log(`\n${etapes.length} étapes conduites · ${echecs.length + dursReels.length} échec(s) · ${total} clics comptés sur ${gestes.length} gestes · `
    + (stationFiltre ? `docs/CLICS.md NON écrit (run filtré --station=${stationFiltre})\n` : 'docs/CLICS.md écrit\n'));

  if (eteintes.length) {
    console.log(`\n${eteintes.length} station(s) FIGÉE(S) MAIS JAMAIS ATTEINTE(S) — le parcours vérifie moins qu'hier :`);
    for (const st of eteintes) console.log(`  · ${st.nom}`);
    console.log('Si l’extinction est voulue, refigez sur un parcours vert : `npm run clics -- --figer`.\n');
  }
  if (echecs.length || dursReels.length || depassements.length || eteintes.length) {
    const err = journal.join('').split('\n').filter((l) => /Error:|at async|at [A-Z]/.test(l)).slice(0, 30);
    if (err.length) console.log('Journal du serveur :\n' + err.join('\n') + '\n');
    process.exit(1);
  }
}

/**
 * P0-02 (AUD-16). Sépare les `pageerror` en deux : celles de signature connue (comptées, jamais
 * retirées de `durs` pour la lecture brute, mais retirées de ce qui bloque) et le reste
 * (`dursReels`, ce qui reste bloquant : `console`, HTTP 5xx, et toute `pageerror` non classée).
 * Le calcul lui-même vit dans `src/lib/parcours.ts` (pur, testable) ; ce module ne fait que lire
 * le fichier des signatures connues et le lui passer.
 */
function classerErreursNavigateur(
  durs: string[],
  pageerrors: string[],
  incidents: { ecarts: { serveur: string; client: string }[] }[],
): { dursReels: string[]; avertissementsComptes: Record<string, number> } {
  return classerPageerrors(durs, pageerrors, incidents, lireAvertissements().signatures);
}

function lireAvertissements(): Avertissements {
  /* Même discipline que FIGE ci-dessous : le chemin ne dépend pas d'où l'on lance. */
  const chemin = path.join(APP, '..', 'docs', 'instantanes', 'parcours-avertissements.json');
  if (!fs.existsSync(chemin)) return { signatures: [] };
  return JSON.parse(fs.readFileSync(chemin, 'utf8')) as Avertissements;
}

function plafondsDepasses(comptes: Record<string, number>): string[] {
  return depassementsDePlafond(comptes, lireAvertissements().signatures);
}

/**
 * LES CLICS PUBLIÉS (mandat §3.D). Le parcours COMPTE les clics réellement
 * dispatchés dans la page, geste métier par geste métier, et les écrit.
 *
 * Ce que le tableau dit : ce que coûte ce geste PAR LE CHEMIN DU PARCOURS —
 * qui vérifie aussi des refus, déplie des replis et change d'identité. C'est
 * un plafond honnête, jamais un record : il ne prétend pas au chemin optimal,
 * et le document le dit en toutes lettres plutôt que de laisser croire.
 */
function ecrireClics(gestes: Geste[]): void {
  if (!gestes.length) return;
  const total = gestes.reduce((n, g) => n + g.clics, 0);
  const md = [
    '<!-- ENGENDRÉ par `cd app && npm run clics` — ne pas éditer à la main. -->',
    '# Clics comptés, geste par geste',
    '',
    `Parcours du ${new Date().toISOString().slice(0, 10)} · ${gestes.length} gestes · **${total} clics** au total.`,
    '',
    'Le compteur est posé DANS la page et écoute les vrais événements de clic : il compte ce',
    'qu\'un humain aurait cliqué (dépliages compris), jamais ce que le harnais fait sans souris',
    '(navigation directe, changement d\'identité).',
    '',
    '**Ce que ce tableau n\'est PAS** : le chemin optimal. Le parcours vérifie aussi des REFUS —',
    'il clique exprès des choses interdites pour prouver qu\'elles sont refusées — et emprunte',
    'parfois le chemin long pour éprouver un repli. Lisez ces nombres comme un PLAFOND mesuré,',
    'pas comme un record : le geste réel d\'un auditeur coûte au plus cela.',
    '',
    '| Geste (station du parcours) | Clics |',
    '|---|---|',
    ...gestes.map((g) => `| ${g.nom} | ${g.clics} |`),
    '',
  ].join('\n');
  const dossier = path.join(process.cwd(), '..', 'docs');
  fs.writeFileSync(path.join(dossier, 'CLICS.md'), md, 'utf8');
}

/* LES STATIONS D'UNE EXÉCUTION VERTE, FIGÉES PAR NOM. On garde le PRÉFIXE des
   noms construits (« risque : surcharger le niveau (élevé → moyen)… ») : le
   reste dépend des données du jour et ne s'oppose à rien. */
/* LE CHEMIN NE DÉPEND PAS D'OÙ L'ON LANCE. Avec `process.cwd()`, un lancement
   depuis la racine du dépôt rendait le figé introuvable — et le garde
   disparaissait SANS UN MOT, ce qui est exactement ce qu'il interdit. */
const APP = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const FIGE = path.join(APP, '..', 'docs', 'PARCOURS.json');

function lireFige(): Fige {
  if (!fs.existsSync(FIGE)) return { declarees: [], conduites: [] };
  return JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Fige;
}

function declarees(): Station[] {
  return stationsDe(fs.readFileSync(
    path.join(APP, 'scripts', 'clics', 'scenario.ts'), 'utf8'));
}

/** Les stations figées qu'une exécution n'a pas atteintes. */
function manquantes(etapes: Etape[]): Station[] {
  return jamaisAtteintes(lireFige().conduites, etapes.map((e) => e.nom));
}

/** Figer les stations d'un parcours vert — jamais celles d'un parcours rouge. */
function figer(etapes: Etape[]): void {
  const dec = declarees();
  const conduites = empreintes(etapes.map((e) => e.nom), dec);
  /* VERT N'EST PAS COMPLET. Un parcours vert peut n'avoir conduit que la
     moitié de ce que le scénario déclare — figer sans le dire bénirait
     l'appauvrissement. Les stations déclarées et jamais atteintes sont donc
     ÉCRITES dans le figé, sous leur nom, et affichées ici. La plupart sont des
     branches d'échec (« aucun papier dans le dossier ») ; les autres sont du
     travail à faire, et elles se voient. */
  const jamais = dec.filter((d) => !conduites.some((c) => c.nom === d.nom && c.gabarit === d.gabarit));
  fs.writeFileSync(FIGE, `${JSON.stringify(
    { declarees: dec, conduites, jamaisConduites: jamais.map((x) => x.nom) }, null, 2)}\n`);
  console.log(`docs/PARCOURS.json : ${conduites.length} station(s) conduite(s) figée(s)`
    + ` · ${jamais.length} déclarée(s) JAMAIS atteinte(s) sur ce parcours vert.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
