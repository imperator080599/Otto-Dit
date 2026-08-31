# DEMO.md — the two-part demo, step by step

One fictional group, two engagements, the same engines:

- **Part 1 — audit légal (NEP/France pack, French outputs)**: revenue substantive testing on
  *Altiverre SAS* (fictional French subsidiary, SIREN 999 888 777, FY2025).
- **Part 2 — SOX 404 component work (PCAOB/COSO pack, English outputs)**: operating-
  effectiveness testing of two controls at the same subsidiary, referred by the group
  auditor of *Meridian Industrial Group, Inc.* (fictional US-listed parent).

Cast (all fictional): **Vermeil Audit** — Claire Fontaine (partner, signs), Léa Moreau
(manager, reviews), Karim Benali (senior, prepares). Client: Sophie Marchand (CFO),
Théo Girard (chef comptable).

## Le prototype cliquable — `prototype/otto-prototype.html`

Un seul fichier. Aucune installation, aucun compte, aucun réseau, y compris sur téléphone. Il porte
le **testing du chiffre d'affaires entièrement déroulé** — échantillon, requête, dépôts, contrôles,
un écart résolu, un écart au cumul, une note posée puis close, travail achevé et revu, papier
imprimable — et il **garde ce qu'on y tape** dans le navigateur où il tourne.

## LE PARCOURS — sept minutes de démonstration sur vingt d'entretien

Ceci est le script de la démonstration. Chaque étape dit **où cliquer**, **ce qu'il faut montrer du
doigt**, et **la phrase à dire**. Les chiffres cités sont ceux que le fichier produit réellement : le
harnais `prototype/pw/parcours.mjs` rejoue ce parcours et échoue si l'un d'eux bouge. Si ce document
et l'écran divergent un jour, c'est le harnais qui tranche.

**Le budget de temps, et il est ferme.** Neuf étapes de démonstration (5 min 30), trois pauses où
c'est vous qui vous taisez (1 min), la demande de fin (30 s) : **sept minutes**. Sur un entretien de
vingt, il en reste **treize pour écouter**. Ce rapport n'est pas un confort — c'est l'objet du
rendez-vous. Vous n'allez pas vendre : vous allez chercher les six réponses de
`docs/10_FALSIFICATION.md`, et vous ne les obtiendrez pas en parlant.

**Si vous débordez, coupez dans les étapes 5, 6 et 7 — jamais dans les pauses.**

**Avant d'ouvrir la bouche.** Ouvrez `prototype/otto-prototype.html` (aucune installation, aucun
compte, aucun réseau). Si vous avez déjà cliqué dedans, appuyez sur **« repartir de zéro »** en bas
à gauche : le dossier revient à son état d'amorce. Vérifiez que la pastille dit *enregistré* — si
elle dit *NON ENREGISTRÉ*, votre navigateur refuse le stockage local (fenêtre privée) : la
démonstration marche quand même, mais un rafraîchissement vous ferait tout recommencer.

**La phrase d'ouverture, avant le premier clic :**

> « Ce que je vous montre n'appelle aucun modèle de langage. Tout ce qui s'affiche est calculé, ici,
> dans votre navigateur, à partir d'un jeu d'écritures fictif. Vous pouvez le prendre en défaut. »

---

### 1 · On ouvre sur l'état du dossier, pas sur un écran de travail  *(20 s)*

L'outil s'ouvre sur **Pilotage**. Cinq lectures : avancement par section, budget contre réalisé,
achèvements dans le temps contre l'échéance, charge par personne, âge des demandes en retard.

Montrez du doigt : les graphiques sont **à l'encre** — pas une couleur, sauf sur les problèmes.

> « Un associé qui ouvre son dossier veut savoir où il en est, pas commencer à travailler. Et vous
> remarquerez qu'il n'y a aucune couleur : la couleur est réservée à ce qui ne va pas. Un tableau
> de bord bariolé ne dit plus rien de ce qui est grave. »

---

### 2 · On ouvre SA liste, pas l'arborescence du dossier  *(30 s)*

Cliquez **Espace auditeur**. Il s'ouvre sur **« Mes travaux »** — Karim Benali, senior.

Montrez : **six travaux**, triés par échéance ; la colonne **« ce qui bloque »** en toutes lettres
(*32 justificatifs attendus du client*, *conclusion de la procédure non rédigée*) ; et le bouton
**« ouvrir le papier »**.

