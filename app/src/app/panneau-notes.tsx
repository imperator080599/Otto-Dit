'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n/client';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// LE PANNEAU LATÉRAL DES NOTES DE REVUE (mandat de nuit n°2, 1.3).
//
// CE QUI MANQUAIT. Le repère au bord d'une cellule disait « il y a des notes
// ici » et emmenait à la vue transverse : on quittait l'écran, on perdait la
// ligne qu'on lisait, et on revenait — pour trois mots de réponse. Le fil
// s'ouvre désormais À CÔTÉ du travail : la note, son type, son ancienneté en
// jours OUVRÉS, à qui elle est adressée, les réponses, et de quoi répondre.
//
// CE QUE LE PANNEAU NE DÉCIDE PAS. Il n'a aucune opinion sur la clôture : le
// bouton n'apparaît que si le serveur a dit que CETTE personne peut clore
// (réviseur de la mission, jamais l'auteur — ADR-028, tenue par le service ET
// par un déclencheur en base). Quand elle ne le peut pas, la RAISON est écrite
// à la place du bouton : un geste absent sans explication est un geste qui a
// disparu (règle 13). La pose, elle, reste au même endroit : le même repère.
//
// L'écran « Review notes » ne bouge pas : il reste la vue d'ensemble — toutes
// les notes du dossier, y compris celles dont l'objet a été retiré (ADR-097),
// que ce panneau, ancré à un objet vivant, ne peut par construction pas montrer.

export interface MarqueNote {
  noteId: string;
  status: string;
  label: string;
  type: string;
  texte: string;
  auteurId: string;
  auteur: string;
  destinataire: string | null;
  destinataireKind: string;
  creeLe: string;
  ageJoursOuvres: number;
  reponses: { auteur: string; kind: string; texte: string; quand: string }[];
}

export interface Moi { id: string; peutClore: boolean }

const BADGE_STATUT: Record<string, string> = { open: 'amber', addressed: 'blue', closed: 'green' };

export function PanneauNotes({
  marques, cible, engagementId, chemin, moi, notesHref, repondre, transitionner, onFermer,
}: {
  marques: MarqueNote[];
  cible: string;
  engagementId: string;
  chemin: string;
  moi: Moi;
  notesHref: string;
  repondre: (fd: FormData) => Promise<void>;
  transitionner: (fd: FormData) => Promise<void>;
  onFermer: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  return (
    <div className="panneau-notes" role="complementary" aria-label={t('note.panneau')} data-panneau-notes={cible}>
      <div className="panneau-notes-entete">
        <div>
          <div className="note-cible" style={{ marginBottom: 0 }}>{cible}</div>
          <span className="faint">{t('note.panneau.compte', { n: marques.length })}</span>
        </div>
        <button type="button" className="btn secondary small" onClick={onFermer} data-fermer-panneau>{t('note.cancel')}</button>
      </div>

      {marques.map((m) => {
        /* L'AUTEUR NE CLÔT JAMAIS SA PROPRE NOTE — et la raison se lit. */
        const auteurDeCelleCi = m.auteurId === moi.id;
        const clorePossible = moi.peutClore && !auteurDeCelleCi && m.status === 'addressed';
        return (
          <div className="panneau-note" key={m.noteId} data-note={m.noteId} data-note-statut={m.status}>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${BADGE_STATUT[m.status] ?? 'gray'}`} data-statut>{t(`notes.statut.${m.status}` as CleLibelle)}</span>
              <span className={`badge ${m.type === 'a_corriger' ? 'red' : 'gray'}`}>{t(`note.type.${m.type}` as CleLibelle)}</span>
              <span className="faint" data-age>{t('note.ageJoursOuvres', { n: m.ageJoursOuvres })}</span>
            </div>
            <p style={{ margin: '6px 0 4px' }}>{m.texte}</p>
            <p className="faint" style={{ margin: 0 }}>
              {m.auteur} → {m.destinataire ?? t('note.unassigned')}
            </p>
            {m.reponses.map((r, i) => (
              <div className="callout" key={i} style={{ marginTop: 6 }}>
                <strong>{r.auteur}</strong> <span className="faint">{r.quand.slice(0, 16)}</span>
                <p style={{ margin: '2px 0 0' }}>{r.texte}</p>
              </div>
            ))}
            <form action={repondre} className="row mt" style={{ gap: 6 }}>
              <input type="hidden" name="engagement_id" value={engagementId} />
              <input type="hidden" name="note_id" value={m.noteId} />
              <input type="hidden" name="chemin" value={chemin} />
              <input name="texte" required placeholder={t('notes.reponse')} style={{ flex: 1 }} data-repondre-texte />
              <button className="btn secondary small">{t('notes.repondre')}</button>
            </form>
            <div className="row" style={{ marginTop: 6 }}>
              {m.status === 'open' && (
                <form action={transitionner}>
                  <input type="hidden" name="engagement_id" value={engagementId} />
                  <input type="hidden" name="note_id" value={m.noteId} />
                  <input type="hidden" name="to" value="addressed" />
                  <input type="hidden" name="chemin" value={chemin} />
                  <button className="btn secondary small">{t('note.marquerTraitee')}</button>
                </form>
              )}
              {clorePossible ? (
                <form action={transitionner}>
                  <input type="hidden" name="engagement_id" value={engagementId} />
                  <input type="hidden" name="note_id" value={m.noteId} />
                  <input type="hidden" name="to" value="closed" />
                  <input type="hidden" name="chemin" value={chemin} />
                  <button className="btn small" data-clore>{t('notes.clore')}</button>
                </form>
              ) : (
                <span className="faint" data-clore-refuse>
                  {m.status === 'open' ? t('note.cloreApresReponse')
                    : auteurDeCelleCi ? t('note.cloreJamaisAuteur')
                      : t('note.cloreReviseurSeul')}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <p className="faint" style={{ marginBottom: 0 }}>
        <a href={notesHref}>{t('note.panneau.versLaVue')}</a>
      </p>
    </div>
  );
}
