# Le semeur et le chemin — objet par objet

*Généré depuis `app/src/lib/semeur/registre.ts` par `npm run semeur -- --figer` ;
`npm run semeur` échoue si ce fichier a divergé du registre. Ne pas éditer à la main
(règle 21) — le registre, lui, se tient à la main, sourcé par citation fichier:ligne.*

**La question, chacune répondue objet par objet (règle 20, mandat du semeur §1)** :
le semeur crée-t-il cet objet ? Un chemin HUMAIN (une action serveur, un bouton, un
écran — jamais un script, jamais un test) existe-t-il pour créer ou atteindre le
même objet ? Et si oui, `scripts/clics/scenario.ts` l’exerce-t-il ?

**Trois états.** `DÉCOR` — le semeur crée, aucun chemin humain n’existe : c’est
l’invariant de la règle 20 en clair, un état que seul le semeur peut produire.
`non prouvé` — le chemin existe mais aucune station ne le clique : personne ne l’a
vu marcher. `prouvé` — le chemin existe et une station l’exerce (ce qui ne veut PAS
dire que la station vérifie que le résultat est correct — voir « ce que ce registre
ne vérifie pas » ci-dessous, et dans l’en-tête de `src/lib/semeur/registre.ts`).

**Compte** : 86 objet(s)/geste(s) recensé(s) sur les cinq fichiers du semeur · **16 DÉCOR** (aucun chemin humain) · **29 non prouvé(s)** (chemin humain existant, jamais cliqué) · 41 prouvé(s).

**Ce que ce registre ne vérifie PAS** : qu’une station qui clique un chemin observe
le bon résultat derrière (« cliqué » n’est pas « prouvé correct ») ; les tables de
référence pures sans genèse d’un objet de dossier ; tout objet absent des cinq
fichiers cités (le registre part du décor, pas de l’inverse) ; le monde enrichi
au-delà de ces cinq fichiers. Une note de nuance, quand il y en a une, est écrite
sous la ligne — elle ne se cache pas dans le badge.

## `src/lib/seed.ts` — Le monde de base — tenant, mission, première équipe

