# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Reprendre ce dossier sans moi — l'essentiel en une page

**Ce qu'est OTTO.** Une plateforme d'audit AI-native : noyau agnostique du référentiel, packs de
référentiel (NEP/France et PCAOB-SOX en v1), et une **méthode de cabinet qui est de la DONNÉE**
(`methodology/*.json`, validée par `valider.mjs`, chargée par cabinet). Interface en français,
local-first : elle tourne sans aucun compte externe.

**Ce que l'application fait aujourd'hui, de bout en bout, au clic.** Créer un dossier · l'accepter
(critères, motifs, jalons dont un dérivé) · équipe et indépendance (déclarations, ancienneté,
rotation) · reprendre l'exercice précédent (proposé, jamais repris en silence) · importer balance et
grand livre (FEC strict) · rapprocher · seuils · périmètre · risque par assertion · questionnaire
résiduel · sondage (couverture + unités monétaires, germe déterministe) · demande PBC · **portail
client** · échelle d'extraction · vouching L0 · écarts et clarifications · re-exécution en aveugle ·
évaluation contre l'anomalie tolérable · papier de travail, notes de revue, trois visas dans
l'ordre, export PDF/Excel · pointage des états financiers · achèvement (5 natures) · **obstacles au
visa** (une liste, dix familles, calculée) · clôture et **archive scellée téléchargeable** ·
**notes de revue ancrées sur l'objet métier** (cellule de testing, section de papier, réponse de
questionnaire, paramètre de seuils, ÉCART — clic droit, appui long ou puce au survol ; vue
transverse `/notes` où une note dont l'objet est sorti de l'échantillon remonte « objet retiré »,
ADR-097 ; quatre types dont seule « à corriger » bloque le visa, et la clôture appartient à un
réviseur qui n'est JAMAIS l'auteur — service + trigger en base, ADR-102) ·
**notes adressées à OTTO** : il exécute (extraction, vouching, état de complétude — catalogue
fermé, compréhension par règles), refuse ce qui n'est pas de son ressort avec la liste de ce
qu'il sait faire, répond au dossier (fait, pièces, reste à vérifier) et ne clôt jamais (ADR-098) ·
**colonne ajoutée au tableau de testing** : titre libre → OTTO PROPOSE son interprétation et
n'écrit rien avant confirmation ; deux issues par cellule — trouvée avec sa provenance, ou
introuvable qui PROPOSE une clarification client (ADR-099) · **bascule entre missions groupées
par client** (groupe → entité → mandats), journalisée, isolation éprouvée (ADR-100) ·
**réunions** : contacts de mission (clé + domaines), créneaux communs depuis les disponibilités
(libre/occupé seulement), choix humain obligatoire, copies dans l'ordre calculé, .ics RFC 5545 —
lecture d'agendas et envoi SIMULÉS et dits tels (ADR-101) ·
**le rail montre l'ÉTAT du dossier, pas le catalogue des fonctions** : un dossier neuf ouvre cinq
destinations, le rail grandit avec le travail, le reste est GRISÉ avec sa raison en une ligne
derrière « tout afficher » — jamais masqué sans explication ; libellés réécrits pour la première
ouverture (ADR-103) ·
**l'atelier du contrôle sur pièces** : la pièce et la ligne CÔTE À CÔTE (visionneuse intégrée,
jamais un autre onglet), motif de sélection et comparaison lisibles SUR la ligne, ↑/↓ et Entrée
atteste en emportant les corrections tapées, la suivante s'ouvre seule, clarification en lot
(refusée sans motif), écart ↔ synthèse en un clic dans les deux sens, papier vivant par le MÊME
formateur que le papier ; banc `npm run mesure:testing` : 4 gestes / 2 écrans → 1 geste / 1 écran
par ligne (ADR-104) ·
**l'IA vivante dans la version livrée** : `npm run demo:ia` — l'échelon OCR lit avec le MODÈLE
(clé dans app/.env.local, présence vérifiée sans lire la valeur), pièces neuves JAMAIS VUES
engendrées depuis le monde semé (normales + piégées : montant, date, quantité, signature, scan
dégradé — VERITE.md dit quoi déposer où), coût affiché par lecture et en cumul, garde de budget
qui refuse au plafond en nommant les deux chiffres ; rejeu inchangé par défaut, L2 et provenance
inchangés partout ; mesuré hors cache : précision 100 % (43/43), 0,0223 $/document,
p50 4,4 s (`npm run eval:pieces-neuves`, ADR-105) ·
**estimations comptables hors litige** : le fichier de calcul du client importé (pièce à
part entière), rapproché à l'écriture visée (montant DÉRIVÉ du grand livre actif, jamais
stocké), recalculé au centime, base sondée par le même moteur de tirage, justificatifs
demandés en brouillon — base des lignes tirées + CHAQUE taux + la note de méthode
(ADR-106a, `dataset/estimations/fae-2025.csv`) ·
**annexes de papier** : un tableur se joint au papier (la table existait depuis la
migration 0002, aucun chemin ne l'atteignait — branchée : moteur de pièces, empreinte,
journal, écran) (ADR-106c) · **accès ERP** : l'architecture qui ne se ferme pas, en une
page — docs/13_ACCES_ERP.md (ADR-106b) ·
**balances auxiliaires âgées** : les exports du client (clients/fournisseurs × N/N-1)
rapprochés au grand livre — N au solde actif, N-1 aux à-nouveaux, l'écart du collectif DIT
(les 25 000 € de situation sans attribution auxiliaire) ; concentration top 10, apparus,
disparus, déplacements de part ≥ seuil (le seuil commande), déformation du vieillissement
(> 90 j) avec porteurs nommés ; chaque constat = CANDIDAT proposé au registre (un humain
confirme) + questions client en brouillon (ADR-107, `npm run dataset:balances-aux`) ·
**contrôle interne et processus** : le processus en DONNÉES STRUCTURÉES (étapes, acteurs,
systèmes, contrôles avec fréquence et propriétaire), diagramme GÉNÉRÉ — le flowchart client
n'est qu'une corroboration ; différence N/N-1 EXACTE champ par champ, CHAQUE changement
statué par écrit (« significatif » → facteur PROPOSÉ au registre) ; entretien avec
consentements TRACÉS ou notes sans enregistrement (le module fonctionne sans), transcript
confronté à la documentation → écarts CANDIDATS (omissions d'abord, ai_run, rejeu
enregistré / IA réelle via demo:ia), statués un par un — question, facteur, écarté motivé ;
changements et écarts non statués = obstacles au visa, famille `processus` ; purge du
transcript à l'échéance de conservation (ADR-108, docs/14_ENTRETIENS_CONSENTEMENT.md).
Plus : test des écritures, pack SOX (RCM, tests d'efficacité, déficiences), pilotage, provenance,
journal, « Interroger » (langage naturel → requête déterministe, jamais de prose).

**Branche** : `main` (branche par défaut). `claude/otto-audit-platform-whs17z` reste comme
historique. **Aucun déploiement** — il se fera quand le fondateur le demandera. Vercel n'est
pas connecté.

### La commande qui MONTRE

`cd app && npm run demo` — une seule commande : base vide, migrations, monde de démonstration,
serveur, puis un panneau en clair donnant l'adresse, les trois rôles (on se connecte en
cliquant un nom, il n'y a pas de mot de passe), le portail client et la remise à zéro. Chaque
étape qui peut échouer sur une machine neuve dit quoi faire, pas une trace ; une seconde
démonstration est refusée plutôt que d'effacer la base de la première (ADR-095). Mesuré sur
une base vide : **01:02** de la commande au panneau.

### Les quatre commandes qui prouvent

| Ce que ça prouve | Commande | État |
|---|---|---|
| Toutes les règles, tous les refus | `cd app && npm test` | 503 tests, zéro réseau |
| Tous les écrans **rendent** en production | `cd app && npm run screens` | 74 routes |
| Le parcours se **clique** vraiment, import → dossier scellé | `cd app && npm run clics` | 126 étapes, ~40 refus |
| Les écrans se **lisent** (clair/sombre, large/390 px) | `cd app && npm run visuel` | 276 vues, 0 défaut |
| Tout, base recréée | `cd app && npm run verify` | enchaîne les quatre |

`npm run verify` est la seule chose à lancer avant de dire qu'une tranche est finie.

### Les cinq règles qui ont coûté le plus cher à apprendre

1. **Un écran qui rend n'est pas un écran qui marche.** Six formulaires inertes en production
   (ADR-078), un dossier créé inatteignable (ADR-088), dix écrans qui rendaient chaque refus en
   page 500 (ADR-091) — tout cela avec la suite au vert et les écrans à 200.
2. **N'affirme jamais plus que ce que tu vérifies** — ni dans un écran, ni dans ce fichier.
3. **Le silence lu comme un succès** est le défaut à traquer : un objet créé qu'aucun chemin de
   lecture n'atteint, un geste du métier sans écran, une branche de repli que rien n'exécute, un
   formulaire que le navigateur refuse d'envoyer et qu'on lit comme une règle vérifiée.
4. **Un refus s'affiche, il ne tombe pas en 500** — `src/app/refus.ts` porte la règle pour tous les
   onze écrans qui en avaient besoin. Le onzième s'était caché derrière le mot « refusée » écrit
   dans une phrase d'explication : chercher un mot n'est pas vérifier un chemin.
5. **La méthode NOMME, le code CALCULE** (ADR-050) : un prédicat ou une formule inconnue arrête
   l'assemblage, elle ne s'ignore pas.

### Ce qui est GELÉ — ne pas rouvrir sans le fondateur

- **Aucun cycle au-delà du chiffre d'affaires.** Les procédures sont du contenu, la mécanique est le
  produit.
- **Aucun contenu de procédure nouveau.** Le pack **SOX est gelé** : il tourne, il ne s'étend pas.
- **Données synthétiques uniquement, pour toujours.** Aucune méthodologie de cabinet réelle.
- **Aucun appel LLM payant depuis un harnais** : `npm run clics` force `OTTO_OCR_ADAPTER=mock`.
  La clé vit dans `app/.env.local`, lue seulement par l'application au runtime — **ne jamais
  l'exporter dans un shell**.

### Ce qui reste OUVERT — la file, telle qu'elle est

| # | Ouvert | Qui décide |
|---|---|---|
| 1 | **Les 19 sources méthodologiques sont `verifie: false`** — aucune relue sur texte primaire. Le fondateur s'en charge sur les procédures de démonstration. | fondateur |
| 2 | **PCAOB AS 1215** porté `[UNVERIFIED]` : pcaobus.org est bloqué depuis cet environnement. Le côté français est vérifié (R. 820-42 ; D. 821-186 III-IV). | fondateur |
| 3 | **Déploiement Vercel + Supabase — FAIT et VÉRIFIÉ le 2026-08-31 à 20:48** : HTTP 200 sur `https://otto-dit-imperator080599.vercel.app`, dossier ouvert, atelier de testing lu (Claire Fontaine · Altiverre FY2025 · « Testing workbench » avec les lignes de l'échantillon et leurs motifs). Données servies par Supabase via le pooler de TRANSACTION ; migrations incrémentales appliquées au déploiement (0030 le jour même) et monde semé CONSERVÉ ; tentative de fuite RLS refusée à chaque build (« locataire étranger : 0 · légitime : 48 »). ~~Reste une décision du fondateur : la protection « Vercel Authentication » est active~~ — **levée** (mesuré le 2026-09-01 par l'API Vercel : `ssoProtection.enabled=false`, `passwordProtection.enabled=false`) : l'URL est ouvrable sans compte. | fait |
| 4 | **Transport e-mail entrant réel** (Q12) — première tâche de déploiement. | fondateur |
| 5 | **Secret professionnel / RGPD + DPA** avant toute donnée réelle (A13). | fondateur |
| 6 | Le contrôle `input[type=file]` affiche « Choose File » (libellé natif du navigateur) sur le portail francophone : non corrigeable sans contrôle sur mesure. | à trancher |
| 7 | **L'hydratation React (#418) refait surface par intermittence** dans `npm run clics` : 2026-08-30, trois exécutions production → 2 exceptions (portail, testing), puis 1 (papier), puis 0 en mode dev ; écrans variables, y compris non modifiés ce jour-là. 45 ouvertures directes de ces mêmes écrans sur build de production : 0 erreur (sonde rejouable : `npx tsx <scratch>/sonde-hydratation.ts`) — le défaut ne se déclenche qu'au fil des enchaînements d'actions du parcours. React répare seul (aucune station fonctionnelle n'échoue), mais le harnais compte l'exception, donc `verify` peut rougir sans défaut nouveau. CAUSE PROBABLE TROUVÉE puis corrigée dans le harnais : `aller()` rendait la main à `load`, AVANT la fin du flux RSC et de l'hydratation — naviguer à cet instant coupait le flux et l'exception partait, mal étiquetée, sur la page suivante. `aller()` attend désormais le silence réseau. Après correctif : 4 exécutions propres, puis UNE réapparition (2026-08-31, écran des écarts — qui venait de recevoir un composant client), relancée propre aussitôt. Le correctif a réduit le défaut sans l'éteindre : il reste intermittent et rare (~1 exécution sur 5), React répare seul, aucune station fonctionnelle n'échoue. Politique : un échec de clics dont la SEULE ligne est `EXCEPTION … #418` se relance une fois ; la sonde `scripts/clics/sonde-hydratation.ts` reste le point de départ d'une vraie instruction. **INSTRUIT ET RÉSOLU (2026-08-31, 6919ffe)** : la fréquence est montée à 1/exécution (4/4, pages changeantes : exceptions ×2, scoping, risk) dès que le layout RACINE a reçu un ternaire d'environnement (bandeau) et une métadonnée robots conditionnelle (084da83) ; hypothèses réfutées par mesure — dépassement réseau (0 journalisé après dé-masquage du catch), rendu à froid (0/45), mode dev (0) ; layout remis à plat → 126/126. Correctif de fond : le layout racine ne lit PLUS l'environnement (bandeau permanent bilingue constant, robots noindex constant) ; chaîne complète verte derrière (503 tests, 74 routes, 126 étapes, 276 vues, 0 partout). La politique de relance unique reste écrite au cas où une NOUVELLE cause du même symptôme apparaîtrait. | résolu |
| 8 | Le dossier N-1 n'est ni conclu ni clos : `/api/archive/[engagementId]` déclare donc un **404 attendu** tant qu'aucun dossier n'est scellé dans le monde de démonstration. | à trancher |
| 9 | Premiers fast-follows si le coin tient : revue analytique + questions de variation, pointage de plaquette, circularisations (D8). | fondateur |
| 10 | **Branchement Microsoft 365 réel des réunions** (ADR-101) — le chantier chiffré : (a) inscription d'application Entra ID sur le locataire du cabinet ; (b) consentement administrateur ; (c) permissions déléguées MINIMALES — libre/occupé via `getSchedule` (`Schedule.Read.All` en application ou `Calendars.Read.Shared` en délégué, à trancher avec l'admin), émission via `Calendars.ReadWrite` OU envoi du .ics par le transport e-mail existant (moins de permissions — préférable) ; (d) refus de principe de tout scope lisant le CONTENU des agendas ; (e) un `AgendaAdapter` Graph + tests de garde sans réseau, sur le modèle de l'OCR. Ordre de grandeur : 2-3 tranches de travail, dont une entière pour les refus et la métrologie. Indémontrable sans locataire réel — c'est dit à l'écran. | fondateur |
| 11 | **Windows : corrigé sans machine Windows.** `spawn npx ENOENT` (ADR-096) est corrigé — plus aucun spawn de `npx`, branches Windows exécutées en test depuis Linux — mais AUCUNE exécution sur Windows réel n'a eu lieu. Le fondateur a relancé et vu LE MÊME message mot pour mot — message que le code corrigé ne peut plus produire : sa copie est très probablement antérieure au correctif. Un DIAGNOSTIC EN UNE COMMANDE existe désormais : `cd app; npm run diagnostic` — il collecte système, dépôt, état du correctif, fichiers, et le lancement complet dans `diagnostic-otto.txt` à renvoyer tel quel ; il détecte lui-même une copie périmée et dit quoi faire (`git pull`). Vérifié : exécution complète sur Linux (58 s, serveur arrêté proprement, zéro secret dans le fichier), et le verdict « copie antérieure » exercé sur un worktree réel du commit d'avant le correctif. | fondateur |

### Où regarder en premier

`DEMO_APP.md` (le parcours pas à pas) · `docs/DECISIONS.md` (ADR-001 → ADR-093, le pourquoi de
chaque règle) · `CLAUDE.md` (les quatorze règles permanentes) · `docs/12_CONFIGURABLE.md` (ce qui
est de la méthode et ce qui est du code).

---

## Current state

- **Stage**: C complete — all slices S0→S10 + hardening built, tested and pushed.
  The two-part demo runs end-to-end. Feature work is stopped per the program contract.
- **Branch**: `claude/otto-audit-platform-whs17z`.
- **Suite**: voir la dernière tranche datée ci-dessous pour les compteurs à jour de
  `npm run verify` (tests, routes, étapes cliquées, vues regardées, écrans mesurés).
  Historique : 404 tests verts à la fin de l'étape C (`cd app && npm test`), zéro réseau.
  Le balayage des 63 écrans est DANS la suite, et `npm run screens` le refait en production.
  `npm run clics` **conduit TOUT le chemin de démonstration** dans Chromium sur le build de
  production — de l'import du grand livre définitif au téléchargement du dossier scellé, en
  54 étapes dont une trentaine vérifient un refus (ADR-090, ADR-091). `npm run visuel` REGARDE
  les 59 écrans en clair et en sombre, en large et à 390 px — débordement et contraste mesurés,
  captures produites (ADR-094). Les trois entrent dans `npm run verify`.
  Un écran qui rend n'est pas un écran qui marche : ADR-076, ADR-078 et ADR-088 disent pourquoi.

## Prouvé par exécution vs prouvé par test avec mocks

Mise à jour après exécution réelle de la couche IA (2026-08-25, 51 appels, 1,27 $ sur le
plafond de 20 $). Effectif indiqué à côté de chaque taux. Rien dans ce dépôt ne doit être lu
comme « mesuré » s'il ne figure pas ici.

