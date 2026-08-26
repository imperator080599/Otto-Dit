import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox, runControlCycle, runPart2 } from '@/lib/flows/part2';
import { listControls, listDeviations, listDeficiencies, attributeGrid, drawAttributeSample, setDiStatus, resolveDeviation } from './sox';
import { getWorkpaper } from './workpapers/lifecycle';
import { renderWorkpaperPdf } from './workpapers/render';
import type { WpSection } from './workpapers/draft';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

describe('S8 — SOX OE cycle on the same engines (PCAOB/COSO pack)', () => {
  let manifest: { deviations: { id: string; control: string; instance: string; taxonomy: string }[]; sampling: { bankRec: { sampled: string[] }; approvals: { sampled: string[] } } };

  beforeAll(async () => {
    await initTestDb();
    manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
    await bootstrapSox();
  }, 180000);

  it('imports the RCM with 7 controls incl. one ITGC and their attributes', async () => {
    const controls = await listControls(IDS.engSox);
    expect(controls.length).toBe(7);
    expect(controls.filter((c) => c.itgc_code).length).toBe(1);
    expect(controls.find((c) => c.code === 'C-BR-01')!.frequency).toBe('monthly');
    const attrs = await q<{ n: string }>(`select count(*) n from attribute_def`, []);
    expect(Number(attrs[0].n)).toBeGreaterThan(7);
  });

  it('D&I gate blocks OE testing on a not-assessed control', async () => {
    const notAssessed = (await listControls(IDS.engSox)).find((c) => c.di_status === 'not_assessed')!;
    expect(notAssessed.code).toBe('C-REV-03');
    await expect(drawAttributeSample(notAssessed.id, IDS.users.lea)).rejects.toThrow(/D&I gate/);
    await setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.');
    const after = (await listControls(IDS.engSox)).find((c) => c.code === 'C-REV-03')!;
    expect(after.di_status).toBe('effective');
  });

  it('runs the monthly bank-rec control end-to-end and surfaces every seeded deviation', async () => {
    const res = await runControlCycle('C-BR-01');
    expect(res.deviations).toBeGreaterThanOrEqual(4);

    // the app's attribute draw reproduces the pinned manifest draw
    const sampled = await q<{ label: string }>(
      `select ci.label from sample_item si
       join control_instance ci on ci.id = si.unit_id
       join sample s on s.id = si.sample_id
       join control_test ct on ct.sample_id = s.id
       join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' order by ci.label`,
      [],
    );
    // the FIRST draw is the pinned 3-instance sample …
    const firstSample = await q1<{ sample_id: string }>(
      `select ct.sample_id from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at limit 1`,
      [IDS.engSox],
    );
    const firstLabels = await q<{ label: string }>(
      `select ci.label from sample_item si join control_instance ci on ci.id = si.unit_id
       where si.sample_id = $1 order by ci.label`,
      [firstSample.sample_id],
    );
    expect(firstLabels.map((s) => s.label)).toEqual([...manifest.sampling.bankRec.sampled].sort());

    // … all three failed, so the engine required the population and the flow tested it
    const tests = await q<{ extension_required: boolean; n: string }>(
      `select ct.extension_required, (select count(*) from sample_item si where si.sample_id = ct.sample_id)::text n
       from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at`,
      [IDS.engSox],
    );
    expect(tests.map((t) => [t.extension_required, Number(t.n)])).toEqual([[true, 3], [false, 12]]);

    // zero false negatives: every manifest deviation has a matching typed deviation
    const deviations = await listDeviations(IDS.engSox);
    for (const d of manifest.deviations) {
      const hit = deviations.some((x) => x.control_code === d.control && x.instance_label === d.instance && x.taxonomy_code === d.taxonomy);
      expect(hit, `${d.id}: ${d.taxonomy} on ${d.instance}`).toBe(true);
    }
    // no extra deviations beyond the seeded set — counted on the extended test, where the
    // nine additional months are clean (false positives would show up here)
    const latestSample = await q1<{ sample_id: string }>(
      `select ct.sample_id from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at desc limit 1`,
      [IDS.engSox],
    );
    const onLatest = await q<{ taxonomy_code: string; label: string }>(
      `select d.taxonomy_code, ci.label from deviation d
       join sample_item si on si.id = d.sample_item_id
       join control_instance ci on ci.id = si.unit_id
       where si.sample_id = $1 order by ci.label, d.taxonomy_code`,
      [latestSample.sample_id],
    );
    expect(onLatest.length).toBe(manifest.deviations.length);
  });

  it('attribute grid renders per-instance results with their basis', async () => {
    const control = await q1<{ id: string }>(`select id from control where engagement_id = $1 and code = 'C-BR-01'`, [IDS.engSox]);
    const grid = await attributeGrid(control.id);
    expect(grid.length).toBeGreaterThan(8);
    expect(grid.some((g) => g.result === 'fail' && g.basis === 'extraction_field')).toBe(true);
    expect(grid.some((g) => g.result === 'na' && g.basis === 'human')).toBe(true); // missing-evidence month
  });

  it('a deviation cannot be explained away on a sentence (migration 0010)', async () => {
    const d = (await listDeviations(IDS.engSox)).find((x) => x.status === 'open');
    expect(d, 'au moins une déviation ouverte').toBeTruthy();
    await expect(
      resolveDeviation(d!.id, IDS.users.karim, {
        explanation: 'Le client indique que le rapprochement a bien été fait.',
        conclusion: 'Explication reçue et jugée plausible.',
        disposition: 'control_operated',
        evidenceId: '',
      }),
    ).rejects.toThrow(/link the evidence that shows the control operated/);

    // la contrainte CHECK est le filet derrière le service
    await expect(
      q(`update deviation set status = 'explained', resolution = 'ok', resolved_by = $2, resolved_at = now() where id = $1`,
        [d!.id, IDS.users.lea]),
    ).rejects.toThrow(/deviation_closure_is_probative/);

    // et une déviation qui subsiste reste ouverte : elle alimente le taux
    expect((await listDeviations(IDS.engSox)).find((x) => x.id === d!.id)!.status).toBe('open');
  });

  it('deficiency ladder proposes severity from rules (L3) and records the human decision', async () => {
    const deficiencies = await listDeficiencies(IDS.engSox);
    expect(deficiencies.length).toBe(1);
    const d = deficiencies[0];
    // a key cash control, an exposure at least equal to materiality, an instance nobody
    // could evidence and one the preparer approved themselves ⇒ material weakness proposed
    expect(d.severity_proposed).toBe('material_weakness');
    expect(d.status).toBe('confirmed');
    expect(d.narrative).toMatch(/Rules-based severity proposal/);
    expect(d.narrative).toMatch(/deviation rate 25 %/);
    const basis = d.basis as { rule: string; deviationRate: number; severeNatures: string[]; sampleSize: number };
    expect(basis.deviationRate).toBeCloseTo(0.25, 4); // 3 deviating months of 12 tested
    expect(basis.sampleSize).toBe(12);
    expect(basis.severeNatures.sort()).toEqual(['missing_evidence', 'wrong_performer']);
    // the number that drove severity says where it came from
    const mb = await q1<{ magnitude_basis: string }>(`select magnitude_basis from deficiency where id = $1`, [d.id]);
    expect(mb.magnitude_basis).toMatch(/balance importée|solde de clôture/);
  });

  it('drafts the ENGLISH OE workpaper through the SAME documentation engine (pluggability proof)', async () => {
    const wpRow = await q1<{ id: string }>(
      `select id from workpaper where engagement_id = $1 and code = 'OE-C-BR-01' order by version desc limit 1`,
      [IDS.engSox],
    );
    const wp = await getWorkpaper(wpRow.id);
    expect(wp!.language).toBe('en');
    expect(wp!.pack_id).toBe('pcaob-sox');
    const sections = wp!.sections as WpSection[];
    expect(sections.map((s) => s.key)).toEqual(['objective', 'scope', 'method', 'sampleTable', 'exceptions', 'evaluation', 'verification', 'conclusion']);
    expect(sections[0].title).toBe('Objective'); // EN pack strings
    expect(sections.find((s) => s.key === 'scope')!.body).toMatch(/Design & implementation: EFFECTIVE/);
    expect(sections.find((s) => s.key === 'sampleTable')!.table!.headers.some((h) => h.startsWith('SOD'))).toBe(true);
    expect(sections.find((s) => s.key === 'evaluation')!.body).toMatch(/DEFICIENCY|SIGNIFICANT|MATERIAL/);
    // same renderer, English content
    const pdf = await renderWorkpaperPdf(wpRow.id);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('the clean approval control concludes effective on the same engines', async () => {
    const res = await runControlCycle('C-REV-01');
    expect(res.deviations).toBe(0);
    const wp = await getWorkpaper(res.workpaperId);
    const conclusion = (wp!.sections as WpSection[]).find((s) => s.key === 'conclusion')!;
    expect(conclusion.body).toMatch(/No deviations were noted/);
    // the OCR-mock approval form was verified before use (ADR-012)
    const verified = await q<{ n: string }>(
      `select count(*) n from extraction x join evidence e on e.id = x.evidence_id
       where e.engagement_id = $1 and x.rung = 'ocr' and x.status = 'verified'`,
      [IDS.engSox],
    );
    expect(Number(verified[0].n)).toBe(1);
  });

  it('both cycles share one engine set: sampling/matching/documentation engine_runs on both packs', async () => {
    const runs = await q<{ pack_id: string; engine: string; n: string }>(
      `select pack_id, engine, count(*) n from engine_run group by pack_id, engine order by pack_id, engine`,
      [],
    );
    const packs = new Set(runs.map((r) => r.pack_id));
    expect(packs.has('pcaob-sox')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'sampling')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'workpaper_draft')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'attribute_testing')).toBe(true);
  });
});
