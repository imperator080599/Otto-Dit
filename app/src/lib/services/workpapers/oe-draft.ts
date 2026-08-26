import { q, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { fmtEur } from '@/lib/kernel/canon';
import { primaryPack } from '@/lib/packs';
import { numToCents } from '@/lib/util/num';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { referencePapier } from '@/lib/methodology/catalogue';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { attributeGrid, listDeficiencies, listDeviations } from '../sox';
import type { WpSection, WpTableRow } from './draft';

// S8b — the OE workpaper goes through the SAME documentation engine as REV-01: only the
// pack (strings, language, format) and the fact sources differ. This is the D2
// pluggability proof.

export async function draftOeWorkpaper(engagementId: string, controlId: string, userId: string): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const wp = pack.wp;

  const control = await q1<{
    id: string; code: string; name: string; description: string; frequency: string; nature: string;
    effect: string; is_key: boolean; owner_name: string | null; di_status: string; di_conclusion: string | null;
    process_name: string | null; risk_desc: string | null; assertions: string[] | null; coso_component: string | null;
  }>(
    `select c.id, c.code, c.name, c.description, c.frequency, c.nature, c.effect, c.is_key,
            c.owner_name, c.di_status, c.di_conclusion, p.name process_name,
            r.risk_desc, r.assertions, r.coso_component
     from control c
     left join process p on p.id = c.process_id
     left join rcm_row r on r.control_id = c.id
     where c.id = $1`,
    [controlId],
  );
  const test = await q1<{ id: string; sample_id: string; status: string }>(
    `select id, sample_id, status from control_test where control_id = $1 order by id desc limit 1`,
    [controlId],
  );
  const sample = await q1<{ id: string; params: { size: number; frequency: string; override: string | null }; seed: string; population_hash: string; population_size: number; rationale: string | null; engine_run_id: string | null }>(
    `select id, params, seed, population_hash, population_size, rationale, engine_run_id from sample where id = $1`,
    [test.sample_id],
  );
  const grid = await attributeGrid(controlId);
  const deviations = (await listDeviations(engagementId)).filter((d) => d.control_code === control.code);
  const deficiencies = (await listDeficiencies(engagementId)).filter((d) => d.control_code === control.code);
  const attrs = await q<{ code: string; description: string }>(
    `select code, description from attribute_def where control_id = $1 order by code`,
    [controlId],
  );

  // attribute matrix: one row per instance, one column per attribute + evidence refs
  const labels = [...new Set(grid.map((g) => g.label))].sort();
  const rows: WpTableRow[] = [];
  for (const label of labels) {
    const inst = await q1<{ id: string; occurred_on: string | null; performer_name: string | null }>(
      `select id, occurred_on::text, performer_name from control_instance where control_id = $1 and label = $2`,
      [controlId, label],
    );
    const evidences = await q<{ id: string; filename: string; sha256: string }>(
      `select e.id, e.filename, e.sha256 from evidence e
       join request_item ri on ri.id = e.request_item_id
       where ri.control_instance_id = $1 and e.quarantined = false`,
      [inst.id],
    );
    const cells: (string | number)[] = [label, inst.occurred_on ?? '—', inst.performer_name ?? '—'];
    for (const a of attrs) {
      const r = grid.find((g) => g.label === label && g.attribute_code === a.code);
      cells.push(r ? `${r.result.toUpperCase()}${r.note ? ` (${r.note})` : ''}` : '—');
    }
    cells.push(evidences.length ? evidences.map((e) => e.filename).join(', ') : 'none provided');
    rows.push({ cells, refs: { evidenceIds: evidences.map((e) => e.id) } });
  }

  const deviationRows: WpTableRow[] = deviations.map((d) => ({
    cells: [d.instance_label ?? '—', d.attribute_code, d.taxonomy_code, d.status, d.resolution ?? '—', d.description.slice(0, 140)],
  }));

  const conclusionText = deviations.length === 0
    ? `No deviations were noted in the sample tested. Based on the procedures performed, control ${control.code} operated effectively throughout the period covered. [Draft — the signer concludes.]`
    : `${deviations.length} deviation(s) were noted in a sample of ${labels.length} instance(s) of a ${control.frequency} control. ` +
      (deficiencies.length
        ? `Severity proposed by the rules engine: ${deficiencies.map((d) => (d.severity_final ?? d.severity_proposed).replace(/_/g, ' ')).join(', ')} — human decision ${deficiencies.every((d) => d.status === 'confirmed') ? 'recorded' : 'PENDING'}. `
        : 'A deficiency evaluation has not yet been proposed. ') +
      `Control ${control.code} cannot be relied upon as operating effectively without remediation and, where applicable, retesting. [Draft — the signer concludes.]`;

  const sections: WpSection[] = [
    {
      key: 'objective',
      title: wp.objective,
      body:
        `Test the operating effectiveness of control ${control.code} — ${control.name} (${control.process_name ?? 'process n/a'}) for FY2025, ` +
        `in support of the ICFR conclusion under PCAOB AS 2201 with COSO 2013 as criteria. Control risk addressed: ${control.risk_desc ?? 'n/a'} ` +
        `(assertions: ${(control.assertions ?? []).join(', ') || 'n/a'}; COSO component: ${control.coso_component ?? 'n/a'}). ` +
        `Control attributes: ${control.frequency} frequency, ${control.nature}, ${control.effect}, ${control.is_key ? 'key control' : 'non-key control'}; owner ${control.owner_name ?? 'n/a'}.`,
    },
    {
      key: 'scope',
      title: wp.scope,
      body:
        `Design & implementation: ${control.di_status.toUpperCase()} — ${control.di_conclusion ?? 'n/a'}. OE testing proceeds only on an effective D&I assessment. ` +
        `Instance population: ${sample.population_size} instance(s) obtained from the client listing (population hash ${sample.population_hash.slice(0, 24)}…).`,
    },
    {
      key: 'method',
      title: wp.method,
      body: (sample.rationale ?? '') + (sample.params.override ? ` Sample-size override justification: ${sample.params.override}` : ''),
      meta: { params: sample.params, populationHash: sample.population_hash, engineRun: sample.engine_run_id },
    },
    {
      key: 'sampleTable',
      title: wp.sampleTable,
      table: {
        headers: ['Instance', 'Occurred', 'Performer', ...attrs.map((a) => `${a.code} — ${a.description}`), 'Evidence'],
        rows,
      },
    },
    {
      key: 'exceptions',
      title: wp.exceptions,
      table: {
        headers: ['Instance', 'Attribute', 'Deviation type', 'Status', 'Disposition', 'Description'],
        rows: deviationRows,
      },
    },
    {
      key: 'evaluation',
      title: wp.evaluation,
      body: deficiencies.length
        ? deficiencies
            .map(
              (d) =>
                `${(d.severity_final ?? d.severity_proposed).replace(/_/g, ' ').toUpperCase()} (${d.status}) — ${d.narrative}`,
            )
            .join('\n\n')
        : deviations.length
          ? 'Deviations noted; deficiency evaluation not yet proposed.'
          : 'No deviations — no deficiency evaluation required.',
    },
    {
      key: 'verification',
      title: wp.verification,
      body:
        'Attribute results marked "extraction_field" were derived from machine extraction of the client evidence; ' +
        'OCR/LLM-derived fields are human-verified before use (ADR-012). Attributes marked "human" were assessed directly by the tester.',
    },
    {
      key: 'conclusion',
      title: wp.conclusion,
      body: conclusionText,
    },
  ];

  const basedOnHash = hashObject({ controlId, sampleId: sample.id, grid, deviations: deviations.map((d) => [d.id, d.status]), deficiencies: deficiencies.map((d) => [d.id, d.status]) });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'workpaper_draft','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, engagementId, pack.id, hashObject(pack.wp), JSON.stringify({ code: `OE-${control.code}`, basedOnHash })],
  );
  const code = `OE-${control.code}`;
  const prev = await q<{ version: number; reference: string | null }>(
    `select version, reference from workpaper where engagement_id = $1 and code = $2 order by version desc`,
    [engagementId, code],
  );
  if (prev.length > 0) {
    await q(`update workpaper set status = 'outdated' where engagement_id = $1 and code = $2 and status <> 'outdated'`, [engagementId, code]);
  }
  /* LE PLAN DE CLASSEMENT EST CELUI DU CABINET, pour TOUS ses papiers. Le
     contenu de ce papier vient du pack SOX, gelé ; sa référence, non : un
     cabinet ne tient pas deux plans de classement selon l'origine du papier.
     Le poste est celui que le contrôle sert. */
  const cat = await catalogueDeLaMission(engagementId);
  let reference = prev[0]?.reference ?? null;
  if (!reference) {
    const dejaVus = await q1<{ n: string }>(
      `select count(distinct code) n from workpaper
       where engagement_id = $1 and reference is not null and code <> $2`,
      [engagementId, code],
    );
    reference = referencePapier(cat, {
      /* Le poste sert la lettre du plan de classement. Un contrôle SOX n'en
         déclare pas : la lettre de secours du cabinet s'applique, et c'est
         elle qui existe pour ça. */
      poste: '_sox',
      sequence: Number(dejaVus.n) + 1,
      code,
      version: (prev[0]?.version ?? 0) + 1,
    });
  }

  const row = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, reference, control_test_id, title, language, sections, status, version, based_on_hash, engine_run_id)
     values ($1,$2,$3,$11,$4,$5,$6,$7,'draft',$8,$9,$10) returning id`,
    [
      engagementId, pack.id, code, test.id,
      `${code} — Operating effectiveness: ${control.name}`,
      pack.language, JSON.stringify(sections), (prev[0]?.version ?? 0) + 1, basedOnHash, run.id,
      reference,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'workpaper_drafted', objectType: 'workpaper', objectId: row.id,
    payload: { code, control: control.code, engineRun: run.id, requestedBy: userId },
  });
  void fmtEur;
  void numToCents;
  return row.id;
}
