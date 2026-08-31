// CE QUE LE CODE LIT SUR LE DISQUE DOIT PARTIR AVEC LUI (revue utilisateur n°1).
//
// L'application lit des fichiers du DÉPÔT à l'exécution : la méthode du
// cabinet, les fixtures de rejeu, la matrice SOX, les migrations, la police du
// PDF. Le traçage serverless de Next ne les emporte QUE s'ils sont déclarés
// dans `outputFileTracingIncludes`. Une lecture non déclarée ne casse rien en
// local — elle casse EN LIGNE, et seulement là : c'est exactement ce qui a fait
// rendre 500 à /acceptance, /team et /obstacles pendant que la chaîne était
// verte (methodology/valider.mjs, oublié).
//
// Ce test lit les DEUX sources — le code qui lit, la configuration qui trace —
// et échoue quand la première dépasse la seconde. Il ne remplace pas le
// balayage de fumée post-déploiement (`npm run fumee`) : il l'anticipe.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(__dirname, '..', '..');
const SRC = path.join(APP, 'src');

/** Les dossiers déclarés dans next.config.mjs, ramenés à leur premier segment. */
function tracés(): Set<string> {
  const conf = fs.readFileSync(path.join(APP, 'next.config.mjs'), 'utf8');
  const bloc = conf.slice(conf.indexOf('outputFileTracingIncludes'));
  const out = new Set<string>();
  for (const m of bloc.matchAll(/'((?:\.\.\/)?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.*-]+)*)'/g)) {
    const chemin = m[1];
    if (!chemin.includes('/')) continue;
    out.add(chemin.startsWith('../') ? chemin.slice(3).split('/')[0] : `app/${chemin.split('/')[0]}`);
  }
  return out;
}

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

describe('déploiement : ce que le code LIT est TRACÉ', () => {
  it('chaque dossier du dépôt lu à l’exécution est déclaré dans outputFileTracingIncludes', () => {
    const declares = tracés();
    const manquants: string[] = [];
    for (const f of fichiers(SRC)) {
      const src = fs.readFileSync(f, 'utf8');
      const rel = path.relative(APP, f);
      for (const m of src.matchAll(/repoRoot\(\)\s*,\s*'([a-zA-Z0-9_.-]+)'/g)) {
        const dossier = m[1];
        /* app/.env.local est lu s'il existe, et il ne doit JAMAIS partir dans
           un bundle : c'est le seul chemin volontairement non tracé, et son
           absence en production est le comportement voulu (aucune clé en
           ligne, DA-10). */
        if (dossier === 'app') {
          if (/'app',\s*'\.env\.local'/.test(src)) continue;
          if (declares.has('app/assets')) continue;
        }
        if (!declares.has(dossier) && !declares.has(`app/${dossier}`)) {
          manquants.push(`${rel} lit ${dossier}/ — non tracé`);
        }
      }
      if (/racineDepot\(\)/.test(src) && !declares.has('methodology')) {
        manquants.push(`${rel} lit methodology/ — non tracé`);
      }
    }
    expect([...new Set(manquants)],
      'un fichier lu à l’exécution et non tracé rend 500 EN LIGNE, et nulle part ailleurs')
      .toEqual([]);
  });

  it('la méthode du cabinet, elle, est bien tracée — c’est le défaut qui a coûté trois écrans', () => {
    expect(tracés().has('methodology')).toBe(true);
  });
});
