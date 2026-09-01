import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import {
  campagne, tiers, completude, rapprochement, importerListing, envoyer,
  deposerReponse, redigerQuestions, expliquerEcart, type Nature, type Litige,
} from '@/lib/services/circularisations';
import { ingestEvidence } from '@/lib/services/evidence';
import { fmtEur } from '@/lib/kernel/canon';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

// LES CIRCULARISATIONS (point 3, ADR-111) — banques et avocats.
//
// L'écran suit la mécanique et rien d'autre : le listing du client, la
// COMPLÉTUDE dérivée dans les deux sens, la demande (envoi simulé, jamais sans
// un humain), la réponse déposée comme pièce, le RAPPROCHEMENT calculé à la
// lecture. Aucun état n'est stocké : ce qui est affiché se recalcule.

const NATURES: { cle: Nature; titre: string; quoi: string; poste: string }[] = [
  {
    cle: 'banque',
    titre: 'Banques',
    quoi: 'Le solde de chaque compte à la date de clôture, confirmé par la banque elle-même.',
    poste: 'trésorerie',
  },
  {
    cle: 'avocat',
    titre: 'Avocats',
    quoi: 'Les litiges en cours et les montants provisionnés, confirmés par le cabinet qui les suit.',
    poste: 'provisions',
  },
];

const ETATS: Record<string, { libelle: string; badge: string }> = {
  a_envoyer: { libelle: 'à envoyer', badge: 'badge amber' },
  envoyee: { libelle: 'envoyée — sans réponse', badge: 'badge gray' },
  recue: { libelle: 'reçue', badge: 'badge gray' },
  rapprochee: { libelle: 'rapprochée', badge: 'badge green' },
  ecart: { libelle: 'écart', badge: 'badge red' },
};

