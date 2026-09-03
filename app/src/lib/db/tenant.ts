import { tx, q } from '@/lib/db/client';
import { sousLocataire, locataireDuContexte } from '@/lib/db/sans-locataire';

// POSER LE LOCATAIRE DANS LA TRANSACTION (docs/PLAN_RLS.md, étape 1).
//
// La production tourne derrière un pooler en mode TRANSACTION : un réglage de
// session (`set`, `set_config(…, false)`) peut repartir sur une autre connexion
// à la requête suivante — interdit à la source (ADR-115). Seul `set local`,
// DANS une transaction, est sûr : il vit et meurt avec elle. C'est aussi ce qui
// rend la sonde compatible (une transaction annulée emporte le réglage).
//
// CE QUE CE MODULE NE FAIT PAS : il n'arme rien. Sous le rôle actuel
// (`postgres`, BYPASSRLS), poser `otto.tenant_id` ne change RIEN à ce que la
// base rend — les politiques sont inertes. C'est l'étape 3 de PLAN_RLS, non
// exécutée, qui l'arme. Ce module et son test disent donc aujourd'hui une
// chose vérifiable : *quand* le rôle changera, l'isolation tiendra.

/** Le locataire courant, tel que la BASE le voit (null hors transaction posée). */
export async function locataireCourant(): Promise<string | null> {
  const r = await q<{ t: string | null }>(`select nullif(current_setting('otto.tenant_id', true), '') t`);
  return r[0]?.t ?? null;
}

/**
 * Conduire `fn` avec le locataire posé pour la durée de la transaction.
 * Toute requête faite dessous (`q`, `q1`, `tx`, `logEvent`…) la rejoint.
 */
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error('withTenant : un locataire vide n’est pas un locataire');
  /* DEUX POSES, PAS UNE. Dans la BASE (`set local`, pour les politiques) et
     dans le CONTEXTE ASYNCHRONE (pour le garde de `q()`) : la première décide
     de ce que la base rend, la seconde de ce que le code s'autorise à
     demander. Sans la seconde, un `q()` conduit ici lèverait LOC-01 alors que
     le locataire EST posé — le garde deviendrait un obstacle au lieu d'une
     règle. */
  return sousLocataire(tenantId, () => tx(async (run) => {
    await run(`select set_config('otto.tenant_id', $1, true)`, [tenantId]);
    return fn();
  }));
}

/** Le locataire tel que le CODE l'a posé (le contexte asynchrone), sans requête. */
export function locataireDuCode(): string | null {
  return locataireDuContexte();
}
