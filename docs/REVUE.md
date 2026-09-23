<!-- ENGENDRÉ par `cd app && npm run revue` — ne pas éditer à la main. -->
# Inventaire de la phase 2 — chaque épreuve du fondateur et de l'audit, mesurée

Mandat du 2026-09-20 — `docs/MANDATS/2026-09-20_mandat_revue_fondateur_phase2.md`, §1 (R-F1..22, verbatim du fondateur avec épreuve), §2 (S-1..6, observations du superviseur). Audit du 2026-09-20 (SHA `5336095`) — `docs/AUDIT.md`. AUD-01..AUD-18 = P0/P1, seuls repris ici (mandat §5.1). AUD-19..25 (P2) et le registre P3 (R3-01..R3-10) vont dans docs/BACKLOG_REPORTE.md.

**46 lignes — 0 OBSERVÉE(S), 46 NON OBSERVÉE(S), 0 SANS OBJET (0 % observé).**

**12/54 tâches du plan livrées** — comptées en direct sur `docs/MANDATS/2026-09-20_plan_maitre_phase2.md` (en-têtes `#### PN-NN`), jamais un chiffre fixe (règle 31). « Livrée » veut dire poussée sur `main`, SHA mesuré — PAS la même chose qu'OBSERVÉE ci-dessus (une tâche livrée peut encore attendre sa station cliquée).

Cet instantané a été ENGENDRÉ à l'ouverture de la Phase 2 (2026-09-20), quand les 46 lignes étaient NON_OBSERVEE par construction — aucune tranche n'avait encore été livrée. Depuis, des tâches ont été poussées sur main (voir « tâches livrées » ci-dessus et sur chaque ligne concernée) SANS que cela fasse encore passer une ligne à OBSERVEE : une ligne ne passe à OBSERVEE que lorsqu'une station cliquée la prouve, avec sa station et son SHA nommés (règle 12/15/37, acceptation P0-00) — livrée n'est pas observée, les deux comptes restent distincts et se lisent l'un à côté de l'autre, jamais confondus.

OBSERVÉE signifie observé en CONDUISANT le vrai parcours dans le monde semé — une station de `app/scripts/clics/scenario.ts`, confirmée par une exécution réelle, avec son SHA (règle 15/37 : un balayage de texte n'est pas une garde, chercher un mot n'est pas vérifier un chemin).

---
## Phase 0

### S-1 — Un gabarit a fui (mandat §2 — tâche(s) `P0-05`)

Épreuve : Aucun `{…}` non résolu dans aucune des 356 vues — garde mécanique, ajoutée à visuel.

**NON OBSERVÉE**
Manque : non commencé — confirmé et généralisé par l'audit (AUD-22) : traduire() ne dénonce pas une variable manquante, le gabarit {nom} de proc.diagramme fuit à l'écran aujourd'hui.
Tâches livrées : `P0-05` `04266c6`

### AUD-16 — `npm run verify` n'est plus vert d'un tenant (#418, sommeils) (AUDIT — tâche(s) `P0-04`, `P0-05`, `P0-06`, `P0-07`, `P0-08`)

Épreuve : `set -o pipefail; timeout 7200 npm run verify | tee v.log; echo EXIT=$?` rend EXIT=0 ; docs/PARCOURS.json porte ≥ 320 conduites datées du jour ; corriger S-1 sans toucher la station la fait rougir, puis vert une fois la station corrigée.

**NON OBSERVÉE**
Manque : P0-01 livré et mesuré (7ab4700) : le marqueur d'hydratation fonctionne (0 repli de grâce sur 177 aller(), docs/CHASSE.md F60) mais #418 persiste (classe /rcm/[cid]). P0-02 livré et mesuré VERT (1666736, docs/CHASSE.md F61) : `npm run clics -- --figer` réussit (326 étapes, 0 échec, rail-astuce-hydratation : 4 admis au plafond, docs/PARCOURS.json figé à 325 stations) — deux revues hostiles indépendantes ont corrigé une course d'ordre (HIGH) et une lacune sur les propriétés CSS sans unité (MEDIUM) avant le push. `npm run clics` seul n'est cependant pas `npm run verify` : P0-05 (traducteur, EPURE-01) et les tâches P0-04/06/07/08 restent à livrer avant que `EXIT=0` sur la chaîne complète soit atteignable.
Tâches livrées : `P0-04` `2d149a7` ; `P0-05` `04266c6` ; `P0-06` `091d046` ; `P0-07` `4b87c64` ; `P0-08` `c833c23`

