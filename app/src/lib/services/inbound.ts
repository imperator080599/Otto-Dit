import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { ingestEvidence } from './evidence';
import { engagementCtx } from './imports';

// Per-engagement inbound email — interface real, transport stubbed (Q12/05 §5).
// Production: eng-<token>@in.<domain> webhook → this same pipeline (DEPLOY.md).

export interface InboundMessage {
  from: string;
  subject: string;
  attachments: { filename: string; mime: string; bytes: Uint8Array }[];
}

export async function processInbound(engagementId: string, msg: InboundMessage): Promise<{ inboundId: string; evidenceIds: string[]; quarantined: boolean }> {
  const ctx = await engagementCtx(engagementId);
  // sender allow-list: known client contacts of the engagement's entity (06 §5)
  const contact = await q01<{ id: string }>(
    `select c.id from client_contact c
     join engagement e on e.entity_id = c.entity_id
     where e.id = $1 and lower(c.email) = lower($2) and c.active`,
    [engagementId, msg.from],
  );
  const quarantined = !contact;
  const row = await q1<{ id: string }>(
    `insert into inbound_email (engagement_id, from_addr, subject, status)
     values ($1,$2,$3,$4) returning id`,
    [engagementId, msg.from, msg.subject, quarantined ? 'quarantined' : 'processed'],
  );
  const evidenceIds: string[] = [];
  if (!quarantined) {
    for (const att of msg.attachments) {
      const res = await ingestEvidence({
        engagementId,
        filename: att.filename,
        mime: att.mime,
        bytes: att.bytes,
        source: 'email',
        uploadedBy: { kind: 'client_contact', id: contact!.id },
      });
      evidenceIds.push(res.evidenceId);
      await q(`update evidence set inbound_email_id = $2 where id = $1`, [res.evidenceId, row.id]);
    }
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: quarantined ? 'inbound_email_quarantined' : 'inbound_email_processed',
    objectType: 'inbound_email', objectId: row.id,
    payload: { from: msg.from, subject: msg.subject, attachments: msg.attachments.length },
  });
  return { inboundId: row.id, evidenceIds, quarantined };
}
