# Reprise — l'état du projet, engendré

> **Ce fichier est ENGENDRÉ** par `cd app && npm run reprise` depuis `docs/reprise.src.md` (le
> gabarit), `docs/instantanes/*.json` (les mesures), `docs/BACKLOG_REPORTE.md` (les fils),
> `docs/CHASSE.md` (ce qui est en cours d'investigation), `app/package.json` (la chaîne de
> `verify`) et l'état de git et des processus au moment de l'engendrement. **Ne pas l'éditer à
> la main : relancer la commande.** Un instantané n'est vrai qu'à sa date.
>
> Engendré le 2026-09-06T18:41:10.233Z.

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

- **HEAD** : `0a95fb1` — « Lot 2, étape 2 : le rapprochement — le détail du client se rapproche du GL »
- **État de l'arbre** : arbre MODIFIÉ (1 fichier(s), docs/REPRISE.md excepté — son changement à chaque engendrement ne compte pas) : le disque n'est PAS HEAD — ce qui suit vaut pour HEAD, pas pour les modifications en cours · HEAD = `origin/claude/otto-session-resume-zimig9` selon la dernière synchronisation locale (`git fetch` pour le confirmer)
- **SHA servi** : `24a0319` sur https://otto-dit.vercel.app, mesuré le 2026-09-06T15:01:22Z (il y a 4 h) par CI, travail `deploye`, run 34040786493, job 101507036353, étape « le SHA poussé doit être servi dans les 15 minutes » (conclusion success, 14:57:56Z→15:01:22Z) — scripts/deploiement/atteint.ts a vu l'instance servir le SHA poussé — **DIFFÈRE du HEAD** `0a95fb1` : ce que l'URL sert n'est pas ce que le disque porte, ou la mesure est périmée ; relancer `npx tsx scripts/deploiement/atteint.ts https://otto-dit.vercel.app <sha> --minutes=15` (depuis la CI ou une machine qui joint l'URL — le bac à sable de l'agent ne la joint pas)
  Historique : `9fa187c` le 2026-09-06T13:12:07Z (CI, travail `deploye`, run 34035181666, job 101491826303, étape « le SHA poussé doit être servi dans les 15 minutes » (conclusion success, 13:08:40Z→13:12:07Z). Note : le commit a46c0db (registre, documentation seule) poussé entre 9fa187c et 24a0319 n'a pas été confirmé séparément servi — la mesure suivante (24a0319) le contient et le couvre) · `c23b4be` le 2026-09-06T12:30:08Z (CI, travail `deploye`, run 34033120558, job 101486240730, étape « le SHA poussé doit être servi dans les 15 minutes » (conclusion success, 12:27:08Z→12:30:08Z)) · `0b1749f` le 2026-09-06T12:18:26Z (CI, travail `deploye`, run 34032612106, job 101484851827, étape « le SHA poussé doit être servi dans les 15 minutes » (conclusion success, 12:16:37Z→12:18:26Z)) · `5017239` le 2026-09-04T00:13:06Z (CI, travail `deploye`, run 33820470648, job 100861844608 — scripts/deploiement/atteint.ts a vu l'instance servir le SHA poussé) · `a06a7f1` le 2026-09-04T00:07:37Z (atteint.ts, run 33820470648, job 100861844608, première observation (« 0 s · servi a06a7f1 ») avant que 5017239 ne devienne servi à 00:13:06Z) · `e004053` le 2026-09-03, heure non mesurée (constat en prose du commit a06a7f1 (« /api/sante sert e004053, celui d'hier matin ») ; aucune lecture datée de /api/sante n'accompagne ce constat — ne pas le lire comme une mesure rejouable)

## 3. Les fils ouverts, avec leur identifiant et leur état

Source : `docs/BACKLOG_REPORTE.md` pour l'énoncé, `docs/instantanes/fils.json` pour l'état. La
fenêtre suivie ici est R24 et suivants, et N2-x : R1–R23 sont des reports du plan de nuit
(`OTTO_Plan_Nuit.md`), en tableau, et ne sont pas des fils au sens de cette section. Dans cette
fenêtre, un fil du backlog sans état NON VIDE consigné fait ÉCHOUER l'engendrement — une entrée
présente mais vide est le même manque qu'une entrée absente (règle 23).

| Fil | Énoncé | État | Depuis | Note |
|---|---|---|---|---|
| #418 | « Minified React error #418 ; args[]=HTML » — vu en ligne sur la tâche A-05 de l'acceptation, capturé une fois en local avec son HTML servi et son DOM | EN CHASSE — hypothèse H à éprouver, protocole écrit (docs/CHASSE.md §1) ; le protocole du 2026-09-05 s'est révélé reposer sur un prédicat faux (revue hostile du 2026-09-06) et est à refaire | fil n°7, août 2026 | dernière occurrence en ligne : run 33819974774 sur a06a7f1 ; absente douze minutes plus tard sur 5017239 (même code d'application, plus le script de garde de déploiement). Ne pas ré-éliminer E1–E8. Le run 33644396275 cité par erreur en F5 est VERT (aucun #418) : à retirer de la liste. |
| R41 | CORRIGÉ le 2026-09-06 (SHA `c187cae`), confirmé en navigateur. | CORRIGÉ le 2026-09-06 (SHA c187cae, confirmé en navigateur) — la station ciblait le mauvais lien par asymétrie `.first()`/`.last()` sur la vue programme, et le champ date de l'IPE réutilisé n'était pas rempli ; les deux corrigés | 62b7064 | défaut de la STATION, pas du produit à l'origine ; voir docs/BACKLOG_REPORTE.md pour le détail. Parcours cliqué (fa47b36, confirmé par la chaîne verify complète du 2026-09-06) : 202 étapes conduites, 0 échec, 314 clics sur 43 gestes ; garde du parcours : 193 station(s) figée(s) vérifiée(s). |
| R37 | CORRIGÉ le 2026-09-06 (test `src/lib/db/tx-redirect.test.ts`), CLASSE PAS INSTANCE. | CORRIGÉ le 2026-09-06 (test app/src/lib/db/tx-redirect.test.ts) — hypothèse `requireMember` RÉFUTÉE par exécution (l'URL après clic était l'URL de succès, pas `/`) ; vrai défaut trouvé : `tx()` laissait une écriture survivre au rollback quand la fonction lançait ensuite un `redirect()` Next (le signal de contrôle de flux, mal distingué d'une vraie erreur, faisait committer PUIS avaler l'exception) — corrigé au niveau de la CLASSE (`estUnSignalDeControleDeFlux` dans `src/lib/db/client.ts`), pas de l'instance. ADR-135, docs/CHASSE.md §3. | 580f2cf | un seul autre site combine `redirect()` et une écriture dans une action (`poste/[code]/actions.ts`) ; NON CONFIRMÉ par exécution comme affecté ou non — dette explicite (ADR-135). Parcours cliqué : 0 échec après correction (fa47b36). |
| R40 | CORRIGÉ le 2026-09-06 (SHA `8558cbd`). | CORRIGÉ le 2026-09-06 (SHA 8558cbd) — `activeMembership()` isole désormais la requête avec `exited_on is null`, comme `assertMembre` ; test de régression app/src/lib/core/auth.test.ts (cas connu mauvais : passe avant, échoue après `exitMember`, repasse après le correctif) | 62b7064 | défaut préexistant à toutes les pages ; un membre sorti voyait les boutons et était refusé au geste. |
| R39 | le programme de travail vit dans le groupe TRANSVERSE du rail, alors que R-03/ADR-112 posent que l'axe de la navigation est le POSTE. | ouvert — à trancher avec l'épure (étage 2 du mandat de nuit) ; confirmé toujours ouvert le 2026-09-06, décision autonome DA-33 de ne pas le trancher seul (question d'architecture, hors périmètre d'un seul geste) | 62b7064 | DA-33 : déplacer le programme vers l'axe POSTE maintenant, seul, toucherait une surface bien plus large (écrans, PARCOURS.json, DENSITE.md, LECTURES.json, garde de langue) que ce que R38/Lot 1/Lot 2 demandent. |
| R38 | NAVIGABILITÉ CORRIGÉE le 2026-09-06 (DA-34) ; la question du STATUER reste ouverte. | NAVIGABILITÉ CORRIGÉE le 2026-09-06 (DA-34) — un poste hors périmètre qui porte déjà une procédure reste atteignable au rail ; la question du STATUER reste ouverte, à trancher avec un auditeur | 62b7064 | le libellé de l'écran a été corrigé (étage 1.1) ; le lien mort du rail est corrigé (DA-34, rail.ts + rail.test.ts, cas connu mauvais vérifié par git stash) ; l'écran du programme reste inchangé et le fond méthodologique (STATUER une sortie de périmètre) reste entier. |
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
| R44 | PREMIÈRE VERSION ENGENDRÉE le 2026-09-06 (SHA à la pousse de cette tranche), PAS FERMÉ. | PREMIÈRE VERSION ENGENDRÉE le 2026-09-06 (`npm run semeur` → docs/SEMEUR_VS_CHEMIN.md, lecture /api/sante ajoutée) — 83 objets : 16 décors, 28 non prouvés, 39 prouvés. PAS FERMÉ : garde E1 interdit tout décor nouveau, le Lot 2 doit en refermer. | 2026-09-06 | compte de départ figé par le fondateur (16/28/39) ; chaque lot doit faire baisser les décors et monter les prouvés. Cohérence vérifiée par app/src/lib/semeur/coherence.ts (2 cas connus mauvais + le registre réel). |
| R45 | une SIXIÈME famille de bruit non filtrée dans `app/src/lib/core/hydratation.ts`, PROUVÉE par exécution (règle 18), PAS CORRIGÉE ici. | ouvert — trouvé et PROUVÉ (règle 18, Chromium de Playwright), PAS CORRIGÉ : `app/src/lib/core/hydratation.ts` ne canonise pas les raccourcis CSS ni les unités implicites que le navigateur ajoute quand React affecte `style` programmatiquement (`flex:1` → `flex: 1 1 0%`, `margin:4px 0` → `margin: 4px 0px`) — une sixième famille de bruit non filtrée, absente de E5 et de hydratation.test.ts | 2026-09-06 (F11, docs/CHASSE.md §1) | reporté hors mandat de Lot 2 étape 2 ; à corriger avec son propre cas connu mauvais le jour où le fil #418 reprend. |
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
| `npm run db:reset` | vert | `0a95fb1` | 2026-09-06T18:13:00Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : vitest imprime lui-même « Start at 18:13:00 » |
| `npm run demo:seed` | vert | `0a95fb1` | 2026-09-06T18:13:00Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : vitest imprime lui-même « Start at 18:13:00 » |
| `npx tsc --noEmit` | 0 erreur (aucune sortie — succès silencieux) | `0a95fb1` | 2026-09-06T18:13:00Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : vitest imprime lui-même « Start at 18:13:00 » |
| `npx vitest run` | 856/856, 101 fichiers (+1 depuis a46f4f5 : account-detail.test.ts) — « Start at 18:13:00 » (imprimé par vitest lui-même) | `0a95fb1` | 2026-09-06T18:13:00Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) |
| `npm run gardes` | vert — docs/GUARDS.md à jour, 43 garde(s) | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run semeur` | vert — docs/SEMEUR_VS_CHEMIN.md à jour (83 objets : 16 décors, 28 non prouvés, 39 prouvés — inchangé : le détail importé et son rapprochement naissent d'un geste RÉEL de l'auditeur/du client, jamais du semeur — hors registre) | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run plancher` | vert — 856 test(s) collecté(s) · plancher 632 · aucune forme éteinte ou isolée | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run langue` | vert — 0 chaîne hors catalogue, 0 libellé en dur dans un service | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run langue:epreuve` | vert — 15/15 cas connus mauvais dénoncés | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run lectures` | vert — 0 lecture perdue sur 1681 chemins figés dans 86 écrans | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run lectures:epreuve` | vert — 6/6 cas connus mauvais dénoncés | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run parcours` | vert — 249 station(s) déclarée(s), 249 figée(s), 0 perdue (+3 depuis a46f4f5 : les deux stations du rapprochement et le refus POP-02, figées par --figer avant ce commit) | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run parcours:epreuve` | vert — 5/5 cas connus mauvais dénoncés | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run screens` | vert — 87 routes ouvertes, 0 échec | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run fumee` | vert — 51 route(s) ouvertes, 0 échec | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run densite` | vert — 77 écrans mesurés, 0 au-delà de 5 actions primaires, 108 champs à taper, docs/DENSITE.md écrit | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run clics` | vert — 207 étapes conduites, 0 échec, 319 clics comptés sur 45 gestes, sonde d'hydratation : aucun incident, garde du parcours : 193 station(s) figée(s) vérifiée(s) | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |
| `npm run visuel` | vert — 312 vues regardées, 0 défaut | `0a95fb1` | 2026-09-06T18:37:12Z | local, session Claude, chaîne verify complète (verify-full-12.log, Lot 2 étape 2 : le rapprochement — la troisième et dernière passe de cette tranche, après verify-full-10.log rougi sur l'état R45 manquant dans fils.json et verify-full-11.log vert mais avec trois stations du parcours pas encore figées) — borne haute : mtime du journal (fin de chaîne), pas d'horodatage propre à cette étape |

**Non exécutées sur le HEAD** (à passer avant de dire « vert », règle 12) :

- (aucune : chaque maillon de la chaîne a une exécution consignée sur ce HEAD)

**La liste « non exécuté » du rapport précédent, transcrite ligne par ligne, et ce qui a bougé** :

- (le rapport précédent n'en nommait aucune)

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
