# REGISTRE DES IDÉES — la table des matières de la v1

Règle du mandat (OTTO_Mandat_Autonome_v1, 2026-08-31) : **une ligne par idée jamais
exprimée par Tuan**. Aucune ligne ne se supprime ; `écarté` jamais parce que c'est
difficile ; `fait` exige une preuve ; `reporté`/`écarté` exigent une raison qui tient
devant Tuan. Mis à jour à la fin de CHAQUE tranche.

État ∈ `fait` · `en cours` · `planifié` · `reporté` · `écarté`.

## A. Idées d'origine (docs/00_FOUNDER_IDEAS.md, 2026-08-25)

| id | idée | état | preuve / raison |
|---|---|---|---|
| F-01 | Deux faces communicantes : documentation d'audit + requêtes clients | fait | espaces /eng et /portal, demandes liées aux sections ; tests s3s4, parcours cliqué |
| F-02 | Upload de la balance (TB) de l'année auditée | fait | écran imports, versionnement + rapport d'impact (ADR, tâche 30) ; s1s2.test |
| F-03 | Upload du grand livre (FEC) | fait | idem ; FEC provisoire → définitif avec invalidation confirmée (ADR-016, ADR-092) |
| F-04 | Réconciliation grand livre / TB | fait | reconciliation.ts, écran, station cliquée « all accounts tie » |
| F-05 | Méthodologie depuis la documentation officielle en ligne | reporté | catalogue méthodologique versionné FAIT, mais les 19 sources restent `verifie: false` — textes primaires inaccessibles depuis l'environnement (proxy) ; jamais présentées comme vérifiées |
| F-06 | Agents par section : population, réconciliation, relances, sélections selon risque+seuil, templates remplis | fait | boucle par procédure, tirage (unités monétaires + strate exhaustive), requêtes, matching, papier ; parcours.test.ts |
| F-07 | OCR pour lire les documents reçus | fait | échelle d'extraction (ADR-012), mode IA réelle mesuré (ADR-105, COST.md §1 bis) |
| F-08 | Workflow d'e-mails de réunion (entretien fraude, revue analytique) | fait | réunions ADR-101 — créneau choisi par un humain, envoi derrière adaptateur simulé qui le DIT ; envoi réel = M-08 |
| F-09 | Chatbot général pour l'associé | fait | rendu comme « Interroger » : langage naturel → requête d'un catalogue fermé, jamais de prose (ADR-017 ; divergence assumée, DECISIONS_AUTONOMES DA-06) |
| F-10 | Dashboard d'avancement + % documents reçus + vue client limitée | fait | pilotage (graphiques à l'encre) + portail client à vue limitée |
| F-11 | Export excel du suivi + envoi par mail aux contacts clés | planifié | backlog M-06 (trois périmètres d'audience + envoi périodique) |
| F-12 | Analyse macroéconomique / facteurs externes automatisée | reporté | sources externes non atteignables ; structure seule au point M-07 — dit ici comme le mandat l'exige |
| F-13 | Entretien contrôle interne : compréhension documentée + questions client + écarts dits/documentés | fait | ADR-108 : entretiens, transcript → écarts CANDIDATS (omissions d'abord), statués un par un |
| F-14 | Vidéo de la réunion intégrée | reporté | l'ingestion vidéo exige un service de transcription externe ; le transcript collé couvre le geste d'audit (DA-04) — réévaluer après la v1 |
| F-15 | OE d'un contrôle : liste des instances, sélection, justificatifs, documentation | fait | pack SOX : C-BR-01 / C-REV-01, déviations, papiers signés (s8.test) |
| F-16 | Journal entry testing semi-automatisé, paramètres validés par un humain | fait | test des écritures : critères paramétrables + entonnoir (tâche 31) |
| F-17 | Joindre un fichier excel aux templates | fait | annexes de papier (ADR-106c) — la table dormait depuis 0002, branchée |
| F-18 | Flag d'écart de totaux à expliquer sur les templates | fait | écarts/exceptions avec résolution documentée (tâche 29, contrainte probante) |
| F-19 | Template éditable (colonnes ajoutées) avec signe visible + justification | fait | colonne ajoutée, marquée, motivée, remplie par OTTO après confirmation (tâche 60) |
| F-20 | Vision claire du document obtenu et de son usage (BL, quantité…) | fait | atelier : pièce et ligne côte à côte, extraction par pièce, provenance (ADR-104/105) |
| F-21 | Ergonomie et lisibilité maximales | en cours | revue visuelle 4 modes (ADR-094) FAIT ; critères mesurables du mandat §3.D = M-09 |
| F-22 | Design épuré | fait | encre, couleur seulement pour les problèmes ; `npm run visuel` 0 défaut |
| F-23 | Review notes des auditeurs humains seulement | fait | notes ancrées, préparateur répond, SEUL le réviseur clôt (service + trigger en base, ADR-028) |
| F-24 | Les agents retiennent les audits passés du même client | reporté | un modèle qui « s'améliore » sans provenance contredit la piste d'audit (P7) ; la reprise N-1 STRUCTURÉE existe (carry-forward) et couvre le besoin réel (DA-05) |
| F-25 | Détection de liens dirigeants ↔ clients/fournisseurs (parties liées non déclarées) | planifié | backlog M-04 |
| F-26 | Pointage états financiers plaquette ↔ TB avec cross-références | fait | fs-tieout : plaquette côté gauche, montants audités côté droit, per-account jamais compensé |
| F-27 | Accès simple à la synthèse des déficiences + misstatements | fait | synthèse des anomalies + déficiences SOX, un clic depuis l'atelier |
| F-28 | Benchmark/% de matérialité proposés et expliqués, validés par un humain | fait | la RÈGLE DU CABINET propose (déterministe — P4 : pas de LLM où une règle suffit), un humain valide avec justification |
| F-29 | Scoping automatique des FSLI + scoping qualitatif | fait | périmètre proposé par seuils, décisions revoyables avec motif |
| F-30 | Comptes sous CTT marqués NS, statut modifiable | fait | sections par poste, statuts dérivés, révision motivée |
| F-31 | Revue analytique auto N/N-1 (seuil € et %) → questions client | planifié | variations visibles au pilotage/pointage, mais PAS d'écran dédié avec seuils validés + questions — à construire (rattaché à M-09/M-06) |
| F-32 | Confirmations bancaires bout-en-bout (liste, complétude vs compta, envoi, réception, écarts) | planifié | backlog M-03 — prochain point après P0 ; boîte de réception = M-08c |
| F-33 | Banques qui n'acceptent que confirmation.com | planifié | avec M-03 : procédure alternative documentée + QUESTIONS_EN_ATTENTE Q-01 (adhésion = décision d'argent, à Tuan) |
| F-34 | Confirmations avocats (litiges, provisions, écarts > CTT) | fait (mécanique) | ADR-111 : même mécanique que les banques, comparaison provisions confirmées / compte de provisions, seuil CTT ; le jeu de démonstration ne porte pas encore de réponse d'avocat semée |
| F-35 | Boîte e-mail intégrée par dossier (réception des pièces) | planifié | backlog M-08c (adresse entrante par dossier + quarantaine) |
| F-36 | Estimations comptables hors litige : base rapprochée, sondée, taux justifiés | fait | ADR-106a, `dataset/estimations/fae-2025.csv`, station cliquée |
| F-37 | Fichier de suivi modulable par audience, temps réel, statuts, n° de requête lié | planifié | backlog M-06 ; statuts par pièce et liens section↔requêtes déjà en place |
| F-38 | Comparaison dires du client ↔ flowchart | fait | ADR-108 — le flowchart devient DONNÉES + diagramme généré, et le transcript se confronte à la documentation |
| F-39 | Bouton client « All supporting evidence submitted » / partially | fait | portail : bouton par demande, statut dérivé |
| F-40 | Relances automatiques selon délai | fait | rappels + retard (demo : « reminders sent; request now overdue ») |
| F-41 | Accès direct à l'ERP (supprimer les requêtes) avec approbation client | fait (architecture) | source de pièce = attribut, échelle de repli, circuit d'autorisation — docs/13_ACCES_ERP.md (ADR-106b) ; connecteur réel reporté (aucun ERP atteignable) |

## B. Lots et listes intermédiaires (prompts 2026-08-26 → 2026-08-30)

| id | idée | état | preuve |
|---|---|---|---|
| L-01 | Espaces, sections par FSLI, portail réel, notes de revue refondues, arc de bout en bout | fait | tâches 18-23, parcours.test |
| L-02 | Registre des facteurs de risque première classe + circulation (proposé → confirmé) | fait | tâche 24, questionnaire.ts |
| L-03 | Sélections revoyables, catalogue de preuve FSLI×assertion×procédure | fait | tâches 25-26 |
| L-04 | Échantillon par assertion, cut-off, taux d'anomalie ; risque par assertion qui COMMANDE | fait | tâches 27, 52 ; invariant §5 du mandat respecté (jamais de niveauMax par poste) |
| L-05 | Versionnement balance/GL + rapport d'impact ; critères JET paramétrables ; répartition en lot | fait | tâches 30-32 |
| L-06 | Rail par état du dossier, replis pilotés, bandeau, « Mes travaux », recherche | fait | tâches 33, 45 ; grisé avec raison, station cliquée |
| L-07 | Strate exhaustive au seuil de planification + sondage en unités monétaires | fait | tâche 34, monetaryDraw |
| L-08 | Garde-fou des trois alternatives d'approche ; catalogue de procédures versionné ; ajustements | fait | tâches 36-38 |
| L-09 | Paramètres : équipe, ancienneté, indépendance, SACC ; jalons ; programme modifiable | fait | tâches 40-41 |
| L-10 | Facteurs qualitatifs remontés par le registre + questionnaire résiduel dans l'app | fait | tâches 42, 53 |
| L-11 | Testing revenue entièrement déroulé ; pilotage en premier ; dates françaises ; identité 390 px | fait | tâches 43-44, 48-49 |
| L-12 | Dixième famille d'obstacles (poste retenu sans procédure) ; parcours cliqué de bout en bout | fait | tâches 54, 56 |
| L-13 | Notes ancrées sur tout objet ; notes adressées à OTTO (exécution, refus, réponse) | fait | tâches 58-59, ADR-028 rétabli (tâche 63) |
| L-14 | Bascule entre entités d'un groupe | fait | tâche 61 |
| L-15 | Rail d'état (9) + atelier du testing (10) — le meilleur écran, mesuré | fait | ab9b0d6, 1d16403 ; `npm run mesure:testing` 4 gestes/2 écrans → 1 geste/1 écran |
| L-16 | IA vivante dans la version livrée (12) : demo:ia, pièces neuves piégées, garde de budget | fait | 55842ab, ADR-105, COST.md §1 bis-ter |
| L-17 | Balances auxiliaires âgées (1) : concentration, apparus/disparus, vieillissement → registre | fait | 2349c37/f33442b, ADR-107 |
| L-18 | Contrôle interne / processus (2) : données structurées, diff N/N-1 statuée, entretiens | fait | 27171bc, ADR-108 ; chaîne verify verte sur cet état : 494 tests, 74 routes, 126 étapes, 276 vues, 0 défaut |
| L-19 | Notes : récurrence vs N-1 + ancienneté en jours ouvrés (ADR-028 §5-6) | planifié | backlog M-05 |
| L-20 | Windows : spawns portables, messages par cause, `npm run diagnostic` | fait | tâche 57, scripts/lib/portable.mjs, scripts/demo/diagnostic.mjs ; DEMARRAGE_WINDOWS.md = M-00b |

## C. Mandat autonome v1 (OTTO_Mandat_Autonome_v1.md, 2026-08-31)

| id | idée | état | preuve / raison |
|---|---|---|---|
| M-00a | URL : démo déployée sur Vercel, données fictives reconstruites, bandeau permanent, IA réelle OFF | fait | **2026-08-31 20:48 — URL chargée, HTTP 200**, dossier ouvert et atelier lu : https://otto-dit-imperator080599.vercel.app/eng/e7a83891-e553-4ad1-945e-b34041f18c7b/testing?comme=… — « Claire Fontaine (partner) · Altiverre FY2025 — Audit légal (NEP) · Testing workbench » avec les lignes de l'échantillon et leurs motifs de sélection. Données servies par Supabase (pooler de transaction) |
| M-00b | Windows : `DEMARRAGE_WINDOWS.md` ≤ 10 lignes PowerShell + contraintes de conception | fait | DEMARRAGE_WINDOWS.md (9 lignes, une commande par ligne) ; audit de classe : zéro spawn résolu par le PATH ; diagnostic + messages par cause (L-20, ADR-095/096) |
| M-01 | Balances auxiliaires | fait | = L-17 |
| M-02 | Contrôle interne / walkthroughs — finir proprement | fait | chaîne complète verte (code 0) : 494 tests / 74 routes / 126 étapes / 276 vues ; stations cliquées du processus passées |
| M-03 | Confirmations banques + avocats bout-en-bout | fait | ADR-111 : migration 0030, service dérivé (complétude deux sens, rapprochement, explication écrite), écran, famille d'obstacles, station cliquée de bout en bout (listing incomplet → corrigé → envoi simulé → réponse → écart 1 250,00 € → explication → questions en brouillon) |
| M-04 | Parties liées, y compris non déclarées | planifié | |
| M-05 | Notes de revue : récurrence + ancienneté jours ouvrés | planifié | = L-19 |
| M-06 | Export d'avancement, 3 audiences, envoi périodique | planifié | = F-11/F-37 |
| M-07 | Sectoriel + LCB-FT : structure seulement | planifié | sources non atteignables — dit ici comme exigé |
| M-08 | E-mail : (a) SMTP sortant, (b) Graph libre/occupé chiffré à part, (c) adresse entrante par dossier | planifié | |
| M-09 | Densité & navigation mesurables (§3.D) : clics publiés, ≤3 clics depuis Mes travaux, ≤5 actions primaires, clavier, LEXIQUE.md | en cours | ≤5 actions : MESURÉ sur 69 écrans (docs/DENSITE.md) ; « Mes travaux » CONSTRUIT (DA-14, ADR-110) et les clics COMPTÉS au parcours ; LEXIQUE appliqué ; reste : le clavier, non mesuré — dit, pas caché |
| M-10 | Écran testing revenue = le meilleur du produit, secondes/ligne avant/après | fait | = L-15 (à re-mesurer à chaque évolution) |
| M-11 | Estimations + ERP + tableur joint | fait | = F-36, F-41, F-17 |
| M-12 | IA réelle livrée avec PBC jamais vus téléversés côté client | fait | = L-16 ; le scénario « Tuan téléverse lui-même en tant que client » entre au PROGRAMME_TEST_V1 |
| M-13 | Packs complets : normes × référentiel comptable × contrôle interne ; bascule qui change l'écran | planifié | 2 dossiers démo FR/US FAITS ; libellés par pack largement en place (packs nommant, code calculant) ; la démonstration de bascule §3.A + vocabulaire comptable PCG/IFRS/US GAAP restent à couvrir |
| M-14 | §3.B tâches manquantes : budget et heures | planifié | rien n'existe aujourd'hui — à construire |
| M-15 | §3.B tâches manquantes : continuité d'exploitation | planifié | absente en tant que travail dédié (l'acceptation y touche) — à construire |
| M-16 | §3.C : docs/AUTOMATISATION.md — champs tapés avant/après, par écran | fait | docs/AUTOMATISATION.md + ligne de base MESURÉE (`npm run densite`, dans la chaîne verify) ; avant/après historiques non reconstitués de mémoire |
| M-17 | §3.D : docs/LEXIQUE.md — un concept = un mot, revue des libellés | fait | docs/LEXIQUE.md + `app/src/lib/lexique.test.ts` v2 (extraction du texte LU, langue jugée par texte, 7 règles qui tournent — les cases ✓ correspondent enfin aux règles) |
| M-18 | Registre des idées, DECISIONS_AUTONOMES, QUESTIONS_EN_ATTENTE, PROGRAMME_TEST_V1, LIVRAISON_V1 | en cours | ce fichier + docs/DECISIONS_AUTONOMES.md + docs/QUESTIONS_EN_ATTENTE.md créés ; programme de test et livraison = fin de v1 |
| M-19 | §8.2 (v1.1) : état de l'art — docs/16_ETAT_DE_L_ART.md (DataSnipper, Inflo, MindBridge, CaseWare, AuditBoard, Suralink, Fieldguide : mieux qu'OTTO / moins bien / à prendre) | fait | docs/16_ETAT_DE_L_ART.md (recherche web sourcée du 2026-08-31 ; limites de méthode dites en tête) ; six idées reprises en section D (A-01..06) |
| M-20 | §8.3 (v1.1) : les insuffisances récurrentes des rapports H2A / PCAOB, croisées aux familles d'obstacles au visa, manques comblés | planifié | c'est un cahier des charges gratuit de ce que la plateforme doit rendre IMPOSSIBLE |
| M-21 | §8.4 (v1.1) : vérifier les 19 sources sur TEXTE PRIMAIRE, dater, marquer verifie:true une à une | planifié | tenter depuis cette session (l'accès réseau a pu changer) ; sinon dit et daté — jamais « vérifié » sans texte atteint |
| M-22 | §8.5/8.7 (v1.1) : un sous-agent HOSTILE par tranche (casser, pas valider) + barre de finition (tout écran qu'on n'oserait pas montrer = défaut au registre) | en cours | s'applique à chaque tranche à partir de maintenant |

## D. Idées ajoutées en autonomie (mandat v1.1 §8.1 : « ce que la liste ne demande pas mais qu'un inspecteur ou le marché exigerait ») 

| id | idée | source | état | preuve / raison |
|---|---|---|---|---|
| A-01 | Rapprochement EN LOT de l'échantillon (fuzzy + tolérances), l'humain ne passe que sur les non-appariés | état de l'art (DataSnipper Document Matching), 2026-08-31 | planifié | le manque le plus criant face au marché ; s'appuie sur le moteur de matching existant |
| A-02 | Analytique de population complète sur le FEC à l'import : routines déterministes en lot dont les sorties stratifient l'échantillon | état de l'art (Inflo Detect, MindBridge, tests FEC d'IDEA), 2026-08-31 | planifié | P4 pur (zéro LLM) ; le score par écriture se décompose en points NOMMÉS (P7) — jamais une conclusion |
| A-03 | Roll-forward N→N+1 du dossier entier (structure, mapping, décisions à re-valider) | état de l'art (CaseWare), 2026-08-31 | planifié | le carry-forward actuel reprend les conclusions ; le roll-forward reconduit le DOSSIER |
| A-04 | Boucle de rejet motivé PAR PIÈCE au portail (accepté / rejeté-avec-motif, ré-ouverture, notification) | état de l'art (Suralink), 2026-08-31 | planifié | complète le portail existant ; un rejet motivé est un refus qui s'affiche — l'ADN d'OTTO |
| A-05 | Contrôle de complétude d'une pièce AU DÉPÔT (bon exercice, bon type, lisible) — suggestion sous plafond L2 | état de l'art (Fieldguide Request Agent), 2026-08-31 | planifié | la classification/extraction existante le permet ; le verdict reste une proposition |
| A-06 | Rendre le plafond L2 VISIBLE à l'écran : préparé par l'IA → en attente de revue → approuvé, comme états affichés d'un même objet | état de l'art (Fieldguide checkpoints), 2026-08-31 | planifié | la file d'attestation existe ; il manque son affichage comme chaîne d'états nommés |

