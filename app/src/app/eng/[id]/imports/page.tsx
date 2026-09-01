import { requireMember } from '@/lib/core/auth';
import { listImports, activeTb, drawnSamples } from '@/lib/services/imports';
import type { Violation } from '@/lib/kernel/types';
import { uploadTbAction, uploadFecAction } from './actions';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function ImportsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;
  const imports = await listImports(id);
  const tbCur = await activeTb(id, 'current');
  const tbPrior = await activeTb(id, 'prior');
  const affected = await drawnSamples(id);

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="grid cols-2">
        <div className="panel">
          <h2>{t('imp.trialBalanceGenericImporter')}</h2>
          <p>
            Current: {tbCur ? <span className="badge green">{tbCur.accounts.length} accounts</span> : <span className="badge gray">{t('imp.notImported')}</span>}
            {'  '}Prior: {tbPrior ? <span className="badge green">{tbPrior.accounts.length} accounts</span> : <span className="badge gray">{t('imp.notImported')}</span>}
          </p>
          <form action={uploadTbAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".csv,.txt" required />
            <select name="period_kind" defaultValue="current">
              <option value="current">{t('imp.currentPeriodN')}</option>
              <option value="prior">{t('imp.priorPeriodN1')}</option>
            </select>
            <button className="btn">{t('imp.importTb')}</button>
          </form>
        </div>
        <div className="panel">
          <h2>{t('imp.generalLedgerFecAdapterFrancePack')}</h2>
          {affected.length > 0 && (
            <div className="callout warn">
              {t('imp.adr016')} {affected.length} {t('imp.drawnSampleSDependOnThe')}
            </div>
          )}
          <form action={uploadFecAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".txt,.csv" required />
            {affected.length > 0 && (
              <label className="row" style={{ gap: 4 }}>
                <input type="checkbox" name="confirm_invalidation" /> {t('imp.confirmInvalidation')}
              </label>
            )}
            <button className="btn">{t('imp.importFec')}</button>
          </form>
        </div>
      </div>

      <div className="panel">
        <h2>{t('imp.importHistoryValidationReports')}</h2>
        <table className="data">
          <thead>
            <tr><th>{t('col.file')}</th><th>{t('col.kind')}</th><th>{t('col.rows')}</th><th>{t('col.status')}</th><th>{t('col.violations')}</th><th>{t('col.when')}</th></tr>
          </thead>
          <tbody>
            {imports.map((f) => {
              const violations: Violation[] = f.validation_report?.violations ?? [];
              return (
                <tr key={f.id}>
                  <td className="mono">{f.filename}</td>
                  <td>{f.kind}</td>
                  <td className="num">{f.row_count}</td>
                  <td>
                    <span className={`badge ${f.status === 'validated' ? 'green' : f.status === 'rejected' ? 'red' : 'amber'}`}>{f.status}</span>
                  </td>
                  <td>
                    {violations.length === 0 ? (
                      <span className="faint">none</span>
                    ) : (
                      <details>
                        <summary>{violations.length} {t('imp.violationS')}</summary>
                        <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                          {violations.slice(0, 25).map((v, i) => (
                            <li key={i} className={v.severity === 'error' ? 'mono' : 'mono muted'} style={{ fontSize: 12 }}>
                              [{v.severity}] {v.code}
                              {v.line ? t('imp.ligneNo', { n: v.line }) : ''}: {v.message}
                            </li>
                          ))}
                          {violations.length > 25 && <li className="faint">… {violations.length - 25} more</li>}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="faint">{f.created_at.slice(0, 16)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
