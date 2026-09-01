import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { requestDetail, approveSend, pauseReminders, ensureReminders } from '@/lib/services/requests';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const ITEM_BADGE: Record<string, string> = { pending: 'gray', uploaded: 'blue', complete: 'green', na: 'gray' };

export default async function RequestDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; rid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id, rid } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  await ensureReminders(id);
  const detail = await requestDetail(rid);
  if (!detail || detail.request.engagement_id !== id) {
    return <div className="panel">Request not found.</div>;
  }
  const { request, items, reminders } = detail;

  async function sendAction() {
    'use server';
    return executer(`/eng/${id}/requests/${rid}`, async () => {
      const { user } = await requireMember(id);
      await approveSend(rid, user.id);
      revalidatePath(`/eng/${id}/requests/${rid}`);
    });
  }
  async function pauseAction() {
    'use server';
    return executer(`/eng/${id}/requests/${rid}`, async () => {
      const { user } = await requireMember(id);
      await pauseReminders(rid, user.id);
      revalidatePath(`/eng/${id}/requests/${rid}`);
    });
  }

  return (
    <div className="grid cols-2">
      <BandeauRefus erreur={erreur} />
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>
            R-{String(request.seq_no).padStart(3, '0')} — {request.title}{' '}
            <span className={`badge ${request.status === 'draft' ? 'gray' : 'blue'}`}>{request.status}</span>
          </h2>
          {request.status === 'draft' && (
            <form action={sendAction}>
              <button className="btn">Approve &amp; send (L2)</button>
            </form>
          )}
        </div>
        <table className="data">
          <thead><tr><th>Kind</th><th>Item</th><th>Status</th><th>Evidence</th><th>Client answer</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><span className="badge gray">{i.kind}</span></td>
                <td>{i.description}{!i.sample_item_id && !i.control_instance_id && <span className="faint"> (standing)</span>}</td>
                <td><span className={`badge ${ITEM_BADGE[i.status]}`}>{i.status}</span></td>
                <td className="num">{i.evidence_count}</td>
                <td className="muted">{i.client_note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Reminder log (L1 — visible, pausable)</h2>
          <form action={pauseAction}><button className="btn secondary small">Pause reminders</button></form>
        </div>
        {reminders.length === 0 ? <p className="muted">None yet.</p> : (
          <table className="data">
            <thead><tr><th>Scheduled</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>
              {reminders.map((r, i) => (
                <tr key={i}>
                  <td>{r.scheduled_for.slice(0, 16)}</td>
                  <td>{r.sent_at?.slice(0, 16)}</td>
                  <td><span className={`badge ${r.status === 'sent' ? 'blue' : r.status === 'paused' ? 'amber' : 'gray'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <h2>Provenance</h2>
      </div>
    </div>
  );
}
