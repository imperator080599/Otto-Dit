import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { GET } from './route';

// P2-03a (AUD-07) — LA LECTURE « session signée : oui/non » DE /api/sante.
//
// Rouge SEULEMENT quand ça compte : sur une instance VERCEL (la démonstration
// publique RÉELLEMENT DÉPLOYÉE) sans `OTTO_SESSION_SECRET` posé. Ailleurs —
// y compris sous `OTTO_DEMO_PUBLIC=1` sans VERCEL, l'état que pose
// `scripts/fumee/run.ts` pour tester localement — l'absence du secret est
// l'état attendu tant que personne n'a rempli `.env.local` : la lecture le
// DIT, sans rougir (une première version rougissait ici et cassait `fumee`
// sur tout arbre local — revue hostile P2-03a, corrigé avant expédition).
// Cas connu mauvais (règle 17) : les variables réelles sont manipulées,
// jamais un mock du module.
describe('session signée (P2-03a, AUD-07) : la lecture /api/sante', () => {
  const AVANT_DEMO = process.env.OTTO_DEMO_PUBLIC;
  const AVANT_VERCEL = process.env.VERCEL;
  const AVANT_SECRET = process.env.OTTO_SESSION_SECRET;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT_DEMO;
    process.env.VERCEL = AVANT_VERCEL;
    process.env.OTTO_SESSION_SECRET = AVANT_SECRET;
  });

  it('démonstration publique locale (VERCEL absent, comme `fumee`), sans secret posé : « non », pas de rouge', async () => {
    delete process.env.VERCEL;
    delete process.env.OTTO_SESSION_SECRET;
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('session signée'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toMatch(/^non/);
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais : sur VERCEL, sans secret posé, la lecture rougit', async () => {
    process.env.VERCEL = '1';
    delete process.env.OTTO_SESSION_SECRET;
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('session signée'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('OTTO_SESSION_SECRET absent');
      expect(rouge.status).toBe(500);
    } finally {
      delete process.env.VERCEL;
    }
  });

  it('secret posé (VERCEL ou pas) : « oui », vert', async () => {
    process.env.OTTO_SESSION_SECRET = 'sonde-de-test-jamais-utilisee-en-production';
    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('session signée'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toMatch(/^oui/);
    expect(vert.status).toBe(200);
  });
});
