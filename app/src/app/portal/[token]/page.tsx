import Link from 'next/link';
import { portalSession } from '@/lib/core/auth';
import { portalRequests } from '@/lib/services/portal';
import { deuxLangues } from '@/app/portal/deux-langues';
import { traduire, type CleLibelle } from '@/lib/i18n/catalogue';

// Client portal (ADR-006 magic-link surface). Language follows the engagement (D10) —
// the demo entity's engagements are FR (NEP) and EN (SOX component).


const STATUTS = ['sent', 'partially_submitted', 'submitted', 'reopened'];

/** La langue du portail : celle de la première mission du contact — c'est la
 *  langue dans laquelle l'auditeur lui écrit. Sans mission, l'anglais. */
function langueDuPortail(reqs: { language?: string | null }[]): 'fr' | 'en' {
  return reqs[0]?.language === 'fr' ? 'fr' : 'en';
}

export default async function PortalHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await portalSession(token);
  if (!session) return <div className="shell"><div className="panel">{deuxLangues('portal.lienInvalide')}</div></div>;
  const requests = await portalRequests(session.contact.entity_id);
  const byEng = new Map<string, typeof requests>();
  for (const r of requests) byEng.set(r.engagement_name, [...(byEng.get(r.engagement_name) ?? []), r]);

  return (
    <div className="shell" style={{ maxWidth: 860 }}>
      <h1>{traduire(langueDuPortail(requests), 'portal.bonjour', { nom: session.contact.name })}</h1>
      {[...byEng.entries()].map(([engName, reqs]) => {
        const lang = (reqs[0].language === 'fr' ? 'fr' : 'en') as 'fr' | 'en';
        const t = (cle: CleLibelle, vars?: Record<string, string | number>) => traduire(lang, cle, vars);
        return (
          <div className="panel" key={engName}>
            <h2>{engName}</h2>
            <table className="data">
              <thead><tr><th>#</th><th>{t('portal.demande')}</th><th>{t('portal.statut')}</th><th>{t('portal.echeance')}</th><th></th></tr></thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">R-{String(r.seq_no).padStart(3, '0')}</td>
                    <td>{r.title}</td>
                    <td><span className={`badge ${r.status === 'submitted' ? 'green' : r.status === 'sent' ? 'blue' : 'amber'}`}>{STATUTS.includes(r.status) ? t(`portal.statut.${r.status}` as CleLibelle) : r.status}</span></td>
                    <td>{r.due_date}</td>
                    <td><Link className="btn small" href={`/portal/${token}/${r.id}`}>{t('portal.ouvrir')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {requests.length === 0 && <div className="panel muted">{deuxLangues('portal.aucuneDemande')}</div>}
    </div>
  );
}
