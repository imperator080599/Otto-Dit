# OTTO — règles permanentes pour toute session Claude sur ce dépôt

OTTO est une plateforme d'audit AI-native : audit des états financiers et assurance du contrôle
interne (SOX/ICFR). Noyau agnostique du référentiel (squelette ISA) + packs de référentiel (ISA,
NEP/France, PCAOB/SOX+COSO en v1). Fondateur : Tuan. Interface en français, local-first
(PGlite), production sur Vercel + Supabase.

**Ce fichier porte les invariants du projet EN ENTIER.** Une règle qui ne vit que dans une
conversation meurt avec elle : c'est ainsi que le semeur a fait le travail de l'auditeur pendant
des semaines sans que personne ne le nomme, et qu'une migration appliquée a été éditée. Ce qui
est écrit ici s'applique sans qu'on ait à le rappeler.

## 0. Protocole de reprise — dans cet ordre

1. **Ce fichier**, en entier.
2. **`docs/REPRISE.md`** — engendré par `cd app && npm run reprise` : où en est le projet, le HEAD
   local et son écart à l'amont tel que connu, le SHA servi MESURÉ, les fils ouverts avec leur
   identifiant et leur état, ce qui tourne en
   arrière-plan, les commandes de `verify` qui n'ont pas tourné, l'ordre de lecture. **Relancer
   la commande avant de le lire** : un instantané n'est vrai qu'à sa date.
3. **`docs/CHASSE.md`** — ce qui est en cours d'investigation (le #418 en premier) : les
   hypothèses déjà éliminées, comment, et celle qu'il reste à éprouver. Ne pas re-éliminer ce
   qui l'est déjà.
4. **`STATUS.md`** (les tranches datées, du plus récent au plus ancien), puis `docs/DECISIONS.md`
   (les ADR, le pourquoi de chaque forme), `docs/DECISIONS_AUTONOMES.md` (les décisions prises
   sans le fondateur, D-J3N-xx), `docs/BACKLOG_REPORTE.md` (R-nn — le dernier numéro est dans le
   fichier —, N2-x).
5. **Le dernier mandat du fondateur**, s'il est fourni : il prime sur l'ordre des chantiers, jamais
   sur les interdits ni sur les règles permanentes.

Ne rien commencer avant d'avoir lu 1 à 4. Ne rien annoncer comme fait avant de l'avoir mesuré.

## 1. Règles non négociables (le socle)

1. **docs/ est la source de vérité.** Si le code doit s'écarter d'un document, on corrige le
   document dans le même commit et on le consigne dans docs/DECISIONS.md.
2. **Données synthétiques uniquement, pour toujours.** Chaque jeu de données, société, nom,
   SIREN/EIN, IBAN et document du dépôt est fabriqué et clairement fictif. Ne jamais demander ni
   intégrer la méthodologie propriétaire d'un cabinet, ni aucune donnée réelle de client.
3. **Provenance et piste d'audit dès la première fonctionnalité**, jamais rattrapées après coup.
   Tout changement d'état écrit dans event_log ; toute sortie d'IA écrit une ligne ai_run
   (modèle, version de prompt, jetons, empreinte de sortie). P7 reste répondable à tout instant :
   « Pourquoi cette pièce existe-t-elle ? », « Qu'est-ce qui soutient cette conclusion ? »,
   « D'où vient ce chiffre ? »
4. **Des tests sont requis** pour toute logique de parsing, rapprochement, sondage, matérialité,
   appariement et test d'attributs. Les appels LLM/OCR vivent derrière des interfaces avec
   enregistrement/rejeu — la suite tourne avec **zéro** appel externe.
5. **Petites tranches verticales**, chacune terminée par une démonstration qui marche. Commit à
   chaque tranche ; STATUS.md et DEMO.md mis à jour dans le même commit.
6. **Pas de LLM là où une règle déterministe suffit** (P4). Le LLM ne sert qu'à extraire,
   classer, rédiger, suggérer.
7. **Plafond HITL L2** pour tout ce qui entre au dossier d'audit, dans tous les packs : l'IA
   prépare, un humain revoit et approuve avant que cela compte. **Jamais L3 sur le dossier.**
8. Ne jamais citer une norme par son numéro sans en être certain ou l'avoir vérifié ; sinon
   marquer [UNVERIFIED]. **Aucune constante légale ou statistique écrite de mémoire** : elle
   vient de la méthode du cabinet (`methodology/*.json`) avec `verifie:true`, ou elle porte
   `verifie:false` et le dit à l'écran.
9. Un pack de référentiel = du contenu et de la configuration, jamais une bifurcation de code.
   Nouveau référentiel ou nouveau cycle = du contenu de pack, pas de l'architecture.
10. **Tout écran neuf est conduit dans un navigateur avant d'être annoncé.** Un écran qui compile
    n'est pas un écran qui rend, et un écran qui rend n'est pas un écran qui marche. `npm test`
    inclut le balayage de toutes les routes ; `npm run screens` le refait sur un build de
    PRODUCTION et `npm run clics` y CLIQUE, et ce sont ces deux-là qui doivent passer avant une
    livraison (ADR-076, ADR-078, ADR-090).
