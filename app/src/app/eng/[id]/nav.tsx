'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { GROUPES_CLES, type EntreeRail } from '@/lib/services/rail-vue';
import { useT } from '@/lib/i18n/client';

// LE RAIL VERTICAL (ADR-112, R-03) — avec le REPLI PAR GROUPE (revue n°2).
//
// Les onglets en haut mettaient trente destinations sur une ligne et les
// donnaient toutes pour égales ; elles ne le sont pas. À gauche, en colonne, un
// groupe par nature de travail, les POSTES au milieu parce que c'est là que le
// dossier se fait.
//
// DEUX MÉCANISMES QUI NE SE REMPLACENT PAS. Le repli est CHOISI par
// l'utilisateur : il range ce dont il n'a pas besoin maintenant. La règle
// d'état (ADR-103) reste entière : ce qui n'est pas encore atteignable est
// GRISÉ avec sa raison derrière « tout afficher », jamais absent. Confondre
// les deux ferait disparaître des destinations sans que personne sache
// pourquoi.

export function EngNav({ entrees, tout: libelleTout, reduire }: {
  entrees: EntreeRail[]; tout: string; reduire: string;
}) {
  const t = useT();
  const pathname = usePathname();
  const [tout, setTout] = useState(false);
  /* Le repli est un ÉTAT, pas un attribut posé une fois : sans lui, chaque
     rendu (une navigation suffit) rouvrirait ce que l'utilisateur a rangé. */
  const [replies, setReplies] = useState<Record<string, boolean>>({});
  const aVenir = entrees.filter((x) => !x.atteignable);
  const actif = (href: string) =>
    (/\/eng\/[^/]+$/.test(href) ? pathname === href : pathname.startsWith(href));

  return (
    <nav className="rail" aria-label={t('col.sections')}>
      {GROUPES_CLES.map((cle) => {
        const dedans = entrees.filter((x) => x.groupeCle === cle);
        const visibles = dedans.filter((x) => x.atteignable || tout);
        if (visibles.length === 0) return null;
        const titre = dedans[0].groupe;
        return (
          <details className="rail-groupe" key={cle} open={!replies[cle]}
            onToggle={(ev) => {
              /* LIRE L'ÉTAT AVANT la mise à jour : dans le calcul différé,
                 React a déjà libéré l'événement et `currentTarget` est null —
                 une exception par bascule, invisible tant qu'on ne clique
                 pas. Mesurée par `npm run clics`, corrigée ici. */
              const ouvert = ev.currentTarget.open;
              setReplies((r) => ({ ...r, [cle]: !ouvert }));
            }}>
            <summary className="rail-titre">
              <span className="chevron" aria-hidden="true">▸</span>{titre}
            </summary>
            {visibles.map((it) => (it.atteignable ? (
              <Link key={it.href + it.label} href={it.href}
                className={`rail-lien${actif(it.href) ? ' active' : ''}`} title={it.phrase}>
                {it.label}
              </Link>
            ) : (
              <span key={it.href + it.label} className="rail-lien grise" title={it.phrase}>
                {it.label}
                <span className="raison">{it.raison}</span>
              </span>
            )))}
          </details>
        );
      })}
      {aVenir.length > 0 && (
        <button type="button" className="rail-tout" onClick={() => setTout(!tout)}>
          {tout ? reduire : `${libelleTout} (${aVenir.length})`}
        </button>
      )}
    </nav>
  );
}
