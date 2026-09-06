# Reprise — l'état du projet, engendré

> **Ce fichier est ENGENDRÉ** par `cd app && npm run reprise` depuis `docs/reprise.src.md` (le
> gabarit), `docs/instantanes/*.json` (les mesures), `docs/BACKLOG_REPORTE.md` (les fils),
> `docs/CHASSE.md` (ce qui est en cours d'investigation), `app/package.json` (la chaîne de
> `verify`) et l'état de git et des processus au moment de l'engendrement. **Ne pas l'éditer à
> la main : relancer la commande.** Un instantané n'est vrai qu'à sa date.
>
> Engendré le {{DATE}}.

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

- **HEAD** : {{HEAD}}
- **État de l'arbre** : {{HEAD_ETAT}}
- **SHA servi** : {{SERVI}}

## 3. Les fils ouverts, avec leur identifiant et leur état

Source : `docs/BACKLOG_REPORTE.md` pour l'énoncé, `docs/instantanes/fils.json` pour l'état. La
fenêtre suivie ici est R24 et suivants, et N2-x : R1–R23 sont des reports du plan de nuit
(`OTTO_Plan_Nuit.md`), en tableau, et ne sont pas des fils au sens de cette section. Dans cette
fenêtre, un fil du backlog sans état NON VIDE consigné fait ÉCHOUER l'engendrement — une entrée
présente mais vide est le même manque qu'une entrée absente (règle 23).

| Fil | Énoncé | État | Depuis | Note |
|---|---|---|---|---|
{{FILS}}

## 4. Ce qui tourne en arrière-plan

Mesuré à l'engendrement (`pgrep -af` sur next, vitest, tsx, playwright, chromium) :

{{PROCESSUS}}

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
{{VERIFY}}

**Non exécutées sur le HEAD** (à passer avant de dire « vert », règle 12) :

{{VERIFY_NON_EXECUTEES}}

**La liste « non exécuté » du rapport précédent, transcrite ligne par ligne, et ce qui a bougé** :

{{VERIFY_PRECEDENT}}

**Autres mesures consignées, hors chaîne** :

{{VERIFY_AUTRES}}

## 6. Ce que je chasse en ce moment

Les sections de `docs/CHASSE.md` — à lire en entier avant de toucher à l'un de ces fils. Ce
fichier distingue, constat par constat, ce qui est **[CONFIRMÉ PAR DEUX LECTURES INDÉPENDANTES]**
(ou par réfutation adverse) de ce qui est **[jugé seul, non réfuté]** (règle 30) : ne pas lire
l'un comme l'autre.

{{CHASSE}}

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
