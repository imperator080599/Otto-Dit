import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { addReviewNote } from '@/lib/services/workpapers/lifecycle';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// P1-02 (AUD-02) — LA LECTURE /api/sante « sections et notes ».
//
// La contrainte SQL `review_note_audit_ancree` empêche déjà l'ÉCRITURE d'une note d'audit sans
// ancre. Cette lecture attrape ce que la contrainte ne peut pas voir : une note dont l'ancre est
// posée mais dont `section_id` est resté nul — construit ici par une écriture SQL DIRECTE (hors
// du chemin réel `addReviewNote`/`poserNote`), jamais par un chemin applicatif existant.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('sections et notes'))!;
}

describe('sections et notes (section_id) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  let wpId: string;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('toute note d’audit posée par addReviewNote porte un section_id : la lecture passe', async () => {
    await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Sonde section_id.');
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('sans section_id');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une note d’audit ancrée mais sans section_id (SQL direct) fait rougir /api/sante entier', async () => {
    const orpheline = await q1<{ id: string }>(
      `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, status, text, note_type,
                                anchor_kind, anchor_ref, anchor_label)
       values ($1, $2, $3, $4, 'open', 'Note posée sans section_id (sonde).', 'question',
               'papier', $5, 'papier')
       returning id::text`,
      [IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, wpId],
    );
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('sans section_id');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from review_note where id = $1`, [orpheline.id]);
    }
  });
});
