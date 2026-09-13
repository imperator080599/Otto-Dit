import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { auditer } from './ia-vivante';

// LA GARDE STRUCTURELLE — rendre IMPOSSIBLE un cinquième site non gardé (demande du
// fondateur, 2026-09-13 : « add the test that makes a fourth ungated site impossible »).
//
// Ce test rejoue le MÊME balayage que `npx tsx app/scripts/audit/ia-vivante.ts` à chaque
// `vitest run` — pas un instantané figé une fois pour toutes. Découverts par CE balayage,
// avant ce correctif : trois sites (`entretiens.ts`, `walkthrough-analyse.ts` — déjà gardés
// ; puis `extraction/ladder.ts`, `query/ask.ts`, et QUATRE scripts d'évaluation —
// `scripts/eval/entretien.ts`, `scripts/eval/pieces-neuves.ts`, `scripts/cost/measure.ts`,
// `scripts/eval/run.ts` — non gardés). Tous corrigés dans la même tranche que ce test.

describe('la surface « IA vivante » : aucun appel non gardé (règle 17 — éprouvé, pas seulement affirmé)', () => {
  it('CAS CONNU MAUVAIS : un site fabriqué qui construit un adaptateur réel SANS garde est détecté', async () => {
    // Un fichier de sonde, sous scripts/ (balayé), qui imite exactement la forme d'un vrai
    // site non gardé : `new AnthropicAnalyste(...)` sans `assertBudgetActifEnBase(` dans le
    // même fichier. Si le détecteur ne le voit pas, il ne détecte rien de réel non plus.
    const sonde = path.join(import.meta.dirname, '..', '..', 'scripts', 'audit', '_sonde-site-non-garde.ts');
    fs.writeFileSync(sonde, [
      "import { AnthropicAnalyste } from '../../src/lib/services/entretiens-analyste';",
      'export async function siteSonde() {',
      "  return new AnthropicAnalyste().analyser('x', 'y');",
      '}',
      '',
    ].join('\n'));
    try {
      const surface = auditer();
      const entree = surface.find((e) => e.point.nom === 'AnthropicAnalyste' && e.point.genre === 'classe');
      expect(entree, 'la classe AnthropicAnalyste devrait être un point d\'accès suivi').toBeTruthy();
      const trouve = entree!.appelants.find((a) => a.fichier.endsWith('_sonde-site-non-garde.ts'));
      expect(trouve, 'le fichier de sonde devrait apparaître comme appelant').toBeTruthy();
      expect(trouve!.gardeeParAssertBudget, 'la sonde ne porte PAS assertBudgetActifEnBase — doit être détectée NON gardée').toBe(false);
    } finally {
      fs.rmSync(sonde, { force: true });   // fichier de sonde supprimé avant le commit (règle 24)
    }
  });

  it('zéro site réel non gardé — chaque appel à un adaptateur/planificateur réel passe par assertBudgetActifEnBase()', () => {
    const surface = auditer();
    expect(surface.length, 'aucun point d\'accès trouvé — le balayage lui-même est probablement cassé').toBeGreaterThan(0);
    const nonGardes = surface.flatMap((e) => e.appelants.filter((a) => !a.gardeeParAssertBudget)
      .map((a) => `${e.point.nom} (${e.point.genre}) appelé sans garde depuis ${a.fichier}:${a.ligne}`));
    expect(nonGardes, `site(s) réel(s) sans IA-BUDGET-01 : ${nonGardes.join(' · ')}`).toEqual([]);
  });

  it('la surface elle-même compte SEPT points d\'accès connus — un changement de ce nombre sans changement de ce test est le signal d\'un site apparu ou disparu sans qu\'on le remarque', () => {
    const surface = auditer();
    expect(surface.length).toBe(7);
  });
});
