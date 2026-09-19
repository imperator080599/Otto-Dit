<!-- ENGENDRÉ par `cd app && npm run cloture` — ne pas éditer à la main. -->
# Inventaire de clôture — chaque épreuve des mandats du fondateur, mesurée

Recherche menée le 2026-09-19. Méthode : Quatre sous-agents indépendants, un par mandat, chacun cherchant une preuve cliquée (station de app/scripts/clics/scenario.ts confirmée par docs/CLICS.md, jamais un test vitest seul) pour chaque épreuve listée ci-dessous, avant de conclure OBSERVE/NON_OBSERVE/SANS_OBJET.

**32 épreuves recensées dans cinq mandats (08, 09, 10, 14, 18 septembre 2026) — 25 OBSERVÉE(S), 5 NON OBSERVÉE(S), 2 SANS OBJET (78 % observé).**

OBSERVÉ signifie observé en CONDUISANT le vrai parcours dans le monde semé — une station de `app/scripts/clics/scenario.ts`, confirmée par une exécution réelle dans `docs/CLICS.md`. Un test vitest, aussi rigoureux soit-il, ne suffit PAS seul : c'est la distinction qui a trouvé le blocage NOTIF-01 (seule voie qui l'a vu), et c'est pourquoi cet inventaire l'applique partout, sans exception de confort.

---
## Mandat du 2026-09-08 — `docs/MANDATS/2026-09-08_mandat_controle_interne.md`, §6

- **OBSERVÉ** (`CTRL-01`) — Une tâche documentée par la seule inquiry ne se conclut pas.
  Preuve : Station « contrôle interne : la ladder de refus CTRL-01/02/03, un geste à la fois » (scenario.ts), sur un contrôle vierge (C-REV-03, jamais cyclé par le semeur) : refus observé DEUX fois (sans aucune tâche, puis avec une tâche documentée par la seule inquiry), levé en documentant une procédure hors inquiry. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-02`) — Un contrôle dont un des quatre facteurs de design est vide ne se conclut pas.
  Preuve : Même station, même contrôle vierge : refus observé avant que les quatre facteurs ne soient documentés, levé après. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-03`) — Une IUC déclarée sans exactitude, ou sans exhaustivité, est refusée en nommant laquelle manque.
  Preuve : Même station : refus observé DEUX fois (aucune IUC déclarée, puis IUC utilisée sans preuve — le refus nomme les deux volets), levé en documentant les deux preuves. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-05`) — Un contrôle as_needed n'atteint pas le tirage d'OE sans une demande client de la population, créée par un clic.
  Preuve : Station « contrôle interne : CTRL-05, la demande de population as_needed créée par un clic » sur un contrôle adhoc vierge (C-REV-04) : le bouton de demande est cliqué, une VRAIE demande client_request naît, visible et cliquable dans l'espace de demandes. Corrige au passage le DÉCOR relevé par la recherche du 2026-09-19 (le semeur créait cette même demande par un INSERT SQL brut). SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-04`) — Une population d'occurrences non rapprochée ne se tire pas.
  Preuve : Station de la ladder CTRL-01/02/03 (C-REV-03) : après dérivation de la population, le message « non rapprochée » s'affiche et aucun formulaire de tirage n'est offert ; après rapprochement, le formulaire apparaît. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-07`) — Aucune taille d'échantillon ne s'affiche tant que la table du cabinet est vide.
  Preuve : RÉINTERPRÉTÉ (règle 19, écrit plutôt que tu) : la table n'est plus jamais littéralement vide depuis l'annexe du 10 septembre — le comportement observable équivalent (aucune taille ne s'affiche tant qu'un jugement de cabinet manque) est observé sur le contrôle quotidien vierge (C-TR-01, population > 200) : voir ctrl-07-table-pleine, même mécanisme de code (tailleEchantillonOe), même écran. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-06`) — L'inquiry de l'OE refuse de réutiliser l'enregistrement du D&I, et porte sa propre date, postérieure.
  Preuve : Station « contrôle interne : CTRL-07 (population > 200) et CTRL-06 (inquiry OE neuve) » : sur le contrôle déjà cyclé C-BR-01, révision de l'inquiry OE en y sélectionnant la pièce du walkthrough D&I lui-même — refusé, en nommant le contrôle. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** — Un test échoue si une seule carte du kanban des écarts ne se résout pas à l'identifiant d'un objet réel.
  Preuve : Station « kanban des écarts : chaque carte se résout à un écart réel » (app/scripts/clics/scenario.ts:3777-3811), présente dans docs/CLICS.md parmi les 63 gestes du dernier run réel. Le run échoue si idsCartes.length===0 ou si un id de carte n'a pas d'ancre #x-<id> correspondante sur /exceptions. SHA `1f1a9a5f2ee80764ff0d626fcaa4169307cb724c`.

