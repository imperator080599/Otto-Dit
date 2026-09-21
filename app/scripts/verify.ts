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

/* F62 (docs/CHASSE.md) : `npx vitest run` peut VIDER les tables transactionnelles de la base
   semée SUR DISQUE (evidence, export_record, control, workpaper, request, fsli…) — reproduit de
   façon fiable via un doublet minimal de deux fichiers de test, racine non encore trouvée
   (hypothèse : un singleton `globalThis.__ottoDb`, db/client.ts, qui survit à l'isolation des
   modules par fichier de Vitest). `vitest` tourne donc EN DERNIER ici, après tout maillon qui a
   besoin de la base semée INTACTE (gardes/semeur lisent son contenu ; screens/clics/visuel/fumee/
   densite la servent par HTTP) — une mitigation, pas une correction (R134, BACKLOG_REPORTE.md). */
export const CHAINE: Maillon[] = [
  { nom: 'db:reset', commande: ['npm', 'run', 'db:reset'] },
  { nom: 'demo:seed', commande: ['npm', 'run', 'demo:seed'] },
  { nom: 'tsc', commande: ['npx', 'tsc', '--noEmit'] },
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
