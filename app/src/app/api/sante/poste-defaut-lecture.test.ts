import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { GET } from './route';

// LOT 4, TRANCHE 4 (mandat, D.6 point 3) — LA LECTURE « sections vides
// repliées par défaut » DE /api/sante.
//
// `blocPorteContenu` (poste.ts) est une fonction PURE, déjà éprouvée sur ses
// quatre états possibles par un test unitaire dédié (poste.test.ts, règle
// 17) : aucune donnée de dossier ne peut la faire diverger de son mapping —
// seule une régression du CODE le pourrait (comme R30, Lot 4 tranche 2, même
// famille de garde). Ce que cette lecture prouve ici : le recoupement entre
// le bloc leadsheet et la présence RÉELLE de comptes, sur un poste qui EN A.

describe('sections vides repliées par défaut : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 240000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('un poste avec des comptes compte au moins un bloc plein — la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('sections vides repliées par défaut'));
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(lecture.detail).toMatch(/\d+ poste\(s\) · \d+ bloc\(s\) plein\(s\) · \d+ bloc\(s\) vide\(s\) replié\(s\) par défaut/);
    /* Le dossier NEP a des postes plantés par runPart1UpToWorkpaper — au
       moins un poste comptant des comptes doit rendre un bloc plein. */
    expect(lecture.detail).not.toMatch(/^0 poste/);
  });

  it('cas connu mauvais (règle 17) : blocPorteContenu qui ne suit plus la leadsheet fait rougir la lecture', async () => {
    /* MUTATION PAR MOCK DE MODULE, pas en base : le module est un espace de
       noms ESM figé (assignation directe refusée par le moteur), donc on
       remplace `blocPorteContenu` par une version qui ment toujours
       (« jamais de contenu ») via `vi.doMock`, on réimporte `./route` à
       neuf pour que sa propre importation dynamique voie le mock, on
       prouve que la lecture DÉTECTE le désaccord avec les comptes réels —
       puis on retire le mock et on réimporte encore, pour que le reste de
       la suite retrouve le vrai module. */
    vi.resetModules();
    vi.doMock('@/lib/services/poste', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/poste')>('@/lib/services/poste');
      return { ...reel, blocPorteContenu: () => false };
    });
    try {
      const { GET: GETMocke } = await import('./route');
      const rouge = await GETMocke();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('sections vides repliées par défaut'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('ne correspond pas à la présence');
      expect(rouge.status).toBe(500);
    } finally {
      vi.doUnmock('@/lib/services/poste');
      vi.resetModules();
    }
    const { GET: GETReel } = await import('./route');
    const vert = await GETReel();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('sections vides repliées par défaut'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });
});