- **OBSERVÉ** — Chaque objet nouveau de ce mandat (contrôle, walkthrough, tâche, IUC, occurrence) porte son chemin humain cliqué (SEMEUR_VS_CHEMIN).
  Preuve : app/src/lib/semeur/registre.ts : six entrées basculées à etat:'prouve' avec citation clique:'scenario.ts:4107-4221' (setDiStatus, attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, documenterFacteurDesign, declarerIuc) — les gestes exercés par les trois nouvelles stations CTRL-01..07/VID-01, dont le clic réel a été mesuré au SHA ci-dessous. docs/SEMEUR_VS_CHEMIN.md régénéré par `npm run semeur -- --figer` sur cet arbre : 89 objet(s)/geste(s), 16 DÉCOR, 25 non prouvé(s), 48 prouvé(s) (contre 42 avant cette tranche) — le script a mesuré le passage, jamais affirmé de mémoire. SHA `2d4ae73092a6e10905ff742cbc3f9f8a7542de6e`.

---

## Mandat du 2026-09-09 — `docs/MANDATS/2026-09-09_mandat_reponses_fondateur.md`, §2.5 et §3

- **OBSERVÉ** (`MAT-01`) — Un import qui fait basculer un compte de non matériel à matériel fait apparaître le drapeau, nommant le compte et la date de bascule.
  Preuve : Station « bascule de matérialité : un poste devenu matériel mène au poste réel » (app/scripts/clics/scenario.ts:863-876), docs/CLICS.md (1 clic mesuré). La ligne cliquée affiche b.fsliName/b.fsliCode (le compte) et b.detecteeLe (la date). SHA `dabe2af8`.

- **OBSERVÉ** (`MAT-01`) — Le même import ouvre automatiquement la section de documentation du FSLI devenu matériel, avec sa leadsheet.
  Preuve : La même station atterrit réellement sur /eng/[id]/poste/[code] (URL vérifiée par le clic). RÉSERVE, nommée plutôt que tue : la leadsheet est structurellement présente sur cette page (data-leadsheet, poste/[code]/page.tsx) mais sa présence précise sur CET atterrissage n'est pas elle-même ré-affirmée par une assertion du clic — seulement par la structure du code servant cette route. SHA `dabe2af8`.

- **OBSERVÉ** (`MAT-02`) — L'import crée la demande de détail pour les comptes au-dessus du CTT, visible et cliquable dans l'espace de demandes.
  Preuve : Station « bascule de matérialité : la demande de détail au-dessus du CTT est visible et cliquable » (app/scripts/clics/scenario.ts:882-894), docs/CLICS.md (1 clic mesuré) — atteint /eng/[id]/requests, clique le lien contenant « CTT », atterrit sur la page de la demande. SHA `dabe2af8`.

