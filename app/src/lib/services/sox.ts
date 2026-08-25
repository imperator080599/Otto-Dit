import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { controlPopulationHash } from '@/lib/kernel/canon';
import { attributeDraw } from '@/lib/kernel/sampling';
import { proposeDeficiencySeverity } from '@/lib/kernel/deficiency';
import { primaryPack } from '@/lib/packs';
import type { Frequency } from '@/lib/packs/types';
import { centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { validatedThresholds } from './materiality';
import { latestExtraction } from './extraction/ladder';
import type { ExtractedField } from './extraction/fields';

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

export async function runAttributeTesting(controlId: string, userId: string): Promise<{ tested: number; deviations: number }> {
  const c = await q1<{ id: string; engagement_id: string; code: string }>(
    `select id, engagement_id, code from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const test = await q1<{ id: string; sample_id: string }>(
    `select id, sample_id from control_test where control_id = $1 order by id desc limit 1`,
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
  return { tested: items.length, deviations };
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

export async function resolveDeviation(deviationId: string, userId: string, resolution: string): Promise<void> {
  if (!resolution.trim()) throw new Error('resolution required');
  const d = await q1<{ engagement_id: string }>(`select engagement_id from deviation where id = $1`, [deviationId]);
  const ctx = await engagementCtx(d.engagement_id);
  await q(
    `update deviation set status = 'explained', resolution = $2, resolved_by = $3, resolved_at = now() where id = $1`,
    [deviationId, resolution, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deviation_explained', objectType: 'deviation', objectId: deviationId, payload: { resolution },
  });
}

// ---------- deficiency ladder (L3) + aggregation ----------

export async function proposeDeficiency(controlId: string, userId: string, inputs: { magnitudeExposureCents: number; compensatingControl: boolean }): Promise<string> {
  const c = await q1<{ id: string; engagement_id: string; code: string; name: string; is_key: boolean }>(
    `select id, engagement_id, code, name, is_key from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  const thresholds = await validatedThresholds(c.engagement_id);
  if (!thresholds) throw new Error('validated materiality required (ICFR materiality = FS materiality)');
  const devCount = await q1<{ n: string }>(`select count(*) n from deviation where control_id = $1`, [controlId]);
  const sampleSize = await q1<{ n: string }>(
    `select count(*) n from sample_item si join sample s on s.id = si.sample_id
     join control_test ct on ct.sample_id = s.id where ct.control_id = $1`,
    [controlId],
  );
  const proposal = proposeDeficiencySeverity({
    deviationsCount: Number(devCount.n),
    sampleSize: Number(sampleSize.n),
    isKeyControl: c.is_key,
    compensatingControl: inputs.compensatingControl,
    magnitudeExposureCents: inputs.magnitudeExposureCents,
    materialityCents: thresholds.materialityCents,
    ladder: pack.deficiencyLadder!,
  });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'deficiency_rules','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, pack.id, hashObject(pack.deficiencyLadder), JSON.stringify(proposal.basis)],
  );
  const narrative =
    `Operating deviations were identified in the OE sample for ${c.code} (${c.name}): ${devCount.n} deviation(s) over ${sampleSize.n} instance(s) tested. ` +
    `Rules-based severity proposal: ${proposal.severity.replace(/_/g, ' ')} — ${proposal.basis.rule}. ` +
    `Magnitude exposure considered: ${centsToNum(inputs.magnitudeExposureCents)} € vs materiality ${centsToNum(thresholds.materialityCents)} € ` +
    `(significant threshold ${centsToNum(proposal.basis.thresholds.significantCents)} €). Human decision required (L3).`;
  const row = await q1<{ id: string }>(
    `insert into deficiency (engagement_id, control_id, severity_proposed, basis, narrative, status, engine_run_id)
     values ($1,$2,$3,$4,$5,'proposed',$6) returning id`,
    [c.engagement_id, controlId, proposal.severity, JSON.stringify(proposal.basis), narrative, run.id],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'deficiency_proposed', objectType: 'deficiency', objectId: row.id,
    payload: { control: c.code, severity: proposal.severity, engineRun: run.id, requestedBy: userId },
  });
  return row.id;
}

export async function decideDeficiency(deficiencyId: string, userId: string, severity: 'deficiency' | 'significant_deficiency' | 'material_weakness'): Promise<void> {
  const d = await q1<{ engagement_id: string }>(`select engagement_id from deficiency where id = $1`, [deficiencyId]);
  const ctx = await engagementCtx(d.engagement_id);
  await q(
    `update deficiency set severity_final = $2, status = 'confirmed', decided_by = $3, decided_at = now() where id = $1`,
    [deficiencyId, severity, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deficiency_decided', objectType: 'deficiency', objectId: deficiencyId, payload: { severity },
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
