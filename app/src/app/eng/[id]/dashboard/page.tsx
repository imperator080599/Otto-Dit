import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q1 } from '@/lib/db/client';
import { dashboard } from '@/lib/services/dashboard';
import { ensureReminders } from '@/lib/services/requests';
import { frameworkSet } from '@/lib/services/fsli';

const SEV_BADGE: Record<string, string> = { deficiency: 'amber', significant_deficiency: 'violet', material_weakness: 'red' };

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireMember(id);
  await ensureReminders(id);
  const d = await dashboard(id, user.tenant_id);
  const fs = await frameworkSet(id);
  const entity = await q1<{ entity_id: string }>(`select entity_id from engagement where id = $1`, [id]);

  return (
    <div>
      <div className="grid cols-4">
        <div className="panel kpi">
          <span className="v">{d.progressPct}%</span>
          <span className="l">Evidence received</span>
          <div className="progressbar mt"><div style={{ width: `${d.progressPct}%` }} /></div>
        </div>
        <div className="panel kpi">
          <span className="v" style={{ color: d.exceptions.open ? 'var(--red)' : 'var(--green)' }}>{d.exceptions.open}</span>
          <span className="l">Open exceptions ({d.exceptions.total} total, {d.exceptions.escalated} escalated)</span>
        </div>
        <div className="panel kpi">
          <span className="v" style={{ color: d.deviations.open ? 'var(--red)' : undefined }}>{d.deviations.total}</span>
          <span className="l">Control deviations ({d.deviations.open} open)</span>
        </div>
        <div className="panel kpi">
          <span className="v">{d.evidence.extracted}/{d.evidence.total}</span>
          <span className="l">Evidence extracted ({d.evidence.pendingVerify} pending verify)</span>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>Request tracker</h2>
          <table className="data">
            <thead><tr><th>#</th><th>Request</th><th>Status</th><th>Progress</th><th>Reminders</th></tr></thead>
            <tbody>
              {d.requests.map((r) => (
                <tr key={r.seq_no}>
                  <td className="mono">R-{String(r.seq_no).padStart(3, '0')}</td>
                  <td>{r.title}</td>
                  <td><span className={`badge ${r.status === 'submitted' ? 'green' : r.status === 'draft' ? 'gray' : 'amber'}`}>{r.status}</span></td>
                  <td>
                    {r.done_count}/{r.item_count}
                    <div className="progressbar" style={{ width: 80, marginTop: 3 }}>
                      <div style={{ width: `${(r.done_count / Math.max(1, r.item_count)) * 100}%` }} />
                    </div>
                  </td>
                  <td className="num">{r.reminders}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Exports (generated views — P6)</h2>
          <div className="row">
            <a className="btn secondary small" href={`/api/tracker/${id}?audience=team`}>Team tracker (Excel)</a>
            <a className="btn secondary small" href={`/api/tracker/${id}?audience=client`}>Client tracker (Excel)</a>
            <a className="btn secondary small" href={`/api/tracker/${id}?audience=group`}>Group/component tracker</a>
          </div>
        </div>

        <div className="panel">
          <h2>Workpapers</h2>
          <table className="data">
            <thead><tr><th>Code</th><th>v</th><th>Status</th><th>Last sign-off</th></tr></thead>
            <tbody>
              {d.workpapers.map((w) => (
                <tr key={w.code}>
                  <td className="mono">{w.code}</td>
                  <td>{w.version}</td>
                  <td><span className={`badge ${w.status === 'signed' ? 'green' : w.status === 'draft' ? 'gray' : 'amber'}`}>{w.status}</span></td>
                  <td>{w.reviewer ?? <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.deficiencies.length > 0 && (
            <>
              <h2>Deficiencies</h2>
              <div className="row">
                {d.deficiencies.map((x) => (
                  <span key={x.severity} className={`badge ${SEV_BADGE[x.severity] ?? 'gray'}`}>{x.severity.replace(/_/g, ' ')}: {x.n}</span>
                ))}
              </div>
            </>
          )}
          <h2>AI usage &amp; cost (D12)</h2>
          <p>
            <span className="ai-flag">{d.ai.runs} AI/OCR run(s)</span>{' '}
            <span className="faint">${d.ai.costUsd.toFixed(4)} — demo runs on recorded fixtures (zero live spend)</span>
          </p>
          <h2>Framework</h2>
          <div className="row">
            {fs.assurance_packs.map((p) => <span key={p} className="badge blue">{p}</span>)}
            <span className="badge gray">{fs.accounting_map}</span>
            <span className="badge gray">{fs.language}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
