# DÉCISIONS AUTONOMES — mandat v1 (2026-08-31 →)

Format imposé par le mandat : question posée · options · décision retenue · raison ·
coût pour revenir en arrière. Une décision par entrée, jamais supprimée.

## DA-01 — Ordre effectif du backlog

**Question.** Le mandat ordonne P0 → 2 → 10 → 12 → 9 → 8 → 1, 5, 11, 3, 4, 6 → 7, mais
10, 12, 11 et 1 sont déjà livrés (commits 1d16403, 55842ab, 29b5907, f33442b).
**Options.** (a) Rejouer les points faits ; (b) les marquer `fait` au registre et suivre
l'ordre sur ce qui reste.
**Décision.** (b) : P0 → finir 2 → 9 (§3.D) → 8 → 5 → 3 → 4 → 6 → 7, en intercalant les
exigences §3 nouvelles (M-13 à M-17) au plus près des écrans qu'elles touchent.
**Raison.** Le mandat dit « tu ne réécris pas ce qui marche » ; l'ordre visait « le meilleur
d'abord », déjà satisfait pour 10/12.
**Coût de retour.** Nul — l'ordre restant est re-priorisable à tout moment.

## DA-02 — Mandat contre « périmètre gelé » (CLAUDE.md règle 14)

**Question.** CLAUDE.md gèle : aucun cycle au-delà du chiffre d'affaires, aucun contenu de
procédure nouveau, SOX gelé. Le mandat exige budget/heures, continuité d'exploitation,
bascule de référentiel comptable (PCG/IFRS/US GAAP).
**Options.** (a) Refuser au nom du gel ; (b) appliquer le mandat et noter la contradiction.
**Décision.** (b) — le mandat le dit lui-même : « en cas de contradiction, ce mandat gagne,
et tu notes la contradiction ». Le gel RESTE appliqué là où le mandat ne demande rien :
aucun nouveau cycle de testing substantif (achats, paie…) ne sera ouvert ; budget/heures et
continuité sont des travaux transverses, pas des cycles ; les packs restent du CONTENU,
jamais un fork de code.
**Coût de retour.** Faible — chaque ajout est une tranche isolée, retirable.

## DA-03 — Déploiement : Vercel non autorisé dans la session

**Question.** Le mandat fait de l'URL la priorité absolue (« l'accès est donné »). Dans
cette session, le connecteur Vercel exige une autorisation OAuth impossible en session non
interactive ; aucun jeton Vercel n'est présent dans l'environnement.
**Options.** (a) Attendre ; (b) déployer ailleurs ; (c) préparer TOUT le déploiement
(config, garde-fous, données reconstruites, bandeau) pour qu'il tienne en un geste, le dire
à Tuan en une ligne, et continuer le backlog.
**Décision.** (c). Pas (b) : le mandat nomme Vercel.
**Raison.** « Aucune question bloquante » — mais publier une URL est un acte externe qui
exige l'accès ; tout le reste du chemin critique est, lui, faisable maintenant.
**Coût de retour.** Nul.
**CORRIGÉ (2026-08-31, DA-09).** Le diagnostic de cette entrée était FAUX : le blocage
n'était pas le connecteur mais la configuration du projet (Root Directory ≠ app/, branche
de production obsolète) — et je l'ai affirmé sans avoir chargé l'URL. L'entrée reste, comme
trace de l'erreur ; la règle de classe est en DA-09.

## DA-04 — Vidéo d'entretien (F-14)

**Question.** L'idée d'origine intègre la vidéo de la réunion de contrôle interne.
**Options.** (a) Ingestion vidéo + transcription automatique ; (b) transcript collé, vidéo
reportée.
**Décision.** (b), état `reporté` au registre.
**Raison.** La transcription vidéo exige un service externe (coût, données personnelles,
consentement) ; le geste d'audit — confronter le dit au documenté — est entièrement couvert
par le transcript (ADR-108). La précaution juridique (docs/14) est déjà en place et
s'étendrait telle quelle à la vidéo.
**Coût de retour.** Faible — l'analyste prend du texte ; un transcripteur amont s'ajoute
sans toucher au reste.

## DA-05 — « Les agents retiennent les audits passés » (F-24)

**Question.** L'idée d'origine veut des agents qui s'améliorent en continu sur un même client.
**Options.** (a) Apprentissage continu du modèle ; (b) reprise N-1 structurée + méthode
versionnée, apprentissage reporté.
**Décision.** (b), état `reporté`.
**Raison.** Un comportement qui dérive sans provenance contredit la piste d'audit (P7) et
l'exigence de rejouabilité (règle 12) : on ne peut pas expliquer « pourquoi cette
conclusion » si le modèle a changé silencieusement. Le besoin réel — ne pas repartir de
zéro chez le même client — est couvert par le carry-forward structuré.
**Coût de retour.** Moyen — un jour, des exemples few-shot PAR CLIENT versionnés dans la
méthode seraient la voie compatible.

## DA-06 — « Chatbot général » rendu comme « Interroger » (F-09)

