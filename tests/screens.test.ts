// LE BALAYAGE DES ÉCRANS, DANS LA SUITE DE TESTS.
//
// POURQUOI IL EST ICI ET PAS DANS UN SCRIPT QU'ON PENSE À LANCER : /risk et
// /team ont rendu 500 pendant plusieurs tranches avec la suite au vert
// (ADR-076), puis les six formulaires de /team ont été inertes en production
// pendant une tranche de plus (ADR-078). Les deux fois, le contrôle manquant
// n'était pas difficile — il était ABSENT DE CE QU'ON LANCE. Un contrôle qu'on
// doit se rappeler de lancer est un contrôle qu'on oubliera.
//
// CE QU'IL COUVRE ET CE QU'IL NE COUVRE PAS. Il ouvre chaque route et vérifie
// qu'elle rend ; il ne clique sur rien. C'est le parcours de DEMO_APP.md qui
// vérifie que les actions AGISSENT. Les deux sont nécessaires : un écran qui
// rend n'est pas un écran qui marche.
//
// Il tourne en mode développement — un build de production à chaque lancement
// de la suite coûterait une minute. `npm run screens` fait le même balayage sur
// un build de PRODUCTION, et c'est celui-là qui doit passer avant une
// livraison : les deux exécutions ne sont pas la même (ADR-076).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { binaireDe, groupeDetache, tuerArbre } from '../app/scripts/lib/portable.mjs';
import path from 'node:path';
import { routes, auditeur, baseSemee, parametres } from '../app/scripts/screens/routes';
import { closeDb } from '../app/src/lib/db/client';
import { balayer, causeServeur, erreursServeur, ServeurTombe } from '../app/scripts/screens/sweep';

const PORT = Number(process.env.SCREENS_TEST_PORT ?? 3299);
const BASE = `http://localhost:${PORT}`;
const RACINE = path.resolve(import.meta.dirname, '..', 'app');

let serveur: ChildProcess | null = null;
const journal: string[] = [];

async function libre(): Promise<boolean> {
  try { await fetch(BASE + '/', { signal: AbortSignal.timeout(1200) }); return false; }
  catch { return true; }
}

/**
 * Le monde de démonstration, déroulé si besoin.
 *
 * POURQUOI LE HARNAIS LE CONSTRUIT LUI-MÊME : un balayage sur une base vide ne
 * prouve rien — une page sans données n'est pas une page qui rend — et six
 * routes sur paramètre dynamique ne seraient même pas ouvrables. Exiger un
 * `npm run demo:seed` préalable, c'est un contrôle qu'on doit se rappeler de
 * préparer, donc un contrôle qui cassera. On lance le script DOCUMENTÉ, ce qui
 * vérifie au passage que ce chemin marche encore.
 */
async function assurerMondeDemo(): Promise<void> {
  const v = await parametres();
  if (v.id && v.wid && v.rid && v.evidenceId && v.cid && v.exportId) return;

  /* FERMER AVANT DE CÉDER LA MAIN — la branche qui n'avait jamais tourné.
     Ce chemin ne s'emprunte que sur une base SANS monde de démonstration ;
     tant qu'il en restait un d'un lancement précédent, la fonction rendait la
     main à la première ligne et ce qui suit n'a jamais été exécuté. La
     première fois qu'il a tourné pour de vrai (base recréée), il a échoué de
     deux façons à la fois : PGlite n'admet qu'un écrivain, et le parent, qui
     avait déjà chargé le répertoire dans sa propre mémoire, aurait de toute
     façon relu une base vide après le peuplement de l'enfant. Le harnais
     annonçait alors « six routes non résolues » — un aveu, pas un diagnostic.
     Un chemin de repli qu'on n'exécute jamais n'est pas un repli : c'est du
     code non testé placé exactement là où on ne le vérifiera pas. */
  const journalSeed: string[] = [];
  await closeDb();
  await new Promise<void>((res, rej) => {
    /* Jamais `npx` : sur Windows c'est `npx.cmd`, qu'un spawn sans shell ne
       trouve pas (portable.mjs). Le Node courant exécute le fichier de tsx. */
    const tsx = binaireDe('tsx', RACINE);
    if (!tsx) throw new Error('tsx est absent de node_modules — lancez `npm install` dans app/');
    const p = spawn(process.execPath, [tsx, 'scripts/demo-seed.ts'], {
      cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout?.on('data', (d) => journalSeed.push(String(d)));
    p.stderr?.on('data', (d) => journalSeed.push(String(d)));
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(
      `demo:seed a échoué (code ${c}) :\n`
      + journalSeed.join('').split('\n').filter(Boolean).slice(-20).join('\n'),
    ))));
  });

  /* Et VÉRIFIER que le peuplement a produit ce qu'on attendait, plutôt que de
     laisser le balayage le découvrir six routes plus loin. */
  const apres = await parametres();
  const manquants = Object.entries(apres)
    .filter(([, val]) => !val).map(([cle]) => cle);
  if (manquants.length) {
    throw new Error(
      `demo:seed s'est terminé sans erreur mais le monde reste incomplet `
      + `(${manquants.join(', ')}) — la base a-t-elle été relue ?`,
    );
  }
}

