import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { logEvent, verifyChain } from '@/lib/core/events';
import { IDS } from '@/lib/seed';

describe('schema + infrastructure (S0)', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  it('applies all migrations and seeds the demo world', async () => {
    const engs = await q<{ name: string }>(`select name from engagement order by name`);
    expect(engs.map((e) => e.name)).toEqual([
      'Altiverre FY2025 — Audit légal (NEP)',
      'Altiverre FY2025 — SOX 404 component (PCAOB/COSO)',
    ]);
    const members = await q(`select * from engagement_member`);
    expect(members.length).toBe(6);
  });

  it('event log is hash-chained and verifiable', async () => {
    await logEvent({
      tenantId: IDS.tenant,
      engagementId: IDS.engNep,
      actorKind: 'user',
      actorId: IDS.users.karim,
      verb: 'test_event',
      objectType: 'test',
      payload: { a: 1 },
    });
    const res = await verifyChain(IDS.tenant, IDS.engNep);
    expect(res.ok).toBe(true);
    expect(res.count).toBeGreaterThanOrEqual(2);
  });

  it('event log rejects UPDATE and DELETE (append-only trigger)', async () => {
    await expect(q(`update event_log set verb = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(q(`delete from event_log`)).rejects.toThrow(/append-only/);
  });

  it('documentation lock rejects writes on locked engagements except amendments', async () => {
    await q(`update engagement set status = 'locked', locked_at = now() where id = $1`, [IDS.engSox]);
    await expect(
      q(`insert into risk (engagement_id, assertion, level, description) values ($1, 'existence', 'high', 'x')`, [IDS.engSox]),
    ).rejects.toThrow(/locked/);
    // amendment path: session flag set by the service layer (docs/04 §9.4)
    await q(`select set_config('otto.post_lock_amendment', 'on', false)`);
    await q(`insert into risk (engagement_id, assertion, level, description) values ($1, 'existence', 'high', 'post-lock amendment')`, [IDS.engSox]);
    await q(`select set_config('otto.post_lock_amendment', '', false)`);
    await q(`update engagement set status = 'fieldwork', locked_at = null where id = $1`, [IDS.engSox]);
    const r = await q1<{ n: string }>(`select count(*) n from risk where engagement_id = $1`, [IDS.engSox]);
    expect(Number(r.n)).toBe(1);
  });
});
