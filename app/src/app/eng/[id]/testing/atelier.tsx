'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LigneAtelier } from '@/lib/services/workpapers/atelier';

// L'ATELIER (point 10, ADR-104) : l'écran où l'auditeur passe son temps.
// La pièce et la ligne CÔTE À CÔTE ; la comparaison lisible SUR la ligne ;
// le clavier (↑/↓ change de ligne, Entrée atteste) ; le motif de sélection
// visible ; les actions en lot ; la reprise là où on en était ; le papier qui
// se remplit sous les yeux — formaté par le MÊME formateur que le papier.
// Rien ne se recharge en changeant de ligne : la sélection est cliente, les
// écritures passent par les actions serveur.

const STATUTS: Record<LigneAtelier['statut'], { libelle: string; badge: string }> = {
  a_traiter: { libelle: 'à traiter', badge: 'gray' },
  a_verifier: { libelle: 'à vérifier', badge: 'amber' },
  ecart: { libelle: 'écart', badge: 'red' },
  complete: { libelle: 'complète', badge: 'green' },
};

const NOMS_CHAMPS: Record<string, string> = {
  invoiceNumber: 'n° de facture', invoiceDate: 'date de facture',
  totalNetCents: 'montant HT (centimes)', totalGrossCents: 'montant TTC (centimes)',
  vatCents: 'TVA (centimes)', buyerName: 'client', sellerName: 'fournisseur',
  qtyTotal: 'quantité', deliveryDate: 'date de livraison',
  deliveryNoteNumber: 'n° de BL', invoiceRef: 'réf. facture (sur BL)',
};

