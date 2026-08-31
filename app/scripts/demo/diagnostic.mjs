#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// npm run diagnostic — UNE commande qui collecte tout ce qu'il faut pour
// comprendre pourquoi `npm run demo` ne se lance pas sur une machine, et
// l'écrit dans UN fichier à renvoyer tel quel. Pensé pour quelqu'un qui ne
// veut pas enchaîner des commandes qu'il ne comprend pas.
//
// CE FICHIER EST EN JAVASCRIPT NU, sans dépendance ni import du dépôt : il
// doit tourner sur une copie CASSÉE ou PÉRIMÉE du dépôt — y compris une copie
// où le correctif Windows n'existe pas encore. Un diagnostic qui a besoin de
// ce qu'il diagnostique ne diagnostique rien.
//
// CE QU'IL N'ÉCRIT JAMAIS : les variables d'environnement, le contenu de
// .env.local, une clé, un jeton. L'URL du dépôt est nettoyée de toute
// information d'identification avant d'être écrite.

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(ICI, '..', '..');
const RACINE = path.resolve(APP, '..');
const SORTIE = path.join(RACINE, 'diagnostic-otto.txt');
const WIN = process.platform === 'win32';
const SANS_LANCEMENT = process.argv.includes('--sans-lancement');

const L = [];
const titre = (t) => { L.push('', `── ${t} ${'─'.repeat(Math.max(2, 66 - t.length))}`); };
const ligne = (cle, val) => { L.push(`${cle.padEnd(28)} ${val}`); };
const etape = (n, t) => process.stdout.write(`[${n}/5] ${t}\n`);

function git(args) {
  try {
    const r = spawnSync('git', args, { cwd: RACINE, encoding: 'utf8', timeout: 15000 });
    if (r.error) return `(git indisponible : ${r.error.code ?? r.error.message})`;
    return (r.stdout + (r.status !== 0 ? '\n' + r.stderr : '')).trim() || '(vide)';
  } catch (e) {
    return `(git indisponible : ${e.message})`;
  }
}

/** L'URL du dépôt, SANS identifiants (un jeton peut vivre dans l'URL). */
function urlPropre(u) {
  return u.replace(/\/\/[^@/]+@/, '//');
}

function tuerArbre(pid) {
  if (!pid) return;
  try {
    if (WIN) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch { /* déjà mort */ }
}

// ── 1. LE SYSTÈME ────────────────────────────────────────────────────────────
etape(1, 'système…');
L.push(`OTTO — DIAGNOSTIC · ${new Date().toISOString()}`);
titre('SYSTÈME');
ligne('plateforme', `${process.platform} (${process.arch})`);
try { ligne('version OS', String((await import('node:os')).release()) ); } catch { /* sans gravité */ }
ligne('Node', process.versions.node);
/* La version de npm vient de l'environnement que `npm run` pose lui-même :
   pas de spawn de npm.cmd — c'est précisément le genre de lancement qui
   casse sur Windows. */
const ua = process.env.npm_config_user_agent ?? '';
ligne('npm', (ua.match(/npm\/(\S+)/) || [])[1] ?? '(lancé sans npm — inconnue)');

// ── 2. LE DÉPÔT ──────────────────────────────────────────────────────────────
etape(2, 'état du dépôt…');
titre('DÉPÔT');
ligne('branche', git(['branch', '--show-current']));
ligne('origine', urlPropre(git(['remote', 'get-url', 'origin'])));
L.push('derniers commits :');
for (const l of git(['log', '--oneline', '-5']).split('\n')) L.push('  ' + l);
const modif = git(['status', '--porcelain']);
L.push('fichiers modifiés localement :');
if (modif === '(vide)') L.push('  aucun');
else for (const l of modif.split('\n').slice(0, 20)) L.push('  ' + l);

// ── 3. LE CORRECTIF WINDOWS EST-IL DANS CETTE COPIE ? ────────────────────────
etape(3, 'vérification du correctif Windows…');
titre('CORRECTIF WINDOWS (ADR-096)');
const PORTABLE = path.join(APP, 'scripts', 'lib', 'portable.mjs');
const LANCEUR = path.join(APP, 'scripts', 'demo', 'lancer.mjs');
const aPortable = fs.existsSync(PORTABLE);
let lanceurSpawneNpx = false;
try {
  /* On cherche un LANCEMENT de npx (spawn/lancer('npx'), pas le mot dans un
     commentaire : chercher un mot n'est pas vérifier un chemin (règle 15). */
  lanceurSpawneNpx = /\(\s*'npx'\s*,/.test(fs.readFileSync(LANCEUR, 'utf8'));
} catch { ligne('lanceur', 'ILLISIBLE — scripts/demo/lancer.mjs absent ?'); }
ligne('scripts/lib/portable.mjs', aPortable ? 'présent' : 'ABSENT');
ligne('le lanceur lance npx ?', lanceurSpawneNpx ? 'OUI — ancienne version' : 'non');
const copieAJour = aPortable && !lanceurSpawneNpx;
ligne('verdict de la copie', copieAJour
  ? 'à jour du correctif Windows'
  : 'ANTÉRIEURE AU CORRECTIF — faites `git pull` puis relancez ce diagnostic');

// ── 4. LES FICHIERS ──────────────────────────────────────────────────────────
etape(4, 'fichiers et dépendances…');
titre('FICHIERS');
ligne('node_modules', fs.existsSync(path.join(APP, 'node_modules')) ? 'présent' : 'ABSENT — lancez npm install dans app/');
for (const paquet of ['tsx', 'next']) {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(APP, 'node_modules', paquet, 'package.json'), 'utf8'));
    const bin = typeof man.bin === 'string' ? man.bin : man.bin?.[paquet] ?? Object.values(man.bin ?? {})[0];
    const ok = bin && fs.existsSync(path.join(APP, 'node_modules', paquet, bin));
    ligne(`outil ${paquet}`, ok ? `v${man.version}, binaire présent` : `v${man.version}, BINAIRE ABSENT`);
  } catch { ligne(`outil ${paquet}`, 'ABSENT'); }
}
ligne('jeu de données (FEC)', fs.existsSync(path.join(RACINE, 'dataset', '999888777FEC20251231.txt')) ? 'présent' : 'ABSENT');
const DATA = path.join(APP, '.data');
if (!fs.existsSync(DATA)) ligne('app/.data', 'absent (jamais lancé, ou nettoyé) — normal');
else {
  for (const f of fs.readdirSync(DATA)) {
    let det = '';
    try {
      const st = fs.statSync(path.join(DATA, f));
      det = st.isDirectory() ? `dossier, ${fs.readdirSync(path.join(DATA, f)).length} entrée(s)` : `${st.size} octets`;
      if (f === 'demo.lock') det += ` — ${fs.readFileSync(path.join(DATA, f), 'utf8')}`;
    } catch (e) { det = `(illisible : ${e.code})`; }
    ligne(`app/.data/${f}`, det);
  }
}