---

## Phase 1

### AUD-01 — Aucun modèle unifié de « proposition » (AUDIT — tâche(s) `P1-01`)

Épreuve : Proposer une revue analytique, fermer l'onglet, rouvrir : la proposition est encore là, surlignée, comptée par NOTIF-01 ; l'accepter écrit decided_by et une version fsli_analytique ; `select count(*) from proposition where status='proposee'` = nombre de surlignages à l'écran = compte NOTIF-01.

**NON OBSERVÉE**
Manque : non commencé — la table `proposition` (P0, taille L, refonte) et le service propositions.ts n'existent pas. Deux réfutateurs requis (colonne vertébrale du modèle).
Tâches livrées : `P1-01` `82b9f6a`

### AUD-02 — Les notes de revue n'ont pas de notion de section (AUDIT — tâche(s) `P1-02`)

Épreuve : Poser une note sur une cellule de leadsheet ; ouvrir le panneau de la section Chiffre d'affaires : elle y est, un clic sur la note fait défiler jusqu'au marqueur ; une note sur un écart mène à /exceptions#x-<id> ; `select count(*) from review_note where scope='audit' and anchor_kind is null` = 0.

**NON OBSERVÉE**
Manque : non commencé — `review_note.section_id` n'existe pas ; les ancres sont figées dans un CHECK et un switch. Deux réfutateurs requis (colonne vertébrale du modèle).
Tâches livrées : `P1-02` `94116c7`

### AUD-03 — Le contrôle interne « d'un poste » n'existe pas dans le modèle (AUDIT — tâche(s) `P1-03`)

Épreuve : Créer deux processus sur REVENUE : deux sous-sections, aucun refus d'unicité ; /poste/REVENUE › Controls liste C-REV-* seulement, un clic ouvre /rcm/[cid] ; le transcript semé se lit dans Interviews ; `select count(*) from risk where level is not null and source='rcm_import'` = 0.

**NON OBSERVÉE**
Manque : non commencé — process (0002) et process_model (0027) coexistent sans lien, l'unicité par cycle bloque N processus par poste, aucun lien contrôle → poste. Deux réfutateurs requis (colonne vertébrale du modèle, taille L, refonte).
Tâches livrées : `P1-03` `dad1111`

### AUD-10 — Les propositions sont écrasées, des décisions humaines détruites (AUDIT — tâche(s) `P1-06`)

Épreuve : Vérifier une extraction corrigée → deux lignes (ocr, human), l'UPDATE direct de la première est refusé ; valider avec ajustement → deux lignes materiality ; disposer une cellule, recalculer → la disposition est encore lisible ; ré-importer la balance → fsli.confirmed_at inchangé.

**NON OBSERVÉE**
Manque : livré (P1-06, 0178), pas encore observé par un clic dédié à CETTE épreuve précise (le parcours cliqué général l'a traversé sans y échouer, ce n'est pas la même preuve) — OBSERVEE reste distinct de « livrée », voir tachesLivrees.
Tâches livrées : `P1-06` `c5fcff7`

---

## Phase 2

### AUD-04 — Étanchéité par identifiant d'objet fils (AUDIT — tâche(s) `P2-01`)

Épreuve : POST answerAction avec l'item_id d'un autre dossier depuis /portal/<jeton>/<rid> → 0 ligne modifiée, refus nommé ; submitBlindCheck({run de B, membre de A}) → ETANCH-04 ; sortir Karim puis GET /api/archive/<id> avec son cookie → 403.

**NON OBSERVÉE**
Manque : non commencé — answerExplanation/ingestEvidence écrivent l'objet de n'importe quel dossier ; submitBlindCheck n'a aucune garde d'appartenance. Deux réfutateurs requis (sécurité).

### AUD-05 — Le droit de signature s'auto-attribue, aucune séparation des tâches (AUDIT — tâche(s) `P1-04`, `P2-02`)

Épreuve : Comme Karim (senior, can_sign=false) : se cocher « may sign off » → refus ; signer REV-01 en reviewer puis en partner → refus nommé aux deux étapes ; un insert into signoff du même user_id en second rôle → refusé par la base.

