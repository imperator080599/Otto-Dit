import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { listWorkpapers } from '@/lib/services/workpapers/lifecycle';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { frameworkSet } from '@/lib/services/fsli';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const WP_BADGE: Record<string, string> = { draft: 'gray', in_review: 'blue', reviewed: 'amber', signed: 'green', outdated: 'red' };

export default async function WorkpapersPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const fs = await frameworkSet(id);
  const workpapers = await listWorkpapers(id);

  async function draftAction() {
    'use server';
    return executer(`/eng/${id}/workpapers`, async () => {
      const { user } = await requireMember(id);
      await draftRevenueWorkpaper(id, user.id);
      revalidatePath(`/eng/${id}/workpapers`);
    });
  }

  return (
    <div className="panel">
      <BandeauRefus erreur={erreur} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Workpapers</h2>
        {fs.assurance_packs.includes('nep-fr') && (
          <form action={draftAction}><button className="btn">Draft REV-01 (auto, from stored facts)</button></form>
        )}
      </div>
      <p className="faint">
        Assembled from stored facts — every figure click-through to source (P7).
        Attribution: performed by OTTO engine run, validated by humans (ADR-012.4).
        Re-drafting supersedes; sign-offs are dated and immutable.
      </p>
      <table className="data">
        <thead><tr><th>Code</th><th>Title</th><th>v</th><th>Status</th><th>Edits</th><th>Sign-offs</th><th>Open notes</th></tr></thead>
        <tbody>
          {workpapers.map((w) => (
            <tr key={w.id}>
              <td className="mono">{w.code}</td>
              <td><Link href={`/eng/${id}/workpapers/${w.id}`}>{w.title}</Link></td>
              <td>{w.version}</td>
              <td><span className={`badge ${WP_BADGE[w.status]}`}>{w.status}</span></td>
              <td>{Number(w.edit_count) > 0 ? <span className="mod-flag">modified ×{w.edit_count}</span> : <span className="faint">—</span>}</td>
              <td className="num">{w.signoff_count}</td>
              <td className="num">{w.note_open}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {workpapers.length === 0 && <p className="muted">No workpapers yet — complete testing, then draft.</p>}
    </div>
  );
}
