<!-- ENGENDRÉ par `cd app && npm run cloture` — ne pas éditer à la main. -->
# Inventaire de clôture — chaque épreuve des mandats du fondateur, mesurée

Recherche menée le 2026-09-19. Méthode : Quatre sous-agents indépendants, un par mandat, chacun cherchant une preuve cliquée (station de app/scripts/clics/scenario.ts confirmée par docs/CLICS.md, jamais un test vitest seul) pour chaque épreuve listée ci-dessous, avant de conclure OBSERVE/NON_OBSERVE/SANS_OBJET.

**31 épreuves recensées dans les quatre mandats (08, 09, 10, 14 septembre 2026) — 5 OBSERVÉE(S), 26 NON OBSERVÉE(S), 0 SANS OBJET (16 % observé).**

OBSERVÉ signifie observé en CONDUISANT le vrai parcours dans le monde semé — une station de `app/scripts/clics/scenario.ts`, confirmée par une exécution réelle dans `docs/CLICS.md`. Un test vitest, aussi rigoureux soit-il, ne suffit PAS seul : c'est la distinction qui a trouvé le blocage NOTIF-01 (seule voie qui l'a vu), et c'est pourquoi cet inventaire l'applique partout, sans exception de confort.

---
## Mandat du 2026-09-08 — `docs/MANDATS/2026-09-08_mandat_controle_interne.md`, §6

- **NON OBSERVÉ** (`CTRL-01`) — Une tâche documentée par la seule inquiry ne se conclut pas.
  Manque : Garde implémentée et vitest-testée (sox.ts:435-440,692-701) mais aucune station de scenario.ts ne visite /rcm/[cid] pour le flux de documentation D&I — STATUS.md le dit lui-même explicitement.

- **NON OBSERVÉ** (`CTRL-02`) — Un contrôle dont un des quatre facteurs de design est vide ne se conclut pas.
  Manque : Garde implémentée (sox.ts:709-716) ; docs/SEMEUR_VS_CHEMIN.md marque « facteur de design documenté » non prouvé — chemin humain existant, jamais cliqué.

- **NON OBSERVÉ** (`CTRL-03`) — Une IUC déclarée sans exactitude, ou sans exhaustivité, est refusée en nommant laquelle manque.
  Manque : Garde implémentée (sox.ts:717-723) ; la seule vérification cliquée connue est un script Playwright jetable, supprimé après usage — pas une station durable de scenario.ts.

- **NON OBSERVÉ** (`CTRL-05`) — Un contrôle as_needed n'atteint pas le tirage d'OE sans une demande client de la population, créée par un clic.
  Manque : Le bouton réel existe (demanderPopulationAction, rcm/[cid]/page.tsx) mais scenario.ts ne le clique jamais. Pire : le monde semé crée cette demande par un INSERT SQL brut plutôt que par le geste réel — docs/SEMEUR_VS_CHEMIN.md marque cet objet précis DÉCOR.

- **NON OBSERVÉ** (`CTRL-04`) — Une population d'occurrences non rapprochée ne se tire pas.
  Manque : Garde implémentée (sox.ts:1064-1071), aucune station cliquée ne la traverse.

