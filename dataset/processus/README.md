# Descriptions structurées de processus (ADR-108)

Le processus ne se dessine pas : il se DÉCRIT en données, et le diagramme est généré.
Un fichier JSON par version (N-1, N), importé sur l'écran « Contrôle interne et
processus ». Tout est synthétique et fictif, comme le reste du jeu de données.

## Format

```json
{
  "cycle": "REVENUE",
  "nom": "Cycle ventes — de la commande à l'encaissement",
  "etapes": [
    { "code": "CMD", "libelle": "…", "acteur": "…", "systeme": "…",
      "entrees": "…", "sorties": "…" }
  ],
  "controles": [
    { "code": "CP-01", "etape": "CMD", "libelle": "…",
      "frequence": "…", "proprietaire": "…" }
  ]
}
```

- `code` est STABLE d'une version à l'autre : la différence N/N-1 s'apparie dessus.
- `etape` d'un contrôle doit exister dans `etapes` (refusé sinon, en nommant le contrôle).
- L'ordre des étapes dans le fichier n'est pas un changement.

## Les deux fichiers livrés

- `revenus_2024.json` — la version N-1 (reprise du dossier précédent).
- `revenus_2025.json` — la version N, qui porte CINQ changements voulus, un de chaque
  espèce : étape ajoutée (EDI), étape supprimée (REL — la relance passe dans le module),
  système remplacé (FAC : saisie manuelle → module Facturation), propriétaire de contrôle
  changé (CP-01 : Théo Girard → Nadia Bellec), fréquence de contrôle changée (CP-03 :
  mensuelle → trimestrielle).
