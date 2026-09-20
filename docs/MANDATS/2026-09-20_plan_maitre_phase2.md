# OTTO — Plan maître d'implémentation de la phase 2 (pour Claude Code)

> **Statut.** Établi le 20 septembre 2026 par le superviseur, sur le SHA servi `5336095`, à partir de l'audit technique (`docs/AUDIT.md`, 25 constats, 147 preuves relues mécaniquement) et du mandat du fondateur (`docs/MANDATS/2026-09-20_mandat_revue_fondateur_phase2.md`, 22 remarques R-F1..R-F22, 6 observations S-1..S-6, principes §0). **Il ne remplace pas le mandat : il l'exécute.** En cas de conflit entre ce plan et le mandat, le mandat prime ; en cas de conflit entre ce plan et `CLAUDE.md` (règles permanentes, interdits), `CLAUDE.md` prime. Ce plan est le document de référence de toute la phase 2 : Claude Code l'exécute intégralement, dans l'ordre, sans en re-dériver l'architecture.
>
> **Comment lire.** Les §1–§11 fixent l'état cible (produit, architecture, UX, modèle, automatisation, IA, provenance, sécurité) : ce sont des **décisions prises**, pas des options. Les §12–§14 disent dans quel ordre construire et pourquoi cet ordre. Les §15–§18 disent comment prouver que c'est fait. Le §19 dit à Claude Code ce qu'il ne doit surtout pas faire. Le §20 liste les seuls gestes qui exigent une main humaine. Les identifiants `AUD-nn` renvoient à `docs/AUDIT.md`, `R-Fnn`/`S-n`/`§0.x` au mandat, `Rnn` à `docs/BACKLOG_REPORTE.md`, `G-nn` à `docs/GUARDS.md`.
>
> **Vocabulaire fixé pour toute la phase 2** (à employer tel quel dans le code, les tests, les commits et les documents) :
> - **Mission** (`engagement`) — le dossier d'audit d'une entité pour un exercice.
> - **Poste** (`fsli`) — une ligne des états financiers ; l'unité de travail de l'auditeur et l'unité de navigation.
> - **Section** (`section_state`) — une unité d'écran à clé stable (`kind`, `ref`) qui porte ses notes de revue, son porteur et son état ; un poste a des **sous-sections** (Leadsheet, Interviews, Process, Controls, Changes since N-1, Sampling, Testing, Papers, Requests, Exceptions).
> - **Proposition** (`proposition`) — toute valeur proposée par un moteur déterministe, une règle ou l'IA, en attente d'une décision humaine ; rendue par UN composant (surlignage jaune + note de revue + provenance au survol) ; acceptée d'un clic ou modifiée en place ; comptée par NOTIF-01.
> - **Note de revue** (`review_note`) — un commentaire ancré à un élément précis d'une section, adressé à une personne ou à l'agent (OTTO) ; le seul canal pour demander quelque chose à l'agent (§0.3).
> - **Marqueur** — le signe discret, à l'endroit annoté ou proposé, qui ouvre la note ou la proposition ; le survol révèle la provenance.
> - **Visa** (`signoff`) — signature d'un papier par un rôle, liée à une empreinte de contenu ; **STALE** = dérivé, jamais stocké.
> - **Obstacle** — ce qui empêche un visa ou un scellé ; n'est plus une section : c'est le message que rend le bouton qui refuse, et un compte dans l'en-tête.
> - **Refus** (`Refus`) — une exception métier nommée (code + clé de catalogue + variables), distincte d'une panne.
> - **Rituel** — le cycle de livraison d'une ligne d'inventaire : tranche → `verify` complet sur l'arbre figé → réfutateurs (1, ou 2 si modèle/sécurité/refus) → push → SHA servi confirmé (règles 34, 35, 36).

---

## 0. Mode d'emploi pour Claude Code

1. **Lire dans cet ordre** : `CLAUDE.md` en entier ; ce plan en entier ; `docs/MANDATS/2026-09-20_mandat_revue_fondateur_phase2.md` ; `docs/AUDIT.md` ; puis `docs/REPRISE.md` (après `npm run reprise`), `docs/CHASSE.md`, les 200 premières lignes de `STATUS.md`, `docs/DECISIONS.md` (ADR cités ici), `docs/BACKLOG_REPORTE.md` (R-nn cités ici).
2. **Construire d'abord l'inventaire** `docs/REVUE.md` (tâche P0-00) : une ligne par R-F, S-n, AUD P0/P1, avec l'état OBSERVÉE / NON OBSERVÉE / SANS OBJET. Les AUD P2 et les P3 de l'audit vont au registre (`docs/BACKLOG_REPORTE.md`), pas à l'inventaire. Rien n'entre dans une tranche qui n'est pas une ligne de `docs/REVUE.md` ou une tâche de ce plan.
3. **Exécuter les phases dans l'ordre** (§12). Une phase n'est ouverte que lorsque la précédente a atteint son **critère de sortie** (mesuré, pas déclaré). À l'intérieur d'une phase, l'ordre des tâches est celui du plan ; une tâche marquée « indépendante » peut être déplacée à l'intérieur de sa phase, jamais d'une phase à l'autre.
4. **Un rituel par groupe d'écran** (§16) : les lignes R-F qui touchent le même écran (par exemple R-F11/12/13/14/16/17 sur le poste) sont livrées dans UN rituel, avec une station de clics par ligne. Ceci précise le §5.3 du mandat (« un rituel par ligne, jamais par micro-tranche ») dans son esprit : ne jamais payer le rituel deux fois pour un même écran.
5. **Toute tranche qui change un écran prouve que la garde derrière lui refuse encore** (§17) — c'est la règle absolue de cette phase (mandat §3 et §5.3). Une simplification d'écran au prix d'une garde est une régression ; le réfutateur cherche exactement cela.
6. **Ce plan a déjà tranché.** Quand une décision technique semble ouverte, chercher d'abord ici (§19 « ambiguïtés levées »). Ne renvoyer au fondateur que ce que le §20 nomme.

---

## 1. Objectif exécutif (Executive objective)

Transformer OTTO — aujourd'hui un prototype complet du cycle du chiffre d'affaires, prouvé au clic mais construit par empilement de mandats — en **une plateforme de documentation et d'automatisation d'audit qu'un grand cabinet prendrait au sérieux** : minimaliste, lisible, ergonomique (principe §0 du mandat), organisée autour du **poste** comme unité de travail, où **toute proposition de machine se présente d'une seule façon** (surlignage jaune + note de revue + provenance au survol) et **toute décision humaine laisse une trace complète** (qui, quoi, quand, à partir de quoi), sur un modèle de données qui porte enfin les liens réels du métier (poste ↔ processus ↔ contrôles ↔ risques ↔ procédures ↔ tirage ↔ pièces ↔ papiers ↔ visas), avec une couche de sécurité et de scellé qu'un inspecteur peut tester, et une chaîne de preuve (`verify`, `clics`, `visuel`) redevenue verte, ciblable et honnête.

Ce qui ne change pas : le plafond **L2** (le modèle propose, un humain valide, rien n'entre au dossier sans validation tracée) ; la provenance de chaque valeur (qui quitte l'écran mais jamais la donnée, §0.1) ; les gardes existantes (26 prouvées) ; les interdits permanents (`CLAUDE.md` §2) ; le régime d'exécution de la clôture (§5 du mandat).

**Définition de « fini »** : `docs/REVUE.md` ne porte plus aucune ligne NON OBSERVÉE ; `npm run verify` rend EXIT=0 sur le HEAD et le SHA servi est confirmé ; les gardes EPURE-01, `langue` (étendue aux refus et aux libellés semés) et « écriture nue » lisent 0 ; le fondateur a rendu ses trois verdicts visuels (§20) ; l'agent écrit la phrase « l'inventaire est vide » et s'arrête.

---

## 2. État des lieux (Current-state assessment)

Le détail, avec preuves, est dans `docs/AUDIT.md` (25 constats) ; ceci en est la synthèse orientée vers la construction.

**Ce qui est solide et se conserve.** Un noyau agnostique du référentiel avec la méthode du cabinet en données (`methodology/*.json`, 546 lignes publiées) ; 123 tables cohérentes par domaine, migrations idempotentes empreintées, RLS activée et forcée partout, rôle applicatif préparé (0140/0141) ; 26 gardes prouvées en deux passes, 19 familles d'obstacles au visa, des codes de refus nommés (CTRL-01..07, MAT-01..03, NOTIF-01, EXTRAP-01..04, AUTO-01/02, POP-01, TEST-01..04, ANA-01..04, IA-BUDGET-01) ; un journal d'événements chaîné par mission ; des moteurs déterministes rejouables (rapprochement, tirage germé, vouching, pointage, projection ISA 530, évaluation) ; un harnais de 70 stations cliquées, 356 vues visuelles, 1 246 tests ; une culture écrite (règles 1–37) qui rend chaque affirmation mesurable.

**Ce qui est cassé au sens du § 4 du mandat (ce que le fondateur ne peut pas voir).**
- *Modèle* : aucune table de proposition (AUD-01), aucune notion de section sur les notes (AUD-02), deux familles de processus et aucun lien contrôle → poste (AUD-03), un visa sans empreinte (AUD-09), des propositions écrasées et des décisions détruites par les recalculs (AUD-10), trois vocabulaires de risque et un tirage déconnecté du risque (AUD-11), 195 FK sans index et une doc 04 décalée (AUD-23).
- *Sécurité / scellé* : étanchéité par objet fils (AUD-04), signature auto-attribuée (AUD-05), session en clair et remise à zéro anonyme (AUD-07), scellé à un tiers (AUD-08), magasin de pièces empoisonnable (AUD-25).
- *Piste* : 24 écritures sans événement, verbes libres, chaîne non ancrée, deux horloges (AUD-12).
- *Factice* : relances fabriquées au rendu (AUD-13), niveau de risque déduit d'un drapeau, taille « commandée » ignorée (AUD-11), rejeu inobservable et monde hébergé vide (AUD-06).
- *Cohérence* : 335 refus hors catalogue et données monolingues (AUD-14), trois tableaux de bord (AUD-19), duplications de saisie (AUD-20), états et titres divergents (AUD-21), S-1 généralisé (AUD-22).
- *Chaîne de preuve* : `verify` n'est plus vert d'un tenant (AUD-16), parcours monolithique et assertions vides (AUD-17), aperçus qui écrivent sur la base publique et CI sans parcours (AUD-18), instantanés et registres périmés (AUD-24).

**Ce que le fondateur a vu (§1, §2) et ce que l'audit en dit.** Les 22 remarques sont toutes recevables. Six d'entre elles dépendent d'un changement de modèle avant tout écran : R-F7 (AUD-02), R-F13/R-F14/R-F16/R-F17 (AUD-03), R-F18 (AUD-11) ; trois sont pour partie des manques de SEMIS sur l'URL, pas de produit : R-F14, R-F16, R-F17 (AUD-06) ; R-F19 et §0.1–0.2 exigent AUD-01 ; R-F8 et S-2 exigent AUD-09. Les six observations du superviseur (S-1..S-6) sont **toutes confirmées par lecture du code** (AUD-22, AUD-09, AUD-14, AUD-14/S-4 = donnée semée `part1.ts:116`, AUD-21, R-F15) : aucune n'est SANS OBJET.

**Mesures de départ (SHA 5336095)** : 75 914 lignes TS/TSX dans `app/src`, 5 149 lignes SQL (72 migrations, dernière 0169), 44 routes sous `/eng/[id]`, 380 fonctions de service exportées dont 168 écrivent, 15 écrivent sans événement ET sans garde, 335 `throw new Error` dans les services, 4 610 lignes dans `scenario.ts` (70 stations, 402 assertions, 326 étapes), `verify` > 90 minutes, 4 `#418` par run.

---

## 3. Problèmes critiques (Critical problems)

Les huit P0 de l'audit et les six P1 qui structurent la phase 2, avec la décision de traitement (**conserver / améliorer / supprimer / reconstruire**).

| # | Problème | Décision | Où |
|---|---|---|---|
| AUD-01 | Pas de modèle de proposition | **Reconstruire** : table `proposition` + service + un composant ; les colonnes de statut existantes deviennent dérivées | Phase 1 (modèle), Phase 3 (composant) |
| AUD-02 | Notes sans section, ancres figées, notes flottantes | **Améliorer** (additif) : `section_id`, natures d'ancre étendues, une seule pose, résolveur unique | Phase 1, Phase 3 |
| AUD-03 | Pas de contrôle interne « d'un poste » (processus/contrôles/transcripts) | **Reconstruire** le modèle : `process_model` canonique, `control.process_model_id`, `control_fsli`, N processus par poste ; **conserver** les deux tables de transcript, unifier leur sortie en propositions | Phase 1, Phase 4 |
| AUD-04 | Étanchéité par objet fils | **Améliorer** : gardes dans les services, `activeMembership` unique, instrument par écriture | Phase 2 |
| AUD-05 | Signature auto-attribuée | **Améliorer** : règles de rôle et séparation des personnes dans le service ET en base | Phase 1 (SQL), Phase 2 (service) |
| AUD-06 | Monde hébergé vide, rejeu inobservable | **Améliorer** : enrichissement additif bloquant, fixtures dans `dataset/`, écrans qui lisent la fabrique | Phase 5 |
| AUD-07 | Session en clair, surface publique non bornée | **Reconstruire** la couche session (cookie signé, jetons hachés/expirants, mode démo explicite) ; borner `/api/sante`, `/api/erreur` | Phase 2 |
| AUD-08 | Scellé partiel, amendement sans flux | **Améliorer** : garde générique par table fille + `amenderApresVerrou()` unique | Phase 1 (SQL), Phase 2 (service) |
| AUD-09 | Visa sans empreinte, STALE jamais recalculé | **Améliorer** : `sections_hash`, unicité par déclencheur, STALE dérivé, carte par papier | Phase 1, Phase 3 |
| AUD-10 | Propositions écrasées, décisions détruites | **Améliorer** : supersede partout, append-only sur `extraction`, `fsli` stable | Phase 1 |
| AUD-11 | Risque : trois échelles, NRPMM, taille ignorée | **Reconstruire** l'écran /risk (R-F18) sur un modèle corrigé ; relier risque → tirage | Phase 1, Phase 4 |
| AUD-13 | Relances factices | **Supprimer** l'automatisme de rendu ; geste explicite « Relancer » simulé et dit tel | Phase 5 |
| AUD-14 | Refus hors catalogue, données monolingues | **Reconstruire** la couche refus (`Refus` + registre) ; méthode et semis en anglais | Phase 1 (infra), Phase 5 (masse) |
| AUD-16/17 | Chaîne de preuve rouge, parcours monolithique | **Améliorer** le harnais avant tout code produit | Phase 0 |

Trois écrans sont **supprimés** (leur contenu migre) : `/dashboard` et `/suivi` (dans la vue d'ensemble), `/provenance` (bloc du papier). Trois routes **disparaissent** au profit du poste : `/analytique`, `/processus`, `/sampling` + `/population` + `/testing` + `/loop` (sous-sections du poste). Deux routes deviennent des **modes** d'un écran : `/kanban` (mode de /exceptions), `/notifications` (bloc « À valider » de la vue). La section `/obstacles` **disparaît** (R-F5). Le bouton d'import JSON de processus **quitte l'interface** (R-F15). Les boutons « Save the analytical review », « Propose wording… », « Ask the file », « Open process », « Arbitrate » et toutes les colonnes Computed / Retained / What produced it / Arbitrate **sont retirés** (§0.1, R-F10, R-F12, R-F19).

---

## 4. État cible du produit (Target product state)

**Une mission se lit comme un dossier d'audit, pas comme une liste d'écrans.** Le rail à gauche suit l'ordre du dossier : *Dossier* (vue d'ensemble, acceptation, équipe, réunions, reprise N-1) · *Comptes* (imports, rapprochement, balances auxiliaires, seuils, périmètre) · *Bilan* et *Compte de résultat* (les seuls postes retenus, R-F1 ; le poste courant déplié sur ses sous-sections) · *Transverse* (programme de travail, estimations, circularisations, écarts, notes, RCM de la mission) · *Demandes* (demandes, pièces) · *Fin* (pointage, achèvement, clôture). Aucune entrée « obstacles », « notifications », « analytique », « processus », « kanban », « dashboard », « suivi ».

**Un poste est l'unité de travail.** Ses sous-sections, une à la fois, choisies dans le rail (R-F11) : **Leadsheet** (comptes N/N-1, variations, références croisées ⇄ vers les papiers, revue analytique éditable en place et versionnée — R-F9, R-F10, R-F11) · **Interviews** (entretiens de processus avec transcript lisible, écarts proposés — R-F14) · **Process** (N processus, chacun sa sous-section : diagramme engendré, flowchart client déposé, différences proposées en jaune avec leur note, légende des pictogrammes — R-F13, R-F16) · **Controls** (la mini-RCM du poste, chaque contrôle cliquable vers sa documentation D&I / OE — R-F17) · **Changes since N-1** (R-F14) · **Sampling** (Methodology → Population → Reconciliation → Draw, avec la taille commandée par le risque — R-F20, R-F21) · **Testing** (l'atelier, la boucle de clarification, l'évaluation) · **Papers** (papiers et visas par papier) · **Requests** · **Exceptions**. Le contenu s'affiche en place : aucun bouton « Open … » qui renvoie ailleurs (R-F12).

**Toute proposition a la même forme.** Un moteur ou l'IA propose → la valeur apparaît **dans son champ, surlignée en jaune, avec un marqueur** ; le survol dit qui/quoi/quand ; la note de revue jointe explique pourquoi ; l'auditeur **accepte d'un clic** ou **modifie la valeur** (elle devient la sienne) — les deux tracés ; NOTIF-01 compte ce qui reste (§0.2). Cela vaut pour un seuil, une rédaction analytique, un champ extrait d'une pièce, un niveau de risque, une déficience, un écart d'entretien ou de walkthrough, une étape de processus, une cellule ajoutée, une reprise N-1, un facteur de risque, un pointage.

**Toute question à l'agent passe par une note.** Une note de revue s'adresse à une personne ou à OTTO (§0.3) ; la réponse de l'agent revient sous la forme d'une proposition. Un **Assistant** en haut à droite ouvre une conversation sur le dossier (R-F2) ; sur l'hébergé il tourne sur l'adaptateur de rejeu et le dit en une ligne.

