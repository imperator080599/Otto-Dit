import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import {
  members, declarations, currentDeclaration, openDeclaration, answerRubric,
  signDeclaration, missingForSignature, assignMember, exitMember,
  independenceObstacles, recordNonAuditService, feeRatio, TeamRuleError,
  anciennetes, rotationSignataire,
} from '@/lib/services/team';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';

// Équipe et indépendance. L'écran ne porte AUCUNE règle : il montre celles du
// service, et il montre surtout ce qu'elles refusent. « Ce qui manque pour
// signer » et « ce qui bloque le visa » sont des listes calculées, pas des
// avertissements rédigés à la main.
//
// `executer` EST AU NIVEAU DU MODULE, ET CE N'EST PAS UN RANGEMENT. Il était
// défini DANS le composant, et chaque action « use server » le CAPTURAIT. En
// production, Next doit encoder la fermeture d'une action inline : une fonction
// capturée n'est pas encodable, et le serveur levait « Functions cannot be
// passed directly to Client Components » à CHAQUE affichage — pendant que la
// page rendait 200. Les six formulaires de cet écran étaient donc INERTES en
// production, et rien ne le disait. Trouvé par le balayage des écrans, qui lit
// le journal du serveur en plus des codes HTTP (ADR-078).

/**
 * Exécute une action et RAMÈNE SON REFUS À L'ÉCRAN.
 *
 * Le second défaut, du même endroit : le résultat était calculé puis jeté. Une
 * règle qui refuse en silence ne se distingue pas d'un bouton cassé — c'est ce
 * que disait le commentaire, et c'est ce que faisait le code. Le motif repart
 * maintenant dans l'URL, et l'écran l'affiche.
 */
