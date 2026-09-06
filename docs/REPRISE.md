# Reprise — l'état du projet, engendré

> **Ce fichier est ENGENDRÉ** par `cd app && npm run reprise` depuis `docs/reprise.src.md` (le
> gabarit), `docs/instantanes/*.json` (les mesures), `docs/BACKLOG_REPORTE.md` (les fils),
> `docs/CHASSE.md` (ce qui est en cours d'investigation), `app/package.json` (la chaîne de
> `verify`) et l'état de git et des processus au moment de l'engendrement. **Ne pas l'éditer à
> la main : relancer la commande.** Un instantané n'est vrai qu'à sa date.
>
> Engendré le 2026-09-06T08:33:38.468Z.

## 1. Où en est le projet — en dix lignes (la seule partie écrite à la main ; elle ne porte aucun chiffre)

1. OTTO est une plateforme d'audit AI-native : noyau agnostique du référentiel, packs (NEP/France,
   PCAOB-SOX), méthode de cabinet en DONNÉES (`methodology/`), interface française, local-first
   (PGlite) ; production Vercel + Supabase sur `https://otto-dit.vercel.app`.
2. La mission entière existe au clic, de la création du dossier à l'archive scellée téléchargée
   (`DEMO_APP.md`), sur le seul cycle du chiffre d'affaires ; le périmètre est gelé (règle 14).
