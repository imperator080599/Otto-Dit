# Pièces neuves — jamais vues du système (mode IA réelle, ADR-105)

Chaque fichier se dépose AU PORTAIL CLIENT, sur la ligne indiquée (la demande de
pièces la nomme par sa référence). Puis, côté auditeur : écran « Contrôle sur pièces
(testing) » → « Run extraction ladder » (le modèle lit — le coût s'affiche) →
attester la lecture dans l'atelier → « Run vouching (L0) » → l'écart attendu se lève.
Aucune de ces pièces n'est dans le cache de rejeu : en mode rejeu (`npm run demo`),
elles tombent honnêtement à l'échelon humain.

| Fichier | Ligne visée (portail) | Nature | Ce qui doit se passer |
|---|---|---|---|
| BL-neuf-FA2025-0702.pdf | FA2025-0702 — Groupe Immovance SA — 36 800,00 EUR | piege-quantite | quantité livrée 113 < facturée 128 (tolérance 0) → écart de quantité au vouching |
| BL-neuf-FA2025-0706.pdf | FA2025-0706 — Promoteurs du Forez SA — 36 330,00 EUR | piege-signature | AUCUNE règle machine ne lit les signatures aujourd'hui (contenu de catalogue, périmètre gelé) : ce piège se voit à l'ŒIL, dans la visionneuse — pas en exception |
| FA-neuve-FA2025-0704.pdf | FA2025-0704 — Bâtiplace SARL — 36 168,00 EUR | normale-scan | lecture par le MODÈLE (scan, aucune couche texte) → attestation → vouching sans écart |
| FA-neuve-FA2025-0703.pdf | FA2025-0703 — Constructions Peyrelle SAS — 34 734,00 EUR | normale-texte | lecture par la COUCHE TEXTE (déterministe, gratuite) — l'échelle ne paie que quand il faut |
| FA-neuve-FA2025-0708.pdf | FA2025-0708 — Tertiaire Bâtir SAS — 32 160,00 EUR | piege-montant | montant imprimé 32 803,20 EUR ≠ écriture 32 160,00 EUR → écart de montant au vouching |
| FA-neuve-FA2025-0707.pdf | FA2025-0707 — Menuiseries Chartier SAS — 31 625,00 EUR | piege-date | facture datée 2026 sur un produit 2025 → écarts de date et de rattachement (cut-off) |
| FA-neuve-FA2025-0705.pdf | FA2025-0705 — Habitat Confluence SAS — 30 914,00 EUR | degradee | scan dégradé (photo, rotation, bruit) — le modèle lit ce qu'il peut, s'abstient sinon ; un champ non lu vaut mieux qu'un champ faux |

Vérité champ par champ : `verite.json` (sert à `npm run eval:pieces-neuves`, qui mesure
coût, latence et taux de champs corrects sur CES pièces).

Toutes les données sont fabriquées et marquées SPECIMEN.