11. **Un test vert sur un chemin que la production n'emprunte pas ne prouve rien.** Vitest et le
    bundle Next ne sont pas la même exécution ; une base FRAÎCHE et la base de production non
    plus (voir §3, la migration éditée).
12. **Une vérification que personne ne peut rejouer est une affirmation.** Toute mesure citée
    dans une livraison a une commande qui la reproduit, et le SHA sur lequel elle a été obtenue.
13. **Le silence lu comme un succès est le défaut à traquer** : un harnais muet, un prédicat
    déclaré et non implémenté, une règle inconnue ignorée, un compteur qui ne compte pas les
    plantages, un refus calculé puis jeté, un refus rendu en page 500, un objet créé qu'aucun
    chemin de lecture n'atteint, un geste du métier sans écran, une décision qu'on ne peut plus
    revoir, une branche de repli que rien n'exécute jamais, un formulaire que le navigateur
    refuse d'envoyer et qu'on lit comme une règle vérifiée, une station de harnais qui se déclare
    verte sans rien mesurer, une lecture de `/api/sante` qui ne peut pas rougir sur le cas
    qu'elle dit surveiller (ADR-088, ADR-089, ADR-091, ADR-133, ADR-134). Corollaire :
    **n'affirme jamais plus que ce que tu vérifies** — ni dans un écran, ni dans un document.
