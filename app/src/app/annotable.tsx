'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// L'ÉLÉMENT ANNOTABLE (ADR-097). Trois gestes pour le même acte : clic droit,
// appui long (tablette — le clic droit seul est inaccessible au doigt), et la
// puce visible au survol ou au clavier (focus). Le composant ne décide RIEN :
// l'ancre est fournie par l'écran (identité métier, jamais une position), la
// pose passe par la server action partagée, et la règle vit dans le service.

export interface Marque { noteId: string; status: string; label: string }

export interface AncreProps {
  kind: string;
  /** L'identité MÉTIER (natural_key, code:section, code de question, paramètre). */
  aRef: string;
  field?: string | null;
  label: string;
}

export function Annotable({
  ancre, marques = [], membres, engagementId, chemin, notesHref, workpaperId = null, action, bloc = false, children,
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
      <button type="button" className="puce-note" aria-label={`ajouter une note de revue — ${ancre.label}`} onClick={ouvrir}>
        ✎
      </button>
      {ouvert && (
        <div className="note-voile" onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
          <div className="note-panneau" role="dialog" aria-label="ajouter une note de revue">
            <div className="note-cible">{ancre.label}</div>
            <form action={action}>
              <input type="hidden" name="engagement_id" value={engagementId} />
              <input type="hidden" name="kind" value={ancre.kind} />
              <input type="hidden" name="aref" value={ancre.aRef} />
              <input type="hidden" name="field" value={ancre.field ?? ''} />
              <input type="hidden" name="label" value={ancre.label} />
              <input type="hidden" name="chemin" value={chemin} />
              {workpaperId && <input type="hidden" name="workpaper_id" value={workpaperId} />}
              <textarea name="texte" required placeholder="La note — ce qui doit être corrigé, documenté ou expliqué." autoFocus />
              <div className="row mt">
                <select name="note_type" defaultValue="a_corriger" title="seules les bloquantes empêchent le visa (ADR-028)">
                  <option value="a_corriger">à corriger (bloquante)</option>
                  <option value="a_documenter">à documenter</option>
                  <option value="question">question</option>
                  <option value="remarque_n1">remarque pour N+1</option>
                </select>
              </div>
              <div className="row mt" style={{ justifyContent: 'space-between' }}>
                <select name="assignee" defaultValue="">
                  <option value="">— non attribuée —</option>
                  {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  <option value="otto">OTTO — exécute l&apos;instruction (et refuse ce qui n&apos;est pas de son ressort)</option>
                </select>
                <span className="row">
                  <button type="button" className="btn secondary small" onClick={() => setOuvert(false)}>Annuler</button>
                  <button type="submit" className="btn small">Poser la note</button>
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </Balise>
  );
}