Décision HISTORIQUE (ADR-017), consignée ici parce que le registre la référence : pas de
prose libre sur le dossier — un catalogue fermé de requêtes, le modèle ne fait que choisir.
Raison : une réponse en prose non sourcée dans un dossier d'audit est une affirmation sans
preuve. Coût de retour : nul (le catalogue s'étend).

## DA-07 — Correctif du commit 27171bc (invariant « vert avant commit »)

**Question.** Le mandat cite 27171bc — commité pendant que la chaîne tournait — comme
l'exemple à ne pas reproduire.
**Décision.** Règle d'exécution adoptée : plus aucun commit tant que `npm run verify` n'a
pas rendu son verdict sur l'état exact commité ; si un état intermédiaire doit être commité
(sauvegarde), la PREMIÈRE ligne du message dit ce qui n'est pas prouvé.
**Coût de retour.** Sans objet.

## DA-08 — Le magasin de pièces de la démo hébergée vit dans Postgres

**Question.** DEPLOY.md prescrit un bucket Supabase Storage ; sur Vercel le disque est
éphémère et par instance — PGlite comme le magasin fichiers y sont inutilisables au runtime.
**Options.** (a) Bucket Storage (nouvel identifiant, nouvel adaptateur HTTP) ; (b) table
`blob_store` (bytea) dans la MÊME base, même identifiant, RLS applicable.
**Décision.** (b) pour la démo (OTTO_STORAGE=db) ; le bucket reste la voie « échelle
production » du runbook. Corollaire dit : PGlite n'écrit pas sur Vercel — sans
DATABASE_URL, l'application hébergée ne peut pas fonctionner, et le pilote réseau est donc
le SEUL chemin là-bas.
**Coût de retour.** Faible — l'interface du magasin est à trois fonctions.

## DA-09 — Règle de classe : la preuve d'un service externe est la réponse obtenue

**Contexte.** J'ai rapporté P0(a) « bloqué : connecteur non autorisé » alors que le projet
Vercel existait, que 17 déploiements READY servaient du vide, et que l'URL rendait 404 —
sans l'avoir jamais chargée. READY n'est pas une preuve ; un statut n'est pas un écran.
**Décision.** Partout où le travail dépend d'un service externe, la vérification est la
RÉPONSE OBTENUE (code HTTP + contenu lu), jamais le statut annoncé ni la configuration
supposée. P0(a) n'est fini que quand j'ai chargé l'URL, ouvert un dossier et affiché
l'atelier de testing — et rapporté ce que j'ai lu.
**Coût de retour.** Sans objet — c'est un resserrement, pas un choix.

## DA-10 — Sur Vercel, tout déploiement EST la démo publique

**Question.** Le garde « démo publique » (bandeau, IA coupée, reconstruction destructrice
autorisée) dépendait d'une variable de tableau de bord qu'on peut oublier.
**Décision.** `demoPublique()` est vraie dès que VERCEL=1 (posée par la plateforme
elle-même) — le garde ne dépend plus d'aucun réglage humain. Le jour d'une vraie
production hébergée, cette ligne se revoit explicitement.
**Coût de retour.** Une ligne.

## DA-11 — Le Root Directory Vercel RESTE la racine du dépôt (décision de Tuan, gravée)

**Décision (Tuan, 2026-08-31).** Root Directory = racine ; le `package.json` racine
(détection de Next, jamais installé au-delà) et le `vercel.json` racine
(install/build/outputDirectory pointant sur app/) sont LE chemin retenu. Le mettre sur
`app/` ferait lire `app/vercel.json` et perdrait `deploy:reconstruire`.
**Conséquence.** `app/vercel.json` est SUPPRIMÉ — une seule configuration, aucune
divergence possible. **Aucune session future ne « corrige » ce réglage** : cette entrée
existe pour être trouvée avant le zèle.

## DA-12 — Pooler de transaction et verrous : la portée est choisie EN CONNAISSANCE

**Question (soulevée par Tuan).** Le pooler de transaction Supabase (port 6543) ne
supporte ni les requêtes préparées nommées ni les fonctionnalités de SESSION — dont
`pg_advisory_lock` (portée session).
**Analyse.** Le verrou de la chaîne d'événements est `pg_advisory_xact_lock` — portée
TRANSACTION, pris à l'intérieur de `tx()` (BEGIN…COMMIT épinglés sur une seule connexion
serveur) : compatible avec le pooling de transaction. `set_config(..., true)` du test de
fuite est aussi transaction-scoped. node-postgres n'emploie pas de requêtes préparées
nommées sans qu'on lui en donne (`name`), et le code n'en donne jamais.
**Décision.** Le pooler de TRANSACTION (6543) sert TOUT le runtime applicatif ; rien dans
le code ne doit exiger une session — et c'est APPLIQUÉ par test :
`app/src/lib/db/pooler-compat.test.ts` fait échouer la suite si `pg_advisory_lock(`
(session), `prepare … as`, `listen `/`notify ` ou un `name:` de requête préparée entrent
dans src/. La preuve d'exécution : le semis du monde entier au build traverse des
centaines de logEvent (verrou + insertion) sur le vrai pooler — un build vert est la
démonstration.
**Coût de retour.** Si un besoin de session naît un jour (LISTEN/NOTIFY…), il prend une
CONNEXION DÉDIÉE au pooler de session, nommée et justifiée ici.

## DA-13 — Un document ENGENDRÉ ne se commit qu'avec l'exécution qui l'a produit

**Défaut constaté (revue hostile, tranche 9).** `docs/DENSITE.md` a été publié avec des
lignes `0 | 0` sur des écrans qui portent des boutons inconditionnels : la mesure et le
document ne venaient pas du même état, et rien dans le fichier ne permettait de s'en
apercevoir. Un document engendré est une AFFIRMATION dès qu'il quitte l'exécution qui l'a
produit.
**Décision.** Tout document engendré porte, EN TÊTE, le commit et l'identifiant de build
sur lesquels il a été mesuré ; il n'est commis que dans le même geste que l'exécution qui
l'écrit, et la mesure qui l'écrit fait partie de `npm run verify`. Une mesure qui refuse
de conclure n'écrit RIEN (elle ne publie pas un tableau partiel).
**Portée.** `docs/DENSITE.md` aujourd'hui ; tout futur tableau mesuré (coûts, temps,
couverture) demain.

## DA-14 — « Mes travaux » : on construit le point d'origine, on ne rabote pas le critère

**Question.** Le mandat mesure la navigation « en trois clics depuis Mes travaux ».
L'écran n'existait NULLE PART dans l'application (vérifié : zéro occurrence dans
`app/src`) — le critère portait sur un point de départ absent, et la tranche précédente
ne l'avait pas vu parce qu'elle avait cherché des dépassements d'actions, pas l'origine.
**Options.** (a) déclarer le critère inapplicable ; (b) le compter depuis l'accueil ;
(c) construire l'écran.
**Décision : (c).** L'écran est construit — DÉRIVÉ, sans une table de plus : notes
adressées ouvertes, papiers dont le prochain visa manque, demandes échues. Le lien vit
dans le bandeau (chrome, présent partout), et le parcours cliqué COMPTE les clics au lieu
de les affirmer.
**Ce que l'écran ne prétend pas savoir**, et qui est écrit dessus : quel membre doit poser
quel visa (le produit ne modélise pas ce droit ; le rôle de mission et l'ordre de visa ne
sont pas reliés). Une attribution inventée serait pire qu'une ligne honnête.

