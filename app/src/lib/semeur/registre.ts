/** Le registre du décor (R44, mandat du semeur §1 ; CLAUDE.md règle 20).
 *
 * Généré par `npm run semeur -- --figer` en `docs/SEMEUR_VS_CHEMIN.md` — ne pas éditer le
 * document à la main (règle 21) ; CE fichier, lui, se tient à la main, comme
 * `lib/gardes/registre.ts` : les faits qu'il porte viennent d'une recherche par citation
 * fichier:ligne (agent d'exploration, 2026-09-06), VÉRIFIÉE ET CORRIGÉE par une relecture
 * hostile (agent adverse, même jour, modèle le plus fort disponible — règle 24/30 : un seul
 * passage, ce fichier est de la documentation, pas une garde). Les citations `scenario.ts`
 * sont tenues à jour sur le SHA `c187cae` — CE FICHIER BOUGE : toute pousse qui touche
 * `scripts/clics/scenario.ts` peut décaler des numéros de ligne sans que rien ne le signale
 * (E1/E2 ci-dessous comblent une partie de ce risque, pas tout — voir la garde de generateur).
 *
 * TROIS ÉTATS, PAS DEUX :
 *  - `decor`      — le semeur crée l'objet ; AUCUN chemin humain ne le crée ou ne l'atteint.
 *                    C'est l'invariant de la règle 20 : « un état que seul le semeur peut
 *                    produire n'est pas une fonctionnalité, c'est un décor ».
 *  - `non_prouve` — un chemin humain EXISTE (une action serveur, un bouton, un écran) mais
 *                   `scripts/clics/scenario.ts` ne le clique JAMAIS — pas « visite la bonne
 *                   page », CLIQUE le bon bouton : la relecture hostile a trouvé trois lignes
 *                   où la preuve d'origine confondait les deux (A1-A3 ci-dessous).
 *  - `prouve`     — le chemin existe ET une station du parcours cliqué CLIQUE le bon bouton.
 *
 * CE QUE CE REGISTRE NE VÉRIFIE PAS (règle 19) :
 *  - qu'une station qui CLIQUE un chemin observe aussi le bon RÉSULTAT (une station peut
 *    cliquer un bouton et ne rien vérifier d'utile derrière — ce registre dit « cliqué »,
 *    pas « prouvé correct ») ;
 *  - les tables de référence pures (méthode, catalogues) sans genèse d'un objet de dossier ;
 *  - tout objet qui n'apparaît dans AUCUN des cinq fichiers du semeur (hors de portée : ce
 *    registre part du décor, pas de l'inverse) ;
 *  - le contenu du monde ENRICHI au-delà des cinq fichiers cités en tête de chaque section ;
 *  - qu'un chemin cité « prouvé » se rejoue sur une base DÉJÀ jouée : plusieurs stations
 *    (création du client/exercice/mission) ont une sortie anticipée si l'objet existe déjà
 *    (F3) — la preuve ne vaut que pour un premier passage, base fraîche. */

export type EtatChemin = 'decor' | 'non_prouve' | 'prouve';

export interface ObjetSemeur {
  /** Nom métier de l'objet ou du geste. */
  objet: string;
  /** Fichier du SEMEUR qui le crée, et la ligne. */
  semeur: string;
  /** Citation fichier:ligne du chemin humain (service + écran), ou null si aucun trouvé. */
  cheminHumain: string | null;
  /** Citation fichier:ligne de la station qui l'exerce dans scripts/clics/scenario.ts, ou null. */
  clique: string | null;
  etat: EtatChemin;
  /** Une nuance que le tableau à trois colonnes ne peut pas porter — jamais pour se dédouaner. */
  note?: string;
}

export interface SectionSemeur {
  fichier: string;
  titre: string;
  objets: ObjetSemeur[];
}

