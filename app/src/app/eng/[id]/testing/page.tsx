import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { runMatching, matchesForSample } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import { computeSampleEvaluation, concludeEvaluation, currentEvaluation, conclusionGate } from '@/lib/services/evaluation';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';

const MATCH_BADGE: Record<string, string> = { matched: 'green', exception: 'red', pending_evidence: 'gray', pending_verify: 'amber' };

export default async function TestingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const pending = await pendingVerifications(id);
  const matches = await matchesForSample(id).catch(() => []);
  const verifRun = await currentVerificationRun(id);
  const evaluation = await currentEvaluation(id);
  const gate = await conclusionGate(id);

  async function extractAction() {
    'use server';
    const { user } = await requireMember(id);
    await extractAll(id, user.id);
    revalidatePath(`/eng/${id}/testing`);
  }
  async function matchAction() {
    'use server';
    const { user } = await requireMember(id);
    await runMatching(id, user.id);
    revalidatePath(`/eng/${id}/testing`);
    revalidatePath(`/eng/${id}/exceptions`);
  }
  async function verifyAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await verifyExtraction(String(formData.get('extraction_id')), user.id);
    revalidatePath(`/eng/${id}/testing`);
  }
  async function startVerifRun() {
    'use server';
    const { user } = await requireMember(id);
    await startVerificationRun(id, user.id);
    revalidatePath(`/eng/${id}/testing`);
  }
  async function blindAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await submitBlindCheck({
      verificationRunId: String(formData.get('run_id')),
      sampleItemId: String(formData.get('sample_item_id')),
      verifierId: user.id,
      blind: {
        totalNetCents: Math.round(Number(formData.get('net')) * 100),
        invoiceDate: String(formData.get('date')),
      },
      escalationOnDisagree: 'expand_subsample',
    });
    revalidatePath(`/eng/${id}/testing`);
  }
  async function evalAction() {
    'use server';
    const { user } = await requireMember(id);
    await computeSampleEvaluation(id, user.id);
    revalidatePath(`/eng/${id}/testing`);
  }
  async function concludeAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await concludeEvaluation(String(formData.get('evaluation_id')), user.id, String(formData.get('basis') ?? ''));
    revalidatePath(`/eng/${id}/testing`);
  }

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Testing workbench — extraction → vouching → verification → evaluation</h2>
          <span className="row">
            <form action={extractAction}><button className="btn secondary">Run extraction ladder</button></form>
            <form action={matchAction}><button className="btn">Run vouching (L0)</button></form>
          </span>
        </div>
        <p className="faint">
          Ladder: Factur-X XML (exact) → PDF text layer (deterministic) → OCR/LLM adapter
          (recorded — always human-verified, ADR-012) → human. Vouching is deterministic
          with pack tolerances; exceptions land in the exceptions tab.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="panel">
          <h2>Extraction verification queue (L2 — side-by-side) <span className="badge amber">{pending.length}</span></h2>
          <table className="data">
            <thead><tr><th>Document</th><th>Rung</th><th>Confidence</th><th>Fields (machine)</th><th>Act</th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`/api/blob/${p.evidence_id}`} target="_blank" className="mono">{p.filename}</a>
                    <div className="faint">{p.item_description}</div>
                  </td>
                  <td><span className="ai-flag">{p.rung}</span></td>
                  <td className="num">{p.overall_confidence?.toFixed(2) ?? '—'}</td>
                  <td>
                    <details>
                      <summary>{p.fields.length} field(s)</summary>
                      <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: 12 }}>
                        {p.fields.map((f) => (
                          <li key={f.name} className={f.confidence < 0.9 ? 'mono' : 'mono muted'}>
                            {f.name} = {f.value.slice(0, 60)} <span className={f.confidence < 0.9 ? 'badge amber' : 'faint'}>{f.confidence}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>
                    <form action={verifyAction}>
                      <input type="hidden" name="extraction_id" value={p.id} />
                      <button className="btn small">Confirm fields (attest)</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2>Vouching results (per sampled item)</h2>
        {matches.length === 0 ? <p className="muted">Not run yet.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Piece</th><th>Counterparty</th><th className="num">Amount</th><th>Reason</th><th>Status</th><th>Checks</th></tr></thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.sample_item_id}>
                    <td className="mono">{m.piece_ref}</td>
                    <td>{m.aux_label}</td>
                    <td className="num">{fmtEur(numToCents(m.amount), 'fr')}</td>
                    <td><span className="badge gray">{m.selection_reason}</span></td>
                    <td><span className={`badge ${MATCH_BADGE[m.status]}`}>{m.status}</span></td>
                    <td>
                      {m.checks.length > 0 && (
                        <details>
                          <summary>{m.checks.filter((c) => c.pass).length}/{m.checks.length} pass</summary>
                          <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: 12 }}>
                            {m.checks.map((c, i) => (
                              <li key={i} className="mono" style={{ color: c.pass ? 'var(--green)' : 'var(--red)' }}>
                                {c.check}: {c.expected} vs {c.found} ({c.tolerance})
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Verification spot-check (ADR-012.3 — blind)</h2>
            {!verifRun && <form action={startVerifRun}><button className="btn secondary small">Draw subsample</button></form>}
          </div>
          {!verifRun ? (
            <p className="muted">Seeded, reproducible draw over machine-passed items; the verifier re-performs blind (no machine result shown) and agreement is computed.</p>
          ) : (
            <>
              <p className="faint">
                {verifRun.drawn_count} of {verifRun.machine_passed_count} machine-passed items — seed{' '}
                <span className="mono">{verifRun.seed}</span>
              </p>
              <table className="data">
                <thead><tr><th>Piece</th><th className="num">GL amount</th><th>Blind re-performance</th></tr></thead>
                <tbody>
                  {verifRun.items.map((it) => (
                    <tr key={it.sample_item_id}>
                      <td className="mono">{it.piece_ref}<div className="faint">{it.aux_label}</div></td>
                      <td className="num">{fmtEur(numToCents(it.amount), 'fr')}</td>
                      <td>
                        {it.result ? (
                          <span className={`badge ${it.result === 'agree' ? 'green' : 'red'}`}>{it.result}</span>
                        ) : (
                          <form action={blindAction} className="row">
                            <input type="hidden" name="run_id" value={verifRun.id} />
                            <input type="hidden" name="sample_item_id" value={it.sample_item_id} />
                            <input type="number" name="net" step="0.01" placeholder="Total HT (€)" style={{ width: 110 }} required />
                            <input type="date" name="date" required />
                            <button className="btn small">Submit blind</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="faint">Open the document from the evidence inbox to re-perform; the machine result stays hidden until submission.</p>
            </>
          )}
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Sample evaluation (vs TE)</h2>
            <form action={evalAction}><button className="btn secondary small">Recompute</button></form>
          </div>
          {!evaluation ? (
            <p className="muted">Known + projected misstatement vs tolerable misstatement (kernel arithmetic, Gate 2).</p>
          ) : (
            <>
              <div className="grid cols-2">
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.known_misstatement), 'fr')}</span><span className="l">Known misstatement</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.projected_misstatement), 'fr')}</span><span className="l">Projected ({evaluation.projection_method})</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.untested_amount), 'fr')}</span><span className="l">Untested remainder</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.te_amount), 'fr')}</span><span className="l">Tolerable misstatement</span></div>
              </div>
              {evaluation.status === 'draft' ? (
                <form action={concludeAction} className="mt">
                  <input type="hidden" name="evaluation_id" value={evaluation.id} />
                  <textarea name="basis" placeholder="Conclusion basis (L4 — human judgment, required)" required />
                  <button className="btn mt">Record conclusion (L4)</button>
                </form>
              ) : (
                <div className="callout green mt">Concluded: {evaluation.conclusion_basis}</div>
              )}
            </>
          )}
          <div className={`callout ${gate.ok ? 'green' : 'warn'} mt`}>
            Conclusion gate: {gate.ok ? 'OPEN — all exceptions dispositioned and evaluation concluded' : `${gate.openExceptions} exception(s) undispositioned${gate.evaluationConcluded ? '' : '; evaluation not concluded'}`}
            {' — '}<Link href={`/eng/${id}/exceptions`}>exceptions</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
