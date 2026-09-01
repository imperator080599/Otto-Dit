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
