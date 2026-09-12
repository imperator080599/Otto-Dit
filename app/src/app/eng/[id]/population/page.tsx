import { requireMember } from '@/lib/core/auth';
import { revenuePopulation } from '@/lib/services/population';
import { fmtEur } from '@/lib/kernel/canon';
import { tr } from '@/lib/i18n';
import { separerCode } from '@/app/refus';

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
    /* D.6 point 1 (mandat, épreuve de l'épure) : cet échec est un échec de
       CHARGEMENT de page, pas un refus d'action posté via `?erreur=` — donc
       pas de BandeauRefus (« rien n'a été enregistré » n'aurait aucun sens
       ici), mais la même règle phrase-avant-code s'applique. */
    const { code, phrase } = separerCode(error ?? t('pop.populationUnavailable'));
    return (
      <div className="panel">
        <div className="callout danger">{phrase}{code && <span className="faint mono"> ({code})</span>}</div>
      </div>
    );
  }
  const flagged = pop.rows.filter((r) => r.flags.length > 0);
  const shown = view === 'all' ? pop.rows.slice(0, 200) : flagged;

  return (
    <div>
      {/* R60 (D.6 point 4) : les deux compteurs de LIGNES mènent vers le même
          tableau, ci-dessous, basculé sur la vue qu'ils comptent — le tableau
          ne peut montrer qu'une des deux vues à la fois, alors le compteur
          pointe vers la bonne. CE QUE CE LIEN NE CORRIGE PAS (règle 19,
          signalé par la revue hostile du 10 septembre, pas réparé ici — hors
          périmètre de R60, qui demande un lien réel, pas une pagination
          complète) : `?view=all` tronque à 200 lignes (ligne `shown` plus
          bas) ; sur une population de plus de 200 lignes, le compteur promet
          un total que la vue n'affiche pas en entier — le titre de la page
          le dit alors (« 200 premières lignes »), mais seulement là. */}
      <div className="grid cols-4">
        <a className="panel kpi" href="?view=all"><span className="v">{pop.rows.length}</span><span className="l">{t('pop.glLines70xAccounts')}</span></a>
        <div className="panel kpi"><span className="v">{fmtEur(pop.totalCents, 'fr')}</span><span className="l">{t('pop.populationAmount')}</span></div>
        <a className="panel kpi" href="?view=flags"><span className="v">{flagged.length}</span><span className="l">{t('pop.riskFlaggedLinesAdr003')}</span></a>
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