14. **Périmètre gelé** : aucun cycle au-delà du chiffre d'affaires, aucun contenu de procédure
    nouveau, pack SOX gelé. La mécanique est le produit ; les procédures sont du contenu.

    **Amendement du 8 septembre 2026 (mandat contrôle interne) — précise « pack SOX gelé », ne
    lève pas le reste.** Le mandat `docs/MANDATS/2026-09-08_mandat_controle_interne.md` demande
    explicitement de la MÉCANIQUE neuve dans le domaine SOX/ICFR déjà existant (`control`,
    `control_task`, IUC, facteurs de design, OE) — le même domaine que cette règle gelait. Lu à
    la lettre, « pack SOX gelé » et un mandat daté du même jour qui construit dedans se
    contredisent ; §0 de CLAUDE.md dit qu'un mandat ne prime jamais sur une règle permanente,
    donc cette contradiction ne se résout pas en silence (règle 13). Résolution, écrite plutôt
    que devinée : la dernière phrase de la règle 14 elle-même distingue MÉCANIQUE (le produit,
    jamais gelé) de PROCÉDURES (contenu de méthode, gelé) — le vocabulaire fermé du mandat
    (inquiry/inspection/observation/reperformance, quatre facteurs, IUC) est dicté verbatim par
    le fondateur lui-même dans un fichier commité, donc ce n'est ni un contenu de procédure
    INVENTÉ par une session ni une extension du catalogue `methodology/procedures.json` — c'est
    de la mécanique, au sens de cette règle. **Ce qui RESTE gelé, sans exception** : aucun
    nouveau cycle au-delà du chiffre d'affaires, aucune nouvelle procédure ajoutée à
    `methodology/procedures.json` ou à un catalogue de méthode équivalent, aucune constante ou
    table d'échantillonnage écrite de mémoire (règle 8 — toujours `verifie:false` tant que le
    cabinet ne l'a pas fournie, mandat §3.2/CTRL-07).

    **Objection soulevée par la revue hostile du même jour (voix 1), non réfutée par une seconde
    voix — « jugé seul » (règle 30, documentation).** `methodology/procedures.json` catalogue
    DÉJÀ « observation » et « inspection » comme du CONTENU de pack (`libelle`, `d`, définition,
    `assertions_servies`, en-tête du fichier : « CONTENU, non code »), pour le cycle NEP/ISA
    substantif. Les mêmes deux mots reviennent dans le vocabulaire fermé de ce mandat. Réponse
    écrite ici, pas laissée en tension : ce sont DEUX TAXONOMIES DISTINCTES, de deux référentiels
    différents, qui partagent un mot de la langue courante de l'audit sans partager un catalogue —
    la famille `procedures.json` sert à choisir QUELLE procédure appliquer à QUEL poste pour QUELLE
    assertion FS, dans le programme substantif (ISA 500) ; le quatuor inquiry/inspection/
    observation/reperformance du mandat sert à documenter QUELLE MÉTHODE a produit une preuve de
    D&I/OE sur UN CONTRÔLE INTERNE (PCAOB AS 2201/COSO) — un axe orthogonal, qui ne choisit rien
    dans `procedures.json` et n'a pas de `assertions_servies`. Les sept types d'ASSERTION
    (`fsli_assertion_risk`, migration 0012) sont le précédent le plus proche : un vocabulaire fermé
    de la discipline elle-même, en `check` SQL, jamais dans `methodology/*.json`, et personne n'a
    jamais lu ça comme « du contenu de procédure ». **Cette réponse n'a pas été éprouvée par un
    second réfuteur indépendant** (la voix qui l'a soulevée ne peut pas aussi la juger) — si une
    session future ou le fondateur la trouve fausse, elle se corrige ici, dans ce fichier, jamais
    en silence ailleurs.
15. **Chercher un mot n'est pas vérifier un chemin.** Un `grep` répond à « ce texte existe-t-il ? »,
    jamais à « cette règle s'applique-t-elle ? ». La seconde ne se répond qu'en empruntant le
    chemin : un test qui l'exerce, ou un clic (ADR-094). **Un balayage de texte n'est pas une
    garde.**
16. **Ne jamais présenter comme preuve un artefact produit par un autre objet que celui dont on
    parle.** Une capture, une mesure, un journal ne valent que pour l'objet qui les a produits, et
    il faut le nommer (ADR-094). Une preuve empruntée est la forme la plus convaincante du
    silence lu comme un succès.
17. **Tout instrument de mesure s'éprouve d'abord contre un cas connu MAUVAIS.** On introduit
    délibérément le défaut que l'instrument existe pour attraper, on vérifie qu'il ÉCHOUE, puis
    on retire le défaut. **Un détecteur qui n'a jamais échoué exprès n'a jamais été testé. Une
    garde qui n'a jamais rien refusé n'est pas une garde.** Cinq instruments de suite ont mesuré
    à côté : le middleware « inerte », DENSITE à 0 action, /api/sante braqué sur du code mort, le
    détecteur de langue à « 0 reste », et le comparateur d'hydratation qui ne rendait que la
    première divergence — du bruit — en taisant le défaut injecté derrière.
18. **Une explication plausible d'un échec est une HYPOTHÈSE, pas un diagnostic.** Elle se prouve
    station par station, requête par requête, jamais en gros. Dans ce dépôt, l'hypothèse
    plausible a caché un vrai défaut cinq fois sur cinq (la dernière : « c'est mon import qui
    a fait tomber le serveur » — c'était deux vitest en parallèle).
19. **Toute règle nomme où elle cesse de regarder.** Une garde, un prédicat d'obstacle, une lecture
    de santé, un comparateur : chacun porte dans son en-tête ce qu'il ne vérifie PAS, écrit avant
    qu'on le découvre. Une règle qui ne dit pas ses limites en aura de cachées.
20. **Un état que seul le semeur peut produire n'est pas une fonctionnalité. C'est un décor.**
    (Mandat du semeur, §1.) `docs/SEMEUR_VS_CHEMIN.md`, à ENGENDRER par un script — jamais rédigé
    à la main, règle 21 — devra dire, objet par objet : le semeur crée-t-il ? un chemin humain
    existe-t-il ? a-t-il été cliqué ? Toute ligne sans chemin humain sera un manque déclaré ;
    toute ligne avec chemin non cliqué sera non prouvée ; un type d'objet nouveau ne se sème pas
    sans que son chemin humain existe. La démonstration doit être une instance du produit, pas une
    instance de la graine. **L'état de ce chantier (commencé ou non, R-nn) vit dans
    `docs/BACKLOG_REPORTE.md` et `docs/instantanes/fils.json`, pas ici** — cette règle ne dit que
    l'invariant, jamais où on en est.
21. **Le compte rendu est engendré, jamais rédigé.** Aucun chiffre en prose que le script n'a pas
    produit ; les constats hostiles sont un fichier de données avec identifiant, énoncé, état,
    SHA de correction ; la liste « non prouvé » est transcrite par le script depuis le rapport
    précédent, et toute suppression exige « levée le … sur le SHA … par la mesure … » ; une
    commande de `verify` non passée apparaît avec la mention « non exécutée ». Voir §4.
22. **Une tranche livrée ajoute sa lecture à `/api/sante` le jour même**, et cette lecture doit
    pouvoir ROUGIR sur le cas qu'elle surveille (une chaîne qui commence par un compte non nul
    passe le prédicat de vacuité : la lecture LÈVE au lieu de rendre une phrase).
23. **Rien ne sort du registre.** Une idée, un constat, un manque sont consignés
    (docs/REGISTRE_IDEES.md, docs/BACKLOG_REPORTE.md avec un identifiant R-nn) avant d'être
    reportés. « Reporté » n'est jamais « oublié ».
24. **Sous-agent hostile sur chaque tranche**, avant le push : ses constats sont ÉNUMÉRÉS avec un
    identifiant, leur état (corrigé / non corrigé → R-nn), et le SHA de la correction. Il vérifie
    en empruntant le chemin, jamais par grep seul. Ses fichiers de sonde sont supprimés avant le
    commit.
25. **Aucune famille bloquante nouvelle sans sa fixture de faux positif**, et aucune ne rend la
    démonstration insignable. Une famille neuve naît en avertissement, sauf si le fait bloquant
    ne peut exister que là où il y a réellement quelque chose à statuer — et alors les cas de
    faux positif le prouvent (ADR-133).
26. **On n'édite JAMAIS une migration appliquée.** `_migrations` la connaît par son nom ; sur une
    base fraîche tout passe, en production elle ne rejoue jamais. Le changement va dans une
    migration NOUVELLE et idempotente. `migrate()` enregistre l'empreinte de chaque fichier et
    refuse de continuer si un fichier appliqué a changé. Trois déploiements sont morts de cela
    le 3 septembre 2026 (ADR à venir ; commit a06a7f1).

    **« Appliquée » veut dire : une trace dans `_migrations`, sur N'IMPORTE QUELLE base qui en
    porte une — jamais seulement « servie en production ».** Un déploiement d'APERÇU qui s'arrête
    juste après (un garde qui rougit plus loin dans le même script, `deploye` qui échoue derrière)
    a quand même écrit la ligne dans `_migrations` de la base RÉSEAU PARTAGÉE : la migration EST
    appliquée, que le déploiement dans son ensemble ait réussi ou non. « Ça n'a jamais été servi »
    n'est PAS « ça n'a jamais été appliqué » — et c'est exactement la confusion qui a fait éditer
    0153 en place le 2026-09-09 (tranche 6, CTRL-04) : appliquée par le tout premier build
    d'aperçu (qui s'est arrêté juste après, sur le garde de couverture RLS), puis éditée EN PLACE
    par une session qui jugeait le premier `deploye` en échec comme preuve que « rien n'était
    encore servi ». L'édition corrigeait toute base FRAÎCHE (`db:reset` part de zéro) mais RIEN à
    la base réseau, qui gardait la table dans sa forme d'origine EN PERMANENCE — `migrate()`
    aurait dû refuser (empreinte différente) au déploiement suivant, ce qui explique à lui seul
    pourquoi les quatre commits suivants (`a9e88ef`, `3659901`, `7395e55`, `409e1b7` — sept
    événements de déploiement en tout, `main` et la branche de travail chacun comptés) sont TOUS
    restés en ERROR (revue hostile du 2026-09-09, voix 2 : « cinq » comptait des COMMITS, pas des
    ÉVÉNEMENTS de déploiement — deux commits ont chacun produit deux déploiements ERROR). Corrigé par
    `0154_control_population_reconciliation_engagement_id.sql` (ALTER en avant, jamais une
    réédition de 0153) — 0153 elle-même est revenue OCTET POUR OCTET à son contenu d'origine
    (empreinte vérifiée identique à celle de `_migrations` sur la base réseau, par une requête
    directe, jamais supposée). Le test qui compte n'est donc jamais « ai-je vu un `deploye` vert
    pour ce commit ? » mais **« cette migration a-t-elle une ligne dans `_migrations`, sur QUELQUE
    base que ce soit — locale gardée entre deux sessions, réseau de démonstration, réseau de
    production ? »** Dans le doute, une requête directe (`select * from _migrations where name =
    …`) tranche — jamais une inférence depuis le statut d'un déploiement.
