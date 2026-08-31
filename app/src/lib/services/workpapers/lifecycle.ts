import { q, q01, q1 } from '@/lib/db/client';
import { type Ancre, assertAncrePosable, resoudreAncre, KINDS } from '../notes/ancres';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from '../imports';
import type { WpSection } from './draft';

// S7 lifecycle: visible-flag edits with mandatory justification (idea #14), review notes
// (human-only, idea #17), dated immutable sign-offs; re-draft after sign-off ⇒ new version
// requiring re-sign (04 §7).

export async function getWorkpaper(workpaperId: string) {
  return q01<{
    id: string; engagement_id: string; pack_id: string; code: string; title: string;
    reference: string | null;
    language: string; sections: WpSection[]; status: string; version: number;
    based_on_hash: string | null; engine_run_id: string | null; created_at: string;
  }>(
    `select id, engagement_id, pack_id, code, title, reference, language, sections, status, version,
            based_on_hash, engine_run_id, created_at::text
     from workpaper where id = $1`,
    [workpaperId],
  );
}

export async function listWorkpapers(engagementId: string) {
  return q<{ id: string; code: string; title: string; status: string; version: number; created_at: string; edit_count: string; signoff_count: string; note_open: string }>(
    `select w.id, w.code, w.title, w.status, w.version, w.created_at::text,
            (select count(*) from workpaper_edit e where e.workpaper_id = w.id) edit_count,
            (select count(*) from signoff s where s.workpaper_id = w.id) signoff_count,
            (select count(*) from review_note n where n.workpaper_id = w.id and n.status = 'open' and n.note_type = 'a_corriger') note_open
     from workpaper w where w.engagement_id = $1
     order by w.code, w.version desc`,
    [engagementId],
  );
}

/** Edit a section's body: visible modification flag + mandatory justification. */
export async function editSection(workpaperId: string, userId: string, sectionKey: string, newBody: string, justification: string): Promise<void> {
  if (!justification.trim()) throw new Error('a manual modification requires a written justification');
  const wp = await q1<{ id: string; engagement_id: string; sections: WpSection[]; status: string }>(
    `select id, engagement_id, sections, status from workpaper where id = $1`,
    [workpaperId],
  );
  if (wp.status === 'signed') throw new Error('signed workpaper — redraft to a new version first');
  const ctx = await engagementCtx(wp.engagement_id);
  const sections = wp.sections.map((s) => (s.key === sectionKey ? { ...s, body: newBody } : s));
  const before = wp.sections.find((s) => s.key === sectionKey)?.body ?? '';
  await q(`update workpaper set sections = $2 where id = $1`, [workpaperId, JSON.stringify(sections)]);
  await q(
    `insert into workpaper_edit (workpaper_id, user_id, section, before_value, after_value, justification)
     values ($1,$2,$3,$4,$5,$6)`,
    [workpaperId, userId, sectionKey, before, newBody, justification],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: wp.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'workpaper_edited', objectType: 'workpaper', objectId: workpaperId,
    payload: { section: sectionKey, justification },
  });
}

export async function listEdits(workpaperId: string) {
  return q<{ id: string; section: string; before_value: string | null; after_value: string | null; justification: string; edited_at: string; user_name: string }>(
    `select e.id, e.section, e.before_value, e.after_value, e.justification, e.edited_at::text, u.name user_name
     from workpaper_edit e join app_user u on u.id = e.user_id
     where e.workpaper_id = $1 order by e.edited_at`,
    [workpaperId],
  );
}

// ---------- review notes (human-only) ----------

export type NoteType = 'a_corriger' | 'a_documenter' | 'question' | 'remarque_n1';

/** Les quatre types d'ADR-028 — et SEULES LES BLOQUANTES empêchent le visa :
 *  sans le typage, « seul le réviseur clôt » serait un cérémonial imposé à
 *  des remarques qui ne le méritent pas. */
export const NOTE_TYPES: Record<NoteType, { libelle: string; bloquante: boolean }> = {
  a_corriger: { libelle: 'à corriger (bloquante)', bloquante: true },
  a_documenter: { libelle: 'à documenter', bloquante: false },
  question: { libelle: 'question', bloquante: false },
  remarque_n1: { libelle: 'remarque pour N+1', bloquante: false },
};