| Affirmation | Statut | Établi comment |
|---|---|---|
| **Substance probante** : « resolved » exige explication verbatim + preuve liée + disposition + qui/quand | **Prouvé par exécution** | contraintes SQL (migration 0009) + service : une résolution SANS lien vers ce qui corrobore, ou dont l'explication est vide, est refusée par le service ET par la base — vérifié au clic en court-circuitant la garde `required` du navigateur. **Ce qui n'est PAS vérifié, et ne peut pas l'être : la qualité de la prose.** Une phrase creuse mais non vide, accompagnée d'un lien, passe. La formulation précédente (« une résolution générique est rejetée ») affirmait davantage que ce que le produit fait ; juger si une explication est substantielle est le travail des notes de revue et des visas, pas d'une contrainte |
| **Une anomalie chiffrée ne sort pas de l'accumulation sans disposition** | **Prouvé par exécution** | la double comptabilisation de 36 800 € reste dans le total ; anomalies connues 127 545,80 € |
| **Le dépassement de l'anomalie tolérable bloque la conclusion** | **Prouvé par exécution** | `concludeEvaluation` refuse sans `evaluation_response` enregistrée |
| **Le grand livre provisoire bloque la conclusion définitive et la clôture** | **Prouvé par exécution** | test archive : `closeFile` refuse tant que le FEC est provisoire |
| **Déficience : taux et nature avant montant ; extension à la population** | **Prouvé par exécution** | 3/3 → extension aux 12 instances → 25 %, natures sévères ⇒ material weakness |
| **Le rendu n'altère jamais son propre texte** | **Prouvé par exécution** | couverture lue dans la police ; un caractère non couvert fait échouer l'export |
| **Un export supprimé se régénère à l'octet près** | **Prouvé par exécution** | `export.test.ts` compare les octets du PDF stocké et du PDF re-rendu |
| **Le dossier scellé est autoportant et déterministe** | **Prouvé par exécution** | archive rejouable octet pour octet ; empreintes du manifeste re-vérifiées ; README sans script ni lien externe |
| **Les écrans de méthode RENDENT dans l'application qui tourne** | **Prouvé par exécution** | six écrans conduits dans Chromium sur base fraîche (200), dont le parcours publier → refuser → corriger → publier. Avant ADR-076 : trois d'entre eux rendaient **500** avec 278 tests verts |
| **La mission entière se CLIQUE dans l'application, jusqu'au dossier scellé téléchargé** | **Prouvé par exécution** | `npm run clics` : 54 étapes conduites dans Chromium sur un build de production, 0 échec, en étant tour à tour préparateur, reviewer, associé et client. C'est ce contrôle qui a trouvé le dossier créé inatteignable (ADR-088), les dix écrans qui rendaient un refus en page 500, la clôture sans écran et l'archive sans chemin de lecture (ADR-091) — tout cela invisible aux 404 tests et aux 63 écrans à 200 |
| **Les écrans se LISENT — clair et sombre, large et 390 px** | **Prouvé par exécution** | `npm run visuel` : 236 vues mesurées, 0 débordement horizontal, 0 texte sous 3:1. Avant : le thème sombre n'existait pas dans l'application (seulement dans le prototype), le texte « faint » — la voix explicative du produit — était à 2,61:1, et 104 vues débordaient à 390 px |
| **Les visas suivent la hiérarchie de revue** | **Prouvé par exécution** | trigger + service : un visa associé avant celui du reviewer est refusé |
| Le noyau déterministe (canonicalisation, sondage, seuils, projection, échelle de déficience, FEC) donne les bons résultats | **Prouvé par exécution** | 135 tests, dont la suite d'acceptation qui rejoue les anomalies semées par le générateur via le chemin applicatif réel |
| **Précision de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196 champs) sur le corpus d'eval — **0 montant faux sur 84 rendus, 0 date fausse sur 28 rendues** |
| **Extraction HORS CACHE, pièces jamais vues** | **Prouvé par exécution** | `npm run eval:pieces-neuves` (2026-08-31) : précision **100,0 %** (43/43 valeurs rendues), rappel 95,6 % (2 abstentions, jamais une valeur fausse), 0 échec, 0,0223 $/document, p50 4,4 s ; conduite de bout en bout au clic (dépôt → lecture réelle → attestation → écart) pour 0,0452 $, arrêt au plafond exercé pour de vrai (ADR-105) |
| **Rappel de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196). Avant ADR-021 : 14,3 % (n=196) sans le barreau modèle |
| **Barreau 3–4 (modèle) : précision, latence, taux d'échec** | **Prouvé par exécution** | 51 appels réels : précision 100 % (n=194 valeurs rendues), latence p50 ≈ 5,1 s, **échecs 0/51** |
| **Coût réel par document et par mandat** | **Prouvé par exécution** | 0,0240 $ par document au barreau modèle (n=1 sur le dataset, n=8 sur le corpus) ; **0,10 $ par mandat** (mix dataset, 100 doc.) à **0,68 $** (mix corpus, 29 % au modèle). COST.md §1 |
| Le barreau déterministe lit 20/28 documents du corpus, hors ligne et gratuitement | **Prouvé par exécution** | `npm run eval:extraction` : 71,4 % (n=28) au barreau gratuit, latence p50 **7 ms** |
| Le dictionnaire d'étiquettes s'étend par contenu, pas par code (ADR-021) | **Prouvé par exécution** | 6 mises en page (fr ×2, de, es, it, en) lues par un seul chemin de code ; tests de régression sur les deux collisions trouvées par l'eval |
| Une date ambiguë est refusée, jamais devinée | **Prouvé par exécution** | tests unitaires + eval : les seuls échecs du modèle avant ADR-021 étaient des abstentions, pas des valeurs fausses |
| Les scans n'ont réellement aucune couche texte | **Prouvé par exécution** | test dédié : extraction de texte vide sur les 8 documents bitmap |
| **Délais du dossier (60 j / 6 ans / échelonnement PCAOB)** | **Prouvé par exécution** | 11 tests sur `kernel/retention.ts` + service : citations et statut de vérification assertés, pas seulement l'arithmétique |
| La chaîne de hachage de l'event_log, les verrous documentaires, les exports auto-portants | **Prouvé par exécution** | tests S7/S9/S10 + acceptation |
| Les deux packs (NEP, PCAOB/SOX) tournent sur les mêmes moteurs | **Prouvé par exécution** | acceptation : mêmes services, contenu de pack différent |
| « Interroger » ne produit jamais de prose et refuse ce qu'il ne traduit pas | **Prouvé par exécution** | 13 tests, dont le rejet d'un plan proposant du SQL |
| Un adaptateur live refuse de tourner sans clé ; le défaut ne dépense rien | **Prouvé par exécution** | `adapters.test.ts` |
| Classification documentaire | **Prouvé par exécution, insuffisant** | 20/28 (71,4 %, n=28). Les 8 échecs sont les scans bitmap : aucun mot-clé à lire, ils partent au barreau modèle de toute façon |
| Rétention PCAOB (7 ans) et fenêtre AS 1215.15 | **[UNVERIFIED]** | pcaobus.org bloqué par le proxy : chiffres confirmés par le fondateur, **non relus sur texte primaire**. Marqué `unverified` dans le code, visible dans l'écran mandat |
| Le temps de vérification L2 (A11) | **Non établi** | chronométrage chez un pilote, pas mesurable sur corpus |
| Fiabilité sur **pièces clients réelles** | **Non établi, et ne le sera pas ici** | eval en environnement pilote, sur autorisation écrite (ADR-018) |

## Done

**Stage A** — docs/00 founder ideas (verbatim), 01 idea assessment (all 33 ideas judged +
capability sweep), 02 target concept; DECISIONS/ASSUMPTIONS/OPEN_QUESTIONS seeded.
**Gate 1** (6 lenses + red team) → ADR-012 L2 evidence contract, ADR-013 export boundary,
ADR-014 lock/retention; A8 reclassified kill-criterion; A11–A13 added.
**D13 research** — docs/10: SOX auditor-side gap confirmed; PCAOB AS 1215 (7y retention;
14d/45d completion, **phased in**); ViDA timeline; FRC/CNCC citations. Its France-retention
finding was **wrong and has been retracted** — the rule is **6 years** (C. com. R. 820-42)
with the file closed in **60 days** (D. 821-186 III-IV): ADR-014 rev. 2.
**Stage B** — docs/03 architecture, 04 data model, 05 integrations, 06 security/compliance,
07 MVP PRD + demo script, 08 backlog. **Gate 2** (6 lenses + red team) → ADR-015
kernel-first dataset contract, ADR-016 re-import invalidation; sample evaluation vs TE;
per-FSLI reconciliation gate; standing request items; engine_run + verification_run +
blind capture; S8a/S8b split.
**Stage C** —
- S0 scaffold: Next.js 15 + PGlite, migrations 0001–0007, hash-chained event log,
  append-only + documentation-lock triggers, packs, UI shell, dev auth + portal tokens.
- C1a kernel (pure, unit-tested) → C1b generator importing it: Altiverre FY2025 dataset
  (4 731-line FEC, TB N/N-1, 30 evidence PDFs incl. Factur-X, SOX RCM + listings, pinned
  demo params, extraction fixtures, generator-emitted ANOMALIES.md). Byte-identical
  regeneration verified.
- S1–S2 imports/reconciliation/FSLI/materiality/scoping · S3–S4 population/sampling/
  requests/portal/evidence/inbound · S5–S6 extraction ladder/vouching/exceptions/
  follow-ups/blind verification/sample evaluation · S7 workpaper engine (edits, notes,
  sign-offs, self-contained hash-stamped exports) · S8a–S8b SOX OE cycle (RCM, D&I gate,
  attribute sampling/testing, deviations, deficiency ladder, English OE workpaper on the
  same engine) · S9–S10 provenance answer views, event-log viewer, dashboard, audience
  tracker exports, demo:seed.
- Hardening: consolidated acceptance suite (zero false negatives, false positives
  enumerated — none), README, DEMO.md, DEPLOY.md, COST.md.
- **Retours founder (2026-08-25)** — docs/01 idea table (one row per idea, verdicts first);
  « Interroger » NL→requête déterministe sur catalogue fermé (ADR-017, page `/eng/[id]/ask`);
  harnais d'eval extraction sur corpus public/synthétique (ADR-018, `npm run eval:extraction`,
  docs/EVAL_EXTRACTION.md); adaptateur live + métrologie coût/latence/échec sous garde de
  budget (ADR-019, `npm run cost:measure`); docs/10_FALSIFICATION.md; ADR-014 réécrit avec
  références sourcées.

## Prototype cliquable, réorganisé par section d'audit (2026-08-25, lot 1)

`prototype/otto-prototype.html` — un fichier autonome, sans serveur ni installation ni compte,
**zéro appel modèle**. Réorganisation demandée par le fondateur : le prototype était rangé par
fonction (matérialité, scoping, revue analytique, échantillonnage), c'est-à-dire selon la
machine et non selon le travail. Il est désormais rangé **par section d'audit**
(ADR-026 à ADR-029).

**Livré au lot 1** : trois espaces distincts par construction (auditeur / portail client /
pilotage) ; une section de travail par poste retenu au scoping, avec évaluation du risque par
assertion qui **commande** les procédures requises et la taille d'échantillon ; portail client
réel (contacts, référent par section, paramétrage des relances, dépôt par élément avec accusé,
fil de messages distinct des notes de revue, statuts exacts dont « en attente de revue par X »
invisible du client) ; notes de revue refondues (ancrage obligatoire sur un objet, typage,
clôture réservée au réviseur et jamais à l'auteur, blocage réel du visa et de la clôture, vue
manager transverse, récurrence N-1) ; enchaînement câblé de la règle à la synthèse ; piste
d'audit.

**Non livré, structure montrée** : analyse sectorielle, parties liées, LCB-FT, pointage des
états financiers, export paramétrable fin (lot 2). Ces vues affichent ce qui leur manque et
n'affichent aucun résultat.

**Point juridique porté UNVERIFIED** : le régime d'accès au registre des bénéficiaires
effectifs (distinct du KBIS) n'a pas pu être vérifié sur le texte primaire depuis cet
environnement. Aucune constante ne sera écrite dans le code tant qu'il ne l'est pas.

Contrôles automatisés : 25/25 pieds de tableau exacts, 0 écriture déséquilibrée sur 1 605,
balance et grand livre équilibrés au centime, 2 écarts voulus, 11/11 citations littérales,
21/21 vues sans erreur, 0 requête réseau, 0 erreur JS, barre collante à 293 px sur 844 au
téléphone. Détail dans `prototype/README.md`.

## Registre des facteurs de risque (2026-08-25, lot A)

`prototype/otto-prototype.html` — ADR-030. Ce qui doit circuler entre les sections, ce ne
sont pas des lignes de tableau, ce sont les **constatations** : une constatation levée par une
procédure se pose seule sur les sections concernées, avec un lien vers sa source, et n'est
appliquée nulle part sans décision humaine. Un facteur non statué bloque le visa.

Cinq règles de levée branchées sur des procédures existantes (rapprochement, contrôle de forme
du FEC, test des écritures, circularisations) plus le chemin manuel. **8 facteurs** au réglage
par défaut pour une cible de 15 ; chaque règle porte un seuil de pertinence nommé et modifiable
en cours de mission, et le compteur est au bandeau supérieur. La règle « écritures de
direction » a exigé trois formulations avant d'être défendable — le chemin est conservé dans
l'ADR parce qu'il montre ce que vaut le garde-fou.

**Ordre retenu pour la suite** (arbitrage logé ici) : C (catalogue de preuve) **inclut la
refonte par procédure** — le catalogue est keyé FSLI × assertion × procédure, or il n'existe
aujourd'hui aucun objet « procédure » sur lequel accrocher des colonnes ; le construire sur la
structure actuelle reviendrait à le refaire. Puis E (balances auxiliaires, déterministe), puis
B (contrôle interne et processus, le plus lourd), puis D (résiduel qualitatif, qui découle de
A et B). Le lot 2 (sectoriel, parties liées, LCB-FT, pointage) reste en dernier : ces modules
dépendent de sources externes indisponibles, et leur valeur est précisément d'alimenter A.

## Refonte par procédure et catalogue de preuve (2026-08-25, lot C)

`prototype/otto-prototype.html` — ADR-031 à ADR-033.

**La sélection appartient à la procédure.** Chaque procédure requise porte sa population
(comptes numérotés, période, filtre en toutes lettres, éléments, masse), son unité
d'échantillonnage, son germe, son papier et sa conclusion. Un plan de travail en tête de section
donne procédure → assertion → population → sélection → papier → statut. Sur le chiffre
d'affaires les populations sont réellement distinctes : 268, 15 et 10 éléments selon la
procédure.

**Catalogue de preuve livré** : par FSLI × procédure, les documents attendus, les champs à
relever, la donnée contrôlée, la règle et la tolérance. Il pré-remplit les colonnes du papier et
**génère** la requête client. Une règle de contrôle n'est pas une égalité : *dans l'exercice*,
*antérieure ou égale*, *même exercice*, tolérance en jours — sans quoi une facture datée du 5 et
comptabilisée le 8 ressortait en écart.

**Ajouts** : revue analytique en trois moments (préliminaire alimentant le registre, substantive,
finale) ; bilan / compte de résultat avec double appartenance ; espace achèvement complet dont
le pointage à trois natures de rapprochement et une clôture qui refuse tant qu'un obstacle
subsiste ; filtres cumulables sur les requêtes des deux côtés ; classeur multi-feuilles et
composition de l'envoi périodique ; pédagogie repliée dans une page « Principes ».

Contrôles : 26/26 pieds de tableau exacts, 42 vues sans erreur, 13/13 citations littérales,
0 requête réseau, 0 erreur JS, rendu d'une section 21 ms, frappe 2,8 ms/touche, barre collante
293 px sur 844 au téléphone.

**Reste devant** : lot 2 (analyse sectorielle, parties liées, LCB-FT), E (balances auxiliaires),
B (contrôle interne et processus), D (résiduel qualitatif).

## Corrections, programme de travail, système visuel (2026-08-25, lots 1-2-3)

`prototype/otto-prototype.html` — ADR-034 à ADR-038. 413 Ko, polices comprises.

**Lot 1 — trois corrections.** L'étendue des travaux (taille de tirage ET seuil de strate
exhaustive) suit le risque de **l'assertion** testée, plus le risque maximum du poste : une
section porte des échantillons de tailles différentes. Le test de séparation des exercices est
borné à ce qui existe, n'annonce que ce qu'il teste, et déclare sur le papier qu'il est
unidirectionnel faute du grand livre N+1. Le taux d'anomalie des pièces devient un paramètre
déclaré (1,00 % de montants faux au lieu de ~6 % tombés d'un modulo), avec des pièces nommées,
leurs motifs métier et une vue « Jeu de données » qui compare taux visé et taux constaté.

**Lot 2 — un seul objet.** Tout travail de la mission est la même chose : 106 travaux
(7 planification, 91 section, 8 achèvement), les procédures étant migrées et non dupliquées.
Préparateur ≠ réviseur refusé par le système ; le niveau de revue découle du risque et un
niveau 2 exige un associé ; « achevé » par le préparateur seul, « revu » par le réviseur seul ;
travail non affecté = obstacle au visa. Heures budgétées (barème affiché, modifiable) et
réalisées, agrégées par phase, section et personne. **L'espace achèvement est supprimé** : les
trois espaces sont trois audiences, l'achèvement est une phase de l'espace auditeur. Vue globale
de la mission dans l'ordre des questions d'un chef de mission.

**Lot 3 — système visuel.** Jeu de jetons fermé, accent unique dans les trois espaces, la
couleur ne signale que les problèmes, marques de pointage à la place des pastilles d'état,
référence du papier en chasse fixe sur chaque panneau. Polices intégrées (IBM Plex Mono ;
Instrument Sans en substitution déclarée de Public Sans, indisponible hors ligne), 71 Ko en
base64. Compteurs : 2 rayons, 0 couleur hors jetons, 5 tailles de police, 0 espacement hors
échelle.

## Lisibilité : la section devient un lieu (2026-08-26)

`prototype/otto-prototype.html` — ADR-046. Six destinations, une seule affichée ; le plan de
travail est l'atterrissage ; une procédure ouverte remplace le plan avec un fil d'Ariane ; le
bandeau collant porte l'état de la section (et remplace celui de la mission, à hauteur
constante) ; les replis s'ouvrent selon ce qui demande attention et l'état que l'on change est
mémorisé par section. Le même traitement sur les vues qui réunissent trois panneaux et deux
écrans de contenu — les plus courtes restent d'un tenant.

**Mesuré à 390 px** : section chiffre d'affaires **6 129 → 1 674 px** (6,9 → 1,6 écran) · test
des écritures 6 874 → 1 900 · versions 4 233 → 1 100 · mission 3 256 → 1 200. Défaut préexistant
corrigé au passage : `scrollIntoView` amenait le haut de chaque vue **sous** la barre collante —
294 px invisibles à l'arrivée, sur toutes les vues.

## Sondage : coupure au seuil, et unités monétaires (2026-08-26)

`prototype/otto-prototype.html` — **ADR-047, qui révise l'ADR-034**. Arbitrage pris par le
fondateur : la strate exhaustive est celle des éléments individuellement significatifs, coupure au
**seuil de planification sans modulation** ; le risque agit sur la taille de l'échantillon et sur
l'intervalle de sondage, jamais sur la coupure.

**Sondage en unités monétaires** implémenté : intervalle = masse ÷ taille, éléments > intervalle
retenus d'office, les autres avec une probabilité proportionnelle à leur valeur, départ aléatoire
tiré du germe — déterministe et rejouable. Méthode et taille modifiables par procédure, affichées
sur le papier avec leur justification.

**Deux garde-fous.** Éléments individuellement significatifs > 25 % de la population : l'écran le
dit et propose le sondage en unités monétaires ou une stratification en bandes (non implémentée,
signalée comme telle) — déclenché sur **24 procédures sur 48**. Et, symétriquement, intervalle de
sondage > seuil de planification : l'écran le dit et donne la taille qui le ramène au seuil.

**Mesuré sur les sept anomalies dépassant le seuil de remontée** : strate + tirage de risque
**5/7** pour 1 856 éléments ; unités monétaires à intervalle adéquat **7/7** pour 2 157. Les deux
manquées sont juste sous la coupure d'exhaustivité. Contre l'intuition, le sondage en unités
monétaires teste ici **16 % d'éléments de plus** — c'est ce qui lui permet de ne rien manquer.

**Reste devant** : E (balances auxiliaires), B (contrôle interne et processus), D (résiduel
qualitatif), puis le lot 2 initial (sectoriel, parties liées, LCB-FT).

## Statuts dérivés et résolution d'écart (2026-08-26, points 4 et 5)

