import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { occurrencesDeLaPeriode, deriverPopulationControle, FREQUENCES_DERIVABLES, importInstances } from './sox';

// LOT CONTRÔLE INTERNE, §3.1 (mandat) — LA POPULATION DÉRIVÉE.
//
// `occurrencesDeLaPeriode` est une fonction PURE (aucune base) : ses cas connus mauvais (règle 17)
// se prouvent par le calcul lui-même, sans harnais. `deriverPopulationControle` est le service qui
// l'écrit en base, gardé par assertMembreDe et par les deux refus nommés dans son propre code
// (fréquence non dérivable, population déjà présente).

describe('occurrencesDeLaPeriode (pure)', () => {
  it('annuelle : une seule occurrence, à la clôture', () => {
    const occ = occurrencesDeLaPeriode('annual', '2025-01-01', '2025-12-31');
    expect(occ).toEqual([{ label: 'Exercice clos le 2025-12-31', occurredOn: '2025-12-31' }]);
  });

  it('trimestrielle : quatre occurrences sur un exercice complet', () => {
    const occ = occurrencesDeLaPeriode('quarterly', '2025-01-01', '2025-12-31');
    expect(occ.map((o) => o.occurredOn)).toEqual(['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31']);
  });

  it('mensuelle : douze occurrences sur un exercice complet, y compris un février de 28 jours', () => {
    const occ = occurrencesDeLaPeriode('monthly', '2025-01-01', '2025-12-31');
    expect(occ.length).toBe(12);
    expect(occ[1].occurredOn).toBe('2025-02-28'); // 2025 n'est pas bissextile — cas connu mauvais du calcul de fin de mois
    expect(occ[11].occurredOn).toBe('2025-12-31');
  });

  it('mensuelle, année BISSEXTILE : février se clôt le 29, pas le 28 (cas connu mauvais)', () => {
    const occ = occurrencesDeLaPeriode('monthly', '2024-01-01', '2024-12-31');
    expect(occ[1].occurredOn).toBe('2024-02-29');
  });

  it('hebdomadaire : 52 occurrences sur un exercice de 365 jours', () => {
    const occ = occurrencesDeLaPeriode('weekly', '2025-01-01', '2025-12-31');
    expect(occ.length).toBe(52);
  });

  it('quotidienne : une occurrence par jour civil, bornes incluses', () => {
    const occ = occurrencesDeLaPeriode('daily', '2025-01-01', '2025-12-31');
    expect(occ.length).toBe(365);
    expect(occ[0].occurredOn).toBe('2025-01-01');
    expect(occ[364].occurredOn).toBe('2025-12-31');
  });

  it('une période COURTE (contrôle démarré en cours d’exercice) ne déborde jamais après sa fin — cas connu mauvais', () => {
    const occ = occurrencesDeLaPeriode('monthly', '2025-06-01', '2025-08-15');
    // Juin, juillet complets ; août s'arrête à la fin de la période, pas au 31.
    expect(occ.map((o) => o.occurredOn)).toEqual(['2025-06-30', '2025-07-31']);
  });

  it('adhoc et many_daily sont ABSENTS de FREQUENCES_DERIVABLES — le mandat ne les nomme pas (§3.1)', () => {
    expect(FREQUENCES_DERIVABLES).not.toContain('adhoc');
    expect(FREQUENCES_DERIVABLES).not.toContain('many_daily');
    expect(FREQUENCES_DERIVABLES).toEqual(['annual', 'quarterly', 'monthly', 'weekly', 'daily']);
  });
});

async function poserControle(code: string, frequency: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde population dérivée', 'fictif', $3, 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code, frequency])).id;
}

describe('deriverPopulationControle (service)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('dérive la population d’un contrôle mensuel — 12 occurrences, source = derived', async () => {
    const controlId = await poserControle('SONDE-POP-MENSUEL', 'monthly');
    const n = await deriverPopulationControle(controlId, IDS.users.karim);
    expect(n).toBe(12);
    const rows = await q<{ label: string; occurred_on: string; source: string }>(
      `select label, occurred_on::text, source from control_instance where control_id = $1 order by occurred_on`,
      [controlId],
    );
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.source === 'derived')).toBe(true);
    expect(rows[0].occurred_on).toBe('2025-01-31');
  });

  it('cas connu mauvais (règle 17) : une fréquence NON dérivable (adhoc) refuse, en nommant CTRL-05', async () => {
    const controlId = await poserControle('SONDE-POP-ADHOC', 'adhoc');
    await expect(deriverPopulationControle(controlId, IDS.users.karim))
      .rejects.toThrow(/non dérivable.*adhoc/);
    const rows = await q(`select 1 from control_instance where control_id = $1`, [controlId]);
    expect(rows.length).toBe(0); // rien n'a été écrit malgré le refus
  });

  it('cas connu mauvais (règle 17) : many_daily refuse aussi — le mandat ne le nomme pas dérivable', async () => {
    const controlId = await poserControle('SONDE-POP-MANYDAILY', 'many_daily');
    await expect(deriverPopulationControle(controlId, IDS.users.karim))
      .rejects.toThrow(/non dérivable.*many_daily/);
  });

  it('cas connu mauvais (règle 17) : une population déjà présente (listing client) refuse une seconde dérivation', async () => {
    const controlId = await poserControle('SONDE-POP-DEJA', 'monthly');
    await importInstances(controlId, 'label;occurred_on;performer_name\nJanvier;2025-01-31;Alice\n', IDS.users.karim);
    await expect(deriverPopulationControle(controlId, IDS.users.karim))
      .rejects.toThrow(/déjà présente/);
    const rows = await q(`select 1 from control_instance where control_id = $1`, [controlId]);
    expect(rows.length).toBe(1); // toujours la seule ligne importée, rien ajouté par le refus
  });

  it('étanchéité (ETANCH) : un intrus d’un autre cabinet ne peut pas dériver la population d’un contrôle qui n’est pas le sien', async () => {
    const controlId = await poserControle('SONDE-POP-ETANCH', 'monthly');
    const cabinet = await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet Étranger (sonde population dérivée)') returning id::text`);
    const intrus = (await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1, 'Sonde Intrus', 'intrus-pop@sonde.test', 'partner') returning id::text`,
      [cabinet.id],
    )).id;
    await expect(deriverPopulationControle(controlId, intrus)).rejects.toThrow(/ETANCH/);
    const rows = await q(`select 1 from control_instance where control_id = $1`, [controlId]);
    expect(rows.length).toBe(0);
  });
});
