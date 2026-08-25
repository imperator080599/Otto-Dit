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
    { href: `${base}/imports`, label: 'Data & imports' },
    { href: `${base}/reconciliation`, label: 'Reconciliation' },
    { href: `${base}/materiality`, label: 'Materiality' },
    { href: `${base}/scoping`, label: 'Scoping' },
  ];
  if (packs.includes('nep-fr')) {
    items.push(
      { href: `${base}/population`, label: 'Population' },
      { href: `${base}/sampling`, label: 'Sampling' },
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
    { href: `${base}/dashboard`, label: 'Dashboard' },
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
