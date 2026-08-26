import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import {
  members, declarations, currentDeclaration, openDeclaration, answerRubric,
  signDeclaration, missingForSignature, assignMember, exitMember,
  independenceObstacles, recordNonAuditService, feeRatio, TeamRuleError,
} from '@/lib/services/team';

// Équipe et indépendance. L'écran ne porte AUCUNE règle : il montre celles du
// service, et il montre surtout ce qu'elles refusent. « Ce qui manque pour
// signer » et « ce qui bloque le visa » sont des listes calculées, pas des
// avertissements rédigés à la main.

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireMember(id);
  const cat = await catalogueDeLaMission(id);
  const roster = await members(id);
  const mine = await currentDeclaration(id, user.id);
  const myStack = await declarations(id, user.id);
  const missing = missingForSignature(cat, mine);
  const obstacles = await independenceObstacles(id);
  const ratio = await feeRatio(id);
  const cap = cat.independance.parametres.plafond_sacc_pct;

  const firmPeople = await q<{ id: string; name: string; firm_role: string }>(
    `select u.id, u.name, u.firm_role from app_user u
     join engagement e on e.tenant_id = u.tenant_id
     where e.id = $1 order by u.name`,
    [id],
  );
  const services = await q<{
    id: string; nature: string; label: string; amount_cents: string;
    provided_on: string; provider: string;
  }>(
    `select id, nature, label, amount_cents::text as amount_cents,
            provided_on::text as provided_on, provider
     from non_audit_service where engagement_id = $1 order by provided_on desc`,
    [id],
  );

  /** Toute action rend son refus À L'ÉCRAN : une règle qui échoue en silence
   *  ne se distingue pas d'un bouton cassé. */
  async function run(fn: () => Promise<unknown>): Promise<{ error?: string }> {
    try {
      await fn();
      revalidatePath(`/eng/${id}/team`);
      return {};
    } catch (e) {
      if (e instanceof TeamRuleError) return { error: e.message };
      throw e;
    }
  }

  async function openAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() => openDeclaration(id, u.id, String(formData.get('reason') ?? '')));
  }

  async function answerAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() =>
      answerRubric(
        String(formData.get('declaration_id')),
        u.id,
        String(formData.get('code')),
        String(formData.get('answer')) as 'oui' | 'non',
        String(formData.get('detail') ?? ''),
      ),
    );
  }

  async function signAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() => signDeclaration(String(formData.get('declaration_id')), u.id));
  }

  async function assignAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() =>
      assignMember({
        engagementId: id,
        userId: String(formData.get('user_id')),
        engRole: String(formData.get('eng_role')) as 'partner' | 'manager' | 'senior' | 'staff',
        canSign: formData.get('can_sign') === 'on',
        enteredOn: String(formData.get('entered_on') ?? '') || null,
        actorUserId: u.id,
      }),
    );
  }

  async function exitAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() => exitMember(id, String(formData.get('user_id')), String(formData.get('on')), u.id));
  }

  async function nasAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await run(() =>
      recordNonAuditService({
        engagementId: id,
        nature: String(formData.get('nature')),
        label: String(formData.get('label')),
        amountCents: Math.round(Number(String(formData.get('amount')).replace(',', '.')) * 100),
        providedOn: String(formData.get('provided_on')),
        provider: String(formData.get('provider')),
        actorUserId: u.id,
      }),
    );
  }

  return (
    <div className="stack">
      {obstacles.length > 0 && (
        <div className="panel warn">
          <h2>Obstacles au visa — indépendance</h2>
          <ul>{obstacles.map((o) => <li key={o}>{o}</li>)}</ul>
          <p className="faint">
            Ces travaux ne disparaissent pas : ils deviennent invisables tant que la révision
            n’est pas signée. Sans cette règle, il suffirait d’affecter avant de réviser.
          </p>
        </div>
      )}

      {/* ── ma déclaration ───────────────────────────────────────────── */}
      <div className="panel">
        <h2>Ma déclaration d’indépendance — {user.name}</h2>
        {!mine || mine.signed_at ? (
          <form action={openAction} className="row">
            <input
              type="text"
              name="reason"
              placeholder={mine ? 'motif de la révision (obligatoire)' : ''}
              style={{ width: 420 }}
              required={!!mine}
            />
            <button className="btn small">{mine ? 'Réviser ma déclaration' : 'Ouvrir ma déclaration'}</button>
            {mine && (
              <span className="faint">
                Une révision empile une version : la précédente reste lisible, avec sa signature.
              </span>
            )}
          </form>
        ) : (
          <>
            {mine.version > 1 && <p className="faint">Révision v{mine.version} — motif : {mine.reason}</p>}
            <table className="data">
              <thead>
                <tr><th>Rubrique</th><th>Réponse</th><th>Précision</th></tr>
              </thead>
              <tbody>
                {cat.independance.rubriques.map((r) => {
                  const a = mine.answers[r.code];
                  return (
                    <tr key={r.code}>
                      <td>
                        <strong>{r.libelle}</strong>
                        <div className="faint">{r.definition}</div>
                      </td>
                      <td colSpan={2}>
                        <form action={answerAction} className="row">
                          <input type="hidden" name="declaration_id" value={mine.id} />
                          <input type="hidden" name="code" value={r.code} />
                          <select name="answer" defaultValue={a?.answer ?? ''} required>
                            <option value="" disabled>— à répondre —</option>
                            <option value="non">non</option>
                            <option value="oui">oui</option>
                          </select>
                          <input
                            type="text"
                            name="detail"
                            defaultValue={a?.detail ?? ''}
                            placeholder="précision — obligatoire si « oui »"
                            style={{ width: 340 }}
                          />
                          <button className="btn small secondary">enregistrer</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {missing.length > 0 ? (
              <div className="mt">
                <p><strong>Ce qui manque pour signer :</strong></p>
                <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="faint">
                  Un formulaire qu’on peut signer vide est un formulaire qui ne dit rien.
                </p>
              </div>
            ) : (
              <form action={signAction} className="mt">
                <input type="hidden" name="declaration_id" value={mine.id} />
                <button className="btn">Signer ma déclaration</button>
                <span className="faint"> — on signe pour soi ; personne ne signe pour un autre.</span>
              </form>
            )}
          </>
        )}

        {myStack.length > 1 && (
          <details className="mt">
            <summary>Historique de mes déclarations ({myStack.length} versions)</summary>
            <table className="data" style={{ marginTop: 6 }}>
              <thead><tr><th>Version</th><th>Motif</th><th>Signée</th></tr></thead>
              <tbody>
                {myStack.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">v{d.version}</td>
                    <td>{d.reason || <span className="faint">—</span>}</td>
                    <td>{d.signed_at ? d.signed_at.slice(0, 16) : <span className="badge amber">non signée</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {/* ── l'équipe ─────────────────────────────────────────────────── */}
      <div className="panel">
        <h2>Équipe de la mission</h2>
        <table className="data">
          <thead>
            <tr><th>Personne</th><th>Rôle</th><th>Visa</th><th>Entrée</th><th>Sortie</th><th>Déclaration</th><th /></tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <tr key={m.user_id}>
                <td><strong>{m.name}</strong><div className="faint">{m.email}</div></td>
                <td>{m.eng_role}</td>
                <td>{m.can_sign ? 'oui' : 'non'}</td>
                <td className="mono">{m.entered_on ?? '—'}</td>
                <td className="mono">{m.exited_on ?? '—'}</td>
                <td>
                  <span className={`badge ${m.declaration.holds ? 'blue' : 'amber'}`}>
                    {m.declaration.label}
                  </span>
                </td>
                <td>
                  {!m.exited_on && (
                    <form action={exitAction} className="row">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="text" name="on" placeholder="AAAA-MM-JJ" style={{ width: 110 }} required />
                      <button className="btn small secondary">sortie</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt">Affecter une personne</h3>
        <form action={assignAction} className="row">
          <select name="user_id" required>
            {firmPeople.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.firm_role}</option>
            ))}
          </select>
          <select name="eng_role" defaultValue="staff">
            <option value="partner">partner</option>
            <option value="manager">manager</option>
            <option value="senior">senior</option>
            <option value="staff">staff</option>
          </select>
          <label className="row"><input type="checkbox" name="can_sign" /> peut viser</label>
          <input type="text" name="entered_on" placeholder="entrée AAAA-MM-JJ" style={{ width: 130 }} />
          <button className="btn small">affecter</button>
        </form>
        <p className="faint mt">
          Le système <strong>refuse</strong> une affectation à qui n’a pas signé sa déclaration —
          il ne le rappelle pas. La liste ne propose que des personnes du cabinet de la mission :
          l’isolation est vérifiée à l’écriture, pas seulement à l’affichage.
        </p>
      </div>

      {/* ── services autres que la certification ─────────────────────── */}
      <div className="panel">
        <h2>Services autres que la certification</h2>
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Nature</th><th>Objet</th><th>Prestataire</th><th className="num">Montant</th></tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr><td colSpan={5} className="faint">Aucun service déclaré.</td></tr>
            ) : services.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.provided_on}</td>
                <td>{cat.independance.naturesSacc[s.nature] ?? s.nature}</td>
                <td>{s.label}</td>
                <td>{s.provider}</td>
                <td className="num">{fmtEur(Number(s.amount_cents), 'fr')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Ratio sur les honoraires d’audit</strong></td>
              <td className="num">
                {ratio.ratioPct === null ? (
                  <span className="faint">non calculé</span>
                ) : (
                  <span className={ratio.overCap ? 'badge red' : ''}>{ratio.ratioPct.toFixed(1)} %</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        <form action={nasAction} className="row mt">
          <select name="nature" required>
            {Object.entries(cat.independance.naturesSacc).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input type="text" name="label" placeholder="objet" style={{ width: 240 }} required />
          <input type="text" name="provider" placeholder="prestataire" style={{ width: 200 }} required />
          <input type="text" name="provided_on" placeholder="AAAA-MM-JJ" style={{ width: 120 }} required />
          <input type="text" name="amount" placeholder="montant €" style={{ width: 110 }} required />
          <button className="btn small secondary">enregistrer</button>
        </form>

        <p className="faint mt">
          {ratio.auditFeeCents === null ? (
            <>
              Les honoraires d’audit de la mission ne sont pas saisis : le ratio <strong>n’est pas
              calculé</strong>. Un ratio sur un dénominateur supposé serait pire que pas de ratio.
            </>
          ) : (
            <>
              Honoraires d’audit : {fmtEur(ratio.auditFeeCents, 'fr')} · services non-audit :{' '}
              {fmtEur(ratio.nonAuditCents, 'fr')}.
            </>
          )}
          {' '}Plafond retenu : <strong>{cap.valeur} %</strong> — {cap.pourquoi}
          {ratio.capUnverified && (
            <> {' '}<span className="badge amber">UNVERIFIED</span> : ce seuil vient de{' '}
            {cap.sources.join(', ')}, dont le texte primaire n’a pas pu être atteint. Il est
            modifiable dans <span className="mono">methodology/independance.json</span> —
            c’est du contenu de cabinet, pas du code.</>
          )}
        </p>
      </div>
    </div>
  );
}
