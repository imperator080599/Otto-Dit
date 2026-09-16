import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// H-3, slice 2 (Lot 7, docs/REGISTRE_IDEES.md §H) — LA LECTURE /api/sante « le test exhaustif du
// grand livre (règle hors exercice) ». Ajoutée LE MÊME JOUR que la tranche (règle 22).
//
// La lecture RE-DÉRIVE indépendamment (comparaison directe à `period.start_date`/`end_date`,
// jamais un appel à `testExhaustifGrandLivre` ni à `computeFlags` — règle 16) et reste
// INFORMATIVE tant que le flag stocké coïncide avec les vraies bornes de l'exercice. Le SEUL cas
// qui la fait échouer : un `gl_entry.flags` qui a dérivé de la règle — un état que le chemin
// gardé (`computeFlags` à l'import) ne peut jamais produire, donc atteint ici seulement par
// mutation directe hors du chemin gardé (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-3 slice 2'))!;
}

describe('H-3 slice 2 : la lecture /api/sante sur le test exhaustif du grand livre (règle hors exercice)', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, avec son grand livre réellement importé, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.vide).toBeFalsy();
    expect(lecture.detail).toContain('écriture');
    expect(res.status).toBe(200);
  });

  it("cas connu mauvais (règle 17) : un gl_entry.flags édité hors du chemin gardé fait échouer la lecture", async () => {
    const cible = await q1<{ id: string }>(
      `select g.id::text
       from gl_entry g join engagement e on e.id = g.engagement_id join period p on p.id = e.period_id
       where g.engagement_id = $1 and g.status = 'active'
         and g.entry_date >= p.start_date and g.entry_date <= p.end_date
       limit 1`,
      [IDS.engNep],
    );
    /* Mutation SQL DIRECTE, hors du chemin gardé : aucun geste produit ne marque « hors exercice »
       une écriture dont la date est DANS l'exercice — exactement le scénario que la lecture doit
       attraper. */
    await q(`update gl_entry set flags = flags || '["hors_periode"]'::jsonb where id = $1`, [cible.id]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter le flag hors exercice dérivé des vraies bornes').toBe(false);
      expect(res.status).toBe(500);
    } finally {
      await q(`update gl_entry set flags = flags - 'hors_periode' where id = $1`, [cible.id]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });
});
