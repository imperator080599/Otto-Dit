import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { now, DAY_MS } from '@/lib/core/clock';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';

// S4 request engine: PBC generation from the sample (per-tested-unit items) + standing
// items; L2 send gate; statuses; lazy reminder cadence (Q8) against the demo clock.

export async function nextSeq(engagementId: string): Promise<number> {
  const r = await q1<{ n: string }>(`select coalesce(max(seq_no), 0) n from request where engagement_id = $1`, [engagementId]);
  return Number(r.n) + 1;
}

/** Generate the PBC request from a drawn sample (draft — auditor approves send, L2). */
export async function generatePbcFromSample(engagementId: string, sampleId: string, userId: string): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const sample = await q1<{ id: string; procedure_id: string }>(`select id, procedure_id from sample where id = $1 and status = 'drawn'`, [sampleId]);
  const items = await q<{
    id: string; selection_reason: string; amount: string; natural_key: string; entry_no: string;
    journal_code: string; account_no: string; piece_ref: string | null; aux_label: string | null; entry_date: string;
  }>(
    `select si.id, si.selection_reason, si.amount::text, g.natural_key, g.entry_no, g.journal_code,
            g.account_no, g.piece_ref, g.aux_label, g.entry_date::text
     from sample_item si join gl_entry g on g.id = si.unit_id where si.sample_id = $1`,
    [sample.id],
  );
  const seq = await nextSeq(engagementId);
  const due = new Date((await now()).getTime() + 10 * DAY_MS).toISOString().slice(0, 10);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, procedure_id, title, language, status, due_date)
     values ($1,$2,$3,$4,$5,'draft',$6) returning id`,
    [
      engagementId, seq, sample.procedure_id,
      fr ? `Justificatifs — contrôle du chiffre d'affaires (sélection)` : 'Supporting documents — revenue testing (selection)',
      fs.language, due,
    ],
  );
  for (const it of items) {
    const isCreditNote = it.piece_ref?.toUpperCase().startsWith('AV') || it.account_no.startsWith('709');
    const isManualJe = it.journal_code === 'OD';
    const isGoods = it.account_no.startsWith('701');
    if (isManualJe) {
      await q(
        `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'explanation',$2,$3)`,
        [request.id, fr
          ? `Explication de l'écriture manuelle ${it.entry_no} du ${it.entry_date} (${it.amount} € — pièce ${it.piece_ref ?? '—'}) : nature, justification et documentation à l'appui.`
          : `Explanation of manual entry ${it.entry_no} dated ${it.entry_date} (${it.amount} €).`, it.id],
      );
      continue;
    }
    await q(
      `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
      [request.id, fr
        ? `${isCreditNote ? 'Avoir' : 'Facture de vente'} ${it.piece_ref ?? it.entry_no} — ${it.aux_label ?? ''} (${it.amount} €)`
        : `${isCreditNote ? 'Credit note' : 'Sales invoice'} ${it.piece_ref ?? it.entry_no} — ${it.aux_label ?? ''} (${it.amount} €)`, it.id],
    );
    if (isGoods && !isCreditNote) {
      await q(
        `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
        [request.id, fr
          ? `Bon de livraison associé à la facture ${it.piece_ref ?? it.entry_no}`
          : `Delivery note for invoice ${it.piece_ref ?? it.entry_no}`, it.id],
      );
    }
  }
  // standing items (procedure-level, Gate 2): bank statements supporting the period
  for (const label of fr
    ? ['Relevé bancaire 512100 — novembre 2025', 'Relevé bancaire 512100 — décembre 2025']
    : ['Bank statement 512100 — November 2025', 'Bank statement 512100 — December 2025']) {
    await q(`insert into request_item (request_id, kind, description) values ($1,'document',$2)`, [request.id, label]);
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'request_generated', objectType: 'request', objectId: request.id,
    payload: { seq, items: items.length, requestedBy: userId },
  });
  return request.id;
}

