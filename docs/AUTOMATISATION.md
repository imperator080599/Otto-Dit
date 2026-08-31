# AUTOMATISATION — la preuve par les champs, pas par la liste des fonctions (mandat §3.C, M-16)

La règle du mandat : **l'automatisation supprime la saisie, jamais le jugement.** La preuve
n'est pas une liste de fonctionnalités : c'est le compte des champs qu'un humain doit
encore TAPER, écran par écran, avant/après.

## 1. La mesure

`cd app && npm run densite` mesure, sur build de production et base semée, les **champs à
taper** de chacun des 67 écrans (définition dans le code qui mesure :
`app/scripts/mesures/densite.ts`). Le tableau complet vit dans **docs/DENSITE.md**,
régénéré à chaque exécution.

**Ligne de base établie le 2026-08-31** (première mesure outillée). Les « avant » d'écrans
antérieurs à cette date n'existent que là où ils ont été mesurés à l'époque — ils sont
listés ci-dessous, et AUCUN autre avant/après historique ne sera reconstitué de mémoire :
un chiffre non mesuré n'est pas un chiffre.

## 2. Les avant/après MESURÉS

| Écran / geste | Avant | Après | Mesure |
|---|---|---|---|
| Traiter une ligne d'échantillon (cas normal) | 4 gestes / 2 écrans (pièce dans un autre onglet) | **1 geste / 1 écran** (Entrée dans l'atelier) | `npm run mesure:testing` (ADR-104) — modèle KLM : 10,2 s → 1,6 s de gestes par ligne |
| Extraction d'une pièce | saisie manuelle de tous les champs | 0 champ tapé sur pièce lue (échelle ADR-012) ; l'humain ATTESTE et corrige | atelier, `eval:pieces-neuves` : précision 100 % (43/43) hors cache |
| Seuils de signification | calcul à la main | 0 champ : la règle du cabinet propose, l'humain VALIDE (1 case + 1 % optionnels) | écran seuils ; arithmétique déterministe testée |
| Tirage d'échantillon | sélection manuelle | 0 champ : couverture + aléa germé (kernel) ; motif de sélection AFFICHÉ | boucle par procédure, monetaryDraw |
| Rapprochement TB/GL, balances âgées, diff processus N/N-1, obstacles au visa | rapprochements et listes à la main | 0 champ : DÉRIVÉS à la lecture, jamais stockés | reconciliation, balances-aux, processus, obstacles — tests unitaires |
| Papier de travail | rédaction manuelle | 0 champ pour le corps (moteur + formateur) ; l'humain signe, note, justifie l'édition | workpapers, parcours |

## 3. Ce qui reste tapé — et si c'est un défaut ou un choix

Les écrans aux champs les plus nombreux (voir DENSITE.md pour le tableau vivant) portent
deux natures de saisie :

- **Du jugement écrit** — motifs, justifications, motifs de refus, compréhension
  d'entretien : ces champs sont LE produit (un refus sans motif ne se relit pas). Ils ne
  baisseront pas ; c'est voulu et revendiqué.
- **De la donnée** — dates, montants, références déjà connues d'un système : chaque champ
  de cette nature est un candidat à la dérivation ou à la proposition. Les candidats
  identifiés sont au registre (A-01 rapprochement en lot, A-05 complétude au dépôt) ;
  chaque tranche qui en supprime met à jour DENSITE.md par re-mesure.

## 4. Le plafond

Tout ce que la machine propose reste une proposition : niveaux L0–L5, plafond **L2** —
rien de généré n'entre au dossier sans validation humaine tracée. Le compte de champs ne
mesure donc jamais la suppression du JUGEMENT : uniquement celle de la SAISIE.