> « Voilà comment on se sert vraiment d'un logiciel d'audit : on ouvre sa liste. Ce qui bloque chaque
> ligne est écrit — ce n'est pas à moi de le deviner. Et ce bouton n'ouvre pas la section : il ouvre
> le papier de travail. Trois clics en un. »

Cliquez **« ouvrir le papier »** sur *Test de séparation des exercices — Chiffre d'affaires*.

---

### 3 · Le testing, déroulé de bout en bout  *(80 s — le cœur)*

Vous êtes dans **Chiffre d'affaires → Procédures d'audit**. Ouvrez **« Test de détail sur les
éléments sélectionnés, pièce à l'appui »**.

Montrez, dans cet ordre :

1. **La méthode est écrite là où elle s'exécute** — objectif, *sens du test*, ce qui compte comme
   exception, sources. Toutes marquées **UNVERIFIED**.
2. **La sélection** : sondage en unités monétaires, **167 éléments**, germe rejouable.
3. **Le garde-fou d'exhaustivité**, qui a fait changer de méthode : la strate exhaustive retenait
   presque toute la masse **sans rencontrer les anomalies de montant**.
4. **Le papier** : 167 lignes, une pièce par ligne, les champs relevés et ce à quoi ils se comparent.
5. **Deux écarts chiffrés** : une remise commerciale de **620 €**, expliquée, corroborée par l'avoir
   et par l'écriture, **résolue** ; un retour de marchandise de **4 850 €**, **non résolu, au cumul**.

> « Le sondage est parti d'une strate exhaustive qui prenait presque tout — et qui ne rencontrait
> aucune des deux anomalies de montant. L'écran l'a dit, et il a proposé de sonder en unités
> monétaires : cent soixante-sept éléments au lieu de cent quinze. **Plus de travail, pas moins.**
> Un outil qui vous propose toujours d'en faire moins ne vous rend pas service. »

Puis, sur l'écart de 620 € :

> « Regardez ce qu'il a fallu pour le déclarer résolu : l'explication du client mot pour mot, ma
> conclusion, la disposition retenue, **et le lien vers la pièce qui la corrobore**. Sans ce lien,
> le système refuse. C'est là que se joue la différence entre un dossier et un tableur. »

---

### ⏸ PAUSE 1 — vous vous taisez  *(20 s pour poser, puis vous écoutez)*

> « Est-ce que c'est comme ça que vous le faites ? »

Puis **taisez-vous**. Comptez jusqu'à cinq dans votre tête si nécessaire. La première chose qu'un
auditeur dit après avoir vu un testing n'est presque jamais une politesse.

Relances, une seule à la fois, et seulement s'il s'arrête :

- « Sur votre dernier contrôle du chiffre d'affaires, combien d'heures entre la sélection et la
  feuille signée ? Et qui les passe ? »
- « Vous sondez, ou vous faites de l'analytique ? »

**Ce que vous cherchez** : la réponse à **Q2** de `docs/10_FALSIFICATION.md` — ≥ 8 h par cycle,
passées par un collaborateur, confirme ; moins de 3 h, ou « on ne teste pas par sondage », tue.
Notez les heures **et le grade de qui les passe**. Notez aussi le verbatim, pas votre résumé.

---

### 4 · Le travail est revu — et la section n'est toujours pas visée  *(40 s)*

Allez à **Conclusion et visa**.

Montrez : le travail est **achevé par son préparateur et revu par sa réviseuse**. Une note de revue
a été posée, répondue, **close**. Et pourtant le visa est **impossible** : **dix obstacles**
subsistent, énumérés — facteurs de risque non statués, questions sans réponse, écarts sans
résolution probante, papiers N-1 non reconfirmés, conclusion non rédigée.

> « C'est le point que je veux vraiment vous montrer. Le travail est fait, il est revu, et la section
> n'est pas visable. Le bouton n'est pas grisé pour la forme : il n'existe pas tant qu'un obstacle
> tient. On ne peut pas viser par distraction. »

---

### ⏸ PAUSE 2 — vous vous taisez  *(20 s pour poser, puis vous écoutez)*

> « Qu'est-ce qui vous arrêterait, vous, à ce moment-là ? »

C'est la question la plus utile du parcours et la plus facile à gâcher. Ne proposez **aucune**
réponse. S'il dit « rien », c'est une donnée : notez-la telle quelle.

Relance unique, s'il ne vient rien :

