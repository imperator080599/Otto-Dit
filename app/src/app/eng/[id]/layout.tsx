import Link from 'next/link';
import { q1 } from '@/lib/db/client';
import { requireMember } from '@/lib/core/auth';
import { EngNav } from './nav';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMember(id);
  const eng = await q1<{
    id: string; name: string; status: string;
    framework_set: { assurance_packs: string[]; accounting_map: string; language: string };
    entity_name: string; period_label: string;
  }>(
    `select e.id, e.name, e.status, e.framework_set, en.name entity_name, p.label period_label
     from engagement e join entity en on en.id = e.entity_id join period p on p.id = e.period_id
     where e.id = $1`,
    [id],
  );

  return (
    <div className="shell shell-wide">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="faint">
            <Link href="/">Engagements</Link> / {eng.entity_name} · {eng.period_label}
          </div>
          <h1>{eng.name}</h1>
        </div>
        <div className="row">
          {eng.framework_set.assurance_packs.map((p) => (
            <span key={p} className="badge blue">{p}</span>
          ))}
          <span className="badge gray">{eng.framework_set.accounting_map}</span>
          <span className="badge gray">{eng.framework_set.language}</span>
          <span className={`badge ${eng.status === 'locked' ? 'amber' : 'green'}`}>{eng.status}</span>
        </div>
      </div>
      <EngNav engId={eng.id} packs={eng.framework_set.assurance_packs} />
      {children}
    </div>
  );
}
