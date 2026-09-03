import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import { lignes, totaux, obstaclesPointage } from '@/lib/services/tieout';
import { chargerAction, pointerAction, documenterAction, expliquerAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Repli } from '@/app/repli';

// LE POINTAGE DES ÉTATS FINANCIERS (point 9).
//
// C'est l'autre bout de l'arc : tous les travaux du dossier servent à conclure
// sur des états financiers, et sans pointage on conclut sur une plaquette qu'on
// n'a jamais regardée.

export const dynamic = 'force-dynamic';

const ETATS: Record<string, CleLibelle> = {
  IS: 'rail.groupe.resultat', BS_ASSET: 'fst.etat.BS_ASSET',
  BS_LIAB: 'fst.etat.BS_LIAB', NOTES: 'fst.etat.NOTES',
};

const NATURES: Record<string, CleLibelle> = {
  solde_balance: 'fst.nature.solde_balance',
  agregat_comptes: 'fst.nature.agregat_comptes',
  calcul_documente: 'fst.nature.calcul_documente',
};

export default async function TieOutPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;

  const l = await lignes(id);
  const tot = await totaux(id);
  const obstacles = await obstaclesPointage(id);
  const pieces = await q<{ id: string; filename: string }>(
    `select id, filename from evidence where engagement_id = $1 and quarantined = false
     order by filename limit 40`,
    [id],
  );
  const eur = (v: string | null) => (v === null ? '—' : fmtEur(Math.round(Number(v) * 100), 'fr'));

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <div className="panel">
            <h2>{t('rail.pointage')}</h2>
        <form action={l.length === 0 ? chargerAction : pointerAction} className="row" style={{ gap: 8 }}>
          <input type="hidden" name="engagement_id" value={id} />
          <button className="btn">{l.length === 0 ? t('fst.chargerPlaquette') : t('fst.repointer')}</button>
        </form>
        {tot.length > 0 && (
          <p className="mt">
            {tot.map((x) => (
              <span key={x.statement} style={{ marginRight: 14 }}>
                <strong>{ETATS[x.statement] ? t(ETATS[x.statement]) : x.statement}</strong> :{' '}
                {x.pointees}/{x.lignes} {t('fst.tied')}
              </span>
            ))}
          </p>
        )}
      </div>

      {l.length > 0 && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr>
                <th>{t('fst.state')}</th><th>{t('col.line')}</th><th>{t('col.nature')}</th>
                <th className="num">{t('fst.presented')}</th><th className="num">{t('fst.computed')}</th><th className="num">{t('fst.difference')}</th>
                <th>{t('col.tieout')}</th>
              </tr>
            </thead>
            <tbody>
              {l.map((x) => (
                <tr key={x.id} className={!x.status || x.status === 'open' ? 'warn' : undefined}>
                  <td className="faint" style={{ fontSize: 11 }}>{ETATS[x.statement] ? t(ETATS[x.statement]) : x.statement}</td>
                  <td>
                    <span className="mono">{x.ref}</span> {x.label}
                    {x.explanation && (
                      <div className="faint" style={{ fontSize: 11, maxWidth: 420 }}><em>{x.explanation}</em></div>
                    )}
                  </td>
                  <td className="faint" style={{ fontSize: 11 }}>{NATURES[x.nature ?? ''] ? t(NATURES[x.nature ?? '']) : '—'}</td>
                  <td className="num">{eur(x.presented)}</td>
                  <td className="num">{x.nature === 'calcul_documente' ? <span className="faint">—</span> : eur(x.computed)}</td>
                  <td className="num">
                    {x.difference === null || x.nature === 'calcul_documente'
                      ? <span className="faint">—</span>
                      : Number(x.difference) === 0
                        ? <span className="badge green">0</span>
                        : <strong style={{ color: 'var(--amber)' }}>{eur(x.difference)}</strong>}
                  </td>
                  <td>
                    {x.status === 'tied' && <span className="badge green">{t('fst.tied2')}</span>}
                    {x.status === 'documented' && <span className="badge green">{t('fst.documented')}</span>}
                    {x.status === 'difference' && <span className="badge amber">{t('fst.differenceExplained')}</span>}
                    {(!x.status || x.status === 'open') && (
                      x.nature === 'calcul_documente' ? (
                        <form action={documenterAction} className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                          <input type="hidden" name="engagement_id" value={id} />
                          <input type="hidden" name="ligne_id" value={x.id} />
                          <input name="explanation" placeholder={t('fst.howThisFigureIsObtained')} style={{ width: 240 }} />
                          <select name="evidence_id" defaultValue="">
                            <option value="">{t('fst.document')}</option>
                            {pieces.map((p) => <option key={p.id} value={p.id}>{p.filename}</option>)}
                          </select>
                          <button className="btn secondary small">{t('col.document')}</button>
                        </form>
                      ) : (
                        <form action={expliquerAction} className="row" style={{ gap: 4 }}>
                          <input type="hidden" name="engagement_id" value={id} />
                          <input type="hidden" name="ligne_id" value={x.id} />
                          <input name="explanation" placeholder={t('fst.explanationOfTheDifference')} style={{ width: 240 }} />
                          <button className="btn secondary small">{t('col.explain')}</button>
                        </form>
                      )
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
          <h2>{t('fst.blockersToSignOffTieOut')}</h2>
          <ul>{obstacles.map((o, i) => <li key={i}>{t(o.cle, o.vars)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
