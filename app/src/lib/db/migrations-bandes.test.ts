import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './client';

// LES BANDES DE NUMÉROS DE MIGRATION (mandat du jour, colonne vertébrale) :
// gravées avant la première ligne de SQL. Un numéro hors bande, ou pris deux
// fois, fait échouer la CI. Les bandes sont la source de vérité ici, et
// docs/MIGRATIONS_BANDES.md les recopie pour l'œil humain.

export const BANDES: { de: number; a: number; proprietaire: string }[] = [
  { de: 1, a: 39, proprietaire: 'historique (avant le mandat du jour)' },
  { de: 40, a: 49, proprietaire: 'COLONNE VERTÉBRALE' },
  { de: 50, a: 59, proprietaire: 'W1 Atelier de test' },
  { de: 60, a: 69, proprietaire: 'W2 Feuille de travail' },
  { de: 80, a: 89, proprietaire: 'W3 Visa, revue, concurrence' },
  { de: 100, a: 109, proprietaire: 'W4 Intégrité & locataire (préfixe iso_)' },
  { de: 110, a: 119, proprietaire: 'W5 Fiabilité & diagnostics' },
  { de: 130, a: 999, proprietaire: 'COLONNE VERTÉBRALE, intégration du soir' },
];

describe('les numéros de migration', () => {
  const dir = path.join(repoRoot(), 'supabase', 'migrations');
  const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  it('portent un numéro à quatre chiffres, un slug, et aucun numéro n’est pris deux fois', () => {
    const vus = new Map<number, string>();
    for (const f of fichiers) {
      const m = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
      expect(m, `${f} : forme 00NN_<slug>.sql`).not.toBeNull();
      const n = Number(m![1]);
      expect(vus.has(n), `${f} : le numéro ${n} est déjà pris par ${vus.get(n)}`).toBe(false);
      vus.set(n, f);
    }
  });

  it('tombent chacun dans une bande déclarée, et la bande W4 porte le préfixe iso_', () => {
    for (const f of fichiers) {
      const n = Number(f.slice(0, 4));
      const bande = BANDES.find((b) => n >= b.de && n <= b.a);
      expect(bande, `${f} : numéro hors bande`).toBeDefined();
      if (bande!.de === 100) expect(f.slice(5)).toMatch(/^iso_/);
    }
  });
});
