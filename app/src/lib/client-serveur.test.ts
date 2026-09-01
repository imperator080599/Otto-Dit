import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LA FRONTIÈRE CLIENT / SERVEUR, VÉRIFIÉE PAR LE GRAPHE DES IMPORTS.
//
// LE DÉFAUT VÉCU (2026-09-01). Le rail vertical a fait importer `GROUPES` —
// une constante — depuis `services/rail.ts` par `nav.tsx`, qui porte
// 'use client'. `rail.ts` importe `db/client`, qui importe `pg`, qui importe
// `net`, `tls`, `dns`. Le bundle client est parti chercher la couche réseau de
// PostgreSQL : le build de production a échoué et, en développement, les 73
// écrans ont rendu 500 d'un coup. Un import de TYPE aurait été effacé à la
// compilation ; un import de VALEUR emporte tout le module.
//
// Relire les fichiers ne protège de rien : la chaîne fait quatre sauts et
// personne ne la suit à l'œil. On la suit ici, transitivement, depuis chaque
// composant client.

const SRC = path.join(__dirname, '..');
const INTERDITS = ['lib/db/client', 'lib/db/migrate'];

/** Les imports d'un fichier, résolus en chemins de `src/`. Les imports de TYPE
 *  sont ignorés : ils disparaissent à la compilation, c'est leur définition. */
function importsDe(fichier: string): string[] {
  const code = fs.readFileSync(fichier, 'utf8');
  const out: string[] = [];
  const re = /^\s*import\s+(type\s+)?([^;]*?)\s*from\s*'([^']+)'/gm;
  for (const m of code.matchAll(re)) {
    const [, typeSeul, clause, spec] = m;
    /* `import { type X, Y }` : seul Y compte. Si TOUT est marqué `type`,
       l'import s'efface. */
    if (typeSeul) continue;
    const nommes = clause.match(/\{([^}]*)\}/)?.[1];
    if (nommes && nommes.split(',').every((n) => !n.trim() || /^\s*type\s/.test(n))) continue;
    if (!spec.startsWith('@/') && !spec.startsWith('.')) continue;
    const rel = spec.startsWith('@/') ? spec.slice(2) : path.relative(SRC, path.resolve(path.dirname(fichier), spec));
    out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

function resoudre(rel: string): string | null {
  for (const suffixe of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = path.join(SRC, rel + suffixe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** La chaîne d'imports jusqu'à un module interdit, ou null. */
function chaineInterdite(depart: string): string[] | null {
  const vus = new Set<string>();
  const pile: { f: string; chemin: string[] }[] = [{ f: depart, chemin: [path.relative(SRC, depart)] }];
  while (pile.length) {
    const { f, chemin } = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    for (const rel of importsDe(f)) {
      if (INTERDITS.some((i) => rel === i || rel.startsWith(`${i}/`))) return [...chemin, rel];
      const cible = resoudre(rel);
      if (cible) pile.push({ f: cible, chemin: [...chemin, rel] });
    }
  }
  return null;
}

describe('la frontière client / serveur', () => {
  it('aucun composant client n’emporte la base dans le navigateur', () => {
    const clients = fichiers(SRC).filter((f) => /^['"]use client['"]/.test(fs.readFileSync(f, 'utf8').trimStart()));
    /* Un garde qui ne trouve aucun composant client ne garde rien : le
       silence d'un harnais est le défaut qu'on traque (règle 13). */
    expect(clients.length, 'aucun composant client trouvé — le garde ne garde rien').toBeGreaterThan(3);

    const fautes: string[] = [];
    for (const f of clients) {
      const chaine = chaineInterdite(f);
      if (chaine) fautes.push(chaine.join(' → '));
    }
    expect(fautes, 'chaîne(s) d’import qui emportent la base côté client').toEqual([]);
  });
});
