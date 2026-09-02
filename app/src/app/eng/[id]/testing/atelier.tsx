'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LigneAtelier } from '@/lib/services/workpapers/atelier';
import type { Grille, Cellule, ConclusionLigne } from '@/lib/services/testing/grille';
import { useT } from '@/lib/i18n/client';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// L'ATELIER (point 10, ADR-104) : l'écran où l'auditeur passe son temps.
// La pièce et la ligne CÔTE À CÔTE ; la comparaison lisible SUR la ligne ;
// le clavier (↑/↓ change de ligne, Entrée atteste) ; le motif de sélection
// visible ; les actions en lot ; la reprise là où on en était ; le papier qui
// se remplit sous les yeux — formaté par le MÊME formateur que le papier.
// Rien ne se recharge en changeant de ligne : la sélection est cliente, les
// écritures passent par les actions serveur.
//
// L'ATTESTATION APPARTIENT À LA PIÈCE OUVERTE (ADR-105) : chaque pièce porte
// SA lecture — un bon de livraison en attente s'atteste ici comme une
// facture. La première version ne montrait que la lecture de la facture, et
// un BL en attente était invisible (règle 13, trouvé en conduisant le mode
// IA réelle).

const BADGE: Record<LigneAtelier['statut'], string> = {
  a_traiter: 'gray', a_verifier: 'amber', ecart: 'red', complete: 'green',
};

/* LA COULEUR N'EST JAMAIS SEULE (mandat du jour, règle permanente 10) : chaque
   état de cellule porte son mot et sa marque, la couleur vient en plus. */
const ETAT_CELLULE: Record<Cellule['etat'], { badge: string; marque: string }> = {
  conforme: { badge: 'green', marque: '✓' },
  hors_tolerance: { badge: 'red', marque: '✗' },
  non_recevable: { badge: 'red', marque: '⊘' },
  absent: { badge: 'amber', marque: '?' },
  sans_ancre: { badge: 'amber', marque: '⌖' },
};

const CHAMPS_CONNUS = [
  'invoiceNumber', 'invoiceDate', 'totalNetCents', 'totalGrossCents', 'vatCents',
  'buyerName', 'sellerName', 'qtyTotal', 'deliveryDate', 'deliveryNoteNumber', 'invoiceRef',
];
const PIECES_CONNUES = ['invoice', 'credit_note', 'delivery_note'];

/** L'indice de la pièce à ouvrir sur une ligne : la première dont la lecture
 *  attend une attestation, sinon la première. */
function pieceAOuvrir(l: LigneAtelier | undefined): number {
  if (!l) return 0;
  const i = l.evidences.findIndex((e) => e.extraction?.statut === 'pending_verify');
  return i >= 0 ? i : 0;
}

