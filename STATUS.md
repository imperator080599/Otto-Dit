# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Current state

- **Stage**: C complete — all slices S0→S10 + hardening built, tested and pushed.
  The two-part demo runs end-to-end. Feature work is stopped per the program contract.
- **Branch**: `claude/otto-audit-platform-whs17z`.
- **Suite**: 186 tests green (`cd app && npm test`), zero network calls. Prod build clean.

## Prouvé par exécution vs prouvé par test avec mocks

Mise à jour après exécution réelle de la couche IA (2026-08-25, 51 appels, 1,27 $ sur le
plafond de 20 $). Effectif indiqué à côté de chaque taux. Rien dans ce dépôt ne doit être lu
comme « mesuré » s'il ne figure pas ici.

| Affirmation | Statut | Établi comment |
|---|---|---|
| **Substance probante** : « resolved » exige explication verbatim + preuve liée + disposition | **Prouvé par exécution** | contraintes SQL (migration 0009) + tests : une résolution générique est rejetée par le service ET par la base |
| **Une anomalie chiffrée ne sort pas de l'accumulation sans disposition** | **Prouvé par exécution** | la double comptabilisation de 36 800 € reste dans le total ; anomalies connues 127 545,80 € |
| **Le dépassement de l'anomalie tolérable bloque la conclusion** | **Prouvé par exécution** | `concludeEvaluation` refuse sans `evaluation_response` enregistrée |
| **Le grand livre provisoire bloque la conclusion définitive et la clôture** | **Prouvé par exécution** | test archive : `closeFile` refuse tant que le FEC est provisoire |
| **Déficience : taux et nature avant montant ; extension à la population** | **Prouvé par exécution** | 3/3 → extension aux 12 instances → 25 %, natures sévères ⇒ material weakness |
| **Le rendu n'altère jamais son propre texte** | **Prouvé par exécution** | couverture lue dans la police ; un caractère non couvert fait échouer l'export |
| **Un export supprimé se régénère à l'octet près** | **Prouvé par exécution** | `export.test.ts` compare les octets du PDF stocké et du PDF re-rendu |
| **Le dossier scellé est autoportant et déterministe** | **Prouvé par exécution** | archive rejouable octet pour octet ; empreintes du manifeste re-vérifiées ; README sans script ni lien externe |
| **Les visas suivent la hiérarchie de revue** | **Prouvé par exécution** | trigger + service : un visa associé avant celui du reviewer est refusé |
| Le noyau déterministe (canonicalisation, sondage, seuils, projection, échelle de déficience, FEC) donne les bons résultats | **Prouvé par exécution** | 135 tests, dont la suite d'acceptation qui rejoue les anomalies semées par le générateur via le chemin applicatif réel |
| **Précision de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196 champs) sur le corpus d'eval — **0 montant faux sur 84 rendus, 0 date fausse sur 28 rendues** |
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

**Vérification** : 31 harnais du prototype sans échec ni plantage (dont `rail` et `portail`, neufs) ·
186 tests applicatifs · `tsc --noEmit` propre.

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
