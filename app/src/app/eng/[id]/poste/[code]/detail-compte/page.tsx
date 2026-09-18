import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { vuePoste } from '@/lib/services/poste';
import { derniereDemandeDetailDeCompte, numeroDemande } from '@/lib/services/requests';
import { detailsDeCompteDuDossier } from '@/lib/services/account-detail';
import { fmtEur } from '@/lib/kernel/canon';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import { demanderDetailAction, importerDetailAction, rapprocherAction } from './actions';

/* Lot 7, priorité 1 (R98, docs/BACKLOG_REPORTE.md) : l'atelier « détail du compte :
 * rapprochement », générique par fsliCode — construit pour PERSONNEL-DSN (PAYROLL,
 * nature `rapprochement`), déjà planté (`part1.ts::planifierPaie`) sans écran atteignable.
 * MÊME ÉCRAN et MÊMES services que /sampling (REVENUE, plan d'autonomie Partie B étapes
 * 1-2) — account-detail.ts et requests.ts::demanderDetailDeCompte sont déjà paramétrées
 * par fsliCode ; cette page ne fait qu'exposer ce qui existait déjà pour un poste hors
 * REVENUE (règle 9 : mécanique réutilisée, pas dupliquée).
 *
 * CE QUE CETTE PAGE NE FAIT PAS (règle 19) : elle n'expose PAS les étapes 3-4 du plan
 * d'autonomie (population dérivée, tirage) — POP-01/`sampling.ts` restent câblés sur
 * REVENUE seule, et PERSONNEL-DSN n'est pas une procédure `sondage_pieces` : le
 * rapprochement (étapes 1-2) EST tout son geste. */

export const dynamic = 'force-dynamic';

export default async function DetailCompteAtelierPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; code: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id, code } = await params;
  const { erreur } = await searchParams;
  const t = await tr();
  await requireMember(id);
  const poste = await vuePoste(id, code);
  if (!poste) notFound();

  const demandeDetail = await derniereDemandeDetailDeCompte(id, code);
  const detailsImportes = await detailsDeCompteDuDossier(id, code);

  return (
    <div className="shell">
      <BandeauRefus erreur={erreur} />
      <p><Link href={`/eng/${id}/poste/${code}`}>{t('detailCompte.retourPoste', { poste: poste.fsli.name })}</Link></p>
      <h1>{t('detailCompte.titreEcran', { poste: poste.fsli.name })}</h1>

      <div className="panel" data-detail-de-compte>
        <h2 style={{ marginTop: 0 }}>{t('samp.detailDeCompteTitre')}</h2>
        <p className="muted">{t('samp.detailDeCompteAide')}</p>
        {demandeDetail ? (
          <p>
            <Link href={`/eng/${id}/requests/${demandeDetail.id}`} data-detail-de-compte-lien>
              {t('samp.detailDeCompteDemandee', { numero: numeroDemande(demandeDetail.seq_no), statut: demandeDetail.status })}
            </Link>
          </p>
        ) : (
          <form action={demanderDetailAction}>
            <input type="hidden" name="engagement_id" value={id} />
            <input type="hidden" name="fsli_code" value={code} />
            <button className="btn" data-demander-detail-de-compte>{t('samp.demanderDetailDeCompte')}</button>
          </form>
        )}
      </div>

      <div className="panel" data-rapprochement-detail>
        <h2 style={{ marginTop: 0 }}>{t('samp.rapprochementTitre')}</h2>
        <p className="muted">{t('samp.rapprochementAide')}</p>
        {detailsImportes.map((d) => (
          <div key={d.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--e2)' }} data-rapprochement-ligne={d.id}>
            <span>
              {t('samp.rapprochementLigne', {
                lignes: d.rowCount, total: fmtEur(d.totalCents, 'fr'), attendu: fmtEur(d.glAttenduCents, 'fr'),
                ecart: fmtEur(d.ecartCents, 'fr'),
              })}
            </span>
            {d.rapprochee ? (
              <span data-rapprochement-conclu>
                <span className="badge green">{t('samp.rapprochementConclu')}</span>
                {d.ecartExplication && <span className="faint"> — {d.ecartExplication}</span>}
              </span>
            ) : (
              <form action={rapprocherAction} className="row">
                <input type="hidden" name="engagement_id" value={id} />
                <input type="hidden" name="fsli_code" value={code} />
                <input type="hidden" name="import_id" value={d.id} />
                {d.ecartCents !== 0 && (
                  <input type="text" name="explication" placeholder={t('samp.rapprochementEcartExplication')} style={{ minWidth: 260 }} />
                )}
                <button className="btn small" data-rapprocher={d.id}>{t('samp.rapprochementConclure')}</button>
              </form>
            )}
          </div>
        ))}
        <form action={importerDetailAction} className="row">
          <input type="hidden" name="engagement_id" value={id} />
          <input type="hidden" name="fsli_code" value={code} />
          <input type="file" name="fichier" style={{ maxWidth: 230 }} data-import-detail-fichier />
          <button className="btn secondary small">{t('samp.rapprochementImporterFichier')}</button>
        </form>
      </div>
    </div>
  );
}
