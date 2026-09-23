import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// INDEX PARTIELS UNIQUES (P1-08, AUD-15 partie modèle, migration 0180) — LA LECTURE /api/sante.
//
// Les trois index (`tb_snapshot_active_unique`, `sample_drawn_unique`,
// `workpaper_code_actif_unique`) refusent déjà l'écriture qui violerait l'unicité — cette lecture
// ne peut rougir que par un cas connu mauvais construit hors du chemin gardé (règle 17), l'index
// lui-même retiré comme risk01-lecture.test.ts le fait pour sa contrainte. Fixtures construites
// par insertion directe (patron notifications.test.ts) — `bootstrapNep()` seul ne pose ni
// `sample`, ni `workpaper` non-`outdated`, ni `procedure_instance`.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('index partiels uniques (P1-08, AUD-15)'))!;
}

describe('index partiels uniques (P1-08, AUD-15) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 60000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration ne porte aucun doublon : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('0 doublon');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : deux tb_snapshot « active » pour le même (dossier, période), index retiré, fait rougir /api/sante', async () => {
    const original = await q1<{ id: string; period_kind: string; import_file_id: string | null; version: string }>(
      `select id, period_kind, import_file_id, version from tb_snapshot where engagement_id = $1 and status = 'active' limit 1`,
      [IDS.engNep],
    );
    await q(`drop index tb_snapshot_active_unique`);
    try {
      await q(
        `insert into tb_snapshot (engagement_id, period_kind, version, import_file_id, status)
         values ($1, $2, $3, $4, 'active')`,
        [IDS.engNep, original.period_kind, Number(original.version) + 1, original.import_file_id],
      );
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('tb_snapshot_active_unique');
      expect(rouge.status).toBe(500);
    } finally {
      await q(
        `delete from tb_snapshot where engagement_id = $1 and period_kind = $2 and status = 'active' and id <> $3`,
        [IDS.engNep, original.period_kind, original.id],
      );
      await q(`create unique index tb_snapshot_active_unique on tb_snapshot(engagement_id, period_kind) where status = 'active'`);
    }
  });

  it('cas connu mauvais (règle 17) : deux sample « drawn » pour la même procédure, index retiré, fait rougir /api/sante', async () => {
    const pi = (await q1<{ id: string }>(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, status)
       values ($1, 'ISA-2024', 'REV-SUBST', 'substantive', 'REVENUE', 'sonde P1-08 (sample)', 'in_progress')
       returning id::text`,
      [IDS.engNep],
    )).id;
    await q(
      `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, status)
       values ($1, $2, 'monetary_coverage_random', '{}', 'x-p108-sample-1', 'y-p108-sample-1', 1, 'drawn')`,
      [IDS.engNep, pi],
    );
    await q(`drop index sample_drawn_unique`);
    try {
      await q(
        `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, status)
         values ($1, $2, 'monetary_coverage_random', '{}', 'x-p108-sample-2', 'y-p108-sample-2', 1, 'drawn')`,
        [IDS.engNep, pi],
      );
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('sample_drawn_unique');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from sample where procedure_id = $1`, [pi]);
      await q(`create unique index sample_drawn_unique on sample(procedure_id) where status = 'drawn'`);
      await q(`delete from procedure_instance where id = $1`, [pi]);
    }
  });

  it('cas connu mauvais (règle 17) : deux workpaper non périmés pour le même (dossier, code), index retiré, fait rougir /api/sante', async () => {
    await q(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'ISA-2024', 'SONDE-P108', 'sonde P1-08 (workpaper) 1', 'draft', '[]')`,
      [IDS.engNep],
    );
    await q(`drop index workpaper_code_actif_unique`);
    try {
      await q(
        `insert into workpaper (engagement_id, pack_id, code, title, status, sections, version)
         values ($1, 'ISA-2024', 'SONDE-P108', 'sonde P1-08 (workpaper) 2', 'in_review', '[]', 2)`,
        [IDS.engNep],
      );
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('workpaper_code_actif_unique');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from workpaper where engagement_id = $1 and code = 'SONDE-P108'`, [IDS.engNep]);
      await q(`create unique index workpaper_code_actif_unique on workpaper(engagement_id, code) where status <> 'outdated'`);
    }
  });
});
