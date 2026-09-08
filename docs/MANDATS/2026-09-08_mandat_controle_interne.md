# OTTO — Mandat du fondateur : le contrôle interne (D&I, OE), et le suivi de mission

Dicté par le fondateur le 8 septembre 2026. Commité verbatim au dépôt selon la règle 33.
**Le contenu métier de ce mandat vient d'un auditeur praticien. L'agent ne le « complète » pas de
mémoire** : toute valeur non dictée ici est un paramètre de pack `verifie:false`, affiché
« paramètre non vérifié — à fixer par le cabinet ».

---

## 0. Où ce mandat se place

Il ouvre un **nouveau lot**, à exécuter **après la clôture du Lot 4 en cours**, et **avant le Lot 5
(les postes)**. Il prime sur la suite du plan d'autonomie, dont l'ordre reste valable derrière lui.

Raison, dite franchement : les huit dernières tranches ont fermé de la dette et affiné l'épure —
travail juste, mais qui laisse le compte de `SEMEUR_VS_CHEMIN` plat. Ce lot ajoute de la
**capacité**, pas du polissage.

---

## 1. Ce qui est demandé, en une phrase

> Une section de contrôle interne où l'on documente le **design et l'implémentation** d'un contrôle
> à partir d'un **walkthrough filmé** et des documents du client, puis son **efficacité
> opérationnelle** sur un échantillon d'occurrences — avec, à terme, un agent qui pré-remplit le
> travail que l'auditeur valide.

---

## 2. Le walkthrough et le D&I

### 2.1 Le déroulé

1. **Le walkthrough est enregistré** (vidéo). Cet enregistrement **est l'Inquiry** — la procédure
   d'entretien, au sens de la méthode.
2. À partir de la vidéo **et** de la documentation reçue du client, on établit la **liste des
   tâches réellement exécutées par le control owner** pendant le contrôle. Une tâche = une ligne.
3. Pour **chaque tâche**, on documente le design et l'implémentation, en nommant la **procédure
   employée**.

### 2.2 Les procédures, et la règle qui les gouverne

Quatre procédures, vocabulaire fermé :

| Procédure | Ce qu'elle est |
|---|---|
| `inquiry` | l'entretien — ici, le walkthrough enregistré |
| `inspection` | récupération et analyse des documents du client |
| `observation` | on regarde le contrôle s'exécuter |
| `reperformance` | on refait le contrôle soi-même |

> **`CTRL-01` — L'inquiry seule ne conclut rien.** Elle est systématique, mais tout D&I comme tout
> OE exige **au moins une** procédure parmi `inspection`, `observation`, `reperformance`. Une tâche
> documentée par la seule inquiry est refusée, en toutes lettres et non par un avertissement.

### 2.3 Les IUC

Pour chaque contrôle : **une IUC (Information Used in Control) est-elle utilisée ?** Si oui, il faut
documenter **comment on s'assure de son exactitude et de son exhaustivité** — les deux, séparément,
chacune avec sa propre preuve.

> **`CTRL-03`** — déclarer une IUC utilisée sans documenter à la fois son exactitude **et** son
> exhaustivité. Le refus nomme laquelle des deux manque.

### 2.4 Les facteurs de design

Quatre facteurs, obligatoires, chacun avec sa conclusion écrite :

1. **Réponse au risque** — en quoi le contrôle répond aux risques identifiés lors du *risk
   assessment*. Ce facteur porte un **lien vers les objets risque réels**, jamais du texte libre
   seul : un contrôle qui ne pointe aucun risque existant est un décor.
2. **Autorité et compétence du control owner** — *does the control owner have the authority and
   competence to perform the control ?*
3. **Fréquence et constance** du contrôle.
4. **Seuil employé dans le contrôle et critères d'investigation** — à partir de quel montant ou
   quel écart le control owner enquête, et selon quels critères.

> **`CTRL-02`** — conclure un D&I dont l'un des quatre facteurs n'a pas de conclusion écrite.

---

## 3. L'efficacité opérationnelle (OE)

### 3.1 La population d'occurrences

L'échantillon d'OE se tire sur le **nombre d'occurrences du contrôle sur l'exercice**. La fréquence
du contrôle décide de la façon de l'obtenir :

| Fréquence | Population |
|---|---|
| annuelle, mensuelle, hebdomadaire, quotidienne | **dérivée** de la fréquence et de la période |
| **`as_needed`** | **demandée au client** — il faut la population des occurrences |

> **`CTRL-05`** — atteindre le tirage d'OE d'un contrôle `as_needed` sans qu'une **demande client**
> de la population des occurrences existe. Cette demande **réutilise le mécanisme de la Partie B** :
> `client_request` typée, destinataire déduit, lien cliquable vers l'espace de demandes. Aucun
> chemin neuf, aucun formulaire parallèle.

> **`CTRL-04`** — tirer sur une population d'occurrences non rapprochée. Miroir exact de `POP-01`.

### 3.2 La taille de l'échantillon

Elle sort d'une **table d'échantillonnage du cabinet**, indexée par la fréquence du contrôle.

> **Cette table est un paramètre de pack, propre à chaque cabinet, et le dépôt est livré avec la
> table VIDE.** Aucune valeur n'y est écrite de mémoire, ni recopiée d'une méthodologie
> propriétaire, quelle qu'elle soit — la table interne d'un cabinet est confidentielle et
> n'appartient pas à ce produit. Tant que le cabinet ne l'a pas remplie, la ligne s'affiche
> « paramètre non vérifié — à fixer par le cabinet », et le tirage est refusé.

> **`CTRL-07`** — une taille d'échantillon saisie à la main, ou affichée alors que la table du
> cabinet ne l'a pas produite.

### 3.3 Les procédures de l'OE

