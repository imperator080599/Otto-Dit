import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P0-07 (AUD-24). `npm run verify` chaînait ses maillons par `&&`, sans aucune trace de CE QUI a
// tourné, combien de temps, ni sur quel arbre — une livraison qui citait « verify vert » n'avait
// que sa mémoire pour preuve (règle 12 : une vérification que personne ne peut rejouer est une
// affirmation). Ce wrapper lance chaque maillon sous son propre chronométrage, capture son code
// de sortie, et écrit `docs/instantanes/verify.json` — le SHA et l'heure de la mesure, la liste
// ORDONNÉE des maillons avec leur statut, et le premier échec qui a arrêté la chaîne (fail-fast,
// comme le `&&` d'origine : aucune raison de laisser tourner `clics`/`visuel` après un `tsc`
// rouge). CE QUE CE FICHIER NE FAIT PAS : il ne pose pas de budget global — c'est le rôle du
// `timeout` externe (règle 35, forme opérative), jamais dupliqué ici.

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.dirname(APP);

interface Maillon { nom: string; commande: string[] }

const CHAINE: Maillon[] = [
  { nom: 'db:reset', commande: ['npm', 'run', 'db:reset'] },
  { nom: 'demo:seed', commande: ['npm', 'run', 'demo:seed'] },
  { nom: 'tsc', commande: ['npx', 'tsc', '--noEmit'] },
  { nom: 'vitest', commande: ['npx', 'vitest', 'run'] },
  { nom: 'gardes', commande: ['npm', 'run', 'gardes'] },
  { nom: 'semeur', commande: ['npm', 'run', 'semeur'] },
  { nom: 'plancher', commande: ['npm', 'run', 'plancher'] },
  { nom: 'langue', commande: ['npm', 'run', 'langue'] },
  { nom: 'langue:epreuve', commande: ['npm', 'run', 'langue:epreuve'] },
  { nom: 'lectures', commande: ['npm', 'run', 'lectures'] },
  { nom: 'lectures:epreuve', commande: ['npm', 'run', 'lectures:epreuve'] },
  { nom: 'parcours', commande: ['npm', 'run', 'parcours'] },
  { nom: 'parcours:epreuve', commande: ['npm', 'run', 'parcours:epreuve'] },
  { nom: 'screens', commande: ['npm', 'run', 'screens'] },
  { nom: 'fumee', commande: ['npm', 'run', 'fumee'] },
  { nom: 'densite', commande: ['npm', 'run', 'densite'] },
  { nom: 'clics', commande: ['npm', 'run', 'clics'] },
  { nom: 'visuel', commande: ['npm', 'run', 'visuel'] },
];

interface ResultatMaillon {
  nom: string;
  commande: string;
  demarre: string;
  termine: string;
  duree_ms: number;
  code_sortie: number | null;
  ok: boolean;
}

function sha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim();
  } catch {
    return '(SHA illisible)';
  }
}

async function lancer(m: Maillon): Promise<ResultatMaillon> {
  const demarre = new Date();
  const [bin, ...args] = m.commande;
  const code = await new Promise<number | null>((resolve) => {
    const p = spawn(bin, args, { cwd: APP, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (c) => resolve(c));
    p.on('error', () => resolve(-1));
  });
  const termine = new Date();
  return {
    nom: m.nom,
    commande: m.commande.join(' '),
    demarre: demarre.toISOString(),
    termine: termine.toISOString(),
    duree_ms: termine.getTime() - demarre.getTime(),
    code_sortie: code,
    ok: code === 0,
  };
}

async function main() {
  const cible = process.env.VERIFY_ARBRE ?? 'complet';
  console.log(`\nverify (${cible}) — ${CHAINE.length} maillon(s), arbre ${sha()}\n`);

  const resultats: ResultatMaillon[] = [];
  let echecA: string | null = null;

  for (const m of CHAINE) {
    console.log(`\n── ${m.nom} ${'─'.repeat(Math.max(1, 60 - m.nom.length))}\n`);
    const r = await lancer(m);
    resultats.push(r);
    console.log(`\n  ${r.ok ? 'ok  ' : 'ÉCHEC'}  ${m.nom} (${(r.duree_ms / 1000).toFixed(1)}s, code ${r.code_sortie})\n`);
    if (!r.ok) { echecA = m.nom; break; }
  }

  const nonExecutes = CHAINE.slice(resultats.length).map((m) => m.nom);
  const rapport = {
    sha: sha(),
    quand: new Date().toISOString(),
    cible,
    echecA,
    maillons: resultats,
    nonExecutes,
  };
  const cheminSortie = path.join(REPO, 'docs', 'instantanes', 'verify.json');
  fs.writeFileSync(cheminSortie, `${JSON.stringify(rapport, null, 2)}\n`);
  console.log(`\ndocs/instantanes/verify.json écrit — ${resultats.length}/${CHAINE.length} maillon(s) exécuté(s)` +
    (nonExecutes.length ? `, ${nonExecutes.length} non exécuté(s) : ${nonExecutes.join(', ')}` : '') + '\n');

  if (echecA) {
    console.log(`verify ROUGE — arrêté au maillon « ${echecA} ».\n`);
    process.exit(1);
  }
  console.log('verify VERT — tous les maillons ont réussi.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
