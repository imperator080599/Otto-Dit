import { requireMember } from '@/lib/core/auth';
import { revenuePopulation } from '@/lib/services/population';
import { fmtEur } from '@/lib/kernel/canon';

export default async function PopulationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view } = await searchParams;
  await requireMember(id);
  let pop;
  let error: string | null = null;
  try {
    pop = await revenuePopulation(id);
  } catch (e) {
    error = String(e instanceof Error ? e.message : e);
  }
  if (error || !pop) {
    return <div className="panel"><div className="callout danger">{error ?? 'population unavailable'}</div></div>;
  }
  const flagged = pop.rows.filter((r) => r.flags.length > 0);
  const shown = view === 'all' ? pop.rows.slice(0, 200) : flagged;

  return (
    <div>
      <div className="grid cols-4">
        <div className="panel kpi"><span className="v">{pop.rows.length}</span><span className="l">GL lines (70x accounts)</span></div>
        <div className="panel kpi"><span className="v">{fmtEur(pop.totalCents, 'fr')}</span><span className="l">Population amount</span></div>
        <div className="panel kpi"><span className="v">{flagged.length}</span><span className="l">Risk-flagged lines (ADR-003)</span></div>
        <div className="panel kpi">
          <span className="v">{pop.gate.ok ? '✓' : '✗'}</span>
          <span className="l">Reconciliation gate {pop.gate.ok ? 'passed' : `blocked: ${pop.gate.blocking.join(', ')}`}</span>
        </div>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{view === 'all' ? 'Population (first 200 lines)' : 'Risk-flagged lines'}</h2>
          <span>
            <a className="btn secondary small" href={`?view=${view === 'all' ? 'flags' : 'all'}`}>
              {view === 'all' ? 'Show flagged only' : 'Show full population'}
            </a>
          </span>
        </div>
        <p className="faint">
          Population hash <span className="mono">{pop.hash.slice(0, 30)}…</span> — the sample
          binds to this hash; a changed population forces a re-draw (ADR-016). Flags are
          deterministic rules (weekend, round amount, manual journal, period end,
          credit-note pattern); auditors consume exceptions and flags, never raw
          populations (P8).
        </p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>Entry</th><th>Date</th><th>Account</th><th>Piece</th><th>Counterparty</th><th className="num">Amount</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.naturalKey}>
                  <td className="mono">{r.entryNo}</td>
                  <td>{r.entryDate}</td>
                  <td className="mono">{r.accountNo}</td>
                  <td className="mono">{r.pieceRef}</td>
                  <td>{r.auxLabel}</td>
                  <td className="num">{fmtEur(Math.abs(r.creditCents - r.debitCents), 'fr')}</td>
                  <td>
                    {r.flags.map((f) => (
                      <span key={f} className={`badge ${f === 'period_end' ? 'gray' : 'amber'}`} style={{ marginRight: 3 }}>{f}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
