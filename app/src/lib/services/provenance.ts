import { q, q01 } from '@/lib/db/client';
import { numeroDemande } from './requests';
import { verifyChain } from '@/lib/core/events';

// S9 — the three provenance questions (P7), answered by walking STORED links.
// Nothing is recomputed at question time (docs/03 §5).

export interface ProvenanceNode {
  kind: string;
  label: string;
  detail?: string;
  href?: string;
}

/** "Why does this evidence exist?" evidence → request item → sample item / control
 *  instance → sample → procedure → risk/FSLI or control → process. */
export async function whyEvidenceExists(engagementId: string, evidenceId: string): Promise<ProvenanceNode[]> {
  const ev = await q01<{
    id: string; filename: string; doc_type: string | null; source: string; sha256: string; created_at: string;
    request_item_id: string | null; uploaded_by_kind: string;
  }>(
    `select id, filename, doc_type, source, sha256, created_at::text, request_item_id, uploaded_by_kind
     from evidence where id = $1 and engagement_id = $2`,
    [evidenceId, engagementId],
  );
  if (!ev) return [];
  const chain: ProvenanceNode[] = [
    { kind: 'evidence', label: ev.filename, detail: `${ev.doc_type ?? 'unclassified'} · received ${ev.created_at.slice(0, 16)} via ${ev.source} · sha256 ${ev.sha256.slice(0, 12)}…` },
  ];
  if (!ev.request_item_id) {
    chain.push({ kind: 'note', label: 'Auditor-provided evidence (no client request)' });
    return chain;
  }
  const item = await q01<{
    id: string; description: string; kind: string; request_id: string; sample_item_id: string | null; control_instance_id: string | null;
    seq_no: number; title: string; sent_at: string | null; procedure_id: string | null;
  }>(
    `select i.id, i.description, i.kind, i.request_id, i.sample_item_id, i.control_instance_id,
            r.seq_no, r.title, r.sent_at::text, r.procedure_id
     from request_item i join request r on r.id = i.request_id where i.id = $1`,
    [ev.request_item_id],
  );
  if (!item) return chain;
  chain.push({
    kind: 'request',
    label: `${numeroDemande(item.seq_no)} — ${item.title}`,
    detail: `item: ${item.description}${item.sent_at ? ` · sent ${item.sent_at.slice(0, 16)}` : ''}`,
    href: `/eng/${engagementId}/requests/${item.request_id}`,
  });

  if (item.sample_item_id) {
    const si = await q01<{
      id: string; selection_reason: string; amount: string; natural_key: string; entry_no: string; entry_date: string;
      account_no: string; sample_id: string; seed: string; method: string; population_size: number; rationale: string | null;
      procedure_title: string; fsli_code: string | null; procedure_id: string;
    }>(
      `select si.id, si.selection_reason, si.amount::text, g.natural_key, g.entry_no, g.entry_date::text,
              g.account_no, s.id sample_id, s.seed, s.method, s.population_size, s.rationale,
              p.title procedure_title, p.fsli_code, p.id procedure_id
       from sample_item si
       join gl_entry g on g.id = si.unit_id
       join sample s on s.id = si.sample_id
       join procedure_instance p on p.id = s.procedure_id
       where si.id = $1`,
      [item.sample_item_id],
    );
    if (si) {
      chain.push({ kind: 'sample_item', label: `Sampled GL line ${si.entry_no} (${si.account_no}, ${si.entry_date})`, detail: `selected as ${si.selection_reason} · ${si.amount} €` });
      chain.push({ kind: 'sample', label: `Sample ${si.method}`, detail: `population ${si.population_size} · seed ${si.seed} — ${si.rationale?.slice(0, 160) ?? ''}`, href: `/eng/${engagementId}/sampling` });
      chain.push({ kind: 'procedure', label: si.procedure_title, detail: si.fsli_code ? `FSLI ${si.fsli_code}` : undefined });
      const risks = await q<{ assertion: string; level: string; description: string }>(
        `select assertion, level, description from risk where engagement_id = $1 and fsli_code = $2`,
        [engagementId, si.fsli_code],
      );
      for (const r of risks) chain.push({ kind: 'risk', label: `Risk: ${r.assertion} (${r.level})`, detail: r.description });
    }
  } else if (item.control_instance_id) {
    const ci = await q01<{ label: string; control_code: string; control_name: string; process_name: string | null; risk_desc: string | null; control_id: string }>(
      `select ci.label, c.code control_code, c.name control_name, p.name process_name, r.risk_desc, c.id control_id
       from control_instance ci join control c on c.id = ci.control_id
       left join process p on p.id = c.process_id
       left join rcm_row r on r.control_id = c.id
       where ci.id = $1`,
      [item.control_instance_id],
    );
    if (ci) {
      chain.push({ kind: 'control_instance', label: `Control instance ${ci.label}`, detail: `${ci.control_code} — ${ci.control_name}` });
      chain.push({ kind: 'control', label: `${ci.control_code} ${ci.control_name}`, detail: ci.process_name ?? undefined, href: `/eng/${engagementId}/rcm/${ci.control_id}` });
      if (ci.risk_desc) chain.push({ kind: 'risk', label: 'Risk addressed', detail: ci.risk_desc });
    }
  } else {
    chain.push({ kind: 'note', label: 'Standing (procedure-level) request item — not tied to a single tested unit' });
  }
  return chain;
}

