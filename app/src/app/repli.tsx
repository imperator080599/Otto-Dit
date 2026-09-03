'use client';

import { useState, type ReactNode } from 'react';
import { useReplis } from './replis-contexte';
import { useT } from '@/lib/i18n/client';

// LE REPLI MÉMORISÉ (mandat de la soirée §2.3 ; mandat de nuit n°2, 1.2). Une
// section de contenu se replie d'un clic sur son titre ; l'état est retenu EN
// BASE, PAR PERSONNE (migration 0132), et connu du serveur au premier rendu.
// Par défaut : OUVERT. Un écran qui s'ouvrirait replié sur un compte neuf
// cacherait le dossier à qui le découvre.
//
// CE QUE LE REPLI N'EST PAS : une règle d'état. Ce qui n'est pas encore
// atteignable est grisé avec sa raison (ADR-103) ; ce qui est replié l'a été
// par la personne. Confondre les deux ferait disparaître du contenu sans que
// personne sache pourquoi.
//
// LA CLÉ EST CELLE DE LA SECTION, PAS DU DOSSIER : replier « Papiers » sur un
// poste le replie sur tous les postes de tous les dossiers de cette personne.
// C'est voulu — on range une nature de contenu, pas une page — et c'est dit.
//
// UN RANGEMENT QUE LA BASE N'A PAS RETENU LE DIT, à côté du titre : la
// section s'est repliée à l'écran, mais elle rouvrira au prochain chargement.
// Le mouvement ne porte que sur le chevron (120–200 ms) ; le contenu apparaît
// et disparaît sans animation — rien ne ralentit un geste.

export interface EtatRepli {
  /** Le repère de forme — la couleur n'est jamais seule. */
  repere: string;
  libelle: string;
}

export function Repli({ cle, id, titre, etat, resume, niveau = 3, children }: {
  /** La clé de mémoire — stable, indépendante de la langue. */
  cle: string;
  /** L'ancre de la section (`#id`), celle que la navigation par ancres vise. */
  id?: string;
  titre: ReactNode;
  etat?: EtatRepli;
  resume?: ReactNode;
  /** 2 pour une section de page (h2), 3 pour une sous-section (h3). */
  niveau?: 2 | 3;
  children: ReactNode;
}) {
  const t = useT();
  const memoire = useReplis();
  const [ouvert, setOuvert] = useState<boolean>(() => memoire.lire(cle) ?? true);
  const [defaut, setDefaut] = useState<string | null>(null);
  const ancre = id ?? cle.replace(/[^A-Za-z0-9_-]+/g, '-');
  const Titre = niveau === 2 ? 'h2' : 'h3';
  return (
    <details id={ancre} className={`repli niveau-${niveau}`} data-repli={cle} open={ouvert}
      onToggle={(ev) => {
        /* Lire AVANT la mise à jour différée : React a déjà libéré
           l'événement quand le calcul s'exécute (leçon du rail). */
        const o = ev.currentTarget.open;
        if (o === ouvert) return;
        setOuvert(o);
        void memoire.memoriser(cle, o).then((r) => setDefaut(r.ok ? null : r.raison));
      }}>
      <summary className="repli-titre">
        <span className="chevron" aria-hidden="true">▸</span>
        <Titre>{titre}</Titre>
        {etat && (
          <span className="etat-bloc" data-etat-bloc>
            <span aria-hidden="true">{etat.repere}</span> {etat.libelle}
          </span>
        )}
        {resume && <span className="repli-resume">{resume}</span>}
        {defaut && <span className="repli-defaut" data-repli-defaut role="status">{t('repli.nonMemorise')} — {defaut}</span>}
      </summary>
      <div className="repli-corps">{children}</div>
    </details>
  );
}