// ── 5. LE LANCEMENT LUI-MÊME ─────────────────────────────────────────────────
titre('LANCEMENT DE npm run demo');
if (SANS_LANCEMENT) {
  L.push('(sauté : --sans-lancement)');
} else if (!fs.existsSync(LANCEUR)) {
  L.push('IMPOSSIBLE : scripts/demo/lancer.mjs est absent de cette copie.');
} else {
  etape(5, 'lancement de la démonstration — jusqu\'à 7 minutes, patientez…');
  const t0 = Date.now();
  const res = await new Promise((resolve) => {
    const p = spawn(process.execPath, [LANCEUR], {
      cwd: APP, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN,
      env: { ...process.env, OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
    });
    let sortie = '';
    let fini = false;
    const finir = (verdict) => {
      if (fini) return; fini = true;
      tuerArbre(p.pid);
      resolve({ verdict, sortie });
    };
    const minuteur = setTimeout(() => finir('DÉLAI DÉPASSÉ (7 min) — sortie partielle ci-dessous'), 420000);
    const surdonnees = (d) => {
      sortie += String(d);
      if (/L'application est ouverte/.test(sortie)) {
        clearTimeout(minuteur);
        /* Laisser le panneau finir de s'écrire, puis arrêter le serveur. */
        setTimeout(() => finir('SUCCÈS — le panneau s\'est affiché, serveur arrêté par le diagnostic'), 3000);
      }
    };
    p.stdout?.on('data', surdonnees);
    p.stderr?.on('data', surdonnees);
    p.on('error', (e) => { clearTimeout(minuteur); finir(`ÉCHEC DE LANCEMENT : ${e.code ?? e.message}`); });
    p.on('close', (code) => { clearTimeout(minuteur); if (!fini) finir(`terminé, code ${code}`); });
  });
  ligne('verdict', res.verdict);
  ligne('durée', `${Math.round((Date.now() - t0) / 1000)} s`);
  L.push('sortie complète :');
  for (const l of res.sortie.split('\n')) L.push('  │ ' + l.replace(/\x1b\[[0-9;]*m/g, ''));
}

// ── LE FICHIER ───────────────────────────────────────────────────────────────
L.push('', '── FIN — envoyez ce fichier tel quel ' + '─'.repeat(30), '');
fs.writeFileSync(SORTIE, L.join('\n'), 'utf8');
process.stdout.write(`\nDiagnostic écrit dans :\n\n    ${SORTIE}\n\n`
  + 'Ouvrez ce fichier, copiez tout son contenu, et envoyez-le tel quel.\n'
  + (copieAJour ? '' : '\n⚠ Votre copie du dépôt est ANTÉRIEURE au correctif Windows :\n'
    + '  tapez `git pull` (depuis le dossier Otto-Dit), puis relancez `npm run demo`.\n'));
process.exit(0);
