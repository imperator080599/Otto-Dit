import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LA BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) — LA LECTURE /api/sante.
//
// Le garde vit dans `uploadTbAction` (imports/actions.ts) : `detecterBasculesMaterialite` n'y est
// appelé que sur `periodKind === 'current'`. Cette lecture ne peut rougir que si ce garde a été
// contourné — un `fsli_materiality_bascule` posé directement (SQL) sur un import dont le
// `tb_snapshot` porte `period_kind = 'prior'`.

describe('bascule de matérialité : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans bascule sur un comparatif : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('bascule de matérialité'));
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une bascule posée sur un import de comparatif N-1 (SQL direct, hors uploadTbAction) fait rougir /api/sante entier', async () => {
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-comparatif-N1.csv', 'sonde-sha-prior', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    await q(
      `insert into tb_snapshot (engagement_id, period_kind, version, import_file_id, status)
       values ($1, 'prior', 999, $2, 'superseded')`,
      [IDS.engNep, fichier.id],
    );
    const bascule = (await q1<{ id: string }>(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, 'SONDE-COMPARATIF', $2, 'ns_confirmed', 100000, 27000) returning id::text`,
      [IDS.engNep, fichier.id],
    ));
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('bascule de matérialité'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-COMPARATIF');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from fsli_materiality_bascule where id = $1`, [bascule.id]);
      await q(`delete from tb_snapshot where import_file_id = $1`, [fichier.id]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });
});