| Objet | Semeur | Chemin humain | Clic scénario | État |
|---|---|---|---|---|
| tenant (cabinet) | `seed.ts:61` | — | — | **DÉCOR** |
| | | | | ↳ aucun geste d’ÉCRAN ne l’insère. api/sante/route.ts:397 en insère un aussi — mais dans une SONDE de santé, transaction annulée après lecture (core/sonde.ts) : ce n’est pas un objet qu’une personne choisit de créer, c’est un témoin technique qui ne survit pas. Le verdict decor tient ; la relecture hostile a montré que la note d’origine (« aucun autre appelant ») était incomplète — corrigée ici (constat B5). |
| app_user (personne) | `seed.ts:64-69` | — | — | **DÉCOR** |
| | | | | ↳ même réserve que tenant : api/sante/route.ts:399 en insère un dans la même sonde annulée (constat B5) |
| entity (client) | `seed.ts:73-76` | `engagement.ts:92 creerClient ← app/actions.ts:77 ← nouvelle-mission.tsx:29,89` | `scenario.ts:363-387 « création : un client NEUF et son exercice »` | prouvé |
| | | | | ↳ la station a une sortie anticipée (378-381) si le client existe déjà : la preuve ne vaut que sur base FRAÎCHE, pas sur un rejeu (F3) |
| corp_group | `seed.ts:78` | — | — | **DÉCOR** |
| | | | | ↳ lu seulement (bascule.ts:39) ; aucun insert hors semeur |
| component (composante de groupe) | `seed.ts:80-83` | — | — | **DÉCOR** |
| referral_instruction | `seed.ts:85-90` | — | — | **DÉCOR** |
| | | | | ↳ aucune lecture ni écriture hors semeur trouvée |
| publierMethodologie (méthode chargée) | `seed.ts:108-114` | `methodology/actions.ts:79 soumettreMethode ← methodology/page.tsx:158` | — | non prouvé |
| | | | | ↳ /methodology n’est visitée par AUCUNE station de scenario.ts (constat D2) |
| period (exercice) | `seed.ts:93-101` | `engagement.ts:167 creerExercice ← app/actions.ts:84 ← nouvelle-mission.tsx` | `scenario.ts:369, 389-410` | prouvé |
| | | | | ↳ même réserve F3 que « entity » |
| engagement (mission) | `seed.ts:117-133` | `engagement.ts:301-311 creerMission ← app/actions.ts:86-99 ← nouvelle-mission.tsx` | `scenario.ts:363-387, 389-410` | prouvé |
| | | | | ↳ même réserve F3 |
| acceptation ouverte + jalons assurés (ouvrirAcceptation + assurerJalons) | `seed.ts:144,156` | `acceptance/actions.ts:26-31 ouvrirAction (les deux dans le MÊME geste)` | `scenario.ts:459-460 (bouton acc.openTheDecision)` | prouvé |
| | | | | ↳ constat D2, ajouté après la relecture hostile |
| critère d’acceptation répondu (repondreCritere) | `seed.ts:146-150` | `acceptance/actions.ts:34-40 repondreAction` | `scenario.ts:471-478 (boucle sur chaque critère, bouton col.record)` | prouvé |
| | | | | ↳ constat D2 |
| décision d’acceptation (decider) | `seed.ts:152-155` | `acceptance/actions.ts:43-50 deciderAction` | `scenario.ts:462-463, 483-485 (bouton acc.acceptTheEngagement, refusé sans motif puis accepté avec)` | prouvé |
| | | | | ↳ constat D2 |
| jalon posé avec sa date (poserJalon) | `seed.ts:157-162` | `acceptance/actions.ts:53-60 jalonAction ← acceptance/page.tsx:171-174 (formulaire par jalon, input[name=date])` | `scenario.ts:3195-3251 (Lot 4, tranche 3, station « jalons »)` | prouvé |
| | | | | ↳ était en désaccord avec une relecture hostile antérieure qui citait à tort la station 'jalons' (acc.markDone, une fonction différente) — corrigé ici en empruntant RÉELLEMENT jalonAction : une date neuve est posée sur un jalon non dérivé, et l’échéance affichée à l’écran est vérifiée changée, pas seulement le formulaire soumis. |
| engagement_member (premier membre, à la création) | `seed.ts:182-185` | `engagement.ts:323-328 (même appelant que creerMission)` | `scenario.ts:363-387` | prouvé |
| | | | | ↳ le semeur en pose quatre (équipe complète) ; le chemin humain n’en pose qu’un (le créateur) — même genèse, portée différente. Même réserve F3. |
| independence_declaration (posée directement, signée) | `seed.ts:187-192` | `team.ts openDeclaration/answerRubric/signDeclaration (voir section enrichir.ts) — mécanisme DIFFÉRENT du semeur (un workflow en trois gestes, pas un insert monolithique)` | `scenario.ts:515-591 (Lot 4, tranche 3, station « équipe et indépendance »)` | prouvé |
| | | | | ↳ les quatre gestes réels sont cliqués dans l’ordre : révision de ma déclaration (motif écrit), chaque rubrique répondue une par une, signature (offerte seulement une fois tout répondu — vérifié), affectation d’un membre (idempotente, sur la personne dont l’indépendance vient d’être reconfirmée par ce même parcours). |
| client_contact | `seed.ts:196-200` | — | — | **DÉCOR** |
| | | | | ↳ recherche exhaustive : SEUL seed.ts:196 insère cette table dans tout app/src ; ailleurs elle n’est que lue ou jointe (reunions.ts) |
| itgc_area (référentiel de contrôle général IT) | `seed.ts:203-207` | — | — | **DÉCOR** |
| | | | | ↳ table de référence : assertions-role.ts la réserve à des rôles techniques, pas à un geste d’écran |
| event_log « engagement_created » | `seed.ts:210-218` | — | — | **DÉCOR** |
| | | | | ↳ logEvent a de nombreux appelants humains, mais aucun avec CE verbe hors du semeur |

## `src/lib/flows/part1.ts` — Le cycle chiffre d’affaires (dossier NEP)

