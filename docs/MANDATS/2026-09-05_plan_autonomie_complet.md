# OTTO — Plan exécutable en autonomie complète

Ce document remplace les mandats quotidiens. Il est écrit pour être exécuté **sans aucune
interaction**, par un modèle d'exécution, sur plusieurs jours. Tout ce qui demandait un arbitrage
est arbitré ici.

## 0. Ajout du 6 septembre, mesuré à l'instant avant déconnexion du fondateur

Sur `/api/sante` : SHA servi `590c3015…` (hash complet renvoyé — à rapprocher du `HEAD` de `main`),
`identiteCoherente: true`, **toutes les lectures passent** (26 vérifications), une seule lecture vide
et attendue (re-tirage). C'est rassurant sur la cohérence interne du bundle servi.

**Ce que ça ne prouve pas** : que ce SHA est bien le dernier poussé. Le 3 septembre, un push
(`62b7064`) est resté des heures sans se déployer pendant qu'`e004053` restait servi (voir
`OTTO_Mandat_Semeur.md`, §0) — exactement le genre d'écart qu'un agent ne peut pas voir depuis son
propre bac à sable (§A.2, point 3 ci-dessous). Avant de faire confiance à un Lot 1 qui se déclarerait
terminé cette nuit, quelqu'un (humain, ou la garde de D.0-5 une fois construite) doit comparer le SHA
ci-dessus au dernier commit de `main`. Si c'est déjà l'écart d'aujourd'hui, le dire dans l'écran de
fin de lot plutôt que de le découvrir demain.

---

# Partie A — Ce qui rend l'autonomie possible, et ce qui l'empêche

## A.1 La réponse honnête sur le modèle

**Ce n'est pas la puissance du modèle qui a porté la qualité de ce projet.** Ce sont trois
mécanismes que l'agent a lui-même construits : le sous-agent hostile, les gardes éprouvées par un
refus observé, et les mesures rattachées à un SHA. Sept ou huit fois, un instrument a mesuré à côté
du défaut qu'il existait pour attraper — et **chaque fois, c'est la revue hostile ou la CI qui l'a
vu, jamais la boucle principale**. La qualité vient du dispositif, pas de l'intuition.

Conséquence directe : **un modèle d'exécution peut tenir ce projet, à condition que le plan ne lui
demande jamais de décider ce qu'il faut faire.** Ce qui est fragile en autonomie longue, ce n'est
pas d'écrire du code — c'est de trancher une ambiguïté, de juger qu'une mesure ment, et de ne pas
déclarer fait ce qui ne l'est pas.

**La répartition à retenir :**

- **Modèle le plus fort disponible** — pour la revue hostile de chaque tranche, et pour toute
  tranche qui touche l'architecture (modèle de données, natures de test, packs). C'est là que le
  jugement paie.
- **Sonnet** — pour l'exécution des tranches spécifiées dans ce document. Chacune nomme ses tables,
  ses colonnes, ses routes, ses codes de refus et son épreuve d'acceptation. Il n'y a rien à
  inventer.
- **Le sous-agent hostile reste obligatoire à chaque tranche, quel que soit le modèle.** Sans lui,
  la qualité de ce projet s'effondre — c'est le constat empirique de neuf jours.

## A.2 « Zéro interaction jusqu'à un produit presque fini » — ce qui est vrai et ce qui ne l'est pas

**Ce qui est atteignable :** zéro **décision** de ta part. Ce document pré-tranche tout ce qui
demandait ton avis, y compris le vocabulaire, la densité et les natures de test.

**Ce qui ne l'est pas :** zéro **lecture**. Trois choses restent hors de portée d'un agent seul —
et ce n'est pas une question de modèle :

1. **Ton goût.** « Épuré, qu'un auditeur lambda comprenne » n'a pas de test automatique. J'ai
   contourné en écrivant une épreuve mécanique (§D.6) qui en capture l'essentiel, mais le verdict
   final t'appartient.
2. **Les gestes irréversibles.** Bascule `DATABASE_URL`, activation de l'IA vivante, dépense. Ils
   restent interdits, préparés et jamais exécutés.
3. **La vérification que le déployé correspond au poussé.** L'agent ne peut pas atteindre son propre
   déploiement depuis son bac à sable. La garde de §D.0 y supplée, mais quelqu'un doit lire le
   verdict.

**Le rythme réaliste** : des lots de 24 à 48 heures, chacun se terminant par un écran engendré que
tu lis en trois minutes. Pas de question, pas de choix — un constat. Si tu ne le lis pas, l'agent
continue quand même : le lot suivant est déjà écrit ici.

---

# Partie B — Le cycle de testing complet, spécifié

C'est la spécification la plus importante du document. Elle décrit ce qui manque aujourd'hui **et**
elle referme R37 : aujourd'hui, aucun chemin ne crée une demande client.

