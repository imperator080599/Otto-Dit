import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { getWorkpaper, editSection, listEdits, listNotes, addReviewNote, transitionNote, signWorkpaper, listSignoffs } from '@/lib/services/workpapers/lifecycle';
import { exportWorkpaper, listExports } from '@/lib/services/workpapers/render';
import type { WpSection } from '@/lib/services/workpapers/draft';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const WP_BADGE: Record<string, string> = { draft: 'gray', in_review: 'blue', reviewed: 'amber', signed: 'green', outdated: 'red' };

export default async function WorkpaperDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string; wid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id, wid } = await params;
  const { erreur } = await searchParams;
  const { user } = await requireMember(id);
  const wp = await getWorkpaper(wid);
  if (!wp || wp.engagement_id !== id) return <div className="panel">Not found.</div>;
  const edits = await listEdits(wid);
  const notes = await listNotes(wid);
  const signoffs = await listSignoffs(wid);
  const exports = await listExports(wid);
  const members = await q<{ id: string; name: string }>(
    `select u.id, u.name from engagement_member m join app_user u on u.id = m.user_id where m.engagement_id = $1`,
    [id],
  );
  const signedRoles = new Set(signoffs.map((s) => s.sign_role));

  async function editAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await editSection(wid, user.id, String(formData.get('section')), String(formData.get('body') ?? ''), String(formData.get('justification') ?? ''));
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function noteAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await addReviewNote(id, wid, user.id, String(formData.get('assignee') ?? '') || null, String(formData.get('text') ?? ''));
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function noteTransition(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await transitionNote(String(formData.get('note_id')), user.id, String(formData.get('to')) as 'addressed' | 'closed');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function signAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await signWorkpaper(wid, user.id, String(formData.get('role')) as 'preparer_validator' | 'reviewer' | 'partner');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function exportAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await exportWorkpaper(wid, user.id, String(formData.get('format')) as 'pdf' | 'xlsx');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>
            {wp.title} <span className="badge gray">v{wp.version}</span>{' '}
            <span className={`badge ${WP_BADGE[wp.status]}`}>{wp.status}</span>
            {edits.length > 0 && <span className="mod-flag" style={{ marginLeft: 6 }}>modified — justified</span>}
          </h2>
          <span className="row">
            <form action={exportAction}><input type="hidden" name="format" value="pdf" /><button className="btn secondary small">Export PDF</button></form>
            <form action={exportAction}><input type="hidden" name="format" value="xlsx" /><button className="btn secondary small">Export Excel</button></form>
          </span>
        </div>
        <p className="faint">
          Performed by OTTO engine run <span className="mono">{wp.engine_run_id?.slice(0, 8)}</span> — facts hash{' '}
          <span className="mono">{wp.based_on_hash?.slice(0, 16)}…</span> — language {wp.language.toUpperCase()}.
          Exports are terminal, hash-stamped and self-contained (ADR-013).
        </p>
      </div>

      {(wp.sections as WpSection[]).map((s) => (
        <div className="panel" key={s.key}>
          <h2>{s.title}</h2>
          {s.body && <p style={{ whiteSpace: 'pre-wrap' }}>{s.body}</p>}
          {s.table && (
            <div className="table-scroll">
              <table className="data">
                <thead><tr>{s.table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((c, j) => (
                        <td key={j} style={{ maxWidth: 220 }}>
                          {j === 0 && r.refs?.evidenceIds?.length ? (
                            <span>
                              {String(c)}{' '}
                              {r.refs.evidenceIds.map((eid, k) => (
                                <a key={eid} href={`/api/blob/${eid}`} target="_blank" className="faint" title="open evidence">[{k + 1}]</a>
                              ))}
                            </span>
                          ) : (
                            String(c)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {wp.status !== 'signed' && wp.status !== 'outdated' && s.body !== undefined && (
            <details className="mt">
              <summary className="muted">Edit this section (visible flag + justification)</summary>
              <form action={editAction}>
                <input type="hidden" name="section" value={s.key} />
                <textarea name="body" defaultValue={s.body} style={{ minHeight: 100 }} />
                <div className="row mt">
                  <input type="text" name="justification" placeholder="Justification (required — rendered in the export)" style={{ flex: 1 }} required />
                  <button className="btn small">Save edit</button>
                </div>
              </form>
            </details>
          )}
        </div>
      ))}

      <div className="grid cols-2">
        <div className="panel">
          <h2>Review notes (human-only)</h2>
          {notes.map((n) => (
            <div key={n.id} className={`callout ${n.status === 'open' ? 'warn' : n.status === 'addressed' ? '' : 'green'}`}>
              <strong>{n.author_name}</strong>{n.assignee_name ? ` → ${n.assignee_name}` : ''} <span className="badge gray">{n.status}</span>
              <p style={{ margin: '4px 0 6px' }}>{n.text}</p>
              {n.status === 'open' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="addressed" /><button className="btn small secondary">Mark addressed</button></form>
              )}
              {n.status === 'addressed' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="closed" /><button className="btn small secondary">Close (author)</button></form>
              )}
            </div>
          ))}
          <form action={noteAction} className="mt">
            <textarea name="text" placeholder="New review note…" required />
            <div className="row mt">
              <select name="assignee" defaultValue="">
                <option value="">unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="btn small">Add note</button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h2>Sign-offs (dated, immutable)</h2>
          <table className="data">
            <thead><tr><th>Role</th><th>Signed by</th><th>When</th></tr></thead>
            <tbody>
              {(['preparer_validator', 'reviewer', 'partner'] as const).map((role) => {
                const s = signoffs.find((x) => x.sign_role === role);
                return (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{s ? s.user_name : <span className="faint">—</span>}</td>
                    <td>
                      {s ? s.signed_at.slice(0, 16) : wp.status !== 'outdated' && !signedRoles.has(role) ? (
                        <form action={signAction}><input type="hidden" name="role" value={role} /><button className="btn small">Sign as {role} ({user.name})</button></form>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2>Exports (terminal, hash-stamped)</h2>
          {exports.length === 0 ? <p className="muted">None yet.</p> : (
            <table className="data">
              <thead><tr><th>Format</th><th>sha256</th><th>When</th><th></th></tr></thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id}>
                    <td>{e.format}{e.supersedes_export_id && <span className="badge amber" style={{ marginLeft: 4 }}>supersedes prior</span>}</td>
                    <td className="mono faint">{e.content_hash.slice(0, 14)}…</td>
                    <td className="faint">{e.exported_at.slice(0, 16)}</td>
                    <td><Link href={`/api/export-file/${e.id}`}>download</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