**On fait la même chose que pour le D&I.** L'inquiry est de nouveau systématique — mais :

> **`CTRL-06` — L'inquiry de l'OE est une inquiry NEUVE.** Elle ne réutilise jamais celle du D&I :
> son objet est précisément de s'assurer que **rien n'a changé** depuis l'occurrence documentée au
> D&I. Elle porte sa propre date, postérieure. Réutiliser l'enregistrement du D&I est refusé.

Et, comme au D&I, au moins une procédure parmi `inspection`, `observation`, `reperformance`
(`CTRL-01` s'applique identiquement).

---

## 4. L'agent qui pré-remplit — préparé, pas activé

L'agent qui analyse la vidéo et en tire la liste des tâches, les procédures et les documents
rattachés est **la dernière chose construite, pas la première**.

- Le **Lot 8** du plan d'autonomie interdit l'activation de l'IA vivante tant que la garde de budget
  **en base** n'existe pas, que le chemin n'est pas fermé par défaut, et qu'une clé traîne au dépôt.
  Cet interdit **tient**.
- Toute la structure de ce mandat — tâches, procédures, IUC, facteurs de design, population, tirage,
  OE — se construit et se clique **sans aucune IA**, remplie à la main. C'est l'ordre de
  construction, et c'est aussi ce qui rend l'agent testable plus tard : il proposera dans des
  champs qui existent déjà.
- Quand il sera activé : **plafond L2**. L'agent propose, l'auditeur valide, rien de généré n'entre
  au dossier sans validation tracée, et chaque proposition porte sa source (horodatage vidéo, ou
  document client identifié).

**Deux décisions du fondateur restent à prendre avant toute vidéo réelle** — non bloquantes pour la
construction, bloquantes pour un usage réel :

1. La vidéo d'un walkthrough filme des personnes : **c'est une donnée personnelle**. Où est-elle
   stockée, combien de temps, qui y accède, comment on la supprime.
2. Le monde de démonstration reste **synthétique** : aucune vidéo réelle, aucune donnée réelle,
   conformément aux interdits permanents.

---

## 5. Le suivi de mission — kanban, tableaux de bord

Demandé parce que c'est une fonction que les managers apprécient. Une seule règle en gouverne la
construction :

> **Le kanban et le tableau de bord ne possèdent aucun objet.** Ce sont des **vues** sur des objets
> qui existent déjà — procédures, papiers, visas, demandes, obstacles, jalons, écarts. Une carte qui
> ne se résout pas à l'identifiant d'un objet réel est un décor, et une liste de tâches parallèle
> qui se désynchronise du dossier est pire qu'absente.

- **Kanban** : colonnes dérivées des états réels du travail ; déplacer une carte exécute le geste
  métier correspondant, jamais un changement d'étiquette décoratif.
- **Tableau de bord** : avancement par poste, ce qui bloque le visa, l'âge des demandes en attente,
  les écarts non conclus. **Tout compteur mène quelque part** (règle de l'épure, D.6).
- Rien de neuf en base tant qu'une vue suffit.

---

## 6. Les épreuves d'acceptation, mécaniques

Une tranche de ce lot n'est pas finie tant que chacune n'est pas **observée**, pas déclarée :

1. Une tâche documentée par la seule inquiry **ne se conclut pas** — `CTRL-01` observé à l'écran.
2. Un contrôle dont un des quatre facteurs de design est vide **ne se conclut pas** — `CTRL-02`.
3. Une IUC déclarée sans exactitude, ou sans exhaustivité, **est refusée en nommant laquelle** —
   `CTRL-03`.
4. Un contrôle `as_needed` **n'atteint pas le tirage** sans demande client de la population —
   `CTRL-05`, et la demande est créée **par un clic**, visible dans l'espace de demandes.
5. Une population d'occurrences non rapprochée **ne se tire pas** — `CTRL-04`.
6. **Aucune taille d'échantillon ne s'affiche** tant que la table du cabinet est vide — `CTRL-07`.
7. L'inquiry d'OE **refuse** de réutiliser l'enregistrement du D&I — `CTRL-06`, avec ses deux dates.
8. Le kanban : un test échoue si **une seule carte** ne se résout pas à l'identifiant d'un objet
   existant.
9. `SEMEUR_VS_CHEMIN` : **chaque objet nouveau de ce mandat porte son chemin humain cliqué.** Un
   contrôle, un walkthrough, une tâche, une IUC, une occurrence ne doivent jamais n'exister que par
   la graine.

---

## 7. L'ordre de construction

1. **Le contrôle et son walkthrough** : l'objet contrôle (fréquence, owner, seuil, critères), le
   walkthrough et sa liste de tâches, saisis à la main, avec les procédures et `CTRL-01`.
2. **Les IUC et les facteurs de design** : `CTRL-02`, `CTRL-03`, et le lien réel vers les risques.
3. **L'OE** : population dérivée, demande client pour `as_needed` (`CTRL-05`), rapprochement
   (`CTRL-04`), table de pack vide (`CTRL-07`), inquiry neuve (`CTRL-06`).
4. **Le suivi de mission** : tableau de bord d'abord (vue pure), kanban ensuite.
5. **L'agent**, seulement après l'ouverture du Lot 8, et sous plafond L2.

---

## 8. Ce qui ne change pas

Tous les invariants D.0 tiennent, en particulier : un état que seul le semeur produit est un décor ;
une garde qui n'a jamais rien refusé n'est pas une garde ; aucune mesure sur un arbre qui bouge ;
aucune attente non bornée ; le compte rendu est engendré. Les interdits permanents tiennent aussi :
pas de donnée réelle, pas de service payant, pas d'IA vivante, `PLAN_RLS` étape 3 jamais.
