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
import path from 'node:path';
import { routes, auditeur, baseSemee, parametres } from '../app/scripts/screens/routes';
import { balayer, erreursServeur, ServeurTombe } from '../app/scripts/screens/sweep';

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
  await new Promise<void>((res, rej) => {
    const p = spawn('npx', ['tsx', 'scripts/demo-seed.ts'], { cwd: RACINE, stdio: 'ignore' });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`demo:seed a échoué (code ${c})`))));
  });
}

describe('tous les écrans rendent', () => {
  beforeAll(async () => {
    await assurerMondeDemo();
    if (!(await libre())) {
      throw new Error(`le port ${PORT} est occupé : le balayage refuse de vérifier un serveur qu'il n'a pas lancé`);
    }
    /* `detached` crée un GROUPE de processus. Sans lui, `kill` ne tue que le
       lanceur npx : `next-server` survit, garde le port, et le lancement
       SUIVANT meurt sur EADDRINUSE — un serveur fantôme d'une exécution
       précédente qui fait échouer la suivante. */
    serveur = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
      cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
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
    try { process.kill(-serveur.pid, 'SIGTERM'); } catch { /* déjà mort */ }
    // Laisser le port se libérer : le lancement suivant le vérifie.
    await new Promise((r) => setTimeout(r, 800));
    try { process.kill(-serveur.pid, 'SIGKILL'); } catch { /* déjà mort */ }
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
    expect(casses, 'écrans qui ne rendent pas').toEqual([]);

    /* Une route peut rendre 200 pendant que le serveur lève : c'est ce qui a
       laissé six formulaires inertes en production une tranche entière. */
    expect(erreursServeur(journal.join('')), 'exceptions côté serveur pendant le balayage').toEqual([]);
  }, 900000);
});
