import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from '@/lib/services/sampling';
import { generatePbcFromSample } from '@/lib/services/requests';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const REASON_BADGE: Record<string, string> = { high_value: 'blue', risk_flag: 'amber', random: 'gray' };

export default async function SamplingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const sample = await currentRevenueSample(id);

  async function proposeAction() {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await proposeRevenueSample(id, user.id);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function validateAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      const edits: { coverageCapCents?: number; randomSize?: number; seed?: string } = {};
      const cap = String(formData.get('coverage_cap') ?? '');
      const size = String(formData.get('random_size') ?? '');
      const seed = String(formData.get('seed') ?? '');
      if (cap) edits.coverageCapCents = Math.round(Number(cap) * 100);
      if (size) edits.randomSize = Number(size);
      if (seed) edits.seed = seed;
      await validateSampleParams(String(formData.get('sample_id')), user.id, edits);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function drawAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await drawRevenueSample(String(formData.get('sample_id')), user.id);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function pbcAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await generatePbcFromSample(id, String(formData.get('sample_id')), user.id);
      redirect(`/eng/${id}/requests`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Revenue sampling — propose (L3) → validate → draw (L0, deterministic)</h2>
          {!sample && (
            <form action={proposeAction}><button className="btn">Propose parameters</button></form>
          )}
        </div>
        {!sample ? (
          <p className="muted">No sampling yet. Prerequisites: reconciliation gate passed + validated materiality.</p>
        ) : (
          <>
            <p>
              <span className={`badge ${sample.status === 'drawn' ? 'green' : sample.status === 'validated' ? 'blue' : 'amber'}`}>{sample.status}</span>{' '}
              population {sample.population_size} lines / {fmtEur(numToCents(sample.population_amount), 'fr')} —{' '}
              hash <span className="mono faint">{sample.population_hash.slice(0, 24)}…</span>
            </p>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{sample.rationale}</p>
            {sample.status === 'proposed' && (
              <form action={validateAction} className="row">
                <input type="hidden" name="sample_id" value={sample.id} />
                <label className="fld"><span>Coverage cap (€)</span>
                  <input type="number" name="coverage_cap" defaultValue={(sample.params.coverageCapCents / 100).toFixed(0)} style={{ width: 110 }} />
                </label>
                <label className="fld"><span>Random size</span>
                  <input type="number" name="random_size" defaultValue={sample.params.randomSize} style={{ width: 70 }} />
                </label>
                <label className="fld"><span>Seed (deterministic)</span>
                  <input type="text" name="seed" defaultValue={sample.params.seed} style={{ width: 160 }} />
                </label>
                <button className="btn">Validate parameters (L3)</button>
              </form>
            )}
            {sample.status === 'validated' && (
              <form action={drawAction}>
                <input type="hidden" name="sample_id" value={sample.id} />
                <button className="btn">Draw sample (deterministic)</button>
              </form>
            )}
            {sample.status === 'drawn' && (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>Selected items ({sample.items.length}) — coverage {fmtEur(numToCents(sample.coverage_amount ?? '0'), 'fr')}</h3>
                  <form action={pbcAction}>
                    <input type="hidden" name="sample_id" value={sample.id} />
                    <button className="btn">Generate PBC request →</button>
                  </form>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr><th>Reason</th><th>Entry</th><th>Date</th><th>Account</th><th>Piece</th><th>Counterparty</th><th className="num">Amount</th><th>Flags</th></tr>
                    </thead>
                    <tbody>
                      {sample.items.map((it) => (
                        <tr key={it.id}>
                          <td><span className={`badge ${REASON_BADGE[it.selection_reason]}`}>{it.selection_reason}</span></td>
                          <td className="mono">{it.entry_no}</td>
                          <td>{it.entry_date}</td>
                          <td className="mono">{it.account_no}</td>
                          <td className="mono">{it.piece_ref}</td>
                          <td>{it.aux_label}</td>
                          <td className="num">{fmtEur(numToCents(it.amount), 'fr')}</td>
                          <td>{(it.flags ?? []).map((f) => <span key={f} className="badge amber" style={{ marginRight: 3 }}>{f}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