export default async function CircularisationsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);

  async function importAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/circularisations`, async () => {
      const { user } = await requireMember(id);
      const kind = String(formData.get('kind')) as Nature;
      const fichier = formData.get('fichier') as File | null;
      if (!fichier || !fichier.size) {
        throw new Error('circularisation : choisissez le listing fourni par le client (colonnes Tiers;Contact;Reference;Compte).');
      }
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const { evidenceId } = await ingestEvidence({
        engagementId: id, filename: fichier.name, mime: fichier.type || 'text/csv',
        bytes: octets, source: 'auditor', uploadedBy: { kind: 'app_user', id: user.id },
        audience: 'client_provided',
      });
      await importerListing(id, kind, new TextDecoder().decode(octets), user.id, { evidenceId });
      revalidatePath(`/eng/${id}/circularisations`);
    });
  }

  async function envoyerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/circularisations`, async () => {
      const { user } = await requireMember(id);
      await envoyer(String(formData.get('party_id')), user.id);
      revalidatePath(`/eng/${id}/circularisations`);
    });
  }

  async function deposerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/circularisations`, async () => {
      const { user } = await requireMember(id);
      const kind = String(formData.get('kind')) as Nature;
      const partyId = String(formData.get('party_id'));
      const fichier = formData.get('fichier') as File | null;
      if (!fichier || !fichier.size) throw new Error('circularisation : la réponse du tiers est une PIÈCE — joignez-la.');
      const { evidenceId } = await ingestEvidence({
        engagementId: id, filename: fichier.name, mime: fichier.type || 'application/pdf',
        bytes: new Uint8Array(await fichier.arrayBuffer()), source: 'email',
        uploadedBy: { kind: 'app_user', id: user.id }, audience: 'client_provided',
      });
      if (kind === 'banque') {
        const montant = String(formData.get('montant') ?? '').replace(/\s/g, '').replace(',', '.');
        if (!montant || Number.isNaN(Number(montant))) {
          throw new Error('circularisation : le solde confirmé se lit SUR la réponse — saisissez-le (en euros).');
        }
        await deposerReponse({
          partyId, userId: user.id, evidenceId,
          montantConfirmeCents: Math.round(Number(montant) * 100),
        });
      } else {
        const objet = String(formData.get('objet') ?? '').trim();
        const provision = String(formData.get('provision') ?? '').replace(/\s/g, '').replace(',', '.');
        if (!objet) throw new Error('circularisation : un litige se décrit — son objet est obligatoire (« néant » si le cabinet n’en déclare aucun).');
        if (!provision || Number.isNaN(Number(provision))) {
          throw new Error('circularisation : le montant provisionné déclaré par le cabinet est obligatoire (0 si aucun).');
        }
        const existants = (await tiers(id, 'avocat')).find((t) => t.id === partyId)?.litiges ?? [];
        const litiges: Litige[] = [
          ...existants,
          { objet, provision_cents: Math.round(Number(provision) * 100), statut: String(formData.get('statut') ?? 'en cours') },
        ];
        await deposerReponse({ partyId, userId: user.id, evidenceId, litiges });
      }
      revalidatePath(`/eng/${id}/circularisations`);
    });
  }

  async function expliquerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/circularisations`, async () => {
      const { user } = await requireMember(id);
      await expliquerEcart(String(formData.get('party_id')), String(formData.get('explication') ?? ''), user.id);
      revalidatePath(`/eng/${id}/circularisations`);
    });
  }

  async function questionsAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/circularisations`, async () => {
      const { user } = await requireMember(id);
      await redigerQuestions(id, String(formData.get('kind')) as Nature, user.id);
      revalidatePath(`/eng/${id}/circularisations`);
    });
  }

  const sections = await Promise.all(NATURES.map(async (n) => ({
    ...n,
    camp: await campagne(id, n.cle),
    comp: await completude(id, n.cle),
    rap: await rapprochement(id, n.cle),
  })));

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <h2>Circularisations</h2>
      </div>

      {sections.map((s) => (
        <div className="panel" key={s.cle}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{s.titre} <span className="faint">— poste {s.poste}</span></h2>
            {s.camp && (
              <form action={questionsAction}>
                <input type="hidden" name="kind" value={s.cle} />
                <button className="btn secondary small">{t('circ.draftTheQuestionsToTheClient')}</button>
              </form>
            )}
          </div>
          <p className="faint">{s.quoi}</p>

          {/* L'IMPORT RESTE OFFERT UNE FOIS LA CAMPAGNE OUVERTE : le premier
              listing d'un client est presque toujours incomplet — c'est le
              corrigé qui referme la complétude. Réimporter ne rase pas ce qui
              est parti (le service garde les demandes envoyées). */}
          <details>
            <summary className="repli-action">
              {s.camp ? 'Corriger le listing (le client a répondu)' : 'Importer le listing fourni par le client'}
            </summary>
              <form action={importAction} className="mt">
                <input type="hidden" name="kind" value={s.cle} />
                <div className="row">
                  <input type="file" name="fichier" accept=".csv,text/csv" required />
                  <button className="btn small">Importer</button>
                </div>
              </form>
          </details>

          {s.camp && (
            <>
              <p className="faint">
                {t('circ.campaignOpenedAsAt')} <strong>{s.camp.as_of}</strong> ·{' '}
                {s.rap.lignes.length} {t('circ.counterpartiesDifferenceRule')} {s.rap.regle}
                {s.camp.listing_evidence_id && (
                  <> · <a href={`/api/blob/${s.camp.listing_evidence_id}`}>{t('circ.theListingReceived')}</a></>
                )}
              </p>

              {(s.comp.comptesSansTiers.length > 0 || s.comp.tiersSansCompte.length > 0) && (
                <div className="callout warn">
                  <strong>{t('circ.completeness')} {s.comp.comptesSansTiers.length + s.comp.tiersSansCompte.length} constat(s).</strong>
                  <ul>
                    {s.comp.comptesSansTiers.map((c) => (
                      <li key={c.compte}>
                        Le compte <span className="mono">{c.compte}</span> « {c.libelle} » ({fmtEur(c.soldeCents, 'fr')}{t('circ.isCoveredByNo')} <strong>{t('commun.aucun')}</strong> {t('circ.counterpartiesInTheListing')}
                      </li>
                    ))}
                    {s.comp.tiersSansCompte.map((x) => (
                      <li key={x.reference}>
                        « {x.nom} » ({x.reference}{t('circ.statesAccount')}{' '}
                        <span className="mono">{x.compte ?? '—'}</span>{t('circ.whichNoEntryCarries')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.rap.lignes.length > 0 && (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tiers</th><th>{t('circ.reference')}</th><th>Compte</th><th>{t('circ.state')}</th>
                      <th className="num">{t('circ.books')}</th><th className="num">{t('circ.confirmed')}</th><th className="num">{t('circ.difference')}</th>
                      <th>{t('circ.reply')}</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rap.lignes.map((l) => (
                      <tr key={l.id}>
                        <td>{l.nom}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{l.reference}</td>
                        <td className="mono">{l.compte ?? '—'}</td>
                        <td><span className={ETATS[l.etat].badge}>{ETATS[l.etat].libelle}</span></td>
                        <td className="num">{l.soldeComptableCents === null ? '—' : fmtEur(l.soldeComptableCents, 'fr')}</td>
                        <td className="num">
                          {s.cle === 'banque'
                            ? (l.confirmeCents === null ? '—' : fmtEur(l.confirmeCents, 'fr'))
                            : (l.provisionConfirmeeCents === null ? '—' : fmtEur(l.provisionConfirmeeCents, 'fr'))}
                        </td>
                        <td className="num">
                          {l.ecartCents === null ? '—' : fmtEur(l.ecartCents, 'fr')}
                          {l.etat === 'ecart' && !l.explication && (
                            <div style={{ marginTop: 4 }}>
                              <form action={expliquerAction}>
                                <input type="hidden" name="party_id" value={l.id} />
                                <input name="explication" placeholder={t('circ.whyThisDifference')} required style={{ width: 200 }} />
                                <button className="btn small">Expliquer</button>
                              </form>
                            </div>
                          )}
                          {l.explication && <div className="faint" style={{ marginTop: 4 }}>{l.explication}</div>}
                        </td>
                        <td>
                          {l.evidenceId
                            ? <a href={`/api/blob/${l.evidenceId}`}>{t('circ.theReply')}</a>
                            : <span className="faint">—</span>}
                        </td>
                        <td>
                          {l.etat === 'a_envoyer' ? (
                            <form action={envoyerAction}>
                              <input type="hidden" name="party_id" value={l.id} />
                              <button className="btn small secondary">{t('circ.sendSimulated')}</button>
                            </form>
                          ) : (
                            <details>
                              <summary className="repli-action">{t('circ.uploadTheReply')}</summary>
                              <form action={deposerAction}>
                                <input type="hidden" name="party_id" value={l.id} />
                                <input type="hidden" name="kind" value={s.cle} />
                                <input type="file" name="fichier" required />
                                {s.cle === 'banque' ? (
                                  <input name="montant" placeholder={t('circ.confirmedBalance')} required />
                                ) : (
                                  <>
                                    <input name="objet" placeholder={t('circ.subjectOfTheDispute')} required />
                                    <input name="provision" placeholder={t('circ.declaredProvision')} required />
                                    <input name="statut" placeholder={t('circ.statusOngoingJudged')} defaultValue="en cours" />
                                  </>
                                )}
                                <button className="btn small">{t('circ.recordTheReply')}</button>
                              </form>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      ))}

    </div>
  );
}
