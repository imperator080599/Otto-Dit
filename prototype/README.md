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

## Les trois espaces — le pilotage d'abord

| Espace | Contenu |
|---|---|
| **Pilotage** *(espace d'ouverture)* | où en est le dossier : cinq lectures graphiques, avancement, charge, obstacles, jalons |
| **Auditeur** | planification transverse + une section de travail par poste retenu au scoping |
| **Portail client** | contacts, paramétrage, vue client |

Un associé qui ouvre l'outil doit voir **l'état du dossier**, pas un écran de travail.

Le bandeau de seuils **n'est construit que dans l'espace auditeur** : le client ne voit pas
la matérialité parce que le composant n'existe pas chez lui (ADR-027). « Mes travaux » non plus :
elle porte les affectations, les statuts de revue et les visas de l'équipe.

## Ce qu'on y tape reste — et deux règles de format

**Persistance** (ADR-064). Tout l'état est écrit dans le navigateur à chaque geste, avec un indicateur
en bas à gauche et un bouton **« repartir de zéro »**. Un instantané pris sur une autre version du
fichier est **écarté** et l'écran le dit ; si le navigateur refuse le stockage (fenêtre privée), le
prototype fonctionne et affiche `NON ENREGISTRÉ`. Rien ne sort de l'appareil.

**Dates** (ADR-065). Aucun `<input type="date">` : ils s'affichent au format de la locale du
navigateur, si bien que `04/03` ne dirait ni le 4 mars ni le 3 avril. Toute saisie est un champ texte
**`JJ/MM/AAAA`**, et une date impossible est **refusée** — le champ se marque, la saisie fautive
reste visible, rien n'est écrit.

**Le parcours de démonstration est dans `DEMO.md`**, écran par écran avec la phrase à dire, et
`pw/parcours.mjs` le rejoue pour garantir que les chiffres cités sont ceux que le fichier produit.

## La navigation — par nature d'objet, un groupe à la fois

Le rail portait quarante-six destinations, dont **quinze sous « Planification »** : ce n'était plus
une phase mais un fourre-tout mêlant la mise en place de la mission, les données du dossier, la
planification, des procédures transverses et des sorties. Sept groupes désormais, chacun réunissant
des objets **de même nature** : Mission · Données du dossier · Planification · Travaux transverses ·
Bilan · Compte de résultat · Achèvement. La synthèse des anomalies et la piste d'audit sont passées
au Pilotage — ce sont des **états** du dossier, pas des travaux (ADR-058).

**Un seul groupe déployé**, et le rail **suit la destination courante**. Mesure, avant / après :

| | avant | après |
|---|---|---|
| destinations visibles au premier écran (1500 × 900) | 18 sur 46 | **13 sur 13** |
| hauteur du rail | 1 624 px | **436 px** |
| hauteur du rail à 390 px de large | 1 608 px | **436 px** |

**« Mes travaux » est la première entrée et l'écran d'ouverture** de l'espace auditeur (ADR-059) :
ce qui est à préparer — trié par échéance, puis par nombre d'obstacles — ce qui attend votre revue,
vos notes ouvertes, les visas que vous pouvez poser. Chaque ligne dit **ce qui la bloque** en toutes
lettres et porte le lien **direct vers le papier**. On ouvre sa liste, pas l'arborescence du dossier.

Le groupe des sections porte une **recherche** (nom, code, ou **numéro de compte** : `411` isole
« Clients ») et cinq filtres, dont **hors périmètre** — un poste sorti du scoping reste atteignable,
sans quoi on ne pourrait plus lire le motif de sa sortie (ADR-060).

## La section de travail (le cœur)

1. Comptes de la section — solde N, N-1, variation en valeur et en %, **deux indicateurs
   distincts** : position du compte / seuil de remontée (triage interne) et poids /
   seuil de planification (décision de périmètre). Statut « non significatif » proposé et
   surchargeable **avec motif obligatoire**. Revue analytique du poste, dans le sens du compte.
2. **Évaluation du risque par assertion** — facteurs observés (calculés) et déclarés
   (jugement), niveau calculé puis retenu, surcharge motivée. Le niveau **commande** la liste
   des procédures et la taille du tirage.
3. Sélections et paramètres — germe rejouable, strate exhaustive + tirage aléatoire, ou
   **sondage en unités monétaires**, ou **sélection exhaustive au seuil** quand la méthode
   l'impose. La **méthode** de chaque procédure est affichée là où elle s'exécute : objectif,
   **sens du test**, contrôle à opérer, ce qui compte comme exception, sources — toutes marquées
   UNVERIFIED.
4. Requêtes de la section — enchaînées ou saisies, avec destinataire et échéance.
5. Papiers de travail — une ligne, une pièce, un écart. Sans pièce déposée, aucun contrôle.
6. Notes de revue de la section — ancrées sur un objet.
7. Conclusion, visa et reprise N-1 — le visa est **impossible** tant qu'un obstacle subsiste.

## Le portail client — la dette, pas l'inventaire

Un client qui ouvre le portail doit voir **ce qu'il doit maintenant**. L'ordre par défaut n'est ni
celui de création ni celui des sections d'audit : **quatre rangs** — en retard · à rendre avant la
prochaine relance · ensuite · déjà déposées, **repliées en bas** — chacun trié par échéance
croissante, la dette chiffrée en tête (ADR-061).

Le seuil de « bientôt » **est la cadence de relance du portail**, pas un nombre choisi : ce qui rend
une demande visible dans ce rang est exactement ce qui déclenchera son rappel.

Le filtre porte sur le **domaine métier** — Ventes et clients, Achats et fournisseurs, Paie et
personnel… — **jamais sur le code de section d'audit**. « CLIENTS » et « CA » sont deux sections pour
nous ; pour la DAF, c'est un seul sujet. Un poste dont le domaine serait inconnu **empêche le
démarrage** : le filtre deviendrait silencieusement incomplet.

## Un testing entièrement déroulé — le chiffre d'affaires

Le test de détail du chiffre d'affaires est **exécuté de bout en bout dans l'état initial du
fichier** : 167 éléments sélectionnés, requête émise depuis le catalogue de preuve, 167 dépôts côté
client, états dérivés, 1 158 contrôles traités sans écart, **un écart expliqué, corroboré et
résolu**, **un écart de 4 850 € laissé au cumul**, une note de revue posée par le préparateur,
répondue et close par la réviseuse, travail achevé puis revu, papier **imprimable**.

Rien n'y est fabriqué : chaque étape passe par la **même fonction que le clic correspondant**. Si une
règle refusait une étape, l'amorce échouerait au lieu de produire un faux papier.

C'est aussi la seule section de démonstration : la chaîne « état vide → requête → dépôt → papier »
se vérifie, elle, sur les fournisseurs, où rien n'a été fait.

## Équipe et indépendance

Grade, rôle, courriel, dates d'entrée et de sortie, **exercices consécutifs sur le client**. On ne
retire pas quelqu'un qui porte une trace au dossier : il reçoit une date de sortie.

Déclaration d'indépendance par membre et par exercice, sept rubriques, **signée soi-même**, révisable
en empilant sans écraser. **Aucun travail n'est attribuable à qui n'a pas signé** — le système refuse
— et un travail attribué à quelqu'un dont la déclaration est devenue caduque **bloque le visa** de sa
section. Registre des services autres que la certification, avec ratio d'honoraires.

Tous les seuils de cet écran — rotation du signataire, familiarité, cadeaux, plafond du ratio, liste
des services interdits — sont des **paramètres déclarés marqués [UNVERIFIED]**.

## Le catalogue méthodologique — dans le dépôt, pas dans ce fichier

Les **56 procédures sur 15 cycles** ne vivent pas ici : elles vivent dans `methodology/`, en JSON
versionné et validé, et ce prototype les **intègre à la construction** (`prototype/src/build.sh`).
L'application charge le même catalogue par le même validateur. Une méthode enfermée dans une
démonstration se paie deux fois.

Chaque procédure porte son **sens de test** — sept valeurs, dont les deux symétriques
`gl_vers_piece` (réalité) et `piece_vers_gl` (exhaustivité). La **recherche de passifs non
enregistrés** est exécutable sur un extrait de l'exercice suivant : 60 décaissements, dont 29
règlent une dette régulièrement comptabilisée, 28 sont des charges de 2026, et **3 sont des passifs
non enregistrés**. La procédure relève **3 écarts, exactement ceux-là, et rien d'autre**.

Une procédure **cataloguée sans être exécutable ici** le dit, avec la raison et la population
attendue. Elle n'est jamais simulée. Il y en a 26 sur 56.

## Ajustements et retraitements

Le rapport d'impact d'une version dit **ce qui** a changé ; cette section dit **pourquoi**, écriture
par écriture — nature (écriture d'inventaire · retraitement · correction sur constat d'audit),
justificatif, auteur côté client, impact par poste et par masse.

Les corrections passées **en réponse à un constat d'audit** se réconcilient **automatiquement** avec
l'état des anomalies : à la prise en compte de la version 4, trois anomalies passent de « non
corrigée » à « corrigée » **sans aucune saisie**, et le cumul tombe de 123 130 € à 26 200 €. Une
correction partielle laisse le reste au cumul. Deux signaux distincts : *anomalie dite corrigée sans
écriture identifiée*, et *écriture de correction sans anomalie correspondante*. La plateforme pose
la question, elle ne tranche pas.

## Le registre des facteurs de risque

Ce qui circule entre les sections, ce ne sont pas des lignes de tableau : ce sont les
**constatations**. Un écart de rapprochement, une pièce datée hors exercice, une écriture
particulière relevée au test des écritures se posent **seuls** sur les postes qu'ils touchent,
avec un lien retour vers la procédure qui les a levés — et n'entrent dans aucun niveau de
risque tant qu'un humain n'a pas tranché. Un facteur non statué **bloque le visa**.

**Onze règles de levée : cinq quantitatives, six qualitatives.** Les qualitatives remontent depuis
des procédures qui les captent déjà — subjectivité des estimations (elle se *mesure* : la part du
poste portée par des comptes d'estimation), dépendance à un tiers unique, retraitement passé en cours
de mission, correction sur constat d'audit, anomalie relevée l'exercice précédent. Sur les facteurs
réellement levés : **neuf qualitatifs pour sept quantitatifs**.

Le reste est un **questionnaire résiduel** — six questions par section, quatre pour l'entité —
chacune portant *la raison pour laquelle aucune autre source du dossier n'y répond*. Une réponse
« oui » crée un facteur au registre, avec sa source. Une question sans réponse, ou un « oui » sans
précision écrite, **bloque le visa** : sinon le questionnaire serait décoratif.

Garde-fou : chaque règle porte un seuil de pertinence nommé et modifiable en cours de mission,
le compteur est au bandeau supérieur, et la vue de triage alerte au-delà de quinze —
**16 facteurs** au réglage par défaut, donc au-delà, et l'écran le dit. Une règle qui ne lève rien
sur ce jeu de données le dit, plutôt que d'abaisser son seuil jusqu'à trouver quelque chose.

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
| Vues rendues sans erreur | toutes, en clair et en sombre, à 1600 px et 390 px |
| Requêtes réseau hors `file://` | 0 |
| Erreurs JavaScript | 0 |
| Glyphes manquants / U+FFFD | 0 |
| Bandeau collant au repos / réduit | 294 px → **47 px** (5,6 % de l'écran) dès le premier défilement, rétabli en remontant, sans dérive du contenu |
| Destinations visibles au premier écran du rail / hauteur du rail | **13 / 13 · 436 px** (avant : 18 / 46 · 1 624 px) |
| Champs de date au format du navigateur (`type="date"`) | **0** |
| État perdu à un rafraîchissement | **0** — tout est réécrit, et le parcours de démonstration se retrouve où il en était |
| Harnais passés sur ce fichier | **34**, zéro échec, zéro plantage — `prototype/pw/`, rejouables : `sh tout.sh ../otto-prototype.html` |
| Compteurs de design (rayons / couleurs hors jeton / tailles / espacements hors échelle) | **2 / 0 / 5 / 0** |
| Couleurs employées dans les graphiques, hors jetons du système | **0**, dans les deux thèmes |
| Contenu perdu à l'impression d'un panneau replié | **0** — les panneaux s'ouvrent à `beforeprint` |
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
