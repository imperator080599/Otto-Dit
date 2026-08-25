import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { runPart2 } from '@/lib/flows/part2';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { listExceptions } from '@/lib/services/matching';
import { listDeviations } from '@/lib/services/sox';
import { currentRevenueSample } from '@/lib/services/sampling';
import { latestTbGl } from '@/lib/services/reconciliation';
import { chainStatus } from '@/lib/services/provenance';

// ACCEPTANCE SUITE (dataset/ANOMALIES.md is the contract): the finished prototype must
// auto-detect and surface EVERY seeded anomaly and deviation through the APP path —
// zero false negatives; false positives enumerated and triaged.
//
// SCOPE (Gate 1): this is build-time regression evidence about engine design. It is NOT
// evidence of extraction reliability on real documents (A9/A12) and NOT an ISA 500-style
// evaluation of the automated tool — those are pre-pilot gates outside this repo.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ds = (...p: string[]) => path.join(root, 'dataset', ...p);

interface Manifest {
  substantiveAnomalies: { id: string; taxonomy: string[]; units: string[]; description: string }[];
  reconciliationAnomaly: { id: string; accounts: string[]; deltaCents: number };
  deviations: { id: string; control: string; instance: string; taxonomy: string }[];
}

let manifest: Manifest;
let sampleItemByNk: Map<string, string>;
let exceptions: Awaited<ReturnType<typeof listExceptions>>;
let deviations: Awaited<ReturnType<typeof listDeviations>>;
const falsePositives: string[] = [];

describe('ACCEPTANCE — every seeded anomaly and deviation surfaces through the app', () => {
  beforeAll(async () => {
    manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
    await initTestDb();
    await runPart1UpToWorkpaper();
    await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await runPart2();
    const sample = await currentRevenueSample(IDS.engNep);
    sampleItemByNk = new Map(sample!.items.map((i) => [i.natural_key, i.id]));
    exceptions = await listExceptions(IDS.engNep);
    deviations = await listDeviations(IDS.engSox);
  }, 600000);

  it('A1–A8: every substantive anomaly produced its typed exception (zero false negatives)', () => {
    const missing: string[] = [];
    for (const a of manifest.substantiveAnomalies) {
      for (const taxonomy of a.taxonomy) {
        const hit = a.units.some((u) =>
          exceptions.some((x) => x.taxonomy_code === taxonomy && x.sample_item_id === sampleItemByNk.get(u)),
        );
        if (!hit) missing.push(`${a.id} (${taxonomy}) — ${a.description}`);
      }
    }
    expect(missing, `undetected seeded anomalies:\n${missing.join('\n')}`).toEqual([]);
  });

  it('A7: the TB↔GL difference surfaced on both affected accounts', async () => {
    const recon = await latestTbGl(IDS.engNep);
    expect(recon!.items.map((i) => i.account_no).sort()).toEqual([...manifest.reconciliationAnomaly.accounts].sort());
    const reconExceptions = exceptions.filter((x) => x.kind === 'reconciliation');
    expect(reconExceptions.length).toBe(manifest.reconciliationAnomaly.accounts.length);
  });

  it('D1–D4: every seeded control deviation surfaced with the right taxonomy', () => {
    const missing: string[] = [];
    for (const d of manifest.deviations) {
      const hit = deviations.some(
        (x) => x.control_code === d.control && x.instance_label === d.instance && x.taxonomy_code === d.taxonomy,
      );
      if (!hit) missing.push(`${d.id}: ${d.taxonomy} on ${d.control}/${d.instance}`);
    }
    expect(missing, `undetected seeded deviations:\n${missing.join('\n')}`).toEqual([]);
  });

  it('false positives are enumerated and triaged (none expected)', () => {
    const anomalyItems = new Set(manifest.substantiveAnomalies.flatMap((a) => a.units.map((u) => sampleItemByNk.get(u))));
    for (const x of exceptions) {
      if (x.kind === 'reconciliation' || x.kind === 'verification') continue;
      if (x.sample_item_id && !anomalyItems.has(x.sample_item_id)) {
        falsePositives.push(`substantive ${x.taxonomy_code} on ${x.piece_ref ?? x.sample_item_id}`);
      }
    }
    const seededDev = new Set(manifest.deviations.map((d) => `${d.control}|${d.instance}|${d.taxonomy}`));
    for (const d of deviations) {
      if (!seededDev.has(`${d.control_code}|${d.instance_label}|${d.taxonomy_code}`)) {
        falsePositives.push(`deviation ${d.taxonomy_code} on ${d.control_code}/${d.instance_label}`);
      }
    }
    // eslint-disable-next-line no-console
    if (falsePositives.length) console.log('FALSE POSITIVES TO TRIAGE:\n' + falsePositives.join('\n'));
    expect(falsePositives).toEqual([]);
  });

  it('both packs ran the same engines and produced their pack-formatted workpapers', async () => {
    const wps = await q<{ code: string; pack_id: string; language: string; status: string }>(
      `select code, pack_id, language, status from workpaper where status <> 'outdated' order by code`,
      [],
    );
    expect(wps.some((w) => w.code === 'REV-01' && w.pack_id === 'nep-fr' && w.language === 'fr')).toBe(true);
    expect(wps.some((w) => w.code === 'OE-C-BR-01' && w.pack_id === 'pcaob-sox' && w.language === 'en')).toBe(true);
    const engines = await q<{ engine: string; packs: string }>(
      `select engine, string_agg(distinct pack_id, ',' order by pack_id) packs from engine_run
       where pack_id is not null group by engine order by engine`,
      [],
    );
    const shared = engines.filter((e) => e.packs.includes('nep-fr') && e.packs.includes('pcaob-sox'));
    expect(shared.map((e) => e.engine).sort()).toEqual(
      expect.arrayContaining(['materiality_proposal', 'sampling', 'workpaper_draft']),
    );
  });

  it('provenance and audit trail hold: hash chains verify on both engagements', async () => {
    for (const eng of [IDS.engNep, IDS.engSox]) {
      const chain = await chainStatus(IDS.tenant, eng);
      expect(chain.ok, `chain broken on ${eng}`).toBe(true);
      expect(chain.count).toBeGreaterThan(20);
    }
    // every AI/OCR output is registered
    const aiRuns = await q<{ n: string }>(`select count(*) n from ai_run`, []);
    const ocrExtractions = await q<{ n: string }>(`select count(*) n from extraction where rung = 'ocr'`, []);
    expect(Number(aiRuns[0].n)).toBeGreaterThanOrEqual(Number(ocrExtractions[0].n));
    // no OCR-rung extraction was used without human verification (ADR-012)
    const unverified = await q<{ n: string }>(
      `select count(*) n from extraction where rung in ('ocr','llm') and status <> 'verified'`,
      [],
    );
    expect(Number(unverified[0].n)).toBe(0);
  });
});
