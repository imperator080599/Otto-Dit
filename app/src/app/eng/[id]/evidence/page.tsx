import { requireMember } from '@/lib/core/auth';
import { numeroDemande } from '@/lib/services/requests';
import { listEvidence } from '@/lib/services/evidence';
import { tr } from '@/lib/i18n';

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const evidence = await listEvidence(id);

  return (
    <div className="panel">
      <h2>{t('rail.pieces')}</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr><th>{t('col.file')}</th><th>{t('col.source')}</th><th>{t('evi.forRequestItem')}</th><th>{t('col.type')}</th><th>{t('col.dup')}</th><th>{t('mot.sha256')}</th><th>{t('col.received')}</th></tr>
          </thead>
          <tbody>
            {evidence.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.filename}{e.quarantined && <span className="badge red" style={{ marginLeft: 6 }}>{t('mot.quarantined')}</span>}</td>
                <td><span className="badge gray">{e.source}</span></td>
                <td className="muted" style={{ maxWidth: 280 }}>{e.request_seq !== null ? `${numeroDemande(e.request_seq)} · ` : ''}{e.item_description ?? '—'}</td>
                <td>{e.doc_type ? <span className="badge blue">{e.doc_type}</span> : <span className="faint">{t('mot.unclassified')}</span>}</td>
                <td>{Number(e.dup_count) > 1 ? <span className="badge amber">×{e.dup_count}</span> : <span className="faint">—</span>}</td>
                <td className="mono faint">{e.sha256.slice(0, 10)}…</td>
                <td className="faint">{e.created_at.slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.length === 0 && <p className="muted">{t('evi.nothingReceivedYet')}</p>}
    </div>
  );
}
