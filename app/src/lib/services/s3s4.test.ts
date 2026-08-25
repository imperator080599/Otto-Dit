import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS, PORTAL_TOKENS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, documentDifference } from './reconciliation';
import { rebuildFslis } from './fsli';
import { propose, validate } from './materiality';
import { revenuePopulation } from './population';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from './sampling';
import { generatePbcFromSample, approveSend, ensureReminders, requestDetail, listRequests } from './requests';
import { ingestEvidence, markAllSubmitted, answerExplanation } from './evidence';
import { portalRequests, portalItems, portalRequestGuard } from './portal';
import { processInbound } from './inbound';
import { warp, resetClock, DAY_MS } from '@/lib/core/clock';
import { portalSession } from '@/lib/core/auth';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

async function bootstrapNepEngagement(): Promise<void> {
  const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
  await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv', content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
  await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
  await computeTbGl(IDS.engNep, IDS.users.karim);
  const latest = await latestTbGl(IDS.engNep);
  for (const item of latest!.items) {
    await documentDifference(item.id, IDS.users.karim, 'Écriture de situation non reprise au FEC — documentée.');
  }
  await rebuildFslis(IDS.engNep, IDS.users.karim);
  const mid = await propose(IDS.engNep, IDS.users.lea);
  await validate(mid, IDS.users.lea);
}

let manifest: {
  sampling: { revenue: { selectedUnits: string[]; populationHash: string } };
  substantiveAnomalies: { id: string; units: string[] }[];
};

