#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  estWindows, binaireDe, groupeDetache, tuerArbre,
  enchaine, avecPort, commandeReinstalle, conseilNode, causeEchecBase,
} from '../lib/portable.mjs';

// npm run demo — UNE commande, d'une base vide jusqu'à l'écran ouvert.
//
// POURQUOI CE FICHIER EST EN JAVASCRIPT NU, sans une seule dépendance.
// C'est le premier fichier qu'exécute une machine neuve, et il doit pouvoir
// dire « lancez `npm install` » — ce qu'un script écrit en TypeScript ne peut
// pas faire, puisqu'il lui faudrait `tsx` pour démarrer. Un message d'accueil
// qui a besoin de ce qu'il vérifie ne vérifie rien.
//
// CE QU'IL PROMET. Chaque étape qui peut échouer sur une machine neuve échoue
// en DISANT quoi faire, jamais en déroulant une trace : ce qui a été tenté, ce
// que la machine a répondu, et la commande qui répare. Une trace est une preuve
// qu'on a planté ; une consigne est une preuve qu'on avait prévu.
//
// ET IL NE LANCE JAMAIS `npx` : sur Windows c'est `npx.cmd`, qu'un spawn sans
// shell ne trouve pas (`spawn npx ENOENT` — trouvé par le premier utilisateur
// Windows, sur la première machine que l'auteur n'avait pas testée). Chaque
// outil est exécuté par le Node courant, fichier JavaScript en main
// (scripts/lib/portable.mjs). Corollaire du message d'erreur : un échec de
// LANCEMENT (exécutable introuvable) n'est jamais raconté comme un échec de
// MIGRATION — le premier message envoyait chercher un conflit de base alors
// que le programme n'avait pas démarré.

import { etatCleIa } from './cle.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(ICI, '..', '..');          // …/app
const PORT = Number(process.env.PORT || 3000);
const BASE = `http://localhost:${PORT}`;
const DEV = process.argv.includes('--dev');
/* LE MODE « IA RÉELLE » (ADR-105) : le rejeu reste le DÉFAUT — une
   démonstration sans réseau ne dépense rien et ne surprend personne. `--ia`
   (ou `npm run demo:ia`) active l'échelon OCR vivant : la clé reste dans
   app/.env.local (jamais lue par ce script — seulement sa présence), le
   monde de démonstration est déroulé en REJEU (zéro dépense), puis le
   SERVEUR seul lit avec le modèle, sous garde de budget. */
const IA = process.argv.includes('--ia');
const BUDGET_USD = process.env.OTTO_BUDGET_USD ?? '5';

const t0 = Date.now();
const chrono = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const C = process.stdout.isTTY
  ? { gras: '\x1b[1m', faible: '\x1b[2m', vert: '\x1b[32m', jaune: '\x1b[33m', rouge: '\x1b[31m', bleu: '\x1b[36m', fin: '\x1b[0m' }
  : { gras: '', faible: '', vert: '', jaune: '', rouge: '', bleu: '', fin: '' };

let etape = 0;
const TOTAL = (DEV ? 4 : 5) + (IA ? 1 : 0);
function annonce(texte) {
  etape += 1;
  process.stdout.write(`${C.faible}[${chrono()}]${C.fin} ${C.gras}${etape}/${TOTAL}${C.fin} ${texte}\n`);
}
function detail(texte) {
  process.stdout.write(`${C.faible}        ${texte}${C.fin}\n`);
}

/**
 * L'ARRÊT QUI EXPLIQUE. Trois choses, toujours : ce qu'on faisait, ce que la
 * machine a répondu, et ce qu'il faut faire. Le troisième point est le seul qui
 * compte pour quelqu'un qui découvre le dépôt.
 */
