import { requireMember } from '@/lib/core/auth';
import { revenuePopulation } from '@/lib/services/population';
import { fmtEur } from '@/lib/kernel/canon';
import { tr } from '@/lib/i18n';

export default async function PopulationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const t = await tr();
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
    return <div className="panel"><div className="callout danger">{error ?? t('pop.populationUnavailable')}</div></div>;
  }
  const flagged = pop.rows.filter((r) => r.flags.length > 0);
  const shown = view === 'all' ? pop.rows.slice(0, 200) : flagged;

  return (
    <div>
      <div className="grid cols-4">
        <div className="panel kpi"><span className="v">{pop.rows.length}</span><span className="l">{t('pop.glLines70xAccounts')}</span></div>
        <div className="panel kpi"><span className="v">{fmtEur(pop.totalCents, 'fr')}</span><span className="l">{t('pop.populationAmount')}</span></div>
        <div className="panel kpi"><span className="v">{flagged.length}</span><span className="l">{t('pop.riskFlaggedLinesAdr003')}</span></div>
        <div className="panel kpi">
          <span className="v">{pop.gate.ok ? '✓' : '✗'}</span>
          <span className="l">{t('pop.reconciliationGate')} {pop.gate.ok ? 'passed' : `blocked: ${pop.gate.blocking.join(', ')}`}</span>
        </div>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{view === 'all' ? t('pop.populationFirst200Lines') : t('pop.riskFlaggedLines')}</h2>
          <span>
            <a className="btn secondary small" href={`?view=${view === 'all' ? 'flags' : 'all'}`}>
              {view === 'all' ? t('pop.showFlaggedOnly') : t('pop.showFullPopulation')}
            </a>
          </span>
        </div>
        {/* L'EMPREINTE DE POPULATION : l'échantillon s'y lie, et une population
            changée force un nouveau tirage (ADR-016). C'est la provenance du
            tirage — la supprimer rendait le lien invérifiable à l'écran. */}
        <p className="faint">
          {t('pop.empreinte')} <span className="mono">{pop.hash.slice(0, 30)}…</span>
        </p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>{t('col.entry')}</th><th>{t('col.date')}</th><th>{t('col.account')}</th><th>{t('col.piece')}</th><th>{t('col.counterparty')}</th><th className="num">{t('col.amount')}</th><th>{t('col.flags')}</th></tr>
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
