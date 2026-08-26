import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { q } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { PORTAL_TOKENS } from '@/lib/seed';
import { NouvelleMission } from './nouvelle-mission';

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
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  const user = await getSessionUser();
  const users = await q<{ id: string; name: string; firm_role: string }>(
    `select id, name, firm_role from app_user order by name`,
  );

  if (!user) {
    return (
      <div className="shell" style={{ maxWidth: 560 }}>
        <div className="panel">
          <h1>Sign in — demo mode</h1>
          <p className="muted">
            Local demo authentication (no passwords). Production uses Supabase Auth magic
            links — see DEPLOY.md.
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
            Client portal (magic links): <Link href={`/portal/${PORTAL_TOKENS.sophie}`}>Sophie Marchand (CFO)</Link>
            {' · '}
            <Link href={`/portal/${PORTAL_TOKENS.theo}`}>Théo Girard (chef comptable)</Link>
          </p>
        </div>
      </div>
    );
  }

  const engagements = await q<{
    id: string; name: string; kind: string; status: string; framework_set: { assurance_packs: string[]; accounting_map: string; language: string };
    entity_name: string; period_label: string;
  }>(
    `select e.id, e.name, e.kind, e.status, e.framework_set, en.name entity_name, p.label period_label
     from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     join entity en on en.id = e.entity_id
     join period p on p.id = e.period_id
     order by e.name`,
    [user.id],
  );

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Engagements</h1>
        <span className="row" style={{ gap: 8 }}>
          {/* La méthode du cabinet n'est pas un réglage d'une mission : elle est
              au-dessus d'elles toutes, et c'est pour ça qu'elle est ici. */}
          <Link href="/methodology" className="btn secondary small">La méthode du cabinet</Link>
          <form action={logoutAction}>
            <button className="btn secondary small">Switch user</button>
          </form>
        </span>
      </div>
      <NouvelleMission tenantId={user.tenant_id} erreur={erreur} />

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Engagement</th>
              <th>Entity</th>
              <th>Period</th>
              <th>Frameworks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {engagements.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/eng/${e.id}`}>{e.name}</Link>
                </td>
                <td>{e.entity_name}</td>
                <td>{e.period_label}</td>
                <td>
                  {e.framework_set.assurance_packs.map((p) => (
                    <span key={p} className="badge blue" style={{ marginRight: 4 }}>{p}</span>
                  ))}
                  <span className="badge gray">{e.framework_set.accounting_map}</span>{' '}
                  <span className="badge gray">{e.framework_set.language}</span>
                </td>
                <td><span className={`badge ${e.status === 'locked' ? 'amber' : 'green'}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint">
        Fictional demo world: Vermeil Audit — Altiverre SAS (French subsidiary of Meridian
        Industrial Group, Inc., US-listed, fictional). All data synthetic.
      </p>
    </div>
  );
}