function arret({ quoi, pourquoi, faire, sortie }) {
  process.stdout.write(`\n${C.rouge}${C.gras}✖ ${quoi}${C.fin}\n`);
  if (pourquoi) process.stdout.write(`\n  ${pourquoi}\n`);
  if (sortie && sortie.trim()) {
    const lignes = sortie.trim().split('\n').slice(-12);
    process.stdout.write(`\n${C.faible}  ce que la commande a répondu :${C.fin}\n`);
    for (const l of lignes) process.stdout.write(`${C.faible}  │ ${l}${C.fin}\n`);
  }
  process.stdout.write(`\n${C.jaune}  À faire :${C.fin} ${faire}\n\n`);
  process.exit(1);
}

/**
 * Un enfant, sa sortie capturée, et une promesse qui ne rejette jamais.
 * `lancement` est l'erreur de DÉMARRAGE (exécutable introuvable, permission),
 * distincte d'un code de sortie non nul : le programme n'a alors jamais
 * commencé, et le message doit le dire — pas accuser la base ni les
 * migrations. C'est le défaut que ce dépôt traque partout : un message qui
 * envoie corriger la mauvaise chose est pire qu'un message sec.
 */
function lancer(fichierJs, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [fichierJs, ...args], {
      cwd: APP,
      env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    let sortie = '';
    p.stdout?.on('data', (d) => { sortie += d; });
    p.stderr?.on('data', (d) => { sortie += d; });
    p.on('error', (e) => resolve({ code: null, sortie, lancement: e }));
    p.on('close', (code) => resolve({ code: code ?? 1, sortie }));
  });
}

/** L'échec de lancement a UN message, quel que soit l'endroit où il survient. */
function gardeLancement(res, quoi) {
  if (!res.lancement) return;
  arret({
    quoi: `${quoi} — l'exécutable n'a pas pu être lancé.`,
    pourquoi: `Node (${process.execPath}) n'a pas pu démarrer le programme : `
      + `${res.lancement.code ?? res.lancement.message}. Le travail n'a pas commencé — `
      + 'ce n\'est ni la base, ni les migrations, ni votre dossier.',
    faire: `vérifiez l'installation de Node puis relancez \`npm run demo\`. `
      + `Si cela persiste : \`${enchaine(['cd app', commandeReinstalle()])}\`.`,
  });
}

function portLibre(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function repond(url, msMax) {
  const fin = Date.now() + msMax;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.status > 0) return true;
    } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── 0. CE QUI DOIT ÊTRE VRAI AVANT DE COMMENCER ──────────────────────────────

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 18 || (maj === 18 && min < 18)) {
  arret({
    quoi: `Node ${process.versions.node} est trop ancien.`,
    pourquoi: 'Next 15 demande Node 18.18 ou plus récent.',
    faire: `${conseilNode()}, puis relancez \`npm run demo\`.`,
  });
}

if (!fs.existsSync(path.join(APP, 'node_modules'))) {
  arret({
    quoi: 'Les dépendances ne sont pas installées.',
    pourquoi: `Le dossier node_modules est absent de ${APP}.`,
    faire: `lancez \`${enchaine(['cd app', 'npm install'])}\`, puis \`npm run demo\`.`,
  });
}

/* Les outils sont résolus vers leur VRAI fichier JavaScript, jamais lancés
   via `npx` (introuvable sous Windows sans shell). Résoudre ici, avant de
   toucher à quoi que ce soit : un outil absent est un défaut d'installation,
   et il doit être dit comme tel. */
const OUTILS = {};
for (const paquet of ['tsx', 'next']) {
  const bin = binaireDe(paquet, APP);
  if (!bin) {
    arret({
      quoi: `L'outil « ${paquet} » est absent des dépendances installées.`,
      pourquoi: 'L\'installation est probablement partielle ou interrompue.',
      faire: `lancez \`${enchaine(['cd app', commandeReinstalle()])}\`, puis \`npm run demo\`.`,
    });
  }
  OUTILS[paquet] = bin;
}

