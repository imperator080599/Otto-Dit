import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec, parseTbCsv } from './imports';
import { computeTbGl, latestTbGl, documentDifference, fsliRecoGate } from './reconciliation';
import { rebuildFslis, listFslis, proposeScoping, confirmScoping, fsliAccounts } from './fsli';
import { propose, validate, currentMateriality, validatedThresholds } from './materiality';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

describe('S1/S2 — imports, reconciliation, FSLI mapping, materiality, scoping', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  it('imports the dataset TB via detected column mapping', async () => {
    const content = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    const mapping = detectTbMapping(content.split('\n')[0]);
    expect(mapping.separator).toBe(';');
    expect(mapping.account).toBe('Compte');
    const parsed = parseTbCsv(content, mapping);
    expect(parsed.violations.filter((v) => v.severity === 'error')).toEqual([]);
    const res = await importTb({
      engagementId: IDS.engNep,
      userId: IDS.users.karim,
      filename: 'tb_2025.csv',
      content,
      mapping,
      periodKind: 'current',
    });
    expect(res.ok).toBe(true);
    const prior = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
    const res2 = await importTb({
      engagementId: IDS.engNep,
      userId: IDS.users.karim,
      filename: 'tb_2024.csv',
      content: prior,
      mapping: detectTbMapping(prior.split('\n')[0]),
      periodKind: 'prior',
    });
    expect(res2.ok).toBe(true);
  });

  it('re-import supersedes, never overwrites', async () => {
    const content = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    const mapping = detectTbMapping(content.split('\n')[0]);
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025_v2.csv', content, mapping, periodKind: 'current' });
    const snaps = await q<{ status: string; version: number }>(
      `select status, version from tb_snapshot where engagement_id = $1 and period_kind = 'current' order by version`,
      [IDS.engNep],
    );
    expect(snaps.map((s) => s.status)).toEqual(['superseded', 'active']);
  });

  it('imports the FEC through the adapter (warnings allowed, no errors)', async () => {
    const bytes = fs.readFileSync(ds('999888777FEC20251231.txt'));
    const res = await importFec({
      engagementId: IDS.engNep,
      userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt',
      bytes,
    });
    expect(res.ok).toBe(true);
    expect(res.rowCount).toBe(4731);
    const flaggedCount = await q1<{ n: string }>(
      `select count(*) n from gl_entry where engagement_id = $1 and flags::text <> '[]'`,
      [IDS.engNep],
    );
    expect(Number(flaggedCount.n)).toBeGreaterThan(0);
  });

  it('rejects a mutated FEC (wrong header order)', async () => {
    const bytes = fs.readFileSync(ds('999888777FEC20251231.txt'));
    const text = bytes.toString('latin1');
    const lines = text.split('\n');
    lines[0] = lines[0].split('\t').reverse().join('\t');
    const res = await importFec({
      engagementId: IDS.engSox,
      userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt',
      bytes: Buffer.from(lines.join('\n'), 'latin1'),
    });
    expect(res.ok).toBe(false);
  });

  it('TB↔GL reconciliation surfaces exactly the seeded A7 mismatch as an exception', async () => {
    const { diffCount } = await computeTbGl(IDS.engNep, IDS.users.karim);
    expect(diffCount).toBe(2); // one unposted top-side entry → two account differences
    const latest = await latestTbGl(IDS.engNep);
    expect(latest!.items.map((i) => i.account_no).sort()).toEqual(['411000', '706000']);
    for (const item of latest!.items) expect(Math.abs(Number(item.delta))).toBeCloseTo(25000, 2);
    const exc = await q<{ taxonomy_code: string; status: string }>(
      `select taxonomy_code, status from exception where engagement_id = $1 and kind = 'reconciliation'`,
      [IDS.engNep],
    );
    expect(exc.length).toBe(2);
    expect(exc.every((e) => e.taxonomy_code === 'reconciliation_diff')).toBe(true);
  });

  it('per-FSLI gate blocks on the open difference, passes once documented (Gate 2)', async () => {
    const before = await fsliRecoGate(IDS.engNep, ['706000', '701000']);
    expect(before.ok).toBe(false);
    const latest = await latestTbGl(IDS.engNep);
    for (const item of latest!.items) {
      await documentDifference(item.id, IDS.users.karim, 'Écriture de situation (Dr 411000 / Cr 706000) non reprise dans le FEC — expliquée par le client, à corriger au FEC définitif.');
    }
    const after = await fsliRecoGate(IDS.engNep, ['706000', '701000']);
    expect(after.ok).toBe(true);
    const exc = await q<{ status: string }>(
      `select status from exception where engagement_id = $1 and kind = 'reconciliation'`,
      [IDS.engNep],
    );
    expect(exc.every((e) => e.status === 'explained')).toBe(true);
  });

  it('maps accounts to FSLIs (PCG) and lists the revenue lead sheet', async () => {
    await rebuildFslis(IDS.engNep, IDS.users.karim);
    const fslis = await listFslis(IDS.engNep);
    const revenue = fslis.find((f) => f.code === 'REVENUE');
    expect(revenue).toBeTruthy();
    expect(Number(revenue!.balance)).toBeLessThan(0); // credit balance
    const accounts = await fsliAccounts(IDS.engNep, 'REVENUE');
    expect(accounts.map((a) => a.number)).toEqual(expect.arrayContaining(['701000', '706000', '709000']));
  });

  it('proposes and validates materiality per the pinned demo params', async () => {
    const id = await propose(IDS.engNep, IDS.users.lea);
    const prop = await currentMateriality(IDS.engNep);
    expect(prop!.status).toBe('proposed');
    expect(prop!.benchmark_code).toBe('pbt');
    await validate(id, IDS.users.lea);
    const validated = await validatedThresholds(IDS.engNep);
    const pinned = JSON.parse(fs.readFileSync(ds('demo-params.json'), 'utf8'));
    expect(validated!.materialityCents).toBe(pinned.materiality.amountCents);
    expect(validated!.perfCents).toBe(pinned.materiality.perfAmountCents);
    expect(validated!.teCents).toBe(pinned.materiality.teAmountCents);
  });

  it('proposes NS scoping below CTT and requires explicit confirmation (D9)', async () => {
    await proposeScoping(IDS.engNep, IDS.users.lea);
    const fslis = await listFslis(IDS.engNep);
    const ns = fslis.filter((f) => f.scoping === 'ns_proposed');
    expect(ns.length).toBeGreaterThan(0);
    const revenue = fslis.find((f) => f.code === 'REVENUE')!;
    expect(revenue.scoping).toBe('in_scope');
    // confirm one NS + one qualitative override (requires basis)
    await confirmScoping(ns[0].id, IDS.users.lea, 'ns_confirmed');
    await expect(confirmScoping(ns[1]?.id ?? ns[0].id, IDS.users.lea, 'in_scope_qualitative')).rejects.toThrow(/basis/);
    if (ns[1]) await confirmScoping(ns[1].id, IDS.users.lea, 'in_scope_qualitative', 'Sensible qualitativement (parties liées).');
    const after = await listFslis(IDS.engNep);
    expect(after.find((f) => f.id === ns[0].id)!.scoping).toBe('ns_confirmed');
  });

  it('ADR-016: FEC re-import with a drawn sample requires explicit invalidation', async () => {
    // simulate a drawn sample
    const proc = await q1<{ id: string }>(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, title)
       values ($1, 'nep-fr', 'REV-SUBST', 'substantive', 'Revenue testing') returning id`,
      [IDS.engNep],
    );
    await q(
      `insert into sample (engagement_id, procedure_id, method, seed, population_hash, population_size, status)
       values ($1, $2, 'monetary_coverage_random', 's', 'h', 10, 'drawn')`,
      [IDS.engNep, proc.id],
    );
    const bytes = fs.readFileSync(ds('999888777FEC20251231.txt'));
    await expect(
      importFec({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: '999888777FEC20251231.txt', bytes }),
    ).rejects.toThrow(/ADR-016/);
    const res = await importFec({
      engagementId: IDS.engNep,
      userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt',
      bytes,
      confirmInvalidation: true,
    });
    expect(res.ok).toBe(true);
    expect(res.invalidatedSamples).toBe(1);
    const sample = await q1<{ status: string }>(`select status from sample where procedure_id = $1`, [proc.id]);
    expect(sample.status).toBe('superseded');
  });
});
