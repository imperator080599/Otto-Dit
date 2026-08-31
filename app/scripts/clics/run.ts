import { spawn, type ChildProcess } from 'node:child_process';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium, conseilChromium } from '../lib/portable.mjs';
import { chromium } from 'playwright';
import { getDb } from '../../src/lib/db/client';
import { baseSemee } from '../screens/routes';
import { contexte } from './contexte';
import { conduire, type Etape } from './scenario';

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
  const durs: string[] = [];
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
    page.on('pageerror', (e) => durs.push(`EXCEPTION sur ${ou()} : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|DevTools/.test(m.text())) {
        durs.push(`CONSOLE sur ${ou()} : ${m.text()}`);
      }
    });
    page.on('response', (r) => { if (r.status() >= 500) durs.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      etapes = await conduire(page, ctx, `http://localhost:${PORT}`, c);
    } finally {
      await nav.close();
    }
  } finally {
    tuer(serveur);
  }

  for (const e of etapes) console.log(`  ${e.ok ? 'ok  ' : 'ÉCHEC'}  ${e.nom}\n         ${e.detail}`);

  /* LE HARNAIS NE DOIT PAS POUVOIR SE TAIRE. Zéro étape conduite est une panne
     du harnais, pas un parcours réussi. */
  if (etapes.length < 30) {
    console.log(`\nseulement ${etapes.length} étape(s) conduites — le parcours s'est interrompu\n`);
    process.exit(1);
  }
  const echecs = etapes.filter((e) => !e.ok);
  if (durs.length) { console.log('\nErreurs côté navigateur :'); for (const d of durs.slice(0, 12)) console.log('  ' + d); }
  console.log(`\n${etapes.length} étapes conduites · ${echecs.length + durs.length} échec(s)\n`);

  if (echecs.length || durs.length) {
    const err = journal.join('').split('\n').filter((l) => /Error:|at async|at [A-Z]/.test(l)).slice(0, 30);
    if (err.length) console.log('Journal du serveur :\n' + err.join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