- « Ce que vous voyez là devrait être natif dans votre outil de dossier, ou un PDF qui arrive dedans
  vous va ? »

**Ce que vous cherchez** : la réponse à **Q3** — « acceptable, on y colle déjà des Excel » confirme
le positionnement à côté du dossier ; « tout doit être natif dans l'outil » le tue. Et sa liste
d'obstacles à lui vaut mieux que la nôtre : c'est le contenu du produit, pas un avis.

---

### 5 · Une constatation circule toute seule  *(35 s)*

Rail → **Planification → Facteurs de risque**.

Montrez : **seize constatations** posées sur **onze sections**, chacune avec **sa règle**, sa source
et le lien vers ce qui l'a produite. Aucune n'a été ressaisie.

> « Un écart de rapprochement dans une section, une écriture passée par la direction, une pièce datée
> hors exercice : ça doit se poser tout seul sur les sections concernées, avec un lien vers sa source.
> Personne ne recopie rien. Et chaque facteur dit **par quelle règle** il est là — c'est ce que votre
> réviseur vous demandera. »

---

### 6 · Le système refuse  *(25 s)*

Rail → **Mission → Équipe et indépendance**. Essayez d'attribuer un travail à **Hugo Vasseur**.

> « Hugo n'a pas signé sa déclaration d'indépendance. Le système ne me le rappelle pas : il refuse.
> Et regardez Inès — ses travaux lui ont été attribués en novembre, quand sa déclaration valait ; la
> révision de mars les rend caducs, et **ça bloque le visa de sa section**. Une règle qui se contente
> de prévenir n'est pas une règle. »

---

### 7 · La version 4 du fichier, et la bascule  *(40 s)*

Rail → **Données du dossier → Versions du fichier**. La version 4 est reçue et en attente.
Montrez d'abord **ce que l'écran annonce** qu'il va se passer. Puis **prenez-la en compte**.

Allez à **Ajustements et retraitements**.

Chiffres exacts : **zéro anomalie corrigée avant, trois après** ; le résiduel passe de
**127 980 € à 31 050 €**. Aucune saisie.

> « Le client nous envoie une version corrigée du fichier. Je ne repointe rien, je ne ressaisis rien :
> je dis à l'outil que je prends cette version. Trois anomalies passent de « non corrigée » à
> « corrigée » parce qu'une écriture les corrige réellement, et le cumul non corrigé tombe de cent
> vingt-huit mille à trente et un mille. Et l'écran l'avait **annoncé au centime avant** que je clique. »

---

### 8 · Le portail du client, vu par le client  *(40 s)*

Cliquez **Portail client**.

Montrez : la page s'ouvre sur **ce qu'il doit maintenant** — *« il vous reste 9 documents à déposer,
sur 4 demandes »* —, **en retard d'abord**, puis *à rendre avant la prochaine relance*, puis
*ensuite*, et **déjà déposées repliées en bas**. Le filtre est par **domaine métier** — Ventes et
clients, Paie et personnel — pas par code de section.

Montrez surtout **ce qui n'est pas là** : aucun seuil de matérialité, aucun papier, aucune note de
revue, aucun statut interne de revue.

> « Un client qui ouvre le portail doit voir sa dette, pas un inventaire. Et il ne voit ni notre
> matérialité, ni nos papiers, ni où en est notre revue : ce n'est pas une case décochée, le bandeau
> de seuils **n'est pas construit** dans cet espace. »

---

### ⏸ PAUSE 3 — vous vous taisez  *(20 s pour poser, puis vous écoutez)*

> « Qu'est-ce qui manque pour que votre client s'en serve ? »

Pas « est-ce que ça vous plaît » : **qu'est-ce qui manque**. La forme négative appelle une réponse
utilisable ; la forme positive appelle une politesse.

Relances, une à la fois :

- « Vos clients déposent déjà des pièces dans un portail ? Lequel ? »
- « Quel pourcentage vous arrive quand même par mail — et est-ce que ça vous agace ? »

**Ce que vous cherchez** : la réponse à **Q4** — un portail déjà en usage, **ou** plus de la moitié
par mail et ça les agace, confirme ; « le client refuse tout portail, on récupère sur place » tue.

---

### 9 · Pourquoi cette preuve existe  *(20 s)*

Cliquez **Pilotage → Piste d'audit**.

