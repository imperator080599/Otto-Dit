import { requireMember } from '@/lib/core/auth';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { criteres } from '@/lib/methodology/catalogue';
import {
  currentAcceptation, manquePourDecider, jalons, jalonsEnRetard,
} from '@/lib/services/acceptance';
import { ouvrirAction, repondreAction, deciderAction, jalonAction } from './actions';

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
      {erreur && (
        <div className="panel warn">
          <p><span className="badge amber">refusé</span> {erreur}</p>
          <p className="faint">Rien n’a été enregistré. Le refus vient du service, pas de l’écran.</p>
        </div>
      )}

      <div className="panel">
        <h2>Acceptation et maintien de la mission</h2>
        <p className="faint">
          <strong>Aucun travail ne se planifie avant cette décision</strong> : ni affectation, ni
          évaluation du risque. Le système refuse, il ne rappelle pas.
        </p>

        {!a ? (
          <form action={ouvrirAction}>
            <input type="hidden" name="engagement_id" value={id} />
            <button className="btn">Ouvrir la décision</button>
            <p className="faint mt">
              La nature — <strong>acceptation</strong> en première année,{' '}
              <strong>maintien</strong> en renouvellement — se déduit de l’existence d’un exercice
              précédent. Une question dont la réponse est dans le dossier ne se pose pas.
            </p>
          </form>
        ) : (
          <>
            <p>
              <span className="badge blue">{a.kind}</span>{' '}
              {a.status === 'open' && <span className="badge amber">à décider</span>}
              {a.status === 'accepted' && <span className="badge green">acceptée</span>}
              {a.status === 'declined' && <span className="badge amber">refusée</span>}
              {a.decided_at && <> le {fr(a.decided_at)}</>}
            </p>
            {a.decision_reason && (
              <p><strong>Motif :</strong> {a.decision_reason}</p>
            )}

            <table className="data">
              <thead>
                <tr><th>Critère</th><th>Réponse</th><th>Précision</th></tr>
              </thead>
              <tbody>
                {criteres(cat, a.kind).map((c) => {
                  const r = a.answers[c.code];
                  const defavorable = r && r.answer === c.reponse_defavorable;
                  return (
                    <tr key={c.code} className={defavorable && c.bloquant && !r.detail.trim() ? 'warn' : undefined}>
                      <td>
                        <strong>{c.libelle}</strong>
                        {c.bloquant && <> <span className="badge gray">bloquant</span></>}
                        <div className="faint" style={{ fontSize: 11 }}>{c.question}</div>
                        {/* La RAISON d'être du critère, portée par la méthode :
                            sans elle, un questionnaire d'acceptation devient une
                            formalité qu'on remplit sans la lire. */}
                        <div className="faint" style={{ fontSize: 11, fontStyle: 'italic' }}>{c.pourquoi}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {a.status !== 'open' ? (
                          <span className={defavorable ? 'badge amber' : 'badge green'}>{r?.answer ?? '—'}</span>
                        ) : (
                          <form action={repondreAction} className="row" style={{ gap: 4 }}>
                            <input type="hidden" name="engagement_id" value={id} />
                            <input type="hidden" name="code" value={c.code} />
                            <select name="answer" defaultValue={r?.answer ?? ''}>
                              <option value="oui">oui</option>
                              <option value="non">non</option>
                            </select>
                            <input
                              name="detail"
                              defaultValue={r?.detail ?? ''}
                              placeholder={defavorable ? 'précision (obligatoire)' : 'précision'}
                              style={{ width: 220 }}
                            />
                            <button className="btn secondary small">Noter</button>
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
                    <p><strong>Ce qui manque pour décider</strong></p>
                    <ul>{manque.map((m) => <li key={m.code}>{m.libelle} — {m.raison}</li>)}</ul>
                    <p className="faint">
                      « Bloquant » ne veut pas dire « interdit d’accepter » : un cabinet peut accepter
                      une mission difficile, il ne peut pas l’accepter <strong>sans le dire</strong>.
                    </p>
                  </div>
                )}
                <form action={deciderAction} className="mt">
                  <input type="hidden" name="engagement_id" value={id} />
                  <p>
                    <input name="reason" placeholder="motif de la décision (obligatoire)" style={{ width: '100%', maxWidth: 620 }} />
                  </p>
                  <p className="row" style={{ gap: 8 }}>
                    <button className="btn" name="status" value="accepted">Accepter la mission</button>
                    <button className="btn secondary" name="status" value="declined">Refuser la mission</button>
                  </p>
                  <p className="faint">
                    Le motif est exigé <strong>dans les deux sens</strong> : accepter sans motif ne se
                    relit pas plus que refuser sans motif. C’est la pièce qu’un inspecteur demande en
                    premier quand un dossier tourne mal.
                  </p>
                </form>
              </>
            )}
          </>
        )}
      </div>

      {liste.length > 0 && (
        <div className="panel">
          <h2>Jalons de la mission</h2>
          {retard.length > 0 && (
            <p><span className="badge amber">{retard.length} jalon(s) échu(s) et non faits</span></p>
          )}
          <table className="data">
            <thead><tr><th>Jalon</th><th>Échéance</th><th>Poser</th></tr></thead>
            <tbody>
              {liste.map((j) => (
                <tr key={j.code} className={retard.some((r) => r.code === j.code) ? 'warn' : undefined}>
                  <td>
                    {j.label}
                    {j.derived && <> <span className="badge violet">dérivé</span></>}
                    {j.basis && <div className="faint" style={{ fontSize: 11 }}>{j.basis}</div>}
                  </td>
                  <td>{fr(j.due_date) || <span className="faint">—</span>}</td>
                  <td>
                    {j.derived ? (
                      <span className="faint" style={{ fontSize: 11 }}>
                        calculé par la règle du référentiel — ne se saisit pas
                      </span>
                    ) : (
                      <form action={jalonAction} className="row" style={{ gap: 4 }}>
                        <input type="hidden" name="engagement_id" value={id} />
                        <input type="hidden" name="code" value={j.code} />
                        <input name="date" placeholder="AAAA-MM-JJ" defaultValue={j.due_date ?? ''} style={{ width: 120 }} />
                        <button className="btn secondary small">Poser</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint">
            Le délai d’assemblage <strong>se dérive</strong> de la date de rapport par la règle du
            référentiel : une date dérivée qu’on pourrait saisir deviendrait fausse le jour où
            quelqu’un la corrige à la main.
          </p>
        </div>
      )}
    </div>
  );
}