## DA-15 — Le nom d'un concept appartient au PACK, pas au lexique du produit

**Contradiction réelle.** Le fondateur demande « Calcul de la matérialité ». Le lexique
appliqué par test bannit « matérialité » au profit de « seuil de signification ». Les deux
ont raison dans leur registre : le Code de commerce et les NEP disent *seuil de
signification* ; les cabinets, dans leur usage quotidien, disent *matérialité*.

**Décision.** Le libellé devient **une donnée du pack de référentiel** (et, à terme, du
cabinet) — c'est exactement ce à quoi sert « la méthode nomme, le code calcule ». Par défaut
sur le pack France : **« matérialité »**, c'est-à-dire ce que le fondateur dit. Le lexique et
son test sont mis à jour en conséquence : la règle ne devient pas « le mot est libre », elle
devient « le mot vient du pack, et l'écran ne mélange jamais deux mots pour un concept ».

**Ce que ça ne change pas** : le concept, son calcul, ses seuils dérivés (performance, seuil
de remontée, anomalie tolérable) et leur documentation. Un renommage n'est pas un changement
de méthode.

## DA-16 — La chaîne verte ne prouve plus rien seule : le bout de la chaîne est l'URL

**Fait établi le 2026-08-31.** 529 tests, 78 routes balayées et 144 étapes cliquées passaient
au vert pendant que trois écrans rendaient 500 **en ligne** — pour un dossier oublié dans le
traçage serverless. La chaîne s'exécute sur PGlite, avec le dépôt entier sur le disque ; le
déploiement s'exécute dans une fonction qui n'emporte que les fichiers déclarés, sur un
Postgres réseau. Ce sont **deux exécutions différentes** (règle 11), et c'est la seconde que
le fondateur ouvre.

**Décision.** À partir d'ici : (1) `npm run fumee` fait partie de `npm run verify` — le
chemin est donc prouvé ; (2) après chaque déploiement, la même sonde est passée **contre
l'URL** (par qui peut l'atteindre) ou, à défaut, `/api/sante` est interrogée — les lectures
de chaque famille d'écrans exécutées DANS la fonction déployée ; (3) aucune tranche n'est
déclarée finie sur la seule foi de la chaîne locale.


## DA-17 — « Remettre à zéro » restaure un INSTANTANÉ, il ne rejoue pas le semis

**Contrainte, mesurée.** Semer le monde de démonstration passe par les mêmes services que
l'interface — c'est le prix de « aucun raccourci », et c'est ce qui fait de chaque
déploiement une vérification du pilote réseau. Sur la base Supabase, cela prend une dizaine
de minutes. Aucune fonction serverless ne vit aussi longtemps. Un bouton qui rejouerait le
semis serait donc un bouton qui échoue **toujours**.

**Décision.** Le build prend un **instantané** du monde juste après l'avoir semé : une copie
table par table dans le schéma `demo_instantane`, hors d'atteinte du public. Le bouton vide
les tables publiques et y réinjecte l'instantané dans l'ordre des dépendances, en une
transaction — quelques secondes. Les séquences sont recalées après coup : restaurer
`event_log` sans recaler la sienne ferait entrer le geste SUIVANT en collision, c'est-à-dire
au pire moment.

**Ce que « à zéro » veut dire, et l'écran le dit** : *à l'état du dernier déploiement*, avec
la DATE de l'instantané affichée. L'écran de confirmation ne demande pas « êtes-vous sûr ? » :
il montre, ligne par ligne, ce qu'il y a aujourd'hui et ce qui reviendra. Une confirmation
qui ne chiffre rien n'informe personne.

**Trois refus, dans le service et pas dans l'écran** : hors démonstration publique (aucun
écran ne rase un dossier d'audit) ; sans instantané (il n'y a rien à restaurer) ; si une
migration a changé la forme des tables depuis l'instantané (restaurer casserait la base — le
déploiement suivant le reprend, et le journal de build dit alors que « à zéro » ramènera à
l'état de CE déploiement, pas au monde semé).

**Ce que ça remplace.** `OTTO_RECONSTRUIRE=1` reste, pour le build ; mais la question « veux-tu
que je repasse la variable ? » ne se pose plus à Tuan — c'est un geste du produit.

## DA-18 — La règle de langue est STRUCTURELLE, pas linguistique

**Ce qui s'est passé.** La tranche « langue » a été livrée une première fois avec un test qui
prétendait la tenir : il cherchait des chaînes FRANÇAISES dans les nœuds JSX, et — pour ne
pas accuser le SQL — commençait par **effacer tous les littéraux**. Or c'est exactement là
que le français vivait : tables de libellés (`FAMILLES`, `NATURES`, états de circularisation),
ternaires (`cond ? 'oui' : 'non'`), services qui rendent les obstacles au visa. Le test
affichait « 0 reste » sur cent quatre-vingts chaînes affichées, dont la liste que lit un
signataire avant de signer. Un sous-agent hostile l'a établi ligne par ligne.

**La décision.** On ne devine plus la langue d'une chaîne — deviner, c'est se tromper, dans
les deux sens : « Select an object on the left » porte « on », et « Bonjour {nom} » n'a ni
accent ni mot-outil. La règle compte les **chaînes d'écran qui ne passent pas par le
catalogue**, quelle que soit leur langue. Elle est infalsifiable par une traduction partielle,
et elle vaut pour l'anglais autant que pour le français.

**Ce qu'elle a imposé au produit, pas seulement au test.** Un obstacle au visa n'est plus une
phrase mais un **motif** : une clé de catalogue et ses variables. Douze services le rendaient
en français ; l'écran « Ce qui empêche de signer » restait donc français sous un rail anglais.
Les tests affirment désormais QUEL obstacle est levé, au lieu de chercher un bout de phrase —
« chercher un mot n'est pas vérifier un chemin » (règle 15).

