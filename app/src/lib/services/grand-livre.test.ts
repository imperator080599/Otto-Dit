import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { testExhaustifGrandLivre } from './grand-livre';
import { LIBELLES } from '@/lib/i18n/catalogue';

// H-3, slice 1 (Lot 7, docs/REGISTRE_IDEES.md §H) : le test exhaustif du grand livre ne CALCULE
// rien de nouveau — il LIT `gl_entry.flags`, déjà écrit à l'import par `computeFlags` (ADR-003,
// kernel/flags.ts). Cette suite prouve que l'AGRÉGATION (le total, le compte par règle, les
// exemples) est correcte contre la population RÉELLEMENT importée par le monde de démonstration,
// jamais une fixture synthétique isolée — le mécanisme sous-jacent (computeFlags) est déjà testé
// ailleurs (kernel/flags.test.ts, s'il existe) ; cette suite-ci teste la LECTURE/AGRÉGATION.

describe('testExhaustifGrandLivre (H-3 slice 1) : le test exhaustif rend visible ce qu’ADR-003 calcule déjà sur TOUTE la population', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('le total couvre TOUTES les écritures actives du dossier, jamais un sous-ensemble', async () => {
    const { total } = await testExhaustifGrandLivre(IDS.engNep);
    const direct = await q1<{ n: string }>(
      `select count(*) n from gl_entry where engagement_id = $1 and status = 'active'`,
      [IDS.engNep],
    );
    expect(total).toBe(Number(direct.n));
    expect(total, 'le monde de démonstration importe un FEC réel — pas de population vide').toBeGreaterThan(0);
  });

  it('chaque règle porte un compte cohérent avec une re-dérivation SQL directe, et jamais plus que le total', async () => {
    const { total, regles } = await testExhaustifGrandLivre(IDS.engNep);
    expect(regles.map((r) => r.regle).sort()).toEqual(
      ['credit_note_pattern', 'late_validation', 'manual_journal', 'period_end', 'round_amount', 'weekend', 'hors_periode'].sort(),
    );
    for (const r of regles) {
      expect(r.nombre, `${r.regle} ne peut pas dépasser le total`).toBeLessThanOrEqual(total);
      const direct = await q1<{ n: string }>(
        `select count(*) n from gl_entry where engagement_id = $1 and status = 'active' and flags @> $2::jsonb`,
        [IDS.engNep, JSON.stringify([r.regle])],
      );
      expect(r.nombre, `${r.regle} doit coïncider avec une jointure directe sur gl_entry.flags`).toBe(Number(direct.n));
      expect(r.exemples.length, `${r.regle} ne montre jamais plus de 10 exemples`).toBeLessThanOrEqual(10);
      if (r.nombre > 0) expect(r.exemples.length, `${r.regle} a des occurrences mais aucun exemple`).toBeGreaterThan(0);
    }
  });

  it('chaque règle a sa disclosure complète au catalogue (règle 19), dans les deux langues — jamais un libellé en dur dans le service', async () => {
    const { regles } = await testExhaustifGrandLivre(IDS.engNep);
    for (const r of regles) {
      for (const champ of ['libelle', 'couvre', 'neCouvrePas'] as const) {
        const cle = `gl.regle.${r.regle}.${champ}` as keyof typeof LIBELLES;
        const entree = LIBELLES[cle];
        expect(entree, `gl.regle.${r.regle}.${champ} doit exister au catalogue`).toBeDefined();
        expect(entree.fr.length, `gl.regle.${r.regle}.${champ} (fr) ne doit pas être vide`).toBeGreaterThan(0);
        expect(entree.en.length, `gl.regle.${r.regle}.${champ} (en) ne doit pas être vide`).toBeGreaterThan(0);
      }
    }
  });

  it('cas connu bon : la règle week-end, vérifiée exemple par exemple, tombe bien un samedi ou un dimanche', async () => {
    const { regles } = await testExhaustifGrandLivre(IDS.engNep);
    const weekend = regles.find((r) => r.regle === 'weekend')!;
    if (weekend.nombre === 0) return; // rien à vérifier sur cette exécution du monde de démo
    for (const e of weekend.exemples) {
      const dow = new Date(`${e.entryDate}T00:00:00Z`).getUTCDay();
      expect([0, 6], `l'exemple ${e.entryNo} du ${e.entryDate} doit tomber un week-end`).toContain(dow);
    }
  });

  it('cas connu bon : la règle hors_periode, vérifiée exemple par exemple, tombe bien hors des bornes de l’exercice', async () => {
    const { regles } = await testExhaustifGrandLivre(IDS.engNep);
    const horsPeriode = regles.find((r) => r.regle === 'hors_periode')!;
    if (horsPeriode.nombre === 0) return; // rien à vérifier sur cette exécution du monde de démo
    const periode = await q1<{ start_date: string; end_date: string }>(
      `select p.start_date::text, p.end_date::text from engagement e join period p on p.id = e.period_id where e.id = $1`,
      [IDS.engNep],
    );
    for (const e of horsPeriode.exemples) {
      const dedans = e.entryDate >= periode.start_date && e.entryDate <= periode.end_date;
      expect(dedans, `l'exemple ${e.entryNo} du ${e.entryDate} doit tomber HORS [${periode.start_date}, ${periode.end_date}]`).toBe(false);
    }
  });

  it('cas connu mauvais (règle 17) : une écriture synthétique hors flags ne gonfle jamais un compte', async () => {
    const before = await testExhaustifGrandLivre(IDS.engNep);
    const anyFile = await q1<{ import_file_id: string }>(
      `select import_file_id::text from gl_entry where engagement_id = $1 limit 1`,
      [IDS.engNep],
    );
    const bogus = await q1<{ id: string }>(
      `insert into gl_entry (engagement_id, import_file_id, line_no, natural_key, journal_code,
        entry_no, entry_date, account_no, label, debit, credit, status, flags)
       values ($1, $2, 999999, 'sonde-h3-gl', 'VE', 'SONDE-H3', '2026-06-15', '706000',
        'sonde H-3 : écriture non flaggée', 100, 0, 'active', '[]'::jsonb)
       returning id::text`,
      [IDS.engNep, anyFile.import_file_id],
    );
    try {
      const after = await testExhaustifGrandLivre(IDS.engNep);
      expect(after.total).toBe(before.total + 1);
      for (const r of after.regles) {
        const avant = before.regles.find((b) => b.regle === r.regle)!;
        expect(r.nombre, `une écriture sans flags ne doit gonfler AUCUNE règle (${r.regle})`).toBe(avant.nombre);
      }
    } finally {
      await q(`delete from gl_entry where id = $1`, [bogus.id]);
    }
  });
});
