import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { fileDeadlines, closeFile } from './retention';

// The two dates must come out of the engagement's own facts — pack regime, period, firm
// size — and must land in the row together with the provision that produced them.

describe('file deadlines per engagement (ADR-014 rev. 2)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 240000);

  it('the French engagement gets 60 days / 6 years, cited', async () => {
    const d = await fileDeadlines(IDS.engNep, '2026-04-30');
    expect(d.completion.days).toBe(60);
    expect(d.retention.years).toBe(6);
    expect(d.completionDue).toBe('2026-06-29');
    expect(d.retentionUntil).toBe('2032-04-30');
    expect(d.retention.source.citation).toBe('C. com., art. R. 820-42');
    expect(d.anyUnverified).toBe(false);
  });

  it('the SOX engagement resolves the phase-in from the firm size on file', async () => {
    const d = await fileDeadlines(IDS.engSox, '2026-02-20');
    // the demo firm issued no issuer reports in 2024 → later phase-in → 45 days
    expect(d.completion.days).toBe(45);
    expect(d.completion.determinedBy).toMatch(/0 rapport/);
    expect(d.retention.years).toBe(7);
    expect(d.anyUnverified).toBe(true); // AS 1215 unreachable from this build

    // a large firm on the same engagement facts is already inside the 14-day window
    await q(`update tenant set issuer_reports_2024 = 400 where id = $1`, [IDS.tenant]);
    const big = await fileDeadlines(IDS.engSox, '2026-02-20');
    expect(big.completion.days).toBe(14);
    await q(`update tenant set issuer_reports_2024 = 0 where id = $1`, [IDS.tenant]);
  });

  it('closing the file stores both dates and the provision behind each', async () => {
    const d = await closeFile(IDS.engSox, IDS.users.claire, '2026-02-20');
    const row = await q1<{
      report_date: string; doc_completion_due: string; retention_until: string;
      status: string; legal_basis: { retention: { citation: string; verification: string }; any_unverified: boolean };
    }>(
      `select report_date::text, doc_completion_due::text, retention_until::text, status, legal_basis
       from engagement where id = $1`,
      [IDS.engSox],
    );
    expect(row.status).toBe('locked');
    expect(row.doc_completion_due).toBe(d.completionDue);
    expect(row.retention_until).toBe('2033-02-20');
    expect(row.legal_basis.retention.citation).toMatch(/AS 1215\.14/);
    expect(row.legal_basis.retention.verification).toBe('unverified');
    expect(row.legal_basis.any_unverified).toBe(true);

    const ev = await q<{ payload: { retention_basis: string; any_unverified: boolean } }>(
      `select payload from event_log where engagement_id = $1 and verb = 'file_closed'`,
      [IDS.engSox],
    );
    expect(ev[0].payload.retention_basis).toMatch(/AS 1215\.14/);
    expect(ev[0].payload.any_unverified).toBe(true);

    // the lock guard is now live on that engagement
    await expect(
      q(`insert into review_note (engagement_id, author_id, text, status) values ($1,$2,'x','open')`, [IDS.engSox, IDS.users.lea]),
    ).rejects.toThrow(/locked/);
    await q(`update engagement set status = 'fieldwork', locked_at = null where id = $1`, [IDS.engSox]);
  });
});