async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof TeamRuleError)) throw e;
    erreur = e.message;
  }
  revalidatePath(`/eng/${id}/team`);
  // redirect() lève : il doit rester HORS du try, ou il serait rattrapé.
  redirect(`/eng/${id}/team${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export default async function TeamPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  const { user } = await requireMember(id);
  const cat = await catalogueDeLaMission(id);
  const roster = await members(id);
  const mine = await currentDeclaration(id, user.id);
  const myStack = await declarations(id, user.id);
  const missing = missingForSignature(cat, mine);
  const obstacles = await independenceObstacles(id);
  const ratio = await feeRatio(id);
  /* L'ancienneté et la rotation se COMPTENT : les deux seuils étaient déclarés
     dans la méthode et rien ne les calculait. Un paramètre déclaré que
     personne n'évalue est du silence lu comme un succès. */
  const anc = await anciennetes(id);
  const rot = await rotationSignataire(id);
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

  async function openAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await executer(id, () => openDeclaration(id, u.id, String(formData.get('reason') ?? '')));
  }

  async function answerAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await executer(id, () =>
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
    await executer(id, () => signDeclaration(String(formData.get('declaration_id')), u.id));
  }

  async function assignAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await executer(id, () =>
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
    await executer(id, () => exitMember(id, String(formData.get('user_id')), String(formData.get('on')), u.id));
  }

  async function nasAction(formData: FormData) {
    'use server';
    const { user: u } = await requireMember(id);
    await executer(id, () =>
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
      {/* LE REFUS SE VOIT. Il était calculé et jeté : une règle qui refuse en
          silence ne se distingue pas d'un bouton cassé — et la règle phare de
          cet écran, « aucun travail ne s'attribue sans déclaration signée »,
          était refusée sans que rien ne s'affiche. */}
      <BandeauRefus erreur={erreur} />

      {obstacles.length > 0 && (
        <div className="panel warn">
          <h2>{t('team.blockersToSignOffIndependence')}</h2>
          <ul>{obstacles.map((o, i) => <li key={i}>{t(o.cle, o.vars)}</li>)}</ul>
        </div>
      )}

      {/* ── ancienneté et rotation : ce qui se compte ─────────────────── */}
      {anc.length > 0 && (
        <div className="panel">
          <h2>{t('team.tenureAndRotation')}</h2>
          <table className="data">
            <thead>
              <tr><th>{t('col.member')}</th><th className="num">{t('team.consecutiveYears')}</th><th>{t('team.familiarity')}</th><th>{t('col.rotation')}</th></tr>
            </thead>
            <tbody>
              {anc.map((a) => {
                const r = rot.find((x) => x.userId === a.userId);
                return (
                  <tr key={a.userId} className={a.menace || r?.depasse ? 'warn' : undefined}>
                    <td>{a.name}</td>
                    <td className="num"><strong>{a.exercices}</strong></td>
                    <td>
                      {a.menace
                        ? <span className="badge amber">{t('team.menaceSeuil')} {a.seuil}{t('team.safeguardToBeDocumented')}</span>
                        : <span className="faint">{t('team.belowTheThresholdOf')} {a.seuil}</span>}
                    </td>
                    <td>
                      {!r
                        ? <span className="faint">{t('team.notEntitledToSign')}</span>
                        : r.depasse
                          ? <span className="badge amber">{t('team.exceededCeiling')} {r.plafond}</span>
                          : <span className="faint">{t('mot.ceiling')} {r.plafond}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ma déclaration ───────────────────────────────────────────── */}
      <div className="panel">
        <h2>{t('team.myIndependenceDeclaration')} {user.name}</h2>
        {!mine || mine.signed_at ? (
          <form action={openAction} className="row">
            <input
              type="text"
              name="reason"
              placeholder={mine ? t('scop.motif') : ''}
              style={{ width: 420 }}
              required={!!mine}
            />
            <button className="btn small">{mine ? t('team.reviserMaDeclaration') : t('team.ouvrirMaDeclaration')}</button>
            {mine && (
              <span className="faint">
                {t('team.aRevisionStacksAVersionThe')}
              </span>
            )}
          </form>
        ) : (
          <>
            {mine.version > 1 && <p className="faint">{t('team.revisionV')}{mine.version}{t('team.motifSuffixe', { motif: mine.reason })}</p>}
            <table className="data">
              <thead>
                <tr><th>{t('col.section')}</th><th>{t('team.answer')}</th><th>{t('team.detail')}</th></tr>
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
                            <option value="" disabled>{t('risk.toAnswer')}</option>
                            <option value="non">{t('commun.non')}</option>
                            <option value="oui">{t('commun.oui')}</option>
                          </select>
                          <input
                            type="text"
                            name="detail"
                            defaultValue={a?.detail ?? ''}
                            placeholder={t('risk.detailRequiredIfYes')}
                            style={{ width: 340 }}
                          />
                          <button className="btn small secondary">{t('mot.save')}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {missing.length > 0 ? (
              <div className="mt">
                <p><strong>{t('team.whatIsMissingBeforeSigning')}</strong></p>
                <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="faint">
                  {t('team.aFormYouCanSignBlank')}
                </p>
              </div>
            ) : (
              <form action={signAction} className="mt">
                <input type="hidden" name="declaration_id" value={mine.id} />
                <button className="btn">{t('team.signMyDeclaration')}</button>
                <span className="faint"> {t('team.youSignForYourselfNobodySigns')}</span>
              </form>
            )}
          </>
        )}

        {myStack.length > 1 && (
          <details className="mt">
            <summary>{t('team.historyOfMyDeclarations')}{t('team.nVersions', { n: myStack.length })}</summary>
            <table className="data" style={{ marginTop: 6 }}>
              <thead><tr><th>{t('col.version')}</th><th>{t('col.reason')}</th><th>{t('team.signed')}</th></tr></thead>
              <tbody>
                {myStack.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">v{d.version}</td>
                    <td>{d.reason || <span className="faint">—</span>}</td>
                    <td>{d.signed_at ? d.signed_at.slice(0, 16) : <span className="badge amber">{t('team.notSigned')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {/* ── l'équipe ─────────────────────────────────────────────────── */}
      <div className="panel">
        <h2>{t('team.engagementTeam')}</h2>
        <table className="data">
          <thead>
            <tr><th>{t('col.person')}</th><th>{t('team.role')}</th><th>{t('col.signoff')}</th><th>{t('team.joined')}</th><th>{t('col.exit')}</th><th>{t('team.declaration')}</th><th /></tr>
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
                      <button className="btn small secondary">{t('mot.exit')}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt">{t('team.assignAPerson')}</h3>
        <form action={assignAction} className="row">
          <select name="user_id" required>
            {firmPeople.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.firm_role}</option>
            ))}
          </select>
          <select name="eng_role" defaultValue="staff">
            <option value="partner">{t('mot.partner')}</option>
            <option value="manager">{t('mot.manager')}</option>
            <option value="senior">{t('mot.senior')}</option>
            <option value="staff">{t('mot.staff')}</option>
          </select>
          <label className="row"><input type="checkbox" name="can_sign" /> {t('team.maySignOff')}</label>
          <input type="text" name="entered_on" placeholder={t('team.joinedYyyyMmDd')} style={{ width: 130 }} />
          <button className="btn small">{t('mot.assign')}</button>
        </form>
      </div>

      {/* ── services autres que la certification ─────────────────────── */}
      <div className="panel">
        <h2>{t('team.nonAuditServices')}</h2>
        <table className="data">
          <thead>
            <tr><th>{t('col.date')}</th><th>{t('col.nature')}</th><th>{t('col.subject')}</th><th>{t('col.provider')}</th><th className="num">{t('col.amount')}</th></tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr><td colSpan={5} className="faint">{t('team.noServiceDeclared')}</td></tr>
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
              <td colSpan={4}><strong>{t('team.ratioToAuditFees')}</strong></td>
              <td className="num">
                {ratio.ratioPct === null ? (
                  <span className="faint">{t('team.notComputed')}</span>
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
          <input type="text" name="amount" placeholder={t('team.montantEuros')} style={{ width: 110 }} required />
          <button className="btn small secondary">{t('mot.save')}</button>
        </form>

      </div>
    </div>
  );
}