| Objet | Semeur | Chemin humain | Clic scénario | État |
|---|---|---|---|---|
| import TB | `part1.ts:38,40` | `imports/actions.ts:66 (uploadTbAction) ← imports/page.tsx:68 (bouton imp.importTb)` | — | non prouvé |
| | | | | ↳ FAUX dans la version d’origine (constat A1, relecture hostile) : la station 508-536 « import du grand livre définitif » ne clique QUE imp.importFec (516, 531) — imp.importTb, period_kind, tb_2025.csv/tb_2024.csv : zéro occurrence dans scenario.ts. Aucune station ne visite /imports pour un TB. |
| import FEC (provisoire puis définitif) | `part1.ts:41` | `imports/actions.ts:78 (uploadFecAction) ← imports/page.tsx:87 (bouton imp.importFec)` | `scenario.ts:508-536` | prouvé |
| rapprochement TB/GL | `part1.ts:42` | `reconciliation/page.tsx:39 (bouton col.recompute)` | `scenario.ts:539-552` | prouvé |
| limitation de rapprochement notée | `part1.ts:47-52` | `reconciliation/page.tsx:63` | — | non prouvé |
| | | | | ↳ la station 539-552 relit le verdict, elle ne clique pas ce geste précis |
| rebuildFslis | `part1.ts:53` | `imports/actions.ts:67 (SEUL appelant : à l’intérieur de uploadTbAction) ; bouton dédié scop.rebuildFromTb (scoping/page.tsx:53,63) jamais cliqué non plus` | — | non prouvé |
| | | | | ↳ FAUX dans la version d’origine (constat A2, relecture hostile) : présenté comme « exercé indirectement via l’import » — mais rebuildFslis n’est appelé QUE depuis uploadTbAction, jamais depuis uploadFecAction (le seul chemin que la station 508-536 emprunte, voir la ligne « import TB » ci-dessus). scop.rebuildFromTb : zéro occurrence dans scenario.ts. |
| matérialité proposée | `part1.ts:54` | `materiality/page.tsx:42 (propose)` | — | non prouvé |
| | | | | ↳ scenario.ts:763-769 ne fait que LIRE l’écran ; aucun clic sur propose/valider |
| matérialité validée | `part1.ts:54` | `materiality/page.tsx:57 (validate)` | — | non prouvé |
| périmètre proposé (proposeScoping) | `part1.ts:55` | `materiality/page.tsx:58` | — | non prouvé |
| périmètre confirmé (confirmScoping) | `part1.ts:81` | `scoping/page.tsx:39` | `scenario.ts:772-823` | prouvé |
| ledger_is_provisional (le grand livre est déclaré PROVISOIRE) | `part1.ts:346-352 (update engagement set ledger_is_provisional = true)` | — | — | **DÉCOR** |
| | | | | ↳ CONSTAT D1, relecture hostile — trouvé, pas dans le premier recensement. Les seuls écrivains de cette colonne dans app/src : part1.ts:347 (met à TRUE) et reconciliation.ts:95 (la remet à FALSE une fois le rapprochement propre). Aucun chemin humain ne la met à TRUE. Elle est LUE et infléchit le verdict de evaluation.ts:267 et reconciliation.ts:93 — un état que seul le semeur produit, avec un effet visible au dossier (règle 20 telle quelle). |
| sondage — propose/valide/tire | `part1.ts:97-99` | `sampling/page.tsx:34,49,57` | `scenario.ts:1068-1091 « sondage »` | prouvé |
| demande PBC générée depuis la sélection (generatePbcFromSample) | `part1.ts:100` | `sampling/page.tsx:61-68 (pbcAction)` | `scenario.ts:1095+ (bouton samp.generatePbcRequest cliqué, une demande de PLUS comptée après, pas seulement « aucun refus »)` | prouvé |
| | | | | ↳ R37 (docs/CHASSE.md §3) — CORRIGÉ EN CLASSE le 2026-09-06 : `tx()` annulait l’écriture de `generatePbcFromSample` derrière le `redirect()` réussi de `pbcAction`, dans la MÊME transaction (`lib/db/client.ts`, `tx-redirect.test.ts`). La station ne se contente plus d’« aucun refus » : elle compte les demandes au titre que SEULE cette fonction écrit, avant et après le clic (le semeur en pose déjà une sur l’ancien échantillon — « au moins une visible » aurait été un faux vert). |
| demande approuvée et envoyée (approveSend) | `part1.ts:101` | `requests/[rid]/page.tsx:33` | `scenario.ts:1158-1163` | prouvé |
| dépôt de pièces client (ingestEvidence) | `part1.ts:147` | `portal/[token]/[rid]/page.tsx:40 ; circularisations/page.tsx:57,84` | `scenario.ts:1166-1229 « portail client »` | prouvé |
| courrier entrant traité (processInbound) | `part1.ts:135,160` | — | — | **DÉCOR** |
| | | | | ↳ aucune route API ni écran appelant trouvé dans app/src/app ; seuls appelants hors semeur : scripts/demo-email.ts (script) et un test |
| pièce triée sur une ligne (attachEvidenceToItem) | `part1.ts:142` | — | — | **DÉCOR** |
| | | | | ↳ aucun appelant dans app/src/app trouvé |
| tout déposé (markAllSubmitted) | `part1.ts:170` | `portal/[token]/[rid]/page.tsx:68 (portal.toutTransmis)` | `scenario.ts:1589-1616 « portail : réponses aux clarifications » (bouton cliqué ligne 1609-1610)` | prouvé |
| | | | | ↳ CORRIGÉ (constat B3, relecture hostile) : la version d’origine citait la station « portail client » (1166-1229) — le bouton est en réalité cliqué dans la station SUIVANTE, « portail : réponses aux clarifications ». Le geste était bien prouvé ; la preuve pointait au mauvais endroit (règle 16). |
| extraction (extractAll/verifyExtraction) | `part1.ts:174-176` | `testing/page.tsx:67 ; testing/actions-atelier.ts:35` | `scenario.ts:1239-1242` | prouvé |
| appariement (runMatching) | `part1.ts:181` | `testing/page.tsx:75,153 (matchAction)` | `scenario.ts:1300-1303` | prouvé |
| clarification brouillon (draftClarificationRequest) | `part1.ts:182` | `loop/actions.ts:19` | `scenario.ts:1546-1574 « atelier : la clarification en lot »` | prouvé |
| clarification envoyée (approveSend) | `part1.ts:183` | `exceptions/page.tsx:73` | `scenario.ts:1575-1588 « la boucle : émettre les clarifications »` | prouvé |
| réponse du client (answerExplanation) | `part1.ts:192` | `portal/[token]/[rid]/page.tsx:58` | `scenario.ts:1589-1616` | prouvé |
| écart résolu (resolveException) | `part1.ts:263,311` | `exceptions/page.tsx:83` | `scenario.ts:1706+ « résolution des écarts »` | prouvé |
| écart escaladé en anomalie (escalateToMisstatement) | `part1.ts:219,250,274,284,295` | `exceptions/page.tsx:109` | `scenario.ts:1706+` | prouvé |
| limitation d’étendue enregistrée (recordScopeLimitation) | `part1.ts:325,339` | — | — | **DÉCOR** |
| | | | | ↳ CORRIGÉ (constat B2, relecture hostile) : ces deux lignes étaient AUSSI citées comme preuve de la ligne « écart escaladé / résolu » ci-dessus — un même geste du semeur ne peut pas être à la fois décor et prouvé. recordScopeLimitation est une fonction PROPRE (matching.ts:508) ; revérifié : aucun bouton dans exceptions/page.tsx pour ce geste précis. La réserve « à revérifier » de la version d’origine est LEVÉE — le décor est confirmé, pas une hypothèse. |
| re-exécution en aveugle (startVerificationRun/submitBlindCheck) | `part1.ts:357,370` | `testing/page.tsx:95,103` | `scenario.ts:1824-1909` | prouvé |
| évaluation contre l’anomalie tolérable | `part1.ts:381,388,394` | `testing/page.tsx:120,128,140` | `scenario.ts:1824-1909` | prouvé |
| listing banques importé (circularisation) | `part1.ts:422` | `circularisations/page.tsx:62` | `scenario.ts:2572-2648` | prouvé |
| contact clé déclaré (réunions) | `part1.ts:446` | `reunions/actions.ts:13` | `scenario.ts:2426-2484` | prouvé |
| circularisation envoyée / réponse / écart expliqué | `part1.ts:453,466,470` | `circularisations/page.tsx:94,110,120` | `scenario.ts:2572-2648` | prouvé |

