import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { elementsIaNonValides } from '@/lib/services/notifications';
import { tr } from '@/lib/i18n';

// LE CENTRE DE NOTIFICATIONS, VUE DOSSIER (mandat 2026-09-14, §3) — la
// destination de la famille d'obstacle `iaNonValide` (NOTIF-01) : ce qui,
// sur CE dossier, empêche le visa parce que l'IA l'a préparé et que personne
// ne l'a encore validé. Rien n'y est stocké — `elementsIaNonValides` est le
// MÊME calcul que celui qui alimente l'obstacle lui-même, jamais une seconde
// liste. La vue « tous mes dossiers » vit sur `/travaux` (panneau « Ce que
// je dois approuver ») ; celle-ci reste dossier par dossier, comme chaque
// autre destination d'obstacle.

export const dynamic = 'force-dynamic';

export default async function NotificationsDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const t = await tr();
  const elements = await elementsIaNonValides(id);

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('notif.page.titre')}</h1>
        <span className={`badge ${elements.length ? 'amber' : 'green'}`}>{elements.length}</span>
      </div>
      <p className="faint">{t('notif.page.quoi')}</p>

      {elements.length === 0 ? (
        <div className="panel">
          <p><span className="badge green">{t('notif.page.aucun')}</span></p>
        </div>
      ) : (
        <div className="panel">
          <table className="data">
            <thead>
              <tr>
                <th>{t('notif.col.element')}</th>
                <th>{t('notif.col.niveau')}</th>
                <th>{t('col.date')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {elements.map((e) => (
                <tr key={e.id} data-notification={e.id} data-notification-nature={e.nature}>
                  <td>{t(e.titre.cle, e.titre.vars)}</td>
                  <td className="faint">{e.niveau}</td>
                  <td className="faint">{e.quand ?? t('notif.dateNonMesuree')}</td>
                  <td><Link href={e.href}>{t('obst.aller')} →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