- **OBSERVÉ** (`MAT-03`) — Un ré-import sur un poste déjà testé ne détruit rien : le tirage, les papiers et les visas sont toujours là après.
  Preuve : Fermé (2026-09-19). Deux stations existantes portent désormais l'invariant, sans code produit touché — lecture de ce que l'écran affiche déjà. « import du grand livre définitif » lit /eng/[id]/workpapers AVANT le ré-import (REV-01, déjà signé au semis npm run demo:seed, et son compte de visas), puis RE-lit après : le compte de papiers ne baisse jamais, REV-01 reste 'signed', son compte de visas ne baisse jamais (assertions bloquantes). « sondage » (le re-tirage qu'exige le ré-import) lit « Selected items (N) » après le tirage : de vraies lignes, pas un tirage vide. La moitié complémentaire — les lignes SORTIES de l'ancien tirage se statuent au lieu de s'effacer — reste couverte par la station déjà existante « re-tirage : ce qui sort du tirage ne disparaît pas », inchangée. Revue hostile (une voix, rule 30 : aucun modèle de données/sécurité/multi-tenant/code de refus touché) : SHIP AS-IS, précondition REV-01/signoff_count=3 vérifiée indépendamment contre demo-seed.ts. npm run clics : 326 étapes, 0 échec de station (4 occurrences #418 connues). Verify complet par ailleurs vert (vitest 1246/1246, visuel 356/0). Le niveau DB (compte exact de sample_item/workpaper/signoff) reste la preuve de retirage.test.ts — non dupliqué ici, disclosed. SHA `466b45982668e1f41289496a56f831eab2e36df0`.

- **OBSERVÉ** (`VID-01`) — Le dépôt manuel d'une vidéo de walkthrough fonctionne par un clic réel, la vidéo rangée comme une pièce du dossier avec sa provenance.
  Preuve : Station de la ladder CTRL-01/02/03 (C-REV-03) : dépôt réel d'un fichier (dataset/sox/walkthrough-video-placeholder.txt, synthétique) via le formulaire [data-attacher-walkthrough], accepté et affiché avec provenance ([data-walkthrough-attache]). Ré-attachement après suppression confirmé aussi (étape 8). SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`VID-01`) — La suppression manuelle d'une vidéo fonctionne par un clic réel, toujours tracée (qui, quand, pourquoi).
  Preuve : Même station, étape 8 : suppression réelle via [data-supprimer-walkthrough] (motif requis), la mention de suppression tracée (qui, quand, motif) s'affiche à l'écran ([data-walkthrough-supprime]). SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **NON OBSERVÉ** (`VID-01`) — Le compte à rebours de conservation ne démarre que lorsque rapport signé ET notes de revue closes sont réunis.
  Manque : Confirmé structurellement dur (R113, docs/BACKLOG_REPORTE.md, 2026-09-19, recherche après la fermeture de MAT-03) : compteurConservationVideo (sox.ts) exige report_date non nul sur l'engagement affiché — posé UNIQUEMENT par closeFile(), cliqué UNE fois dans tout scenario.ts, sur le dossier NEP (c.eng), jamais sur le dossier SOX (c.controleWalkthrough.engId) où ce compteur s'affiche (/eng/[id]/rcm/[cid]). Fermer cette ligne exigerait un second chantier de clôture complet sur le dossier SOX (obstacles au visa jamais exercés là), pas une lecture d'écran comme MAT-03/NOTIF-01 — reportée, pas forcée.

---

## Mandat du 2026-09-10 — `docs/MANDATS/2026-09-10_annexe_echantillonnage.md`, annexe entière

- **OBSERVÉ** — La table de tailles d'échantillon est remplie depuis une source publique citée (HUD Handbook 2000.04 REV-2 CHG-10, Appendix A), jamais de mémoire, avec la phrase verbatim sur les minima suggérés affichée à l'écran.
  Preuve : La phrase verbatim (« these are suggested minimum sample sizes... ») a été ajoutée cette tranche (TableEchantillonnageAttribut.minimaCaveat, pcaob-sox.ts, sox.ts, rcm/[cid]/page.tsx) et observée à l'écran par la station de la ladder CTRL-01/02/03 (C-REV-03, population ≤ 200, bande minima) — assertion dédiée dans scenario.ts, résultat imprimé dans le journal de clics. SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** (`CTRL-07`) — CTRL-07 refuse toujours sans les jugements de cabinet (niveau de confiance, taux tolérable, importance de l'attribut), même la table désormais remplie.
  Preuve : Station « contrôle interne : CTRL-07 (population > 200) et CTRL-06 (inquiry OE neuve) » sur le contrôle quotidien vierge (C-TR-01, population dérivée ≈ 365 > 200, table pleine) : après rapprochement, le message CTRL-07 s'affiche, nommant les trois jugements de cabinet non posés (niveau de confiance, taux tolérable, importance). SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

---

## Mandat du 2026-09-14 — `docs/MANDATS/2026-09-14_mandat_extrapolation_automatisation_notifications.md`, §1.6, §2.4, §3.4

- **NON OBSERVÉ** (`EXTRAP-01`) — Un poste sondé avec un écart ne se conclut pas sans projection à la population.
  Manque : R80 (npm run clics non fiable) est levé. Recherche dédiée (2026-09-19, R111 dans BACKLOG_REPORTE.md), réfutation confirmée EMPIRIQUEMENT par requête SQL directe sur la base re-semée : la strate 'random' du tirage REV-SUBST ne porte que 4 sample_item, et AUCUNE des 24 exception du monde semé n'y est liée — la strate sondée est propre PAR CONSTRUCTION du monde semé, pas par accident. Fermer cette ligne exigerait de fabriquer délibérément un écart sur l'une des 4 lignes random, un geste qui (contrairement au plafond posé pour AUTO-01, sans AUCUN autre effet) changerait réellement les totaux connu/projeté, le TE, et les comptes d'obstacles au visa que plusieurs stations en aval dépendent déjà — même ordre de risque que MAT-03. Reportée, pas forcée.