## B.1 Le principe

> **Une colonne de test est liée à un type de pièce. Un type de pièce est lié à une demande.**
> Ajouter une colonne engendre donc une demande.

C'est « la méthode nomme, le code calcule » appliqué à la preuve.

## B.2 Le déroulé, dans l'ordre, sur chaque section de test à échantillon

**Étape 1 — Le détail du compte.** La section s'ouvre sur le détail des comptes du poste :
l'extraction que le client doit fournir (détail clients, détail fournisseurs, détail des
immobilisations…). Un **bouton unique** : *« Demander le détail du compte »* — il crée la demande
client, pré-remplie, destinataire déduit des contacts, type de pièce `detail_de_compte`, comptes
visés listés. Un **lien cliquable** conduit à cette demande dans l'espace de demandes, pour
l'ajuster.

**Étape 2 — Le rapprochement.** Le détail reçu se rapproche du solde de la balance générale,
compte par compte, **au centime**. L'écart, s'il existe, est **dit** et doit être expliqué.

> **Refus `POP-01` : on ne tire pas un échantillon sur une population qui n'est pas rapprochée.**
> Tirer sur un détail dont le total ne fait pas le solde est l'un des reproches les plus fréquents
> en inspection. La population n'est ouverte au tirage qu'une fois le rapprochement conclu.

**Étape 3 — La population.** Elle est **dérivée** du détail rapproché : nombre de lignes, total,
version d'import, empreinte. Jamais saisie.

**Étape 4 — Le tirage.** Inchangé — strate exhaustive au seuil de performance non modulé, unités
monétaires, germe. Le tirage initial devient **un geste humain cliquable**, ce qu'il n'est pas
aujourd'hui.

**Étape 5 — Les pièces, et leurs demandes.** Pour chaque type de pièce que la procédure exige
(facture, bon de livraison, contrat, relevé…), un **bouton en un clic** crée la demande
correspondante — par ligne d'échantillon, et **en lot pour tout l'échantillon**. Chaque pièce
demandée porte un **lien vers sa demande** dans l'espace de demandes.

**Étape 6 — La grille, à deux niveaux d'en-tête.**

```
│      FACTURE (evidence_type: invoice)      │   BON DE LIVRAISON (delivery_note)   │
│ n° · date · client · montant HT · TVA      │ n° · date · quantité · signature     │
```

Le premier niveau est le **type de pièce** ; le second, les **données à y trouver**. Chaque colonne
sait de quelle pièce elle provient.

**Étape 7 — La colonne ajoutée à la main.** L'auditeur ajoute une colonne, choisit la donnée et
**le type de pièce qui la porte**. Si ce type n'a pas encore de demande sur cet échantillon, la
plateforme **propose de la créer**, en un clic, par ligne ou en lot. C'est exactement le cas que le
fondateur a décrit, et c'est le test d'acceptation de toute cette partie.

## B.3 Le modèle de données, nommé

- `evidence_type` — **donnée de pack** : `code`, libellé par locale, champs qu'il porte
  (`field_code`, libellé, type, règle de tolérance par défaut), et le gabarit de demande associé.
- `test_column` — `grid_id`, `evidence_type_code`, `field_code`, libellé, tolérance, `origine`
  (`pack` | `ajoutee_par`), `ajoutee_par_user_id`, `ajoutee_le`.
- `client_request` — gagne `evidence_type_code`, `sample_line_id` (nullable : une demande peut viser
  la population entière), `origine` (`derivee_de_colonne` | `manuelle`), et `procedure_instance_id`.
- `account_detail_import` — le détail fourni, importé **comme pièce** (empreinte, provenance,
  journal), avec son rapprochement au solde et l'état de cet écart.
- `population` — dérivée du détail rapproché ; porte `account_detail_import_id`, le compte de
  lignes, le total, et l'état `rapprochee` qui commande `POP-01`.

## B.4 Les refus à voir

| Code | Refus |
|---|---|
| `POP-01` | tirer sur une population non rapprochée |
| `POP-02` | rapprocher sans expliquer un écart non nul |
| `REQ-01` | créer une demande sans destinataire ni type de pièce |
| `REQ-02` | conclure une ligne dont une colonne exige une pièce qui n'a jamais été demandée |
| `COL-01` | ajouter une colonne sans dire de quelle pièce vient la donnée |

`REQ-02` est le plus important : il rend impossible de conclure sur une preuve qu'on n'a jamais
demandée.

---

# Partie C — Les autres postes, et les natures de test

## C.1 Le principe

Le produit ne connaît aujourd'hui **qu'une seule façon de tester** : sonder des pièces. C'est ce qui
bloque tous les autres postes. La généralisation est petite et structurante :

