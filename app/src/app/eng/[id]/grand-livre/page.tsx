import { requireMember } from '@/lib/core/auth';
import { testExhaustifGrandLivre } from '@/lib/services/grand-livre';
import { fmtEur } from '@/lib/kernel/canon';
import { tr, locale, type CleLibelle } from '@/lib/i18n';

/** Une règle de `flags.ts` (JeFlag) est TOUJOURS l'une des six clés `gl.regle.<code>.*` posées
 *  dans le catalogue (langue.ts en garde la couverture, `gl.regle.` groupe entier) — jamais un
 *  code arbitraire venu d'ailleurs. */
const cleRegle = (regle: string, champ: 'libelle' | 'couvre' | 'neCouvrePas') => `gl.regle.${regle}.${champ}` as CleLibelle;

/* H-3, SLICE 1 (Lot 7, docs/REGISTRE_IDEES.md §H) : « l'analytique en population COMPLÈTE à côté
   du sondage, avec l'énoncé honnête de ce qu'un test exhaustif couvre et ne couvre pas ». Rend
   visible ce qu'ADR-003 (kernel/flags.ts) calcule déjà, à l'import, sur TOUTE la population du
   grand livre — jamais un sous-ensemble tiré. Zéro nouvelle règle, zéro migration : une lecture. */

export const dynamic = 'force-dynamic';

export default async function GrandLivrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const t = await tr();
  const l = await locale();
  const eur = (c: number) => fmtEur(c, l);
  const { total, regles } = await testExhaustifGrandLivre(id);

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>{t('gl.titre')}</h2>
      <p className="faint">{t('gl.aide')}</p>
      <div className="panel">
        <p>
          {t('gl.couverture', { total })}
        </p>
        <p className="faint">{t('gl.disclaimer')}</p>
      </div>
      {regles.map((r) => (
        <div className="panel" key={r.regle}>
          <h3 style={{ marginTop: 0 }}>
            {t(cleRegle(r.regle, 'libelle'))} <span className="badge gray">{r.nombre}</span>
          </h3>
          <p className="faint"><strong>{t('gl.couvre')}</strong> {t(cleRegle(r.regle, 'couvre'))}</p>
          <p className="faint"><strong>{t('gl.neCouvrePas')}</strong> {t(cleRegle(r.regle, 'neCouvrePas'))}</p>
          {r.nombre === 0 ? (
            <p className="muted">{t('gl.aucune')}</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('col.date')}</th>
                    <th>{t('gl.piece')}</th>
                    <th>{t('col.compte')}</th>
                    <th>{t('col.description')}</th>
                    <th className="num">{t('col.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.exemples.map((e) => (
                    <tr key={`${r.regle}-${e.entryNo}-${e.entryDate}`}>
                      <td>{e.entryDate}</td>
                      <td className="mono">{e.entryNo}{e.pieceRef ? ` · ${e.pieceRef}` : ''}</td>
                      <td className="mono">{e.accountNo}</td>
                      <td>{e.label ?? '—'}</td>
                      <td className="num">{eur(e.montantCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.nombre > r.exemples.length && (
                <p className="faint">{t('gl.exemplesLimites', { affiches: r.exemples.length, total: r.nombre })}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
