'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// L'ÉLÉMENT ANNOTABLE (ADR-097). Trois gestes pour le même acte : clic droit,
// appui long (tablette — le clic droit seul est inaccessible au doigt), et la
// puce visible au survol ou au clavier (focus). Le composant ne décide RIEN :
// l'ancre est fournie par l'écran (identité métier, jamais une position), la
// pose passe par la server action partagée, et la règle vit dans le service.

export interface Marque { noteId: string; status: string; label: string }

/**
 * LES LIBELLÉS ARRIVENT EN PROPS, et c'est une contrainte, pas un choix : ce
 * composant est CLIENT : il traduit avec `useT()`, qui lit la locale posée par
 * le layout racine et appelle le MÊME catalogue que les composants serveur.
 */
const TYPES_NOTE = ['a_corriger', 'a_documenter', 'question', 'remarque_n1'] as const;

export interface AncreProps {
  kind: string;
  /** L'identité MÉTIER (natural_key, code:section, code de question, paramètre). */
  aRef: string;
  field?: string | null;
  label: string;
}

export function Annotable({
  ancre, marques = [], membres, engagementId, chemin, notesHref, workpaperId = null, action,
  bloc = false, children,
}: {
  ancre: AncreProps;
  marques?: Marque[];
  membres: { id: string; nom: string }[];
  engagementId: string;
  /** Le chemin de l'écran porteur — pour le refus (?erreur=) et le rechargement. */
  chemin: string;
  /** La vue transverse, où le compte de notes renvoie. */
  notesHref: string;
  workpaperId?: string | null;
  action: (fd: FormData) => Promise<void>;
  /** true : rend un <div> (section entière) au lieu d'un <span> (cellule). */
  bloc?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ouvrir = useCallback((e?: { preventDefault(): void }) => {
    e?.preventDefault();
    setOuvert(true);
  }, []);
  const annulerAppui = useCallback(() => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
  }, []);
  const debutAppui = useCallback(() => {
    annulerAppui();
    minuteur.current = setTimeout(() => setOuvert(true), 550);
  }, [annulerAppui]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  const Balise = bloc ? 'div' : 'span';
  return (
    <Balise
      className={`annotable${marques.length ? ' a-note' : ''}`}
      onContextMenu={ouvrir}
      onPointerDown={debutAppui}
      onPointerUp={annulerAppui}
      onPointerLeave={annulerAppui}
      onPointerMove={annulerAppui}
    >
      {children}
      {marques.length > 0 && (
        <a className="compte-notes" href={notesHref} title={marques.map((m) => m.label).join(' · ')}>
          ✎ {marques.length}
        </a>
      )}
      <button type="button" className="puce-note"
        aria-label={t('note.addFor', { objet: ancre.label })} onClick={ouvrir}>
        ✎
      </button>
      {ouvert && (
        <div className="note-voile" onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
          <div className="note-panneau" role="dialog" aria-label={t('note.dialog')}>
            <div className="note-cible">{ancre.label}</div>
            <form action={action}>
              <input type="hidden" name="engagement_id" value={engagementId} />
              <input type="hidden" name="kind" value={ancre.kind} />
              <input type="hidden" name="aref" value={ancre.aRef} />
              <input type="hidden" name="field" value={ancre.field ?? ''} />
              <input type="hidden" name="label" value={ancre.label} />
              <input type="hidden" name="chemin" value={chemin} />
              {workpaperId && <input type="hidden" name="workpaper_id" value={workpaperId} />}
              <textarea name="texte" required placeholder={t('note.text')} autoFocus />
              <div className="row mt">
                <select name="note_type" defaultValue="a_corriger" title={t('note.blockingHint')}>
                  {TYPES_NOTE.map((x) => (
                    <option key={x} value={x}>{t(`note.type.${x}` as CleLibelle)}</option>
                  ))}
                </select>
              </div>
              <div className="row mt" style={{ justifyContent: 'space-between' }}>
                <select name="assignee" defaultValue="">
                  <option value="">{t('note.unassigned')}</option>
                  {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  <option value="otto">{t('note.toOtto')}</option>
                </select>
                <span className="row">
                  <button type="button" className="btn secondary small" onClick={() => setOuvert(false)}>{t('note.cancel')}</button>
                  <button type="submit" className="btn small">{t('note.post')}</button>
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </Balise>
  );
}
