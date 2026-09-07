import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { extractAll } from '@/lib/services/extraction/ladder';
import { runMatching } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import {
  computeSampleEvaluation, concludeEvaluation, currentEvaluation, conclusionGate,
  recordEvaluationResponse, evaluationResponses, type ResponseKind,
} from '@/lib/services/evaluation';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { lignesAtelier } from '@/lib/services/workpapers/atelier';
import { depenseCumuleeUsd, plafondUsd } from '@/lib/services/extraction/budget';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { colonnes as colonnesGabarit } from '@/lib/methodology/catalogue';
import { Atelier } from './atelier';
import { attesterAction, clarifierLotAction, conclureAction, disposerAction } from './actions-atelier';
import { ajouterColonneGrille, calculerGrille, cellulesDuDossier, lignesNonConclues } from '@/lib/services/testing/grille';
import { ETAT_CELLULE } from '@/lib/services/testing/etat-cellule';
import { currentRevenueSample } from '@/lib/services/sampling';
import {
  demanderPieceLigne, demanderPiecesEnLot, piecesDemandeesParLigne,
  EVIDENCE_TYPE_INVOICE, EVIDENCE_TYPE_DELIVERY_NOTE,
} from '@/lib/services/requests';
import { tr } from '@/lib/i18n';
import { Repli } from '@/app/repli';

