import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { listRequests, ensureReminders } from '@/lib/services/requests';
import { tr } from '@/lib/i18n';

const STATUS_BADGE: Record<string, string> = {
  draft: 'gray', sent: 'blue', partially_submitted: 'amber', submitted: 'green', accepted: 'green', reopened: 'red',
};

export default async function RequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  await ensureReminders(id);
  const requests = await listRequests(id);

  return (
    <div className="panel">
      <h2>{t('req.clientRequestsPbc')}</h2>
      <table className="data">
        <thead>
          <tr><th>#</th><th>{t('col.title')}</th><th>{t('col.status')}</th><th>{t('col.items')}</th><th>{t('col.due')}</th><th>{t('req.remindersSent')}</th></tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="mono">R-{String(r.seq_no).padStart(3, '0')}</td>
              <td><Link href={`/eng/${id}/requests/${r.id}`}>{r.title}</Link></td>
              <td><span className={`badge ${STATUS_BADGE[r.status] ?? 'gray'}`}>{r.status}</span></td>
              <td>
                {r.done_count}/{r.item_count}
                <div className="progressbar" style={{ width: 90, marginTop: 3 }}>
                  <div style={{ width: `${(Number(r.done_count) / Math.max(1, Number(r.item_count))) * 100}%` }} />
                </div>
              </td>
              <td>{r.due_date}</td>
              <td className="num">{r.reminder_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <p className="muted">{t('req.noRequestsYetDrawASample')}</p>}
    </div>
  );
}