if (IA) {
  const etat = etatCleIa(APP);
  if (etat !== 'presente') {
    arret({
      quoi: 'Le mode IA réelle demande une clé, et elle est absente.',
      pourquoi: etat === 'fichier_absent'
        ? `Le fichier ${path.join('app', '.env.local')} n'existe pas.`
        : `Le fichier ${path.join('app', '.env.local')} ne contient pas de ligne ANTHROPIC_API_KEY=… non vide.`,
      faire: 'créez app/.env.local contenant une ligne `ANTHROPIC_API_KEY=votre-clé` (ce script '
        + 'ne lit jamais la valeur, seulement sa présence ; seule l\'application la lit, au moment '
        + 'd\'appeler le modèle). Puis relancez `npm run demo:ia`. Sans clé, `npm run demo` '
        + 'montre tout en rejeu, gratuitement.',
    });
  }
}

const RACINE = path.resolve(APP, '..');
const FEC = path.join(RACINE, 'dataset', '999888777FEC20251231.txt');
if (!fs.existsSync(FEC)) {
  arret({
    quoi: 'Le jeu de données synthétique est absent.',
    pourquoi: `Le fichier ${path.relative(RACINE, FEC)} n'existe pas. Toutes les données de démonstration en dépendent.`,
    faire: `lancez \`${enchaine(['cd app', 'npm run dataset:generate'])}\` (déterministe : mêmes octets à chaque fois), puis \`npm run demo\`.`,
  });
}

/* UNE SEULE DÉMONSTRATION À LA FOIS — le défaut trouvé en testant le conseil
   que ce script donne lui-même. « Le port est pris ? lancez PORT=3100 » : la
   seconde instance passait la vérification du port, puis EFFAÇAIT la base sous
   les pieds de la première, qui continuait de servir un répertoire supprimé.
   PGlite n'admet qu'un écrivain, et le port ne dit rien de la base. Un verrou
   nommé, avec le pid et le port de celle qui tourne, le dit. */
const VERROU = path.join(APP, '.data', 'demo.lock');
if (fs.existsSync(VERROU)) {
  let vivant = null;
  try {
    const v = JSON.parse(fs.readFileSync(VERROU, 'utf8'));
    process.kill(v.pid, 0);               // lève si le processus n'existe plus
    vivant = v;
  } catch { /* verrou périmé : le processus est mort, on passe outre */ }
  if (vivant) {
    arret({
      quoi: 'Une démonstration tourne déjà.',
      pourquoi: `Elle écoute sur le port ${vivant.port} (processus ${vivant.pid}) et tient la base locale. `
        + 'En lancer une seconde effacerait la base sous ses pieds : PGlite n\'admet qu\'un écrivain, '
        + 'et changer de port n\'y change rien.',
      faire: `ouvrez ${vivant.url} pour la reprendre, ou arrêtez-la (Ctrl-C dans son terminal) avant de relancer.`,
    });
  }
  fs.rmSync(VERROU, { force: true });
}

if (!(await portLibre(PORT))) {
  arret({
    quoi: `Le port ${PORT} est déjà occupé.`,
    pourquoi: 'Une autre application — peut-être une démonstration précédente restée ouverte — écoute déjà sur ce port.',
    faire: `arrêtez-la (Ctrl-C dans son terminal), ou choisissez un autre port : \`${avecPort(3100, 'npm run demo')}\`.`,
  });
}

