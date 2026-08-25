import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { whyEvidenceExists, whatSupportsConclusion, whereFigureFrom } from '@/lib/services/provenance';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';

// S9 — the three provenance questions, answered from stored links (P7). Pick an object on
// the left; the answer chain renders on the right. ≤3 clicks from anywhere in the app.

export default async function ProvenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; evidence?: string; workpaper?: string; item?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireMember(id);
  const question = sp.q ?? 'why';

  const evidences = await q<{ id: string; filename: string; doc_type: string | null }>(
    `select id, filename, doc_type from evidence where engagement_id = $1 order by created_at desc limit 40`,
    [id],
  );
  const workpapers = await q<{ id: string; code: string; version: number; status: string }>(
    `select id, code, version, status from workpaper where engagement_id = $1 order by code, version desc`,
    [id],
  );
  const items = await q<{ id: string; piece_ref: string | null; amount: string; aux_label: string | null }>(
    `select si.id, g.piece_ref, si.amount::text, g.aux_label
     from sample_item si join gl_entry g on g.id = si.unit_id
     join sample s on s.id = si.sample_id
     where s.engagement_id = $1 and s.status = 'drawn' order by si.amount desc limit 40`,
    [id],
  );

  const why = sp.evidence ? await whyEvidenceExists(id, sp.evidence) : null;
  const supports = sp.workpaper ? await whatSupportsConclusion(id, sp.workpaper) : null;
  const figure = sp.item ? await whereFigureFrom(id, sp.item) : null;

  return (
    <div>
      <div className="panel">
        <h2>Provenance — the three questions (P7)</h2>
        <div className="row">
          <Link className={`btn small ${question === 'why' ? '' : 'secondary'}`} href={`/eng/${id}/provenance?q=why`}>Why does this evidence exist?</Link>
          <Link className={`btn small ${question === 'supports' ? '' : 'secondary'}`} href={`/eng/${id}/provenance?q=supports`}>What supports this conclusion?</Link>
          <Link className={`btn small ${question === 'figure' ? '' : 'secondary'}`} href={`/eng/${id}/provenance?q=figure`}>Where did this figure come from?</Link>
        </div>
        <p className="faint mt">Every answer is a stored fact — the chain is walked, never reconstructed.</p>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          {question === 'why' && (
            <>
              <h2>Pick an evidence document</h2>
              <table className="data">
                <tbody>
                  {evidences.map((e) => (
                    <tr key={e.id}>
                      <td><Link href={`/eng/${id}/provenance?q=why&evidence=${e.id}`}>{e.filename}</Link></td>
                      <td><span className="badge gray">{e.doc_type ?? '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {question === 'supports' && (
            <>
              <h2>Pick a workpaper</h2>
              <table className="data">
                <tbody>
                  {workpapers.map((w) => (
                    <tr key={w.id}>
                      <td><Link href={`/eng/${id}/provenance?q=supports&workpaper=${w.id}`}>{w.code} v{w.version}</Link></td>
                      <td><span className="badge gray">{w.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {question === 'figure' && (
            <>
              <h2>Pick a tested item (figure)</h2>
              <table className="data">
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td><Link href={`/eng/${id}/provenance?q=figure&item=${i.id}`}>{i.piece_ref ?? i.id.slice(0, 8)}</Link></td>
                      <td>{i.aux_label}</td>
                      <td className="num">{fmtEur(numToCents(i.amount), 'fr')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Answer</h2>
          {why && (
            <ol style={{ paddingLeft: 18 }}>
              {why.map((n, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span className="badge blue">{n.kind}</span>{' '}
                  {n.href ? <Link href={n.href}>{n.label}</Link> : <strong>{n.label}</strong>}
                  {n.detail && <div className="faint">{n.detail}</div>}
                </li>
              ))}
            </ol>
          )}
          {supports && (
            <>
              <p>
                <strong>{supports.wp.code} v{supports.wp.version}</strong> <span className="badge gray">{supports.wp.status}</span>
                <br />
                <span className="faint">
                  Performed by engine {supports.run?.engine} {supports.run?.engine_version} (pack {supports.run?.pack_id}) —
                  facts hash {supports.wp.based_on_hash?.slice(0, 16)}…
                </span>
              </p>
              <h3>Validated by</h3>
              <ul style={{ paddingLeft: 18 }}>
                {supports.signoffs.map((s, i) => <li key={i}>{s.sign_role}: {s.user_name} ({s.signed_at.slice(0, 16)})</li>)}
                {supports.signoffs.length === 0 && <li className="faint">not yet signed</li>}
              </ul>
              <h3>Supporting evidence ({supports.evidence.length})</h3>
              <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                {supports.evidence.map((e) => (
                  <li key={e.id}>
                    <a href={`/api/blob/${e.id}`} target="_blank">{e.filename}</a>{' '}
                    <span className="faint">[{e.doc_type} · rung {e.rung}{e.verified_by ? ' · human-verified' : ''} · {e.sha256.slice(0, 10)}…]</span>
                  </li>
                ))}
              </ul>
              <h3>AI involvement ({supports.aiRuns.length} run(s))</h3>
              <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                {supports.aiRuns.map((r, i) => <li key={i}>{r.purpose} · {r.adapter}/{r.model} · {r.created_at.slice(0, 16)}</li>)}
                {supports.aiRuns.length === 0 && <li className="faint">no AI/OCR runs — deterministic rungs only</li>}
              </ul>
              {supports.edits.length > 0 && (
                <>
                  <h3>Manual modifications</h3>
                  <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                    {supports.edits.map((e, i) => <li key={i}><span className="mod-flag">{e.section}</span> {e.user_name}: {e.justification}</li>)}
                  </ul>
                </>
              )}
            </>
          )}
          {figure && (
            <>
              <h3>Ledger origin</h3>
              <p className="mono" style={{ fontSize: 12 }}>
                {figure.item.entry_no} · {figure.item.entry_date} · account {figure.item.account_no} · piece {figure.item.piece_ref}
                <br />debit {figure.item.debit} / credit {figure.item.credit} — imported from {figure.item.import_filename}
                <br />natural key {figure.item.natural_key}
              </p>
              <h3>Extractions</h3>
              {figure.extractions.map((x, i) => (
                <div key={i} className="callout">
                  <strong>{x.filename}</strong> <span className="badge violet">{x.rung}</span>{' '}
                  {x.verified_by && <span className="badge green">human-verified</span>}
                  <div className="faint mono">sha256 {x.sha256.slice(0, 16)}…</div>
                  <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                    {x.fields.slice(0, 8).map((f) => <li key={f.name}>{f.name} = {String(f.value).slice(0, 50)} (conf {f.confidence})</li>)}
                  </ul>
                </div>
              ))}
              {figure.match && (
                <>
                  <h3>Vouching checks</h3>
                  <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                    {figure.match.checks.map((c, i) => (
                      <li key={i} style={{ color: c.pass ? 'var(--green)' : 'var(--red)' }}>
                        {c.check}: expected {c.expected}, found {c.found}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {!why && !supports && !figure && <p className="muted">Select an object on the left.</p>}
        </div>
      </div>
    </div>
  );
}
