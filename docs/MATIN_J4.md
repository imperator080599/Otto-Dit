# Au réveil — nuit du 3 au 4 septembre 2026

> Un écran. Ce qui a changé, ce qui ne l'est pas, et deux chemins à parcourir soi-même.

## L'adresse et le SHA servi

- **URL** : https://otto-dit.vercel.app
- **SHA servi** : à lire sur `https://otto-dit.vercel.app/api/sante` (champ `version`) — le bac à
  sable de l'agent ne peut pas atteindre `*.vercel.app` (CONNECT 403 par la politique réseau), donc
  je ne l'affirme pas d'ici. Ce qui est poussé sur `main` cette nuit : voir la section « Preuves ».

## Nouvellement cliquable, en cinq lignes

1. **« Programme de travail »**, destination neuve du rail : poste par poste, ce que l'évaluation du
   risque COMMANDE, avec la phrase qui le justifie et la taille d'échantillon. **Planifier une
   procédure en un clic**, puis **rédiger son papier depuis la même ligne**. Ces trois services
   existaient depuis des semaines sans qu'aucun écran ne les appelle : seul le semeur les touchait.
2. **Ré-importer le grand livre définitif, re-tirer, et retrouver les pièces du client** sur les
   lignes du nouveau tirage. Avant cette nuit, elles disparaissaient sans un mot.
3. Sur l'écran du **sondage**, une section neuve : *ce qui est sorti du tirage et porte du travail*
   — et une décision écrite pour chaque ligne, affichée avec qui l'a prise et quand.
4. **Trois refus de plus à voir** : statuer sans motif (TIRAGE-03), statuer une ligne qui n'est pas
   sortie (TIRAGE-02), dépasser un papier visé sans motif (PROG-06).
5. Sur l'écran des **obstacles**, les AVERTISSEMENTS — ce qui bloquerait si le pack le déclarait
   bloquant — étaient calculés et lus par personne. Ils sont là, à part, jamais comptés parmi les
   obstacles.

## Ce qui N'EST PAS fait, exhaustivement

- **Étage 1.1 — livré** (ADR-134), avec ses six constats hostiles corrigés et quatre reportés
  (R38 à R40). Ce qu'il NE fait pas, écrit : il ne réordonne pas le programme, ne saisit ni
  population ni taille (elles viennent de la méthode), et ne retire pas une procédure planifiée.
- **Étages 2, 3, 4, 5** : rien. L'épure, le test des écritures, le registre des anomalies, la revue
  analytique périmée, l'espace de demandes, le cycle de vie du constat client, l'IA vivante — aucun
  n'a été commencé.
- **Étape 3 de PLAN_RLS** : NON exécutée, comme le mandat l'interdisait.
- **Le mode IA vivant** : non activé, comme le mandat l'interdisait.
- `DATABASE_URL` non modifié. Aucune dépense engagée.

## Les preuves, et le SHA sur lequel chacune a été obtenue

| Mesure | Valeur | SHA | Commande qui la reproduit |
|---|---|---|---|
| Types | 0 erreur | `580f2cf` | `cd app && npx tsc --noEmit` |
| Tests | **806 / 806** | dernier arbre | `cd app && npm test` |
| Registre des gardes | **43**, toutes attaquées | `580f2cf` | `cd app && npm run gardes` |
| Plancher de tests | 793 collectés, plancher 632 | `580f2cf` | `cd app && npm run plancher` |
| Langue | 0 chaîne hors catalogue, 0 libellé en dur | `580f2cf` | `cd app && npm run langue` |
| Lectures d'écran | 0 perdue sur 1 627 chemins, 85 écrans | `580f2cf` | `cd app && npm run lectures` |
| Parcours **cliqué** | **201 étapes, 3 échecs** (9 en début de nuit, et 4 étapes de plus) | dernier arbre | `cd app && npm run db:reset && npm run demo:seed && npm run clics` |
| Sonde d'hydratation | **0 incident** sur ce passage ; **1 capturé** au passage précédent, analysé dans ADR-132 | `580f2cf` | idem (le rapport est en fin de sortie) |
| Étanchéité, garde armé | 85 routes, 0 échec sous LOC-01 | `c36076f` | `cd app && npm run screens:garde` |
| Reprises / sorties du re-tirage | 12 écritures communes · 33 pièces sauvées · 4 sorties statuées | `580f2cf` | requêtes dans ADR-133 |