**NON OBSERVÉE**
Manque : non commencé — assignMember n'exige aucun rôle pour poser partner/can_sign ; rien n'empêche la même personne de viser deux rôles du même papier. Deux réfutateurs requis (sécurité).
Tâches livrées : `P1-04` `e85418a`

### AUD-07 — Session et surface publique non gardées (AUDIT — tâche(s) `P2-03`)

Épreuve : POST remettreAZeroAction sans cookie sur l'URL publique → refus ; cookie forgé otto_user=<uuid d'un autre> sans signature → session absente ; jeton portail expiré → 404 ; 50 GET concurrents sur /api/sante → aucune erreur de pool sur les écrans.

**NON OBSERVÉE**
Manque : non commencé — cookie otto_user non signé, remise à zéro sans session, jeton portail en clair et perpétuel, /api/sante public et non borné. Geste H-1/H-8 requis (OTTO_SESSION_SECRET, OTTO_SANTE_TOKEN, posés par le fondateur à P2-03). Deux réfutateurs requis (sécurité, refonte).

### AUD-08 — Le scellé du dossier ne couvre qu'un tiers des tables (AUDIT — tâche(s) `P1-05`, `P2-04`)

Épreuve : Sceller le dossier NEP puis verifyExtraction, overrideLevel, insert into signoff → refus « writes rejected » chacun ; supprimer une vidéo sur un dossier non verrouillé → aucun drapeau posé ; un amendement justifié → une ligne event_log post_lock_amendment avec auteur, date, motif.

**NON OBSERVÉE**
Manque : non commencé — 21 tables restent en garde_proposee, ~45 tables filles hors de portée du verrou, aucun flux d'amendement justifié n'existe. Deux réfutateurs requis (sécurité, provenance).
Tâches livrées : `P1-05` `bd2e9b3`

---

## Phase 3

### R-F7 — Les notes de revue (mandat §1 — tâche(s) `P1-02`, `P3-02`)

Épreuve : Dans toute section : un panneau à droite listant les notes de la section, ancrées ; sur le corps de la section, un marqueur à chaque endroit annoté ; un clic sur le marqueur ouvre la note, un clic sur la note fait défiler jusqu'au marqueur. Une note ne se résout pas à un endroit réel = test en échec. Station clics : laisser une note sur une cellule, la retrouver dans le panneau, y répondre, la clore.

**NON OBSERVÉE**
Manque : non commencé — la remarque la plus importante du mandat (déjà faite une fois, non suivie) ; review_note n'a pas de section_id (AUD-02), le panneau par section n'existe pas. Deux réfutateurs requis (mandat §5.4).
Tâches livrées : `P1-02` `94116c7`

### R-F8 — Les signatures (mandat §1 — tâche(s) `P1-04`, `P3-04`)

Épreuve : Une carte de signature = rôle + initiales. Survol = nom complet + date. Aucune référence de papier dans la carte. L'état STALE reste visible (c'est un fait, pas un décor) — par un marqueur, pas par une phrase.

**NON OBSERVÉE**
Manque : non commencé — les cartes de signature actuelles citent encore l'indicatif du papier (REV-xx) et STALE n'est pas un fait dérivé fiable (AUD-09, S-2).
Tâches livrées : `P1-04` `e85418a`

### R-F9 — Les références croisées (mandat §1 — tâche(s) `P3-04`)

Épreuve : Une référence croisée = une icône (⇄), survol = cible nommée, clic = navigation. Le paragraphe explicatif est retiré (EPURE-01).

**NON OBSERVÉE**
Manque : non commencé — le composant <XRef> minimaliste n'existe pas ; le paragraphe explicatif actuel n'est pas retiré.

### R-F10 — La revue analytique (mandat §1 — tâche(s) `P3-03`)

Épreuve : Le texte est éditable en place, sauvegarde implicite et versionnée (le versionnage existe : v1 · written by …). Aucun bouton. Une note adressée à l'agent (§0.3) produit une proposition en surlignage jaune (§0.2). Station clics sur les deux gestes.

**NON OBSERVÉE**
Manque : non commencé — les boutons « Save the analytical review » / « Propose wording… » existent encore ; le composant <Proposition> unique (AUD-01) n'existe pas encore.

### R-F19 — « Arbitrate », partout (mandat §1 — tâche(s) `P1-01`, `P3-01`)

