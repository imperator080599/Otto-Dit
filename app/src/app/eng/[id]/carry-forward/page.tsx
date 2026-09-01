import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { missionPrecedente, reprises, obstaclesReprise } from '@/lib/services/carryforward';
import { proposerAction, deciderAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// LA REPRISE DU DOSSIER N-1 (point 2).
//
// On ne reprend pas des chiffres, on reprend des CONCLUSIONS. Rien n'est repris
// automatiquement : tout arrive proposé, avec sa source, et une proposition non
// statuée est un obstacle au visa. Une reprise qui ne bloque rien est une
// recopie — elle ne demande rien à personne.

export const dynamic = 'force-dynamic';

const NATURES: Record<string, CleLibelle> = {
  scoping: 'cf.nature.scoping', risk_factor: 'cf.nature.risk_factor',
  question_answer: 'cf.nature.question_answer', workpaper: 'cf.nature.workpaper',
};

export default async function CarryForwardPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;

  const prev = await missionPrecedente(id);
  const liste = await reprises(id);
  const obstacles = await obstaclesReprise(id);
  const enAttente = liste.filter((r) => r.status === 'proposed');

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <div className="panel">
        <h2>{t('famille.reprise.titre')}</h2>
        {!prev ? (
          /* DIRE CE QU'ON A CHERCHÉ, pas seulement qu'on n'a rien trouvé. Le
             message annonçait « aucune mission sur l'exercice précédent pour
             cette entité » alors que la recherche porte aussi sur la NATURE de
             la mission : sur un dossier intégré dont le N-1 était un audit
             légal, il affirmait faux. Un écran qui affirme plus que ce qu'il a
             vérifié se fait croire une fois, puis plus jamais. */
          <p className="faint">{t('cf.rienAReprendre')}</p>
        ) : (
          <>
            {liste.length === 0 ? (
              <form action={proposerAction}>
                <input type="hidden" name="engagement_id" value={id} />
                <button className="btn">{t('cf.proposeTheCarryForward')}</button>
              </form>
            ) : (
              <p>
                {enAttente.length > 0
                  ? <span className="badge amber">{enAttente.length} {t('cf.proposalSNotDecidedSignOff')}</span>
                  : <span className="badge green">{t('cf.everyProposalIsDecided')}</span>}
              </p>
            )}
          </>
        )}
      </div>

      {liste.length > 0 && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr><th>{t('col.nature')}</th><th>{t('cf.whatThePriorYearProposes')}</th><th>{t('cf.decision')}</th></tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id} className={r.status === 'proposed' ? 'warn' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="badge gray">{NATURES[r.kind] ? t(NATURES[r.kind]) : r.kind}</span>
                  </td>
                  <td>
                    {r.label}
                    {r.detail && <div className="faint" style={{ fontSize: 11, maxWidth: 520 }}>{r.detail}</div>}
                    {r.decision_reason && (
                      <div className="faint" style={{ fontSize: 11 }}><em>{t('commun.motif')} {r.decision_reason}</em></div>
                    )}
                  </td>
                  <td>
                    {r.status === 'proposed' ? (
                      <form action={deciderAction} className="row" style={{ gap: 4 }}>
                        <input type="hidden" name="engagement_id" value={id} />
                        <input type="hidden" name="reprise_id" value={r.id} />
                        <input name="reason" placeholder={t('cf.reasonRequiredToRuleOut')} style={{ width: 200 }} />
                        <button className="btn secondary small" name="status" value="reconfirmed">{t('col.reconfirm')}</button>
                        <button className="btn secondary small" name="status" value="dismissed">{t('cf.ruleOut')}</button>
                      </form>
                    ) : (
                      <span className={`badge ${r.status === 'reconfirmed' ? 'green' : 'gray'}`}>
                        {r.status === 'reconfirmed' ? t('cf.reconfirmed') : t('cf.ruledOut')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {obstacles.length > 0 && (
        <div className="panel warn">
          <h2>{t('cf.blockersToSignOffCarryForward')}</h2>
          <ul>{obstacles.map((o, i) => <li key={i}>{t(o.cle, o.vars)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
