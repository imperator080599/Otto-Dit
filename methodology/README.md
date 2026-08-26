# methodology/ — le catalogue de procédures et le questionnaire de risque

Ce dossier contient le **contenu méthodologique** d'OTTO, sous forme de **données structurées**.
Ce n'est pas du code, et il ne vit ni dans le prototype ni dans l'application : les deux le
**consomment**, aucun des deux ne le contient en dur.

C'est délibéré. Ce catalogue est l'actif le plus coûteux à produire du produit ; l'enfermer dans
un fichier HTML de démonstration reviendrait à le payer deux fois et à laisser la version qui
compte dans une impasse.

## Fichiers

| Fichier | Rôle |
|---|---|
| `procedures.json` | le catalogue : une entrée par procédure, par cycle |
| `questionnaire.json` | le questionnaire **résiduel** de risque : ce qu'aucune autre source du dossier ne peut lever |
| `sources.json` | le registre des sources, avec leur état de vérification |
| `schema.json` | le schéma JSON qui valide `procedures.json` — les deux consommateurs le vérifient |
| `schema-questionnaire.json` | le schéma JSON qui valide `questionnaire.json` |
| `valider.mjs` | **le** validateur et le chargeur, sans dépendance. Appelé par l'application et par le générateur du prototype : une seule implémentation, versionnée avec les données qu'elle valide |

## Ce que porte une procédure

`cycle` · `libelle` · `objectif` · `assertion` servie · **`sens` du test** · `unite`
d'échantillonnage · `population` (libellé, source, période, filtre) · `justificatifs` attendus,
chacun avec ses **champs à relever** et le **contrôle** à opérer · `exceptions` · `sources` ·
`risque_minimum` à partir duquel la procédure est requise · `selection` quand la méthode impose
son étendue.

### Ce qui se relève et ce qui se contrôle

Deux choses différentes, longtemps confondues. Un champ ordinaire porte `controle_contre`,
`reference` et une `regle` : sa valeur relevée se compare à une référence, et l'écart est une
exception. Un champ marqué **`releve_seul`** se relève et **ne se compare à rien** : il alimente
le jugement ou un autre contrôle, et ne produit jamais d'écart.

L'exemple est la recherche de passifs non enregistrés. La date du fait générateur se **relève** —
c'est elle qui dit si une dette était attendue à la clôture. Le contrôle, lui, est la **recherche**
de cette dette au bilan de clôture. Traiter la date comme un contrôle relevait comme anomalie
toute facture normale du cycle : le validateur interdit désormais qu'un champ porte à la fois
`releve_seul` et une `regle`.

### Les règles de date sont une ÉNUMÉRATION, et le validateur la fait respecter

`schema.json` porte `regles_date` : la liste des règles que le moteur sait appliquer à un champ de
type `date` — `dans l'exercice`, `antérieure ou égale`, `postérieure`, `même exercice que la
référence`. Une règle de date **hors de cette liste arrête l'assemblage**.

