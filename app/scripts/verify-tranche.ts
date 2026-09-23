import { spawn } from 'node:child_process';

// P0-04 (AUD-17). `npm run verify:tranche -- --routes=<motif>[,<motif>…] --station=<préfixe>
// [<fichier de test>…]` : la boucle courte d'UNE tranche — jamais les soixante routes ni les cent
// quatre-vingts stations de `npm run verify` (règle 30 : la vérification est PROPORTIONNÉE, et le
// `verify` complet ne tourne qu'à l'expédition). `--routes=` et `--station=` sont chacun
// FACULTATIFS — omis, leur maillon (`screens`/`visuel` ou `clics`) est sauté plutôt que de balayer
// ou conduire le parcours ENTIER sous couvert de « tranche » (une tranche qui balaye tout n'est
// plus une tranche). Les arguments positionnels restants passent tels quels à `vitest run` — un
// fichier de test touché, ou rien (toute la suite). CE QUE CE SCRIPT NE FAIT PAS : il ne devine
// jamais quelles routes ou quelle station une tranche touche — c'est à l'appelant de les nommer.

function arg(nom: string): string | undefined {
  const prefixe = `--${nom}=`;
  const trouve = process.argv.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : undefined;
}

const routes = arg('routes');
const station = arg('station');
const testsArgs = process.argv.slice(2).filter((a) => !a.startsWith('--routes=') && !a.startsWith('--station='));

/* F4 (revue hostile P0-09, 2026-09-23) : tests/screens.test.ts est exclu du config vitest
   général (vitest.config.ts, R142) — le cibler nommément ici échouait ("No test files found"),
   cassant le seul outil de vérification CIBLÉE (règle 30) pour exactement ce fichier. Détecté
   par son nom, jamais deviné : redirigé vers vitest.screens.config.ts, le SEUL config qui
   l'inclut. Un mélange de ce fichier et d'un autre (rare : verify-tranche cible un fichier à la
   fois en pratique) n'est pas géré — refusé plutôt que silencieusement à moitié exécuté. */
const cibleScreens = testsArgs.some((a) => a.replace(/^\.\.\//, '') === 'tests/screens.test.ts');
if (cibleScreens && testsArgs.length > 1) {
  console.error('verify:tranche : tests/screens.test.ts ne peut pas être ciblé avec un autre fichier '
    + '(config Vitest séparée, vitest.screens.config.ts) — lancez-le seul.');
  process.exit(1);
}

interface Maillon { nom: string; commande: string[] }

/* F62 (docs/CHASSE.md, R134) : TOUT lancement de Vitest peut vider les tables transactionnelles
   de la base semée SUR DISQUE — `vitest run` COMME `vitest list` (racine non trouvée). `vitest`
   tourne donc EN DERNIER ici aussi, après screens/clics/visuel, qui ont tous besoin de la base
   semée intacte (même discipline que scripts/verify.ts, corrigée le même jour). */
const CHAINE: Maillon[] = [
  { nom: 'tsc', commande: ['npx', 'tsc', '--noEmit'] },
  ...(routes ? [{ nom: 'screens --routes', commande: ['npm', 'run', 'screens', '--', `--routes=${routes}`] }] : []),
  ...(station ? [{ nom: 'clics --station', commande: ['npm', 'run', 'clics', '--', `--station=${station}`] }] : []),
  ...(routes ? [{ nom: 'visuel --routes', commande: ['npm', 'run', 'visuel', '--', `--routes=${routes}`] }] : []),
  cibleScreens
    ? { nom: 'vitest (ciblé) — screens', commande: ['npm', 'run', 'screens:test'] }
    : { nom: 'vitest (ciblé)', commande: ['npx', 'vitest', 'run', ...testsArgs] },
];

async function lancer(m: Maillon): Promise<number> {
  console.log(`\n── ${m.nom} ${'─'.repeat(Math.max(1, 55 - m.nom.length))}\n`);
  const [bin, ...args] = m.commande;
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (c) => resolve(c ?? 1));
    p.on('error', () => resolve(1));
  });
}

async function main() {
  if (!routes && !station) {
    console.log('  ni --routes= ni --station= : seuls tsc et vitest (ciblé) tournent — '
      + 'nommez --routes=/eng ou --station=sondage pour ajouter screens/clics/visuel.\n');
  }
  const t0 = Date.now();
  for (const m of CHAINE) {
    const code = await lancer(m);
    if (code !== 0) {
      console.log(`\nverify:tranche ROUGE — « ${m.nom} » a échoué (code ${code}), `
        + `${((Date.now() - t0) / 1000).toFixed(1)}s écoulées.\n`);
      process.exit(1);
    }
  }
  console.log(`\nverify:tranche VERT — ${CHAINE.length} maillon(s), ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