- **NON OBSERVÉ** (`EXTRAP-02`) — Une projection tentée sur la strate exhaustive est refusée, en nommant la strate.
  Manque : Relu à neuf le 2026-09-19 (réexamen post-geste-2) : inchangé. Le mécanisme réel (kernel/projection.ts:1-16, projectMisstatement) est une EXCLUSION STRUCTURELLE — la fonction ne reçoit même pas les montants de la strate exhaustive, donc aucun chemin ne peut les projeter par erreur, et il n'existe donc AUCUNE tentative à observer ni AUCUN message de refus nommant la strate nulle part dans le dépôt : un écart avec la lettre du mandat (« une projection tentée... est refusée »), pas seulement un manque de clic. Construire un tel message exigerait d'INVENTER un chemin d'écriture qui n'existe pas, pour re-créer artificiellement un refus qu'une garde structurelle rend déjà impossible — l'inverse de ce que règle 9 demande. Testé seulement comme invariant (kernel.test.ts).

- **OBSERVÉ** (`EXTRAP-03`) — Une anomalie déclarée sans preuve supplémentaire obtenue exprès est refusée, en citant §13 (extremely rare, high degree of certainty).
  Preuve : Station « EXTRAP-03 : écarter un écart comme anomalie, refus puis geste réel » (scenario.ts, après « résolution des écarts ») : refus RÉEL observé (bypass du required HTML, le SERVICE refuse sans pièce — message lu à l'écran citant §13, assertion bloquante passée), puis un vrai écartement avec une pièce essayée jusqu'à acceptation comme DISTINCTE de celle de l'écart d'origine (assertion bloquante passée aussi — 0 échec sur les deux). npm run clics, monde re-semé : 309 étape(s), 0 échec d'assertion. SHA `013bd6d2a0c3b4d6ed3b375f23fe5673e7f70584`.

- **NON OBSERVÉ** (`EXTRAP-04`) — Aucune projection ne s'affiche tant que la méthode du cabinet n'est pas posée.
  Manque : scenario.ts lit désormais le bloc (station « re-exécution et évaluation », SHA 227003e) et NOMME laquelle des deux branches il voit — mais mesuré en direct (npm run clics, monde re-semé) : le monde semé actuel ne fait PAS tenir la branche « méthode non vérifiée » à cette station (evaluation.projection_method reste renseigné). La lecture existe, honnête, jamais forcée à un vrai qu'elle n'a pas vu (règle 17/18) ; il manque encore un geste du monde semé qui produise réellement une strate sondée avec écart et méthode non vérifiée à cet instant précis du parcours.

- **OBSERVÉ** — Un test de contrôles n'affiche jamais de projection, et le dit en une phrase.
  Preuve : Station « contrôle interne : CTRL-07 (population > 200) et CTRL-06 (inquiry OE neuve) », sur le contrôle déjà testé C-BR-01 : la phrase « Tests of controls never show a projection (ISA 530 §A20)... » est lue à l'écran (assertion dédiée, regex sur le texte de la page). SHA `e1c1a0f76d97c01aa17ef924739aa2814ff96933`.

- **OBSERVÉ** — Écart connu, écart projeté et écart total estimé sont trois nombres distincts à l'écran, chacun avec sa provenance.
  Preuve : Station « re-exécution et évaluation » (scenario.ts, /testing après le recompute) : assertion dédiée (bloquante, pas informative) vérifiant que les trois libellés KPI — connu (test.knownMisstatement), projeté (test.projectedMisstatementMethod), total (test.totalEstimatedMisstatement) — sont TOUS présents à l'écran, chacun sous son propre libellé de provenance. Passée réellement (npm run clics, monde re-semé, 307 étape(s), 0 échec d'assertion) — pas déclarée : un seul libellé manquant aurait fait échouer tout le parcours. SHA `227003ed021e929977ea34417e34c5f76d272f4c`.

