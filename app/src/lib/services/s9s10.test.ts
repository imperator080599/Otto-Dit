import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { signWorkpaper } from '@/lib/services/workpapers/lifecycle';
import { whyEvidenceExists, whatSupportsConclusion, whereFigureFrom, eventLog, chainStatus } from './provenance';
import { dashboard, trackerXlsx, clientSafeView } from './dashboard';

describe('S9/S10 — provenance answers, event log, dashboard, tracker exports', () => {
  let wpId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
  }, 240000);

  it('answers "why does this evidence exist?" by walking stored links', async () => {
    const ev = await q<{ id: string }>(
      `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
       where e.engagement_id = $1 and ri.sample_item_id is not null limit 1`,
      [IDS.engNep],
    );
    const chain = await whyEvidenceExists(IDS.engNep, ev[0].id);
    const kinds = chain.map((n) => n.kind);
    expect(kinds).toContain('evidence');
    expect(kinds).toContain('request');
    expect(kinds).toContain('sample_item');
    expect(kinds).toContain('sample');
    expect(kinds).toContain('procedure');
    expect(chain.find((n) => n.kind === 'sample')!.detail).toMatch(/seed/);
  });

  it('answers "what supports this conclusion?" with evidence, AI runs and sign-offs', async () => {
    const res = await whatSupportsConclusion(IDS.engNep, wpId);
    expect(res!.wp.code).toBe('REV-01');
    expect(res!.run!.engine).toBe('workpaper_draft');
    expect(res!.signoffs.map((s) => s.sign_role)).toEqual(['preparer_validator', 'reviewer']);
    expect(res!.evidence.length).toBeGreaterThan(10);
    expect(res!.evidence.every((e) => e.sha256.length === 64)).toBe(true);
    expect(res!.aiRuns.length).toBeGreaterThanOrEqual(1); // the OCR-rung replay run
  });

  it('answers "where did this figure come from?" down to ledger + extraction + checks', async () => {
    const item = await q<{ id: string }>(
      `select si.id from sample_item si join sample s on s.id = si.sample_id
       join match m on m.sample_item_id = si.id
       where s.engagement_id = $1 and m.status = 'matched' limit 1`,
      [IDS.engNep],
    );
    const res = await whereFigureFrom(IDS.engNep, item[0].id);
    expect(res!.item.natural_key).toMatch(/\|/);
    expect(res!.item.import_filename).toMatch(/FEC/);
    expect(res!.extractions.length).toBeGreaterThan(0);
    expect(res!.match!.checks.length).toBeGreaterThan(0);
  });

  it('event log is filterable and the hash chain verifies', async () => {
    const all = await eventLog(IDS.engNep);
    expect(all.length).toBeGreaterThan(20);
    const aiEvents = await eventLog(IDS.engNep, { actorKind: 'ai' });
    expect(aiEvents.every((e) => e.actor_kind === 'ai')).toBe(true);
    const chain = await chainStatus(IDS.tenant, IDS.engNep);
    expect(chain.ok).toBe(true);
  });

  it('dashboard aggregates progress, exceptions, workpapers and AI cost', async () => {
    const d = await dashboard(IDS.engNep, IDS.tenant);
    expect(d.requests.length).toBeGreaterThanOrEqual(2);
    expect(d.progressPct).toBeGreaterThan(50);
    expect(d.exceptions.total).toBeGreaterThan(0);
    expect(d.exceptions.open).toBe(0); // all dispositioned by the flow
    expect(d.workpapers.some((w) => w.code === 'REV-01')).toBe(true);
    expect(d.evidence.extracted).toBeGreaterThan(10);
    expect(d.ai.costUsd).toBe(0); // demo runs on recorded fixtures (D12)
  });

  it('tracker exports differ by audience: the client variant carries no internal state', async () => {
    const team = Buffer.from(await trackerXlsx(IDS.engNep, 'team'));
    const client = Buffer.from(await trackerXlsx(IDS.engNep, 'client'));
    expect(team.subarray(0, 2).toString()).toBe('PK'); // xlsx zip
    expect(client.subarray(0, 2).toString()).toBe('PK');
    // read both back: the team workbook carries Exceptions/Deviations sheets and the
    // internal "Awaiting review from" statuses; the client one carries neither
    const load = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const sheets = wb.worksheets.map((w) => w.name);
      const text: string[] = [];
      wb.worksheets.forEach((w) => w.eachRow((r) => text.push(r.values?.toString() ?? '')));
      return { sheets, text: text.join('\n') };
    };
    const t = await load(team);
    const c = await load(client);
    expect(t.sheets).toContain('Exceptions');
    expect(c.sheets).not.toContain('Exceptions');
    expect(c.sheets).not.toContain('Deviations');
    expect(t.text).toContain('Audience: team');
    expect(c.text).toContain('Audience: client');
    expect(c.text).not.toMatch(/Awaiting review from/);
  });

  it('client-safe view exposes only request progress (D6)', async () => {
    const entity = await q<{ entity_id: string }>(`select entity_id from engagement where id = $1`, [IDS.engNep]);
    const rows = await clientSafeView(entity[0].entity_id);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        ['done_count', 'due_date', 'engagement_name', 'item_count', 'seq_no', 'status', 'title'].sort(),
      );
    }
  });
});