describe('tous les écrans rendent', () => {
  beforeAll(async () => {
    await assurerMondeDemo();
    if (!(await libre())) {
      throw new Error(`le port ${PORT} est occupé : le balayage refuse de vérifier un serveur qu'il n'a pas lancé`);
    }
    /* Sur POSIX, `detached` crée un GROUPE de processus. Sans lui, `kill` ne
       tue que le lanceur : `next-server` survit, garde le port, et le
       lancement SUIVANT meurt sur EADDRINUSE — un serveur fantôme d'une
       exécution précédente qui fait échouer la suivante. Sur Windows l'arbre
       se tue par `taskkill /T` (portable.mjs). */
    const next = binaireDe('next', RACINE);
    if (!next) throw new Error('next est absent de node_modules — lancez `npm install` dans app/');
    serveur = spawn(process.execPath, [next, 'dev', '-p', String(PORT)], {
      cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'], detached: groupeDetache(),
    });
    serveur.stdout?.on('data', (d) => journal.push(String(d)));
    serveur.stderr?.on('data', (d) => journal.push(String(d)));
    const fin = Date.now() + 150000;
    while (Date.now() < fin) {
      if (serveur.exitCode !== null) {
        /* Dire POURQUOI. « Il s'est arrêté » sans le journal oblige à tout
           refaire à la main pour apprendre ce que le processus avait déjà dit. */
        throw new Error(
          `le serveur de développement s'est arrêté immédiatement (code ${serveur.exitCode}) :\n`
          + journal.join('').split('\n').filter(Boolean).slice(-25).join('\n'),
        );
      }
      try { const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(3000) }); if (r.status > 0) return; }
      catch { /* pas encore */ }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('le serveur de développement n’est pas debout après 150 s');
  }, 900000);

  afterAll(async () => {
    if (!serveur?.pid) return;
    tuerArbre(serveur.pid, 'SIGTERM');
    // Laisser le port se libérer : le lancement suivant le vérifie.
    await new Promise((r) => setTimeout(r, 800));
    tuerArbre(serveur.pid, 'SIGKILL');
  });

  it('chaque route s’ouvre, rend du contenu, et ne lève rien côté serveur', async () => {
    /* La base du balayage est celle du dépôt, semée par `npm run db:setup` (et
       idéalement déroulée par `npm run demo:seed`) : un écran sans données
       n'est pas un écran qui rend. */
    expect(await baseSemee(), 'base vide — lancez `npm run db:setup && npm run demo:seed`').toBe(true);
    const { pretes, nonResolues } = await routes();

    /* LE HARNAIS NE DOIT PAS POUVOIR SE TAIRE. Une route non résolue est un
       écran non vérifié, pas une route à sauter ; et zéro route ouverte est une
       panne du harnais, pas un succès. */
    expect(nonResolues, 'routes dont un paramètre ne se résout pas').toEqual([]);
    expect(pretes.length).toBeGreaterThan(20);

    process.env.SCREENS_SILENCIEUX = '1';
    let verdicts;
    try {
      verdicts = await balayer(BASE, pretes, await auditeur());
    } catch (e) {
      if (e instanceof ServeurTombe) throw new Error(e.message);
      throw e;
    }
    expect(verdicts.length).toBe(pretes.length);

    const casses = verdicts.filter((v) => !v.ok).map(
      (v) => `${v.route.pattern} → HTTP ${v.status}, ${v.texte} car.${v.erreurs.length ? ' · ' + v.erreurs.join(' · ') : ''}`,
    );
    /* La LISTE des écrans cassés dit le symptôme ; le journal du serveur dit
       la cause. Les deux ensemble, ou l'échec fait perdre une heure. */
    expect(casses, `écrans qui ne rendent pas${casses.length ? causeServeur(journal.join('')) : ''}`).toEqual([]);

    /* Une route peut rendre 200 pendant que le serveur lève : c'est ce qui a
       laissé six formulaires inertes en production une tranche entière. */
    expect(erreursServeur(journal.join('')), 'exceptions côté serveur pendant le balayage').toEqual([]);
  }, 900000);
});
