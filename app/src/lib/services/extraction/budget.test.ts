import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { recordAiRun } from '@/lib/core/airuns';
import { plafondUsd, depenseCumuleeUsd, gardeBudget, messageArretBudget } from './budget';

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