export default async function TestingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; item?: string }>;
}) {
  const { id } = await params;
  const { erreur, item } = await searchParams;
  const t = await tr();
  await requireMember(id);
  /* L'ATELIER (ADR-104) : chaque ligne avec sa pièce, sa comparaison, son
     motif, sa provenance, et la ligne de papier qu'elle produira. */
  const { lignes, premierNonFini } = await lignesAtelier(id);
  /* LA GRILLE (W1) : les cellules de chaque ligne, la conclusion de chaque
     ligne, et l'avertissement sur les lignes non conclues (famille en
     avertissement, drapeau de pack à off). */
  const { grille, cellules, conclusions } = await cellulesDuDossier(id);
  const nonConclues = grille ? await lignesNonConclues(id) : { total: 0, nonConclues: 0, perimees: 0, perimeesParGrille: 0 };
  /* ÉTAPE 7 (plan d'autonomie, Partie B) : LA COLONNE AJOUTÉE À LA MAIN. Les
     pièces qu'une colonne ajoutée exige se demandent PAR LE MÊME MÉCANISME
     TYPÉ que l'étape 5 (piecesDemandeesParLigne, requests.ts) — par type de
     pièce, jamais par colonne : une facture demandée couvre TOUTES les
     colonnes ajoutées qui lisent une facture sur cette ligne (REQ-02,
     grille.ts::conclureLigne). */
  const sample = await currentRevenueSample(id);
  const typesAjoutes = grille ? [...new Set(grille.colonnes.filter((c) => c.origine === 'ajoutee_par').map((c) => c.document))] : [];
  const demandeesParType = new Map<string, Map<string, { requestId: string; seqNo: number; status: string }>>();
  if (sample && sample.status === 'drawn') {
    for (const type of typesAjoutes) demandeesParType.set(type, await piecesDemandeesParLigne(id, sample.id, type));
  }
  /* LE COMPTEUR SUIT L'ÉCHANTILLON, pas le dossier entier : une extraction en
     attente sur une pièce dont la ligne a QUITTÉ le tirage (re-tirage après
     grand livre définitif) n'est l'obligation de personne — un badge qui
     l'annoncerait promettrait un travail que cet écran ne peut pas montrer.
     Elle ressurgit ici si sa ligne revient dans un tirage. Et il compte les
     PIÈCES en attente, pas les statuts : une ligne déjà en écart peut porter
     une lecture à attester — l'écart ne l'efface pas. */
  const pending = lignes.filter((l) => l.evidences.some((e) => e.extraction?.statut === 'pending_verify'));
  const cat = await catalogueDeLaMission(id).catch(() => null);
  const colonnesEch = cat ? colonnesGabarit(cat, 'substantif', 'echantillon').map((c) => ({ champ: c.champ, titre: c.titre })) : [];
  const verifRun = await currentVerificationRun(id);
  const evaluation = await currentEvaluation(id);
  const gate = await conclusionGate(id);
  /* LA RÉPONSE AU DÉPASSEMENT — elle n'avait AUCUN écran. Le service la
     réclame avant toute conclusion quand les anomalies dépassent l'anomalie
     tolérable, et rien dans l'application ne permettait de l'enregistrer : la
     seule façon de conclure était d'appeler le service depuis du code. Un
     verrou qu'on ne peut lever que hors du produit ferme le produit. */
  const reponses = evaluation ? await evaluationResponses(evaluation.id) : [];

  async function extractAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await extractAll(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function matchAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await runMatching(id, user.id);
      /* Le vouching et la grille lisent les MÊMES pièces : une seule action
         les tient à jour ensemble — deux boutons finiraient par diverger. */
      await calculerGrille(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
      revalidatePath(`/eng/${id}/exceptions`);
    });
  }
  async function grilleAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await calculerGrille(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function ajouterColonneAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await ajouterColonneGrille(id, String(formData.get('titre') ?? ''), user.id);
      /* UN SEUL CLIC (mandat) : ajouter la colonne ET recalculer la grille —
         sinon la colonne ajoutée reste invisible tant que quelqu'un ne pense
         pas à cliquer « Calculer la grille » séparément. */
      await calculerGrille(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function demanderPieceAjouteeAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await demanderPieceLigne(String(formData.get('sample_item_id')), String(formData.get('evidence_type_code')), user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function demanderPiecesAjouteesEnLotAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await demanderPiecesEnLot(String(formData.get('sample_id')), String(formData.get('evidence_type_code')), user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function startVerifRun() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await startVerificationRun(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function blindAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await submitBlindCheck({
        verificationRunId: String(formData.get('run_id')),
        sampleItemId: String(formData.get('sample_item_id')),
        verifierId: user.id,
        blind: {
          totalNetCents: Math.round(Number(formData.get('net')) * 100),
          invoiceDate: String(formData.get('date')),
        },
        escalationOnDisagree: 'expand_subsample',
      });
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function evalAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await computeSampleEvaluation(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function repondreAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await recordEvaluationResponse(
        String(formData.get('evaluation_id')), user.id,
        String(formData.get('kind')) as ResponseKind,
        String(formData.get('rationale') ?? ''),
      );
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function concludeAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await concludeEvaluation(String(formData.get('evaluation_id')), user.id, String(formData.get('basis') ?? ''));
      revalidatePath(`/eng/${id}/testing`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('test.testingWorkbenchExtractionVouchingVerifi')}</h2>
          <span className="row">
            <form action={extractAction}><button className="btn secondary">{t('test.runExtractionLadder')}</button></form>
            <form action={matchAction}><button className="btn">{t('test.runVouchingL0')}</button></form>
            <form action={grilleAction}><button className="btn secondary" data-grille-calculer>{t('atl.grille.calculer')}</button></form>
          </span>
        </div>
        {(process.env.OTTO_OCR_ADAPTER ?? 'mock') === 'anthropic' && (
          /* MODE « IA RÉELLE » (ADR-105) : l'échelon OCR lit avec le modèle.
             L'écran DIT lequel tourne, ce que ça a coûté et où est le plafond
             — un mode payant qui ne s'annonce pas est un rejeu qui ment dans
             l'autre sens. Rien d'autre ne change : mêmes échelons gratuits
             d'abord, même file d'attestation humaine (L2), même provenance. */
          <div className="callout">
            <strong>{t('test.ocrLlmAdapterRealAi')}{process.env.OTTO_EXTRACT_MODEL ?? 'claude-opus-5'}).</strong>{' '}
            {t('test.echelonsGratuitsDabord')} <strong>{(await depenseCumuleeUsd()).toFixed(4)} $</strong>{' '}
            {t('test.surUnPlafondDe')} {plafondUsd().toFixed(2)} {t('test.auPlafondRefusPropre')}
          </div>
        )}
        {(process.env.OTTO_OCR_ADAPTER ?? 'mock') !== 'anthropic' && (
          /* L'HONNÊTETÉ DE LA DÉMONSTRATION (ADR-102) : ne jamais laisser
             croire qu'une pièce est lue par un modèle quand la donnée est
             rejouée. Les deux premiers échelons lisent RÉELLEMENT le fichier
             (déterministes, gratuits) ; l'échelon OCR/LLM, lui, REJOUE des
             extractions enregistrées du jeu synthétique — aucun appel, aucun
             centime. En production, un modèle lit au même endroit, avec la
             même file de vérification humaine. */
          <div className="callout warn">
            <strong>{t('test.ocrLlmAdapterReplayDemonstration')}</strong> {t('test.onThisScreenTheXmlAnd')}
          </div>
        )}
      </div>

      {/* L'ATELIER — la pièce et la ligne côte à côte (point 10, ADR-104).
          La file d'attestation et le tableau de vouching vivaient en deux
          panneaux séparés de la ligne : ils sont désormais la MÊME chose,
          ligne par ligne, l'attestation emportant les corrections tapées. */}
      <Repli cle="test.theSampleLineByLine" niveau={2} titre={<>{t('test.theSampleLineByLine')}{' '}
          {pending.length > 0 && <span className="badge amber">{pending.length} {t('test.toAttest')}</span>}</>}>
        {nonConclues.nonConclues > 0 && (
          <p className="callout warn" data-avertissement-lignes>
            {t('atl.avertissementLignes', { n: nonConclues.nonConclues, total: nonConclues.total })}
          </p>
        )}
        {nonConclues.perimeesParGrille > 0 && (
          /* UNE VERSION NEUVE DE LA GRILLE NE FAIT PAS DISPARAÎTRE DES
             CONCLUSIONS : elle les nomme, ici, et sur chaque ligne (§0.3). */
          <p className="callout warn" data-avertissement-grille>
            {t('atl.avertissementGrille', { n: nonConclues.perimeesParGrille, v: grille?.version ?? 0 })}
          </p>
        )}
        <Atelier
          engId={id}
          lignes={lignes}
          premierNonFini={premierNonFini}
          itemInitial={item ?? null}
          colonnes={colonnesEch}
          grille={grille}
          cellules={cellules}
          conclusions={conclusions}
          attester={attesterAction}
          clarifierLot={clarifierLotAction}
          conclure={conclureAction}
          disposer={disposerAction}
        />
      </Repli>

      {/* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 6 : LA GRILLE, À DEUX NIVEAUX
          D'EN-TÊTE — le premier niveau est le TYPE DE PIÈCE (facture, bon de
          livraison), le second les DONNÉES à y trouver ; chaque colonne sait
          de quelle pièce elle provient (`ColonneGrille.document`, déjà posé
          par colonnesCommandees, jamais nouveau ici). Rien n'est recalculé :
          `cellules` (cellulesDuDossier, ci-dessus) porte déjà, pour CHAQUE
          ligne, une cellule par colonne — cette vue ne fait que la PIVOTER
          en tableau, lignes × colonnes, au lieu de la ligne unique que
          l'atelier montre.
          CE QUE CETTE TRANCHE NE FAIT PAS (règle 19) : le mandat illustre
          Étape 6 avec des colonnes que le pack ne porte pas aujourd'hui (une
          TVA sur la facture, un numéro sur le bon de livraison) — les
          AJOUTER serait du contenu de procédure neuf, interdit par le
          périmètre gelé (règle 14 : « aucun contenu de procédure nouveau »).
          La grille rendue ici est donc celle du pack RÉEL (7 colonnes : 4
          facture, 3 bon de livraison), pas celle de l'illustration — le
          code fait foi (règle 15), pas l'exemple d'un mandat.

          ÉTAPE 7 : l'auditeur ajoute une colonne À LA MAIN, un titre libre
          interprété contre le catalogue fermé de l'échelle d'extraction
          (COL-01, grille.ts::ajouterColonneGrille) — un clic qui ajoute ET
          calcule (`ajouterColonneAction`, ci-dessus). Ses cellules n'ont
          jamais d'ancre (MOTIF_ANCRE ne connaît que les codes du pack) :
          « sans ancre » quand la donnée est présente y est donc l'état
          normal, jamais un défaut d'extraction — une disposition écrite la
          couvre comme n'importe quelle cellule non conforme (TEST-04,
          inchangé). Et la pièce qui la fonde se demande ICI, par ligne ou en
          lot, avec le MÊME mécanisme que l'étape 5 (REQ-02 la réclame avant
          toute conclusion). */}
      {grille && grille.colonnes.length > 0 && (
        <div className="panel" data-grille-vue>
          <h2 style={{ marginTop: 0 }}>{t('atl.grilleVue.titre')}</h2>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <form action={ajouterColonneAction} className="row">
              <input type="text" name="titre" placeholder={t('atl.grilleVue.ajouterPlaceholder')} style={{ minWidth: 260 }} required data-ajouter-colonne-titre />
              <button className="btn secondary small" data-ajouter-colonne>{t('atl.grilleVue.ajouterBouton')}</button>
            </form>
            {sample && sample.status === 'drawn' && typesAjoutes.length > 0 && (
              <span className="row" style={{ gap: 8 }}>
                {typesAjoutes.includes(EVIDENCE_TYPE_INVOICE) && (
                  <form action={demanderPiecesAjouteesEnLotAction}>
                    <input type="hidden" name="sample_id" value={sample.id} />
                    <input type="hidden" name="evidence_type_code" value={EVIDENCE_TYPE_INVOICE} />
                    <button className="btn secondary small" data-demander-factures-ajoutees-lot>{t('samp.demanderFacturesLot')}</button>
                  </form>
                )}
                {typesAjoutes.includes(EVIDENCE_TYPE_DELIVERY_NOTE) && (
                  <form action={demanderPiecesAjouteesEnLotAction}>
                    <input type="hidden" name="sample_id" value={sample.id} />
                    <input type="hidden" name="evidence_type_code" value={EVIDENCE_TYPE_DELIVERY_NOTE} />
                    <button className="btn secondary small" data-demander-bl-ajoutees-lot>{t('samp.demanderBlLot')}</button>
                  </form>
                )}
              </span>
            )}
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th rowSpan={2}>{t('atl.grilleVue.colLigne')}</th>
                  {(() => {
                    /* GROUPE PAR ADJACENCE, PAS PAR IDENTITÉ DE `document`
                       (règle 19) : `colonnesCommandees` (grille.ts) pose
                       aujourd'hui toutes les colonnes FACTURE puis toutes
                       les BON DE LIVRAISON, jamais entrelacées (un seul
                       passage sur `justificatifs_par_cycle.CA`, deux
                       entrées) — vérifié, pas supposé. Si un jour un
                       troisième type de pièce s'intercalait entre les deux,
                       cette boucle rendrait TROIS groupes ou plus au lieu de
                       fusionner les occurrences non adjacentes du même
                       type : elle ne le détecterait pas. */
                    const groupes: { document: string; n: number }[] = [];
                    for (const c of grille.colonnes) {
                      const dernier = groupes[groupes.length - 1];
                      if (dernier && dernier.document === c.document) dernier.n += 1;
                      else groupes.push({ document: c.document, n: 1 });
                    }
                    return groupes.map((g, i) => (
                      <th key={`${g.document}-${i}`} colSpan={g.n} data-grille-groupe={g.document}>
                        {g.document === 'invoice' ? t('samp.demanderFactureLigne') : t('samp.demanderBlLigne')}
                      </th>
                    ));
                  })()}
                </tr>
                <tr>
                  {grille.colonnes.map((c) => (
                    <th key={c.code} title={`${c.reference} · ${c.tolerance}`}>
                      {c.libelle}
                      {c.origine === 'ajoutee_par' && <span className="badge gray" style={{ marginLeft: 4 }}>{t('atl.grilleVue.colonneAjoutee')}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.filter((l) => cellules[l.sampleItemId]?.length).map((l) => {
                  const parColonne = new Map(cellules[l.sampleItemId].map((c) => [c.colonne, c]));
                  return (
                    <tr key={l.sampleItemId} data-grille-ligne={l.sampleItemId}>
                      <td className="mono">{l.piece}<div className="faint">{l.montantGl}</div></td>
                      {grille.colonnes.map((col) => {
                        const cel = parColonne.get(col.code);
                        /* ÉTAPE 7 : sous la cellule d'une colonne AJOUTÉE, le
                           lien vers la demande si elle existe déjà, sinon le
                           bouton pour la créer — même geste qu'à l'étape 5
                           (par TYPE de pièce, pas par colonne : REQ-02 le
                           vérifie de la même façon). */
                        const demandee = col.origine === 'ajoutee_par' ? demandeesParType.get(col.document)?.get(l.sampleItemId) : undefined;
                        return (
                          <td key={col.code} data-grille-cellule={col.code}>
                            {cel ? (
                              <>
                                <span className={`badge ${ETAT_CELLULE[cel.etat].badge}`}>{ETAT_CELLULE[cel.etat].marque}</span>{' '}
                                {cel.trouveAffiche}
                              </>
                            ) : '—'}
                            {col.origine === 'ajoutee_par' && (
                              <div className="faint" data-piece-ajoutee={`${col.document}-${l.sampleItemId}`}>
                                {demandee ? (
                                  <Link href={`/eng/${id}/requests/${demandee.requestId}`}>{t('samp.pieceDemandee')}</Link>
                                ) : (
                                  <form action={demanderPieceAjouteeAction}>
                                    <input type="hidden" name="sample_item_id" value={l.sampleItemId} />
                                    <input type="hidden" name="evidence_type_code" value={col.document} />
                                    <button className="btn small" data-demander-piece-ajoutee={`${col.document}-${l.sampleItemId}`}>
                                      {col.document === 'invoice' ? t('samp.demanderFactureLigne') : t('samp.demanderBlLigne')}
                                    </button>
                                  </form>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="reexecution">{t('test.blindRePerformanceAdr0123')}</h2>
            {!verifRun && (
              <details>
                <summary className="repli-action">{t('test.runTheRePerformance')}</summary>
                <form action={startVerifRun} className="mt"><button className="btn secondary small">{t('test.drawSubsample')}</button></form>
              </details>
            )}
          </div>
          {!verifRun ? (
            <p className="muted">{t('test.pasTire')}</p>
          ) : (
            <>
              <p className="faint">
                {verifRun.drawn_count} of {verifRun.machine_passed_count} {t('test.machinePassedItemsSeed')}{' '}
                <span className="mono">{verifRun.seed}</span>
              </p>
              <table className="data">
                <thead><tr><th>{t('col.piece')}</th><th className="num">{t('test.glAmount')}</th><th>{t('test.blindRePerformance')}</th></tr></thead>
                <tbody>
                  {verifRun.items.map((it) => (
                    <tr key={it.sample_item_id}>
                      <td className="mono">{it.piece_ref}<div className="faint">{it.aux_label}</div></td>
                      <td className="num">{fmtEur(numToCents(it.amount), 'fr')}</td>
                      <td>
                        {it.result ? (
                          <span className={`badge ${it.result === 'agree' ? 'green' : 'red'}`}>{it.result}</span>
                        ) : (
                          <form action={blindAction} className="row">
                            <input type="hidden" name="run_id" value={verifRun.id} />
                            <input type="hidden" name="sample_item_id" value={it.sample_item_id} />
                            <input type="number" name="net" step="0.01" placeholder={t('test.totalHt')} style={{ width: 110 }} required />
                            <input type="date" name="date" required />
                            <button className="btn small">{t('test.submitBlind')}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t('test.sampleEvaluationVsTe')}</h2>
            <details>
              <summary className="repli-action">{t('col.recompute')}</summary>
              <form action={evalAction} className="mt"><button className="btn secondary small">{t('test.recompute')}</button></form>
            </details>
          </div>
          {!evaluation ? (
            <p className="muted">{t('test.cumulVsTe')}</p>
          ) : (
            <>
              <div className="grid cols-2">
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.known_misstatement), 'fr')}</span><span className="l">{t('test.knownMisstatement')}</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.projected_misstatement), 'fr')}</span><span className="l">Projected ({evaluation.projection_method})</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.untested_amount), 'fr')}</span><span className="l">{t('test.untestedRemainder')}</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.te_amount), 'fr')}</span><span className="l">{t('mat.anomalieTolRable')}</span></div>
              </div>
              {reponses.length > 0 ? (
                <div className="callout mt">
                  <strong>{t('test.responseToExceedingTolerableMisstatement')}</strong>{' '}
                  {reponses.map((r) => r.kind).join(', ')}
                  {reponses[0]?.rationale && <p className="faint">{reponses[0].rationale}</p>}
                </div>
              ) : (
                <form action={repondreAction} className="mt stack">
                  <input type="hidden" name="evaluation_id" value={evaluation.id} />
                  <p className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <select name="kind" defaultValue="revise_strategy">
                      <option value="extend_testing">{t('test.extendTheProcedures')}</option>
                      <option value="revise_strategy">{t('test.reviseTheStrategy')}</option>
                      <option value="conclude_with_justification">{t('test.concludeWithAJustification')}</option>
                    </select>
                    <input name="rationale" placeholder={t('test.motifObligatoire')} style={{ flex: 1, minWidth: 260 }} />
                    <button className="btn secondary small">{t('circ.recordTheReply')}</button>
                  </p>
                </form>
              )}
              {evaluation.status === 'draft' ? (
                <form action={concludeAction} className="mt">
                  <input type="hidden" name="evaluation_id" value={evaluation.id} />
                  <textarea name="basis" placeholder={t('test.conclusionBasisL4HumanJudgmentRequired')} required />
                  <button className="btn mt">{t('test.recordConclusionL4')}</button>
                </form>
              ) : (
                <div className="callout green mt">Concluded: {evaluation.conclusion_basis}</div>
              )}
            </>
          )}
          <div className={`callout ${gate.ok ? 'green' : 'warn'} mt`}>
            {t('test.conclusionGate')} {gate.ok ? t('test.openAllExceptionsDispositionedAndEvaluat') : `${gate.openExceptions} exception(s) undispositioned${gate.evaluationConcluded ? '' : '; evaluation not concluded'}`}
            {' — '}<Link href={`/eng/${id}/exceptions`}>{t('mot.exceptions')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