**Ce qui reste dehors, et c'est dit** : les messages de refus levés par les actions serveur
(13 au dernier compte, publié par le test). Ils portent des faits variables ; les figer en
libellés recopierait le défaut ailleurs. Ils appellent des codes d'erreur paramétrés — un
chantier de conception, pas une passe de traduction.

**Rejouable** : `npm run langue` rend la liste et le compte. Une vérification que personne ne
peut rejouer est une affirmation (règle 12).

## DA-19 — Le parcours cliqué lit le catalogue, il ne recopie plus les libellés

Le parcours cherchait des textes français écrits à la main. Le jour où l'interface a basculé,
dix-neuf stations ont échoué d'un coup **sans qu'aucune règle du produit n'ait bougé** : le
test mesurait le libellé, pas le comportement. Il lit désormais le même catalogue que l'écran
(`L('cle')`), dans la locale du cabinet de démonstration. Ce qui reste écrit en clair dans le
parcours est du CONTENU : noms de procédures, codes de contrôle, noms de fichiers du jeu de
données — c'est-à-dire ce qui ne change pas quand la langue change.

## DA-20 — Un balayage de prose a emporté HUIT chemins de lecture ; un garde les tient désormais

**Ce qui s'est passé.** Pour appliquer la règle du fondateur — pas de justification
pédagogique à l'écran — j'ai supprimé les paragraphes d'explication. Le balayage a emporté,
en même temps, **huit lectures de données** sur huit écrans :

| écran | ce qui a disparu |
|---|---|
| processus | qui a consenti à être enregistré, **quand**, et jusqu'à quand le transcript est conservé |
| papier de travail | le run du moteur, l'**empreinte des faits**, la langue — la provenance du papier (P7) |
| population | l'**empreinte de population** à laquelle l'échantillon se lie (ADR-016) |
| risque | la part de quantitatif (méthode / dossier) **et** les tailles d'échantillon écrites par le cabinet |
| équipe | le dénominateur du ratio SACC, le plafond retenu, son motif, et son éventuelle non-vérification |
| reprise N-1 | le **lien vers le dossier source** |
| réunions | quel adaptateur a lu quels agendas, et combien de créneaux en sortent |
| obstacles | le compte total et sa répartition par famille |

**Aucun test ne l'a vu.** Les services rendaient toujours les données, les écrans rendaient
toujours 200, la sonde de santé restait verte. Le parcours cliqué en a attrapé **une sur
huit** — le consentement — et je l'avais d'abord expliquée comme « un libellé qui a changé ».
C'est exactement l'hypothèse plausible que la règle 18 interdit désormais.

**Le garde.** `npm run lectures` compare les écrans à une référence (`origin/main` par défaut)
et refuse toute **expression de donnée** (`{objet.champ}`) retirée d'un écran et jamais
rétablie. Il compare sur le CHEMIN DE CHAMP, pas sur le nom de la variable : renommer `t` en
`x` dans un `map` n'est pas perdre une lecture, et un détecteur qui crie faux se fait taire.
Ce qu'il ne peut pas distinguer est **déclaré dans le script**, avec sa raison — aujourd'hui
la table de libellés propre au portail, remplacée par le catalogue.

**Éprouvé contre un cas connu mauvais** (règle 17) : `npm run lectures:epreuve` retire la
ligne du consentement, vérifie que la règle la dénonce, et remet le fichier.

## DA-21 — Les instruments s'éprouvent, et l'épreuve est dans la chaîne

`npm run langue:epreuve` injecte **cinq** défauts connus dans de vrais écrans et vérifie que
la règle échoue sur chacun : une phrase française dans un nœud JSX, une phrase rangée dans une
table de libellés, un bouton d'un seul mot en minuscule, **une chaîne anglaise** hors catalogue
(la règle est structurelle, pas linguistique — si elle ne voit que le français, elle n'a rien
prouvé), et un attribut de libellé d'un seul mot. Les cinq correspondent à une classe qu'une
version antérieure de la règle laissait passer : ce ne sont pas des cas imaginés, ce sont les
trous constatés.

Les deux épreuves entrent dans `npm run verify`, entre les tests et le balayage des écrans.
Un instrument qui n'a jamais échoué exprès n'a jamais été testé.

## DA-22 — La règle de langue voyait le code là où il y avait du texte

Cinquième et sixième versions de cet instrument, cinquième et sixième fois qu'il mesurait à
côté. Quatre classes de chaînes affichées lui échappaient, et chacune est devenue un cas
connu mauvais :

| classe | pourquoi elle échappait | exemple réel |
|---|---|---|
| entité HTML | `&amp;amp;` porte un **point-virgule**, et le filtre qui écarte le code écartait la phrase | `Approve & send (L2)` — le bouton qui envoie une demande au client |
| nom de touche | `Control` était dans la liste des touches du clavier, appliquée à un nœud JSX | l'en-tête de la première colonne du RCM |
| ternaire affiché | les deux branches partaient dans le seau des LITTÉRAUX, où un mot minuscule passe pour un identifiant | `{m.can_sign ? 'oui' : 'non'}` |
| moins de deux lettres | le tout premier filtre exigeait deux lettres de suite | `> 90 j (N)` — « j » pour jours |

