import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { programmeDuDossier, planifierProcedure, redigerPapierDeProcedure, deplanifierProcedure, atelierDeLaNature } from '@/lib/services/programme';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { Repli } from '@/app/repli';
import { tr } from '@/lib/i18n';

// LE PROGRAMME DE TRAVAIL — L'ÉCRAN QUI MANQUAIT (mandat du soir et de la nuit
// J3, étage 1.1).
//
// Les briques existaient depuis des semaines : le risque par assertion dit ce
// qu'il COMMANDE, le service sait planifier une procédure du catalogue et
// rédiger son papier. Aucun écran ne les appelait — seul le semeur de la
// démonstration. Un auditeur lisait donc, sur l'écran du risque, une liste de
// procédures « commandées » qui n'ouvrait sur rien : « un geste du métier sans
// écran », règle 13.
//
// DEUX GESTES, ET PAS UN DE PLUS. Planifier une procédure que le risque
// commande ; rédiger le papier d'une procédure planifiée. Le reste — l'ordre,
// la population, la taille — vit dans la méthode du cabinet et se lit ici, il
// ne se saisit pas.

export const dynamic = 'force-dynamic';

export default async function ProgrammePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  const t = await tr();
  await requireMember(id);
  const postes = await programmeDuDossier(id);

  async function planifierAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/programme`, async () => {
      const { user } = await requireMember(id);
      await planifierProcedure({
        engagementId: id,
        fsliCode: String(formData.get('poste')),
        code: String(formData.get('code')),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/programme`);
    });
  }

  async function redigerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/programme`, async () => {
      const { user } = await requireMember(id);
      await redigerPapierDeProcedure({
        procedureId: String(formData.get('procedure')),
        userId: user.id,
        /* LE MOTIF N'EST PAS `required` DANS LE NAVIGATEUR, ET C'EST VOULU
           (ADR-091). Une version nouvelle d'un papier VISÉ périme les visas :
           PROG-06 exige un motif écrit, et c'est le SERVEUR qui refuse. Un
           champ que le navigateur bloque donne un harnais qui croit avoir
           éprouvé la règle du serveur alors qu'il n'a éprouvé que le
           navigateur. */
        motif: String(formData.get('motif') ?? ''),
      });
      revalidatePath(`/eng/${id}/programme`);
    });
  }

  async function deplanifierAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/programme`, async () => {
      const { user } = await requireMember(id);
      await deplanifierProcedure({
        procedureId: String(formData.get('procedure')),
        userId: user.id,
        /* Même choix que `redigerAction` ci-dessus (ADR-091) : le motif
           n'est pas `required` côté navigateur — PROG-07 est un refus du
           SERVEUR, éprouvé comme tel. */
        motif: String(formData.get('motif') ?? ''),
      });
      revalidatePath(`/eng/${id}/programme`);
    });
  }

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />
      <h2 style={{ margin: 0 }}>{t('rail.programme')}</h2>
      <p className="faint">{t('prog.aide')}</p>

      {postes.length === 0 && (
        <div className="panel muted">
          {t('prog.aucunPoste')} <Link href={`/eng/${id}/scoping`}>{t('rail.quoi.scoping')}</Link>
        </div>
      )}

      {postes.map((poste) => (
        <div className="panel" key={poste.code} data-poste-programme={poste.code}>
          <h3 style={{ marginTop: 0 }}>
            {poste.nom} <span className="faint mono">{poste.code}</span>
          </h3>

          {/* CE QUI EST PLANIFIÉ DESSOUS SE VOIT TOUJOURS, ÉVALUÉ OU NON (revue
              hostile de la nuit, constat 3). La première version enfermait
              cette liste dans « le risque est évalué » : un poste retenu, non
              évalué, portant un papier déjà rédigé n'affichait qu'une phrase,
              et le papier était calculé puis jeté par l'écran — pendant que
              `/api/sante` le comptait. */}
          {poste.horsCommande.length > 0 && (
            <div className="callout warn" data-hors-commande>
              <strong>{t('prog.horsCommandeTitre', { n: poste.horsCommande.length })}</strong>
              <p className="faint" style={{ margin: '4px 0 0' }}>{t('prog.horsCommandeAide')}</p>
              <ul style={{ margin: '6px 0 0' }}>
                {poste.horsCommande.map((l) => (
                  <li key={l.code} data-ligne-programme={l.code}>
                    <span className="mono">{l.code}</span> — {l.libelle}{' '}
                    <span className="faint">
                      {t('prog.horsCommandeRaison', { niveau: l.niveau ?? '—', minimum: l.minimum })}
                    </span>
                    {l.planifiee?.papier && (
                      <> · <Link href={`/eng/${id}/workpapers/${l.planifiee.papier.id}`}>{l.planifiee.papier.code}</Link></>
                    )}
                    {/* LOT 3, TRANCHE 2 — le travail sur cette procédure n'est
                        pas défait parce que le risque ne la commande plus : son
                        instance existe, son atelier reste ouvrable, exactement
                        comme dans « commandées » (même fonction, même règle 13 —
                        jamais un lien mort ni un aveu tu). Trouvé en construisant
                        cette tranche : RECALC, la seule procédure recalcul_parametre
                        du monde semé, vit ICI (« hors commande », REV-05), jamais
                        dans « commandées » — sans cette ligne, l'atelier livré
                        cette tranche n'aurait jamais été atteignable au clic. */}
                    {l.planifiee && (() => {
                      const href = atelierDeLaNature(l.nature, poste.code, `/eng/${id}`);
                      return href ? (
                        <> · <Link href={href} data-atelier={l.code}>{t('prog.allerAtelier')}</Link></>
                      ) : (
                        <> · <span className="faint" data-atelier-absent={l.code}>{t('prog.atelierAbsent')}</span></>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* LOT 4, TRANCHE 1 — comme hors-commande ci-dessus, une procédure
              DÉPLANIFIÉE se voit toujours, évaluée ou non (même raisonnement) :
              une décision d'auditeur n'est ni liée au risque ni effacée. */}
          {poste.deplanifiees.length > 0 && (
            <div className="callout muted" data-deplanifiees>
              <strong>{t('prog.deplanifieesTitre', { n: poste.deplanifiees.length })}</strong>
              <p className="faint" style={{ margin: '4px 0 0' }}>{t('prog.deplanifieesAide')}</p>
              <ul style={{ margin: '6px 0 0' }}>
                {poste.deplanifiees.map((l) => (
                  <li key={l.id} data-ligne-deplanifiee={l.code}>
                    <span className="mono">{l.code}</span> — {l.titre}{' '}
                    <span className="faint">{t('prog.deplanifieeRaison', { qui: l.qui, quand: l.quand })}</span>
                    {l.motif && (
                      <> · <span className="faint">{t('prog.deplanifieeMotif', { motif: l.motif })}</span></>
                    )}
                    {l.papier && (
                      <> · <Link href={`/eng/${id}/workpapers/${l.papier.id}`}>{l.papier.code}</Link></>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!poste.risqueEvalue ? (
            /* CE QUI MANQUE SE DIT, ET DIT OÙ ALLER. Un écran vide qui n'explique
               pas est un cul-de-sac ; celui-ci nomme l'étape qui précède. */
            <p className="callout warn" data-risque-absent>
              {t('prog.risqueNonEvalue')}{' '}
              <Link href={`/eng/${id}/risk?fsli=${encodeURIComponent(poste.code)}`}>{t('risk.riskByAssertion')}</Link>
            </p>
          ) : (
            <>
              <table className="data" data-commandees>
                <thead>
                  <tr>
                    <th>{t('risk.procedure')}</th><th>{t('col.assertion')}</th>
                    <th>{t('risk.requiredBecause')}</th><th className="num">{t('col.size')}</th>
                    <th>{t('prog.natureColonne')}</th>
                    <th>{t('prog.etat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {poste.commandees.map((l) => (
                    <tr key={l.code} data-ligne-programme={l.code}>
                      <td><span className="mono">{l.code}</span><div>{l.libelle}</div></td>
                      <td>{l.assertion}</td>
                      <td className="faint" style={{ maxWidth: 300 }}>{l.pourquoi}</td>
                      <td className="num">
                        {l.taille !== null ? <strong>{l.taille}</strong>
                          : <span className="faint">{l.tailleDit ?? '—'}</span>}
                      </td>
                      <td data-nature={l.nature}>
                        <span className="faint">{t(`prog.nature.${l.nature}`)}</span>
                        {/* L'ATELIER NE SE PROPOSE QU'UNE FOIS LA PROCÉDURE PLANIFIÉE
                            (Lot 3, tranche 1) : il agit sur une INSTANCE
                            (`procedure_instance`), jamais sur l'entrée abstraite du
                            catalogue — avant planification, il n'y a rien à ouvrir. */}
                        {l.planifiee && (() => {
                          const href = atelierDeLaNature(l.nature, poste.code, `/eng/${id}`);
                          return href ? (
                            <div><Link href={href} data-atelier={l.code}>{t('prog.allerAtelier')}</Link></div>
                          ) : (
                            <div className="faint" data-atelier-absent={l.code}>{t('prog.atelierAbsent')}</div>
                          );
                        })()}
                      </td>
                      <td>
                        {l.planifiee === null ? (
                          <form action={planifierAction}>
                            <input type="hidden" name="poste" value={poste.code} />
                            <input type="hidden" name="code" value={l.code} />
                            <button className="btn small" data-planifier={l.code}>{t('prog.planifier')}</button>
                          </form>
                        ) : (
                          <span data-planifiee={l.code}>
                            <span className="badge blue">{l.planifiee.statut}</span>{' '}
                            {l.planifiee.papier ? (
                              <Link href={`/eng/${id}/workpapers/${l.planifiee.papier.id}`}>
                                {l.planifiee.papier.code} <span className="faint">v{l.planifiee.papier.version}</span>
                              </Link>
                            ) : (
                              <form action={redigerAction} className="row" style={{ marginTop: 4 }}>
                                <input type="hidden" name="procedure" value={l.planifiee.id} />
                                <button className="btn small" data-rediger={l.code}>{t('prog.rediger')}</button>
                              </form>
                            )}
                            {l.planifiee.papier && (
                              <form action={redigerAction} className="row" style={{ marginTop: 4 }}>
                                <input type="hidden" name="procedure" value={l.planifiee.id} />
                                {l.planifiee.vise && (
                                  <input type="text" name="motif" placeholder={t('prog.motifVisa')} style={{ minWidth: 220 }} />
                                )}
                                <button className="btn small" data-nouvelle-version={l.code}>
                                  {t('prog.nouvelleVersion')}
                                </button>
                              </form>
                            )}
                            {/* LOT 4, TRANCHE 1 — DÉPLANIFIER : le contre-geste qui
                                n'existait pas. Le motif ne se propose que si le
                                papier est visé (PROG-07, même garde que PROG-06) —
                                une ligne fraîche, jamais visée, se déplanifie sans
                                motif, exactement comme une nouvelle version se
                                rédige sans motif tant que rien n'est visé. */}
                            <form action={deplanifierAction} className="row" style={{ marginTop: 4 }}>
                              <input type="hidden" name="procedure" value={l.planifiee.id} />
                              {l.planifiee.vise && (
                                <input type="text" name="motif" placeholder={t('prog.motifVisa')} style={{ minWidth: 220 }} />
                              )}
                              <button className="btn small" data-deplanifier={l.code}>
                                {t('prog.deplanifier')}
                              </button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {poste.commandees.length === 0 && (
                    <tr><td colSpan={6} className="faint">{t('prog.aucuneCommandee')}</td></tr>
                  )}
                </tbody>
              </table>

              {poste.ecartees.length > 0 && (
                <Repli cle={`prog.ecartees.${poste.code}`} niveau={3}
                  titre={<>{t('prog.ecarteesTitre', { n: poste.ecartees.length })}</>}>
                  <table className="data" data-ecartees>
                    <thead>
                      <tr>
                        <th>{t('risk.procedure')}</th><th>{t('col.assertion')}</th>
                        <th>{t('risk.niveauAtteint')}</th><th>{t('risk.minimumRequired')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poste.ecartees.map((l) => (
                        <tr key={l.code}>
                          <td><span className="mono">{l.code}</span><div>{l.libelle}</div></td>
                          <td>{l.assertion}</td>
                          <td>{l.niveau ?? <span className="faint">{t('risk.notAssessed')}</span>}</td>
                          <td>{l.minimum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Repli>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