> **La nature du test est une donnée du pack. La page de poste rend l'atelier de la nature.**

`procedure_instance` gagne `nature`. Huit natures suffisent à couvrir un dossier :

| Nature | Population | Preuve | Ce qui fait exception | Exemple de poste |
|---|---|---|---|---|
| `sondage_pieces` | détail rapproché | pièce du client | écart hors tolérance | chiffre d'affaires, achats |
| `recalcul_parametre` | base × paramètres | fichier de calcul + justificatif des paramètres | écart de recalcul, paramètre non justifié | amortissements, provisions, charges à payer, paie, impôt |
| `confirmation_externe` | listing des tiers | réponse du tiers | non-réponse, écart, tiers non couvert | banques, avocats, clients |
| `revue_analytique_substantive` | agrégat | attente posée **avant** de voir le réalisé, seuil | variation au-delà du seuil non expliquée | produits, charges de personnel |
| `test_exhaustif` | population entière | règle déterministe | toute ligne qui rompt la règle | écritures, lettrage, cut-off |
| `tests_de_controles` | occurrences du contrôle | preuve d'exécution | déviation, taux au-delà du tolérable | cycles avec appui sur les contrôles |
| `rapprochement` | deux sources | les deux états | différence non expliquée | trésorerie, comptes de liaison |
| `observation_documentee` | l'événement | notes, photos, comptages | écart de comptage | inventaire physique |

**Chaque nature a son atelier** : ce qu'elle demande au client, ce qu'elle affiche, ce qui y
constitue un écart, et ce que le papier doit montrer. Le sondage sur pièces existe ; les sept autres
se construisent sur le même squelette.

## C.2 Ce que l'agent a le droit de chercher — et ce qu'il n'a pas le droit d'inventer

Il **peut** rechercher, y compris en ligne, quelles procédures d'audit sont usuelles pour chaque
poste et les décrire dans le catalogue méthodologique.

Il ne **peut pas** :

- écrire un seuil, un taux, une durée, une taille d'échantillon, un facteur statistique ou une
  référence normative **de mémoire**. Toute valeur de ce genre devient une ligne de pack
  `verifie:false`, `source_text` vide, affichée « paramètre non vérifié — à fixer par le cabinet » ;
- affirmer qu'une procédure est **exigée** par une norme sans avoir le texte primaire. Il écrit
  « usuelle » et laisse la qualification au cabinet ;
- inventer un cas dans le jeu de démonstration qui ferait passer une capacité pour prouvée.

## C.3 Les postes à ouvrir, par ordre de valeur

1. **Trésorerie** — `confirmation_externe` + `rapprochement`. Le plus démonstratif après le CA, et
   les circularisations existent déjà.
2. **Clients** — `sondage_pieces` + `confirmation_externe` + balance âgée (existe) + encaissements
   postérieurs.
3. **Immobilisations** — `recalcul_parametre` (amortissements) + `sondage_pieces` (acquisitions).
4. **Fournisseurs et charges** — `sondage_pieces` + `test_exhaustif` (cut-off, factures non
   parvenues).
5. **Paie** — `recalcul_parametre` + `revue_analytique_substantive`.
6. **Provisions** — `recalcul_parametre` + `confirmation_externe` (avocats).
7. **Stocks** — `observation_documentee` + `recalcul_parametre` (valorisation).
8. **Capitaux propres et impôt** — `rapprochement` + `recalcul_parametre`.

**Chaque poste ouvert doit l'être complètement** : leadsheet N/N-1, revue analytique, procédures
commandées par le risque, atelier de sa nature, papier, écarts. Un poste ouvert à moitié est pire
qu'un lien mort — le lien mort, lui, est honnête.

---

# Partie D — Le plan d'exécution

## D.0 Les invariants, qui priment sur tout

1. **Un état que seul le semeur peut produire n'est pas une fonctionnalité. C'est un décor.**
   Chaque tranche met à jour `docs/SEMEUR_VS_CHEMIN.md`, engendré, et **ne peut pas se déclarer
   finie si elle ajoute un décor**.
2. **Une garde qui n'a jamais rien refusé n'est pas une garde.** Le refus est **observé**, pas
   déclaré. Un balayage de texte ne prouve rien.
3. **Toute règle nomme où elle cesse de regarder**, dans un champ `stops_looking`.
4. **Le compte rendu est engendré, jamais rédigé** : tableau des preuves depuis les sorties réelles
   avec leur SHA ; constats hostiles depuis un fichier de données ; commandes de `verify` non
   exécutées **nommées comme telles**. La prose ne peut énoncer aucun chiffre que le script n'a pas
   produit.
5. **Après chaque pousse, le SHA servi doit devenir le SHA poussé** dans un délai borné, sinon la CI
   rougit. Une tranche non déployée n'existe pas.
