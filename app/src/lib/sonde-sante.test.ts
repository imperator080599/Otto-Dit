import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LA SONDE DOIT ÉPROUVER CE QUE LES ÉCRANS LISENT — pas ce qu'ils lisaient.
//
// LE DÉFAUT VÉCU (2026-09-01, revue n°2). La vue d'ensemble a été réécrite et
// a cessé d'utiliser `services/tableau-de-bord`. La sonde `/api/sante`, elle,
// a continué de l'appeler : elle serait restée VERTE en production pendant que
// l'écran réel cassait, parce qu'elle éprouvait un service que plus aucun
// écran n'atteignait. Une sonde qui teste du code mort est pire qu'aucune
// sonde — elle rassure (règle 13).
//
// Le garde : tout service importé par la sonde doit être importé par au moins
// un ÉCRAN. Il ne dit pas que la couverture est complète ; il rend impossible
// le cas inverse, celui qui rassure à tort.

const SRC = path.join(__dirname, '..');

/** Les deux formes : `from '…'` et `await import('…')` — la sonde n'utilise
 *  que la seconde, et ne chercher que la première l'aurait rendue invisible. */
function importsDe(fichier: string): string[] {
  const code = fs.readFileSync(fichier, 'utf8');
  return [
    ...[...code.matchAll(/from\s+'(@\/lib\/services\/[^']+)'/g)].map((m) => m[1]),
    ...[...code.matchAll(/import\(\s*'(@\/lib\/services\/[^']+)'\s*\)/g)].map((m) => m[1]),
  ];
}

/** Un ÉCRAN, c'est une page — mais aussi un LAYOUT (le rail y vit) et une
 *  route servie. Ne compter que les `page.tsx` condamnait le rail. */
function ecrans(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ecrans(p, out);
    else if (/^(page|layout)\.tsx$/.test(e.name)
      || (e.name === 'route.ts' && !p.includes(`${path.sep}sante${path.sep}`))) out.push(p);
  }
  return out;
}

describe('la sonde de santé', () => {
  it('n’éprouve aucun service que plus aucun écran n’atteint', () => {
    const sonde = path.join(SRC, 'app', 'api', 'sante', 'route.ts');
    const services = new Set(importsDe(sonde));
    expect(services.size, 'la sonde n’importe aucun service : elle n’éprouve rien')
      .toBeGreaterThan(4);

    const lus = new Set<string>();
    for (const f of ecrans(path.join(SRC, 'app'))) {
      for (const s of importsDe(f)) lus.add(s);
    }
    /* Les services qu'un écran atteint INDIRECTEMENT (par un autre service)
       comptent aussi : on suit un saut de plus, sinon le garde condamnerait
       une composition légitime. */
    for (const s of [...lus]) {
      const f = path.join(SRC, `${s.replace('@/', '')}.ts`);
      if (fs.existsSync(f)) for (const x of importsDe(f)) lus.add(x);
    }

    const mortes = [...services].filter((s) => !lus.has(s));
    expect(mortes, 'service(s) éprouvés par la sonde et lus par aucun écran').toEqual([]);
  });
});
