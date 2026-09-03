'use client';

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { memoriserRepliAction } from './replis-actions';
import { useT } from '@/lib/i18n/client';

// LA MÉMOIRE DES REPLIS, CÔTÉ CLIENT (1.2). Le layout racine la lit en base
// pour la personne connectée et la donne ici ; chaque <Repli> y lit son état
// AU PREMIER RENDU — le serveur et le client voient la même chose, aucune
// section ne s'ouvre pour se refermer après l'hydratation.
//
// Le cache local suit les gestes : une navigation ne re-rend pas le layout
// racine, donc un repli fait sur une page se retrouve sur la suivante sans
// attendre la base. Un rechargement relit la base.

export interface MemoireReplis {
  lire(cle: string): boolean | null;
  memoriser(cle: string, ouvert: boolean): Promise<{ ok: true } | { ok: false; raison: string }>;
}

const Contexte = createContext<MemoireReplis>({
  lire: () => null,
  memoriser: async () => ({ ok: false, raison: 'REPLI-03' }),
});

export function FournisseurReplis({ replis, connecte, children }: { replis: Record<string, boolean>; connecte: boolean; children: ReactNode }) {
  const t = useT();
  const cache = useRef<Record<string, boolean>>({ ...replis });
  const valeur = useMemo<MemoireReplis>(() => ({
    lire: (cle) => (Object.prototype.hasOwnProperty.call(cache.current, cle) ? cache.current[cle] : null),
    memoriser: async (cle, ouvert) => {
      cache.current[cle] = ouvert;
      if (!connecte) return { ok: false, raison: t('repli.nonConnecte') };
      try {
        return await memoriserRepliAction(cle, ouvert);
      } catch (e) {
        return { ok: false, raison: e instanceof Error ? e.message : String(e) };
      }
    },
  }), [connecte, t]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useReplis(): MemoireReplis {
  return useContext(Contexte);
}
