import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { q } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { PORTAL_TOKENS } from '@/lib/seed';
import { missionsParClient } from '@/lib/services/bascule';
import { demoPublique } from '@/lib/core/demo-public';
import { NouvelleMission } from './nouvelle-mission';
import { tr } from '@/lib/i18n';
import { sansLocataire } from '@/lib/db/sans-locataire';

// Home: dev sign-in switcher (ADR-006) + engagement list for the signed-in auditor.

async function loginAction(formData: FormData) {
  'use server';
  const userId = String(formData.get('user_id') ?? '');
  if (userId) {
    const store = await cookies();
    store.set('otto_user', userId, { httpOnly: true, sameSite: 'lax', path: '/' });
  }
  redirect('/');
}

async function logoutAction() {
  'use server';
  const store = await cookies();
  store.delete('otto_user');
  redirect('/');
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; remis?: string }>;
}) {
  const { erreur, remis } = await searchParams;
  const t = await tr();
  const user = await getSessionUser();
  /* L'ÉCRAN D'ENTRÉE PRÉCÈDE TOUTE SESSION — dérogation NOMMÉE
     (clé « choix-identite », app/src/lib/db/sans-locataire.ts). */
  const users = await sansLocataire('choix-identite', () =>
    q<{ id: string; name: string; firm_role: string }>(
      `select id, name, firm_role from app_user order by name`));

  if (!user) {
    return (
      <div className="shell" style={{ maxWidth: 560 }}>
        <div className="panel">
          <h1>{t('home.connexionDemo')}</h1>
          <p className="muted">
            {t('home.authLocale')}
          </p>
          <form action={loginAction}>
            {users.map((u) => (
              <p key={u.id}>
                <button className="btn secondary" name="user_id" value={u.id} style={{ width: '100%', textAlign: 'left' }}>
                  {u.name} — {u.firm_role}
                </button>
              </p>
            ))}
          </form>
          <p className="faint mt">
            {t('home.portailClient')} <Link href={`/portal/${PORTAL_TOKENS.sophie}`}>{t('home.sophie')}</Link>
            {' · '}
            <Link href={`/portal/${PORTAL_TOKENS.theo}`}>{t('home.thOGirardChiefAccountant')}</Link>
          </p>
        </div>
      </div>
    );
  }

  /* Les missions GROUPÉES PAR CLIENT (ADR-100) : un groupe est un client,
     plusieurs entités, parfois plusieurs mandats — jamais une liste plate. */
  const clients = await missionsParClient(user.id);

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('col.engagements')}</h1>
        <span className="row" style={{ gap: 8 }}>
          {/* La méthode du cabinet n'est pas un réglage d'une mission : elle est
              au-dessus d'elles toutes, et c'est pour ça qu'elle est ici. */}
          <Link href="/methodology" className="btn secondary small">{t('commun.methode')}</Link>
          {/* LE GESTE, PAS LA VARIABLE D'ENVIRONNEMENT. Il n'existe que sur la
              démonstration publique : ailleurs, aucun écran ne rase un dossier. */}
          {demoPublique() && (
            <Link href="/demo/remise-a-zero" className="btn secondary small">
              {t('raz.titre')}
            </Link>
          )}
          <form action={logoutAction}>
            <button className="btn secondary small">{t('commun.changerUtilisateur')}</button>
          </form>
        </span>
      </div>
      {remis === '1' && (
        <div className="panel">
          <p>
            <span className="badge green">{t('home.demonstrationWorldReset')}</span> {t('home.everythingIsBackToTheState')}
          </p>
        </div>
      )}
      <NouvelleMission tenantId={user.tenant_id} erreur={erreur} />

      {/* GROUPÉES PAR CLIENT (ADR-100) : le groupe est le client, ses
          entités dessous, leurs mandats dessous — jamais une liste plate. */}
      {clients.map((c) => (
        <div className="panel" key={c.client}>
          <h2>{c.client}</h2>
          {c.entites.map((en) => (
            <div key={en.entity_id}>
              {en.entity_name !== c.client && <p style={{ margin: '4px 0' }}>{en.entity_name}</p>}
              <table className="data">
                <tbody>
                  {en.missions.map((m) => (
                    <tr key={m.id}>
                      <td><Link href={`/eng/${m.id}`}>{m.name}</Link></td>
                      <td>{m.period_label}</td>
                      <td>
                        {m.packs.map((pk) => (
                          <span key={pk} className="badge blue" style={{ marginRight: 4 }}>{pk}</span>
                        ))}
                      </td>
                      <td><span className={`badge ${m.status === 'locked' ? 'amber' : 'green'}`}>{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
      {clients.length === 0 && (
        <div className="panel"><p className="muted">{t('home.noEngagementIsAssignedToYou')}</p></div>
      )}
    </div>
  );
}
