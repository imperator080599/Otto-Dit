import { requireMember } from '@/lib/core/auth';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { criteres } from '@/lib/methodology/catalogue';
import {
  currentAcceptation, manquePourDecider, jalons, jalonsEnRetard,
} from '@/lib/services/acceptance';
import { ouvrirAction, repondreAction, deciderAction, jalonAction, jalonFaitAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import { Repli } from '@/app/repli';

// ACCEPTATION, MAINTIEN ET JALONS — le premier bout de l'arc (point 1).
//
// Un dossier ne commence pas par un import : il commence par une DÉCISION.
// L'écran ne porte aucune règle — il montre celles du service, et surtout ce
// qu'elles refusent : « ce qui manque pour décider » est une liste calculée,
// pas un avertissement rédigé à la main.

export const dynamic = 'force-dynamic';

/** Date française, sans jamais d'input type=date (ADR-063). */
function fr(iso: string | null): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
}

export default async function AcceptancePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;

  const a = await currentAcceptation(id);
  const cat = await catalogueDeLaMission(id);
  const manque = a ? await manquePourDecider(id) : [];
  const liste = await jalons(id);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const retard = await jalonsEnRetard(id, aujourdhui);

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <Repli cle="acc.acceptanceAndContinuance" niveau={2} titre={t('acc.acceptanceAndContinuance')}>

        {!a ? (
          <form action={ouvrirAction}>
            <input type="hidden" name="engagement_id" value={id} />
            <button className="btn">{t('acc.openTheDecision')}</button>
          </form>
        ) : (
          <>
            <p>
              <span className="badge blue">{a.kind}</span>{' '}
              {a.status === 'open' && <span className="badge amber">{t('acc.toDecide')}</span>}
              {a.status === 'accepted' && <span className="badge green">{t('acc.accepted')}</span>}
              {a.status === 'declined' && <span className="badge amber">{t('acc.declined')}</span>}
              {a.decided_at && <> le {fr(a.decided_at)}</>}
            </p>
            {a.decision_reason && (
              <p><strong>{t('commun.motif')}</strong> {a.decision_reason}</p>
            )}

            <table className="data">
              <thead>
                <tr><th>{t('acc.criterion')}</th><th>{t('acc.answer')}</th><th>{t('acc.detail')}</th></tr>
              </thead>
              <tbody>
                {criteres(cat, a.kind).map((c) => {
                  const r = a.answers[c.code];
                  const defavorable = r && r.answer === c.reponse_defavorable;
                  return (
                    <tr key={c.code} className={defavorable && c.bloquant && !r.detail.trim() ? 'warn' : undefined}>
                      <td>
                        <strong>{c.libelle}</strong>
                        {c.bloquant && <> <span className="badge gray">{t('mot.blocking')}</span></>}
                        <div className="faint" style={{ fontSize: 11 }} title={c.pourquoi}>{c.question}</div>
                        {/* LA RAISON D'ÊTRE DU CRITÈRE NE S'AFFICHE PLUS EN
                            CONTINU (revue n°2 : les justifications pédagogiques
                            sortent du flux de travail). Elle N'EST PAS
                            SUPPRIMÉE — elle vient de la méthode du cabinet et
                            reste consultable au survol : supprimer la donnée
                            aurait retiré au questionnaire ce qui l'empêche de
                            devenir une formalité. */}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {a.status !== 'open' ? (
                          <span className={defavorable ? 'badge amber' : 'badge green'}>{r?.answer ?? '—'}</span>
                        ) : (
                          <form action={repondreAction} className="row" style={{ gap: 4 }}>
                            <input type="hidden" name="engagement_id" value={id} />
                            <input type="hidden" name="code" value={c.code} />
                            <select name="answer" defaultValue={r?.answer ?? ''}>
                              <option value="oui">{t('commun.oui')}</option>
                              <option value="non">{t('commun.non')}</option>
                            </select>
                            <input
                              name="detail"
                              defaultValue={r?.detail ?? ''}
                              placeholder={defavorable ? t('acc.detailRequired') : t('acc.detail')}
                              style={{ width: 220 }}
                            />
                            <button className="btn secondary small">{t('col.record')}</button>
                          </form>
                        )}
                      </td>
                      <td className="faint" style={{ maxWidth: 280 }}>{r?.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {a.status === 'open' && (
              <>
                {manque.length > 0 && (
                  <div className="panel warn" style={{ marginTop: 12 }}>
                    <p><strong>{t('acc.whatIsMissingBeforeDeciding')}</strong></p>
                    <ul>{manque.map((m) => <li key={m.code}>{m.libelle} — {m.raison}</li>)}</ul>
                  </div>
                )}
                <form action={deciderAction} className="mt">
                  <input type="hidden" name="engagement_id" value={id} />
                  <p>
                    <input name="reason" placeholder={t('acc.reasonForTheDecisionRequired')} style={{ width: '100%', maxWidth: 620 }} />
                  </p>
                  <p className="row" style={{ gap: 8 }}>
                    <button className="btn" name="status" value="accepted">{t('acc.acceptTheEngagement')}</button>
                    <button className="btn secondary" name="status" value="declined">{t('acc.declineTheEngagement')}</button>
                  </p>
                </form>
              </>
            )}
          </>
        )}
      </Repli>

      {/* LES JALONS SORTENT DU FLUX D'ACCEPTATION (revue n°2 §3.4) — DEMOTÉS,
          pas supprimés. Les supprimer de l'écran laisserait un geste du métier
          sans écran (marquer un jalon fait) et un obstacle au visa sans
          destination : deux défauts que ce dépôt refuse. Ils sont donc repliés
          ici, et l'obstacle « jalons » y mène toujours. */}
      {liste.length > 0 && (
        <details className="panel repli-action">
          <summary>{t('acc.engagementMilestones')}{retard.length > 0 ? t('acc.nEchus', { n: retard.length }) : ''}</summary>
          {retard.length > 0 && (
            <p><span className="badge amber">{retard.length} {t('acc.milestoneSOverdueAndNotDone')}</span></p>
          )}
          <table className="data">
            <thead><tr><th>{t('col.milestone')}</th><th>{t('acc.due')}</th><th>{t('col.set')}</th><th>{t('acc.done')}</th></tr></thead>
            <tbody>
              {liste.map((j) => (
                <tr key={j.code} className={retard.some((r) => r.code === j.code) ? 'warn' : undefined}>
                  <td>
                    {j.label}
                    {j.derived && <> <span className="badge violet">{t('acc.derived')}</span></>}
                    {j.basis && <div className="faint" style={{ fontSize: 11 }}>{j.basis}</div>}
                  </td>
                  <td>{fr(j.due_date) || <span className="faint">—</span>}</td>
                  <td>
                    {j.derived ? (
                      <span className="faint" style={{ fontSize: 11 }}>
                        {t('acc.computedByTheFrameworkRuleNot')}
                      </span>
                    ) : (
                      <form action={jalonAction} className="row" style={{ gap: 4 }}>
                        <input type="hidden" name="engagement_id" value={id} />
                        <input type="hidden" name="code" value={j.code} />
                        <input name="date" placeholder="AAAA-MM-JJ" defaultValue={j.due_date ?? ''} style={{ width: 120 }} />
                        <button className="btn secondary small">{t('col.set')}</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {/* LE GESTE QUI MANQUAIT. « Fait » existait dans le service et
                        n'était appelé par aucun écran : un jalon échu bloque le visa,
                        et le seul moyen de le lever était d'écrire en base. */}
                    {j.done_at ? (
                      <span className="badge green">{t('commun.faitLe', { d: fr(j.done_at) })}</span>
                    ) : j.due_date ? (
                      <form action={jalonFaitAction}>
                        <input type="hidden" name="engagement_id" value={id} />
                        <input type="hidden" name="code" value={j.code} />
                        <button className="btn secondary small">{t('acc.markDone')}</button>
                      </form>
                    ) : (
                      <span className="faint" style={{ fontSize: 11 }}>{t('acc.setTheDueDateFirst')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
