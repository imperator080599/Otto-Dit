# 10 — Test de falsification de l'hypothèse commerciale (D11 / A8)

**Ce qui est testé** : le beachhead (cabinets indépendants français + auditeurs de composants
européens de groupes cotés US), le prix par mandat, et l'acceptabilité du positionnement
« à côté du dossier » (D3). **Ce qui n'est pas testé** : le noyau multi-référentiel (D1) —
il tient, il a coûté peu, il reste quoi qu'il arrive.

**Cible** : 12 appels, cabinets indépendants inscrits CAC, 5 à 50 mandats, interlocuteur =
associé signataire (pas le service informatique).

| # | Question à poser telle quelle | Réponse qui CONFIRME | Réponse qui TUE |
|---|---|---|---|
| 1 | « Combien de mandats CAC signez-vous par an, et combien de collaborateurs travaillent sur la production ? » | ≥ 15 mandats et ≥ 3 collaborateurs en production | ≤ 8 mandats, ou production assurée à 100 % par l'associé |
| 2 | « Sur votre dernier contrôle du chiffre d'affaires : combien d'heures entre la sélection et la feuille de travail signée, et qui les passe ? » | ≥ 8 h par cycle, passées par un collaborateur | < 3 h, ou « on ne teste pas par sondage, on fait de l'analytique » |
| 3 | « Si les feuilles de travail arrivaient en PDF/Excel dans votre outil de dossier (RevisAudit, Caseware…) au lieu d'être saisies dedans, c'est acceptable ou rédhibitoire ? » | « Acceptable, on y colle déjà des Excel » | « Tout doit être natif dans l'outil du dossier » |
| 4 | « Vos clients déposent-ils déjà des pièces dans un portail ? Quel pourcentage arrive quand même par mail ? » | Portail déjà en usage, **ou** > 50 % par mail et ça les agace | « Le client refuse tout portail, on récupère sur place » |
| 5 | « Pour un outil qui prend en charge la boucle sélection → justificatifs → feuille de travail sur deux cycles, vous payez combien par mandat et par an — et qui signe ce chèque ? » | ≥ 300 €/mandat/an cité spontanément, décision de l'associé seul | < 150 €/mandat, ou « ça devrait venir de la CNCC / c'est gratuit ailleurs » |
| 6 | « Signez-vous des travaux de composant pour un groupe coté US (SOX 404) ? Si oui, l'outil de travail est-il imposé par le groupe ou libre ? » | Oui, ≥ 1 mandat, et outil libre | Non, **ou** « le groupe impose sa plateforme et ses instructions » |

## Seuils de décision (sur 12 appels)

| Signal | Seuil | Conséquence — à appliquer sans discussion |
|---|---|---|
| Q5 tue | ≥ 6/12 | Le prix par mandat est mort : repasser à un prix **par cabinet** et refaire le test avant toute dépense commerciale. |
| Q3 tue | ≥ 5/12 | D3 (sidecar) invalidé : la v2 doit viser le dossier lui-même, pas l'export — décision d'architecture, pas de marketing. |
| Q6 tue | ≥ 9/12, ou < 3 confirmations | **Bascule France-seul** : pack SOX gelé en l'état (contenu, zéro maintenance), aucun investissement GTM côté US. Le noyau et les moteurs ne bougent pas. |
| Q1 + Q2 tuent | ≥ 6/12 | Le segment est mal choisi (pas le wedge) : viser les cabinets 50+ mandats ou le mid-tier avant de re-tester. |
| Q4 tue | ≥ 8/12 | L'intake par portail est mort : l'intake mail devient le chemin principal, pas la roue de secours (et passe en tête de backlog). |

**Cas de passage** : ≥ 8/12 confirmations sur Q5 **et** Q3, quel que soit Q6 → on avance,
France d'abord, pack SOX conservé sans investissement commercial jusqu'à preuve d'un
acheteur indépendant.

**À enregistrer pour chaque appel** : date, cabinet, nombre de mandats, réponse brute aux
6 questions (verbatim, pas d'interprétation), et le montant cité en Q5. Le tableau de
dépouillement se remplit avant tout arbitrage — pas après.
