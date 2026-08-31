import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { listFslis, confirmScoping, fsliAccounts, rebuildFslis } from '@/lib/services/fsli';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const SCOPING_BADGE: Record<string, string> = {
  unscoped: 'gray',
  in_scope: 'blue',
  ns_proposed: 'amber',
  ns_confirmed: 'gray',
  in_scope_qualitative: 'violet',
};

export default async function ScopingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const fslis = await listFslis(id);
  const withAccounts = await Promise.all(
    fslis.map(async (f) => ({ ...f, accounts: await fsliAccounts(id, f.code) })),
  );

  async function confirmAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/scoping`, async () => {
      const { user } = await requireMember(id);
      await confirmScoping(
        String(formData.get('fsli_id')),
        user.id,
        String(formData.get('decision')) as 'ns_confirmed' | 'in_scope' | 'in_scope_qualitative',
        String(formData.get('basis') ?? '') || undefined,
      );
      revalidatePath(`/eng/${id}/scoping`);
    });
  }

  async function rebuildAction() {
    'use server';
    return executer(`/eng/${id}/scoping`, async () => {
      const { user } = await requireMember(id);
      await rebuildFslis(id, user.id);
      revalidatePath(`/eng/${id}/scoping`);
    });
  }

  return (
    <div className="panel">
      <BandeauRefus erreur={erreur} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>FSLI scoping — propose &amp; confirm (D9: never silently NS)</h2>
        <form action={rebuildAction}><button className="btn secondary small">Rebuild from TB</button></form>
      </div>
      <table className="data">
        <thead>
          <tr><th>Poste</th><th>État</th><th className="num">Solde</th><th>Périmètre</th><th>Base</th><th>Décision</th></tr>
        </thead>
        <tbody>
          {withAccounts.map((f) => (
            <tr key={f.id}>
              <td>
                <details>
                  <summary><strong>{f.code}</strong> — {f.name}</summary>
                  <table className="data" style={{ marginTop: 6 }}>
                    <tbody>
                      {f.accounts.map((a) => (
                        <tr key={a.number}>
                          <td className="mono">{a.number}</td>
                          <td>{a.label}</td>
                          <td className="num">{fmtEur(a.balanceCents, 'fr')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </td>
              <td>{f.statement}</td>
              <td className="num">{fmtEur(numToCents(f.balance), 'fr')}</td>
              <td><span className={`badge ${SCOPING_BADGE[f.scoping] ?? 'gray'}`}>{f.scoping}</span></td>
              <td className="muted" style={{ maxWidth: 260 }}>{f.scoping_basis}</td>
              <td>
                {f.confirmed_by ? (
                  /* UNE DÉCISION DE PÉRIMÈTRE SE REVOIT — sinon elle se subit.
                     L'écran n'affichait plus que « confirmed » : une fois la
                     décision prise, elle n'était plus modifiable DEPUIS
                     L'APPLICATION, alors que le service, lui, l'accepte. Deux
                     conséquences, toutes deux graves : un poste sorti à tort ne
                     rentrait plus, et l'obstacle « périmètre sans programme »
                     n'avait qu'une seule sortie sur deux — on pouvait le lever
                     en travaillant le poste, jamais en le sortant. Un jugement
                     d'audit qui ne se révise pas n'est pas un jugement.
                     Le motif est OBLIGATOIRE : revenir sur une décision prise
                     se justifie, sinon la trace ne dit pas pourquoi. */
                  <details>
                    <summary className="faint">confirmé — revoir</summary>
                    <form action={confirmAction} className="row" style={{ gap: 4, marginTop: 4 }}>
                      <input type="hidden" name="fsli_id" value={f.id} />
                      <select name="decision" defaultValue="in_scope">
                        <option value="in_scope">remettre au périmètre</option>
                        <option value="in_scope_qualitative">retenir pour un motif qualitatif</option>
                        <option value="ns_confirmed">sortir du périmètre</option>
                      </select>
                      <input type="text" name="basis" placeholder="motif de la révision (obligatoire)"
                        style={{ width: 200 }} required />
                      <button className="btn small secondary">Revoir</button>
                    </form>
                  </details>
                ) : f.scoping === 'ns_proposed' ? (
                  <div>
                    <form action={confirmAction} className="row" style={{ marginBottom: 4 }}>
                      <input type="hidden" name="fsli_id" value={f.id} />
                      <input type="hidden" name="decision" value="ns_confirmed" />
                      <button className="btn small secondary">Confirm NS</button>
                    </form>
                    <form action={confirmAction} className="row">
                      <input type="hidden" name="fsli_id" value={f.id} />
                      <input type="hidden" name="decision" value="in_scope_qualitative" />
                      <input type="text" name="basis" placeholder="qualitative basis (required)" style={{ width: 180 }} required />
                      <button className="btn small secondary">Scope in</button>
                    </form>
                  </div>
                ) : f.scoping === 'in_scope' ? (
                  <form action={confirmAction} className="row">
                    <input type="hidden" name="fsli_id" value={f.id} />
                    <input type="hidden" name="decision" value="in_scope" />
                    <button className="btn small secondary">Confirm in scope</button>
                  </form>
                ) : (
                  <span className="faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint mt">
        Proposed NS = |balance| below performance materiality; a human must confirm or
        override with a qualitative basis. Confirmed decisions survive TB re-imports.
      </p>
    </div>
  );
}
