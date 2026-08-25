import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { computeTbGl, latestTbGl, documentDifference } from '@/lib/services/reconciliation';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';

export default async function ReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const latest = await latestTbGl(id);

  async function computeAction() {
    'use server';
    const { user } = await requireMember(id);
    await computeTbGl(id, user.id);
    revalidatePath(`/eng/${id}/reconciliation`);
  }

  async function documentAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await documentDifference(String(formData.get('item_id')), user.id, String(formData.get('note') ?? ''));
    revalidatePath(`/eng/${id}/reconciliation`);
  }

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>TB ↔ GL reconciliation (deterministic, L0)</h2>
          <form action={computeAction}>
            <button className="btn">Recompute</button>
          </form>
        </div>
        {!latest ? (
          <p className="muted">Not computed yet. Import the TB and the FEC first, then recompute.</p>
        ) : (
          <>
            <p>
              {latest.summary.accounts} accounts compared —{' '}
              {latest.items.length === 0 ? (
                <span className="badge green">all accounts tie</span>
              ) : (
                <span className="badge red">{latest.items.length} difference(s)</span>
              )}
              <span className="faint"> computed {latest.computed_at.slice(0, 16)}</span>
            </p>
            <p className="faint">
              Per-account differences are never netted; each one raises a typed exception.
              The population gate (Gate 2) is per tested FSLI: an open difference on the
              FSLI's accounts blocks its population build; a documented difference passes
              with the note rendered in the workpaper.
            </p>
            {latest.items.length > 0 && (
              <table className="data">
                <thead>
                  <tr><th>Account</th><th className="num">TB</th><th className="num">GL (FEC)</th><th className="num">Δ</th><th>Status</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {latest.items.map((it) => (
                    <tr key={it.id}>
                      <td className="mono">{it.account_no}</td>
                      <td className="num">{fmtEur(numToCents(it.tb_amount))}</td>
                      <td className="num">{fmtEur(numToCents(it.gl_amount))}</td>
                      <td className="num" style={{ color: 'var(--red)' }}>{fmtEur(numToCents(it.delta))}</td>
                      <td>
                        <span className={`badge ${it.status === 'open' ? 'red' : it.status === 'documented_difference' ? 'amber' : 'green'}`}>
                          {it.status}
                        </span>
                      </td>
                      <td>
                        {it.status === 'open' ? (
                          <form action={documentAction} className="row">
                            <input type="hidden" name="item_id" value={it.id} />
                            <input type="text" name="note" placeholder="explanation (required)" style={{ width: 260 }} required />
                            <button className="btn small secondary">Document difference</button>
                          </form>
                        ) : (
                          <span className="muted">{it.note}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
