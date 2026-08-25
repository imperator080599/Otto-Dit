import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement } from '@/lib/services/matching';
import { frameworkSet } from '@/lib/services/fsli';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';

const STATUS_BADGE: Record<string, string> = {
  open: 'red', clarification_requested: 'amber', explained: 'blue', resolved: 'green', escalated: 'violet',
};

export default async function ExceptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const fs = await frameworkSet(id);
  const isSox = fs.assurance_packs.includes('pcaob-sox');
  const exceptions = await listExceptions(id);
  const misstatements = await q<{ id: string; kind: string; amount: string; corrected: boolean; status: string; notes: string | null }>(
    `select id, kind, amount::text, corrected, status, notes from misstatement where engagement_id = $1 order by created_at`,
    [id],
  );

  async function draftAction() {
    'use server';
    const { user } = await requireMember(id);
    const rid = await draftClarificationRequest(id, user.id);
    redirect(`/eng/${id}/requests/${rid}`);
  }
  async function resolveAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await resolveException(String(formData.get('exception_id')), user.id, String(formData.get('resolution') ?? ''));
    revalidatePath(`/eng/${id}/exceptions`);
  }
  async function escalateAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await escalateToMisstatement(String(formData.get('exception_id')), user.id, {
      kind: String(formData.get('kind')) as 'factual' | 'judgmental' | 'projected',
      amountCents: Math.round(Number(formData.get('amount')) * 100),
      corrected: formData.get('corrected') === 'on',
      notes: String(formData.get('notes') ?? '') || undefined,
    });
    revalidatePath(`/eng/${id}/exceptions`);
    revalidatePath(`/eng/${id}/testing`);
  }

  const open = exceptions.filter((x) => x.status === 'open');

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{isSox ? 'Deviations & exceptions' : 'Exceptions'} <span className="badge gray">{exceptions.length}</span></h2>
          {open.length > 0 && (
            <form action={draftAction}>
              <button className="btn">Draft clarification request ({open.length} open) — L2</button>
            </form>
          )}
        </div>
        <p className="faint">
          Typed objects with a lifecycle: open → clarification_requested → explained →
          resolved / escalated to misstatement. Auditors consume exceptions, never raw
          populations (P8). Every transition is event-logged.
        </p>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Type</th><th>Description</th><th className="num">Impact</th><th>Status</th><th>Disposition</th></tr></thead>
            <tbody>
              {exceptions.map((x) => (
                <tr key={x.id}>
                  <td><span className={`badge ${x.severity === 'high' ? 'red' : 'amber'}`}>{x.taxonomy_code}</span></td>
                  <td style={{ maxWidth: 420 }}>{x.description}{x.resolution && <div className="faint">↳ {x.resolution}</div>}</td>
                  <td className="num">{x.amount_impact ? fmtEur(numToCents(x.amount_impact), 'fr') : '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[x.status]}`}>{x.status}</span></td>
                  <td>
                    {(x.status === 'explained' || x.status === 'open') && (
                      <details>
                        <summary className="muted">act…</summary>
                        <form action={resolveAction} className="row" style={{ margin: '6px 0' }}>
                          <input type="hidden" name="exception_id" value={x.id} />
                          <input type="text" name="resolution" placeholder="resolution basis (required)" style={{ width: 220 }} required />
                          <button className="btn small secondary">Resolve</button>
                        </form>
                        <form action={escalateAction} className="row">
                          <input type="hidden" name="exception_id" value={x.id} />
                          <select name="kind" defaultValue="factual">
                            <option value="factual">factual</option>
                            <option value="judgmental">judgmental</option>
                            <option value="projected">projected</option>
                          </select>
                          <input type="number" name="amount" step="0.01" placeholder="€" style={{ width: 100 }} required />
                          <label className="row" style={{ gap: 3 }}><input type="checkbox" name="corrected" /> corrected</label>
                          <button className="btn small danger">→ Misstatement</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {misstatements.length > 0 && (
        <div className="panel">
          <h2>Misstatements (ISA 450-shaped ledger)</h2>
          <table className="data">
            <thead><tr><th>Kind</th><th className="num">Amount</th><th>Corrected</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {misstatements.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge violet">{m.kind}</span></td>
                  <td className="num">{fmtEur(numToCents(m.amount), 'fr')}</td>
                  <td>{m.corrected ? <span className="badge green">yes</span> : <span className="badge red">no</span>}</td>
                  <td><span className="badge gray">{m.status}</span></td>
                  <td className="muted">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