export function Atelier({
  engId, lignes, premierNonFini, itemInitial, colonnes,
  grille, cellules, conclusions,
  attester, clarifierLot, conclure, disposer,
}: {
  engId: string;
  lignes: LigneAtelier[];
  premierNonFini: string | null;
  itemInitial: string | null;
  colonnes: { champ: string; titre: string }[];
  /** LA GRILLE (W1) : figée, versionnée ; les cellules par ligne ; la conclusion par ligne. */
  grille: Grille | null;
  cellules: Record<string, Cellule[]>;
  conclusions: Record<string, ConclusionLigne>;
  attester: (fd: FormData) => Promise<void>;
  clarifierLot: (fd: FormData) => Promise<void>;
  conclure: (fd: FormData) => Promise<void>;
  disposer: (fd: FormData) => Promise<void>;
}) {
  const t = useT();
  const nomChamp = (n: string) => (CHAMPS_CONNUS.includes(n) ? t(`atl.champ.${n}` as CleLibelle) : n);
  const nomPiece = (d: string | null | undefined) =>
    (d && PIECES_CONNUES.includes(d) ? t(`atl.piece.${d}` as CleLibelle) : d ?? t('atl.piece.autre'));
  const idInitial = itemInitial ?? premierNonFini ?? lignes[0]?.sampleItemId ?? null;
  const [selId, setSelId] = useState<string | null>(idInitial);
  const [pieceOuverte, setPieceOuverte] = useState(() => pieceAOuvrir(lignes.find((l) => l.sampleItemId === idInitial)));
  const [lot, setLot] = useState<Set<string>>(new Set());
  const refListe = useRef<HTMLDivElement>(null);
  const refAttester = useRef<HTMLFormElement>(null);
  const refConclure = useRef<HTMLFormElement>(null);
  /* L'ANCRE OUVERTE : la cellule dont le rectangle est dessiné sur la pièce.
     Elle change avec la ligne — un rectangle d'une autre ligne serait un mensonge. */
  const [ancreSel, setAncreSel] = useState<string | null>(null);

  const sel = lignes.find((l) => l.sampleItemId === selId) ?? null;
  const pieceSel = sel?.evidences[Math.min(pieceOuverte, Math.max(0, (sel?.evidences.length ?? 1) - 1))] ?? null;

  /* REPRENDRE OÙ J'EN ÉTAIS : à l'arrivée, la ligne ouverte est la première
     non finie, et elle est amenée à l'écran. */
  useEffect(() => {
    refListe.current?.querySelector('.sel')?.scrollIntoView({ block: 'center' });
  }, [selId]);

  /* Après une attestation, les données serveur reviennent : si une AUTRE pièce
     de la même ligne attend encore (le BL après la facture), elle s'ouvre ;
     si la ligne n'attend plus rien de moi, on AVANCE à la prochaine à
     vérifier. PAS au premier rendu : arriver par `?item=` sur une ligne finie
     (depuis la synthèse des écarts ou le papier) doit l'ouvrir, pas la fuir. */
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    if (!sel) return;
    const iPendante = sel.evidences.findIndex((e) => e.extraction?.statut === 'pending_verify');
    if (iPendante >= 0) {
      if (iPendante !== pieceOuverte) setPieceOuverte(iPendante);
      return;
    }
    if (sel.statut === 'ecart') return;
    const suivante = lignes.find((l) => l.sampleItemId !== selId
        && l.evidences.some((e) => e.extraction?.statut === 'pending_verify'))
      ?? lignes.find((l) => l.statut === 'a_verifier' && l.sampleItemId !== selId)
      ?? (premierNonFini !== selId ? lignes.find((l) => l.sampleItemId === premierNonFini) : undefined);
    if (suivante) { setSelId(suivante.sampleItemId); setPieceOuverte(pieceAOuvrir(suivante)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes]);

  const ouvrirLigne = (l: LigneAtelier) => {
    setSelId(l.sampleItemId);
    setPieceOuverte(pieceAOuvrir(l));
    setAncreSel(null);
  };

  /* MONTRER UNE CELLULE SUR LA PIÈCE : la pièce de l'ancre s'ouvre (si ce
     n'est pas celle affichée), et la visionneuse reçoit le fichier avec le
     rectangle dessiné, à la page de l'ancre. */
  const montrerAncre = (c: Cellule) => {
    if (!sel || !c.evidenceId || !c.page) return;
    const i = sel.evidences.findIndex((e) => e.id === c.evidenceId);
    if (i >= 0) setPieceOuverte(i);
    setAncreSel(c.id);
  };
  const cellAncre = ancreSel ? (cellules[selId ?? ''] ?? []).find((c) => c.id === ancreSel) ?? null : null;

  /* LE CLAVIER : ↑/↓ change de ligne, Entrée atteste la pièce ouverte.
     Dans un champ de saisie, Entrée atteste aussi (le formulaire l'entoure). */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const dansSaisie = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (e.key === 'ArrowDown' && !dansSaisie) {
        e.preventDefault();
        const i = lignes.findIndex((l) => l.sampleItemId === selId);
        if (i < lignes.length - 1) ouvrirLigne(lignes[i + 1]);
      } else if (e.key === 'ArrowUp' && !dansSaisie) {
        e.preventDefault();
        const i = lignes.findIndex((l) => l.sampleItemId === selId);
        if (i > 0) ouvrirLigne(lignes[i - 1]);
      } else if (e.key === 'Enter' && !dansSaisie && refAttester.current) {
        e.preventDefault();
        refAttester.current.requestSubmit();
      } else if ((e.key === 'v' || e.key === 'V') && !dansSaisie && !e.ctrlKey && !e.metaKey && refConclure.current) {
        /* V CONCLUT LA LIGNE — et le refus (TEST-02, TEST-04) s'affiche, nommant
           l'attribut et le code : le geste est envoyé, le serveur décide. */
        e.preventDefault();
        refConclure.current.requestSubmit();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, selId]);

  const basculerLot = (id: string) => {
    const n = new Set(lot);
    if (n.has(id)) n.delete(id); else n.add(id);
    setLot(n);
  };

  /* La comparaison-clé, SUR la ligne : le montant d'abord, le rattachement
     sinon — valeur pièce, valeur GL, écart, tolérance, règle. */
  const resumeComparaison = (l: LigneAtelier) => {
    const c = l.comparaisons.find((x) => x.regle.startsWith('montant')) ?? l.comparaisons[0];
    if (!c) return <span className="faint">{t('atl.pasRapproche')}</span>;
    return (
      <span className={c.conforme ? 'faint' : 'compare-ko'}>
        {t('atl.compare', {
          trouve: c.trouve, attendu: c.attendu, tolerance: c.tolerance,
          regle: c.regle, marque: c.conforme ? '✓' : '✗',
        })}
      </span>
    );
  };

  const extraction = pieceSel?.extraction ?? null;
  const mesCellules = sel ? (cellules[sel.sampleItemId] ?? []) : [];
  const conclusion = sel ? (conclusions[sel.sampleItemId] ?? null) : null;
  /* La source de la visionneuse : la pièce nue, ou la pièce AVEC le rectangle
     de la cellule ouverte, à sa page. */
  const srcPiece = pieceSel
    ? (cellAncre && cellAncre.evidenceId === pieceSel.id && cellAncre.page
      ? `/api/piece/${pieceSel.id}/ancre?cellule=${cellAncre.id}#page=${cellAncre.page}`
      : `/api/blob/${pieceSel.id}`)
    : '';

  return (
    <div className="atelier">
      <div className="atelier-liste" ref={refListe}>
        {lot.size > 0 && (
          <form action={clarifierLot} className="lot-barre row">
            <input type="hidden" name="engagement_id" value={engId} />
            <input type="hidden" name="lignes" value={[...lot].join(',')} />
            <input name="motif" placeholder={t('atl.motifLot', { n: lot.size })} style={{ flex: 1 }} />
            <button className="btn small">{t('atl.demanderClarification', { n: lot.size })}</button>
          </form>
        )}
        <table className="data atelier-table">
          <thead>
            <tr><th></th><th>{t('atl.colPiece')}</th><th>{t('atl.colTiers')}</th><th className="num">{t('atl.colMontantGl')}</th><th>{t('atl.colPourquoi')}</th><th>{t('atl.colEtat')}</th></tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr
                key={l.sampleItemId}
                className={(l.sampleItemId === selId ? 'sel ' : '') + (l.statut === 'complete' ? 'ligne-complete' : '')}
                onClick={() => ouvrirLigne(l)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={lot.has(l.sampleItemId)} onChange={() => basculerLot(l.sampleItemId)} aria-label={t('atl.selectionner', { piece: l.piece })} />
                </td>
                <td className="mono">{l.piece}</td>
                <td>{l.tiers}</td>
                <td className="num">{l.montantGl}</td>
                <td><span className="badge gray" title={t('atl.motifTitre')}>{l.motif}</span></td>
                <td>
                  <span className={`badge ${BADGE[l.statut]}`}>{t(`atl.statut.${l.statut}` as CleLibelle)}</span>
                  {conclusions[l.sampleItemId] && (
                    <span className={`badge ${conclusions[l.sampleItemId].perimee ? 'amber' : 'green'}`} style={{ marginLeft: 4 }} data-conclue={conclusions[l.sampleItemId].perimee ? 'perimee' : 'oui'}>
                      {conclusions[l.sampleItemId].perimee ? t('atl.badgePerimee') : t('atl.badgeConclue')}
                    </span>
                  )}
                  {/* Une lecture en attente reste dite, même sur une ligne en
                      écart : l'écart n'efface pas l'attestation due. */}
                  {l.statut !== 'a_verifier' && l.evidences.some((e) => e.extraction?.statut === 'pending_verify') && (
                    <span className="badge amber" title={t('atl.lectureAttend')} style={{ marginLeft: 4 }}>{t('atl.aAttester')}</span>
                  )}
                  <div className="compare-ligne">{resumeComparaison(l)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="atelier-detail">
        {!sel ? <p className="muted">{t('atl.aucuneLigne')}</p> : (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="mono">{sel.piece}</strong>
              <span className="row">
                <span className="badge gray">{sel.motif}</span>
                <span className={`badge ${BADGE[sel.statut]}`}>{t(`atl.statut.${sel.statut}` as CleLibelle)}</span>
              </span>
            </div>

            {/* LA PIÈCE, ICI — pas dans un autre onglet. Une pièce dont la
                lecture attend porte son point d'attention sur l'onglet. */}
            {sel.evidences.length === 0 ? (
              <p className="muted mt">{t('atl.aucunePiece')}</p>
            ) : (
              <>
                {/* data-actions-item : les onglets de pièce SÉLECTIONNENT un
                    objet (une pièce parmi n) — sélection, pas action d'écran
                    (mesure de densité §3.D). */}
                <div className="row mt" style={{ gap: 4 }} data-actions-item>
                  {sel.evidences.map((e, i) => (
                    <button key={e.id} type="button" title={e.filename}
                      className={`btn small ${i === pieceOuverte ? '' : 'secondary'}`}
                      onClick={() => setPieceOuverte(i)}>
                      {nomPiece(e.docType)}
                      {sel.evidences.filter((x) => x.docType === e.docType).length > 1
                        ? ` ${sel.evidences.filter((x, j) => x.docType === e.docType && j <= i).length}` : ''}
                      {e.extraction?.statut === 'pending_verify' ? ' •' : ''}
                    </button>
                  ))}
                </div>
                {pieceSel && (
                  <iframe
                    key={srcPiece}
                    className="piece-vue"
                    title={t('atl.pieceTitre', { nom: pieceSel.filename })}
                    src={srcPiece}
                    data-ancre={cellAncre && cellAncre.evidenceId === pieceSel.id ? cellAncre.id : undefined}
                  />
                )}
              </>
            )}

            {/* LA BANDE DE CELLULES (W1) : une par colonne de la grille figée —
                attendu, trouvé, delta SIGNÉ, tolérance, état, ancre. Cliquer
                l'ancre dessine le rectangle sur la pièce, à sa page. */}
            <div className="bande-cellules mt" data-bande-cellules>
              <div className="faint" style={{ marginBottom: 4 }}>
                {grille
                  ? <>{t('atl.grille.titre', { v: grille.version, n: grille.colonnes.length, quand: grille.figeeLe.slice(0, 10), pack: grille.packId })} · <span className="mono">{t('atl.grille.empreinte', { h: grille.empreinte.slice(0, 10) })}</span></>
                  : t('atl.grille.absente')}
              </div>
              {grille && mesCellules.length === 0 && <p className="muted" data-cellules-aucune>{t('atl.cel.aucune')}</p>}
              {mesCellules.length > 0 && (
                <table className="data cellules" title={t('atl.cel.titre')}>
                  <thead>
                    <tr>
                      <th>{t('atl.cel.colAttribut')}</th><th className="num">{t('atl.cel.colAttendu')}</th><th className="num">{t('atl.cel.colTrouve')}</th>
                      <th className="num">{t('atl.cel.colDelta')}</th><th>{t('atl.cel.colTolerance')}</th><th>{t('atl.cel.colEtat')}</th><th>{t('atl.cel.colAncre')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesCellules.map((c) => (
                      <tr key={c.id} data-cellule={c.colonne} data-etat={c.etat} className={ancreSel === c.id ? 'sel' : ''}>
                        <td>{c.libelle}{c.identite && <span className="faint"> · {t('atl.cel.identite')}</span>}</td>
                        <td className="num mono">{c.attenduAffiche}</td>
                        <td className="num mono">{c.trouveAffiche}</td>
                        <td className="num mono" data-delta>{c.delta ?? '—'}</td>
                        <td className="faint">{c.tolerance}</td>
                        <td>
                          <span className={`badge ${ETAT_CELLULE[c.etat].badge}`}>{ETAT_CELLULE[c.etat].marque} {t(`atl.cel.etat.${c.etat}` as CleLibelle)}</span>
                          {c.disposition && <div className="faint">{t('atl.cel.disposee', { qui: c.disposition.par, motif: c.disposition.motif })}</div>}
                          {/* UNE DISPOSITION QUI PORTAIT SUR UNE AUTRE VALEUR ne couvre plus
                              rien : elle est dite telle quelle, et la cellule se redispose. */}
                          {c.dispositionPerimee && (
                            <div className="faint" data-disposition-perimee>
                              {t('atl.cel.dispositionPerimee', { qui: c.dispositionPerimee.par, motif: c.dispositionPerimee.motif })}
                            </div>
                          )}
                          {!c.disposition && c.etat !== 'conforme' && c.etat !== 'non_recevable' && (
                            <form action={disposer} className="row" style={{ gap: 4, marginTop: 4 }} data-disposer={c.colonne}>
                              <input type="hidden" name="engagement_id" value={engId} />
                              <input type="hidden" name="sample_item_id" value={c.sampleItemId} />
                              <input type="hidden" name="cell_id" value={c.id} />
                              <input name="motif" placeholder={t('atl.cel.motifDisposition')} style={{ flex: 1, minWidth: 160 }} />
                              <button className="btn small secondary" type="submit">{t('atl.cel.disposer')}</button>
                            </form>
                          )}
                          {c.etat === 'non_recevable' && <div className="faint">{t('atl.cel.nonDisposable')}</div>}
                        </td>
                        <td>
                          {c.page && c.evidenceId
                            ? <button type="button" className="btn small secondary" onClick={() => montrerAncre(c)} data-ancre-page={c.page}>
                                {ancreSel === c.id ? t('atl.cel.ancreOuverte', { n: c.page }) : t('atl.cel.ancrePage', { n: c.page })}
                              </button>
                            : <span className="faint">{t('atl.cel.sansAncre')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {grille && (
                <form action={conclure} ref={refConclure} className="row mt" data-conclure>
                  <input type="hidden" name="engagement_id" value={engId} />
                  <input type="hidden" name="sample_item_id" value={sel.sampleItemId} />
                  <button className="btn small" type="submit" title={t('atl.conclureTitre')}>{t('atl.conclure')}</button>
                  {conclusion && (
                    <span className={`badge ${conclusion.perimee ? 'amber' : 'green'}`} data-conclusion={conclusion.perimee ? 'perimee' : 'oui'}>
                      {conclusion.perimee && conclusion.cause === 'grille'
                        ? t('atl.concluePerimeeGrille', { qui: conclusion.par, quand: conclusion.quand.slice(0, 16), v: conclusion.version, vv: grille?.version ?? 0 })
                        : conclusion.perimee
                          ? t('atl.concluePerimee', { qui: conclusion.par, quand: conclusion.quand.slice(0, 16) })
                          : t('atl.conclue', { qui: conclusion.par, quand: conclusion.quand.slice(0, 16) })}
                    </span>
                  )}
                </form>
              )}
            </div>

            {/* LES CHAMPS RELEVÉS SUR LA PIÈCE OUVERTE, corrigeables au
                clavier ; Entrée atteste. */}
            {extraction && (
              <form action={attester} ref={extraction.statut === 'pending_verify' ? refAttester : undefined} className="mt">
                <input type="hidden" name="engagement_id" value={engId} />
                <input type="hidden" name="extraction_id" value={extraction.id} />
                <input type="hidden" name="sample_item_id" value={sel.sampleItemId} />
                <table className="data champs-releves">
                  <tbody>
                    {extraction.fields.filter((f) => !f.name.startsWith('line')).map((f) => (
                      <tr key={f.name}>
                        <td>{nomChamp(f.name)}</td>
                        <td>
                          {extraction.statut === 'pending_verify'
                            ? <input name={`champ_${f.name}`} defaultValue={f.value} className="mono" />
                            : <span className="mono">{f.value}</span>}
                        </td>
                        <td className="faint">{f.confidence < 1 ? f.confidence.toFixed(2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {extraction.statut === 'pending_verify' ? (
                  <div className="row mt">
                    <button className="btn small" type="submit" title={t('atl.attesterTitre')}>
                      {t('atl.attester')}
                    </button>
                    <span className="faint">{t('atl.corrigez')}</span>
                  </div>
                ) : (
                  <p className="faint" style={{ margin: '6px 0 0' }}>
                    {extraction.statut === 'verified'
                      ? t('atl.attestePar', {
                          qui: extraction.verifiePar ?? '—',
                          quand: extraction.verifieLe ? ` · ${extraction.verifieLe.slice(0, 16)}` : '',
                        })
                      : t('atl.releveDeterministe')}
                  </p>
                )}
              </form>
            )}

            {/* LA COMPARAISON COMPLÈTE : règle, attendu, trouvé, tolérance. */}
            {sel.comparaisons.length > 0 && (
              <table className="data mt">
                <thead><tr><th>{t('atl.colRegle')}</th><th>{t('atl.colGrandLivre')}</th><th>{t('atl.colPiece')}</th><th>{t('atl.colTolerance')}</th><th></th></tr></thead>
                <tbody>
                  {sel.comparaisons.map((c, i) => (
                    <tr key={i}>
                      <td>{c.regle}</td>
                      <td className="mono">{c.attendu}</td>
                      <td className="mono">{c.trouve}</td>
                      <td>{c.tolerance}</td>
                      <td>{c.conforme ? '✓' : <span className="badge red">✗</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* UN ÉCART MÈNE À LA SYNTHÈSE EN UN CLIC. */}
            {sel.exceptions.length > 0 && (
              <p className="mt">
                {sel.exceptions.map((x) => (
                  <Link key={x.id} href={`/eng/${engId}/exceptions#x-${x.id}`} className="badge red" style={{ marginRight: 6 }}>
                    {t('atl.versSynthese', { taxonomy: x.taxonomy, statut: x.statut })}
                  </Link>
                ))}
              </p>
            )}

            {/* LA PROVENANCE, À PORTÉE — celle de la pièce ouverte. */}
            {pieceSel && (
              <p className="faint mt" style={{ fontSize: 11.5 }}>
                {t('atl.empreinte', { h: pieceSel.sha256.slice(0, 14) })}
                {extraction && <> · {t('atl.echelon')} <span className="ai-flag">{extraction.rung}</span></>}
                {extraction && extraction.coutUsd > 0 && <> · {t('atl.lectureCout', { c: extraction.coutUsd.toFixed(4) })}</>}
                {' '}· <a href="#reexecution">{t('atl.reexecution')}</a>
              </p>
            )}

            {/* LE PAPIER SE REMPLIT SOUS MES YEUX — même formateur que le papier. */}
            <div className="papier-vivant mt">
              <div className="faint" style={{ marginBottom: 4 }}>{t('atl.tellQuElleSortira')}</div>
              <table className="data">
                <tbody>
                  {colonnes.map((c) => (
                    <tr key={c.champ}>
                      <td className="faint" style={{ width: 140 }}>{c.titre}</td>
                      <td>{sel.papier[c.champ] ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
