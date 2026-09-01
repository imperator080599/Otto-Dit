import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import {
  importerEstimation, tirerBase, demanderJustificatifs, listeEstimations, detailEstimation,
} from '@/lib/services/estimations';
import { currentMateriality } from '@/lib/services/materiality';
import { fmtEur } from '@/lib/kernel/canon';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

// LES ESTIMATIONS COMPTABLES HORS LITIGE (point 11a, ADR-106). Le client
// fournit son fichier de calcul ; l'écran : importer → rapprocher à la
// comptabilité (dérivé du grand livre actif) → recalculer ligne à ligne →
// sonder la base (même moteur de tirage que le chiffre d'affaires) →
// demander les justificatifs (base des lignes tirées + CHAQUE taux + la
// formule) par le circuit habituel, en brouillon d'abord (L2).

export default async function EstimationsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; est?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur, est } = await searchParams;
  await requireMember(id);
  const estimations = await listeEstimations(id);
  const ouverte = estimations.length
    ? await detailEstimation(est && estimations.some((e) => e.id === est) ? est : estimations[0].id)
    : null;
  const mat = await currentMateriality(id).catch(() => null);
  const capProposeCents = mat ? Math.round(Number(mat.perf_amount) * 100) : 500000;

  async function importAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/estimations`, async () => {
      const { user } = await requireMember(id);
      const fichier = formData.get('fichier') as File;
      if (!fichier || !fichier.size) throw new Error('estimation : choisissez le fichier de calcul du client');
      await importerEstimation({
        engagementId: id,
        titre: String(formData.get('titre') ?? ''),
        pieceRef: String(formData.get('piece_ref') ?? ''),
        filename: fichier.name,
        contenu: new Uint8Array(await fichier.arrayBuffer()),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/estimations`);
    });
  }
  async function tirerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/estimations`, async () => {
      const { user } = await requireMember(id);
      await tirerBase(String(formData.get('estimation_id')), {
        coverageCapCents: Math.round(Number(formData.get('cap')) * 100),
        randomSize: Number(formData.get('taille')),
        seed: String(formData.get('germe') ?? 'otto-estimation-1'),
      }, user.id);
      revalidatePath(`/eng/${id}/estimations`);
    });
  }
  async function demanderAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/estimations`, async () => {
      const { user } = await requireMember(id);
      await demanderJustificatifs(String(formData.get('estimation_id')), user.id);
      revalidatePath(`/eng/${id}/estimations`);
      revalidatePath(`/eng/${id}/requests`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <h2>{t('rail.estimations')} <span className="badge gray">{estimations.length}</span></h2>
        <form action={importAction} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <input name="titre" placeholder={t('est.titleEGAccruedRevenue2025')} style={{ minWidth: 220 }} />
          <input name="piece_ref" placeholder={t('est.referenceOfTheEntryConcernedE')} className="mono" style={{ minWidth: 200 }} />
          <input type="file" name="fichier" style={{ maxWidth: 230 }} />
          <button className="btn">{t('est.importTheCalculationFile')}</button>
        </form>
      </div>

      {estimations.length > 1 && (
        <p className="row" style={{ gap: 6 }}>
          {estimations.map((e) => (
            <Link key={e.id} href={`/eng/${id}/estimations?est=${e.id}`}
              className={`badge ${ouverte?.id === e.id ? 'blue' : 'gray'}`}>
              {e.titre}
            </Link>
          ))}
        </p>
      )}

      {ouverte && (
        <>
          <div className="panel">
            <h2>{ouverte.titre} <span className="badge gray">{ouverte.statut}</span></h2>
            <p className="faint">
              {t('est.fichier')} <span className="mono">{ouverte.sourceFilename}</span> {t('est.empreinte')}{' '}
              <span className="mono">{ouverte.sourceSha256.slice(0, 14)}…</span> ·{' '}
              <a href={`/api/blob/${ouverte.sourceEvidenceId}`} target="_blank">{t('bal.openTheDocument')}</a>
              {ouverte.requestId && <> · <Link href={`/eng/${id}/requests/${ouverte.requestId}`}>{t('est.theRequestForSupportingDocuments')}</Link></>}
            </p>
            {/* LE RAPPROCHEMENT — le montant comptabilisé est DÉRIVÉ du grand
                livre actif à chaque lecture, jamais stocké. */}
            <div className="grid cols-2">
              <div className="kpi"><span className="v">{fmtEur(ouverte.montantComptabiliseCents, 'fr')}</span><span className="l">{t('est.booked')}{ouverte.pieceRef}, grand livre actif)</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.declareTotalCents, 'fr')}</span><span className="l">{t('est.totalOfTheClientFile')}</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.recalculTotalCents, 'fr')}</span><span className="l">{t('est.recomputedByOttoBaseRate')}</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.ecartCents, 'fr')}</span><span className="l">{t('est.differenceBookedFile')}</span></div>
            </div>
            {ouverte.ecartCents !== 0 && (
              <div className="callout warn mt">
                {t('est.baseNExpliquePas')}{' '}
                <strong>{fmtEur(ouverte.ecartCents, 'fr')}</strong>. {t('est.demandezLaVersion')}
              </div>
            )}

            {ouverte.statut !== 'demandee' && (
              <form action={tirerAction} className="row mt" style={{ flexWrap: 'wrap', gap: 6 }}>
                <input type="hidden" name="estimation_id" value={ouverte.id} />
                <label className="row" style={{ gap: 4 }}>{t('est.couvertureSup')}
                  <input type="number" name="cap" step="0.01" defaultValue={(capProposeCents / 100).toFixed(2)} style={{ width: 110 }} /> €
                </label>
                <label className="row" style={{ gap: 4 }}>{t('est.randomDraw')}
                  <input type="number" name="taille" defaultValue={3} style={{ width: 60 }} />
                </label>
                <label className="row" style={{ gap: 4 }}>{t('mot.seed')}
                  <input name="germe" defaultValue="otto-estimation-1" className="mono" style={{ width: 160 }} />
                </label>
                <button className="btn secondary">{t('est.drawTheBase')}</button>
                <span className="faint">{t('est.sameEngineAsTheRevenueSample')}</span>
              </form>
            )}
            <form action={demanderAction} className="mt">
              <input type="hidden" name="estimation_id" value={ouverte.id} />
              <button className="btn">{t('est.requestSupportingDocumentsDraftL2')}</button>
              <span className="faint" style={{ marginLeft: 8 }}>
                {t('est.baseOfTheDrawnLinesEach')}
              </span>
            </form>
          </div>

          {/* Pleine largeur, l'un sous l'autre : deux tableaux larges dans une
              grille à deux colonnes forcent la page à déborder (min-content). */}
          <div>
            <div className="panel">
              <h2>{t('est.theBaseLineByLine')} <span className="badge gray">{ouverte.lignes.length}</span></h2>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr>
                    <th>{ouverte.libelles[0]}</th><th className="num">{ouverte.libelles[1]}</th>
                    <th className="num">{ouverte.libelles[2]}</th><th className="num">{ouverte.libelles[3]}</th>
                    <th className="num">{t('col.recomputation')}</th><th>{t('col.draw')}</th>
                  </tr></thead>
                  <tbody>
                    {ouverte.lignes.map((l) => (
                      <tr key={l.id}>
                        <td>{l.cle}</td>
                        <td className="num">{l.base}</td>
                        <td className="num mono">{l.taux}</td>
                        <td className="num">{fmtEur(l.declareCents, 'fr')}</td>
                        <td className="num">
                          {fmtEur(l.recalculCents, 'fr')} {l.conforme ? '✓' : <span className="badge red">✗</span>}
                        </td>
                        <td>
                          {l.retenu
                            ? <span className="badge blue">{t(l.motif === 'high_value' ? 'est.motifCouverture' : l.motif === 'risk_flag' ? 'est.motifMarqueur' : 'est.motifAlea')}</span>
                            : <span className="faint">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <h2>{t('est.theRatesAndTheFormula')} <span className="badge gray">{ouverte.parametres.length}</span></h2>
              <p className="faint">{t('est.everyRateMustBeSupportedA')}</p>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>{t('est.parameter')}</th><th>{t('col.value')}</th><th>{t('est.document')}</th></tr></thead>
                  <tbody>
                    {ouverte.parametres.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nom}</td>
                        <td className="mono">{p.valeur}</td>
                        <td>{ouverte.requestId
                          ? <span className="badge blue">{t('est.requested')}</span>
                          : <span className="faint">{t('est.notRequestedYet')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
