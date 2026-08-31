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
| F-34 | Confirmations avocats (litiges, provisions, écarts > CTT) | planifié | backlog M-03 |
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
| M-00a | URL : démo déployée sur Vercel, données fictives reconstruites, bandeau permanent, IA réelle OFF | en cours | motif « bloqué » précédent ERRONÉ (Q-02, DA-09) : le projet Vercel servait du vide (Root Directory, branche) ; en cours de correction — fini seulement quand J'AI chargé l'URL, ouvert un dossier, affiché l'atelier, et rapporté ce que j'ai lu |
| M-00b | Windows : `DEMARRAGE_WINDOWS.md` ≤ 10 lignes PowerShell + contraintes de conception | fait | DEMARRAGE_WINDOWS.md (9 lignes, une commande par ligne) ; audit de classe : zéro spawn résolu par le PATH ; diagnostic + messages par cause (L-20, ADR-095/096) |
| M-01 | Balances auxiliaires | fait | = L-17 |
| M-02 | Contrôle interne / walkthroughs — finir proprement | fait | chaîne complète verte (code 0) : 494 tests / 74 routes / 126 étapes / 276 vues ; stations cliquées du processus passées |
| M-03 | Confirmations banques + avocats bout-en-bout | planifié | après P0 |
| M-04 | Parties liées, y compris non déclarées | planifié | |
| M-05 | Notes de revue : récurrence + ancienneté jours ouvrés | planifié | = L-19 |
| M-06 | Export d'avancement, 3 audiences, envoi périodique | planifié | = F-11/F-37 |
| M-07 | Sectoriel + LCB-FT : structure seulement | planifié | sources non atteignables — dit ici comme exigé |
| M-08 | E-mail : (a) SMTP sortant, (b) Graph libre/occupé chiffré à part, (c) adresse entrante par dossier | planifié | |
| M-09 | Densité & navigation mesurables (§3.D) : clics publiés, ≤3 clics depuis Mes travaux, ≤5 actions primaires, clavier, LEXIQUE.md | planifié | secondes/ligne et reprise exacte déjà mesurées (L-15) |
| M-10 | Écran testing revenue = le meilleur du produit, secondes/ligne avant/après | fait | = L-15 (à re-mesurer à chaque évolution) |
| M-11 | Estimations + ERP + tableur joint | fait | = F-36, F-41, F-17 |
| M-12 | IA réelle livrée avec PBC jamais vus téléversés côté client | fait | = L-16 ; le scénario « Tuan téléverse lui-même en tant que client » entre au PROGRAMME_TEST_V1 |
| M-13 | Packs complets : normes × référentiel comptable × contrôle interne ; bascule qui change l'écran | planifié | 2 dossiers démo FR/US FAITS ; libellés par pack largement en place (packs nommant, code calculant) ; la démonstration de bascule §3.A + vocabulaire comptable PCG/IFRS/US GAAP restent à couvrir |
| M-14 | §3.B tâches manquantes : budget et heures | planifié | rien n'existe aujourd'hui — à construire |
| M-15 | §3.B tâches manquantes : continuité d'exploitation | planifié | absente en tant que travail dédié (l'acceptation y touche) — à construire |
| M-16 | §3.C : docs/AUTOMATISATION.md — champs tapés avant/après, par écran | planifié | |
| M-17 | §3.D : docs/LEXIQUE.md — un concept = un mot, revue des libellés | planifié | |
| M-18 | Registre des idées, DECISIONS_AUTONOMES, QUESTIONS_EN_ATTENTE, PROGRAMME_TEST_V1, LIVRAISON_V1 | en cours | ce fichier + docs/DECISIONS_AUTONOMES.md + docs/QUESTIONS_EN_ATTENTE.md créés ; programme de test et livraison = fin de v1 |

**Rappel permanent** : les 19 sources du catalogue méthodologique restent `verifie: false`
(methodology/sources.json) — aucune n'est utilisée comme si elle était vérifiée.
