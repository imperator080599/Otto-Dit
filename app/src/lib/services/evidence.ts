import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { saveBlob } from '@/lib/core/storage';
import { engagementCtx } from './imports';

// S4 evidence engine: intake with provenance; sha256 dedupe FLAGS duplicates (a duplicate
// invoice is audit information, never merged); quarantine is a structural/manual flag
// (Gate 2: no injection-classifier claims). Classification happens in S5.

export interface UploadedBy {
  kind: 'client_contact' | 'app_user' | 'system';
  id: string | null;
}

export async function ingestEvidence(opts: {
  engagementId: string;
  requestItemId?: string | null;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  source: 'portal' | 'email' | 'auditor';
  uploadedBy: UploadedBy;
  audience?: 'client_provided' | 'internal';
}): Promise<{ evidenceId: string; duplicateOf: string | null }> {
  const ctx = await engagementCtx(opts.engagementId);
  const blob = saveBlob(opts.bytes);
  const dup = await q01<{ id: string }>(
    `select id from evidence where engagement_id = $1 and sha256 = $2 order by created_at limit 1`,
    [opts.engagementId, blob.sha256],
  );
  const row = await q1<{ id: string }>(
    `insert into evidence (engagement_id, request_item_id, filename, mime, sha256, size_bytes,
       storage_path, source, audience, uploaded_by_kind, uploaded_by_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      opts.engagementId, opts.requestItemId ?? null, opts.filename, opts.mime, blob.sha256,
      blob.size, blob.storagePath, opts.source, opts.audience ?? 'client_provided',
      opts.uploadedBy.kind, opts.uploadedBy.id,
    ],
  );
  if (opts.requestItemId) {
    await q(`update request_item set status = 'uploaded' where id = $1 and status = 'pending'`, [opts.requestItemId]);
    await refreshRequestStatus(opts.requestItemId);
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: opts.engagementId,
    actorKind: opts.uploadedBy.kind === 'app_user' ? 'user' : 'system',
    actorId: opts.uploadedBy.kind === 'app_user' ? opts.uploadedBy.id : null,
    verb: 'evidence_received',
    objectType: 'evidence',
    objectId: row.id,
    payload: { filename: opts.filename, sha256: blob.sha256, source: opts.source, duplicateOf: dup?.id ?? null, uploadedBy: opts.uploadedBy },
  });
  return { evidenceId: row.id, duplicateOf: dup?.id ?? null };
}

async function refreshRequestStatus(requestItemId: string): Promise<void> {
  const item = await q1<{ request_id: string }>(`select request_id from request_item where id = $1`, [requestItemId]);
  const counts = await q1<{ total: string; pending: string }>(
    `select count(*) total, count(*) filter (where status = 'pending') pending
     from request_item where request_id = $1`,
    [item.request_id],
  );
  if (Number(counts.pending) < Number(counts.total)) {
    await q(
      `update request set status = 'partially_submitted' where id = $1 and status = 'sent'`,
      [item.request_id],
    );
  }
}

/** Client marks a request as fully submitted; items with uploads flip to complete. */
export async function markAllSubmitted(requestId: string, contactId: string): Promise<void> {
  const r = await q1<{ id: string; engagement_id: string }>(`select id, engagement_id from request where id = $1`, [requestId]);
  const ctx = await engagementCtx(r.engagement_id);
  await q(`update request_item set status = 'complete' where request_id = $1 and status = 'uploaded'`, [requestId]);
  const remaining = await q1<{ n: string }>(
    `select count(*) n from request_item where request_id = $1 and status = 'pending'`,
    [requestId],
  );
  await q(
    `update request set status = $2 where id = $1`,
    [requestId, Number(remaining.n) === 0 ? 'submitted' : 'partially_submitted'],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'system', actorId: null,
    verb: 'request_marked_submitted', objectType: 'request', objectId: requestId,
    payload: { byContact: contactId, remainingPending: Number(remaining.n) },
  });
}

export async function answerExplanation(requestItemId: string, contactId: string, text: string): Promise<void> {
  if (!text.trim()) throw new Error('empty answer');
  const item = await q1<{ id: string; request_id: string }>(`select id, request_id from request_item where id = $1`, [requestItemId]);
  const r = await q1<{ engagement_id: string }>(`select engagement_id from request where id = $1`, [item.request_id]);
  const ctx = await engagementCtx(r.engagement_id);
  await q(`update request_item set client_note = $2, status = 'complete' where id = $1`, [requestItemId, text]);
  await refreshRequestStatus(requestItemId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'system', actorId: null,
    verb: 'explanation_answered', objectType: 'request_item', objectId: requestItemId,
    payload: { byContact: contactId, length: text.length },
  });
}

export async function listEvidence(engagementId: string) {
  return q<{
    id: string; filename: string; mime: string; sha256: string; source: string; doc_type: string | null;
    class_confidence: number | null; quarantined: boolean; created_at: string; request_item_id: string | null;
    item_description: string | null; request_seq: number | null; dup_count: string;
  }>(
    `select e.id, e.filename, e.mime, e.sha256, e.source, e.doc_type, e.class_confidence::float,
            e.quarantined, e.created_at::text, e.request_item_id,
            i.description item_description, r.seq_no request_seq,
            (select count(*) from evidence d where d.engagement_id = e.engagement_id and d.sha256 = e.sha256) dup_count
     from evidence e
     left join request_item i on i.id = e.request_item_id
     left join request r on r.id = i.request_id
     where e.engagement_id = $1 and e.audience = 'client_provided'
     order by e.created_at desc`,
    [engagementId],
  );
}

export async function setQuarantine(evidenceId: string, userId: string, reason: string | null): Promise<void> {
  const e = await q1<{ engagement_id: string }>(`select engagement_id from evidence where id = $1`, [evidenceId]);
  const ctx = await engagementCtx(e.engagement_id);
  await q(`update evidence set quarantined = $2, quarantine_reason = $3 where id = $1`, [evidenceId, reason !== null, reason]);
  if (reason !== null) {
    await q(
      `insert into exception (engagement_id, taxonomy_code, kind, evidence_id, severity, description)
       values ($1, 'quarantined_evidence', 'substantive', $2, 'high', $3)`,
      [e.engagement_id, evidenceId, `Evidence quarantined: ${reason}`],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: e.engagement_id, actorKind: 'user', actorId: userId,
    verb: reason !== null ? 'evidence_quarantined' : 'evidence_unquarantined',
    objectType: 'evidence', objectId: evidenceId, payload: { reason },
  });
}
