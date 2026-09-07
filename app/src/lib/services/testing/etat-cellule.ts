// L'ÉTAT D'UNE CELLULE DE GRILLE, ET SA MARQUE À L'ÉCRAN — dans son propre
// fichier, SANS AUCUN import serveur (ni lib/db/client, ni lib/db/migrate),
// pour qu'un composant 'use client' (atelier.tsx) puisse l'importer sans
// emporter la base dans le navigateur avec lui.
//
// LE DÉFAUT VÉCU (revue hostile du 2026-09-07, en clôturant l'étape 6) :
// une première consolidation avait posé cette même table DANS grille.ts (qui
// importe lib/db/client) et fait importer `ETAT_CELLULE` depuis atelier.tsx —
// `client-serveur.test.ts` (le garde qui a déjà attrapé exactement ce défaut
// une fois, le 2026-09-01, avec `GROUPES`/rail.ts) l'a immédiatement dénoncé :
// un import de VALEUR emporte tout le module qui le porte, même si ce module
// n'exporte qu'un littéral de trois lignes. Ce fichier existe pour que
// dupliquer la table ne soit plus nécessaire, ET que l'importer reste sûr.

export type EtatCellule = 'conforme' | 'hors_tolerance' | 'non_recevable' | 'absent' | 'sans_ancre';

/* LA COULEUR N'EST JAMAIS SEULE (mandat du jour, règle permanente 10) : chaque
   état de cellule porte son mot et sa marque, la couleur vient en plus. */
export const ETAT_CELLULE: Record<EtatCellule, { badge: string; marque: string }> = {
  conforme: { badge: 'green', marque: '✓' },
  hors_tolerance: { badge: 'red', marque: '✗' },
  non_recevable: { badge: 'red', marque: '⊘' },
  absent: { badge: 'amber', marque: '?' },
  sans_ancre: { badge: 'amber', marque: '⌖' },
};
