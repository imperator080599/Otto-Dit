import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { controlPopulationHash } from '@/lib/kernel/canon';
import { attributeDraw } from '@/lib/kernel/sampling';
import { proposeDeficiencySeverity, type DeviationNature } from '@/lib/kernel/deficiency';
import { primaryPack } from '@/lib/packs';
import type { Frequency } from '@/lib/packs/types';
import { centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { validatedThresholds } from './materiality';
import { latestExtraction } from './extraction/ladder';
import type { ExtractedField } from './extraction/fields';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// S8 — SOX OE cycle on the SAME engines (request, evidence, extraction, sampling,
// exception/deviation, documentation) under the PCAOB/COSO pack. UI held to the four
// Gate-2 surfaces: RCM table, instance list, attribute grid, deviation list.

// ---------- S8a: RCM import + D&I gate + instance listings ----------

const ATTRIBUTES_BY_CONTROL: Record<string, { code: string; description: string; required: boolean }[]> = {
  'C-BR-01': [
    { code: 'TIMELY', description: 'Reconciliation prepared within 10 days of month end', required: true },
    { code: 'SOD', description: 'Preparer and approver are different people', required: true },
    { code: 'APPROVAL', description: 'Independent approval signature present', required: true },
    { code: 'EVIDENCE', description: 'Signed reconciliation retained', required: true },
  ],
  'C-REV-01': [
    { code: 'REVIEW', description: 'Credit review performed and documented', required: true },
    { code: 'APPROVAL', description: 'CFO approval present', required: true },
    { code: 'EVIDENCE', description: 'Approval form retained', required: true },
  ],
};
const DEFAULT_ATTRIBUTES = [{ code: 'EVIDENCE', description: 'Evidence of performance retained', required: true }];

/** Split a ';'-separated CSV line honouring RFC4180 double-quote escaping. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function importRcm(engagementId: string, csv: string, userId: string): Promise<number> {
  await assertMembre(engagementId, userId, 'importRcm');
  const ctx = await engagementCtx(engagementId);
  const lines = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  const idx = (n: string) => headers.indexOf(n);
  const processIds = new Map<string, string>();
  let count = 0;
  for (const line of lines.slice(1)) {
    const p = splitCsvLine(line);
    const get = (n: string) => p[idx(n)] ?? '';
    const processName = get('process');
    if (!processIds.has(processName)) {
      const existing = await q01<{ id: string }>(`select id from process where engagement_id = $1 and name = $2`, [engagementId, processName]);
      const pid = existing?.id ?? (await q1<{ id: string }>(`insert into process (engagement_id, name) values ($1,$2) returning id`, [engagementId, processName])).id;
      processIds.set(processName, pid);
    }
    const itgc = get('itgc_area');
    const itgcRow = itgc ? await q01<{ id: string }>(`select id from itgc_area where code = $1`, [itgc]) : null;
    const existing = await q01<{ id: string }>(`select id from control where engagement_id = $1 and code = $2`, [engagementId, get('code')]);
    if (existing) continue;
    const control = await q1<{ id: string }>(
      `insert into control (engagement_id, process_id, code, name, description, frequency, nature, effect, is_key, itgc_area_id, owner_name, di_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [
        engagementId, processIds.get(processName), get('code'), get('name'), get('description'),
        get('frequency'), get('nature'), get('effect'), get('is_key') === 'yes',
        itgcRow?.id ?? null, get('owner'), get('di_status'),
      ],
    );
    await q(
      `insert into rcm_row (engagement_id, control_id, risk_desc, assertions, coso_component) values ($1,$2,$3,$4,$5)`,
      [engagementId, control.id, get('risk_desc'), (get('assertions') || '').split('|').filter(Boolean), get('coso_component')],
    );
    for (const a of ATTRIBUTES_BY_CONTROL[get('code')] ?? DEFAULT_ATTRIBUTES) {
      await q(
        `insert into attribute_def (control_id, code, description, required) values ($1,$2,$3,$4)`,
        [control.id, a.code, a.description, a.required],
      );
    }
    count++;
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'rcm_imported', objectType: 'control', payload: { controls: count },
  });
  return count;
}

export async function listControls(engagementId: string) {
  return q<{
    id: string; code: string; name: string; description: string; frequency: string; nature: string;
    effect: string; is_key: boolean; owner_name: string | null; di_status: string; process_name: string;
    itgc_code: string | null; risk_desc: string | null; coso_component: string | null;
    instance_count: string; deviation_count: string; test_status: string | null; test_conclusion: string | null;
  }>(
    `select c.id, c.code, c.name, c.description, c.frequency, c.nature, c.effect, c.is_key,
            c.owner_name, c.di_status, p.name process_name, i.code itgc_code,
            r.risk_desc, r.coso_component,
            (select count(*) from control_instance ci where ci.control_id = c.id) instance_count,
            (select count(*) from deviation d where d.control_id = c.id) deviation_count,
            (select ct.status from control_test ct where ct.control_id = c.id order by ct.id desc limit 1) test_status,
            (select ct.conclusion from control_test ct where ct.control_id = c.id order by ct.id desc limit 1) test_conclusion
     from control c
     left join process p on p.id = c.process_id
     left join itgc_area i on i.id = c.itgc_area_id
     left join rcm_row r on r.control_id = c.id
     where c.engagement_id = $1 order by c.code`,
    [engagementId],
  );
}

export async function setDiStatus(controlId: string, userId: string, status: 'effective' | 'deficient', conclusion: string): Promise<void> {
  await assertMembreDe('control', controlId, userId, 'statuer la conception d’un contrôle');
  if (!conclusion.trim()) throw new Error('D&I conclusion required');
  const c = await q1<{ engagement_id: string; code: string }>(`select engagement_id, code from control where id = $1`, [controlId]);
  const ctx = await engagementCtx(c.engagement_id);
  await q(`update control set di_status = $2, di_conclusion = $3 where id = $1`, [controlId, status, conclusion]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'di_assessed', objectType: 'control', objectId: controlId, payload: { code: c.code, status, conclusion },
  });
}

export async function importInstances(controlId: string, csv: string, userId: string): Promise<number> {
  await assertMembreDe('control', controlId, userId, 'importer les occurrences d’un contrôle');
  const c = await q1<{ engagement_id: string; code: string; di_status: string }>(
    `select engagement_id, code, di_status from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const lines = csv.trim().split(/\r?\n/).slice(1);
  let n = 0;
  for (const line of lines) {
    const [label, occurredOn, performer] = line.split(';');
    const exists = await q01(`select id from control_instance where control_id = $1 and label = $2`, [controlId, label]);
    if (exists) continue;
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,$2,$3,$4,'listing')`,
      [controlId, label, occurredOn || null, performer || null],
    );
    n++;
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_instances_imported', objectType: 'control', objectId: controlId,
    payload: { code: c.code, instances: n },
  });
  return n;
}

// ---------- S8b: attribute sampling → evidence request → testing → deviations ----------

export async function drawAttributeSample(controlId: string, userId: string, overrideSize?: number, overrideJustification?: string): Promise<{ sampleId: string; requestId: string; selected: string[] }> {
  await assertMembreDe('control', controlId, userId, 'tirer un échantillon d’attributs');
  const c = await q1<{ id: string; engagement_id: string; code: string; name: string; frequency: Frequency; di_status: string }>(
    `select id, engagement_id, code, name, frequency, di_status from control where id = $1`,
    [controlId],
  );
  if (c.di_status !== 'effective') {
    throw new Error(`D&I gate: control ${c.code} is '${c.di_status}' — operating-effectiveness testing requires an effective design & implementation assessment first`);
  }
  const ctx = await engagementCtx(c.engagement_id);
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  if (overrideSize !== undefined && !overrideJustification?.trim()) {
    throw new Error('overriding the pack sample size requires a written justification (ADR-010)');
  }
  const size = overrideSize ?? pack.attributeSampleSizes![c.frequency];
  const instances = await q<{ id: string; label: string; occurred_on: string | null; performer_name: string | null }>(
    `select id, label, occurred_on::text, performer_name from control_instance where control_id = $1 order by label`,
    [controlId],
  );
  if (instances.length === 0) throw new Error('no instance population — import the client listing first');
  const popHash = controlPopulationHash(instances.map((i) => ({ label: i.label, occurredOn: i.occurred_on ?? undefined, performerName: i.performer_name ?? undefined })));
  const seed = `${pack.attributeSeedDefault}:${c.code}`;
  const draw = attributeDraw(instances.map((i) => i.label), size, seed, popHash);

  const procedure = await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, control_id, title, status)
     values ($1,$2,$3,'control_test',$4,$5,'in_progress') returning id`,
    [c.engagement_id, pack.id, `OE-${c.code}`, controlId, `Operating effectiveness — ${c.code} ${c.name}`],
  );
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'sampling','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, pack.id, hashObject({ size, seed }), JSON.stringify({ control: c.code, size, seed, populationHash: popHash, basis: pack.attributeSampleBasis, override: overrideJustification ?? null })],
  );
  const sample = await q1<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, rationale, status, validated_by, validated_at, engine_run_id)
     values ($1,$2,'attribute_frequency',$3,$4,$5,$6,$7,'drawn',$8, now(), $9) returning id`,
    [
      c.engagement_id, procedure.id, JSON.stringify({ size, frequency: c.frequency, override: overrideJustification ?? null }),
      seed, popHash, instances.length,
      `Frequency-based OE sample: ${c.frequency} control ⇒ ${size} instance(s). Basis: ${pack.attributeSampleBasis} Seed "${seed}" — reproducible.`,
      userId, run.id,
    ],
  );
  const byLabel = new Map(instances.map((i) => [i.label, i]));
  for (const label of draw.selected) {
    await q(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason) values ($1,'control_instance',$2,'random')`,
      [sample.id, byLabel.get(label)!.id],
    );
  }
  await q(
    `insert into control_test (control_id, procedure_id, sample_id, status) values ($1,$2,$3,'testing')`,
    [controlId, procedure.id, sample.id],
  );

  // per-sampled-instance evidence request (Gate 2 two-request flow)
  const seqRow = await q1<{ n: string }>(`select coalesce(max(seq_no),0) n from request where engagement_id = $1`, [c.engagement_id]);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, procedure_id, title, language, status)
     values ($1,$2,$3,$4,'en','draft') returning id`,
    [c.engagement_id, Number(seqRow.n) + 1, procedure.id, `Evidence — ${c.code} ${c.name} (sampled instances)`],
  );
  for (const label of draw.selected) {
    await q(
      `insert into request_item (request_id, kind, description, control_instance_id)
       values ($1,'document',$2,$3)`,
      [request.id, `Signed evidence of performance — ${c.code}, instance ${label}`, byLabel.get(label)!.id],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'attribute_sample_drawn', objectType: 'sample', objectId: sample.id,
    payload: { control: c.code, size, seed, selected: draw.selected, engineRun: run.id, requestedBy: userId },
  });
  return { sampleId: sample.id, requestId: request.id, selected: draw.selected };
}

function monthEndPlus(label: string, days: number): string {
  const m = Number(label.slice(5, 7));
  const d = new Date(Date.UTC(2025, m, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function raiseDeviation(engagementId: string, controlId: string, sampleItemId: string, attributeCode: string, taxonomy: string, description: string): Promise<boolean> {
  const existing = await q01(
    `select id from deviation where control_id = $1 and sample_item_id = $2 and taxonomy_code = $3`,
    [controlId, sampleItemId, taxonomy],
  );
  if (existing) return false;
  await q(
    `insert into deviation (engagement_id, control_id, sample_item_id, attribute_code, taxonomy_code, description)
     values ($1,$2,$3,$4,$5,$6)`,
    [engagementId, controlId, sampleItemId, attributeCode, taxonomy, description],
  );
  return true;
}

export async function runAttributeTesting(controlId: string, userId: string): Promise<{ tested: number; deviations: number; extensionRequired: boolean }> {
  await assertMembreDe('control', controlId, userId, 'conduire le test d’attributs');
  const c = await q1<{ id: string; engagement_id: string; code: string }>(
    `select id, engagement_id, code from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const test = await q1<{ id: string; sample_id: string }>(
    `select id, sample_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  const items = await q<{ id: string; unit_id: string; label: string }>(
    `select si.id, si.unit_id, ci.label from sample_item si
     join control_instance ci on ci.id = si.unit_id
     where si.sample_id = $1 order by ci.label`,
    [test.sample_id],
  );
  const attrs = await q<{ code: string; description: string; required: boolean }>(
    `select code, description, required from attribute_def where control_id = $1`,
    [controlId],
  );
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'attribute_testing','v1','pcaob-sox',$3,$4, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, hashObject(attrs), JSON.stringify({ control: c.code, items: items.length })],
  );

  let deviations = 0;
  for (const it of items) {
    const evs = await q<{ id: string }>(
      `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
       where ri.control_instance_id = $1 and e.quarantined = false`,
      [it.unit_id],
    );
    let fields: ExtractedField[] | null = null;
    for (const ev of evs) {
      const x = await latestExtraction(ev.id);
      if (x && x.status !== 'pending_verify') {
        fields = x.fields;
        break;
      }
    }
    const record = async (code: string, result: 'pass' | 'fail' | 'na', basis: 'extraction_field' | 'human', note?: string) => {
      await q(
        `insert into attribute_result (sample_item_id, attribute_code, result, basis, note)
         values ($1,$2,$3,$4,$5)
         on conflict (sample_item_id, attribute_code) do update set result = $3, basis = $4, note = $5`,
        [it.id, code, result, basis, note ?? null],
      );
    };

    if (!fields) {
      for (const a of attrs) await record(a.code, 'na', 'human', 'no evidence provided');
      if (await raiseDeviation(c.engagement_id, controlId, it.id, 'EVIDENCE', 'missing_evidence', `${c.code} instance ${it.label}: no evidence of performance could be provided.`)) deviations++;
      await q(`update sample_item set status = 'exception' where id = $1`, [it.id]);
      continue;
    }
    const get = (n: string) => fields!.find((f) => f.name === n)?.value ?? '';
    let failed = false;
    for (const a of attrs) {
      let result: 'pass' | 'fail' = 'pass';
      let note: string | undefined;
      if (a.code === 'TIMELY') {
        const preparedOn = get('preparedOn');
        const deadline = monthEndPlus(it.label, 10);
        if (!preparedOn || preparedOn > deadline) {
          result = 'fail';
          note = `prepared ${preparedOn || 'n/a'} vs deadline ${deadline}`;
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'late_performance', `${c.code} instance ${it.label}: ${note}.`)) deviations++;
        }
      } else if (a.code === 'SOD') {
        const prep = get('preparedBy');
        const appr = get('approvedBy');
        if (prep && appr && prep === appr) {
          result = 'fail';
          note = `prepared and approved by the same person (${prep})`;
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'wrong_performer', `${c.code} instance ${it.label}: ${note}.`)) deviations++;
        }
      } else if (a.code === 'APPROVAL') {
        if (!get('approvedBy')) {
          result = 'fail';
          note = 'no approval signature';
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'missing_approval', `${c.code} instance ${it.label}: approval missing.`)) deviations++;
        }
      } else if (a.code === 'REVIEW') {
        if (!get('reviewedBy')) {
          result = 'fail';
          note = 'no reviewer';
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'attribute_fail', `${c.code} instance ${it.label}: review not documented.`)) deviations++;
        }
      }
      if (result === 'fail') failed = true;
      await record(a.code, result, 'extraction_field', note);
    }
    await q(`update sample_item set status = $2 where id = $1`, [it.id, failed ? 'exception' : 'tested']);
  }
  await q(`update control_test set status = 'complete' where id = $1`, [test.id]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'attribute_testing_completed', objectType: 'control', objectId: controlId,
    payload: { control: c.code, tested: items.length, deviations, engineRun: run.id, requestedBy: userId },
  });
  // Every tested instance failed: this is not a sample result, it is the absence of a
  // control. The population must be tested in full before anything is concluded from it
  // (founder review 2026-08-25, migration 0009).
  const deviatedItems = await q1<{ n: string }>(
    `select count(distinct si.id) n from sample_item si
     join deviation d on d.sample_item_id = si.id where si.sample_id = $1`,
    [test.sample_id],
  );
  const allFailed = items.length > 0 && Number(deviatedItems.n) === items.length;
  const population = await q1<{ n: string }>(`select count(*) n from control_instance where control_id = $1`, [controlId]);
  const extensionRequired = allFailed && Number(population.n) > items.length;
  await q(
    `update control_test set status = 'complete', extension_required = $2, extension_reason = $3 where id = $1`,
    [
      test.id, extensionRequired,
      extensionRequired
        ? `${deviatedItems.n}/${items.length} instances tested show a deviation (100 %). A conclusion cannot be drawn from a sample where nothing passed: the ${population.n} instances of the population must be tested.`
        : null,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: extensionRequired ? 'control_test_extension_required' : 'control_test_completed',
    objectType: 'control_test', objectId: test.id,
    payload: { control: c.code, tested: items.length, deviations, population: Number(population.n), extensionRequired },
  });

  const sampleDeviations = await q1<{ n: string }>(
    `select count(*) n from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [test.sample_id],
  );
  return { tested: items.length, deviations: Number(sampleDeviations.n), extensionRequired };
}

export async function attributeGrid(controlId: string) {
  return q<{ label: string; attribute_code: string; result: string; note: string | null; basis: string }>(
    `select ci.label, ar.attribute_code, ar.result, ar.note, ar.basis
     from attribute_result ar
     join sample_item si on si.id = ar.sample_item_id
     join control_instance ci on ci.id = si.unit_id
     where ci.control_id = $1 order by ci.label, ar.attribute_code`,
    [controlId],
  );
}

export async function listDeviations(engagementId: string) {
  return q<{ id: string; control_code: string; instance_label: string | null; attribute_code: string; taxonomy_code: string; status: string; description: string; resolution: string | null }>(
    `select d.id, c.code control_code, ci.label instance_label, d.attribute_code, d.taxonomy_code, d.status, d.description, d.resolution
     from deviation d
     join control c on c.id = d.control_id
     left join sample_item si on si.id = d.sample_item_id
     left join control_instance ci on ci.id = si.unit_id
     where d.engagement_id = $1 order by c.code, ci.label`,
    [engagementId],
  );
}

/** What explaining a control deviation must carry (migration 0010). Same shape as an
 *  exception resolution — explanation verbatim, corroborating LINK, conclusion, author —
 *  but not the same dispositions: a control test carries no amount, so the money words do
 *  not apply. Only two outcomes take a deviation out of the count, and both are claims
 *  about evidence. A genuine deviation has neither: it stays open and counts in the rate. */
export type DeviationClosure = {
  /** The explanation received, in the client's own words. */
  explanation: string;
  /** The auditor's conclusion on that explanation. */
  conclusion: string;
  /** control_operated: evidence produced later shows the control did operate.
   *  compensating_control: a linked control covers the same assertion. */
  disposition: 'control_operated' | 'compensating_control';
  /** The evidence that shows it. A deviation cannot be explained without one. */
  evidenceId: string;
};

export async function resolveDeviation(deviationId: string, userId: string, closure: DeviationClosure): Promise<void> {
  await assertMembreDe('deviation', deviationId, userId, 'statuer une déviation');
  if (!closure.conclusion?.trim()) throw new Error('an audit conclusion on the explanation is required');
  if (!closure.explanation?.trim()) throw new Error('the explanation received is required — record it verbatim, not as a summary');
  if (!closure.evidenceId) {
    throw new Error(
      'a control deviation cannot be explained away on an explanation alone: link the evidence that shows the control operated, or the compensating control (NEP 500)',
    );
  }
  const d = await q1<{ engagement_id: string }>(`select engagement_id from deviation where id = $1`, [deviationId]);
  const ctx = await engagementCtx(d.engagement_id);
  const ev = await q1<{ quarantined: boolean }>(`select quarantined from evidence where id = $1`, [closure.evidenceId]);
  if (ev.quarantined) throw new Error('quarantined evidence cannot corroborate a deviation closure');
  await q(
    `update deviation set status = 'explained', resolution = $2, client_explanation = $3,
            disposition = $4, corroboration_evidence_id = $5, resolved_by = $6, resolved_at = now()
     where id = $1`,
    [deviationId, closure.conclusion, closure.explanation, closure.disposition, closure.evidenceId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deviation_explained', objectType: 'deviation', objectId: deviationId,
    payload: {
      resolution: closure.conclusion,
      disposition: closure.disposition,
      corroboration_evidence_id: closure.evidenceId,
      explanation: closure.explanation.slice(0, 500),
    },
  });
}

/** Test the whole population after a 100 % deviation rate. Draws every instance as a new,
 *  full-coverage test rather than editing the first one — both remain in the file, and the
 *  conclusion is drawn from the extended test. */
export async function extendToFullPopulation(
  controlId: string,
  userId: string,
  reason: string,
): Promise<{ sampleId: string; requestId: string; selected: string[] }> {
  await assertMembreDe('control', controlId, userId, 'étendre un test à la population complète');
  const test = await q01<{ id: string; extension_required: boolean }>(
    `select id, extension_required from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  if (!test?.extension_required) throw new Error('no extension is required on the latest test of this control');
  const population = await q1<{ n: string }>(`select count(*) n from control_instance where control_id = $1`, [controlId]);
  return drawAttributeSample(controlId, userId, Number(population.n), reason);
}

/** A human may decide the extension is unnecessary — with a reason, on the record. */
export async function waiveExtension(controlId: string, userId: string, reason: string): Promise<void> {
  await assertMembreDe('control', controlId, userId, 'renoncer à l’extension d’un test');
  if (!reason.trim()) throw new Error('waiving a required population extension needs a documented reason');
  const test = await q1<{ id: string; control_id: string }>(
    `select id, control_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  const c = await q1<{ engagement_id: string; code: string }>(`select engagement_id, code from control where id = $1`, [controlId]);
  const ctx = await engagementCtx(c.engagement_id);
  await q(
    `update control_test set extension_waived_by = $2, extension_waiver_reason = $3 where id = $1`,
    [test.id, userId, reason],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_test_extension_waived', objectType: 'control_test', objectId: test.id,
    payload: { control: c.code, reason },
  });
}

/** Blocks anything that would conclude from a test whose extension is still outstanding. */
export async function assertNoOutstandingExtension(controlId: string): Promise<void> {
  const test = await q01<{ extension_required: boolean; extension_reason: string | null; extension_waived_by: string | null }>(
    `select extension_required, extension_reason, extension_waived_by from control_test
     where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  if (test?.extension_required && !test.extension_waived_by) {
    throw new Error(`population extension outstanding — ${test.extension_reason ?? 'test the full population before concluding'}`);
  }
}

// ---------- deficiency ladder (L3) + aggregation ----------

export async function proposeDeficiency(
  controlId: string,
  userId: string,
  inputs: { magnitudeExposureCents: number; compensatingControl: boolean; magnitudeBasis: string },
): Promise<string> {
  await assertMembreDe('control', controlId, userId, 'proposer une déficience');
  // The exposure is the number that decides severity, so it may not be an assertion:
  // where it comes from is stored next to it (migration 0009).
  if (!inputs.magnitudeBasis?.trim()) {
    throw new Error('state where the magnitude exposure comes from — a severity proposal may not rest on an unexplained number');
  }
  const c = await q1<{ id: string; engagement_id: string; code: string; name: string; is_key: boolean }>(
    `select id, engagement_id, code, name, is_key from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  const thresholds = await validatedThresholds(c.engagement_id);
  if (!thresholds) throw new Error('validated materiality required (ICFR materiality = FS materiality)');
  await assertNoOutstandingExtension(controlId);
  // counts come from the LATEST test only: after an extension, the rate is 3/12, not 3/15
  const latest = await q1<{ sample_id: string }>(
    `select sample_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  // the deviation RATE is deviating instances over instances tested — one month that fails
  // three attributes is one month that failed, not three
  const devCount = await q1<{ n: string }>(
    `select count(distinct si.id) n from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [latest.sample_id],
  );
  const sampleSize = await q1<{ n: string }>(`select count(*) n from sample_item where sample_id = $1`, [latest.sample_id]);
  const natures = await q<{ taxonomy_code: string }>(
    `select distinct d.taxonomy_code from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [latest.sample_id],
  );
  const proposal = proposeDeficiencySeverity({
    deviationsCount: Number(devCount.n),
    sampleSize: Number(sampleSize.n),
    isKeyControl: c.is_key,
    compensatingControl: inputs.compensatingControl,
    magnitudeExposureCents: inputs.magnitudeExposureCents,
    materialityCents: thresholds.materialityCents,
    ladder: pack.deficiencyLadder!,
    deviationNatures: natures.map((n) => n.taxonomy_code as DeviationNature),
  });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'deficiency_rules','v2',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, pack.id, hashObject(pack.deficiencyLadder), JSON.stringify(proposal.basis)],
  );
  const narrative =
    `Operating deviations were identified in the OE sample for ${c.code} (${c.name}): ${devCount.n} deviation(s) over ${sampleSize.n} instance(s) tested ` +
    `(deviation rate ${(proposal.basis.deviationRate * 100).toFixed(0)} %)` +
    (proposal.basis.severeNatures.length ? `, including ${proposal.basis.severeNatures.join(' and ')}` : '') + '. ' +
    `Rules-based severity proposal: ${proposal.severity.replace(/_/g, ' ')} — ${proposal.basis.rule}. ` +
    `Magnitude exposure considered: ${centsToNum(inputs.magnitudeExposureCents)} € vs materiality ${centsToNum(thresholds.materialityCents)} € ` +
    `(significant threshold ${centsToNum(proposal.basis.thresholds.significantCents)} €). Basis for that exposure: ${inputs.magnitudeBasis} ` +
    (proposal.populationExtensionRequired
      ? 'Every tested instance failed: the sample no longer supports a conclusion about the population — the full population must be tested before concluding. '
      : '') +
    'Human decision required (L3).';
  const row = await q1<{ id: string }>(
    `insert into deficiency (engagement_id, control_id, severity_proposed, basis, narrative, status, engine_run_id, magnitude_basis)
     values ($1,$2,$3,$4,$5,'proposed',$6,$7) returning id`,
    [c.engagement_id, controlId, proposal.severity, JSON.stringify(proposal.basis), narrative, run.id, inputs.magnitudeBasis],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'deficiency_proposed', objectType: 'deficiency', objectId: row.id,
    payload: {
      control: c.code, severity: proposal.severity, deviationRate: proposal.basis.deviationRate,
      severeNatures: proposal.basis.severeNatures, extensionRequired: proposal.populationExtensionRequired,
      engineRun: run.id, requestedBy: userId,
    },
  });
  return row.id;
}

const SEVERITY_RANK = { deficiency: 0, significant_deficiency: 1, material_weakness: 2 } as const;

export async function decideDeficiency(
  deficiencyId: string,
  userId: string,
  severity: 'deficiency' | 'significant_deficiency' | 'material_weakness',
  rationale?: string,
): Promise<void> {
  await assertMembreDe('deficiency', deficiencyId, userId, 'statuer une déficience');
  const d = await q1<{ engagement_id: string; severity_proposed: keyof typeof SEVERITY_RANK; narrative: string }>(
    `select engagement_id, severity_proposed, narrative from deficiency where id = $1`,
    [deficiencyId],
  );
  // The engine's proposal may be argued down, never silently: reducing severity below what
  // the rules proposed is the decision an inspector will ask about, so it carries a reason.
  const isReduction = SEVERITY_RANK[severity] < SEVERITY_RANK[d.severity_proposed];
  if (isReduction && !rationale?.trim()) {
    throw new Error(
      `reducing the proposed severity (${d.severity_proposed} → ${severity}) requires a documented rationale`,
    );
  }
  const ctx = await engagementCtx(d.engagement_id);
  await q(
    `update deficiency set severity_final = $2, status = 'confirmed', decided_by = $3, decided_at = now(),
            narrative = case when $4::text is null then narrative else narrative || ' — Décision humaine : ' || $4 end
     where id = $1`,
    [deficiencyId, severity, userId, rationale?.trim() ? rationale.trim() : null],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deficiency_decided', objectType: 'deficiency', objectId: deficiencyId,
    payload: { severity, proposed: d.severity_proposed, reduction: isReduction, rationale: rationale ?? null },
  });
}

export async function listDeficiencies(engagementId: string) {
  return q<{ id: string; control_code: string; control_name: string; severity_proposed: string; severity_final: string | null; status: string; narrative: string; basis: Record<string, unknown> }>(
    `select d.id, c.code control_code, c.name control_name, d.severity_proposed, d.severity_final, d.status, d.narrative, d.basis
     from deficiency d join control c on c.id = d.control_id
     where d.engagement_id = $1
     order by case coalesce(d.severity_final, d.severity_proposed)
       when 'material_weakness' then 0 when 'significant_deficiency' then 1 else 2 end`,
    [engagementId],
  );
}
