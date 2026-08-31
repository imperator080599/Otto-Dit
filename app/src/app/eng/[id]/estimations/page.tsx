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
        <h2>Estimations comptables <span className="badge gray">{estimations.length}</span></h2>
        <p className="faint">
          Le client fournit son FICHIER DE CALCUL (quatre colonnes : clé ; base ; taux ; montant,
          séparées par des points-virgules — le montant doit valoir base × taux). OTTO rapproche le
          total à l&apos;écriture comptable visée, recalcule chaque ligne au centime, sonde la base
          avec le même moteur de tirage que le chiffre d&apos;affaires, et demande les justificatifs :
          la pièce de base pour chaque ligne tirée, le contrat pour CHAQUE taux, la note de méthode
          pour la formule. Rien ne part au client sans approbation.
        </p>
        <form action={importAction} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <input name="titre" placeholder="titre — ex. Factures à établir 2025" style={{ minWidth: 220 }} />
          <input name="piece_ref" placeholder="référence de l'écriture visée — ex. OD-2025-089" className="mono" style={{ minWidth: 200 }} />
          <input type="file" name="fichier" style={{ maxWidth: 230 }} />
          <button className="btn">Importer le fichier de calcul</button>
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
              Fichier <span className="mono">{ouverte.sourceFilename}</span> · empreinte{' '}
              <span className="mono">{ouverte.sourceSha256.slice(0, 14)}…</span> ·{' '}
              <a href={`/api/blob/${ouverte.sourceEvidenceId}`} target="_blank">ouvrir la pièce</a>
              {ouverte.requestId && <> · <Link href={`/eng/${id}/requests/${ouverte.requestId}`}>la demande de justificatifs</Link></>}
            </p>
            {/* LE RAPPROCHEMENT — le montant comptabilisé est DÉRIVÉ du grand
                livre actif à chaque lecture, jamais stocké. */}
            <div className="grid cols-2">
              <div className="kpi"><span className="v">{fmtEur(ouverte.montantComptabiliseCents, 'fr')}</span><span className="l">Comptabilisé ({ouverte.pieceRef}, grand livre actif)</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.declareTotalCents, 'fr')}</span><span className="l">Total du fichier du client</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.recalculTotalCents, 'fr')}</span><span className="l">Recalculé par OTTO (Σ base × taux)</span></div>
              <div className="kpi"><span className="v">{fmtEur(ouverte.ecartCents, 'fr')}</span><span className="l">Écart comptabilisé − fichier</span></div>
            </div>
            {ouverte.ecartCents !== 0 && (
              <div className="callout warn mt">
                La base fournie n&apos;explique pas le montant comptabilisé : écart de{' '}
                <strong>{fmtEur(ouverte.ecartCents, 'fr')}</strong>. Demandez au client la version du
                fichier qui fonde l&apos;écriture — un fichier qui ne la reconstitue pas ne la justifie pas.
              </div>
            )}

            {ouverte.statut !== 'demandee' && (
              <form action={tirerAction} className="row mt" style={{ flexWrap: 'wrap', gap: 6 }}>
                <input type="hidden" name="estimation_id" value={ouverte.id} />
                <label className="row" style={{ gap: 4 }}>couverture ≥
                  <input type="number" name="cap" step="0.01" defaultValue={(capProposeCents / 100).toFixed(2)} style={{ width: 110 }} /> €
                </label>
                <label className="row" style={{ gap: 4 }}>tirage aléatoire
                  <input type="number" name="taille" defaultValue={3} style={{ width: 60 }} />
                </label>
                <label className="row" style={{ gap: 4 }}>germe
                  <input name="germe" defaultValue="otto-estimation-1" className="mono" style={{ width: 160 }} />
                </label>
                <button className="btn secondary">Tirer la base</button>
                <span className="faint">même moteur que l&apos;échantillon du chiffre d&apos;affaires — déterministe, rejouable</span>
              </form>
            )}
            <form action={demanderAction} className="mt">
              <input type="hidden" name="estimation_id" value={ouverte.id} />
              <button className="btn">Demander les justificatifs (brouillon — L2)</button>
              <span className="faint" style={{ marginLeft: 8 }}>
                base des lignes tirées + chaque taux + la note de méthode ; à approuver avant l&apos;envoi
              </span>
            </form>
          </div>

          {/* Pleine largeur, l'un sous l'autre : deux tableaux larges dans une
              grille à deux colonnes forcent la page à déborder (min-content). */}
          <div>
            <div className="panel">
              <h2>La base, ligne par ligne <span className="badge gray">{ouverte.lignes.length}</span></h2>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr>
                    <th>{ouverte.libelles[0]}</th><th className="num">{ouverte.libelles[1]}</th>
                    <th className="num">{ouverte.libelles[2]}</th><th className="num">{ouverte.libelles[3]}</th>
                    <th className="num">Recalcul</th><th>Tirage</th>
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
                            ? <span className="badge blue">{l.motif === 'high_value' ? 'couverture' : l.motif === 'risk_flag' ? 'marqueur' : 'aléa'}</span>
                            : <span className="faint">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <h2>Les taux et la formule <span className="badge gray">{ouverte.parametres.length}</span></h2>
              <p className="faint">Chaque taux se justifie — un taux contractuel faux fausse toute sa ligne, sondée ou pas.</p>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Paramètre</th><th>Valeur</th><th>Justificatif</th></tr></thead>
                  <tbody>
                    {ouverte.parametres.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nom}</td>
                        <td className="mono">{p.valeur}</td>
                        <td>{ouverte.requestId
                          ? <span className="badge blue">demandé</span>
                          : <span className="faint">pas encore demandé</span>}</td>
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
