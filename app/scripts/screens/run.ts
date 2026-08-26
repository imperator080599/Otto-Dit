import { spawn, type ChildProcess } from 'node:child_process';
import { getDb } from '../../src/lib/db/client';
import { routes, auditeur, baseSemee } from './routes';
import { balayer, rapporter, erreursServeur, ServeurTombe } from './sweep';

// npm run screens[-- --dev] : ouvre TOUS les écrans dans un navigateur et sort
// en échec sur ce qui ne rend pas.
//
// Par défaut le balayage tourne sur un BUILD DE PRODUCTION, parce que c'est
// l'exécution que l'utilisateur voit et que ce n'est pas la même que celle des
// tests : un chemin de module qui marche sous Vitest peut être réécrit par le
// bundler et échouer (ADR-076). `--dev` existe pour la boucle courte.

const PORT = Number(process.env.SCREENS_PORT ?? 3210);

/* `detached` crée un GROUPE de processus : sans lui, `kill` ne tue que le
   lanceur npx et `next-server` survit en gardant le port — le lancement
   suivant meurt alors sur EADDRINUSE, à cause d'un fantôme du précédent. */
function lancer(cmd: string, args: string[]): ChildProcess {
  return spawn(cmd, args, {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function tuer(p: ChildProcess | null): void {
  if (!p?.pid) return;
  try { process.kill(-p.pid, 'SIGTERM'); } catch { /* déjà mort */ }
}

/**
 * Le port est-il libre ?
 *
 * POURQUOI CETTE VÉRIFICATION EXISTE : un serveur oublié d'un lancement
 * précédent tenait le port. Le nôtre est mort sur EADDRINUSE, `attendre()` a vu
 * répondre l'ANCIEN, et le balayage a validé un build qu'il n'avait pas
 * produit — puis a déclaré 28 écrans en panne quand l'ancien serveur est tombé.
 * Vérifier ce qu'on n'a pas démarré soi-même, c'est ne rien vérifier.
 */
async function portLibre(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

async function attendre(url: string, enfant: ChildProcess, secondes = 120): Promise<void> {
  const fin = Date.now() + secondes * 1000;
  while (Date.now() < fin) {
    // Le serveur QU'ON A LANCÉ est-il encore vivant ? S'il est mort, inutile
    // d'attendre : quelqu'un d'autre répondra peut-être, et ce serait pire.
    if (enfant.exitCode !== null || enfant.signalCode !== null) {
      throw new Error(`le serveur s'est arrêté immédiatement (code ${enfant.exitCode ?? enfant.signalCode})`);
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.status > 0) return;
    } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`le serveur n'est pas debout après ${secondes}s sur ${url}`);
}

async function main() {
  const dev = process.argv.includes('--dev');

  if (!(await baseSemee())) {
    throw new Error(
      'base vide : lancez `npm run db:setup && npm run demo:seed` avant le balayage. '
      + 'Balayer une base vide ne prouve rien — un écran sans données n’est pas un écran qui rend.',
    );
  }

  if (!(await portLibre(PORT))) {
    throw new Error(
      `le port ${PORT} est déjà occupé — un serveur d'un lancement précédent, probablement. `
      + `Le balayage REFUSE de tourner : il vérifierait un build qu'il n'a pas produit. `
      + `Libérez le port, ou lancez avec SCREENS_PORT=<autre>.`,
    );
  }

  const { pretes, nonResolues } = await routes();
  const cookie = await auditeur();
  await (await getDb()).close();

  console.log(`\nBalayage des écrans — ${pretes.length} routes, mode ${dev ? 'développement' : 'PRODUCTION'}\n`);

  if (!dev) {
    console.log('  build…');
    const build = lancer('npx', ['next', 'build']);
    const sortie: string[] = [];
    build.stdout?.on('data', (d) => sortie.push(String(d)));
    build.stderr?.on('data', (d) => sortie.push(String(d)));
    const code = await new Promise<number>((r) => build.on('close', (c) => r(c ?? 1)));
    if (code !== 0) { console.log(sortie.join('')); throw new Error('le build de production a échoué'); }
  }

  const serveur = lancer('npx', dev ? ['next', 'dev', '-p', String(PORT)] : ['next', 'start', '-p', String(PORT)]);
  const journal: string[] = [];
  serveur.stdout?.on('data', (d) => journal.push(String(d)));
  serveur.stderr?.on('data', (d) => journal.push(String(d)));

  let echecs = 0;
  try {
    await attendre(`http://localhost:${PORT}/`, serveur);
    let verdicts;
    try {
      verdicts = await balayer(`http://localhost:${PORT}`, pretes, cookie);
    } catch (e) {
      if (e instanceof ServeurTombe) {
        console.log(`\n  ARRÊT — ${e.message}\n`);
        console.log(journal.join('').split('\n').filter((l) => /Error|⨯/.test(l)).slice(0, 20).join('\n'));
        process.exit(1);
      }
      throw e;
    }
    console.log('');
    echecs = rapporter(verdicts.filter((v) => !v.ok), nonResolues);

    /* LE HARNAIS NE DOIT PAS POUVOIR SE TAIRE. Zéro route ouverte est une
       erreur, pas un succès — un balayage muet qui sort en vert est pire que
       pas de balayage du tout. */
    if (verdicts.length === 0) throw new Error('aucune route ouverte : le balayage n’a rien vérifié');

    /* Une route peut rendre 200 pendant que le serveur lève une exception : le
       journal est donc lu, et toute erreur y est un ÉCHEC — même sans route en
       faute. C'est ce contrôle qui a rattrapé l'action passée à un composant
       client, invisible autrement. */
    const cotéServeur = erreursServeur(journal.join(''));
    if (cotéServeur.length) {
      console.log('\nErreurs côté SERVEUR pendant le balayage (aucune route n’est en faute au sens HTTP,');
      console.log('et c’est précisément pourquoi ce contrôle existe) :');
      for (const e of cotéServeur.slice(0, 12)) console.log('  ÉCHEC ' + e);
      echecs += cotéServeur.length;
    }

    console.log(`\n${verdicts.length} routes ouvertes · ${echecs} échec(s)\n`);
  } finally {
    tuer(serveur);
  }

  if (echecs > 0) {
    // Le journal du serveur porte la trace des 500 : sans lui, l'échec dit
    // « HTTP 500 » et il faut tout refaire à la main pour savoir pourquoi.
    const erreurs = journal.join('').split('\n').filter((l) => /Error:|at async|at [A-Z]/.test(l)).slice(0, 30);
    if (erreurs.length) console.log('Journal du serveur :\n' + erreurs.join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