`prototype/otto-prototype.html` — ADR-039 à ADR-042. Sources décomposées dans
`prototype/src/` (`./build.sh` réassemble le fichier unique).

**Point 4 — un état ne se saisit pas.** La ligne de papier de travail ne porte plus de drapeau
`recu` : la réception se **dérive** du dépôt du client sur la requête qui demandait la pièce.
Cinq états dérivés par contrôle — en attente → reçue → traitée sans écart → écart à expliquer →
écart expliqué — affichés par les marques de pointage (`n a p x e`) et agrégés au bloc
« Avancement des justificatifs » de la section et au tableau de bord de pilotage. Le bloc
« Responsabilités et heures », dupliqué dans chaque section, est retiré : la section porte
désormais l'**action** — un bouton « le testing est terminé » qui porte le travail à « achevé »
et le soumet nommément à son réviseur, refusé tant qu'un justificatif manque, qu'un contrôle
n'est pas saisi, qu'un écart n'est pas résolu ou que la conclusion n'est pas écrite.

**Point 5 — une explication du client n'est pas un élément probant.** Le papier de travail porte
écart constaté, part expliquée, écart **résiduel calculé**, explication reçue mot pour mot,
conclusion de l'auditeur, qualification, lien vers la pièce ou l'écriture qui corrobore, auteur
et date. Sans les six éléments, l'écart reste **entier** au cumul. Un seul casier pour tous les
écarts, y compris ceux nés du rapprochement et du test des écritures, dont les phrases
pré-écrites deviennent des explications *reçues* et non des résolutions. La case à cocher
« corrigée par le client » de l'achèvement est supprimée. Le double comptage inter-sections
(une facture relevée en « Clients » et en « Chiffre d'affaires ») est signalé, jamais déduit.

**Audit demandé sur les autres tables de résolution — deux trouvées, corrigées.**
Migration **0010** : `reconciliation_item` (dont `documented_difference` libère le verrou de
population Gate 2) et `deviation` (dont `explained` retire une défaillance du décompte)
pouvaient encore clore un constat sur une phrase. Même contrainte, plus le chemin
`scope_limitation` pour ce qui n'est pas corroborable par construction. Les deux flux de
démonstration sont corrigés, pas contournés : `part2` laissait une déviation « expliquée » tout
en écrivant qu'elle subsistait. **148 tests verts**, dont quatre assertions au niveau base.

**Jeu de données — ADR-042.** Les seize écarts de montant étaient posés entre 3 % et 10 % de
leur pièce quelle que soit leur cause. Chaque écart déclare désormais sa nature et chaque nature
sa bande (arrondi ≤ 1 %, régularisation 2–12 %, omission 10–40 %), vérifiée à l'écran. Les
écarts dépassant le seuil de remontée passent de 1 à 6 — **constaté, pas visé**.

## Lisibilité : la section devient un lieu (2026-08-26)

`prototype/otto-prototype.html` — ADR-046. Six destinations, une seule affichée ; le plan de
travail est l'atterrissage ; une procédure ouverte remplace le plan avec un fil d'Ariane ; le
bandeau collant porte l'état de la section (et remplace celui de la mission, à hauteur
constante) ; les replis s'ouvrent selon ce qui demande attention et l'état que l'on change est
mémorisé par section. Le même traitement sur les vues qui réunissent trois panneaux et deux
écrans de contenu — les plus courtes restent d'un tenant.

**Mesuré à 390 px** : section chiffre d'affaires **6 129 → 1 674 px** (6,9 → 1,6 écran) · test
des écritures 6 874 → 1 900 · versions 4 233 → 1 100 · mission 3 256 → 1 200. Défaut préexistant
corrigé au passage : `scrollIntoView` amenait le haut de chaque vue **sous** la barre collante —
294 px invisibles à l'arrivée, sur toutes les vues.

## Sondage : coupure au seuil, et unités monétaires (2026-08-26)

`prototype/otto-prototype.html` — **ADR-047, qui révise l'ADR-034**. Arbitrage pris par le
fondateur : la strate exhaustive est celle des éléments individuellement significatifs, coupure au
**seuil de planification sans modulation** ; le risque agit sur la taille de l'échantillon et sur
l'intervalle de sondage, jamais sur la coupure.

**Sondage en unités monétaires** implémenté : intervalle = masse ÷ taille, éléments > intervalle
retenus d'office, les autres avec une probabilité proportionnelle à leur valeur, départ aléatoire
tiré du germe — déterministe et rejouable. Méthode et taille modifiables par procédure, affichées
sur le papier avec leur justification.

**Deux garde-fous.** Éléments individuellement significatifs > 25 % de la population : l'écran le
dit et propose le sondage en unités monétaires ou une stratification en bandes (non implémentée,
signalée comme telle) — déclenché sur **24 procédures sur 48**. Et, symétriquement, intervalle de
sondage > seuil de planification : l'écran le dit et donne la taille qui le ramène au seuil.

**Mesuré sur les sept anomalies dépassant le seuil de remontée** : strate + tirage de risque
**5/7** pour 1 856 éléments ; unités monétaires à intervalle adéquat **7/7** pour 2 157. Les deux
manquées sont juste sous la coupure d'exhaustivité. Contre l'intuition, le sondage en unités
monétaires teste ici **16 % d'éléments de plus** — c'est ce qui lui permet de ne rien manquer.

**Reste devant** : E (balances auxiliaires), B (contrôle interne et processus), D (résiduel
qualitatif), puis le lot 2 initial (sectoriel, parties liées, LCB-FT).

## Versionnement de la balance et du grand livre (2026-08-26, point 2)

`prototype/otto-prototype.html` — ADR-043. Nouvelle vue **Versions du fichier**.

Trois versions coexistent : provisoire (10/02), après écritures d'inventaire (04/03), après revue
de l'expert-comptable (12/03). Le dossier est à la v2 ; la v3 est **reçue et en attente** — on lit
le rapport d'impact avant de basculer, et la bascule est journalisée.

**Une version est un ajout, jamais une régénération** : grand livre v1 → v2 → v3 =
1 605 → 1 609 → 1 611 écritures, aucune écriture antérieure modifiée. Chaque écriture de version
déclare si elle touche la balance, le grand livre ou les deux — l'écriture de situation absente du
premier fichier est reprise en v2 et l'écart de rapprochement de 25 000 € disparaît de lui-même ;
un avoir passé à la balance seule en v3 en rouvre un de 6 200 €.

**Le rapport d'impact** répond aux six questions en évaluant réellement le dossier sur les deux
versions : comptes qui ont bougé · comptes qui franchissent le seuil de remontée · postes qui
entrent ou sortent du périmètre · sélections périmées avec les éléments entrés et sortis · travaux
achevés ou revus sur une version antérieure · anomalies résorbées et anomalies apparues. Mesuré :
v1→v2 les seuils passent de 37 000/27 000/1 800 à 33 000/24 000/1 600 et 32 sélections changent ;
v2→v3 ils remontent à 34 000/25 000/1 700, **Immobilisations incorporelles entre au périmètre** et
24 sélections changent.

**« À reconfirmer » est dérivé, pas écrit** : un travail achevé sur une version antérieure repasse
à « à reconfirmer » avec son motif, sans que le statut stocké soit modifié — revenir à la version
d'exécution le rend à son état. Un visa posé sur une version antérieure est signalé et remis en
cause. Chaque papier cite sa version et son empreinte ; l'export les porte en tête.

## Critères du test des écritures et entonnoir (2026-08-26, point 3)

`prototype/otto-prototype.html` — ADR-044.

Seize critères au catalogue, dix paramétrés, activables et désactivables ; cinq formes permettent
d'en **créer** sans écrire de code ; trois modes de combinaison (au moins un · au moins N ·
expression ET/OU/NON avec parenthèses, toute expression mal formée étant refusée et non évaluée
à « faux ») ; modèles réutilisables, trois livrés.

**L'entonnoir** montre, pour chaque critère, ce qu'il retient seul et ce qu'il **ajoute** que les
précédents n'avaient pas vu, puis la distribution des écritures par nombre de critères remplis.
Le paramétrage livré exige **deux critères** : « montant supérieur au seuil de planification »
retient à lui seul 441 écritures sur 1 602 et ne désigne donc rien. Résultat : **97 écritures,
6,1 % de la population, 14,2 % de la masse** — conséquence de la règle, pas cible.

**Deux critères catalogués et non exécutables, qui le disent** : « saisie hors heures ouvrées »
(le FEC ne porte que la date de validation, jamais l'heure — il faut le journal de l'ERP) et
« jour férié », dont la liste est marquée **UNVERIFIED** dans le code et à l'écran : le texte
primaire (C. trav., art. L. 3133-1) n'a pas pu être atteint, legifrance.gouv.fr étant bloqué par
le proxy réseau de cet environnement.

## Répartition proposée et attribution en lot (2026-08-26, point 1)

`prototype/otto-prototype.html` — ADR-045.

Le système **propose**, l'auditeur **corrige**. Huit cas de dotation par grade, affichés avec le
nombre de travaux que chacun attrape ; à grade égal, le travail va à la personne la moins chargée,
les travaux étant parcourus dans un ordre fixe — la proposition est rejouable à l'identique.
**Rien n'est écrit tant que personne n'accepte** : la proposition s'affiche à côté de l'affectation
réelle, jamais à sa place, et une ligne corrigée est marquée « corrigé ». L'équipe passe de trois
à six personnes (deux seniors, deux superviseurs) : sans cela l'équilibrage est décoratif.

**Attribution en lot** : case par ligne, « tout sélectionner » sur le résultat filtré, préparateur
ou réviseur appliqué en une action — chaque affectation passant par la même fonction que
l'affectation unitaire, un lot qui violerait la règle est refusé travail par travail.

**Ce que la proposition révèle, et qu'on n'a pas corrigé** : senior 83 % du budget de préparation,
l'associée revoit 74 travaux sur 112. Ce n'est pas la règle de dotation qui est fausse — 65
procédures répondent à une assertion évaluée « élevé ». Le levier est l'évaluation du risque, et
l'écran le dit au lieu d'aplatir les heures.

**Vérification finale des cinq points** — 41 vues × 2 thèmes × 2 largeurs (1600 px et 390 px) :
zéro erreur, zéro débordement horizontal, zéro texte à contraste insuffisant. Un défaut trouvé et
corrigé à cette occasion : `select.cell` ne recevait aucune règle et prenait le fond blanc du
navigateur, illisible en thème sombre — les sélecteurs d'affectation du programme de travail et
les champs booléens des papiers de travail étaient concernés. Le harnais de contraste ne balayait
que `#main` et l'avait manqué ; il balaie désormais tout le document, contrôles de formulaire
compris. Suite applicative : 148 tests verts.

## Catalogue méthodologique par cycle, en données versionnées (2026-08-26)

**La méthode a quitté le code.** `methodology/` porte, à la racine du dépôt, **56 procédures sur
15 cycles**, en JSON validé contre son schéma. Le prototype **ne le contient pas** : il l'intègre à
la construction (`_catalogue.gen.js`, engendré, non versionné). L'application le charge typé. Les
deux passent par **le même** chargeur — `methodology/valider.mjs` — et un catalogue invalide arrête
l'assemblage (`exit 1`) autant qu'il fait échouer la suite. (ADR-048)

**Le sens du test existe enfin.** Sept valeurs, dont les deux symétriques : `gl_vers_piece`
(réalité) et `piece_vers_gl` (exhaustivité). Dix procédures portent le sens inverse, qui n'existait
nulle part : recherche de passifs non enregistrés, revue des charges d'entretien, cut-off des
réceptions, avoirs postérieurs, exhaustivité du chiffre d'affaires et des achats.

**Deux défauts réels sur la procédure centrale du cycle fournisseurs**, tous deux relevés par le
harnais et corrigés :

- `FF2026-0117` **n'existait pas**. Les trois passifs omis portaient des références nommées, mais
  la boucle du jeu de données n'engendrait que des multiples de sept ; deux sur trois étaient posés.
  Une donnée d'essai nommée doit être posée, pas espérée.
- **Le contrôle était une date, et il était inversé** : la règle relevait comme anomalie toute
  facture normale du cycle (72 écarts) et jugeait conforme le passif omis (0 relevé). Le contrôle
  n'est pas une date, c'est une **recherche** — la dette attendue au bilan de clôture y figure-t-elle ?
  D'où la distinction, désormais portée par le catalogue, entre **ce qui se relève** (`releve_seul`,
  jamais d'écart) et **ce qui se contrôle**. (ADR-049)

Le jeu de données a été refait en conséquence : **29** décaissements postérieurs règlent une dette
régulièrement comptabilisée, **28** sont des charges de l'exercice suivant, **3** sont des passifs
non enregistrés. **Mesure : la procédure relève 3 écarts, exactement ces trois-là, et rien d'autre.**

**Sélection exhaustive imposée** (ADR-050) : sonder une population qu'on cherche précisément à
compléter ne prouve rien sur ce qui en est absent. Aucun tirage, l'étendue se règle par le seuil de
remontée — celui de **signification manifeste**, pas celui de planification, parce que des dettes
omises individuellement non significatives s'additionnent. Le garde-fou d'exhaustivité ne s'y
applique pas : il signale qu'on teste presque tout **sans l'avoir décidé**.

**Sources : 18 entrées, 18 non vérifiées.** Aucun texte normatif primaire n'est atteignable depuis
cet environnement (legifrance, cncc, pcaobus, ifac, iaasb — tous bloqués). Aucun numéro de
paragraphe, aucun numéro de NEP n'est cité nulle part, et chaque source porte la raison écrite de
sa non-vérification. La méthode s'affiche là où la procédure s'exécute, sources comprises.

## Ajustements et retraitements (2026-08-26)

**Le rapport d'impact dit ce qui a changé ; cette section dit pourquoi, écriture par écriture.**
Elle ne tient aucun registre : un ajustement **est** une écriture de version. Chacune déclare sa
**nature** — écriture d'inventaire, retraitement, correction sur constat d'audit —, son
**justificatif**, son **auteur côté client**, son impact **par poste** et **par masse**.

**La réconciliation est automatique.** Une correction d'audit nomme la **pièce** qu'elle corrige ;
l'anomalie portée sur cette pièce quitte le cumul non corrigé pour exactement ce que l'écriture
porte — bornée à l'anomalie et à son sens. Personne ne coche « corrigée ». Une **version 4** a été
ajoutée au jeu de données : à la prendre en compte, **trois anomalies passent de « non corrigée » à
« corrigée » sans aucune saisie**, pour 103 130 €, et le cumul tombe de 123 130 € à 26 200 €. La
correction **partielle** `OD-V4-003` (30 000 € sur un constat de 50 000 €) laisse ses 20 000 € au
cumul.

**Deux signaux, et ils ne disent pas la même chose.** *Anomalie qualifiée « corrigée » sans écriture
identifiée* : le dossier affirme qu'une correction existe, aucune écriture ne la porte — le cumul
est faux. *Écriture de correction sans anomalie correspondante* : `OD-V4-004` se présente comme
répondant à un constat que le dossier ne porte pas — soit nous avons omis de le consigner, soit le
client corrige autre chose. La plateforme pose la question, elle ne tranche pas.

**Et la règle du versionnement tient ici aussi** : une correction **annoncée** dans une version
reçue et non prise en compte n'a rien corrigé. La table de bascule dit de combien le cumul bougerait
— chaque ligne est un calcul réel, la version y est prise en compte, le dossier réévalué, puis
l'état rétabli.

Le noyau de cette réconciliation existe aussi côté application (`app/src/lib/kernel/adjustments.ts`,
17 tests) : c'est la règle du produit, pas un effet de démonstration. (ADR-051)

**Vérification** : 23 harnais du prototype sans échec ni plantage (dont `cat2` 27 contrôles,
`ajust` 24, `bandeau` 9), 177 tests applicatifs, `tsc --noEmit` propre, et la construction depuis
le dépôt reproduit le livrable à l'octet près.

## Équipe, indépendance, jalons, facteurs qualitatifs, pilotage (2026-08-26)

**Équipe et indépendance** (ADR-052) — nouvel écran en planification. L'équipe est une donnée : grade,
rôle, courriel, dates d'entrée et de sortie, exercices consécutifs sur le client. On ne retire pas
quelqu'un qui porte une trace au dossier — il reçoit une date de sortie. Déclaration d'indépendance
par membre et par exercice, sept rubriques, **signée soi-même**, révisable en **empilant** sans
écraser. **La règle qui rend tout cela réel** : aucun travail attribuable sans déclaration signée — le
système refuse — et un travail attribué à quelqu'un devenu caduque est un obstacle au visa de sa
section. Sur ce dossier : Hugo n'a pas signé, Inès a ouvert une révision, et les dix travaux de la
section Clients qui lui avaient été attribués en novembre bloquent son visa. Registre des services
autres que la certification avec ratio d'honoraires. **Tous les seuils sont [UNVERIFIED]**, marqués à
l'écran.

**Quatre dates, pas cent** (ADR-053) — intervention intérimaire, intervention finale, date du
rapport ; l'échéance d'assemblage se **déduit** du délai légal et ne se saisit pas. L'échéance de
chaque travail s'en déduit par une règle affichée, reste modifiable ligne par ligne et en lot, et une
échéance écrite ne bouge plus quand le jalon bouge. Ajout d'un travail à la main ; marquage « sans
objet » avec motif obligatoire plutôt que suppression.

**Libellés** (ADR-054) — « Plan de travail » (destination) devient « Procédures d'audit », parce qu'il
entrait en collision avec « Programme de travail ». Un harnais compare tous les libellés navigants
deux à deux et exige une **raison écrite** pour chaque couple à risque admis ; il retrouve le défaut
d'origine si on le réintroduit. Quatre autres collisions corrigées.

**Facteurs qualitatifs** (ADR-055) — **le ratio demandé : 83 % → 45,5 % de règles quantitatives.**
Cinq règles qualitatives de plus, qui remontent depuis des procédures qui les captent déjà :
subjectivité des estimations (elle se **mesure**), dépendance à un tiers unique, retraitement passé en
cours de mission, correction sur constat d'audit, anomalie relevée l'exercice précédent. Plus un
questionnaire **résiduel** — six questions par section, quatre pour l'entité — chacune portant la
raison pour laquelle aucune autre source du dossier n'y répond. Une réponse « oui » crée un facteur au
registre avec sa source ; une question sans réponse et un « oui » sans précision bloquent le visa.
Sur les facteurs réellement levés : **neuf qualitatifs pour sept quantitatifs**. Le registre passe de
8 à 16 facteurs, au-delà de la cible de 15 — le garde-fou de volume le dit.

**Un testing entièrement déroulé sur le chiffre d'affaires** (ADR-057), par les mêmes fonctions que
les clics correspondants : 167 éléments, requête émise, 167 dépôts, 1 158 contrôles traités sans
écart, un écart résolu et corroboré, un écart de 4 850 € laissé au cumul, une note posée par le
préparateur, répondue et close par la réviseuse, travail achevé puis revu, papier imprimable.

**Il a trouvé deux défauts réels.** (1) **76 écarts sur 115 factures normales** : la règle de date
`dans l'exercice` est écrite avec l'apostrophe droite en JSON et l'apostrophe typographique dans le
moteur ; aucun cas ne correspondait et l'exécution filait au **défaut silencieux**. Le schéma déclare
désormais l'énumération des règles de date, le validateur arrête l'assemblage sur une règle inconnue,
et la comparaison normalise l'apostrophe : **76 → 1**, le dernier étant la vraie anomalie de cut-off.
(2) **Un panneau replié s'imprimait replié** : la règle CSS ne suffit pas, le navigateur supprime le
rendu au niveau du `<details>`. Il faut les ouvrir à `beforeprint` et les refermer après. Mesuré :
0 caractère au papier avant, 1 907 après.