/** "What supports this conclusion?" workpaper → linked facts → evidence + extractions. */
export async function whatSupportsConclusion(engagementId: string, workpaperId: string) {
  const wp = await q01<{ id: string; code: string; title: string; status: string; version: number; engine_run_id: string | null; based_on_hash: string | null; procedure_id: string | null; control_test_id: string | null }>(
    `select id, code, title, status, version, engine_run_id, based_on_hash, procedure_id, control_test_id
     from workpaper where id = $1 and engagement_id = $2`,
    [workpaperId, engagementId],
  );
  if (!wp) return null;
  const run = wp.engine_run_id
    ? await q01<{ engine: string; engine_version: string; pack_id: string | null; params: unknown; finished_at: string | null }>(
        `select engine, engine_version, pack_id, params, finished_at::text from engine_run where id = $1`,
        [wp.engine_run_id],
      )
    : null;
  const signoffs = await q<{ sign_role: string; signed_at: string; user_name: string }>(
    `select s.sign_role, s.signed_at::text, u.name user_name from signoff s join app_user u on u.id = s.user_id
     where s.workpaper_id = $1 order by s.signed_at`,
    [workpaperId],
  );
  const edits = await q<{ section: string; justification: string; edited_at: string; user_name: string }>(
    `select e.section, e.justification, e.edited_at::text, u.name user_name from workpaper_edit e
     join app_user u on u.id = e.user_id where e.workpaper_id = $1`,
    [workpaperId],
  );
  const evidence = wp.procedure_id
    ? await q<{ id: string; filename: string; sha256: string; doc_type: string | null; rung: string | null; verified_by: string | null }>(
        `select distinct e.id, e.filename, e.sha256, e.doc_type,
                (select x.rung from extraction x where x.evidence_id = e.id order by x.created_at desc limit 1) rung,
                (select x.verified_by from extraction x where x.evidence_id = e.id order by x.created_at desc limit 1) verified_by
         from evidence e
         join request_item ri on ri.id = e.request_item_id
         join request r on r.id = ri.request_id
         where r.procedure_id = $1`,
        [wp.procedure_id],
      )
    : [];
  const aiRuns = await q<{ purpose: string; adapter: string; model: string; created_at: string; tokens_in: number; tokens_out: number }>(
    `select purpose, adapter, model, created_at::text, tokens_in, tokens_out from ai_run where engagement_id = $1 order by created_at`,
    [engagementId],
  );
  const exceptions = await q<{ taxonomy_code: string; status: string; description: string; resolution: string | null }>(
    `select taxonomy_code, status, description, resolution from exception where engagement_id = $1`,
    [engagementId],
  );
  return { wp, run, signoffs, edits, evidence, aiRuns, exceptions };
}

/** "Where did this figure come from?" — resolve a rendered number to its source. */
export async function whereFigureFrom(engagementId: string, sampleItemId: string) {
  const item = await q01<{
    id: string; amount: string; natural_key: string; entry_no: string; entry_date: string; account_no: string;
    piece_ref: string | null; aux_label: string | null; debit: string; credit: string; import_filename: string;
  }>(
    `select si.id, si.amount::text, g.natural_key, g.entry_no, g.entry_date::text, g.account_no,
            g.piece_ref, g.aux_label, g.debit::text, g.credit::text, f.filename import_filename
     from sample_item si join gl_entry g on g.id = si.unit_id
     join import_file f on f.id = g.import_file_id
     where si.id = $1`,
    [sampleItemId],
  );
  if (!item) return null;
  const extractions = await q<{ filename: string; rung: string; fields: { name: string; value: string; confidence: number }[]; verified_by: string | null; sha256: string }>(
    `select e.filename, x.rung, x.fields, x.verified_by, e.sha256
     from evidence e join extraction x on x.evidence_id = e.id
     join request_item ri on ri.id = e.request_item_id
     where ri.sample_item_id = $1`,
    [sampleItemId],
  );
  const match = await q01<{ status: string; checks: { check: string; expected: string; found: string; pass: boolean }[] }>(
    `select status, checks from match where sample_item_id = $1`,
    [sampleItemId],
  );
  void engagementId;
  return { item, extractions, match };
}

export async function eventLog(engagementId: string, filters: { verb?: string; objectType?: string; actorKind?: string } = {}) {
  const rows = await q<{ id: number; verb: string; object_type: string; object_id: string | null; actor_kind: string; actor_name: string | null; payload: Record<string, unknown>; created_at: string; hash: string }>(
    `select l.id, l.verb, l.object_type, l.object_id, l.actor_kind, u.name actor_name, l.payload, l.created_at::text, l.hash
     from event_log l left join app_user u on u.id = l.actor_id
     where l.engagement_id = $1
       and ($2::text is null or l.verb = $2)
       and ($3::text is null or l.object_type = $3)
       and ($4::text is null or l.actor_kind = $4)
     order by l.id desc limit 500`,
    [engagementId, filters.verb ?? null, filters.objectType ?? null, filters.actorKind ?? null],
  );
  return rows;
}

export async function chainStatus(tenantId: string, engagementId: string) {
  return verifyChain(tenantId, engagementId);
}

export async function eventVerbs(engagementId: string) {
  return q<{ verb: string; n: string }>(
    `select verb, count(*) n from event_log where engagement_id = $1 group by verb order by verb`,
    [engagementId],
  );
}
