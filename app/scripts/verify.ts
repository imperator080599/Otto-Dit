import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P0-07 (AUD-24). `npm run verify` chaînait ses maillons par `&&`, sans aucune trace de CE QUI a
// tourné, combien de temps, ni sur quel arbre — une livraison qui citait « verify vert » n'avait
// que sa mémoire pour preuve (règle 12 : une vérification que personne ne peut rejouer est une
// affirmation). Ce wrapper lance chaque maillon sous son propre chronométrage et APPEND une ligne
// par maillon à `docs/instantanes/verify.json` — le format `Verify` (`scripts/reprise.ts`,
// `{executions, precedent}`) que `docs/REPRISE.md` lit déjà : un historique de `Execution`
// (`commande, sha, quand, resultat, source`), jamais un instantané à un seul étage qui écraserait
// les runs précédents. `precedent` (la continuité d'un rapport à l'autre) est PRÉSERVÉ tel quel —
// ce script ne le connaît pas, ce n'est pas son rôle de l'inventer. CE QUE CE FICHIER NE FAIT PAS :
// il ne pose pas de budget global — c'est le rôle du `timeout` externe (règle 35, forme
// opérative), jamais dupliqué ici.

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.dirname(APP);

interface Maillon { nom: string; commande: string[] }

/* F62 (docs/CHASSE.md) : TOUT lancement de Vitest — `npx vitest run` COMME `npx vitest list`
   (utilisé par `plancher.ts` pour compter les tests, JAMAIS pour les exécuter) — peut VIDER les
   tables transactionnelles de la base semée SUR DISQUE (evidence, export_record, control,
   workpaper, request, fsli…). Mesuré directement, pas supposé : `npm run plancher` SEUL, sur une
   base fraîchement semée et rien d'autre exécuté avant, suffit à reproduire — la racine exacte
   (pourquoi `vitest list`, une collecte qui ne doit exécuter ni `beforeAll` ni `it`, touche le
   disque) reste NON TROUVÉE (R134, BACKLOG_REPORTE.md). `plancher` ET `vitest` tournent donc TOUS
   LES DEUX en fin de chaîne, après tout maillon qui a besoin de la base semée INTACTE (gardes/
   semeur lisent son contenu ; langue/lectures/parcours sont de purs balayages de texte, sans
   Vitest ; screens/clics/visuel/fumee/densite la servent par HTTP) — une mitigation, pas une
   correction. */
export const CHAINE: Maillon[] = [
  { nom: 'db:reset', commande: ['npm', 'run', 'db:reset'] },
  { nom: 'demo:seed', commande: ['npm', 'run', 'demo:seed'] },
  { nom: 'tsc', commande: ['npx', 'tsc', '--noEmit'] },
  { nom: 'docs:modele:epreuve', commande: ['npm', 'run', 'docs:modele:epreuve'] },
  { nom: 'gardes', commande: ['npm', 'run', 'gardes'] },
  { nom: 'semeur', commande: ['npm', 'run', 'semeur'] },
  { nom: 'langue', commande: ['npm', 'run', 'langue'] },
  { nom: 'langue:epreuve', commande: ['npm', 'run', 'langue:epreuve'] },
  { nom: 'langue-refus', commande: ['npm', 'run', 'langue-refus'] },
  { nom: 'lectures', commande: ['npm', 'run', 'lectures'] },
  { nom: 'lectures:epreuve', commande: ['npm', 'run', 'lectures:epreuve'] },
  { nom: 'parcours', commande: ['npm', 'run', 'parcours'] },
  { nom: 'parcours:epreuve', commande: ['npm', 'run', 'parcours:epreuve'] },
  { nom: 'screens', commande: ['npm', 'run', 'screens'] },
  { nom: 'fumee', commande: ['npm', 'run', 'fumee'] },
  { nom: 'densite', commande: ['npm', 'run', 'densite'] },
  { nom: 'clics', commande: ['npm', 'run', 'clics'] },
  { nom: 'visuel', commande: ['npm', 'run', 'visuel'] },
  { nom: 'plancher', commande: ['npm', 'run', 'plancher'] },
  /* P0-09 (mandat 2026-09-23, correction §2) : tests/screens.test.ts SEUL, hors du
     `vitest run` général qui suit (exclu de vitest.config.ts) — R142/CLAUDE.md §7 :
     deux vitest en parallèle font tomber le serveur du balayage. Placé ICI, juste
     après `plancher` (qui invoque déjà `vitest list`, F62 — l'intégrité du monde semé
     à cet endroit n'est donc pas STRICTEMENT garantie par le seul positionnement),
     mais tests/screens.test.ts porte son propre repli — `assurerMondeDemo()` y
     détecte un monde incomplet et le reconstruit avant de balayer, filet mesuré (revue
     hostile P0-09, F5). Exécuté par Vitest (next dev + Playwright), pas par
     `scripts/screens/run.ts` (qui, lui, tourne contre un build de PRODUCTION, un
     balayage différent). */
  { nom: 'screens:test', commande: ['npm', 'run', 'screens:test'] },
  { nom: 'vitest', commande: ['npx', 'vitest', 'run'] },
];

