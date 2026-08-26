# 11 — Convergence prototype → application

**Le tableau réel.** L'application porte la **profondeur** : la boucle du milieu de bout en bout,
sur deux référentiels, avec sa base, sa piste chaînée et ses exports scellés. Le prototype porte la
**largeur** et les **décisions récentes** : navigation, équipe, jalons, questionnaire, versionnement,
ajustements, graphiques. Le travail de convergence est donc **borné**, et c'est ce document qui le
borne.

**La règle qui décide de tout ce qui suit** : les **procédures sont du contenu**, la **mécanique est
le produit**. Chaque cabinet remplacera les procédures par les siennes ; construire dix-huit cycles
serait investir dans ce qui sera jeté. On ne construit donc **rien de spécifique à un cycle au-delà
du chiffre d'affaires**.

**Comment lire les estimations.** « Séance » = une session de travail qui se termine par un état
démontrable. Ce sont des ordres de grandeur, pas des engagements ; ils servent à ordonner, pas à
planifier.

---

## Les onze points, dans l'ordre où ils se construisent

| # | Point | État | Nature | Est. | Ce qui décide de la nature |
|---|---|---|---|---|---|
| 0 | **Équipe et indépendance** | **fait** | construction neuve | — | Livré : déclarations empilées, refus d'affecter, obstacles au visa, isolation éprouvée. |
| 1 | Création du dossier — entité, exercice, référentiel, **acceptation et maintien**, jalons, lettre de mission | partiel | **neuf** (acceptation, jalons, lettre) + **portage** (jalons du prototype) | 2–3 | L'entité, l'exercice et le référentiel existent (semés). L'acceptation/maintien n'existe nulle part. Les **jalons** sont un portage direct : quatre dates, une règle d'échéance, un délai d'assemblage dérivé. |
| 2 | **Reprise N-1** — papiers, notes, facteurs, scoping proposé et « à reconfirmer » | **absent** | **neuf** | 2 | Le prototype a la *marque* « à reconfirmer » sur les travaux, pas la reprise elle-même. Il faut un exercice N-1 réel à reprendre : c'est neuf des deux côtés. |
| 3 | Import balance N et N-1, grand livre, rapprochement | **fait** | — | — | Existe, testé, avec la limitation de rapprochement documentée. Rien à faire. |
| 4 | Matérialité et scoping | **fait** | — | — | Existe, avec « jamais NS en silence ». Rien à faire. |
| 5 | **Évaluation du risque par assertion** — et elle **commande** procédures et étendue | **prototype seul** | **portage lourd** | 3–4 | La logique est écrite et éprouvée dans le prototype (facteurs observés/déclarés, niveau calculé puis retenu, surcharge motivée). Le portage est lourd parce qu'il faut le **maillon** : `risque(assertion) → procédures requises → taille`. C'est le chaînon manquant entre le scoping et les travaux. |
| 6 | Procédures du poste, population explicite, sélection | partiel | **portage** | 2 | L'application a population + sondage + MUS pour le chiffre d'affaires. Manquent : la **liste par assertion** issue du point 5, et l'affichage de la méthode là où elle s'exécute. |
| 7 | **La boucle requête ↔ documentation, VISIBLE comme une boucle** | partiel | **construction neuve d'assemblage** | 3–4 | Chaque maillon existe séparément (requête, portail, dépôt, extraction, vouching, écart, résolution probante, cumul). Ce qui n'existe pas, c'est **la boucle comme objet** : un écran qui la montre tourner, et la demande de clarification qui **repart** de l'écart. C'est le cœur du produit. |
| 8 | Papier de travail, notes de revue, visas, obstacles au visa | partiel | **portage** | 2 | Papiers, notes et visas existent (avec l'ordre des visas en contrainte). Manquent : les **obstacles au visa** comme liste calculée et transverse — le prototype les a, l'application non. |
| 9 | **Pointage des états financiers** — trois natures de rapprochement | **prototype seul** | **portage** | 2 | Logique complète dans le prototype (solde de balance · agrégat de comptes · calcul à documenter). Portage direct, plus le dépôt de la plaquette par le portail. |
| 10 | **Achèvement** — événements postérieurs, continuité, anomalies non corrigées et opinion, lettre d'affirmation, gouvernance | **prototype seul** | **portage** | 3 | Les huit écrans existent dans le prototype. L'incidence sur l'opinion et le cumul non corrigé s'appuient sur des moteurs que l'application a déjà. |
| 11 | Assemblage et clôture — verrouillage, export scellé autoportant | **fait** | — | — | Existe : archive rejouable à l'octet près, empreintes re-vérifiées, README sans lien externe. Reste à **brancher** l'achèvement dessus. |

**Transverse, à faire une fois et qui sert partout** — la méthodologie comme donnée démontrable
(écran du catalogue chargé, chargement d'un catalogue différent par mandat, isolation du catalogue
par cabinet) : **neuf**, 2 séances. Détail plus bas.

---

## Ce que ce tableau dit, en trois lignes

1. **Trois points sur onze sont finis** (3, 4, 11) et deux le sont à moitié (6, 8). L'application est
   plus avancée que la liste ne le laisse croire.
2. **Le seul chaînon vraiment manquant est le point 5** — le risque par assertion qui *commande*.
   Sans lui, le scoping et les travaux ne se parlent pas, et tout le reste reste une juxtaposition.
3. **Le point 7 est le produit.** Ce n'est pas du code neuf, c'est de l'**assemblage rendu visible** :
   les maillons existent, la boucle n'existe pas comme objet qu'on montre.

## L'ordre que je recommande, et pourquoi

**5 → 6 → 7** d'abord, dans cet ordre et sans rien intercaler. C'est la seule séquence qui produise
une démonstration à chaque étape : le risque commande les procédures, les procédures produisent les
sélections, les sélections font tourner la boucle. Les points 1, 2, 9, 10 sont des **extrémités** —
ils encadrent une mission dont le milieu doit d'abord tenir.

Ensuite **8** (les obstacles au visa fermant le milieu), puis **1 et 2** (le début de la mission),
puis **9 et 10** (la fin), puis **11** (le branchement).

La méthodologie-comme-donnée se place **avec le point 5** : c'est là que le catalogue commence à
commander quelque chose, donc là que « votre méthode reste la vôtre » devient démontrable plutôt
que promis.

---

## La méthodologie est de la donnée — ce qu'il faut pour que ce soit démontrable

L'argument de vente est : *« votre méthode reste la vôtre, vous la chargez, je ne la vois jamais. »*
Trois choses le rendent vrai, et chacune se montre en trente secondes.

### a. Un écran qui montre le catalogue chargé et d'où il vient

Il affiche : la version, le nombre de procédures par cycle, les sources **avec leur état de
vérification**, et le fait qu'ajouter une procédure est **du contenu**. La preuve tient dans le
geste : on modifie `methodology/procedures.json`, on recharge, la procédure est là — aucune
compilation, aucune ligne de code.

**État** : le chargeur, le validateur et les types existent (`app/src/lib/methodology/`). L'écran
n'existe pas. **Neuf**, 1 séance.

### b. Charger un catalogue différent sur un mandat

Un mandat porte aujourd'hui `framework_set` (les packs). Il lui faut, en plus, un **catalogue de
procédures** propre au cabinet : une colonne `methodology_id` sur `engagement`, une table
`firm_methodology` portant le JSON validé, et le chargeur qui lit celui du mandat plutôt que le
fichier du dépôt. L'import peut rester rudimentaire — coller un JSON, le valider, le refuser avec
ses erreurs en toutes lettres.

**Ce qui est déjà acquis** : le validateur refuse un catalogue invalide **avant** de le charger, et
il refuse une règle de date que le moteur n'implémente pas (ADR-057). Un cabinet ne peut donc pas
charger un catalogue qui casserait silencieusement le moteur — c'est la garantie qui rend l'import
acceptable.

**État** : **neuf**, 1 séance.

### c. L'isolation du catalogue

Le catalogue d'un cabinet appartient à ce cabinet, comme ses données : `firm_methodology.tenant_id`,
politique RLS, et la garde applicative `assertSameFirm` déjà écrite pour l'équipe. Le test se calque
sur `team.test.ts` : on **tente** de charger le catalogue d'un autre cabinet, et on vérifie qu'on ne
peut pas.

**Précision sur l'existant** : `tenant_id` est déjà sur toutes les tables racines, avec RLS
(migration 0004) et une garde applicative. Ce n'est donc pas une fondation à poser — c'est une
fondation à **utiliser**, et à prouver sur un objet de plus.

**État** : **neuf**, mais petit : ½ séance une fois (b) fait.

---

## Ce que je ne construirai pas, et qu'il faut dire

- **Aucun cycle au-delà du chiffre d'affaires.** Ni achats, ni paie, ni stocks, ni immobilisations.
  Le catalogue les décrit déjà (15 cycles) ; le produit ne les **exécutera** pas.
- **Aucun contenu de procédure nouveau.** Les 56 procédures existantes suffisent à démontrer la
  mécanique ; en écrire d'autres serait écrire ce que le client remplacera.
- **Le pack SOX reste en l'état.** Il tourne, il est testé, il ne bouge pas tant que Q6 de
  `docs/10_FALSIFICATION.md` n'a pas parlé.
