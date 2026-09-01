import { requireMember } from '@/lib/core/auth';
import { listEvidence } from '@/lib/services/evidence';

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const evidence = await listEvidence(id);

  return (
    <div className="panel">
      <h2>Evidence inbox</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr><th>File</th><th>Source</th><th>For request item</th><th>Type</th><th>Dup</th><th>sha256</th><th>Received</th></tr>
          </thead>
          <tbody>
            {evidence.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.filename}{e.quarantined && <span className="badge red" style={{ marginLeft: 6 }}>quarantined</span>}</td>
                <td><span className="badge gray">{e.source}</span></td>
                <td className="muted" style={{ maxWidth: 280 }}>{e.request_seq !== null ? `R-${String(e.request_seq).padStart(3, '0')} · ` : ''}{e.item_description ?? '—'}</td>
                <td>{e.doc_type ? <span className="badge blue">{e.doc_type}</span> : <span className="faint">unclassified</span>}</td>
                <td>{Number(e.dup_count) > 1 ? <span className="badge amber">×{e.dup_count}</span> : <span className="faint">—</span>}</td>
                <td className="mono faint">{e.sha256.slice(0, 10)}…</td>
                <td className="faint">{e.created_at.slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.length === 0 && <p className="muted">Nothing received yet.</p>}
    </div>
  );
}