export const SECTIONS: SectionSemeur[] = [
  {
    fichier: 'src/lib/seed.ts',
    titre: 'Le monde de base — tenant, mission, première équipe',
    objets: [
      { objet: 'tenant (cabinet)', semeur: 'seed.ts:61', cheminHumain: null, clique: null, etat: 'decor',
        note: 'aucun geste d’ÉCRAN ne l’insère. api/sante/route.ts:397 en insère un aussi — mais dans une SONDE de santé, transaction annulée après lecture (core/sonde.ts) : ce n’est pas un objet qu’une personne choisit de créer, c’est un témoin technique qui ne survit pas. Le verdict decor tient ; la relecture hostile a montré que la note d’origine (« aucun autre appelant ») était incomplète — corrigée ici (constat B5).' },
      { objet: 'app_user (personne)', semeur: 'seed.ts:64-69', cheminHumain: null, clique: null, etat: 'decor',
        note: 'même réserve que tenant : api/sante/route.ts:399 en insère un dans la même sonde annulée (constat B5)' },
      { objet: 'entity (client)', semeur: 'seed.ts:73-76',
        cheminHumain: 'engagement.ts:92 creerClient ← app/actions.ts:77 ← nouvelle-mission.tsx:29,89',
        clique: 'scenario.ts:363-387 « création : un client NEUF et son exercice »', etat: 'prouve',
        note: 'la station a une sortie anticipée (378-381) si le client existe déjà : la preuve ne vaut que sur base FRAÎCHE, pas sur un rejeu (F3)' },
      { objet: 'corp_group', semeur: 'seed.ts:78', cheminHumain: null, clique: null, etat: 'decor',
        note: 'lu seulement (bascule.ts:39) ; aucun insert hors semeur' },
      { objet: 'component (composante de groupe)', semeur: 'seed.ts:80-83', cheminHumain: null, clique: null, etat: 'decor' },
      { objet: 'referral_instruction', semeur: 'seed.ts:85-90', cheminHumain: null, clique: null, etat: 'decor',
        note: 'aucune lecture ni écriture hors semeur trouvée' },
      { objet: 'publierMethodologie (méthode chargée)', semeur: 'seed.ts:108-114',
        cheminHumain: 'methodology/actions.ts:79 soumettreMethode ← methodology/page.tsx:158',
        clique: null, etat: 'non_prouve', note: '/methodology n’est visitée par AUCUNE station de scenario.ts (constat D2)' },
      { objet: 'period (exercice)', semeur: 'seed.ts:93-101',
        cheminHumain: 'engagement.ts:167 creerExercice ← app/actions.ts:84 ← nouvelle-mission.tsx',
        clique: 'scenario.ts:369, 389-410', etat: 'prouve', note: 'même réserve F3 que « entity »' },
      { objet: 'engagement (mission)', semeur: 'seed.ts:117-133',
        cheminHumain: 'engagement.ts:301-311 creerMission ← app/actions.ts:86-99 ← nouvelle-mission.tsx',
        clique: 'scenario.ts:363-387, 389-410', etat: 'prouve', note: 'même réserve F3' },
      { objet: 'acceptation ouverte + jalons assurés (ouvrirAcceptation + assurerJalons)', semeur: 'seed.ts:144,156',
        cheminHumain: 'acceptance/actions.ts:26-31 ouvrirAction (les deux dans le MÊME geste)',
        clique: 'scenario.ts:459-460 (bouton acc.openTheDecision)', etat: 'prouve', note: 'constat D2, ajouté après la relecture hostile' },
      { objet: 'critère d’acceptation répondu (repondreCritere)', semeur: 'seed.ts:146-150',
        cheminHumain: 'acceptance/actions.ts:34-40 repondreAction',
        clique: 'scenario.ts:471-478 (boucle sur chaque critère, bouton col.record)', etat: 'prouve', note: 'constat D2' },
      { objet: 'décision d’acceptation (decider)', semeur: 'seed.ts:152-155',
        cheminHumain: 'acceptance/actions.ts:43-50 deciderAction',
        clique: 'scenario.ts:462-463, 483-485 (bouton acc.acceptTheEngagement, refusé sans motif puis accepté avec)', etat: 'prouve', note: 'constat D2' },
      { objet: 'jalon posé avec sa date (poserJalon)', semeur: 'seed.ts:157-162',
        cheminHumain: 'acceptance/actions.ts:53-60 jalonAction ← acceptance/page.tsx:171-174 (formulaire par jalon, input[name=date])',
        clique: null, etat: 'non_prouve',
        note: 'DÉSACCORD AVEC LA RELECTURE HOSTILE, VÉRIFIÉ MOI-MÊME : elle proposait station(\'jalons\') 2699 comme preuve — cette station ne clique QUE acc.markDone (marquerJalonFait, une fonction DIFFÉRENTE que le semeur n’appelle jamais) ; aucun input[name=date] scopé à un jalon n’est jamais rempli dans scenario.ts. poserJalon reste non_prouve.' },
      { objet: 'engagement_member (premier membre, à la création)', semeur: 'seed.ts:182-185',
        cheminHumain: 'engagement.ts:323-328 (même appelant que creerMission)',
        clique: 'scenario.ts:363-387', etat: 'prouve',
        note: 'le semeur en pose quatre (équipe complète) ; le chemin humain n’en pose qu’un (le créateur) — même genèse, portée différente. Même réserve F3.' },
      { objet: 'independence_declaration (posée directement, signée)', semeur: 'seed.ts:187-192',
        cheminHumain: 'team.ts openDeclaration/answerRubric/signDeclaration (voir section enrichir.ts) — mécanisme DIFFÉRENT du semeur (un workflow en trois gestes, pas un insert monolithique)',
        clique: null, etat: 'non_prouve',
        note: 'le chemin existe mais /eng/[id]/team n’est visité par AUCUNE station de scenario.ts' },
      { objet: 'client_contact', semeur: 'seed.ts:196-200', cheminHumain: null, clique: null, etat: 'decor',
        note: 'recherche exhaustive : SEUL seed.ts:196 insère cette table dans tout app/src ; ailleurs elle n’est que lue ou jointe (reunions.ts)' },
      { objet: 'itgc_area (référentiel de contrôle général IT)', semeur: 'seed.ts:203-207', cheminHumain: null, clique: null, etat: 'decor',
        note: 'table de référence : assertions-role.ts la réserve à des rôles techniques, pas à un geste d’écran' },
      { objet: 'event_log « engagement_created »', semeur: 'seed.ts:210-218', cheminHumain: null, clique: null, etat: 'decor',
        note: 'logEvent a de nombreux appelants humains, mais aucun avec CE verbe hors du semeur' },
    ],
  },
  {
    fichier: 'src/lib/flows/part1.ts',
    titre: 'Le cycle chiffre d’affaires (dossier NEP)',
    objets: [
      { objet: 'import TB', semeur: 'part1.ts:38,40', cheminHumain: 'imports/actions.ts:66 (uploadTbAction) ← imports/page.tsx:68 (bouton imp.importTb)',
        clique: null, etat: 'non_prouve',
        note: 'FAUX dans la version d’origine (constat A1, relecture hostile) : la station 508-536 « import du grand livre définitif » ne clique QUE imp.importFec (516, 531) — imp.importTb, period_kind, tb_2025.csv/tb_2024.csv : zéro occurrence dans scenario.ts. Aucune station ne visite /imports pour un TB.' },
      { objet: 'import FEC (provisoire puis définitif)', semeur: 'part1.ts:41', cheminHumain: 'imports/actions.ts:78 (uploadFecAction) ← imports/page.tsx:87 (bouton imp.importFec)', clique: 'scenario.ts:508-536', etat: 'prouve' },
      { objet: 'rapprochement TB/GL', semeur: 'part1.ts:42', cheminHumain: 'reconciliation/page.tsx:39 (bouton col.recompute)', clique: 'scenario.ts:539-552', etat: 'prouve' },
      { objet: 'limitation de rapprochement notée', semeur: 'part1.ts:47-52', cheminHumain: 'reconciliation/page.tsx:63', clique: null, etat: 'non_prouve',
        note: 'la station 539-552 relit le verdict, elle ne clique pas ce geste précis' },
      { objet: 'rebuildFslis', semeur: 'part1.ts:53', cheminHumain: 'imports/actions.ts:67 (SEUL appelant : à l’intérieur de uploadTbAction) ; bouton dédié scop.rebuildFromTb (scoping/page.tsx:53,63) jamais cliqué non plus',
        clique: null, etat: 'non_prouve',
        note: 'FAUX dans la version d’origine (constat A2, relecture hostile) : présenté comme « exercé indirectement via l’import » — mais rebuildFslis n’est appelé QUE depuis uploadTbAction, jamais depuis uploadFecAction (le seul chemin que la station 508-536 emprunte, voir la ligne « import TB » ci-dessus). scop.rebuildFromTb : zéro occurrence dans scenario.ts.' },
      { objet: 'matérialité proposée', semeur: 'part1.ts:54', cheminHumain: 'materiality/page.tsx:42 (propose)', clique: null, etat: 'non_prouve',
        note: 'scenario.ts:763-769 ne fait que LIRE l’écran ; aucun clic sur propose/valider' },
      { objet: 'matérialité validée', semeur: 'part1.ts:54', cheminHumain: 'materiality/page.tsx:57 (validate)', clique: null, etat: 'non_prouve' },
      { objet: 'périmètre proposé (proposeScoping)', semeur: 'part1.ts:55', cheminHumain: 'materiality/page.tsx:58', clique: null, etat: 'non_prouve' },
      { objet: 'périmètre confirmé (confirmScoping)', semeur: 'part1.ts:81', cheminHumain: 'scoping/page.tsx:39', clique: 'scenario.ts:772-823', etat: 'prouve' },
      { objet: 'ledger_is_provisional (le grand livre est déclaré PROVISOIRE)', semeur: 'part1.ts:346-352 (update engagement set ledger_is_provisional = true)',
        cheminHumain: null, clique: null, etat: 'decor',
        note: 'CONSTAT D1, relecture hostile — trouvé, pas dans le premier recensement. Les seuls écrivains de cette colonne dans app/src : part1.ts:347 (met à TRUE) et reconciliation.ts:95 (la remet à FALSE une fois le rapprochement propre). Aucun chemin humain ne la met à TRUE. Elle est LUE et infléchit le verdict de evaluation.ts:267 et reconciliation.ts:93 — un état que seul le semeur produit, avec un effet visible au dossier (règle 20 telle quelle).' },
      { objet: 'sondage — propose/valide/tire', semeur: 'part1.ts:97-99', cheminHumain: 'sampling/page.tsx:34,49,57', clique: 'scenario.ts:1068-1091 « sondage »', etat: 'prouve' },
      { objet: 'demande PBC générée depuis la sélection (generatePbcFromSample)', semeur: 'part1.ts:100', cheminHumain: 'sampling/page.tsx:61-68 (pbcAction)', clique: 'scenario.ts:1095+ (bouton samp.generatePbcRequest cliqué, une demande de PLUS comptée après, pas seulement « aucun refus »)', etat: 'prouve',
        note: 'R37 (docs/CHASSE.md §3) — CORRIGÉ EN CLASSE le 2026-09-06 : `tx()` annulait l’écriture de `generatePbcFromSample` derrière le `redirect()` réussi de `pbcAction`, dans la MÊME transaction (`lib/db/client.ts`, `tx-redirect.test.ts`). La station ne se contente plus d’« aucun refus » : elle compte les demandes au titre que SEULE cette fonction écrit, avant et après le clic (le semeur en pose déjà une sur l’ancien échantillon — « au moins une visible » aurait été un faux vert).' },
      { objet: 'demande approuvée et envoyée (approveSend)', semeur: 'part1.ts:101', cheminHumain: 'requests/[rid]/page.tsx:33', clique: 'scenario.ts:1158-1163', etat: 'prouve' },
      { objet: 'dépôt de pièces client (ingestEvidence)', semeur: 'part1.ts:147', cheminHumain: 'portal/[token]/[rid]/page.tsx:40 ; circularisations/page.tsx:57,84', clique: 'scenario.ts:1166-1229 « portail client »', etat: 'prouve' },
      { objet: 'courrier entrant traité (processInbound)', semeur: 'part1.ts:135,160', cheminHumain: null, clique: null, etat: 'decor',
        note: 'aucune route API ni écran appelant trouvé dans app/src/app ; seuls appelants hors semeur : scripts/demo-email.ts (script) et un test' },
      { objet: 'pièce triée sur une ligne (attachEvidenceToItem)', semeur: 'part1.ts:142', cheminHumain: null, clique: null, etat: 'decor',
        note: 'aucun appelant dans app/src/app trouvé' },
      { objet: 'tout déposé (markAllSubmitted)', semeur: 'part1.ts:170', cheminHumain: 'portal/[token]/[rid]/page.tsx:68 (portal.toutTransmis)', clique: 'scenario.ts:1589-1616 « portail : réponses aux clarifications » (bouton cliqué ligne 1609-1610)', etat: 'prouve',
        note: 'CORRIGÉ (constat B3, relecture hostile) : la version d’origine citait la station « portail client » (1166-1229) — le bouton est en réalité cliqué dans la station SUIVANTE, « portail : réponses aux clarifications ». Le geste était bien prouvé ; la preuve pointait au mauvais endroit (règle 16).' },
      { objet: 'extraction (extractAll/verifyExtraction)', semeur: 'part1.ts:174-176', cheminHumain: 'testing/page.tsx:67 ; testing/actions-atelier.ts:35', clique: 'scenario.ts:1239-1242', etat: 'prouve' },
      { objet: 'appariement (runMatching)', semeur: 'part1.ts:181', cheminHumain: 'testing/page.tsx:75,153 (matchAction)', clique: 'scenario.ts:1300-1303', etat: 'prouve' },
      { objet: 'clarification brouillon (draftClarificationRequest)', semeur: 'part1.ts:182', cheminHumain: 'loop/actions.ts:19', clique: 'scenario.ts:1546-1574 « atelier : la clarification en lot »', etat: 'prouve' },
      { objet: 'clarification envoyée (approveSend)', semeur: 'part1.ts:183', cheminHumain: 'exceptions/page.tsx:73', clique: 'scenario.ts:1575-1588 « la boucle : émettre les clarifications »', etat: 'prouve' },
      { objet: 'réponse du client (answerExplanation)', semeur: 'part1.ts:192', cheminHumain: 'portal/[token]/[rid]/page.tsx:58', clique: 'scenario.ts:1589-1616', etat: 'prouve' },
      { objet: 'écart résolu (resolveException)', semeur: 'part1.ts:263,311', cheminHumain: 'exceptions/page.tsx:83', clique: 'scenario.ts:1706+ « résolution des écarts »', etat: 'prouve' },
      { objet: 'écart escaladé en anomalie (escalateToMisstatement)', semeur: 'part1.ts:219,250,274,284,295', cheminHumain: 'exceptions/page.tsx:109', clique: 'scenario.ts:1706+', etat: 'prouve' },
      { objet: 'limitation d’étendue enregistrée (recordScopeLimitation)', semeur: 'part1.ts:325,339', cheminHumain: null, clique: null, etat: 'decor',
        note: 'CORRIGÉ (constat B2, relecture hostile) : ces deux lignes étaient AUSSI citées comme preuve de la ligne « écart escaladé / résolu » ci-dessus — un même geste du semeur ne peut pas être à la fois décor et prouvé. recordScopeLimitation est une fonction PROPRE (matching.ts:508) ; revérifié : aucun bouton dans exceptions/page.tsx pour ce geste précis. La réserve « à revérifier » de la version d’origine est LEVÉE — le décor est confirmé, pas une hypothèse.' },
      { objet: 're-exécution en aveugle (startVerificationRun/submitBlindCheck)', semeur: 'part1.ts:357,370', cheminHumain: 'testing/page.tsx:95,103', clique: 'scenario.ts:1824-1909', etat: 'prouve' },
      { objet: 'évaluation contre l’anomalie tolérable', semeur: 'part1.ts:381,388,394', cheminHumain: 'testing/page.tsx:120,128,140', clique: 'scenario.ts:1824-1909', etat: 'prouve' },
      { objet: 'listing banques importé (circularisation)', semeur: 'part1.ts:422', cheminHumain: 'circularisations/page.tsx:62', clique: 'scenario.ts:2572-2648', etat: 'prouve' },
      { objet: 'contact clé déclaré (réunions)', semeur: 'part1.ts:446', cheminHumain: 'reunions/actions.ts:13', clique: 'scenario.ts:2426-2484', etat: 'prouve' },
      { objet: 'circularisation envoyée / réponse / écart expliqué', semeur: 'part1.ts:453,466,470', cheminHumain: 'circularisations/page.tsx:94,110,120', clique: 'scenario.ts:2572-2648', etat: 'prouve' },
    ],
  },
  {
    fichier: 'src/lib/flows/part2.ts',
    titre: 'SOX 404 / composante (dossier PCAOB) — le dossier engSox lui-même n’apparaît NULLE PART dans scenario.ts (pas seulement /rcm)',
    objets: [
      { objet: 'import TB (dossier SOX)', semeur: 'part2.ts:22', cheminHumain: 'imports/actions.ts:66 (même service que le NEP, dossier différent)', clique: null, etat: 'non_prouve',
        note: 'recherche « engSox » et « sox » dans scenario.ts et contexte.ts : ZÉRO occurrence (vérifié directement, pas déduit) — le dossier SOX entier est hors du parcours cliqué' },
      { objet: 'rebuildFslis (SOX)', semeur: 'part2.ts:23', cheminHumain: 'scoping/page.tsx:53', clique: null, etat: 'non_prouve' },
      { objet: 'matérialité proposée/validée (SOX)', semeur: 'part2.ts:24', cheminHumain: 'materiality/page.tsx:42,57', clique: null, etat: 'non_prouve' },
      { objet: 'RCM du cycle importé (importRcm)', semeur: 'part2.ts:25', cheminHumain: 'rcm/page.tsx:34,59 (bouton rcm.importRcmClientListing)', clique: null, etat: 'non_prouve' },
      { objet: 'statut du walkthrough DI (setDiStatus)', semeur: 'part2.ts:99', cheminHumain: 'rcm/page.tsx:42', clique: null, etat: 'non_prouve' },
      { objet: 'demande de listing formelle (insert request/request_item ad hoc)', semeur: 'part2.ts:37-40',
        cheminHumain: null, clique: null, etat: 'decor',
        note: 'le chemin cliquable (rcm/[cid]/page.tsx importInstancesAction) importe le CSV directement, sans créer de request formelle au préalable — un geste DIFFÉRENT de celui du semeur, pas un équivalent' },
      { objet: 'demande envoyée + pièce reçue (approveSend, ingestEvidence — listing)', semeur: 'part2.ts:43,47-54', cheminHumain: 'requests/[rid]/page.tsx:33 ; rcm/[cid]/page.tsx (dépôt)', clique: null, etat: 'non_prouve' },
      { objet: 'occurrences importées (importInstances)', semeur: 'part2.ts:55', cheminHumain: 'rcm/[cid]/page.tsx:59,150', clique: null, etat: 'non_prouve' },
      { objet: 'pièce d’exécution de contrôle déposée (uploadControlEvidence)', semeur: 'part2.ts:68 (appelée depuis 104, 121)', cheminHumain: 'rcm/[cid]/page.tsx (dépôt sur demande d’échantillon)', clique: null, etat: 'non_prouve' },
      { objet: 'échantillon d’attributs tiré ET demande de preuves envoyée (drawAttributeSample + approveSend, DEUX instructions du MÊME drawAction)', semeur: 'part2.ts:102-103,120', cheminHumain: 'rcm/[cid]/page.tsx:69-70,155 (un seul bouton, un seul geste)', clique: null, etat: 'non_prouve',
        note: 'CORRIGÉ (constat D5, relecture hostile) : la version d’origine comptait ces deux instructions comme deux OBJETS distincts alors que c’est un seul geste humain (un clic) qui les produit toutes les deux — fusionnées ici, le compte total en est réduit d’une ligne.' },
      { objet: 'extraction du contrôle exécuté (extractAll/verifyExtraction, SOX)', semeur: 'part2.ts:105-107,122-124', cheminHumain: 'testing/page.tsx:67 (même service, dossier SOX)', clique: null, etat: 'non_prouve' },
      { objet: 'test d’efficacité exécuté (runAttributeTesting)', semeur: 'part2.ts:109,126', cheminHumain: 'rcm/[cid]/page.tsx:80', clique: null, etat: 'non_prouve' },
      { objet: 'extension à la population complète (extendToFullPopulation)', semeur: 'part2.ts:115', cheminHumain: null, clique: null, etat: 'decor',
        note: 'aucun appelant nulle part hors part2.ts et sa propre définition (sox.ts:483)' },
      { objet: 'déficience proposée (proposeDeficiency)', semeur: 'part2.ts:139', cheminHumain: 'rcm/[cid]/page.tsx:101,215', clique: null, etat: 'non_prouve' },
      { objet: 'déficience décidée (decideDeficiency)', semeur: 'part2.ts:146', cheminHumain: 'rcm/[cid]/page.tsx:113', clique: null, etat: 'non_prouve' },
      { objet: 'papier OE rédigé (draftOeWorkpaper)', semeur: 'part2.ts:148', cheminHumain: 'rcm/[cid]/page.tsx:125,219', clique: null, etat: 'non_prouve' },
    ],
  },
  {
    fichier: 'src/lib/flows/enrichir.ts',
    titre: 'Le monde enrichi — ce qui donne au dossier l’air d’avoir été travaillé',
    objets: [
      { objet: 'équipe : déclaration, signature, affectation (Hugo)', semeur: 'enrichir.ts:152-155',
        cheminHumain: 'team/page.tsx:95 (openAction), :102 (answerAction), :115 (signAction), :122 (assignAction) — boutons :216,255,274,349',
        clique: null, etat: 'non_prouve', note: '/eng/[id]/team n’apparaît dans AUCUN aller() de scenario.ts' },
      { objet: '2e poste retenu — confirmScoping', semeur: 'enrichir.ts:182', cheminHumain: 'scoping/page.tsx:39', clique: 'scenario.ts:772-823', etat: 'prouve' },
      { objet: 'questionnaire résiduel répondu (answerQuestion, 2e poste)', semeur: 'enrichir.ts:200', cheminHumain: 'risk/page.tsx:99 (answerAction)', clique: 'scenario.ts:907', etat: 'prouve' },
      { objet: 'risque évalué (assessFsli, 2e poste)', semeur: 'enrichir.ts:208', cheminHumain: 'risk/page.tsx:85-91 (assessAction, bouton risk.reAssess)', clique: null, etat: 'non_prouve',
        note: 'CORRIGÉ (constat A3/A4, relecture hostile) : compté comme prouvé à tort dans la version d’origine, en confondant avec le clic de risk.arbitrate (scenario.ts:860,871) qui appelle overrideLevel — UN AUTRE SERVICE. « risk.reAssess » : zéro occurrence dans scenario.ts. part1.ts:88 le confirme dans son propre commentaire : « assessFsli n’était appelé que par le dossier N-1 ».' },
      { objet: 'procédure planifiée (2e poste)', semeur: 'enrichir.ts:211', cheminHumain: 'programme/page.tsx:43', clique: 'scenario.ts:964-970 (couvert avec « papiers du poste » ci-dessous, même geste)', etat: 'prouve' },
      { objet: 'papiers du poste — rédiger, IPE, viser', semeur: 'enrichir.ts:98 (enregistrerIpe, appelée par le helper local declarerIpe:226,237), 225,230,233', cheminHumain: 'programme/page.tsx:57 (redigerPapierDeProcedure) ; workpapers/[wid]/ipe-actions.ts:33,44 (enregistrerIpe) ; workpapers/[wid]/page.tsx:147 (signWorkpaper)',
        clique: 'scenario.ts:944 (début de la station « programme de travail »), 979-1035 (rédaction + IPE, avec l’arrêté du rapport, R41), 1901+ (visas)',
        etat: 'prouve', note: 'CORRIGÉ (constat B4, relecture hostile) : la citation d’origine pointait sur un COMMENTAIRE (940-943), pas sur du code cliqué — corrigée vers la vraie ligne de la station. ÉTAGE 1.1 du 2026-09-03 : c’est exactement l’écran que trois services attendaient (STATUS.md). Le geste de rédaction est confirmé en navigateur deux fois ce jour (2026-09-06) après le correctif R41 : la question de l’information produite par l’entité se répond désormais sans refus.' },
      { objet: 'sections assurées à l’ouverture (assurerSections)', semeur: 'enrichir.ts:264', cheminHumain: 'app/eng/[id]/page.tsx:142 (effet de bord de rendu, pas un geste qu’on choisit — voir la note)', clique: 'implicite à chaque aller(eng)', etat: 'prouve',
        note: 'RÉSERVE ÉCRITE (constat F2, relecture hostile) : ceci n’est pas un GESTE qu’une personne décide de faire ou non, c’est un effet de bord automatique de la visite du tableau de bord. Le badge « prouvé » est correct au sens strict du registre (le code tourne à chaque visite) mais ne dit pas « quelqu’un a choisi ce geste ».' },
      { objet: 'section envoyée à quelqu’un (envoyerA)', semeur: 'enrichir.ts:280', cheminHumain: 'app/eng/[id]/page.tsx:98-110 (envoyerAction)', clique: null, etat: 'non_prouve' },
      { objet: 'section attribuée à un porteur (attribuerA)', semeur: 'enrichir.ts:279', cheminHumain: null, clique: null, etat: 'decor',
        note: 'CONFIRMÉ EXACT par la relecture hostile : la fonction attribuerAction (sections-actions.ts:32) EXISTE mais app/eng/[id]/page.tsx:14 n’importe que envoyerAction et suivreAction — un geste du métier sans écran (règle 13), pas seulement un chemin non cliqué.' },
      { objet: 'note de revue ouverte (addReviewNote)', semeur: 'enrichir.ts:335', cheminHumain: 'notes/actions.ts:26 ; workpapers/[wid]/page.tsx:123', clique: 'scenario.ts:1901+ (poste des notes) et 1969+', etat: 'prouve' },
      { objet: 'note antidatée (update review_note set created_at)', semeur: 'enrichir.ts:349', cheminHumain: null, clique: null, etat: 'decor',
        note: 'PAR NATURE sans chemin humain — un antidatage ne se clique pas. Déjà assumé et dit (N2-3, ADR-126, docs/BACKLOG_REPORTE.md) : la démonstration publique compte sur cette fabrication ; ce n’est pas un manque à combler, c’est un décor DÉLIBÉRÉ et déjà écrit comme tel ailleurs.' },
      { objet: 'processus importé (importerProcessus)', semeur: 'enrichir.ts:366', cheminHumain: 'processus/page.tsx:49', clique: 'scenario.ts:638-703', etat: 'prouve' },
      { objet: 'changement de processus statué (statuerChangement)', semeur: 'enrichir.ts:374', cheminHumain: 'processus/page.tsx:64', clique: 'scenario.ts:670-677', etat: 'prouve',
        note: 'CORRIGÉ (constat B1, relecture hostile) : la citation d’origine (369) pointait sur importerProcessus, pas sur statuerChangement — corrigée.' },
      { objet: 'RCM du cycle (importRcm, revu depuis enrichir.ts)', semeur: 'enrichir.ts:388', cheminHumain: 'rcm/page.tsx:34', clique: null, etat: 'non_prouve',
        note: 'même route que la ligne part2.ts — engSox n’est visité par AUCUNE station' },
      { objet: 'grille calculée', semeur: 'enrichir.ts:401', cheminHumain: 'testing/page.tsx:78,87', clique: 'scenario.ts:1324-1472 « atelier de test : la grille, les ancres, les refus, la conclusion »', etat: 'prouve' },
      { objet: 'cellule disposée', semeur: 'enrichir.ts:420', cheminHumain: 'testing/actions-atelier.ts:66', clique: 'scenario.ts:1324-1472', etat: 'prouve' },
      { objet: 'ligne conclue', semeur: 'enrichir.ts:416,423', cheminHumain: 'testing/actions-atelier.ts:57', clique: 'scenario.ts:1324-1472', etat: 'prouve' },
      { objet: 'revue analytique du poste rédigée', semeur: 'enrichir.ts:434', cheminHumain: 'poste/[code]/actions.ts:41 ← poste/[code]/page.tsx:231', clique: 'scenario.ts:2352-2357 (vide, refuse ANA-01, rédige v1, propose, enregistre v2)', etat: 'prouve',
        note: 'CORRIGÉ (constat B6, relecture hostile) : la version d’origine publiait un DOUTE FAUX (« pas de certitude qu’elle clique elle-même le geste »). Vérifié ligne à ligne : 2352-2353 vide et refuse à blanc (ANA-01), 2356-2357 rédige et enregistre (v1), 2360 propose, 2366 enregistre (v2). Le clic est certain.' },
    ],
  },
  {
    fichier: 'src/lib/services/monde-demo.ts',
    titre: 'La remise à zéro — restaure TOUTES les tables depuis l’instantané, aucun objet métier propre',
    objets: [
      { objet: 'remettreLeMondeAZero (le geste, pas un objet)', semeur: 'monde-demo.ts:203-273',
        cheminHumain: 'app/demo/remise-a-zero/actions.ts ← app/demo/remise-a-zero/page.tsx (bouton de confirmation)',
        clique: null, etat: 'non_prouve', note: '/demo/remise-a-zero n’apparaît dans aucun aller() de scenario.ts' },
    ],
  },
];