- **NON OBSERVÉ** (`CTRL-07`) — Aucune taille d'échantillon ne s'affiche tant que la table du cabinet est vide.
  Manque : Garde implémentée (sox.ts:1083-1091, table livrée vide comme le mandat l'exige), aucune station cliquée ne la traverse.

- **NON OBSERVÉ** (`CTRL-06`) — L'inquiry de l'OE refuse de réutiliser l'enregistrement du D&I, et porte sa propre date, postérieure.
  Manque : Garde implémentée et confirmée par mutation-testing vitest (sox.ts:1255-1282), jamais par une station cliquée.

- **OBSERVÉ** — Un test échoue si une seule carte du kanban des écarts ne se résout pas à l'identifiant d'un objet réel.
  Preuve : Station « kanban des écarts : chaque carte se résout à un écart réel » (app/scripts/clics/scenario.ts:3777-3811), présente dans docs/CLICS.md parmi les 63 gestes du dernier run réel. Le run échoue si idsCartes.length===0 ou si un id de carte n'a pas d'ancre #x-<id> correspondante sur /exceptions. SHA `1f1a9a5f2ee80764ff0d626fcaa4169307cb724c`.

- **NON OBSERVÉ** — Chaque objet nouveau de ce mandat (contrôle, walkthrough, tâche, IUC, occurrence) porte son chemin humain cliqué (SEMEUR_VS_CHEMIN).
  Manque : docs/SEMEUR_VS_CHEMIN.md (engendré, dernière régénération 2026-09-17) marque la quasi-totalité des objets de ce mandat « non prouvé » (chemin humain existant, jamais cliqué), et un — la demande de population as_needed — « DÉCOR » (aucun chemin humain réel, même le semeur la contourne). Aucun objet de ce mandat n'est dans le seau « prouvé ».

---

## Mandat du 2026-09-09 — `docs/MANDATS/2026-09-09_mandat_reponses_fondateur.md`, §2.5 et §3

- **OBSERVÉ** (`MAT-01`) — Un import qui fait basculer un compte de non matériel à matériel fait apparaître le drapeau, nommant le compte et la date de bascule.
  Preuve : Station « bascule de matérialité : un poste devenu matériel mène au poste réel » (app/scripts/clics/scenario.ts:863-876), docs/CLICS.md (1 clic mesuré). La ligne cliquée affiche b.fsliName/b.fsliCode (le compte) et b.detecteeLe (la date). SHA `dabe2af8`.

- **OBSERVÉ** (`MAT-01`) — Le même import ouvre automatiquement la section de documentation du FSLI devenu matériel, avec sa leadsheet.
  Preuve : La même station atterrit réellement sur /eng/[id]/poste/[code] (URL vérifiée par le clic). RÉSERVE, nommée plutôt que tue : la leadsheet est structurellement présente sur cette page (data-leadsheet, poste/[code]/page.tsx) mais sa présence précise sur CET atterrissage n'est pas elle-même ré-affirmée par une assertion du clic — seulement par la structure du code servant cette route. SHA `dabe2af8`.

- **OBSERVÉ** (`MAT-02`) — L'import crée la demande de détail pour les comptes au-dessus du CTT, visible et cliquable dans l'espace de demandes.
  Preuve : Station « bascule de matérialité : la demande de détail au-dessus du CTT est visible et cliquable » (app/scripts/clics/scenario.ts:882-894), docs/CLICS.md (1 clic mesuré) — atteint /eng/[id]/requests, clique le lien contenant « CTT », atterrit sur la page de la demande. SHA `dabe2af8`.

- **NON OBSERVÉ** (`MAT-03`) — Un ré-import sur un poste déjà testé ne détruit rien : le tirage, les papiers et les visas sont toujours là après.
  Manque : Le ré-import lui-même EST cliqué (station « import du grand livre définitif », scenario.ts:594-622) mais l'invariant MAT-03 proprement dit (tirage/papiers/visas encore présents après) n'est asserté par aucune station — STATUS.md attribue cette preuve à retirage.test.ts, un test vitest, pas un clic.

- **NON OBSERVÉ** (`VID-01`) — Le dépôt manuel d'une vidéo de walkthrough fonctionne par un clic réel, la vidéo rangée comme une pièce du dossier avec sa provenance.
  Manque : Aucune station de scenario.ts ne dépose de vidéo de walkthrough. La station « walkthrough » existante dépose un TRANSCRIPT texte pour l'analyse d'écarts (§4 point 3/R74) — une fonctionnalité distincte de la vidéo d'inquiry du §3.

- **NON OBSERVÉ** (`VID-01`) — La suppression manuelle d'une vidéo fonctionne par un clic réel, toujours tracée (qui, quand, pourquoi).
  Manque : STATUS.md décrit une passe de vérification manuelle au navigateur (script jetable, supprimé), jamais intégrée à scenario.ts ni présente dans docs/CLICS.md.

- **NON OBSERVÉ** (`VID-01`) — Le compte à rebours de conservation ne démarre que lorsque rapport signé ET notes de revue closes sont réunis.
  Manque : L'arithmétique (calculerConservationVideo) n'est unit-testée qu'après un constat hostile ; aucune station ne signe un rapport, ne clôt les notes de revue, puis n'observe le compteur réagir.

---

## Mandat du 2026-09-10 — `docs/MANDATS/2026-09-10_annexe_echantillonnage.md`, annexe entière

- **NON OBSERVÉ** — La table de tailles d'échantillon est remplie depuis une source publique citée (HUD Handbook 2000.04 REV-2 CHG-10, Appendix A), jamais de mémoire, avec la phrase verbatim sur les minima suggérés affichée à l'écran.
  Manque : La table EST réellement sourcée avec la citation exacte (app/src/lib/packs/pcaob-sox.ts:43-67, valeurs numériques conformes à l'annexe) et affichée avec son texte de source (rcm/[cid]/page.tsx:699-711). Mais la phrase verbatim « these are suggested minimum sample sizes... » n'apparaît nulle part dans app/src (grep vide sur tout l'arbre), et aucune station cliquée n'atteint le formulaire de tirage OE pour la confirmer visuellement.

- **NON OBSERVÉ** (`CTRL-07`) — CTRL-07 refuse toujours sans les jugements de cabinet (niveau de confiance, taux tolérable, importance de l'attribut), même la table désormais remplie.
  Manque : Le refus est réel et vitest-testé (sox.ts:965-999,1031-1092) mais aucune station cliquée ne soumet un tirage sans ces jugements pour confirmer, devant un utilisateur, que le refus tient malgré la table pleine.

---

## Mandat du 2026-09-14 — `docs/MANDATS/2026-09-14_mandat_extrapolation_automatisation_notifications.md`, §1.6, §2.4, §3.4

- **NON OBSERVÉ** (`EXTRAP-01`) — Un poste sondé avec un écart ne se conclut pas sans projection à la population.
  Manque : Prouvé seulement par s5s6.test.ts (intégration PGlite) et une lecture /api/sante (SHA 021e867) ; STATUS.md note explicitement que npm run clics n'a pas pu être conduit à son terme pour cette tranche (R80).

- **NON OBSERVÉ** (`EXTRAP-02`) — Une projection tentée sur la strate exhaustive est refusée, en nommant la strate.
  Manque : Le mécanisme réel (kernel/projection.ts) est une EXCLUSION STRUCTURELLE, pas un message de refus nommant la strate — un écart avec la lettre du mandat. Testé seulement comme invariant (kernel.test.ts), jamais cliqué.

- **NON OBSERVÉ** (`EXTRAP-03`) — Une anomalie déclarée sans preuve supplémentaire obtenue exprès est refusée, en citant §13 (extremely rare, high degree of certainty).
  Manque : Le chemin humain existe (formulaire, exceptions/page.tsx) mais STATUS.md dit explicitement que npm run clics n'a pas été étendu à EXTRAP-03 (R81) — sa preuve cliquée manque encore.

- **NON OBSERVÉ** (`EXTRAP-04`) — Aucune projection ne s'affiche tant que la méthode du cabinet n'est pas posée.
  Manque : scenario.ts visite /testing (station « re-exécution et évaluation ») mais ne lit jamais le bloc qui affirmerait la suppression de la projection.

- **NON OBSERVÉ** — Un test de contrôles n'affiche jamais de projection, et le dit en une phrase.
  Manque : La station walkthrough existante visite la même page (rcm/[cid]) mais n'exerce jamais cette phrase précise (rcmc.noProjectionTestsOfControls).

- **NON OBSERVÉ** — Écart connu, écart projeté et écart total estimé sont trois nombres distincts à l'écran, chacun avec sa provenance.
  Manque : Aucune station ne lit les clés du bloc KPI concerné dans testing/page.tsx.

- **NON OBSERVÉ** (`AUTO-01`) — Porter le niveau d'automatisation au-dessus du plafond du cabinet, ou au-dessus de L2, est refusé, en nommant le plafond et qui l'a posé.
  Manque : Plus précisément impossible à observer aujourd'hui, pas seulement non cliqué : definirNiveauMission (le seul chemin d'écriture) n'a AUCUN point d'appel dans app/src/app — aucun écran ne permet même de TENTER ce geste depuis un navigateur.

- **NON OBSERVÉ** (`AUTO-02`) — Un élément préparé par l'IA sans son niveau d'automatisation horodaté est refusé.
  Manque : Le chemin POSITIF (l'horodatage réel pendant une vraie analyse IA) EST cliqué (station walkthrough, un vrai ai_run écrit), mais le REFUS lui-même n'est testé que par un cas connu mauvais vitest. Constat additionnel, disclosed plutôt que tu : le centre de notifications affiche un niveau CONSTANT « L2 » codé en dur (notifications.ts), jamais branché sur le vrai niveau horodaté de chaque ai_run — écrit dans le code du fichier lui-même, jamais repris au registre.

- **NON OBSERVÉ** — Les deux gardes (niveau d'automatisation, budget) sont indépendantes : niveau ouvert + budget fermé ⇒ refus ; niveau fermé + budget ouvert ⇒ refus.
  Manque : Le test exact existe (automatisation.test.ts:148-157, vitest) mais aucun équivalent cliqué n'existe. Nature du test : il exige de mal configurer deux gardes indépendantes à la fois, ce qui rend un équivalent cliqué structurellement plus difficile qu'ailleurs — disclosed ici plutôt que forcé en OBSERVÉ.

- **NON OBSERVÉ** — Un test échoue si une seule carte de notification ne se résout pas à l'identifiant d'un objet réel.
  Manque : Prouvé par notifications.test.ts seulement ; aucune station ne visite /notifications — le dépôt lui-même le disclosed (R87).

- **NON OBSERVÉ** — Le compte affiché à une personne change selon son rôle, prouvé par deux personnes distinctes sur le même dossier.
  Manque : Même lacune R87, prouvé seulement par notifications.test.ts.

- **OBSERVÉ** (`NOTIF-01`) — Le visa est refusé tant qu'un élément préparé par l'IA reste non validé, observé contre le monde tel qu'il est semé aujourd'hui — pas un monde construit pour le faire tenir.
  Preuve : Le blocage réel a été DÉCOUVERT par un vrai run de npm run clics (dix obstacles iaNonValide bloquaient la clôture du dossier NEP semé, la première fois que le parcours a été conduit jusqu'au bout après l'ouverture du §3), corrigé (commit 3f9cf1a), puis re-vérifié par deux passes clics complètes atteignant clôture/archive avec zéro échec de station nommée. SHA `b951986`.

- **NON OBSERVÉ** — Un élément validé disparaît de la file de notifications dans le même geste qui le valide, sans tâche de nettoyage séparée.
  Manque : Même lacune R87, prouvé seulement par notifications.test.ts.
