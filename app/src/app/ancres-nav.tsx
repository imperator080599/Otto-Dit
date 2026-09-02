'use client';

import { useEffect, useState } from 'react';

// LA NAVIGATION PAR ANCRES (mandat de la soirée, §2.4). Les onglets d'un poste
// ne sont pas des pages : ce sont les sections d'une même page, et le rail
// discret qui les liste dit où l'on est (soulignement, jamais un cadre) et
// dans quel état est chaque section (un repère de forme et un mot — la couleur
// n'est jamais seule, et elle ne décore pas).
//
// Un clic sur une ancre OUVRE la section si elle était repliée : on ne
// navigue pas vers un titre fermé.

export interface AncreSection {
  id: string;
  titre: string;
  repere: string;
  etat: string;
}

export function AncresNav({ libelle, sections }: { libelle: string; sections: AncreSection[] }) {
  const [actif, setActif] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entrees) => {
      const visible = entrees.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActif(visible.target.id);
    }, { rootMargin: '-10% 0px -70% 0px' });
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav className="ancres" aria-label={libelle} data-ancres>
      {sections.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={actif === s.id ? 'actif' : ''} aria-current={actif === s.id ? 'true' : undefined}
          data-ancre={s.id} title={s.etat} aria-label={`${s.titre} — ${s.etat}`}
          onClick={() => {
            setActif(s.id);
            const el = document.getElementById(s.id);
            if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
          }}>
          <span className="repere" aria-hidden="true">{s.repere}</span>{s.titre}
        </a>
      ))}
    </nav>
  );
}