export async function approveSend(requestId: string, userId: string): Promise<void> {
  const r = await q1<{ id: string; engagement_id: string; status: string; seq_no: number }>(
    `select id, engagement_id, status, seq_no from request where id = $1`,
    [requestId],
  );
  if (r.status !== 'draft' && r.status !== 'reopened') throw new Error('only draft/reopened requests can be sent');
  const ctx = await engagementCtx(r.engagement_id);
  const ts = await now();
  await q(`update request set status = 'sent', sent_at = $2, approved_by = $3 where id = $1`, [requestId, ts.toISOString(), userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'request_sent', objectType: 'request', objectId: requestId,
    payload: { seq: r.seq_no },
  });
}

/** Lazy reminder materialization (Q8: due+3 business days, then weekly; pausable). */
export async function ensureReminders(engagementId: string): Promise<void> {
  const ts = await now();
  const requests = await q<{ id: string; sent_at: string | null; due_date: string | null; status: string }>(
    `select id, sent_at::text, due_date::text, status from request
     where engagement_id = $1 and status in ('sent','partially_submitted')`,
    [engagementId],
  );
  for (const r of requests) {
    if (!r.sent_at) continue;
    const paused = await q01<{ id: string }>(`select id from reminder where request_id = $1 and status = 'paused'`, [r.id]);
    if (paused) continue;
    const base = r.due_date ? Date.parse(r.due_date) : Date.parse(r.sent_at);
    const first = base + 3 * DAY_MS;
    const existing = await q<{ scheduled_for: string }>(
      `select scheduled_for::text from reminder where request_id = $1 order by scheduled_for`,
      [r.id],
    );
    const lastScheduled = existing.length ? Date.parse(existing[existing.length - 1].scheduled_for) : null;
    let next = lastScheduled === null ? first : lastScheduled + 7 * DAY_MS;
    while (next <= ts.getTime()) {
      await q(
        `insert into reminder (request_id, scheduled_for, sent_at, channel, status) values ($1,$2,$3,'portal','sent')`,
        [r.id, new Date(next).toISOString(), ts.toISOString()],
      );
      next += 7 * DAY_MS;
    }
  }
}

export async function pauseReminders(requestId: string, userId: string): Promise<void> {
  const r = await q1<{ engagement_id: string }>(`select engagement_id from request where id = $1`, [requestId]);
  const ctx = await engagementCtx(r.engagement_id);
  await q(`insert into reminder (request_id, scheduled_for, channel, status) values ($1, now(), 'portal', 'paused')`, [requestId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'reminders_paused', objectType: 'request', objectId: requestId, payload: {},
  });
}

export async function listRequests(engagementId: string) {
  return q<{ id: string; seq_no: number; title: string; status: string; due_date: string | null; sent_at: string | null; item_count: string; done_count: string; reminder_count: string }>(
    `select r.id, r.seq_no, r.title, r.status, r.due_date::text, r.sent_at::text,
            (select count(*) from request_item i where i.request_id = r.id) item_count,
            (select count(*) from request_item i where i.request_id = r.id and i.status in ('uploaded','complete','na')) done_count,
            (select count(*) from reminder m where m.request_id = r.id and m.status = 'sent') reminder_count
     from request r where r.engagement_id = $1 order by r.seq_no`,
    [engagementId],
  );
}

export async function requestDetail(requestId: string) {
  const request = await q01<{ id: string; engagement_id: string; seq_no: number; title: string; status: string; due_date: string | null; sent_at: string | null; language: string }>(
    `select id, engagement_id, seq_no, title, status, due_date::text, sent_at::text, language from request where id = $1`,
    [requestId],
  );
  if (!request) return null;
  const items = await q<{ id: string; kind: string; description: string; status: string; client_note: string | null; sample_item_id: string | null; control_instance_id: string | null; evidence_count: string }>(
    `select i.id, i.kind, i.description, i.status, i.client_note, i.sample_item_id, i.control_instance_id,
            (select count(*) from evidence e where e.request_item_id = i.id) evidence_count
     from request_item i where i.request_id = $1 order by i.created_at`,
    [requestId],
  );
  const reminders = await q<{ scheduled_for: string; sent_at: string | null; status: string }>(
    `select scheduled_for::text, sent_at::text, status from reminder where request_id = $1 order by scheduled_for`,
    [requestId],
  );
  return { request, items, reminders };
}