> « Chaque geste que je viens de faire est là, horodaté, avec son auteur. « Pourquoi cette preuve
> existe-t-elle », « qu'est-ce qui appuie cette conclusion », « d'où sort ce chiffre » : ces trois
> questions doivent avoir une réponse à tout moment, pas au moment de l'assemblage. »

---

## LA DEMANDE DE FIN  *(30 s — ne finissez jamais sur une phrase)*

Le parcours se termine par une **demande**, pas par une conclusion. Trois, par engagement croissant.
Faites-les **dans cet ordre** et **arrêtez-vous à la première qui reçoit un non franc** : enchaîner
après un refus transforme un entretien en démarchage, et vous perdez le troisième rendez-vous.

### Demande 1 — l'essai sur un dossier déjà clos

> « Est-ce que vous accepteriez de l'essayer sur un dossier passé, déjà clos ? Pas pour l'utiliser —
> pour me dire où ça casse. Vous ne changez rien à votre méthode, le dossier est archivé, et je ne
> vois aucune de vos données : le fichier tourne chez vous. »

Pourquoi elle passe en premier : le risque pour lui est **nul** — le dossier est clos, aucune donnée
ne circule — et c'est la seule demande qui produise une observation plutôt qu'une opinion.

**Ce qu'on note** : oui / non / « il faudrait que j'en parle à… ». Cette dernière réponse est une
information sur le **circuit de décision**, pas un refus : demandez à qui.

### Demande 2 — deux confrères

> « Est-ce que vous connaissez deux confrères à qui je devrais montrer ça ? Pas pour leur vendre
> quelque chose — pour la même conversation que celle-ci. »

**Deux**, pas « des » : un chiffre appelle des noms, un pluriel vague appelle « oui, j'y penserai ».
S'il en donne un seul, c'est un vrai signal. S'il n'en donne aucun mais qu'il a été chaleureux
pendant vingt minutes, c'est un signal plus fort encore, et dans l'autre sens.

**Ce qu'on note** : les noms, ou l'absence de noms. Rien d'autre.

### Demande 3 — le prix, et jamais avant

> « Dernière question, et elle est brutale : pour un outil qui prend en charge la boucle sélection →
> justificatifs → feuille de travail sur deux cycles, qu'est-ce que ça vaudrait par mandat et par an
> dans votre cabinet ? Et qui signe ce chèque ? »

**Ne donnez jamais de chiffre en premier.** Q5 ne compte comme confirmation que si le montant est
cité **spontanément** : si vous ancrez, la réponse ne vaut rien et l'entretien est perdu pour ce qui
compte le plus. S'il retourne la question — « et vous, vous demandez combien ? » — la seule réponse
est : « je ne sais pas encore, c'est pour ça que je vous le demande. »

**Ce qu'on note** : le montant exact cité, l'unité (par mandat ? par cabinet ? par utilisateur ?),
et **qui signe**. Un montant sans le nom du signataire est une demi-réponse.

---

## Ce qu'il faut dire si on vous pose la question

| La question | La réponse |
|---|---|
| « C'est de l'IA ? » | « Pas ici. Zéro appel modèle, zéro requête réseau — vous pouvez couper le wifi. Dans le produit, le modèle sert à extraire et à proposer ; il ne conclut jamais, et rien n'entre au dossier sans qu'un humain l'ait approuvé. » |
| « Les normes citées sont justes ? » | « Non vérifiées, et c'est écrit à l'écran. Aucun texte primaire n'a pu être atteint depuis l'environnement de développement : toutes les sources portent **UNVERIFIED**, et aucun numéro de paragraphe n'est cité nulle part. C'est de la pratique structurée, à confronter aux textes. » |
| « C'est mon dossier là-dedans ? » | « Non. Altiverre SAS, son SIREN, ses tiers, ses pièces : tout est fabriqué. Aucune donnée client réelle n'entre dans ce dépôt, jamais. » |
| « Ça garde ce que j'ai tapé ? » | « Dans ce navigateur, sur cet appareil, oui — c'est la pastille en bas à gauche. Rien ne part nulle part. » |
| « Et si je casse quelque chose ? » | « « Repartir de zéro », en bas à gauche. » |

## Ce que ce parcours ne montre pas