27. **Le SHA poussé doit devenir le SHA servi.** Une tranche poussée et non déployée n'existe pas
    pour le fondateur. Le travail CI `deploye` l'exige en quinze minutes ; une livraison se dit
    « en ligne » seulement avec le SHA servi MESURÉ (`/api/sante`, champ `sha`).
28. **Un recalcul ne détruit ni n'invalide jamais en silence du travail humain**, et les données
    produites par l'agent ne sont jamais supprimées par le système. Ce qui sort d'une sélection
    ou d'une liste de requises reste visible et se STATUE par écrit (ADR-133, ADR-134).
29. **Le sélecteur d'identité sans mot de passe et le middleware `?comme=` restent** — mais ils
    sont le PREMIER chantier le jour où un pilote arrive, et tant qu'ils existent, aucune
    démonstration d'isolation n'a de valeur devant un déontologue. Écrit ici pour qu'on ne le
    présente jamais autrement.
30. **La vérification adverse est PROPORTIONNÉE à l'enjeu, et son plafond s'annonce avant de
    lancer.** Deux réfutateurs indépendants par constat sur du CODE ou une GARDE (ce qui s'exécute
    et peut casser en silence) ; UN SEUL passage de relecture sur de la DOCUMENTATION (ce qui se
    lit et se corrige à l'œil). Un sous-agent hostile qui relit trois fichiers de prose n'a pas
    besoin de cent vingt réfutateurs : 825 000 jetons dépensés à vérifier de la documentation, sur
    une limite de session qui a fini par y passer, en est la preuve. Un constat de documentation
    jugé par une seule relecture, non réfuté par un second regard indépendant, se marque **« jugé
    seul, non réfuté »** dans le document qui le porte — jamais confondu avec un constat
    **« confirmé par réfutation »** (deux voix indépendantes, ou plus, qui convergent). Une liste
    de réfutateurs vide (tous morts sur une limite, un timeout, une panne) n'est ni un « rien à
    signaler » ni un « tout confirmé » : c'est une vérification qui n'a pas eu lieu, et qui se dit
    telle.

    **Amendement du 8 septembre 2026 (mandat contrôle interne, cadence) — remplace le compte de
    réfutateurs ci-dessus, laisse le reste de la règle 30 intact.** Deux réfutateurs indépendants
    sont requis SEULEMENT quand la tranche touche le modèle de données, la sécurité, le
    multi-tenant, ou un code de refus. Sinon, UN SEUL réfutateur suffit. Le verify complet ne
    tourne qu'à l'expédition (jamais en cours de construction), toujours sous un `timeout`
    explicite dont le budget est nommé dans le message qui lance la commande (règle 35, forme
    opérative) ; entre-temps, des suites CIBLÉES (le fichier de test concerné, la station de clics
    concernée) suffisent à valider chaque pas.
31. **Une valeur qui a l'air d'une mesure sans en être une est un défaut à part entière** — la
    famille retrouvée dans docs/instantanes/*.json le 2026-09-06 : des horodatages ISO inventés à
    l'heure ronde (« 22:00:00Z », « 21:00:00Z ») pour des mesures dont l'heure réelle n'avait
    jamais été relevée, qui SE LISAIENT comme des mesures rejouables et n'en étaient pas. **Tout
    horodatage, tout compte et tout SHA cité dans un document ENGENDRÉ vient d'une sortie
    d'exécution (un journal de CI, un test, un instantané déjà mesuré), jamais d'une heure
    plausible écrite en passant.** Sa garde, nommée : quand la date réelle n'a jamais été
    mesurée, le champ le dit en toutes lettres (« heure non mesurée », « antérieur à … ») plutôt
    que d'inventer un horodatage ISO qui aurait l'air précis ; `scripts/reprise.ts` refuse déjà
    tout `quand` non parsable comme une date (un cas connu mauvais dans `reprise.test.ts`), ce qui
    force cette formulation honnête au lieu d'un horodatage inventé qui, lui, passerait la garde
    en silence — la garde attrape la FORME de l'aveu, pas encore le mensonge plausible qui
    resterait une date valide ; ce second pas reste à construire.
32. **L'autonomie est permanente, jamais redemandée.** Une session qui travaille sous un plan
    d'autonomie du fondateur (fourni en session ou déjà en cours) enchaîne les lots SANS attendre
    de retour entre eux : la fin d'un lot produit l'écran engendré (règle 21, §4) et lance le lot
    suivant dans le même souffle. Elle ne rend la main que sur un **interdit** (§2) ou un geste
    qu'elle ne peut pas mesurer elle-même (le goût du fondateur, un geste irréversible — §2 encore,
    ou la Partie A.2 du plan d'autonomie s'il est fourni). « J'attends ton plan » ne s'écrit plus
    une fois le plan reçu — seul un constat, suivi de la suite déjà lancée. **Un étage TERMINÉ
    prime sur deux COMMENCÉS** : jamais de lot suivant pendant que la chaîne `verify` est rouge ou
    qu'un fil ouvert bloque le parcours cliqué — on ferme d'abord ce qui tient tout au rouge.
    Quand un plan chiffre un invariant (un compte de décors qui ne doit que baisser, un compte de
    preuves qui ne doit que monter — R44, mandat du semeur §1), l'écran de fin de lot affiche les
    deux chiffres côte à côte, engendrés, jamais tapés de mémoire.
33. **Tout mandat du fondateur est commité VERBATIM dans `docs/MANDATS/` AVANT d'être exécuté**, et
    le registre (BACKLOG_REPORTE.md, REGISTRE_IDEES.md, STATUS.md) CITE ce fichier — un numéro de
    section, jamais une paraphrase, jamais un résumé de conversation. **Un mandat qui n'est pas
    dans le dépôt n'existe pas** : il meurt à la première compaction de contexte, exactement comme
    ce fichier le dit depuis toujours d'une règle qui ne vivrait que dans une conversation (voir
    l'en-tête). C'est arrivé une fois, le 2026-09-06 : le plan d'autonomie complet du Lot 2 (Partie
    B, sept étapes) n'avait jamais été commité — seulement discuté en session — et une compaction
    l'a réduit à un résumé approximatif que la session suivante a correctement REFUSÉ de construire
    dessus (règle 18 : une reconstruction n'est pas une citation). Le fichier verbatim est
    `docs/MANDATS/2026-09-05_plan_autonomie.md`. Nommer le fichier `AAAA-MM-JJ_<titre-court>.md` à
    la date de RÉCEPTION du mandat, pas à la date du commit qui le consigne s'il diffère.

## 2. Interdits — sans exception, quel que soit le mandat

- **L'étape 3 de docs/PLAN_RLS.md** (faire servir l'application par `otto_app`) : préparée,
  éprouvée, NON exécutée. Aucune session ne l'exécute sans un mandat écrit qui la nomme.
- **L'activation du mode IA vivant** sur l'URL. Préparer, éprouver en rejeu, laisser le dernier
  geste au fondateur. Trois préconditions dans l'ordre : garde de budget EN BASE, chemin fermé
  par défaut derrière un déverrouillage que seul le fondateur connaît, aucune clé dans le dépôt
  et son absence désactive proprement.
- **Toute modification de `DATABASE_URL`**, et de toute variable de production, sans mandat écrit.
- **Toute dépense** — récurrente ou non — et **tout service payant**. Jamais Stripe.
- **Re-semer la démonstration publique.**
- **Données réelles** : aucun client, aucun cabinet, aucune personne réelle. Synthétique, toujours.
- **Envoi réel** : aucun e-mail, aucune invitation d'agenda, aucune relance ne part vers un
  destinataire réel. Les transports sont simulés et se disent tels à l'écran.
- **La clé d'API**, en local, ne vit que dans `app/.env.local` (`ANTHROPIC_API_KEY`) ; en
  production c'est une variable Vercel (DEPLOY.md), et sa modification tombe sous l'interdit des
  variables de production ci-dessus. Ne JAMAIS l'exporter dans le shell, ne jamais l'imprimer, ne
  jamais la commiter.
- **Ne jamais écrire l'envoi de l'en-tête de contournement** de la protection Vercel.
- **Aucun identifiant de modèle NOUVEAU** dans un artefact poussé (code, commentaire, document,
  message de commit) — sauf les deux lignes de queue de commit que le harnais impose, et sauf
  les défauts d'adaptateur déjà en place (`adapters.ts`, `query/adapter.ts`,
  `entretiens-analyste.ts`, `DEPLOY.md`), surchargeables par variable d'environnement
  (`OTTO_EXTRACT_MODEL` etc.) et couverts par leurs propres tests. Un identifiant de modèle qui
  ne vit que dans la conversation (ce fichier compris) le reste.
- **Aucune requête vers un service externe** depuis la suite de tests. Zéro réseau.

## 3. Ce qui a coûté cher, et qui ne doit pas se répéter

- Le **semeur** (`lib/flows/enrichir.ts`, `part1.ts`, `part2.ts`, `lib/services/monde-demo.ts`) planifiait,
  rédigeait, visait à la place de l'auditeur : trois services sans aucun écran pendant des
  semaines, et un dossier de démonstration qui paraissait complet (ADR-134, mandat du semeur).
- Une **migration éditée après application** : trois déploiements en ERROR, vingt-quatre heures
  d'URL périmée, aucun harnais capable de le voir (commit a06a7f1).
- Un **ré-import du grand livre définitif** recréait chaque écriture avec un nouvel identifiant,
  et le re-tirage laissait 33 pièces du client inaccessibles à tout écran (ADR-133, 0142).
- Le **comparateur d'hydratation** ne rendait que la première divergence, qui était du bruit,
  et écrasait `/\s+/` — donc U+00A0 et U+202F, la divergence la plus probable de toute
  l'application (ADR-132).
- Des **stations de harnais** qui se déclaraient vertes sur un compteur déjà vrai avant le clic,
  le refus rangé dans le détail imprimé (D-J3N-16).
- Des **comptes rendus rédigés à la main** dont les chiffres ne tenaient pas d'un paragraphe à
  l'autre (mandat du semeur, §2) — d'où la règle 21.
  
  ### Nuit du 6 au 7 septembre — une nuit perdue à attendre un run mort

Le `verify` du Lot 3 tranche 1 a été lancé en tâche de fond, puis invalidé par une édition de
`procedures.json` (CAPITAUX-PV) pendant son exécution. La tâche a ensuite été arrêtée. L'agent a
attendu sa notification de fin pendant des heures, en annonçant une progression — « reached the
clics step », « currently mid-clics » — qu'il n'avait jamais mesurée : il relisait une sortie figée.

**Règle 34 — Aucune mesure ne commence sur un arbre qui bouge.** Le `verify` tourne sur un arbre
figé. Toute édition pendant un run invalide le run : on le **tue immédiatement**, on ne l'attend
pas. Un run tué se dit dans le compte rendu, il ne se cache pas.

**Règle 35 — Aucune attente non bornée, aucune vivacité déclarée sans preuve.** Un run en cours se
prouve par le disque : un log qui grossit, un `mtime` qui avance, un `pgrep` qui répond. Jamais par
l'état d'une tâche en arrière-plan, jamais par une croyance. Sans progrès observé pendant un délai
borné et nommé, le run est mort : le dire et le relancer.

> Annoncer « en cours » sans l'avoir mesuré, c'est `R37` appliqué à soi-même : l'écran qui affirme
> un geste qui n'a pas eu lieu. C'est le défaut que ce projet traque, et il n'a pas d'exception
> pour l'agent qui le traque.

**Récidive, nuit du 7 au 8 septembre — la règle 35 nommée, puis pas appliquée.** Le `verify` de
Lot 3 tranche 4 a été lancé en tâche de fond SANS qu'aucun budget ne soit nommé au lancement.
Il s'est arrêté à « build… » (le propre build de production de `clics/run.ts`, avant la
première station) et n'a plus grossi pendant **9 h 05** avant d'être repéré — par le fondateur,
pas par l'agent. La règle 35 dit vrai depuis la nuit du 6 au 7 : elle n'a simplement jamais été
appliquée, faute d'un budget écrit au moment du lancement pour la déclencher.

**Forme opérative de la règle 35 — le budget est TENU PAR LE SHELL, jamais par le jugement de
l'agent.** Un rappel qu'on doit se faire à soi-même est plus faible qu'une commande que le shell
fait respirer. Tout run long (`verify`, `clics`, `screens`, tout ce qui dépasse quelques minutes)
se lance désormais sous un `timeout` EXPLICITE, le budget écrit dans le message qui lance la
commande, jamais seulement dans la tête de l'agent :

```
set -o pipefail
timeout 3600 npm run verify 2>&1 | tee /tmp/verify-<tranche>.log ; echo "EXIT=$?"
```

Un `EXIT=124` dit que `timeout` a tué le run — mort par le budget, pas par un vrai résultat ; à
distinguer d'un `EXIT` de la commande elle-même. Choisir le budget sur une mesure déjà connue de
ce dépôt (`npm run verify` complet : environ 60 minutes mesurées à plusieurs reprises cette
session — un `timeout` de 3600 s laisse la marge normale sans laisser tourner neuf heures pour
rien), jamais une estimation inventée. Ceci ne remplace pas la lecture du disque (log qui
grossit, `mtime`) pendant l'attente — les deux se combinent : le shell garantit une fin, la
lecture du disque dit si le run est VIVANT avant cette fin.

**`set -o pipefail` N'EST PAS DÉCORATIF, RÉCIDIVE DU 2026-09-08 (Lot 4, tranche 3).** La forme
ci-dessus, TELLE QU'ÉCRITE SANS `pipefail`, rend `$?` INUTILISABLE : dans un pipe `cmd | tee
fichier`, bash rend par défaut le code de sortie du DERNIER maillon (`tee`, qui réussit presque
toujours), pas celui de `cmd`. Un `npm run verify` réellement rouge (un test vitest en échec,
mesuré ce jour-là : `Test Files 1 failed | 111 passed`) a rendu **`EXIT=0`** avec la forme d'origine
— prouvé en local : `bash -c 'exit 42' | tee f ; echo $?` rend `0` sans `pipefail`, `42` avec.
Seule la lecture du CONTENU du log (compter « failed », lire le nombre de tests) avait évité que
ce rouge passe pour un vert cette fois — la garde `EXIT=` elle-même ne gardait rien. `set -o
pipefail` (une ligne, avant le `timeout`) restaure un `$?` qui reflète vraiment `npm run verify`,
pas `tee`. Ne jamais retirer cette ligne, et ne jamais faire confiance à un `EXIT=` qui ne l'a
pas précédée.

**Une attente sur la CI GitHub n'a NI processus local NI notification de fin — même défaut que la
règle 35, une couche plus loin (2026-09-08, lot contrôle interne).** Le `deploye`/`vérifier` de
GitHub Actions tourne SUR GITHUB, pas dans le bac à sable : programmer un réveil différé et
attendre « je confirmerai une fois la CI terminée » ferme le tour sans RIEN d'armé — aucun
processus dont la mort avertit, aucune tâche de fond dont la fin notifie. Un tour qui se termine
ainsi peut rester silencieux indéfiniment, exactement le défaut que la règle 35 nomme pour un run
local. **La forme correcte** : soit un réveil planifié qui, à son réveil, RELIT l'état de la CI par
l'API (jamais une croyance que « ça a dû finir ») et en relance un autre si ce n'est pas fini ; soit
un sondage BORNÉ dans le même tour (`gh run watch <run-id>` ou l'équivalent par l'outil GitHub de la
session, sous un délai explicite). Ne jamais fermer un tour sur une attente CI sans l'une des deux
formes armée.

## 4. La règle du compte rendu (matin, soir, fin de mandat)

- **Ne jamais conclure au-delà du document** : le rapport dit ce qui a été mesuré, sur quel SHA,
  par quelle commande. « Vert » sans commande et sans SHA n'est pas un mot du rapport.
- **Transcrire intégralement la liste « non prouvé »** du rapport précédent, ligne par ligne, et
  dire pour chacune ce qui a bougé. Une ligne ne se retire qu'avec « levée le … sur le SHA … par
  la mesure … ».
- **Citer le SHA** sur lequel chaque preuve a été obtenue. « Dernier arbre » n'est pas un SHA.
- **Énumérer les constats hostiles** avec identifiant, énoncé court, état, SHA de correction.
  Un constat sans identifiant est impossible ; un compte se calcule depuis la liste.
- **Nommer les commandes de `verify` non exécutées**, une par une. Le silence n'est pas une
  option de présentation.
- **Nommer un instrument pour ce qu'il fait**, pas pour ce qu'il devrait faire (« vérifie » n'est
  pas « crée » ; « la première divergence » n'est pas « les divergences »).
- **Le SHA servi est MESURÉ ou déclaré non mesurable**, jamais supposé égal au SHA poussé.
- Deux parcours en fin de rapport : celui de l'épure (un auditeur qui découvre la plateforme) et
  celui de quinze minutes avec au moins trois refus à voir, qui **ne finit pas sur `/testing`**
  tant que le #418 vit.
- Le rapport est un artefact ENGENDRÉ (`docs/REPRISE.md` par `npm run reprise` ; le tableau des
  preuves et les constats hostiles depuis leurs fichiers de données). La prose commente ; elle
  n'énonce aucun chiffre que le script n'a pas produit.

## 5. Disposition du dépôt

- `docs/` — documents de programme (00 idées du fondateur … 09 gates, DECISIONS,
  DECISIONS_AUTONOMES, ASSUMPTIONS, OPEN_QUESTIONS, BACKLOG_REPORTE, REGISTRE_IDEES, PLAN_RLS,
  MIGRATIONS_BANDES, les rapports SOIR/NUIT2/MATIN_J4, **REPRISE.md** engendré, **CHASSE.md**).
  Source de vérité.
- `dataset/` — générateur de données synthétiques (déterministe, germé), fichiers engendrés,
  ANOMALIES.md (la suite d'acceptation), `definitif/` (le FEC définitif du parcours).
- `app/` — application Next.js + TypeScript (local-first, zéro compte externe). `src/lib/services`
  (le métier), `src/lib/core` (gardes d'étanchéité, sonde, événements), `src/lib/db` (client,
  migrate, assertions de rôle), `src/app` (écrans), `scripts/` (harnais : clics, screens, fumee,
  accept, visuel, gardes, langue, lectures, parcours, deploiement, reprise).
- `supabase/migrations/` — migrations SQL (PGlite en local, Supabase en production). Bandes :
  130–999 « colonne vertébrale » ; dernière : 0142. Ne jamais éditer une migration appliquée.
- `methodology/` — LA MÉTHODE DU CABINET EST DE LA DONNÉE (procedures, risque, assertions,
  questionnaire, papier, acceptation, independance), validée par `valider.mjs`.
- `tests/` — tests transverses (parcours de bout en bout, balayage des écrans).
- `STATUS.md` — les tranches datées. `DEMO_APP.md` — la mission entière dans l'application.
  `DEMO.md` — lancer la démonstration. `DEPLOY.md` — Vercel + Supabase. `COST.md` — dépense IA.

## 6. Commandes

- **Montrer le produit** : `cd app && npm run demo` (base vide → migrations → monde de
  démonstration → serveur ; chaque étape qui peut échouer dit quoi faire, ADR-095).
- Développer : `cd app && npm install && npm run db:setup && npm run dev`.
- Reprise : `cd app && npm run reprise` → engendre `docs/REPRISE.md`.
- Tests : `cd app && npm test` (Vitest, zéro réseau ; inclut le balayage des écrans, ~7 min).
- Écrans en production : `npm run screens` ; avec le garde de locataire ARMÉ dans le serveur :
  `npm run screens:garde`.
- Parcours cliqué en production : `npm run clics` (ne re-sème PAS ; base semée requise :
  `npm run db:reset && npm run demo:seed` d'abord — sur une base déjà jouée, des stations
  rougissent pour rien (mesuré une fois à 19 sur 28, arbre du 3 septembre 2026 ; non rejoué
  depuis, donc non réaffirmé comme un chiffre actuel).
- Revue visuelle : `npm run visuel`. Densité : `npm run densite`. Fumée : `npm run fumee`.
- Gardes : `npm run gardes` (et `-- --figer` après en avoir ajouté une). Langue : `npm run langue`,
  `langue:epreuve`. Lectures : `npm run lectures`, `lectures:epreuve`. Parcours figé :
  `npm run parcours`, `parcours:epreuve`. Plancher : `npm run plancher`.
- Tout : `cd app && npm run verify` (~60 min). Une livraison nomme celles qui n'ont pas tourné.
- Déploiement : `npx tsx scripts/deploiement/atteint.ts <url> <sha> --minutes=15`.

## 7. Ce qu'une session apprend à ses dépens — écrit pour qu'elle ne le réapprenne pas

- **PGlite est à écrivain unique** : tuer `next-server` avant `db:reset` ; ne jamais lancer
  `db:reset`, `demo:seed`, `clics`, `screens` pendant qu'un autre harnais ou un sous-agent
  tient la base — deux vitest en parallèle font tomber le serveur du balayage.
- Chaque FICHIER vitest a sa propre base en mémoire : les tests ciblés sont sûrs en parallèle.
- `sleep` est bloqué dans le shell de l'agent : `node -e "setTimeout(()=>{},N)"`.
- `pkill -f "clics/run.ts"` tue le shell de l'agent lui-même : `pkill -f "clics/ru[n].ts"`.
- Un heredoc contenant certains caractères est refusé par le harnais : passer par l'outil
  d'écriture de fichier.
- `npm run X > fichier` : la sortie n'est visible qu'à la fin du processus.
- Un `cd` dans une commande de fond ne persiste pas ; `cd app` depuis `app/` échoue en silence
  et la commande ne part pas — vérifier `pwd`.
- Le bac à sable ne joint pas `*.vercel.app` (CONNECT 403) : le SHA servi se lit par la CI
  (`deploye`) ou par un outil Vercel de la session, jamais par `curl`.
- `import.meta.glob` (Vitest) demande un cast explicite en TypeScript.
- Une station cliquée juge `!refus(p)` ET une variation mesurée, jamais un compteur qui était
  déjà vrai avant le clic.
