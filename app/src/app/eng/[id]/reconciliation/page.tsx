import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { computeTbGl, latestTbGl, documentDifference, noteReconciliationLimitation } from '@/lib/services/reconciliation';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

export default async function ReconciliationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const latest = await latestTbGl(id);
  // Ce qui peut être LIÉ en corroboration : la même liste que sur les exceptions.
  const corroborations = [
    ...(await q<{ id: string; filename: string; doc_type: string | null }>(
      `select id, filename, doc_type from evidence where engagement_id = $1 and quarantined = false order by filename`,
      [id],
    )).map((e) => ({ value: `ev:${e.id}`, label: `pièce · ${e.filename}${e.doc_type ? ` [${e.doc_type}]` : ''}` })),
    ...(await q<{ id: string; entry_no: string; piece_ref: string | null; entry_date: string }>(
      `select id, entry_no, piece_ref, entry_date::text from gl_entry
       where engagement_id = $1 and journal_code = 'OD' order by entry_date desc limit 25`,
      [id],
    )).map((g) => ({ value: `gl:${g.id}`, label: `écriture · ${g.entry_no} ${g.piece_ref ?? ''} (${g.entry_date})` })),
  ];

  async function computeAction() {
    'use server';
    return executer(`/eng/${id}/reconciliation`, async () => {
      const { user } = await requireMember(id);
      await computeTbGl(id, user.id);
      revalidatePath(`/eng/${id}/reconciliation`);
    });
  }

  async function documentAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/reconciliation`, async () => {
      const { user } = await requireMember(id);
      const [kind, refId] = String(formData.get('corroboration') ?? '').split(':');
      await documentDifference(String(formData.get('item_id')), user.id, {
        explanation: String(formData.get('explanation') ?? ''),
        conclusion: String(formData.get('conclusion') ?? ''),
        disposition: String(formData.get('disposition') ?? 'no_misstatement') as 'corrected' | 'no_misstatement' | 'compensated' | 'already_accumulated',
        corroboration: kind === 'gl' ? { glEntryId: refId } : { evidenceId: refId },
      });
      revalidatePath(`/eng/${id}/reconciliation`);
    });
  }

  async function limitationAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/reconciliation`, async () => {
      const { user } = await requireMember(id);
      await noteReconciliationLimitation(String(formData.get('item_id')), user.id, {
        explanation: String(formData.get('explanation') ?? ''),
        alternativeProcedures: String(formData.get('alternative') ?? ''),
      });
      revalidatePath(`/eng/${id}/reconciliation`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>TB ↔ GL reconciliation (deterministic, L0)</h2>
          <form action={computeAction}>
            <button className="btn">Recompute</button>
          </form>
        </div>
        {!latest ? (
          <p className="muted">Not computed yet. Import the TB and the FEC first, then recompute.</p>
        ) : (
          <>
            <p>
              {latest.summary.accounts} accounts compared —{' '}
              {latest.items.length === 0 ? (
                <span className="badge green">all accounts tie</span>
              ) : (
                <span className="badge red">{latest.items.length} difference(s)</span>
              )}
              <span className="faint"> computed {latest.computed_at.slice(0, 16)}</span>
            </p>
            <p className="faint">
              Per-account differences are never netted; each one raises a typed exception.
              The population gate (Gate 2) is per tested FSLI: an open difference on the
              FSLI&apos;s accounts blocks its population build; a documented difference passes
              with the note rendered in the workpaper.
            </p>
            <p className="faint">
              Documenting a difference carries the same six elements as resolving an exception
              (migration 0010): the explanation received verbatim, the auditor&apos;s conclusion, a
              disposition, a LINK to the evidence or entry that corroborates it, and who concluded
              when. A difference nobody can corroborate — an entry absent from the ledger has none —
              takes the scope-limitation path instead: it records what was done instead, it never
              claims to be corroborated, and the ledger stays provisional until the definitive file.
            </p>
            {latest.items.length > 0 && (
              <table className="data">
                <thead>
                  <tr><th>Account</th><th className="num">TB</th><th className="num">GL (FEC)</th><th className="num">Δ</th><th>Status</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {latest.items.map((it) => (
                    <tr key={it.id}>
                      <td className="mono">{it.account_no}</td>
                      <td className="num">{fmtEur(numToCents(it.tb_amount))}</td>
                      <td className="num">{fmtEur(numToCents(it.gl_amount))}</td>
                      <td className="num" style={{ color: 'var(--red)' }}>{fmtEur(numToCents(it.delta))}</td>
                      <td>
                        <span className={`badge ${it.status === 'open' ? 'red' : it.status === 'documented_difference' ? 'amber' : 'green'}`}>
                          {it.status}
                        </span>
                      </td>
                      <td>
                        {it.status === 'open' ? (
                          <details>
                            <summary className="repli-action">act…</summary>
                            <form action={documentAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 520 }}>
                              <input type="hidden" name="item_id" value={it.id} />
                              <textarea name="explanation" rows={2} required
                                placeholder="Explication reçue, mot pour mot (l'entretien seul n'est pas un élément probant — NEP 500)" />
                              <textarea name="conclusion" rows={2} required
                                placeholder="Votre conclusion sur cette explication" />
                              <div className="row" style={{ gap: 4 }}>
                                <select name="disposition" defaultValue="no_misstatement">
                                  <option value="no_misstatement">aucune anomalie</option>
                                  <option value="corrected">corrigé (écriture liée)</option>
                                  <option value="compensated">couvert par un autre élément</option>
                                  <option value="already_accumulated">même événement, déjà accumulé</option>
                                </select>
                                <select name="corroboration" required style={{ flex: 1 }}>
                                  <option value="">— pièce ou écriture qui corrobore (obligatoire) —</option>
                                  {corroborations.map((c) => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                                <button className="btn small secondary">Document difference</button>
                              </div>
                            </form>
                            <form action={limitationAction} style={{ display: 'grid', gap: 4, maxWidth: 520 }}>
                              <input type="hidden" name="item_id" value={it.id} />
                              <textarea name="explanation" rows={2} required
                                placeholder="Pourquoi l'écart ne peut pas être corroboré, dans les mots du client" />
                              <textarea name="alternative" rows={2} required
                                placeholder="Ce qui a été fait à la place (procédures alternatives)" />
                              <button className="btn small danger">→ Limitation de périmètre</button>
                            </form>
                          </details>
                        ) : (
                          <span className="muted">{it.note}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
