import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { eventLog, eventVerbs, chainStatus } from '@/lib/services/provenance';

const ACTOR_BADGE: Record<string, string> = { user: 'blue', system: 'gray', ai: 'violet' };

export default async function EventsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ verb?: string; actor?: string }> }) {
  const { id } = await params;
  const { verb, actor } = await searchParams;
  const { user } = await requireMember(id);
  const events = await eventLog(id, { verb, actorKind: actor });
  const verbs = await eventVerbs(id);
  const chain = await chainStatus(user.tenant_id, id);

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Event log — append-only, hash-chained</h2>
          <span className={`badge ${chain.ok ? 'green' : 'red'}`}>
            {chain.ok ? `chain verified · ${chain.count} events` : `CHAIN BROKEN at #${chain.brokenAtId}`}
          </span>
        </div>
        <div className="row">
          <Link className={`btn small ${verb || actor ? 'secondary' : ''}`} href={`/eng/${id}/events`}>All</Link>
          {(['user', 'system', 'ai'] as const).map((a) => (
            <Link key={a} className={`btn small ${actor === a ? '' : 'secondary'}`} href={`/eng/${id}/events?actor=${a}`}>{a}</Link>
          ))}
          <select
            defaultValue={verb ?? ''}
            // server components can't take onChange; the links below cover filtering
            disabled
            style={{ opacity: 0.7 }}
          >
            <option value="">{verbs.length} distinct verbs</option>
          </select>
        </div>
        <div className="row mt" style={{ gap: 4 }}>
          {verbs.map((v) => (
            <Link key={v.verb} className={`badge ${verb === v.verb ? 'blue' : 'gray'}`} href={`/eng/${id}/events?verb=${v.verb}`} style={{ textDecoration: 'none' }}>
              {v.verb} ({v.n})
            </Link>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Verb</th><th>Object</th><th>Payload</th><th>Hash</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono faint">{e.id}</td>
                  <td className="faint">{e.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <span className={`badge ${ACTOR_BADGE[e.actor_kind]}`}>{e.actor_kind}</span>{' '}
                    {e.actor_name && <span className="faint">{e.actor_name}</span>}
                  </td>
                  <td className="mono">{e.verb}</td>
                  <td className="faint">{e.object_type}{e.object_id ? ` ${e.object_id.slice(0, 8)}` : ''}</td>
                  <td className="mono" style={{ fontSize: 11, maxWidth: 380, wordBreak: 'break-word' }}>
                    {JSON.stringify(e.payload).slice(0, 220)}
                  </td>
                  <td className="mono faint">{e.hash.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
