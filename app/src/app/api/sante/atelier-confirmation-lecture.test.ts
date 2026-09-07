import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import type { NatureDeTest } from '@/lib/methodology/types';
import { GET } from './route';

// LOT 3, TRANCHE 3 (mandat, Partie C.1) — LA LECTURE « atelier confirmation_externe
// disponible » DE /api/sante, JUMELLE de atelier-recalcul-lecture.test.ts (CASH au
// lieu de REVENUE, même raisonnement complet, y compris le correctif du cas mixte
// que la revue hostile de la tranche précédente a déjà imposé — appliqué ici dès la
// première version, pas en second correctif).
//
// AUCUNE instance confirmation_externe n'existe dans le monde semé, ni même
// `enrichirMondeDemo()` (R56, docs/BACKLOG_REPORTE.md) : contrairement à RECALC
// (tranche 2, présente mais cachée en « hors commande »), il n'y a ICI aucun geste
// réel, nulle part dans ce dépôt, qui produit une ligne confirmation_externe — le
// catalogue lui-même (CONFIRM, `postes` sans CASH ni aucun fsli.code réel) refuse
// PROG-02 toute tentative de la planifier par la voie normale. Ce fichier pose donc
// CHAQUE ligne dont il a besoin en contournant DIRECTEMENT la base, sans prétendre
// à un jour où ce contournement ne serait plus nécessaire — cette lecture le dit
// elle-même en tête de route.ts.

describe('atelier confirmation_externe : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure confirmation_externe planifiée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure confirmation_externe planifiée');
  });

  it('CONFIRM sur CASH (atelier réel) passe ; la même nature sur un AUTRE poste (sans atelier construit) reste VERTE — état attendu R56, rapporté honnêtement, jamais bloquant', async () => {
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'CASH', 'sonde atelier — poste avec atelier', 'confirmation_externe')`,
      [IDS.engNep],
    );
    const vertAvant = await GET();
    const bodyVertAvant = await vertAvant.json();
    const lectureVerteAvant = bodyVertAvant.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
    expect(lectureVerteAvant.ok).toBe(true);
    expect(lectureVerteAvant.detail).toContain('atelier réel');

    /* CONTOURNEMENT DIRECT : `planifierProcedure` REFUSE (PROG-02) de
       planifier CONFIRM sur quelque poste que ce soit aujourd'hui (R56) — la
       voie réelle ne peut donc PAS produire cet état, ni le suivant. On les
       simule tous les deux, sans attendre qu'ils se produisent pour de vrai. */
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'TRADE_PAYABLES', 'sonde atelier — poste sans atelier, hors CASH', 'confirmation_externe')`,
      [IDS.engNep],
    );

    const apresHorsCash = await GET();
    const bodyApresHorsCash = await apresHorsCash.json();
    const lectureApresHorsCash = bodyApresHorsCash.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
    expect(lectureApresHorsCash.ok).toBe(true);
    expect(apresHorsCash.status).toBe(200);
    expect(lectureApresHorsCash.detail).toContain('CONFIRM');
    expect(lectureApresHorsCash.detail).toContain('TRADE_PAYABLES');
    expect(lectureApresHorsCash.detail).toContain('attendu');

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' and nature = 'confirmation_externe'`, [IDS.engNep]);

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toContain('atelier réel');
    expect(vert.status).toBe(200);

    await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'CASH' and nature = 'confirmation_externe'`, [IDS.engNep]);
  });

  it('branche négative (revue hostile, réfutateur B) : SANS aucune ligne CASH, la phrase « CASH toujours avec un atelier réel » n’apparaît PAS — elle n’affirme jamais un fait qu’aucune ligne n’a permis de vérifier', async () => {
    /* CE QUE LA MUTATION-PREUVE DE LA REVUE HOSTILE A TROUVÉ : les deux tests
       précédents ne construisent jamais l'état « des lignes confirmation_externe
       existent, AUCUNE sur CASH » — chaque scénario passe soit par une ligne
       CASH seule, soit par CASH+hors-CASH ensemble. Retirer la garde
       `cashVerifie` de route.ts (mutation appliquée puis annulée par le
       réfutateur) laissait donc les 4 tests d'alors tous verts : la garde
       n'avait jamais été prouvée sur sa branche négative (règle 17 — « un
       détecteur qui n'a jamais échoué exprès n'a jamais été testé »). Ce test
       construit précisément cet état. */
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'TRADE_PAYABLES', 'sonde branche négative — aucune ligne CASH', 'confirmation_externe')`,
      [IDS.engNep],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('TRADE_PAYABLES');
      expect(lecture.detail).toContain('attendu');
      expect(lecture.detail).not.toContain('CASH toujours avec un atelier réel');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' and nature = 'confirmation_externe'`, [IDS.engNep]);
    }
  });

  it('cas connu mauvais (règle 17) : CASH planifié SANS que atelierDeLaNature sache en construire un fait rougir /api/sante entier — régression, pas un état attendu', async () => {
    vi.resetModules();
    vi.doMock('@/lib/services/programme', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/programme')>('@/lib/services/programme');
      return {
        ...reel,
        atelierDeLaNature: (nature: NatureDeTest, fsliCode: string, base: string) =>
          (nature === 'confirmation_externe' && fsliCode === 'CASH') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'CASH', 'sonde régression — CASH sans atelier simulé', 'confirmation_externe')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecRegressionSimulee } = await import('./route');
      const rouge = await GETAvecRegressionSimulee();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('CASH');
      expect(lectureRouge.detail).toContain('régression');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and fsli_code = 'CASH' and nature = 'confirmation_externe'`, [IDS.engNep]);
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
          (nature === 'confirmation_externe' && fsliCode === 'CASH') ? null : reel.atelierDeLaNature(nature, fsliCode, base),
      };
    });

    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'CASH', 'sonde régression — CASH sans atelier simulé', 'confirmation_externe')`,
      [IDS.engNep],
    );
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'CONFIRM', 'substantive', 'TRADE_PAYABLES', 'sonde gap hors CASH co-occurrent', 'confirmation_externe')`,
      [IDS.engNep],
    );

    try {
      const { GET: GETAvecCasMixte } = await import('./route');
      const rouge = await GETAvecCasMixte();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('atelier confirmation_externe'));
      expect(lectureRouge.ok).toBe(false);
      expect(rouge.status).toBe(500);
      expect(lectureRouge.detail).toContain('CASH');
      expect(lectureRouge.detail).toContain('régression');
      expect(lectureRouge.detail).toContain('TRADE_PAYABLES');
      expect(lectureRouge.detail).toContain('attendu');
    } finally {
      await q(`delete from procedure_instance where engagement_id = $1 and nature = 'confirmation_externe'`, [IDS.engNep]);
      vi.doUnmock('@/lib/services/programme');
      vi.resetModules();
    }
  });
});
