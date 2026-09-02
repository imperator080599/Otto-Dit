# Bandes de numéros de migration

*Source de vérité : `app/src/lib/db/migrations-bandes.test.ts` (la CI refuse un numéro hors bande ou pris deux fois). Ce fichier la recopie.*

| Bande | Propriétaire |
|---|---|
| 0001–0039 | historique, avant le mandat du jour |
| 0040–0049 | COLONNE VERTÉBRALE (0040 rôle applicatif, 0041 row_version, 0042 verdicts de verrou, 0043–0044 machine à états d'import, 0045 ancrage des dérivés, 0046 moteur de visa, 0047 politiques normalisées) |
| 0050–0059 | W1 Atelier de test |
| 0060–0069 | W2 Feuille de travail |
| 0080–0089 | W3 Visa, revue, concurrence |
| 0100–0109 | W4 Intégrité & locataire (préfixe `iso_`) |
| 0110–0119 | W5 Fiabilité & diagnostics |
| 0130 et suivants | COLONNE VERTÉBRALE, intégration du soir |

Nom de fichier : `00NN_<slug>.sql`. Un numéro réservé et non utilisé reste un trou, jamais réattribué.