## `src/lib/flows/part2.ts` — SOX 404 / composante (dossier PCAOB) — le dossier engSox lui-même n’apparaît NULLE PART dans scenario.ts (pas seulement /rcm)

| Objet | Semeur | Chemin humain | Clic scénario | État |
|---|---|---|---|---|
| import TB (dossier SOX) | `part2.ts:22` | `imports/actions.ts:66 (même service que le NEP, dossier différent)` | — | non prouvé |
| | | | | ↳ recherche « engSox » et « sox » dans scenario.ts et contexte.ts : ZÉRO occurrence (vérifié directement, pas déduit) — le dossier SOX entier est hors du parcours cliqué |
| rebuildFslis (SOX) | `part2.ts:23` | `scoping/page.tsx:53` | — | non prouvé |
| matérialité proposée/validée (SOX) | `part2.ts:24` | `materiality/page.tsx:42,57` | — | non prouvé |
| RCM du cycle importé (importRcm) | `part2.ts:25` | `rcm/page.tsx:34,59 (bouton rcm.importRcmClientListing)` | — | non prouvé |
| statut du walkthrough DI (setDiStatus) | `part2.ts:121` | `rcm/page.tsx:42` | — | non prouvé |
| enregistrement vidéo du walkthrough attaché (attacherWalkthrough) | `part2.ts:118 (mandat contrôle interne, 2026-09-08)` | `rcm/[cid]/page.tsx (attacherWalkthroughAction)` | — | non prouvé |
| | | | | ↳ domaine SOX entier hors du parcours cliqué (note ci-dessus, ligne 166-167) — même état que le reste de cette section, pas une régression neuve |
| tâche du walkthrough documentée (ajouterTacheControle) | `part2.ts:119` | `rcm/[cid]/page.tsx (ajouterTacheAction)` | — | non prouvé |
| procédure de tâche documentée hors inquiry — CTRL-01 (documenterProcedureTache) | `part2.ts:120` | `rcm/[cid]/page.tsx (documenterProcedureAction)` | — | non prouvé |
| demande de listing formelle (insert request/request_item ad hoc) | `part2.ts:37-40` | — | — | **DÉCOR** |
| | | | | ↳ le chemin cliquable (rcm/[cid]/page.tsx importInstancesAction) importe le CSV directement, sans créer de request formelle au préalable — un geste DIFFÉRENT de celui du semeur, pas un équivalent |
| demande envoyée + pièce reçue (approveSend, ingestEvidence — listing) | `part2.ts:43,47-54` | `requests/[rid]/page.tsx:33 ; rcm/[cid]/page.tsx (dépôt)` | — | non prouvé |
| occurrences importées (importInstances) | `part2.ts:55` | `rcm/[cid]/page.tsx:100,255` | — | non prouvé |
| pièce d’exécution de contrôle déposée (uploadControlEvidence) | `part2.ts:72 (appelée depuis 126, 143)` | `rcm/[cid]/page.tsx (dépôt sur demande d’échantillon)` | — | non prouvé |
| échantillon d’attributs tiré ET demande de preuves envoyée (drawAttributeSample + approveSend, DEUX instructions du MÊME drawAction) | `part2.ts:124-125` | `rcm/[cid]/page.tsx:115-116,257 (un seul bouton, un seul geste)` | — | non prouvé |
| | | | | ↳ CORRIGÉ (constat D5, relecture hostile) : la version d’origine comptait ces deux instructions comme deux OBJETS distincts alors que c’est un seul geste humain (un clic) qui les produit toutes les deux — fusionnées ici, le compte total en est réduit d’une ligne. |
| extraction du contrôle exécuté (extractAll/verifyExtraction, SOX) | `part2.ts:127,129,144,146` | `testing/page.tsx:67 (même service, dossier SOX)` | — | non prouvé |
| test d’efficacité exécuté (runAttributeTesting) | `part2.ts:131,148` | `rcm/[cid]/page.tsx:120` | — | non prouvé |
| extension à la population complète (extendToFullPopulation) | `part2.ts:137` | — | — | **DÉCOR** |
| | | | | ↳ aucun appelant nulle part hors part2.ts et sa propre définition (sox.ts:645) |
| déficience proposée (proposeDeficiency) | `part2.ts:161` | `rcm/[cid]/page.tsx:143,315` | — | non prouvé |
| déficience décidée (decideDeficiency) | `part2.ts:168` | `rcm/[cid]/page.tsx:155` | — | non prouvé |
| papier OE rédigé (draftOeWorkpaper) | `part2.ts:170` | `rcm/[cid]/page.tsx:167,324` | — | non prouvé |

