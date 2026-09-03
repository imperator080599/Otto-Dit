# Mandat de nuit n°2 — le rapport du réveil

**L'URL** : https://otto-dit.vercel.app — SHA réellement servi au moment où j'écris,
**`d8d9e03b67cc8add843e18119d93551aace5e08a`**, mesuré à 03:51 UTC sur `/api/sante`
(`version.shaExecution` = `sha` = source `git`, identité cohérente) : **vingt et une lectures,
toutes vertes**, dont « monde enrichi » et « replis mémorisés par personne ». Les trois
livraisons de la nuit ont été servies tour à tour (`5f7c28b`, `5ba3408`, `fa448d8`, `d8d9e03`) ;
c'est le dernier qui répond.

## Ce qui est cliquable ce matin et ne l'était pas hier soir — en cinq lignes

1. **Le dossier de démonstration a une forme** : quatre états de section chez quatre personnes,
   sept papiers sur le chiffre d'affaires à des visas différents dont un PÉRIMÉ, cinq notes de
   revue ouvertes de 1 à 14 jours ouvrés, le processus ventes N/N-1 statué, la matrice
   risques-contrôles, quatre lignes de grille conclues, une revue analytique rédigée.
2. **Trente sections d'écran se replient**, sur dix-neuf écrans, et le repli est retenu **en base,
   par personne** : il suit la personne d'une machine à l'autre, et le serveur le connaît au
   premier rendu.
3. **Le fil d'une note de revue s'ouvre à côté du travail** : le repère d'une cellule ouvre un
   panneau latéral — type, ancienneté en jours ouvrés, destinataire, réponses — où l'on répond
   sans quitter l'écran, et où la clôture non offerte dit POURQUOI.
4. **Une décision humaine de périmètre n'est plus réécrite au déploiement** ; l'information
   produite par l'entité est déclarée VRAIE sur les papiers rédigés ; un papier dépassé n'est
   plus une section de travail ; rédiger exige d'être de l'équipe, et dépasser un visa exige un
   motif écrit.
5. **Une passe esthétique** : jetons d'espace et d'élévation, hiérarchie typographique, chiffres
   tabulaires dans tous les tableaux, focus visible au clavier, mouvement de 160 ms sur les seuls
   changements d'état, et `prefers-reduced-motion` qui coupe tout d'un bloc.

## Ce que je n'ai PAS fait, exhaustivement

- **1.4** (section « Audit procedures » alimentée par le risk assessment) et **1.5** (re-tirage
  d'échantillon) : non commencées. Les briques de 1.4 existent pourtant (`services/programme.ts`,
  planifier et rédiger, PROG-01..06) — c'est l'écran qui manque.
- **Tout l'étage 2** (test des écritures, registre des anomalies, revue analytique périmée qui
  bloque le visa), **l'étage 3** (RLS étapes 1 et 2, instrumentation du #418, sonde et écritures
  hors base) et **l'étage 4** (demandes au niveau du marché, cycle de vie du constat).
- **Les onglets d'ancrage sur les écrans neufs** (N2-1) : une barre construite côté client
  rendrait un `<nav>` vide au premier rendu — la forme même du #418.
- **Le squelette de chargement** (N2-4) : écrit, puis retiré (voir plus bas).
- **Le classement des tables hors dossier** (N2-5).

## Ce que la CI a rougi cette nuit, et pourquoi

Deux travaux rouges sur `main`, tous deux **des instruments qui mesuraient à côté**, pas des
défauts du produit — et tous deux corrigés :

- **`langue:epreuve` 13/15** : un point d'injection de l'épreuve n'existait plus (le titre
  `<h2>{t('dash.requestTracker')}</h2>` est devenu le titre d'une section repliable). L'épreuve
  suit l'écran : le point est déplacé, la règle redevient 15/15. Une épreuve qu'on retire parce
  que l'écran a changé est une épreuve qu'on perd.
- **`accept` contre l'URL, E-01 3/4** : la tâche lisait les badges des LIGNES de section — or
  la liste dépend de qui regarde. Elle passait en local et tombait en ligne : elle mesurait
  l'identité, pas l'écran. Elle lit désormais l'avancement du DOSSIER (le compte par état de la
  barre, `data-legende`/`data-n`), et un état à zéro ne compte toujours pas.

## Les verdicts de la CI sur le SHA servi (`d8d9e03`), lus, pas supposés