6. **Plafond L2** : le modèle propose, un humain valide, rien de généré n'entre au dossier sans
   validation tracée.
7. **Sous-agent hostile à chaque tranche**, sur le modèle le plus fort disponible, constats
   énumérés avec identifiant et SHA.
8. **En cas de doute, faire la chose plus petite et l'écrire au registre.** Ne jamais élargir une
   tranche pour « bien faire ».

## D.1 Ordre des lots

Chaque lot se termine par un écran engendré. L'agent enchaîne sans attendre de réponse.

**Lot 1 — Réparer avant d'ajouter**
`R37` (l'écran annonce une demande qu'il n'a pas créée — défaut d'intégrité documentaire, premier
correctif) · `R41` (l'IPE absent du papier rédigé — **deux tentatives ont déjà échoué** ; la
troisième pose d'abord un cas connu mauvais, avant de toucher au code, et ne se déclare pas finie
tant que ce cas connu ne passe pas) · `R40` (`requireMember` ne filtre pas
`exited_on`) · la garde de déploiement (D.0-5 — **commencer par comprendre pourquoi le SHA servi n'a
pas suivi le dernier push le 3 septembre avant de construire la garde** ; une garde posée sur un
pipeline encore cassé ne fait que rougir en boucle sans rien réparer) · le compte rendu engendré
(D.0-4) · `SEMEUR_VS_CHEMIN.md` engendré, avec le compte des décors restants.

**Lot 2 — Le cycle de testing complet** (Partie B en entier) : détail de compte, rapprochement,
`POP-01`, population dérivée, tirage cliquable, demandes en un clic par pièce, grille à deux niveaux
d'en-tête, colonne ajoutée qui engendre sa demande, les cinq refus.
*Ce lot referme à lui seul cinq décors : demandes client, tirage initial, population, taille, détail
de compte.*

**Lot 3 — Les natures de test** (Partie C.1) : `nature` sur `procedure_instance`, et les ateliers de
`recalcul_parametre`, `confirmation_externe`, `rapprochement`. Les trois suivants au lot 5.

**Lot 4 — L'épure** (Partie D.6) et les écrans qui manquent : re-tirage avec sa règle,
déplanification d'une procédure, création de dossier de bout en bout.

**Lot 5 — Les postes** (Partie C.3), dans l'ordre donné, **complets un par un**. Un poste par
tranche. Les natures restantes se construisent quand un poste les demande.

**Lot 6 — La crédibilité en inspection** : test des écritures (NEP 240) réduit à sa colonne
vertébrale ; registre des anomalies (factuelle, de jugement, extrapolée ; projection ; corrigées et
non corrigées ; évaluation contre la matérialité) ; revue analytique périmée qui bloque le visa.

**Lot 7 — L'espace de demandes au niveau du marché** et le cycle de vie du constat client.

**Lot 8 — Préparer sans activer** : IA vivante (garde de budget **en base** d'abord, chemin fermé
par défaut, aucune clé au dépôt) ; `PLAN_RLS` étapes 1 et 2, jamais 3.

## D.6 L'épreuve de l'épure, mécanisée

Puisque « épuré » ne se teste pas, voici ce qui le teste :

- **Aucun identifiant technique en première position** d'un message vu par un auditeur. Le refus dit
  la chose en français ; le code vient après, en petit. Un test échoue si un message commence par
  un code.
- **Le rail n'ouvre par défaut que les groupes portant du travail** sur ce dossier ; un test compte
  les destinations visibles au premier rendu et échoue au-delà d'un plafond.
- **Une page de poste n'ouvre par défaut que les sections portant du contenu.**
- **Tout compteur affiché conduit quelque part** : un test échoue sur un compteur sans lien.
- **Aucun état vide muet** : toute section vide porte une phrase qui dit quoi faire et le geste
  proposé.
- **Un parcours cliqué « découverte »** : sans lire le rail, atteindre ses travaux, comprendre ce
  qui empêche de signer, conclure une ligne d'échantillon. Chaque étape mesure le nombre de clics et
  échoue au-delà du plafond fixé.

## D.7 Ce qui reste interdit

Étape 3 de `PLAN_RLS`. Activation de l'IA vivante. Modification de `DATABASE_URL`. Toute dépense.
Re-semer la démonstration publique. Toute donnée réelle. Tout service payant. Tout envoi réel.

## D.8 Le rendu de fin de lot

Un écran engendré : l'URL et le **SHA servi mesuré** · ce qui est nouvellement cliquable · le compte
de **décors restants** dans `SEMEUR_VS_CHEMIN` · ce qui n'est pas fait · « non prouvé » transcrit
par le script · les constats hostiles calculés · les commandes de `verify` non exécutées, nommées ·
et le parcours de découverte avec ses clics mesurés.