Épreuve : Le mot Arbitrate n'apparaît dans aucune vue (EPURE-01). Un test prouve que modifier une valeur proposée par l'IA écrit bien qui l'a modifiée et quand — la trace ne s'est pas perdue avec la colonne.

**NON OBSERVÉE**
Manque : non commencé — les colonnes/sections « Arbitrate » existent encore à plusieurs endroits ; le modèle proposition unifié (AUD-01) qui porterait la trace n'existe pas.
Tâches livrées : `P1-01` `82b9f6a`

### S-2 — Les cartes de signature sont incohérentes entre elles (mandat §2 — tâche(s) `P1-04`, `P3-04`)

Épreuve : Viser en réviseur, éditer une section → refus « nouvelle version » ; résoudre un écart après visa associé → le papier se lit STALE sans redraft ; sur /poste/REVENUE aucune carte ne cite deux papiers.

**NON OBSERVÉE**
Manque : non commencé — confirmé par AUD-09 : le visa n'est lié ni à un contenu ni à une version stable, STALE n'est jamais recalculé, la carte de poste agrège des visas de papiers différents.
Tâches livrées : `P1-04` `e85418a`

### AUD-09 — Le visa n'est lié ni à un contenu ni à une version stable (AUDIT — tâche(s) `P1-04`, `P3-04`)

Épreuve : Viser en réviseur, éditer une section → refus « nouvelle version » ; résoudre un écart après visa associé → le papier se lit STALE sans redraft ; sur /poste/REVENUE aucune carte ne cite deux papiers.

**NON OBSERVÉE**
Manque : non commencé — signoff n'a pas d'empreinte de contenu, STALE n'est jamais recalculé, aucune unicité (workpaper_id, sign_role).
Tâches livrées : `P1-04` `e85418a`

---

## Phase 4

### R-F1 — L'arborescence (mandat §1 — tâche(s) `P4-01`)

Épreuve : Le rail latéral ne liste que les postes dans le périmètre ; la section Scoping est le seul endroit où les postes hors périmètre apparaissent, avec leur motif. Un test échoue si un poste `out of scope` figure dans le rail.

**NON OBSERVÉE**
Manque : non commencé — la remarque « ne pas surcharger l'arborescence avec les sections descopées » n'a reçu aucune tranche depuis l'ouverture de la Phase 2.

### R-F2 — L'assistant IA (mandat §1 — tâche(s) `P4-11`)

Épreuve : En haut à droite de tout écran de mission : un seul contrôle, Assistant, qui ouvre un panneau de conversation. Le bouton Ask the file actuel est absorbé, pas dupliqué. Sur le déploiement hébergé (demoPublique), le panneau tourne sur l'adaptateur de rejeu et le dit en une ligne discrète ; en local, sur l'adaptateur réel. Une station clics l'ouvre et pose une question.

**NON OBSERVÉE**
Manque : non commencé — le composant <Assistant> et l'absorption du bouton « Ask the file » n'existent pas encore.

### R-F3 — Le geste d'envoi (mandat §1 — tâche(s) `P4-11`)

