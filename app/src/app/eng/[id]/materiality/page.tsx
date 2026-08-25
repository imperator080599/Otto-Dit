import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { propose, validate, currentMateriality, materialityVersions } from '@/lib/services/materiality';
import { proposeScoping } from '@/lib/services/fsli';
import { primaryPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';

export default async function MaterialityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const current = await currentMateriality(id);
  const versions = await materialityVersions(id);
  const fs = await frameworkSet(id);
  const pack = primaryPack(fs as never);

  async function proposeAction() {
    'use server';
    const { user } = await requireMember(id);
    await propose(id, user.id);
    revalidatePath(`/eng/${id}/materiality`);
  }

  async function validateAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const mid = String(formData.get('materiality_id'));
    const benchmarkCode = String(formData.get('benchmark_code') ?? '');
    const pctRaw = String(formData.get('pct') ?? '');
    const adjust = formData.get('adjust') === 'on' && benchmarkCode && pctRaw
      ? { benchmarkCode, pct: Number(pctRaw) / 100 }
      : undefined;
    await validate(mid, user.id, adjust);
    await proposeScoping(id, user.id);
    revalidatePath(`/eng/${id}/materiality`);
    revalidatePath(`/eng/${id}/scoping`);
  }

  return (
    <div className="grid cols-2">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Materiality — {pack.name}</h2>
          <form action={proposeAction}>
            <button className="btn secondary">Propose (L3)</button>
          </form>
        </div>
        {!current ? (
          <p className="muted">No proposal yet. The engine proposes a benchmark, %, and written rationale from the pack rules; a human validates (L3) and the arithmetic is deterministic (L0).</p>
        ) : (
          <>
            <p>
              <span className={`badge ${current.status === 'validated' ? 'green' : 'amber'}`}>{current.status}</span>{' '}
              <span className="badge gray">v{current.version}</span>{' '}
              <span className="ai-flag">engine proposal — human decides</span>
            </p>
            <div className="grid cols-2">
              <div className="kpi"><span className="v">{fmtEur(numToCents(current.amount), 'fr')}</span><span className="l">Materiality ({current.benchmark_code} @ {(current.pct * 100).toFixed(1)}%)</span></div>
              <div className="kpi"><span className="v">{fmtEur(numToCents(current.perf_amount), 'fr')}</span><span className="l">Performance materiality ({(current.perf_pct * 100).toFixed(0)}%)</span></div>
              <div className="kpi"><span className="v">{fmtEur(numToCents(current.ctt_amount), 'fr')}</span><span className="l">Clearly trivial threshold ({(current.ctt_pct * 100).toFixed(0)}%)</span></div>
              <div className="kpi"><span className="v">{fmtEur(numToCents(current.te_amount), 'fr')}</span><span className="l">Tolerable misstatement (sampling)</span></div>
            </div>
            <h3>Rationale (pack language)</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{current.rationale}</p>
            {current.status === 'proposed' && (
              <form action={validateAction} className="mt">
                <input type="hidden" name="materiality_id" value={current.id} />
                <div className="row">
                  <label className="row" style={{ gap: 4 }}>
                    <input type="checkbox" name="adjust" /> adjust before validating:
                  </label>
                  <select name="benchmark_code" defaultValue={current.benchmark_code}>
                    {pack.materiality.benchmarks.map((b) => (
                      <option key={b.code} value={b.code}>{b.label.en} ({(b.pctRange[0] * 100).toFixed(1)}–{(b.pctRange[1] * 100).toFixed(1)}%)</option>
                    ))}
                  </select>
                  <input type="number" name="pct" step="0.1" min="0.1" max="10" defaultValue={(current.pct * 100).toFixed(1)} style={{ width: 80 }} /> %
                  <button className="btn">Validate (computes thresholds + proposes scoping)</button>
                </div>
              </form>
            )}
            {current.status === 'validated' && (
              <p className="faint">Validated {current.validated_at?.slice(0, 16)} — scoping proposals refreshed.</p>
            )}
          </>
        )}
      </div>
      <div className="panel">
        <h2>Versions</h2>
        <table className="data">
          <thead><tr><th>v</th><th>Benchmark</th><th className="num">Materiality</th><th>Status</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.version}</td>
                <td>{v.benchmark_code}</td>
                <td className="num">{fmtEur(numToCents(v.amount), 'fr')}</td>
                <td><span className={`badge ${v.status === 'validated' ? 'green' : v.status === 'proposed' ? 'amber' : 'gray'}`}>{v.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint mt">
          Every version is kept (supersede, never overwrite). The validation act, validator
          and timestamp are in the event log.
        </p>
      </div>
    </div>
  );
}
