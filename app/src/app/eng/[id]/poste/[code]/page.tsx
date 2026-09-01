import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { vuePoste, type EtatBloc } from '@/lib/services/poste';
import { visiter } from '@/lib/services/sections';
import { tr } from '@/lib/i18n';

// L'ESPACE DE TRAVAIL D'UN POSTE — UNE seule section (revue n°2 §5, §6.3).
//
// Ce que la revue a fait retirer, et pourquoi : « Le travail sur ce poste » et
// « La boucle » étaient deux tableaux qui RACONTAIENT le travail au lieu de le
// porter. Les étapes restent — leadsheet, processus, contrôle interne,
// risques, échantillon, testing — mais comme une bande d'accès, pas comme un
// commentaire. Et « Papiers de travail » disparaît : le papier se lit dans la
// LEADSHEET, en référence croisée sur le compte qu'il teste.

export const dynamic = 'force-dynamic';

const CLASSE: Record<EtatBloc, string> = {
  fait: 'green', en_cours: 'amber', a_faire: 'gray', sans_objet: 'gray',
};

export default async function PostePage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = await params;
  const { user } = await requireMember(id);
  const t = await tr();
  const ref = decodeURIComponent(code);
  const v = await vuePoste(id, ref);
  if (!v) notFound();

  /* « Recent » est un journal de CONSULTATION : il se remplit en ouvrant. */
  await visiter(id, 'poste', ref, user.id);

  const base = `/eng/${id}`;
  const euros = (cents: number) =>
    `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{v.fsli.name}</h2>
        <span className="row">
          <span className="mono faint">{v.fsli.code}</span>
          <Link href={`${base}/reconciliation`} className="btn secondary small">
            {t('poste.trialBalance')}
          </Link>
        </span>
      </div>

      {/* LA BANDE D'ÉTAPES — l'ordre dans lequel on travaille un poste, en une
          ligne cliquable. Elle remplace le tableau qui décrivait chaque étape. */}
      <nav className="etapes" aria-label={t('poste.testing')}>
        {v.blocs.map((b) => (b.href ? (
          <Link key={b.cle} href={b.href} className={`etape ${CLASSE[b.etat]}`} title={b.resume}>
            {b.titre}<span className="etape-detail">{b.resume}</span>
          </Link>
        ) : (
          <span key={b.cle} className={`etape ${CLASSE[b.etat]}`} title={b.resume}>
            {b.titre}<span className="etape-detail">{b.resume}</span>
          </span>
        )))}
      </nav>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{t('poste.leadsheet')}</h3>
        <table className="data">
          <thead>
            <tr>
              <th>{t('poste.account')}</th>
              <th>{t('poste.caption')}</th>
              <th className="num">{t('poste.balance')}</th>
              {/* La liste complète des papiers se rejoint par l'en-tête XREF :
                  elle porte le geste « rédiger le papier », qui doit rester
                  atteignable — mais elle cesse d'être une section du rail. */}
              <th><Link href={`${base}/workpapers`}>{t('poste.xref')}</Link></th>
            </tr>
          </thead>
          <tbody>
            {v.comptes.map((c) => (
              <tr key={c.number}>
                <td className="mono">
                  {/* D'OÙ VIENT LE MONTANT : le compte renvoie à la balance
                      générale rapprochée du grand livre. */}
                  <Link href={`${base}/reconciliation`}>{c.number}</Link>
                </td>
                <td>{c.label}</td>
                <td className="num">{euros(c.balanceCents)}</td>
                <td className="mono">
                  {c.xref.length === 0 ? <span className="faint">—</span>
                    : c.xref.map((x, i) => (
                      <span key={x.id}>
                        {i > 0 && ' · '}
                        <Link href={`${base}/workpapers/${x.id}`}>{x.code}</Link>
                      </span>
                    ))}
                </td>
              </tr>
            ))}
            {v.comptes.length === 0 && (
              <tr><td colSpan={4} className="faint">—</td></tr>
            )}
          </tbody>
          {v.comptes.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan={2}>{t('poste.total')}</th>
                <th className="num">{euros(v.totalCents)}</th>
                <th />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{t('poste.openItems')}</h3>
        <table className="data">
          <tbody>
            <tr>
              <td><Link href={`${base}/exceptions`}>{t('poste.exceptions')}</Link></td>
              <td className="num">
                {v.ecarts.ouverts > 0
                  ? <span className="badge red">{v.ecarts.ouverts}</span>
                  : <span className="faint">0</span>}
              </td>
              <td className="faint">/ {v.ecarts.total}</td>
            </tr>
            <tr>
              <td><Link href={`${base}/notes`}>{t('poste.reviewNotes')}</Link></td>
              <td className="num">{v.notes > 0 ? v.notes : <span className="faint">0</span>}</td>
              <td />
            </tr>
            <tr>
              <td><Link href={`${base}/requests`}>{t('poste.requests')}</Link></td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