**Les trois échecs qui restent** : deux de **R37** (la clôture), un de **R41**. R41 est de mon fait,
et la station le DIT désormais mot pour mot au lieu de le taire : « le formulaire IPE est absent du
papier rédigé — obligation créée et non tenue ». Rédiger un papier ouvre l'obligation de dire s'il
s'appuie sur une information produite par l'entité ; ma station crée cette obligation et ne la tient
pas. Deux tentatives n'ont pas abouti ; plutôt que de corriger à l'aveugle avec des cycles de vingt
minutes (règle 18), la branche a été rendue BRUYANTE, sa cause nommée, et la sortie écrite en R41.
Le fait d'origine des deux autres :

**R37 :** après le re-tirage, cinq
lignes neuves n'ont jamais été demandées au client — la demande de justificatifs de l'échantillon
courant n'existe pas, alors que l'écran a annoncé l'avoir engendrée. La boucle les compte « en
attente de dépôt », l'obstacle subsiste, le dossier ne se clôt pas. Avant l'étage 1.2, c'étaient
DIX-SEPT lignes, dont douze dont les pièces étaient déjà au dossier.

**Ce que je n'ai PAS fait tourner cette nuit**, et qui fait partie de `npm run verify` :
`npm run fumee`, `npm run densite`, `npm run visuel`, `npm run parcours:epreuve`,
`npm run lectures:epreuve`, `npm run langue:epreuve`. Le temps est allé aux mesures et aux
corrections ; ces six-là restent à passer avant de considérer la chaîne complète.

## La liste « NON PROUVÉ », transcrite intégralement (docs/SOIR.md §3), et ce qui a bougé

> Transcription mot pour mot, suivie de son état ce matin. Aucune ligne n'est retirée.

1. **TEST-01** : aucun écran ne peut demander une cellule verte sans ancre — refus prouvé en deux
   passes (G-13), jamais par un clic. → **inchangé.**
2. **Depuis le bac à sable de l'agent, l'URL déployée est inaccessible** (CONNECT 403 par la
   politique réseau) : les verdicts déployés ci-dessus sont ceux de la CI `url`, pas d'un clic de
   l'agent. [suit le récit des deux passages, run 33640390712 / SHA 3bc9bd0 puis run 33643239966 /
   SHA 8302a23 — le harnais lisait l'URL avant la redirection de l'action serveur ; corrigé, second
   passage PASS.] → **inchangé cette nuit : je n'ai pas atteint l'URL.**
3. **L'isolation entre cabinets est INERTE en production** : l'application tourne sous le rôle
   `postgres` (BYPASSRLS, ADR-115) ; la RLS est activée et forcée sur 106 tables mais n'est
   appliquée à personne ; la seule isolation à l'écriture est la garde de service G-20. → **toujours
   vrai.** L'étage 0 de cette nuit a câblé le garde et l'a éprouvé sous LOC-01 armé en local
   (`npm run screens:garde` : 85 routes, 0 échec), mais **l'étape 3 de PLAN_RLS n'est pas exécutée**
   et le mandat l'interdisait. Tant qu'elle ne l'est pas, cette ligne reste vraie mot pour mot.
4bis. **LE #418 A ÉTÉ CAPTURÉ CETTE NUIT, avec assez de contexte pour nommer une cause.** Le HTML
   servi est celui de `/reunions` ; le DOM relevé au moment de l'erreur est celui de `/loop` — **ce
   ne sont pas deux versions d'une page, ce sont deux pages**. L'hypothèse qu'appuie cette
   observation : le #418 arrive quand une navigation côté client commence AVANT que le document
   précédent ait fini de s'hydrater. Elle explique l'intermittence, le `args[]=HTML` constant,
   l'absence de tout divergent statique, et pourquoi l'erreur s'est vue en ligne (hydratation plus
   longue) et presque jamais en local. **Ce n'est pas encore un diagnostic** : l'expérience dirigée
   qui le trancherait — cliquer un lien sans attendre `load`, compter, puis attendre et recompter —
   n'a pas été conduite. Tout est dans ADR-132, bytes compris.