- **OBSERVÉ** (`AUTO-01`) — Porter le niveau d'automatisation au-dessus du plafond du cabinet, ou au-dessus de L2, est refusé, en nommant le plafond et qui l'a posé.
  Preuve : Réexamen du 2026-09-19 (geste 2 observé) : le blocage réel n'était PAS l'UI manquante seule, mais qu'aucun pack réel ne posait de plafond sous L2 (le maximum du type) — le refus était structurellement invisible à tout clic. Corrigé en deux gestes : (1) pcaob-sox.ts pose désormais automationLevel:'L1' (contenu de pack, règle 9 — vérifié qu'aucun écran ne distingue L1 de L2 ailleurs, donc rien d'autre ne change) ; (2) un panneau réel sur /eng/[id]/team (definirNiveauMission, déjà existant service-side) appelle le seul chemin d'écriture. Station clics « AUTO-01 : le niveau d'automatisation de la mission ne dépasse jamais le plafond du pack » : tente L2 sur le dossier SOX (refusé, message exact « le niveau L2 dépasse le plafond en vigueur (L1, posé par le pack pcaob-sox) », assertion bloquante passée), puis règle L1 (accepté, affiché en vigueur, assertion bloquante passée). npm run clics : 312 étapes, 0 échec d'assertion. Revue hostile DEUX voix indépendantes (règle 30 : tranche = code de refus) — aucun défaut réel, verdict SHIP AS-IS des deux côtés. SHA `3281067084cc12343d732e7fac4e1749021b22fa`.

