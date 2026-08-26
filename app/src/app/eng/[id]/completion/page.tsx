import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { travaux, NATURES, dateRapport, obstaclesAchevement } from '@/lib/services/completion';
import { ouvrirAction, conclureAction, sansObjetAction, rouvrirAction } from './actions';

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
      {erreur && (
        <div className="panel warn">
          <p><span className="badge amber">refusé</span> {erreur}</p>
          <p className="faint">Rien n’a été enregistré.</p>
        </div>
      )}

      <div className="panel">
        <h2>Achèvement</h2>
        <p className="faint">
          Les travaux qu’un inspecteur regarde <strong>en premier</strong> quand une défaillance
          survient après le rapport. Chaque nature porte une règle qui refuse, et ces règles sont
          des <strong>dates</strong> — donc vérifiables, donc autre chose que des rappels.
        </p>
        <p>
          Date du rapport : <strong>{fr(rapport)}</strong>
          {!rapport && (
            <> <span className="badge amber">non posée — les règles d’achèvement n’ont rien à quoi se comparer</span></>
          )}
        </p>
        {t.length === 0 && (
          <form action={ouvrirAction}>
            <input type="hidden" name="engagement_id" value={id} />
            <button className="btn">Ouvrir les travaux d’achèvement</button>
          </form>
        )}
      </div>

      {t.map((x) => {
        const meta = NATURES.find((n) => n.code === x.nature)!;
        return (
          <div className="panel" key={x.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{meta.libelle}</h2>
              <span>
                {x.status === 'done' && <span className="badge green">conclu {fr(x.done_at)}</span>}
                {x.status === 'na' && <span className="badge gray">sans objet</span>}
                {x.status === 'open' && <span className="badge amber">à conclure</span>}
              </span>
            </div>
            <p className="faint">{meta.pourquoi}</p>

            {x.status === 'open' ? (
              <>
                <form action={conclureAction}>
                  <input type="hidden" name="engagement_id" value={id} />
                  <input type="hidden" name="nature" value={x.nature} />
                  <p>
                    <input name="findings" placeholder="constatations (ce qui a été fait, ce qui a été trouvé)"
                      style={{ width: '100%', maxWidth: 680 }} />
                  </p>
                  <p>
                    <input name="conclusion" placeholder="conclusion (obligatoire)"
                      style={{ width: '100%', maxWidth: 680 }} />
                  </p>
                  <p className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {x.nature === 'evenements_posterieurs' && (
                      <label className="faint">
                        travaux menés jusqu’au{' '}
                        <input name="covered_through" placeholder="AAAA-MM-JJ" defaultValue={rapport ?? ''} style={{ width: 120 }} />
                      </label>
                    )}
                    {x.nature === 'lettre_affirmation' && (
                      <>
                        <label className="faint">
                          datée du{' '}
                          <input name="signed_on" placeholder="AAAA-MM-JJ" defaultValue={rapport ?? ''} style={{ width: 120 }} />
                        </label>
                        <select name="evidence_id" defaultValue="">
                          <option value="">— la lettre —</option>
                          {pieces.map((p) => <option key={p.id} value={p.id}>{p.filename}</option>)}
                        </select>
                      </>
                    )}
                    <button className="btn">Conclure</button>
                  </p>
                </form>
                {x.nature !== 'lettre_affirmation' ? (
                  <form action={sansObjetAction} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="engagement_id" value={id} />
                    <input type="hidden" name="nature" value={x.nature} />
                    <input name="reason" placeholder="motif du « sans objet » (obligatoire)" style={{ width: 380 }} />
                    <button className="btn secondary small">Sans objet</button>
                  </form>
                ) : (
                  /* NE PAS OFFRIR L'ACTION IMPOSSIBLE — ET DIRE POURQUOI. Le
                     service refuse « sans objet » sur la lettre d'affirmation ;
                     l'écran ne proposait simplement pas le bouton, ce qui est
                     juste mais muet : qui cherche l'action croit à un oubli
                     d'écran plutôt qu'à une règle. Un contrôle absent sans
                     raison affichée se lit comme un manque. */
                  <p className="faint">
                    Pas de « sans objet » ici : une mission peut se passer de communication
                    à la gouvernance, jamais de lettre d’affirmation. La déclarer sans objet
                    reviendrait à conclure sans elle.
                  </p>
                )}
              </>
            ) : (
              <>
                {x.findings && <p><strong>Constatations :</strong> {x.findings}</p>}
                {x.conclusion && <p><strong>Conclusion :</strong> {x.conclusion}</p>}
                {x.na_reason && <p><strong>Motif :</strong> {x.na_reason}</p>}
                {x.covered_through && <p className="faint">Travaux menés jusqu’au {fr(x.covered_through)}.</p>}
                {x.signed_on && <p className="faint">Lettre datée du {fr(x.signed_on)}.</p>}
                <form action={rouvrirAction} className="row" style={{ gap: 6 }}>
                  <input type="hidden" name="engagement_id" value={id} />
                  <input type="hidden" name="nature" value={x.nature} />
                  <input name="reason" placeholder="motif de la réouverture" style={{ width: 340 }} />
                  <button className="btn secondary small">Rouvrir</button>
                </form>
                <p className="faint" style={{ fontSize: 11 }}>
                  Un fait nouveau se traite, il ne se cache pas : rouvrir est prévu, et tracé.
                </p>
              </>
            )}
          </div>
        );
      })}

      {obstacles.length > 0 && t.length > 0 && (
        <div className="panel warn">
          <h2>Obstacles au visa — achèvement</h2>
          <ul>{obstacles.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
