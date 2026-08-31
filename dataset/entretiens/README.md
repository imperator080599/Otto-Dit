# Entretiens synthétiques (ADR-108)

`transcript-revenus-2025.txt` — le transcript FICTIF de l'entretien du chef comptable
d'Altiverre sur le cycle ventes. Toute personne et tout propos sont inventés.

Le transcript embarque TROIS écarts voulus contre `dataset/processus/revenus_2025.json` :

1. **Omission de la documentation** — une revue analytique mensuelle du chiffre d'affaires
   contre le budget est décrite à l'oral et n'existe dans aucun contrôle documenté.
2. **Omission orale** — le contrôle documenté CP-02 (validation des avoirs > 5 000 €) n'est
   jamais évoqué.
3. **Contradiction** — CP-01 est documenté hebdomadaire ; l'entretien décrit une exécution
   mensuelle depuis l'été.

`dataset/fixtures/entretiens.json` porte le rejeu enregistré de l'analyse (clé : sha256 du
texte normalisé CRLF→LF + trim). Modifier le transcript invalide la clé : recalculer
l'empreinte et mettre la fixture à jour dans le même commit.
