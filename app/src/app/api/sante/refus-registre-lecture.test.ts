import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { GET } from './route';

// P1-09 (AUD-14) — LA LECTURE « registre des refus » DE /api/sante.
//
// `REGISTRE_REFUS` (lib/core/refus.ts) et `LIBELLES` (lib/i18n/catalogue.ts) sont deux fichiers
// TypeScript indépendants qui doivent rester synchronisés. Rien en base ne peut le rompre —
// c'est un désaccord entre DEUX MODULES, pas une ligne de données — donc le cas connu mauvais
// (règle 17) se provoque par `vi.doMock`, comme poste-defaut-lecture.test.ts (même famille).
describe('registre des refus (P1-09, AUD-14) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT;
    vi.doUnmock('@/lib/core/refus');
    vi.resetModules();
  });

  it('en l’état réel du dépôt : chaque code du registre a son entrée i18n — la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('registre des refus'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toMatch(/\d+ code\(s\) de refus catalogués · 0 entrée manquante/);
  });

  it('cas connu mauvais (règle 17) : un code du registre sans entrée de catalogue fait rougir la lecture', async () => {
    vi.resetModules();
    vi.doMock('@/lib/core/refus', async () => {
      const reel = await vi.importActual<typeof import('@/lib/core/refus')>('@/lib/core/refus');
      return {
        ...reel,
        REGISTRE_REFUS: {
          ...reel.REGISTRE_REFUS,
          'FAUX-CODE-DE-SONDE': { cle: 'refus.FAUX-CODE-DE-SONDE-QUI-N-EXISTE-PAS', famille: 'sonde' },
        },
      };
    });
    try {
      const { GET: GETMocke } = await import('./route');
      const rouge = await GETMocke();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('registre des refus'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('FAUX-CODE-DE-SONDE');
      expect(rouge.status).toBe(500);
    } finally {
      vi.doUnmock('@/lib/core/refus');
      vi.resetModules();
    }
    const { GET: GETReel } = await import('./route');
    const vert = await GETReel();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('registre des refus'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });
});
