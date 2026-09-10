import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { q } from '@/lib/db/client';
import { _reinitialiserGardeBudgetEnBasePourSonde } from '@/lib/services/extraction/budget';
import { GET } from './route';

// MANDAT DU 9 SEPTEMBRE, §4/LOT 8 — LA LECTURE « IA-BUDGET-01 » DE /api/sante.
//
// « La garde de budget EN BASE d'abord... chemin fermé par défaut. » Cette lecture prouve que
// /api/sante peut ROUGIR sur une garde mal formée (règle 22) — pas seulement afficher son état.

describe('IA-BUDGET-01 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });
  afterEach(async () => {
    await _reinitialiserGardeBudgetEnBasePourSonde();
  });

  it('sans réglage en base : la lecture passe, fermée (défaut du mandat §4)', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('fermée');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : activée SANS plafond positif fait rougir /api/sante entier', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: null, activePar: IDS.users.claire, activeLe: new Date().toISOString() })],
    );
    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('sans plafond positif');
    expect(rouge.status).toBe(500);
  });

  it('cas connu mauvais (règle 17) : activée SANS provenance (qui/quand) fait rougir, en le nommant', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: null, activeLe: null })],
    );
    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('sans provenance complète');
    expect(rouge.status).toBe(500);
  });

  /* Revue hostile (voix 1) : une mutation OR→AND sur la condition de provenance passait TOUS les
     tests d'alors, aucun ne posant UN SEUL des deux champs (qui, quand). Les deux moitiés ici. */
  it('cas connu mauvais (règle 17) : activée avec QUI mais sans QUAND fait rougir', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: IDS.users.claire, activeLe: null })],
    );
    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('sans provenance complète');
    expect(rouge.status).toBe(500);
  });

  it('cas connu mauvais (règle 17) : activée avec QUAND mais sans QUI fait rougir', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: null, activeLe: new Date().toISOString() })],
    );
    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('sans provenance complète');
    expect(rouge.status).toBe(500);
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : un état COMPLET et valide ne fait pas rougir', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: IDS.users.claire, activeLe: new Date().toISOString() })],
    );
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('IA-BUDGET-01'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('ACTIVE');
    expect(res.status).toBe(200);
  });
});
