import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { syntheseComite } from '@/lib/services/gouvernance';
import { NATURES } from '@/lib/services/completion';
import { FAMILLES } from '../familles';
import { tr } from '@/lib/i18n';
import { Repli } from '@/app/repli';

/* Lot 7, H-4 tranche 1 : le troisième périmètre d'audience (équipe, direction,
 * déjà en ligne — comité, ici). Pure lecture, zéro migration : voir
 * gouvernance.ts pour ce qui est agrégé et pourquoi rien n'est rédigé ici. */

export const dynamic = 'force-dynamic';

const SEV_BADGE: Record<string, string> = { deficiency: 'amber', significant_deficiency: 'violet', material_weakness: 'red' };
const fr = (iso: string | null | undefined) =>
  (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export default async function ComitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const s = await syntheseComite(id);

  return (
    <div className="stack">
      <div className="panel">
        <h2 style={{ margin: 0 }}>{t('ach.gouvernance.titre')}</h2>
        <p className="faint">{t('gov.aide')}</p>
        <p>
          {s.visaPossible ? (
            <span className="badge green">{t('gov.visaPossible')}</span>
          ) : (
            <span className="badge amber">{t('gov.obstaclesRestants', { n: s.obstaclesTotal })}</span>
          )}
        </p>
        {!s.visaPossible && (
          <ul>
            {s.parFamille.map((f) => (
              <li key={f.famille}>{t(FAMILLES[f.famille].titre)} — {f.n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid cols-2">
        <Repli cle="gov.ecarts" niveau={2} titre={t('gov.ecarts')}>
          <p>{t('gov.ecartsDetail', { ouverts: s.ecarts.ouverts, total: s.ecarts.total, escalades: s.ecarts.escalades })}</p>
          <Link href={`/eng/${id}/exceptions`}>{t('rail.ecarts')}</Link>
        </Repli>

        <Repli cle="gov.deficiences" niveau={2} titre={t('gov.deficiences')}>
          {s.deficiences.length === 0 ? (
            <p className="muted">{t('gov.aucuneDeficience')}</p>
          ) : (
            <div className="row">
              {s.deficiences.map((d) => (
                <span key={d.severite} className={`badge ${SEV_BADGE[d.severite] ?? 'gray'}`}>{d.severite.replace(/_/g, ' ')}: {d.n}</span>
              ))}
            </div>
          )}
        </Repli>
      </div>

      <Repli cle="gov.achevement" niveau={2} titre={t('gov.achevement')}>
        <table className="data">
          <thead><tr><th>{t('gov.achevement')}</th><th>{t('col.status')}</th><th>{t('comp.conclusion')}</th></tr></thead>
          <tbody>
            {s.achevement.map((x) => {
              const meta = NATURES.find((n) => n.code === x.nature)!;
              return (
                <tr key={x.id}>
                  <td>{t(meta.libelle)}</td>
                  <td>
                    {x.status === 'done' && <span className="badge green">{t('mot.concluded')} {fr(x.done_at)}</span>}
                    {x.status === 'na' && <span className="badge gray">{t('comp.notApplicable')}</span>}
                    {x.status === 'open' && <span className="badge amber">{t('comp.toConclude')}</span>}
                  </td>
                  <td>{x.conclusion || <span className="faint">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p><Link href={`/eng/${id}/completion`}>{t('gov.achevement')} →</Link></p>
      </Repli>

      <div className="grid cols-2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{t('gov.papiersSignes')}</h3>
          <p>{s.papiers.signes}/{s.papiers.total}</p>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{t('gov.prochainJalon')}</h3>
          <p>
            {s.jalonsEnRetard > 0
              ? <span className="badge red">{t('gov.jalonsEnRetard', { n: s.jalonsEnRetard })}</span>
              : <span className="badge green">{t('gov.aucunJalonEnRetard')}</span>}
          </p>
          <p className="faint">
            {s.jalonProchain ? `${s.jalonProchain.label} — ${fr(s.jalonProchain.due_date)}` : t('gov.aucunJalonAVenir')}
          </p>
        </div>
      </div>
    </div>
  );
}
