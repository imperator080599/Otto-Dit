import Link from 'next/link';
import { portalSession } from '@/lib/core/auth';
import { portalRequests } from '@/lib/services/portal';

// Client portal (ADR-006 magic-link surface). Language follows the engagement (D10) —
// the demo entity's engagements are FR (NEP) and EN (SOX component).

const STR = {
  fr: { title: 'Portail client — demandes de l’auditeur', status: { sent: 'À traiter', partially_submitted: 'Partiellement transmis', submitted: 'Transmis', reopened: 'Rouvert' } as Record<string, string>, due: 'Échéance', open: 'Ouvrir' },
  en: { title: 'Client portal — auditor requests', status: { sent: 'To do', partially_submitted: 'Partially submitted', submitted: 'Submitted', reopened: 'Reopened' } as Record<string, string>, due: 'Due', open: 'Open' },
};

export default async function PortalHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await portalSession(token);
  if (!session) return <div className="shell"><div className="panel">Lien invalide ou expiré. / Invalid or expired link.</div></div>;
  const requests = await portalRequests(session.contact.entity_id);
  const byEng = new Map<string, typeof requests>();
  for (const r of requests) byEng.set(r.engagement_name, [...(byEng.get(r.engagement_name) ?? []), r]);

  return (
    <div className="shell" style={{ maxWidth: 860 }}>
      <h1>Bonjour {session.contact.name}</h1>
      <p className="muted">Altiverre SAS — espace d’échange avec Vermeil Audit (démo, données fictives). Vous ne voyez ici que les demandes qui vous concernent.</p>
      {[...byEng.entries()].map(([engName, reqs]) => {
        const lang = (reqs[0].language === 'fr' ? 'fr' : 'en') as 'fr' | 'en';
        const t = STR[lang];
        return (
          <div className="panel" key={engName}>
            <h2>{engName}</h2>
            <table className="data">
              <thead><tr><th>#</th><th>{lang === 'fr' ? 'Demande' : 'Request'}</th><th>{lang === 'fr' ? 'Statut' : 'Status'}</th><th>{t.due}</th><th></th></tr></thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">R-{String(r.seq_no).padStart(3, '0')}</td>
                    <td>{r.title}</td>
                    <td><span className={`badge ${r.status === 'submitted' ? 'green' : r.status === 'sent' ? 'blue' : 'amber'}`}>{t.status[r.status] ?? r.status}</span></td>
                    <td>{r.due_date}</td>
                    <td><Link className="btn small" href={`/portal/${token}/${r.id}`}>{t.open}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {requests.length === 0 && <div className="panel muted">Aucune demande en cours. / No open requests.</div>}
    </div>
  );
}
