import { q } from '@/lib/db/client';
import { refus } from '@/lib/core/refus';

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

/**
 * Lot 7, tranche 1 (mandat REGISTRE_IDEES.md, H-1) — « ce que vous me devez encore » : l'écran
 * nommé littéralement par le fondateur, qui n'existait sous AUCUN nom avant cette tranche
 * (recherche préalable, vérifiée par grep sur le dépôt entier). `portalRequests` liste les
 * DEMANDES (une ligne par requête, `submitted` mêlé aux ouvertes, distingué seulement par un
 * badge) ; celle-ci liste les ÉLÉMENTS encore dus — un agrégat, pas une liste de dossiers à
 * ouvrir un par un. MÊME PATRON que `portalRequests` (même jointure, même filtre de statut de
 * requête), UNE clause de plus : `i.status = 'pending'`.
 *
 * CE QUI COMPTE COMME « ENCORE DÛ » (règle 19, décision explicite plutôt que devinée) :
 * `request_item.status = 'pending'` SEUL — pas `'uploaded'`. Une pièce déposée mais non encore
 * acceptée par l'auditeur (`'uploaded'`) n'est plus, du point de vue du CLIENT, quelque chose
 * qu'IL doit encore faire ; l'attente est alors du côté du cabinet. `'na'`/`'complete'` sont
 * déjà réglés. La requête parente doit rester `sent`/`partially_submitted`/`reopened` — le même
 * filtre que `portalRequests`, jamais `'submitted'` (une requête entièrement soumise ne porte,
 * par construction, plus aucun item `pending`, mais le filtre le dit explicitement plutôt que
 * de s'appuyer en silence sur cette invariance).
 */
export async function portalOutstandingItems(entityId: string) {
  return q<{
    id: string; kind: string; description: string; request_id: string; seq_no: number;
    request_title: string; due_date: string | null; engagement_name: string;
  }>(
    `select i.id, i.kind, i.description, r.id request_id, r.seq_no, r.title request_title,
            r.due_date::text, e.name engagement_name
     from request_item i
     join request r on r.id = i.request_id
     join engagement e on e.id = r.engagement_id
     where e.entity_id = $1 and r.status in ('sent','partially_submitted','reopened')
       and i.status = 'pending'
     order by r.due_date nulls last, e.name, r.seq_no, i.created_at`,
    [entityId],
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

/** P2-01 (AUD-04) : GARDE : l'ÉLÉMENT doit appartenir à CETTE demande — pas seulement au
 *  formulaire qui l'a posté. `uploadAction` recevait `item_id` d'un champ de formulaire caché,
 *  jamais recroisé contre `rid` : un POST forgé avec l'id d'un élément d'une AUTRE demande
 *  (même d'un autre dossier) aurait été accepté tel quel par `ingestEvidence`. */
export async function portalItemGuard(requestId: string, itemId: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `select id from request_item where id = $1 and request_id = $2`,
    [itemId, requestId],
  );
  return rows.length > 0;
}

/** Même garde que `portalItemGuard`, mais qui REFUSE elle-même (PORTAIL-01) — le détail
 *  français du refus vit ICI, dans un service, jamais dans une action d'écran (règle 6/9 :
 *  la garde du catalogue `langue.ts` distingue les deux, un libellé en dur dans un .tsx est
 *  une régression qu'elle attrape, un libellé en dur dans un service passant par `refus()`
 *  ne l'est pas). */
export async function assertPortalItem(requestId: string, itemId: string): Promise<void> {
  if (!(await portalItemGuard(requestId, itemId))) {
    throw refus('PORTAIL-01', 'cet élément de demande n’appartient pas à cette demande');
  }
}
