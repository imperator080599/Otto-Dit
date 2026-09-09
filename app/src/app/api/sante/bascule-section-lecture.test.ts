import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LA SECTION DE LA BASCULE, ATTEIGNABLE (mandat 2026-09-09, §2.2) — LA LECTURE /api/sante.
//
// `detecterBasculesMaterialite` (fsli.ts) pose désormais AUSSI un `section_state` pour tout poste
// qu'elle flague — sinon le drapeau posé par §2.1 resterait un constat que rien n'atteint depuis
// le tableau de bord (règle 13). Cette lecture ne peut rougir que si ce geste a été RETIRÉ de la
// fonction (régression), ou contourné par une insertion SQL directe dans `fsli_materiality_bascule`
// qui ne passe pas par `detecterBasculesMaterialite`.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('la section du poste est ouverte'))!;
}

describe('bascule de matérialité : la lecture /api/sante (§2.2, section ouverte)', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('les bascules du monde de démonstration ont toutes leur section ouverte : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('bascule');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une bascule posée SANS section (SQL direct, hors detecterBasculesMaterialite) fait rougir /api/sante entier', async () => {
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-sans-section.csv', 'sonde-sha-sans-section', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    const bascule = (await q1<{ id: string }>(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, 'SONDE-SANS-SECTION', $2, 'ns_confirmed', 100000, 27000) returning id::text`,
      [IDS.engNep, fichier.id],
    ));
    /* Garde-fou du test lui-même : aucune section_state ne doit préexister pour ce code inventé —
       sinon le cas connu mauvais ne prouverait rien (règle 17). */
    const preexistante = await q1<{ n: string }>(
      `select count(*)::text n from section_state where engagement_id = $1 and kind = 'poste' and ref = 'SONDE-SANS-SECTION'`,
      [IDS.engNep],
    );
    expect(Number(preexistante!.n)).toBe(0);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-SANS-SECTION');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from fsli_materiality_bascule where id = $1`, [bascule.id]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });
});
