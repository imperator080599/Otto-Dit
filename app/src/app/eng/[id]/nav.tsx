'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Engagement navigation. Entries appear as slices land; the SOX group shows only for
// engagements carrying the pcaob-sox pack (pack-driven UI, D1).

export function EngNav({ engId, packs }: { engId: string; packs: string[] }) {
  const pathname = usePathname();
  const base = `/eng/${engId}`;
  const items: { href: string; label: string }[] = [
    { href: base, label: 'Overview' },
    // L'ACCEPTATION VIENT EN PREMIER : un dossier ne commence pas par un
    // import, il commence par une décision. Aucun travail ne se planifie avant.
    { href: `${base}/acceptance`, label: 'Acceptation' },
    // L'équipe vient AVANT les données : aucun travail ne s'attribue sans
    // déclaration d'indépendance signée, donc c'est par là qu'un dossier
    // commence — pas par un import.
    { href: `${base}/team`, label: 'Team & independence' },
    // La reprise N-1 vient AVANT les données : le dossier de l'an dernier
    // dit ce qu'on cherche cette année.
    { href: `${base}/carry-forward`, label: 'Reprise N-1' },
    { href: `${base}/imports`, label: 'Data & imports' },
    { href: `${base}/reconciliation`, label: 'Reconciliation' },
    { href: `${base}/materiality`, label: 'Materiality' },
    { href: `${base}/scoping`, label: 'Scoping' },
    // Le risque vient APRÈS le scoping et AVANT les travaux, parce que c'est sa
    // place réelle : il est le chaînon qui fait que le scoping commande quelque
    // chose. Le mettre ailleurs le rendrait décoratif.
    { href: `${base}/risk`, label: 'Risk by assertion' },
  ];
  if (packs.includes('nep-fr')) {
    items.push(
      { href: `${base}/population`, label: 'Population' },
      { href: `${base}/sampling`, label: 'Sampling' },
      { href: `${base}/testing`, label: 'Testing' },
      // LA BOUCLE, entre les travaux et les demandes : c'est là qu'elle tourne.
      { href: `${base}/loop`, label: 'La boucle' },
    );
  }
  if (packs.includes('pcaob-sox')) {
    items.push({ href: `${base}/rcm`, label: 'RCM & controls' });
  }
  items.push(
    { href: `${base}/requests`, label: 'Requests' },
    { href: `${base}/evidence`, label: 'Evidence' },
    { href: `${base}/exceptions`, label: packs.includes('pcaob-sox') ? 'Deviations' : 'Exceptions' },
    { href: `${base}/workpapers`, label: 'Workpapers' },
    // Le pointage des états financiers : l'autre bout de l'arc.
    { href: `${base}/fs-tieout`, label: 'États financiers' },
    { href: `${base}/ask`, label: 'Ask the file' },
    // L'achèvement, puis les obstacles : la fin du dossier dans l'ordre.
    { href: `${base}/completion`, label: 'Achèvement' },
    // Les obstacles au visa : une seule liste, calculée, transverse.
    { href: `${base}/obstacles`, label: 'Obstacles au visa' },
    { href: `${base}/dashboard`, label: 'Dashboard' },
    { href: `${base}/provenance`, label: 'Provenance' },
    { href: `${base}/events`, label: 'Event log' },
  );
  return (
    <nav className="engnav">
      {items.map((it) => {
        const active = it.href === base ? pathname === base : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? 'active' : ''}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