## `src/lib/flows/enrichir.ts` — Le monde enrichi — ce qui donne au dossier l’air d’avoir été travaillé

| Objet | Semeur | Chemin humain | Clic scénario | État |
|---|---|---|---|---|
| équipe : déclaration, signature, affectation (Hugo) | `enrichir.ts:152-155` | `team/page.tsx:95 (openAction), :102 (answerAction), :115 (signAction), :122 (assignAction) — boutons :216,255,274,349` | — | non prouvé |
| | | | | ↳ /eng/[id]/team n’apparaît dans AUCUN aller() de scenario.ts |
| 2e poste retenu — confirmScoping | `enrichir.ts:182` | `scoping/page.tsx:39` | `scenario.ts:772-823` | prouvé |
| questionnaire résiduel répondu (answerQuestion, 2e poste) | `enrichir.ts:200` | `risk/page.tsx:99 (answerAction)` | `scenario.ts:907` | prouvé |
| risque évalué (assessFsli, 2e poste) | `enrichir.ts:208` | `risk/page.tsx:85-91 (assessAction, bouton risk.reAssess)` | — | non prouvé |
| | | | | ↳ CORRIGÉ (constat A3/A4, relecture hostile) : compté comme prouvé à tort dans la version d’origine, en confondant avec le clic de risk.arbitrate (scenario.ts:860,871) qui appelle overrideLevel — UN AUTRE SERVICE. « risk.reAssess » : zéro occurrence dans scenario.ts. part1.ts:88 le confirme dans son propre commentaire : « assessFsli n’était appelé que par le dossier N-1 ». |
| procédure planifiée (2e poste) | `enrichir.ts:211` | `programme/page.tsx:43` | `scenario.ts:964-970 (couvert avec « papiers du poste » ci-dessous, même geste)` | prouvé |
| papiers du poste — rédiger, IPE, viser | `enrichir.ts:98 (enregistrerIpe, appelée par le helper local declarerIpe:226,237), 225,230,233` | `programme/page.tsx:57 (redigerPapierDeProcedure) ; workpapers/[wid]/ipe-actions.ts:33,44 (enregistrerIpe) ; workpapers/[wid]/page.tsx:147 (signWorkpaper)` | `scenario.ts:944 (début de la station « programme de travail »), 979-1035 (rédaction + IPE, avec l’arrêté du rapport, R41), 1901+ (visas)` | prouvé |
| | | | | ↳ CORRIGÉ (constat B4, relecture hostile) : la citation d’origine pointait sur un COMMENTAIRE (940-943), pas sur du code cliqué — corrigée vers la vraie ligne de la station. ÉTAGE 1.1 du 2026-09-03 : c’est exactement l’écran que trois services attendaient (STATUS.md). Le geste de rédaction est confirmé en navigateur deux fois ce jour (2026-09-06) après le correctif R41 : la question de l’information produite par l’entité se répond désormais sans refus. |
| sections assurées à l’ouverture (assurerSections) | `enrichir.ts:264` | `app/eng/[id]/page.tsx:142 (effet de bord de rendu, pas un geste qu’on choisit — voir la note)` | `implicite à chaque aller(eng)` | prouvé |
| | | | | ↳ RÉSERVE ÉCRITE (constat F2, relecture hostile) : ceci n’est pas un GESTE qu’une personne décide de faire ou non, c’est un effet de bord automatique de la visite du tableau de bord. Le badge « prouvé » est correct au sens strict du registre (le code tourne à chaque visite) mais ne dit pas « quelqu’un a choisi ce geste ». |
| section envoyée à quelqu’un (envoyerA) | `enrichir.ts:280` | `app/eng/[id]/page.tsx:98-110 (envoyerAction)` | — | non prouvé |
| section attribuée à un porteur (attribuerA) | `enrichir.ts:279` | — | — | **DÉCOR** |
| | | | | ↳ CONFIRMÉ EXACT par la relecture hostile : la fonction attribuerAction (sections-actions.ts:32) EXISTE mais app/eng/[id]/page.tsx:14 n’importe que envoyerAction et suivreAction — un geste du métier sans écran (règle 13), pas seulement un chemin non cliqué. |
| note de revue ouverte (addReviewNote) | `enrichir.ts:335` | `notes/actions.ts:26 ; workpapers/[wid]/page.tsx:123` | `scenario.ts:1901+ (poste des notes) et 1969+` | prouvé |
| note antidatée (update review_note set created_at) | `enrichir.ts:349` | — | — | **DÉCOR** |
| | | | | ↳ PAR NATURE sans chemin humain — un antidatage ne se clique pas. Déjà assumé et dit (N2-3, ADR-126, docs/BACKLOG_REPORTE.md) : la démonstration publique compte sur cette fabrication ; ce n’est pas un manque à combler, c’est un décor DÉLIBÉRÉ et déjà écrit comme tel ailleurs. |
| processus importé (importerProcessus) | `enrichir.ts:366` | `processus/page.tsx:49` | `scenario.ts:638-703` | prouvé |
| changement de processus statué (statuerChangement) | `enrichir.ts:374` | `processus/page.tsx:64` | `scenario.ts:670-677` | prouvé |
| | | | | ↳ CORRIGÉ (constat B1, relecture hostile) : la citation d’origine (369) pointait sur importerProcessus, pas sur statuerChangement — corrigée. |
| RCM du cycle (importRcm, revu depuis enrichir.ts) | `enrichir.ts:388` | `rcm/page.tsx:34` | — | non prouvé |
| | | | | ↳ même route que la ligne part2.ts — engSox n’est visité par AUCUNE station |
| grille calculée | `enrichir.ts:401` | `testing/page.tsx:78,87` | `scenario.ts:1324-1472 « atelier de test : la grille, les ancres, les refus, la conclusion »` | prouvé |
| cellule disposée | `enrichir.ts:420` | `testing/actions-atelier.ts:66` | `scenario.ts:1324-1472` | prouvé |
| ligne conclue | `enrichir.ts:416,423` | `testing/actions-atelier.ts:57` | `scenario.ts:1324-1472` | prouvé |
| revue analytique du poste rédigée | `enrichir.ts:434` | `poste/[code]/actions.ts:41 ← poste/[code]/page.tsx:231` | `scenario.ts:2352-2357 (vide, refuse ANA-01, rédige v1, propose, enregistre v2)` | prouvé |
| | | | | ↳ CORRIGÉ (constat B6, relecture hostile) : la version d’origine publiait un DOUTE FAUX (« pas de certitude qu’elle clique elle-même le geste »). Vérifié ligne à ligne : 2352-2353 vide et refuse à blanc (ANA-01), 2356-2357 rédige et enregistre (v1), 2360 propose, 2366 enregistre (v2). Le clic est certain. |

