// LA FORME DU RAIL, SANS LE SERVEUR (ADR-112).
//
// POURQUOI CE FICHIER EXISTE, ET C'EST UNE LEÇON CHÈRE. `nav.tsx` porte
// 'use client'. Il importait `GROUPES` depuis `services/rail.ts` — un import
// de VALEUR, pas de type — et `rail.ts` importe `db/client`, qui importe `pg`,
// qui importe `net`, `tls`, `dns`. Le bundle client est parti chercher la
// couche réseau de PostgreSQL : le build de production a échoué, et en mode
// développement CHAQUE écran a rendu 500. Le harnais de balayage l'a vu ; il
// a annoncé « 73 écrans ne rendent pas » sans dire pourquoi, parce que la
// cause était dans le journal du serveur qu'il n'imprimait qu'après.
//
// La règle, elle, est ancienne et vaut pour tout composant client : un
// 'use client' n'importe RIEN qui touche la base — types et constantes pures
// seulement. `client-serveur.test.ts` la vérifie maintenant par le graphe des
// imports, et non par la relecture.

export interface EntreeRail {
  href: string;
  label: string;
  /** Ce qu'un auditeur qui ouvre l'outil pour la première fois y trouvera. */
  phrase: string;
  atteignable: boolean;
  /** La raison, en une ligne, quand ce n'est pas atteignable. */
  raison?: string;
  /** Le groupe du rail vertical, DÉJÀ TRADUIT (le rail est rendu côté client). */
  groupe: string;
  /** La clé du groupe — stable, c'est elle qu'un test interroge. */
  groupeCle: CleGroupe;
}

/**
 * L'ordre des groupes du rail — l'ordre du dossier, pas celui du code.
 * Ce sont des CLÉS de catalogue : le rail se lit dans la langue du cabinet.
 */
export const GROUPES_CLES = [
  'rail.groupe.dossier', 'rail.groupe.comptes',
  /* LES ÉTATS FINANCIERS, PAS « AREAS » (mandat de la soirée, §1) : un auditeur
     navigue par bilan et compte de résultat — chaque poste du pack y figure,
     travaillé ou grisé avec sa raison. */
  'rail.groupe.bilan', 'rail.groupe.resultat',
  'rail.groupe.transverse', 'rail.demandes', 'rail.groupe.fin',
] as const;
export type CleGroupe = (typeof GROUPES_CLES)[number];
