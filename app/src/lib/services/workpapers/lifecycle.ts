import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from '../imports';
import type { WpSection } from './draft';

// S7 lifecycle: visible-flag edits with mandatory justification (idea #14), review notes
// (human-only, idea #17), dated immutable sign-offs; re-draft after sign-off ⇒ new version
// requiring re-sign (04 §7).

export async function getWorkpaper(workpaperId: string) {
  return q01<{
    id: string; engagement_id: string; pack_id: string; code: string; title: string;
    language: string; sections: WpSection[]; status: string; version: number;
    based_on_hash: string | null; engine_run_id: string | null; created_at: string;
  }>(
    `select id, engagement_id, pack_id, code, title, language, sections, status, version,
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
            (select count(*) from review_note n where n.workpaper_id = w.id and n.status = 'open') note_open
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

export async function addReviewNote(engagementId: string, workpaperId: string | null, authorId: string, assigneeId: string | null, text: string): Promise<string> {
  if (!text.trim()) throw new Error('empty note');
  const ctx = await engagementCtx(engagementId);
  const row = await q1<{ id: string }>(
    `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, text)
     values ($1,$2,$3,$4,$5) returning id`,
    [engagementId, workpaperId, authorId, assigneeId, text],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: authorId,
    verb: 'review_note_added', objectType: 'review_note', objectId: row.id,
    payload: { workpaperId, assigneeId },
  });
  return row.id;
}

export async function transitionNote(noteId: string, userId: string, to: 'addressed' | 'closed'): Promise<void> {
  const note = await q1<{ id: string; engagement_id: string; status: string; author_id: string }>(
    `select id, engagement_id, status, author_id from review_note where id = $1`,
    [noteId],
  );
  if (to === 'addressed' && note.status !== 'open') throw new Error('only open notes can be addressed');
  if (to === 'closed' && note.status !== 'addressed') throw new Error('only addressed notes can be closed');
  if (to === 'closed' && note.author_id !== userId) throw new Error('only the author closes their note');
  const ctx = await engagementCtx(note.engagement_id);
  await q(
    to === 'addressed'
      ? `update review_note set status = 'addressed', addressed_at = now() where id = $1`
      : `update review_note set status = 'closed', closed_at = now() where id = $1`,
    [noteId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: note.engagement_id, actorKind: 'user', actorId: userId,
    verb: `review_note_${to}`, objectType: 'review_note', objectId: noteId, payload: {},
  });
}

export async function listNotes(workpaperId: string) {
  return q<{ id: string; status: string; text: string; created_at: string; author_name: string; assignee_name: string | null }>(
    `select n.id, n.status, n.text, n.created_at::text, a.name author_name, s.name assignee_name
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
    const openNotes = await q1<{ n: string }>(
      `select count(*) n from review_note where workpaper_id = $1 and status = 'open'`,
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