4. **#418 (hydratation)** : NON reproduit sur les sept parcours locaux du jour, mais OBSERVÉ une
   fois en ligne par le harnais d'acceptation (run 33643239966, tâche A-05, page du papier de
   travail REV-01, « Minified React error #418 ; args[]=HTML »). Aucune cause prouvée. → **une
   mesure de plus, pas une cause.** La sonde d'hydratation existe désormais et n'a relevé **aucun**
   incident sur les 196 étapes du parcours cliqué, en production, sur base fraîche. Ce que cette
   nuit a ÉLIMINÉ est écrit dans ADR-132 : les séparateurs de milliers d'ICU (Node 22 et Chromium
   141 rendent tous deux U+202F — sur CETTE machine), l'ordre des attributs, le formulaire d'action
   serveur, le doctype et l'ordre du `<head>`, et le seul divergent statique du dépôt
   (`global-error.tsx`, corrigé). **La cause reste inconnue**, et la sonde ne tourne pas sur
   l'instance déployée : c'est là que le défaut a été vu.
5. **La signature du BL** n'est jamais relevée par l'extraction : la cellule est « absente » sur
   chaque ligne à BL, et se dispose (un humain regarde). → **inchangé.**

**À ajouter à cette liste ce matin** : la station cliquée du re-tirage n'a été conduite qu'en local,
sur le monde semé ; et les cinq chemins de lecture de R33 ne remontent pas le lignage — c'est écrit,
ce n'est pas corrigé.

## Trois risques, leur déclencheur et leur remède

1. **La famille « tirage » bloque le visa, et elle est neuve.** *Déclencheur* : un dossier réel où
   un re-tirage laisse beaucoup de lignes derrière lui — le signataire trouve une liste à statuer
   qu'il ne comprend pas. *Remède* : quatre cas de faux positif la tiennent déjà ; si elle crie trop
   fort, la basculer en avertissement par un drapeau de pack (le mécanisme existe :
   `flags.unsupportedSampleItemsBlocking`), sans toucher au calcul.
2. **Le papier de travail et la provenance ne remontent pas le lignage (R33).** *Déclencheur* : un
   inspecteur ouvre le papier d'une ligne reprise et n'y trouve pas la pièce que l'atelier montre.
   *Remède* : le fragment `LIGNAGE` est en un seul endroit ; l'étendre à `draft.ts` puis
   `provenance.ts` est mécanique — c'est le premier geste du jour, avant tout écran neuf.
3. **Le rôle `postgres` en production** : une faute de service (une requête sans `engagement_id`)
   expose un autre cabinet. *Déclencheur* : toute lecture nouvelle écrite sans le filtre, tant que
   l'étape 3 de PLAN_RLS n'est pas faite. *Remède* : l'étape 3, qui est prête et interdite cette
   nuit ; d'ici là, le harnais d'étanchéité exécuté (`etancheite-executee.test.ts`) appelle chaque
   fonction gardée avec un intrus et observe le refus.

## Ce que le sous-agent hostile a trouvé, énuméré, avec son état

Revue lancée sur l'étage 1.2, sur l'arbre de travail précédant le commit de la tranche. Quatorze
constats. Chacun a été vérifié par la revue **en empruntant le chemin** (appel réel de la fonction),
jamais par un `grep` seul.