**Rappel permanent** : les 19 sources du catalogue méthodologique restent `verifie: false`
(methodology/sources.json) — aucune n'est utilisée comme si elle était vérifiée.

## E. Revue HOSTILE de la tranche 9 (mandat v1.1 §8.5) — ce que l'agent adverse a cassé

Un sous-agent lancé pour CASSER la tranche, pas pour la valider. Ses constats fondés, et
ce qu'ils sont devenus. Ce qui est corrigé l'est **par la classe**, jamais par l'instance.

| # | constat | verdict | suite |
|---|---|---|---|
| H-01 | `docs/DENSITE.md` publiait `0 \| 0` sur des écrans qui portent des boutons inconditionnels (testing, papier, méthode) | FONDÉ — le chiffre publié était faux | la mesure REFUSE désormais de conclure : statut HTTP contrôlé, titre lu exigé, commande ni visible ni repliée ni d'item = arrêt. Rien n'est publié en cas de refus |
| H-02 | « Mes travaux », origine du critère « ≤ 3 clics », n'existe nulle part dans `app/src` | FONDÉ | écran construit (ADR-110, DA-14) ; les clics sont COMPTÉS par le parcours, plus affirmés |
| H-03 | aucune garde de serveur fantôme ni de build réécrit sous la mesure | FONDÉ (défaut de classe, déjà payé par le balayage — ADR-076) | port vérifié libre avant lancement ; `BUILD_ID` relu après la mesure ; divergence = refus |
| H-04 | `a.btn`, `input[type=submit]`, `[role=button]` non comptés : les actions terminales (télécharger l'archive, choisir un fichier de méthode) étaient invisibles à la mesure | FONDÉ | sélecteur élargi — et un vrai dépassement est apparu : `/methodology` à 10 actions, traité |
| H-05 | `select` ignoré dans les champs à taper | FONDÉ | compté |
| H-06 | le portail client (surface anonyme) n'était pas mesuré | FONDÉ | 2 écrans de plus : 69 mesurés au lieu de 67 |
| H-07 | `npm run densite` absent de la chaîne `verify` | FONDÉ | ajouté, après le balayage (build de production, base semée) |
| H-08 | `data-actions-item` exclut sans garde : n'importe quelle action d'écran pouvait s'y cacher | FONDÉ | garde : un groupe UNIQUE portant une SEULE commande fait échouer la mesure |
| H-09 | replier des boutons pour passer sous le seuil = mesurer le thermomètre | FONDÉ | colonnes « Repliées » et « D'item » PUBLIÉES ; les champs sont comptés même repliés (replier ne supprime pas la frappe) |
| H-10 | `docs/DENSITE.md` commis désynchronisé de l'exécution qui l'a produit | FONDÉ | DA-13 : commit + build en tête du document, mesure dans la chaîne |
| H-11 | LEXIQUE.md marquait 7 règles ✓ pour 4 implémentées | FONDÉ — trois cases mentaient | 7 règles tournent ; la case « écart/anomalie » est RETIRÉE avec son motif (deux concepts qu'un test de mots ne départage pas) |
| H-12 | `<th>Justificatif</th>` violait la règle du fichier qui l'écrit | FONDÉ | → « Pièce » ; la règle « jamais en titre » est désormais appliquée par test |
| H-13 | l'heuristique de langue (un accent sur la LIGNE) ratait la majorité des libellés courts | FONDÉ | la langue se juge sur le TEXTE extrait, plus sur la ligne de code ; les exemptions par fichier entier ont disparu |
| H-14 | les libellés portés par des `.ts` de service (rail, catalogue) n'étaient pas balayés | FONDÉ | services scannés ; le vocabulaire d'ENTRÉE (`examples`, `keywords`) est exclu, et c'est écrit |
| H-15 | `saufFichier: ask/` exemptait tout l'écran Interroger | FONDÉ en partie | l'écran reste la réserve du mot « requête », mais « requête au client » y est interdit, dans toutes les langues |
| H-16 | `<summary className="muted">` peint un GESTE en texte d'explication | FONDÉ | classe `repli-action` : couleur d'accent, chevron, curseur — un repli qui cache une action le dit |
| H-17 | Export PDF/Excel et « Save edit » n'étaient cliqués par AUCUN harnais (et l'export PDF était devenu inatteignable depuis son passage en repli) | FONDÉ | le parcours déplie puis clique les DEUX exports, et édite une section avec sa justification |
| H-18 | `deplier` n'ouvrait que le premier `<details>` ancêtre | FONDÉ (préventif) | boucle du plus extérieur au plus intérieur |
| H-19 | deux fonctions `deplier` de sens différents, l'une masquant l'autre | FONDÉ | `deplier(élément)` et `deplierTout()` — deux gestes, deux noms |
| H-20 | `<details>` ouverts par défaut / repli = masquage / clavier inaccessible / replis imbriqués | NON FONDÉS — vérifiés par l'agent lui-même | rien à corriger ; consignés pour ne pas les re-soulever |

**Ce que la correction a fait sortir à son tour** (deux défauts que seule la CONDUITE trouve) :
le dossier scellé refuse toute écriture — une note posée après la clôture est refusée, le produit
a raison et c'était la station qui était mal placée ; et la station de clôture n'annonçait pas son
identité, elle HÉRITAIT de celle laissée par la précédente — intercaler une station a suffi pour
qu'un préparateur sans droit de signature ne voie aucun bouton et que le parcours conclue « pas
scellé » avec zéro obstacle. Les deux sont corrigés, le second par la classe : une station dit
qui elle est.

**Ce que cette revue n'a PAS couvert, et qui reste dû** : le comptage de clics des 10
tâches du mandat (§3.D) n'est pas publié, et l'accessibilité CLAVIER n'est pas mesurée —
aucun harnais ne la traverse aujourd'hui. Les deux restent au registre (M-09, en cours).

## F. Revue UTILISATEUR n°1 (2026-08-31) — le premier test par un auditeur réel

Vingt-cinq remarques qui se ramènent à **cinq principes**, deux bugs et trois manques.
Corriger les symptômes sans les principes ferait revenir le défaut au vingt-sixième écran.

**Diagnostic accepté sans réserve** : *la plateforme s'explique au lieu de se laisser
utiliser*. Règle générale adoptée, applicable partout sans nouvelle instruction : **si une
phrase à l'écran explique POURQUOI le produit est fait ainsi, elle sort** — elle va dans un
ADR, dans la documentation, à la rigueur dans une infobulle ; jamais dans le flux de travail.

| id | ce qu'il faut faire | état | preuve / raison |
|---|---|---|---|
| R-01 | **P1 — la configuration appartient à la création du dossier** : client, date de clôture, référentiels, benchmark, balance, grand livre, contacts, « rollforward ? » + dossier N-1. Supprime les sections Reprise N-1, Imports, Contacts (→ fiche client), Balances auxiliaires (→ sous-sections Clients/Fournisseurs) | planifié | tranche à part entière : c'est un écran de création qui remplace quatre sections |
| R-02 | **P2 — toute donnée client manquante engendre une demande** : un bouton qui crée la demande pré-remplie, destinataire déduit ; upload manuel toujours possible. D'où la section permanente **Balance générale et grand livre** (versions, rapprochement automatique, écarts mis en évidence, signalements dans la vue du préparateur assigné) | planifié | unifie deux moteurs existants (demandes, imports versionnés) |
| R-03 | **P3 — la navigation suit le dossier** : rail vertical à gauche, organisation **par FSLI** (leadsheet → processus → contrôle interne → risques → échantillons → testing). Papiers de travail cesse d'être une section ; Demandes devient un espace à part ; contrôle interne et processus se séparent ; boucle et provenance disparaissent comme sections ; Interroger devient un **chat en haut à droite** | **fait** | ADR-112. Rail vertical à six groupes, un poste = une destination (`/eng/<id>/poste/<code>`) avec les six étapes ; population, sondage, testing, risque, boucle, papiers, provenance quittent le rail et vivent dans le poste ; contrôle interne et processus séparés ; bouton « Interroger le dossier » dans l'en-tête. Preuve : `rail.test.ts` (6 tests, dont le **garde de couverture** — aucun écran injoignable), rail mesuré VERTICAL dans le navigateur par `npm run clics` |
| R-04 | **P4 — la vue d'ensemble est un tableau de bord** : avancement en graphiques avec code couleur, notes de revue, **éléments attribués à la personne** ; les signalements de P2 et les points bloquants y remontent | **fait** | ADR-112. `/eng/<id>` : « Ce qui m'attend » (même dérivation que Mes travaux, restreinte au dossier) · avancement par poste en barres colorées · demandes et papiers · ce qui empêche de signer par famille · qui porte quoi · notes ouvertes rédigées. Les signalements de P2 (R-02) restent à venir avec P2 |
| R-05 | **P5 — la preuve se lit DANS le tableau** : champs extraits et relevé déterministe à droite de la ligne sélectionnée, cellules **rouges** (anomalie ou donnée absente) / **vertes** (trouvée et concordante) ; traiter les données présentes sur la pièce mais absentes de la sélection ; **zone de texte libre + pièces jointes** sous chaque procédure | planifié | l'atelier existe : c'est sa colonne de droite qui change |
| R-06 | **Bugs** : « Application error » (digest 1111597534) sur Acceptation, Équipe, Obstacles | **fait** | UNE cause : `methodology/valider.mjs` non tracé dans la fonction serverless. Corrigé + `deploiement-traces.test.ts` (le code qui lit vs la configuration qui trace) ; `/api/sante` en production : « toutes les lectures passent » |
| R-07 | **Balayage de fumée post-déploiement** contre l'URL réelle, qui fait échouer si un écran ne rend pas | **fait** | `npm run fumee [-- <url>]` : statut attendu, absence de page d'erreur, titre lu ; sans URL il lance un serveur de production local (donc il est DANS `npm run verify`), avec une URL il éprouve le déploiement ; il refuse de conclure si la protection Vercel répond à sa place |
| R-08 | **Test des écritures comptables (ODs)** — NEP 240 / ISA 240 : écritures inhabituelles, fin de période, contreparties atypiques, comptes rarement mouvementés | planifié | le moteur de critères existe (ADR : entonnoir du test des écritures) mais **aucune section ne l'expose** — manque le plus grave des trois |
| R-09 | **Opérations intragroupe** : comptes réciproques, élimination, confirmations intragroupe, instructions du groupe au composant | planifié | rien n'existe |
| R-10 | **Retraitements et ajustements du client** : le noyau `adjustments.ts` existe, aucune section ne l'expose | planifié | |
| R-11 | **Vocabulaire par pack** : « matérialité » (défaut France, ce que disent les cabinets) vs « seuil de signification » (Code de commerce, NEP) → **libellé configurable par pack et par cabinet** ; « Périmètre (postes retenus) » → **Scoping** | **fait** | DA-15, ADR-112. Bloc `vocabulaire` dans `packs/types.ts` + les deux packs, lu par `motDuPack()` ; le rail, la matérialité et le scoping le lisent. La règle du lexique s'est RETOURNÉE (`lexique.test.ts`) : « seuil de signification » est désormais l'écart, sauf dans le noyau et les citations légales. **Reste** : `services/query` porte encore le mot en dur (il ne reçoit pas le référentiel du dossier) — dit dans le code, pas caché |
| R-12 | **Ce qu'il ne faut PAS supprimer avec le texte** : la règle de conservation (en données, affichée comme DATE calculée), la traçabilité de provenance (repliée sur l'objet), le motif de sélection (étiquette courte en colonne) | planifié | contrainte permanente : supprimer l'affichage, jamais la règle |
| R-13 | « Obstacles au visa » : défaut de NOM et de PLACE, pas de concept → **« Ce qui empêche de signer »**, remonté dans le tableau de bord | **fait** | ADR-112 : le nom vient du pack, et la liste par famille est un panneau de la vue d'ensemble |
| R-14 | Le reste, point par point : justificatifs joints au scoping ; colonnes « Périmètre »/« Décision » à clarifier ou supprimer ; « Rebuild from TB » supprimé (un import suffit) ; seuils **modifiables à la main avec justification écrite** ; entretiens avec listes déroulantes (équipe / contacts) et « Consigner » supprimé ; réunions **par section** ; testing : distinguer **absence de pièce** (limitation d'étendue) de **demande de clarification** ; **modèle de papier intégré** par procédure retenue | planifié | |
| R-15 | **La remise à zéro du monde de démonstration est un GESTE du produit**, pas une variable d'environnement : bouton visible seulement en démo publique, confirmation chiffrée, et il dit ce qu'il efface | **fait** | DA-17. Instantané pris au build (`demo_instantane`), restauration en une transaction (ordre des dépendances dérivé des clés étrangères, séquences recalées), trois refus dans le service. Preuve : `monde-demo.test.ts` (8 tests, dont la restauration JOUÉE — monde abîmé puis retrouvé) |
| R-16 | **Un composant client n'emporte jamais la base dans le navigateur** — vérifié par le GRAPHE des imports, pas par la relecture | **fait** | Né du défaut de cette tranche (73 écrans à 500 pour un `import { GROUPES }`). `client-serveur.test.ts` suit les imports de valeur depuis chaque `'use client'` ; éprouvé en le cassant exprès (`nav.tsx → services/rail → lib/db/client`) |
| R-17 | **Aucun écran de dossier injoignable** après une réorganisation de la navigation | **fait** | `rail.test.ts` lit l'arborescence des routes sur le disque et exige rail, poste ou déclaration écrite |

