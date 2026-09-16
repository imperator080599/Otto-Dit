import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { journalEntryPopulation } from './population';
import { validateSampleParams } from './sampling';
import { proposeJournalEntrySample, drawJournalEntrySample, currentJournalEntrySample } from './sampling-je';

// Lot 6, tranche 3 (NEP 240) — MANUEL/FRAUDE, le patron générique parallèle à sampling.ts
// (REV-SUBST). Monte le monde complet Lot 5 (`runPart1UpToWorkpaper`, même fixture que
// ana04-lecture.test.ts) : REVENUE y est scopé, sa matérialité validée, et son grand livre
// porte déjà des écritures week-end/OD/rondes (S3/S4, s3s4.test.ts) — la même base que
// `journalEntryPopulation` doit filtrer.
describe('NEP 240 — population et tirage des écritures à risque (MANUEL, FRAUDE)', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 180000);

  it('journalEntryPopulation(REVENUE, ecritures_manuelles) ne retient que les lignes marquées manual_journal — CAS CONNU MAUVAIS : retirer le drapeau exclut la ligne, le remettre la rend', async () => {
    const pop = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_manuelles');
    expect(pop.rows.length).toBeGreaterThan(0);
    for (const r of pop.rows) expect(r.flags).toContain('manual_journal');

    const cible = pop.rows[0];
    const avant = await q01<{ flags: string[] }>(`select flags from gl_entry where id = $1`, [cible.id]);
    await q(`update gl_entry set flags = '[]'::jsonb where id = $1`, [cible.id]);
    try {
      const popApres = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_manuelles');
      expect(popApres.rows.some((r) => r.id === cible.id)).toBe(false);
    } finally {
      await q(`update gl_entry set flags = $2::jsonb where id = $1`, [cible.id, JSON.stringify(avant!.flags)]);
    }
    const popRevert = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_manuelles');
    expect(popRevert.rows.some((r) => r.id === cible.id)).toBe(true);
  });

  it('journalEntryPopulation(REVENUE, ecritures_marqueurs_fraude) ne retient que week-end/montant rond/validation tardive', async () => {
    const pop = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_marqueurs_fraude');
    expect(pop.rows.length).toBeGreaterThan(0);
    const marqueurs = new Set(['weekend', 'round_amount', 'late_validation']);
    for (const r of pop.rows) expect(r.flags.some((f) => marqueurs.has(f))).toBe(true);
    // une écriture manuelle SEULE (sans marqueur de fraude) n'y figure pas : les deux
    // prédicats sont DISJOINTS dans leur intersection typique, jamais confondus.
    const manuelSeul = (await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_manuelles')).rows
      .find((r) => !r.flags.some((f) => marqueurs.has(f)));
    if (manuelSeul) expect(pop.rows.some((r) => r.id === manuelSeul.id)).toBe(false);
  });

  it('propose → valide → tire un échantillon MANUEL, exhaustif sur sa population (NEP 240 : examiner, pas sous-sonder) — DRAW refusé avant VALIDATE', async () => {
    const sampleId = await proposeJournalEntrySample(IDS.engNep, 'REVENUE', 'MANUEL', IDS.users.karim);
    await expect(drawJournalEntrySample(sampleId, IDS.users.karim, 'REVENUE', 'MANUEL'))
      .rejects.toThrow(/validate the sampling parameters first/);

    await validateSampleParams(sampleId, IDS.users.karim);
    const pop = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_manuelles');
    const { items } = await drawJournalEntrySample(sampleId, IDS.users.karim, 'REVENUE', 'MANUEL');
    expect(items).toBe(pop.rows.length);

    const courant = await currentJournalEntrySample(IDS.engNep, 'MANUEL');
    expect(courant).not.toBeNull();
    expect(courant!.items.length).toBe(pop.rows.length);
    for (const it of courant!.items) expect(it.flags).toContain('manual_journal');
  });

  it('propose → valide → tire un échantillon FRAUDE, exhaustif sur sa population', async () => {
    const sampleId = await proposeJournalEntrySample(IDS.engNep, 'REVENUE', 'FRAUDE', IDS.users.karim);
    await validateSampleParams(sampleId, IDS.users.karim);
    const pop = await journalEntryPopulation(IDS.engNep, 'REVENUE', 'ecritures_marqueurs_fraude');
    const { items } = await drawJournalEntrySample(sampleId, IDS.users.karim, 'REVENUE', 'FRAUDE');
    expect(items).toBe(pop.rows.length);

    const courant = await currentJournalEntrySample(IDS.engNep, 'FRAUDE');
    expect(courant!.items.length).toBe(pop.rows.length);
  });

  it('MANUEL et FRAUDE sont deux procedure_instance DISTINCTES sur REVENUE, chacune planifiée par son propre appel — jamais une seule ligne partagée', async () => {
    const rows = await q<{ template_code: string }>(
      `select template_code from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' and template_code in ('MANUEL','FRAUDE')`,
      [IDS.engNep],
    );
    expect(rows.map((r) => r.template_code).sort()).toEqual(['FRAUDE', 'MANUEL']);
  });
});
