import { q } from '@/lib/db/client';

// Client-portal read surface — the WHITELIST (docs/04 §9.7, 06 §1): requests, own items,
// reminders. No audit documentation is reachable through any function in this module;
// the isolation test asserts the negative.

export async function portalRequests(entityId: string) {
  return q<{
    id: string; engagement_id: string; engagement_name: string; language: string;
    seq_no: number; title: string; status: string; due_date: string | null; sent_at: string | null;
  }>(
    `select r.id, r.engagement_id, e.name engagement_name, r.language, r.seq_no, r.title,
            r.status, r.due_date::text, r.sent_at::text
     from request r join engagement e on e.id = r.engagement_id
     where e.entity_id = $1 and r.status in ('sent','partially_submitted','submitted','reopened')
     order by e.name, r.seq_no`,
    [entityId],
  );
}

export async function portalItems(requestId: string) {
  return q<{ id: string; kind: string; description: string; status: string; client_note: string | null; evidence_count: string }>(
    `select i.id, i.kind, i.description, i.status, i.client_note,
            (select count(*) from evidence ev where ev.request_item_id = i.id) evidence_count
     from request_item i where i.request_id = $1 order by i.created_at`,
    [requestId],
  );
}

/** Guard: the request must belong to the contact's entity (token scope). */
export async function portalRequestGuard(requestId: string, entityId: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `select r.id from request r join engagement e on e.id = r.engagement_id
     where r.id = $1 and e.entity_id = $2`,
    [requestId, entityId],
  );
  return rows.length > 0;
}
