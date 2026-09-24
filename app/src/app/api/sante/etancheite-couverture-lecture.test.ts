import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { GET } from './route';

// P2-01 (AUD-04) — LA LECTURE « fonctions à acteur sans garde d'étanchéité » DE /api/sante.
//
// `inventaire()` (core/couverture-etancheite.ts) balaie du texte sur disque — rien en base ne
// peut le rompre, c'est un désaccord possible entre du CODE et ce module, pas une ligne de
// données. Même famille que `refus-registre-lecture.test.ts` : le cas connu mauvais (règle 17)
// se provoque par `vi.doMock`.
describe('couverture des gardes d’étanchéité (P2-01, AUD-04) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT;
    vi.doUnmock('@/lib/core/couverture-etancheite');
    vi.resetModules();
  });

  it('en l’état réel du dépôt : aucune fonction à acteur sans garde — la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('fonctions à acteur sans garde'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toMatch(/0 fautive/);
  });

  it('cas connu mauvais (règle 17) : une fonction nue hors « par personne » fait rougir la lecture', async () => {
    vi.resetModules();
    vi.doMock('@/lib/core/couverture-etancheite', async () => {
      const reel = await vi.importActual<typeof import('@/lib/core/couverture-etancheite')>('@/lib/core/couverture-etancheite');
      return {
        ...reel,
        inventaire: () => {
          const { gardees, nues } = reel.inventaire();
          return { gardees, nues: [...nues, 'sonde.ts::fonctionSansGardeDeSonde'] };
        },
      };
    });
    try {
      const { GET: GETMocke } = await import('./route');
      const rouge = await GETMocke();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('fonctions à acteur sans garde'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('sonde.ts::fonctionSansGardeDeSonde');
      expect(rouge.status).toBe(500);
    } finally {
      vi.doUnmock('@/lib/core/couverture-etancheite');
      vi.resetModules();
    }
    const { GET: GETReel } = await import('./route');
    const vert = await GETReel();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('fonctions à acteur sans garde'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });
});
