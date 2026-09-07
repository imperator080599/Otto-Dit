import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import type { NatureDeTest } from '@/lib/methodology/types';
import { GET } from './route';

// LOT 3, TRANCHE 2 (mandat, Partie C.1) — LA LECTURE « atelier recalcul_parametre
// disponible » DE /api/sante, cas connu mauvais (règle 17) : preuve rejouable
// (règle 12) qu'elle rougit quand une procédure recalcul_parametre est
// planifiée sur REVENUE sans que `atelierDeLaNature` sache en construire un —
// le seul poste que cette lecture traite comme une régression (voir route.ts,
// tête de la lecture). Un poste HORS REVENUE sans atelier (R54/R55 : RECALC
// est plannable sur n'importe quel poste dès aujourd'hui) est un état ATTENDU
// et déjà consigné : la lecture doit rester VERTE et le dire honnêtement dans
// le détail, jamais rouge — la première version de ce fichier affirmait le
// contraire (règle 24, réfutation hostile) et confondait un état sanctionné
// avec une régression, exactement la faute que R53 nomme ailleurs dans ce
// dépôt. `bootstrapNep()` seul ne plante PAS RECALC (c'est
// `enrichirMondeDemo()`, un flux séparé, qui le fait dans le monde de
// démonstration réel) : ce fichier pose lui-même chaque ligne dont il a
// besoin, en contournant DIRECTEMENT la base.

describe('atelier recalcul_parametre : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure recalcul_parametre planifiée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure recalcul_parametre planifiée');
  });

  it('RECALC sur REVENUE (atelier réel) passe ; la même nature sur un AUTRE poste (sans atelier construit) reste VERTE — état attendu R54/R55, rapporté honnêtement, jamais bloquant', async () => {
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RECALC', 'substantive', 'REVENUE', 'sonde atelier — poste avec atelier', 'recalcul_parametre')`,
      [IDS.engNep],
    );
    const vertAvant = await GET();
    const bodyVertAvant = await vertAvant.json();
    const lectureVerteAvant = bodyVertAvant.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
    expect(lectureVerteAvant.ok).toBe(true);
    expect(lectureVerteAvant.detail).toContain('atelier réel');

    /* CONTOURNEMENT DIRECT : la voie réelle (programme.ts::planifierProcedure)
       pose `nature` depuis le catalogue mais n'a jamais de contrainte sur le
       POSTE d'une procédure recalcul_parametre — elle peut donc, aujourd'hui
       comme demain (R54/R55), planifier RECALC sur un poste qu'atelierDeLaNature
       ne construit pas encore. On simule ici cet état, sans attendre qu'il se
       produise pour de vrai. */
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RECALC', 'substantive', 'TRADE_RECEIVABLES', 'sonde atelier — poste sans atelier, hors REVENUE', 'recalcul_parametre')`,
      [IDS.engNep],
    );

    const apresHorsRevenue = await GET();
    const bodyApresHorsRevenue = await apresHorsRevenue.json();
    const lectureApresHorsRevenue = bodyApresHorsRevenue.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
    expect(lectureApresHorsRevenue.ok).toBe(true);
    expect(apresHorsRevenue.status).toBe(200);
    expect(lectureApresHorsRevenue.detail).toContain('RECALC');
    expect(lectureApresHorsRevenue.detail).toContain('TRADE_RECEIVABLES');
    expect(lectureApresHorsRevenue.detail).toContain('attendu');

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'TRADE_RECEIVABLES' and nature = 'recalcul_parametre'`, [IDS.engNep]);

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toContain('atelier réel');
    expect(vert.status).toBe(200);

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and nature = 'recalcul_parametre'`, [IDS.engNep]);
  });

  it('cas connu mauvais (règle 17) : REVENUE planifié SANS que atelierDeLaNature sache en construire un fait rougir /api/sante entier — régression, pas un état attendu', async () => {
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'recalcul_parametre' && fsliCode === 'REVENUE') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RECALC', 'substantive', 'REVENUE', 'sonde régression — REVENUE sans atelier simulé', 'recalcul_parametre')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecRegressionSimulee } = await import('./route');
      const rouge = await GETAvecRegressionSimulee();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('REVENUE');
      expect(lectureRouge.detail).toContain('régression');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and nature = 'recalcul_parametre'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });

  it('cas MIXTE (revue hostile, deux réfutateurs indépendants) : une régression REVENUE ET un gap hors REVENUE en même temps — le message rouge doit nommer les DEUX, jamais taire le second parce que le premier a déjà fait rougir', async () => {
    /* Le premier jet de ce correctif calculait `horsRevenue` APRÈS le
       `throw` de la branche REVENUE : un gap hors REVENUE co-occurrent
       disparaissait du message, alors que l'en-tête de la lecture (route.ts)
       affirme qu'il est toujours rapporté. Deux réfutateurs indépendants
       l'ont trouvé en insérant exactement cet état et en lisant le message
       produit — ce test le fige pour que la régression ne revienne pas en
       silence. */
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'recalcul_parametre' && fsliCode === 'REVENUE') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RECALC', 'substantive', 'REVENUE', 'sonde régression — REVENUE sans atelier simulé', 'recalcul_parametre')`,
      [IDS.engNep],
    );
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RECALC', 'substantive', 'TRADE_RECEIVABLES', 'sonde gap hors REVENUE co-occurrent', 'recalcul_parametre')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecCasMixte } = await import('./route');
      const rouge = await GETAvecCasMixte();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier recalcul_parametre'));
      expect(lectureRouge.ok).toBe(false);
      expect(rouge.status).toBe(500);
      expect(lectureRouge.detail).toContain('REVENUE');
      expect(lectureRouge.detail).toContain('régression');
      expect(lectureRouge.detail).toContain('TRADE_RECEIVABLES');
      expect(lectureRouge.detail).toContain('attendu');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and nature = 'recalcul_parametre'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });
});
