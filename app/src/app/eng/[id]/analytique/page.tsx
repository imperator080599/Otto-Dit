import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { revueAnalytiqueGlobale } from '@/lib/services/analytique';
import { fmtEur } from '@/lib/kernel/canon';
import { tr, locale } from '@/lib/i18n';
import { phraseOrigineN1, signe, pct } from '@/lib/services/analytique-vue';

// LA REVUE ANALYTIQUE DU DOSSIER (mandat de la soirée, §2.2). Chaque poste du
// pack — bilan puis compte de résultat — avec N, N-1, la variation, et le
// texte rédigé sur la page du poste : LE MÊME OBJET, pas une copie. La ligne
// de variation d'une leadsheet renvoie ici ; d'ici, on ouvre le poste.

export const dynamic = 'force-dynamic';

export default async function AnalytiquePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const t = await tr();
  const l = await locale();
  const { origine, postes } = await revueAnalytiqueGlobale(id);
  const eur = (c: number) => fmtEur(c, l);
  const base = `/eng/${id}`;

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>{t('ana.titre')}</h2>
      <p className="faint">{t('ana.aide')}</p>
      <p className="faint" data-origine-n1={origine.source}>{phraseOrigineN1(t, origine)}</p>
      {(['BS', 'IS'] as const).map((etat) => (
        <div className="panel" key={etat}>
          <h3 style={{ marginTop: 0 }}>{t(etat === 'BS' ? 'rail.groupe.bilan' : 'rail.groupe.resultat')}</h3>
          <div className="table-scroll">
            <table className="data leadsheet" data-analytique-globale={etat}>
              <thead>
                <tr>
                  <th>{t('ana.poste')}</th>
                  <th className="num">{t('poste.soldeN')}</th>
                  <th className="num">{t('poste.soldeN1')}</th>
                  <th className="num">{t('poste.variation')}</th>
                  <th className="num">{t('poste.variationPct')}</th>
                  <th>{t('poste.analytique')}</th>
                </tr>
              </thead>
              <tbody>
                {postes.filter((p) => p.statement === etat).map((p) => (
                  <tr key={p.code} id={p.code} data-poste={p.code} className={p.retenu ? '' : 'grise'}>
                    <td>
                      {p.retenu
                        ? <Link href={`${base}/poste/${encodeURIComponent(p.code)}#analytique`} title={t('notes.openThePoste')}>{p.name}</Link>
                        : <span title={t('ana.horsPerimetre')}>{p.name}</span>}
                      <span className="faint mono"> {p.code}</span>
                    </td>
                    <td className="num">{eur(p.totalCents)}</td>
                    <td className="num">{p.totalN1Cents === null ? '—' : eur(p.totalN1Cents)}</td>
                    <td className="num">{p.variationCents === null ? '—' : signe(p.variationCents, eur)}</td>
                    <td className="num">{pct(p.variationPct, l)}</td>
                    <td>
                      {p.revue ? (
                        <span data-revue-version={p.revue.version}>
                          {p.revue.perimee && <span className="badge amber" style={{ marginRight: 4 }}>{t('ana.perimee')}</span>}
                          {p.revue.texte.length > 180 ? `${p.revue.texte.slice(0, 180)}…` : p.revue.texte}
                          <span className="faint"> · {t('poste.analytique.redigee', { v: p.revue.version, qui: p.revue.auteur, quand: p.revue.quand.slice(0, 10) })}</span>
                        </span>
                      ) : <span className="faint">{t('ana.aucune')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
