import { requireMember } from '@/lib/core/auth';
import { listImports, activeTb, drawnSamples } from '@/lib/services/imports';
import type { Violation } from '@/lib/kernel/types';
import { uploadTbAction, uploadFecAction } from './actions';
import { BandeauRefus } from '@/app/bandeau-refus';

export const dynamic = 'force-dynamic';

export default async function ImportsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
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
          <h2>Trial balance (generic importer)</h2>
          <p>
            Current: {tbCur ? <span className="badge green">{tbCur.accounts.length} accounts</span> : <span className="badge gray">not imported</span>}
            {'  '}Prior: {tbPrior ? <span className="badge green">{tbPrior.accounts.length} accounts</span> : <span className="badge gray">not imported</span>}
          </p>
          <form action={uploadTbAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".csv,.txt" required />
            <select name="period_kind" defaultValue="current">
              <option value="current">Current period (N)</option>
              <option value="prior">Prior period (N-1)</option>
            </select>
            <button className="btn">Import TB</button>
          </form>
        </div>
        <div className="panel">
          <h2>General ledger — FEC adapter (France pack)</h2>
          {affected.length > 0 && (
            <div className="callout warn">
              ADR-016 — {affected.length} drawn sample(s) depend on the current ledger.
              Re-importing requires confirming downstream invalidation (samples superseded,
              workpapers flagged outdated, all logged).
            </div>
          )}
          <form action={uploadFecAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".txt,.csv" required />
            {affected.length > 0 && (
              <label className="row" style={{ gap: 4 }}>
                <input type="checkbox" name="confirm_invalidation" /> confirm invalidation
              </label>
            )}
            <button className="btn">Import FEC</button>
          </form>
        </div>
      </div>

      <div className="panel">
        <h2>Import history & validation reports</h2>
        <table className="data">
          <thead>
            <tr><th>File</th><th>Kind</th><th>Rows</th><th>Status</th><th>Violations</th><th>When</th></tr>
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
                        <summary>{violations.length} violation(s)</summary>
                        <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                          {violations.slice(0, 25).map((v, i) => (
                            <li key={i} className={v.severity === 'error' ? 'mono' : 'mono muted'} style={{ fontSize: 12 }}>
                              [{v.severity}] {v.code}
                              {v.line ? ` (line ${v.line})` : ''}: {v.message}
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
