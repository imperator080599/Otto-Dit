import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { travaux, NATURES, dateRapport, obstaclesAchevement } from '@/lib/services/completion';
import { ouvrirAction, conclureAction, sansObjetAction, rouvrirAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import { Repli } from '@/app/repli';

// L'ACHÈVEMENT (point 10).
//
// Ce sont les travaux qu'un inspecteur regarde en premier quand une faillite
// survient trois mois après le rapport. Ce ne sont donc pas des cases à cocher :
// chaque nature porte une règle qui REFUSE, et ces règles sont des dates.

export const dynamic = 'force-dynamic';

const fr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export default async function CompletionPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const libelle = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;

  const t = await travaux(id);
  const rapport = await dateRapport(id);
  const obstacles = await obstaclesAchevement(id);
  const pieces = await q<{ id: string; filename: string }>(
    `select id, filename from evidence where engagement_id = $1 and quarantined = false
     order by filename limit 40`,
    [id],
  );

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <Repli cle="eng.id.completion.1" niveau={2} titre={libelle('comp.completion')}>
        <p>
          {libelle('comp.reportDate')} <strong>{fr(rapport)}</strong>
          {!rapport && (
            <> <span className="badge amber">{libelle('comp.notSetTheCompletionRulesHave')}</span></>
          )}
        </p>
        {t.length === 0 && (
          <form action={ouvrirAction}>
            <input type="hidden" name="engagement_id" value={id} />
            <button className="btn">{libelle('comp.openTheCompletionProcedures')}</button>
          </form>
        )}
      </Repli>

      {t.map((x) => {
        const meta = NATURES.find((n) => n.code === x.nature)!;
        return (
          <div className="panel" key={x.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{libelle(meta.libelle)}</h2>
              <span>
                {x.status === 'done' && <span className="badge green">{libelle('mot.concluded')} {fr(x.done_at)}</span>}
                {x.status === 'na' && <span className="badge gray">{libelle('comp.notApplicable')}</span>}
                {x.status === 'open' && <span className="badge amber">{libelle('comp.toConclude')}</span>}
              </span>
            </div>
            <p className="faint">{libelle(meta.pourquoi)}</p>

            {x.status === 'open' ? (
              <>
                <form action={conclureAction}>
                  <input type="hidden" name="engagement_id" value={id} />
                  <input type="hidden" name="nature" value={x.nature} />
                  <p>
                    <input name="findings" placeholder={libelle('comp.findingsWhatWasDoneWhatWas')}
                      style={{ width: '100%', maxWidth: 680 }} />
                  </p>
                  <p>
                    <input name="conclusion" placeholder={libelle('comp.conclusionRequired')}
                      style={{ width: '100%', maxWidth: 680 }} />
                  </p>
                  <p className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {x.nature === 'evenements_posterieurs' && (
                      <label className="faint">
                        {libelle('comp.proceduresCarriedThroughTo')}{' '}
                        <input name="covered_through" placeholder="AAAA-MM-JJ" defaultValue={rapport ?? ''} style={{ width: 120 }} />
                      </label>
                    )}
                    {x.nature === 'lettre_affirmation' && (
                      <>
                        <label className="faint">
                          {libelle('comp.dated')}{' '}
                          <input name="signed_on" placeholder="AAAA-MM-JJ" defaultValue={rapport ?? ''} style={{ width: 120 }} />
                        </label>
                        <select name="evidence_id" defaultValue="">
                          <option value="">{libelle('comp.theLetter')}</option>
                          {pieces.map((p) => <option key={p.id} value={p.id}>{p.filename}</option>)}
                        </select>
                      </>
                    )}
                    <button className="btn">{libelle('col.conclude')}</button>
                  </p>
                </form>
                {x.nature !== 'lettre_affirmation' ? (
                  <form action={sansObjetAction} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="engagement_id" value={id} />
                    <input type="hidden" name="nature" value={x.nature} />
                    <input name="reason" placeholder={libelle('comp.reasonForNotApplicableRequired')} style={{ width: 380 }} />
                    <button className="btn secondary small">{libelle('comp.notApplicable2')}</button>
                  </form>
                ) : (
                  /* NE PAS OFFRIR L'ACTION IMPOSSIBLE — ET DIRE POURQUOI. Le
                     service refuse « sans objet » sur la lettre d'affirmation ;
                     l'écran ne proposait simplement pas le bouton, ce qui est
                     juste mais muet : qui cherche l'action croit à un oubli
                     d'écran plutôt qu'à une règle. Un contrôle absent sans
                     raison affichée se lit comme un manque. */
                  <p className="faint">{libelle('comp.pasSansObjet')}</p>
                )}
              </>
            ) : (
              <>
                {x.findings && <p><strong>{libelle('comp.findings')}</strong> {x.findings}</p>}
                {x.conclusion && <p><strong>{libelle('comp.conclusion')}</strong> {x.conclusion}</p>}
                {x.na_reason && <p><strong>{libelle('commun.motif')}</strong> {x.na_reason}</p>}
                {x.covered_through && <p className="faint">{libelle('comp.proceduresCarriedThroughTo2')} {fr(x.covered_through)}.</p>}
                {x.signed_on && <p className="faint">{libelle('comp.letterDated')} {fr(x.signed_on)}.</p>}
                <form action={rouvrirAction} className="row" style={{ gap: 6 }}>
                  <input type="hidden" name="engagement_id" value={id} />
                  <input type="hidden" name="nature" value={x.nature} />
                  <input name="reason" placeholder={libelle('comp.reasonForReopening')} style={{ width: 340 }} />
                  <button className="btn secondary small">{libelle('col.reopen')}</button>
                </form>
                <p className="faint" style={{ fontSize: 11 }}>
                  {libelle('comp.aNewFactIsDealtWith')}
                </p>
              </>
            )}
          </div>
        );
      })}

      {obstacles.length > 0 && t.length > 0 && (
        <div className="panel warn">
          <h2>{libelle('comp.blockersToSignOffCompletion')}</h2>
          <ul>{obstacles.map((o, i) => <li key={i}>{libelle(o.cle, o.vars)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