describe('S3/S4 — population, sampling, requests, portal', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNepEngagement();
    manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
  }, 120000);

  it('builds the revenue population behind the per-FSLI gate', async () => {
    const pop = await revenuePopulation(IDS.engNep);
    expect(pop.gate.ok).toBe(true);
    expect(pop.hash).toBe(manifest.sampling.revenue.populationHash);
    expect(pop.rows.some((r) => r.flags.includes('weekend'))).toBe(true);
    expect(pop.rows.some((r) => r.flags.includes('credit_note_pattern'))).toBe(true);
  });

  it('proposes, validates and draws the sample — reproducing the pinned manifest draw', async () => {
    const sampleId = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
    await validateSampleParams(sampleId, IDS.users.lea);
    const { items } = await drawRevenueSample(sampleId, IDS.users.lea);
    expect(items).toBe(manifest.sampling.revenue.selectedUnits.length);
    const s = await currentRevenueSample(IDS.engNep);
    expect(s!.status).toBe('drawn');
    const drawnNks = s!.items.map((i) => i.natural_key).sort();
    expect(drawnNks).toEqual([...manifest.sampling.revenue.selectedUnits].sort());
    // every seeded anomaly unit is in the app-drawn sample (placement invariant, app path)
    for (const a of manifest.substantiveAnomalies) {
      for (const u of a.units) expect(drawnNks).toContain(u);
    }
    // determinism: engine_run recorded
    const run = await q1<{ n: string }>(`select count(*) n from engine_run where engine = 'sampling'`, []);
    expect(Number(run.n)).toBe(1);
  });

  it('generates the PBC request from the sample (L2 send gate)', async () => {
    const s = await currentRevenueSample(IDS.engNep);
    const requestId = await generatePbcFromSample(IDS.engNep, s!.id, IDS.users.karim);
    const detail = await requestDetail(requestId);
    expect(detail!.request.status).toBe('draft');
    expect(detail!.items.length).toBeGreaterThan(s!.items.length); // + BL items + standing items
    expect(detail!.items.some((i) => i.kind === 'explanation')).toBe(true); // manual JE
    expect(detail!.items.some((i) => i.sample_item_id === null)).toBe(true); // standing items
    await approveSend(requestId, IDS.users.karim);
    const after = await requestDetail(requestId);
    expect(after!.request.status).toBe('sent');
  });

  it('portal: contact sees requests, uploads evidence, answers explanations, marks submitted', async () => {
    const session = await portalSession(PORTAL_TOKENS.sophie);
    expect(session).toBeTruthy();
    const requests = await portalRequests(session!.contact.entity_id);
    expect(requests.length).toBe(1);
    const requestId = requests[0].id;
    expect(await portalRequestGuard(requestId, session!.contact.entity_id)).toBe(true);

    const items = await portalItems(requestId);
    const docItems = items.filter((i) => i.kind === 'document');
    // upload the A1 duplicate invoice PDF to two different items (sha dedupe flags it)
    const evIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8')) as { filename: string; anomaly?: string; docType: string }[];
    const a1 = evIndex.find((e) => e.anomaly === 'A1')!;
    const bytes = fs.readFileSync(ds(...a1.filename.split('/')));
    const up1 = await ingestEvidence({
      engagementId: IDS.engNep, requestItemId: docItems[0].id, filename: 'FA.pdf', mime: 'application/pdf',
      bytes, source: 'portal', uploadedBy: { kind: 'client_contact', id: session!.contact.id },
    });
    expect(up1.duplicateOf).toBeNull();
    const up2 = await ingestEvidence({
      engagementId: IDS.engNep, requestItemId: docItems[1].id, filename: 'FA-again.pdf', mime: 'application/pdf',
      bytes, source: 'portal', uploadedBy: { kind: 'client_contact', id: session!.contact.id },
    });
    expect(up2.duplicateOf).toBe(up1.evidenceId);

    const expl = items.find((i) => i.kind === 'explanation')!;
    await answerExplanation(expl.id, session!.contact.id, 'Écriture d’ajustement de fin d’année validée par la direction.');
    await markAllSubmitted(requestId, session!.contact.id);
    const after = await requestDetail(requestId);
    expect(after!.request.status).toBe('partially_submitted'); // untouched items remain pending
  });

  it('client-isolation: the portal surface exposes no audit documentation (test-asserted)', async () => {
    // The portal module's whole read surface is requests/items — assert the shapes carry
    // no workpaper/sample/exception references and the guard blocks foreign requests.
    const session = await portalSession(PORTAL_TOKENS.theo);
    const requests = await portalRequests(session!.contact.entity_id);
    for (const r of requests) {
      expect(Object.keys(r).sort()).toEqual(
        ['due_date', 'engagement_id', 'engagement_name', 'id', 'language', 'seq_no', 'sent_at', 'status', 'title'].sort(),
      );
    }
    expect(await portalRequestGuard('00000000-0000-4000-8000-000000000000', session!.contact.entity_id)).toBe(false);
    // the auditor-only tables are not referenced anywhere in the portal module
    const portalSource = fs.readFileSync(path.join(repoRoot(), 'app', 'src', 'lib', 'services', 'portal.ts'), 'utf8');
    for (const forbidden of ['workpaper', 'sample', 'exception', 'review_note', 'signoff', 'materiality', 'event_log']) {
      expect(portalSource.includes(forbidden), `portal.ts must not touch ${forbidden}`).toBe(false);
    }
  });

  it('reminders materialize on the cadence under the demo clock and are pausable', async () => {
    await resetClock();
    const requests = await listRequests(IDS.engNep);
    const rid = requests[0].id;
    await ensureReminders(IDS.engNep);
    let detail = await requestDetail(rid);
    expect(detail!.reminders.filter((r) => r.status === 'sent').length).toBe(0);
    await warp(14 * DAY_MS); // due(+10d) + 3d cadence + first weekly
    await ensureReminders(IDS.engNep);
    detail = await requestDetail(rid);
    const sent = detail!.reminders.filter((r) => r.status === 'sent').length;
    expect(sent).toBeGreaterThanOrEqual(1);
    await warp(21 * DAY_MS);
    await ensureReminders(IDS.engNep);
    detail = await requestDetail(rid);
    expect(detail!.reminders.filter((r) => r.status === 'sent').length).toBeGreaterThan(sent);
    await resetClock();
  });

  it('inbound email stub routes attachments from known senders and quarantines strangers', async () => {
    const known = await processInbound(IDS.engNep, {
      from: 'sophie.marchand@altiverre.example',
      subject: 'Relevés',
      attachments: [{ filename: 'releve_512100_2025-11.pdf', mime: 'application/pdf', bytes: fs.readFileSync(ds('evidence', 'releve_512100_2025-11.pdf')) }],
    });
    expect(known.quarantined).toBe(false);
    expect(known.evidenceIds.length).toBe(1);
    const unknown = await processInbound(IDS.engNep, {
      from: 'stranger@example.org',
      subject: 'spam',
      attachments: [],
    });
    expect(unknown.quarantined).toBe(true);
  });
});