export interface OptionsNote {
  /** L'ancre : l'OBJET MÉTIER que la note vise (ADR-097). Absente = note de
   *  papier « flottante », le comportement historique. */
  ancre?: Ancre;
  /** 'otto' = la note est une instruction pour la machine (tranche suivante) ;
   *  assigneeId doit alors être null — OTTO n'est pas un app_user. */
  assigneeKind?: 'user' | 'otto';
  /** Défaut 'a_corriger' — le type le plus exigeant : on relâche
   *  explicitement, jamais par oubli. */
  noteType?: NoteType;
}

export async function addReviewNote(
  engagementId: string, workpaperId: string | null, authorId: string,
  assigneeId: string | null, text: string, opts: OptionsNote = {},
): Promise<string> {
  if (!text.trim()) throw new Error('empty note');
  const assigneeKind = opts.assigneeKind ?? 'user';
  if (assigneeKind === 'otto' && assigneeId !== null) {
    throw new Error('note : un destinataire OTTO n\'a pas d\'identifiant utilisateur');
  }
  /* Une ancre se VALIDE à la pose : la note se pose sur un objet qui existe
     maintenant — jamais sur une position d'écran ni un objet imaginaire. */
  if (opts.ancre) await assertAncrePosable(engagementId, opts.ancre);
  const ctx = await engagementCtx(engagementId);
  const noteType: NoteType = opts.noteType ?? 'a_corriger';
  if (!NOTE_TYPES[noteType]) throw new Error(`note : type « ${noteType} » inconnu`);
  const row = await q1<{ id: string }>(
    `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, text,
                              anchor_kind, anchor_ref, anchor_field, anchor_label, assignee_kind, note_type)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [engagementId, workpaperId, authorId, assigneeId, text,
     opts.ancre?.kind ?? null, opts.ancre?.ref ?? null, opts.ancre?.field ?? null,
     opts.ancre?.label ?? null, assigneeKind, noteType],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: authorId,
    verb: 'review_note_added', objectType: 'review_note', objectId: row.id,
    payload: { workpaperId, assigneeId, assigneeKind, noteType, ancre: opts.ancre ?? null },
  });
  return row.id;
}

/**
 * RÉPONDRE à une note — la réponse entre au dossier, et une réponse sur une
 * note ouverte la fait passer « addressed » : répondre sans traiter serait un
 * état qui n'existe pas dans une revue réelle. Seuls les humains répondent
 * ici ; la réponse machine (note adressée à OTTO) a son propre chemin, qui
 * écrit aussi dans review_note_reply avec author_kind 'otto'.
 */
export async function repondreNote(noteId: string, userId: string, texte: string): Promise<string> {
  if (!texte.trim()) throw new Error('réponse vide');
  const note = await q1<{ id: string; engagement_id: string; status: string }>(
    `select id, engagement_id, status from review_note where id = $1`, [noteId],
  );
  if (note.status === 'closed') throw new Error('note close — une note close ne se rouvre pas, on en pose une nouvelle');
  const ctx = await engagementCtx(note.engagement_id);
  const row = await q1<{ id: string }>(
    `insert into review_note_reply (note_id, engagement_id, author_kind, author_id, text)
     values ($1,$2,'user',$3,$4) returning id`,
    [noteId, note.engagement_id, userId, texte],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: note.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'review_note_replied', objectType: 'review_note', objectId: noteId, payload: { replyId: row.id },
  });
  if (note.status === 'open') await transitionNote(noteId, userId, 'addressed');
  return row.id;
}

export async function listReplies(noteId: string) {
  return q<{ id: string; author_kind: string; author_name: string | null; text: string; payload: unknown; created_at: string }>(
    `select r.id, r.author_kind, u.name author_name, r.text, r.payload, r.created_at::text
     from review_note_reply r left join app_user u on u.id = r.author_id
     where r.note_id = $1 order by r.created_at`,
    [noteId],
  );
}

export interface NoteAncree {
  id: string; status: string; text: string; created_at: string;
  author_name: string; assignee_name: string | null; assignee_kind: string;
  note_type: string; author_id: string;
  workpaper_id: string | null;
  anchor_kind: string | null; anchor_ref: string | null; anchor_field: string | null; anchor_label: string | null;
  /** DÉRIVÉ à la lecture par résolution de l'ancre — jamais stocké. */
  etat_ancre: 'present' | 'retire' | null;
  reponses: number;
}

/**
 * LA VUE TRANSVERSE : toutes les notes de la mission, ancres RÉSOLUES contre
 * l'état actuel — c'est ici qu'une note dont l'objet a été retiré remonte,
 * avec son histoire, au lieu de disparaître avec lui.
 */
export async function notesDeLaMission(engagementId: string): Promise<NoteAncree[]> {
  const notes = await q<Omit<NoteAncree, 'etat_ancre' | 'reponses'> & { reponses: string }>(
    `select n.id, n.status, n.text, n.created_at::text, a.name author_name,
            s.name assignee_name, n.assignee_kind, n.workpaper_id, n.note_type, n.author_id::text author_id,
            n.anchor_kind, n.anchor_ref, n.anchor_field, n.anchor_label,
            (select count(*) from review_note_reply r where r.note_id = n.id)::text reponses
     from review_note n
     join app_user a on a.id = n.author_id
     left join app_user s on s.id = n.assignee_id
     where n.engagement_id = $1
     order by case n.status when 'open' then 0 when 'addressed' then 1 else 2 end, n.created_at`,
    [engagementId],
  );
  const out: NoteAncree[] = [];
  for (const n of notes) {
    let etat: NoteAncree['etat_ancre'] = null;
    if (n.anchor_kind) {
      const r = await resoudreAncre(engagementId, {
        kind: n.anchor_kind as Ancre['kind'], ref: n.anchor_ref!, field: n.anchor_field, label: n.anchor_label!,
      });
      etat = r.etat;
    }
    out.push({ ...n, etat_ancre: etat, reponses: Number(n.reponses) });
  }
  return out;
}

/**
 * Les marqueurs d'écran : pour chaque note ancrée non close, les CIBLES
 * ACTUELLES qui la portent, indexées `kind|cible` — les écrans posent le
 * jeton d'attention sur ces éléments-là et n'ont aucune opinion propre sur
 * la résolution.
 */
export async function notesPourEcran(engagementId: string): Promise<Record<string, { noteId: string; status: string; label: string }[]>> {
  const notes = await notesDeLaMission(engagementId);
  const parCible: Record<string, { noteId: string; status: string; label: string }[]> = {};
  for (const n of notes) {
    if (!n.anchor_kind || n.status === 'closed') continue;
    const r = await resoudreAncre(engagementId, {
      kind: n.anchor_kind as Ancre['kind'], ref: n.anchor_ref!, field: n.anchor_field, label: n.anchor_label!,
    });
    for (const cible of r.cibles) {
      const cle = n.anchor_field ? `${n.anchor_kind}|${cible}|${n.anchor_field}` : `${n.anchor_kind}|${cible}`;
      (parCible[cle] ??= []).push({ noteId: n.id, status: n.status, label: n.anchor_label! });
    }
  }
  return parCible;
}

export { KINDS as ANCRE_KINDS };

export async function transitionNote(noteId: string, userId: string, to: 'addressed' | 'closed'): Promise<void> {
  const note = await q1<{ id: string; engagement_id: string; status: string; author_id: string }>(
    `select id, engagement_id, status, author_id from review_note where id = $1`,
    [noteId],
  );
  if (to === 'addressed' && note.status !== 'open') throw new Error('only open notes can be addressed');
  if (to === 'closed' && note.status !== 'addressed') throw new Error('only addressed notes can be closed');
  /* LE PRÉPARATEUR RÉPOND, SEUL LE RÉVISEUR CLÔT — ET JAMAIS L'AUTEUR
     (ADR-028, rétabli par ADR-102). Un auteur qui clôt sa propre note vide la
     revue de sa substance. Le service refuse ici, et la BASE refuse aussi
     (trigger review_note_close_guard) : une écriture qui contourne le service
     est refusée par la table elle-même. */
  if (to === 'closed') {
    if (note.author_id === userId) {
      throw new Error('l\'auteur d\'une note ne la clôt jamais — seul un réviseur qui n\'en est pas l\'auteur clôt (ADR-028)');
    }
    const reviseur = await q01<{ id: string }>(
      `select id from engagement_member
       where engagement_id = $1 and user_id = $2 and eng_role in ('manager','partner') and exited_on is null`,
      [note.engagement_id, userId],
    );
    if (!reviseur) {
      throw new Error('seul un réviseur de la mission (manager ou associé) clôt une note de revue (ADR-028)');
    }
  }
  const ctx = await engagementCtx(note.engagement_id);
  await q(
    to === 'addressed'
      ? `update review_note set status = 'addressed', addressed_at = now() where id = $1`
      : `update review_note set status = 'closed', closed_at = now(), closed_by = $2 where id = $1`,
    to === 'addressed' ? [noteId] : [noteId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: note.engagement_id, actorKind: 'user', actorId: userId,
    verb: `review_note_${to}`, objectType: 'review_note', objectId: noteId, payload: {},
  });
}

export async function listNotes(workpaperId: string) {
  return q<{ id: string; status: string; text: string; created_at: string; author_name: string; assignee_name: string | null; anchor_label: string | null; assignee_kind: string; note_type: string }>(
    `select n.id, n.status, n.text, n.created_at::text, a.name author_name, s.name assignee_name,
            n.anchor_label, n.assignee_kind, n.note_type
     from review_note n
     join app_user a on a.id = n.author_id
     left join app_user s on s.id = n.assignee_id
     where n.workpaper_id = $1 order by n.created_at`,
    [workpaperId],
  );
}

// ---------- sign-offs (append-only, dated) ----------

const SIGN_ORDER = ['preparer_validator', 'reviewer', 'partner'] as const;

export async function signWorkpaper(workpaperId: string, userId: string, role: (typeof SIGN_ORDER)[number]): Promise<void> {
  const wp = await q1<{ id: string; engagement_id: string; status: string }>(
    `select id, engagement_id, status from workpaper where id = $1`,
    [workpaperId],
  );
  if (wp.status === 'outdated') throw new Error('outdated workpaper — redraft first');
  const ctx = await engagementCtx(wp.engagement_id);
  const member = await q01<{ can_sign: boolean; eng_role: string }>(
    `select can_sign, eng_role from engagement_member where engagement_id = $1 and user_id = $2`,
    [wp.engagement_id, userId],
  );
  if (!member) throw new Error('not a member of this engagement');
  if (role === 'partner' && !member.can_sign) throw new Error('partner sign-off requires signing rights');
  const existing = await q<{ sign_role: string; user_id: string }>(
    `select sign_role, user_id from signoff where workpaper_id = $1`,
    [workpaperId],
  );
  if (existing.some((s) => s.sign_role === role)) throw new Error(`${role} already signed this version`);
  if (role === 'reviewer' && existing.every((s) => s.sign_role !== 'preparer_validator')) {
    throw new Error('reviewer signs after the preparer/validator');
  }
  if (role === 'partner' && existing.every((s) => s.sign_role !== 'reviewer')) {
    throw new Error('partner signs after the reviewer');
  }
  if (role === 'reviewer' || role === 'partner') {
    /* SEULES LES BLOQUANTES empêchent le visa (ADR-028 §2) : une question ou
       une remarque pour N+1 ouverte n'arrête pas la revue. */
    const openNotes = await q1<{ n: string }>(
      `select count(*) n from review_note
       where workpaper_id = $1 and status = 'open' and note_type = 'a_corriger'`,
      [workpaperId],
    );
    if (Number(openNotes.n) > 0) throw new Error('open review notes must be addressed before review sign-off');
  }
  await q(`insert into signoff (workpaper_id, user_id, sign_role) values ($1,$2,$3)`, [workpaperId, userId, role]);
  const newStatus = role === 'partner' ? 'signed' : role === 'reviewer' ? 'reviewed' : 'in_review';
  await q(`update workpaper set status = $2 where id = $1`, [workpaperId, newStatus]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: wp.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'workpaper_signed', objectType: 'workpaper', objectId: workpaperId,
    payload: { role, newStatus },
  });
}

export async function listSignoffs(workpaperId: string) {
  return q<{ sign_role: string; signed_at: string; user_name: string }>(
    `select s.sign_role, s.signed_at::text, u.name user_name
     from signoff s join app_user u on u.id = s.user_id
     where s.workpaper_id = $1 order by s.signed_at`,
    [workpaperId],
  );
}
