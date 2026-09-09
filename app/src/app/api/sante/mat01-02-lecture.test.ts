import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// MAT-01/MAT-02 (mandat 2026-09-09, §2.4) — LA LECTURE /api/sante.
//
// La lecture rejoue `obstaclesMaterialite` (obstacles.ts) sur l'état RÉEL du dossier — le même
// chemin que `/obstacles`. Cette suite prouve les deux sens : le monde de démonstration, où toutes
// les bascules sont résolues par le chemin gardé, ne rougit pas ; et une bascule posée en SQL
// direct, hors du chemin gardé, SANS section, fait rougir /api/sante entier (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('MAT-01/MAT-02'))!;
}

describe('MAT-01/MAT-02 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('les bascules du monde de démonstration sont toutes résolues (chemin gardé) : la lecture passe sans obstacle', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toBe('VIDE — aucun obstacle de bascule de matérialité');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une bascule posée SANS section (SQL direct, hors du chemin gardé) apparaît dans la lecture', async () => {
    const code = 'SONDE-LECTURE-MAT01';
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-lecture-mat01.csv', 'sonde-sha-lecture-mat01', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    await q(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, $2, $3, 'ns_confirmed', 100000, 27000)`,
      [IDS.engNep, code, fichier.id],
    );
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      /* CETTE lecture (MAT-01/MAT-02) DÉCRIT, elle ne lève jamais elle-même — mais la MÊME
         bascule sans section fait AUSSI rougir la lecture §2.2 (« la section du poste est
         ouverte »), déjà gardée : la réponse entière est donc 500, sans que CETTE lecture-ci n'y
         soit pour quelque chose. Les deux se lisent, jamais une seule prise pour l'autre
         (règle 16). */
      expect(lecture.ok).toBe(true);
      expect(lecture.detail).toContain('MAT-01');
      expect(res.status).toBe(500);
      const lectureSection = (body.lectures as { nom: string; ok: boolean }[])
        .find((l) => l.nom.includes('la section du poste est ouverte'));
      expect(lectureSection?.ok, 'la lecture §2.2 doit être celle qui rougit ici, pas celle-ci').toBe(false);
    } finally {
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, code]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });
});