| # | Constat | État |
|---|---|---|
| 1 | Le tirage courant n'était pas filtré par procédure : un échantillon de test de contrôle (`sox.ts`) plus récent faisait ressurgir les 12 lignes reprises. Mesuré : 4 sorties → 15, obstacles 0 → **13**. | **CORRIGÉ** + cas de faux positif |
| 2 | Un seul chemin de lecture suivait la chaîne. Mesuré : `lignesAtelier` = 2 pièces, `draftRevenueWorkpaper` = 0. | **CORRIGÉ EN PARTIE** : la grille de test suit désormais (3 chemins) ; les cinq autres sont en **R33**, et les documents ne prétendent plus le contraire |
| 3 | « Remise au tirage » écrivait la décision, levait l'obstacle, et ne remettait rien au tirage. | **CORRIGÉ** : l'option est retirée ; le geste réel est en **R31** |
| 4 | Un écart posé sur une ligne reprise tombait dans un angle mort double. | **CORRIGÉ** (l'atelier remonte aussi les écarts) |
| 5 | Le prédicat de « travail » ignore `verification_check` et `wp_extra_cell`, deux artefacts humains. | **NON CORRIGÉ — R34** |
| 6 | Après le re-tirage, la demande PBC redemande au client des pièces déjà reçues. Mesuré : **18 demandes**. | **NON CORRIGÉ — R33** |
| 7 | Statuer deux fois écrasait la première décision en silence. | **CORRIGÉ** : TIRAGE-04, qui nomme qui avait décidé |
| 8 | TIRAGE-01 déclaré et jamais implémenté (le comportement réel est ETANCH-04, et il est bon). | **CORRIGÉ** : le catalogue dit ce que le code fait |
| 9 | La station cliquée se déclarait VERTE quand elle ne mesurait rien, et concluait par un `grep` de texte. | **CORRIGÉ** : zéro sortie est un échec ; l'écran des obstacles nomme sa famille dans le DOM |
| 10 | La contrainte SQL neuve n'était pas au registre des gardes. | **CORRIGÉ** : G-27, attaquée et neutralisable (43 gardes) |
| 11 | La lecture `/api/sante` ne distingue pas « 0 parce que rien à faire » de « 0 parce que cassé ». | **NON CORRIGÉ — R35** |
| 12 | Les documents affirmaient plus que le code (« les chemins de lecture », « dans les deux sens », « neuf tables »). | **CORRIGÉ** : la liste exacte est écrite, et le chiffre est remplacé par la commande qui le rend |
| 13 | `union all` sans détection de cycle, pas de `check (repris_de <> id)`. | **CORRIGÉ EN PARTIE** : `union` partout ; la contrainte SQL reste à poser |
| 14 | Coût de lecture de `sortiesNonStatuees`, appelée par dossier. | **NON CORRIGÉ — R36** |

### Étage 1.1 — quatorze constats de plus, sur une seconde revue

| # | Constat | État |
|---|---|---|
| 1 | **Ma propre station cliquée notait VERT une action REFUSÉE** : le verdict portait sur « il existe une ligne planifiée » — vrai avant le clic, le semeur en planifiant déjà — et le refus n'allait que dans le détail imprimé. « Un refus calculé puis jeté », dans l'instrument qui existe pour l'attraper. | **CORRIGÉ** : aucun refus ET le compte augmente ; la branche « rien à planifier » ne se déclare plus verte |
| 2 | PROG-06 — la règle que l'écran met en avant — n'était éprouvée par aucun harnais livré. | **CORRIGÉ** : un cas de test qui vérifie aussi que la VUE sait que le papier est visé, et un pas cliqué |
| 3 | `horsCommande` était calculé puis **jeté par l'écran** quand le risque n'était pas évalué : un papier existant, invisible, pendant que `/api/sante` le comptait. | **CORRIGÉ** |
| 4 | **272 requêtes pour un rendu** à quinze postes, dont quatorze n'affichent qu'une phrase. | **CORRIGÉ** : le risque est demandé d'abord ; le calcul complet n'est payé que là où il sert |
| 5 | La lecture `/api/sante` **ne pouvait pas rougir** sur le cas qu'elle disait surveiller (le prédicat de vacuité est ancré au début de la chaîne). Quatrième récidive de la famille. | **CORRIGÉ** : elle LÈVE |
| 6 | Le panneau d'avertissements des obstacles n'est atteint par aucun harnais. | **NON CORRIGÉ** — le balayage l'ouvre, aucun clic ne le vise |
| 7 | Le défaut était constaté sur **l'écran du risque**, qui continuait d'ouvrir sur rien. | **CORRIGÉ** : un lien y mène au programme |
| 8 | Un poste **sorti du périmètre** emporte ses procédures et papiers hors du programme, alors que le libellé affirmait le contraire. | **Libellé CORRIGÉ · fond en R38** |
| 9 | Aucun document n'accompagnait la tranche. | **CORRIGÉ** : ADR-134, STATUS, backlog |
| 10 | Le commentaire de PROG-05 était périmé et sa garde presque morte. | **CORRIGÉ** (dit pour ce qu'elle est) |
| 11 | Deux scories : un champ créé pour être retiré, un libellé orphelin. | **CORRIGÉ** |
| — | Le rail place le programme au **transverse** alors que R-03 pose le poste comme axe. | **NON CORRIGÉ — R39** |
| — | `requireMember` ne filtre pas `exited_on` : un membre sorti voit les boutons. | **NON CORRIGÉ — R40**, défaut préexistant à toutes les pages |

**Ce que cette seconde revue a explicitement dédouané** : le refus PROG-06 s'affiche bien dans le
bandeau et non en page 500 (`executer` exécuté pour de vrai) ; `vise` et `dejaVise` utilisent la
même condition et basculent ensemble ; l'étanchéité des deux actions est tenue et éprouvée par un
harnais qui les APPELLE avec un intrus ; le champ motif n'est pas `required` ; la densité de l'écran
ne dépasse pas le plafond.

**Ce que cette seconde revue n'a pas pu vérifier, dans ses mots** : « je n'ai vu aucun rendu HTML du
nouvel écran — la règle 10 reste, pour cette tranche, non satisfaite par quiconque » (elle n'avait
pas le droit de lancer le navigateur ; c'est le parcours cliqué, lancé après, qui répond).

**Ce que la revue n'a pas pu vérifier, dans ses mots** : que la station 8 bis du parcours cliqué
rencontre réellement des sorties (`npm run clics` lui était interdit) ; le comportement de la
requête récursive en présence d'un cycle, qu'elle n'a pas provoqué pour ne pas bloquer le
processus ; l'effet d'une reprise sur une écriture dont le montant aurait changé au définitif — le
jeu de données n'en contient aucune.

**Ce qu'elle a explicitement dédouané** : la garde d'étanchéité de `statuerSortie` (un intrus d'un
autre cabinet est refusé, obtenu par appel réel), sa couverture par le harnais exécuté, et
l'appariement par `natural_key` (aucun tirage ne porte deux fois la même clé, et l'anomalie de
double comptabilisation du jeu de données porte deux clés distinctes).

## Deux chemins à parcourir soi-même

### A — Le chemin de l'épure : un auditeur qui découvre la plateforme (≈ 5 minutes)

*But : voir si l'écran enseigne, sans qu'on l'explique. Ne cherchez pas à réussir — regardez où vous
hésitez, et notez-le. C'est la mesure de l'étage 2, qui n'est pas fait.*

1. Ouvrir https://otto-dit.vercel.app et choisir **Claire Fontaine** (associée, celle qui signe).
2. Ouvrir le dossier **Altiverre SAS**. Sans lire le rail : **où sont vos travaux ?**
3. Aller à **Obstacles au visa**. Lisez la liste : **comprenez-vous, famille par famille, ce qui
   empêche de signer, et où l'on va pour le lever ?**
4. Ouvrir un poste (**Chiffre d'affaires**). **Comment conclut-on une ligne d'échantillon ?**
5. Notez chaque endroit où un code technique vous est présenté avant une phrase française. Ils sont
   la matière de l'étage 2.

### B — Le chemin de quinze minutes, avec au moins trois refus à voir

*Il ne se termine pas sur `/testing` : le #418 a été observé sur la page d'un papier de travail, et
tant que sa cause est inconnue, un parcours de démonstration ne s'arrête pas là où le défaut a été
vu.*

1. **Karim Benali** (senior). Dossier **Altiverre SAS**, exercice 2025.
2. Rail → **Sondage**. La sélection tirée est là, avec sa méthode et son germe.
3. Rail → **Contrôle sur pièces**. Cliquer **« Calculer la grille »**. L'en-tête dit la version, le
   nombre de colonnes, le pack et l'empreinte.
4. Cliquer une ligne **couverture exhaustive** : la pièce à droite, la bande de cellules dessous, le
   **delta signé** sur « Montant HT ».
5. **Refus 1 — TEST-04** : appuyer sur **V** sur une ligne dont une cellule n'est pas conforme.
6. **Refus 2 — TEST-03** : « Disposer » cette cellule avec le motif VIDE.
7. Disposer avec un motif, puis **V** : la ligne porte « conclue par Karim Benali ».
8. Retour au **Sondage**. Section **« Sorties du tirage courant, et porteuses de travail »** —
   nouvelle cette nuit. Lire ce que chaque ligne porte.
9. **Refus 3 — TIRAGE-03** : cliquer **« Statuer »** en laissant le motif vide. Le serveur refuse ;
   le champ n'est délibérément pas `required`, pour que ce soit la règle du serveur qui soit
   éprouvée et non celle du navigateur.
10. Écrire un motif, statuer. La décision s'affiche avec qui l'a prise et quand.
11. **Refus 4 (cadeau) — TIRAGE-04** : re-statuer la même ligne. Refusé, en nommant qui avait
    décidé.
12. Rail → **Obstacles au visa** : la famille « Tirage refait » a disparu de la liste.
13. Finir sur **Achèvement** puis **Clôture** — pas sur le contrôle sur pièces.
