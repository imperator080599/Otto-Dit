'use client';
import { useEffect } from 'react';

/**
 * P0-01 (AUD-16, hypothèse H du #418). Pose `html[data-hydrated="1"]` une fois React monté côté
 * client — jamais avant. Le harnais (`scripts/clics/scenario.ts::aller`) efface l'attribut avant
 * chaque navigation puis l'attend : naviguer avant que ce composant ne se monte est précisément la
 * course qui produit « Minified React error #418 ; args[]=HTML » (docs/CHASSE.md §1). Ne rend rien.
 */
export function MarqueurHydratation(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = '1';
  }, []);
  return null;
}