## `src/lib/services/monde-demo.ts` — La remise à zéro — restaure TOUTES les tables depuis l’instantané, aucun objet métier propre

| Objet | Semeur | Chemin humain | Clic scénario | État |
|---|---|---|---|---|
| remettreLeMondeAZero (le geste, pas un objet) | `monde-demo.ts:203-273` | `app/demo/remise-a-zero/actions.ts ← app/demo/remise-a-zero/page.tsx (bouton de confirmation)` | — | non prouvé |
| | | | | ↳ /demo/remise-a-zero n’apparaît dans aucun aller() de scenario.ts |

## La liste « décor » seule, pour ne pas la chercher dans le tableau

- **tenant (cabinet)** (`seed.ts:61`) — aucun geste d’ÉCRAN ne l’insère. api/sante/route.ts:397 en insère un aussi — mais dans une SONDE de santé, transaction annulée après lecture (core/sonde.ts) : ce n’est pas un objet qu’une personne choisit de créer, c’est un témoin technique qui ne survit pas. Le verdict decor tient ; la relecture hostile a montré que la note d’origine (« aucun autre appelant ») était incomplète — corrigée ici (constat B5).
- **app_user (personne)** (`seed.ts:64-69`) — même réserve que tenant : api/sante/route.ts:399 en insère un dans la même sonde annulée (constat B5)
- **corp_group** (`seed.ts:78`) — lu seulement (bascule.ts:39) ; aucun insert hors semeur
- **component (composante de groupe)** (`seed.ts:80-83`)
- **referral_instruction** (`seed.ts:85-90`) — aucune lecture ni écriture hors semeur trouvée
- **client_contact** (`seed.ts:196-200`) — recherche exhaustive : SEUL seed.ts:196 insère cette table dans tout app/src ; ailleurs elle n’est que lue ou jointe (reunions.ts)
- **itgc_area (référentiel de contrôle général IT)** (`seed.ts:203-207`) — table de référence : assertions-role.ts la réserve à des rôles techniques, pas à un geste d’écran
- **event_log « engagement_created »** (`seed.ts:210-218`) — logEvent a de nombreux appelants humains, mais aucun avec CE verbe hors du semeur
- **ledger_is_provisional (le grand livre est déclaré PROVISOIRE)** (`part1.ts:346-352 (update engagement set ledger_is_provisional = true)`) — CONSTAT D1, relecture hostile — trouvé, pas dans le premier recensement. Les seuls écrivains de cette colonne dans app/src : part1.ts:347 (met à TRUE) et reconciliation.ts:95 (la remet à FALSE une fois le rapprochement propre). Aucun chemin humain ne la met à TRUE. Elle est LUE et infléchit le verdict de evaluation.ts:267 et reconciliation.ts:93 — un état que seul le semeur produit, avec un effet visible au dossier (règle 20 telle quelle).
- **courrier entrant traité (processInbound)** (`part1.ts:135,160`) — aucune route API ni écran appelant trouvé dans app/src/app ; seuls appelants hors semeur : scripts/demo-email.ts (script) et un test
- **pièce triée sur une ligne (attachEvidenceToItem)** (`part1.ts:142`) — aucun appelant dans app/src/app trouvé
- **limitation d’étendue enregistrée (recordScopeLimitation)** (`part1.ts:325,339`) — CORRIGÉ (constat B2, relecture hostile) : ces deux lignes étaient AUSSI citées comme preuve de la ligne « écart escaladé / résolu » ci-dessus — un même geste du semeur ne peut pas être à la fois décor et prouvé. recordScopeLimitation est une fonction PROPRE (matching.ts:508) ; revérifié : aucun bouton dans exceptions/page.tsx pour ce geste précis. La réserve « à revérifier » de la version d’origine est LEVÉE — le décor est confirmé, pas une hypothèse.
- **demande de listing formelle (insert request/request_item ad hoc)** (`part2.ts:37-40`) — le chemin cliquable (rcm/[cid]/page.tsx importInstancesAction) importe le CSV directement, sans créer de request formelle au préalable — un geste DIFFÉRENT de celui du semeur, pas un équivalent
- **extension à la population complète (extendToFullPopulation)** (`part2.ts:137`) — aucun appelant nulle part hors part2.ts et sa propre définition (sox.ts:645)
- **section attribuée à un porteur (attribuerA)** (`enrichir.ts:279`) — CONFIRMÉ EXACT par la relecture hostile : la fonction attribuerAction (sections-actions.ts:32) EXISTE mais app/eng/[id]/page.tsx:14 n’importe que envoyerAction et suivreAction — un geste du métier sans écran (règle 13), pas seulement un chemin non cliqué.
- **note antidatée (update review_note set created_at)** (`enrichir.ts:349`) — PAR NATURE sans chemin humain — un antidatage ne se clique pas. Déjà assumé et dit (N2-3, ADR-126, docs/BACKLOG_REPORTE.md) : la démonstration publique compte sur cette fabrication ; ce n’est pas un manque à combler, c’est un décor DÉLIBÉRÉ et déjà écrit comme tel ailleurs.

