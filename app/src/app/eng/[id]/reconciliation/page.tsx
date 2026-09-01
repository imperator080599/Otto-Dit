import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { computeTbGl, latestTbGl, documentDifference, noteReconciliationLimitation } from '@/lib/services/reconciliation';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

export default async function ReconciliationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
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
    )).map((g) => ({ value: `gl:${g.id}`, label: t('exc.ecritureLabel', { no: g.entry_no, piece: g.piece_ref ?? '', date: g.entry_date }) })),
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
          <h2>{t('rec.tbGlReconciliationDeterministicL0')}</h2>
          <form action={computeAction}>
            <button className="btn">{t('col.recompute')}</button>
          </form>
        </div>
        {!latest ? (
          <p className="muted">{t('rec.notComputedYetImportTheTb')}</p>
        ) : (
          <>
            <p>
              {latest.summary.accounts} {t('rec.accountsCompared')}{' '}
              {latest.items.length === 0 ? (
                <span className="badge green">{t('rec.allAccountsTie')}</span>
              ) : (
                <span className="badge red">{latest.items.length} {t('rec.differenceS')}</span>
              )}
              <span className="faint"> computed {latest.computed_at.slice(0, 16)}</span>
            </p>
            {latest.items.length > 0 && (
              <table className="data">
                <thead>
                  <tr><th>{t('col.account')}</th><th className="num">TB</th><th className="num">{t('rec.glFec')}</th><th className="num">Δ</th><th>{t('col.status')}</th><th>{t('col.resolution')}</th></tr>
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
                            <summary className="repli-action">{t('commun.actions')}</summary>
                            <form action={documentAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 520 }}>
                              <input type="hidden" name="item_id" value={it.id} />
                              <textarea name="explanation" rows={2} required
                                placeholder={t('commun.explicationMotPourMot')} />
                              <textarea name="conclusion" rows={2} required
                                placeholder={t('rap.conclusion')} />
                              <div className="row" style={{ gap: 4 }}>
                                <select name="disposition" defaultValue="no_misstatement">
                                  <option value="no_misstatement">{t('commun.aucuneAnomalie')}</option>
                                  <option value="corrected">{t('rap.corrige')}</option>
                                  <option value="compensated">{t('rap.couvert')}</option>
                                  <option value="already_accumulated">{t('rap.dejaCumule')}</option>
                                </select>
                                <select name="corroboration" required style={{ flex: 1 }}>
                                  <option value="">{t('rap.corroboration')}</option>
                                  {corroborations.map((c) => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                                <button className="btn small secondary">{t('rec.documentDifference')}</button>
                              </div>
                            </form>
                            <form action={limitationAction} style={{ display: 'grid', gap: 4, maxWidth: 520 }}>
                              <input type="hidden" name="item_id" value={it.id} />
                              <textarea name="explanation" rows={2} required
                                placeholder={t('rec.whyTheDifferenceCannotBeCorroborated')} />
                              <textarea name="alternative" rows={2} required
                                placeholder={t('rap.alternatives')} />
                              <button className="btn small danger">{t('rap.limitation')}</button>
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