**Pilotage d'abord** (ADR-056) — l'espace passe en premier et devient celui d'ouverture ; `aller()`
déduit désormais l'espace de la vue. Cinq représentations : avancement par section, budget contre
réalisé, achèvements dans le temps contre l'échéance, charge par personne, âge des demandes en retard.
Tracées **à l'encre**, la couleur réservée aux problèmes ; barres et lignes, jamais de secteurs. Un
harnais relève toute teinte hors jetons, tout dégradé, tout filtre, **dans les deux thèmes**.
**Compteurs de design : 2 / 0 / 5 / 0** — le quatrième était à 1 avant cette passe.

### Passe suivante — la navigation, et le questionnaire qui rejoint la méthode

**Le rail se partitionne par NATURE d'objet** (ADR-058). « Planification » était devenu un
fourre-tout de quinze destinations mêlant cinq natures. Sept groupes désormais, chacun réunissant des
objets de même nature : Mission (5) · Données du dossier (3) · Planification (7) · Travaux
transverses (3) · Bilan (12) · Compte de résultat (9) · Achèvement (8). **Synthèse des anomalies** et
**piste d'audit** passent au Pilotage : ce sont des états du dossier, pas des travaux. Les **jalons**
deviennent leur propre destination — « Jalons et échéances ».

**Un seul groupe déployé, et le rail suit la destination courante.** Mesure demandée, avant / après :
**18 destinations visibles sur 46 → 13 sur 13** au premier écran (1500 × 900) ; **hauteur du rail
1 624 px → 436 px** ; **à 390 px de large, 1 608 px → 436 px**. Le rail ne défile plus.

**« Mes travaux »** (ADR-059) est la première entrée et l'ouverture par défaut de l'espace auditeur :
à préparer, à revoir, notes ouvertes, visas possibles — chaque ligne disant **ce qui la bloque** et
portant le lien **direct vers le papier**. Jamais dans le portail client. Le harnais a relevé la fuite
sur la première version.

**Recherche et filtres sur les sections** (ADR-060) — nom, code ou **numéro de compte** ; cinq
filtres. Le filtre **masque sans re-rendre**, pour que le curseur ne quitte pas le champ. Défaut
trouvé au passage : sortir un poste du périmètre le faisait **disparaître du rail**, on ne pouvait
plus lire le motif de sa sortie.

**Le portail client s'ouvre sur la dette** (ADR-061) : quatre rangs — en retard · avant la prochaine
relance · ensuite · déjà déposées (repliées) — triés par échéance, la dette chiffrée en tête. Filtre
par **domaine métier**, jamais par code de section d'audit. Le seuil de « bientôt » **est** la cadence
de relance, pas un nombre choisi. Défaut trouvé : la règle de jours ouvrés comptait le **dimanche**
comme ouvré dès qu'on ouvrait le samedi.

**Le questionnaire résiduel rejoint `methodology/`** (ADR-062) : `questionnaire.json`, son schéma, le
même validateur, consommé par l'application et par le prototype. Portée et nature sont des
**énumérations déclarées qui arrêtent l'assemblage** ; `disparait_quand` nomme ce qui rendra une
question inutile ; une entrée **ISA-315** rejoint le registre, `verifie: false` comme les dix-huit
autres — accès aux textes primaires **retenté le 2026-08-26**, toujours refusé par le proxy. Chaque
question affiche désormais sa source et `[UNVERIFIED]` à l'écran.

**Les harnais du prototype entrent au dépôt** — `prototype/pw/`, 31 harnais Playwright + `tout.sh`.
Ils vivaient jusqu'ici dans un répertoire de travail éphémère : STATUS.md affirmait « 29 harnais sans
échec » et **rien dans le dépôt ne permettait de le rejouer**. Une vérification que personne ne peut
refaire n'est pas une vérification. Ils s'exécutent **sur le fichier livré**, relèvent toute requête
réseau et toute erreur JavaScript, et `tout.sh` sort en échec sur le moindre `ÉCHEC` ou plantage.

### Dernière passe sur le prototype — il ne sert plus qu'à être montré

Quatre corrections, aucune fonctionnalité. Le prototype est **arrêté** après celle-ci.

**Persistance** (ADR-064) — refusée sept fois, acceptée pour un autre critère : le prototype n'a plus
qu'un emploi, et un rafraîchissement accidentel renvoyait tout le dossier à son amorce devant le
confrère. Tout `S` est écrit (1,3 Mo, ~50 ms, débouncé à 700 ms), les gestes sont écoutés plutôt que
les rendus, un instantané d'une autre version est écarté et l'écran le dit, trois causes d'échec ont
trois messages. Défaut trouvé par le harnais : `pagehide` réécrivait l'état juste après « repartir de
zéro » — le bouton ne repartait de rien.

**Dates** (ADR-065) — plus un seul `<input type="date">` : ils suivent la locale du navigateur, donc
`04/03` ne disait ni le 4 mars ni le 3 avril. Champ texte `JJ/MM/AAAA` partout, parseur qui **refuse**
une date impossible en marquant le champ, harnais qui vérifie qu'aucune date non formatée ne subsiste.
`build.sh` publie désormais lui-même le fichier livré.

**Identité sur téléphone** (ADR-066) — le sélecteur débordait de 31 px. Il rétrécit au lieu de
déborder ; le faire passer à la ligne ajoutait 30 px au bandeau collant et le harnais de lisibilité
l'a refusé.

**`DEMO.md` porte le parcours** (ADR-067) — cinq minutes, écran par écran, avec la phrase à dire, les
questions qu'on reçoit et leur réponse, et ce que le parcours ne montre pas. `pw/parcours.mjs` le
rejoue et échoue si un chiffre cité bouge.

**Vérification** : 34 harnais du prototype sans échec ni plantage (dont `dates`, `persist` et
`parcours`, neufs) · 186 tests applicatifs · `tsc --noEmit` propre.

## Application — tranche livrée : équipe et indépendance

**Correction d'état, d'abord** : l'isolation par cabinet **existait déjà** (`tenant_id` partout, RLS
en 0004, garde applicative ADR-007). Il n'y avait pas de `firm_id` à poser — il y avait une fondation
à **utiliser** et à **prouver**.

Livré (ADR-069) : migration `0011`, service `team.ts`, écran `/eng/[id]/team`, et 26 tests.

- **La règle** : aucun travail attribué à qui n'a pas signé. Le système refuse, il ne rappelle pas.
- **La base garantit** : on signe pour soi (contrainte), une déclaration signée ne se réécrit ni ne
  se supprime (trigger), une révision exige un motif (contrainte). Les tests les contournent **par
  SQL direct** pour vérifier qu'elles tiennent sans le service.
- **La révision empile** ; tant qu'elle n'est pas signée, un membre déjà affecté produit un
  **obstacle au visa** — sans quoi il suffirait d'affecter avant de réviser.
- **L'isolation s'éprouve** : un second cabinet entier, la fuite tentée dans les deux sens, l'acteur
  contrôlé autant que la cible, et un compte final des lignes croisées à zéro.
- **La déclaration est du contenu de cabinet** : `methodology/independance.json`, 7 rubriques,
  4 seuils qui nomment chacun leur source et ce qu'ils commandent — tous `verifie: false`, avec
  `UNVERIFIED` à l'écran.

Deux défauts trouvés par les tests : l'ordre des refus (la sortie de mission doit passer avant la
déclaration, sinon on envoie corriger la mauvaise chose) et des horodatages rendus en `Date` là où le
type disait `string`.

**Vérification** : 212 tests applicatifs (186 → 212) · `tsc --noEmit` propre.

## Application — tranche livrée : le risque par assertion COMMANDE (point 5a)

Le chaînon qui manquait entre le scoping et les travaux (ADR-070). Migration `0012`, service
`risk.ts`, écran `/eng/[id]/risk`, méthodologie `methodology/risque.json`, et 17 tests qui vérifient
non pas qu'un niveau s'affiche, mais qu'en le changeant **la liste des procédures et la taille des
sondages changent**.

- `risque(assertion)` → **liste des procédures requises** ; `risque(assertion)` → **taille du
  sondage de cette procédure**. La taille suit l'assertion **testée**, jamais le maximum du poste.
- **Calculé et retenu sont deux colonnes** : le calcul se re-dérive, la décision survit au recalcul.
  Une surcharge sans motif écrit est refusée par la base. Une surcharge qui rejoint le calcul cesse
  d'en être une.
- **Les règles de facteur sont de la méthode** : cinq facteurs, chacun nommant un prédicat, ses
  paramètres et ce qu'il craint. L'énumération des prédicats arrête l'assemblage **dans les deux
  sens** — un facteur non implémenté serait silencieusement toujours inactif, donc le risque
  sous-évalué sans que rien ne le dise.
- Chaque facteur range **sa mesure** (« 1 254 écritures (seuil 200) »), jamais un booléen. Un facteur
  non évaluable est inactif **et le dit**.
- L'écran montre les procédures **écartées** avec la raison : une liste qui ne dit que ce qu'elle
  retient ne se conteste pas.

**Vérification** : 229 tests applicatifs (212 → 229) · `tsc --noEmit` propre.

## Application — tranche livrée : le qualitatif, et l'échelle du cabinet (point 5b)

**Deux ratios, et ils ne disent pas la même chose.** Le ratio de **RÈGLES** — ce que la méthode
prévoit — est de 5 règles calculées pour 10 sources déclarées, soit **33,3 % de quantitatif** (le
prototype est à 45,5 %). Le ratio de facteurs **RÉELLEMENT LEVÉS** sur la mission témoin est de
2 observés pour 2 déclarés, soit **50,0 %**. Les deux sont mesurés par un test. Le second peut être
mauvais alors que le premier est bon : une méthode équilibrée dont personne ne remplit le
questionnaire redonne une évaluation à 100 % quantitative, et c'est le second ratio qui le dit.
Avant cette passe l'application était à **100 %** sur les deux — l'état du prototype qui avait été
rejeté, en plus prononcé.

Livré (ADR-071, ADR-072) : migration `0013`, service `questionnaire.ts`, questionnaire et registre
sur l'écran `/eng/[id]/risk`, `docs/12_CONFIGURABLE.md`, et 23 tests de plus.

- **Le questionnaire ne coche rien** : un « oui » **crée un facteur au registre**, avec sa nature, sa
  source et le texte écrit. Une question d'entité vise tous les postes retenus.
- **Le registre fait CIRCULER** : une constatation faite ailleurs se pose seule sur les sections
  visées. Confirmée, elle **monte le niveau et fait entrer des procédures** — proposée, elle ne
  compte pas : un moteur qui lève n'a pas décidé.
- **Trois règles bloquent** : question sans réponse, « oui » sans précision, facteur non statué.
- **L'échelle appartient au cabinet** (ADR-071) : quatre niveaux ou deux, nommés librement, chargés
  sans toucher au code — vérifié en chargeant réellement une méthode à quatre niveaux. Une table
  `{faible:0, moyen:1, eleve:2}` écrite en dur a été supprimée.
- **`docs/12_CONFIGURABLE.md`** : ce qui se configure sans code, ce qui exige un développement, et
  pourquoi la frontière est là. Y compris ce qui n'est **pas** possible — la taille d'échantillon par
  formule, chiffrée à une séance et rattachée au point 6.

**Vérification** : 252 tests applicatifs (229 → 252) · `tsc --noEmit` propre.

## Application — tranche livrée : les assertions sont de la méthode, et le papier a un format

Trois corrections à `docs/12_CONFIGURABLE.md`, plus la tranche technique qu'elles imposaient
(ADR-073, ADR-074).

**1. Les assertions étaient énumérées dans les schémas — c'est réglé, pas repoussé.** C'était le même
défaut que l'échelle de risque : un cabinet qui sépare « présentation » et « informations à fournir »,
ou qui suit le découpage PCAOB, voyait son fichier refusé. Le jeu vit maintenant dans
`methodology/assertions.json` ; les trois autres schémas ne l'énumèrent plus ; la migration `0014`
retire le CHECK énuméré en base. **Ce qui remplace l'énumération est plus strict qu'elle** : le
validateur arrête l'assemblage dans six cas — une procédure, une question ou un facteur visant une
assertion absente du jeu ; un `sens_naturel` inconnu ; deux codes en double ; un jeu vide. L'ancienne
énumération protégeait contre une faute de frappe dans un fichier, le contrôle croisé protège contre
une divergence entre quatre.

**2. Le format du papier de travail manquait au document, et c'est la signature d'un cabinet.**
Réponse établie par inspection : **partiellement configurable, et pas la partie qui compte**. Les
intitulés de sections et d'annexes se changent — mais dans un pack TypeScript, donc avec un
déploiement. La liste et l'ordre des huit sections, les colonnes des deux tableaux, la mise en page,
l'en-tête et le logo (qui n'existent pas) sont en dur. **~3½ séances** pour que le papier sorte à la
signature du cabinet, décomposées ligne à ligne. Une limite est assumée par écrit plutôt que subie :
le bloc de visas, la version et l'empreinte de population ne deviendront pas optionnels — ce sont eux
qui rendent un export relisible sans OTTO.

**3. L'ouverture du document promettait ce que son §3 démentait douze lignes plus loin.** Elle date
maintenant l'état réel — les éléments sont des données, le chargement par cabinet est chiffré à
2½ séances et **n'est pas fait** — sans retirer la promesse. Deux marqueurs visibles courent dans le
tableau du §1 : **⚠ commun** (c'est une donnée, mais le catalogue est unique pour toutes les
missions) et **⚠⚠ code** (c'est configuré, mais dans un pack : il faut un déploiement). **Aucune
ligne du §1 n'est aujourd'hui sans marqueur**, et le document le dit avant le tableau.

**Vérification** : 261 tests applicatifs (252 → 261) · `tsc --noEmit` propre.

## Application — tranche livrée : la méthode d'un cabinet est à lui (méthodologie-comme-donnée)

Les trois pièces annoncées au §3 de `docs/12_CONFIGURABLE.md` sont faites (ADR-075, migration
`0015`). Le catalogue n'est plus lu depuis le dépôt : il est lu depuis la base **du cabinet**.

- **`firm_methodology`** porte le paquet JSON validé, son empreinte et ses versions. **Immuable** :
  republier crée une ligne. Un dossier doit pouvoir dire des années plus tard sous quelle méthode il
  a été exécuté.
- **La mission DÉSIGNE son catalogue** (`engagement.methodology_id`) au lieu de prendre le dernier
  en date. Une méthode publiée en mars ne change pas rétroactivement les travaux requis d'un dossier
  planifié en janvier.
- **L'isolation est dans la BASE** : la clé étrangère est composite `(methodology_id, tenant_id)`.
  Désigner la méthode d'un autre cabinet est **impossible**, pas seulement refusé — et contrairement
  aux politiques RLS, une clé étrangère n'est pas inerte en local. Le test **contourne le service**
  pour écrire directement et attend le rejet **par le nom de la contrainte**.
- **Une mission sans méthodologie est REFUSÉE, pas repliée** sur celle de l'éditeur. Le repli aurait
  fait tourner un dossier sur notre méthode sans qu'aucun écran ne le dise — le silence lu comme un
  succès, une fois de plus.
- **Le paquet d'un cabinet ne peut contenir ni ses propres schémas** (ils énumèrent ce que le moteur
  sait calculer : les livrer désactiverait tous les contrôles en une ligne) **ni un fichier en
  moins** (refusé, jamais complété en silence).
- **Un seul chemin de validation** : `valider.mjs` est scindé en une orchestration et deux entrées —
  disque et ligne de base. Un second chemin serait un chemin non testé.
- **Le chemin normal est exercé explicitement** : quatre tests de refus ne prouvent rien si le
  service refuse tout.

Ce qui reste et qui est écrit dans le document : **pas encore d'écran d'import**, la publication
passe par nous — ~1 séance.

**Vérification** : 278 tests applicatifs (261 → 278) · `tsc --noEmit` propre.

## Application — tranche livrée : l'écran d'import, et un défaut d'exécution que 278 tests verts cachaient

**Le défaut d'abord, parce qu'il change ce que « prouvé par test » veut dire** (ADR-076). En
conduisant le nouvel écran dans un navigateur, `/methodology` a rendu **500**. En vérifiant
l'étendue : `/eng/[id]/risk` et `/eng/[id]/team` rendaient **500 aussi**, et depuis plusieurs
tranches — depuis que le validateur est un `.mjs` partagé (`cf94181`). `await import(chemin)` est
réécrit par le bundler de Next et échoue à l'exécution ; Vitest le résout sans difficulté. **Un test
vert sur un chemin que la production n'emprunte pas ne prouve rien de la production.** Corrigé :
l'import est rendu opaque à l'analyse statique, avec repli sur le chemin Vite, et `racineDepot()`
**cherche** le dossier au lieu de le déduire, en échouant en le nommant.

**Règle de travail qui en sort** : tout écran neuf est conduit dans un navigateur avant d'être
annoncé. C'est ce qui a trouvé celui-ci et les trois défauts ci-dessous.

**L'écran** `/methodology` (ADR-077) : les versions publiées, quelle mission travaille sous laquelle,
et le chargement. **Vérifier sans publier n'écrit rien**, ni en succès ni en échec. Un refus n'est
pas « fichier invalide » : c'est la liste des lignes fautives, chacune nommant l'objet et la valeur
attendue — et pour un prédicat inconnu, **la liste des prédicats connus**, donc le refus se corrige
sans nous appeler.

**La propriété tenue par un test** : ce que l'écran déclare valide, la publication l'accepte ; ce
qu'il déclare invalide, elle le refuse. Une seule fonction produit les erreurs de paquet.

**Trois défauts trouvés dans le navigateur, pas en relecture.**

1. **Le collage était perdu à chaque refus** — `useActionState` avait été choisi pour l'éviter et ne
   suffisait pas : React réinitialise le formulaire après une action. Mesuré : 56 erreurs affichées,
   texte effacé sous elles. Le champ est contrôlé.
2. **Le mode « un seul fichier » était un piège** : passer de trois à quatre niveaux exige
   `risque.json` **et** `procedures.json` dans la même publication. Le texte est désormais toujours
   un objet indexé par noms de fichiers, correctif d'un ou plusieurs fichiers.
3. **Un refus envoyait corriger la mauvaise chose** : une clé inconnue recevait le message sur les
   schémas. Deux causes, deux messages.

**Vérification** : 286 tests applicatifs (278 → 286) · `tsc --noEmit` propre · **six écrans conduits
dans Chromium sur base fraîche**, dont le parcours complet publier → refuser → corriger → publier.

## Application — tranche livrée : le gabarit du papier est de la méthode

Le format d'un papier n'est ni un nom ni un calcul : c'est de la **présentation**, donc la signature
du cabinet — et le papier **sort** d'OTTO pour vivre dans son dossier, sous les yeux de son réviseur
puis d'un inspecteur. Le laisser dans un pack TypeScript exigeait un déploiement pour changer une
colonne : une incohérence avec la frontière du produit, à l'endroit le plus visible pour un client.

`methodology/papier.json` est le **septième fichier de contenu** (ADR-079, migration `0016`), chargé,
isolé et versionné comme les six autres. Il porte l'ordre et les intitulés des sections, les colonnes
des tableaux, les intitulés d'annexes, les mentions, l'en-tête et le logo, la mise en page, et le
**schéma de référencement** — qui n'existait pas du tout, alors que c'est ce dont un réviseur se sert
pour savoir où les travaux ont été faits.

