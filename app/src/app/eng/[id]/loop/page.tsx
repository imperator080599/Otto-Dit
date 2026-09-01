import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { boucle, tours } from '@/lib/services/loop';
import { boucleAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';

// LA BOUCLE, VISIBLE COMME UNE BOUCLE (point 7).
//
// Chaque maillon existait et était testé ; la boucle, elle, n'existait pas
// comme objet. Cet écran ne calcule rien : il montre l'état réel, étape par
// étape, et surtout il montre ce qui BLOQUE — nommément, jamais « en cours ».
//
// LE CHIFFRE QUI COMPTE EST LE NOMBRE DE TOURS. Une file d'étapes se parcourt
// une fois ; une boucle repart. Un écart qui génère une demande de
// clarification, c'est la boucle qui refait un tour — et c'est la thèse du
// produit rendue vérifiable plutôt qu'affirmée.

export const dynamic = 'force-dynamic';

export default async function LoopPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ poste?: string; erreur?: string; ok?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const sp = await searchParams;

  const postes = await q<{ code: string; name: string }>(
    `select code, name from fsli
     where engagement_id = $1 and scoping in ('in_scope', 'in_scope_qualitative')
     order by code`,
    [id],
  );
  const poste = sp.poste ?? postes[0]?.code ?? 'REVENUE';
  const b = await boucle(id, poste);
  const tourList = await tours(id);

  const largeur = (n: number) => Math.max(2, Math.round((n / Math.max(1, b.etapes[0]?.franchi || 1)) * 100));

  return (
    <div className="stack">
      <BandeauRefus erreur={sp.erreur} />
      {sp.ok && (
        <div className="panel">
          <p><span className="badge green">{t('commun.fait')}</span> {sp.ok}</p>
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('loop.theLoop')} {poste}</h2>
          <span>
            {postes.map((p) => (
              <Link
                key={p.code}
                href={`/eng/${id}/loop?poste=${p.code}`}
                className={`btn small ${p.code === poste ? '' : 'secondary'}`}
                style={{ marginLeft: 6 }}
              >{p.code}</Link>
            ))}
          </span>
        </div>
        <p>
          <strong>{b.tours}</strong> {t('loop.loopTurnS')} {b.tours === 0
            ? t('loop.noExceptionHasYetTriggeredA')
            : t('loop.asManyTimesAsAnException')}
          {' · '}
          {b.fermee
            ? <span className="badge green">{t('loop.loopClosedEverySelectedItemIs')}</span>
            : <span className="badge amber">{t('loop.loopOpen')}</span>}
        </p>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 170 }}>{t('loop.step')}</th>
              <th className="num">{t('col.passed')}</th>
              <th style={{ width: 220 }}></th>
              <th className="num">{t('loop.stoppedHere')}</th>
              <th>{t('loop.whatIsAwaited')}</th>
            </tr>
          </thead>
          <tbody>
            {b.etapes.map((e) => (
              <tr key={e.code} className={e.code === b.bloqueA ? 'warn' : undefined}>
                <td>
                  <strong>{e.libelle}</strong>
                  <div className="faint" style={{ fontSize: 11 }}>{e.quoi}</div>
                </td>
                <td className="num"><strong>{e.franchi}</strong></td>
                <td>
                  {/* Une barre à l'encre : la proportion se lit, elle ne se
                      calcule pas de tête. */}
                  <div style={{ background: 'var(--track)', height: 8, borderRadius: 4 }}>
                    <div style={{
                      width: `${largeur(e.franchi)}%`, height: 8, borderRadius: 4,
                      background: e.code === b.bloqueA ? 'var(--amber)' : 'var(--accent)',
                    }} />
                  </div>
                </td>
                <td className="num">
                  {e.enAttente > 0 ? <strong style={{ color: 'var(--amber)' }}>{e.enAttente}</strong> : <span className="faint">—</span>}
                </td>
                <td className="faint">{e.enAttente > 0 ? e.attendQuoi : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {b.obstacles.length > 0 && (
          <>
            <p className="mt"><strong>{t('loop.whatKeepsTheLoopFromClosing')}</strong></p>
            <ul>{b.obstacles.map((o, i) => <li key={i}>{t(o.cle, o.vars)}</li>)}</ul>
          </>
        )}
      </div>

      <div className="panel">
        <h2>{t('loop.theTurnsWhichRequestsCameOut')}</h2>
        {t.length === 0 ? (
          <>
            <form action={boucleAction}>
              <input type="hidden" name="engagement_id" value={id} />
              <input type="hidden" name="poste" value={poste} />
              <button className="btn">{t('loop.issueTheClarificationsOwedOnOpen')}</button>
            </form>
          </>
        ) : (
          <table className="data">
            <thead>
              <tr><th>{t('loop.request')}</th><th>{t('loop.bornOfDifference')}</th><th>{t('loop.stateOfTheDifference')}</th><th>Le</th></tr>
            </thead>
            <tbody>
              {tourList.map((x) => (
                <tr key={x.request_id + x.exception_id}>
                  <td>
                    <Link href={`/eng/${id}/requests/${x.request_id}`}>
                      #{x.seq_no} {x.title}
                    </Link>
                    <div className="faint" style={{ fontSize: 11 }}>{x.request_status}</div>
                  </td>
                  <td>
                    <span className="mono">{x.taxonomy_code}</span>
                    <div className="faint" style={{ fontSize: 11, maxWidth: 380 }}>{x.description}</div>
                  </td>
                  <td>
                    <span className={`badge ${x.exception_status === 'resolved' ? 'green' : 'amber'}`}>
                      {x.exception_status}
                    </span>
                  </td>
                  <td className="faint">{x.created_at.slice(0, 10).split('-').reverse().join('/')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
