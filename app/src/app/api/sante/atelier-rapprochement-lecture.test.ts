import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import type { NatureDeTest } from '@/lib/methodology/types';
import { GET } from './route';

// LOT 3, TRANCHE 4 — LOT 3 COMPLET (mandat, Partie C.1) — LA LECTURE « atelier
// rapprochement disponible » DE /api/sante, JUMELLE de atelier-confirmation-lecture.test.ts
// (CASH, même raisonnement complet). RAPPRO (`cycle: '*'`) EST plannable sur CASH par
// `planifierProcedure` — PAR une bascule de risque ordinaire (CASH confirmé au périmètre,
// PROG-03, avant que le catalogue ne l'accepte ; `bootstrapNep()` seul confirme REVENUE, pas
// CASH) — contrairement à CONFIRM (R56), qu'AUCUNE bascule ne débloque jamais (PROG-02,
// structurel). Mais RIEN, ni `bootstrapNep()` ni `enrichirMondeDemo()`, ne pose la ligne
// `procedure_instance` elle-même dans le monde semé (R57, docs/BACKLOG_REPORTE.md) : ce
// fichier pose donc, comme sa jumelle, CHAQUE ligne dont il a besoin en contournant
// DIRECTEMENT la base — pas parce que la voie normale est bloquée (elle ne l'est pas, une
// fois le poste au périmètre), mais parce qu'aucun geste réel de ce dépôt ne l'emprunte
// aujourd'hui.
//
// Inclut, DÈS LA PREMIÈRE VERSION, la branche négative de la garde (règle 17) qu'une revue
// hostile a dû ajouter après coup aux deux lectures jumelles précédentes.

describe('atelier rapprochement : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure rapprochement planifiée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure rapprochement planifiée');
  });

  it('RAPPRO sur CASH (atelier réel) passe ; la même nature sur un AUTRE poste (sans atelier construit) reste VERTE — état attendu R57, rapporté honnêtement, jamais bloquant', async () => {
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'CASH', 'sonde atelier — poste avec atelier', 'rapprochement')`,
      [IDS.engNep],
    );
    const vertAvant = await GET();
    const bodyVertAvant = await vertAvant.json();
    const lectureVerteAvant = bodyVertAvant.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
    expect(lectureVerteAvant.ok).toBe(true);
    expect(lectureVerteAvant.detail).toContain('atelier réel');

    /* CONTOURNEMENT DIRECT : `planifierProcedure` ACCEPTERAIT RAPPRO sur CASH
       (R57 : `cycle: '*'`, plannable partout) — mais rien dans ce dépôt ne le
       fait aujourd'hui, et poser cet état via une bascule de risque réelle
       dépasserait le mandat de cette tranche (règle 8). On le simule ici,
       comme pour la ligne hors-poste qui suit (celle-là, la voie réelle ne
       peut de toute façon PAS la produire — TRADE_PAYABLES n'est planifiable
       pour aucune procédure `rapprochement` du catalogue). */
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'TRADE_PAYABLES', 'sonde atelier — poste sans atelier, hors CASH', 'rapprochement')`,
      [IDS.engNep],
    );

    const apresHorsCash = await GET();
    const bodyApresHorsCash = await apresHorsCash.json();
    const lectureApresHorsCash = bodyApresHorsCash.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
    expect(lectureApresHorsCash.ok).toBe(true);
    expect(apresHorsCash.status).toBe(200);
    expect(lectureApresHorsCash.detail).toContain('RAPPRO');
    expect(lectureApresHorsCash.detail).toContain('TRADE_PAYABLES');
    expect(lectureApresHorsCash.detail).toContain('attendu');

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' and nature = 'rapprochement'`, [IDS.engNep]);

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toContain('atelier réel');
    expect(vert.status).toBe(200);

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'CASH' and nature = 'rapprochement'`, [IDS.engNep]);
  });

  it('branche négative (règle 17, corrigée dès la première version) : SANS aucune ligne CASH, la phrase « CASH toujours avec un atelier réel » n’apparaît PAS', async () => {
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'TRADE_PAYABLES', 'sonde branche négative — aucune ligne CASH', 'rapprochement')`,
      [IDS.engNep],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('TRADE_PAYABLES');
      expect(lecture.detail).toContain('attendu');
      expect(lecture.detail).not.toContain('CASH toujours avec un atelier réel');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' and nature = 'rapprochement'`, [IDS.engNep]);
    }
  });

  it('cas connu mauvais (règle 17) : CASH planifié SANS que atelierDeLaNature sache en construire un fait rougir /api/sante entier — régression, pas un état attendu', async () => {
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'rapprochement' && fsliCode === 'CASH') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'CASH', 'sonde régression — CASH sans atelier simulé', 'rapprochement')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecRegressionSimulee } = await import('./route');
      const rouge = await GETAvecRegressionSimulee();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('CASH');
      expect(lectureRouge.detail).toContain('régression');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'CASH' and nature = 'rapprochement'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });

  it('cas MIXTE : une régression CASH ET un gap hors CASH en même temps — le message rouge doit nommer les DEUX', async () => {
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'rapprochement' && fsliCode === 'CASH') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'CASH', 'sonde régression — CASH sans atelier simulé', 'rapprochement')`,
      [IDS.engNep],
    );
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'TRADE_PAYABLES', 'sonde gap hors CASH co-occurrent', 'rapprochement')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecCasMixte } = await import('./route');
      const rouge = await GETAvecCasMixte();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier rapprochement'));
      expect(lectureRouge.ok).toBe(false);
      expect(rouge.status).toBe(500);
      expect(lectureRouge.detail).toContain('CASH');
      expect(lectureRouge.detail).toContain('régression');
      expect(lectureRouge.detail).toContain('TRADE_PAYABLES');
      expect(lectureRouge.detail).toContain('attendu');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and nature = 'rapprochement'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });
});