process.stdout.write(`\n${C.gras}OTTO — démonstration${IA ? ' · IA RÉELLE' : ''}${C.fin} ${C.faible}(données entièrement synthétiques)${C.fin}\n`);
process.stdout.write(`${C.faible}Base repartie de zéro, monde de démonstration déroulé${IA ? ' (en rejeu, zéro dépense)' : ''}, serveur ${DEV ? 'de développement' : 'de production'}${IA ? ` avec l'échelon OCR vivant (plafond ${BUDGET_USD} $)` : ''}.${C.fin}\n\n`);

// ── 1. LA BASE, REPARTIE DE ZÉRO ─────────────────────────────────────────────

annonce('base de données remise à zéro et migrations appliquées…');
fs.mkdirSync(path.join(APP, '.data'), { recursive: true });
fs.writeFileSync(VERROU, JSON.stringify({ pid: process.pid, port: PORT, url: BASE }));
const leverVerrou = () => { try { fs.rmSync(VERROU, { force: true }); } catch { /* déjà parti */ } };
process.on('exit', leverVerrou);
/* Sur Windows, supprimer un fichier qu'un processus tient ouvert échoue
   (EBUSY/EPERM) là où Linux l'accepte : sans cette garde, un serveur oublié
   ferait dérouler une trace — exactement ce que ce script promet de ne
   jamais faire. */
try {
  for (const dossier of ['pg', 'blobs']) {
    fs.rmSync(path.join(APP, '.data', dossier), { recursive: true, force: true });
  }
} catch (e) {
  arret({
    quoi: 'Impossible d\'effacer la base locale pour repartir de zéro.',
    pourquoi: `Un processus tient encore des fichiers sous app/.data (${e.code ?? e.message}). `
      + (estWindows() ? 'Sous Windows, un fichier ouvert par un programme ne peut pas être supprimé.'
        : 'Un serveur d\'un lancement précédent est probablement resté ouvert.'),
    faire: 'fermez la démonstration ou le serveur resté ouvert (Ctrl-C dans son terminal, ou fermez ce terminal), puis relancez `npm run demo`.',
  });
}
{
  const res = await lancer(OUTILS.tsx, ['scripts/db-setup.ts']);
  gardeLancement(res, 'La création de la base locale');
  if (res.code !== 0) {
    /* CHAQUE CAUSE A SON MESSAGE (causeEchecBase, testée dans
       tests/portable.test.ts). Le premier utilisateur Windows a reçu
       « vérifiez que rien n'utilise app/.data » pour un exécutable
       introuvable : il a cherché un conflit de base qui n'existait pas. */
    const cause = causeEchecBase(res.sortie);
    arret({
      quoi: 'La création de la base locale a échoué.',
      pourquoi: cause === 'espace' ? 'Le disque est plein : PGlite ne peut pas écrire son répertoire de données.'
        : cause === 'tenue' ? 'Un autre processus tient la base locale (un serveur ou une démonstration restés ouverts).'
        : cause === 'casse' ? 'Des modules installés manquent : l\'installation est probablement partielle ou interrompue.'
        : 'Les migrations n\'ont pas pu s\'appliquer sur une base neuve. La cause exacte est dans les lignes ci-dessous.',
      faire: cause === 'espace' ? 'libérez de l\'espace disque, puis relancez `npm run demo`.'
        : cause === 'tenue' ? 'fermez les autres terminaux qui font tourner OTTO, puis relancez `npm run demo`.'
        : cause === 'casse' ? `lancez \`${enchaine(['cd app', commandeReinstalle()])}\`, puis \`npm run demo\`.`
        : 'relancez `npm run demo` ; si cela se reproduit, c\'est un défaut du dépôt, pas de votre machine — envoyez les lignes ci-dessus telles quelles.',
      sortie: res.sortie,
    });
  }
  detail('20 migrations, cabinet et clientes fictives créés');
}

// ── 2. LE MONDE DE DÉMONSTRATION ─────────────────────────────────────────────

/* AUCUNE DURÉE ANNONCÉE QUI N'AIT ÉTÉ MESURÉE. La première version promettait
   « trois à quatre minutes » ici et « cinq minutes » au panneau de fin : la
   réalité est quatorze secondes et une minute quarante. Une durée inventée est
   une affirmation comme une autre, et celle-là se vérifie toute seule au
   premier lancement — devant quelqu'un. Le chronomètre en tête de ligne dit le
   vrai ; le panneau de fin cite le temps que CE lancement a pris. */
annonce("déroulé du dossier de démonstration… (l'étape la plus longue)");
detail('acceptation, équipe, import du grand livre, sondage, vouching, papier de travail, pack SOX');
{
  const res = await lancer(OUTILS.tsx, ['scripts/demo-seed.ts']);
  gardeLancement(res, 'Le déroulé du dossier de démonstration');
  if (res.code !== 0) {
    arret({
      quoi: 'Le déroulé du dossier de démonstration a échoué.',
      pourquoi: 'Chaque étape passe par les services réels du produit : si l\'une refuse, le déroulé s\'arrête — c\'est voulu.',
      faire: `ce n'est pas un défaut de votre machine mais du dépôt. \`${enchaine(['cd app', 'npm run demo:seed'])}\` reproduit l'erreur seule ; envoyez-la telle quelle.`,
      sortie: res.sortie,
    });
  }
  const resume = (res.sortie.match(/demo state ready[^\n]*/) || [''])[0];
  if (resume) detail(resume.replace('demo state ready — ', '').replace(' Run "npm run dev" and sign in as any user.', ''));
}

// ── 2 bis. LES PIÈCES NEUVES (mode IA réelle seulement) ──────────────────────
/* Un jeu de justificatifs que le système n'a JAMAIS VUS — absents du cache de
   rejeu — à déposer soi-même au portail pour regarder le modèle lire pour de
   vrai. Engendré DEPUIS le monde qui vient d'être semé (déterministe) : chaque
   pièce nomme la ligne d'échantillon qu'elle vise, et VERITE.md dit lesquelles
   sont piégées et ce qui doit se lever. */
if (IA) {
  annonce('pièces neuves engendrées (jamais vues du système)…');
  const res = await lancer(OUTILS.tsx, ['scripts/dataset/pieces-neuves.ts']);
  gardeLancement(res, 'La génération des pièces neuves');
  if (res.code !== 0) {
    arret({
      quoi: 'La génération des pièces neuves a échoué.',
      pourquoi: 'Le jeu de pièces à déposer se construit depuis le monde de démonstration ; s\'il refuse, le mode IA réelle perd son intérêt.',
      faire: `ce n'est pas un défaut de votre machine. \`${enchaine(['cd app', 'npm run pieces:neuves'])}\` reproduit l'erreur seule ; envoyez-la telle quelle.`,
      sortie: res.sortie,
    });
  }
  const resume = (res.sortie.match(/pièces neuves[^\n]*/) || [''])[0];
  detail(resume || 'dossier dataset/pieces_neuves/ écrit (VERITE.md dit quoi déposer où)');
}

// ── 3. QUI EST QUI — LU DANS LA BASE, AVANT QUE LE SERVEUR NE LA PRENNE ──────

annonce('lecture des identités du dossier…');
let infos;
{
  const res = await lancer(OUTILS.tsx, ['scripts/demo/infos.ts']);
  gardeLancement(res, 'La lecture des identités du dossier');
  const ligne = res.sortie.split('\n').find((l) => l.trim().startsWith('{'));
  if (res.code !== 0 || !ligne) {
    arret({
      quoi: 'Impossible de lire les identités du dossier de démonstration.',
      pourquoi: 'La base a été créée et peuplée, mais elle ne contient pas les trois rôles attendus (préparateur, réviseur, associé).',
      faire: 'relancez `npm run demo` ; si cela se reproduit, c\'est un défaut du peuplement, pas de votre machine.',
      sortie: res.sortie,
    });
  }
  infos = JSON.parse(ligne);
  detail(`${infos.comptes.dossiers} dossiers · ${infos.comptes.papiers} papiers de travail · ${infos.comptes.pieces} pièces · ${infos.comptes.evenements} événements au journal`);
}

// ── 4. LE BUILD DE PRODUCTION ────────────────────────────────────────────────

if (!DEV) {
  annonce("construction de l'application…");
  const res = await lancer(OUTILS.next, ['build']);
  gardeLancement(res, 'La construction de l\'application');
  if (res.code !== 0) {
    arret({
      quoi: 'La construction de l\'application a échoué.',
      pourquoi: 'Le code ne compile pas ou une page refuse de se pré-rendre.',
      faire: `ce n'est pas un défaut de votre machine. \`${enchaine(['cd app', 'npm run build'])}\` reproduit l'erreur ; pour montrer quand même l'application, \`npm run demo -- --dev\` démarre sans construire.`,
      sortie: res.sortie,
    });
  }
}

// ── 5. LE SERVEUR ────────────────────────────────────────────────────────────

annonce(`démarrage du serveur sur ${BASE}…`);
const serveur = spawn(process.execPath, [OUTILS.next, DEV ? 'dev' : 'start', '-p', String(PORT)], {
  cwd: APP,
  /* SEUL LE SERVEUR passe en adaptateur vivant : le monde a été semé en rejeu.
     La clé n'apparaît pas ici — Next lit app/.env.local lui-même. */
  env: {
    ...process.env, PORT: String(PORT),
    OTTO_OCR_ADAPTER: IA ? 'anthropic' : 'mock', OTTO_QUERY_PLANNER: 'mock',
    OTTO_BUDGET_USD: BUDGET_USD,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  /* POSIX : un groupe de processus, tué en bloc par son -pid. Windows :
     pas de groupe — l'arbre se tue par `taskkill /T` (portable.mjs). */
  detached: groupeDetache(),
});
let journal = '';
let ouvert = false;
const surLigne = (d) => {
  const texte = String(d);
  journal += texte;
  /* Après l'ouverture, on se tait — sauf sur une vraie erreur : un terminal
     bavard pendant une démonstration cache justement ce qu'il faudrait voir. */
  if (ouvert && /Error|⨯/.test(texte)) {
    process.stdout.write(`${C.rouge}  serveur ▸ ${texte.trim().split('\n')[0]}${C.fin}\n`);
  }
};
serveur.stdout?.on('data', surLigne);
serveur.stderr?.on('data', surLigne);
serveur.on('error', (e) => {
  arret({
    quoi: 'Le serveur n\'a pas pu être lancé.',
    pourquoi: `Node n'a pas pu démarrer le processus : ${e.code ?? e.message}.`,
    faire: `lancez \`${enchaine(['cd app', commandeReinstalle()])}\`, puis \`npm run demo\`.`,
  });
});

const arreter = () => {
  tuerArbre(serveur.pid);
  leverVerrou();
};
process.on('SIGINT', () => { process.stdout.write('\n  arrêt du serveur…\n'); arreter(); process.exit(0); });
process.on('SIGTERM', () => { arreter(); process.exit(0); });

if (!(await repond(BASE + '/', 150000))) {
  arreter();
  const occupe = /EADDRINUSE/.test(journal);
  arret({
    quoi: 'Le serveur ne répond pas.',
    pourquoi: occupe
      ? `Le port ${PORT} a été pris entre la vérification et le démarrage.`
      : 'Il n\'a pas fini de démarrer dans les deux minutes trente.',
    faire: occupe
      ? `relancez avec un autre port : \`${avecPort(3100, 'npm run demo')}\`.`
      : 'relancez `npm run demo` ; si cela se reproduit, envoyez les lignes ci-dessus.',
    sortie: journal,
  });
}
ouvert = true;

// ── LE PANNEAU ───────────────────────────────────────────────────────────────

const large = 78;
const trait = (c) => process.stdout.write(`${C.faible}${c.repeat(large)}${C.fin}\n`);
process.stdout.write('\n');
trait('─');
process.stdout.write(`  ${C.vert}${C.gras}L'application est ouverte.${C.fin}  ${C.faible}(prête en ${chrono()})${C.fin}\n`);
trait('─');

process.stdout.write(`\n  ${C.gras}Adresse à ouvrir${C.fin}\n`);
process.stdout.write(`      ${C.bleu}${BASE}${C.fin}\n`);

process.stdout.write(`\n  ${C.gras}Se connecter${C.fin} ${C.faible}— pas de mot de passe : sur la page d'accueil, cliquez le nom.${C.fin}\n`);
for (const r of infos.roles) {
  process.stdout.write(`      ${r.role.padEnd(20)} ${C.gras}${r.nom}${C.fin}\n`);
}
process.stdout.write(`${C.faible}      Le sélecteur d'identité reste en haut de l'accueil : on change de rôle à tout moment.${C.fin}\n`);
process.stdout.write(`${C.faible}      Les visas suivent la hiérarchie : le préparateur, puis le réviseur, puis l'associé.${C.fin}\n`);

process.stdout.write(`\n  ${C.gras}Portail client${C.fin} ${C.faible}— ce que voit ${infos.portail.contact}${infos.portail.titre ? `, ${infos.portail.titre}` : ''} chez la cliente. Aucun compte.${C.fin}\n`);
process.stdout.write(`      ${C.bleu}${BASE}/portal/${infos.portail.jeton}${C.fin}\n`);

process.stdout.write(`\n  ${C.gras}Le dossier${C.fin}\n`);
process.stdout.write(`      ${infos.dossier}\n`);
process.stdout.write(`${C.faible}      ${infos.entite} · ${infos.exercice} · pack ${infos.pack} · le parcours pas à pas est dans DEMO_APP.md${C.fin}\n`);

if (IA) {
  process.stdout.write(`\n  ${C.gras}IA réelle${C.fin} ${C.faible}— l'échelon OCR lit avec le modèle ; tout le reste est inchangé (L2, provenance).${C.fin}\n`);
  process.stdout.write(`      Pièces neuves à déposer : ${C.bleu}dataset/pieces_neuves/${C.fin}\n`);
  process.stdout.write(`${C.faible}      VERITE.md y dit quelle pièce va sur quelle ligne du portail, lesquelles sont piégées,${C.fin}\n`);
  process.stdout.write(`${C.faible}      et ce qui doit se lever. Coût affiché sur l'écran de testing ; plafond ${BUDGET_USD} $ (OTTO_BUDGET_USD).${C.fin}\n`);
}

process.stdout.write(`\n  ${C.gras}Si vous cassez quelque chose en cliquant${C.fin}\n`);
/* La commande de relance REPÈTE le port choisi — dans la syntaxe du terminal
   qui la lira : quelqu'un qui a dû prendre 3100 la première fois se ferait
   refuser en retapant la commande nue, et un utilisateur de PowerShell ne
   peut pas coller `PORT=3100 npm run demo`. */
const COMMANDE_DEMO = IA ? 'npm run demo:ia' : 'npm run demo';
const RELANCE = process.env.PORT ? avecPort(PORT, COMMANDE_DEMO) : COMMANDE_DEMO;
process.stdout.write(`      ${C.jaune}Ctrl-C${C.fin} puis ${C.jaune}${RELANCE}${C.fin}${C.faible} — tout repart d'une base vide. Ce lancement-ci a pris ${chrono()}.${C.fin}\n`);

trait('─');
process.stdout.write(`${C.faible}  Toutes les données sont fabriquées : entités, personnes, SIREN, IBAN, pièces.${C.fin}\n`);
process.stdout.write(`${C.faible}  Ctrl-C pour arrêter le serveur.${C.fin}\n\n`);

/* On ne rend PAS la main : le processus tient le serveur, et Ctrl-C l'arrête.
   Rendre la main laisserait un serveur orphelin tenant le port et la base — le
   défaut qui a déjà fait valider un build qu'on n'avait pas produit. */
await new Promise(() => {});
