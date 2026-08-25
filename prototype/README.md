# Prototype cliquable — organisé par section d'audit

`otto-prototype.html` — un fichier, aucune installation, aucun compte, aucun serveur.
Ouvrez-le dans un navigateur, y compris sur téléphone.

## Ce que c'est

Le noyau déterministe d'OTTO, **rangé comme un auditeur travaille** : on ouvre une section —
le chiffre d'affaires — et on y enchaîne comptes, risque, procédures, sélections, requêtes,
papiers de travail, notes de revue et conclusion. Les moteurs sont partagés (ADR-026) ;
c'est la navigation qui suit le travail.

**Zéro appel modèle.** Aucune requête réseau, aucune clé, aucun texte pré-rédigé imitant une
sortie de modèle. Chaque chiffre est calculé dans la page à partir d'un grand livre engendré
à germe fixe (1 605 écritures, 3 210 lignes) dont la balance affichée est dérivée.

## Les trois espaces

| Espace | Contenu | Teinte |
|---|---|---|
| **Auditeur** | planification transverse + une section de travail par poste retenu au scoping | bleu |
| **Portail client** | contacts, paramétrage, vue client | vert |
| **Pilotage** | avancement, exports, notes de revue transverses | ambre |

Le bandeau de seuils **n'est construit que dans l'espace auditeur** : le client ne voit pas
la matérialité parce que le composant n'existe pas chez lui (ADR-027).

## La section de travail (le cœur)

1. Comptes de la section — solde N, N-1, variation en valeur et en %, **deux indicateurs
   distincts** : position du compte / seuil de remontée (triage interne) et poids /
   seuil de planification (décision de périmètre). Statut « non significatif » proposé et
   surchargeable **avec motif obligatoire**. Revue analytique du poste, dans le sens du compte.
2. **Évaluation du risque par assertion** — facteurs observés (calculés) et déclarés
   (jugement), niveau calculé puis retenu, surcharge motivée. Le niveau **commande** la liste
   des procédures et la taille du tirage.
3. Sélections et paramètres — germe rejouable, strate exhaustive + tirage aléatoire.
4. Requêtes de la section — enchaînées ou saisies, avec destinataire et échéance.
5. Papiers de travail — une ligne, une pièce, un écart. Sans pièce déposée, aucun contrôle.
6. Notes de revue de la section — ancrées sur un objet.
7. Conclusion, visa et reprise N-1 — le visa est **impossible** tant qu'un obstacle subsiste.

## Le registre des facteurs de risque

Ce qui circule entre les sections, ce ne sont pas des lignes de tableau : ce sont les
**constatations**. Un écart de rapprochement, une pièce datée hors exercice, une écriture
particulière relevée au test des écritures se posent **seuls** sur les postes qu'ils touchent,
avec un lien retour vers la procédure qui les a levés — et n'entrent dans aucun niveau de
risque tant qu'un humain n'a pas tranché. Un facteur non statué **bloque le visa**.

Garde-fou : chaque règle porte un seuil de pertinence nommé et modifiable en cours de mission,
le compteur est au bandeau supérieur, et la vue de triage alerte au-delà de quinze.
**8 facteurs** au réglage par défaut ; le seuil est un levier monotone (la règle « direction »
passe de 1 facteur à 5 % à 10 facteurs à 1 %). Une règle qui ne lève rien sur ce jeu de
données le dit, plutôt que d'abaisser son seuil jusqu'à trouver quelque chose.

## Contrôles automatisés passés sur ce fichier

| Contrôle | Résultat |
|---|---|
| Pieds de tableau = somme de leur colonne (toutes vues) | 25/25 exacts |
| Écritures déséquilibrées | 0 sur 1 605 |
| Grand livre : débit = crédit | 30 123 073,62 € = 30 123 073,62 € |
| Balance client équilibrée | 30 148 073,62 € = 30 148 073,62 € |
| Comptes en écart balance/FEC | 2, tous deux voulus |
| M / SP / seuil de remontée recalculés | exacts au centime |
| Citations littérales du document d'idées | 11/11 |
| Vues rendues sans erreur | 22/22 |
| Requêtes réseau hors `file://` | 0 |
| Erreurs JavaScript | 0 |
| Glyphes manquants / U+FFFD | 0 |
| Barre collante sur iPhone 13 | 293 px sur 844 · 3 seuils et 8 indicateurs visibles sans défilement |
| Latence de frappe | 3,5 ms par touche |

Chaînes vérifiées de bout en bout : risque → procédures → échantillon ; règle → requête →
portail → dépôt → papier → synthèse ; note bloquante → visa impossible ; auteur ≠ clôtureur.

## Lot 2 (non livré)

Analyse sectorielle, parties liées, LCB-FT, pointage des états financiers, export paramétrable
fin. Ces sections **affichent leur structure et ce qui leur manque** ; aucun résultat n'est
inventé.

## Limites

Voir la section « Déterministe / modèle » en bas de l'espace auditeur, et les réserves de
STATUS.md. Toutes les données sont **synthétiques** : Altiverre SAS, son SIREN, ses tiers et
ses pièces sont fictifs.