Le pack SOX (il n'est pas construit dans le prototype), l'extraction documentaire, l'envoi réel des
demandes, le contrôle interne, et le journal d'événements haché — qui existe dans l'application, pas
ici. Dites-le avant qu'on vous le demande.

---

Le reste de ce document décrit la démonstration de **l'application Next.js**, qui est un autre objet :
deux mandats, deux référentiels, une base de données, des exports scellés.

---

## FEUILLE DE CAPTURE — une page par entretien

**À remplir dans les dix minutes qui suivent, jamais le lendemain.** Ce qui n'est pas écrit tout de
suite devient un souvenir arrangé. Copiez ce bloc dans un fichier par entretien.

```
ENTRETIEN N° ___    date ______________    durée réelle ______ min

Cabinet ......................................................................
Interlocuteur ................................  fonction .....................
Est-il l'associé signataire ?   oui / non — si non, qui l'est ? ..............

── CE QU'IL A REGARDÉ ────────────────────────────────────────────────────────
Ce sur quoi il s'est ARRÊTÉ (l'écran, et ce qu'il a dit) :
  1. ..........................................................................
  2. ..........................................................................
  3. ..........................................................................

Ce qu'il a IGNORÉ — un écran devant lequel il n'a rien dit, ou qu'il a fait
défiler. Aussi instructif que le reste : c'est ce qu'on a construit pour rien.
  1. ..........................................................................
  2. ..........................................................................

Ce qu'il a demandé à REVOIR (le meilleur signal de tous) :
  ............................................................................

── SES OBJECTIONS, MOT POUR MOT ──────────────────────────────────────────────
Verbatim, pas de reformulation. Si vous ne vous rappelez pas la phrase exacte,
écrivez « (approximatif) » — ne la lissez pas.
  1. « ...................................................................... »
  2. « ...................................................................... »
  3. « ...................................................................... »

── SON OUTILLAGE D'AUJOURD'HUI ───────────────────────────────────────────────
Outil de dossier ....................................  depuis ........ ans
Ce qu'il lui coûte : ............. € / an, base : par cabinet / par utilisateur
                                                  / par mandat / ne sait pas
Ce qu'il en dit de mal : ....................................................
Ce qu'il ne remplacerait pour rien : ........................................
Portail de dépôt client :   oui, lequel ..................  / non
Part des pièces reçues par mail : ....... %   Est-ce que ça l'agace ? oui / non

── QUI DÉCIDE DE L'ACHAT ─────────────────────────────────────────────────────
Qui signe le chèque : .......................................................
Qui doit dire oui avant lui : ...............................................
Y a-t-il un cycle (budget annuel, comité, réseau) ? ..........................

── LES SIX RÉPONSES (docs/10_FALSIFICATION.md) ───────────────────────────────
Cochez CONFIRME / TUE / SANS RÉPONSE. Une case « sans réponse » n'est pas une
demi-confirmation : c'est une question à reposer au prochain entretien.

 Q1  mandats CAC / an : ......   collaborateurs en production : ......
     ≥ 15 et ≥ 3 → CONFIRME  |  ≤ 8, ou production 100 % associé → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse

 Q2  heures entre sélection et feuille signée : ...... h, passées par ........
     ≥ 8 h par un collaborateur → CONFIRME  |  < 3 h, ou pas de sondage → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse            ← issue de la PAUSE 1

 Q3  feuilles en PDF/Excel dans son outil de dossier :
     « acceptable » → CONFIRME  |  « tout doit être natif » → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse            ← issue de la PAUSE 2

 Q4  portail client : ............   part par mail : ...... %
     portail en usage, OU > 50 % par mail et ça les agace → CONFIRME
     « le client refuse tout portail » → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse            ← issue de la PAUSE 3

 Q5  montant cité SPONTANÉMENT : ......... € par ...................... / an
     qui signe : ..................................................
     ≥ 300 €/mandat/an et décision de l'associé seul → CONFIRME
     < 150 €/mandat, ou « ça devrait venir de la CNCC / c'est gratuit
     ailleurs » → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse          ← issue de la DEMANDE 3
     ⚠ si VOUS avez cité un chiffre en premier, cochez « sans réponse ».

 Q6  travaux de composant SOX 404 :   oui, ...... mandat(s)  /  non
     outil imposé par le groupe ?   oui / non
     oui, ≥ 1 mandat et outil libre → CONFIRME
     non, OU « le groupe impose sa plateforme » → TUE
     [ ] confirme   [ ] tue   [ ] sans réponse

── LES TROIS DEMANDES ────────────────────────────────────────────────────────
 1. Essai sur un dossier clos   [ ] oui  [ ] non  [ ] doit en parler à ........
 2. Deux confrères              noms : .......................................
 3. Prix par mandat             (reporté en Q5 ci-dessus)

── UNE PHRASE ────────────────────────────────────────────────────────────────
Si je ne devais retenir qu'une chose de cet entretien :
  ............................................................................
```

---

## DÉPOUILLEMENT — quand l'hypothèse bascule

**Cible : 12 entretiens**, associé signataire, cabinets inscrits CAC de 5 à 50 mandats. Le tableau se
remplit **avant** tout arbitrage, jamais après — et les seuils s'appliquent **sans discussion**. Ils
sont recopiés de `docs/10_FALSIFICATION.md`, qui reste la source ; s'ils divergent un jour, c'est ce
document-là qui fait foi.

| Signal | Bascule à | Ce qu'on fait, sans discuter |
|---|---|---|
| **Q5 tue** | **≥ 6 / 12** | Le prix par mandat est mort. On repasse à un prix **par cabinet** et on refait le test avant toute dépense commerciale. |
| **Q3 tue** | **≥ 5 / 12** | Le positionnement « à côté du dossier » (D3) est invalidé. La v2 vise le dossier lui-même, pas l'export. C'est une décision d'architecture, pas de marketing. |
| **Q6 tue** | **≥ 9 / 12**, ou **< 3 confirmations** | Bascule **France seule** : le pack SOX est gelé en l'état, zéro maintenance, zéro investissement commercial côté US. Le noyau et les moteurs ne bougent pas. |
| **Q1 + Q2 tuent** | **≥ 6 / 12** | Le segment est mal choisi : viser les cabinets de 50 mandats et plus, ou le mid-tier, et re-tester avant d'écrire une ligne de plus. |
| **Q4 tue** | **≥ 8 / 12** | L'intake par portail est mort : l'intake par mail devient le chemin principal et passe en tête du backlog. |

**Cas de passage** : **≥ 8 / 12 confirmations sur Q5 et sur Q3**, quel que soit Q6 → on avance,
France d'abord, pack SOX conservé sans investissement commercial jusqu'à preuve d'un acheteur
indépendant.

**Trois règles de dépouillement, qui valent autant que les seuils.**

1. **Une case « sans réponse » ne compte ni d'un côté ni de l'autre**, et elle n'est pas neutre :
   c'est une question mal posée, à reposer au suivant. Si Q5 finit avec cinq « sans réponse », le
   test n'a pas eu lieu — ne concluez pas, refaites-le.
2. **On dépouille à 12, pas à 4.** La tentation d'arrêter après trois entretiens enthousiastes est
   exactement ce que ce document existe pour empêcher.
3. **Le verbatim l'emporte sur la case cochée.** Si les cases disent « confirme » et que les trois
   phrases notées disent « je ne vois pas ce que ça m'apporte », c'est le verbatim qui a raison.


## 0. Start

```bash
cd app
npm install
npm run demo          # migrations + base world + demo file + server, then a panel telling you
                      # the URL, who to sign in as for each role, and the client portal (ADR-095)
```

To start from an *empty* engagement and click everything yourself, use `npm run db:setup &&
npm run dev` instead — `npm run demo` hands you the file already driven.

Two ways to run the demo:

- **Live walkthrough** (recommended for a first showing) — follow §1–§2 below and click
  every step yourself, starting from an empty engagement.
- **Pre-driven state** — `npm run demo:seed` executes both parts through the *same service
  calls the UI makes*, then you browse the finished engagements. It advances the demo clock
  by 25 days between the two parts (real reminder engine, real clock — docs/07 story 11), so
  the file shows a realistic follow-up position: reminders sent, one request past its
  deadline, some items never received. `npm run demo:seed part1`
  or `part2` runs one part. Reset anytime with `npm run db:reset && npm run db:setup`.

Time-warp for the reminder cadence: reminders materialize lazily against a demo clock;
the request page shows the log after `npm run demo:email` or once the clock advances (the
test suite exercises the cadence directly).

## 1. Part 1 — Audit légal (NEP), French workpaper

Sign in as **Karim Benali** → engagement *Altiverre FY2025 — Audit légal (NEP)*.
Framework badges: `nep-fr` · `pcg` · `fr`.

1. **Data & imports** — import `dataset/tb_2025.csv` (current) and `dataset/tb_2024.csv`
   (prior); columns are auto-mapped (`Compte / Intitulé / Débit / Crédit`, `;`, decimal
   comma). Then import `dataset/999888777FEC20251231.txt` through the FEC adapter: 18-field
   order, AAAAMMJJ dates, per-entry balance, filename pattern. The import history shows the
   validation report; JE risk flags are computed at import.
2. **Reconciliation** — *Recompute*. The seeded **A7** difference surfaces on **two**
   accounts (Dr 411000 / Cr 706000, 25 000,00 € — an unposted top-side entry present only in
   the TB export), each raising a typed exception. Document both differences (a note is
   required) to open the per-FSLI population gate.
3. **Materiality** — *Propose (L3)*: the engine picks the benchmark by rule (PBT, because
   the result is representative), computes **M 37 000 € / PM 27 000 € / CTT 1 800 € /
   TE 27 000 €** and drafts the French rationale. Adjust or *Validate* — validation also
   refreshes the scoping proposals.
4. **Scoping** — FSLIs below performance materiality are `ns_proposed`, never silently NS
   (D9). Confirm one NS; scope one in qualitatively (a written basis is required).
5. **Population** — the revenue population (70x accounts) with its hash; toggle to the
   flagged view: the seeded **A6** weekend/round/manual JE and the **A8** credit-note
   pattern on customer C009 are flagged.
6. **Sampling** — *Propose parameters*: coverage cap = PM, 4 random items, deterministic
   seed. *Validate* (you may edit any parameter), then *Draw*: 16 items — 9 high-value,
   3 risk-flagged, 4 random, each with its selection reason.
7. **Generate PBC request** → R-001 with per-item links (invoice, delivery note, an
   explanation item for the manual JE) plus standing items (bank statements). *Approve &
   send* — the L2 gate.
8. **Client portal** (open `/portal/demo-sophie-altiverre` in another window, French UI) —
   upload the evidence from `dataset/evidence/`, type an answer to the explanation item,
   press **« Tous les justificatifs ont été transmis »**. One delivery note cannot be
   provided (that is seeded anomaly **A2**).
9. **Testing** → *Run extraction ladder*: the Factur-X invoice is parsed exactly from its
   embedded CII XML (rung 1), born-digital PDFs via the text layer (rung 2), and the one
   unlabeled "scan" falls to the OCR adapter — which **always** queues for side-by-side
   human verification (ADR-012). Verify it.
10. **Run vouching (L0)** → the exceptions appear, typed: **duplicate invoice (A1)**,
    **missing delivery note (A2)**, **price mismatch (A3)**, **quantity mismatch (A4)**,
    **cut-off (A5)**, plus the manual-JE and credit-note-pattern flags.
11. **Exceptions** → *Draft clarification request* (L2) → approve → answer from the portal
    → the exceptions become `explained`. Resolve them; escalate the cut-off to an
    **uncorrected misstatement** (36 330 €).
12. **Verification spot-check** → *Draw subsample* (seeded, reproducible over the
    machine-passed items) → re-perform **blind**: you type the values you read from the
    document *before* the machine result is revealed; agreement is computed.
13. **Sample evaluation** → *Recompute*: known + projected misstatement against TE, then
    record the conclusion (L4). The conclusion gate opens only when every exception is
    dispositioned *and* the evaluation is concluded.
14. **Workpapers** → *Draft REV-01*: French, assembled from stored facts, every figure
    click-through to its evidence, attribution "performed by OTTO engine run … / validated
    by …". Edit a section (justification required → visible modification flag), add a
    review note (Léa → Karim → addressed → closed), then sign
    préparateur/réviseur/associé. **Export PDF and Excel** — terminal, hash-stamped and
    self-contained (annexes: sampling parameters, evidence sha256s, modification history,
    review trail, sign-offs).

## 2. Part 2 — SOX 404 component (PCAOB/COSO), English workpaper

Switch to *Altiverre FY2025 — SOX 404 component*. Badges: `pcaob-sox` · `en`.
The overview shows the **group-auditor referral instructions**.

15. **RCM & controls** — import the RCM: 7 controls incl. 1 ITGC, with risks, assertions,
    COSO components and D&I status. `C-REV-03` is `not_assessed`: try to test it and the
    **D&I gate** blocks you; assess it first.
16. **C-BR-01 — Monthly bank reconciliation** → *Import client listing* (12 instances) →
    *Draw & request evidence*: the pack frequency table sizes the sample (monthly ⇒ 3),
    overridable only with a written justification; the per-instance evidence request is
    sent (the two-request flow: population listing first, evidence after the draw).
17. Client provides the signed reconciliations — one sampled month has none (seeded).
18. *Extract & test attributes* → the attribute grid fills, and the seeded deviations
    surface: **missing approval**, **performed late**, **wrong performer (SoD)**,
    **missing evidence**.
19. Record the dispositions → *Propose deficiency (L3)*: the rules engine proposes a
    severity from magnitude, key-control and compensating-control facts, with its full
    basis; the human records the decision. The aggregation view lists it by severity.
20. *Draft OE workpaper* → **OE-C-BR-01**, English, PCAOB-shaped, produced by the **same**
    documentation engine as REV-01. Sign and export.
21. Repeat for **C-REV-01** (weekly credit approvals): clean run, control concludes
    effective — including the OCR-mock approval form that went through human verification.

## 3. Traceability finale (both engagements)

22. **Provenance** → the three questions, answered from stored links:
    - *Why does this evidence exist?* → evidence → request item → sample item → sample
      (method, seed) → procedure → risk.
    - *What supports this conclusion?* → engine run, sign-offs, every supporting document
      with its sha256 and extraction rung, AI involvement, manual modifications.
    - *Where did this figure come from?* → ledger row + import file + natural key →
      extraction fields → vouching checks.
23. **Interroger** (`Ask the file`) — type the questions, do not click the catalogue:
    - *« quelles demandes sont en retard de plus de 10 jours ? »* → R-001, 15 jours de
      retard, 3 éléments manquants, with a link straight to the request. The panel shows
      the query that ran (`requests_overdue`, *Jours de retard = 10*, *Au = <clock date>*)
      and that it was translated **by a deterministic rule, with no model involved**.
    - *« quelles anomalies restent non corrigées ? »* → the 36 330 € cut-off misstatement.
    - *« quelles sections ont des exceptions non résolues au-dessus du seuil de
      signification ? »* → **none**, with the resolved threshold shown (37 000 €). That is
      the point: the "no" is a query over the file, not a sentence someone wrote.
    - *« penses-tu que le chiffre d'affaires est raisonnable cette année ? »* → OTTO
      **refuses**, states why, and lists the 14 queries it can answer. It never improvises
      prose about a signed file (ADR-017).
24. **Event log** → filter by actor (user/system/ai) or verb; the hash chain verifies live.
25. **Dashboard** → progress, exceptions, deviations, deficiencies, workpaper states, AI
    spend; export the tracker in **team / client / group** variants (the client workbook
    carries no exceptions, deviations or internal review statuses).

## What the demo proves — and what it does not

**Proves**: the middle loop runs end-to-end on two cycle types with one set of engines and
two content packs; every seeded anomaly and deviation is detected (`npm test`, zero false
negatives); provenance and the audit trail hold at every step.

**Does not prove** (see docs/09 Gate 1): extraction reliability on *real* client documents,
the L2 verification-time economics, or any market/adoption hypothesis. Those are pre-pilot
gates (ASSUMPTIONS A11/A12) and require permissioned real evidence, which this repo
deliberately does not contain.

## 4. Measurement commands (not part of the walkthrough)

```bash
npm run eval:extraction     # scores the extraction ladder per field on a public/synthetic
                            # corpus → docs/EVAL_EXTRACTION.md (ADR-018)
npm run cost:measure        # runs the ladder with a LIVE adapter under a $ budget guard and
                            # rewrites the measured block of COST.md (ADR-019)
npm run eval:pieces-neuves  # scores the ladder on the NEVER-SEEN pieces of
                            # dataset/pieces_neuves/ (absent from every replay cache) with the
                            # live adapter — cost, latency, field accuracy (ADR-105)
```

**And the live demo itself**: `npm run demo:ia` launches the demo with the OCR rung REAL —
key stays in `app/.env.local` (presence checked, value never read by the launcher), the demo
world is seeded in replay (zero spend), never-seen pieces are generated with VERITE.md
telling which file goes on which portal line and which are trapped; spend is displayed on
the testing screen and a budget guard refuses cleanly at the ceiling (ADR-105).

`eval:extraction` runs offline and generates its own corpus (foreign layouts, foreign date
and number formats, and bitmap scans with no text layer at all). `cost:measure` refuses to
start without a live adapter, its key, today's price list and `--yes`; with the default
`mock` adapter neither command can spend anything. **No client document ever goes in either
corpus** — a real-document eval happens only at a pilot client, with written authorization.
