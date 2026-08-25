# Prototype cliquable du noyau déterministe

`otto-prototype.html` — un fichier, aucune installation, aucun compte, aucun serveur.
Ouvrez-le dans un navigateur, y compris sur téléphone.

## Ce que c'est

Le **noyau déterministe** d'OTTO rendu manipulable : onze modules d'audit dont chaque
chiffre est réellement calculé en JavaScript dans la page, à partir de données embarquées.
Rien n'est écrit en dur — ni un total, ni un pourcentage, ni une conclusion.

- **Zéro appel modèle.** Aucune requête réseau, aucune clé, aucun texte pré-rédigé se
  faisant passer pour une sortie de modèle. Vérifié : l'onglet réseau ne montre que le
  fichier lui-même.
- **Le grand livre est engendré dans la page** par un générateur à germe fixe
  (mulberry32) : 1 605 écritures, 3 210 lignes, chaque écriture équilibrée. La balance
  affichée est **calculée à partir de ces écritures**, pas saisie à côté. Les deux seuls
  écarts balance/FEC (411000 +25 000 €, 706000 −25 000 €) sont voulus et documentés.
- **Les seuils pilotent tout.** Déplacez le curseur de matérialité : le scoping, la revue
  analytique, la couverture d'échantillon, le tri des anomalies et la conclusion se
  recomposent sous vos yeux.

## Contrôles automatisés passés sur ce fichier

| Contrôle | Résultat |
|---|---|
| Pieds de tableau = somme de leur colonne | 7/7 exacts |
| Écritures déséquilibrées | 0 sur 1 605 |
| Grand livre : total débit = total crédit | 30 123 073,62 € = 30 123 073,62 € |
| Balance client équilibrée | 30 148 073,62 € = 30 148 073,62 € |
| Comptes en écart balance/FEC | 2, tous deux voulus |
| M / SP / seuil de remontée recalculés depuis la référence | exact au centime |
| Citations des modules littérales du document d'idées | 12/12 |
| Requêtes réseau hors `file://` | 0 |
| Erreurs JavaScript | 0 |
| Glissement du curseur au doigt, sept indicateurs visibles sur téléphone | conforme |

## Limites

Voir la section « frontière déterministe / modèle » en bas de la page, et les réserves
listées dans STATUS.md. Toutes les données sont **synthétiques** : Altiverre SAS, son
SIREN, ses tiers et ses pièces sont fictifs.