/** Les NOMS seuls, dans l'ordre — ce que `scripts/reprise.ts` lit comme la chaîne `verify`
 *  déclarée (remplace le parsing du texte `&&` de `package.json`, disparu avec ce wrapper). */
export const NOMS = CHAINE.map((m) => m.nom);

interface Execution {
  commande: string;
  sha: string;
  quand: string;
  resultat: string;
  source: string;
  variante?: string;
}
interface VerifyJson { executions: Execution[]; precedent: { source: string; nonExecutees: string[] } }

function sha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim();
  } catch {
    return '(SHA illisible)';
  }
}

async function lancer(m: Maillon): Promise<{ code: number | null; dureeMs: number }> {
  const demarre = Date.now();
  const [bin, ...args] = m.commande;
  const code = await new Promise<number | null>((resolve) => {
    const p = spawn(bin, args, { cwd: APP, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (c) => resolve(c));
    p.on('error', () => resolve(-1));
  });
  return { code, dureeMs: Date.now() - demarre };
}

function lireExistant(chemin: string): VerifyJson {
  if (!fs.existsSync(chemin)) return { executions: [], precedent: { source: '(aucun rapport précédent)', nonExecutees: [] } };
  try {
    return JSON.parse(fs.readFileSync(chemin, 'utf8')) as VerifyJson;
  } catch {
    return { executions: [], precedent: { source: '(aucun rapport précédent — fichier illisible)', nonExecutees: [] } };
  }
}

async function main() {
  const arbre = sha();
  console.log(`\nverify — ${CHAINE.length} maillon(s), arbre ${arbre}\n`);

  const cheminSortie = path.join(REPO, 'docs', 'instantanes', 'verify.json');
  const donnees = lireExistant(cheminSortie);

  let echecA: string | null = null;
  let executees = 0;

  for (const m of CHAINE) {
    console.log(`\n── ${m.nom} ${'─'.repeat(Math.max(1, 60 - m.nom.length))}\n`);
    const { code, dureeMs } = await lancer(m);
    const ok = code === 0;
    donnees.executions.push({
      commande: m.nom,
      sha: arbre,
      quand: new Date().toISOString(),
      resultat: ok ? `ok (${(dureeMs / 1000).toFixed(1)}s)` : `ÉCHEC — code ${code} (${(dureeMs / 1000).toFixed(1)}s)`,
      source: 'scripts/verify.ts',
    });
    console.log(`\n  ${ok ? 'ok  ' : 'ÉCHEC'}  ${m.nom} (${(dureeMs / 1000).toFixed(1)}s, code ${code})\n`);
    executees++;
    if (!ok) { echecA = m.nom; break; }
  }

  fs.writeFileSync(cheminSortie, `${JSON.stringify(donnees, null, 2)}\n`);
  const nonExecutes = NOMS.slice(executees);
  console.log(`\ndocs/instantanes/verify.json écrit — ${executees}/${CHAINE.length} maillon(s) exécuté(s) sur cet arbre` +
    (nonExecutes.length ? `, ${nonExecutes.length} non exécuté(s) cette fois : ${nonExecutes.join(', ')}` : '') + '\n');

  if (echecA) {
    console.log(`verify ROUGE — arrêté au maillon « ${echecA} ».\n`);
    process.exit(1);
  }
  console.log('verify VERT — tous les maillons ont réussi.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