- **La frontière joue dans les deux sens** : un bloc nommé et non implémenté sortirait une section
  **vide** ; un bloc implémenté et non nommé **disparaîtrait** du papier. Les deux arrêtent
  l'assemblage. Idem pour une colonne sur un champ non relevé et pour une variable de référence
  inconnue — elle laisserait un trou, et une référence trouée ne se cherche pas dans un dossier.
- **La référence est calculée puis FIGÉE** : un papier signé garde la référence sous laquelle il a
  été signé, même si le cabinet change son plan de classement l'an prochain. Elle couvre aussi les
  papiers du pack SOX gelé — un cabinet ne tient pas deux plans de classement.
- **Ce qui ne se retire pas** : visas, version, empreinte de population. Leur place et leur libellé
  sont au cabinet ; leur présence non, parce que c'est ce qui rend le papier lisible **si OTTO
  disparaît**. Un logo chargé depuis une URL est refusé pour la même raison.
- **Deux défauts trouvés par la suite.** Une contrainte d'unicité disait le **contraire** de la règle
  voulue : elle empêchait deux versions d'un papier de partager leur référence, alors que la règle
  est « deux papiers différents ne la partagent pas ». Remplacée par une garde. Et `annexes` était un
  `Record<string, string>` : lire `parameters` au lieu de `parametres` rendait `undefined` et faisait
  échouer l'export loin de la cause — les annexes et mentions sont maintenant **typées nommément**.

**Coût réel : ~4½ séances contre les 3½ annoncées.** L'écart est le schéma de référencement, absent
de l'estimation parce qu'elle avait chiffré « rendre configurable ce qui existe » et non « rendre le
papier celui du cabinet ».

**Vérification** : 299 tests (286 → 299) · `tsc --noEmit` propre · 48/48 écrans en production.

## Application — tranche livrée : point 6, la taille par formule et la méthode là où elle s'exécute

**La formule attendait la population, et la population est le point 6** (ADR-080). `tailles_echantillon`
accepte désormais, par niveau, **soit un nombre, soit une formule NOMMÉE** avec ses paramètres —
`mus_intervalle_au_seuil`, facteur de confiance 3,0, bornes 20–80. La méthode nomme, le moteur
calcule : c'était la dernière des trois questions à trente secondes dont la réponse était « pas
aujourd'hui ».

**Trois refus plutôt que trois chiffres plausibles** : sans population la taille est `null` et
l'écran nomme l'obstacle ; une population ou un seuil nul lèvent ; le seuil lu est le seuil
**validé**, pas le dernier proposé. Le chiffre affiché **porte ses entrées** — population et seuil —
sous lui : P7 vaut pour une taille d'échantillon comme pour un montant.

**Une erreur de frontière, corrigée parce que la suite l'a fait tomber.** La première version
exigeait qu'un niveau **nomme chaque formule connue** — le « dans les deux sens » appliqué
mécaniquement. Cela aurait forcé chaque cabinet à utiliser toutes les formules que le moteur
implémente, donc laissé l'implémentation du produit **dicter la méthode**. Le contrôle bidirectionnel
est remonté d'un cran : entre le **schéma du produit** et le **moteur**, où il a un sens.
*« Dans les deux sens » vaut entre deux parties du produit ; entre le produit et la méthode d'un
cabinet, un seul sens est légitime.*

**La méthode s'affiche là où elle s'exécute** : le tableau « ce que ce risque commande » porte, pour
chaque procédure, sa **population** (prédicat et paramètres) et son mode de **sélection**, à côté de
la taille et de sa provenance. Une procédure sans population explicite est une intention, pas une
procédure.

**Vérification** : 306 tests (299 → 306) · `tsc --noEmit` propre · 48/48 écrans en production.

## Application — tranche livrée : la boucle comme objet (point 7)

Chaque maillon existait et était testé. **La boucle, elle, n'existait pas** : personne ne pouvait la
voir tourner, dire où elle bloquait, ni combien de tours elle avait faits (ADR-081). Un produit dont
la thèse est « la constatation circule » et qui ne montre pas la circulation demande qu'on le croie
sur parole.

- **Neuf étapes ordonnées** — sélection, demande, dépôt, lecture, rapprochement, écart,
  clarification, résolution, cumul — avec ce qui a **franchi**, ce qui est **arrêté là**, et **ce
  qu'on attend**, nommément. Jamais « en cours » : un écran qui dit « en cours » ne dit rien de ce
  qu'il faut faire ensuite.
- **Le chiffre qui compte est le nombre de TOURS** : les demandes **nées d'un écart**. Une file se
  parcourt une fois ; une boucle repart. Sans ce compteur, on montre une file en prétendant montrer
  un cycle.
- **Rien n'est stocké** — tout est dérivé, et un test vérifie qu'aucune table ne porte cet état. Un
  compteur tenu à part diverge un jour de ce qu'il compte.
- **Pas de pourcentage d'avancement** : le chiffre utile est « combien sont arrêtés ici ». Un
  pourcentage se regarde ; un blocage se traite.
- **Une correction de test, pas de code** : la première version supposait un compteur de tours à
  zéro. Il valait déjà 1 — le déroulé de démonstration fait tourner la boucle. Le test vérifie
  maintenant l'invariant, et qu'un nouveau tour le fait monter de un.

**Vérification** : 313 tests (306 → 313) · `tsc --noEmit` propre · **50/50** écrans en production
(le nouvel écran a été découvert seul par le balayage).

## Application — tranche livrée : l'acceptation commande le dossier (point 1)

Toute démonstration commençait **au milieu** d'un dossier. Un dossier ne commence pas par un import :
il commence par une **décision** d'accepter ou de maintenir la mission (ADR-082, migration `0017`,
`methodology/acceptation.json`).

- **La règle qui refuse** : aucun travail ne se planifie avant la décision — ni affectation, ni
  évaluation du risque. Le système refuse, il ne rappelle pas.
- **La nature se déduit** : acceptation en première année, maintien en renouvellement, et ce ne sont
  pas les mêmes questions. Une question dont la réponse est dans le dossier ne se pose pas.
- **« Bloquant » ≠ « interdit »** : une réponse défavorable exige un motif écrit, elle n'interdit
  rien. Un cabinet peut accepter une mission difficile ; il ne peut pas l'accepter sans le dire. Le
  motif de la décision est exigé **dans les deux sens**, en service et en base.
- **Chaque critère porte sa raison d'être**, affichée : sans elle, un questionnaire d'acceptation
  devient une formalité qu'on remplit sans la lire.
- **Le jalon d'assemblage se dérive** de la date de rapport par la règle du référentiel et ne se
  saisit pas — une date dérivée qu'on pourrait saisir deviendrait fausse le jour où quelqu'un la
  corrige. Un jalon sans date ne s'échoit jamais.
- **Un ordre de refus corrigé par la suite** : le garde d'acceptation passait avant celui
  d'isolation, donc quelqu'un visant le dossier d'un autre cabinet s'entendait répondre « faites
  accepter la mission ». Troisième fois que cette règle sert.

**La création du dossier**, l'autre moitié : un dossier se créait par le peuplement, donc jamais
devant personne. Il se crée maintenant depuis l'accueil, avec l'isolation vérifiée, le doublon
refusé (deux dossiers de même nature sur le même exercice feraient deux vérités sur les mêmes
comptes), et **la méthode en vigueur désignée à la création** — sans elle il naîtrait déjà cassé, et
personne ne saurait pourquoi. Un cabinet sans méthode publiée est refusé **en le disant**.

**Vérification** : 340 tests (313 → 340) · `tsc --noEmit` propre · 52/52 écrans en production.

## Application — tranche livrée : la reprise N-1 (point 2)

**On ne reprend pas des chiffres, on reprend des conclusions** (ADR-083, migration `0018`).

- **2a — un dossier N-1 RÉEL**, construit par les mêmes services que les clics : mission créée,
  acceptée, équipe avec déclarations signées, balance 2024 importée, périmètre décidé avec ses
  motifs, risque évalué, questionnaire rempli. Le fabriquer par insertions aurait produit un dossier
  qu'aucune règle du produit n'aurait accepté — et la reprise aurait repris **de la fiction**.
- **2b — rien n'est repris automatiquement.** Tout arrive **proposé**, avec sa source nommée, et une
  proposition non statuée est un **obstacle au visa**. C'est toute la différence entre une reprise et
  une recopie : la recopie ne bloque rien, parce qu'elle ne demande rien à personne.
- **Reconfirmer sans motif est permis ; écarter sans motif ne l'est pas** — reconfirmer, c'est dire
  « j'ai regardé et c'est toujours vrai » ; écarter sans motif est indistinguable d'un oubli.
- **La mission précédente se trouve par le chaînage des exercices**, pas par une date : un exercice
  de dix-huit mois casserait toute heuristique.
- **Un défaut de harnais révélé par les nouvelles données** : le résolveur de routes prenait
  `limit 1` sans ordre et choisissait parfois le dossier N-1 — vide de demandes et de papiers. Le
  choix va maintenant au dossier **le plus riche**. Un `limit` sans `order by` est une décision qu'on
  n'a pas prise.

**Vérification** : 352 tests (340 → 352) · `tsc --noEmit` propre · **54/54** écrans en production.

## Application — tranches livrées : pointage des états financiers (9) et obstacles au visa (8)

**Le pointage** (ADR-084, migration `0019`). Tous les travaux servent à conclure sur des états
financiers, et rien ne rattachait un chiffre de la plaquette à ce qui le fonde. **On pointe le
montant présenté, pas le sien** — recalculer et comparer à son propre calcul vérifie qu'on sait
additionner. Trois natures : deux se **calculent** (solde de balance, agrégat de comptes), la
troisième se **justifie** — un effectif moyen ne vient d'aucun compte, donc explication écrite **et
pièce liée**, ou la ligne reste ouverte. La nature se **déclare** : la deviner produirait un pointage
plausible et faux, pire qu'un pointage absent. Le statut est **dérivé** du calcul, et un écart sans
explication reste **ouvert**.

**Les obstacles au visa** (ADR-085). Chaque tranche avait ses blocages sur son propre écran : un
signataire qui doit visiter huit écrans finit par signer sans les avoir tous vus. Une **seule liste**
interroge maintenant chaque service qui connaît un blocage, et chaque obstacle dit **où aller le
lever**. Rien n'est stocké — un test vérifie qu'aucune table ne porte cet état et que la liste est
bien la réunion de ce que chaque service refuse. Le corollaire est écrit : **un obstacle qui n'y
figure pas n'en est pas un**. Un dossier non accepté n'affiche **que** cet obstacle-là.

Et ce que la page **n'affirme pas**, dit à l'écran : « aucun obstacle » ne veut pas dire que le
dossier est bon — il veut dire qu'aucune règle ne le refuse. Le jugement reste au signataire.

**Vérification** : 372 tests (352 → 372) · `tsc --noEmit` propre · **58/58** écrans en production.

## Application — tranches livrées : achèvement (10), clôture branchée (11), les trois retardataires

**L'achèvement** (ADR-086, migration `0020`) — les travaux qu'un inspecteur regarde en premier après
une défaillance. **Ce ne sont pas des cases à cocher : chaque règle est une DATE.** Des événements
postérieurs arrêtés avant le rapport → le refus **nomme la période non couverte**. Une lettre
d'affirmation datée avant le rapport → refusée. Une lettre **sans la lettre** → refusée, *c'est une
lettre, pas une conversation*. Et elle ne se déclare pas « sans objet » : *une mission sans lettre
d'affirmation n'est pas allégée, elle est incomplète.*

**Le branchement sur la clôture** (point 11). `sealFile` ne vérifiait que la conclusion sur les
anomalies — le dernier verrou d'une porte à huit serrures. Sceller un dossier sans lettre
d'affirmation produisait **une archive complète d'un dossier incomplet**, et l'archive est
définitive. La clôture demande maintenant **LA** liste d'obstacles, celle que l'écran affiche.

**Trois défauts de mon propre code, trouvés par le parcours complet** : une **jointure décorative**
qui donnait la boucle du chiffre d'affaires à seize postes (*une jointure qui ne joint rien est pire
qu'une jointure absente : elle a l'air d'être là*) ; un **jalon qu'on ne pouvait pas cocher**, donc un
retard fabriqué par l'outil ; et une **file qui se débouchait d'un cran** — un élément sorti par une
explication ou une limitation consignée l'a quittée pour de bon, à toutes les étapes.

**Les trois retardataires** (ADR-087) — déclarés dans la méthode, jamais calculés :
**l'ancienneté** se compte en exercices consécutifs (une rupture casse le compte) ; **la
familiarité** exige une sauvegarde et n'interdit pas ; **la rotation** ne porte que sur les habilités
à signer et son dépassement bloque ; et **`raiseFactor` est enfin appelé** — la résolution d'un écart
peut lever un facteur qui vise d'autres sections, ce qui fait de « la constatation circule » autre
chose qu'une phrase.

**DEMO_APP.md** : la mission entière en quinze étapes, avec `tests/parcours.test.ts` qui la rejoue —
de l'acceptation à l'**archive scellée**, par les mêmes services que les écrans.

**Vérification** : 403 tests (372 → 403) · `tsc --noEmit` propre · **60/60** écrans en production ·
`npx vitest run ../tests/parcours.test.ts` va jusqu'au dossier clos.

## Convergence prototype → application

`docs/11_CONVERGENCE.md` : les onze points de la mission simplifiée, chacun marqué
**existe / portage / neuf**, avec **l'ordre retenu** — 5 + méthodologie-comme-donnée → 6 → 7 → 1 →
2 → 9 → 10 → 8 → 11 — et le total honnête : **26 à 30 séances**, au-dessus des 20–24 estimés
d'abord (le dossier N-1 à reprendre n'était pas chiffré, et l'ancienneté/rotation s'ajoute). En résumé : trois points sont finis, deux à
moitié ; le seul chaînon vraiment manquant est le **risque par assertion qui commande** les
procédures et l'étendue ; et la **boucle requête ↔ documentation** n'est pas du code neuf mais de
l'assemblage à rendre visible.

Règle de cadrage retenue : **les procédures sont du contenu, la mécanique est le produit** — aucun
cycle au-delà du chiffre d'affaires.

## Prochaine tranche — dans l'application, plus dans le prototype

**Équipe et indépendance en premier**, avant le cycle chiffre d'affaires. La raison n'est pas
l'ampleur : c'est la tranche qui **force l'isolation par cabinet dès la première migration** —
`firm_id` sur chaque table, RLS, notion d'utilisateur — là où le CA la contournerait et obligerait à
tout reprendre. Elle est petite mais complète (déclaration signée, révision qui empile sans écraser,
refus d'affecter), et elle produit une règle qui **refuse** : c'est ce qui se teste de bout en bout le
plus honnêtement. Le CA est plus spectaculaire mais repose sur des moteurs déjà écrits et testés côté
application ; il gagne à venir en second, sur des fondations d'isolation éprouvées.

Ce que la tranche doit porter : migration SQL, isolation par cabinet vérifiée par un test qui
**tente** la fuite, persistance réelle, écran, et acceptation de bout en bout.

## Next actions (post-repo, founder-gated)

1. **Founder review item #1 — buyer intersection** (Gate 1): does an independent
   (non-network) component-auditor segment exist at buyable scale? A8 falsification test
   defined in ASSUMPTIONS; the six phone questions and their kill thresholds are in
   docs/10_FALSIFICATION.md.
2. ~~Founder review item #2 — run the AI layer once~~ **DONE** (2026-08-25): 51 live calls,
   $1.27 of the $20 ceiling. Results in COST.md §1 and docs/EVAL_EXTRACTION.md; the recall
   strategy they forced is ADR-021.
3. **Founder review item #3 — PCAOB primary text** (ADR-014 rev. 2): AS 1215.14/.15/.16 and
   the 14-day phase-in are carried as **[UNVERIFIED]** — pcaobus.org is blocked from this
   environment. The French side is now verified on the primary text (6 years, R. 820-42;
   60 days, D. 821-186 III-IV) and corrected throughout.
4. Wire live inbound email transport (Q12) — the first deployment task.
5. Legal: secret professionnel / GDPR analysis + DPA (A13) before any real client data.
6. First fast-follows if the wedge holds: analytical review + auto variance questions,
   FS booklet tie-out, confirmations (D8).

## Open threads

- Standing logged objection (Gate 1): sidecar positioning (D3) caps the provenance moat at
  the export boundary — mitigated by ADR-013 self-contained exports; revisit at v2 if OTTO
  becomes the file of record.
- Acceptance-suite scope is deliberately narrow: build-time regression evidence about
  engine design, never extraction-reliability or tool-evaluation evidence (docs/09 Gate 1).

## Tranche 9 close — la densité MESURÉE, le lexique appliqué, et une mesure qui refuse (2026-08-31)

**Chaîne verte, code 0** (`cd app && npm run verify`, base fraîche) : **511 tests** (58 fichiers,
zéro réseau) · **75 routes** ouvertes 0 échec · **70 écrans mesurés**, 0 au-delà de 5 actions
primaires, **71 champs à taper** au total (`docs/DENSITE.md`) · **135 étapes cliquées** 0 échec,
**262 clics** comptés sur 34 gestes (`docs/CLICS.md`) · **280 vues** regardées 0 défaut. Et
`npm run mesure:testing` : « Entrée atteste la ligne ouverte — OUI (1 → 0 en attente) ».

La tranche s'était close une première fois sur trois affirmations. Un sous-agent **hostile**
(mandat v1.1 §8.5) les a cassées toutes les trois en une passe, et il avait raison :

- le tableau de densité publié annonçait `0 | 0` sur des écrans qui portent des boutons
  inconditionnels — **le chiffre publié était faux** ;
- « ≤ 3 clics depuis **Mes travaux** » se mesurait depuis un écran qui **n'existait dans aucun
  fichier** (zéro occurrence dans `app/src`) ;
- `docs/LEXIQUE.md` marquait **sept** règles ✓ pour **quatre** implémentées.

Ce que la correction a changé (ADR-110, DA-13, DA-14) :

1. **La mesure REFUSE plutôt que de publier.** `npm run densite` s'arrête et n'écrit rien sur :
   statut HTTP inattendu, page sans titre lu, commande que personne ne peut atteindre, marqueur
   d'exclusion non déclaré, port déjà occupé (mesurer un serveur qu'on n'a pas lancé ne mesure
   rien, ADR-076), `BUILD_ID` qui change pendant la mesure. Quatre silences, chacun capable de
   produire le tableau faux ; aucun ne pouvait être vu.
2. **Ce qui est exclu du critère est publié à côté du critère** : colonnes « Repliées » et
   « D'item », et les écrans qui excluent des gestes le **déclarent avec leur raison**, dans le
   code qui mesure et dans le document. Les champs sont comptés même repliés.
3. **Un lien peint en bouton est un bouton** (`a.btn`, `input[type=submit]`, `[role=button]`),
   `select` est un champ, le **portail client** est mesuré : 70 écrans au lieu de 67 — et un vrai
   dépassement est apparu (`/methodology`, 10 actions), traité.
4. **« Mes travaux » est construit** plutôt que le critère raboté : écran dérivé (notes adressées,
   papiers dont le prochain visa manque, demandes échues), lien constant dans le bandeau, et le
   parcours **compte** les clics jusqu'à l'objet.