Le ternaire n'est pris que s'il est **enfant JSX** (l'accolade qui suit `>` ou `}`) :
`defaultValue={x ? 'oui' : 'non'}` choisit une valeur d'option, pas un texte, et une règle qui
crie faux se fait taire.

`npm run langue:epreuve` : **12/12**. Le compte est publié à chaque exécution, ainsi que celui
des libellés **différés avec leur raison** (`npm run langue -- --differes` les déroule).

## DA-23 — Le catalogue était l'angle mort de sa propre règle : sept entrées à l'envers

La règle compte ce qui ne passe **pas** par le catalogue. Elle ne regardait donc jamais ce que
le catalogue **contient** — si bien que la façon la plus simple de rendre une phrase française
invisible était de l'écrire dans la colonne `en`. Sept entrées l'étaient :

    'mat.seuilDeSignification': { en: 'Seuil de signification', fr: 'Materiality threshold' }

Sur l'instance anglaise, l'écran des seuils affichait **« Seuil de signification »** juste à
côté de « Materiality » pour le même concept ; idem sur le testing et sur trois endroits du
papier de travail. Les sept sont remises à l'endroit, et deux paires devenues doubles ont
fusionné.

**La règle est linguistique ici, et elle a le droit de l'être.** Ailleurs, deviner la langue
d'une chaîne était le défaut ; dans un **dictionnaire bilingue**, c'est la seule question qui
se pose. On ne devine pas : on constate qu'une entrée porte, du mauvais côté, des mots-outils
ou des accents qui n'existent que dans l'autre langue.

**Ce qu'elle ne voit pas, mesuré plutôt que supposé** : on remet les sept inversions, une par
une, et on compte celles qu'elle dénonce — **cinq sur sept**. Une inversion d'un seul mot sans
mot-outil ni accent (« Joindre » contre « Attach ») lui échappe ; les deux qui restent ont été
trouvées à l'œil. Le test le dit en toutes lettres plutôt que de laisser croire à une règle
complète.

## DA-24 — Un écran irréprochable peut afficher du français : la règle suit les services

`NOTE_TYPES` portait « à corriger (bloquante) » dans `services/workpapers/lifecycle.ts`, et
deux écrans l'affichaient tel quel. La règle ne lisait que `src/app` : elle ne pouvait pas le
voir, et elle annonçait « 0 reste ».

**La règle est structurelle ici aussi** : une propriété qui s'APPELLE un libellé (`libelle`,
`label`, `titre`, `phrase`, `raison`) tient une **clé** du catalogue, jamais une phrase.
Beaucoup de services le faisaient déjà (`loop.ts`, `completion.ts`, `poste.ts`) — la règle
constate ce que le dépôt fait de mieux, elle ne l'invente pas.

