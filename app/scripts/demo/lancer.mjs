#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(ICI, '..', '..');          // …/app
const PORT = Number(process.env.PORT || 3000);
const BASE = `http://localhost:${PORT}`;
const DEV = process.argv.includes('--dev');

const t0 = Date.now();
const chrono = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const C = process.stdout.isTTY
  ? { gras: '\x1b[1m', faible: '\x1b[2m', vert: '\x1b[32m', jaune: '\x1b[33m', rouge: '\x1b[31m', bleu: '\x1b[36m', fin: '\x1b[0m' }
  : { gras: '', faible: '', vert: '', jaune: '', rouge: '', bleu: '', fin: '' };

let etape = 0;
const TOTAL = DEV ? 4 : 5;
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

/** Un enfant, sa sortie capturée, et une promesse qui ne rejette jamais. */
function lancer(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: APP,
      env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    let sortie = '';
    p.stdout?.on('data', (d) => { sortie += d; });
    p.stderr?.on('data', (d) => { sortie += d; });
    p.on('error', (e) => resolve({ code: -1, sortie: sortie + '\n' + e.message }));
    p.on('close', (code) => resolve({ code: code ?? 1, sortie }));
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
    faire: 'installez une version récente de Node (par exemple `nvm install 20 && nvm use 20`), puis relancez `npm run demo`.',
  });
}

if (!fs.existsSync(path.join(APP, 'node_modules'))) {
  arret({
    quoi: 'Les dépendances ne sont pas installées.',
    pourquoi: `Le dossier node_modules est absent de ${APP}.`,
    faire: 'lancez `cd app && npm install`, puis `npm run demo`.',
  });
}
for (const [outil, chemin] of [['next', 'next/package.json'], ['tsx', 'tsx/package.json']]) {
  if (!fs.existsSync(path.join(APP, 'node_modules', chemin))) {
    arret({
      quoi: `L'outil « ${outil} » est absent des dépendances installées.`,
      pourquoi: 'L\'installation est probablement partielle ou interrompue.',
      faire: 'lancez `cd app && rm -rf node_modules && npm install`, puis `npm run demo`.',
    });
  }
}

const RACINE = path.resolve(APP, '..');
const FEC = path.join(RACINE, 'dataset', '999888777FEC20251231.txt');
if (!fs.existsSync(FEC)) {
  arret({
    quoi: 'Le jeu de données synthétique est absent.',
    pourquoi: `Le fichier ${path.relative(RACINE, FEC)} n'existe pas. Toutes les données de démonstration en dépendent.`,
    faire: 'lancez `cd app && npm run dataset:generate` (déterministe : mêmes octets à chaque fois), puis `npm run demo`.',
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
    faire: `arrêtez-la (Ctrl-C dans son terminal), ou choisissez un autre port : \`PORT=3100 npm run demo\`.`,
  });
}

process.stdout.write(`\n${C.gras}OTTO — démonstration${C.fin} ${C.faible}(données entièrement synthétiques)${C.fin}\n`);
process.stdout.write(`${C.faible}Base repartie de zéro, monde de démonstration déroulé, serveur ${DEV ? 'de développement' : 'de production'}.${C.fin}\n\n`);

// ── 1. LA BASE, REPARTIE DE ZÉRO ─────────────────────────────────────────────