- **NON OBSERVÉ** (`AUTO-02`) — Un élément préparé par l'IA sans son niveau d'automatisation horodaté est refusé.
  Manque : Le chemin POSITIF (l'horodatage réel pendant une vraie analyse IA) EST cliqué (station walkthrough, un vrai ai_run écrit), mais le REFUS lui-même n'est testé que par un cas connu mauvais vitest. Constat additionnel, disclosed plutôt que tu : le centre de notifications affiche un niveau CONSTANT « L2 » codé en dur (notifications.ts), jamais branché sur le vrai niveau horodaté de chaque ai_run — écrit dans le code du fichier lui-même, jamais repris au registre.

- **SANS OBJET** — Les deux gardes (niveau d'automatisation, budget) sont indépendantes : niveau ouvert + budget fermé ⇒ refus ; niveau fermé + budget ouvert ⇒ refus.
  Décision : Réexaminé le 2026-09-19 après le geste 2 (mandat docs/MANDATS/2026-09-19_geste2_observe_et_reexamen.md) : PAS débloqué par le geste, pour une raison plus profonde que l'UI manquante. Vérifié par lecture directe (règle 15) : les trois gardes de cette épreuve (assertNiveauOuvert, assertBudgetActifEnBase, gardeBudget) ne s'exécutent QUE si `adapter.name !== 'mock'` — vérifié aux QUATRE sites d'appel réels (entretiens.ts:173, extraction/ladder.ts:126, query/ask.ts:149, walkthrough-analyse.ts:100). Sur l'hébergé, demoPublique() force le mock aux quatre fabriques (ADR-109 pt 4) : adapter.name est TOUJOURS 'mock', donc ces trois gardes ne s'exécutent JAMAIS, quel que soit le réglage d'automatisation ou l'état du budget. Décision du fondateur (ADR-109 pt 6) : demoPublique() reste non levé — même motif structurel, même disposition que ia-budget-01-appel-reel ci-dessous. Observable localement (VERCEL non posé), hors de cet inventaire.

- **OBSERVÉ** — Un test échoue si une seule carte de notification ne se résout pas à l'identifiant d'un objet réel.
  Preuve : R87 fermé (2026-09-19) : sur le monde NEP semé, aucune des quatre familles d'elementsIaNonValides() n'est jamais naturellement en attente à un point cliquable (materiality validée au semis, deficiency/walkthroughGap SOX-only, extraction pending_verify jamais produite — échelons déterministes, mesuré par la station « testing : l'atelier » elle-même). La station clics « NOTIF-01 : chaque carte mène à l'objet réel… » crée donc sa propre carte (« Proposer (L3) », geste réel déjà exposé), lit son data-notification, suit son lien jusqu'à /materiality, et vérifie que LE MÊME identifiant s'y retrouve dans le formulaire de validation (assertion bloquante). En chemin : un défaut réel trouvé et corrigé — la page n'offrait aucun chemin de validation pour une proposition plus récente qu'une validation déjà en place (currentMateriality() préfère toujours la ligne validée) ; corrigé par un second formulaire keyé sur la version maximale. Revue hostile deux voix indépendantes, SHIP AS-IS. npm run clics : 322 étapes, 0 échec de station (4 occurrences #418 connues, disjointes). npm run verify complet par ailleurs vert (vitest 1246/1246, visuel 356/0). SHA `eafe6d27657a660f8fffa4e4dcdcb7b14e161355`.

- **OBSERVÉ** — Le compte affiché à une personne change selon son rôle, prouvé par deux personnes distinctes sur le même dossier.
  Preuve : R87 fermé (2026-09-19), même tranche que notif-carte-id. Station clics « NOTIF-01 : « ce que je dois approuver » change selon le rôle… » : une carte de matérialité est posée (geste réel), puis /travaux est lu comme Karim (préparateur, senior, can_sign=false sur ce dossier depuis seed.ts : `can_sign = role !== 'senior'`) — badge à 0, assertion bloquante — puis comme Léa (reviewer, manager, can_sign=true, MÊME dossier) — badge strictement supérieur, assertion bloquante. Revue hostile (voix 2) a tracé indépendamment que Karim n'a can_sign=true sur AUCUN engagement (senior partout dans seed.ts) et que les autres familles (deficiency proposé-puis-décidé au semis, walkthroughGap créé plus tard dans le parcours) ne polluent pas la comparaison à ce point précis — la différence est bien attribuable à la carte que la station vient de poser, pas à du bruit résiduel. Deux voix indépendantes, SHIP AS-IS. SHA `eafe6d27657a660f8fffa4e4dcdcb7b14e161355`.

- **OBSERVÉ** (`NOTIF-01`) — Le visa est refusé tant qu'un élément préparé par l'IA reste non validé, observé contre le monde tel qu'il est semé aujourd'hui — pas un monde construit pour le faire tenir.
  Preuve : Le blocage réel a été DÉCOUVERT par un vrai run de npm run clics (dix obstacles iaNonValide bloquaient la clôture du dossier NEP semé, la première fois que le parcours a été conduit jusqu'au bout après l'ouverture du §3), corrigé (commit 3f9cf1a), puis re-vérifié par deux passes clics complètes atteignant clôture/archive avec zéro échec de station nommée. SHA `b951986`.

- **OBSERVÉ** — Un élément validé disparaît de la file de notifications dans le même geste qui le valide, sans tâche de nettoyage séparée.
  Preuve : R87 fermé (2026-09-19), même tranche que notif-carte-id. La station clics valide la proposition atteinte par la carte (bouton « Valider », depuis /eng/[id]/materiality), revient sur /notifications dans le MÊME geste, et vérifie que la carte a disparu de la file (assertion bloquante, aucune tâche de nettoyage séparée). Revue hostile deux voix : la supersession (validate(), materiality.ts) laisse bien 0 ligne 'proposed' après chaque station, confirmé en traçant les deux cycles propose+validate des deux stations de la tranche — rien n'est laissé en attente avant la station suivante (« obstacles au visa », qui exige restants=0). Une voix a trouvé et consigné (R112, docs/BACKLOG_REPORTE.md) un défaut MINEUR non déclenché par ces stations : propose() n'a pas de garde contre un second appel avant validation, ce qui pourrait laisser une proposition plus ancienne sans chemin de résolution — hors périmètre de cette fermeture, reporté. Deux voix indépendantes, SHIP AS-IS. SHA `eafe6d27657a660f8fffa4e4dcdcb7b14e161355`.

---

## Mandat du 2026-09-18 — `docs/MANDATS/2026-09-18_changement_de_regime.md`, §0

- **SANS OBJET** (`IA-BUDGET-01`) — IA-BUDGET-01 est VU refuser un vrai appel IA au moins une fois, sur le premier plafond de 2 $.
  Décision : Décision du fondateur (docs/MANDATS/2026-09-19_geste2_observe_et_reexamen.md) : sur l'hébergé, architecturalement impossible — demoPublique() (ADR-109 pt 4) coupe TOUT appel réel aux quatre fabriques d'adaptateur AVANT même que la garde IA-BUDGET-01 ne soit consultée (elle-même gardée derrière `adapter.name !== 'mock'` — vérifié aux quatre sites d'appel). L'équivalent appartient à un run LOCAL (VERCEL non posé), hors de cet inventaire. Ce que le mandat du 14 septembre §2.4 demande de CETTE garde précise EST satisfait : elle a été observée dans ses deux états réels sur la base de production (« fermée » avant le geste 2, « ACTIVE » après, /api/sante, 2026-09-19T10:39Z) — le refus d'un appel réel n'ajoute rien de plus que ces deux états ne disent déjà.