export function Atelier({
  engId, lignes, premierNonFini, itemInitial, colonnes,
  attester, clarifierLot,
}: {
  engId: string;
  lignes: LigneAtelier[];
  premierNonFini: string | null;
  itemInitial: string | null;
  colonnes: { champ: string; titre: string }[];
  attester: (fd: FormData) => Promise<void>;
  clarifierLot: (fd: FormData) => Promise<void>;
}) {
  const [selId, setSelId] = useState<string | null>(itemInitial ?? premierNonFini ?? lignes[0]?.sampleItemId ?? null);
  const [lot, setLot] = useState<Set<string>>(new Set());
  const [pieceOuverte, setPieceOuverte] = useState(0);
  const refListe = useRef<HTMLDivElement>(null);
  const refAttester = useRef<HTMLFormElement>(null);

  const sel = lignes.find((l) => l.sampleItemId === selId) ?? null;

  /* REPRENDRE OÙ J'EN ÉTAIS : à l'arrivée, la ligne ouverte est la première
     non finie, et elle est amenée à l'écran. */
  useEffect(() => {
    refListe.current?.querySelector('.sel')?.scrollIntoView({ block: 'center' });
  }, [selId]);

  /* Après une attestation, les données serveur reviennent : si la ligne
     ouverte n'attend PLUS RIEN de moi — champs attestés (avant même le
     vouching) ou ligne complète, et pas d'écart ouvert — on AVANCE à la
     prochaine qui attend une attestation. PAS au premier rendu : arriver par
     `?item=` sur une ligne finie (depuis la synthèse des écarts ou le papier)
     doit l'ouvrir, pas la fuir. */
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    if (!sel || sel.statut === 'ecart') return;
    const finiPourMoi = sel.statut === 'complete'
      || (sel.extraction != null && sel.extraction.statut !== 'pending_verify');
    if (!finiPourMoi) return;
    const suivante = lignes.find((l) => l.statut === 'a_verifier' && l.sampleItemId !== selId)?.sampleItemId
      ?? (premierNonFini !== selId ? premierNonFini : null);
    if (suivante) { setSelId(suivante); setPieceOuverte(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes]);

  /* LE CLAVIER : ↑/↓ change de ligne, Entrée atteste la ligne ouverte.
     Dans un champ de saisie, Entrée atteste aussi (le formulaire l'entoure). */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const dansSaisie = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (e.key === 'ArrowDown' && !dansSaisie) {
        e.preventDefault();
        const i = lignes.findIndex((l) => l.sampleItemId === selId);
        if (i < lignes.length - 1) { setSelId(lignes[i + 1].sampleItemId); setPieceOuverte(0); }
      } else if (e.key === 'ArrowUp' && !dansSaisie) {
        e.preventDefault();
        const i = lignes.findIndex((l) => l.sampleItemId === selId);
        if (i > 0) { setSelId(lignes[i - 1].sampleItemId); setPieceOuverte(0); }
      } else if (e.key === 'Enter' && !dansSaisie && refAttester.current) {
        e.preventDefault();
        refAttester.current.requestSubmit();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
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
    if (!c) return <span className="faint">pas encore rapproché</span>;
    return (
      <span className={c.conforme ? 'faint' : 'compare-ko'}>
        pièce {c.trouve} · GL {c.attendu} · tol. {c.tolerance} · {c.regle} {c.conforme ? '✓' : '✗'}
      </span>
    );
  };

  return (
    <div className="atelier">
      <div className="atelier-liste" ref={refListe}>
        {lot.size > 0 && (
          <form action={clarifierLot} className="lot-barre row">
            <input type="hidden" name="engagement_id" value={engId} />
            <input type="hidden" name="lignes" value={[...lot].join(',')} />
            <input name="motif" placeholder={`motif de la clarification pour ${lot.size} ligne(s) — obligatoire`} style={{ flex: 1 }} />
            <button className="btn small">Demander une clarification ({lot.size})</button>
          </form>
        )}
        <table className="data atelier-table">
          <thead>
            <tr><th></th><th>Pièce</th><th>Tiers</th><th className="num">Montant GL</th><th>Pourquoi cette ligne</th><th>État</th></tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr
                key={l.sampleItemId}
                className={(l.sampleItemId === selId ? 'sel ' : '') + (l.statut === 'complete' ? 'ligne-complete' : '')}
                onClick={() => { setSelId(l.sampleItemId); setPieceOuverte(0); }}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={lot.has(l.sampleItemId)} onChange={() => basculerLot(l.sampleItemId)} aria-label={`sélectionner ${l.piece}`} />
                </td>
                <td className="mono">{l.piece}</td>
                <td>{l.tiers}</td>
                <td className="num">{l.montantGl}</td>
                <td><span className="badge gray" title="le motif de sélection, sans remonter aux paramètres">{l.motif}</span></td>
                <td>
                  <span className={`badge ${STATUTS[l.statut].badge}`}>{STATUTS[l.statut].libelle}</span>
                  <div className="compare-ligne">{resumeComparaison(l)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="atelier-detail">
        {!sel ? <p className="muted">Aucune ligne.</p> : (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="mono">{sel.piece}</strong>
              <span className="row">
                <span className="badge gray">{sel.motif}</span>
                <span className={`badge ${STATUTS[sel.statut].badge}`}>{STATUTS[sel.statut].libelle}</span>
              </span>
            </div>

            {/* LA PIÈCE, ICI — pas dans un autre onglet. */}
            {sel.evidences.length === 0 ? (
              <p className="muted mt">Aucune pièce reçue pour cette ligne — la demander au client (case à cocher, puis clarification en lot).</p>
            ) : (
              <>
                <div className="row mt" style={{ gap: 4 }}>
                  {sel.evidences.map((e, i) => (
                    <button key={e.id} type="button"
                      className={`btn small ${i === pieceOuverte ? '' : 'secondary'}`}
                      onClick={() => setPieceOuverte(i)}>
                      {e.docType === 'invoice' ? 'facture' : e.docType === 'delivery_note' ? 'bon de livraison' : e.docType ?? 'pièce'}
                    </button>
                  ))}
                </div>
                <iframe
                  className="piece-vue"
                  title={`pièce ${sel.evidences[pieceOuverte]?.filename ?? ''}`}
                  src={`/api/blob/${sel.evidences[Math.min(pieceOuverte, sel.evidences.length - 1)].id}`}
                />
              </>
            )}

            {/* LES CHAMPS RELEVÉS, corrigeables au clavier ; Entrée atteste. */}
            {sel.extraction && (
              <form action={attester} ref={refAttester} className="mt">
                <input type="hidden" name="engagement_id" value={engId} />
                <input type="hidden" name="extraction_id" value={sel.extraction.id} />
                <input type="hidden" name="sample_item_id" value={sel.sampleItemId} />
                <table className="data champs-releves">
                  <tbody>
                    {sel.extraction.fields.filter((f) => !f.name.startsWith('line')).map((f) => (
                      <tr key={f.name}>
                        <td>{NOMS_CHAMPS[f.name] ?? f.name}</td>
                        <td>
                          {sel.extraction!.statut === 'pending_verify'
                            ? <input name={`champ_${f.name}`} defaultValue={f.value} className="mono" />
                            : <span className="mono">{f.value}</span>}
                        </td>
                        <td className="faint">{f.confidence < 1 ? f.confidence.toFixed(2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sel.extraction.statut === 'pending_verify' ? (
                  <div className="row mt">
                    <button className="btn small" type="submit" title="Entrée — ce que vous avez tapé part avec l'attestation">
                      Attester (Entrée)
                    </button>
                    <span className="faint">corrigez au clavier si la pièce dit autre chose — l&apos;attestation emporte vos corrections</span>
                  </div>
                ) : (
                  <p className="faint" style={{ margin: '6px 0 0' }}>
                    {sel.extraction.statut === 'verified'
                      ? <>attesté par {sel.extraction.verifiePar}{sel.extraction.verifieLe ? ` le ${sel.extraction.verifieLe.slice(0, 16)}` : ''}</>
                      : 'relevé déterministe (échelon sans attestation requise)'}
                  </p>
                )}
              </form>
            )}

            {/* LA COMPARAISON COMPLÈTE : règle, attendu, trouvé, tolérance. */}
            {sel.comparaisons.length > 0 && (
              <table className="data mt">
                <thead><tr><th>Règle</th><th>Grand livre</th><th>Pièce</th><th>Tolérance</th><th></th></tr></thead>
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
                    {x.taxonomy} ({x.statut}) → synthèse
                  </Link>
                ))}
              </p>
            )}

            {/* LA PROVENANCE, À PORTÉE. */}
            {sel.evidences[0] && (
              <p className="faint mt" style={{ fontSize: 11.5 }}>
                empreinte {sel.evidences[Math.min(pieceOuverte, sel.evidences.length - 1)].sha256.slice(0, 14)}…
                {sel.extraction && <> · échelon <span className="ai-flag">{sel.extraction.rung}</span></>}
                {' '}· <a href="#reexecution">re-exécution à l&apos;aveugle ↓</a>
              </p>
            )}

            {/* LE PAPIER SE REMPLIT SOUS MES YEUX — même formateur que le papier. */}
            <div className="papier-vivant mt">
              <div className="faint" style={{ marginBottom: 4 }}>La ligne, telle qu&apos;elle sortira au papier :</div>
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