3. Nuit J3 (3 → 4 septembre 2026) : étage 0 (la dette d'étanchéité entre cabinets), étage 1.2 (le
   re-tirage ne fait plus disparaître le travail humain, migration 0142, famille d'obstacles
   « tirage »), étage 1.1 (l'écran du programme de travail, que trois services attendaient) —
   livrés, et servis par l'URL depuis `a06a7f1`.
4. Le déploiement était mort pendant trois tranches parce qu'une migration APPLIQUÉE avait été
   éditée ; réparé (0141 idempotente, empreinte des migrations dans `migrate()`), et le travail CI
   `deploye` exige désormais que le SHA poussé devienne le SHA servi en quinze minutes.
5. Non fait, du mandat de nuit : les étages 2 à 5 (épure, test des écritures, registre des
   anomalies, revue analytique périmée, espace de demandes, cycle de vie du constat client, IA
   vivante). Du mandat du semeur [hors dépôt : texte du fondateur, non versionné] — commencé :
   §2 (le compte rendu engendré, ce fichier). Non commencé : §1 (`docs/SEMEUR_VS_CHEMIN.md`,
   R44), §1.2 (R37 et R41, en chasse mais pas corrigés), §3.
6. Les interdits restent entiers : étape 3 de PLAN_RLS, IA vivante, `DATABASE_URL`, toute
   dépense, re-semis de la démonstration publique (CLAUDE.md §2).
7. L'isolation entre cabinets est INERTE en production (rôle `postgres`, BYPASSRLS) : la garde de
   service existe et est éprouvée, la RLS n'est appliquée à personne. Vrai tant que l'étape 3
   n'est pas faite, et elle est interdite sans mandat écrit.
8. Le #418 est CAPTURÉ, pas diagnostiqué : les faits, les hypothèses éliminées et celle à éprouver
   sont dans `docs/CHASSE.md`, avec le protocole de l'expérience et son cas connu mauvais.
9. Le parcours cliqué local porte des échecs connus et nommés (R37, R41) ; leur dernière mesure
   consignée est dans le tableau du §5, avec son SHA.
10. Tout ce qui suit est produit par le script. Si une ligne vous semble fausse, c'est un
    instantané périmé ou un défaut du script — pas une opinion à corriger dans le texte.

## 2. Le SHA poussé et le SHA servi

- **HEAD** : `5017239` — « La garde qui rend « poussé mais pas déployé » impossible »
- **État de l'arbre** : arbre MODIFIÉ (11 fichier(s), docs/REPRISE.md excepté — son changement à chaque engendrement ne compte pas) : le disque n'est PAS HEAD — ce qui suit vaut pour HEAD, pas pour les modifications en cours · HEAD = `origin/main` selon la dernière synchronisation locale (`git fetch` pour le confirmer)
- **SHA servi** : `5017239` sur https://otto-dit.vercel.app, mesuré le 2026-09-04T00:13:06Z (il y a 56 h) par CI, travail `deploye`, run 33820470648, job 100861844608 — scripts/deploiement/atteint.ts a vu l'instance servir le SHA poussé — **ÉGAL au HEAD**
  Historique : `a06a7f1` le 2026-09-04T00:07:37Z (atteint.ts, run 33820470648, job 100861844608, première observation (« 0 s · servi a06a7f1 ») avant que 5017239 ne devienne servi à 00:13:06Z) · `e004053` le 2026-09-03, heure non mesurée (constat en prose du commit a06a7f1 (« /api/sante sert e004053, celui d'hier matin ») ; aucune lecture datée de /api/sante n'accompagne ce constat — ne pas le lire comme une mesure rejouable)

## 3. Les fils ouverts, avec leur identifiant et leur état

Source : `docs/BACKLOG_REPORTE.md` pour l'énoncé, `docs/instantanes/fils.json` pour l'état. La
fenêtre suivie ici est R24 et suivants, et N2-x : R1–R23 sont des reports du plan de nuit
(`OTTO_Plan_Nuit.md`), en tableau, et ne sont pas des fils au sens de cette section. Dans cette
fenêtre, un fil du backlog sans état NON VIDE consigné fait ÉCHOUER l'engendrement — une entrée
présente mais vide est le même manque qu'une entrée absente (règle 23).

| Fil | Énoncé | État | Depuis | Note |
|---|---|---|---|---|
| #418 | « Minified React error #418 ; args[]=HTML » — vu en ligne sur la tâche A-05 de l'acceptation, capturé une fois en local avec son HTML servi et son DOM | EN CHASSE — hypothèse H à éprouver, protocole écrit (docs/CHASSE.md §1) ; le protocole du 2026-09-05 s'est révélé reposer sur un prédicat faux (revue hostile du 2026-09-06) et est à refaire | fil n°7, août 2026 | dernière occurrence en ligne : run 33819974774 sur a06a7f1 ; absente douze minutes plus tard sur 5017239 (même code d'application, plus le script de garde de déploiement). Ne pas ré-éliminer E1–E8. Le run 33644396275 cité par erreur en F5 est VERT (aucun #418) : à retirer de la liste. |
| R41 | rédiger un papier depuis le programme crée une obligation que le parcours ne tient pas. | EN CHASSE — hypothèses 1 et 2 éliminées par lecture (le sélecteur IPE se rend pour tout papier trouvé du dossier ; le vrai défaut est l'asymétrie `.first()`/`.last()` de la station sur les liens de la vue programme) ; hypothèse 3 reformulée (revue hostile du 2026-09-06, docs/CHASSE.md §2) | 62b7064 | défaut de la STATION, pas du produit ; la station rougit et nomme sa cause. [hors dépôt : mandat du fondateur] demande le cas connu mauvais d'abord — cohérent avec la règle 17 du dépôt. |
| R37 | après un re-tirage, aucune demande de pièces n'existe pour les lignes NEUVES, alors que l'écran annonce qu'elle a été engendrée. | EN CHASSE — hypothèses 1 et 3 éliminées par lecture pour le geste de l'écran (le bouton ne cible que l'échantillon COURANT `drawn` ; aucun chemin ne peut le rattacher au superseded) ; reste l'hypothèse que le harnais n'a pas cliqué le bon bouton, et la mesure SQL du backlog est à compléter (elle exclut par construction les demandes sans `sample_item_id`) — docs/CHASSE.md §3 | 580f2cf | deux des trois échecs du dernier parcours cliqué consigné (62b7064 : R37 ×2, R41 ×1 — voir docs/instantanes/verify.json). [hors dépôt : mandat du fondateur] le nomme premier chantier. |
| R40 | `requireMember` ne filtre pas `exited_on`, alors que `assertMembre` le fait. | ouvert — défaut mesuré par la revue hostile de 62b7064, à un seul endroit (`requireMember` doit filtrer `exited_on` comme `assertMembre`) | 62b7064 | défaut préexistant à toutes les pages ; un membre sorti voit les boutons et sera refusé au geste. |
| R39 | le programme de travail vit dans le groupe TRANSVERSE du rail, alors que R-03/ADR-112 posent que l'axe de la navigation est le POSTE. | ouvert — à trancher avec l'épure (étage 2 du mandat de nuit) | 62b7064 |  |
| R38 | un poste qui SORT du périmètre emporte ses procédures et ses papiers hors du programme. | ouvert — à trancher avec un auditeur (une sortie de périmètre se STATUE-t-elle, comme une sortie du tirage ?) | 62b7064 | le libellé de l'écran a été corrigé ; le fond ne l'est pas. |
| R36 | `sortiesNonStatuees` fait tourner la requête complète pour un simple compte | ouvert — coût de lecture, négligeable sur la démonstration | 580f2cf |  |
| R35 | la lecture `/api/sante` du re-tirage ne distingue pas « 0 parce que rien à faire » de « 0 parce que c'est cassé ». | ouvert — il manque le dénominateur ; en ligne la lecture rend « 0 reprise · 0 sortie », indistinguable d'un défaut | 580f2cf | à lier à la règle 22 : une lecture de /api/sante doit pouvoir rougir sur son cas. |
| R34 | le prédicat de « travail » de la famille « tirage » ne connaît que trois genres | ouvert — le prédicat de « travail » ignore `verification_check` et `wp_extra_cell` | 580f2cf | mesuré par la revue hostile : une ligne portant une seule re-exécution en aveugle sort du tirage sans un mot. |
| R33 | huit chemins de lecture ne remontent pas le lignage du re-tirage | PARTIEL — trois chemins de lecture suivent le lignage (atelier, grille de test, /api/sante), huit ne le suivent pas (le titre du backlog disait « cinq » ; corrigé le 2026-09-06, la liste en énumère huit) | 580f2cf | premier geste avant tout écran neuf : `workpapers/draft.ts` puis `provenance.ts` (docs/MATIN_J4.md, risque 2). Le fragment LIGNAGE est en un seul endroit. |
| R32 | le `check` du catalogue des décisions de sortie rend un refus NON NOMMÉ. | ouvert — un refus non nommé (contrainte `check` remontée brute) ; petit, à faire quand on touche `statuerSortie` | 580f2cf |  |
| R31 | « remettre une ligne au tirage » | ouvert — « remettre une ligne au tirage » se conçoit avec un auditeur (modifie une sélection tirée, journalisée, parfois visée) | 580f2cf | l'option a été retirée de l'écran la nuit même. |
| R30 | un dossier dont la sélection est superseded et qui n'a jamais re-tiré reste signable | ouvert — question de la règle du RÉ-IMPORT (invalider ou constater la sélection), à trancher avec un auditeur | 580f2cf | la famille « tirage » se tait délibérément dans ce cas. |
| R29 | le chemin `scripts` du garde de locataire, à câbler. | ouvert — la CI « rôle de production » ne rejoue pas la suite sous `otto_app`, donc câbler le chemin `scripts` ne mesurerait rien | e004053 |  |
| R28 | `app_state` inscriptible par tout locataire. | ouvert — risque théorique (`warp` n'est appelé que par le semis) ; clé par locataire le jour où un écran l'appelle | e004053 |  |
| R27 | la politique par jeton du portail client | traité à l'étage 0 de la nuit J3 (D-J3N-05 : `otto_portal_contact()` et `otto_portal_entity()` en `security definer`, registre `rls_definer_justifiee`, migration 0141) — l'entrée du backlog est ANTÉRIEURE et n'a pas été soldée par écrit | e004053 | à vérifier en empruntant le chemin (portail sous garde armé) avant de la rayer ; ne pas la rayer sur la foi de cette ligne. |
| R26 | l'isolation de `blob_store` | traité à l'étage 0 de la nuit J3 (D-J3N-06 : `blob_store` isolé PAR CE QUI LE RÉFÉRENCE, migration 0141) — l'entrée du backlog est ANTÉRIEURE et n'a pas été soldée par écrit | e004053 | même réserve que R27 ; conséquence assumée : une pièce que rien ne référence devient illisible. |
| R25 | les 37 gestes de service encore nus | traité à l'étage 0 de la nuit J3 (D-J3N-01, D-J3N-03, D-J3N-04 : catalogue `engagementDe`, critère « prend un acteur », instrument qui EXÉCUTE) ; treize gestes sur la personne écrits comme exceptions — l'entrée du backlog est ANTÉRIEURE | e004053 | même réserve que R27. |
| R24 | le câblage de `withTenant` | traité à l'étage 0 de la nuit J3 (D-J3N-07 : poseur enregistré ; `screens:garde` sous LOC-01 armé, voir le tableau verify) — l'entrée du backlog est ANTÉRIEURE et dit encore « tant qu'il manque » | e004053 | même réserve que R27 ; l'étape 3 de PLAN_RLS reste INTERDITE et non faite. |
| R42 | l'ADR de l'empreinte des migrations n'est pas écrit. | ouvert — règle 1 : le code est là (a06a7f1), le document non | a06a7f1 | à écrire en premier dans la prochaine session de contenu, sous le numéro qui suit ADR-134. |
| R43 | la section « Current state » de STATUS.md est périmée. | ouvert — documentation périmée, à corriger dans le même geste que la prochaine tranche datée | 2026-09-05 | trouvé en écrivant le transfert. |
| R44 | `docs/SEMEUR_VS_CHEMIN.md` n'existe pas. | ouvert — à engendrer par un script (objet · semeur crée ? · chemin humain ? · cliqué ?), pas à rédiger à la main | 2026-09-06 | CLAUDE.md règle 20 et docs/CHASSE.md s'y référaient comme à un objet déjà là ; trouvé absent par la revue hostile du transfert. Mandat du semeur §1. |
| N2-1 | Les onglets d'ancrage n'existent que sur la page de poste. | ouvert — la barre d'ancres se construit côté SERVEUR, écran par écran ; les onglets d'ancrage n'existent que sur la page de poste | nuit 2 |  |
| N2-2 | Le semis vise au nom de personnes fictives | tenu pour acquis (convention du monde de démonstration, données fictives) ; à revoir le jour de vrais comptes | nuit 2 |  |
| N2-3 | `created_at` des notes semées est reposé à chaque passage. | assumé et dit (ADR-126) : une note semée ne vieillit jamais sur la démonstration publique | nuit 2 |  |
| N2-4 | Le squelette de chargement est retiré | ouvert — squelette RETIRÉ ; à relivrer avec un harnais qui attend le CONTENU, pas la page | nuit 2 | même terrain que l'hypothèse H du #418 (le moment où le contenu existe). |
| N2-5 | Quarante-quatre tables sans `engagement_id` n'ont pas de verdict de verrou écrit | ouvert — classement table par table, hors périmètre gelé | nuit 2 |  |
| N2-6 | Un test de la grille rougit sur la CI et pas en local | SOLDÉ le 2026-09-03 (e004053) — le produit avait raison ; reste l'observation J3-6 : l'ordre des lignes de la grille n'est pas stable | nuit 2 |  |

## 4. Ce qui tourne en arrière-plan

Mesuré à l'engendrement (`pgrep -af` sur next, vitest, tsx, playwright, chromium) :

- aucun processus de harnais en cours (next, vitest, tsx, playwright, chromium)

Routines : NON MESURÉ par ce script (il ne lit que `pgrep`, jamais les routines planifiées) — 0
routine listée le 2026-09-05, à la main, non rejoué depuis. Sur GitHub, sans qu'on les lance :
`local` et `deploye` (`.github/workflows/verifier.yml`) à chaque pousse sur `main` (`local`
aussi sur pull request) ; `url` à chaque déploiement RÉUSSI (fumée et acceptation contre l'URL,
un échec ne le déclenche pas — c'est `deploye` qui rougit alors) ; et `rôle de production`
(`.github/workflows/role-production.yml`) chaque nuit à 02:17 UTC, qui échoue tant que le secret
`OTTO_CI_DATABASE_URL` manque (R29). Cette liste est écrite à la main : elle peut périmer sans
que le script le voie — vérifier `.github/workflows/*.yml` si un doute existe.

## 5. La chaîne `npm run verify` : ce qui a tourné sur ce HEAD, et ce qui n'a pas tourné

| Commande | Dernière exécution consignée | SHA | Quand | Source |
|---|---|---|---|---|
| `npm run db:reset` | vert — `db:setup` sur une machine neuve, base vide, équivalent | `5017239` | 2026-09-04T00:08:36Z | CI `local`, run 33820470648, job 100861844890, étape « base locale semée » |
| `npm run demo:seed` | vert | `5017239` | 2026-09-04T00:08:36Z | CI `local`, run 33820470648, job 100861844890, étape « base locale semée » |
| `npx tsc --noEmit` | 0 erreur | `5017239` | 2026-09-04T00:08:22Z | CI `local`, run 33820470648, job 100861844890, étape « types » |
| `npx vitest run` | 811/811, 95 fichiers (job 100861844890, ligne 00:17:00.86Z) — scripts/deploiement/atteint.test.ts N'ÉTAIT PAS collecté à ce SHA (include de vitest.config.ts limité à src/** et ../tests/**, corrigé après) | `5017239` | 2026-09-04T00:17:00Z | CI `local`, run 33820470648, job 100861844890, étape « tests (PGlite, zéro réseau) » |
| `npm run gardes` | vert (43 gardes au registre — job 100861844890, ligne 00:17:01.27Z) | `5017239` | 2026-09-04T00:17:01Z | CI `local`, run 33820470648, job 100861844890, étape « langue … et l'épreuve » (qui enchaîne gardes, plancher, langue, langue:epreuve) |
| `npm run plancher` | vert (plancher 632) | `5017239` | 2026-09-04T00:17:29Z | CI `local`, run 33820470648, job 100861844890, même étape |
| `npm run langue` | vert | `5017239` | 2026-09-04T00:17:29Z | CI `local`, run 33820470648, job 100861844890, même étape |
| `npm run langue:epreuve` | vert | `5017239` | 2026-09-04T00:17:29Z | CI `local`, run 33820470648, job 100861844890, même étape |
| `npm run lectures` | vert | `5017239` | 2026-09-04T00:17:30Z | CI `local`, run 33820470648, job 100861844890, étape « lectures … et l'épreuve » |
| `npm run lectures:epreuve` | vert | `5017239` | 2026-09-04T00:17:30Z | CI `local`, run 33820470648, job 100861844890, même étape |
| `npm run parcours` | vert | `5017239` | 2026-09-04T00:17:31Z | CI `local`, run 33820470648, job 100861844890, étape « parcours … et l'épreuve » |
| `npm run parcours:epreuve` | vert | `5017239` | 2026-09-04T00:17:31Z | CI `local`, run 33820470648, job 100861844890, même étape |
| `npm run screens` | **PAS EXÉCUTÉ TEL QUEL** — seule la variante `screens:garde` a tourné : 85 routes, 0 échec sous LOC-01 — variante `screens:garde` (garde de locataire ARMÉ), pas la commande nue | `c36076f` | 2026-09-03T18:29:18Z | local, session Claude, arbre de travail de la nuit J3 (docs/MATIN_J4.md, tableau des preuves) — DATE NON MESURÉE À L'ORIGINE : `quand` ici est l'horodatage du commit c36076f (borne basse ; la mesure elle-même a eu lieu entre ce commit et 21:46:15Z, commit c52ffb9, qui la cite déjà) |
| `npm run fumee` | **PAS EXÉCUTÉ TEL QUEL** — seule la variante `fumee:url (scripts/fumee/run.ts contre l'URL déployée, pas contre `next dev` en local — pas le maillon nu de la chaîne)` a tourné : vert, 7 passages, graine 33820856994 | `5017239` | 2026-09-04T00:18:01Z | CI `url`, run 33820856994, job 100863000631, étape « balayage de fumée contre l'URL déployée » |
| `npm run densite` | **AUCUNE EXÉCUTION CONSIGNÉE** | — | — | — |
| `npm run clics` | 201 étapes / 3 échecs (R37 ×2, R41) / 0 incident d'hydratation — base fraîche, build de production | `62b7064` (PAS le HEAD) | 2026-09-03T23:34:48Z | local, session Claude ; message du commit 62b7064 et docs/MATIN_J4.md |
| `npm run visuel` | **AUCUNE EXÉCUTION CONSIGNÉE** | — | — | — |

**Non exécutées sur le HEAD** (à passer avant de dire « vert », règle 12) :

- `npm run screens` — jamais exécuté TEL QUEL ; seule la variante `screens:garde` l'a été, sur `c36076f` le 2026-09-03T18:29:18Z : 85 routes, 0 échec sous LOC-01 — variante `screens:garde` (garde de locataire ARMÉ), pas la commande nue
- `npm run fumee` — jamais exécuté TEL QUEL ; seule la variante `fumee:url (scripts/fumee/run.ts contre l'URL déployée, pas contre `next dev` en local — pas le maillon nu de la chaîne)` l'a été, sur `5017239` le 2026-09-04T00:18:01Z : vert, 7 passages, graine 33820856994
- `npm run densite` — jamais consignée
- `npm run clics` — dernière exécution sur `62b7064` le 2026-09-03T23:34:48Z : 201 étapes / 3 échecs (R37 ×2, R41) / 0 incident d'hydratation — base fraîche, build de production
- `npm run visuel` — jamais consignée

**La liste « non exécuté » du rapport précédent, transcrite ligne par ligne, et ce qui a bougé** :

- `npm run fumee` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → toujours non exécutée TELLE QUELLE ; seule la variante `fumee:url (scripts/fumee/run.ts contre l'URL déployée, pas contre `next dev` en local — pas le maillon nu de la chaîne)` a tourné, sur `5017239` le 2026-09-04T00:18:01Z : vert, 7 passages, graine 33820856994 — CI `url`, run 33820856994, job 100863000631, étape « balayage de fumée contre l'URL déployée »
- `npm run densite` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → **toujours non exécutée**
- `npm run visuel` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → **toujours non exécutée**
- `npm run parcours:epreuve` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → a tourné depuis : `5017239`, 2026-09-04T00:17:31Z, vert — CI `local`, run 33820470648, job 100861844890, même étape
- `npm run lectures:epreuve` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → a tourné depuis : `5017239`, 2026-09-04T00:17:30Z, vert — CI `local`, run 33820470648, job 100861844890, même étape
- `npm run langue:epreuve` (docs/MATIN_J4.md, « Ce que je n'ai PAS fait tourner cette nuit ») → a tourné depuis : `5017239`, 2026-09-04T00:17:29Z, vert — CI `local`, run 33820470648, job 100861844890, même étape

**Autres mesures consignées, hors chaîne** :

- `accept` sur `5017239` le 2026-09-04T00:21:44Z : 17 tâches, 0 FAIL — acceptation cliquée contre l'URL déployée (hors chaîne `verify`) — CI `url`, run 33820856994, job 100863000631, étape « acceptation cliquée contre l'URL déployée »
- `accept:epreuve` sur `5017239` le 2026-09-04T00:18:36Z : 3 cas connus mauvais, 3 déclarés FAIL — CI `url`, run 33820856994, job 100863000631
- `accept` sur `a06a7f1` le 2026-09-04T00:06:55Z : 17 tâches, 1 FAIL — A-05 : refus « papier visé » observé, PUIS #418 compté (docs/CHASSE.md §1, F5) — CI `url`, run 33819974774, job 100860332217

## 6. Ce que je chasse en ce moment

Les sections de `docs/CHASSE.md` — à lire en entier avant de toucher à l'un de ces fils. Ce
fichier distingue, constat par constat, ce qui est **[CONFIRMÉ PAR DEUX LECTURES INDÉPENDANTES]**
(ou par réfutation adverse) de ce qui est **[jugé seul, non réfuté]** (règle 30) : ne pas lire
l'un comme l'autre.

- 1. Le #418 — « Minified React error #418 ; args[]=HTML » (fil n°7)
- 2. R41 — la station « programme de travail » crée une obligation qu'elle ne tient pas
- 3. R37 — après un re-tirage, aucune demande de pièces n'existe pour les lignes neuves
- 4. Trouvé en écrivant ce transfert (2026-09-05), et ce que sa revue hostile a trouvé (2026-09-06)

## 7. Ordre de lecture pour une session neuve

1. `CLAUDE.md` en entier — les règles, les interdits, la règle du compte rendu, ce qui a coûté cher.
2. Ce fichier, RÉ-ENGENDRÉ (`cd app && npm run reprise`) — pas la copie commitée.
3. `docs/CHASSE.md` — pour ne pas ré-éliminer ce qui l'est.
4. `STATUS.md`, sections « Étage 1.1 », « Étage 1.2 », « Le parcours cliqué » (les plus récentes en
   haut), puis « Reprendre ce dossier sans moi ».
5. `docs/DECISIONS.md` depuis ADR-131 (étanchéité), ADR-132 (#418), ADR-133 (re-tirage), ADR-134
   (programme) ; `docs/DECISIONS_AUTONOMES.md` depuis D-J3N-01.
6. `docs/BACKLOG_REPORTE.md` — R24 et suivants, N2-1 à N2-6 ; `docs/REGISTRE_IDEES.md`.
7. `docs/MATIN_J4.md` — le dernier rapport du réveil, avec ses erreurs de comptage relevées par
   le fondateur (mandat du semeur, §2) : c'est POURQUOI ce fichier est engendré.
8. Le dernier mandat du fondateur, s'il est fourni : ces textes (« Mandat du semeur », « Mandat
   Soir/Nuit J3 ») ne sont PAS versionnés dans ce dépôt [hors dépôt] — une session qui les reçoit
   les lit ; une session qui ne les a pas ne peut vérifier que les faits mesurés qui les citent
   (fils.json, docs/CHASSE.md). Un mandat fourni prime sur l'ordre des chantiers, jamais sur les
   interdits.
9. `docs/PLAN_RLS.md` avant tout geste sur l'étanchéité ; `DEPLOY.md` avant tout geste sur
   l'URL ; `docs/MIGRATIONS_BANDES.md` avant toute migration.