Vingt-sept libellés relevés. Sept migrés (les quatre types de note, l'état de déclaration
d'indépendance en `Motif` avec ses variables). **Vingt et un différés, chacun avec sa raison
écrite dans `src/lib/langue.ts` et son compte publié** :

- `notes/otto.ts`, `workpapers/colonne.ts`, `provenance.ts` — un texte **écrit puis stocké**
  (réponse d'OTTO dans une note, interprétation figée d'une colonne) ne se relit pas dans une
  autre langue : la langue s'y décide à **l'écriture**, ce qui demande que le service reçoive
  la locale du cabinet. Chantier nommé, pas un `t()` de plus ;
- `acceptance.ts`, `reunions.ts` — ces phrases **côtoient du contenu de pack** (le catalogue de
  méthode NEP, en français) ou des codes bruts. Les traduire seules donnerait une liste moitié
  anglaise moitié française, pire que l'état actuel ; le pack est du contenu et le périmètre
  est gelé (règle 14).

Un `payload:` de journal n'est pas un libellé : il est écrit une fois dans `event_log` et le
traduire au rendu réécrirait l'histoire du dossier.

## DA-25 — Une station du parcours ne peut plus s'éteindre en silence

Le parcours porte cent quatre-vingts vérifications, beaucoup derrière un `if` (« si le bouton
est là, clique »). Le jour où le bouton change de nom, le `if` devient faux, la station
disparaît du rapport — et le rapport reste **vert avec moins d'étapes**. Le seul garde était
« au moins 30 étapes » : il dit combien, jamais **lesquelles**.

Deux gardes, un seul fichier figé (`docs/PARCOURS.json`) :

| garde | ce qu'elle voit | éprouvée par |
|---|---|---|
| `npm run parcours` (statique, 1 s) | une station **retirée ou renommée** dans le code | station retirée · station renommée · station littérale voisine d'une station construite · station construite |
| `npm run clics` (à l'exécution) | une station **figée mais jamais conduite** | une station retirée de la liste des conduites, et le cas symétrique (ne rien crier sur un parcours complet) |

`npm run parcours:epreuve` : **5/5**.

**Trois pièges, et ils étaient tous armés :**

1. *Un nom construit figé sur son DÉBUT.* « mes travaux : » — quatorze caractères — avalait les
   six stations qui le suivaient : toutes pouvaient s'éteindre sans que la garde bronche. Un nom
   construit est désormais figé comme une **expression ancrée aux deux bouts**.
2. *Figer sur un parcours vert n'est pas figer un parcours complet.* Le figé porte donc aussi,
   sous leur nom, les stations **déclarées et jamais atteintes** — trente-cinq aujourd'hui, la
   plupart des branches d'échec (« aucun papier dans le dossier »), et deux `if` sans `else` à
   qui on a rendu une voix.
3. *Une garde qui ne vérifie rien doit le dire.* Avec un figé vide, `jamaisAtteintes` rendait
   une liste vide et se laissait lire comme un succès — le défaut que cette garde existe pour
   attraper, appliqué à elle-même. Le parcours annonce désormais combien de stations figées il
   a vérifiées, et sort en échec si c'est zéro.

## DA-26 — Le parcours lit la langue réellement servie, et prouve ses absences dans les deux

`L('cle')` était figé sur l'anglais parce que c'est la locale du cabinet de démonstration.
Vrai aujourd'hui, écrit nulle part. Sur une instance servie en français, les sélecteurs du
parcours accrochent le vide : les stations de **présence** échouent bruyamment — on les
verrait — mais les onze stations d'**absence** passent en prouvant exactement rien.

1. **La langue se mesure.** Le parcours relève `<html lang>` au premier écran, la sert à `L`,
   et vérifie *sur cet écran* qu'un libellé de cette langue est bien affiché — un attribut
   correct sur un écran traduit autrement serait le même silence.
2. **Une absence se prouve dans les deux langues.** `compteAbsent(sel, cle)` compte sur les
   deux libellés. Ce n'est pas l'équivalent exact de l'ancien sélecteur (`hasText` lit le texte
   de tout l'élément) : le compte est plus large, donc un `=== 0` est plus **strict** — il ne
   peut pas devenir un faux vert, il peut rougir pour un mot voisin. Dit plutôt que supposé.

Au passage, **vingt-sept sélecteurs recopiés à la main** passent par le catalogue — dont
**neuf** cherchaient un libellé FRANÇAIS (`Statuer` ×7, `arbitrer` ×2) sur une instance
anglaise, donc ne pouvaient rien accrocher. Ceux qui restent en dur sont des **données** du
jeu synthétique — « Immovance », « CP-01 », « fae-2025.csv ».

## DA-27 — L'instantané des lectures comptait des clés de catalogue

`docs/LECTURES.json` figeait 2 316 « chemins de champ rendus ». **1 083 d'entre eux** étaient le
suffixe d'une clé de catalogue : `t('proc.conservationJusquAu')` contient un point, et
l'extracteur y voyait un champ nommé `conservationJusquAu`. Conséquence mesurée dans cette
tranche même : renommer une clé faisait crier le garde comme si un écran avait cessé
d'afficher une donnée — un garde qui crie faux se fait taire.

La clé (le **premier** argument) est effacée avant lecture ; les variables qui suivent ne le
sont pas — ce sont de vraies lectures, et c'est l'un des six cas connus mauvais du garde.
L'instantané tombe à **1 328 chemins dans 74 écrans**, et redevient relisible.

## DA-28 — Groupe 0 du mandat de nuit : la preuve se prend contre l'URL et contre la base réseau

**Le fait.** La chaîne tourne sur PGlite, en local, en superutilisateur. La production tourne
sur Postgres réseau, par un pooler de transaction, sous `postgres` — un rôle **BYPASSRLS**.
Ce sont deux exécutions (règle 11). Trois 500 et sept libellés inversés ont coexisté avec une
chaîne verte parce que personne ne mesurait la seconde.

**Ce qui est construit, et ce que chaque pièce prouve :**

1. **Le bloc d'assertions rôle / RLS**, imprimé par le build Vercel à chaque déploiement
   (`deploy:reconstruire`), contre la base réseau : rôle servi, `rolbypassrls`, RLS et FORCE
   par table, tables sans politique. Un défaut **arrête le déploiement**. Éprouvé contre trois
   cas connus mauvais sur PGlite (`assertions-role.test.ts` : FORCE retiré, politique
   supprimée, RLS désactivée). **Ce qu'il dit en toutes lettres** : le rôle qui sert
   l'application contourne la RLS ; FORCE et les politiques sont donc inertes pour elle, et
   éprouvées sous `otto_lecteur_demo` seulement.
2. **FORCE ROW LEVEL SECURITY** sur toute table à politique (migration 0033) — posé avant d'en
   dépendre. Passer l'application sous un rôle sans BYPASSRLS demande qu'elle pose le locataire
   dans chaque transaction ; elle ne le fait pas, et c'est R9 : reporté, nommé.
3. **Un réglage de session n'existe pas sur un pooler de transaction.** `acceptance.ts` posait
   `otto.derive_milestone` en session par une requête et faisait l'UPDATE par une autre : sur
   PGlite une connexion, ça tient ; en ligne, la garde peut lire une autre connexion et refuser
   la dérivation — **par malchance, donc invisible en test et intermittent en production**.
   Corrigé (une transaction, réglage local), et interdit à la source par
   `pooler-compat.test.ts`, éprouvé contre le code exact qui a vécu.
4. **`server_error`** : chaque exception de rendu est passée par `instrumentation.ts`
   (`onRequestError`, patron documenté par Next : condition sur le runtime puis import
   dynamique) à `erreurs-serveur.ts`, qui l'écrit clé par le digest que l'écran affiche, avec
   route, chemin, mission, version. **Au mieux, pas garanti** : Next n'attend pas ce crochet
   sur le chemin des erreurs de rendu ; `after()` demande à la plateforme de garder la fonction
   vivante, et à défaut l'écriture est directe. Un digest sans ligne se lit « non résolu »,
   jamais « jamais arrivé ». `error.tsx` montre le digest et le lien ; `global-error.tsx`
   attrape la panne du layout racine (base injoignable) avec la langue du navigateur ;
   `/api/erreur?digest=…` rend route et pile — ouvert sur tout déploiement Vercel (DA-10 : tout
   déploiement EST la démo publique), à revoir avant une instance réelle.
5. **La CI** (`.github/workflows/verifier.yml`) : la chaîne statique à chaque pousse, et le
   balayage de fumée **contre l'URL déployée** dès que Vercel annonce un déploiement réussi
   (`deployment_status`) — 50 motifs de route dans l'inventaire, dont au plus 48 résolubles par
   le crawl (`exportId` et `iid` n'ont pas de lien sur les écrans) ; titre lu et publié,
   contenu non vide, aucune page d'erreur ; moins de 40 routes ouvertes = échec du harnais. Ces
   comptes sont **prédits** jusqu'à la première exécution en CI, qui les mesure.
6. **`rôle de production`** (`role-production.yml`) : la suite entière contre une base réseau
   **séparée** par le pooler, sous un rôle de CI qui a **BYPASSRLS comme `postgres` en
   production** (l'application ne pose pas le locataire par transaction : un rôle sans
   BYPASSRLS ne lirait ni ne sèmerait rien — R9). La suite refuse par construction une base
   qui porte `demo_instantane`, et exige la déclaration `OTTO_CI_BASE_JETABLE=1` : elle VIDE ce
   qu'on lui donne. **Gated sur un secret que seul le fondateur peut poser** ; sans lui, rouge
   et le dit. Le mode réseau (`test/setup.ts`, un fichier à la fois, `DATABASE_URL` injectée
   dans chaque processus) est **écrit sans avoir pu être exécuté**. Nommé dans la déclaration
   de fin.

**Ce que ce groupe ne fait pas** : il ne change pas le rôle qui sert l'application (R9), il
n'exécute pas la suite réseau (secret), et il ne remplace pas `npm run clics` par une sonde HTTP
— le parcours cliqué reste local.

## DA-29 — La création de mission en un écran (Groupe 1, item 1.1)

**Ce qui existait** : un formulaire sur l'accueil, limité aux entités et exercices déjà en
base — donc jamais un dossier vraiment neuf devant quelqu'un.

**Ce qui est décidé** (réécrit après la revue hostile n°4, qui a trouvé cinq affirmations
fausses dans la première version de cette entrée) :

1. **Un client neuf est enregistré FICTIF** (`registry_type = 'fictional'`, sans numéro
   d'immatriculation). Ce que ça garantit : aucun identifiant réel n'entre par ce chemin. Ce que
   ça ne garantit PAS : qu'un nom réel tapé soit fictif — la règle « données synthétiques
   uniquement » reste celle de qui remplit le formulaire, et le dépôt ne porte que le monde de
   démonstration. Le doublon se refuse sur la forme normalisée (casse, accents, espaces) ; sans
   index unique en base, deux créations simultanées passent — au registre reporté.
2. **Un exercice neuf se donne par sa date de clôture** (jj/mm/aaaa, années 1990–2100, aucun
   `input type=date`), sur une entité DU CABINET (refus nommé sinon, jamais une clé étrangère
   en page 500), dure douze mois par défaut — comptés depuis le lendemain de la clôture, un an
   en arrière, donc 1er mars pour un 29 février — refuse tout chevauchement, et écrit un
   événement `period.created`.
3. **Le chaînage est CONTIGU, dans les deux sens.** Le prédécesseur est l'exercice qui finit la
   veille du début ; le successeur, celui qui commence le lendemain de la fin s'il n'avait pas
   de prédécesseur. Un exercice créé après un trou n'est PAS relié par-dessus le trou :
   l'ancienneté et l'acceptation liraient ce lien comme une continuité (« maintien »).
4. **Une seule définition de N-1** — `missionN1` : même entité, même cabinet, MÊME NATURE,
   exercice désigné par `prior_period_id`. L'en-tête, la reprise (`missionPrecedente` y
   délègue), la chaîne d'ancienneté (même règle, récursive) et le rail (« reprise atteignable »)
   la lisent. Une mission `integrated` sans prédécesseur de même nature n'a pas de N-1 : ni
   l'en-tête ni la reprise n'inventent.
5. **La classe** (`eip`, `cotee`, `composante`, `autre`, migration 0035) est posée à la
   création et affichée en en-tête ; aucune règle n'en découle encore (règle 3 de la nuit : rien
   n'est écrit de mémoire).
6. **Le référentiel de seuil préféré** voyage dans `framework_set.materiality_benchmark`. La
   proposition de seuils le suit S'IL EST REPRÉSENTATIF (PBT significatif, chiffre d'affaires
   positif) ; sinon la règle décide et le motif dit que la préférence n'a pas été suivie, et
   pourquoi. Le cas mauvais : « pbt » préféré sur une entité en perte donnait 1 000 € de seuil
   sur une base négative. Un test emprunte les deux branches.
7. **L'action ne fait pas de transaction**, et le dit : les services parlent à la connexion
   partagée. Tout refus connaissable d'avance (nature, référentiel, langue, méthode en vigueur,
   date, deux choix contradictoires du formulaire) est vérifié AVANT la première écriture.
8. **Le dossier neuf s'ouvre sur son acceptation** (ADR-088), avec le rail entier et ses raisons
   de grisé — vérifié au clic, rail déplié. Le plan disait « dashboard » ; la destination
   existante tient le même critère.

## DA-30 — Le tableau de bord vit sur « Mes travaux », hors rail (Groupe 1, item 1.2)

**Ce qui existait** : « Mes travaux » (ADR-110) — notes adressées, papiers en attente de visa,
demandes échues — et, DANS chaque dossier, la vue d'ensemble avec ses quatre listes de sections
et ses obstacles. Rien qui traverse les dossiers.

**Ce qui est décidé** :

1. **Le tableau de bord est l'écran existant, étendu** — pas une destination de plus. Quatre
   listes de sections sur tous mes dossiers (dans mon camp / attribuées / suivies / ouvertes
   récemment, par `mesSections`, déjà transverse), ce qui empêche le visa de chacun de mes
   dossiers ouverts compté par famille (`obstaclesAuVisa`, le MÊME calcul que l'écran des
   obstacles du dossier — le test le compare famille par famille), les notes ouvertes par
   ancienneté (une requête).
2. **Rien n'est stocké, rien n'est agi.** L'écran lit et mène à l'objet en un clic ; envoyer,
   suivre, lever se font dans le dossier, là où la règle vit et où le refus s'affiche. Le
   plafond de cinq actions primaires reste tenu par construction.
3. **Ce qu'il ne regarde pas, écrit sur l'écran** : jours calendaires (les jours ouvrés sont
   l'affaire de la file de revue, 1.4) ; un dossier scellé ou archivé n'apparaît nulle part
   sur l'écran — ni obstacles, ni sections, ni notes ; les sections naissent à l'ouverture de
   la vue d'ensemble d'un dossier, pas ici.
4. **Le coût est celui du calcul des obstacles, dossier par dossier** — une vingtaine de
   requêtes par dossier plus une par poste retenu. Sur les dossiers d'une personne c'est la
   seconde ; un compteur stocké mentirait dès la prochaine action.
5. **Les libellés de « Mes travaux » sont des clés** (`trav.detail.*`, `visa.role.*`). La
   phrase française qui y vivait était invisible au détecteur de langue — un `detail:` en
   gabarit n'était ni un nœud JSX ni un libellé qu'il lisait. Le détecteur lit désormais
   `detail:` et les gabarits ; son cas connu mauvais est ce fichier-là.

## DA-31 — Le registre des gardes : ce qui est prouvé, ce qui est déclaré, ce qui est reporté (Groupe 1, item 1.7)

1. **Le registre est du code, la table en est générée.** Une table tenue à la main diverge un jour
   du test qui l'éprouve — et c'est toujours la table qu'on croit.
2. **Une garde de SERVICE n'a qu'une passe** : aucune neutralisation SQL n'existe pour une règle
   TypeScript. Son refus est comparé à SON message ; la table le dit (« une passe »).
3. **Les familles d'obstacles sont DÉCLARÉES, pas prouvées ici.** Neuf ont un test de service qui
   nomme leur motif (la table le cite) ; quatre n'en ont aucun — écrit « aucune ». Les fixtures de
   FAUX POSITIF par famille (un dossier sain qui déclencherait la famille) ne sont pas construites.
6. **Une garde, un refus, un objet.** L'épreuve à deux passes est aveugle à une attaque qui accepte
   deux refus et neutralise deux objets : elle a dit « prouvée » sur une contrainte inerte depuis
   0009 (revue hostile n°6). Le registre l'interdit désormais structurellement, et le cliquet des
   tests compte par `vitest list` — les deux instruments ont enfin échoué exprès.
4. **Les fichiers d'or sont reportés** (sélections par graine, seuils, totaux balance/grand livre,
   familles par dossier, routes, clés par locale, politiques RLS, grants) : chacun exige son cas
   connu mauvais avant d'exister (règle 17), et la nuit n'en a construit aucun.
5. **Le cliquet compte des `it(`, pas des preuves** — un test vidé compte encore ; il le dit.

## DA-32 — L'IPE au niveau du rapport : la tranche bornée (Groupe 1, item 1.8)

1. **Le rapport est l'objet ; le papier le désigne.** Les colonnes de 0031 restent lues par
   compatibilité ; la documentation vit sur le rapport, l'« approprié au test » et l'arrêté attendu
   restent sur le papier — ce sont des faits DU papier.
2. **La réutilisation se refuse sur l'ARRÊTÉ**, pas sur les paramètres : deux rapports de mêmes
   paramètres et d'arrêtés différents sont deux tests IPE (unique sur nom + arrêté). Un même nom sur
   un même arrêté est un doublon, refusé en nommant le rapport à désigner.
3. **L'import capture, il ne bloque pas** : cinq champs facultatifs sur la balance et le FEC, repris
   par le rapport créé dessus. Un rapport, lui, exige ce qu'il exige.
4. **Le critère du plan se joue sur le grand livre importé**, pas sur la balance âgée : la balance
   auxiliaire est une pièce, pas un fichier importé (reporté).
5. **Rien de l'existant ne disparaît** : `enregistrerIpe` (le peuplement, les tests d'avant) crée
   ou reprend le rapport du même nom et du même arrêté, puis le désigne — avec le refus qui va avec.