5. **Le lexique cesse de mentir sur lui-même** : le test extrait le texte LU (nœuds JSX, attributs
   de libellé, chaînes-phrases des services), juge la **langue du texte** et non celle du fichier,
   exclut le vocabulaire d'entrée de la recherche, applique **sept** règles. Prises : « Engagements »
   → **Missions** (accueil + fil d'Ariane), `<th>Justificatif</th>` → **Pièce**, « Feuilles de
   travail » → **Papiers de travail** au catalogue, en-tête de périmètre francisé, foyer de mission
   francisé. La ligne « écart / anomalie » **perd son ✓** : deux concepts qu'un test de mots ne
   départage pas.
6. **Le clavier est éprouvé**, plus seulement promis. ADR-104 annonçait « ↑/↓ change de ligne,
   Entrée atteste » depuis deux tranches sans qu'aucun harnais ne presse une touche. Le parcours
   presse désormais **↓ et ↑** dans l'atelier ; **Entrée** se prouve par `npm run mesure:testing`
   — le seul monde qui porte une lecture EN ATTENTE (celui du parcours lit tout par échelons
   déterministes, et le dit au lieu de compter une preuve qu'il n'a pas faite). Le banc y gagne
   au passage sa cohérence : son modèle KLM décrit une FRAPPE, et il cliquait la souris.
7. **Les clics sont publiés** (`docs/CLICS.md`, engendré par `npm run clics`) : un compteur posé
   DANS la page écoute les vrais événements de clic, geste par geste. Le document dit ce que le
   chiffre n'est pas — le chemin optimal — parce que le parcours clique aussi exprès ce qui doit
   être refusé.
8. **Les gestes que personne ne cliquait sont cliqués** : les deux exports du papier (le PDF était
   devenu inatteignable depuis son passage en repli — le harnais ne dépliait pas) et l'édition
   motivée d'une section. Et un repli qui cache une action **le dit** (classe `repli-action`).

**Deux défauts que la station « Mes travaux » a fait sortir en se plaçant** (le genre qu'on ne
trouve qu'en conduisant) : le dossier SCELLÉ refuse toute écriture — poser une note après la
clôture est refusé, le produit a raison, c'était la station qui était mal placée ; et la station
de clôture n'annonçait PAS son identité — elle héritait de celle laissée par la précédente, si
bien qu'intercaler une station a suffi pour qu'un préparateur sans droit de signature ne voie
aucun bouton et que le parcours conclue « le dossier n'est pas scellé » avec zéro obstacle. Une
station qui dépend de ce que la précédente a laissé mesure l'ordre du fichier ; elle dit
désormais qui elle est.

**Ce que je n'ai PAS fait dans cette tranche, exhaustivement.** Le comptage de clics par tâche du
mandat n'est pas un tableau des 10 tâches nommées : c'est le coût mesuré des **gestes du parcours**,
qui n'est pas le chemin optimal (dit dans le document). L'accessibilité clavier est éprouvée sur
l'atelier **seulement** — pas sur les autres écrans. La francisation des écrans hérités
(rapprochement, périmètre, seuils, papier) reste un chantier ouvert : le test ne police que le texte
français, un libellé anglais lui est invisible par construction, et c'est écrit dans LEXIQUE.md. La
mesure ne juge ni la lisibilité ni l'ordre de lecture — elle compte.

## Point 3 — les circularisations : banques et avocats, de bout en bout (2026-08-31)

**Chaîne verte, code 0** (`cd app && npm run verify`) : **529 tests** · **78 routes** · **72
écrans mesurés**, 0 au-delà de 5 actions, 71 champs à taper · **144 étapes cliquées** 0 échec,
270 clics sur 35 gestes · **288 vues** 0 défaut.

Le fondateur décrivait une file d'agents IA ; ce qui est livré est une **mécanique
déterministe** (ADR-111) — aucun modèle n'y est nécessaire (P4), et ce sont ses refus qui
travaillent :

1. **Le listing du client est une pièce**, importée avec la sévérité des autres imports ;
   réimporter ne rase pas ce qui est parti.
2. **La complétude se dérive dans les DEUX sens**, contre le poste du pack (trésorerie,
   provisions) — jamais contre un préfixe « 512 » écrit en dur.
3. **L'envoi est simulé et le dit**, et il exige un contact client clé déclaré.
4. **On ne reçoit pas une confirmation qu'on n'a pas demandée** ; la réponse est une pièce,
   sa lecture est humaine.
5. **Le rapprochement est dérivé** : côté banque tout écart se dit, côté avocats le seuil de
   remontée décide.
6. **Un écart se justifie par écrit** — « RAS » est refusé — et c'est cette phrase qui lève
   l'obstacle au visa.
7. **Onzième famille d'obstacles** ; aucune campagne ouverte = aucun obstacle.

Le monde de démonstration porte **exprès** un listing incomplet (le compte `512100` rattaché
à un `512900` inexistant, un `512200` qu'aucune écriture ne porte) : la complétude a quelque
chose à trouver, et la fin de mission mène la campagne à son terme — sinon le dossier ne se
scelle pas.

**Trouvé en conduisant, pas en planifiant** : le séparateur de milliers français est une
espace **insécable** — « 1 250,00 » cherché avec une espace ordinaire ne matche jamais ce que
l'écran affiche (même famille que le mot capitalisé par le CSS, règle 15). Le détail d'étape
rapporte désormais la valeur **lue**, jamais une phrase fixe.

**Ce que je n'ai pas fait** : aucune réponse d'avocat n'est semée (la mécanique est la même
et testée ; la démonstration cliquée porte sur les banques) ; la complétude côté avocats se
juge sur les comptes de provisions, pas encore sur les honoraires versés à des cabinets
absents du listing ; rien ne part réellement — le transport est simulé et le dit.

## Revue utilisateur n°1 — les deux bugs, et la leçon qui compte (2026-08-31 → 09-01)

Premier test par un auditeur réel sur la plateforme déployée. Vingt-cinq remarques, cinq
principes, deux bugs, trois manques : tout est au registre, section F (R-01..R-14).

**Le diagnostic est accepté sans réserve** — *la plateforme s'explique au lieu de se laisser
utiliser* — et devient une règle générale : **si une phrase à l'écran explique POURQUOI le
produit est fait ainsi, elle sort.** Elle va dans un ADR ; jamais dans le flux de travail.

**Les deux bugs avaient UNE cause, et elle était invisible d'ici.** Les journaux d'exécution
de Vercel : `methodology/valider.mjs introuvable` sur `/acceptance` (digest 1111597534),
`/team` et `/obstacles`. `next.config` traçait `dataset/fixtures`, `dataset/sox` et
`supabase/migrations` — pas `methodology/`, que l'application IMPORTE depuis le disque à
l'exécution. Le commentaire de ce fichier annonçait pourtant le risque, mot pour mot.

**La leçon (DA-16)** : 534 tests, 79 routes et 144 étapes cliquées passaient au vert pendant
que trois écrans rendaient 500 en ligne. La chaîne tourne sur PGlite, avec le dépôt entier
sur le disque ; le déploiement tourne dans une fonction qui n'emporte que les fichiers
déclarés, sur un Postgres réseau. **Deux exécutions différentes** — et c'est la seconde que
le fondateur ouvre. D'où, désormais :

- `npm run fumee [-- <url>]` — le balayage de FUMÉE : statut attendu, absence de page
  d'erreur, **titre lu**. Sans URL il lance un serveur de production local (il est donc DANS
  `npm run verify`, et le chemin est prouvé) ; avec une URL il éprouve le déploiement, et il
  REFUSE de conclure si la protection Vercel répond à sa place.
- `/api/sante` — les lectures de chaque famille d'écrans exécutées DANS la fonction
  déployée, en un appel. Vérifié en production après correctif : **« toutes les lectures
  passent »**, dont « méthode du cabinet (methodology/valider.mjs) ».
- `deploiement-traces.test.ts` — le test qui lit le CODE qui lit des fichiers et la
  CONFIGURATION qui les trace, et échoue quand le premier dépasse la seconde.

**Et un défaut que le harnais a trouvé sur moi** : le middleware `?comme=` tournait sur
CHAQUE requête pour n'y rien faire. Inerte en apparence — l'erreur d'hydratation #418 (fil
n°7) est revenue sur deux écrans dès son ajout, et a disparu dès que le matcher a été
restreint aux URL qui portent le paramètre (2 exceptions → 0, mesuré). Même leçon que le
layout racine : ne pas faire varier ce que le rendu voit.

## P3 + P4 — la charpente : rail vertical, navigation PAR POSTE, vue d'ensemble qui sert (2026-09-01)

**Pourquoi cette tranche existe.** La revue utilisateur n°1 n'a pas cassé le contenu, elle a
cassé le **cadre** : « onglets en haut », « vue d'ensemble inutile ». Tuan a déplacé le point
d'arrêt ici, avant la création de dossier et la verticale chiffre d'affaires : *si la charpente
est fausse, tout ce qu'on bâtit dessus est à refaire*.

**Ce qui a changé, à l'écran.**

- **Le rail est vertical et groupé** (ADR-112) : Le dossier · Les comptes · **Les postes** ·
  Travaux transverses · Demandes au client · Fin de mission. La règle ADR-103 est intacte —
  une destination n'apparaît que quand l'état du dossier la rend atteignable, le reste est
  grisé avec sa raison derrière « tout afficher ».
- **Un poste retenu = une destination** (`/eng/<id>/poste/<code>`), avec les six étapes dans
  l'ordre où on les travaille : leadsheet → processus → contrôle interne → évaluation des
  risques → échantillon → contrôle sur pièces. Chaque étape porte des CHIFFRES dérivés et un
  lien vers l'endroit où l'on agit. Population, sondage, testing, risque, boucle, papiers et
  provenance **quittent le rail** : ce sont des étapes d'un poste, pas des sections.
- **La vue d'ensemble est un tableau de bord, et d'abord le MIEN** : ce qui m'attend (même
  dérivation que « Mes travaux », restreinte au dossier), l'avancement par poste en barres
  colorées par statut, demandes et papiers, ce qui empêche de signer par famille, qui porte
  quoi dans l'équipe, notes de revue ouvertes rédigées.
- **Le vocabulaire vient du pack** (DA-15) : « Matérialité », « Scoping », « Ce qui empêche de
  signer ». Le pack porte un bloc `vocabulaire`, les écrans le lisent, et la règle du lexique
  s'est retournée : ce n'est pas « le mot est libre », c'est « le mot vient du pack, et un
  écran n'en mélange jamais deux pour un concept ».
- **« Remettre le monde de démonstration à zéro »** est un geste du produit (DA-17), visible
  seulement en démonstration publique : un écran de confirmation qui CHIFFRE ce qu'il efface
  (aujourd'hui / après, ligne par ligne) et la date de l'instantané qu'il restaure. Il ne
  rejoue pas le semis — dix minutes sur la base réseau, aucune fonction serverless ne vit
  aussi longtemps : il restaure l'instantané pris au déploiement, en une transaction.

**Les trois gardes que cette tranche ajoute, et le défaut qui les a produits.**

1. **Aucun écran de dossier injoignable.** Réorganiser une navigation, c'est retirer des
   entrées ; une entrée retirée dont l'écran n'est repris nulle part devient un objet qu'aucun
   chemin de lecture n'atteint, et rien ne le signale. `rail.test.ts` lit l'arborescence des
   routes sur le disque et exige : rail, poste, ou déclaration écrite avec la destination.
2. **Aucun composant client n'emporte la base dans le navigateur.** Le rail vertical est un
   composant client ; un `import { GROUPES } from 'services/rail'` — valeur, pas type — a
   suffi à tirer `pg`, donc `net`/`tls`/`dns`, dans le bundle. Le build de production a échoué
   et, en développement, **73 écrans ont rendu 500 d'un coup**, y compris le portail client.
   `client-serveur.test.ts` suit désormais le GRAPHE des imports depuis chaque `'use client'`.
   Éprouvé en le cassant exprès : il rend la chaîne `nav.tsx → services/rail → lib/db/client`.
3. **Un harnais qui sait le DIT.** Le balayage a annoncé « 73 écrans ne rendent pas » — vrai et
   inutilisable : la cause tenait en une ligne (`Module not found: Can't resolve 'net'`) et
   dormait dans le journal du serveur, qu'une assertion plus loin aurait imprimée.
   `causeServeur()` joint maintenant ce que le serveur a dit à la liste de ce qui est cassé.

**Ce que je n'ai PAS fait, et qu'il faut lire avant de croire l'écran.**

- **P1 (création de dossier) et P2 (toute donnée manquante engendre une demande)** ne sont pas
  faits : c'était le point d'arrêt demandé.
- **Le lien poste ↔ cycle de processus n'est pas modélisé.** L'étape « Processus » d'un poste
  montre ce qui est décrit sur le DOSSIER et laisse l'auditeur juger. Inventer un rattachement
  aurait été pire que l'avouer.
- **« Qui doit poser quel visa » n'est toujours pas un droit modélisé.** Le tableau de bord ne
  montre par personne que les deux attributions nominatives réelles : notes reçues, notes
  posées. Il n'y a pas de troisième colonne parce qu'il n'y a pas de troisième vérité.
- **`services/query` (Interroger) porte encore « matérialité » en dur** : ce service ne reçoit
  pas le référentiel du dossier. Écrit dans le code, à l'endroit exact, et au registre.
- **Les écrans `materiality` et `scoping` restent en anglais sous leur titre** : seul le titre
  a suivi le pack. La francisation complète est le chantier M-13, pas cette tranche.
- **Le contrôle interne et le processus sont séparés dans la NAVIGATION**, pas encore dans le
  contenu : deux écrans qui existaient déjà, désormais à deux entrées distinctes.
- **Les trois manques de la revue** (test des écritures NEP 240, intragroupe, ajustements du
  client) ne sont pas ouverts ; le point-par-point R-14 non plus.

**La chaîne, verte, et la commande qui la rejoue.** `cd app && npm run verify` —
**546 tests** (65 fichiers) · **81 routes** balayées sur un build de production, 0 échec ·
**47 routes de fumée**, 0 échec · **73 écrans mesurés**, 0 au-delà de 5 actions primaires,
71 champs à taper · **146 étapes cliquées**, 0 échec, 270 clics sur 35 gestes ·
**296 vues regardées** (clair/sombre, large/390 px), 0 défaut.

*Comment elle a été passée ici, et pourquoi c'est dit* : ce bac à sable suspend un processus
d'arrière-plan dès que l'agent n'exécute plus rien, ce qui fait mourir un `npm run verify` de
quinze minutes en une seule commande. Les étapes ont donc été lancées **dans l'ordre de
`verify`, sur le même monde semé**, une commande par étape. `npm run verify` reste LA commande
qui rejoue l'ensemble sur une machine ordinaire.

**La preuve au bout de la chaîne — dans la fonction déployée, pas ici** (DA-16). Base de
production RASÉE puis reconstruite par le build (Tuan l'a autorisé : « je n'ai rien investi
dans les données en ligne »). `/api/sante` interrogée sur `otto-dit-imperator080599.vercel.app`,
HTTP 200, verdict « toutes les lectures passent » — dont, exécutées DANS le lambda :
`rail de destinations : 24 éléments` · `vue d'ensemble (tableau de bord par personne) :
1 poste · 13 obstacles · 3 membres` · `espace de travail d'un poste : REVENUE · 3 comptes ·
6 étapes` · `instantané du monde de démonstration : pris le 2026-09-01 09:56:55+00`.

**Ce que je n'ai PAS pu faire, et qui n'est pas un détail** : ouvrir moi-même un écran de
l'instance déployée. La protection d'accès Vercel reste ACTIVE (décision de Tuan, point 2) et
intercepte toute page par une redirection SSO ; seule `/api/sante` a répondu. La preuve tenue
est donc la RÉPONSE d'une sonde qui exécute les lectures de chaque écran dans la fonction —
pas une capture. Le jour où la protection sera levée, `npm run fumee -- <url>` ouvrira les
écrans eux-mêmes.

## Revue n°2 — détenir ≠ répondre de, l'IPE, les XREF, et la langue qui vient du cabinet (2026-09-01)

**Les deux manques du périmètre, d'abord.**

- **P4 est fait** : la vue d'ensemble porte deux graphiques (avancement des sections, état des
  notes de revue), **My assignments** en quatre listes qui ne se recouvrent pas, la vue par
  membre, et ce qui empêche de signer. Le modèle qui le rend possible est la décision de fond
  de cette tranche (ADR-113) : *détenir* et *répondre de* sont **deux attributs**, pas deux
  filtres du même champ — sans quoi les deux listes montrent la même chose et personne ne s'en
  aperçoit.
- **La règle générale est appliquée** là où le rail avait été refait : « Le travail sur ce
  poste » et « La boucle » supprimées, les trois paragraphes explicatifs d'Acceptation et celui
  des contacts retirés, le *pourquoi* de chaque critère d'acceptation passé en infobulle. La
  DONNÉE reste : c'est elle qui empêche un questionnaire d'acceptation de devenir une
  formalité. **« Papiers de travail » ne subsiste plus** : les papiers se lisent en XREF sur la
  leadsheet.

**La langue est une donnée du CABINET** (ADR-114) : catalogue de libellés par locale, anglais
par défaut, français servi aux cabinets français. Le mécanisme entre **avant** la verticale
profonde, parce qu'un catalogue introduit après trois cents libellés se paie deux fois ; les
écrans migrent quand ils sont touchés.

**L'IPE est un bloc de chaque papier, et il BLOQUE** (ADR-113, migration 0031) : nature,
exhaustivité, exactitude, date, pertinence et **le fichier désigné parmi les objets du
dossier** — la contrainte est en base, pas seulement à l'écran ; ne pas répondre lève la
onzième famille d'obstacles au visa. La rédaction est **proposée** à partir des faits saisis,
marquée « à revoir », et n'entre au dossier que validée par un humain (L2).

**La chaîne, verte, et la commande qui la rejoue.** `cd app && npm run verify` —
**567 tests** (68 fichiers) · **81 routes** balayées en production, 0 échec · **47 routes de
fumée**, 0 échec · **73 écrans mesurés**, 0 au-delà de 5 actions primaires, 86 champs à taper ·
**146 étapes cliquées**, 0 échec, 272 clics sur 35 gestes, aucune exception navigateur ·
**296 vues regardées**, 0 défaut. Les étapes ont été lancées dans l'ordre de `verify` sur le
même monde semé (ce bac à sable suspend un processus d'arrière-plan dès que l'agent n'exécute
plus rien).

**Deux défauts que cette tranche a produits et corrigés, parce qu'ils se sont VUS :**
le repli des groupes du rail levait une exception par bascule (`currentTarget` déjà libéré dans
le calcul différé) — invisible tant qu'on ne clique pas, mesurée par `npm run clics` ; et les
tableaux d'attributions faisaient défiler le CORPS de la page (une colonne de grille se
laissait élargir par son contenu) — mesuré par `npm run visuel`, corrigé par `min-width: 0`
sur les colonnes de grille.

### Ce que je n'ai PAS fait — exhaustivement

- **P1 et P2 ne sont pas faits**, et c'est un ÉCART À L'ORDRE DEMANDÉ, assumé et nommé :
  l'ordre était « les deux manques → le catalogue → P1 + P2 → la verticale ». Le point d'arrêt,
  lui, se juge sur les cinq points du §6 de la revue — dont deux (leadsheet avec XREF, papier
  avec IPE) appartiennent à la verticale. Livrer P1+P2 avant la verticale aurait donné un arrêt
  qui échoue à son propre critère. J'ai donc fait A → catalogue → verticale, et laissé P1+P2.
