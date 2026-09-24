import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { saveBlob } from '@/lib/core/storage';
import { engagementCtx } from './imports';
import { assertMembreDe } from '@/lib/core/membre';
import { refus } from '@/lib/core/refus';

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
  const blob = await saveBlob(opts.bytes);
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
/** Triage an inbound document onto the request item it answers.
 *  Mail does not arrive pre-filed: something ingested from the engagement address sits
 *  unlinked until a human (or a matching rule) says which request item it belongs to.
 *  Linking is what makes it audit evidence for that item, so it is an event. */
export async function attachEvidenceToItem(evidenceId: string, requestItemId: string, userId: string): Promise<void> {
  /* DEUX OBJETS, DEUX RÉSOLUTIONS. Garder la pièce ne suffit pas : l'élément de
     demande arrive du même formulaire. Rattacher MA pièce à l'élément d'un
     autre cabinet écrirait chez lui — et les deux gardes doivent viser le MÊME
     dossier, sinon on a vérifié deux choses vraies séparément et fausses
     ensemble (mandat du soir, étage 0.1). */
  const engRattache = await assertMembreDe('evidence', evidenceId, userId, 'rattacher une pièce à un élément de demande');
  const engElement = await assertMembreDe('request_item', requestItemId, userId, 'rattacher une pièce à un élément de demande');
  if (engRattache !== engElement) {
    throw refus('ETANCH-06', 'rattacher une pièce à un élément de demande — la pièce et l’élément ne sont pas du même dossier');
  }
  const ev = await q1<{ id: string; engagement_id: string; filename: string; quarantined: boolean }>(
    `select id, engagement_id, filename, quarantined from evidence where id = $1`,
    [evidenceId],
  );
  if (ev.quarantined) throw new Error('a quarantined document must be released before it can answer a request item');
  const item = await q1<{ id: string; request_id: string; description: string }>(
    `select ri.id, ri.request_id, ri.description from request_item ri
     join request r on r.id = ri.request_id where ri.id = $1 and r.engagement_id = $2`,
    [requestItemId, ev.engagement_id],
  );
  await q(`update evidence set request_item_id = $2 where id = $1`, [evidenceId, requestItemId]);
  await q(`update request_item set status = 'uploaded' where id = $1`, [requestItemId]);
  const ctx = await engagementCtx(ev.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: ev.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'evidence_attached_to_item', objectType: 'evidence', objectId: evidenceId,
    payload: { request_item_id: requestItemId, filename: ev.filename, item: item.description },
  });
}

/** P2-01 (AUD-04) : GARDE PORTAIL — `requestId` doit appartenir à l'entité de `contactId`.
 *  Nommée `assert*` à dessein (comme `assertMembreDe`) : `couverture-etancheite.test.ts`
 *  saute les fonctions dont le nom commence par `assert` (une garde n'est pas un geste) et
 *  reconnaît son appel comme la preuve qu'un appelant à acteur est bien gardé. */
async function assertRequestDeLEntite(requestId: string, contactId: string): Promise<{ id: string; engagement_id: string }> {
  const r = await q01<{ id: string; engagement_id: string }>(
    `select r.id, r.engagement_id from request r
     join engagement e on e.id = r.engagement_id
     join client_contact c on c.id = $1
     where r.id = $2 and e.entity_id = c.entity_id`,
    [contactId, requestId],
  );
  if (!r) throw refus('PORTAIL-01', 'cette demande n’appartient pas à votre entité');
  return r;
}

/** P2-01 (AUD-04) : même garde que `answerExplanation` — `contactId` doit appartenir à
 *  l'entité du dossier de `requestId`, sinon PORTAIL-01 avant toute écriture. Trouvé par
 *  le même balayage (élargissement du regex ACTEUR de `couverture-etancheite.test.ts`
 *  à `contactId`) : la garde de l'appelant portail (`portalRequestGuard`) protège déjà
 *  ce chemin, mais le service lui-même n'avait aucune défense en profondeur. */
export async function markAllSubmitted(requestId: string, contactId: string): Promise<void> {
  const r = await assertRequestDeLEntite(requestId, contactId);
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

/** P2-01 (AUD-04) : GARDE PORTAIL — `requestItemId` doit appartenir à `requestId`, ET
 *  `requestId` à l'entité de `contactId`. Même doctrine de nommage que
 *  `assertRequestDeLEntite` ci-dessus (préfixe `assert`, reconnue par le balayage). */
async function assertItemDeLaDemandeEtDeLEntite(
  requestId: string, requestItemId: string, contactId: string,
): Promise<{ id: string; request_id: string; exception_id: string | null; engagement_id: string }> {
  const item = await q01<{ id: string; request_id: string; exception_id: string | null; engagement_id: string }>(
    `select ri.id, ri.request_id, ri.exception_id, e.id as engagement_id
     from request_item ri
     join request r on r.id = ri.request_id
     join engagement e on e.id = r.engagement_id
     join client_contact c on c.id = $1
     where ri.id = $2 and r.id = $3 and e.entity_id = c.entity_id`,
    [contactId, requestItemId, requestId],
  );
  if (!item) throw refus('PORTAIL-01', 'cet élément de demande n’appartient pas à cette demande, ou pas à votre entité');
  return item;
}

/** P2-01 (AUD-04) : `requestId` EST L'ANCRAGE, PAS UN SUPPLÉMENT. Avant cette tranche,
 *  `requestItemId` était résolu par son seul id — n'importe quel item de n'importe quel
 *  dossier, tant qu'on en connaissait l'id, était répondable par n'importe quel contact.
 *  `assertItemDeLaDemandeEtDeLEntite` exige `request.id = requestId` ET `entity.id =
 *  contact.entity_id` — un item qui n'appartient pas à CETTE demande, ou un contact d'une
 *  autre entité, refuse PORTAIL-01 avant toute écriture. */
export async function answerExplanation(requestId: string, requestItemId: string, contactId: string, text: string): Promise<void> {
  if (!text.trim()) throw new Error('empty answer');
  const item = await assertItemDeLaDemandeEtDeLEntite(requestId, requestItemId, contactId);
  const ctx = await engagementCtx(item.engagement_id);
  await q(`update request_item set client_note = $2, status = 'complete' where id = $1`, [requestItemId, text]);
  if (item.exception_id) {
    // clarification answered → exception explained (auditor still resolves/escalates)
    await q(
      `update exception set status = 'explained', resolution = $2 where id = $1 and status = 'clarification_requested'`,
      [item.exception_id, text],
    );
    await q(`update followup set status = 'answered' where exception_id = $1 and request_id = $2`, [item.exception_id, item.request_id]);
  }
  await refreshRequestStatus(requestItemId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: item.engagement_id, actorKind: 'system', actorId: null,
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
  await assertMembreDe('evidence', evidenceId, userId, 'mettre une pièce en quarantaine');
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