## La liste « non prouvé » seule, pour ne pas la chercher dans le tableau

- **publierMethodologie (méthode chargée)** — chemin : `methodology/actions.ts:79 soumettreMethode ← methodology/page.tsx:158` — /methodology n’est visitée par AUCUNE station de scenario.ts (constat D2)
- **import TB** — chemin : `imports/actions.ts:66 (uploadTbAction) ← imports/page.tsx:68 (bouton imp.importTb)` — FAUX dans la version d’origine (constat A1, relecture hostile) : la station 508-536 « import du grand livre définitif » ne clique QUE imp.importFec (516, 531) — imp.importTb, period_kind, tb_2025.csv/tb_2024.csv : zéro occurrence dans scenario.ts. Aucune station ne visite /imports pour un TB.
- **limitation de rapprochement notée** — chemin : `reconciliation/page.tsx:63` — la station 539-552 relit le verdict, elle ne clique pas ce geste précis
- **rebuildFslis** — chemin : `imports/actions.ts:67 (SEUL appelant : à l’intérieur de uploadTbAction) ; bouton dédié scop.rebuildFromTb (scoping/page.tsx:53,63) jamais cliqué non plus` — FAUX dans la version d’origine (constat A2, relecture hostile) : présenté comme « exercé indirectement via l’import » — mais rebuildFslis n’est appelé QUE depuis uploadTbAction, jamais depuis uploadFecAction (le seul chemin que la station 508-536 emprunte, voir la ligne « import TB » ci-dessus). scop.rebuildFromTb : zéro occurrence dans scenario.ts.
- **matérialité proposée** — chemin : `materiality/page.tsx:42 (propose)` — scenario.ts:763-769 ne fait que LIRE l’écran ; aucun clic sur propose/valider
- **matérialité validée** — chemin : `materiality/page.tsx:57 (validate)`
- **périmètre proposé (proposeScoping)** — chemin : `materiality/page.tsx:58`
- **import TB (dossier SOX)** — chemin : `imports/actions.ts:66 (même service que le NEP, dossier différent)` — recherche « engSox » et « sox » dans scenario.ts et contexte.ts : ZÉRO occurrence (vérifié directement, pas déduit) — le dossier SOX entier est hors du parcours cliqué
- **rebuildFslis (SOX)** — chemin : `scoping/page.tsx:53`
- **matérialité proposée/validée (SOX)** — chemin : `materiality/page.tsx:42,57`
- **RCM du cycle importé (importRcm)** — chemin : `rcm/page.tsx:34,59 (bouton rcm.importRcmClientListing)`
- **statut du walkthrough DI (setDiStatus)** — chemin : `rcm/page.tsx:42`
- **enregistrement vidéo du walkthrough attaché (attacherWalkthrough)** — chemin : `rcm/[cid]/page.tsx (attacherWalkthroughAction)` — domaine SOX entier hors du parcours cliqué (note ci-dessus, ligne 166-167) — même état que le reste de cette section, pas une régression neuve
- **tâche du walkthrough documentée (ajouterTacheControle)** — chemin : `rcm/[cid]/page.tsx (ajouterTacheAction)`
- **procédure de tâche documentée hors inquiry — CTRL-01 (documenterProcedureTache)** — chemin : `rcm/[cid]/page.tsx (documenterProcedureAction)`
- **demande envoyée + pièce reçue (approveSend, ingestEvidence — listing)** — chemin : `requests/[rid]/page.tsx:33 ; rcm/[cid]/page.tsx (dépôt)`
- **occurrences importées (importInstances)** — chemin : `rcm/[cid]/page.tsx:100,255`
- **pièce d’exécution de contrôle déposée (uploadControlEvidence)** — chemin : `rcm/[cid]/page.tsx (dépôt sur demande d’échantillon)`
- **échantillon d’attributs tiré ET demande de preuves envoyée (drawAttributeSample + approveSend, DEUX instructions du MÊME drawAction)** — chemin : `rcm/[cid]/page.tsx:115-116,257 (un seul bouton, un seul geste)` — CORRIGÉ (constat D5, relecture hostile) : la version d’origine comptait ces deux instructions comme deux OBJETS distincts alors que c’est un seul geste humain (un clic) qui les produit toutes les deux — fusionnées ici, le compte total en est réduit d’une ligne.
- **extraction du contrôle exécuté (extractAll/verifyExtraction, SOX)** — chemin : `testing/page.tsx:67 (même service, dossier SOX)`
- **test d’efficacité exécuté (runAttributeTesting)** — chemin : `rcm/[cid]/page.tsx:120`
- **déficience proposée (proposeDeficiency)** — chemin : `rcm/[cid]/page.tsx:143,315`
- **déficience décidée (decideDeficiency)** — chemin : `rcm/[cid]/page.tsx:155`
- **papier OE rédigé (draftOeWorkpaper)** — chemin : `rcm/[cid]/page.tsx:167,324`
- **équipe : déclaration, signature, affectation (Hugo)** — chemin : `team/page.tsx:95 (openAction), :102 (answerAction), :115 (signAction), :122 (assignAction) — boutons :216,255,274,349` — /eng/[id]/team n’apparaît dans AUCUN aller() de scenario.ts
- **risque évalué (assessFsli, 2e poste)** — chemin : `risk/page.tsx:85-91 (assessAction, bouton risk.reAssess)` — CORRIGÉ (constat A3/A4, relecture hostile) : compté comme prouvé à tort dans la version d’origine, en confondant avec le clic de risk.arbitrate (scenario.ts:860,871) qui appelle overrideLevel — UN AUTRE SERVICE. « risk.reAssess » : zéro occurrence dans scenario.ts. part1.ts:88 le confirme dans son propre commentaire : « assessFsli n’était appelé que par le dossier N-1 ».
- **section envoyée à quelqu’un (envoyerA)** — chemin : `app/eng/[id]/page.tsx:98-110 (envoyerAction)`
- **RCM du cycle (importRcm, revu depuis enrichir.ts)** — chemin : `rcm/page.tsx:34` — même route que la ligne part2.ts — engSox n’est visité par AUCUNE station
- **remettreLeMondeAZero (le geste, pas un objet)** — chemin : `app/demo/remise-a-zero/actions.ts ← app/demo/remise-a-zero/page.tsx (bouton de confirmation)` — /demo/remise-a-zero n’apparaît dans aucun aller() de scenario.ts
