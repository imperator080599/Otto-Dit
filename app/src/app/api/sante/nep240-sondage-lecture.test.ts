import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import type { NatureDeTest } from '@/lib/methodology/types';
import { GET } from './route';

// LOT 6, TRANCHE 3 (NEP 240, 2026-09-16) — LA LECTURE « atelier sondage_pieces réservé à
// REV-SUBST sur REVENUE » DE /api/sante, cas connu mauvais (règle 17). `atelierDeLaNature`
// (programme.ts) distingue désormais REV-SUBST/MANUEL/FRAUDE par `template_code` — ce
// fichier prouve que le distinguo tient (MANUEL/FRAUDE planifiées restent SANS atelier,
// lecture verte, disclosed R104) ET qu'une régression du distinguo (un atelier rendu à
// MANUEL/FRAUDE malgré tout) fait rougir /api/sante entier, pas seulement un log.

describe('atelier sondage_pieces réservé à REV-SUBST : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure sondage_pieces planifiée sur REVENUE : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier sondage_pieces réservé à REV-SUBST'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure sondage_pieces planifiée sur REVENUE');
  });

  it('MANUEL planifiée sur REVENUE, honnêtement SANS atelier : la lecture reste VERTE (état attendu, disclosed R104), jamais un lien menteur', async () => {
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'MANUEL', 'substantive', 'REVENUE', 'sonde atelier — MANUEL sans atelier', 'sondage_pieces')`,
      [IDS.engNep],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier sondage_pieces réservé à REV-SUBST'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('MANUEL');
      expect(lecture.detail).toContain('R104');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'MANUEL' and nature = 'sondage_pieces'`, [IDS.engNep]);
    }
  });

  it('cas connu mauvais (règle 17) : si atelierDeLaNature oubliait le template_code et rouvrait /testing pour FRAUDE, /api/sante rougit entier — régression, pas un état attendu', async () => {
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        // Simule EXACTEMENT le comportement d'avant ce correctif : sondage_pieces/REVENUE
        // ouvre toujours /testing, quel que soit le template.
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'sondage_pieces' && fsliCode === 'REVENUE') ? `${base}/testing` : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'FRAUDE', 'substantive', 'REVENUE', 'sonde régression — lien menteur simulé', 'sondage_pieces')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecRegressionSimulee } = await import('./route');
      const rouge = await GETAvecRegressionSimulee();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier sondage_pieces réservé à REV-SUBST'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('FRAUDE');
      expect(lectureRouge.detail).toContain('régression');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code = 'FRAUDE' and nature = 'sondage_pieces'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });
});
