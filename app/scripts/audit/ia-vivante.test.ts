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
      /* AUTO-01 (mandat 2026-09-14, §2.4) : la sonde ne porte pas non plus
         assertNiveauOuvert — même détecteur, même discipline (règle 17). */
      expect(trouve!.gardeeParAssertNiveau, 'la sonde ne porte PAS assertNiveauOuvert — doit être détectée NON gardée').toBe(false);
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

  /* AUTO-01 (mandat 2026-09-14, §2.4) : « le niveau dit ce que l'IA a le droit de faire,
     IA-BUDGET-01 dit si elle a le droit de dépenser — les deux doivent passer, aucune ne
     remplace l'autre. » Même détecteur, même garde structurelle, contre le MÊME défaut :
     un cinquième site qui porterait IA-BUDGET-01 sans jamais poser AUTO-01 passerait le
     test ci-dessus tout en laissant l'agent agir sous un niveau fermé (L0).
     QUATRE EXCEPTIONS ÉCRITES, PAS SILENCIEUSES : `assertNiveauOuvert` est MISSION-scopée
     (elle lit `engagement.automation_level`/le plafond du PACK de la mission) — IA-BUDGET-01,
     elle, est GLOBALE (`app_state`, un seul déploiement). Les quatre harnais de mesure
     ci-dessous n'opèrent sur AUCUN dossier réel (aucun `engagementId` en portée, rien écrit en
     base — leur propre en-tête le dit) : un niveau de MISSION ne peut structurellement pas s'y
     appliquer, pas plus qu'une exception d'étanchéité ne s'applique à une fonction qui ne porte
     sur aucun dossier d'autrui (`PAR_PERSONNE`, etancheite-executee.test.ts, même discipline). */
  const HORS_PORTEE_AUTO01: Record<string, string> = {
    'scripts/eval/entretien.ts': 'harnais de mesure sans engagementId — aucun dossier réel, rien écrit en base',
    'scripts/cost/measure.ts': 'harnais de mesure sans engagementId — aucun dossier réel, rien écrit en base',
    'scripts/eval/pieces-neuves.ts': 'harnais de mesure sans engagementId — aucun dossier réel, rien écrit en base',
    'scripts/eval/run.ts': 'harnais de mesure sans engagementId — aucun dossier réel, rien écrit en base',
  };
  it('zéro site réel non gardé par AUTO-01 — chaque appel réel passe aussi par assertNiveauOuvert()', () => {
    const surface = auditer();
    const nonGardes = surface.flatMap((e) => e.appelants.filter((a) => !a.gardeeParAssertNiveau && !(a.fichier in HORS_PORTEE_AUTO01))
      .map((a) => `${e.point.nom} (${e.point.genre}) appelé sans garde depuis ${a.fichier}:${a.ligne}`));
    expect(nonGardes, `site(s) réel(s) sans AUTO-01 : ${nonGardes.join(' · ')}`).toEqual([]);
  });

  it('la surface elle-même compte SEPT points d\'accès connus — un changement de ce nombre sans changement de ce test est le signal d\'un site apparu ou disparu sans qu\'on le remarque', () => {
    const surface = auditer();
    expect(surface.length).toBe(7);
  });
});
