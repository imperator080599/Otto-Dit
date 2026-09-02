import { headers } from 'next/headers';
import { annulerApres } from '@/lib/db/client';

// LA SONDE N'ÉCRIT PAS SUR LA DÉMONSTRATION (mandat de la soirée, §0.2).
//
// Le harnais d'acceptation cliquée (scripts/accept) se déclare par un en-tête
// `X-Otto-Sonde` sur chacune de ses requêtes. Tout geste d'écriture reçu sous
// cet en-tête est CONDUIT — le service tourne, le refus est réel, le succès
// aussi — puis la transaction est ANNULÉE : le dossier que le fondateur veut
// retrouver n'a pas bougé. Aucun réglage ne le désactive côté serveur ; c'est
// le harnais qui, lancé avec --ecrire (en local, sur une base jetable), omet
// l'en-tête.
//
// Ce que ce module ne fait pas, et le dit : il n'isole pas la sonde dans son
// propre locataire (créé et détruit par elle) — reporté, avec sa conception,
// au registre. Une lecture reste une lecture ; seule l'écriture est annulée.

export const EN_TETE_SONDE = 'x-otto-sonde';

/** La requête courante vient-elle de la sonde ? Faux hors de toute requête. */
export async function modeSonde(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get(EN_TETE_SONDE) !== null;
  } catch {
    return false;
  }
}

/** Conduire un geste d'écriture : réel, ou réel puis annulé si la sonde le demande. */
export async function conduire<T>(fn: () => Promise<T>): Promise<T> {
  if (await modeSonde()) return annulerApres(fn);
  return fn();
}