- **Travail `url` (contre l'instance déployée) : 16 tâches sur 17.** Passent en ligne, entre
  autres : le monde enrichi (quatre états, sept papiers dont un visa périmé, dix notes ouvertes
  dont une sur une cellule) et **N-01 — le panneau latéral** : « 1 repère · 1 note dans le
  panneau · *posted 1 business day(s) ago* · 0 clôture offerte, 1 raison écrite · repli basculé
  puis remis ». La seule rouge est **A-05**, et son message dit tout : le refus attendu est bien
  observé (« Ce papier est visé : l'information produite par l'entité ne se modifie plus »),
  puis une **exception #418** est comptée sur la page — la tâche tombe à cause du fil ouvert
  du #418, pas de la règle qu'elle vérifie.
- **Travail `local` : un test rouge sur 710**, ci-dessous.

## Un rouge que je n'ai PAS su reproduire (et que je ne maquille pas)

La CI du commit `d8d9e03` a rougi sur **un test, une fois** :
`grille.test.ts > la disposition écrite lève TEST-04 … » — « expected null not to be null »` à la
dernière assertion (après remise du delta à sa valeur d'origine, la disposition doit couvrir de
nouveau). **Rejoué quatre fois en local — deux suites complètes (710/710) et deux fois le fichier
seul (24/24) — sans jamais le reproduire.** Les fichiers de test tournent chacun sur une base
PGlite neuve en mémoire : il n'y a pas de couplage entre fichiers à incriminer, et rien dans le
commit ne touche la grille (il ne change que deux harnais, un attribut de page et des documents).

Je n'ai donc **pas de diagnostic**, seulement une hypothèse non prouvée (une donnée limite —
un delta nul contre un delta chiffré — dans la cellule que le test choisit). Conformément à la
règle 18, je ne l'écris pas comme une cause et je ne « corrige » pas un test que je ne comprends
pas : c'est inscrit comme fil ouvert (N2-6), à reprendre avec une exécution qui échoue.

## Ce qui n'est PAS prouvé

- La **RLS** n'est toujours pas éprouvée sous le rôle qui sert l'application : il la contourne
  (`rolbypassrls`). La politique posée sur `ui_repli` (0132) est donc **inerte en production**, et
  la revue hostile a montré qu'elle REFUSERAIT tout sous un rôle qui la respecte, tant que
  l'application ne pose pas le locataire par transaction. C'est l'étape 1 de PLAN_RLS, non faite.
- Le **#418** reste ouvert : une exception d'hydratation intermittente sur `/eng/[id]/testing`,
  vue une fois sur trois exécutions cette nuit, aucune hypothèse prouvée.
- Le panneau latéral n'a été conduit **qu'avec les trois identités de la démonstration** ; aucun
  test ne l'exerce avec un compte sans droit de clôture sur un dossier d'un autre cabinet.

## Trois risques

1. **La mémoire des replis est un objet d'écran qui vit en base.** Elle est bornée (500 par
   personne) et le locataire vient de la personne, mais elle grossit avec l'usage et voyage dans
   le rendu de chaque page. Si elle devient lourde, c'est une charge par requête, pas un bug.
2. **Le monde de démonstration est enrichi à CHAQUE déploiement.** Il ne réécrit plus une
   décision humaine, mais il pose encore des visas au nom de personnes fictives : le jour où de
   vrais comptes travaillent sur la démonstration publique, cette convention doit tomber (N2-2).
3. **Le parcours cliqué est le seul filet sur 188 stations.** Une frontière de suspension a suffi
   à en éteindre vingt sans qu'aucun autre instrument ne bronche ; un harnais qui lit trop tôt
   accuse le produit à sa place.

## Ce que les revues hostiles ont cassé

**Vingt-trois constats en deux revues** (1.1 : 12 dont 1 bloquant ; 1.2 : 11 dont 2 bloquants).
**Vingt et un corrigés cette nuit**, deux tenus pour acquis et écrits (ADR-126 n°11, ADR-128 n°4
déjà corrigé avant la revue). Les trois plus lourds : une décision humaine de périmètre réécrite
à chaque build ; un repli qui pouvait ranger le bouton de scellement ; un locataire passé en
paramètre qui laissait écrire une ligne au nom d'un autre cabinet.

## Un parcours de quinze minutes, avec trois refus

1. Ouvrir `/travaux`, puis le dossier **Altiverre FY2025**. Le rail se lit par états financiers.
2. Aller sur **Chiffre d'affaires** : sept papiers, un visa PÉRIMÉ en en-tête, la leadsheet et
   ses variations signées.
3. Cliquer le repère ✎ sur la cellule d'un compte : le **fil s'ouvre à côté**. Lire l'ancienneté
   en jours ouvrés. **Refus n°1** : la clôture n'est pas offerte, et la raison est écrite.
4. Vider la revue analytique du poste et enregistrer. **Refus n°2** : ANA-01, rien n'est écrit.
5. Aller dans l'atelier de test (`/testing`), conclure une ligne dont une cellule n'est pas
   conforme. **Refus n°3** : TEST-04, le code et l'attribut nommés.
6. Replier « Papiers du poste », changer d'écran, revenir : la section est restée rangée.
