import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { missionPrecedente, reprises, obstaclesReprise } from '@/lib/services/carryforward';
import { proposerAction, deciderAction } from './actions';

// LA REPRISE DU DOSSIER N-1 (point 2).
//
// On ne reprend pas des chiffres, on reprend des CONCLUSIONS. Rien n'est repris
// automatiquement : tout arrive proposé, avec sa source, et une proposition non
// statuée est un obstacle au visa. Une reprise qui ne bloque rien est une
// recopie — elle ne demande rien à personne.

export const dynamic = 'force-dynamic';

const NATURES: Record<string, string> = {
  scoping: 'Périmètre',
  risk_factor: 'Facteur de risque',
  question_answer: 'Questionnaire résiduel',
  workpaper: 'Papier de travail',
};

export default async function CarryForwardPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  await requireMember(id);
  const { erreur } = await searchParams;

  const prev = await missionPrecedente(id);
  const liste = await reprises(id);
  const obstacles = await obstaclesReprise(id);
  const enAttente = liste.filter((r) => r.status === 'proposed');

  return (
    <div className="stack">
      {erreur && (
        <div className="panel warn">
          <p><span className="badge amber">refusé</span> {erreur}</p>
        </div>
      )}

      <div className="panel">
        <h2>Reprise de l’exercice précédent</h2>
        {!prev ? (
          <p className="faint">
            Aucune mission sur l’exercice précédent pour cette entité : il n’y a rien à reprendre.
            <strong> Une première année se planifie, elle ne se reprend pas.</strong>
          </p>
        ) : (
          <>
            <p className="faint">
              Source : <Link href={`/eng/${prev.id}`}>{prev.name}</Link>. On ne reprend pas des
              chiffres, on reprend des <strong>conclusions</strong> — et une conclusion se
              reconfirme ou s’écarte, elle ne se recopie pas.
            </p>
            {liste.length === 0 ? (
              <form action={proposerAction}>
                <input type="hidden" name="engagement_id" value={id} />
                <button className="btn">Proposer la reprise</button>
                <p className="faint mt">
                  Rien ne sera appliqué : chaque élément arrivera <strong>proposé</strong>, et tant
                  qu’il n’est pas statué il <strong>bloque le visa</strong>.
                </p>
              </form>
            ) : (
              <p>
                {enAttente.length > 0
                  ? <span className="badge amber">{enAttente.length} proposition(s) non statuée(s) — le visa est bloqué</span>
                  : <span className="badge green">toutes les propositions sont statuées</span>}
              </p>
            )}
          </>
        )}
      </div>

      {liste.length > 0 && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr><th>Nature</th><th>Ce que N-1 propose</th><th>Décision</th></tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id} className={r.status === 'proposed' ? 'warn' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="badge gray">{NATURES[r.kind] ?? r.kind}</span>
                  </td>
                  <td>
                    {r.label}
                    {r.detail && <div className="faint" style={{ fontSize: 11, maxWidth: 520 }}>{r.detail}</div>}
                    {r.decision_reason && (
                      <div className="faint" style={{ fontSize: 11 }}><em>Motif : {r.decision_reason}</em></div>
                    )}
                  </td>
                  <td>
                    {r.status === 'proposed' ? (
                      <form action={deciderAction} className="row" style={{ gap: 4 }}>
                        <input type="hidden" name="engagement_id" value={id} />
                        <input type="hidden" name="reprise_id" value={r.id} />
                        <input name="reason" placeholder="motif (obligatoire pour écarter)" style={{ width: 200 }} />
                        <button className="btn secondary small" name="status" value="reconfirmed">Reconfirmer</button>
                        <button className="btn secondary small" name="status" value="dismissed">Écarter</button>
                      </form>
                    ) : (
                      <span className={`badge ${r.status === 'reconfirmed' ? 'green' : 'gray'}`}>
                        {r.status === 'reconfirmed' ? 'reconfirmé' : 'écarté'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint">
            <strong>Reconfirmer</strong> ne demande pas de motif — reconfirmer, c’est dire « j’ai
            regardé et c’est toujours vrai ». <strong>Écarter</strong> en exige un : sans motif, un
            écart est indistinguable d’un oubli.
          </p>
        </div>
      )}

      {obstacles.length > 0 && (
        <div className="panel warn">
          <h2>Obstacles au visa — reprise</h2>
          <ul>{obstacles.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
