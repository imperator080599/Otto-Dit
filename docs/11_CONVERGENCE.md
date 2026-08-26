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
| 2a | **Un dossier N-1 réel à reprendre** | **absent** | **neuf** | 2 | La balance N-1 existe (`dataset/tb_2024.csv`, importée en `periodKind: 'prior'`) : les **comparatifs** sont acquis. Ce qui manque est un **dossier** FY2024 — papiers, notes, facteurs, décisions de scoping — car on ne reprend pas des chiffres, on reprend des conclusions. Il sera construit **par les mêmes services que les clics**, comme le déroulé du prototype : jamais des lignes fabriquées. Pas besoin d'un FEC 2024 : ce qui se reprend ne vient pas du grand livre. |
| 2b | **Le mécanisme de reprise** — proposé, marqué « à reconfirmer », jamais repris en silence | **absent** | **neuf** | 2 | Le prototype a la *marque* « à reconfirmer », pas la reprise. Règle : rien n'est repris automatiquement ; tout arrive **proposé**, et un papier N-1 non reconfirmé est un **obstacle au visa**. |
| 3 | Import balance N et N-1, grand livre, rapprochement | **fait** | — | — | Existe, testé, avec la limitation de rapprochement documentée. Rien à faire. |
| 4 | Matérialité et scoping | **fait** | — | — | Existe, avec « jamais NS en silence ». Rien à faire. |
| 5a | **Évaluation du risque par assertion** — et elle **commande** procédures et étendue | **prototype seul** | **portage lourd** | 3–4 | La logique est écrite et éprouvée dans le prototype (facteurs observés calculés par règles, facteurs déclarés, niveau calculé puis retenu, surcharge motivée). Le portage est lourd parce qu'il faut le **maillon** : `risque(assertion) → procédures requises → taille`. C'est le chaînon manquant entre le scoping et les travaux. |
| 5b | **Questionnaire résiduel de risque** — objet distinct, avec ses règles de blocage propres | **prototype seul** | **portage** | 1–2 | *Ne se confond pas avec 5a.* Six questions par section et quatre d'entité, chacune portant la raison pour laquelle elle existe encore. Ses règles bloquent par elles-mêmes : **une question sans réponse est un obstacle au visa**, un « oui » **sans précision écrite** aussi, et une réponse « oui » **crée un facteur au registre** — elle ne coche rien. Le contenu est déjà parti dans `methodology/questionnaire.json` (ADR-062), validé, avec portées et natures en énumérations qui arrêtent l'assemblage. Reste le moteur et l'écran. |
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

## L'ORDRE RETENU

> **5 + méthodologie-comme-donnée → 6 → 7 → 1 → 2 → 9 → 10 → 8 → 11**

**5 → 6 → 7 d'abord, sans rien intercaler.** C'est la seule séquence qui produise une démonstration à
chaque étape : le risque commande les procédures, les procédures produisent les sélections, les
sélections font tourner la boucle. Le point 5 est la clé de voûte — c'est lui qui fait que le risque
**commande** au lieu de décorer.

**Puis 1 et 2, avant le 8.** Correction de ma première proposition, et la raison est meilleure que la
mienne : les obstacles au visa sont un **raffinement de qualité**, l'arc tourne sans eux ; la création
du dossier et le pointage sont **les deux bouts**. Tant qu'ils manquent, toute démonstration commence
au milieu d'un dossier — exactement le défaut qu'on cherche à corriger. **On ferme l'arc, puis on
polit le milieu.**

**Ensuite 9 et 10** (la fin de la mission), **8** (les obstacles au visa), **11** (le branchement de
l'achèvement sur la clôture, qui existe déjà).

La méthodologie-comme-donnée va **avec le point 5** : c'est là que le catalogue commence à commander
quelque chose, donc là que « votre méthode reste la vôtre » devient démontrable plutôt que promis.

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

## Le total, et ce qu'il ne couvre pas

| Bloc | Séances |
|---|---|
| 5a risque par assertion | 3–4 |
| 5b questionnaire résiduel | 1–2 |
| méthodologie-comme-donnée (a + b + c) | 2½ |
| 6 procédures et sélection | 2 |
| 7 la boucle visible | 3–4 |
| 1 création du dossier | 2–3 |
| 2a dossier N-1 à reprendre | 2 |
| 2b mécanisme de reprise | 2 |
| 9 pointage des états financiers | 2 |
| 10 achèvement | 3 |
| 8 obstacles au visa | 2 |
| 11 branchement de la clôture | ½ |
| ancienneté par client et rotation du signataire | 1 |
| **Total** | **26 à 30** |

**C'est au-dessus des 20 à 24 estimés**, et il faut le dire avant de commencer plutôt qu'au milieu.
Deux causes, toutes deux identifiées après coup : le **dossier N-1 à reprendre** (2 séances) n'était
pas chiffré — ma première estimation ne couvrait que le mécanisme — et **l'ancienneté et la rotation
du signataire** (1 séance) ont été ajoutées à la file. Le reste de l'écart est la fourchette haute.

**Ce que le total ne couvre pas, et qui n'est pas dans ce plan** : le déploiement, la relecture des
sources normatives, l'envoi réel de courriels, l'ergonomie sur téléphone des écrans applicatifs, et
toute reprise du prototype au-delà des points listés.

## Ce qui reste vrai à chaque livraison

- **Aucun cycle au-delà du chiffre d'affaires**, aucun contenu de procédure nouveau, **pack SOX gelé**.
- **Le catalogue méthodologique reste NON VÉRIFIÉ** — 19 sources, toutes `verifie: false`, plus les
  quatre seuils d'indépendance. À redire à chaque livraison, sans exception.
- **En file, courtes et déterministes** : l'ancienneté par client (nombre d'exercices consécutifs) et
  la rotation du signataire. Les paramètres sont déclarés dans `methodology/independance.json` ; rien
  ne les calcule encore.

## Ce que je ne construirai pas, et qu'il faut dire

- **Aucun cycle au-delà du chiffre d'affaires.** Ni achats, ni paie, ni stocks, ni immobilisations.
  Le catalogue les décrit déjà (15 cycles) ; le produit ne les **exécutera** pas.
- **Aucun contenu de procédure nouveau.** Les 56 procédures existantes suffisent à démontrer la
  mécanique ; en écrire d'autres serait écrire ce que le client remplacera.
- **Le pack SOX reste en l'état.** Il tourne, il est testé, il ne bouge pas tant que Q6 de
  `docs/10_FALSIFICATION.md` n'a pas parlé.
