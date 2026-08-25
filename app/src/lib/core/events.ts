import { q, q01 } from '@/lib/db/client';
import { sha256, stableStringify } from './hash';

// Immutable, hash-chained event log (docs/04 §8, docs/06 §4). Every state change in the
// system goes through logEvent — services call it in the same logical operation as the
// write. Chain: per engagement (or per tenant for engagement-less events).

export interface EventInput {
  tenantId: string;
  engagementId?: string | null;
  actorKind: 'user' | 'system' | 'ai';
  actorId?: string | null;
  verb: string;
  objectType: string;
  objectId?: string | null;
  payload?: Record<string, unknown>;
}

export async function logEvent(e: EventInput): Promise<void> {
  const prev = await q01<{ hash: string }>(
    `select hash from event_log
     where tenant_id = $1 and engagement_id is not distinct from $2
     order by id desc limit 1`,
    [e.tenantId, e.engagementId ?? null],
  );
  const prevHash = prev?.hash ?? '';
  const body = stableStringify({
    verb: e.verb,
    objectType: e.objectType,
    objectId: e.objectId ?? null,
    payload: e.payload ?? {},
    actorKind: e.actorKind,
    actorId: e.actorId ?? null,
  });
  const hash = sha256(prevHash + body);
  await q(
    `insert into event_log (tenant_id, engagement_id, actor_kind, actor_id, verb,
       object_type, object_id, payload, prev_hash, hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.tenantId,
      e.engagementId ?? null,
      e.actorKind,
      e.actorId ?? null,
      e.verb,
      e.objectType,
      e.objectId ?? null,
      JSON.stringify(e.payload ?? {}),
      prevHash,
      hash,
    ],
  );
}

/** Verify the hash chain for an engagement (S9 event-log viewer indicator). */
export async function verifyChain(tenantId: string, engagementId: string | null): Promise<{ ok: boolean; count: number; brokenAtId?: number }> {
  const rows = await q<{ id: number; prev_hash: string; hash: string; actor_kind: string; actor_id: string | null; verb: string; object_type: string; object_id: string | null; payload: unknown }>(
    `select id, prev_hash, hash, actor_kind, actor_id, verb, object_type, object_id, payload
     from event_log where tenant_id = $1 and engagement_id is not distinct from $2 order by id`,
    [tenantId, engagementId],
  );
  let prev = '';
  for (const r of rows) {
    const body = stableStringify({
      verb: r.verb,
      objectType: r.object_type,
      objectId: r.object_id,
      payload: r.payload ?? {},
      actorKind: r.actor_kind,
      actorId: r.actor_id,
    });
    if (r.prev_hash !== prev || r.hash !== sha256(prev + body)) {
      return { ok: false, count: rows.length, brokenAtId: r.id };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
