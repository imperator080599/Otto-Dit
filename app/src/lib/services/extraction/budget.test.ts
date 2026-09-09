import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { q } from '@/lib/db/client';
import { recordAiRun } from '@/lib/core/airuns';
import {
  plafondUsd, depenseCumuleeUsd, gardeBudget, messageArretBudget,
  gardeBudgetEnBase, assertBudgetActifEnBase, _reinitialiserGardeBudgetEnBasePourSonde,
} from './budget';

// LA GARDE DE BUDGET (ADR-105) — la règle qui empêche le mode « IA réelle »
// de dépenser un dollar de plus que le plafond. On TENTE le dépassement : une
// garde jamais éprouvée au refus est une affirmation (règle 12).

describe('garde de budget du mode IA réelle (ADR-105)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  afterEach(() => {
    delete process.env.OTTO_BUDGET_USD;
  });

  it('le plafond vient de OTTO_BUDGET_USD, avec un défaut sain', () => {
    expect(plafondUsd()).toBe(5);
    process.env.OTTO_BUDGET_USD = '2.5';
    expect(plafondUsd()).toBe(2.5);
    process.env.OTTO_BUDGET_USD = 'n\'importe quoi';
    expect(plafondUsd()).toBe(5);
    process.env.OTTO_BUDGET_USD = '-3';
    expect(plafondUsd()).toBe(5);
  });

  it('sous le plafond, la garde laisse passer', async () => {
    await expect(gardeBudget()).resolves.toBeUndefined();
  });

  it('AU plafond, la garde REFUSE en nommant les deux chiffres — et le cumul vient d\'ai_run', async () => {
    await recordAiRun({
      tenantId: IDS.tenant, engagementId: null, purpose: 'ocr', adapter: 'anthropic',
      model: 'claude-opus-5', promptId: 'ocr-extract', promptVersion: 'v1',
      input: 'test', output: '[]', costUsd: 0.02,
    });
    expect(await depenseCumuleeUsd()).toBeGreaterThanOrEqual(0.02);
    process.env.OTTO_BUDGET_USD = '0.01';
    await expect(gardeBudget()).rejects.toThrow(/garde de budget/);
    await expect(gardeBudget()).rejects.toThrow(/0\.01/);
  });

  it('le message d\'arrêt dit la dépense, le plafond, et que les lectures faites restent', () => {
    const m = messageArretBudget(4.9876, 5);
    expect(m).toContain('4.9876');
    expect(m).toContain('5.00');
    expect(m).toContain('OTTO_BUDGET_USD');
    expect(m).toMatch(/restent au dossier/);
    /* Un petit plafond garde ses décimales — 0,001 $ affiché « 0.00 $ »
       mentirait (trouvé en conduisant l'arrêt réel au plafond). */
    expect(messageArretBudget(0.0452, 0.001)).toContain('0.0010');
  });
});

// MANDAT DU 9 SEPTEMBRE, §4/LOT 8 — LA GARDE DE BUDGET EN BASE (app_state), DISTINCTE DE LA
// GARDE CI-DESSUS (OTTO_BUDGET_USD, le cumul d'une session déjà en mode IA vivante). Celle-ci
// répond à une question antérieure : ce déploiement a-t-il seulement le droit de tenter une
// lecture payante ? Fermée par défaut, deux fois — testé pour de vrai (règle 17), pas affirmé.
describe('garde de budget EN BASE (mandat §4/Lot 8) — fermée par défaut', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  afterEach(async () => {
    await _reinitialiserGardeBudgetEnBasePourSonde();
  });

  it('absente : gardeBudgetEnBase rend actif:false, et assertBudgetActifEnBase refuse IA-BUDGET-01', async () => {
    const g = await gardeBudgetEnBase();
    expect(g).toEqual({ actif: false, plafondUsd: null, activePar: null, activeLe: null });
    await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);
  });

  it('CAS CONNU MAUVAIS (règle 17) : activée SANS plafond positif refuse — jamais lue « à moitié activée »', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: null, activePar: IDS.users.claire, activeLe: new Date().toISOString() })],
    );
    await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);

    await q(`update app_state set value = $1 where key = 'ia_vivante_budget'`,
      [JSON.stringify({ actif: true, plafondUsd: 0, activePar: IDS.users.claire, activeLe: new Date().toISOString() })]);
    await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);
  });

  it('CAS CONNU MAUVAIS (règle 17) : activée SANS provenance (qui/quand) refuse — une activation anonyme n’est pas tracée (règle 3)', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: null, activeLe: null })],
    );
    await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);
  });

  it('CAS CONNU MAUVAIS (règle 17) : un état mal typé (plafondUsd en chaîne) est lu comme ABSENT, jamais deviné', async () => {
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: '5', activePar: IDS.users.claire, activeLe: new Date().toISOString() })],
    );
    const g = await gardeBudgetEnBase();
    expect(g.plafondUsd).toBeNull();
    await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);
  });

  it('défaut retiré : un état COMPLET (actif, plafond positif, provenance qui/quand) passe — jamais posé par un chemin applicatif, seulement par cette sonde', async () => {
    const quand = new Date().toISOString();
    await q(
      `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
      [JSON.stringify({ actif: true, plafondUsd: 5, activePar: IDS.users.claire, activeLe: quand })],
    );
    const g = await assertBudgetActifEnBase();
    expect(g).toEqual({ actif: true, plafondUsd: 5, activePar: IDS.users.claire, activeLe: quand });
  });
});
