import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from './workpapers/draft';
import { signWorkpaper } from './workpapers/lifecycle';
import { closeFile } from './retention';
import { sealFile, buildArchive, latestArchive } from './archive';
import { readBlob } from '@/lib/core/storage';

// ADR-022 — what "the closed file" is, and what an inspector receives.

describe('closing the file (ADR-022)', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
  }, 300000);

  it('a provisional ledger blocks closing — the whole point of flagging it', async () => {
    await expect(closeFile(IDS.engNep, IDS.users.claire, '2026-04-30')).rejects.toThrow(/provisional/);
    const row = await q1<{ status: string }>(`select status from engagement where id = $1`, [IDS.engNep]);
    expect(row.status).not.toBe('locked');
  });

  it('once the final ledger is reconciled, closing seals a self-contained archive', async () => {
    await q(
      `update engagement set ledger_is_provisional = false, ledger_provisional_reason = null where id = $1`,
      [IDS.engNep],
    );
    const res = await closeFile(IDS.engNep, IDS.users.claire, '2026-04-30');

    // the dates and their provisions are on the engagement …
    expect(res.completionDue).toBe('2026-06-29'); // +60 days, C. com. D. 821-186 III-IV
    expect(res.retentionUntil).toBe('2032-04-30'); // +6 years, C. com. R. 820-42
    const eng = await q1<{ status: string; legal_basis: { archive_sha256: string } }>(
      `select status, legal_basis from engagement where id = $1`,
      [IDS.engNep],
    );
    expect(eng.status).toBe('locked');
    expect(eng.legal_basis.archive_sha256).toBe(res.archive.sha256);

    // … and the archive exists, hashed and retained
    const arch = await latestArchive(IDS.engNep);
    expect(arch.sha256).toBe(res.archive.sha256);
    expect(arch.retention_until).toBe('2032-04-30');

    const zip = await JSZip.loadAsync(Buffer.from(readBlob(arch.storage_path)));
    const names = Object.keys(zip.files).sort();
    expect(names).toContain('MANIFEST.json');
    expect(names).toContain('README.html');
    expect(names.some((n) => n.startsWith('workpapers/') && n.endsWith('.pdf'))).toBe(true);
    expect(names.filter((n) => n.startsWith('evidence/')).length).toBeGreaterThan(15);
    expect(names).toContain('data/event_log.json');
    expect(names).toContain('data/exceptions.json');

    // every file listed in the manifest is really in the archive, at the stated hash
    const manifest = JSON.parse(await zip.file('MANIFEST.json')!.async('string')) as {
      files: { path: string; sha256: string }[];
      event_chain: { verified: boolean };
      legal_basis: { retention: { citation: string } };
    };
    expect(manifest.event_chain.verified).toBe(true);
    expect(manifest.legal_basis.retention.citation).toBe('C. com., art. R. 820-42');
    const { sha256 } = await import('@/lib/core/hash');
    for (const f of manifest.files.filter((x) => x.path !== 'MANIFEST.json' && x.path !== 'README.html')) {
      const bytes = await zip.file(f.path)!.async('uint8array');
      expect(sha256(bytes), `${f.path} does not match its manifest hash`).toBe(f.sha256);
    }

    // the index an inspector opens needs nothing but a browser
    const readme = await zip.file('README.html')!.async('string');
    expect(readme).toContain('R. 820-42');
    expect(readme).not.toMatch(/<script|http:\/\/|https:\/\//);
  }, 300000);

  it('the archive is a projection: rebuilt from the same rows, it is byte-identical', async () => {
    const a = await buildArchive(IDS.engNep, '2026-04-30');
    const b = await buildArchive(IDS.engNep, '2026-04-30');
    if (!Buffer.from(a.bytes).equals(Buffer.from(b.bytes))) {
      const za = await JSZip.loadAsync(Buffer.from(a.bytes));
      const zb = await JSZip.loadAsync(Buffer.from(b.bytes));
      const na = Object.keys(za.files).join(',');
      const nb = Object.keys(zb.files).join(',');
      if (na !== nb) throw new Error(`entry LIST differs:\nA: ${na}\nB: ${nb}`);
      for (const name of Object.keys(za.files)) {
        if (za.files[name].dir) continue;
        const xa = await za.file(name)!.async('uint8array');
        const yb = await zb.file(name)!.async('uint8array');
        if (Buffer.from(xa).equals(Buffer.from(yb))) continue;
        const x = Buffer.from(xa).toString('latin1');
        const y = Buffer.from(yb).toString('latin1');
        {
          const i = [...x].findIndex((c, k) => c !== y[k]);
          throw new Error(`entry ${name} differs at ${i}:\nA: ${x.slice(Math.max(0, i - 80), i + 80)}\nB: ${y.slice(Math.max(0, i - 80), i + 80)}`);
        }
      }
    }
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    expect(a.fileCount).toBe(b.fileCount);

    // It does NOT match the archive stored a moment ago, and that is correct: sealing is
    // itself an event in the file, so a rebuild afterwards legitimately carries more
    // history. Determinism is "same rows in, same bytes out" — not "time does not pass".
    const arch = await latestArchive(IDS.engNep);
    const { sha256 } = await import('@/lib/core/hash');
    expect(sha256(a.bytes)).not.toBe(arch.sha256);
  }, 300000);

  it('re-sealing later is a NEW archive, because the file itself changed', async () => {
    const first = await latestArchive(IDS.engNep);
    const again = await sealFile(IDS.engNep, IDS.users.claire, '2026-04-30');
    // the previous seal is itself an event in the file, so the new archive records more
    // history — it is not a discrepancy, and both remain retained side by side
    expect(again.sha256).not.toBe(first.sha256);
    const rows = await q<{ sha256: string }>(`select sha256 from file_archive where engagement_id = $1`, [IDS.engNep]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  }, 300000);
});
