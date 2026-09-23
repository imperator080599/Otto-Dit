import { tx } from '@/lib/db/client';

// POSER L'ACTEUR DANS LA TRANSACTION (P1-04, AUD-05/AUD-09, migration 0176, EQUIPE-01).
//
// Même patron que `withTenant`/`withJeton` (lib/db/tenant.ts) : `set local` DANS une
// transaction, jamais `set`/`set_config(..., false)` — derrière un pooler de transaction, un
// réglage de SESSION peut repartir sur une autre connexion à la requête suivante (ADR-115).
//
// CE QUE CE MODULE NE FAIT PAS : il ne vérifie pas que `role` correspond vraiment au rôle de
// l'appelant dans le dossier — c'est à l'appelant (`team.ts::assignMember`, le semeur, l'enrichissement)
// de le savoir et de le déclarer honnêtement. La garde EQUIPE-01 (migration 0176) ne vérifie que
// la VALEUR posée, jamais qui l'a posée — un appelant qui mentirait sur son propre rôle
// contournerait ce garde, exactement comme `withTenant` ne vérifie pas que le locataire posé est
// le bon cabinet (même limite, nommée dans tenant.ts).

/**
 * Conduire `fn` avec l'acteur posé (`otto.acteur_role`) pour la durée de la transaction — le
 * seul chemin qui satisfait EQUIPE-01 (migration 0176) pour un `update` de `eng_role`/`can_sign`
 * sur `engagement_member`. Jamais un `update` direct hors de ce chemin (règle du plan §7.4).
 */
export async function withActeur<T>(role: 'manager' | 'partner', fn: () => Promise<T>): Promise<T> {
  if (role !== 'manager' && role !== 'partner') throw new Error('withActeur : rôle attendu manager ou partner');
  return tx(async (run) => {
    await run(`select set_config('otto.acteur_role', $1, true)`, [role]);
    return fn();
  });
}