Ce n'est pas de la coquetterie. Le catalogue écrivait `dans l'exercice` avec l'apostrophe **droite**
(la seule commode en JSON) tandis que le moteur comparait à l'apostrophe **typographique** : aucun
cas ne correspondait, l'exécution filait au comportement par défaut — comparaison à la tolérance,
nulle — et le contrôle relevait comme anomalie **soixante-seize factures parfaitement normales sur
cent quinze**. Le vrai défaut n'était pas la lettre, c'était le **défaut silencieux**. La comparaison
normalise désormais l'apostrophe, et l'énumération empêche qu'une règle que personne n'implémente
puisse être nommée.

### Étendue imposée : `selection`

`"selection": "exhaustive_au_seuil"` dit qu'il n'y a **aucun tirage** : tous les éléments de la
population sont testés, et l'étendue se règle par le **seuil de remontée** qui borne la
population, pas par une taille d'échantillon. C'est le cas des tests d'exhaustivité — sonder une
population que l'on cherche précisément à compléter ne prouve rien sur ce qui en est absent.
L'écran n'offre alors pas le choix de la méthode, et le garde-fou d'exhaustivité ne s'applique
pas : il signale qu'on teste presque tout **sans l'avoir décidé**, or ici c'est décidé et écrit.

### Le sens du test

C'est la donnée qui manquait le plus. Sept valeurs, dont deux symétriques :

- **`gl_vers_piece`** — du grand livre vers la pièce. Sert la **réalité** : ce qui est
  comptabilisé existe.
- **`piece_vers_gl`** — de la pièce vers le grand livre. Sert l'**exhaustivité** : ce qui existe
  est comptabilisé. C'est le sens qu'on oublie, et c'est celui de la recherche de passifs non
  enregistrés, de la revue des charges d'entretien, du cut-off des réceptions.

Les cinq autres : `recalcul`, `confirmation`, `observation`, `analytique`, `inspection`.

## Le questionnaire résiduel de risque

La plupart des facteurs qualitatifs **remontent** par le registre depuis les procédures qui les
captent : un écart de rapprochement, une écriture de direction, une pièce datée hors exercice se
posent seuls sur les sections concernées. Le questionnaire ne garde que le **résiduel** — ce
qu'aucune autre source du dossier ne couvre.

C'est pourquoi chaque question porte `pourquoi` : **la raison pour laquelle elle existe encore**,
c'est-à-dire ce que le reste du dossier ne sait pas dire. Si cette raison tombe, la question doit
**disparaître**, pas rester « au cas où ». Quand l'échéance est connue, `disparait_quand` la nomme :
la question `CI` s'en va le jour où le module de contrôle interne existe, `GOUVERNANCE` le jour où
les procès-verbaux entrent au dossier.

Chaque question porte aussi `effet` : ce qu'une réponse « oui » **change** à l'approche. Une
question dont la réponse ne change rien ne doit pas être posée.

### Deux portées, et c'est ce qui évite le questionnaire de cinquante lignes

- **`entite`** — posée **une fois** pour le dossier ; le facteur qu'elle crée touche tous les
  postes retenus (la direction, la pression sur le résultat, la fraude, la gouvernance).
- **`section`** — posée **dans la section**, parce que la réponse peut différer d'un cycle à
  l'autre.

Six questions par section, quatre pour l'entité. Une portée inconnue **arrête l'assemblage** :
sans cela, un `portee` mal orthographié tomberait silencieusement du côté « section » et la
question d'entité serait posée dix-neuf fois au lieu d'une. Même règle pour la `nature` de risque
inhérent, qui doit exister dans `natures_ri` — et le validateur refuse aussi un questionnaire dont
une portée entière serait vide, parce que cela rendrait un écran vide sans rien dire.

### Le vocabulaire des natures est NON VÉRIFIÉ, comme le reste

`natures_ri` — changement, complexité, incertitude, biais possible de la direction, plus le risque
de contrôle qui n'est pas un facteur inhérent — reprend le vocabulaire des référentiels d'audit.
Il cite `ISA-315` et `ISA-240`, tous deux `verifie: false` : voir la section sur la vérification
des sources plus bas. Aucune de ces natures n'a été confrontée à un texte primaire.

## Prédicats et résolveurs : où passe la frontière

Une population ne se décrit pas entièrement en données — il faut un jour lire le grand livre.
Le catalogue **nomme** le prédicat (`decaissements_apres_cloture`) et ses paramètres ; le code
l'**implémente**. Même chose pour les champs : le catalogue nomme la référence à laquelle
comparer (`montant_ligne`), le code sait la calculer.

`"predicat": "non_implemente"` marque une procédure **cataloguée mais non exécutable** sur les
données disponibles — elle apparaît dans le plan de travail avec la raison, et ne produit aucune
sélection. Elle n'est jamais simulée.

Un prédicat peut aussi être **nommé** par le catalogue et **absent** du consommateur : le
prototype déclare alors la raison (`PREDICATS_ABSENTS`), l'affiche, et la procédure cesse de se
présenter comme échantillonnée. Un prédicat nommé que personne n'implémente ni ne déclare absent
est un défaut de construction : le harnais du catalogue le relève.

## Vérification des sources — lire ceci avant de citer quoi que ce soit

Aucun texte normatif primaire n'a pu être atteint depuis l'environnement de développement :
`legifrance.gouv.fr`, `cncc.fr`, `pcaobus.org`, `ifac.org` et `iaasb.org` sont tous bloqués par
le proxy réseau. En conséquence :

- **toutes** les entrées normatives de `sources.json` portent `verifie: false`, avec la raison ;
- **aucun numéro de paragraphe n'est cité**, nulle part ;
- **aucun numéro de NEP n'est cité** ;
- les procédures dont le fondement est une règle française non vérifiée (DSN, URSSAF, TVA,
  conventions réglementées) portent `[UNVERIFIED]` dans leur `note`.

Ce qui est corroboré l'est par recherche documentaire, et `corrobore_par` dit par quoi. Le
catalogue est donc de la **pratique professionnelle structurée**, à confronter aux textes avant
tout usage réel.

## Couverture

56 procédures, 15 cycles, sept sens de test ; 10 questions résiduelles (4 d'entité, 6 de
section) et 5 natures de risque. Les postes `AMORT`, `AUTRES_PR`, `CHARGES_EXT` et
`FINANCIER` ne portent aujourd'hui que les six procédures transverses : c'est un choix assumé —
leur audit passe par le test de détail, la revue analytique et les procédures du cycle qui les
alimente (immobilisations pour les dotations, achats pour les charges externes) — et non un oubli.

## Consommation

- **Prototype** : `prototype/src/build.sh` engendre `_catalogue.gen.js` depuis ce dossier à
  chaque assemblage. Le fichier engendré n'est pas versionné.
- **Application** : `app/src/lib/methodology/` charge les JSON par `valider.mjs` et les expose
  typés (`types.ts`). `catalogue.test.ts` échoue si le catalogue et le schéma divergent, si une
  source non vérifiée n'a pas de raison écrite, si un numéro de paragraphe est cité, ou si une
  procédure nomme une source absente du registre. `questionnaire.test.ts` échoue si une portée
  ou une nature est inconnue, si une portée entière est vide, si une raison d'exister est recopiée
  d'une autre question, ou si une source citée cessait d'être marquée non vérifiée sans qu'on l'ait
  décidé.

Les deux passent par **le même validateur**. Un catalogue invalide arrête l'assemblage du
prototype (`exit 1`) et fait échouer la suite de l'application : on ne livre pas un produit bâti
sur des données qu'on n'a pas vérifiées.
