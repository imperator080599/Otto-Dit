'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { GROUPES, type EntreeRail } from '@/lib/services/rail-vue';

// LE RAIL VERTICAL (ADR-112, R-03). Il reçoit ses entrées CALCULÉES côté
// serveur (services/rail.ts) : atteignable ou pas, et pourquoi — et son
// GROUPE. Les onglets en haut mettaient trente destinations sur une ligne et
// suggéraient qu'elles étaient toutes du même rang ; elles ne le sont pas.
// À gauche, en colonne, un groupe par nature de travail, les POSTES au milieu
// parce que c'est là que le dossier se fait.
//
// Par défaut il ne montre que ce qui est atteignable. « Tout afficher »
// déplie la carte complète : ce qui n'est pas encore atteignable y est GRISÉ
// avec sa raison — jamais masqué sans explication.

export function EngNav({ entrees }: { entrees: EntreeRail[] }) {
  const pathname = usePathname();
  const [tout, setTout] = useState(false);
  const aVenir = entrees.filter((x) => !x.atteignable);
  const actif = (href: string) =>
    (/\/eng\/[^/]+$/.test(href) ? pathname === href : pathname.startsWith(href));

  return (
    <nav className="rail" aria-label="Sections du dossier">
      {GROUPES.map((g) => {
        const dedans = entrees.filter((x) => x.groupe === g);
        const visibles = dedans.filter((x) => x.atteignable || tout);
        if (visibles.length === 0) return null;
        return (
          <div className="rail-groupe" key={g}>
            <div className="rail-titre">{g}</div>
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
          </div>
        );
      })}
      {aVenir.length > 0 && (
        <button type="button" className="rail-tout" onClick={() => setTout(!tout)}>
          {tout ? 'réduire' : `tout afficher (${aVenir.length} à venir)`}
        </button>
      )}
    </nav>
  );
}