## Nuit du 3 au 4 septembre 2026 — étage 0 (la dette d'étanchéité)

*Pleine autonomie : chaque décision est tranchée par la voie la plus défendable et inscrite ici.*

**D-J3N-01 — `engagementDe(kind, id)` est un CATALOGUE, pas un `switch`.** Les trente-sept
écritures nues étaient désignées par un objet FILS. La résolution vers le dossier vit une seule
fois, sous forme de table `kind → requête SQL`, et **un type absent du catalogue est refusé**
(ETANCH-05). Un `default:` silencieux aurait rouvert le trou à la première table neuve.

**D-J3N-02 — « objet introuvable » et « objet d'un autre cabinet » reçoivent le MÊME refus**
(ETANCH-04). Distinguer les deux apprend à un intrus que l'objet existe. Même doctrine
qu'ETANCH-01 avant ETANCH-03 (ADR-069/ADR-082).

**D-J3N-03 — le critère de couverture passe de « écrit » à « prend un acteur ».** L'ancien
ratait les écritures PAR DÉLÉGATION (`joindreAnnexe` → `ingestEvidence`) : trois fonctions
passaient pour des lectures. Les seules exceptions sont les gestes qui portent sur la PERSONNE
elle-même, treize, écrites avec leur raison.

**D-J3N-04 — l'instrument d'étanchéité EXÉCUTE, il ne lit plus.** Il fabrique les arguments à
partir des signatures, place l'intrus à la place de l'acteur et un identifiant RÉEL à la place de
chaque objet, puis appelle. Aucune liste d'appels écrite à la main : une fonction neuve est
appelée le jour où elle est écrite. Il a trouvé son premier vrai cas au premier lancement
(`memoriserRepli`, que j'avais classée « gardée » à tort).

**D-J3N-05 — `otto_portal_contact()` et `otto_portal_entity()` sont `security definer`, et
c'est MESURÉ.** En `security invoker`, elles produisent une récursion infinie entre la politique
de `engagement` et celle de `client_contact` — vue de l'application comme ZÉRO LIGNE, le silence
que la règle 13 nomme. C'est le cas justifié que PLAN_RLS (A.6) prévoyait. La règle passe donc de
« zéro fonction definer » à « aucune qui ne soit ÉCRITE », avec un registre en base
(`rls_definer_justifiee`) que la migration consulte et que le code duplique — un test tient les
deux ensemble.

**D-J3N-06 — `blob_store` s'isole PAR CE QUI LE RÉFÉRENCE, pas par une colonne de locataire.**
Le magasin est adressé par contenu et déduplique entre cabinets par construction : une colonne
`tenant_id` casserait cela. La politique passe par `evidence`, `export_record` et `file_archive`.
Conséquence assumée : une pièce qu'aucune de ces tables ne référence devient illisible pour
l'application — un octet que rien ne réclame n'a pas de raison d'être servi.

**D-J3N-07 — le câblage de `withTenant` se fait par un POSEUR enregistré, pas écran par écran.**
Option (a) de PLAN_RLS : `q()` demande le locataire à la session avant de refuser. L'option (b) —
envelopper quatre-vingts écrans — aurait fait qu'un oubli rende une page vide, c'est-à-dire le
défaut que le garde existe pour supprimer. Le poseur est ENREGISTRÉ (et non appelé) parce que
lire le cookie demande `next/headers`, que ni les scripts ni les tests ne peuvent importer.

**D-J3N-08 — le garde s'arme dans le SERVEUR, pas dans le harnais.** La première tentative a
armé LOC-01 dans le processus du balayage : c'est le harnais qui a levé, pas le produit — on
aurait mesuré l'instrument. `npm run screens:garde` n'arme que le serveur.

**D-J3N-09 — le mandat demandait une FRONTIÈRE D'ERREUR pour le #418 : c'est le mauvais
instrument, et je ne l'écris pas.** Instruit dans le bundle servi : une erreur d'hydratation est
*récupérable* — React la signale par `onRecoverableError` → `reportGlobalError` → `window.reportError`,
hors bande. `componentDidCatch` ne la voit JAMAIS. Écrire la frontière aurait donné un détecteur
muet (règle 13). L'instrument correct est un écouteur navigateur, et il est écrit à sa place.