**Les notes se retrouvent.** Chaque section a son panneau de notes à droite (comme les commentaires d'un fichier Word, R-F7) ; chaque endroit annoté porte un marqueur ; note → défilement au marqueur, marqueur → note.

**La provenance quitte l'écran, jamais la donnée** (§0.1). Aucune colonne « Computed / Retained / What produced it / Arbitrate », aucun libellé d'échelle (L0…L3), aucune phrase de doctrine (§0.4, EPURE-01).

**Les visas sont des faits.** Une carte = rôle + initiales ; survol = nom et date ; STALE dérivé de l'empreinte (R-F8) ; un réviseur ne peut pas être « signed » sur un contenu modifié après lui ; une personne ne se vise pas deux fois ; un staff ne s'attribue pas le droit de signer.

**Le scellé scelle.** Après clôture, aucune table du dossier n'accepte d'écriture hors du flux d'amendement justifié, qui écrit son événement.

**La sécurité est celle d'un produit.** Session signée ; jetons de portail hachés et expirants ; mode démonstration explicite ; sonde de santé bornée ; étanchéité par écriture, pas par écran.

**Le monde hébergé montre tout.** Chaque capacité visible en local l'est sur l'URL (walkthrough analysé, entretien avec transcript et écarts, flowchart comparé), en anglais de bout en bout (R-F22), avec une palette neutre professionnelle à un seul accent (R-F6).

**La chaîne de preuve est verte et ciblable.** `verify` rend EXIT=0 ; une station se rejoue seule ; EPURE-01, `langue` et « écriture nue » lisent 0 ; la CI conduit le parcours chaque nuit.

---

## 5. Architecture cible (Target architecture)

**Ce qui ne bouge pas.** Next.js 15 App Router + TypeScript strict ; Postgres (Supabase en production, PGlite en local) ; `app/src/lib/db/client.ts` unique couture (`q/q1/q01/tx`, `withTenant`, sonde) ; `app/src/app/refus.ts::executer()` unique entrée des actions serveur ; services dans `app/src/lib/services` (le métier), gardes SQL dans `supabase/migrations` (bande 0130+, prochaines : 0170 et suivantes), méthode du cabinet en données (`methodology/*.json`), harnais dans `app/scripts`. Pas de nouvelle dépendance de production (aucune librairie de composants, aucun ORM, aucun service externe).

**Ce qui est ajouté — cinq briques transverses, chacune UNE fois.**

1. **`proposition`** (table + `lib/services/propositions.ts`) — la colonne vertébrale du §0.2. Tout moteur (règle de pack, `engine_run`) et tout adaptateur IA (`ai_run`) y écrit ; `accepter`/`modifier`/`refuser` appliquent la décision à l'objet porteur via un **registre d'applicateurs** (`lib/services/propositions/applicateurs.ts`, une fonction par `object_type`) ; NOTIF-01, l'obstacle `iaNonValide`, le bloc « À valider » et le composant `<Proposition>` lisent cette seule table.
2. **Sections** (`section_state` étendue + `lib/services/sections.ts::cleDeSection()`) — toute page de mission déclare sa section (`kind`, `ref`) ; les notes, les propositions et l'état de porteur s'y rattachent ; le panneau de notes est un composant du layout de section.
3. **Refus** (`lib/core/refus.ts` : classe `Refus`, registre des codes, `refus(code, cle, vars)`) — `executer()` distingue un `Refus` (bandeau, traduit) d'une panne (`server_error` + message générique + référence) ; `npm run langue` couvre les refus.
4. **Registre des verbes d'événement** (`lib/core/verbes.ts`) + test « écriture nue » (`lib/core/ecriture-nue.test.ts`) — une écriture de service sans `logEvent` fait rougir la suite ; la liste des exceptions est figée et ne peut que baisser.
5. **`lib/epure.ts`** — les motifs interdits à l'écran (EPURE-01) et le test « gabarit non résolu » (S-1), appliqués par `visuel` sur les 356 vues.

**Composants d'interface partagés** (`app/src/app/composants/`) : `<Proposition>`, `<Provenance>`, `<Marqueur>`, `<PanneauNotes>`, `<CarteVisa>`, `<XRef>`, `<Assistant>`, `<Envoyer>` (R-F3), `<Depot>` (S-3 : champ de dépôt stylé), `<Repli>` (existant, mémorisé par personne). Chacun est un composant unique, testé, sans logique métier (la logique est dans les services).

**Routes** : le poste porte ses sous-sections en segments (`/eng/[id]/poste/[code]/<sous-section>`), ce qui donne à chaque sous-section une URL stable, une clé de section, un panneau de notes et une station de clics propres. Les anciennes routes deviennent des redirections (fichier unique `app/src/app/redirections.ts`, retiré en Phase 7).

**Flux d'une proposition (référence)** : moteur/IA → `proposer()` (écrit `proposition` + `review_note` d'explication + `event_log proposition.creee`) → écran : `<Proposition>` (jaune, marqueur, survol) → auditeur : clic (« accepter ») ou saisie (« modifier ») → action serveur via `executer()` → `accepter()/modifier()` : applicateur écrit l'objet porteur (version nouvelle, jamais d'écrasement, AUD-10), `proposition.status`, `decided_by/at`, `event_log proposition.acceptee|modifiee` → NOTIF-01 décrémente dans le même geste.