- **La migration de langue est partielle** : rail (groupes et destinations), vue d'ensemble,
  poste, bloc IPE. Le reste des écrans porte encore ses libellés en clair, **y compris les
  infobulles du rail** — un rail dont les titres sont anglais et les infobulles françaises.
- **Acceptation en trois sous-sections** (décision de maintien, background check par adaptateur,
  rotation des associés) n'est pas faite. Les jalons sont **repliés, pas supprimés** : les
  supprimer laisserait le geste « marquer un jalon fait » sans écran et l'obstacle « jalons »
  sans destination.
- **Équipe et indépendance** n'est pas réduite ; l'attestation reste ce qu'elle est (pas de
  signature électronique qualifiée, et le mot n'est pas employé).
- **Les contacts de mission** restent dans Réunions : les déplacer sans la section client de P1
  casserait l'envoi des circularisations, qui exige un contact clé.
- **« Reprise du dossier N-1 »** n'est pas supprimée (elle part avec P1).
- **Le background check et la rotation des associés** ne sont pas commencés — et quand ils le
  seront, l'un sera un adaptateur de fournisseur, l'autre un paramètre de pack vérifié sur
  texte primaire et daté. Aucune durée de rotation n'a été écrite de mémoire ici.
- **Les trois manques de la revue n°1** (test des écritures NEP 240, intragroupe, ajustements)
  restent ouverts.

## Revue n°3, point 1 — la langue, jusqu'au bout : cinq angles morts de la règle (2026-09-01)

**Le point 1 de la revue n°3 était « plus une seule chaîne hors catalogue, et un test qui échoue
s'il en reste une ». Il était annoncé fait. Il ne l'était pas** — et ce n'est pas la migration
qui manquait, c'est l'instrument qui regardait à côté, pour la cinquième fois.

**Les cinq angles morts, chacun trouvé sur un exemple RÉEL, chacun devenu un cas connu mauvais :**

| angle mort | ce qui passait au travers | où |
|---|---|---|
| entité HTML | `&amp;` porte un point-virgule, et le filtre qui écarte le code écartait la phrase | `Approve & send (L2)`, le bouton qui envoie une demande au client |
| nom de touche clavier | « Control » figurait dans la liste des touches, appliquée à un nœud JSX | en-tête de la première colonne du RCM |
| ternaire affiché | les deux branches partaient dans le seau des LITTÉRAUX | `{m.can_sign ? 'oui' : 'non'}` |
| moins de deux lettres | le tout premier filtre exigeait deux lettres de suite | `> 90 j (N)` — « j » pour jours |
| **le catalogue lui-même** | la règle compte ce qui ne passe PAS par lui, donc ne lit jamais ce qu'il contient | **sept entrées avec `en` et `fr` ÉCHANGÉS** |

**Le cinquième est le plus grave, et il était en production.** `'mat.seuilDeSignification':
{ en: 'Seuil de signification', fr: 'Materiality threshold' }` : sur l'instance anglaise —
l'anglais est le défaut du produit — l'écran des seuils affichait « Seuil de signification »
à côté de « Materiality » pour le même concept, plus le testing et trois endroits du papier de
travail. **La façon la plus simple de rendre une phrase française invisible à la règle était de
l'écrire dans la colonne `en`.** Les sept sont remises à l'endroit ; deux paires devenues
doubles ont fusionné.

**Sixième angle mort, d'une autre nature : les services.** Un écran irréprochable peut afficher
du français s'il rend une table de libellés tenue dans un service. `NOTE_TYPES` portait « à
corriger (bloquante) » et deux écrans l'affichaient tel quel. La règle suit désormais le libellé
jusque dans `src/lib` : une propriété qui s'APPELLE un libellé tient une **clé**, jamais une
phrase. Vingt-sept relevés, sept migrés, **vingt et un différés avec leur raison écrite et leur
compte publié** (texte écrit-puis-stocké ; phrases qui côtoient du contenu de pack français).

**Ce que le parcours cliqué prouvait, et ce qu'il ne prouvait pas.** Il lisait le catalogue en
**anglais en dur**. Sur une instance française, ses stations de PRÉSENCE échoueraient bruyamment
— on le verrait — mais ses **onze stations d'ABSENCE** (« plus aucune note ouverte », « la
clôture n'est pas offerte ») passeraient en prouvant exactement rien. Il relève maintenant
`<html lang>` au premier écran, le sert à ses sélecteurs, et **vérifie sur cet écran** qu'un
libellé de cette langue s'affiche vraiment ; les absences se comptent sur les **deux** libellés.
Vingt-sept sélecteurs recopiés à la main passent par le catalogue — dont **neuf** cherchaient un
libellé français (`Statuer` ×7, `arbitrer` ×2) sur une instance anglaise, donc n'accrochaient
rien.

**Et une station du parcours ne peut plus s'éteindre en silence** (`docs/PARCOURS.json`) : une
garde STATIQUE dénonce une station retirée ou renommée du code, une garde D'EXÉCUTION dénonce
une station figée mais jamais conduite. Trois pièges étaient armés et sont désarmés : un nom
construit figé sur son DÉBUT avalait les six stations voisines ; figer sur un parcours *vert*
n'est pas figer un parcours *complet* (les 35 stations déclarées et jamais atteintes sont
écrites dans le figé, sous leur nom) ; et une garde au figé vide rendait une liste vide qui se
lisait comme un succès — le défaut qu'elle existe pour attraper, appliqué à elle-même.

**L'instantané des lectures comptait des clés de catalogue.** 1 083 des 2 316 « chemins de champ
rendus » étaient le suffixe d'une clé (`t('proc.conservationJusquAu')` contient un point).
Mesuré dans cette tranche même : renommer une clé faisait crier le garde comme si un écran avait
cessé d'afficher une donnée. Il tombe à **1 328 chemins dans 74 écrans**, et redevient relisible.

**La chaîne, verte, et les commandes qui la rejouent.**
`npm test` · **577 tests** (70 fichiers) · `npm run langue` **0 chaîne d'écran hors catalogue,
0 libellé en dur dans un service**, 21 différés avec raison, 13 messages de refus ·
`npm run langue:epreuve` **12/12** · `npm run lectures` **0 lecture perdue sur 1 328** ·
`npm run lectures:epreuve` **6/6** · `npm run parcours` **182 stations, 0 perdue** ·
`npm run parcours:epreuve` **5/5** · `npm run screens` **81 routes, 0 échec** ·
`npm run fumee` **47 routes, 0 échec** · `npm run densite` **73 écrans, 0 au-delà de 5 actions,
78 champs à taper** · `npm run clics` **148 étapes, 0 échec, 271 clics sur 36 gestes**, garde du
parcours **147 stations figées vérifiées** · `npm run visuel` **296 vues, 0 défaut**.

### Ce que je n'ai PAS fait — exhaustivement

