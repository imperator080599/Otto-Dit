'use client';

import { useEffect, useState, type ReactNode } from 'react';

// LE REPLI MÉMORISÉ (mandat de la soirée, §2.3 et §7). Une sous-section de
// contenu se replie d'un clic sur son titre ; l'état est retenu par personne
// (au sens « par profil de navigateur », comme le rail — dit, pas caché) et
// retrouvé à la prochaine ouverture. Par défaut : OUVERT. Un écran qui
// s'ouvrirait replié sur une machine neuve cacherait le dossier à qui le
// découvre.
//
// CE QUE LE REPLI N'EST PAS : une règle d'état. Ce qui n'est pas encore
// atteignable est grisé avec sa raison (ADR-103) ; ce qui est replié l'a été
// par la personne. Confondre les deux ferait disparaître du contenu sans que
// personne sache pourquoi.
//
// La mémoire est lue APRÈS le premier rendu (le serveur ne la connaît pas) ;
// jusque-là, la section est ouverte — donc un bref repli après l'ouverture
// quand une section est mémorisée fermée, dit ici plutôt que caché.
//
// LA CLÉ EST CELLE DE LA SECTION, PAS DU DOSSIER : replier « Processus » sur
// un poste le replie sur tous les postes de tous les dossiers de ce navigateur.
// C'est voulu — on range une nature de contenu, pas une page — et c'est dit.

export interface EtatRepli {
  /** Le repère de forme — la couleur n'est jamais seule. */
  repere: string;
  libelle: string;
}

const PREFIXE = 'otto.repli.';

function lire(cle: string): boolean | null {
  try {
    const v = window.localStorage.getItem(PREFIXE + cle);
    return v === null ? null : v === '1';
  } catch { return null; }
}
function ecrire(cle: string, ouvert: boolean): void {
  try { window.localStorage.setItem(PREFIXE + cle, ouvert ? '1' : '0'); } catch { /* navigateur qui refuse : rien à mémoriser */ }
}

export function Repli({ cle, id, titre, etat, resume, children }: {
  /** La clé de mémoire — stable, indépendante de la langue. */
  cle: string;
  /** L'ancre de la section (`#id`), celle que la navigation par ancres vise. */
  id: string;
  titre: string;
  etat?: EtatRepli;
  resume?: ReactNode;
  children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(true);
  useEffect(() => { const m = lire(cle); if (m !== null) setOuvert(m); }, [cle]);
  return (
    <details id={id} className="repli" data-repli={cle} open={ouvert}
      onToggle={(ev) => {
        /* Lire AVANT la mise à jour différée : React a déjà libéré
           l'événement quand le calcul s'exécute (leçon du rail). */
        const o = ev.currentTarget.open;
        setOuvert(o);
        ecrire(cle, o);
      }}>
      <summary className="repli-titre">
        <span className="chevron" aria-hidden="true">▸</span>
        <h3>{titre}</h3>
        {etat && (
          <span className="etat-bloc" data-etat-bloc>
            <span aria-hidden="true">{etat.repere}</span> {etat.libelle}
          </span>
        )}
        {resume && <span className="repli-resume">{resume}</span>}
      </summary>
      <div className="repli-corps">{children}</div>
    </details>
  );
}
