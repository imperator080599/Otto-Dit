# Au réveil — nuit du 3 au 4 septembre 2026

> Un écran. Ce qui a changé, ce qui ne l'est pas, et deux chemins à parcourir soi-même.

## L'adresse et le SHA servi

- **URL** : https://otto-dit.vercel.app
- **SHA servi** : à lire sur `https://otto-dit.vercel.app/api/sante` (champ `version`) — le bac à
  sable de l'agent ne peut pas atteindre `*.vercel.app` (CONNECT 403 par la politique réseau), donc
  je ne l'affirme pas d'ici. Ce qui est poussé sur `main` cette nuit : voir la section « Preuves ».

## Nouvellement cliquable, en cinq lignes

1. **Ré-importer le grand livre définitif, re-tirer, et retrouver les pièces du client** sur les
   lignes du nouveau tirage. Avant cette nuit, elles disparaissaient sans un mot.
2. Sur l'écran du **sondage**, une section neuve : *ce qui est sorti du tirage et porte du travail*,
   avec ce que chaque ligne porte (pièces, écarts, cellules).
3. **Statuer** une de ces lignes — sans suite motivée, ou remise au tirage — et voir la décision
   affichée avec qui l'a prise et quand.
4. **Deux refus de plus à voir** : statuer sans motif écrit (TIRAGE-03), statuer une ligne qui n'est
   pas sortie du tirage (TIRAGE-02).
5. Sur `/api/sante`, une lecture de plus : *« re-tirage : reprises et sorties statuées »*.

## Ce qui N'EST PAS fait, exhaustivement

- **Étage 1.1 — l'écran « Audit procedures »** : non livré. Les briques existent depuis des semaines
  (`requiredProcedures`, `planifierProcedure`, `redigerPapierDeProcedure`) et **aucun écran ne les
  appelle** : seul le semeur de la démonstration les touche. Un auditeur ne peut toujours pas
  planifier une procédure en cliquant. C'est le premier chantier du jour qui vient.
- **Étages 2, 3, 4, 5** : rien. L'épure, le test des écritures, le registre des anomalies, la revue
  analytique périmée, l'espace de demandes, le cycle de vie du constat client, l'IA vivante — aucun
  n'a été commencé.
- **Étape 3 de PLAN_RLS** : NON exécutée, comme le mandat l'interdisait.
- **Le mode IA vivant** : non activé, comme le mandat l'interdisait.
- `DATABASE_URL` non modifié. Aucune dépense engagée.

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
