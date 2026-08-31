'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { EntreeRail } from '@/lib/services/rail';

// LE RAIL D'ÉTAT (ADR-103). Il reçoit ses entrées CALCULÉES côté serveur
// (services/rail.ts) : atteignable ou pas, et pourquoi. Par défaut il ne
// montre que ce qui est atteignable — un dossier neuf en montre cinq, et le
// rail grandit à mesure qu'on travaille. « Tout afficher » déplie la carte
// complète : ce qui n'est pas encore atteignable y est GRISÉ avec sa raison
// en une ligne — jamais masqué sans explication.

export function EngNav({ entrees }: { entrees: EntreeRail[] }) {
  const pathname = usePathname();
  const [tout, setTout] = useState(false);
  const aVenir = entrees.filter((x) => !x.atteignable);
  return (
    <nav className="engnav">
      {entrees.map((it) => {
        if (it.atteignable) {
          const active = /\/eng\/[^/]+$/.test(it.href) ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? 'active' : ''} title={it.phrase}>
              {it.label}
            </Link>
          );
        }
        if (!tout) return null;
        return (
          <span key={it.href} className="grise" title={it.phrase}>
            {it.label} <span className="raison">— {it.raison}</span>
          </span>
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