annonce('base de données remise à zéro et migrations appliquées…');
fs.mkdirSync(path.join(APP, '.data'), { recursive: true });
fs.writeFileSync(VERROU, JSON.stringify({ pid: process.pid, port: PORT, url: BASE }));
const leverVerrou = () => { try { fs.rmSync(VERROU, { force: true }); } catch { /* déjà parti */ } };
process.on('exit', leverVerrou);
for (const dossier of ['pg', 'blobs']) {
  fs.rmSync(path.join(APP, '.data', dossier), { recursive: true, force: true });
}
{
  const { code, sortie } = await lancer('npx', ['tsx', 'scripts/db-setup.ts']);
  if (code !== 0) {
    const espace = /ENOSPC|no space left/i.test(sortie);
    arret({
      quoi: 'La création de la base locale a échoué.',
      pourquoi: espace
        ? 'Le disque est plein : PGlite ne peut pas écrire son répertoire de données.'
        : 'Les migrations n\'ont pas pu s\'appliquer sur une base neuve.',
      faire: espace
        ? 'libérez de l\'espace disque, puis relancez `npm run demo`.'
        : 'vérifiez que rien d\'autre n\'utilise `app/.data` (un serveur resté ouvert, par exemple) et relancez `npm run demo`.',
      sortie,
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
  const { code, sortie } = await lancer('npx', ['tsx', 'scripts/demo-seed.ts']);
  if (code !== 0) {
    arret({
      quoi: 'Le déroulé du dossier de démonstration a échoué.',
      pourquoi: 'Chaque étape passe par les services réels du produit : si l\'une refuse, le déroulé s\'arrête — c\'est voulu.',
      faire: 'ce n\'est pas un défaut de votre machine mais du dépôt. `cd app && npm run demo:seed` reproduit l\'erreur seule ; envoyez-la telle quelle.',
      sortie,
    });
  }
  const resume = (sortie.match(/demo state ready[^\n]*/) || [''])[0];
  if (resume) detail(resume.replace('demo state ready — ', '').replace(' Run "npm run dev" and sign in as any user.', ''));
}

// ── 3. QUI EST QUI — LU DANS LA BASE, AVANT QUE LE SERVEUR NE LA PRENNE ──────

annonce('lecture des identités du dossier…');
let infos;
{
  const { code, sortie } = await lancer('npx', ['tsx', 'scripts/demo/infos.ts']);
  const ligne = sortie.split('\n').find((l) => l.trim().startsWith('{'));
  if (code !== 0 || !ligne) {
    arret({
      quoi: 'Impossible de lire les identités du dossier de démonstration.',
      pourquoi: 'La base a été créée et peuplée, mais elle ne contient pas les trois rôles attendus (préparateur, réviseur, associé).',
      faire: 'relancez `npm run demo` ; si cela se reproduit, c\'est un défaut du peuplement, pas de votre machine.',
      sortie,
    });
  }
  infos = JSON.parse(ligne);
  detail(`${infos.comptes.dossiers} dossiers · ${infos.comptes.papiers} papiers de travail · ${infos.comptes.pieces} pièces · ${infos.comptes.evenements} événements au journal`);
}

// ── 4. LE BUILD DE PRODUCTION ────────────────────────────────────────────────

if (!DEV) {
  annonce("construction de l'application…");
  const { code, sortie } = await lancer('npx', ['next', 'build']);
  if (code !== 0) {
    arret({
      quoi: 'La construction de l\'application a échoué.',
      pourquoi: 'Le code ne compile pas ou une page refuse de se pré-rendre.',
      faire: 'ce n\'est pas un défaut de votre machine. `cd app && npm run build` reproduit l\'erreur ; pour montrer quand même l\'application, `npm run demo -- --dev` démarre sans construire.',
      sortie,
    });
  }
}

// ── 5. LE SERVEUR ────────────────────────────────────────────────────────────

annonce(`démarrage du serveur sur ${BASE}…`);
const serveur = spawn('npx', DEV ? ['next', 'dev', '-p', String(PORT)] : ['next', 'start', '-p', String(PORT)], {
  cwd: APP,
  env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
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

const arreter = () => {
  try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ }
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
      ? `relancez avec un autre port : \`PORT=3100 npm run demo\`.`
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

process.stdout.write(`\n  ${C.gras}Si vous cassez quelque chose en cliquant${C.fin}\n`);
/* La commande de relance REPÈTE le port choisi : quelqu'un qui a dû prendre
   3100 la première fois se ferait refuser en retapant la commande nue. */
const RELANCE = process.env.PORT ? `PORT=${PORT} npm run demo` : 'npm run demo';
process.stdout.write(`      ${C.jaune}Ctrl-C${C.fin} puis ${C.jaune}${RELANCE}${C.fin}${C.faible} — tout repart d'une base vide. Ce lancement-ci a pris ${chrono()}.${C.fin}\n`);

trait('─');
process.stdout.write(`${C.faible}  Toutes les données sont fabriquées : entités, personnes, SIREN, IBAN, pièces.${C.fin}\n`);
process.stdout.write(`${C.faible}  Ctrl-C pour arrêter le serveur.${C.fin}\n\n`);

/* On ne rend PAS la main : le processus tient le serveur, et Ctrl-C l'arrête.
   Rendre la main laisserait un serveur orphelin tenant le port et la base — le
   défaut qui a déjà fait valider un build qu'on n'avait pas produit. */
await new Promise(() => {});
