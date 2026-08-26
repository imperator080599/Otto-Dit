# prototype/pw — les harnais du prototype

Trente-quatre harnais Playwright qui s'exécutent **sur le fichier livré**, `otto-prototype.html`.
Ils ne testent pas des fonctions isolées : ils ouvrent la page, cliquent, saisissent, mesurent le
rendu, et **relèvent la moindre requête réseau et la moindre erreur JavaScript**. C'est ce qui rend
opposable la phrase « prototype déterministe, aucun appel modèle ».

```sh
cd prototype/pw
npm i -D playwright            # une fois ; le navigateur vient de l'environnement
sh tout.sh ../otto-prototype.html
```

`tout.sh` rend une ligne par harnais et sort en **échec** si l'un d'eux relève un `ÉCHEC`, un
plantage, une `TypeError` ou une `ReferenceError`. Un harnais isolé se lance de la même façon :
`node rail.mjs ../otto-prototype.html`.

`_nav.mjs` trouve le navigateur : `OTTO_CHROMIUM` s'il est posé, sinon le premier Chromium sous
`PLAYWRIGHT_BROWSERS_PATH`, sinon la résolution par défaut de Playwright.

## Ce que chacun garde

| Harnais | Ce qu'il empêche de casser |
|---|---|
| `smoke2` | toute destination s'ouvre, dans les trois espaces, sans erreur ni réseau |
| `verif` | les pieds de tableau sont la somme de leur colonne ; les seuils sont recalculés |
| `lot1rep`, `lot2v`, `lot3je`, `lot4` | répartition proposée · versions et impact · test des écritures · achèvement |
| `lisi`, `haut`, `bandeau`, `mob`, `theme` | lisibilité : destinations, hauteurs, bandeau collant, 390 px, les deux thèmes |
| `sond`, `sond2` | sondage : strate exhaustive, unités monétaires, garde-fou d'exhaustivité |
| `chaine2`, `deroule` | la chaîne règle → requête → dépôt → papier → écart → synthèse, entièrement déroulée |
| `couv`, `couv2`, `toutes` | couverture : aucune vue laissée sans rendu, aucun glyphe manquant |
| `doubl`, `libelles` | pas de titre en double dans une vue ; pas deux libellés de navigation confondables |
| `design` | rayons, couleurs hors jeton, tailles, espacements hors échelle ; zéro couleur dans les graphiques |
| `perf` | latence de frappe |
| `cat2` | le catalogue engendré est celui de `methodology/`, prédicats déclarés compris |
| `equipe`, `jalons`, `qualitatif` | indépendance et affectation · jalons et échéances · questionnaire résiduel |
| `ajust`, `graphes`, `final` | ajustements et retraitements · graphiques à l'encre · état final du dossier |
| `rail` | partition par nature, **un seul groupe déployé**, « Mes travaux », recherche et filtres, mesure des hauteurs |
| `portail` | le portail s'ouvre sur la **dette**, filtre par domaine métier, règle des jours ouvrés |
| `dates` | **zéro `type="date"`** dans le fichier, aucune date non formatée à l'écran, et une date impossible refusée plutôt que devinée |
| `persist` | l'état survit à un rafraîchissement, y compris les gestes qui ne re-rendent rien ; un instantané d'une autre version est écarté ; le stockage refusé est **dit**, pas tu |
| `parcours` | **DEMO.md dit vrai** : le parcours de démonstration est rejoué étape par étape et chaque chiffre cité est comparé |

## Ce qu'ils ne prouvent pas

Rien sur la fiabilité de l'extraction, rien sur un modèle, rien sur des pièces réelles : le
prototype n'appelle aucun modèle. Voir STATUS.md, « Prouvé par exécution vs prouvé par test ».
