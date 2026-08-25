import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { listImports, importTb, importFec, detectTbMapping, activeTb, drawnSamples } from '@/lib/services/imports';
import { rebuildFslis } from '@/lib/services/fsli';
import type { Violation } from '@/lib/kernel/types';

export default async function ImportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const imports = await listImports(id);
  const tbCur = await activeTb(id, 'current');
  const tbPrior = await activeTb(id, 'prior');
  const affected = await drawnSamples(id);

  async function uploadTb(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const file = formData.get('file') as File;
    const periodKind = String(formData.get('period_kind')) as 'current' | 'prior';
    const content = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const mapping = detectTbMapping(content.split(/\r?\n/)[0] ?? '');
    await importTb({ engagementId: id, userId: user.id, filename: file.name, content, mapping, periodKind });
    await rebuildFslis(id, user.id).catch(() => undefined);
    revalidatePath(`/eng/${id}/imports`);
  }

  async function uploadFec(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const file = formData.get('file') as File;
    const confirm = formData.get('confirm_invalidation') === 'on';
    const bytes = new Uint8Array(await file.arrayBuffer());
    await importFec({ engagementId: id, userId: user.id, filename: file.name, bytes, confirmInvalidation: confirm });
    revalidatePath(`/eng/${id}/imports`);
  }

  return (
    <div>
      <div className="grid cols-2">
        <div className="panel">
          <h2>Trial balance (generic importer)</h2>
          <p className="muted">
            CSV/Excel export with column mapping (auto-detected: account / label / debit /
            credit / balance; separators ; , tab; decimal comma). Re-import supersedes.
          </p>
          <p>
            Current: {tbCur ? <span className="badge green">{tbCur.accounts.length} accounts</span> : <span className="badge gray">not imported</span>}
            {'  '}Prior: {tbPrior ? <span className="badge green">{tbPrior.accounts.length} accounts</span> : <span className="badge gray">not imported</span>}
          </p>
          <form action={uploadTb} className="row">
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
          <p className="muted">
            Strict 18-field validator (art. A.47 A-1 LPF): field order, AAAAMMJJ dates,
            decimal comma, Montant/Sens variant, per-entry balance, filename
            SirenFECAAAAMMJJ. JE risk flags computed at import (ADR-003).
          </p>
          {affected.length > 0 && (
            <div className="callout warn">
              ADR-016 — {affected.length} drawn sample(s) depend on the current ledger.
              Re-importing requires confirming downstream invalidation (samples superseded,
              workpapers flagged outdated, all logged).
            </div>
          )}
          <form action={uploadFec} className="row">
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