Épreuve : Un seul contrôle pour envoyer (pas un menu déroulant suivi d'une flèche). Lisible en visuel ; verdict du fondateur sur capture.

**NON OBSERVÉE**
Manque : non commencé — le contrôle <Envoyer> unifié n'a pas encore remplacé le menu déroulant + flèche ; le verdict du fondateur (H-5) reste à recueillir une fois la capture prise.

### R-F4 — My assignments (mandat §1 — tâche(s) `P4-09`)

Épreuve : Les quatre blocs sont empilés, chacun repliable, l'état de repli mémorisé par personne (ui_repli existe déjà). Un même objet n'apparaît qu'une fois sur l'écran, dans le bloc le plus spécifique — aujourd'hui Chiffre d'affaires y figure trois fois. Test : aucun identifiant dupliqué dans le rendu.

**NON OBSERVÉE**
Manque : non commencé — les quatre blocs (Currently with me / assigned to me / tracked by me / …) ne sont pas encore repliables ni dédupliqués ; AUD-19/AUD-21 confirment la triple apparition de Chiffre d'affaires.

### R-F5 — « Ce qui empêche de signer » (mandat §1 — tâche(s) `P4-10`)

Épreuve : Aucune section « obstacles » dans le rail ni dans la page ; le geste Sign sur un dossier bloqué affiche la liste, nommée, et refuse (NOTIF-01 et les autres observés là).

**NON OBSERVÉE**
Manque : non commencé — la section « obstacles » existe encore comme section permanente ; la réconciliation §0.1 (obstacles = message du refus Sign, pas une section) n'est pas construite. Les gardes elles-mêmes (NOTIF-01 etc.) ne changent pas de substance — seulement leur habillage.

### R-F11 — La section Revenue (mandat §1 — tâche(s) `P4-01`, `P4-02`)

Épreuve : Une sous-section à l'écran à la fois, choisie dans le rail ; Analytical review n'est plus une entrée du rail mais une partie de Leadsheet.

**NON OBSERVÉE**
Manque : non commencé — les sous-sections de REVENUE sont encore empilées verticalement sur une seule page ; le routage /poste/[code]/<sous-section> n'existe pas.

### R-F12 — Le bouton « Open process » (mandat §1 — tâche(s) `P4-02`)

Épreuve : Le contenu s'affiche en place ; aucun bouton qui renvoie vers une autre page pour voir ce que la sous-section est censée montrer.

**NON OBSERVÉE**
Manque : non commencé — le bouton « Open process » redirige toujours vers /processus au lieu d'afficher le contenu en place.

### R-F13 — Plusieurs processus par poste, et une légende (mandat §1 — tâche(s) `P1-03`, `P4-04`)

Épreuve : Un poste porte N processus, chacun sa sous-section ; on en ajoute un par un clic ; une légende explique chaque forme employée sur le diagramme.

**NON OBSERVÉE**
Manque : non commencé — process_model est unique par (engagement, cycle_ref, exercice) : la contrainte refuse structurellement un second processus (AUD-03). Aucune légende de pictogrammes.
Tâches livrées : `P1-03` `dad1111`

### R-F14 — L'ordre des sous-sections de contrôle interne, et le transcript (mandat §1 — tâche(s) `P1-03`, `P4-03`)

Épreuve : Le transcript d'un entretien est lisible dans sa sous-section ; l'ordre Interviews → Process → Controls → Changes since N-1 est celui du rail ; l'ancien nom (« N / N-1 Difference ») n'apparaît plus.

**NON OBSERVÉE**
Manque : non commencé — le transcript n'est lu par aucun écran (AUD-03) ; l'ordre actuel des sous-sections ne suit pas la logique de mission décidée.
Tâches livrées : `P1-03` `dad1111`

### R-F15 — Le fondateur ne comprend pas l'import JSON (mandat §1 — tâche(s) `P4-04`)

Épreuve : L'import d'un fichier JSON de processus est retiré de l'interface (le mécanisme peut rester derrière le semeur) ; aucun bouton d'import JSON n'est atteignable par un utilisateur.

**NON OBSERVÉE**
Manque : non commencé — le bouton « Import the description » (JSON) est toujours dans l'interface ; remplacé par R-F16 quand ce dernier sera construit.

### R-F17 — Les contrôles du poste, et le détail d'un contrôle (mandat §1 — tâche(s) `P1-03`, `P4-05`)

Épreuve : Dans le poste : la liste de ses seuls contrôles. Partout où un contrôle est affiché (poste, RCM), un clic ouvre sa documentation — D&I (tâches, procédures, IUC, quatre facteurs) et OE (population, tirage, tests). Un contrôle sans page de détail atteignable = test en échec.

**NON OBSERVÉE**
Manque : non commencé — la page de poste compte tous les processus et contrôles du dossier sans lien poste ↔ contrôle (AUD-03) ; la mini-RCM du poste n'existe pas. Deux réfutateurs requis (mandat §5.4).
Tâches livrées : `P1-03` `dad1111`

### R-F18 — L'évaluation des risques (mandat §1 — tâche(s) `P1-07`, `P4-08`)

Épreuve : Ordre : questions d'entité (une zone de texte par question, sauvegarde implicite, un bouton Demander au client par question) puis risques par assertion (deux colonnes : assertion, niveau parmi NRPMM / Lower / Higher / Significant). Un niveau NRPMM sans justification écrite refuse de se sauvegarder (RISK-01, en toutes lettres). Provenance au survol (§0.1), aucune colonne de plus.

**NON OBSERVÉE**
Manque : non commencé — trois vocabulaires de niveau coexistent (AUD-11) ; RISK-01 n'existe pas encore ; les colonnes Computed/Retained/What Produced It/Arbitrate sont toujours affichées. Deux réfutateurs requis (mandat §5.4).

### R-F20 — Le rapprochement de l'échantillon (mandat §1 — tâche(s) `P4-06`)

Épreuve : L'étape 2 affiche : solde leadsheet (⇄ vers la leadsheet), total du détail obtenu, écart, et l'état rapproché / non rapproché. POP-01 continue de refuser le tirage tant que l'écart n'est pas nul ou expliqué.

**NON OBSERVÉE**
Manque : non commencé — l'étape 2 (« step 2 reconciliation ») n'affiche pas encore ces quatre éléments ; POP-01 lui-même n'est pas touché (garde intacte, mandat §3).

### R-F21 — Le vocabulaire de l'échantillonnage (mandat §1 — tâche(s) `P1-07`, `P4-06`)

Épreuve : Titre : Sampling. Une étape Methodology expose la méthode (aléatoire / unités monétaires) et la taille, chacune avec sa source de pack ou son « paramètre non vérifié » (CTRL-07, annexe du 10 septembre). Ni L0, ni L3, ni deterministic, ni Drawn à l'écran (EPURE-01).

**NON OBSERVÉE**
Manque : non commencé — le titre porte encore « Revenue sampling — propose (L3) → validate → draw (L0, deterministic) » ; la taille commandée par le risque ne commande rien (randomSize=4 codé en dur, AUD-11).

### S-5 — Le même objet répété (mandat §2 — tâche(s) `P4-09`)

Épreuve : Un même objet n'apparaît qu'une fois sur l'écran, dans le bloc le plus spécifique — aucun identifiant dupliqué dans le rendu de My assignments (R-F4).

**NON OBSERVÉE**
Manque : non commencé — confirmé par AUD-19/AUD-21 : Chiffre d'affaires figure trois fois sur My assignments aujourd'hui.

### S-6 — Un import JSON comme geste utilisateur (mandat §2 — tâche(s) `P4-04`)

Épreuve : L'import d'un fichier JSON de processus est retiré de l'interface (R-F15) ; aucun bouton d'import JSON n'est atteignable par un utilisateur.

**NON OBSERVÉE**
Manque : non commencé — même ligne que R-F15, le bouton est toujours présent aujourd'hui.

### AUD-11 — Trois vocabulaires de niveau de risque, NRPMM sans justification possible (AUDIT — tâche(s) `P1-07`, `P4-06`, `P4-08`)

Épreuve : Enregistrer NRPMM sans texte → refus RISK-01 en toutes lettres ; changer le niveau sur /risk change la taille proposée dans Sampling › Methodology, qui affiche source ou « paramètre non vérifié » ; « Demander au client » → brouillon visible sur /requests.

**NON OBSERVÉE**
Manque : non commencé — risk.level / fsli_assertion_risk / rcm_row.risk_desc coexistent sans échelle commune ; RISK-01 n'existe pas ; randomSize=4 codé en dur, non commandé par le risque.

---

## Phase 5

### R-F6 — La couleur (mandat §1 — tâche(s) `P5-04`)

Épreuve : Aucune occurrence de violet dans les jetons ; visuel reshooté ; verdict du fondateur sur trois captures (tableau de bord, poste, papier).

**NON OBSERVÉE**
Manque : non commencé — seule exception au gel H-6 nommée par le mandat ; les jetons globals.css portent encore la palette violette actuelle. Geste H-4 du plan (§20) : le verdict du fondateur suit la capture, il ne la précède pas.

### R-F16 — L'agent de flowchart (spécifié par le fondateur) (mandat §1 — tâche(s) `P1-03`, `P4-04`, `P5-01`)

Épreuve : Sur le monde semé, un processus porte un flowchart client déposé, un diagramme engendré, et au moins une différence surlignée en jaune avec sa note (le rejeu la contient). Accepter la différence par un clic la fait entrer au diagramme ; la refuser la retire ; les deux gestes sont tracés. Station clics.

**NON OBSERVÉE**
Manque : non commencé — l'agent de walkthrough du Lot 8 spécifié par le fondateur (comparer transcript ↔ flowchart client, différences surlignées) n'existe pas ; 0027 décide même explicitement de NE PAS lire le flowchart client (AUD-03). Deux réfutateurs requis (mandat §5.4).
Tâches livrées : `P1-03` `dad1111`

### R-F22 — La langue (mandat §1 — tâche(s) `P5-03`)

Épreuve : La garde langue (0 hors catalogue) tient ; une nouvelle lecture compte les libellés semés non anglais sur le monde de démonstration et doit lire 0.

**NON OBSERVÉE**
Manque : non commencé — le monde de démonstration est encore majoritairement en français (méthode, notes, procédures semées) ; réversible d'un mot du fondateur une fois construit.

### S-3 — Trois langues sur un écran (mandat §2 — tâche(s) `P4-03`, `P5-03`)

Épreuve : Réglé par R-F22 (garde langue généralisée) et par un composant de dépôt de fichier stylé remplaçant le contrôle natif du navigateur — aucune des 356 vues ne mélange chrome anglais, données françaises et libellé natif du navigateur (« Choisir un fichier »).

**NON OBSERVÉE**
Manque : non commencé — confirmé par AUD-14 (335 refus hors catalogue, contenu de pack monolingue) ; le composant de dépôt stylé n'existe pas encore.

### S-4 — La justification du jeu de démonstration fuit dans le produit (mandat §2 — tâche(s) `P5-03`)

Épreuve : Le texte de justification destiné au fondateur (« Hors périmètre du jeu de démonstration… Ce n'est PAS un jugement de significativité… ») n'apparaît plus à l'écran ; le motif de descoping se lit en une ligne factuelle, sans commentaire adressé au fondateur (EPURE-01).

**NON OBSERVÉE**
Manque : non commencé — confirmé par AUD-14 : ce texte (part1.ts) est toujours rendu tel quel à l'écran aujourd'hui.

### AUD-06 — Le monde hébergé n'est pas le monde prouvé (AUDIT — tâche(s) `P5-01`)

Épreuve : Sur l'URL : /eng/<sox>/rcm/<C-BR-01> montre une tâche, quatre facteurs, une IUC ; /eng/<nep>/poste/REVENUE › Interviews montre un entretien avec transcript lisible et ses écarts surlignés ; `select count(*) from walkthrough` > 0 sur Supabase ; coller un autre transcript rend un message d'écran (jamais un chemin de fichier).

**NON OBSERVÉE**
Manque : non commencé — zéro walkthrough/tâche/facteur/IUC/entretien/transcript en production ; l'enrichissement bloquant idempotent n'existe pas encore.

### AUD-13 — Les relances client sont fabriquées au rendu d'une page (AUDIT — tâche(s) `P5-02`)

Épreuve : Ouvrir dix fois /requests ne crée aucune ligne reminder ; « Relancer » en crée une, datée du jour, marquée simulée, avec son événement.

**NON OBSERVÉE**
Manque : non commencé — ensureReminders insère encore des lignes reminder status='sent' au rendu d'une page, sans transport réel.

### AUD-14 — Les refus sont 335 chaînes libres bilingues hors catalogue (AUDIT — tâche(s) `P1-09`, `P5-03`)

Épreuve : `grep -c 'throw new Error' app/src/lib/services` = 0 ; `npm run langue` étendu rend 0 sur le monde de démonstration ; aucun `L[0-3]`, « deterministic », « Drawn », « Arbitrate » dans les 356 vues.

**NON OBSERVÉE**
Manque : non commencé — 335 `throw new Error` hors classe Refus/catalogue ; méthode et semis monolingues ; doctrine (L0/L3, deterministic, Drawn) encore à l'écran.

---

## Phase 6

### AUD-12 — Piste d'audit incomplète : écritures sans événement, deux horloges (AUDIT — tâche(s) `P1-10`, `P6-02`)

Épreuve : Changer le niveau → une ligne event_log automation_level.changed {de, vers} ; injecter une rupture de chaîne → /api/sante rouge ; `grep -c 'new Date()' app/src/lib/services` = 0 hors utilitaires nommés.

**NON OBSERVÉE**
Manque : non commencé — 24 écritures sans logEvent, 149 verbes libres, chaîne SHA-256 non ancrée, new Date() coexiste avec l'horloge de démonstration dans les services.

### AUD-15 — Concurrence : aucun verrou optimiste, verrou consultatif tenu trop longtemps (AUDIT — tâche(s) `P1-08`, `P6-01`)

Épreuve : Deux editSection concurrents sur deux sections : les deux corps subsistent ; insert d'une seconde matérialité validée → refus d'unicité ; un scellé n'immobilise pas une note de revue posée pendant son rendu.

**NON OBSERVÉE**
Manque : non commencé — editSection fait lecture-modification-écriture du jsonb entier ; aucun index partiel unique ; row_version jamais construit ; appels IA dans la même transaction que le reste.

### AUD-17 — Le parcours cliqué est monolithique (326 étapes, sommeils fixes, assertions `true`) (AUDIT — tâche(s) `P0-03`, `P0-04`, `P6-03`)

Épreuve : `npm run clics -- --station="notes"` conduit la seule station R-F7 en < 3 min sur une base semée, deux fois de suite ; `grep -cE 'dire\([^,]+,\s*true,' scenario.ts` = 0 ; `time npm run verify:tranche` < 20 min.

**NON OBSERVÉE**
Manque : non commencé — 103 waitForTimeout + 33 cliquer(ms) + 51 soumettre(ms), 21 assertions `dire(nom, true, …)`, aucune station ciblable seule, cadence de rituel 2h30-3h par ligne.
Tâches livrées : `P0-03` `c9a9c58` ; `P0-04` `2d149a7`

### AUD-18 — Chaque build Vercel écrit sur la base de démonstration, migrate non transactionnel (AUDIT — tâche(s) `P0-08`, `P5-01`, `P6-02`)

Épreuve : Casser volontairement une étape d'enrichir sur une branche d'aperçu → build rouge ; un run vert de parcours.yml avec le SHA ; role-production vert une fois.

**NON OBSERVÉE**
Manque : non commencé — reconstruire.ts applique sur la base publique pour chaque déploiement (aperçus compris) ; migrate() n'est pas transactionnel ; verifier.yml ne conduit ni semeur, ni screens (production), ni clics, ni visuel. Geste H-2/H-3 requis (base d'aperçu séparée, OTTO_CI_DATABASE_URL — en attente du fondateur, voir section §20 ci-dessous).
Tâches livrées : `P0-08` `c833c23`

---

## Gestes du plan §20 (main humaine) — hors du compte ci-dessus

Ce que ce document ne peut ni prendre ni simuler (plan §20). Une ligne ici n'entre jamais dans le compte OBSERVÉE/NON OBSERVÉE/SANS OBJET : ce sont des gestes, pas des épreuves.

- **H-1** (Phase 2 (P2-03), état : `en_attente`) — Poser OTTO_SESSION_SECRET dans Vercel (production + preview). autorisé par le mandat d'ouverture (2026-09-20) — Claude Code peut le créer lui-même via le connecteur Vercel quand le plan atteint P2-03 ; valeur générée, jamais imprimée.
- **H-2** (Phase 6 (P6-02), état : `en_attente_du_fondateur`) — Base Supabase d'aperçu séparée (DATABASE_URL pour preview). ne pas créer de base ni de projet ; les aperçus continuent d'écrire sur la base publique jusqu'à ce geste.
- **H-3** (Phase 6, état : `en_attente_du_fondateur`) — OTTO_CI_DATABASE_URL (base de CI, rôle otto_ci). role-production.yml reste rouge et le dit tant que ce secret manque.
- **H-4** (Phase 5 (P5-04), état : `en_attente`) — Verdict sur trois captures de la palette (tableau de bord, poste, papier). les jetons du §7 P5-04 sont posés d'abord ; le verdict peut demander une retouche de jetons.
- **H-5** (Phase 4, état : `en_attente`) — Verdict sur le contrôle Send (R-F3) et sur le mot exact du titre « Changes since N-1 » (R-F14). les formes du §6 sont livrées d'abord ; un mot du fondateur les change ensuite.
- **H-6** (Phase 5, état : `tenu_pour_acquis`) — Décision de maintenir l'anglais de démonstration (réversible d'un mot, mandat R-F22). le plan le tient pour acquis par défaut.
- **H-7** (jamais sans mandat, état : `hors_phase_2`) — Mandat écrit nommant l'étape 3 de PLAN_RLS, la RCM rcm/[cid], les postes du Lot 5 sans atelier (R98/R99/R100). préparés, consignés au registre, jamais exécutés sans mandat écrit qui les nomme.
- **H-8** (Phase 2, état : `en_attente`) — OTTO_SANTE_TOKEN (optionnel) pour le détail de la sonde. autorisé par le mandat d'ouverture — sans lui, le détail est désactivé et la CI lit le corps public.