- **Les points 2 à 5 de la revue n°3 ne sont pas faits** : notes de revue sur tout écran (la
  migration `0032` est écrite ET APPLIQUÉE localement, mais aucun écran ne pose encore une note
  d'écran ni ne distingue les deux natures), chat en fenêtre, P4 terminé, processus et contrôle
  interne semés sur le poste revenue. Le point 1 a coûté toute la tranche parce qu'il était faux.
- **Deux des sept inversions du catalogue échappent encore à la règle** — « Joindre » contre
  « Attach » n'a ni mot-outil ni accent. Le test le dit et le compte (5/7 sur les sept cas réels)
  plutôt que de laisser croire à une règle complète ; les deux ont été trouvées à l'œil.
- **Vingt et un libellés de service restent en français**, chacun avec sa raison écrite : un
  texte ÉCRIT PUIS STOCKÉ (réponse d'OTTO dans une note, interprétation figée d'une colonne) ne
  se relit pas dans une autre langue — la langue s'y décide à l'écriture, ce qui demande que le
  service reçoive la locale. Chantier nommé au registre.
- **Des phrases françaises construites par concaténation dans les services** (la justification
  d'un sondage, deux messages de circularisation) échappent aux DEUX règles : elles ne sont ni
  dans un écran, ni dans une propriété nommée « libellé ». Nommé au registre, pas corrigé.
- **Trente-cinq stations du parcours sont déclarées et jamais conduites** sur un parcours vert.
  La plupart sont des branches d'échec (« aucun papier dans le dossier ») ; deux `if` sans `else`
  ont reçu une voix, les autres n'ont pas été examinées une par une.
- **`ANCRE_KINDS` est exporté et lu par personne** — un objet créé qu'aucun chemin de lecture
  n'atteint (règle 13). Nommé au registre.
- **P1, P2, la verticale complète avec P5, l'IPE sur chaque papier, les modèles de papier par
  procédure et le test des écritures NEP 240** restent entiers.

## Mandat de nuit — Groupe 0 : l'URL déployée est prouvée, et par qui (2026-09-01, nuit)

**Ce qui était vrai avant cette nuit.** La chaîne tournait sur PGlite, en superutilisateur, sur
la machine de développement ; la production tourne sur Supabase par un pooler de transaction,
sous `postgres` — un rôle **BYPASSRLS**. Personne ne mesurait la seconde exécution : trois 500
et sept libellés inversés ont coexisté avec 577 tests verts. La protection « Vercel
Authentication » que STATUS annonçait active est **levée** (API Vercel, mesuré) : l'URL s'ouvre
sans compte.

**Ce qui est mesuré maintenant, et où le fondateur le lit :**

| preuve | où | mesuré le 2026-09-01 |
|---|---|---|
| bloc d'assertions rôle / RLS contre la base réseau | journal de build Vercel de chaque déploiement (`deploy:reconstruire`) | `rôle servi : postgres · rolbypassrls : TRUE — CONTOURNE la RLS · 101 tables · 11 avec tenant_id · 95 avec politique · défauts : aucun` ; tentative de fuite `0 / 0 / 49` |
| balayage de fumée **contre l'URL déployée** | GitHub Actions → `vérifier` → travail `url`, déclenché par Vercel (`deployment_status`), rapport dans le résumé et en artefact | **48 routes ouvertes, 0 échec** ; 2 non résolubles par le crawl (`exportId`, `iid`) ; titre lu sur chaque page |
| exceptions de rendu par digest | `/api/erreur?digest=…` sur l'URL ; `error.tsx` montre le digest | `/api/erreur` répond 200, `trouvees: 0` — aucune exception depuis le déploiement |
| la suite entière contre la base réseau | `rôle de production` (GitHub Actions, à la main et chaque nuit) | **jamais exécutée** : exige un secret que seul le fondateur pose (DEPLOY.md §0) |

**Ce que la nuit a corrigé dans le produit** : `acceptance.ts` posait `otto.derive_milestone`
EN SESSION par une requête et faisait l'UPDATE par une autre — sur le pooler de transaction,
la garde peut lire une autre connexion et refuser la dérivation, par malchance, en ligne
seulement (une transaction, réglage local ; interdit à la source, éprouvé contre neuf formes).
FORCE ROW LEVEL SECURITY sur toute table à RLS (0033, 0034) — inerte pour le rôle actuel, et le
bloc le dit. `global-error.tsx` pour la panne du layout racine.

**Ce que le sous-agent hostile a cassé sur cette tranche** (16 défauts, tous traités sauf le
contenu des politiques) : la suite réseau **morte par construction** sous le rôle non-bypass
que la recette faisait créer — `seedBase()` refusé dès `tenant`, éprouvé sur PGlite avec 0033 ;
un **TRUNCATE possible sur la démo publique** (la suite refuse maintenant par ce que la base
EST : le schéma `demo_instantane`) ; le bloc d'assertions **vert sur une base vide** (`every()`
sur l'ensemble vide) ; Chromium absent du travail CI ; l'écriture de `server_error` **non
attendue par Next** ; le layout racine sans écran d'erreur ; les fichiers de test en parallèle
sur une base partagée ; `DATABASE_URL` non héritée par les forks ; le détecteur de réglages de
session qui ne voyait que la forme historique et dénonçait « Reset to zero » dans le catalogue ;
« 49 routes » présenté comme mesuré. Et ce que le premier build a montré : `server_error` avec
FORCE manquante à côté d'un verdict « aucun défaut » (0034).

### Ce que je n'ai PAS fait — exhaustivement

- **La suite sous le rôle de production n'a pas tourné** : ni le secret (fondateur), ni une
  route réseau vers le pooler depuis cette machine. Le mode réseau de la suite est écrit et
  **non éprouvé** ; sa première exécution sera sa première épreuve.
- **Le rôle qui sert l'application reste `postgres`, BYPASSRLS.** Passer sous un rôle sans
  BYPASSRLS exige que chaque requête pose le locataire dans sa transaction — reporté (R9).
- **« Une politique retirée rend le build rouge »** est éprouvé sur PGlite (quatre cas connus
  mauvais), pas sur un déploiement d'aperçu : personne n'a retiré une politique en ligne.
- **« Une route morte rend le balayage rouge »** : les branches d'échec de la sonde distante ne
  sont pas éprouvées contre l'URL — c'est le balayage LOCAL qui a attrapé `/api/erreur → 500`
  (base locale non migrée), pas la sonde distante.
- **Chaque page porte le même `<title>`** (« OTTO — AI-native assurance platform ») : la sonde
  lit le titre et le publie, mais il ne distingue pas un écran d'un autre. Un titre par écran est
  un chantier de produit, pas de harnais.
- **`/api/erreur` est ouvert sans authentification** sur tout déploiement Vercel (DA-10), piles
  comprises. Acceptable sur des données fictives, à revoir avant une instance réelle.
- **Le contenu des politiques RLS n'est pas vérifié** : `using (true)` passerait le bloc.

## Mandat de nuit — Groupe 1 : la plateforme devient testable (2026-09-02, nuit)

**Ce qui était vrai avant.** Un dossier ne se créait que sur des entités et exercices déjà en base ;
« Mes travaux » listait trois natures de travail sans traverser les dossiers ; les gardes du produit
étaient affirmées une par une dans des commentaires, jamais inventoriées ni éprouvées contre leur
neutralisation ; l'information produite par l'entité se documentait papier par papier, sans objet
partagé ni refus de réutilisation sur un autre arrêté.

**Ce qui est livré, tranche par tranche (chaque tranche a eu son sous-agent hostile — revues n°4, n°5,
n°6 — et ce qu'il a cassé est corrigé ou nommé au registre reporté) :**

- **1.1 Création de mission en un écran** (0035, ADR-116, DA-29) : client neuf (fictif par
  construction, doublon normalisé refusé), exercice neuf par date de clôture (douze mois justes au
  29 février, chaînage CONTIGU dans les deux sens), classe, référentiel de seuil préféré (suivi si
  représentatif, refusé et nommé sinon), nature/pack/langue vérifiés AVANT toute écriture, N-1
  unique (même nature) lu par l'en-tête, la reprise, l'acceptation et le rail. Refus dans le repli
  ouvert. Deux stations cliquées + rejeu sous leur nom.
- **1.2 Tableau de bord sur `/travaux`** (DA-30) : obstacles au visa de MES dossiers par famille
  (même calcul que l'écran du dossier, test famille par famille), quatre listes de sections
  (récentes triées en SQL — le tri JS rangeait par nom de jour), notes ouvertes par ancienneté ;
  cabinet borné, dossiers scellés hors de tout l'écran. Libellés en clés (`detail:` en gabarit
  était invisible au détecteur : classe fermée, cas mauvais ajouté). Station cliquée : hors rail,
  un obstacle → l'écran qui le lève en un clic.
- **1.7 Registre des gardes** (ADR-117, DA-31, `docs/GUARDS.md` généré, `npm run gardes`,
  `npm run plancher`) : 28 invariants — 11 SQL prouvés en deux passes (attaque refusée par LA
  garde, puis acceptée avec la garde neutralisée dans une transaction annulée), 2 de service en une
  passe, 15 déclarés dont 4 SANS preuve, écrit tel quel. L'épreuve est éprouvée contre quatre gardes
  connues mauvaises et contre le critère du plan (déclencheur retiré → « G-03 : l'attaque a RÉUSSI »).
  Le registre a trouvé le soir même une contrainte inerte depuis 0009 (retirée en 0037, ADR-117).
  Cliquet : les tests comptés par `vitest list`, formes éteintes refusées avec leur cas mauvais.
- **1.8 IPE au niveau du rapport** (0036, ADR-118, DA-32) : `ipe_rapport` partagé (nom, système,
  paramètres, période, généré par/le, empreinte, nature, deux éléments testés, un fichier du
  dossier), le papier le désigne, réutilisation sur un autre arrêté REFUSÉE avec les deux dates,
  capture facultative à l'import (balance, FEC). Garde G-12. Station cliquée : le refus, puis le bon
  arrêté.

**Mesures, et la commande qui les rejoue :**
- `npx tsc --noEmit` : 0 erreur. `npx vitest run` (balayage des écrans compris) : 75 fichiers, 632 tests —
  631 verts sur la dernière exécution complète, le dernier (une liste de missions semées, passée de
  deux à trois) corrigé et rejoué seul ; la suite entière est à rejouer d'un bloc.
- Parcours cliqué (`npm run clics`, production) : 159 étapes conduites, 0 échec sur le septième
  parcours de la nuit — FIGÉ : `docs/PARCOURS.json` porte 197 stations déclarées, 158 conduites,
  39 déclarées jamais atteintes (branches d'échec, écrites). Sur les six parcours précédents, une
  exception navigateur intermittente (React #418, hydratation) est apparue trois fois, sur deux
  écrans différents, toutes stations vertes — comptée en échec par le harnais, à raison ; cause non
  trouvée, au registre reporté.
- `npm run langue` : 0 chaîne d'écran hors catalogue · 0 libellé en dur · 39 différés avec raison ·
  25 exclus avec raison. `npm run langue:epreuve` : 15/15 cas connus mauvais dénoncés (dont les deux
  classes fermées cette nuit : gabarit, ternaire multi-lignes).
- `npm run parcours:epreuve` : 5/5. `npm run lectures:epreuve` : 6/6. `npm run lectures` : 77 écrans,
  1364 chemins figés.
- `npx vitest run src/lib/gardes` : 23 tests, dont 11 gardes SQL × 2 passes. `npm run gardes` :
  `docs/GUARDS.md` à jour, 28 gardes. `npm run plancher` : voir docs/TESTS_PLANCHER.json (compté
  par `vitest list`).

**Ce que la revue hostile a cassé, et l'état de chaque constat** — lisible en entier dans
`docs/DECISIONS_AUTONOMES.md` (DA-29 réécrit, DA-30, DA-31, DA-32) et `docs/BACKLOG_REPORTE.md`
(section « Reporté par l'exécution de la nuit »). Les plus graves : exercice créable sur l'entité
d'un autre cabinet (corrigé, testé) ; aucun événement à la création d'exercice (corrigé) ; trois
définitions de N-1, l'en-tête montrant la NEP comme N-1 d'une SOX (une règle, quatre lecteurs) ;
préférence « PBT » sur une perte → seuil 1 000 € (garde, testée) ; 29 février (corrigé, testé) ;
chaînage enjambant un trou (contigu, testé) ; « récentes » triées par nom de jour (SQL, testé) ;
famille « achevement » rendue en code sur quatre écrans (`FAMILLES` typée sur la liste, deux clés
ajoutées) ; client orphelin par le chemin par défaut du formulaire (refusé avant écriture) ;
`docs/PARCOURS.json` ayant perdu `jamaisConduites` (restauré, `parcours --figer` le conserve, le
runner dit quand un `--figer` rouge n'a rien figé).

## Mandat du jour (2026-09-02) — livré, reporté, non prouvé

Agent seul toute la journée, aucune question, chaîne verte avant `main`. Le rapport du soir en un
écran est `docs/SOIR.md` ; la table d'acceptation observée est `docs/ACCEPTATION.md` (locale) et le
résumé du job `url` de la CI (déployée).

**Livré.**

1. **Colonne vertébrale réduite** — bandes de numéros de migration tenues par un test
   (`migrations-bandes.test.ts`, `docs/MIGRATIONS_BANDES.md`) ; registre des verdicts de verrou
   `engagement_lock_verdict` (0042) remplaçant la liste figée de 31 tables, propriété « 0 table sans
   verdict » ; verdicts du registre des gardes LUS depuis l'exécution (`docs/GARDES_RESULTATS.json`),
   une garde sans résultat s'écrit SANS RÉSULTAT.
2. **W0** (ADR-119) — `npm run accept [-- <url>]` : tâches annoncées conduites dans un navigateur
   contre l'URL déployée, PASS/FAIL observé, capture, horodatage, SHA déclaré par l'instance
   (`/api/sante` → `sha`) ; `npm run accept:epreuve` (un cas connu mauvais doit être FAIL) ;
   `npm run fumee -- --repetitions=7 --graine=<s>` : GREEN / INTERMITTENT / RED, graine imprimée ;
   la CI `url` joue l'épreuve, l'acceptation, et publie captures et table.
3. **W1** (ADR-120, migration 0050) — la grille FIGÉE par pack (colonnes de la méthode, tolérances
   du pack, versionnée, empreintée) ; une cellule par ligne et par colonne, delta SIGNÉ toujours
   imprimé, ancre (pièce, page, rectangle) lue dans la couche texte ; le rectangle dessiné sur la
   pièce par le serveur (`/api/piece/<id>/ancre`) ; la bande de cellules dans l'atelier, la touche V,
   les dispositions ; quatre refus tenus en base et prouvés en deux passes (G-13 à G-16 :
   TEST-01 pas de vert sans ancre, TEST-02 identité qui diverge = preuve non recevable, TEST-03 motif
   obligatoire, TEST-04 pas de conclusion sans disposition) ; la famille
   `unsupported_sample_items` en AVERTISSEMENT derrière le drapeau `flags.unsupportedSampleItemsBlocking`
   (nep-fr : off), fixture appariée ; station cliquée « la grille, les ancres, les refus, la
   conclusion » ; tâches d'acceptation W1-01 à W1-05.

**Reporté par écrit** (`docs/BACKLOG_REPORTE.md`, section du jour) : S2, S3, S4, S6, S7, S8, S9,
W2, W3, W4, W5, §4 ; les deux lignes d'acceptation absentes du jeu synthétique (0,4 %, mauvais
tiers — prouvées par fixtures, pas cliquables sur la démonstration publique qu'on ne re-sème pas) ;
le commutateur de langue (n'existe pas) ; la signature du BL non relevée ; TEST-01 sans chemin
cliquable.

**Non prouvé, dit tel quel** : l'isolation entre cabinets est INERTE en production (rôle
`postgres`, BYPASSRLS — S2 reporté) ; le harnais d'acceptation n'a pas pu être conduit depuis le
bac à sable de l'agent contre l'URL déployée (CONNECT refusé par la politique réseau) — les
verdicts déployés sont ceux de la CI ; TEST-01 n'a pas de refus observé par un clic ; l'erreur
d'hydratation #418 n'est ni reproduite ni expliquée.

## Reçu en cours de journée (2026-09-02) — analyse concurrentielle Optro

Inscrite au registre (`docs/REGISTRE_IDEES.md` §H) : le CRITÈRE D'ADMISSION de toute idée
(« aide-t-elle un auditeur indépendant à produire un dossier qui survivra à une inspection ? »),
ce que nous ne devenons pas (GRC), ce qui est à creuser (le dossier, le refus, l'IPE, la chaîne de
preuve jusqu'à la cellule, le multi-pack, le portail à l'auditeur), le positionnement SOX côté
auditeur externe, et les six points H-1 à H-6 pour la suite — le mandat du jour ne change pas.

**Poussé sur `main` (2026-09-02)** : `3bc9bd0` (le produit) puis `8302a23` (le harnais attend la
réponse de l'action avant de lire un refus). Vercel READY sur les deux ; CI `local` verte sur les
deux ; CI `url` : balayage 7 passages vert, épreuves 3/3, acceptation 10 PASS / 1 FAIL — le FAIL est
une exception d'hydratation #418 observée en ligne sur le papier REV-01 pendant la tâche IPE
(refus « papier visé » lu quand même) ; W5 reporté avec cette observation. Rapport du soir :
`docs/SOIR.md`.


## Mandat de la soirée (2026-09-02) — §0, §1, §2 livrés ; §3, §4, §5, §6/§7, §9 non tentés

**Ce qui est cliquable ce soir et ne l'était pas cet après-midi** (ADR-121, ADR-122, ADR-123) :

- **§0.1** `/api/sante` déclare le SHA du BUNDLE qui répond (cuit au build par
  `scripts/lib/version.mjs` → `next.config.mjs`), à côté de celui que la plateforme prétend, et
  dit quand ils divergent ; éprouvé par un cas connu mauvais (`version.test.ts` : une variable
  forgée ne l'emporte jamais sur le dépôt). `npm run accept -- --sha=<attendu>` échoue sur une
  autre identité.
- **§0.2** `npm run accept` est une SONDE par défaut : chaque action serveur est conduite dans
  une transaction annulée (`core/sonde.ts`, `annulerApres`), le refus observé est le vrai, rien
  n'est écrit — mesuré par `npm run accept:temoin` (11 tables comptées avant/après :
  « aucune écriture »). `--ecrire` reste l'option des bases jetables. Le journal de consultation
  (`section_visit`) se tait sous la sonde. Une transaction ouverte sous une transaction ouverte
  la REJOINT (point de reprise) — c'était le défaut trouvé par la revue hostile : un service qui
  réussissait sous la sonde figeait PGlite ; `sonde.test.ts` conduit désormais un service réel
  sous la sonde avec un délai qui refuse « BLOQUÉ », et la tâche S2-02 le clique.
- **§0.3** une grille de test figée en version neuve NOMME les conclusions qu'elle invalide et
  l'atelier les montre périmées avec la version ; la même règle tient la revue analytique
  (empreinte des soldes, marqueur « périmée », rien d'effacé).
- **§0.4** la sonde lit l'échantillonnage, la grille, les écarts, et la revue analytique du poste.
- **§1** le rail se lit par états financiers — `Balance sheet` puis `Profit and loss`, TOUS les
  postes du pack comptable (données de pack), retenus → espace de travail, hors périmètre →
  grisé avec le motif, sans compte → grisé et dit ; le rail se range (`[`), mémorisé par navigateur.
- **§2** la page de poste tenue comme un cabinet la tient : trois visas en en-tête (ceux des
  papiers du poste, PÉRIMÉS quand le papier est dépassé) ; leadsheet compte · intitulé · N · N-1 ·
  variation signée · % · XREF, avec l'ORIGINE de N-1 écrite (dossier N-1, sinon balance
  comparative, sinon rien) ; la variation renvoie à la **revue analytique du dossier** (écran
  neuf `/eng/[id]/analytique`, tous les postes du pack) ; sous la leadsheet la **revue analytique
  du poste** — le même objet — versionnée, ajout seul, vide refusé (ANA-01), proposition du moteur
  déterministe et tracée, qui ne compte qu'enregistrée par une personne (ANA-02 : le run cité
  est celui de ce poste), jamais réécrite (ANA-03), PÉRIMÉE quand les soldes ou les comptes
  bougent ; dix sections repliables et mémorisées (dont papiers avec visas, écarts avec leur
  papier, demandes du poste) ; navigation par ancres ; « ce qui reste ouvert » disparu ; une note
  de revue se pose sur une cellule de leadsheet (ancre `compte`).

**Prouvé, et comment (chaîne locale du soir, base neuve, build de production)** :
`tsc` 0 · `npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue (instantané refigé :
lectures déplacées dans des fonctions d'aide de la page de poste, mêmes chemins) · gardes
G-17..G-19 PROUVÉES en deux passes (36 gardes au registre) · `accept:epreuve` 3/3 cas mauvais
vus · `accept --ecrire` 13/13 · `accept` (sonde) 13/13 · témoin « aucune écriture (11 tables) » ·
`npm run screens` 85 routes, 0 échec · `npm run clics` : voir la ligne ci-dessous.

`npm run clics` : **189 étapes conduites, 0 échec, 188 stations figées** (docs/PARCOURS.json), 305 clics
comptés sur 41 gestes — dont la station neuve « poste : l’anatomie » (visas mesurés au-dessus de la
leadsheet, sept colonnes, variation signée, origine N-1, dix ancres, refus ANA-01, rédaction v1,
proposition non enregistrée, validation v2, repli mémorisé et rouvert par l’ancre, même texte sur
la revue du dossier). Le PREMIER passage était rouge : la station du rail attendait six groupes et
« areas » (corrigée : sept, bilan puis résultat, lus au catalogue), et deux exceptions #418 sont
apparues sur `/testing` et `/requests/[rid]` — pages non touchées par la tranche — puis n’ont pas
reparu au second passage. HYPOTHÈSE, pas diagnostic (règle 18) : le fil W5 (navigation pendant le
flux RSC). Non prouvé ; consigné dans docs/BACKLOG_REPORTE.md (W5).

**Non fait, exhaustivement** : §3 (section « Audit procedures »), §4 (re-tirage et sa règle),
§5 (notes en panneau latéral), §6/§7 (passe esthétique ; les replis mémorisés n'existent que sur
la page de poste), §9 (semis enrichissant), §10 (plan écrit — `docs/PLAN_RLS.md` —, rien
exécuté, `DATABASE_URL` intacte) ; le locataire-sonde (annulation transactionnelle à la place,
docs/BACKLOG_REPORTE.md) ; le poussé sur `main` et la CI `url` : voir le rapport du soir.

**Poussé et déployé** : `edb5e6c` sur `main` ; Vercel READY ; `/api/sante` déclare ce SHA
(source `git`, identité cohérente) et la lecture « revue analytique du poste » passe sur la base
publique (0130 appliquée). CI : job `local` vert ; job `url` 12/13 (A-05 : refus lu, puis #418
sur la page du papier REV-01 — deuxième occurrence en ligne, fil W5). Témoin en production après
le job : 0 ligne laissée par la sonde (fsli_analytique, engine_run, event_log, section_visit).

**Non prouvé** : l'application de 0130 sur la base publique
existante (elle s'applique au prochain déploiement, comme 0050 s'est appliquée) ; le rendu
navigateur du repli sur un lecteur d'écran ; les deux exceptions #418 du parcours cliqué
(fil W5) — voir la ligne des clics.

## Mandat de nuit n°2 (2026-09-02 → 03) — 1.1 livré : un monde qui a quelque chose à montrer

**Ce qui est cliquable maintenant et ne l'était pas ce soir** (ADR-124) :

- **`npm run demo:enrichir`**, joué à CHAQUE déploiement (`scripts/deploy/reconstruire.ts`, monde
  conservé ou reconstruit, avant l'instantané) et en étape « 2 ter » de `npm run demo` : le monde
  de démonstration est ENRICHI, jamais remplacé — dix étapes idempotentes, chacune dit « déjà en
  place » ou ce qu'elle a posé ; les données du fondateur survivent (REV-01 reste signé, aucun
  compteur ne baisse — `flows/enrichir.test.ts`, 5/5). Un dossier scellé ou absent : rien n'est
  touché, et c'est dit.
- **Ce que l'écran montre.** Tableau de bord : des sections dans les QUATRE états, tenues par
  plusieurs personnes (Hugo Vasseur, staff, rejoint l'équipe avec sa déclaration d'indépendance
  signée). Poste Chiffre d'affaires : SEPT lignes de papier — REV-01 du fondateur, et cinq
  papiers rédigés depuis la méthode (MANUEL signé aux trois visas, CUTOFF et RECALC en revue, RA en
  brouillon, SEQ dont la v1 est PÉRIMÉE par une v2 motivée — le visa du préparateur se lit périmé
  en en-tête). Notes de revue ouvertes de 1 à 14 jours ouvrés, dont une sur la cellule
  « Montant HT » d'une ligne d'échantillon et une sur la cellule « solde » d'un compte de la
  leadsheet (ancre `compte`, migration 0131). Processus ventes N et N-1 avec les changements
  statués, RCM du cycle importée. Grille calculée, quatre lignes conclues dont une cellule
  « absent » disposée. Revue analytique v1. Clients et comptes rattachés au périmètre, ses
  questions statuées, une procédure planifiée.
- **`services/programme.ts`** : planifier une procédure du catalogue sur un poste (refus PROG-01
  hors catalogue, PROG-02 méthode inapplicable au poste, PROG-03 poste hors périmètre) et rédiger
  son papier depuis le gabarit du pack (PROG-04) — version nouvelle qui PÉRIME la précédente sous
  le même code, moteur tracé (`engine_run`), événement avec le motif. Ce sont les briques de 1.4.
- **`/api/sante`** lit le monde enrichi : sections par état, papiers par statut, notes ouvertes
  et l'âge de la plus ancienne, lignes conclues.
- **Les écarts sont COMPTÉS, jamais fabriqués** : 13 dont 5 ouverts sur une base neuve ; sur la
  base publique déjà statuée, 0 ouvert — l'enrichissement le dit au lieu d'en inventer
  (docs/BACKLOG_REPORTE.md).

**Prouvé, et comment (chaîne locale de nuit, base neuve, build de production)** : `tsc` 0 ·
`npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue (1 556 chemins, 82 écrans) ·
`npm run gardes` 36 · `enrichir.test.ts` 5/5 · `demo:enrichir` 10/10 étapes · `accept:epreuve`
3/3 cas mauvais vus · `accept --ecrire` **16/16** · `accept` (sonde) **16/16** · témoin « aucune
écriture (11 tables identiques) » · `npm run screens` 85 routes, 0 échec · `npm run clics` 189
étapes, 0 échec (188 stations figées, 305 clics sur 41 gestes). Les trois tâches neuves lisent
l'écran, pas la base : E-01 « quatre états portés par des lignes de section · 6 détenteurs »,
E-02 « 7 papiers · statuts signed, in_review, draft, outdated · 1 visa périmé en en-tête »,
E-03 « 10 notes ouvertes, dont une sur une cellule ». Le parcours cliqué joue sur le monde de
BASE (il importe, tire, conclut lui-même) ; l'enrichissement est prouvé par E-01..E-03 et le test.

Le premier passage était ROUGE : E-02 ouvrait le premier poste du rail — devenu Clients (bilan
avant résultat) depuis que le monde en porte un — et y comptait 0 papier. Hypothèse tenue contre
la capture (règle 18) : c'était bien Clients à l'écran ; la tâche vise désormais le poste REVENUE,
seul poste du périmètre gelé (règle 14). Rejouée : 16/16 dans les deux modes.

**Ce que je n'ai PAS fait** : la revue hostile de 1.1 — le premier sous-agent est mort en limite
de débit avant d'écrire une ligne ; relancé, ses constats et leur sort (corrigé / constaté non
corrigé, A.1) suivent dans le commit suivant. Rien de 1.2 à 1.5 à cet instant.

## Nuit n°2 — 1.1 corrigé par la revue hostile, 1.2 la passe esthétique et le repli en base (2026-09-03)

**Ce qui est cliquable maintenant et ne l'était pas à minuit** (ADR-125, ADR-126) :

- **Cinquante-cinq sections de page se replient**, sur trente-quatre écrans, et **le repli est
  retenu EN BASE, par personne** (migration 0132 `ui_repli`) : la même personne retrouve ses
  rangements sur un autre poste de travail, et le SERVEUR les connaît au premier rendu — le rail
  rangé naît étroit, aucune section ne s'ouvre pour se refermer après l'hydratation. La clé est
  celle de la SECTION, pas de la page. **Un rangement que la base n'a pas retenu le dit** à côté
  du titre. Refus **REPLI-01** (garde G-22, contrainte `ui_repli_cle_valide`) : une clé libre
  serait un canal d'écriture arbitraire ouvert à tout compte connecté.
- **La passe esthétique** : jetons d'espace, d'élévation et de mouvement nommés une fois ;
  hiérarchie typographique à trois tailles ; chiffres tabulaires sur TOUTE cellule de tableau ;
  survol, focus visible au clavier seulement, sélection à l'encre d'accent ; mouvement de 160 ms
  qui ne porte que sur des changements d'état — jamais sur le contenu, jamais sur la touche qui
  conclut ; `prefers-reduced-motion` coupe tout d'un bloc. **La couleur ne bouge pas** : elle ne
  marque que les problèmes.
- **1.1 corrigé** — douze constats de la revue hostile n°7, onze corrigés, un tenu pour acquis
  et écrit (ADR-126). Le bloquant : une décision humaine de périmètre était **réécrite à chaque
  déploiement** ; elle ne l'est plus, et un test la SORT du périmètre au nom de l'associée puis
  rejoue l'enrichissement pour le prouver. Aussi : plus de geste humain fabriqué dans la chaîne
  hachée à chaque build ; l'IPE des cinq papiers déclarée VRAIE contre la source de la méthode ;
  l'antidatage d'une note DIT au journal ; un refus de service devenu une étape « NON » au lieu
  d'un build cassé ; une version dépassée n'est plus une section de travail ; le gabarit suit le
  sens du test et le repli est écrit ; l'empreinte distingue les versions ; **PROG-05** (rédiger
  exige d'être de l'équipe) et **PROG-06** (dépasser un visa exige un motif).

**Prouvé, et comment** (chaîne locale, base neuve, build de production, `scratchpad/chaine-n5.log`) :
`tsc` 0 · `npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue sur 1 625 chemins,
84 écrans · `npm run gardes` **37** dont G-22 éprouvée en deux passes · `npm test` **701 tests,
0 échec** (plancher 632) · `demo:enrichir` 10/10 étapes · `accept:epreuve` 3/3 · `accept --ecrire`
**16/16** · `accept` (sonde) **16/16** · témoin « aucune écriture (12 tables identiques) » ·
`npm run screens` 85 routes, 0 échec · `npm run clics` **189 étapes, 0 échec**, 188 stations
figées vérifiées, 305 clics sur 41 gestes.

**Le défaut que la nuit a coûté, et comment il a été trouvé.** Le squelette de chargement
(`loading.tsx`) a fait passer le parcours cliqué de 0 à **vingt stations rouges**, et
l'acceptation a lu « aucun refus » deux fois là où le produit refusait. Les stations rouges
CHANGEAIENT d'une exécution à l'autre — de quoi appeler cela de l'intermittence et passer à
autre chose. Bisection, une variable à la fois : squelette présent → 21 puis 20 échecs ;
squelette retiré, tout le reste identique → **1 échec** (le #418 connu, sur `/testing`), puis
**0** au tour suivant. Une frontière de suspension change le MOMENT où le contenu existe : le
harnais lisait l'écran pendant que le squelette était à l'affiche. Le squelette est reporté
(N2-4) : il ne revient qu'avec un harnais qui attend le CONTENU.

**Ce que je n'ai PAS fait** : les onglets d'ancrage sur les 34 écrans neufs (N2-1 — une barre
construite côté client rendrait un `<nav>` vide au premier rendu, la forme même du #418) ; le
squelette (N2-4) ; les tranches 1.3, 1.4, 1.5 et tout l'étage 2.
