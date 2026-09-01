import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// DEUX ÉPREUVES QUI ÉCRIVENT DANS LES MÊMES FICHIERS NE PEUVENT PAS TOURNER
// ENSEMBLE (défaut n°17).
//
// Chaque épreuve INJECTE un défaut dans un vrai fichier, mesure, puis remet le
// fichier. `langue-epreuve` et `lectures-epreuve` injectent toutes deux dans
// `risk/page.tsx` et `processus/page.tsx` ; `parcours-epreuve` réécrit le
// scénario que `npm run clics` est peut-être en train de lire. Lancées en
// parallèle, elles s'effacent l'une l'autre : l'une rapporte « la règle N'A
// RIEN VU » (un faux échec), ou pire, l'une remet un fichier qui porte encore
// l'injection de l'autre — un défaut abandonné dans l'arbre.
//
// La chaîne `npm run verify` est séquentielle : le risque est ARMÉ, pas tiré.
// Un verrou coûte dix lignes et retire l'arme.

const CHEMIN = path.join(os.tmpdir(), 'otto-epreuve.lock');

/** Prend le verrou, ou s'arrête en disant qui le tient. */
export function prendreLeVerrou(nom: string): void {
  try {
    fs.writeFileSync(CHEMIN, `${nom} · pid ${process.pid}`, { flag: 'wx' });
  } catch {
    const tenu = fs.existsSync(CHEMIN) ? fs.readFileSync(CHEMIN, 'utf8') : '(inconnu)';
    console.error(`  ÉCHEC  une autre épreuve écrit déjà dans l’arbre : ${tenu}`);
    console.error('         (les épreuves injectent dans les mêmes fichiers — elles ne se croisent pas)');
    console.error(`         si aucune ne tourne, effacez ${CHEMIN}`);
    process.exit(1);
  }
  const rendre = () => { try { fs.unlinkSync(CHEMIN); } catch { /* déjà rendu */ } };
  process.on('exit', rendre);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => { rendre(); process.exit(130); });
  }
}