**Flux d'une note à l'agent (référence)** : note adressée à OTTO → `notes/otto.ts` comprend (règles à mots-clés, puis adaptateur IA en local) → l'agent exécute une **capacité** (relancer l'extraction, rejouer le vouching, proposer une rédaction, comparer un transcript ou un flowchart) → sa réponse est une `proposition` (ou une `review_note_reply` textuelle quand il n'y a rien à proposer) → même composant.

---

## 6. UX et workflows cibles (Target UX / workflows)

### 6.1 Le rail (R-F1, R-F11)
- **Bilan / Compte de résultat** : seulement les postes `in_scope` ou `in_scope_qualitative`, plus les postes hors périmètre qui portent du travail (R38). Les postes hors périmètre ne figurent PLUS dans le rail (amendement d'ADR-103 pour les postes : la section *Scoping* est le seul endroit où ils apparaissent, avec leur motif — R-F1). Le bouton « tout afficher » du rail ne concerne plus les postes.
- **Poste déplié** : le poste courant montre ses sous-sections indentées ; un clic ouvre la sous-section (une route). Les autres postes sont repliés. L'état de repli suit `ui_repli` (déjà en place).
- **Sous-sections offertes** : Leadsheet et Papers toujours ; Sampling et Testing si le programme du poste comporte une procédure sondée ou testée (la logique existante des patrons de `poste.ts` — `blocEchantillon`/`blocTesting` — décide ; `href: null` ⇒ sous-section absente du rail et une ligne dans l'en-tête de la leadsheet : « Sampling — not applicable to this line item (nature : reconciliation only) », règle 61) ; Interviews, Process, Controls, Changes si le poste est lié à au moins un `process_model` ou un contrôle (`control_fsli`) ou si la méthode déclare un cycle pour ce poste ; sinon absentes, avec dans l'en-tête de la leadsheet « Internal control — no process documented · Add a process ». Requests et Exceptions si le poste en porte.
- **Transverse** : Programme, Estimations, Circularisations, Écarts (avec un mode « kanban »), Notes, **RCM** (la matrice de la mission entière — nécessaire au dossier SOX, qui est contrôle-centrique ; dans un poste, Controls est cette matrice filtrée).
- **Entrées retirées** : Obstacles (R-F5), Notifications (bloc « À valider » de la vue), Analytique (dans la leadsheet), Processus (dans le poste), Kanban (mode), Suivi et Dashboard (vue d'ensemble).

### 6.2 La vue d'ensemble `/eng/[id]` (R-F4, S-5, AUD-19)
- **En-tête de mission** : nom, exercice, état, et trois comptes discrets : *obstacles au visa* (n), *à valider* (propositions en attente, n), *notes ouvertes* (n). Chaque compte mène au bloc correspondant.
- **Mon travail** : quatre blocs **empilés verticalement, repliables, mémorisés par personne** (`ui_repli` clés `vue.avecmoi`, `vue.attribuees`, `vue.suivies`, `vue.visitees`) : *Currently with me*, *Assigned to me*, *Tracked by me*, *Recently visited*. **Une section n'apparaît qu'une fois**, dans le bloc le plus spécifique (avec moi > attribuée > suivie > visitée) ; un test rend le rendu et vérifie l'absence d'identifiant dupliqué (R-F4).
- **À valider** : les propositions en attente que MON rôle peut décider (l'ancien /notifications), l'âge en tête, un clic mène au champ surligné.
- **Blocs absorbés** de /suivi (sections par état, demandes en attente, déviations) et de /dashboard (demandes, papiers, déficiences, runs IA) — sans effet de bord au rendu (`assurerSections` devient une écriture explicite à la création de mission et à la confirmation du périmètre ; `ensureReminders` disparaît, AUD-13).
- **Geste « Envoyer à »** (R-F3) : UN contrôle « Send » sur une section, qui ouvre une liste de personnes et confirme ; le fondateur rend son verdict sur capture.

### 6.3 Le poste `/eng/[id]/poste/[code]/…`
- **En-tête commun** : nom du poste, solde N / N-1, un agrégat de visas (« 3 papers · 2 signed · 1 stale »), le compte d'obstacles du poste, le bouton *Send*. Pas de cartes de visa par rôle dans l'en-tête (S-2 : elles agrégeaient des papiers différents).
- **Leadsheet** : le tableau des comptes (N, N-1, variation ⇄), les références croisées comme icône ⇄ (survol = cible nommée, clic = navigation, R-F9), la **revue analytique** en zone de texte éditable en place (sauvegarde implicite au blur, versionnée `v1 · written by …` conservé, ANA-01/ANA-03 inchangées), aucun bouton (R-F10) ; une proposition d'OTTO (via note adressée) apparaît surlignée dans la zone. Lien discret vers le grand livre.
- **Interviews** (R-F14) : liste des entretiens du poste (date, sujet, participants, support), *Add interview* (date, sujet, participants, dépôt du transcript via `<Depot>`), le **transcript lisible** dans la sous-section (texte, pas un identifiant), *Analyse* (rejeu sur l'hébergé, IA en local) → écarts candidats rendus comme propositions (accepter → tâche/facteur/question ; refuser avec motif). Un seul vocabulaire de décision pour les écarts d'entretien ET de walkthrough : `accepter` (→ tâche de contrôle, facteur de risque ou question client selon la nature), `refuser` (motif).
- **Process** (R-F13, R-F16) : liste des processus du poste (N), *Add process* ; chaque processus : diagramme engendré (SVG existant), **légende** des pictogrammes (contrôle, flux, système/ERP, acteur, entrée/sortie), *Upload / re-upload the client flowchart* (pièce du dossier, image ou PDF), *Compare with the meeting* → l'agent compare transcript(s) et flowchart déposé avec le diagramme : chaque différence est une **proposition sur une étape** (ajout, modification, suppression proposée) surlignée en jaune avec sa note (« During the meeting the client mentioned SAGE whereas the flowchart shows Oracle ») ; accepter fait entrer la différence au diagramme (nouvelle version du processus), refuser la retire — tracés. Versions du processus conservées (supersede).
- **Controls** (R-F17) : la mini-RCM : code, nom, fréquence, nature, D&I (statut), OE (statut) ; clic → `/eng/[id]/rcm/[cid]` (documentation D&I : tâches, procédures, IUC, quatre facteurs ; OE : population, tirage, tests) ; *Link a control* (ajouter un contrôle existant du dossier au poste, ou en créer un).
- **Changes since N-1** (R-F14) : les changements de processus à statuer (l'ancien « N / N-1 Difference »).
- **Sampling** (R-F20, R-F21) : quatre étapes en place — *Methodology* (méthode : random / monetary units ; taille : venant du risque par assertion, ou « unverified parameter — to be set by the firm » ; chaque paramètre avec sa source), *Population*, *Reconciliation* (solde leadsheet ⇄, total du détail client obtenu, écart, état rapproché / non rapproché ; `POP-01` refuse le tirage tant que l'écart n'est ni nul ni expliqué), *Draw* (les lignes tirées, les sorties statuées). Le titre est « Sampling ». Aucun « Drawn », « L0 », « L3 », « deterministic ».
- **Testing** : l'atelier existant (grille, ancres, dispositions, conclusions), la boucle de clarification (ex-/loop) et l'évaluation (connu / projeté / total) — logique inchangée, écran déplacé.
- **Papers** : liste des papiers du poste ; par papier, les cartes de visa (rôle + initiales, survol = nom + date, marqueur STALE). Sur le papier lui-même : les notes dans le panneau de la section « papier », les visas titrés « Sign-offs », les notes « Review notes » (AUD-21).
- **Requests / Exceptions** : les listes filtrées du poste, mêmes écrans que la mission.

### 6.4 L'évaluation des risques `/eng/[id]/risk` (R-F18, AUD-11)
- **1. Entity questions — asked once** : une zone de texte par question (sauvegarde implicite), pas de « to answer », « save », ni « detail — required if yes » ; un bouton *Ask the client* par question (crée un `request_item` de type explication sur la demande permanente « Risk assessment questions ») ; *Declare as risk factor* par réponse (geste explicite) — un facteur ne naît plus « confirmé » d'un oui. OTTO peut proposer un facteur (proposition) à partir d'une réponse : jaune, note, accepter/refuser.
- **2. Risk by assertion** (par poste retenu) : deux colonnes — assertion ; niveau parmi `NRPMM` / `Lower` / `Higher` / `Significant` (échelle du pack de démonstration, contenu de `methodology/risque.json`) ; quand `NRPMM` est choisi, un champ *Justification* apparaît et `RISK-01` refuse de sauvegarder sans texte ; la provenance (niveau calculé par la méthode, facteurs retenus) au survol ; le niveau calculé s'affiche comme proposition jaune tant qu'il n'est pas retenu. Aucune colonne Computed / Retained / What produced it / Arbitrate.

### 6.5 Les notes de revue partout (R-F7, §0.3)
- Un **panneau à droite** dans chaque section (repliable, mémorisé) : la liste des notes de la section, ancrées (libellé de l'ancre, auteur, date, état, réponses) ; clic sur une note → défilement et surbrillance du marqueur ; clic sur un marqueur → la note s'ouvre dans le panneau.
- **Poser une note** : depuis n'importe quel élément annotable (cellule, ligne, paramètre, zone de texte, étape de diagramme, contrôle, réponse) par le marqueur « + » qui apparaît au survol ; jamais de note sans ancre. Le composeur : texte, destinataire (une personne de la mission ou **OTTO**), type (à corriger / question / information). Une note à OTTO crée une tâche IA ; la réponse revient en proposition ou en réponse textuelle dans le fil.
- **Vue transverse** `/eng/[id]/notes` : toutes les notes de la mission, chaque ligne mène à `href#ancre` (jamais à une liste).

### 6.6 Obstacles et visa (R-F5)
- Le bouton *Sign* (papier) et *Seal* (clôture) refusent en affichant **la liste nommée des obstacles** au moment du clic (bandeau de refus étendu : une liste, pas une phrase) ; l'en-tête de mission et du poste portent un compte discret ; aucune section « obstacles ».

### 6.7 L'assistant (R-F2)
- Un seul contrôle *Assistant* en haut à droite de tout écran de mission ; un panneau latéral de conversation (question → réponse, historique de la session) ; absorbe *Ask the file* ; sur l'hébergé : une ligne « Replay adapter — recorded answers ». Les capacités : celles de `query/` (planificateur) et de `notes/otto.ts` (relancer, rejouer, état, proposer une rédaction, comparer) ; toute sortie qui touche le dossier est une proposition.

### 6.8 Le portail client — inchangé en surface, corrigé en profondeur (AUD-04, AUD-07)
- Mêmes écrans ; les écritures sont rattachées à la demande ET à l'entité ; jetons hachés et expirants ; champ de dépôt stylé (S-3).

---

## 7. Modèle de données cible (Target data model)

Règles : migrations NOUVELLES et idempotentes dans la bande 0130+ (numéros 0170 à 0181 réservés : 0170–0179 ci-dessous, 0180 en P2-05, 0181 en P7-02), jamais d'édition d'une migration appliquée (règle 26) ; chaque migration porte ses politiques RLS (même patron que 0029/0034 : `for all using (tenant_id = otto_tenant())`, FORCE), sa garde de verrou, ses index, et un cas connu mauvais dans un test ; `docs/04_DATA_MODEL.md` est régénéré depuis la DDL (AUD-23). Les esquisses ci-dessous sont normatives pour les noms et les contraintes ; Claude Code écrit le SQL complet.

### 7.1 `0170_proposition.sql` — AUD-01
```sql
create table proposition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  engagement_id uuid not null references engagement(id) on delete restrict,
  section_id uuid references section_state(id) on delete restrict,
  object_type text not null,        -- catalogue TS (lib/services/propositions/types.ts) : 'materiality' | 'fsli_analytique' | 'extraction_field' | 'assertion_risk' | 'risk_factor' | 'deficiency' | 'walkthrough_gap' | 'transcript_gap' | 'process_step' | 'wp_extra_cell' | 'scoping' | 'carry_forward' | 'fs_tie' | 'redaction_papier'
  object_id text not null,          -- identifiant de l'objet porteur (uuid en texte, ou clé composite documentée par type)
  field text,                       -- champ visé ; null = l'objet entier
  valeur_proposee jsonb not null,
  valeur_retenue jsonb,
  source_kind text not null check (source_kind in ('ai_run','engine_run','regle')),
  ai_run_id uuid references ai_run(id),
  engine_run_id uuid references engine_run(id),
  niveau_automatisation text not null check (niveau_automatisation in ('L0','L1','L2')),
  note_id uuid references review_note(id),    -- la note de revue qui explique la proposition (posée par proposer())
  status text not null default 'proposee' check (status in ('proposee','acceptee','modifiee','refusee','perimee')),
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  constraint proposition_source_coherente check ((source_kind = 'ai_run') = (ai_run_id is not null)),
  constraint proposition_decision_coherente check ((status = 'proposee') = (decided_by is null)),
  constraint proposition_refus_motive check (status <> 'refusee' or btrim(coalesce(decision_reason,'')) <> '')
);
create index proposition_eng_status on proposition (engagement_id, status);
create index proposition_objet on proposition (object_type, object_id);
create unique index proposition_une_en_attente on proposition (object_type, object_id, coalesce(field,'')) where status = 'proposee';
-- déclencheur : valeur_proposee, source_*, niveau_automatisation, created_at sont IMMUABLES (forbid_mutation partiel) ; garde de verrou ; RLS ; verdict 'garde' dans engagement_lock_verdict.
```
Lecture `/api/sante` : « propositions : n en attente = n surlignages attendus ; 0 proposition sans note ; 0 acceptée sans decided_by ».

### 7.2 `0171_sections_et_notes.sql` — AUD-02
- `section_state.kind` : le CHECK devient la liste : `poste`, `papier`, `poste.leadsheet`, `poste.interviews`, `poste.processus`, `poste.controles`, `poste.changements`, `poste.sampling`, `poste.testing`, `poste.papiers`, `poste.demandes`, `poste.ecarts`, `mission.vue`, `mission.acceptation`, `mission.equipe`, `mission.reunions`, `mission.reprise`, `mission.imports`, `mission.rapprochement`, `mission.balances`, `mission.materialite`, `mission.scoping`, `mission.risque`, `mission.programme`, `mission.estimations`, `mission.circularisations`, `mission.ecarts`, `mission.notes`, `mission.rcm`, `mission.demandes`, `mission.pieces`, `mission.pointage`, `mission.achevement`, `mission.cloture`, `controle` (ref = control.id). `ref` = code du poste, id du papier, id du contrôle, ou `''` pour une section de mission.
- `review_note.section_id uuid references section_state(id)` ; **rempli à la pose** par `poserNote()` ; migration de données : pour chaque note existante, `section_id` dérivé une fois (papier → `papier`/id ; `compte` → `poste.leadsheet`/code ; `exception` → `mission.ecarts` ; `questionnaire_answer` → `mission.risque` ; `materiality_param` → `mission.materialite` ; `sample_item` → `poste.testing`/REVENUE).
- `anchor_kind` : CHECK étendu à `analytique`, `process_model`, `process_step`, `control`, `control_task`, `assertion_risk`, `transcript`, `proposition`, `fs_line`, `papier` ; les natures `ecran` et `deviation` retirées après migration (`deviation` → `exception`, `ecran` → `papier` de la route si possible, sinon `mission.vue`).
- Contrainte : `scope = 'audit' ⇒ anchor_kind is not null` ; les notes flottantes existantes sont ré-ancrées (`papier`, ref = workpaper_id, label = code du papier) — jamais supprimées.
- `review_note_reply.proposition_id uuid references proposition(id)`.
- Index : `review_note (section_id, status)`, `review_note (engagement_id, status)`.

### 7.3 `0172_processus_et_controles.sql` — AUD-03
- `process_model` : `+ code text` (stable, ex. `O2C-1`), `+ fsli_code text`, `+ status text not null default 'active' check (status in ('active','superseded'))`, `+ supersedes_id uuid references process_model(id)`, `+ client_flowchart_evidence_id uuid references evidence(id)`, `+ origine text not null default 'humain' check (origine in ('humain','client','engendre'))` ; `drop constraint <unique (engagement_id, cycle_ref, exercice)>` ; `create unique index process_model_actif on process_model (engagement_id, code, exercice) where status = 'active'` ; migration de données : `code` = `cycle_ref || '-1'`, `fsli_code` depuis la table `FSLI_DU_CYCLE` (posée comme données de migration, puis la constante TS est supprimée).
- `process_step` : `+ proposition_id uuid references proposition(id)` (l'étape née d'une différence acceptée cite sa proposition) ; `+ systeme text` (ERP nommé), `+ pictogramme text check (pictogramme in ('etape','controle','systeme','acteur','entree','sortie','decision'))` — pour la légende.
- `control` : `+ process_model_id uuid references process_model(id)` ; migration de données : rattacher par égalité normalisée `process.name` ↔ `process_model.name` quand elle existe, sinon null (jamais inventé).
- `create table control_fsli (control_id uuid references control(id), fsli_code text not null, assertions text[] not null default '{}', created_by uuid references app_user(id), created_at timestamptz not null default now(), primary key (control_id, fsli_code))` ; migration de données : depuis `rcm_row` quand une colonne de poste existe dans le CSV importé (sinon vide — un contrôle sans poste s'affiche dans la RCM de mission et se lie par un geste).
- `risk` : `+ fsli_code text` ; `alter column level drop not null` ; migration : les `risk` créés par `rcm_import` passent `level = null` (le niveau « high/medium » déduit d'un drapeau est retiré : AUD-03).
- Cascades retirées (`process_step`, `process_ctrl`, `process_interview`, `interview_transcript`, `transcript_gap` → `on delete restrict`) — 04 §1 promet `restrict`.

### 7.4 `0173_visa.sql` — AUD-05, AUD-09
- `signoff` : `+ sections_hash text` (sha256 canonique de `workpaper.sections`, calculé par le service au moment du visa ; backfill = empreinte courante, avec `event_log signoff.hash_backfill`).
- Déclencheurs `before insert on signoff` (fonctions `security invoker`, enregistrées dans `gardes/registre.ts` : **VISA-01** unicité (workpaper_id, sign_role) ; **VISA-02** `user_id` distinct des visas déjà posés sur le même papier ; **VISA-03** rôle : `reviewer` ⇒ `engagement_member.eng_role in ('manager','partner')`, `partner` ⇒ `can_sign = true` — tous trois avec cas connu mauvais en deux passes).
- `engagement_member` : déclencheur **EQUIPE-01** : un `update` de `eng_role` ou `can_sign` exige `current_setting('otto.acteur_role', true) in ('manager','partner')` (posé par `withActeur()` dans la transaction du service) — la règle vit dans le service (`assignMember`) ET en base.

### 7.5 `0174_verrou_generique.sql` — AUD-08
- Fonction `assert_engagement_unlocked_via()` paramétrée par un chemin SQL vers `engagement_id` (`tg_argv[0]` = expression, ex. `(select engagement_id from sample where id = new.sample_id)`), posée sur : les 21 tables `garde_proposee` de 0042 (verdict → `garde`, `confirmed_by` = null, `confirmed_reason` = 'migration 0174 — mandat 2026-09-20') et sur les filles de contenu : `extraction`, `sample_item`, `match`, `attribute_result`, `deviation`, `control_test`, `control_instance`, `request_item`, `reminder`, `verification_check`, `signoff`, `workpaper_edit`, `wp_extra_cell`, `test_cell`, `cell_disposition`, `test_line_conclusion`, `reconciliation_item`, `fs_tie`, `process_step`, `process_ctrl`, `interview_transcript`, `transcript_gap`, `control_task`, `control_design_factor`, `control_iuc`, `control_oe_procedure`, `control_walkthrough_gap`, `proposition`, `review_note_reply`.
- Le drapeau `otto.post_lock_amendment` n'est plus posé que par `amenderApresVerrou()` (Phase 2) ; sa pose hors de ce chemin est un cas connu mauvais du test.

### 7.6 `0175_supersede.sql` — AUD-10
- `extraction` : `+ supersedes_extraction_id uuid references extraction(id)`, déclencheur append-only (`forbid_mutation`) — `verifyExtraction` insère une ligne `rung = 'human'` et ne met plus à jour.
- `materiality` : `+ supersedes_id uuid references materiality(id)` ; l'ajustement crée une version N+1 `validated` et supersède la proposée.
- `test_cell` : `+ engine_run_id` déjà présent ? sinon ajouter ; lecture « dernier run » ; `cell_disposition` : `+ couvre_encore boolean not null default true` (marquée, jamais supprimée).
- `fsli` : `rebuildFslis` passe en `insert … on conflict (engagement_id, code) do update set balance = excluded.balance, name = excluded.name` en CONSERVANT `scoping`, `scoping_basis`, `confirmed_by`, `confirmed_at` ; l'unicité `(engagement_id, code)` est vérifiée présente (0001) ; les dix colonnes `fsli_code text` gardent leur forme (une FK vers `fsli(engagement_id, code)` composite est possible mais différée : R-nn au registre).
- `process_model` : déjà couvert par 0172 (`status`, `supersedes_id`) ; `remplacerProcessus` ne supprime plus.

### 7.7 `0176_risque.sql` — AUD-11
- `fsli_assertion_risk` : `+ justification text` ; contrainte **RISK-01** : `check (lower(coalesce(retained_level, computed_level)) <> 'nrpmm' or btrim(coalesce(justification,'')) <> '')` ; `create table fsli_assertion_risk_decision (id, fsli_assertion_risk_id, retained_level, justification, decided_by, decided_at, supersedes_id)` append-only — chaque surcharge est une ligne, la table mère reflète la dernière.
- Échelle : `methodology/risque.json` porte `niveaux: ["nrpmm","lower","higher","significant"]` avec libellés `en`/`fr` et la règle de calcul (contenu, règle 9) ; le pack de démonstration l'adopte ; `risk.level` aligné (`check` retiré, valeurs de l'échelle du pack, nullable).
- `risk_question_answer` : `answer` devient texte libre (`+ answer_text text`), `detail` conservé en lecture ; `+ request_item_id uuid references request_item(id)` (la question posée au client).

### 7.8 `0177_index_et_fk.sql` — AUD-23
- FK : `extraction.ai_run_id → ai_run`, `wp_extra_column.ai_run_id → ai_run`, `materiality.proposed_by_ai_run → ai_run`.
- Index sur les 32 `engagement_id` sans index et sur `request_item(request_id)`, `signoff(workpaper_id)`, `review_note(workpaper_id)`, `exception(sample_item_id)`, `reconciliation_item(reconciliation_id)`, `sample(engagement_id)`, `procedure_instance(engagement_id)`, `event_log(engagement_id, id)`.
- Index partiels uniques (AUD-15) : `materiality (engagement_id) where status = 'validated'`, `tb_snapshot (engagement_id, period_kind) where status = 'active'`, `sample (procedure_id) where status = 'drawn'`, `workpaper (engagement_id, code) where status <> 'outdated'` — précédés d'une requête de dédoublonnage qui REFUSE la migration si des doublons existent (jamais de suppression silencieuse : le message nomme les lignes).
- `workpaper.row_version int not null default 1`.

### 7.9 `0178_session_et_jetons.sql` — AUD-07
- `client_contact` : `+ portal_token_hash text unique`, `+ expires_at timestamptz`, `+ rotated_at timestamptz` ; migration : `portal_token_hash = encode(sha256(portal_token::bytea),'hex')` — si `sha256()` n'est pas disponible sur PGlite, le backfill est fait par le script de migration TypeScript (`migrate.ts` sait exécuter un `.ts` après un `.sql` : ajouter cette capacité si absente) ; `portal_token` conservé jusqu'en Phase 7 puis retiré.
- `app_state` : `+ tenant_id uuid references tenant(id)` ; l'horloge de démonstration devient par locataire (R28) ; politique `app_state_tenant`.

### 7.10 `0179_evenements.sql` — AUD-12
- `event_log_anchor (id, tenant_id, engagement_id, head_hash text, seq bigint, anchored_at, anchored_by text)` : la tête de chaîne ancrée à chaque scellé et par `/api/sante` (lecture « chaîne intacte depuis le dernier ancrage »).
- Les verbes restent en TS (`lib/core/verbes.ts`), vérifiés par test ; pas de CHECK SQL (la liste bougerait à chaque tranche).

### 7.11 Ce qui n'est PAS changé
`event_log` (forme et chaîne), `ai_run`, `workpaper.sections` (jsonb), `test_grid/test_cell` (forme), `blob_store` (forme ; politique d'insertion resserrée en Phase 2), `firm_methodology`, les tables `control_*` (0148–0158) hormis les FK/verrou ci-dessus, `section_watch/visit/ui_repli`.

---

## 8. Stratégie d'automatisation (Automation strategy)

Pour chaque workflow : ce qui est **supprimé**, **simplifié**, **automatisé déterministe**, **automatisé par IA**, **sous contrôle humain**, **jugement professionnel**. La règle : déterministe quand une règle suffit (P4), IA seulement pour interpréter du non structuré, humain pour décider.

| Workflow | Supprimer | Simplifier | Déterministe | IA (proposition L2) | Humain (clic ou saisie) | Jugement |
|---|---|---|---|---|---|---|
| Acceptation & équipe | — | déclaration d'indépendance en trois gestes (existant) | jalons dérivés, rotation, obstacles | — | droits de signature (manager/partner seulement) | accepter la mission |
| Imports & rapprochement | bouton « rebuild from TB » séparé (déclenché par l'import) | un seul écran d'import | validation FEC, rapprochement TB↔GL, bascules de matérialité (MAT-01/02), demandes de détail au-dessus du CTT | classification des pièces (déjà) | confirmer la limitation de rapprochement | — |
| Seuils & périmètre | colonnes de provenance | proposition en jaune dans le champ | arithmétique des seuils, périmètre proposé | — | accepter/modifier le seuil, confirmer le périmètre | benchmark et % |
| Risque (R-F18) | « to answer / save / detail — required if yes », Computed/Retained/Arbitrate | zone de texte par question | niveau calculé par la méthode ; taille d'échantillon par niveau (relié au tirage) | facteur de risque proposé à partir d'une réponse (règles à mots-clés d'abord ; IA en local) | retenir le niveau, justifier NRPMM (RISK-01), déclarer un facteur, demander au client | le niveau retenu |
| Programme de travail | deuxième et troisième chemins de rédaction | un `redigerPapier` par procédure | procédures commandées par le risque | — | planifier/déplanifier | — |
| Processus & entretiens (R-F13/14/16) | import JSON dans l'interface | un processus = une sous-section | diagramme engendré depuis les étapes ; légende ; versions | comparer transcript(s) et flowchart client ↔ diagramme → différences proposées avec note | accepter/refuser chaque différence ; statuer les changements N-1 | ce qui est un vrai écart |
| Contrôles (R-F17) | renvoi vers la RCM | mini-RCM du poste | population dérivée, tirage d'attributs par table du cabinet, refus CTRL-01..07 | écarts de walkthrough proposés | lier un contrôle au poste, documenter D&I, conclure OE | conclusion D&I/OE |
| Sondage (R-F20/21) | « Drawn », libellés L0/L3 ; écran détail-compte séparé | quatre étapes en place | méthode/taille/graine, rapprochement étape 2, POP-01, re-tirage sans destruction (MAT-03) | — | valider la méthodologie (paramètres non vérifiés dits tels), expliquer un écart de rapprochement | la taille quand le cabinet n'a pas fixé le paramètre |
| Testing & boucle | route /loop séparée | dans le poste | vouching, ancres, cellules, conclusions de ligne (TEST-01..04), projection, évaluation | extraction sous les échelons structurés (existant) ; réponse à une note « relance l'extraction » | vérifier une extraction (nouvelle ligne human), disposer une cellule, résoudre un écart, écarter une anomalie (EXTRAP-03) | conclusion du poste |
| Demandes & portail | relances fabriquées au rendu | un vocabulaire de demande (paquet PBC unifié sur `demanderPieceLigne`) | échéances calculées en lecture ; jetons expirants | — | approuver l'envoi (L2), *Relancer* (simulé, dit tel) | — |
| Papiers & visas (R-F8) | paragraphe explicatif de la référence croisée ; note flottante | carte = rôle + initiales | STALE dérivé de l'empreinte ; VISA-01..03 | rédaction proposée (IPE, papier) via proposition | viser, éditer avec justification | conclure |
| Revue & notes (R-F7, §0.3) | « Propose wording… », « Save » | un composeur, un panneau par section | marqueurs, comptes, obstacles | l'agent répond à une note adressée par une proposition ou un texte | poser, adresser, clore (réviseur non auteur) | — |
| Clôture & archive | section obstacles | liste des obstacles au clic | scellé générique, chaîne ancrée, archive hors verrou | — | sceller (can_sign), amender après verrou avec motif | — |
| Notifications | route /notifications | bloc « À valider » | NOTIF-01 = `count(proposition proposee)` par rôle | — | décider | — |

**Automatisations factices retirées** (AUD-13, AUD-11, AUD-03) : relances au rendu ; niveau de risque déduit d'`is_key` ; taille « commandée » non reliée ; « rejeu » présenté sans résultat visible.

---

## 9. Stratégie IA (AI strategy)

- **Plafond L2, sans exception** : aucune sortie d'IA n'entre au dossier sans une décision humaine tracée ; `L3` n'existe que pour être refusé (AUTO-01). Toute sortie IA est une `proposition` avec `ai_run_id`, `niveau_automatisation` figé (AUTO-02), et une note explicative.
- **Où l'IA a une vraie valeur (et seulement là)** : (1) extraction de champs sous les échelons XML / couche texte (existant, `extraction/ladder.ts`) ; (2) comparaison de non structuré avec du structuré : transcript d'entretien ou de walkthrough ↔ tâches documentées (existant, `entretiens-analyste.ts`, `walkthrough-analyse.ts`), et **nouveau** : flowchart client déposé (image/PDF) + transcript ↔ diagramme engendré → différences (R-F16) ; (3) rédaction proposée (revue analytique depuis les chiffres — existant en règle déterministe `proposer()` ; l'IA vient ensuite, en local) ; (4) réponse à une note adressée (`notes/otto.ts` : règles à mots-clés, puis planificateur `query/` ; l'IA générative seulement en local, ADR-109).
- **Où l'IA n'a PAS sa place** : seuils, périmètre, tirage, rapprochements, pointage, projection, obstacles, relances, niveaux de risque (calcul par la méthode) — déterministe et rejouable.
- **Adaptateurs** : les quatre fabriques restent (OCR, transcript, walkthrough, query) ; les écrans lisent **la fabrique** (`adaptateurCourant().name`), jamais `process.env` (AUD-06) ; sur l'hébergé `demoPublique()` force le rejeu et chaque écran concerné le dit en une ligne discrète.
- **Rejeu qui montre** : chaque fixture de rejeu (`dataset/fixtures/*.json`) porte son **texte source dans `dataset/`** (transcripts, flowchart synthétique en PNG et en JSON de vérité) et son **résultat attendu à l'écran** (nombre de propositions, libellés) ; le monde hébergé est enrichi jusqu'à contenir un exemple analysé de chaque capacité (AUD-06). Un transcript inconnu rend un **message d'écran** (« this recording is not in the replay set — run the live analysis locally »), jamais un chemin de fichier.
- **Budget et gardes** : IA-BUDGET-01 (plafond en base), `gardeBudget`, `assertNiveauOuvert` inchangés ; les appels IA sortent des transactions (AUD-15) : une transaction par pièce, l'`ai_run` est écrit avant le `logEvent` de résultat, un échec au n-ième document ne rembourse pas les n-1.
- **Capacités de l'agent** (`notes/otto.ts::CAPACITES`) : `relancer_extraction`, `relancer_vouching`, `etat_completude` (existantes) + `proposer_redaction_analytique` (règle déterministe `proposer()` → proposition), `comparer_transcript` (→ propositions d'écart), `analyser_flowchart` (→ propositions d'étape), `proposer_facteur_risque` (règles à mots-clés sur une réponse de questionnaire). `RESSORT_HUMAIN` (conclure, estimer, juger, viser, clore, valider) reste refusé par principe.
- **Assistant** (R-F2) : le même moteur, dans un panneau ; l'historique n'est pas persisté en phase 2 (décision : pas de nouvelle table de conversation ; les questions/réponses qui touchent le dossier passent par des notes et des propositions, qui, elles, sont persistées).

---

## 10. Modèle preuve / provenance / piste (Audit / evidence / provenance model)

- **Trois questions, toujours répondables (P7)** : « pourquoi cette pièce existe-t-elle ? » (`evidence → request_item → sample_item | control_instance …`, inchangé) ; « qu'est-ce qui soutient cette conclusion ? » (`workpaper.section → faits → evidence/extraction (+ ai_run, + proposition acceptée par X le …)`) ; « d'où vient ce chiffre ? » (provenance au survol : `origine ∈ {humain, moteur, ia, n-1, import}`, qui, quand, run).
- **La proposition est l'objet de provenance des valeurs machine** : une valeur acceptée cite sa proposition (`decided_by/at`, `valeur_proposee` conservée, `valeur_retenue` si modifiée) ; une valeur humaine cite son auteur ; une valeur reprise de N-1 cite `rolled_from`.
- **Jamais d'écrasement d'une proposition ni d'une décision** (AUD-10) : extraction humaine = nouvelle ligne ; matérialité ajustée = nouvelle version ; dispositions marquées « ne couvre plus » ; processus supersédés ; périmètre conservé au ré-import.
- **Visa = contenu** (AUD-09) : `signoff.sections_hash` ; STALE dérivé (`sections_hash ≠ hash(sections)` ou `based_on_hash ≠ hash(faits amont)`), calculé par UNE fonction `etatDuVisa(workpaper)` dans `workpapers/lifecycle.ts`, utilisée par toutes les cartes et par les obstacles.
- **Piste complète** (AUD-12) : chaque écriture de service passe par `logEvent` avec un verbe du registre ; le test « écriture nue » énumère les exceptions (scripts, sonde) et rougit sur toute nouvelle ; deux horloges NOMMÉES par ADR : l'horloge **métier** (`now()`, décalée en démonstration) gouverne toute règle de délai (jalons, relances, retards, rétention) ; l'horloge **système** (`now()` SQL) gouverne `event_log`, `ai_run`, `created_at` ; `new Date()` est interdit dans `lib/services` (test).
- **Chaîne ancrée** : la tête de chaîne est ancrée (`event_log_anchor`) à chaque scellé et par la sonde ; `/api/sante` lit « chaîne intacte depuis l'ancrage » et rougit sur une rupture injectée en test (règle 17).
- **Scellé complet** (AUD-08) : garde générique + `amenderApresVerrou()` (motif obligatoire, événement `post_lock_amendment` avec auteur/date/motif, drapeau posé dans la même transaction).
- **Pièces** : contenu adressé (BLOB-01) + refus BLOB-02 sur conflit d'octets ; une pièce « supprimée » (VID-01) n'est plus servie ni archivée mais ses octets sont conservés, et l'écran dit « removed from the file — bytes retained ».
- **Registres engendrés** : `docs/04_DATA_MODEL.md` (depuis la DDL), `docs/GUARDS.md`, `docs/SEMEUR_VS_CHEMIN.md`, `docs/CLOTURE.md`, `docs/REVUE.md`, `docs/AUDIT.md`, `docs/REPRISE.md` — jamais rédigés à la main (règle 21).

---

## 11. Sécurité et considérations d'entreprise (Security and enterprise considerations)

- **Session** (AUD-07) : cookie `otto_user` = `<uuid>.<base64url(hmac_sha256(uuid, OTTO_SESSION_SECRET))>` ; `getSessionUser()` vérifie la signature, refuse un uuid mal formé (plus de 500 sur l'accueil) ; secret absent ⇒ en local un avertissement au démarrage et une lecture `/api/sante` **rouge** (« session non signée ») ; sur l'hébergé la pose du secret est un geste du fondateur (§20). `loginAction` n'existe que si `demoPublique()` et vérifie l'existence de l'identifiant ; `/demo/[qui]` et `?comme=` inchangés (règle 29) mais derrière `demoPublique()` explicite.
- **Mode démonstration** : `demoPublique()` = `OTTO_DEMO_PUBLIC === '1'`, ou, à défaut de la variable, `VERCEL === '1'` (comportement actuel conservé sans geste) ; `OTTO_DEMO_PUBLIC === '0'` l'éteint explicitement.
- **Portail** : jeton haché (`portal_token_hash`), `expires_at` (null pour le contact de démonstration ; 90 jours par défaut à la création — paramètre de pack `verifie:false`), rotation tracée ; écritures rattachées à `rid` ET `entity_id` (PORTAIL-01) ; politique RLS restreinte aux colonnes de réponse.
- **Autorisation** : règles de rôle dans les services ET en base (VISA-01..03, EQUIPE-01) ; `closeFile` vérifie `can_sign` ; `definirNiveauMission` exige manager/partner ; remise à zéro : session + `firm_role in ('admin','partner')` ; `assertMembre` refuse un acteur null hors chemins système nommés (semeur, sonde, migration).
- **Étanchéité** : gardes par écriture (AUD-04) ; `activeMembership()` unique pour les routes API ; `couverture-etancheite.test.ts` compte les fonctions qui ÉCRIVENT sans garde (critère par écriture, pas par nom de paramètre) ; PLAN_RLS étape 3 **préparée, jamais exécutée** sans mandat (interdit) — la CI `role-production` la rejouera le jour où le secret existe.
- **Surface publique** : `/api/sante` — cache 60 s, corps public sans identifiants ni noms (comptes et codes seulement), détail derrière l'en-tête `X-Otto-Sante: <OTTO_SANTE_TOKEN>` (variable optionnelle ; absente ⇒ détail désactivé), une seule évaluation d'`obstaclesAuVisa` par appel ; `/api/erreur` derrière le même en-tête ; `/api/reunion-ics` vérifie l'appartenance avant de lire.
- **Pièces** : BLOB-02 ; politique d'insertion contrainte au format ; `app_state` par locataire.
- **Secrets** : `keyFingerprint()` n'imprime plus que la longueur ; TLS de la base : `rejectUnauthorized: true` dès que `OTTO_DB_CA_CERT` est posé, et une lecture `/api/sante` qui dit « certificat non vérifié » sinon.
- **Exploitation** (AUD-18) : `migrate()` transactionnel ; enrichissement bloquant au build ; aperçus sur une base séparée (geste du fondateur) ; CI nocturne du parcours ; runbook `DEPLOY.md` réécrit depuis le code.
- **Rétention / conservation** : inchangées (ADR-014) ; VID-01 : la vidéo retirée n'est plus servie ni archivée.

---

## 12. Phases d'implémentation (Detailed implementation phases)

L'ordre est celui du mandat §5.2 — le modèle avant les écrans, R-F7 et §0.1–0.2 avant le reste, puis le moins cher d'abord — précédé d'une phase 0 sans laquelle aucun rituel ne peut être mesuré (AUD-16), et suivi d'un hardening et d'une finition. Chaque phase porte un **critère de sortie mesuré** ; on n'ouvre pas la suivante avant.

| Phase | Objet | Lignes servies | Sortie (mesurée) |
|---|---|---|---|
| **0** | La chaîne de preuve : verte, ciblable, honnête ; l'inventaire | AUD-16, AUD-17 (partie), AUD-22 (garde), AUD-24 (instantanés), §5.1 | `docs/REVUE.md` engendré ; `verify` EXIT=0 sur HEAD ; `PARCOURS.json` refigé (≥ 320 conduites) ; 3 runs consécutifs de `clics` sans `#418` non classé ; `clics -- --station` opérationnel ; `visuel` étendu (avertissements comptés, plafond figé) ; `verify.json`/`TESTS_PLANCHER.json`/`GARDES_RESULTATS.json` au HEAD |
| **1** | La colonne vertébrale du modèle (0170–0179) et les briques transverses (Refus, verbes, sections, propositions) | AUD-01, 02, 03, 09, 10, 11 (modèle), 12 (registre), 14 (infra), 23 | 10 migrations appliquées en local ET servies (SHA confirmé) ; chaque garde neuve prouvée en deux passes avec cas connu mauvais ; NOTIF-01 lit `proposition` ; 0 écriture nue hors liste figée ; 52 codes de refus migrés ; deux réfutateurs |
| **2** | Sécurité, autorisation, scellé, piste | AUD-04, 05, 07, 08, 12, 25 | Cas connus mauvais verts pour PORTAIL-01, ETANCH-04, VISA-01..03, EQUIPE-01, SESSION-01, BLOB-02, VERROU-xx ; stations ETANCH ; lectures `/api/sante` correspondantes ; deux réfutateurs |
| **3** | Le motif de proposition, la provenance au survol, les notes par section, le canal vers l'agent, les visas et références croisées | §0.1, §0.2, §0.3, R-F7, R-F8, R-F9, R-F10, R-F19, S-2 | Stations R-F7, R-F10, R-F19, R-F8, R-F9 observées ; « Arbitrate » absent des 356 vues ; compte EPURE-01 ≤ plafond réduit ; 12 sites migrés sur `<Proposition>` |
| **4** | Le poste et ses sous-sections, le risque, le sondage, la vue d'ensemble, l'assistant | R-F1, R-F2, R-F3, R-F4, R-F5, R-F11..R-F18, R-F20, R-F21, S-1, S-5, S-6, AUD-19, AUD-20, AUD-21 | Une station par ligne R-F ; routes de poste servies ; /dashboard, /suivi, /provenance, /loop, /analytique, /processus, /obstacles, /notifications, /kanban en redirection ; verify vert |
| **5** | Le monde hébergé, la langue, la palette, le retrait du factice | R-F6, R-F22, S-3, S-4, AUD-06, AUD-13, AUD-14 (masse) | `langue` (étendue) = 0 ; EPURE-01 = 0 et BLOQUANT ; `throw new Error` dans services = 0 ; URL montre walkthrough analysé, entretien avec transcript, flowchart comparé ; `visuel` reshooté ; verdicts du fondateur consignés (§20) |
| **6** | Hardening, exploitation, CI | AUD-15, AUD-17 (reste), AUD-18, AUD-12 (ancrage) | `parcours.yml` vert ; `migrate` transactionnel ; enrichissement bloquant ; index/verrous ; `role-production` vert si secret posé |
| **7** | Finition, registres, suppression du mort | AUD-23 (doc), AUD-24 (docs), redirections, registre P2/P3 | `docs/04` engendré ; `DEPLOY.md`, `MIGRATIONS_BANDES.md`, `CLAUDE.md §5` corrigés ; redirections retirées ; `docs/REVUE.md` = 0 NON OBSERVÉE ; « l'inventaire est vide » |

Estimation d'effort (indicative, en rituels — un rituel ≈ une session de travail avec `verify` complet) : Phase 0 : 3 · Phase 1 : 4 · Phase 2 : 3 · Phase 3 : 3 · Phase 4 : 6 · Phase 5 : 4 · Phase 6 : 3 · Phase 7 : 2 — **28 rituels**, contre 60–90 si l'on payait un rituel par ligne sans la phase 0.

---

## 13. Tâches détaillées par phase (Detailed tasks per phase)

Format de chaque tâche : **Objectif · Constat · Comportement actuel → cible · Fichiers · Données · Logique · Permissions · Erreurs et cas limites · Acceptation · Tests · Régressions à surveiller.** Les identifiants `Pn-mm` sont stables : les commits, les lignes de `docs/REVUE.md` et `STATUS.md` les citent.

### Phase 0 — La chaîne de preuve

#### P0-00 · L'inventaire `docs/REVUE.md` (mandat §5.1)
- **Objectif.** Un seul inventaire engendré, une ligne par épreuve, l'état par ligne.
- **Fichiers.** `app/scripts/revue.ts` (nouveau, patron de `scripts/cloture.ts`), `docs/instantanes/revue.json` (données), `docs/REVUE.md` (engendré), script `npm run revue` et `revue:figer`.
- **Données.** Lignes : R-F1..R-F22 (épreuve verbatim du mandat §1), S-1..S-6 (**toutes OBSERVÉES à corriger** — l'audit les confirme, aucune SANS OBJET ; motif de confirmation cité : AUD-22, AUD-09, AUD-14, AUD-14/S-4, AUD-21, R-F15), AUD-01..AUD-18 (P0/P1) avec leur épreuve. Champs : `id`, `source` (mandat §1/§2 ou AUDIT), `epreuve`, `etat ∈ {OBSERVEE, NON_OBSERVEE, SANS_OBJET}`, `preuve` (station + SHA), `tache` (Pn-mm), `phase`. Les AUD-19..25 et les P3 vont dans `docs/BACKLOG_REPORTE.md` (R-nn nouveaux, un par constat, citant `docs/AUDIT.md`).
- **Acceptation.** `npm run revue` engendre le fichier ; les comptes en tête sont calculés ; une ligne ne passe à OBSERVÉE qu'avec un SHA et une station nommés (le script refuse sinon).
- **Tests.** `revue.test.ts` : cas connu mauvais — une ligne OBSERVÉE sans SHA fait échouer.

#### P0-01 · Marqueur d'hydratation et attente dans le parcours (AUD-16, hypothèse H du #418)
- **Objectif.** Éprouver et éliminer la course « navigation avant hydratation » qui produit le `#418 args[]=HTML`.
- **Actuel → cible.** `aller()`/`cliquer()`/`soumettre()` (`app/scripts/clics/scenario.ts`, helpers en tête de fichier et `run.ts`) attendent des sommeils fixes → ils attendent `html[data-hydrated="1"]`, posé par un composant client `app/src/app/hydrate-marqueur.tsx` monté dans `app/src/app/layout.tsx` (`useEffect(() => { document.documentElement.dataset.hydrated = '1'; })`), et le marqueur est retiré à chaque navigation (le composant le pose à chaque montage ; `aller()` l'efface avant `goto`).
- **Acceptation.** Trois runs complets consécutifs de `npm run clics` sur base fraîche : 0 `#418`. Si des occurrences subsistent : P0-02 les classe, et `docs/CHASSE.md` reçoit une entrée F-nn qui dit ce qui a été mesuré (pas d'hypothèse).
- **Tests.** `hydratation.test.ts` : le marqueur n'existe pas dans le HTML serveur (rendu SSR) et existe après hydratation (test Playwright dans `tests/screens.test.ts`, une route).
- **Régressions.** Aucune sur le produit ; le harnais devient plus lent de quelques ms par navigation.

#### P0-02 · `run.ts` : erreurs de page de signature connue = avertissement compté, avec plafond figé
- **Actuel → cible.** `page.on('pageerror')` pousse dans `durs` et fait `process.exit(1)` (run.ts:128, :202) → les erreurs dont le message ET la première divergence d'hydratation correspondent à une signature listée dans `docs/instantanes/parcours-avertissements.json` (`{signature, plafond, raison, depuis}`) sont comptées en `avertissements` ; le run rougit si `avertissements > plafond` ou sur toute erreur non listée ; `--figer` fige quand `echecs = 0` et `durs = 0`, avertissements admis. Le plafond initial est celui mesuré (4), et **ne peut que baisser** (test : le fichier figé ne peut pas augmenter un plafond sans un commentaire `raison` daté).
- **Acceptation.** `npm run clics -- --figer` réussit ; `docs/PARCOURS.json` porte ≥ 320 conduites datées du jour ; `npm run parcours -- --figer` idem.
- **Tests.** Cas connu mauvais : une `pageerror` inventée (`throw` dans une page de test) rougit le run.

#### P0-03 · Interdire les assertions vides du parcours (AUD-17)
- **Actuel → cible.** 21 `dire(nom, true, …)` et une absence testée en français (scenario.ts:1749, :2474, :2625, :2970, :982, liste complète par `grep -nE "dire\('[^']+',\s*$" -A1 | grep -E "^\s*true,"`) → chaque assertion porte un prédicat qui peut être faux (`envoyees > 0`, `repondu > 0`, `compteAbsent(R('famille.programme.titre'))`…) ; garde statique `app/src/lib/parcours.test.ts` (ou `scripts/parcours.ts`) : un `dire(` dont le deuxième argument est le littéral `true` fait échouer ; cas connu mauvais inclus.
- **Acceptation.** `grep -cE "dire\([^,]+,\s*true," scenario.ts` = 0 ; muter `approuverToutes` pour rendre 0 → la station « demande au client » rougit.

#### P0-04 · Station ciblable, pré-conditions par service, `verify:tranche`
- **Objectif.** Une station se rejoue seule, en moins de trois minutes, sur une base déjà semée.
- **Fichiers.** `app/scripts/clics/run.ts` (option `--station=<préfixe>`), `app/scripts/clics/preconditions.ts` (nouveau : par station, une fonction qui pose par SERVICE l'état requis — le patron de `scripts/clics/mesure-testing.ts`), `app/package.json` (`clics:station`, `verify:tranche` = `tsc --noEmit && vitest run <fichiers touchés ou --changed> && npm run screens -- --routes=<touchées> && npm run clics -- --station=<préfixe> && npm run visuel -- --routes=<touchées>`), `screens/run.ts` et `visuel/run.ts` (option `--routes=`).
- **Logique.** Une station déclare ses pré-conditions (`precondition: 'poste-revenue-sonde'`) ; `--station` conduit les pré-conditions puis la station ; sans `--station`, comportement inchangé. Les nouvelles stations de la phase 2 sont écrites SANS `waitForTimeout` : attentes sur `data-*` d'état (`data-etat`, `data-hydrated`, `data-notes-ouvertes`…). Les stations existantes ne sont pas réécrites en phase 0 (elles le seront en Phase 6, P6-03).
- **Acceptation.** `npm run clics -- --station=notes` conduit une station en < 3 min, deux fois de suite sur la même base ; `time npm run verify:tranche` < 20 min sur une tranche d'un écran.

#### P0-05 · Le traducteur dénonce une variable manquante ; S-1 corrigé ; la station du diagramme rendue honnête (AUD-22, AUD-16)
- **Actuel → cible.** `traduire()` (`catalogue.ts:2023`) laisse `{nom}` → rend `⟨cle:nom⟩` en production et LÈVE sous `NODE_ENV=test` ; `processus/page.tsx:173` passe `{ nom: montre.nom }` ; la station `scenario.ts:769` lit `[data-diagramme]` au lieu du libellé.
- **Acceptation.** Un test traduisant une clé à variable sans variable échoue ; corriger la page sans corriger la station fait rougir `clics` (mesuré une fois, consigné), puis vert.

#### P0-06 · `visuel` lit le statut, le texte et les motifs interdits (EPURE-01, S-1) — en avertissement compté
- **Fichiers.** `app/src/lib/epure.ts` (nouveau : `MOTIFS_INTERDITS: {motif: RegExp; raison: string}[]`, `verifierEpure(texte): string[]`), `app/scripts/visuel/run.ts` (après `goto` : refuser `response.status() >= 400` ; lire `document.body.innerText` ; appliquer `verifierEpure` et `/\{[a-z_]+\}/`), `docs/instantanes/visuel-avertissements.json` (plafond figé par motif).
- **Motifs (liste initiale, normative).** `/\bArbitrat(e|er|ion)\b/`, `/\bdeterministic\b/i`, `/\bdéterministe\b/i`, `/\bDrawn\b/`, `/\(L[0-3]\)/`, `/\bL[0-3]\b(?=\s*[—:·])/`, `/propose \(L3\)/i`, `/not a copy/i`, `/counted on the whole file/i`, `/Ce n[’']est PAS un jugement/i`, `/\b(NOTIF|CTRL|MAT|EXTRAP|AUTO|POP|TEST|ANA|RISK|VISA|PORTAIL|ETANCH|BLOB|LOC|REPLI)-\d{2}\s*:/` en tête de paragraphe (D.6 point 1), `/\{[a-z_]+\}/` (S-1). La liste vit dans le code avec un test à cas connu mauvais.
- **Régime.** Phase 0 → 4 : avertissement compté par motif avec plafond figé = compte mesuré au premier run ; le plafond ne peut que baisser ; Phase 5 (P5-05) : plafond 0, bloquant.
- **Acceptation.** `npm run visuel` imprime le compte par motif ; `/eng/[id]/sampling`, `/risk`, `/poste/[code]` figurent dans la liste initiale (AUD-22).

#### P0-07 · Instantanés et registres honnêtes (AUD-24) ; rendu de l'audit porté dans le dépôt
- **Fichiers.** `app/scripts/verify.ts` (nouveau wrapper : lance chaque maillon de `verify` sous `timeout`, capture EXIT/résumé/SHA/heure, écrit `docs/instantanes/verify.json` ; `npm run verify` pointe dessus) ; `npm run plancher -- --figer` ; `app/src/lib/gardes/registre.ts` (G-26 : « lecture croisée fermée par 0141 `blob_store_par_reference` ; insertion `with check (true)` jusqu'à P2-05 » ; G-50/G-55/G-59 : preuves nommées `obstacles.test.ts:41`, `obstacles.test.ts:93`, `tests/parcours.test.ts:186`) + `npm run gardes -- --figer` ; `docs/GUARDS.md` : ajouter « dernière exécution » à côté de « première preuve » ; `app/scripts/audit/rendre-audit.mjs` (portage du script de rendu de `docs/AUDIT.md` depuis `docs/instantanes/audit.json`, avec la vérification des preuves) et `npm run audit:rendre` ; `CLAUDE.md §5` (« dernière : 0169, prochaines 0170+ ») et règle 35 (« > 90 min mesurées ; budget 7200 s »).
- **Acceptation.** Après un `verify`, `docs/REPRISE.md` §5 porte le HEAD sur les 18 lignes ; `TESTS_PLANCHER.json ≥ 1200` ; `grep -n 'using (true)' docs/GUARDS.md` vide ; `npm run audit:rendre` régénère `docs/AUDIT.md` sans diff.

#### P0-08 · CI : le parcours conduit chaque nuit ; `semeur` à la pousse (AUD-18, partie CI)
- **Fichiers.** `.github/workflows/parcours.yml` (`workflow_dispatch` + `schedule` nocturne : `npm ci && npm run db:setup && npm run demo:seed && npm run screens && npm run clics`, `timeout-minutes: 120`, artefacts `.hydratation/` et `docs/CLICS.md`) ; `verifier.yml` job `local` : `+ npm run semeur` ; l'URL de fumée unifiée sur `https://otto-dit.vercel.app`.
- **Acceptation.** Un run vert de `parcours.yml` cité par SHA dans `STATUS.md`.

**Sortie de phase 0** : les huit tâches livrées ; `set -o pipefail; timeout 7200 npm run verify | tee /tmp/verify-p0.log; echo EXIT=$?` → `EXIT=0` ; `docs/REVUE.md` engendré ; `docs/PARCOURS.json` refigé ; instantanés au HEAD.

### Phase 1 — La colonne vertébrale

Règles de la phase : une bande de migrations 0170–0179 (§7), livrée en **deux rituels** (0170–0174, puis 0175–0179) ; deux réfutateurs par rituel (§5.4 : modèle de données) ; chaque migration est accompagnée de son service, de ses tests, de sa lecture `/api/sante` (règle 22), et de la mise à jour de `docs/04_DATA_MODEL.md` par le script de P1-08. Aucun écran n'est modifié en Phase 1 (hors adaptation minimale pour que `verify` reste vert).

#### P1-00 · `migrate()` transactionnel — AVANT la bande (AUD-18, annexe A-3)
- **Actuel → cible.** `app/src/lib/db/migrate.ts:83-84` fait `exec(sql)` puis `insert into _migrations` en deux ordres → les deux dans une transaction explicite (`begin` … `commit`, `rollback` sur erreur) sur les deux pilotes (PGlite : vérifier par test que `exec` multi-ordres est bien annulé avec la transaction ; node-postgres : une connexion dédiée du pool, jamais `pool.query` multi-ordres).
- **Acceptation.** Test : une migration de test qui échoue à son deuxième ordre ne laisse ni ligne dans `_migrations` ni effet du premier ordre ; `db:reset` vert.
- **Pourquoi d'abord.** La bande 0170–0181 s'applique sur la base publique à chaque build Vercel (AUD-18) : un arrêt à mi-migration y laisserait un schéma à moitié appliqué et rejoué.

#### P1-01 · `proposition` : table, service, applicateurs, NOTIF-01 (AUD-01)
- **Fichiers.** `supabase/migrations/0170_proposition.sql` (§7.1) ; `app/src/lib/services/propositions.ts` (`proposer`, `accepter`, `modifier`, `refuser`, `perimer`, `enAttente(engagementId, {userId?})`, `parObjet(object_type, object_id)`) ; `app/src/lib/services/propositions/types.ts` (catalogue `object_type` + forme de `valeur` par type) ; `app/src/lib/services/propositions/applicateurs.ts` (un applicateur par type : `materiality` → `materiality.validate()` version N+1 ; `fsli_analytique` → `analytique.enregistrer(origine 'proposee_validee', engineRunId)` ; `extraction_field` → nouvelle ligne `extraction rung='human'` (P1-06) ; `assertion_risk` → `risk.overrideLevel` (décision versionnée, P1-07) ; `deficiency` → `sox.decideDeficiency` ; `walkthrough_gap` / `transcript_gap` → `sox.statuerEcart` / `entretiens.statuerEcart` ; `process_step` → `processus.appliquerDifference` (Phase 4) ; `wp_extra_cell` → `workpapers.confirmerCellule` ; `scoping` → `fsli.confirmScoping` ; `carry_forward` → `carryforward.decider` ; `risk_factor` → `questionnaire.declarerFacteur` ; `fs_tie` → `tieout.documenter`) ; `notifications.ts` réécrit sur `enAttente()` (filtre par rôle : ce que MON rôle peut décider — même règle que les applicateurs) ; `obstacles.ts` famille `iaNonValide` sur `count(proposee)`.
- **Logique.** `proposer()` : refuse (PROP-01) s'il existe déjà une proposition `proposee` pour (type, objet, champ) ; crée la `review_note` explicative (`author_kind='otto'`, `anchor_kind='proposition'`) ; écrit `event_log proposition.creee`. `accepter()` : applique via l'applicateur dans la même transaction, `status='acceptee'`, `valeur_retenue = valeur_proposee`, `decided_by/at`, `event_log proposition.acceptee`. `modifier(valeurRetenue)` : idem avec `status='modifiee'`. `refuser(motif)` : PROP-02 sans motif. `perimer()` : appelé par les moteurs quand l'objet porteur a changé (ré-import, recalcul) — jamais de suppression.
- **Permissions.** `accepter/modifier/refuser` exigent `assertMembre` ET, par type, le rôle défini dans `applicateurs.ts` (`materiality` : can_sign ou manager ; `assertion_risk` : manager/partner ; les autres : tout membre). Le semeur passe par les mêmes fonctions.
- **Migration des formes existantes** : les quatre familles de `notifications.ts` (materiality proposed, deficiency proposed, walkthrough gap candidate, extraction pending_verify) sont **rétro-alimentées** par un script de migration TS (`0170b_propositions_backfill.ts`) qui crée une `proposition` par élément en attente existant ; les colonnes de statut d'origine restent mais deviennent dérivées (mises à jour par l'applicateur).
- **Acceptation (épreuve AUD-01).** Sur le monde semé : `count(proposition proposee)` = compte NOTIF-01 = nombre d'éléments `data-ia-prepare` (mesuré par la station NOTIF-01 existante, adaptée) ; proposer deux fois → PROP-01 ; accepter puis relire → objet porteur mis à jour, `decided_by` posé, événement écrit.
- **Tests.** `propositions.test.ts` (PGlite) : les six opérations, PROP-01/02, verrou (dossier scellé → refus), étanchéité (membre étranger → ETANCH), immuabilité de `valeur_proposee` (UPDATE direct refusé par le déclencheur).
- **Régressions.** Station « NOTIF-01 : chaque carte mène à l'objet réel » et « obstacles au visa » : à réobserver.

#### P1-02 · Sections et notes (AUD-02)
- **Fichiers.** `0171_sections_et_notes.sql` (§7.2) + `0171b_notes_backfill.ts` (section_id dérivé une fois, notes flottantes ré-ancrées, `ecran`/`deviation` migrées) ; `app/src/lib/services/sections.ts` (`cleDeSection(engagementId, kind, ref, label)` idempotent, `sectionsDuPoste(code)`) ; `app/src/lib/services/notes/` (`poserNote({sectionId, ancre, texte, destinataire, type})`, `notesDeSection(sectionId)`, `hrefDeNote(note) → href#ancre` — le résolveur unique, remplace `ecranPorteur` de `notes/page.tsx` et la clé d'écran de `lifecycle.ts:291`) ; `ancres.ts` : natures nouvelles.
- **Acceptation.** `select count(*) from review_note where scope='audit' and anchor_kind is null` = 0 ; chaque note existante a un `section_id` ; `hrefDeNote` rend un `#` pour 100 % des notes semées (test).
- **Tests.** `notes.test.ts` : poser sans ancre → refus NOTE-01 ; poser sur chaque nature → `hrefDeNote` résout ; cas connu mauvais de la migration (une note `ecran` sans route résoluble → `mission.vue`).

#### P1-03 · Processus et contrôles (AUD-03)
- **Fichiers.** `0172_processus_et_controles.sql` (§7.3) + `0172b_processus_backfill.ts` ; `processus.ts` (`FSLI_DU_CYCLE` supprimée ; `processusDuPoste(code)` ; `creerProcessus`, `remplacerProcessus` → supersede ; `deposerFlowchartClient(processId, evidenceId)`) ; `sox.ts` (`importRcm` : colonne optionnelle `fsli` du CSV → `control_fsli` ; `risk.level = null` ; `lierControleAuPoste(controlId, fsliCode, assertions)`) ; `poste.ts` (`controlesDuPoste(code)`, `processusDuPoste(code)` — plus de comptes de dossier).
- **Acceptation.** `insert` de deux `process_model` actifs sur REVENUE → accepté ; `select count(*) from risk where level is not null and source='rcm_import'` = 0 ; `controlesDuPoste('REVENUE')` rend C-REV-* seulement sur le monde semé (le semeur pose `control_fsli` pour ses contrôles : `enrichir.ts`, `part2.ts`).
- **Tests.** `processus.test.ts`, `sox.test.ts` : unicité partielle, supersede, lien poste, refus sur poste inconnu.

#### P1-04 · Visa : empreinte, unicité, rôles, séparation (AUD-05, AUD-09 — partie modèle)
- **Fichiers.** `0173_visa.sql` (§7.4) ; `workpapers/lifecycle.ts` (`signWorkpaper` : calcule `sections_hash`, applique VISA-01..03 côté service avec refus nommés ; `etatDuVisa(workpaper) → {signe, perime, motif}` unique ; `editSection` refuse (VISA-04) dès qu'un visa existe : « create a new version first ») ; `team.ts::assignMember` (acteur manager/partner, `withActeur()` pose `otto.acteur_role` ; le semeur et l'enrichissement passent par `withActeur('partner')` — jamais par un `update` direct) ; `retention.ts::closeFile` (vérifie `can_sign`).
- **Acceptation.** Épreuves AUD-05 et AUD-09 (partie base) : deux visas du même rôle → refus VISA-01 ; même personne deux rôles → VISA-02 ; senior en reviewer → VISA-03 ; éditer après visa → VISA-04 ; résoudre un écart après visa associé → `etatDuVisa` = périmé sans redraft (hash amont).
- **Tests.** Gardes SQL en deux passes dans `gardes.test.ts` (registre G-nn nouveaux) ; `lifecycle.test.ts`.

#### P1-05 · Verrou générique (AUD-08 — partie modèle)
- **Fichiers.** `0174_verrou_generique.sql` (§7.5) ; `gardes/registre.ts` (G-09 étendu : la liste des tables couvertes est engendrée par le test `rls-couverture.test.ts` → renommé `couverture-verrou.test.ts` : toute table à `engagement_id` OU fille listée sans garde rougit).
- **Acceptation.** `update engagement set status='locked'` puis écriture sur chacune des 21 + filles → refus « writes rejected » (test paramétré sur la liste) ; le drapeau posé hors `amenderApresVerrou()` (Phase 2) est un cas connu mauvais préparé ici.

#### P1-06 · Supersede : extraction, matérialité, cellules, périmètre, processus (AUD-10)
- **Fichiers.** `0175_supersede.sql` (§7.6) ; `extraction/ladder.ts::verifyExtraction` (insère `rung='human'`, `supersedes_extraction_id`, `latestExtraction` résout la chaîne) ; `materiality.ts::validate` (version N+1) ; `testing/grille.ts::recalculer` (plus de `delete cell_disposition` ; `couvre_encore=false`) ; `fsli.ts::rebuildFslis` (upsert) ; `processus.ts` (supersede, P1-03).
- **Acceptation.** Épreuve AUD-10 intégrale.
- **Régressions.** Stations « testing : l'atelier », « import du grand livre définitif » (MAT-03), « matérialité » : à réobserver ; `draft.ts` lit `latestExtraction`.

#### P1-07 · Risque : échelle, RISK-01, décisions versionnées, tirage relié (AUD-11 — modèle et services)
- **Fichiers.** `0176_risque.sql` (§7.7) ; `methodology/risque.json` (échelle à quatre niveaux, libellés en/fr, règle de calcul ; `valider.mjs` mis à jour) ; `risk.ts` (`overrideLevel` → ligne de décision + mise à jour de la mère, refus RISK-01 côté service avec le même prédicat) ; `questionnaire.ts` (`answerQuestion` texte libre ; `declarerFacteur` explicite ; le facteur ne naît plus confirmé — `DEMO_APP.md §8` corrigé) ; `sampling.ts::proposeRevenueSample` (taille = `requiredProcedures(...).sampleSize` de la procédure sondée ; nul → refus SAMP-01 « sample size not set by the firm's method for this risk level ») ; `coverageCapPctOfPM` et `randomSizeDefault` déplacés dans `methodology/risque.json` avec `verifie` (les valeurs actuelles sont conservées telles quelles, `verifie:false`).
- **Acceptation.** Épreuve AUD-11 (base) ; le semis continue de tirer (les paramètres existent avec `verifie:false`).
- **Régressions.** Station « sondage », « risque » (arbitrate → devient « retenir »), `risk.test.ts`, `kernel.test.ts`.

#### P1-08 · Index, FK, `docs/04` engendré (AUD-23) ; `row_version` (AUD-15, partie modèle)
- **Fichiers.** `0177_index_et_fk.sql` (§7.8) ; `app/scripts/docs/data-model.ts` (engendre `docs/04_DATA_MODEL.md` §5–§9 depuis la DDL introspectée sur PGlite : tables, colonnes, contraintes, index, politiques ; les §1–§4 restent rédigés) ; `npm run docs:modele` et `docs:modele:epreuve` (diff = échec) ; `docs/BACKLOG_REPORTE.md` : R66 levé.
- **Acceptation.** Épreuve AUD-23 ; `npm run docs:modele:epreuve` vert en CI.

#### P1-09 · La classe `Refus`, le registre des codes, `executer()` (AUD-14 — infrastructure)
- **Fichiers.** `app/src/lib/core/refus.ts` (`class Refus extends Error { code; cle; vars; }`, `refus(code, cle, vars)`, `REGISTRE_REFUS: Record<code, {cle, famille}>`) ; `app/src/app/refus.ts::executer()` (un `Refus` → `?erreur=<code>|<cle>|<vars json>` ; une autre erreur → ligne `server_error` + `?erreur=PANNE|<ref>` ; en `NODE_ENV=development` le message brut est ajouté) ; `bandeau-refus.tsx` (traduit la clé, code en petit après la phrase — D.6) ; catalogue : clés `refus.<CODE>` en/fr pour les 52 codes existants (liste par `grep -ohE "'[A-Z]+-[0-9]{2}"` sur services) ; `scripts/langue.ts` : les `throw` des services entrent dans le périmètre avec un **plafond figé** (`docs/instantanes/langue-refus.json` : compte des `throw new Error` par fichier, ne peut que baisser ; 0 en Phase 5).
- **Acceptation.** Les 52 codes lèvent des `Refus` ; une panne SQL forcée en test rend « PANNE » et une ligne `server_error`, jamais le message SQL à l'écran ; le plafond figé est écrit.
- **Régressions.** Les stations qui lisent `refus(p)` par code (28) doivent continuer à lire le code : `refus()` du harnais lit le nouveau format.

#### P1-10 · Registre des verbes, écritures nues, deux horloges (AUD-12 — partie infrastructure)
- **Fichiers.** `app/src/lib/core/verbes.ts` (tous les verbes existants, dédoublonnés : `engagement_created` ↔ `engagement.created` → un seul, l'autre en alias de lecture) ; `events.ts::logEvent` refuse un verbe hors registre en test (avertissement en production) ; `app/src/lib/core/ecriture-nue.test.ts` (script : pour chaque fonction exportée de `lib/services` qui contient `insert|update|delete`, exige un `logEvent` dans la même fonction ou une entrée dans la liste figée `docs/instantanes/ecritures-nues.json` — 24 au départ, ne peut que baisser, 0 en Phase 2) ; `automatisation.ts::definirNiveauMission` (événement `automation_level.changed {de, vers}`, acteur manager/partner) ; `tieout.ts::pointer` (`tied_by` = null pour un calcul machine, `engine_run_id`) ; `docs/DECISIONS.md` ADR « deux horloges » ; `new Date()` remplacé par `now()` dans `obstacles.ts:246`, `acceptance/page.tsx`, `core/jours.ts` (défaut) ; test `pas-de-new-date.test.ts` sur `lib/services`.
- **Acceptation.** Épreuve AUD-12 (hors ancrage, Phase 6).

**Sortie de phase 1** : dix migrations appliquées localement (`db:reset` vert) et SERVIES (SHA confirmé par `/api/sante`) ; `verify` EXIT=0 ; deux réfutateurs par rituel avec constats énumérés ; `docs/04_DATA_MODEL.md` engendré ; lectures `/api/sante` : « propositions », « notes sans section = 0 », « processus par poste », « visas », « verrou : tables couvertes = tables à couvrir », « écritures nues ≤ plafond ».

### Phase 2 — Sécurité, autorisation, scellé, piste

Tranches courtes et indépendantes (ordre libre à l'intérieur de la phase), chacune avec son cas connu mauvais et sa lecture `/api/sante` ; deux réfutateurs (sécurité).

#### P2-01 · Étanchéité par écriture (AUD-04)
- **Fichiers.** `services/evidence.ts` (`answerExplanation(requestId, requestItemId, contactId, text)` et `ingestEvidence` chemin portail : la requête d'écriture joint `request_item → request → engagement → entity` et exige `request.id = $rid and entity.id = contact.entity_id` ; refus PORTAIL-01) ; `app/portal/[token]/[rid]/page.tsx` (passe `rid`) ; `services/verification.ts::submitBlindCheck` (`assertMembreDe('verification_run', runId, verifierId)` — ajouter le type au catalogue de `core/membre.ts` ; `sample_item_id ∈ selected` stocké dans `verification_run.selected jsonb` par `startVerificationRun`) ; `core/auth.ts::activeMembership(engagementId, userId)` réutilisée par `api/blob`, `api/archive`, `api/tracker`, `api/reunion-ics` (vérifier avant de lire) ; `core/couverture-etancheite.test.ts` : critère « toute fonction exportée qui écrit garde » (liste figée des exceptions nommées : semeur, sonde, migration), le regex `ACTEUR` supprimé.
- **Acceptation.** Épreuve AUD-04 ; station clics « ETANCH : portail » (POST forgé avec l'item d'un autre dossier → refus) ; lecture `/api/sante` « fonctions qui écrivent sans garde = 0 ».

#### P2-02 · Rôles et séparation des tâches — service (AUD-05)
- Déjà posé en base (P1-04). Ici : `assignMember` (acteur manager/partner via `withActeur`), `closeFile` (`can_sign`), `definirNiveauMission` (manager/partner), `supprimerVideoWalkthrough` (membre + motif, inchangé) ; `team/page.tsx` : la case « may sign off » n'est rendue que pour un acteur manager/partner (l'écran suit le service, jamais l'inverse).
- **Acceptation.** Station « équipe : un senior ne s'attribue pas le droit de signer » (refus EQUIPE-01 observé) ; « visa : la même personne ne vise pas deux rôles » (VISA-02 observé).

#### P2-03 · Session, mode démonstration, jetons, sonde bornée (AUD-07)
- **Fichiers.** `core/auth.ts` (signature HMAC ; `OTTO_SESSION_SECRET` ; uuid mal formé → session absente, jamais 500) ; `app/page.tsx::loginAction` (derrière `demoPublique()`, existence vérifiée) ; `middleware.ts` (`?comme=` signe le cookie) ; `demo/[qui]/route.ts` (idem) ; `core/demo-public.ts` (`OTTO_DEMO_PUBLIC` explicite, `'0'` éteint) ; `demo/remise-a-zero/actions.ts` (`requireUser` + `firm_role in ('admin','partner')`, refus DEMO-01) ; `0178_session_et_jetons.sql` (§7.9) + `services/portal.ts` (lecture par `portal_token_hash`, `expires_at`, refus PORTAIL-02 « link expired ») ; `api/sante/route.ts` (cache mémoire 60 s par instance + `Cache-Control: max-age=60` ; corps public = comptes et codes ; `?detail=1` exige `X-Otto-Sante` = `OTTO_SANTE_TOKEN` quand posé, sinon détail désactivé ; `obstaclesAuVisa` évalué une fois et partagé ; identifiants et noms retirés du corps public — les stations CI lisent `sha` et les verdicts) ; `api/erreur/route.ts` (même en-tête) ; `core/env.ts::keyFingerprint` (longueur seule).
- **Acceptation.** Épreuve AUD-07 ; lecture `/api/sante` « session signée : oui/non » (rouge si secret absent sur `VERCEL`) ; `npm run accept` et `deploiement/atteint.ts` continuent de lire `sha`.
- **Régressions.** Le harnais `clics` pose le cookie via `/demo/<prénom>` : il reçoit désormais un cookie signé — `run.ts` n'a rien à changer ; `screens.test.ts` idem. `accept/specs.ts` lit `/api/sante` : adapter à la forme publique.

#### P2-04 · Le flux d'amendement post-verrou et la garde applicative (AUD-08 — service)
- **Fichiers.** `services/verrou.ts` (nouveau : `amenderApresVerrou(engagementId, userId, motif, fn)` — vérifie `status in ('locked','archived')`, exige motif (VERROU-02), écrit `event_log post_lock_amendment {motif}` puis pose `otto.post_lock_amendment` dans la MÊME transaction, exécute `fn`) ; `sox.ts::supprimerVideoWalkthrough` ne pose plus le drapeau (il appelle `amenderApresVerrou` si le dossier est scellé, sinon le geste ordinaire) ; `app/refus.ts::executer()` : garde applicative — si l'action cible un dossier `locked` et n'est pas sous `amenderApresVerrou`, refus VERROU-01 avant toute écriture (résolution objet → dossier par le catalogue de `core/membre.ts`).
- **Acceptation.** Épreuve AUD-08 (partie flux) ; cas connu mauvais : poser le drapeau hors du chemin en test → le test l'attrape (le `set_config` est cherché par grep ET par un déclencheur qui exige `otto.amendement_id` posé par la fonction).

#### P2-05 · Pièces et politiques `true` (AUD-25)
- **Fichiers.** `core/storage.ts::saveBlob` (sur conflit de chemin : relire `sha256` existant, refus BLOB-02 si différent) ; migration `0180_blob_et_app_state.sql` (politique d'insertion `with check (storage_path = substr(sha256,1,2)||'/'||sha256)` ; politique `request_item_portail_reponse` restreinte via une fonction `security invoker` qui n'autorise que `client_note`, `status ∈ ('uploaded','complete')` — les autres colonnes inchangées, sinon refus) ; `app_state` par locataire (déjà en 0178 ; ici les lectures : `core/clock.ts` lit l'horloge du locataire courant).
- **Acceptation.** Épreuve AUD-25.

**Sortie de phase 2** : cinq tranches livrées ; cas connus mauvais verts (PORTAIL-01/02, ETANCH-04, VISA-01..04, EQUIPE-01, DEMO-01, SESSION, VERROU-01/02, BLOB-02) ; stations ETANCH/équipe/visa observées ; `docs/instantanes/ecritures-nues.json` = 0 ; `verify` vert ; SHA servi confirmé.

### Phase 3 — Le motif de proposition, les notes, les visas

Un rituel par groupe : (P3-01 + P3-05), (P3-02 + P3-03), (P3-04). Réfutateurs : deux (P3-01 touche un code de refus NOTIF-01), un ensuite.

#### P3-01 · Le composant `<Proposition>` et `<Provenance>` ; migration des douze sites (§0.1, §0.2, R-F19)
- **Objectif.** Un seul motif pour toute proposition : dans son champ, surligné en jaune, un marqueur ; survol = provenance ; clic = accepter ; saisie = modifier.
- **Fichiers.** `app/src/app/composants/proposition.tsx` (client ; props : `proposition`, `rendu` (texte | nombre | select | zone de texte), `onAccepter`, `onModifier` via actions serveur `accepterPropositionAction`/`modifierPropositionAction` (`app/src/app/eng/[id]/propositions-actions.ts`, sous `executer()`)) ; `composants/provenance.tsx` (un marqueur `·` accessible, `title` + infobulle CSS : origine, qui, quand, run) ; `composants/marqueur.tsx` ; `globals.css` (jetons `--proposition-bg: #FFF4B8`, `--proposition-border: #E6C64A`, sombre `#4A4118`/`#8A7A2E`) ; suppression de `ia-flag.tsx` (les sept sites migrent ; les deux sites « non-propositions » — réunions, dashboard — perdent le drapeau).
- **Sites migrés (liste fermée, chacun une proposition typée)** : /materiality (seuil proposé, colonnes → survol), /risk (niveau calculé → proposition `assertion_risk` ; colonnes Computed/Retained/What produced it/Arbitrate **supprimées** ; bouton « Arbitrate » → le marqueur), /poste › leadsheet (revue analytique proposée), /workpapers/[wid] (IPE proposé, cellule ajoutée `wp_extra_cell`), /rcm/[cid] (déficience proposée, écarts de walkthrough), /processus → poste › Interviews (écarts d'entretien), /sampling → Methodology (paramètres proposés par la méthode), /carry-forward (reprises), /scoping (périmètre proposé), /fs-tieout (pointage proposé), /notifications → bloc « À valider ».
- **Logique.** Le composant ne contient aucune règle : il rend et appelle ; les applicateurs (P1-01) décident. Une valeur déjà décidée se rend sans surlignage, avec `<Provenance>`.
- **Acceptation.** Épreuve R-F19 : le mot « Arbitrate » n'apparaît dans aucune vue (EPURE-01) ; un test prouve que modifier une valeur proposée écrit qui, quoi (avant/après) et quand ; station « proposition : accepter d'un clic, modifier en place, NOTIF-01 décrémente » ; les stations existantes NOTIF-01 réobservées.
- **Régressions.** Toutes les stations qui cliquaient « Proposer (L3) », « Valider », « Arbitrate » : adaptées dans la même tranche ; `lectures.ts` (chemins de champs figés) refigé.

#### P3-02 · Le panneau de notes par section, les marqueurs, un seul composeur, la note à OTTO (R-F7, §0.3)
- **Fichiers.** `composants/panneau-notes.tsx` (réécriture du `panneau-notes.tsx` actuel : par SECTION, à droite, repliable et mémorisé `ui_repli` clé `notes.<kind>.<ref>` ; liste ancrée, réponses, transitions ; clic → `hrefDeNote` + surbrillance du marqueur) ; `composants/annotable.tsx` (marqueur « + » au survol, marqueur « ✎ n » quand des notes existent ; plus de panneau par cellule) ; `composants/composeur-note.tsx` (texte, destinataire = personne | OTTO, type) ; `app/src/app/eng/[id]/layout-section.tsx` (nouveau layout de section : déclare `cleDeSection`, rend le panneau) ; suppression du formulaire flottant de `workpapers/[wid]/page.tsx:627` ; `notes/page.tsx` (vue transverse par `hrefDeNote`) ; `notes/otto.ts` (capacités nouvelles : `proposer_redaction_analytique`, `comparer_transcript`, `analyser_flowchart` (Phase 4), `proposer_facteur_risque` ; toute sortie → `propositions.proposer()` ; réponse textuelle → `review_note_reply`).
- **Acceptation.** Épreuve R-F7 verbatim : dans toute section, un panneau à droite listant les notes de la section, ancrées ; marqueur à chaque endroit annoté ; clic ↔ défilement ; une note ne se résout pas à un endroit réel = test en échec ; station « notes : poser sur une cellule de leadsheet, retrouver dans le panneau, répondre, clore » ; station « note à OTTO : la réponse revient en proposition ».

#### P3-03 · La revue analytique éditable en place (R-F10)
- **Fichiers.** `poste/[code]/leadsheet/page.tsx` (Phase 4 crée la route ; en Phase 3 le bloc reste sur `/poste/[code]` et migre ensuite sans changement) : zone de texte éditable, sauvegarde implicite au blur (`enregistrerAnalytiqueAction`, versionnée `v(n+1) · written by …`, ANA-01 refuse le vide, ANA-03 append-only) ; suppression des boutons « Save the analytical review » et « Propose wording… » ; la proposition d'OTTO (depuis une note adressée, ou depuis le bloc « proposer » de `analytique.ts::proposer()` appelé par la capacité) s'affiche dans la zone via `<Proposition>` ; `poste.analytique.aide` retiré (EPURE-01).
- **Acceptation.** Station « revue analytique : éditer, quitter le champ, relire v2 ; adresser une note à OTTO, la proposition apparaît surlignée, l'accepter écrit v3 avec origine 'proposee_validee' et engine_run ».
- **Régressions.** Station existante « revue analytique du poste » (`scenario.ts:2352-2366`) réécrite.

#### P3-04 · Cartes de visa, STALE dérivé, références croisées (R-F8, R-F9, S-2, AUD-09)
- **Fichiers.** `composants/carte-visa.tsx` (rôle + initiales ; `title` = nom complet + date ; marqueur STALE = icône ⟳ barrée avec `title` « stale — the paper changed after this sign-off » ; aucune référence de papier) ; `poste.ts` (plus de `visas` par rôle ; `visasDuPoste` = agrégat par papier) ; `workpapers/[wid]/page.tsx` (cartes par papier ; titres corrigés : « Sign-offs », « Review notes ») ; `composants/xref.tsx` (icône ⇄ ; `title` = cible nommée ; `href`) remplaçant le paragraphe explicatif de la leadsheet (R-F9) et les liens texte des papiers.
- **Acceptation.** Épreuves R-F8, R-F9, S-2 ; station « visas : une carte par rôle sur le papier ; après modification amont, STALE apparaît sans redraft ».

#### P3-05 · NOTIF-01 sur `proposition`, bloc « À valider », fin de `/notifications`
- Déjà rebranché en P1-01 (service) ; ici l'écran : bloc « À valider » sur `/eng/[id]` (Phase 4 finalise la vue ; en Phase 3 le bloc est ajouté à la vue existante) et `/notifications` → redirection `/eng/[id]#a-valider` (`redirections.ts`) ; les deux stations NOTIF-01 pointent le bloc.

**Sortie de phase 3** : stations R-F7, R-F8, R-F9, R-F10, R-F19, « proposition », « note à OTTO » observées et figées ; EPURE-01 : motif « Arbitrate » = 0, « not a copy » = 0, plafonds réduits d'autant ; `verify` vert ; SHA confirmé.

### Phase 4 — Le poste, le risque, le sondage, la vue d'ensemble, l'assistant

Rituels par groupe d'écran : **G1** rail + routes de poste + leadsheet + papers/requests/exceptions (P4-01, P4-02) ; **G2** Interviews + Process + Controls + Changes (P4-03, P4-04, P4-05) ; **G3** Sampling + Testing (P4-06, P4-07) ; **G4** Risque (P4-08) ; **G5** Vue d'ensemble + obstacles + assistant + envoyer + reliquats (P4-09..P4-12). Un réfutateur par groupe, deux pour G3 (POP-01) et G4 (RISK-01).

#### P4-01 · Le rail hiérarchique et les clés de section (R-F1, R-F11)
- **Fichiers.** `services/rail.ts` (postes : `in_scope`/`in_scope_qualitative` ou avec travail — les hors périmètre ne sont plus ajoutés, même grisés ; sous-sections du poste courant : `sectionsDuPoste(code)` rend la liste selon §6.1 ; entrées retirées : `analytique`, `processus`, `obstacles`, `kanban`, `notifications`, `suivi`, `dashboard` ; ajoutée : `rcm` reste) ; `rail-vue.ts` (type `EntreeRail` gagne `parent?: string`, `niveau`) ; `nav.tsx` (rendu indenté du poste courant) ; `rail.test.ts` (lit les `href` réellement rendus : plus de `destinationsDuPoste`) ; ADR « ADR-103 amendé pour les postes (R-F1) ».
- **Acceptation.** Épreuve R-F1 : un poste `out of scope` dans le rail = test en échec ; la section Scoping les liste avec motif.

#### P4-02 · Les routes de poste et la leadsheet (R-F11, R-F12, AUD-20 partie)
- **Fichiers.** `app/src/app/eng/[id]/poste/[code]/layout.tsx` (en-tête commun §6.3 ; `layout-section`) ; `.../leadsheet/page.tsx` (tableau, ⇄, revue analytique — P3-03), `.../papers/page.tsx`, `.../requests/page.tsx`, `.../exceptions/page.tsx` ; `.../page.tsx` → `redirect('leadsheet')` ; suppression des blocs « Ouvrir — … » (`poste/[code]/page.tsx:276`) ; `poste.ts::vuePoste` découpée par sous-section (`leadsheet()`, `papiers()`, `demandes()`, `ecarts()` — les patrons de nature conservés tels quels) ; `VuePoste.boucle` supprimé (mort) ; `redirections.ts` : `/poste/[code]/detail-compte` → `sampling`.
- **Acceptation.** Épreuves R-F11 (une sous-section à la fois, choisie dans le rail ; « Analytical review » n'est plus une entrée du rail mais une partie de Leadsheet) et R-F12 (aucun bouton renvoyant vers une autre page pour voir ce que la sous-section est censée montrer — test : aucun `data-ouvrir` dans les vues de poste).
- **Régressions.** `PARCOURS.json`, `LECTURES.json` refigés ; toutes les stations qui visitent `/poste/<code>` continuent (redirection) ; `screens` : nouvelles routes ajoutées à la liste des routes balayées.

#### P4-03 · Interviews (R-F14)
- **Fichiers.** `.../interviews/page.tsx` + `interviews-actions.ts` (`ajouterEntretienAction`, `deposerTranscriptAction`, `analyserAction`) ; `services/entretiens.ts` (`entretiensDuPoste(code)` via `process_model.fsli_code` ; `lireTranscript(interviewId)` rend le contenu ; `analyser()` → `propositions.proposer(type 'transcript_gap')` ; `statuerEcart` = applicateur) ; le vocabulaire de décision unifié (accepter → tâche / facteur / question selon la nature de l'écart ; refuser avec motif) partagé avec `sox.ts::statuerEcartWalkthrough` (mêmes libellés, même composant) ; `composants/depot.tsx` (S-3 : champ de dépôt stylé, libellé du catalogue, plus de bouton natif du navigateur).
- **Acceptation.** Épreuve R-F14 : le transcript d'un entretien est lisible dans sa sous-section ; l'ordre du rail est Interviews → Process → Controls → Changes since N-1 ; l'ancien nom « N / N-1 Difference » n'apparaît plus ; station « entretien : déposer un transcript, analyser (rejeu), un écart proposé, l'accepter en question client ».

#### P4-04 · Process : N processus, diagramme, légende, flowchart client, comparaison (R-F13, R-F16)
- **Fichiers.** `.../process/page.tsx` (liste + *Add process*), `.../process/[pcode]/page.tsx` (diagramme SVG existant déplacé de `/processus` ; légende `composants/legende-processus.tsx` construite depuis `process_step.pictogramme` ; bloc *Client flowchart* : `<Depot>` → `evidence` (image/PDF) liée par `client_flowchart_evidence_id`, aperçu ; bouton *Compare with the meeting*) ; `services/processus.ts` (`creerProcessus`, `deposerFlowchartClient`, `comparer(processId)` → adaptateur `walkthrough`/`transcript` (fabrique) avec en entrée : étapes courantes, transcript(s) du poste, texte extrait du flowchart (couche texte PDF ou OCR par la fabrique OCR) ; sortie : différences → `propositions.proposer(type 'process_step', valeur {action: 'ajouter'|'modifier'|'retirer', etape, motif})` ; applicateur `appliquerDifference` : nouvelle version du processus (supersede) avec l'étape appliquée ; `versionsDuProcessus`) ; `dataset/flowcharts/revenus-2025.png` + `.json` (vérité) + fixture de rejeu `dataset/fixtures/flowcharts.json` (sha du transcript + sha du flowchart → différences attendues, dont « SAGE vs Oracle ») ; `processus/page.tsx` (ancienne route) → redirection ; import JSON retiré de l'interface (le service `importerProcessus` reste, appelé par le semeur — R-F15).
- **Acceptation.** Épreuves R-F13 (un poste porte N processus, un clic en ajoute un, une légende explique chaque forme) et R-F16 (sur le monde semé : un processus porte un flowchart client déposé, un diagramme engendré et au moins une différence surlignée en jaune avec sa note ; accepter la fait entrer au diagramme ; refuser la retire ; les deux tracés) ; station « flowchart : déposer, comparer (rejeu), accepter une différence, la version 2 du diagramme la porte ».
- **Cas limites.** Flowchart sans couche texte et OCR en rejeu inconnu → message d'écran (jamais un chemin) ; deux propositions sur la même étape → PROP-01 ; processus supersédé pendant une proposition en attente → `perimer()`.

#### P4-05 · Controls : la mini-RCM du poste (R-F17)
- **Fichiers.** `.../controls/page.tsx` (`controlesDuPoste`, colonnes §6.3, lien vers `/rcm/[cid]`, *Link a control*) ; `rcm/page.tsx` (le code du contrôle devient un lien vers `/rcm/[cid]` ; « Test OE » reste) ; `rcm/[cid]/page.tsx` inchangé (938 lignes — hors périmètre de refonte, seule la provenance/propositions (P3-01) et les cartes/notes (P3) y passent).
- **Acceptation.** Épreuve R-F17 : dans le poste, la liste de ses seuls contrôles ; partout où un contrôle est affiché, un clic ouvre sa documentation (D&I, OE) ; un contrôle sans page de détail atteignable = test en échec (test : chaque ligne de Controls et de /rcm porte un `href` vers `/rcm/<id>` qui rend 200).

#### P4-06 · Sampling : quatre étapes, méthodologie, rapprochement (R-F20, R-F21, AUD-20)
- **Fichiers.** `.../sampling/page.tsx` (déplacement de `/sampling`, `/population` et `detail-compte` ; paramétré par `code` ; titre « Sampling » ; étapes *Methodology* (méthode `random | monetary_units` — libellés du catalogue ; taille commandée par le risque, ou « unverified parameter — to be set by the firm » avec le paramètre de `risque.json` ; graine ; chaque valeur avec `<Provenance>`), *Population*, *Reconciliation* (solde leadsheet ⇄, total du détail, écart, état ; POP-01 inchangé), *Draw* (lignes, sorties statuées — MAT-03, ADR-133)) ; enums rendus via `etats.ts` (P4-12) ; `sampling.ts` paramétré par poste (plus de `'REVENUE'` en dur) ; `redirections.ts` pour `/sampling`, `/population`.
- **Acceptation.** Épreuves R-F20 (étape 2 : solde leadsheet ⇄, total du détail obtenu, écart, rapproché / non rapproché ; POP-01 continue de refuser le tirage tant que l'écart n'est ni nul ni expliqué — **station qui observe le refus**) et R-F21 (titre « Sampling » ; étape Methodology ; ni L0, ni L3, ni deterministic, ni Drawn à l'écran).

#### P4-07 · Testing dans le poste
- **Fichiers.** `.../testing/page.tsx` (déplacement de `/testing` + `/loop` ; logique inchangée ; paramétré par poste) ; `redirections.ts`.
- **Acceptation.** Toutes les stations de l'atelier réobservées sur la nouvelle route.

#### P4-08 · L'évaluation des risques (R-F18)
- **Fichiers.** `risk/page.tsx` réécrite selon §6.4 ; `risk-actions.ts` (`repondreAction` implicite au blur, `demanderAuClientAction` → `requests.creerDemandeExplication(question)` sur la demande permanente « Risk assessment questions » (créée à la première question), `declarerFacteurAction`, `retenirNiveauAction` avec `justification`) ; `questionnaire.ts`, `risk.ts` (P1-07) ; titres corrigés (AUD-21).
- **Acceptation.** Épreuve R-F18 verbatim : ordre (questions d'entité — une zone de texte par question, sauvegarde implicite, un bouton *Ask the client* par question — puis risques par assertion à deux colonnes) ; NRPMM sans justification → refus RISK-01 en toutes lettres (**station qui observe le refus**) ; provenance au survol ; aucune colonne de plus.

#### P4-09 · La vue d'ensemble unifiée (R-F4, S-5, AUD-19, AUD-21)
- **Fichiers.** `eng/[id]/page.tsx` (§6.2 ; `mesSections` dédoublonnée par priorité ; blocs repliables `<Repli>` ; blocs absorbés de /suivi et /dashboard ; bloc « À valider ») ; `sections.ts::mesSections` (une seule requête `union` avec priorité) ; `assurerSections` déplacé dans `creerMission` et `confirmScoping` (plus d'effet de bord au rendu) ; `/suivi`, `/dashboard` → redirections ; `/comite` → bloc de `/close`.
- **Acceptation.** Épreuve R-F4 : quatre blocs empilés, repliables, état mémorisé ; aucun identifiant dupliqué dans le rendu (test) ; S-5 : « Chiffre d'affaires » une fois.

#### P4-10 · Obstacles : plus une section (R-F5)
- **Fichiers.** `bandeau-refus.tsx` (rend une LISTE quand le refus porte `vars.obstacles[]`) ; `workpapers/[wid]/page.tsx::signAction` et `close/actions.ts::cloreAction` lèvent `Refus('VISA-05', 'refus.obstacles', {obstacles})` avec la liste nommée ; en-têtes (mission, poste) : compte discret ; `/obstacles` → redirection vers `/eng/[id]` ; `obstacles.ts` inchangé (la garde) ; la station « obstacles au visa » (qui lisait `/obstacles`) lit désormais le refus au clic *Seal* et le compte de l'en-tête (le couplage `restants` de `scenario.ts:4169` est remplacé par une lecture de `data-obstacles`).
- **Acceptation.** Épreuve R-F5 : aucune section « obstacles » dans le rail ni dans la page ; le geste *Sign* sur un dossier bloqué affiche la liste nommée et refuse (NOTIF-01 et les autres observés là) — station.

#### P4-11 · L'assistant et le geste d'envoi (R-F2, R-F3)
- **Fichiers.** `composants/assistant.tsx` (panneau latéral ; action `poserQuestionAction` → `query/ask.ts` + `notes/otto.ts::comprendre` ; historique en mémoire de page ; ligne « Replay adapter — recorded answers » quand la fabrique est en rejeu) ; bouton unique *Assistant* dans `eng/[id]/layout.tsx` (en haut à droite) ; `/ask` → redirection ; `composants/envoyer.tsx` (un contrôle *Send* → liste des membres → confirmer ; remplace le menu déroulant + flèche) sur les sections.
- **Acceptation.** Épreuve R-F2 (un seul contrôle, un panneau, absorbe *Ask the file*, dit le rejeu en une ligne ; station : ouvrir et poser une question) ; R-F3 : un seul contrôle pour envoyer ; verdict du fondateur sur capture (§20).

#### P4-12 · États, titres, reliquats (AUD-21, S-1, S-6, R-F15)
- **Fichiers.** `app/src/lib/etats.ts` (statut → libellé/classe/repère par objet : papier, demande, note, écart, échantillon ; « ouverte = non close » partout) ; les trois `WP_BADGE`/maps recopiées remplacées ; titres corrigés ; import JSON retiré (P4-04) ; `sample.status` via `etats.ts`.
- **Acceptation.** Même nombre de notes ouvertes sur la vue, /notes, le poste, /travaux (test) ; aucun `{` littéral dans les vues.

**Sortie de phase 4** : toutes les lignes R-F1..R-F21 OBSERVÉES (stations nommées, SHA), S-1, S-5, S-6 corrigées ; routes de poste servies ; anciennes routes en redirection ; `verify` vert ; `PARCOURS.json`/`LECTURES.json` refigés ; SHA confirmé.

### Phase 5 — Le monde hébergé, la langue, la palette, le retrait du factice

#### P5-01 · Le monde hébergé montre tout (AUD-06)
- **Fichiers.** `app/src/lib/flows/enrichir.ts` (étapes ADDITIVES et idempotentes nouvelles, chacune « si absent alors créer » : (1) cycler C-BR-01 sur le dossier SOX par les services de `part2.ts:103-138` — tâches, quatre facteurs, IUC, population dérivée et rapprochée, tirage, tests, déficience proposée ; (2) un entretien REVENUE avec `dataset/entretiens/transcript-revenus-2025.txt` déposé et analysé (rejeu → propositions) ; (3) un processus REVENUE avec `dataset/flowcharts/revenus-2025.png` déposé et comparé (rejeu → ≥ 1 différence proposée, « SAGE vs Oracle ») ; (4) une note de revue adressée à OTTO avec sa réponse) ; `app/scripts/deploy/reconstruire.ts` (l'enrichissement devient BLOQUANT : une étape en échec → `process.exit(1)` — comme `demo-enrichir.ts` ; lecture `/api/sante` « enrichissement : N/N étapes tenues au dernier build ») ; `dataset/fixtures/walkthroughs.json` et `entretiens.json` (le texte source vit dans `dataset/` ; la fixture cite le chemin ; `scenario.ts:4285` lit le fichier) ; écrans : `adaptateurCourant()` (fabrique) à la place de `process.env` (`processus/page.tsx:39`, `testing/page.tsx`, `rcm/[cid]`).
- **Acceptation.** Épreuve AUD-06 sur l'URL (lecture Supabase : `walkthrough > 0`, `process_interview > 0`, `interview_transcript > 0`, `proposition > 0`) ; `docs/CLOTURE.md`/`REVUE.md` distinguent désormais « observé en local » et « visible sur l'URL » (colonne `url: oui/non`).
- **Interdits respectés.** Aucun re-semis (`OTTO_RECONSTRUIRE` jamais posé) ; aucune IA vivante (rejeu) ; aucune donnée réelle.

#### P5-02 · Les relances : un geste, dit simulé (AUD-13)
- **Fichiers.** `requests.ts` (`ensureReminders` supprimée ; `echeancesDeRelance(engagementId)` en lecture pure ; `relancer(requestId, userId)` écrit `reminder channel='simule' status='sent'` + `event_log request.reminded`) ; `requests/page.tsx`, `requests/[rid]/page.tsx`, `dashboard` (retirés) : bouton *Send reminder (simulated)* ; catalogue : « Reminder log » sans « L1 » ; `scripts/relances.ts` (planifiable, non planifié sur l'hébergé).
- **Acceptation.** Épreuve AUD-13.

#### P5-03 · Anglais de bout en bout, refus au catalogue, données semées (R-F22, S-3, S-4, AUD-14)
- **Fichiers.** Codemod `app/scripts/refus/migrer.ts` (par fichier de service : chaque `throw new Error('<texte>')` → `throw refus('<CODE>', 'refus.<CODE>', vars)` ; codes : famille existante quand le texte en porte une, sinon `SVC-<n>` séquentiel documenté dans `REGISTRE_REFUS` ; clés `refus.<CODE>` en/fr générées avec le texte d'origine comme `fr` ou `en` selon sa langue, l'autre traduit) — exécuté par lots de fichiers, un lot par commit, `langue-refus.json` décroissant jusqu'à 0 ; `methodology/*.json` : `libelle_en`, `objectif_en`, `controle_en`, `population.libelle_en` (et les questions du questionnaire, les rubriques du papier) ; lecteur `libelleDe(objet, locale)` avec repli `fr` ; `app/src/lib/seed.ts`, `flows/part1.ts`, `part2.ts`, `enrichir.ts`, `dataset/*` : chaînes semées en anglais (noms de procédures, contrôles, processus, notes, `scoping_basis` — S-4 : le motif de descoping devient une ligne factuelle « Out of scope for this demonstration: only the revenue cycle is documented ») ; `tenant.locale = 'en'` pour le cabinet de démonstration (semé) ; garde `scripts/langue.ts` étendue : (a) refus (plafond → 0), (b) lecture « libellés semés non anglais » = balayage des colonnes de libellé des tables semées (`procedure_instance.title`, `control.name`, `process_model.name`, `process_step.libelle`, `review_note.text`, `request.title`, `request_item.description`, `fsli.scoping_basis`, `workpaper.title`, `engagement_milestone.label`) avec une liste de marqueurs français (`[àâçéèêëîïôûùüÿœ]`, mots vides `le la les des du une et pour dans`) — 0 attendu sur le monde `en` ; (c) enums bruts rendus (`etats.ts`) ; `<Depot>` remplace les `<input type="file">` nus (S-3).
- **Acceptation.** Épreuve R-F22 : la garde `langue` (0 hors catalogue) tient ; la nouvelle lecture compte les libellés semés non anglais sur le monde de démonstration et lit 0 ; `grep -c 'throw new Error' app/src/lib/services` = 0 ; aucune phrase d'un écran ne mélange les deux langues (station : balayage des 356 vues sans mot de la liste française).
- **Réversibilité.** Un cabinet francophone garde `tenant.locale='fr'` et les libellés `fr` de la méthode ; le monde de démonstration seul bascule (décision du fondateur, réversible d'un mot).

#### P5-04 · La palette (R-F6)
- **Fichiers.** `globals.css` uniquement — jetons clairs : `--bg #F5F6F8`, `--panel #FFFFFF`, `--border #E1E4E8`, `--border-strong #C9CED6`, `--text #1C2025`, `--muted #5B6470`, `--faint #7A8390`, `--accent #2457A6`, `--accent-soft #E8EFFA`, `--accent-hover #1B4382`, `--on-accent #FFFFFF`, `--green #2E7D4F`, `--green-soft #E6F2EA`, `--amber #B7791F`, `--amber-soft #FBF1DE`, `--red #B93838`, `--red-soft #F8E7E7`, `--gray-soft #EEF0F3`, `--row-hover #F2F4F7`, `--field #FFFFFF`, `--topbar #1C2025`, `--topbar-text #E8ECF1`, `--topbar-link #C4CCD6`, `--topbar-badge #33404F`, `--topbar-badge-text #F5C76A`, `--proposition-bg #FFF4B8`, `--proposition-border #E6C64A`, `--stale #6B7280`, `--radius 10px` ; sombre : `--bg #14171B`, `--panel #1C2025`, `--border #2A3038`, `--border-strong #3A424D`, `--text #E8ECF1`, `--muted #A5AFBB`, `--accent #7FA6E0`, `--accent-soft #1F2C40`, `--green #7FC49A`, `--amber #E0B46A`, `--red #E08A86`, `--proposition-bg #4A4118`, `--proposition-border #8A7A2E` ; `--violet`/`--violet-soft` supprimés (les 16 usages `badge violet` → `badge accent`) ; couleurs sémantiques réservées aux statuts (signé = green, en revue = amber, bloqué = red, périmé = `--stale`), jamais décoratives ; `globals.css.test.ts` : aucun jeton violet, aucune couleur hors jetons dans les composants.
- **Acceptation.** Épreuve R-F6 : aucune occurrence de violet dans les jetons ; `visuel` reshooté ; verdict du fondateur sur trois captures (tableau de bord, poste, papier) — §20. C'est la SEULE exception au gel H-6, nommée par le fondateur.

#### P5-05 · EPURE-01 devient bloquant
- `docs/instantanes/visuel-avertissements.json` : tous les plafonds à 0 ; `visuel` rougit sur tout motif ; les derniers sites (`samp.*L3`, `mat.proposeL3`, `test.runVouchingL0`, `rcmc.proposeDeficiencyL3`, `rec.tbGlReconciliationDeterministicL0`, `est.sameEngineAsTheRevenueSample`, `atl.*`, `prov.*`, `ask.regleDeterministe`, `notes/otto.ts:41` « (L0) », `sox.ts:1657` « (L3) », `sampling.ts:136` « (L3) ») réécrits sans échelle ; `docs/AUTOMATISATION.md` et `docs/IA_VIVANTE_SURFACE.md` gardent la doctrine (dans `docs/`, jamais dans un composant — §0.4).
- **Acceptation.** `npm run visuel` : 356 vues, 0 défaut, 0 motif ; le test « cas connu mauvais » injecte « Arbitrate » dans une page de test et rougit.

**Sortie de phase 5** : lignes R-F6, R-F22, S-3, S-4 OBSERVÉES (R-F6 avec verdict du fondateur consigné) ; AUD-06, AUD-13, AUD-14 fermés ; `langue` étendue = 0 ; EPURE-01 = 0 bloquant ; l'URL montre chaque capacité ; `verify` vert ; SHA confirmé.

### Phase 6 — Hardening, exploitation, CI

#### P6-01 · Concurrence (AUD-15)
- `workpapers/lifecycle.ts::editSection` et toute sauvegarde implicite : `where row_version = $n` → `row_version + 1`, refus CONCURRENCE-01 (« someone saved this paper after you opened it — reload ») avec le corps saisi conservé dans le formulaire ; index partiels (P1-08) ; `extraction/ladder.ts::extractAll` : une transaction par pièce, `ai_run` écrit avant le `logEvent` de résultat ; `archive.ts::sealFile` : l'archive est construite HORS transaction (octets en mémoire) puis enregistrée dans une transaction courte ; `events.ts` : inchangé (le verrou par mission reste, c'est lui qui interdit la fourche ; sa durée est bornée par les deux mesures précédentes) ; `OTTO_DB_POOL_MAX` documenté.
- **Acceptation.** Épreuve AUD-15 ; test de concurrence sur PGlite (deux transactions simulées) et, quand `OTTO_CI_DATABASE_URL` existe, sur Postgres réseau.

#### P6-02 · Chaîne ancrée, `migrate` transactionnel, base d'aperçu, CI complète (AUD-12, AUD-18)
- `0179_evenements.sql` (§7.10) ; `events.ts::ancrer(engagementId)` appelé par `sealFile` et par la sonde de santé ; lecture `/api/sante` « chaîne intacte depuis l'ancrage » (cas connu mauvais : rupture injectée en test → rouge) ; `db/migrate.ts` transactionnel : déjà livré en P1-00 (vérifier ici qu'il l'est sur le pilote réseau) ; `.github/workflows/verifier.yml` : rien de plus ; `parcours.yml` (P0-08) confirmé nocturne ; **gestes du fondateur** (§20) : base d'aperçu séparée (`DATABASE_URL` preview), `OTTO_CI_DATABASE_URL` — le plan prépare, ne pose pas ; `role-production.yml` inchangé.
- **Acceptation.** Épreuve AUD-18 (partie code) ; run vert de `parcours.yml` cité.

#### P6-03 · Le parcours sans sommeils fixes (AUD-17, reste)
- Remplacement progressif des 103 `waitForTimeout` et des délais explicites de `cliquer/soumettre` par des attentes sur `data-*` (`page.waitForSelector`, `expect.poll`) ; les stations couplées par variable partagée reçoivent une pré-condition par service (P0-04) ; objectif : `npm run clics` complet < 25 min et chaque station rejouable seule.
- **Acceptation.** `grep -c waitForTimeout scenario.ts` = 0 ; durée mesurée dans `docs/CLICS.md`.

#### P6-04 · Préparation de PLAN_RLS étape 3 (jamais exécutée)
- `docs/PLAN_RLS.md` mis à jour avec les tables et politiques nouvelles (0170–0180) ; `assertions-role.ts` connaît les nouvelles tables ; `tenant.test.ts` couvre `proposition` et `control_fsli` sous un rôle sans BYPASSRLS ; **l'étape 3 reste interdite** sans mandat écrit qui la nomme.

**Sortie de phase 6** : AUD-15, AUD-17, AUD-18 (partie code) fermés ; `verify` vert ; `parcours.yml` vert ; lectures `/api/sante` : chaîne, session, enrichissement, écritures nues, propositions.

### Phase 7 — Finition, registres, suppression du mort

#### P7-01 · Documents et registres (AUD-23, AUD-24)
- `DEPLOY.md` §1–§2 réécrits depuis `reconstruire.ts`, `client.ts`, `storage.ts` (root = racine ; `OTTO_STORAGE ∈ {fs, db}` ; migrations par le build, jamais `psql -f` ; `otto_tenant()` = `current_setting`) ; `MIGRATIONS_BANDES.md` (0040–0119 : « réservées, jamais construites » — ADR) ; `CLAUDE.md §5` et règle 35 ; `docs/GESTES_FONDATEUR.md` : retirer « engendré » ou l'engendrer ; `DEMO_APP.md` réécrit sur la nouvelle navigation (poste, sous-sections, propositions, notes) ; `docs/04` (engendré, P1-08) ; `docs/03_ARCHITECTURE.md` : §5 provenance complété par la proposition ; ADR : proposition, sections, processus canonique, visa-contenu, deux horloges, ADR-103 amendé, palette, anglais de démonstration.

#### P7-02 · Suppression du mort
- `redirections.ts` retiré (les stations et les figés ne citent plus les anciennes routes) ; routes supprimées : `/dashboard`, `/suivi`, `/provenance`, `/loop`, `/analytique`, `/processus`, `/obstacles`, `/notifications`, `/kanban`, `/ask`, `/sampling`, `/population`, `/testing`, `/poste/[code]/detail-compte`, `/comite` ; code mort : `attribuerAction` (ou son écran), `destinationsDuPoste`, `VuePoste.boucle`, `ia-flag.tsx`, `FSLI_DU_CYCLE`, `ensureReminders`, `NIVEAU_ACTUEL`, `client_contact.portal_token` (colonne retirée par `0181_retrait_jeton_clair.sql`) ; `screens`/`lectures`/`parcours` refigés.

#### P7-03 · L'inventaire vide
- `docs/REVUE.md` : 0 NON OBSERVÉE ; `docs/BACKLOG_REPORTE.md` : une entrée R-nn par AUD-19..25 non traité et par P3 de l'audit, avec « reporté le … motif … » ; `STATUS.md` : la tranche finale ; `docs/CLOTURE.md` régénéré ; la phrase « l'inventaire est vide » écrite, et l'agent s'arrête.

---

## 14. Dépendances (Dependencies)

```
P0-00 inventaire ──┐
P0-01..P0-08 ──────┴─▶ (verify vert) ─▶ Phase 1
P1-00 migrate transactionnel ─▶ toute migration 0170+
P1-01 proposition ─▶ P1-02 notes (review_note_reply.proposition_id) ─▶ P3-01, P3-02, P3-05, P4-03, P4-04, P4-08
P1-03 processus/contrôles ─▶ P4-03, P4-04, P4-05, P5-01
P1-04 visa ─▶ P2-02, P3-04
P1-05 verrou générique ─▶ P2-04
P1-06 supersede ─▶ P3-01 (applicateurs extraction/matérialité), P4-06
P1-07 risque ─▶ P4-06 (taille), P4-08
P1-08 index/row_version ─▶ P6-01 ; docs:modele ─▶ P7-01
P1-09 Refus ─▶ P2-* (refus nommés), P4-10 (liste d'obstacles), P5-03 (masse)
P1-10 verbes/écritures nues ─▶ P2-* (0 écriture nue), P6-02 (ancrage)
P2-03 session ─▶ P5-01 (le semeur pose un cookie signé pour le harnais : aucun changement), P6-04
P3-01 composant ─▶ P3-03, P4-04, P4-06, P4-08
P3-02 panneau/notes/otto ─▶ P4-* (layout-section), P5-01 (note à OTTO semée)
P4-01 rail ─▶ P4-02 ─▶ P4-03..P4-07
P4-02 routes ─▶ P4-06, P4-07 (déplacements)
P4-12 etats.ts ─▶ P5-03 (enums)
P5-03 refus 0 ─▶ P5-05 EPURE bloquant
P5-01 monde hébergé ─▶ REVUE « url: oui »
P6-* ─▶ P7-*
```
Dépendances externes (§20) : `OTTO_SESSION_SECRET` (P2-03 : sans lui, lecture rouge mais rien ne casse) ; base d'aperçu et `OTTO_CI_DATABASE_URL` (P6-02) ; verdicts visuels (P4-11, P5-04).

---

## 15. Critères d'acceptation (Acceptance criteria)

Les critères sont ceux des ÉPREUVES du mandat (§1, verbatim) et des épreuves de `docs/AUDIT.md` (§1 de l'audit), repris ligne à ligne dans `docs/REVUE.md`. Une ligne passe à OBSERVÉE seulement avec : une station de `scenario.ts` nommée, un run réel consigné dans `docs/CLICS.md`, le SHA. Règles transverses, valables pour toute ligne :
1. **Le refus est vu refuser** sur le monde SEMÉ tel qu'il est (règle 37) ; pour toute ligne qui retire un affichage, la station observe la garde refuser ENCORE après.
2. **Aucune assertion `true`** ; toute assertion compare avant/après ou lit un refus par code.
3. **La ligne est visible sur l'URL** (colonne `url`) quand elle concerne un écran ; sinon elle le dit.
4. **Deux réfutateurs** pour toute ligne qui touche le modèle, la sécurité, le multi-locataire ou un code de refus ; un sinon (règle 30).
5. **Le SHA servi est confirmé** dans le même compte rendu que les mesures (mandat du 18 septembre).

Correspondance ligne → tâche (extrait ; la table complète vit dans `docs/instantanes/revue.json`) : R-F1 → P4-01 · R-F2 → P4-11 · R-F3 → P4-11 · R-F4 → P4-09 · R-F5 → P4-10 · R-F6 → P5-04 · R-F7 → P1-02, P3-02 · R-F8 → P1-04, P3-04 · R-F9 → P3-04 · R-F10 → P3-03 · R-F11 → P4-01, P4-02 · R-F12 → P4-02 · R-F13 → P1-03, P4-04 · R-F14 → P1-03, P4-03 · R-F15 → P4-04 · R-F16 → P1-03, P4-04, P5-01 · R-F17 → P1-03, P4-05 · R-F18 → P1-07, P4-08 · R-F19 → P1-01, P3-01 · R-F20 → P4-06 · R-F21 → P1-07, P4-06 · R-F22 → P5-03 · S-1 → P0-05 · S-2 → P1-04, P3-04 · S-3 → P4-03, P5-03 · S-4 → P5-03 · S-5 → P4-09 · S-6 → P4-04 · AUD-01 → P1-01 · AUD-02 → P1-02 · AUD-03 → P1-03 · AUD-04 → P2-01 · AUD-05 → P1-04, P2-02 · AUD-06 → P5-01 · AUD-07 → P2-03 · AUD-08 → P1-05, P2-04 · AUD-09 → P1-04, P3-04 · AUD-10 → P1-06 · AUD-11 → P1-07, P4-06, P4-08 · AUD-12 → P1-10, P6-02 · AUD-13 → P5-02 · AUD-14 → P1-09, P5-03 · AUD-15 → P1-08, P6-01 · AUD-16 → P0-01, P0-02, P0-05 · AUD-17 → P0-03, P0-04, P6-03 · AUD-18 → P0-08, P5-01, P6-02.

---

## 16. Stratégie de test (Testing strategy)

**Quatre niveaux, chacun avec son cas connu mauvais (règle 17).**
1. **Base** (`vitest`, PGlite en mémoire par fichier) : chaque garde SQL neuve est prouvée en deux passes dans `gardes/gardes.test.ts` (l'attaque refusée par ELLE, puis réussie quand elle est neutralisée) et enregistrée dans `gardes/registre.ts` ; chaque service neuf a son fichier de test avec : le chemin nominal, chaque refus nommé, l'étanchéité (membre étranger), le verrou (dossier scellé), l'événement écrit (verbe du registre).
2. **Écrans** (`npm run screens`, build de PRODUCTION) : toutes les routes, y compris les sous-sections de poste ; `visuel` étendu (statut, texte, EPURE-01, gabarits).
3. **Parcours** (`npm run clics`) : une station par ligne d'inventaire, écrite SANS `waitForTimeout`, avec pré-condition par service, rejouable seule (`--station`) ; chaque station assert une VARIATION ou un refus par code ; les refus sont observés sur le monde semé (règle 37).
4. **Gardes statiques** (à la pousse, CI `local`) : `langue` (chrome + refus + libellés semés), `lectures`, `parcours`, `plancher`, `gardes`, `semeur`, `docs:modele:epreuve`, « écritures nues », « pas de `new Date()` », « pas de `dire(…, true)` », « pas de `throw new Error` dans services », « pas de jeton violet », « couverture d'étanchéité par écriture », « couverture du verrou ».

**Cadence.** `verify:tranche` (< 20 min) pendant la construction ; `verify` complet UNE fois par rituel sur l'arbre figé (règle 34), sous `timeout 7200` avec `set -o pipefail` (règle 35) ; jamais deux harnais sur la même base (règle 7 de `CLAUDE.md §7`).

**Réfutateurs.** Deux voix indépendantes par rituel qui touche le modèle, la sécurité, le multi-locataire ou un code de refus (Phases 1, 2, G3/G4 de la phase 4) ; une voix sinon. Leur mandat : emprunter le chemin (cliquer, requêter), jamais grep seul ; chercher d'abord « une garde a-t-elle été affaiblie par la simplification d'écran ? » ; constats énumérés avec identifiant, état, SHA de correction ; fichiers de sonde supprimés avant le commit.

**Mesures engendrées.** `docs/CLICS.md`, `docs/instantanes/{verify,parcours,visuel-avertissements,langue-refus,ecritures-nues,revue}.json`, `docs/REVUE.md`, `docs/REPRISE.md` — aucun chiffre en prose que le script n'a pas produit (règle 21) ; aucun horodatage inventé (règle 31).

---

## 17. Protection contre les régressions (Regression protection)

- **La garde derrière l'écran** : toute tranche qui retire un affichage, une colonne, une section ou un bouton livre dans le MÊME rituel une station qui observe le refus correspondant sur le monde semé : R-F5 (obstacles) ↔ *Seal* refusé avec la liste ; R-F19 (Arbitrate) ↔ modification tracée ; R-F10 (boutons) ↔ ANA-01/ANA-03 ; R-F18 (colonnes) ↔ RISK-01 ; R-F21 (« Drawn ») ↔ POP-01 ; R-F15 (import JSON) ↔ le semeur importe encore ; R-F12 (Open …) ↔ les compteurs mènent encore quelque part (R60).
- **Les 26 gardes existantes** restent au registre ; `gardes.test.ts` rejoue leurs attaques à chaque suite ; une garde retirée est dénoncée par son nom (test existant).
- **Les stations existantes** ne sont jamais supprimées : déplacées (nouvelle route) ou réécrites avec un prédicat plus fort ; `PARCOURS.json` est refigé à chaque rituel et sa liste « jamais conduites » est lue.
- **Les listes figées qui ne peuvent que baisser** : `#418`, EPURE-01, `langue-refus`, `ecritures-nues`, tests non exécutés — un test rougit si un plafond monte sans une `raison` datée.
- **Les redirections** des anciennes routes vivent en un seul fichier jusqu'en Phase 7 ; `screens` balaie les anciennes ET les nouvelles jusqu'à leur retrait.
- **Les migrations** : jamais éditées ; empreintées ; `migrate` transactionnel ; les migrations de données (`*b_*.ts`) sont idempotentes et testées sur une base semée puis rejouées.
- **Le monde hébergé** : jamais re-semé ; enrichissement additif bloquant ; lecture de santé « enrichissement N/N ».
- **La démonstration reste signable** (règle 25) : NOTIF-01 sur `proposition` est rejoué jusqu'à la clôture (règle 37) à la fin des phases 1, 3, 4, 5.
- **Le figé des lectures** (`LECTURES.json`, 1 990 chemins de champs) est refigé à chaque tranche qui renomme un champ ; le renommage d'un `data-*` lu par une station est un changement de contrat : la station est mise à jour dans la même tranche.

---

## 18. Checklist qualité finale (Final quality checklist)

- [ ] `docs/REVUE.md` : 0 NON OBSERVÉE ; chaque OBSERVÉE cite station + SHA + `url`.
- [ ] `set -o pipefail; timeout 7200 npm run verify | tee …; echo EXIT=$?` → `EXIT=0` sur HEAD ; `docs/REPRISE.md` §5 au HEAD pour les 18 commandes.
- [ ] `/api/sante` sur l'URL : `sha` = HEAD ; lectures vertes : propositions, notes sans section = 0, visas, verrou (couverture 100 %), écritures nues = 0, session signée, chaîne intacte, enrichissement N/N, certificat.
- [ ] EPURE-01 = 0 (bloquant) ; `langue` (chrome, refus, semés) = 0 ; `throw new Error` dans services = 0 ; `new Date()` dans services = 0 ; `dire(…, true)` = 0 ; `waitForTimeout` = 0 ; jeton violet = 0.
- [ ] `docs/04_DATA_MODEL.md`, `GUARDS.md`, `SEMEUR_VS_CHEMIN.md`, `CLOTURE.md`, `AUDIT.md`, `REVUE.md` engendrés sans diff ; `DEPLOY.md`, `MIGRATIONS_BANDES.md`, `CLAUDE.md §5` corrigés ; `DEMO_APP.md` réécrit.
- [ ] Sur l'URL : rail sans poste hors périmètre ; poste REVENUE avec ses sous-sections ; un processus avec flowchart client et ≥ 1 différence surlignée ; un entretien avec transcript lisible ; la mini-RCM ; Sampling en quatre étapes ; /risk en deux blocs ; cartes de visa rôle + initiales ; panneau de notes à droite ; Assistant en haut à droite ; anglais de bout en bout ; palette sans violet.
- [ ] Sécurité : PORTAIL-01/02, ETANCH-04, VISA-01..05, EQUIPE-01, DEMO-01, VERROU-01/02, BLOB-02, SESSION observés ; remise à zéro anonyme impossible.
- [ ] Interdits intacts : PLAN_RLS étape 3 non exécutée ; aucune IA vivante sur l'hébergé ; `DATABASE_URL` intouchée ; aucun re-semis ; aucune dépense ; aucune donnée réelle ; clé jamais imprimée (`keyFingerprint` = longueur seule).
- [ ] Registres : `BACKLOG_REPORTE.md` porte les AUD P2/P3 non traités ; `REGISTRE_IDEES.md` inchangé ; ADR écrits (proposition, sections, processus canonique, visa-contenu, deux horloges, ADR-103 amendé, palette, anglais).
- [ ] Verdicts du fondateur consignés (R-F3, R-F6) ; gestes du §20 listés avec leur état (fait / en attente).

---

## 19. Instructions explicites à Claude Code (Explicit instructions)

**À faire, sans exception.**
1. Lire `CLAUDE.md` en entier avant chaque session ; relancer `npm run reprise` ; lire `docs/REVUE.md` ; prendre la prochaine tâche `Pn-mm` de la phase ouverte.
2. Une tranche = une ou plusieurs tâches d'un même groupe ; un rituel = `verify` complet sur l'arbre figé + réfutateur(s) + push + SHA servi confirmé au tour suivant (règle 36 : enchaîner, ne jamais attendre).
3. Toute écriture nouvelle passe par `executer()` → service → `logEvent` (verbe du registre) ; tout refus est un `Refus` du registre ; toute proposition passe par `propositions.proposer()` ; toute note par `notes.poserNote()` avec section et ancre ; tout écran de mission déclare sa section.
4. Toute suppression d'affichage livre la station qui observe la garde refuser encore.
5. Toute migration est nouvelle, idempotente, numérotée dans la bande 0170+, accompagnée de RLS, verrou, index, test en deux passes, lecture `/api/sante`, et du `docs/04` régénéré.
6. Les listes figées (plafonds) ne montent jamais ; les instantanés sont engendrés ; aucun chiffre en prose non produit par un script ; aucun horodatage inventé.
7. Écrire en français dans le code, les commits, les documents et les libellés `fr` ; l'anglais est la langue du **monde de démonstration** et des libellés `en` — pas celle du dépôt.
8. Quand une décision manque ici, chercher d'abord dans `CLAUDE.md`, le mandat et `docs/DECISIONS.md` ; si elle manque vraiment, la prendre, l'écrire dans `docs/DECISIONS_AUTONOMES.md` (D-P2-nn) avec sa raison, et continuer — ne pas s'arrêter (règle 32), sauf interdit.

**À ne pas faire — ambiguïtés levées d'avance.**
- **Ne pas retirer une garde parce que son affichage disparaît.** §0.1 retire l'affichage permanent ; la donnée, la garde, le refus et l'événement restent. Exemple : supprimer la section « obstacles » (R-F5) ne touche pas `obstacles.ts`.
- **Ne pas construire le motif de proposition par écran.** Il existe UN composant `<Proposition>` et UNE table ; un écran qui affiche une proposition sans le composant est une régression (test : `data-ia-prepare` n'existe plus ; `data-proposition` seulement).
- **Ne pas dériver la section d'une note.** `section_id` est posé à la pose ; jamais recalculé.
- **Ne pas supprimer `review_note.workpaper_id`** : un papier EST une section (`papier`).
- **« Une sous-section à la fois » veut dire des ROUTES**, pas un accordéon sur une page : `/poste/[code]/<sous-section>`.
- **Ne pas traduire le catalogue `fr`** : R-F22 bascule le MONDE DE DÉMONSTRATION (`tenant.locale='en'`, libellés `en` de la méthode, données semées en anglais) ; le catalogue `fr` reste intact pour un cabinet francophone.
- **Ne jamais re-semer la démonstration publique** (interdit) : `OTTO_RECONSTRUIRE` n'est jamais posé ; l'hébergé se complète par enrichissement additif.
- **Ne jamais exécuter l'étape 3 de PLAN_RLS**, ne jamais toucher `DATABASE_URL` ni une variable de production ; ne jamais activer une IA vivante sur l'URL ; les variables du §20 sont posées par le fondateur.
- **Ne jamais éditer une migration appliquée** ; la « ligne dans `_migrations` sur quelque base que ce soit » est le critère (règle 26).
- **`L3` n'existe pas** ; une proposition est L2 ; aucun libellé d'échelle à l'écran.
- **L'horloge de démonstration n'est pas un défaut** : deux horloges NOMMÉES (métier / système) ; `new Date()` est interdit dans les services.
- **EPURE-01 n'est pas bloquant avant la Phase 5** : avertissement compté avec plafond figé, sinon aucun rituel ne peut aboutir avant que tous les écrans soient réécrits.
- **Un rituel par groupe d'écran**, jamais par micro-tranche, jamais par ligne quand deux lignes touchent le même écran.
- **Ne pas supprimer une station** : la déplacer ou la renforcer ; ne pas supprimer une route sans redirection jusqu'en Phase 7.
- **Ne pas supprimer de données en migration** : les notes flottantes sont ré-ancrées, les doublons refusés avec leur liste, les `risk.level` déduits passent à `null` (et l'événement le dit).
- **Ne pas inventer de constante** : l'échelle de risque, les tailles, les paramètres de sondage viennent de `methodology/*.json` avec `verifie` ; une valeur non fournie s'affiche « unverified parameter — to be set by the firm » et refuse ce qui en dépend (règle 8).
- **Ne pas réécrire `rcm/[cid]/page.tsx`** (938 lignes) : il reçoit les composants partagés (propositions, notes, visas) et devient la cible des liens de Controls ; sa refonte n'est pas dans ce mandat.
- **Ne pas confondre `process` et `process_model`** : `process_model` est le processus canonique ; `process` (0002) reste une table de compatibilité pour `control.process_id` jusqu'à ce que `control.process_model_id` soit posé partout (backfill P1-03) ; aucune nouvelle écriture dans `process`.
- **Ne pas persister une conversation d'assistant** : les questions/réponses qui touchent le dossier passent par des notes et des propositions.
- **Ne pas ajouter de dépendance de production.**
- **Ne pas écrire de mot d'identifiant de modèle nouveau** dans un artefact poussé (interdit) ; les adaptateurs gardent leurs défauts.
- **Ne pas s'arrêter pour demander** ce que ce plan ou le mandat a déjà tranché ; s'arrêter seulement sur un interdit ou un geste du §20.

**Ce que Claude Code doit rendre à la fin de chaque phase** : le compte rendu engendré (`docs/REPRISE.md`), la liste des lignes de `docs/REVUE.md` passées OBSERVÉES avec station et SHA, les constats des réfutateurs énumérés, les commandes de `verify` non exécutées nommées (aucune, sinon la phase n'est pas close), le SHA servi mesuré, et les gestes du §20 en attente.

---

## 20. Ce qui exige une main humaine (Items requiring human input)

Seuls gestes que ce plan ne peut ni prendre ni simuler. Tout le reste est tranché ici.

| # | Geste | Quand | Ce que le plan fait en attendant |
|---|---|---|---|
| H-1 | Poser `OTTO_SESSION_SECRET` dans Vercel (production + preview) | Phase 2 (P2-03) | Le cookie reste signable en local ; sur l'URL, `/api/sante` lit « session non signée » en rouge ; rien ne casse |
| H-2 | Base Supabase d'aperçu séparée (`DATABASE_URL` pour `preview`) | Phase 6 (P6-02) | Les aperçus continuent d'écrire sur la base publique ; l'enrichissement bloquant et `migrate` transactionnel limitent le risque |
| H-3 | `OTTO_CI_DATABASE_URL` (base de CI, rôle `otto_ci`) | Phase 6 | `role-production.yml` reste rouge et le dit |
| H-4 | Verdict sur trois captures de la palette (tableau de bord, poste, papier) | Phase 5 (P5-04) | Les jetons du §7 P5-04 sont posés ; le verdict peut demander UNE retouche de jetons (pas un lot H-6) |
| H-5 | Verdict sur le contrôle *Send* (R-F3) et sur le mot exact du titre « Changes since N-1 » (R-F14) | Phase 4 | Les formes du §6 sont livrées ; un mot du fondateur les change |
| H-6 | Décision de maintenir l'anglais de démonstration (réversible d'un mot, mandat R-F22) | Phase 5 | Le plan le tient pour acquis |
| H-7 | (Hors phase 2) Mandat écrit nommant l'étape 3 de PLAN_RLS ; mandat sur la RCM `rcm/[cid]` ; mandat sur les postes du Lot 5 sans atelier (R98/R99/R100) | jamais sans mandat | Préparés, consignés au registre |
| H-8 | `OTTO_SANTE_TOKEN` (optionnel) pour le détail de la sonde | Phase 2 | Sans lui, le détail est désactivé ; la CI lit le corps public |

---

## Annexe A — Angles morts du plan, examinés avant de le figer (auto-critique)

1. **Le composant unique peut devenir un goulot** : douze sites, des formes de valeur différentes (nombre, texte long, select, ligne de tableau). Réponse : `<Proposition rendu=…>` porte quatre rendus fermés ; un cinquième rendu exige une décision D-P2-nn écrite, pas un composant parallèle.
2. **Double vérité pendant la transition** (colonnes de statut ↔ `proposition`) : entre P1-01 et la fin de P3-01, les deux existent. Réponse : la lecture `/api/sante` « propositions » compare les deux comptes et rougit s'ils divergent ; les applicateurs sont le seul écrivain des colonnes de statut dès P1-01.
3. **La bande 0170–0181 est large** (12 migrations) : le risque est un build Vercel qui s'arrête à mi-bande sur la base publique. Réponse : `migrate()` transactionnel est la PREMIÈRE tâche de la phase 1 (P1-00), avant toute migration de la bande ; les migrations de données `*b_*.ts` sont idempotentes.
4. **Les routes de poste multiplient les vues de `visuel`** (≈ 10 sous-sections × 4 vues × 9 postes) : le run s'allonge. Réponse : `visuel` ne balaie que les sous-sections OFFERTES par le rail (celles qui existent pour le poste), et REVENUE en entier.
5. **Le dossier SOX** (engSox) n'a pas de poste travaillé : la navigation par poste ne le sert pas. Réponse : `/rcm` reste au rail transverse pour lui ; ses stations sont inchangées ; aucune sous-section de poste n'est créée sans contenu.
6. **`section_state` porte déjà `owner/holder`** ; en faire la clé des sous-sections crée des sections sans porteur. Réponse : `owner/holder` restent facultatifs ; « Mon travail » ne liste que les sections de niveau `poste`/`papier`/`mission.*` avec porteur, jamais les sous-sections.
7. **Le harnais et le cookie signé** : si `run.ts` posait le cookie à la main, la signature le casserait. Vérifié : il passe par `/demo/<prénom>` (route qui signe) — aucun changement.
8. **`sha256()` en SQL sur PGlite** (0178) : incertain. Réponse : backfill en TypeScript (`*b_*.ts`), jamais en SQL dépendant d'une extension.
9. **La traduction de 335 refus** est du travail répétitif où l'agent peut dériver (codes incohérents). Réponse : codemod par script (P5-03) + registre unique + revue par lot ; les familles existantes priment ; un code neuf sans entrée de registre fait échouer `tsc` (type `Code` fermé).
10. **R-F22 et le contenu de la méthode** : ajouter `libelle_en` à 218 entrées à la main invite l'erreur. Réponse : script d'assistance (liste des entrées sans `_en`) + validateur `valider.mjs` qui exige `_en` pour le pack de démonstration seulement.
11. **Le rituel par groupe** peut masquer une ligne non observée dans un groupe vert. Réponse : `docs/REVUE.md` reste par ligne ; le script refuse OBSERVÉE sans station nommée PAR LIGNE.
12. **La phase 0 pourrait absorber des semaines** (le #418 est chassé depuis août). Réponse : P0-01 éprouve H en un jour ; s'il ne suffit pas, P0-02 classe et l'on avance — la phase 0 est bornée à trois rituels ; le #418 résiduel reste un fil de `docs/CHASSE.md`, pas un bloqueur.
13. **La suppression de `/notifications`** touche des stations NOTIF-01 observées deux fois par réfutation. Réponse : redirection + stations pointées sur le bloc dans la MÊME tranche (P3-05), réobservées jusqu'à la clôture (règle 37).
14. **Ce plan a été écrit sans exécuter le code** (lecture seule, audit §4) : les durées, la faisabilité de `sha256` SQL, le comportement de `pool.query` multi-ordres et l'exploitabilité de BLOB-02 sont des lectures, pas des mesures. Chaque tâche concernée commence par la mesure (règle 18).

## Annexe B — Le message d'ouverture de la phase C pour Claude Code (à coller à l'ouverture de la session d'exécution)

```
PHASE 2 — PHASE C OPENS. Read, in this order and in full: CLAUDE.md;
docs/MANDATS/2026-09-20_plan_maitre_phase2.md (the master plan — it is the
reference for everything below); docs/MANDATS/2026-09-20_mandat_revue_fondateur_phase2.md;
docs/AUDIT.md; then run `cd app && npm run reprise` and read docs/REPRISE.md,
docs/CHASSE.md, the first 200 lines of STATUS.md.

The plan has already decided the architecture, the data model, the UX, the
order and the acceptance criteria. Execute it integrally, phase by phase,
task by task (P0-00 … P7-03). Do not re-derive it. Where the plan and the
mandate differ, the mandate wins; where the plan and CLAUDE.md differ,
CLAUDE.md wins. Decisions the plan leaves open are yours: take them, write
them in docs/DECISIONS_AUTONOMES.md (D-P2-nn) with the reason, and continue.

START WITH P0-00: build docs/REVUE.md (generated, one line per R-F1..22,
S-1..6 — all six are confirmed by the audit, none is SANS OBJET — and
AUD-01..18). AUD-19..25 and the audit's P3 list go to BACKLOG_REPORTE.md as
new R-nn entries citing docs/AUDIT.md. Commit it, report the counts.

Then Phase 0 (the proof chain), and only when its exit criterion is measured
— `set -o pipefail; timeout 7200 npm run verify | tee …; echo EXIT=$?` gives
EXIT=0 on HEAD, PARCOURS.json re-frozen, `clics --station` working — open
Phase 1. One shipping ritual per screen group (plan §0.4), never per
micro-slice; full verify once per ritual on the frozen tree; two hostile
reviewers on anything touching the data model, security, tenancy or a
refusal code; served SHA confirmed in the same follow-up.

EVERY TRANCHE THAT REMOVES A DISPLAY SHIPS THE STATION THAT WATCHES THE GUARD
BEHIND IT STILL REFUSE, on the world as it is seeded (rule 37). A screen made
simpler at the cost of a guard is a regression.

Unchanged: demoPublique stays; no live AI on the hosted URL; never reseed
the public demo; PLAN_RLS step 3 never; DATABASE_URL and production
variables untouched (the founder poses the variables listed in plan §20);
no real data, no paid service, no new model identifier in a pushed artefact,
the key never printed. Rules 34, 35, 36 hold.

When docs/REVUE.md has no NON OBSERVÉE line left, say so and stop.
```
