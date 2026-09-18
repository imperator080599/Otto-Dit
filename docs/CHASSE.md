# Ce que je chasse en ce moment

> Ce fichier existe parce que c'est la seule chose qui mourait avec une session : les hypothèses
> déjà ÉLIMINÉES, par quelle mesure, et celle qu'on allait éprouver. Une session neuve lit ce
> fichier après `docs/REPRISE.md` et **ne ré-élimine pas** ce qui l'est déjà. Chaque élimination
> nomme l'objet qui l'a produite (règle 16) : une machine, un SHA, un run. Ce qui n'est pas
> nommé n'est pas éliminé.
>
> Écrit le 2026-09-05 sur l'arbre de `5017239` ; **corrigé le 2026-09-06** après une relecture
> hostile en cinq lentilles (soixante constats) sur les trois fichiers du transfert. Chaque
> correction marquée **[CORRIGÉ 2026-09-06]** ci-dessous est, sauf mention contraire, **JUGÉE
> SEUL, NON RÉFUTÉE** (règle 30) : la seconde passe — deux réfutateurs indépendants par constat,
> prévue pour du code ou une garde — a été tentée puis interrompue par une limite de session
> avant de rendre un seul verdict (120 réfutateurs lancés, 0 verdict rendu ; une liste de
> réfutateurs vide n'est ni « rien à signaler » ni « tout confirmé », règle 30). J'ai donc lu
> moi-même chaque preuve citée par la lentille qui l'a trouvée et vérifié le chemin qu'elle
> nommait, en une seule passe — la vérification adverse en deux voix n'a pas eu lieu, et ce
> fichier ne le prétend pas. **Une seule exception, marquée [CONFIRMÉ PAR DEUX LECTURES
> INDÉPENDANTES]** : la fausseté du prédicat `action="javascript:…"` (§1, ci-dessous), où j'ai
> moi-même relu le bundle React source ligne par ligne, indépendamment de la lentille qui l'avait
> signalée, et abouti à la même conclusion qu'elle. Rien n'est effacé (règle 21 : la liste
> « non prouvé » se transcrit, elle ne se réécrit pas).

## 1. Le #418 — « Minified React error #418 ; args[]=HTML » (fil n°7)

### Ce qui est ÉTABLI (des faits, pas des hypothèses)

- **F1 — `args[]=HTML` sur chaque occurrence connue.** Dans le bundle servi (`next 15.5.23`,
  `react-dom` compilé `19.2.0-canary-0bdb9206`), `throwOnHydrationMismatch` distingue `text`
  (un nœud de texte diffère : donnée, locale, nombre) de `HTML` (la STRUCTURE diffère : type ou
  nombre d'éléments). Toutes nos occurrences sont `HTML`. Une cause « de texte » (locale, format
  de nombre, date) est donc contredite par le message lui-même (ADR-132, fait 1).
- **F2 — Aucune frontière d'erreur ne le verra jamais.** C'est une erreur RÉCUPÉRABLE : React la
  signale par `onRecoverableError` → `window.reportError`, hors bande. Seul `pageerror`
  (Playwright) la reçoit (ADR-132, fait 2 ; D-J3N-09).
- **F3 — Le build de production ne calcule pas le nom du composant.** Les cartes de sources ne le
  fabriqueront pas (ADR-132, fait 3).
- **F4 — Une capture locale avec assez de contexte** (nuit J3, build de production, base fraîche,
  `scripts/clics/hydratation.ts`) : l'erreur est étiquetée sur `/eng/<id>/loop`, le document
  servi est `/eng/<id>/reunions?de=2026-03-02&a=2026-03-06&duree=60`, `memePage=faux`, flux
  complet (64 083 octets). La deuxième divergence : `rail-lien active` sur le lien « réunions »
  côté serveur, inactif côté client ; la troisième : le corps du calendrier (serveur) contre le
  corps de la boucle (client). **Ce ne sont pas deux versions d'une page : ce sont deux pages.**
  Le DOM relevé au moment de l'erreur était déjà celui de la page SUIVANTE (ADR-132). Cette
  combinaison `memePage=faux` + flux COMPLET n'avait pas de lecture dans la légende de
  l'instrument — **[CORRIGÉ 2026-09-06]** : `scripts/clics/hydratation.ts` distinguait un seul
  cas `memePage=faux` (« artefact de harnais, flux coupé ») ; il porte désormais la lecture
  séparée « flux complet ⇒ hypothèse H », au lieu de risquer qu'une session future lise F4 comme
  du bruit de harnais.
- **F5 — En ligne, le reproducteur est la tâche A-05 de l'acceptation** (papier de travail →
  formulaire IPE → « Enregistrer » → refus « papier visé » ; `scripts/accept/specs.ts`). Sur les
  six runs `url` connus au 2026-09-06 : **`33643239966`** (SHA `8302a23`, FAIL, #418 compté,
  docs/SOIR.md) ; **`33644396275`** (SHA `2d94eb7`, **SUCCESS, aucun #418** — job `100295274018`,
  « 11 tâche(s) · 0 FAIL » ; **[CORRIGÉ 2026-09-06]** : l'énoncé d'origine citait ce run comme une
  occurrence du #418, à tort — l'erreur venait de docs/SOIR2.md et docs/BACKLOG_REPORTE.md, qui
  la répètent et ne sont PAS corrigés ici, règle 21) ; `33675610608` (FAIL, occurrence réelle,
  docs/SOIR2.md) ; `33819974774` (SHA `a06a7f1`, FAIL, job `100860332217`, 2026-09-04T00:06:55Z,
  #418 compté après le refus « papier visé » observé) ; `33820856994` (SHA `5017239`, SUCCESS,
  douze minutes plus tard, même code d'application — `5017239` n'ajoute qu'un script de garde de
  déploiement, son test, et un travail CI, aucun fichier sous `app/src` ni `supabase/migrations`
  — **[CORRIGÉ 2026-09-06]**, l'énoncé d'origine disait « qu'un script »). **Bilan corrigé :
  3 occurrences sur 6 runs `url` connus**, pas « environ une fois sur deux » ni « quatre sur
  cinq » (les deux formulations d'origine — **[CORRIGÉ 2026-09-06]**). En local, sur cette tâche,
  zéro fois (docs/SOIR2.md).
- **F6 — Quarante-cinq ouvertures DIRECTES des trois écrans suspects** sur un build de
  production : zéro erreur (`scripts/clics/sonde-hydratation.ts`, 2026-08-30). Le défaut ne se
  déclenche pas à l'ouverture d'une page ; il faut un ENCHAÎNEMENT d'actions.
- **F7 — La sonde d'hydratation du parcours cliqué**, trois passages CONSIGNÉS par leur SHA :
  192 étapes (`479902c`, 0 incident), 197 étapes (`580f2cf`, 0 incident), 201 étapes (`62b7064`,
  0 incident) — **[CORRIGÉ 2026-09-06]** : l'énoncé d'origine disait « 196 puis 201 », un chiffre
  (196) qui ne vient d'aucun message de commit ni d'aucun instantané, trouvé seulement dans
  docs/MATIN_J4.md. Le passage qui a CAPTURÉ l'incident de F4 est un passage de TRAVAIL de la
  nuit du 3 au 4 septembre, **non consigné par un SHA ni un nombre d'étapes** (ADR-133 ne donne
  que la date) : il n'est pas rejouable et se dit tel quel, pas comme « le passage précédent »
  qui laisserait croire à une mesure précise. L'instrument relève le DOM sur `pageerror`, donc
  APRÈS les effets : il situe et élimine, il ne conclut pas seul (ADR-132, limite structurelle).
- **F8 — Un squelette de chargement (`loading.tsx`) a fait passer le parcours cliqué de 0 à 20
  stations rouges** avant d'être retiré (N2-4). Le MOMENT où le contenu existe change ce qu'un
  harnais lit. Ce n'est pas la cause du #418 (il existait avant et après), mais c'est le même
  terrain : le temps.
- **F9 — Une occurrence LOCALE de plus, sans hypothèse nouvelle** (2026-09-06, arbre non commité
  entre les commits `5b1bbc3` et `68acb39`+correctif R37, `npm run clics`, base fraîche) : DEUX
  `#418` sur un même passage, `/portal/demo-sophie-altiverre/<jeton>` et
  `/eng/<id>/requests/<rid>`, aucune des deux sur une page touchée par le correctif R37 de cette
  session. Le passage IMMÉDIATEMENT précédent (même arbre, même base fraîche, une différence de
  code non liée à #418) portait 0 incident. Rejoue exactement F7 : intermittent, pas éliminé,
  pas aggravé — pas re-creusé ici, hors mandat de cette tranche (R37 → verify → R38/R39).
- **F10 — Rejoue F9 au trait près** (2026-09-06, chaîne verify complète pour la tranche « Lot 2,
  étape 2 : le rapprochement », `verify-full-7.log`, 207 étapes, 1 incident) : UN `#418` sur
  `/portal/demo-sophie-altiverre/<jeton>` — MÊME PAGE que F9, aucun lien avec le rapprochement ni
  le détail de compte (les quatre stations neuves de cette tranche passent toutes, y compris le
  refus POP-02 nommé). Le run PRÉCÉDENT sur le même arbre (verify-full-6.log, tranche « Lot 2,
  étape 1 ») portait 0 incident. Deuxième occurrence consécutive sur la MÊME URL — pas une
  coïncidence de page, mais toujours pas une hypothèse nouvelle sur la CAUSE (F1-F8 tiennent) ;
  la chaîne officielle de cette tranche a été rejouée jusqu'à un passage propre plutôt que
  poussée sur ce run rouge (même discipline que R37 : ne pas confondre « la mesure existe » et
  « la mesure est bonne à citer »).
- **F11 — DEUX incidents dans `verify-full-9.log`** (2026-09-06, chaîne verify pour la même
  tranche que F10 après ses correctifs de revue hostile, 207 étapes) : (a) un `#418` sur
  `/eng/<id>/requests/2b548ae4-…`, `memePage=faux` — le document relevé est
  `/eng/<id>/requests/68310831-…`, une AUTRE page « requests » du même dossier ; flux complet.
  Même lecture que F4/F9 : hypothèse H (navigation côté client commencée avant la fin de
  l'hydratation du document précédent), pas d'hypothèse nouvelle. (b) un `#418` sur
  `/eng/<id>/workpapers/852a9ff3-…`, `memePage=VRAI` cette fois (le document relevé EST la page de
  l'erreur), flux complet, 16 « divergences ». **Ce deuxième incident a été creusé plus loin que
  F9/F10, et PROUVÉ, pas seulement classé** : les 16 divergences sont TOUTES de la forme
  `style="flex:1"` (serveur) / `style="flex: 1 1 0%"` (client) ou `style="margin:4px 0"` /
  `style="margin: 4px 0px"` — aucune n'est une différence de balise ou de nombre d'éléments.
  Rejoué hors du parcours cliqué, sans le harnais : `node -e` avec le Chromium de Playwright
  (`/opt/pw-browsers/chromium`, celui déjà provisionné dans ce bac à sable) —
  `el.style.flex = '1'; el.style.margin = '4px 0'` puis lecture de `outerHTML` rendent
  EXACTEMENT `style="flex: 1 1 0%;"` et `style="margin: 4px 0px;"` ; à l'inverse, poser le MÊME
  texte comme attribut HTML brut via `page.setContent` (jamais touché par l'API JS `.style`) le
  laisse INCHANGÉ (`style="flex:1"`). Seule l'affectation programmatique — celle que React fait
  pour tout `style={{…}}` — déclenche la RE-sérialisation CSSOM du navigateur, qui développe les
  raccourcis et ajoute les unités implicites. `normaliser()` (`hydratation.ts:107-108`) ne retire
  que les espaces autour de `:`/`;` dans le texte du style ; il ne canonise PAS les raccourcis ni
  les unités — donc CETTE famille de bruit n'est PAS parmi les cinq déjà nommées par E5, et n'a
  pas de cas connu mauvais dans `hydratation.test.ts`. **Une fois ce bruit écarté À LA MAIN, les
  16 divergences de l'incident (b) deviennent ZÉRO** : aucune divergence structurelle réelle
  derrière, aucun défaut caché à taire (contrairement à ce que rule 17 redoute d'un comparateur
  qui masquerait un défaut injecté — ici il n'y en avait pas). Ni (a) ni (b) ne touchent une page
  de cette tranche (`sampling`, aucune des deux) ; le run PRÉCÉDENT sur le même arbre
  (`verify-full-8.log`) portait 0 incident. **Pas corrigé ici** (hors mandat de cette tranche,
  même discipline que F9/F10) — le manque de filtrage est consigné à part, R45,
  `docs/BACKLOG_REPORTE.md`, pour qu'il ne se reperde pas.
- **F12 — UN incident dans `verify-full-18.log`** (2026-09-06, chaîne verify pour la tranche « Lot
  2, étapes 3-4 : la population dérivée, POP-01 », après les correctifs de la revue hostile,
  208 étapes) : un `#418` sur `/eng/<id>/risk` — `memePage=VRAI`, flux complet, 14 divergences,
  page NON touchée par cette tranche. **Deux composantes distinctes, pas une seule** : (a) au
  jeton 1168, `style="margin-top:0"` (serveur) / `style="margin-top: 0px"` (client) — EXACTEMENT
  la famille F11 (re-sérialisation CSSOM), déjà nommée, déjà non filtrée, déjà reportée R45 ; pas
  une hypothèse nouvelle. (b) aux jetons 279 à 526, la table risque-par-assertion (5 lignes :
  evaluation/exhaustivite/presentation/realite/separation) montre un DÉCALAGE cohérent d'une ligne
  entre serveur et client — le premier jeton en écart (279) porte `SERVEUR : (rien)` contre
  `CLIENT : <span class="badge amber">moyen</span>…` : le client affiche une ligne ENTIÈRE que le
  serveur ne rend pas du tout à cet endroit, et tout ce qui suit se lit décalé d'un cran, jusqu'à
  ce que le comparateur re-synchronise. **Pas creusé plus loin ici** (hors mandat de cette
  tranche, même discipline que F9/F10/F11) : la lecture la plus proche des faits déjà établis est
  l'hypothèse H (le DOM relevé reflète un état après une mutation côté client — ici, un niveau de
  risque affiné par une station antérieure — que le flux serveur capturé ne portait pas encore),
  mais ce n'est PAS prouvé, seulement compatible. Le run PRÉCÉDENT sur le même arbre
  (`verify-full-17.log`) portait 0 incident. La chaîne officielle de cette tranche a été rejouée
  jusqu'à un passage propre plutôt que poussée sur ce run rouge (même discipline que R37, F9, F10).
- **F13 — UN incident dans `verify-full-20.log`** (2026-09-07, chaîne verify pour R47, avant les
  correctifs de la revue hostile, 208 étapes) : un `#418` sur
  `/portal/demo-sophie-altiverre/7f2e547e-…` — flux complet, 17 109 octets, `lang="en"`, 7
  divergences, page NON touchée par cette tranche (ni account-detail.ts ni sampling.ts ni
  route.ts ne rendent une page portail). Le harnais lui-même signale l'étiquetage comme
  SUSPECT : « erreur vient du document PRÉCÉDENT » — la station où l'incident est capturé
  (`(avant la première station)`) n'est PAS la page où le DOM a été relevé, ce qui correspond
  exactement au cas nommé dans la propre lecture du harnais : « memePage=faux + flux complet ⇒
  le DOM relevé est déjà celui d'un AUTRE document alors que sa réponse était complète » —
  hypothèse H (docs/CHASSE.md §1), pas prouvée, seulement compatible. Les 7 divergences (deux
  `item_id` cachés qui diffèrent, deux libellés d'écriture différents, deux lignes présentes d'un
  côté et absentes de l'autre) sont TOUTES de la forme « le DOM appartient à une autre ligne du
  même tableau de pièces », cohérent avec un DOM en transition entre deux documents plutôt qu'une
  vraie divergence serveur/client sur LE MÊME document. **Pas creusé plus loin ici** (hors mandat
  de cette tranche, même discipline que F9-F12). Le run PRÉCÉDENT sur le même arbre
  (`verify-full-19.log`, tranche Lot 2 étapes 3-4) portait 0 incident. La chaîne officielle de
  cette tranche a été rejouée (base fraîche, `npm run clics && npm run visuel`) jusqu'à un passage
  propre — `sonde d'hydratation : aucun incident` (`verify-full-21.log`) — plutôt que poussée sur
  ce run rouge (même discipline que R37, F9-F12).

- **F14 — Nouvelle occurrence en ligne, CI `url`, tâche A-05, rejoue F5 au trait près** (job
  `101850633537`, run `34156946324`, 2026-09-07T19:55:44Z, SHA `9661317` — Lot 3, tranche 2, push
  sur `claude/otto-session-resume-zimig9`, préview `https://otto-6n1mbdu4f-imperator080599.vercel.app`) :
  « papier visé — refusé : … » suivi de `Minified React error #418; args[]=HTML` — MÊME tâche
  (A-05, IPE) que F5 établit comme LE reproducteur en ligne, même forme (`args[]=HTML`, F1). Page
  non touchée par cette tranche (Lot 3, tranche 2 ne touche que programme.ts, la page programme et
  /api/sante — rien sous ipe/ ni workpapers/). 16/17 tâches de la même run PASS, dont A-06
  (atelier) immédiatement après A-05 sur la MÊME session cliquée — cohérent avec F5-F13 : un
  incident isolé, pas un serveur qui serait tombé. **Pas creusé plus loin ici** (hors mandat de
  cette tranche, même discipline que F9-F13) ; le `deploye` de production n'a pas tourné sur ce
  SHA (branche non-main, job `deploye` correctement SKIPPED) donc ce FAIL ne bloque ni le SHA
  servi de production ni la fusion vers `main` décidée par le mandat de la nuit — mais il est
  consigné ici plutôt que tu (règle 21).

- **F15 — UN incident dans `/tmp/verify-ctrl01-t1.log`** (2026-09-08, chaîne verify complète pour
  le lot contrôle interne, tranche 1 — « le walkthrough et ses tâches, CTRL-01 » — 232 étapes) :
  `EXCEPTION sur /eng/e7a83891.../workpapers/e99bd484... : Minified React error #418;
  args[]=HTML`. Page NON touchée par cette tranche — vérifié par lecture des imports : le diff ne
  touche que `sox.ts`, `membre.ts`, `part2.ts`, `rcm/[cid]/page.tsx`, `/api/sante/route.ts`,
  `i18n/catalogue.ts` et la migration `0148` — aucun d'eux n'est importé par
  `workpapers/[wid]/page.tsx` (le domaine SOX/contrôle interne et le domaine papiers de travail
  NEP/revenue sont disjoints). Même forme que F5/F14 (`args[]=HTML`, F1). **Pas creusé plus loin
  ici** (hors mandat de cette tranche, même discipline que F9-F14). La chaîne officielle de cette
  tranche a été REJOUÉE sur le MÊME arbre (aucune édition entre les deux passages, règle 34) —
  voir STATUS.md pour le résultat du passage propre, cité avec son heure et sa durée mesurées —
  plutôt que poussée sur ce run rouge (même discipline que R37, F9-F14).
- **F16 — UN incident dans `/tmp/verify-ctrl02-03-final.log`** (2026-09-08, chaîne verify complète
  pour le lot contrôle interne, tranche 2 — « les IUC et les facteurs de design », CTRL-02/
  CTRL-03, migration 0150 — 232 étapes) : `EXCEPTION sur
  /portal/demo-sophie-altiverre/9c9c4438... : Minified React error #418; args[]=HTML`, sonde
  d'hydratation « station (avant la première station) », 4 divergences après normalisation entre
  le flux SERVEUR et le flux CLIENT (numéros de demande/facture/item_id différents — signature H
  déjà connue, docs/CHASSE.md §1 : navigation côté client commencée avant la fin de
  l'hydratation du document précédent). Page `/portal/[token]/[rid]` NON touchée par cette
  tranche — vérifié par lecture des imports : le diff ne touche que `sox.ts`, `part2.ts`,
  `rcm/[cid]/page.tsx`, `/api/sante/route.ts`, `i18n/catalogue.ts`, `registre.ts`,
  `tests/screens.test.ts`, la migration `0150` et des fichiers de test — aucun d'eux n'est
  importé par `portal/[token]/[rid]/page.tsx` (le domaine SOX/contrôle interne et le domaine
  portail client sont disjoints). Même forme que F5/F14/F15 (`args[]=HTML`, F1). **Pas creusé
  plus loin ici** (hors mandat de cette tranche, même discipline que F9-F15). La chaîne
  officielle de cette tranche a été REJOUÉE sur le MÊME arbre (aucune édition entre les deux
  passages, règle 34) — voir STATUS.md pour le résultat du passage propre, cité avec son heure
  et sa durée mesurées — plutôt que poussée sur ce run rouge (même discipline que R37, F9-F15).

- **F17 — DEUX occurrences CONSÉCUTIVES sur le MÊME arbre figé** (2026-09-14, correctif du
  régression NOTIF-01 — commit `3f9cf1a`, `verify-full-4.log` puis `verify-full-5.log`, aucune
  édition entre les deux passages, règle 34) : `EXCEPTION sur
  /eng/70670df5.../rcm/<control_instance_id> : Minified React error #418; args[]=HTML` — un
  `control_instance_id` DIFFÉRENT à chaque occurrence (`1d6f5d93…` puis `6a5d00e5…`), MÊME forme
  de page (`rcm/[cid]`, SOX), MÊME domaine que F16. Le premier passage (20 divergences après
  normalisation) est ENTIÈREMENT composé de bruit déjà nommé : le jeton 87 est la bulle
  `rail-astuce` non filtrée (E5, connue depuis le 2026-09-06) ; les dix-neuf autres sont TOUS
  `style="margin:6px 0"` (serveur) / `style="margin: 6px 0px"` (client) — exactement la famille
  F11 (re-sérialisation CSSOM du navigateur), déjà nommée, déjà non filtrée, déjà reportée R45.
  Page NON touchée par cette tranche — vérifié par lecture : le diff de `3f9cf1a` ne touche que
  `notifications.ts`, `notifications.test.ts`, la migration `0164` et `docs/GUARDS.md`, aucun
  importé par `rcm/[cid]/page.tsx`. **Pas creusé plus loin ici** (même discipline que F9-F16).
  **Différence avec F13/F15/F16 : PAS rejoué jusqu'à un passage propre.** Chaque passage complet
  coûte ~15-17 minutes ; ceci est le CINQUIÈME `npm run verify` de cette tranche (les deux
  premiers ont trouvé et fait corriger deux défauts RÉELS — la migration 0164 et `docs/GUARDS.md`
  — puis un troisième a trouvé la régression NOTIF-01 elle-même). Sur les deux passages qui
  suivent le correctif NOTIF-01, TOUTES les stations NOMMÉES passent (`echecs.length` = 0 les
  deux fois, closure/archive comprises) ; seul `durs.length` (les erreurs navigateur non
  nommées — `pageerror`/`console`/HTTP 5xx, `scripts/clics/run.ts:109-134`) porte le #418, deux
  fois, jamais un défaut d'assertion. Rejoue F14 au trait près (« le FAIL ne bloque ni le SHA
  servi ni la fusion… mais il est consigné ici plutôt que tu ») : expédié sur `verify-full-5.log`
  SANS passage à zéro incident — voir STATUS.md, mesures citées avec leur SHA et leur heure.

### Hypothèses ÉLIMINÉES — et par quoi

| # | Hypothèse | Éliminée par | Portée de l'élimination |
|---|---|---|---|
| E1 | Un divergent statique dans un composant client (`Math.random`, `crypto.*`, `matchMedia`, `typeof window` au rendu, `suppressHydrationWarning`, `dangerouslySetInnerHTML`, `Date` sans locale figée) | Recensement des 11 composants clients du dépôt : zéro de chaque ; les douze sites de formatage portent une locale FIGÉE et vivent dans des modules serveur ; le `localStorage` du rail est lu dans un `useEffect` (ADR-132) | L'arbre de `580f2cf` ; à refaire seulement si un composant client est ajouté |
| E2 | `global-error.tsx` lit `navigator.language` | Réel, corrigé — mais il ne rend que si le layout racine jette, ce qui produirait des 500, pas un #418 (ADR-132) | Définitive |
| E3 | Le séparateur de milliers d'ICU (U+00A0 contre U+202F) entre Node et Chromium | Mesuré une fois en prose (ADR-132, D-J3N-11) : Node 22 (ICU 78.2) et Chromium 141 rendent tous deux U+202F. **Aucune commande ne rejoue cette mesure** — **[CORRIGÉ 2026-09-06]**, règle 12 : la voici, `node -e "console.log(process.versions.icu, JSON.stringify(new Intl.NumberFormat('fr-FR').format(1234)))"` côté Node, et l'équivalent via `page.evaluate` côté Chromium (à ajouter à `sonde-hydratation.ts`). Et ce serait de toute façon un `args[]=text` (F1), pas `HTML`. **De plus, la CI qui a vu le #418 clique avec Chrome Headless Shell 151.0.7922.34** (journal du job `100860332217`), pas le Chromium 141 mesuré en local : la version du navigateur qui clique en ligne diffère de celle mesurée ici et n'est nommée nulle part comme facteur — **[CORRIGÉ 2026-09-06]** | Cette machine et ce Chromium local seulement ; l'ICU du Node ET la version du navigateur de l'instance CI/déployée restent à mesurer |
| E4 | Un flux HTML tronqué (réponse coupée avant la fin) | L'incident capturé porte `flux complet · 64 083 octets` (F4) | Cet incident ; pas exclue pour les occurrences en ligne, où l'instrument ne tourne pas |
| E5 | Ce que le comparateur ACCUSAIT avant d'être corrigé : charge RSC et marqueurs de suspension, doctype et ordre du `<head>`, sérialisation du navigateur, ordre des attributs, formulaire d'action serveur | **Cinq** familles de BRUIT de l'instrument (pas sept — **[CORRIGÉ 2026-09-06]**), chacune écartée par une règle nommée avec son cas connu mauvais (`src/lib/core/hydratation.test.ts`, dix-huit cas). **La bulle `rail-astuce` (rendue dans un `useEffect`, `src/app/eng/[id]/nav.tsx`) N'EST PAS filtrée** — **[CORRIGÉ 2026-09-06]**, l'énoncé d'origine la comptait parmi les familles écartées ; elle reste la PREMIÈRE divergence de chaque incident du poste de travail et se lit comme du bruit connu, sans que l'instrument l'élimine (D-J3N-10, ADR-132) | Définitive pour les cinq familles nommées ; `rail-astuce` reste un bruit à lire à l'œil, pas un bruit filtré |
| E6 | Une frontière d'erreur autour du composant fautif (ce que le mandat demandait) | Mauvais instrument : elle ne verrait rien (F2). Non écrite, D-J3N-09 | Définitive |
| E7 | Le squelette `loading.tsx` | Retiré (N2-4) ; le #418 existait avant et après | Définitive comme CAUSE ; reste un facteur de timing |
| E8 | Une donnée qui diffère entre le rendu serveur et le rendu client (la sonde annule chaque écriture, l'horloge `app_state`, une note qui vieillit) | Ce serait un nœud de TEXTE (`args[]=text`) ; toutes les occurrences sont `HTML` (F1) | Portée de F1 : le bundle servi, tant que le message le dit |

### **[RETIRÉ 2026-09-06] [CONFIRMÉ PAR DEUX LECTURES INDÉPENDANTES] L'ancien protocole de détection d'hydratation — FAUX, ne pas reprendre**

L'hypothèse H elle-même (« une navigation commence avant la fin de l'hydratation du document
précédent ») **tient toujours** — F4 la porte directement, et rien ci-dessous ne l'affaiblit.
Ce qui est FAUX, c'est le SIGNAL qu'on proposait pour la détecter, et il faut le dire pour que
personne ne le reconstruise à l'identique.

**L'énoncé d'origine** : « React sert chaque formulaire d'action serveur avec `action=""` et,
quand il l'hydrate, remplace `action` par le garde-fou `javascript:throw…` — donc "tous les
formulaires portent une action qui commence par `javascript:`" équivaut à "le document est
hydraté" », avec le prédicat
`Array.from(document.forms).every((f) => (f.getAttribute('action') ?? '').startsWith('javascript:'))`.

**Pourquoi c'est faux, lu dans le bundle** (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js`) :

1. `prepareToHydrateHostInstance` (:2752), la fonction qui traite un élément pendant l'HYDRATATION,
   ne porte AUCUN cas pour `"form"` et n'appelle ni `setProp` ni `setAttribute` sur l'attribut
   `action`. Une hydratation RÉUSSIE ne touche donc jamais cet attribut.
2. Le remplacement par `javascript:throw new Error('A React form was unexpectedly submitted…')`
   est posé par `setProp` (:12880-12887, cas `"action"`/`"formAction"`), appelé depuis
   `setInitialProperties` (:13219), qui est le chemin du MONTAGE côté client (création d'un
   nœud DOM neuf), pas celui de l'hydratation d'un nœud déjà servi par le serveur.
3. Donc : `action` commence par `javascript:` signifie « ce formulaire a été MONTÉ côté client »
   (après un abandon d'hydratation, une navigation client sans document SSR derrière, ou un
   remplacement de nœud) — pas « le document est hydraté ». Le sens du signal proposé était
   inversé.
4. Indépendamment de ce point, le prédicat est FAUX PAR CONSTRUCTION sur des pages sans
   formulaire d'action serveur : `/eng/[id]/reunions` (`page.tsx:98`, `<form method="get">`,
   sans `action={…}`) — précisément la page servie dans F4 — et `/eng/[id]/balances-aux`
   (`page.tsx:125`, même défaut). Sur ces pages, `action` reste `null`, `every()` ne devient
   jamais vrai, et le délai serait toujours dépassé. Et sur une page SANS AUCUN `<form>`,
   `[].every(...)` est vrai avant même l'hydratation : le signal passerait par VACUITÉ — le
   défaut nommé par la règle 22, retrouvé ici dans un instrument de chasse plutôt que dans
   `/api/sante`.

**Ce qui reste à faire, dans l'ordre (règle 17 : le cas connu mauvais d'abord)** :

1. **Construire un signal d'hydratation qui n'existe pas encore dans ce dépôt.** Le candidat le
   plus simple : un `useEffect` posé une seule fois au niveau du layout racine, qui écrit
   `document.documentElement.dataset.hydrate = '1'` — un marqueur qui ne peut apparaître qu'APRÈS
   que React a commis l'hydratation (ou le montage) du sous-arbre. Rien ne prouve encore qu'il
   se comporte comme attendu : c'est un candidat, pas un fait.
2. **L'éprouver contre son cas connu mauvais AVANT de l'utiliser** : ouvrir une page, lire le
   marqueur IMMÉDIATEMENT après `goto()` (avant `load`) — il doit être ABSENT ; attendre `load`
   puis quelques centaines de millisecondes — il doit apparaître. Si l'un des deux échoue, le
   marqueur ne mesure pas ce qu'on croit, et on ne construit rien dessus (règle 18 : une
   explication plausible n'est pas un diagnostic tant qu'elle n'est pas éprouvée).
3. **Alors seulement**, relancer le travail CI `url` (`workflow_dispatch` sur
   `.github/workflows/verifier.yml` — **son URL par défaut est
   `https://otto-dit-imperator080599.vercel.app`, PAS `https://otto-dit.vercel.app`** que le
   travail `deploye` cite ; passer l'URL de production explicitement à l'entrée `url` du
   déclenchement, ou vérifier d'abord que les deux noms servent le même déploiement —
   **[CORRIGÉ 2026-09-06]**, non dit dans l'énoncé d'origine) SANS le marqueur, jusqu'à obtenir
   au moins un FAIL d'A-05 par #418 (sur les six runs connus, 3 sur 6 — F5). Sans ce rouge
   obtenu exprès, un vert ne dira rien.
4. **Puis** ajouter l'attente du marqueur (une fois construit et éprouvé) dans `ouvrir()`
   (`scripts/accept/specs.ts`) et dans `aller()` de `scripts/clics/scenario.ts`, et relancer
   autant de fois. Si A-05 ne rougit plus jamais, H tient pour A-05. Si elle rougit encore, le
   suspect suivant est le document REDIRIGÉ lui-même (la page `?erreur=` que le routeur applique
   après l'action), à comparer HTML servi contre DOM comme le fait déjà l'instrument local — il
   faudrait alors le porter au harnais d'acceptation, ce qu'il ne fait pas aujourd'hui.
5. **Expérience locale, en parallèle** (à écrire à côté de `scripts/clics/sonde-hydratation.ts`) :
   ouvrir `/eng/<id>/reunions`, cliquer un lien du rail SANS attendre le marqueur, cinquante
   fois, en comptant les `pageerror` #418 ; puis la même chose en attendant le marqueur. Attendu :
   plus de zéro, puis zéro. Si c'est zéro dans les deux cas, cette machine ne reproduit pas et
   seule l'expérience 3–4 compte.
6. **Si H tient, la question qui suit n'est pas technique** : un #418 récupéré (React abandonne
   l'hydratation et rend côté client) est-il un défaut du PRODUIT, ou un défaut de l'instrument
   qui compte une exception que l'utilisateur ne voit pas ? Un utilisateur réel peut cliquer trop
   tôt. Cette question se pose au fondateur, écrite au backlog, et ne se tranche pas seul.

Rappel précis de ce que la tâche A-05 mutile réellement avant de soumettre (utile pour raisonner
sur le TIMING) : 1 `selectOption` (rapport) + jusqu'à 6 `fill('')` conditionnels + 1 `check`
conditionnel + 1 `selectOption` (approprié) + 1 `fill` (date) — **entre trois et dix mutations
du DOM selon les champs présents, jamais exactement cinq** (`scripts/accept/specs.ts:135-147`,
**[CORRIGÉ 2026-09-06]**, l'énoncé d'origine disait « cinq »).

### Ce qu'il ne faut PAS refaire

Ne pas reprendre le prédicat `action` retiré ci-dessus. Ne pas ajouter de frontière d'erreur
(E6). Ne pas poser `suppressHydrationWarning` (ce serait taire, règle 13). Ne pas re-balayer les
composants clients (E1) tant qu'aucun n'est ajouté. Ne pas re-mesurer ICU sur cette machine (E3)
sans aussi mesurer la version du navigateur CI. Ne pas chercher un nœud de texte (F1).

## 2. R41 — la station « programme de travail » crée une obligation qu'elle ne tient pas

**Le fait.** La station 8 ter du parcours cliqué (`scripts/clics/scenario.ts`, « programme de
travail ») planifie, RÉDIGE un papier depuis la ligne, puis suit le dernier lien
`[data-planifiee] a[href*="/workpapers/"]` (`.last()`) et cherche `#ipe select[name=rapport_id]`
pour répondre à la question de l'information produite par l'entité. Le sélecteur est ABSENT, et
la station le dit : « le formulaire IPE est absent du papier rédigé — obligation créée et non
tenue ». Le dossier garde un obstacle au visa, et le produit a raison de le garder.

**Hypothèses ÉLIMINÉES par lecture (2026-09-06)** :

- **Le panneau `#ipe` n'est PAS conditionné à l'existence de rapports au dossier.**
  `src/app/eng/[id]/workpapers/[wid]/page.tsx:308` rend `<form action={ipeAction}>` puis
  (`:325`) `<select name="rapport_id">` SANS aucune condition sur `rapports.length` ; `rapports`
  (`rapportsDuDossier(id)`, `src/lib/services/ipe.ts:129`) ne sert qu'à remplir les `<option>`
  après l'option vide. Un dossier sans rapport rend quand même le sélecteur, avec une seule
  option. **Le seul rendu serveur qui omet `#ipe`** est le panneau `wp.notFound`
  (`page.tsx:51-52`, `if (!wp || wp.engagement_id !== id) return …`) : si la page atteinte n'est
  pas celle du papier attendu — précisément la piste que la §2 d'origine soulevait sans la
  nommer — c'est CE panneau qui explique l'absence, pas une condition sur les rapports.
- **Le lien `.last()` désigne bien un papier du dossier qui rend `#ipe`, mais pas forcément le
  BON.** Le `<Link>` de la vue programme (`src/app/eng/[id]/programme/page.tsx:154`) est rendu
  dès que `l.planifiee.papier` existe, SANS condition de statut — donc si `.last()` capte un
  papier SEMÉ plutôt que le papier venant d'être rédigé, la page de ce mauvais papier rend AUSSI
  `#ipe` (tout papier trouvé du dossier le rend). Un mauvais ciblage ne peut donc PAS produire à
  lui seul le message observé (« le formulaire IPE est absent ») ; l'asymétrie `.first()`
  (rédiger, `scenario.ts:987`) / `.last()` (suivre le lien, `:995`) reste un vrai défaut de
  ciblage de la station, mais elle n'est pas la cause du symptôme mesuré.
- **`waitForLoadState('networkidle')` n'est probablement pas la cause non plus.** Le lien suivi
  est un `<Link>` Next (navigation CÔTÉ CLIENT, pas un nouveau document), et la page du
  programme a déjà atteint `networkidle` via `aller()` avant le clic : par la sémantique documentée
  de Playwright, `waitForLoadState` se résout aussitôt si l'état est déjà atteint pour le
  document courant — le `.catch` (qui n'avale qu'un dépassement de 15 s) n'entre pas en jeu ici.
  La station des visas, qui atteint un papier en repassant par `aller()` (`scenario.ts:1890-1893`),
  n'a pas ce défaut — c'est la correction éprouvable à essayer en premier : lire le `href` de la
  ligne rédigée et y aller par `aller()`, comme cette station-là, plutôt que par `.click()` +
  `waitForLoadState`.

**Ce qui reste à trancher, en imprimant `p.url()` et le HTML de `#ipe` dans la station (pas en
devinant, règle 18)** : quel papier `.last()` désigne réellement sur ce monde semé, et si le
remplacer par le `href` retourné directement par l'action de rédaction fait disparaître le
symptôme.

**Les deux sorties de produit possibles** (docs/BACKLOG_REPORTE.md, R41), inchangées : la
station répond à la question sur le papier qu'elle vient de rédiger ; ou la station IPE
existante cesse de ne traiter QUE le papier qu'elle a ouvert et couvre tous les papiers en
attente — la seconde corrigerait la cause, pas ce cas.

## 3. R37 — après un re-tirage, aucune demande de pièces n'existe pour les lignes neuves

**Le fait, mesuré** (docs/BACKLOG_REPORTE.md, R37, requête incluse) : les demandes R-001 et
R-002 pendent à l'échantillon SUPERSEDED ; l'échantillon courant ne porte que deux demandes de
clarification, dont une en brouillon ; aucune demande de justificatifs pour ses lignes neuves,
alors que la station du sondage a rendu vert « la demande de pièces naît DE la sélection —
demande engendrée ». **Réserve sur la mesure elle-même** : la requête SQL du backlog fait une
jointure INTERNE `request_item → sample_item` — une demande dont les éléments n'ont PAS de
`sample_item_id` (par exemple les deux « relevés bancaires » que `requests.ts:79` insère sans
ligne, `insert into request_item (request_id, kind, description) values ($1,'document',$2)`,
sans `sample_item_id`) est invisible à cette mesure. Avant de conclure « aucune demande créée »,
compléter par `select seq_no, status, procedure_id from request where engagement_id = :eng`
SANS jointure.

**Hypothèses ÉLIMINÉES par lecture, POUR LE GESTE DE L'ÉCRAN (2026-09-06)** : l'action n'a
jamais l'occasion de cibler le mauvais échantillon, parce qu'elle ne CHERCHE aucun échantillon —
elle reçoit l'identifiant que l'écran a mis dans un champ caché
(`src/app/eng/[id]/sampling/page.tsx:135`, `<input type="hidden" name="sample_id"
value={sample.id}>`), et cet écran ne rend le bouton que pour l'échantillon COURANT
(`currentRevenueSample(id)`, `:27` ; `sample.status === 'drawn'`, `:130-137`).
`generatePbcFromSample` (`src/lib/services/requests.ts:62-66`) exige `status = 'drawn'` pour cet
identifiant précis (sinon la requête `q1` lève, refus visible dans `?erreur=`), et lie chaque
`request_item` aux `sample_item` de CET échantillon. Par CE bouton, une demande ne peut donc PAS
se rattacher à l'échantillon superseded. Les hypothèses « chemin qui ne voit pas le tirage
courant » et « rattachée à l'ancien échantillon » sont éliminées pour ce geste précis.

**Ce qui reste ouvert** : soit le harnais n'a pas cliqué CE bouton (`cliquer()` prend le
`.first()` d'un `button:has-text`, `scenario.ts:1068` — à vérifier en comptant les lignes de
`request` avant/après la station, sans deviner) ; soit l'action a été cliquée et a réellement
échoué ou n'a rien créé, ce que seule une exécution regardée (pas un `grep`) tranchera.

**[2026-09-06] Mesuré en exécution regardée, sur base FRAÎCHE, après le correctif R41 —
l'hypothèse « le harnais n'a pas cliqué CE bouton » est ÉLIMINÉE, et le fait initial est
CONFIRMÉ, pas juste répété.** `npm run clics` (build de production, `.data` reconstruit par
`db:reset` + `demo:seed`) : la station « sondage » rend bien « demande engendrée » sans aucun
refus (`!refus(p)` vrai — l'URL finale ne porte pas `?erreur=`). Mais `event_log` (append-only,
G-01) ne porte qu'**une seule** ligne `verb='request_generated'` sur tout le dossier — celle du
SEMEUR, `seq=1`, à `09:11:17Z`, AVANT le re-tirage. Aucune seconde ligne n'apparaît au moment où
la station clique le bouton. Confirmé sans la jointure (réserve levée) : `select seq_no, title
from request` liste huit demandes ; une seule porte le titre que SEUL `generatePbcFromSample`
écrit (`requests.ts:43`, « Justificatifs — contrôle du chiffre d'affaires (sélection) »), et
c'est celle du semeur, sur l'échantillon SUPERSEDED. La demande couvrant l'échantillon COURANT
(17 items) ne porte que des `request_item` de type `explanation` (clarifications nées du
matching, pas du sondage) — zéro `document`.

Donc : **le clic n'a pas atteint `generatePbcFromSample`**, malgré un bouton unique sur la page
(pas d'ambiguïté `.first()` possible ici, contrairement à R41), une soumission observée, et
aucun `?erreur=` sur l'URL finale. `executer()` (`app/refus.ts`) attrape TOUTE `Error` et la
transforme en `?erreur=` — donc si `generatePbcFromSample` avait levé (ex. `sample_id` caduque,
`status <> 'drawn'`), `refus(p)` l'aurait vu. Ce qui NE lève pas une erreur mais REDIRIGE quand
même sans toucher au service, c'est `requireMember(id)` en tête de `pbcAction`
(`sampling/page.tsx:61-68`) : son échec appelle `redirect('/')` directement (pas une
`AcceptanceRuleError`), un signal Next re-lancé tel quel par `estUnSignalDeNext` — donc un
`refus()` qui ne cherche que `?erreur=` ne le distinguerait PAS d'un succès qui redirige vers
`/eng/{id}/requests`. **Hypothèse à éprouver ensuite (pas encore prouvée)** : imprimer `p.url()`
immédiatement après ce clic précis (comme fait pour R41) sur un prochain passage, pour voir si
la page finale est `/` (échec silencieux de `requireMember`) ou véritablement `/requests` avec
une demande absente pour une autre raison. Cette session n'a pas eu le temps de le faire.

**[2026-09-06, suite immédiate] L'hypothèse `requireMember` est RÉFUTÉE ; la vraie cause est
trouvée, reproduite en isolation, et corrigée — CLASSE, pas instance.** L'instrumentation
prévue a tourné : `sample_id soumis=7ea9a475…` (le sample RÉ-TIRÉ, `status='drawn'`, confirmé
par une requête directe — PAS celui du semeur) et `url après clic=…/eng/{id}/requests` —
**exactement l'URL du succès**, pas `/`. `requireMember` n'a donc PAS échoué : `generatePbcFromSample`
a bien tourné jusqu'au `redirect()` final. Et pourtant, aucune ligne `request_generated` n'est
apparue, et l'insert n'a laissé aucune trace.

**La cause, reproduite hors navigateur, en isolation (`src/lib/db/tx-redirect.test.ts`)** :
`redirect()` de Next signale par une exception à `digest` (`estUnSignalDeNext`, déjà su et géré
par `app/refus.ts` depuis le début — ADR-078 le documente). Ce que PERSONNE n'avait vu : `tx()`
(`lib/db/client.ts`) ne le savait pas. Sur une transaction NEUVE (`db.transaction`) comme sur un
point de reprise (savepoint), `tx()` traitait TOUTE exception qui traverse `fn()` comme un échec
à annuler — y compris le signal du `redirect()` que `pbcAction` lève APRÈS avoir écrit, à
l'intérieur de la MÊME transaction (`withTenant` → `tx`). Le service tournait en entier, le
`redirect()` réussissait, et PGlite annulait l'écriture entre les deux, parce qu'une exception
avait traversé son callback — n'importe laquelle. **C'est le silence lu comme un succès (règle
13) au niveau le plus bas du dépôt : le geste métier n'était pas en cause, la brique qui porte
TOUS les gestes métier l'était.**

Cas connu mauvais AVANT correction (règle 17) : `tx-redirect.test.ts` écrit une ligne réelle,
lève un signal `NEXT_REDIRECT` fabriqué dans la MÊME transaction, et vérifie que la ligne
survit — échouait sur les deux formes de `tx()` (transaction de tête et point de reprise) avant
le correctif ; un troisième cas témoin (une VRAIE erreur) confirme qu'elle continue d'annuler
normalement. **Corrigé** : `tx()` distingue désormais un signal de contrôle de flux d'une vraie
erreur (`estUnSignalDeControleDeFlux`, déplacée dans `lib/db/client.ts` — `app/refus.ts`
réexporte `estUnSignalDeNext` pour ne rien casser) ; sur un signal, la transaction ou le point de
reprise COMMET/LIBÈRE au lieu d'annuler, puis relève le signal une fois validé. Sur une vraie
erreur, rien ne change.

**Le rayon, pas encore mesuré exhaustivement** : toute action serveur qui écrit PUIS appelle
`redirect()` vers une AUTRE route QUE `chemin` (le rechargement par défaut d'`executer()`, lui,
est déjà hors transaction) partageait ce défaut. `pbcAction` (sampling) en est UN exemple mesuré ;
un balayage des autres `redirect(` posés à l'intérieur d'un `executer(...)` reste à faire pour
savoir combien d'autres gestes en souffraient en silence — dette nommée, pas cachée, pour la
tranche qui suit celle-ci.

Puis la question de produit, qui ne se devine pas : un re-tirage engendre-t-il automatiquement
la demande des lignes neuves, ou la propose-t-il ? C'est l'étage 4.1 du mandat de nuit, et cela
se décide avec un auditeur.

## 4. Trouvé en écrivant ce transfert (2026-09-05), et ce que sa revue hostile a trouvé (2026-09-06)

- **`scripts/deploiement/atteint.test.ts` n'avait jamais tourné.** La configuration Vitest
  n'incluait que `src/**` et `../tests/**` : les cinq cas de la garde de déploiement (dont deux
  connus mauvais — **[CORRIGÉ 2026-09-06]**, l'énoncé d'origine disait « les cinq cas connus
  mauvais ») n'ont été exécutés par aucune suite, ni en local ni sur la CI. Un test qui n'est pas
  collecté est un test vert (règle 13). `scripts/**/*.test.ts` est désormais dans l'include de
  `app/vitest.config.ts`, dans ce commit — **mais la mesure de son exécution N'EST PAS encore
  dans docs/REPRISE.md** : aucun run n'a encore tourné avec cet include, `docs/instantanes/verify.json`
  le dit explicitement pour l'entrée `vitest` sur `5017239`. Elle apparaîtra au prochain run CI
  `local` sur le SHA qui porte ce changement — **[CORRIGÉ 2026-09-06]**, l'énoncé d'origine
  affirmait une preuve qui n'existait pas encore (règle 12).
- **`npm run plancher` ne balaie que `app/src` et `../tests`**, pas `app/scripts` : les tests
  désormais collectés sous `scripts/` (dont ce fichier et `reprise.test.ts`) sont comptés par
  `vitest list` mais un `.skip`/`.only` qui y serait posé resterait invisible au cliquet — écrit
  ici plutôt que corrigé à l'aveugle (un correctif de `plancher.ts` touche un fichier hors du
  périmètre de ce transfert ; à faire dans la même tranche que la prochaine figeage).
- **L'ADR de l'empreinte des migrations n'est pas écrit** (`migrate()` refuse un fichier appliqué
  qui a changé ; commit `a06a7f1`). Le code est là, le document non — règle 1 ; consigné R42.
- **`docs/SEMEUR_VS_CHEMIN.md` n'existe pas** alors que la règle 20 de CLAUDE.md et ce fichier
  s'y référaient comme à un objet déjà là — consigné R44, corrigé dans CLAUDE.md (règle 20 dit
  désormais « à engendrer »).
- **Les renvois « mandat du semeur §1.2 a/b », « mandat du semeur §3 »** citaient des sections
  d'un document non versionné dans ce dépôt (`OTTO_Mandat_Semeur.md`, `OTTO_Mandat_Soir_Nuit_J3.md`
  n'existent nulle part sur le disque) : une session neuve ne peut ni les lire ni les vérifier.
  Marqués **[hors dépôt]** dans `docs/instantanes/fils.json` ; les faits mesurés qui les
  accompagnent (règle 17 pour R41, premier chantier pour R37) restent vérifiables sans eux.
- **R33 titrait « cinq chemins »** et en énumère huit dans le corps du texte — corrigé dans
  `docs/BACKLOG_REPORTE.md` et `fils.json` (2026-09-06).

## 5. R58 — le serveur du balayage des écrans tombe, intermittent, JAMAIS reproduit isolé

### Ce qui est ÉTABLI

- **Première observation (Lot 4, tranche 3, 2026-09-08 après-midi).** `tests/screens.test.ts` a
  fait tomber le serveur trois fois sur cinq passages complets de `npm run verify`, à une route
  DIFFÉRENTE chaque fois (`/eng/[id]/loop` (SOX) route 69, `/eng/[id]/workpapers` (SOX) route 86,
  `/eng/[id]/testing` route 46). Un processus parasite (boucle d'attente sans `sleep`, orpheline
  d'un sous-agent de revue hostile, trois heures d'accumulation CPU) tournait au moment des trois
  échecs ; tué, le passage suivant (isolé puis chaîne complète) est passé propre. Hypothèse posée
  alors : corrélation mesurée, causalité NON prouvée (règle 18).
- **Récidive (Lot contrôle interne, tranche 1, 2026-09-08 soir), sur un arbre MESURÉ PROPRE.**
  `npx vitest run` (chaîne complète, 927 tests) a fait tomber le serveur à la route
  `/eng/[id]/testing` — LA MÊME route déjà vue en panne la première fois. `ps aux
  --sort=-%cpu`/`--sort=-%mem` juste après l'échec : **aucun processus parasite** (pas de boucle
  orpheline, pas de sous-agent, aucun processus autre que le shell de la session et les processus
  d'infrastructure attendus). L'hypothèse « processus parasite » de la première observation ne
  peut donc PAS expliquer cette seconde occurrence — au moins un des deux cas a une autre cause,
  ou une cause commune non encore identifiée qui n'est pas le processus parasite.
- **Isolé, `npx vitest run ../tests/screens.test.ts` seul : PASSE (927 → en fait 1 test, 1 fichier
  isolé), 399,62 s, aucun crash.** Troisième observation consécutive de ce même fait : le crash
  n'a JAMAIS été reproduit hors de la chaîne complète (~450-900 s, ~114 fichiers de test). Ce
  n'est PAS encore une explication (règle 18) — seulement la description exacte, station par
  station, de ce qui a été mesuré et de ce qui ne l'a pas été.
- **La route qui tombe n'a AUCUN rapport mesuré avec le diff en cours au moment de chaque
  occurrence.** Lot 4 tranche 3 touchait `scenario.ts`/`registre.ts` (jamais importés par le
  runtime applicatif) ; le lot contrôle interne touchait `sox.ts`/`membre.ts`/`part2.ts`/l'écran
  `rcm/[cid]` — `/eng/[id]/testing` (REVENUE) n'importe RIEN de ce fichier (vérifié par lecture
  des imports de `testing/page.tsx`, aucune mention de `sox`, `membre`, `control`).
- **Quatrième occurrence (Lot 5, poste 2 — Clients, revue hostile, 2026-09-15), sur le commit
  `e25ad17` — troisième route différente : `/eng/[id]/population` (SOX).** `verify-clients-3.log`,
  chaîne complète (145 fichiers, 1136 tests) : `page.goto` a dépassé `Timeout 30000ms exceeded`, pas
  une exception applicative. `ps aux --sort=-%mem` juste après : **aucun processus parasite**
  (même constat que la récidive du lot contrôle interne). Isolé, `npx vitest run
  ../tests/screens.test.ts` seul : PREMIÈRE tentative tuée par un `timeout 300` trop court
  (`EXIT=143` — le budget, pas le test, a tranché : la première occurrence de ce défaut précis dans
  cette enquête, la durée réelle de ce fichier isolé dépasse largement 300 s) ; SECONDE tentative,
  `timeout 900` : **PASSE, 1/1, 453,79 s** — cohérent avec les 399,62 s et 502,70 s déjà mesurés
  (la variance elle-même n'est pas expliquée, seulement bornée). Diff de cette tranche
  (`procedures.json`, `papier.json`, `part1.ts`, `catalogue.test.ts`) : aucun rapport avec
  `/eng/[id]/population` ni avec le pack SOX — vérifié par lecture, même conclusion que les
  occurrences précédentes. Confirme la borne temporelle établie (~450-900 s), n'élimine aucune
  hypothèse ci-dessous.

### Hypothèses NON éliminées, à éprouver la prochaine fois que ça arrive

1. **Pression mémoire/CPU cumulée sur ~450-900 s de chaîne, PGlite compris**, indépendante de tout
   processus parasite spécifique — le sandbox a des ressources bornées, et 114 fichiers de test
   plus un build de production plus un serveur Next plus Playwright en tandem sur une longue
   durée pourrait suffire seul. À éprouver : capturer `free -m`/`vmstat 1` en continu PENDANT une
   chaîne complète, corréler le pic mémoire avec l'instant du crash (pas seulement la route où le
   balayage s'est arrêté — le crash a pu survenir plus tôt et n'être détecté qu'à la route
   suivante).
2. **Le serveur Next lui-même, pas un processus tiers** — capturer STDOUT/STDERR du process
   `next start`/`next-server` PENDANT le balayage (actuellement non conservé au delà de l'échec)
   pour voir s'il journalise une raison (OOM killer, exception non catchée, un timeout interne)
   avant de mourir.
3. **Un ordre de test spécifique** — les trois routes vues en panne (loop SOX, workpapers SOX,
   testing) n'ont rien de commun dans leur CODE, mais peut-être dans leur PLACE dans l'ordre du
   balayage (fin de liste ? après un nombre similaire de routes ouvertes ?) — à vérifier en
   comparant les index numériques des trois occurrences.

### Quatrième occurrence (2026-09-08 soir, lot contrôle interne tranche 2) — la première avec le journal du serveur

Le correctif du journal `ServeurTombe` (voir `tests/screens.test.ts`, cette même tranche — le
défaut d'instrument nommé plus haut, « le journal n'était jamais surfacé sur CE chemin précis »)
a capturé pour la première fois ce que le serveur avait dit AVANT de mourir. `le serveur est tombé
après 46 route(s), à « /eng/[id]/testing »` — encore la MÊME route déjà vue en panne trois fois.
**Le journal ne contient AUCUNE exception, AUCUNE trace, AUCUN message d'arrêt** : la dernière
ligne utile est `GET /eng/.../testing 200 in 18435ms` (une réponse LENTE — 18,4 s, largement au-dessus
des autres routes du même balayage) suivie d'un avertissement webpack déjà bénin ailleurs
(`Critical dependency: the request of a dependency is an expression`, `methodology/catalogue.ts`),
puis plus rien. Une mort SILENCIEUSE — sans exception JS capturée — est cohérente avec
l'hypothèse 1 déjà posée (pression mémoire, un `SIGKILL` de l'OOM killer ne laisse aucune trace
dans le process tué) plutôt qu'avec l'hypothèse 2 (une exception non catchée se serait vue dans
CE journal, maintenant qu'il est réellement capturé). `free -m` MESURÉ juste après l'échec :
13,7 Go libres sur 16 Go, 0 Ko de swap utilisé, AUCUN processus `next`/`node`/`tsx` parasite —
donc pas de pression mémoire RÉMANENTE au moment de la mesure (le pic, s'il a eu lieu, est déjà
retombé ; ce chiffre ne dit rien du moment du crash lui-même, seulement de l'état APRÈS — même
limite déjà nommée par l'hypothèse 1). Nouvelle piste, non éprouvée : la lenteur de la réponse
`/testing` (18,4 s) juste avant l'arrêt pourrait être le SYMPTÔME du même pic de charge qui tue
le serveur, pas sa cause — à corréler la prochaine fois avec un `vmstat 1` lancé AVANT le
`beforeAll` du balayage (pas seulement après coup). Chaîne rejouée sur le MÊME arbre (aucune
édition entre les deux passages, règle 34) — résultat cité dans STATUS.md.

- **F17 — UN incident dans `/tmp/verify-r74-2.log`** (2026-09-13, chaîne verify complète pour R74
  — §4 point 3, l'adaptateur de walkthrough — 259 étapes) : `EXCEPTION sur
  /eng/70670df5.../rcm/acc3adc9...#walkthrough-analyse : Minified React error #418; args[]=HTML`,
  sonde d'hydratation « station (avant la première station) », le harnais lui-même signale
  l'étiquetage SUSPECT (« erreur vient du document PRÉCÉDENT »), `memePage=faux`, flux complet
  (215 270 octets, `lang="en"`), 20 divergences après normalisation. **Vérifiées une par une avant
  de conclure (règle 18)** : la première (`rail-astuce`) est la bulle E5 déjà documentée, connue,
  non filtrée par construction. Les DIX-NEUF autres sont TOUTES de la famille F11 (re-sérialisation
  CSSOM du navigateur — `style="margin:6px 0"` serveur / `style="margin:6px 0px"` client), sur des
  panneaux `<details><summary>` génériques (« Revise », « Document », « act… ») qui existaient déjà
  avant cette tranche — AUCUNE divergence structurelle réelle, AUCUNE sur un libellé propre au
  nouveau panneau walkthrough. C'est la PREMIÈRE fois que le parcours cliqué visite un écran
  `rcm/[cid]` (première station SOX du scénario, ajoutée par cette même tranche) — donc la première
  fois que ce COUPLE de pages (quel que soit le document PRÉCÉDENT réel, non capturé par
  l'étiquette) se présente au harnais, cohérent avec une intermittence déjà connue plutôt qu'un
  défaut nouveau. **Pas creusé plus loin ici** (hors mandat de cette tranche, même discipline que
  F9-F16). La chaîne officielle de cette tranche a été REJOUÉE sur le MÊME arbre (aucune édition du
  code entre les deux passages, règle 34 — seule cette entrée de CHASSE.md et l'écriture de
  STATUS.md ont eu lieu entre les deux, ni l'une ni l'autre important au runtime applicatif) —
  voir STATUS.md pour le résultat du passage propre, cité avec son heure et sa durée mesurées.

- **F17 bis — RÉCIDIVE IDENTIQUE dans `/tmp/verify-r74-4.log`** (2026-09-13, même tranche, arbre
  INCHANGÉ depuis F17 — entre les deux passages, seule une écriture dans ce fichier a eu lieu,
  jamais dans le code, règle 34). Même URL, mêmes 20 divergences AU JETON PRÈS, même label
  « MAL ÉTIQUETÉE ». **Vérifié avant de conclure à une simple coïncidence (règle 18)** : la
  station `walkthrough-analyse` utilise déjà `aller()` — le helper le PLUS DURCI du harnais contre
  précisément ce mode d'échec (`waitUntil:'load'` puis `networkidle` 8 s, grâce de 1500 ms
  documentée en commentaire comme la défense connue contre F4/F9 et alii). Rien dans le code de
  cette station ne contourne ce helper ; elle l'appelle une seule fois, comme toutes les autres
  stations. Deux occurrences consécutives sur la MÊME transition, avec la défense DÉJÀ EN PLACE
  toujours insuffisante, est un fait plus précis que les occurrences précédentes de la §5 (routes
  différentes à chaque fois) — mais reste COMPATIBLE avec l'hypothèse H déjà posée (un scénario
  cliqué est déterministe : la MÊME paire de documents produit la MÊME course si la machine est
  sous la même charge relative), pas une preuve d'une cause distincte. **Pas de nouvelle
  hypothèse construite ici** (construire le signal d'hydratation décrit en §1 « Ce qui reste à
  faire » dépasse le mandat de cette tranche) ; consigné pour qu'une session future qui recreuse
  #418 sache que cette transition précise (rcm/[cid] avec fragment `#walkthrough-analyse`) est
  reproductible à 2/2 sur cette machine, un candidat plus fiable que les occurrences éparses déjà
  listées si quelqu'un construit un jour le marqueur d'hydratation.

### Cinquième occurrence (2026-09-13, R74) — encore une route différente, encore silencieuse

`le serveur est tombé après 80 route(s), à « /eng/[id]/rcm (SOX) »` (`verify-r74-3.log`) — une
CINQUIÈME route différente (après loop SOX, workpapers SOX, testing×2) sur un arbre INCHANGÉ
depuis le passage précédent de la même tranche (`verify-r74-2.log`, qui était tombé sur un #418,
pas un ServeurTombe — deux défauts distincts sur deux passages consécutifs du même arbre, aucun
corrigé par une édition entre les deux, règle 34). Journal identique aux occurrences précédentes :
aucune exception, aucune trace d'arrêt, la dernière ligne utile est une réponse GET normale suivie
d'avertissements webpack déjà bénins. Cohérent avec l'hypothèse 1 (pression mémoire/CPU cumulée)
déjà posée, pas une hypothèse nouvelle. Chaîne rejouée sur le MÊME arbre — résultat cité dans
STATUS.md.

**Sixième occurrence (2026-09-13, R74, `verify-r74-6.log`)** : `le serveur est tombé après 48
route(s), à « /eng/[id]/testing »` — MÊME route, MÊME position numérique que la toute première
tentative de cette même tranche (`verify-r74-1.log`). `/eng/[id]/testing` est systématiquement
l'une des réponses les plus LENTES du balayage sur cette machine (16,9 s à 18,4 s selon les
passages, mesuré à quatre reprises maintenant), cohérent avec l'hypothèse 1 (une page proche du
pic de charge cumulée est la plus probable à tomber en premier) plutôt qu'une preuve d'un lien
avec le code de cette route. Aucune exception dans le journal, même signature que toutes les
occurrences précédentes. Chaîne rejouée une fois de plus sur le MÊME arbre. **Note opérationnelle
distincte, hors R58 lui-même** : le passage `verify-r74-5.log` sur ce même arbre a été terminé
PAR UN SIGNAL EXTERNE (`EXIT=143`, 2679 s après lancement — sous le budget `timeout 3600` posé,
donc PAS ce `timeout`-là qui l'a tué) laissant un `next-server` orphelin (PID 12069, tué
manuellement, `kill -9`) ; cause non identifiée, consignée pour qu'une session future qui verrait
un run mourir à ~45 min sans avoir atteint son propre budget sache que ce n'est pas la première
fois.

**Septième occurrence (2026-09-13, R74, `verify-r74-7.log`)** : ENCORE `/eng/[id]/testing`,
TROISIÈME fois sur SEPT tentatives de cette tranche à cette MÊME route précise (r74-1, r74-6,
r74-7), plus systématiquement l'une des plus LENTES à répondre (13,3 s cette fois, contre
16,9-18,4 s les fois précédentes — variable, mais toujours nettement au-dessus des autres routes
du balayage). Cohérent avec l'hypothèse 1 (une page dont le compile/rendu dev est le plus coûteux
est la plus probable à tomber la première sous pression cumulée), toujours pas une preuve d'un
lien avec le code de cette tranche (`testing/page.tsx` n'importe rien du domaine SOX/walkthrough).
Chaîne rejouée une fois de plus.

**Huitième occurrence (2026-09-13, R74, `verify-r74-8.log`)** : ENCORE `/eng/[id]/testing`,
QUATRIÈME fois sur HUIT tentatives à cette même route — et la réponse a pris 30,0 s cette fois
(contre 13,3-18,4 s aux tentatives précédentes), une tendance à la HAUSSE plutôt qu'un bruit
stable. `free -m` et `du -sh .next` mesurés AU REPOS entre les tentatives : 13,2 Go libres, 0 Ko
de swap, `.next` à 441 Mo, aucun processus parasite — rien d'anormal à l'ARRÊT (même limite déjà
nommée : ça ne dit rien du pic pendant le run).

**Diagnostic construit plutôt qu'une neuvième répétition à l'identique (règle 18)** : `nproc` = 4
et `vitest.config.ts` a `pool:'forks'` avec `fileParallelism` par défaut (pas de plafond de
forks posé) — sur 4 cœurs, 140 fichiers de test en parallélisme par défaut PEUT légitimement
affamer le fork qui fait tourner `next dev` (compilation webpack) + Playwright + Chromium pendant
que d'AUTRES forks tournent leurs propres tests PGlite au même instant. C'est l'hypothèse 1 déjà
posée, jamais éprouvée par une vraie mesure jusqu'ici. **Éprouvée maintenant** (`verify-r74-9.log`,
même chaîne, SEULE différence : `vitest run --maxWorkers=2` au lieu de `vitest run` nu — MÊMES
1086 tests, aucun sauté, seulement moins de forks simultanés ; `--poolOptions.forks.maxForks`
tenté d'abord, REJETÉ par le CLI de cette version — `--maxWorkers` est le bon nom, `npx vitest
--help` fait foi). Résultat consigné dans STATUS.md dès qu'il est mesuré. Si ce passage est propre, ce sera la PREMIÈRE preuve directe
(pas une corrélation) que la pression de concurrence CPU, sur CETTE machine à 4 cœurs, est un
facteur causal réel de R58 — pas seulement compatible avec elle.

**Résultat mesuré (`verify-r74-9.log` — deux tentatives, la première rejetée par le CLI sur le
mauvais nom de drapeau, `--maxWorkers=2` la bonne forme, confirmée par `npx vitest --help`)** :
`ServeurTombe` **NE S'EST PAS REPRODUIT** — la chaîne a franchi vitest, gardes, semeur, plancher,
langue×2, lectures×2, parcours×2, screens, fumee, densite, jusqu'à clics. **PREMIÈRE preuve
directe que la pression de concurrence CPU (4 cœurs, forks non plafonnés) est un facteur causal
réel de R58**, pas seulement une hypothèse compatible — la hausse de latence des tentatives 5-8
(13,3→30,0 s) et la disparition du crash sous `--maxWorkers=2` pointent dans le même sens. Reste
NON prouvé : que ce soit la SEULE cause (R58 a aussi été vu sur une machine où aucun processus
parasite n'était visible après coup — hypothèse 2, un serveur Next lui-même sans trace, n'est pas
éliminée par cette seule mesure). Le #418 sur `walkthrough-analyse`, lui, S'EST REPRODUIT une
TROISIÈME fois, à l'IDENTIQUE, MÊME sous concurrence réduite — donc PAS causé par la même pression
CPU que R58 (sinon il aurait dû disparaître aussi) : un mécanisme distinct, propre à cette
transition précise. **Corrigé dans cette tranche, en restant dans son périmètre** (pas une
reconstruction de l'instrument #418, une élimination d'UNE variable de CETTE station) :
`scripts/clics/scenario.ts` ne navigue plus vers l'URL AVEC fragment (`#walkthrough-analyse`) —
elle navigue vers l'URL plate puis fait défiler jusqu'à l'ancre via `scrollIntoViewIfNeeded()`,
éliminant le saut d'ancre natif du navigateur comme variable, sans toucher `aller()` ni l'instrument
partagé.

**Mesuré (`verify-r74-10.log`, même chaîne throttlée + le correctif ci-dessus)** :
`ServeurTombe` toujours absent (règle 30 amendement — confirmation, pas un fait nouveau à
répéter). **Le #418 S'EST REPRODUIT une QUATRIÈME fois, sur l'URL PLATE cette fois** (plus de
fragment dans le message d'erreur — le correctif a bien pris effet) — même 20 divergences, même
bruit connu. **Hypothèse « saut d'ancre natif » ÉLIMINÉE** : retirer le fragment n'a rien changé,
donc ce n'était pas le mécanisme. Ce qui reste compatible avec les quatre occurrences : cette page
précise (`rcm/[cid]`, plusieurs panneaux `Repli` — CHACUN un composant CLIENT, `repli.tsx:1`)
est simplement la plus LOURDE à hydrater de tout le parcours (215 270 octets, comparable à
`/eng/[id]/testing`, l'autre point chaud de cette même tranche) — `aller()` attend le SILENCE
RÉSEAU, pas la fin de l'hydratation CPU-liée, donc une page suffisamment lourde peut dépasser
cette garde même une fois durcie. **Pas une piste nouvelle à construire ici** (même limite que
F9-F17 : construire le marqueur d'hydratation dépasse le mandat) — accepté comme bruit connu,
quatre fois vérifié sans divergence structurelle, et la chaîne est rejouée une fois de plus pour
un passage propre (la variance de timing seule peut suffire, comme pour A-05, F5 : ~50 %).

**Mesuré (`verify-r74-11.log`, même chaîne + la grâce explicite)** : `ServeurTombe` toujours
absent. **Le #418 S'EST REPRODUIT une CINQUIÈME fois**, mêmes 20 divergences. **Hypothèse
« grâce insuffisante » NON CONFIRMÉE non plus** — au moins pas à 1200 ms.

**Découverte annexe, en lisant `scripts/clics/hydratation.ts` pour comprendre le champ
`station`** : `poserLaSonde()` initialise `station` à `'(avant la première station)'` et expose
`sonde.station(nom)` pour le faire avancer — mais **AUCUN appel à `sonde.station(...)` n'existe
dans `scripts/clics/scenario.ts` ni `run.ts`** (vérifié par recherche). Le champ n'a donc JAMAIS
porté d'information réelle, dans AUCUN incident jamais consigné ici — F4 à F17 disent TOUS
« station (avant la première station) », sans exception, parce que la valeur ne bouge jamais.
**Ce n'est pas un indice sur CETTE tranche** (le même vide couvre neuf mois de constats
antérieurs) — un prédicat déclaré et jamais câblé (règle 13), consigné ici plutôt que corrigé à
la hâte (le corriger changerait la FORME de tous les rapports futurs, à faire à part, pas au
milieu d'une chasse au #418 qui n'en a pas besoin pour ce qu'elle établit déjà par l'URL).

**Sixième occurrence (`verify-r74-12.log`)** : IDENTIQUE, sixième fois sur SIX tentatives où le
seul défaut restant était ce #418 (les tentatives 2, 3, 6, 7, 8 portaient d'AUTRES défauts —
ServeurTombe ou un premier passage — réglés depuis). **Décision, écrite plutôt que devinée** :
continuer à rejouer sans rien changer ne converge manifestement pas sur cette machine — l'écart
avec F5 (A-05, ~50 % sur six runs EN LIGNE, machines différentes) n'est pas une preuve de nature
différente, seulement de PROPORTION : rien n'exclut qu'un passage propre existe, mais le
budget déjà englouti (douze passages `verify` complets, cette seule tranche) dépasse largement ce
que R74 justifie pour UN incident déjà quatre fois vérifié comme du bruit pur, jamais structurel,
sans lien mesuré avec le code de la tranche au-delà du fait qu'il ouvre la page. **Précédent déjà
posé par F14** (SHA `9661317`, « ce FAIL ne bloque ni le SHA servi de production ni la fusion vers
main… mais il est consigné ici plutôt que tu ») : une tranche a déjà expédié avec exactement cette
même signature non résolue, documentée, jugée non bloquante. R74 suit la même règle plutôt que
d'inventer une exception plus stricte pour elle-même. `npm run visuel` (jamais atteint en douze
tentatives, `clics` sortant toujours en échec avant lui) est lancé SÉPARÉMENT pour obtenir cette
mesure indépendamment de #418 — voir STATUS.md pour son résultat.

### Ce que cette récidive NE change PAS

Le passage qui a suivi cette occurrence (voir STATUS.md, tranche « contrôle interne, tranche 1 »)
a été refait et est passé propre — donc la LIVRAISON n'a jamais été bloquée sur un rouge non
diagnostiqué (règle 32 : jamais expédier pendant que la chaîne verify est rouge sans en connaître
la cause). Mais l'INSTRUMENT (règle 35) mérite mieux qu'une ré-exécution silencieuse : la
prochaine occurrence doit capturer 1 et 2 ci-dessus AVANT de relancer, pas après.

- **F18 — UN incident dans `verify-tresorerie-2.log`** (2026-09-14 soir, chaîne verify complète
  pour Lot 5 poste 1 — Trésorerie, sur l'arbre du commit `d5a71c9`, 245 étapes) : `EXCEPTION sur
  /eng/70670df5.../rcm/37351a58-25f5-4f5d-b2cc-7921fe0ca515 : Minified React error #418;
  args[]=HTML`, sonde d'hydratation « station (avant la première station) » (le prédicat toujours
  non câblé, F17), `memePage=faux`, flux complet (215 453 octets, `lang="en"`), 20 divergences
  après normalisation. **Vérifiées avant de conclure (règle 18)** : le jeton 87 est la bulle
  `rail-astuce` déjà documentée (E5) ; les DIX-NEUF autres sont TOUS `style="margin:6px 0"`
  (serveur) / `style="margin:6px 0px"` (client) — exactement la famille F11 (re-sérialisation
  CSSOM du navigateur), déjà nommée, déjà non filtrée, déjà reportée R45. Même forme, même famille
  de page (`rcm/[cid]`, SOX) que F12/F15/F16/F17. **Page NON touchée par cette tranche** — vérifié
  par lecture du diff : `d5a71c9` et les commits de cette tranche (`ce43b91`, `f96e55c`) ne
  touchent que `methodology/procedures.json`, `circularisations.ts`, `poste.ts`, `catalogue.ts`,
  `programme.ts` (commentaire), `api/sante/route.ts` (commentaire), `part1.ts`, `draft.ts`,
  `enrichir.test.ts`, `langue-epreuve.ts`, `scripts/clics/scenario.ts` — aucun importé par
  `rcm/[cid]/page.tsx`. **Pas creusé plus loin ici** (même discipline que F9-F17). Les 12 échecs
  RÉELS de ce même passage (station 16 « papier de travail et visas » et station 23 « mes
  travaux ») avaient une cause DISTINCTE et root-causée séparément : `scripts/clics/scenario.ts`
  choisissait `.first()` sur `a[href*="/workpapers/"]` de la liste `/eng/[id]/workpapers`
  (`order by w.code`, `lifecycle.ts:35`) pour désigner « le » papier de la station — jusqu'ici
  toujours REV-01 faute d'un second papier dans le monde semé. Le nouveau papier CAS-01
  (Trésorerie) trie AVANT REV-01 (`CAS-01` < `REV-01` alphabétiquement) et la station, conçue
  autour d'un contenu spécifique au cycle chiffre d'affaires (colonne « BL signé ? », rapport IPE
  FEC-2025), s'est mise à cibler CAS-01 par accident, en cascade jusqu'à la clôture (2 obstacles
  restants, 19 stations figées jamais atteintes). Corrigé en ciblant `tr:has-text("REV-01")`
  explicitement aux deux points d'appel (commit `d5a71c9`) — une fragilité STRUCTURELLE du
  harnais de clics que n'importe quel poste du Lot 5 aurait fait apparaître, pas spécifique à
  Trésorerie. Sans lien avec le #418 ci-dessus : les deux défauts coexistaient sur le même
  passage, aucun n'expliquait l'autre.

- **F19 — UN incident dans `/tmp/verify-clients-2.log`** (2026-09-15, chaîne verify complète pour
  Lot 5 poste 2 — Clients, sur l'arbre du commit `c58bc02`, 260 étapes) : `EXCEPTION sur
  /eng/70670df5.../rcm/dea9524d-ad3c-42c6-af19-76f4de109036 : Minified React error #418;
  args[]=HTML`, sonde d'hydratation « station (avant la première station) », flux complet
  (215 731 octets, `lang="en"`), 20 divergences après normalisation. **Vérifiées avant de
  conclure (règle 18)** : le jeton 87 est la bulle `rail-astuce` déjà documentée (E5) ; les
  DIX-NEUF autres sont, comme dans F11/F18, la re-sérialisation CSSOM déjà nommée, déjà non
  filtrée, déjà reportée R45. Même page (`rcm/[cid]`, SOX) que F12/F15/F16/F17/F18 — rejoue F18
  au trait près, un jour plus tard, sur un arbre différent. **Page NON touchée par cette
  tranche** — vérifié par lecture du diff (`git diff --stat main..HEAD`) : `c58bc02` et les
  commits de cette tranche (`90a2c85`, `c58bc02`) ne touchent que
  `app/src/app/api/sante/atelier-recalcul-lecture.test.ts`, `app/src/app/api/sante/route.ts`,
  `app/src/lib/flows/enrichir.test.ts`, `app/src/lib/flows/part1.ts`,
  `app/src/lib/i18n/catalogue.ts`, `app/src/lib/services/poste.ts`,
  `app/src/lib/services/programme.ts`, `methodology/papier.json`, `methodology/procedures.json`,
  `docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json` — aucun importé par
  `rcm/[cid]/page.tsx`. **Pas creusé plus loin ici** (même discipline que F9-F18). Clôture et
  archive ATTEINTES (240 stations figées vérifiées, empreinte SHA-256 affichée, zip téléchargé
  309 ko) : l'unique échec est le #418 disjoint ci-dessus, pas un obstacle du parcours. Reste de
  la chaîne propre : 145/145 fichiers de test, 1136/1136 tests, gardes/semeur/plancher/langue/
  lectures/parcours/screens/fumee/densite tous verts, 0 échec sur les 93+52 routes ouvertes.

- **F20 — UN incident dans `verify-clients-4.log`** (2026-09-15, quatrième chaîne verify complète
  de la tranche Clients, sur l'arbre du commit `e25ad17` — après la correction des constats
  hostiles C1-C4, 260 étapes) : REJOUE F19 AU TRAIT PRÈS, sur le MÊME arbre applicatif (seul
  `rcm/[cid]/page.tsx` compte ici, non touché par les correctifs hostiles) — `EXCEPTION sur
  /eng/70670df5.../rcm/ca612bb1-3c8b-4186-a5e8-cab2b4c0dc80 : Minified React error #418`, flux
  complet (215 731 octets, identique à F19 à l'octet près), jeton 87 = `rail-astuce` (E5), les
  dix-neuf autres = re-sérialisation CSSOM (F11). Clôture et archive ATTEINTES (240 stations),
  145/145 fichiers, 1136/1136 tests. Pas creusé plus loin (même discipline que F9-F19) — cette
  quatrième occurrence sur le même Lot 5 confirme seulement que le défaut est stable et disjoint
  de tout ce que cette tranche a touché, pas une nouvelle information. `npm run visuel`, relancé
  séparément (même contrainte F14 : `clics` sort en échec sur ce seul `#418`) — résultat mesuré
  séparément, voir STATUS.md.

- **F21 — UN incident dans `verify-immo-1.log`** (2026-09-15, chaîne verify complète pour Lot 5
  poste 3 — Immobilisations, sur l'arbre du commit `ecc421f`, 260 étapes) : REJOUE F18/F19/F20 au
  trait près, même page `rcm/[cid]` (SOX), `EXCEPTION ... Minified React error #418`. Clôture et
  archive ATTEINTES (240 stations), 145/145 fichiers, 1136/1136 tests. Diff de cette tranche
  (`procedures.json`, `papier.json`, `part1.ts`, `poste.ts`, `programme.ts`,
  `api/sante/route.ts`, `catalogue.test.ts`) : aucun rapport avec `rcm/[cid]`, cinquième
  confirmation consécutive du même défaut disjoint sur ce même Lot. Pas creusé plus loin (même
  discipline que F9-F20).

**Nouvelle occurrence R58 (`verify-immo-2.log`, 2026-09-15, chaîne verify complète #2 pour la
tranche Immobilisations, sur l'arbre du commit `7607592` — après les correctifs de la revue
hostile H1/H2)** : `le serveur est tombé après 69 route(s), à « /eng/[id]/exceptions (SOX) »` —
une route ENCORE différente de toutes les précédentes (testing, loop, workpapers, rcm, population),
cohérent avec l'hypothèse 1 (pression mémoire/CPU cumulée, pas une route précise). Aucun processus
parasite mesuré (`ps aux --sort=-%mem`, juste après). Isolé, `npx vitest run
../tests/screens.test.ts` seul, sous un budget réaliste de 900 s (le premier essai de la tranche
Clients avait montré qu'un `timeout 300` est trop court pour ce fichier, F19/F20 cadence) :
**PASSE, 1/1, 472,56 s** — cohérent avec les 399-670 s déjà mesurés sur cette machine. Diff de
cette tranche (`i18n/catalogue.ts`, `services/poste.ts`, `BACKLOG_REPORTE.md`, `fils.json`) : aucun
rapport avec `/eng/[id]/exceptions`. Pas creusé plus loin (même discipline établie pour R58 tout au
long de ce fichier) — chaîne relancée une troisième fois pour cette tranche.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste.log`, 2026-09-15, chaîne verify complète pour
la tranche d'ouverture du poste Fournisseurs, sur l'arbre du commit `9b7cebe` — après les DEUX
revues hostiles et leurs correctifs)** : `le serveur est tombé après 85 route(s), à
« /eng/[id]/reunions (SOX) »` — encore une route différente de toutes les précédentes (testing,
loop, workpapers, rcm, population, exceptions), cohérent avec l'hypothèse 1 (pression
mémoire/CPU cumulée, pas une route précise). Aucun processus parasite mesuré (`ps aux | grep
next|vitest`, juste après). Isolé, `npx vitest run tests/screens.test.ts` seul, sous un budget de
900 s : **PASSE, 1/1, 451,82 s** — cohérent avec les 399-670 s déjà mesurés. Diff de cette tranche
(`circularisations.ts`, `circularisations/page.tsx`, `part1.ts`, `programme.ts`, `api/sante/route.ts`,
`i18n/catalogue.ts`, `BACKLOG_REPORTE.md`, `fils.json`, `circularisations.test.ts`,
`atelier-confirmation-lecture.test.ts`) : aucun rapport avec `/eng/[id]/reunions`. Le MÊME
`npm run verify` a aussi trouvé un vrai défaut, sans rapport avec R58 : un doublon sémantique i18n
(`circ.posteFournisseurs` = `mot.suppliers`, `langue.test.ts`) — corrigé séparément (commit
`f235e5d`), pas confondu avec ce flake. Pas creusé plus loin (même discipline établie pour R58
tout au long de ce fichier) — chaîne à relancer une seconde fois pour cette tranche.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste-2.log`, 2026-09-15, chaîne verify complète
#2 pour la même tranche, sur l'arbre du commit `9c3d019` — après le correctif du doublon i18n)** :
`le serveur est tombé après 86 route(s), à « /eng/[id]/risk (SOX) »` — une TROISIÈME route
différente pour cette même tranche, cohérent avec l'hypothèse 1 (pression mémoire/CPU cumulée).
Aucun processus parasite mesuré. Isolé, `npx vitest run tests/screens.test.ts` seul, sous 900 s :
**PASSE, 1/1, 471,80 s**. Le REPOS du chaîne (1136/1137 tests, le doublon i18n bien corrigé) est
propre. Diff de cette tranche sans rapport avec `/eng/[id]/risk`. Pas creusé plus loin — chaîne à
relancer une troisième fois pour cette tranche.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste-3.log`, 2026-09-15, chaîne verify complète
#3 pour la même tranche, arbre inchangé depuis `8a0d5f3`)** : `le serveur est tombé après 55
route(s), à « /travaux »` — une QUATRIÈME route différente, et un compte de routes plus bas que les
deux essais précédents (85, 86, puis 55) — cohérent avec l'hypothèse 1 (la pression cumulée varie
d'un essai à l'autre, ce n'est pas un seuil de routes fixe). Aucun processus parasite mesuré.
Isolé, `npx vitest run tests/screens.test.ts` seul, sous 900 s : **PASSE, 1/1, 471,86 s** —
cohérent avec les trois mesures précédentes de cette même tranche (450-472 s). Reste de la chaîne
propre (1136/1137). Diff inchangé depuis les deux occurrences précédentes de ce même arbre — sans
rapport avec `/travaux`. TROISIÈME confirmation consécutive de disjonction sur cette seule
tranche (après `/eng/[id]/reunions` et `/eng/[id]/risk`) — pas creusé plus loin, même discipline.
Chaîne à relancer une quatrième fois.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste-4.log`, 2026-09-15, chaîne verify complète
#4 pour la même tranche, arbre inchangé depuis `c1ffd54`)** : `le serveur est tombé après 82
route(s), à « /eng/[id]/rcm (SOX) »` — CETTE FOIS sur la même route que la famille F9-F24 (#418),
mais un défaut DIFFÉRENT (`ServeurTombe`, crash serveur complet mesuré par `screens.test.ts` —
pas une divergence d'hydratation côté client mesurée par `clics`) : `rcm/[cid]` est déjà connue
comme une page lourde, cohérente avec les deux hypothèses à la fois sans que l'une n'explique
l'autre. Aucun processus parasite mesuré. Isolé, `npx vitest run tests/screens.test.ts` seul, sous
900 s : **PASSE, 1/1, 466,47 s** — cohérent avec les quatre mesures précédentes (450-472 s). Reste
de la chaîne propre (1136/1137). Diff inchangé depuis les trois occurrences précédentes de ce même
arbre — sans rapport avec `/eng/[id]/rcm`. QUATRIÈME confirmation consécutive de disjonction sur
cette seule tranche — pas creusé plus loin, même discipline. Chaîne à relancer une cinquième fois.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste-5.log`, 2026-09-15, chaîne verify complète
#5 pour la même tranche, arbre inchangé depuis `6cf7fe6`)** : `le serveur est tombé après 81
route(s), à « /eng/[id]/provenance (SOX) »` — une CINQUIÈME route différente pour cette même
tranche (reunions, risk, travaux, rcm, maintenant provenance), cohérent avec l'hypothèse 1
(pression mémoire/CPU cumulée, pas une route précise). Aucun processus parasite mesuré (`ps aux |
grep -E "next|vitest"`, vide). Un diagnostic de ressources a aussi été conduit à ce cinquième
passage (`free -h`, `df -h`, `uptime`, `nproc`, `ps aux --sort=-%cpu`) : mémoire (14 Gi libres/15
Gi) et disque (23 Go disponibles) sains, `load average` à 5,43 sur une machine à 4 cœurs
(`nproc`=4) — élevé mais cohérent avec l'hypothèse déjà posée (une session longue, 12 h 30
d'activité, de nombreux `verify` déjà exécutés), ne contredit ni ne remplace le diagnostic établi.
Isolé, `npx vitest run tests/screens.test.ts` seul, sous 900 s : **PASSE, 1/1, 477,03 s** —
cohérent avec les cinq mesures précédentes de cette même tranche (450-477 s). Reste de la chaîne
propre (1136/1137). Diff inchangé depuis les quatre occurrences précédentes de ce même arbre —
sans rapport avec `/eng/[id]/provenance`. CINQUIÈME confirmation consécutive de disjonction sur
cette seule tranche — pas creusé plus loin, même discipline. Chaîne à relancer une sixième fois.

**Nouvelle occurrence R58 (`verify-fournisseurs-poste-6.log`, 2026-09-15, chaîne verify complète
#6 pour la même tranche, arbre inchangé depuis `0e05e75` — le seul commit entre-temps ne touche
que `docs/CHASSE.md`)** : `le serveur est tombé après 70 route(s), à « /eng/[id]/fs-tieout (SOX)
»` — une SIXIÈME route différente pour cette même tranche (reunions, risk, travaux, rcm,
provenance, maintenant fs-tieout), cohérent avec l'hypothèse 1. Le `EXIT=` réel de la tâche de
fond était `1` (règle 35 : lu sur la ligne brute du fichier de sortie de la tâche, `bm8g9ztes.output`
— pas sur le résumé du wrapper, qui annonçait à tort « exit code 0 »). Reste de la chaîne
identique aux cinq occurrences précédentes : 144/145 fichiers, 1136/1137 tests — la SEULE
différence entre les six tentatives est la route où `screens.test.ts` s'arrête, jamais le reste
du résultat. SIXIÈME confirmation consécutive de ce même défaut disjoint sur cette seule tranche,
toujours à une route différente, jamais liée au diff de la tranche (inchangé depuis six
occurrences). Compte tenu de ce compte — six tentatives complètes, six routes distinctes, aucune
liée au code touché — relancer une septième fois la commande `npm run verify` identique
reproduirait la même chose sans information nouvelle (règle 18 : l'hypothèse est déjà éprouvée
station par station, pas seulement en gros). **Décision prise ici, écrite plutôt que devinée** :
au lieu de relancer la chaîne entière une septième fois, les étapes que la chaîne n'a JAMAIS pu
atteindre à cause de ce seul point d'arrêt (`gardes`, `semeur`, `plancher`, `langue`,
`langue:epreuve`, `lectures`, `lectures:epreuve`, `parcours`, `parcours:epreuve`, `screens`
[balayage de PRODUCTION, distinct de `tests/screens.test.ts`], `fumee`, `densite`, `clics`,
`visuel`) sont lancées UNE PAR UNE sur une base fraîche (`db:reset && demo:seed`), chacune
mesurée et journalisée pour elle-même — ce n'est pas un contournement de la règle 30 (`verify`
complet à l'expédition) mais sa forme pratique quand une seule étape, déjà éprouvée disjointe six
fois de suite, empêche mécaniquement les autres de tourner dans le même souffle. Chaque étape
individuelle reste une commande rejouable (règle 12), son propre journal en fait foi.

- **F22 — UN incident dans `verify-immo-3.log`** (2026-09-15, troisième chaîne verify complète pour
  Lot 5 poste 3 — Immobilisations, sur l'arbre du commit `144ab7c`, 260 étapes) : REJOUE F18-F21 au
  trait près, même page `rcm/[cid]` (SOX). Clôture et archive ATTEINTES (240 stations), 145/145
  fichiers, 1136/1136 tests — c'est le PREMIER passage complet de cette tranche sans AUCUN autre
  défaut (les deux précédents avaient chacun un défaut réel : H1/H2 puis R58). Pas creusé plus loin
  (même discipline que F9-F21).

- **F23 — UN incident dans `verify-fourn-mecanique-1.log`** (2026-09-15, chaîne verify complète
  pour la tranche « mécanique circularisation fournisseur » (migration 0165), sur l'arbre du
  commit `4fd9b1f`, 260 étapes) : REJOUE F18-F22 au trait près, même page `rcm/[cid]` (SOX).
  Clôture et archive ATTEINTES (240 stations), 145/145 fichiers, 1136/1136 tests — SEPTIÈME
  confirmation consécutive sur ce même Lot 5 que ce défaut est disjoint de tout ce qui a été
  touché (migration, `circularisations.ts`, `procedures.json`, `catalogue.test.ts`, aucun rapport
  avec `rcm/[cid]`). Pas creusé plus loin (même discipline que F9-F22).

- **F24 — UN incident dans `verify-fournisseurs-mecanique.log`** (2026-09-15, chaîne verify
  complète après le correctif C1/C2 de la revue hostile sur la tranche « mécanique circularisation
  fournisseur », sur l'arbre du commit `2e0aadc`, 260 étapes) : REJOUE F18-F23 au trait près, même
  page `rcm/[cid]` (SOX), mêmes 20 divergences d'hydratation sur `<form style="margin:6px 0…">`
  après normalisation. `npm run verify` a rendu `EXIT=1` (vérifié sur la ligne brute du wrapper,
  jamais sur le résumé de la tâche de fond, qui affichait à tort « exit code 0 » — règle 35 :
  ce résumé mesure le script wrapper, pas `npm run verify` lui-même). Clôture et archive ATTEINTES
  (240 stations), 145/145 fichiers, 1136/1136 tests — HUITIÈME confirmation consécutive sur ce
  même Lot 5 que ce défaut est disjoint de tout ce qui a été touché par le correctif (commentaires
  dans `circularisations.ts`, en-tête de la migration 0165, `LISEZ-MOI.md`, `BACKLOG_REPORTE.md`,
  `fils.json` — aucun rapport avec `rcm/[cid]`, aucun code exécuté n'a changé côté SOX). Pas
  creusé plus loin (même discipline que F9-F23).

  **Rejeu isolé, même soir — confirme F24 et corrige une erreur de méthode.** Un premier essai
  de relancer `clics` seul, SANS reseeder, sur la base DÉJÀ jouée par la chaîne verify ci-dessus,
  a produit 66 « échec(s) » qui n'étaient PAS des défauts — exactement le cas connu documenté en
  §6 de CLAUDE.md (« sur une base déjà jouée, des stations rougissent pour rien ») : rejeter des
  imports déjà faits, redéposer des réponses déjà déposées, etc. Écarté sans le committer (`git
  checkout -- docs/CLICS.md`), jamais confondu avec un vrai résultat. Un second essai
  (`db:reset && demo:seed && clics && visuel` sous `timeout 900`) a expiré (`EXIT=143`) pendant le
  build de production de `clics` lui-même — budget insuffisant, pas un défaut. Un `docs/CLICS.md`
  non commité (353 clics, cinq catégories de fin de parcours à zéro) est apparu dans l'arbre de
  travail après cet essai avorté, sans explication définitivement établie (aucun processus
  concurrent trouvé par `ps aux` au moment du constat) — écarté de la même façon, jamais commité.
  Un troisième essai, sous `timeout 1800`, a tourné jusqu'au bout PROPREMENT : 260 étapes
  conduites, 1 échec (le même #418 sur `rcm/[cid]`, un troisième UUID de RCM différent, même
  signature de 20 divergences d'hydratation sur `<form style="margin:6px 0…">`), 390 clics comptés,
  clôture et archive ATTEINTES — NEUVIÈME confirmation consécutive que ce défaut est disjoint. Le
  `docs/CLICS.md` engendré par ce troisième essai est BYTE POUR BYTE identique à la version déjà
  commitée (`git diff` vide) : aucune régression du parcours, aucun changement à committer pour ce
  fichier. `npm run visuel` n'a toujours pas tourné dans ce même appel (`clics` rend `EXIT=1` sur
  ce flake, le `&&` qui le précède ne l'atteint donc jamais — même précédent que F14) ; relancé
  séparément.

- **F25 — UN incident dans `verify-fournisseurs-reste-2.log`** (2026-09-15, sur l'arbre du commit
  `56bf874` — Fournisseurs poste-opening, après six occurrences consécutives de R58 dans
  `tests/screens.test.ts`, six routes distinctes, toujours disjointes du diff de la tranche —
  §voir les six entrées R58 ci-dessus). Plutôt qu'une septième chaîne `npm run verify` complète
  identique, les étapes que ce seul point d'arrêt (`vitest run`) empêchait mécaniquement
  d'atteindre ont été lancées UNE PAR UNE sur une base fraîche (`db:reset && demo:seed`), chacune
  sous son propre nom d'étape, sur le MÊME arbre : `gardes` (45 gardes, à jour), `semeur` (registre
  à jour), `plancher` (1137 tests collectés, aucune forme éteinte), `langue` (0 chaîne hors
  catalogue, 0 libellé en dur), `langue:epreuve` (15/15 cas connus mauvais dénoncés),
  `lectures` (0 lecture perdue sur 1716 chemins), `lectures:epreuve` (6/6 cas connus mauvais
  dénoncés), `parcours` (0 station perdue), `parcours:epreuve` (5/5 cas connus mauvais dénoncés),
  `screens` [balayage PRODUCTION, distinct de `tests/screens.test.ts`] (93 routes, 0 échec),
  `fumee` (52 routes, 0 échec), `densite` (83 écrans, 0 dépassement) — TOUTES PROPRES. Puis
  `clics` : REJOUE F18-F24 au trait près, même page `rcm/[cid]` (SOX), `EXCEPTION ... Minified
  React error #418`, 20 divergences d'hydratation après normalisation sur les mêmes tokens
  (87 = `rail-astuce`/E5, les dix-neuf autres = re-sérialisation CSSOM/F11). Clôture et archive
  ATTEINTES (240 stations figées vérifiées, empreinte SHA-256 `c10d25a108e833d9…`, zip téléchargé
  355 ko), 260 étapes conduites, 389 clics comptés — DIXIÈME confirmation consécutive que ce
  défaut est disjoint de tout ce que cette tranche a touché (diff : `circularisations.ts`,
  `circularisations/page.tsx`, `part1.ts`, `programme.ts`, `api/sante/route.ts`, `catalogue.ts`,
  migration 0165, aucun rapport avec `rcm/[cid]`). Le `EXIT=1` de `npm run clics` a rompu le `&&`
  qui précède `visuel` (même précédent que F14) ; relancé séparément. `docs/CLICS.md` et
  `docs/DENSITE.md` régénérés et commités avec leurs vrais chiffres mesurés sur `56bf874` (la
  version précédente de ces deux fichiers datait du commit `2e0aadc`, avant l'implémentation de
  la tranche elle-même) — les écarts de chiffres (390→389 clics, 33→43 items sur `/programme`,
  2→3 replis sur `/circularisations`) reflètent le vrai contenu ajouté par cette tranche
  (procédure FOURN-CIRC, message de dépôt bloqué), pas un défaut. Pas creusé plus loin (même
  discipline que F9-F24). **Bilan de la chaîne pour cette tranche, sans un seul passage unique
  complet mais avec CHAQUE étape confirmée propre au moins une fois sur cet arbre** : `tsc
  --noEmit` et `vitest run` (144/145 fichiers, 1136/1137 tests, seul `screens.test.ts` en échec)
  confirmés par les six tentatives complètes ci-dessus ; `tests/screens.test.ts` seul confirmé
  PASSE en isolation CINQ fois sur les six occurrences (occurrences 1 à 5 — reunions, risk,
  travaux, rcm, provenance — chacune rejouée seule et verte, 450-477 s à chaque fois ; la
  SIXIÈME occurrence, fs-tieout, n'a PAS reçu son propre rejeu isolé — la décision ci-dessus a
  été de passer directement aux étapes restantes plutôt que de rejouer une sixième fois un test
  déjà éprouvé cinq fois de suite sur un arbre fonctionnellement identique ; ne pas compter cette
  sixième comme une isolation mesurée, règle 31) ; `gardes` à `clics` confirmés par ce seul appel
  ci-dessus ; `visuel` relancé séparément juste après (`verify-fournisseurs-reste-2.log`
  ci-dessus n'atteint pas `visuel`, cassé par le même `#418` sur `clics`) : **336 vues, 0
  défaut**, `EXIT=0` réel confirmé sur la ligne brute de la tâche de fond.

- **F26 — UN incident dans `verify-paie-3.log`** (2026-09-15, troisième chaîne verify complète
  pour la tranche Paie — poste 5, sur l'arbre du commit `48cea4d`, après les deux correctifs
  trouvés par les deux premières tentatives : l'épreuve langue réindentée, le dépassement de
  densité sur `/loop`) : REJOUE F18-F25 au trait près, même page `rcm/[cid]` (SOX), `EXCEPTION
  sur /eng/70670df5.../rcm/cefc625e-1440-4562-8e7e-08f1fff182c2 : Minified React error #418`.
  **Cette fois, `vitest run` LUI-MÊME est passé PROPRE au premier coup — 145/145 fichiers,
  1137/1137 tests, AUCUN `ServeurTombe`/R58** — contrairement aux six tentatives de la tranche
  précédente (Fournisseurs), R58 ne s'est PAS manifesté cette fois : cohérent avec l'hypothèse 1
  (pression cumulée variable d'un run à l'autre, jamais garantie de se manifester), pas une
  contradiction. `densite` confirme aussi 0 dépassement DANS la même chaîne (le correctif
  `/loop` tient sur un build frais généré par cette même tentative, pas seulement sur le
  build isolé testé séparément avant ce commit). Clôture et archive ATTEINTES (240 stations
  figées vérifiées), 260 étapes conduites, 388 clics comptés — ONZIÈME confirmation consécutive
  que `#418` est disjoint de tout ce que le Lot 5 a touché jusqu'ici, sur un CINQUIÈME poste
  distinct. Pas creusé plus loin (même discipline que F9-F25). `npm run visuel` cassé par le
  même `#418` sur `clics` (`EXIT=1` casse le `&&` qui le précède) ; relancé séparément.

- **F27 — UN incident dans `verify-provisions-3.log`** (2026-09-15, troisième chaîne verify
  complète pour la tranche Provisions — poste 6, sur l'arbre du commit `4ec8617`, après le
  correctif du signe `d4cd834`, le correctif de l'assertion Lot 3 périmée `7bacd5c`, et la
  septième occurrence R58 journalisée dans `4ec8617` elle-même) : REJOUE F18-F26 au trait près,
  même page `rcm/[cid]` (SOX), `EXCEPTION sur
  /eng/70670df5.../rcm/e1981c59-2a7e-4fc9-aac5-570246ce159a : Minified React error #418`. `EXIT=`
  réel `1` (règle 35, lu sur `bf77d8nea.output`). `vitest run` propre au premier coup — 145/145
  fichiers, 1139/1139 tests, AUCUN `ServeurTombe`/R58 cette fois (contrairement à l'occurrence
  juste avant sur ce même arbre) — cohérent avec l'hypothèse 1 (jamais garanti de se manifester
  à chaque run). `gardes`, `semeur`, `plancher`, `langue`, `langue:epreuve`, `lectures`,
  `lectures:epreuve`, `parcours`, `parcours:epreuve` tous propres ; `screens` (93 routes, 0
  échec) et `fumee` (52 routes, 0 échec) sur le build de PRODUCTION propres ; `densite` sans
  dépassement rapporté. Clôture et archive ATTEINTES (240 stations figées vérifiées, archive
  scellée, empreinte SHA-256 affichée, téléchargement vérifié comme de vrais octets de zip), 260
  étapes conduites, 387 clics comptés — DOUZIÈME confirmation consécutive que `#418` est disjoint
  de tout ce que cette tranche a touché (diff : `circularisations.ts`, `circularisations.test.ts`,
  `programme.ts`, `part1.ts`, `api/sante/route.ts`, `papier.json`, `procedures.json`,
  `catalogue.test.ts`, `programme-vue.test.ts`, aucun rapport avec `rcm/[cid]`), sur un SIXIÈME
  poste distinct. Pas creusé plus loin (même discipline que F9-F26). **Bilan de la chaîne pour
  cette tranche** : un premier passage (`verify-provisions.log`) a trouvé un vrai défaut sans
  rapport avec R58/#418 (assertion Lot 3 périmée, corrigée dans `7bacd5c`) ; un deuxième
  (`verify-provisions-2.log`) a trouvé la septième occurrence R58 (isolée et confirmée PASSE,
  425,29 s) ; ce troisième passage est PROPRE modulo le seul `#418` déjà éprouvé onze fois avant
  lui. `npm run visuel` cassé par le même `#418` sur `clics` (`EXIT=1` casse le `&&` qui le
  précède) ; relancé séparément.

**Nouvelle occurrence R58 (`verify-provisions-2.log`, 2026-09-15, chaîne verify complète #2 pour
la tranche Provisions — poste 6, sur l'arbre du commit `7bacd5c`, après le correctif du signe
`d4cd834` et le correctif de l'assertion Lot 3 périmée `7bacd5c` ; la #1, `verify-provisions.log`
sur `d4cd834`, avait trouvé un VRAI défaut — l'assertion Lot 3 périmée sur
`atelierDeLaNature('confirmation_externe','PROVISIONS',...)`, sans rapport avec R58, corrigé
avant cette tentative)** : `le serveur est tombé après 84 route(s), à « /eng/[id]/requests (SOX)
»` — une SEPTIÈME route différente au total (reunions, risk, travaux, rcm, provenance,
fs-tieout, maintenant requests), toujours cohérent avec l'hypothèse 1 (pression mémoire/CPU
cumulée, jamais une route précise). Le `EXIT=` réel de la tâche de fond était `1` (règle 35 : lu
sur la ligne brute du fichier de sortie, `bbi6n37mb.output` — pas sur le résumé du wrapper, qui
annonçait à tort « exit code 0 »). Reste de la chaîne propre : 144/145 fichiers, 1138/1139 tests
(le total a augmenté d'une unité depuis la tranche Fournisseurs — les deux nouveaux tests
`circularisations.test.ts` de `d4cd834`). Isolé, `npx vitest run tests/screens.test.ts` seul,
sous 900 s : **PASSE, 1/1, 425,29 s** — cohérent avec toutes les mesures précédentes de ce même
test (425-477 s selon les tranches). Diff inchangé depuis l'isolation. Chaîne à relancer.

## 6. `npm run clics` joué avant `npm run densite` contamine la mesure de densité

**Trouvé le 2026-09-16, tranche Stocks (Lot 5, poste 7), après deux incidents non expliqués.**
Deux tentatives consécutives de `npm run verify`/`npm run clics` (isolé, sous `timeout`, avec ET
sans le wrapper `timeout`) sont mortes à l'identique — `  build…` imprimé, puis `Terminated`,
`EXIT=143` réel (règle 35, lu sur la ligne brute des deux tâches de fond, `bqujrp548.output` puis
`bmeh8xmau.output`) — alors qu'un `npm run build` lancé en DEHORS de `clics/run.ts` (même arbre,
même dossier) a terminé PROPREMENT en 57,85 s, `EXIT=0` réel. **Cause NON identifiée** (mémoire et
charge mesurées saines aux deux occurrences, `free -h`/`uptime` : 14 Gi libres, load < 1 ; le
`timeout` lui-même n'a jamais expiré, sans quoi l'un des deux essais aurait rendu `124`, pas
`143` — quelque chose d'EXTÉRIEUR au script et à mon propre `timeout` a envoyé le signal, sans
que sa source soit prouvée). **Pas creusé plus loin** (règle 30 : proportionné à l'enjeu — deux
occurrences d'un incident d'infrastructure non reproduit une troisième fois après un
`db:reset && demo:seed` propre, ci-dessous).

**Un troisième essai, lancé sans `timeout`, a fini par ABOUTIR — mais ROUGE (32 échec(s), 36
stations FIGÉES JAMAIS ATTEINTES, clôture NON atteinte)**, avec un motif reconnaissable : de
nombreuses lectures à « 0 dossier(s), 0 famille(s) » dès le tableau de bord, alors que le dossier
venait d'être confirmé existant à l'étape précédente. **CLAUDE.md §6 le dit déjà** : « sur une
base déjà jouée, des stations rougissent pour rien » — `npm run clics` NE RE-SÈME PAS, et entre
les deux essais précédents (morts à `build…`, donc SANS AVOIR TOUCHÉ la base) un état « déjà joué »
s'était installé par un mécanisme non retracé. Le `docs/CLICS.md` produit par ce troisième essai
(315 clics, stations tardives — réunions et après — toutes à 0) a été rejeté SANS être commité
(`git checkout --`), plutôt que gardé comme preuve douteuse d'un objet qui n'est pas celui dont on
parle (règle 16).

**Corrigé par la forme canonique** : `npm run db:reset && npm run demo:seed`, PUIS `npm run
clics`, sur une base garantie fraîche — propre au premier essai qui a suivi cette discipline
(260 étapes, clôture et archive atteintes).

**Second défaut, plus subtil, trouvé en cherchant à confirmer que le premier était bien réglé** :
`npm run densite`, mesuré APRÈS ce `npm run clics` propre (sur LA MÊME base, sans nouveau
`db:reset`), a rapporté un VRAI dépassement — `/eng/[id]/testing : 6 actions primaires` — absent
du tout premier passage complet de cette tranche (`densite` y avait mesuré 0 dépassement, DANS
L'ORDRE CANONIQUE `...screens && fumee && densite && clics && visuel`, densite AVANT clics). Le
code n'avait pas changé entre les deux mesures : la SEULE différence était que `clics` avait déjà
cliqué à travers le dossier et modifié son état RÉEL (pièces déposées, demandes créées) avant que
`densite` ne mesure `/eng/[id]/testing` — un écran dont le nombre de boutons dépend visiblement de
CE QUI EST DÉJÀ DANS LE DOSSIER (au-delà des onglets de pièces, déjà exemptés par
`data-actions-item`), pas seulement de son propre code. **Reproduit par exécution, pas supposé** :
`db:reset && demo:seed` frais, PUIS `densite` SEUL (build fraîchement reconstruit,
`rm -rf .next && npm run build` avant, pour exclure tout résidu) → **0 dépassement**, chiffres
IDENTIQUES au tout premier passage (126 champs à taper au total) ; PUIS `clics` sur cette même
base fraîche → PROPRE, clôture atteinte, 386 clics, TROIS occurrences `#418` cette fois (routes
`/portal/demo-sophie-altiverre/[rid]`, `/eng/[id]/exceptions`, `/eng/[id]/rcm/[cid]` — la première
fois que ce flake est observé HORS de `rcm/[cid]`, toujours cohérent avec l'hypothèse H : une
course entre navigation côté client et hydratation serveur, générique à toute page, jamais prouvée
spécifique à `rcm`). **Leçon pour toute session future** : `densite` et `clics` NE SONT PAS
indépendants l'un de l'autre malgré leur apparence de deux mesures séparées — l'ORDRE de la chaîne
canonique (`densite` avant `clics`) n'est pas arbitraire, il évite que `clics` (qui écrit
RÉELLEMENT dans la base, contrairement à `screens`/`fumee` qui ne font que lire) ne contamine la
mesure de densité. Isoler `densite` pour le rejouer seul EXIGE de repartir d'une base fraîche,
jamais de la base laissée par un `clics` déjà passé.

**Nouvelle occurrence R58 (`verify-capitaux.log`, 2026-09-16, chaîne verify complète pour la
tranche Capitaux propres et impôt — poste 8, LE DERNIER du Lot 5, sur l'arbre du commit
`9aec3b5`)** : `le serveur est tombé après 70 route(s), à « /eng/[id]/fs-tieout (SOX) »` — une
HUITIÈME route distincte au total sur ce même défaut connu et disjoint (reunions, risk, travaux,
rcm, provenance, fs-tieout [Fournisseurs], requests, maintenant fs-tieout à nouveau [Capitaux] —
même route que la tranche Fournisseurs avait déjà vue, cohérent avec l'hypothèse 1 : pression
mémoire/CPU cumulée, jamais une route précise, et rien n'empêche une même route de revenir).
`EXIT=1` réel cette fois (pas de répétition du `EXIT=143` non expliqué documenté plus haut dans
cette même section). Reste de la chaîne propre : 144/145 fichiers, 1138/1139 tests. Isolé,
`npx vitest run tests/screens.test.ts` seul, sous 900 s : **PASSE, 1/1, 441,41 s** — cohérent
avec toutes les mesures précédentes (425-477 s selon les tranches). Diff inchangé depuis
l'isolation. Chaîne à relancer.

**Nouvelle occurrence R58 (`verify-capitaux-2.log`, 2026-09-16, chaîne verify complète #2 pour la
même tranche, sur l'arbre du commit `8b6cb70` — le seul commit entre-temps ne touche que
`docs/CHASSE.md`)** : `le serveur est tombé après 79 route(s), à « /eng/[id]/processus (SOX) »` —
une NEUVIÈME route distincte au total, toujours cohérent avec l'hypothèse 1. `EXIT=1` réel.
Reste de la chaîne propre : 144/145 fichiers, 1138/1139 tests. Isolé, `npx vitest run
tests/screens.test.ts` seul, sous 900 s : **PASSE, 1/1, 443,18 s** — cohérent avec toutes les
mesures précédentes. Diff inchangé depuis l'isolation. DEUXIÈME confirmation consécutive de
disjonction sur cette seule tranche — chaîne à relancer une troisième fois.

**Nouvelle occurrence R58 (`verify-capitaux-3.log`, 2026-09-16, chaîne verify complète #3 pour la
même tranche, sur l'arbre du commit `434e08c` — le seul commit entre-temps ne touche que
`docs/CHASSE.md`)** : `le serveur est tombé après 70 route(s), à « /eng/[id]/fs-tieout (SOX) »` —
LA MÊME route que la première occurrence de cette tranche (pas une dixième route distincte cette
fois), toujours cohérent avec l'hypothèse 1 (rien n'empêche une route déjà vue de revenir).
`EXIT=1` réel. Reste de la chaîne propre : 144/145 fichiers, 1138/1139 tests. Isolé, `npx vitest
run tests/screens.test.ts` seul, sous 900 s : **PASSE, 1/1, 435,21 s** — cohérent avec toutes les
mesures précédentes. Diff inchangé depuis l'isolation. TROISIÈME confirmation consécutive de
disjonction sur cette seule tranche — chaîne à relancer une quatrième fois.

- **F28 — UN incident dans `verify-capitaux-4.log`** (2026-09-16, quatrième chaîne verify
  complète pour la tranche Capitaux propres et impôt — poste 8, LE DERNIER du Lot 5, sur l'arbre
  du commit `d6defa0`, après trois occurrences R58 consécutives) : REJOUE F18-F27 au trait près,
  même page `rcm/[cid]` (SOX), `EXCEPTION sur
  /eng/70670df5.../rcm/5dea29b8-fe77-481f-bade-7bb99ae56f70 : Minified React error #418`.
  **Numérotation corrigée avant de commiter** (règle 31) : ce bullet aurait dû être F28, pas F29
  — jamais aucun F28 n'a existé ; et le compte « Nième confirmation » qui suit compte les RUNS
  qui ont vu `#418`, pas les routes individuelles — le passage `verify-stocks-3.log` (§6
  ci-dessus, tranche Stocks) avait vu `#418` sur TROIS routes en un seul run mais n'avait jamais
  reçu son propre numéro d'ordre ; compté ici comme UNE SEULE confirmation (la treizième), ce qui
  fait de ce run-ci la QUATORZIÈME, pas la dixième comme écrit dans un premier temps.
  **Cette fois, `vitest run` LUI-MÊME est passé PROPRE au premier coup — 145/145 fichiers,
  1139/1139 tests, AUCUN `ServeurTombe`/R58** — contrairement aux trois tentatives précédentes de
  cette même tranche, cohérent avec l'hypothèse 1 (pression cumulée variable d'un run à l'autre,
  jamais garantie de se manifester). `gardes` à `densite` tous propres, `screens` (93 routes, 0
  échec) et `fumee` (52 routes, 0 échec) sur le build de PRODUCTION propres. Clôture et archive
  ATTEINTES (240 stations figées vérifiées, archive scellée, empreinte SHA-256 affichée,
  téléchargement vérifié), 260 étapes conduites, 385 clics comptés — QUATORZIÈME confirmation
  consécutive que `#418` est disjoint de tout ce que le Lot 5 a touché, sur un HUITIÈME ET
  DERNIER poste distinct. Pas creusé plus loin (même discipline que F9-F27). `npm run visuel`
  cassé par le même `#418` sur `clics` (`EXIT=1` casse le `&&` qui le précède) ; relancé
  séparément.

- **F29 — UN incident dans `clics-ana04.log`** (2026-09-16, Lot 6, tranche ANA-04 — la revue
  analytique périmée bloque le visa, sur l'arbre du commit `6867856`), `EXIT=1` réel, DEUX
  routes cette fois : `EXCEPTION sur /eng/e7a83891-.../risk : Minified React error #418`
  (**ROUTE NOUVELLE, jamais vue avant dans cet historique** — vérifié par relecture de F1-F28,
  les routes connues restent `rcm/[cid]` de très loin la plus fréquente, `testing`,
  `workpapers/[id]`, `exceptions`, `portal/demo-sophie-altiverre/[rid]`, toujours cohérent avec
  l'hypothèse H : une navigation cliente commencée avant la fin de l'hydratation du document
  précédent, jamais spécifique à une page) et `EXCEPTION sur
  /eng/70670df5.../rcm/941cc93e-283d-4e1a-a9f1-c5ac14849d96 : Minified React error #418` (la
  route habituelle). **Disjoint de la tranche ANA-04** : ni `/risk` ni `/rcm/[cid]` ne touchent
  `obstacles.ts`/`analytique.ts`, et les SEPT tests neufs de la tranche (deux fichiers,
  `obstacles-analytique.test.ts` + `ana04-lecture.test.ts`) passent tous, isolés et dans la
  chaîne `vitest run` complète (145/145 fichiers, aucun `ServeurTombe`/R58 cette fois). Clôture
  et archive ATTEINTES (240 stations figées vérifiées, empreinte SHA-256 affichée, téléchargement
  vérifié), 260 étapes conduites, 385 clics comptés — QUINZIÈME confirmation consécutive que
  `#418` est disjoint de tout ce que ce dépôt touche, sur une DEUXIÈME route jamais vue. Pas
  creusé plus loin (même discipline que F9-F28). **Observation annexe, non un défaut de cette
  tranche** : cette exécution a pris nettement plus longtemps que la fourchette habituelle
  (150-260 s mesurées ailleurs dans ce dépôt) — la phase `build…` de `next-server` a occupé
  plusieurs minutes avant que le premier clic ne parte, avec un temps CPU qui progressait mais
  lentement (croissance mesurée par `ps`, jamais un hang total comme l'incident EXIT=143 de la
  tranche Stocks, §6) ; le run a fini par ABOUTIR proprement (`EXIT=1`, seulement `#418`), donc
  ce n'est pas la même famille d'incident que §6 — juste plus lent cette fois, cause non
  investiguée (règle 30, une exécution qui aboutit n'appelle pas la même urgence qu'une qui
  meurt).

- **F30 — UN incident** (2026-09-16, Lot 6, tranche 3 — NEP 240, épine dorsale, sur l'arbre du
  commit `88ff8e0`), `EXIT=1` réel lu dans le journal brut (`set -o pipefail && timeout 3600 npm
  run verify … ; echo "EXIT=$?"`, jamais dans le résumé du wrapper de tâche de fond — celui-ci
  annonçait « exit code 0 », le vrai `EXIT=1` n'apparaissait que dans la sortie brute du shell,
  pas dans le fichier `tee`), UNE SEULE route cette fois — `/eng/70670df5-.../rcm/0e349e73-...` (la
  route habituelle, `rcm/[cid]`, de très loin la plus fréquente de cet historique). Disjoint de la
  tranche : aucun des fichiers touchés (`kernel/flags.ts`, `kernel/types.ts`, `population.ts`,
  `sampling-je.ts`, `programme.ts::atelierDeLaNature`, `route.ts`) ne touche `/rcm`, et les 1154
  tests vitest de la suite complète passent tous, `#418` mis à part. Clôture et archive ATTEINTES
  (240 stations figées vérifiées, empreinte SHA-256 affichée, téléchargement vérifié), 260 étapes
  conduites, 385 clics comptés — SEIZIÈME confirmation consécutive que `#418` est disjoint de tout
  ce que ce dépôt touche. Pas creusé plus loin (même discipline que F9-F29). `npm run visuel`
  cassé par le même `#418` sur `clics` ; relancé séparément, propre (336 vues, 0 défaut).

- **F31 — UN incident** (2026-09-16, Lot 7, tranche 1 — le portail « ce que vous me devez encore »,
  sur l'arbre CORRIGÉ du commit `eb5c5b3`, après un défaut RÉEL de cette tranche trouvé et corrigé
  le même jour — voir STATUS.md, « Lot 7, tranche 1 » : un défaut sans rapport avec `#418`,
  qui rendait `clics` rouge de façon DÉTERMINISTE avec 6 échecs et 1294 clics, résolu avant cette
  mesure). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../
  rcm/923aa3e8-...` (l'habituelle, `rcm/[cid]`). Disjoint de la tranche : `portal.ts`, la page du
  portail, `catalogue.ts` et la nouvelle lecture `/api/sante` ne touchent pas `/rcm`, et les
  1158 tests vitest passent tous. Clôture et archive ATTEINTES (240 stations figées vérifiées),
  260 étapes conduites, 385 clics comptés — DIX-SEPTIÈME confirmation consécutive que `#418` est
  disjoint. Pas creusé plus loin (même discipline que F9-F30). `npm run visuel` relancé
  séparément (le `&&` casse sur l'échec de `clics`), propre (336 vues, 0 défaut).

- **F32 — UN incident** (2026-09-16, Lot 7, tranche 2 — H-1 slice 2, obstaclesDemandes, sur l'arbre
  CORRIGÉ du commit `6d6bb39`, après un défaut RÉEL trouvé par la revue hostile voix 2 et corrigé
  le même jour — voir STATUS.md, « Lot 7, tranche 2 » : sans le correctif, R-008 restait
  `partially_submitted` EN PERMANENCE après le warp de 25 jours de `demo-seed.ts`, et la famille
  neuve bloquait le visa SANS RECOURS ; résolu avant cette mesure). `EXIT=1` réel (journal brut,
  `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/c90cc298-...` (l'habituelle,
  `rcm/[cid]`). Disjoint de la tranche : `obstacles.ts::obstaclesDemandes`, `familles.ts`,
  `catalogue.ts`, la nouvelle lecture `/api/sante` et `part1.ts::clientDeposits` ne touchent pas
  `/rcm`, et les 1165 tests vitest passent tous. Clôture et archive ATTEINTES (« le dossier se CLÔT
  et l'archive est scellée », 240 stations figées vérifiées), 260 étapes conduites, 385 clics
  comptés — DIX-HUITIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus loin
  (même discipline que F9-F31). `npm run visuel` relancé séparément (le `&&` casse sur l'échec de
  `clics`), propre (336 vues, 0 défaut).

- **F33 — UN incident** (2026-09-16, Lot 7, H-2 slice 1 — « constat vs point d'action client »,
  sur l'arbre CORRIGÉ du commit `94eb4e6`, après deux constats non bloquants trouvés par la revue
  hostile et corrigés le même jour — voir STATUS.md, « Lot 7, H-2 slice 1 »). `EXIT=1` réel
  (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/13b527a1-...`
  (l'habituelle, `rcm/[cid]`). Disjoint de la tranche : `matching.ts::constatEtPointAction`,
  `exceptions/page.tsx`, la nouvelle lecture `/api/sante` et `catalogue.ts` ne touchent pas `/rcm`,
  et les 1171 tests vitest passent tous. Clôture et archive ATTEINTES (« le dossier se CLÔT et
  l'archive est scellée », 240 stations figées vérifiées), 260 étapes conduites, 385 clics comptés
  — DIX-NEUVIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus loin (même
  discipline que F9-F32). `npm run visuel` relancé séparément (le `&&` casse sur l'échec de
  `clics`), propre (336 vues, 0 défaut).

- **F34 — UN incident** (2026-09-16, Lot 7, H-2 slice 2 — propriétaire/échéance sur le point
  d'action client, sur l'arbre CORRIGÉ du commit `efd8ca1`/`2678d61`, après quatre constats non
  bloquants trouvés par DEUX réfutateurs indépendants — règle 30, modèle de données touché — et
  corrigés le même jour, voir STATUS.md, « Lot 7, H-2 slice 2 »). `EXIT=1` réel (journal brut,
  `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/be32ba00-...` (l'habituelle,
  `rcm/[cid]`). Disjoint de la tranche : les migrations 0166/0167, `matching.ts::assignerProprietaire
  PointAction`, `exceptions/page.tsx`, la nouvelle lecture `/api/sante` et `scenario.ts` ne touchent
  pas `/rcm`, et les 1177 tests vitest passent tous. Les trois assertions de la nouvelle station
  clics (« au moins un contact… », « assigner ne bloque pas… », « le propriétaire assigné
  apparaît… ») passent toutes. Clôture et archive ATTEINTES (« le dossier se CLÔT et l'archive
  est scellée », 240 stations figées vérifiées), 263 étapes conduites, 386 clics comptés — VINGTIÈME
  confirmation consécutive que `#418` est disjoint. Pas creusé plus loin (même discipline que
  F9-F33). `npm run visuel` relancé séparément (le `&&` casse sur l'échec de `clics`), propre
  (336 vues, 0 défaut).

- **F35 — UN incident** (2026-09-16, Lot 7, H-2 slice 3 — la relance propre au point d'action
  client, sur l'arbre CORRIGÉ du commit `a085b76` — un constat bloquant trouvé par la revue
  hostile voix 1 corrigé le jour même (`9b78787`, disclosure du transport simulé), et R106
  enregistré, disclosed plutôt que corrigé (`a085b76` — voir STATUS.md, « Lot 7, H-2 slice 3 »).
  `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/
  aed1d05c-...` (l'habituelle, `rcm/[cid]`). Disjoint de la tranche : la migration 0168,
  `matching.ts::relancerPointAction`, `exceptions/page.tsx`, la nouvelle lecture `/api/sante` et
  `scenario.ts` ne touchent pas `/rcm`, et les 1182 tests vitest passent tous. La station
  « relancer » retombe honnêtement sur « rien à relancer » (R106 : ce monde de démo ne laisse
  jamais d'écart open à ce point du parcours), ne bloque pas la clôture. Clôture et archive
  ATTEINTES (« le dossier se CLÔT et l'archive est scellée », 240 stations figées vérifiées), 262
  étapes conduites, 385 clics comptés — VINGT-ET-UNIÈME confirmation consécutive que `#418` est
  disjoint. Pas creusé plus loin (même discipline que F9-F34). `npm run visuel` relancé séparément
  (le `&&` casse sur l'échec de `clics`), propre (336 vues, 0 défaut).

- **F36 — UN incident, sur l'arbre CORRIGÉ** (2026-09-16, Lot 7, H-3 slice 1 — le test exhaustif
  du grand livre, commit `980b593` — DEUX défauts réels trouvés par le `vitest` COMPLET lui-même,
  pas par la revue hostile : `rail.test.ts` (l'écran neuf n'était atteignable par aucun chemin de
  lecture déclaré) et une collision de clé React dans `tests/screens.test.ts` (deux lignes de la
  même écriture partageant le même flag rendaient la même clé `regle-entryNo-entryDate`) — les
  deux corrigés le jour même, voir STATUS.md « Lot 7, H-3 slice 1 »). **Mesure INTERMÉDIAIRE, AVANT
  ce correctif** (commit `99cb667`, non retenue comme confirmation) : DEUX occurrences de `#418`
  cette fois — l'une sur `/eng/.../suivi` (une route jamais vue auparavant), l'autre sur l'habituel
  `/rcm/[cid]`. Diagnostiqué, pas supposé (règle 18) : les DEUX incidents portent la MÊME signature
  EXACTE en première divergence (le tooltip client-only `rail-astuce`/« Collapse the rail », déjà
  catalogué F9+, apparu « avant la première station » — donc au chargement initial, avant tout
  geste scripté) ; disjoint des fichiers de cette tranche (`grand-livre.ts`/`page.tsx` ne touchent
  ni `/suivi` ni `/rcm`). **Mesure FINALE, sur l'arbre corrigé** (commit `980b593`) : `EXIT=1`
  réel (journal brut, `set -o pipefail`), retour à UNE SEULE occurrence — `/eng/70670df5-.../rcm/
  332ea850-...` (l'habituelle) — confirmant que le doublement de la mesure intermédiaire était du
  bruit de chronologie (hypothèse H, §1), pas une régression de cette tranche. 158/158 fichiers
  vitest (1189/1189 tests) passent tous. La station « grand livre » (les quatre assertions)
  passe. Clôture et archive ATTEINTES (240 stations figées vérifiées), 266 étapes conduites, 386
  clics comptés — VINGT-DEUXIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus
  loin (même discipline que F9-F35). `npm run visuel` relancé séparément (le `&&` casse sur
  l'échec de `clics`), propre (344 vues, 0 défaut).

- **F37 — UN incident** (2026-09-16, Lot 7, H-3 slice 2 — la règle « hors exercice » sur le grand
  livre, sur l'arbre CORRIGÉ du commit `d0d4218` — un seul constat non bloquant, purement
  cosmétique, trouvé par la revue hostile (un commentaire disant encore « six » clés au lieu de
  « sept »), corrigé le jour même. Voir STATUS.md, « Lot 7, H-3 slice 2 »). `EXIT=1` réel (journal
  brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/f6426ffc-...` (l'habituelle,
  `rcm/[cid]`). Disjoint de la tranche : `kernel/flags.ts`, `imports.ts`, `grand-livre.ts`,
  `exceptions/page.tsx` (inchangé), la nouvelle lecture `/api/sante` et `scenario.ts` ne touchent
  pas `/rcm`, et les 1193 tests vitest passent tous — dont les nouveaux cas connus bon/mauvais de
  `hors_periode` (kernel.test.ts) et la lecture sante dédiée. La station « grand livre » confirme
  les SEPT règles (au lieu de six). Clôture et archive ATTEINTES (240 stations figées vérifiées),
  266 étapes conduites, 386 clics comptés — VINGT-TROISIÈME confirmation consécutive que `#418`
  est disjoint. Pas creusé plus loin (même discipline que F9-F36). `npm run visuel` relancé
  séparément (le `&&` casse sur l'échec de `clics`), propre (344 vues, 0 défaut).

- **F38 — UN incident** (2026-09-16, Lot 7, H-4 tranche 1 — le périmètre d'audience « comité »,
  sur l'arbre du commit `3325b29` — revue hostile SHIP AS-IS, zéro constat corrigé, la thèse même
  de la lecture `/api/sante` volontairement informative vérifiée EMPIRIQUEMENT par le réfutateur
  (défaut injecté dans `jalonProchain`, confirmé rougir `gouvernance.test.ts`, confirmé rester vert
  côté `/api/sante` — exactement ce que le commentaire de `route.ts` affirmait). `EXIT=1` réel
  (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/028533a0-...`
  (l'habituelle, `rcm/[cid]`). Disjoint de la tranche : `gouvernance.ts`, `comite/page.tsx`,
  `dashboard/page.tsx` (un lien ajouté), la nouvelle lecture `/api/sante` et `scenario.ts` ne
  touchent pas `/rcm`, et les 1201 tests vitest passent tous — dont les 7 nouveaux cas connus
  bon/mauvais de `gouvernance.test.ts` (dont le cas connu mauvais sur `jalonProchain`) et la
  lecture sante dédiée. La station « comité » confirme le compte papiers signés/total et un badge
  de statut. Clôture et archive ATTEINTES (240 stations figées vérifiées), 270 étapes conduites,
  387 clics comptés — VINGT-QUATRIÈME confirmation consécutive que `#418` est disjoint. Pas creusé
  plus loin (même discipline que F9-F37). `npm run visuel` relancé séparément (le `&&` casse sur
  l'échec de `clics`), propre (352 vues, 0 défaut).

- **F39 — UN incident, sur l'arbre CORRIGÉ** (2026-09-17, Lot 7, H-5 tranche 1 — le vrai geste
  d'upload RCM, sur l'arbre du commit `0f5892b`, APRÈS le correctif de trois constats BLOQUANTS
  trouvés par DEUX réfutateurs indépendants — transaction manquante sur `importRcm` (control
  orphelin permanent possible), la lecture `/api/sante` qui aurait rougi en production sur toute
  RCM legacy (aucune colonne `created_at` sur `rcm_row` pour distinguer un legacy honnête d'une
  vraie corruption), et R107 qui affirmait à tort le geste jamais cliqué — vérifié FAUX pour le
  monde local canonique par une requête SQL directe après `db:reset && demo:seed` (`engNep : 0
  contrôle`), puis corrigé en étendant la station clics existante « R60 » pour uploader RÉELLEMENT
  `dataset/sox/rcm.csv` via le vrai formulaire). `EXIT=1` réel (journal brut, `set -o pipefail`),
  UNE SEULE route — `/eng/70670df5-.../rcm/4075b3c6-...` (l'habituelle, `rcm/[cid]` — même
  signature exacte, le tooltip `rail-astuce` au jeton 87, « avant la première station »). Disjoint
  de la tranche : `rcm/[cid]/page.tsx` n'a reçu AUCUNE modification (seuls `rcm/page.tsx`,
  `rcm/actions.ts`, `sox.ts::importRcm`, la lecture `/api/sante` et la station R60 ont bougé), et
  les 1207 tests vitest passent tous — dont les 3 nouveaux cas connus bon/mauvais de
  `h5-tranche1-rcm-provenance-lecture.test.ts` et le cas connu mauvais de la transaction annulée
  dans `s8.test.ts`. La station « rcm : l'upload réel du listing client » PASSE : le formulaire
  d'upload est offert (aucun contrôle sur engNep à ce point du parcours canonique), le fichier est
  envoyé, des contrôles apparaissent — le geste central de la tranche est enfin conduit dans un
  navigateur (règle 10), R107 levé (voir BACKLOG_REPORTE.md). Clôture et archive ATTEINTES
  (240 stations figées vérifiées), 271 étapes conduites, 388 clics comptés — VINGT-CINQUIÈME
  confirmation consécutive que `#418` est disjoint. Pas creusé plus loin (même discipline que
  F9-F38). `npm run visuel` relancé séparément (le `&&` casse sur l'échec de `clics`), propre
  (352 vues, 0 défaut).

- **F40 — UN incident, sur l'arbre CORRIGÉ** (2026-09-17, Lot 7, H-6 tranche 1 — l'échelle
  typographique (`--t1..--t6`), sur l'arbre du commit `6c91ec0`, APRÈS le correctif d'un seul
  constat non bloquant trouvé par UN réfutateur — `SHIP WITH MINOR FIXES`, un trou de
  documentation sur la cascade-mort de la règle `h1` de base, commenté en toutes lettres, aucun
  défaut fonctionnel). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route —
  `/eng/70670df5-.../rcm/0b4e6753-...` (l'habituelle, `rcm/[cid]` — même signature exacte, le
  tooltip `rail-astuce` au jeton 87, « avant la première station »). Disjoint de la tranche :
  cette tranche ne touche QUE `app/src/app/globals.css` (des jetons CSS, aucun composant React
  RCM) et `app/src/app/globals.css.test.ts` (un test qui ne s'exécute jamais dans un navigateur) —
  et les 1209 tests vitest passent tous, dont les 2 nouveaux tests du garde typographique, l'un
  prouvé contre un cas connu mauvais par injection réelle dans le vrai fichier (règle 17). `npm
  run visuel` relancé séparément (le `&&` casse sur l'échec de `clics`) DEUX fois — avant et après
  le correctif de revue hostile — propre les deux fois (352 vues, 0 défaut), confirmant qu'une
  migration de jetons CSS pure ne modifie aucun rendu mesurable. Clôture et archive ATTEINTES (240
  stations figées vérifiées), 271 étapes conduites, 388 clics comptés — VINGT-SIXIÈME confirmation
  consécutive que `#418` est disjoint. Pas creusé plus loin (même discipline que F9-F39).

- **F41 — UN incident, sur l'arbre CORRIGÉ** (2026-09-17, Lot 7, priorité 1 (R98) — l'atelier
  « détail du compte » pour PAYROLL, sur l'arbre du commit `c97228c`, APRÈS le correctif d'un seul
  constat réel trouvé par le PREMIER passage `npm run verify` lui-même, pas par le réfutateur : le
  garde de couverture (`rail.test.ts`) a rougi POUR DE VRAI — le nouvel écran `/eng/[id]/poste/
  [code]/detail-compte` n'était déclaré nulle part (ni rail, ni `destinationsDuPoste`, ni
  `AILLEURS`) ; corrigé en l'ajoutant à `AILLEURS` avec sa raison (même précédent que `/grand-livre`
  et `/comite`). Un réfutateur (règle 30 : ni modèle de données, ni sécurité, ni refus neuf) :
  `SHIP AS-IS`, aucun défaut réel trouvé — `account-detail.ts` vérifié générique par `fsliCode` par
  lecture complète (260 lignes) et par lecture de `fsliAccounts`, étanchéité multi-cabinet tenue
  (`assertMembreDe` ancré sur l'objet, jamais un champ de formulaire), aucun plantage sur un
  `fsli_code` arbitraire. Le SECOND échec du premier passage (`screens.test.ts`, « le serveur est
  tombé ») était un artefact de CONCURRENCE, pas une régression — le réfutateur avait un vitest en
  cours au même moment (CLAUDE.md §7 : deux vitest en parallèle font tomber le serveur du
  balayage) ; reproduit : relancé seul, sans aucun autre processus, `screens.test.ts` passe
  proprement (`EXIT=0`, 472 s). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route —
  `/eng/70670df5-.../rcm/bc2f2c47-...` (l'habituelle, `rcm/[cid]` — même signature exacte, le
  tooltip `rail-astuce` au jeton 87, « avant la première station »). Disjoint de la tranche : cette
  tranche touche `programme.ts::atelierDeLaNature` (un nouveau `if` littéral gardé par nature ET
  fsliCode), une route neuve sous `/poste/[code]/detail-compte`, et `scenario.ts` (une station
  neuve pour PAYROLL) — rien qui touche `/rcm`. Les 1209 tests vitest passent tous (aucun test
  neuf : la logique réutilisée était déjà couverte). La station « détail du compte PAYROLL » PASSE
  intégralement : demander → importer → refus POP-02 sans explication → conclure expliqué — les
  DEUX boutons sont exercés (contrairement à REVENUE, le monde PAYROLL ne porte aucune demande/
  import préexistant). Clôture et archive ATTEINTES (240 stations figées vérifiées), 276 étapes
  conduites, 393 clics comptés — VINGT-SEPTIÈME confirmation consécutive que `#418` est disjoint.
  Pas creusé plus loin (même discipline que F9-F40). `npm run visuel` relancé séparément (le `&&`
  casse sur l'échec de `clics`), propre (356 vues, 0 défaut — 89 écrans, +1 vs la tranche
  précédente, exactement le nouvel écran).

- **F42 — UN incident** (2026-09-17, Lot 7, priorité 1 (R99) — l'atelier « détail du compte » pour
  INVENTORY, sur l'arbre du commit `2bdc402`, réutilisant le MÊME écran que PAYROLL (R98) pour une
  seconde nature — un réfutateur : SHIP WITH MINOR FIXES, un seul constat cosmétique corrigé
  (le texte descriptif de `AILLEURS` dans `rail.test.ts` ne citait que R98/rapprochement, pas
  R99/observation_documentee, qui route désormais aussi vers cette route — jamais comparé par le
  test, corrigé pour rester honnête). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE
  route — `/eng/70670df5-.../rcm/02bc3a46-...` (l'habituelle, `rcm/[cid]` — même signature exacte,
  le tooltip `rail-astuce` au jeton 87, « avant la première station »). Disjoint de la tranche :
  cette tranche touche `programme.ts::atelierDeLaNature` (un nouveau cas `observation_documentee`+
  INVENTORY), `poste.ts` (`atelierObservationSeul` ajouté à côté d'`atelierRapprochementSeul` —
  trouvé nécessaire PAR EXÉCUTION, `atelierDeLaNature` seul ne suffisait pas), et `scenario.ts`
  (une station neuve pour INVENTORY) — rien qui touche `/rcm`. Les 1209 tests vitest passent tous
  (aucun test neuf : la logique réutilisée était déjà couverte par R98). La station « détail du
  compte INVENTORY » PASSE intégralement : demander → importer → refus POP-02 → conclure expliqué
  — les DEUX boutons exercés (monde INVENTORY sans demande/import préexistant, comme PAYROLL).
  R109 (BACKLOG_REPORTE.md, fils.json) disclosed : cet atelier ne fait qu'UNE réconciliation de
  TOTAL, pas le test bidirectionnel ligne à ligne que `methodology/procedures.json` exige pour
  STOCKS-INV (« deux sens obligatoires », vérifié par le réfutateur en lisant directement la
  ligne du fichier) — un premier geste réel, pas le geste complet que la méthode décrit. Clôture
  et archive ATTEINTES (240 stations figées vérifiées), 281 étapes conduites, 398 clics comptés —
  VINGT-HUITIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus loin (même
  discipline que F9-F41). `npm run visuel` relancé séparément, propre (356 vues, 0 défaut —
  89 écrans, inchangé vs R98 : même route, pas une nouvelle).

- **F43 — UN incident** (2026-09-17, Lot 7, priorité 1 (R100) — l'atelier « détail du compte » pour
  EQUITY, sur l'arbre du commit `95f2c7e`, réutilisant le MÊME écran que PAYROLL (R98)/INVENTORY
  (R99) pour une troisième nature/poste — un réfutateur : un constat RÉEL trouvé et corrigé
  (l'entrée R100 pré-existante, écrite le 2026-09-16 dans la tranche Lot 5 précédente, affirmait
  encore « NI CAPITAUX-VAR NI CAPITAUX-PV N'A D'ATELIER » — contredisant R110 (écrite par cette
  tranche) dans le MÊME fichier une fois CAPITAUX-VAR câblée ; corrigé par un paragraphe
  d'amendement ajouté APRÈS le texte d'origine dans `BACKLOG_REPORTE.md`, jamais réécrit en place,
  et `fils.json` mis à jour). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route —
  `/eng/70670df5-.../rcm/e220be0b-...` (l'habituelle, `rcm/[cid]` — même signature exacte, le
  tooltip `rail-astuce` au jeton 87). Disjoint de la tranche : cette tranche touche
  `programme.ts::atelierDeLaNature` (un nouveau cas `rapprochement`+EQUITY) et `scenario.ts` (une
  station neuve pour EQUITY) — rien qui touche `/rcm`, et `poste.ts` n'a REÇU AUCUN changement
  cette fois (contrairement à R99), vérifié par exécution : `atelierRapprochementSeul` était déjà
  générique par `fsliCode`. Les 1209 tests vitest passent tous (aucun test neuf : la logique
  réutilisée était déjà couverte par R98/R99). La station « détail du compte EQUITY » PASSE
  intégralement (les cinq assertions : bouton demander → lien → import → refus POP-02 → conclu).
  Clôture et archive ATTEINTES (verify complet), 286 étapes conduites, 403 clics comptés sur 63
  gestes — VINGT-NEUVIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus loin
  (même discipline que F9-F42). `npm run visuel` relancé séparément, propre (356 vues, 0 défaut —
  89 écrans, inchangé vs R98/R99 : même route, pas une nouvelle).

- **F44 — UN incident** (2026-09-17/18, Lot 7, H-6 tranche 2 — unifier `.kpi .v` et
  `.epure-chiffre` sur `--t7`, sur l'arbre du commit `5b508e3`, après SIX commits dans cette
  tranche dont trois correctifs — deux réfutateurs (règle 30, l'un sur l'implémentation initiale,
  l'un sur l'état final après les trois rounds A/B). Le PREMIER a trouvé un vrai défaut
  (`population/page.tsx`, « 5 648 676,30 » sur une ligne, « € » seul sur la suivante, capture
  d'écran) ; la CORRECTION de ce défaut, changeant `fmtEur` PARTOUT, en a introduit un SECOND, réel
  lui aussi (`/eng/[id]/testing`, `table.data.cellules`, débordement horizontal à 1280px) — trouvé
  non pas par une revue hostile mais par `npm run visuel` lui-même, sur l'arbre du PREMIER
  correctif. Deux tentatives de correctif CSS structurel (table-scroll, min-width:0) n'ont RIEN
  changé à la mesure (chiffres identiques au pixel près) — un A/B direct (même arbre, seul
  `fmtEur` changé) a isolé la vraie cause, et un TROISIÈME A/B a trouvé que `/eng/[id]/testing`
  reste marginal à 1280px même pour ses propres cartes `.kpi`. Le SECOND réfutateur (sur l'état
  final) a trouvé un seul constat réel non bloquant — `testing/page.tsx` ne portait aucun
  marqueur pointant vers le raisonnement de `canon.ts` — corrigé par un commentaire in situ.
  `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../
  rcm/aef66cb9-...` (l'habituelle, `rcm/[cid]`, tooltip `rail-astuce` au jeton 87). Disjoint de la
  tranche : cette tranche touche `globals.css`, `canon.ts`, quatre `page.tsx` — rien qui touche
  `/rcm`. Les 1210 tests vitest passent tous (+1 vs R100 : la nouvelle assertion `.kpi .v`/
  `.epure-chiffre`). Clôture et archive ATTEINTES (verify complet), 286 étapes conduites, 403
  clics comptés sur 63 gestes (inchangé — cette tranche ne touche pas `scenario.ts`) —
  TRENTIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus loin (même
  discipline que F9-F43). `npm run visuel` relancé séparément, propre (356 vues, 0 défaut).

- **F45 — UN incident** (2026-09-18, Lot 7, H-6 tranche 3 — jeton `--t0` (11px), unifier
  `.faint` + `fontSize` en dur, sur l'arbre du commit `b454b3c` — un réfutateur (règle 30,
  tranche CSS pure, ni données/sécurité/multi-tenant/refus). Le réfutateur a vérifié EN
  EXÉCUTANT (pas seulement lu) : les 4/4 tests du nouveau garde passent, le détecteur
  `compterFaintFontSizeEnDur` ré-exécuté indépendamment retourne exactement 4 (les quatre
  exclusions documentées), `--t1` vaut bien 12px et n'est jamais redéfini, la cascade
  `.mono`/`.faint` sur les 4 sites qui portent les deux classes confirme que `.faint` gagne
  (ordre dans la feuille : `.mono` ligne 149, `.faint` ligne 384) donc les 6 suppressions de
  style inline étaient bien redondantes, `tsc --noEmit` propre, aucun fichier sonde résiduel.
  Un seul constat MINEUR, jugé seul (documentation) : le garde ne couvre pas l'ordre inverse
  `style={{}} className="faint"` (zéro site actuel dans cet ordre, vérifié) — angle mort
  documenté, non bloquant. `EXIT=1` réel (journal brut, `set -o pipefail`), UNE SEULE route —
  `/eng/70670df5-.../rcm/88f6d3dc-...` (l'habituelle, `rcm/[cid]`, tooltip `rail-astuce` au
  jeton 87). Disjoint de la tranche : cette tranche touche `globals.css`, `globals.css.test.ts`
  et huit `page.tsx` sous `eng/[id]/` (aucun n'est `rcm/[cid]`) — rien qui touche `/rcm`. Les
  1211 tests vitest passent tous (+1 vs H-6 tranche 2 : le nouveau garde `.faint`/`fontSize`).
  Clôture et archive ATTEINTES (verify complet), 286 étapes conduites, 403 clics comptés sur 63
  gestes (inchangé — cette tranche ne touche pas `scenario.ts`) — TRENTE ET UNIÈME confirmation
  consécutive que `#418` est disjoint. Pas creusé plus loin (même discipline que F9-F44).
  `npm run visuel` relancé séparément (avant le commit, sur le même arbre de fichiers), propre
  (356 vues, 0 défaut).

- **F46 — UN incident** (2026-09-18, Lot 7, H-6 tranche 4 — jeton `--e1` (4px), unifier `gap: 4`
  en dur, sur l'arbre du commit `ca60206` — un réfutateur (règle 30, tranche CSS pure). Un
  PREMIER passage de `npm run verify` a trouvé un VRAI défaut, hors du périmètre de cette
  tranche : `scripts/reprise.test.ts` (« le gabarit se remplit ») a rougi sur un `{{` littéral
  dans `docs/instantanes/servi.json::mesure.par` — le texte de confirmation SHA servi de H-6
  tranche 3 citait du JSX en prose (`style={{ fontSize: N }}`), et `scripts/reprise.ts` embarque
  ce champ tel quel dans `docs/REPRISE.md` (ligne 263), où le garde le lit comme un gabarit non
  rempli. Pas trouvé par le garde AU MOMENT de la tranche 3 (son propre `npm run verify` était
  déjà vert) : le `{{` a été introduit par le commit de confirmation SHA servi APRÈS ce
  verify-là — le prochain passage complet (celui-ci) l'a vu, exactement comme conçu (règle 30 :
  verify complet seulement à l'expédition). Corrigé par une reformulation sans le double-accolade
  littéral (aucun changement de sens), commit dédié `ca60206`, revérifié isolément
  (`scripts/reprise.test.ts` 24/24) avant de relancer le verify complet. `EXIT=1` réel (journal
  brut, `set -o pipefail`) sur ce second passage, UNE SEULE route — `/eng/70670df5-.../
  rcm/8e5fbf20-...` (l'habituelle, `rcm/[cid]`, tooltip `rail-astuce` au jeton 87, la valeur
  `gap:var(--e1)` visible dans le bruit d'hydratation confirme juste que le jeton est bien rendu,
  sans rapport avec le défaut). Disjoint de la tranche : cette tranche touche `globals.css` et 18
  `page.tsx`/`.tsx` sous `eng/[id]/` (aucun n'est `rcm/[cid]`) — rien qui touche `/rcm`. Les 1212
  tests vitest passent tous (+1 vs H-6 tranche 3 : le nouveau garde `gap: 4`). Clôture et archive
  ATTEINTES (verify complet), 286 étapes conduites, 403 clics comptés sur 63 gestes (inchangé —
  cette tranche ne touche pas `scenario.ts`) — TRENTE-DEUXIÈME confirmation consécutive que
  `#418` est disjoint. Pas creusé plus loin (même discipline que F9-F45). `npm run visuel`
  relancé séparément (avant le commit, sur le même arbre de fichiers), propre (356 vues, 0
  défaut).

- **F47 — UN incident** (2026-09-18, Lot 7, H-6 tranche 5 — jeton `--e2` (8px), unifier `gap: 8`
  en dur, sur l'arbre du commit `780b301` — un réfutateur (règle 30, tranche CSS pure, suite
  mécanique de la tranche 4). Aucun défaut hors périmètre cette fois (contrairement à la tranche
  4) : le réfutateur a vérifié EN EXÉCUTANT (pas seulement lu) les 14 sites `var(--e2)` un à un
  (syntaxe correcte, tous dans un `style={{}}` React), le compte exact au nombre annoncé, `gap: 8`
  en dur totalement absent, `gap: 4` (tranche 4) non régressé, `tsc` propre, 6/6 tests du garde
  passent, aucun fichier sonde résiduel (tranches 4 et 5 toutes deux vérifiées absentes). `EXIT=1`
  réel (journal brut, `set -o pipefail`), UNE SEULE route — `/eng/70670df5-.../rcm/0970722e-...`
  (l'habituelle, `rcm/[cid]`, tooltip `rail-astuce` au jeton 87). Disjoint de la tranche : cette
  tranche touche `globals.css` et 9 fichiers `.tsx` (dont trois hors `eng/[id]/` : `page.tsx`,
  `nouvelle-mission.tsx`, `methodology/import-form.tsx`) — aucun n'est `rcm/[cid]`. Les 1213 tests
  vitest passent tous (+1 vs H-6 tranche 4 : le nouveau garde `gap: 8`). Clôture et archive
  ATTEINTES (verify complet), 286 étapes conduites, 403 clics comptés sur 63 gestes (inchangé —
  cette tranche ne touche pas `scenario.ts`) — TRENTE-TROISIÈME confirmation consécutive que
  `#418` est disjoint. Pas creusé plus loin (même discipline que F9-F46). `npm run visuel`
  relancé séparément (avant le commit, sur le même arbre de fichiers), propre (356 vues, 0
  défaut).

- **F48 — UN incident** (2026-09-18, Lot 7, H-6 tranche 6 — jeton `--e1`, unifier `marginTop: 4`
  en dur, sur l'arbre du commit `56fda5e` — un réfutateur (règle 30, tranche CSS pure, premier
  pas dans le cluster `margin*`/`padding*` identifié par la tranche 3). Le réfutateur a examiné
  spécifiquement un risque que les tranches `gap` n'avaient pas : `marginTop` étant une
  sous-propriété d'un raccourci CSS potentiel (`margin`), un objet `style={{}}` portant les deux
  clés aurait un ordre de cascade dépendant de l'ORDRE d'écriture des clés JS — vérifié EN
  EXÉCUTANT qu'aucun des 10 sites migrés ne porte un raccourci `margin` dans le même objet de
  style (recherche croisée avec les numéros de ligne du diff, fichier par fichier) : le risque
  signalé ne se matérialise nulle part. Vérifié aussi EN EXÉCUTANT : `tsc` propre, 7/7 tests du
  garde passent, comptage par propriété (`gap`/`marginTop`) confirme exactement 55 occurrences
  `var(--e1)` (45 + 10), `gap: 4`/`gap: 8` (tranches 4/5) non régressés, aucun fichier sonde
  résiduel (toutes tranches confondues). `EXIT=1` réel (journal brut, `set -o pipefail`), UNE
  SEULE route — `/eng/70670df5-.../rcm/2bc1a1fb-...` (l'habituelle, `rcm/[cid]`, tooltip
  `rail-astuce` au jeton 87). Disjoint de la tranche : cette tranche touche `globals.css` et 6
  fichiers `.tsx` sous `eng/[id]/` (aucun n'est `rcm/[cid]`) — rien qui touche `/rcm`. Les 1214
  tests vitest passent tous (+1 vs H-6 tranche 5 : le nouveau garde `marginTop: 4`). Clôture et
  archive ATTEINTES (verify complet), 286 étapes conduites, 403 clics comptés sur 63 gestes
  (inchangé) — TRENTE-QUATRIÈME confirmation consécutive que `#418` est disjoint. Pas creusé plus
  loin (même discipline que F9-F47). `npm run visuel` relancé séparément (avant le commit, sur le
  même arbre de fichiers), propre (356 vues, 0 défaut).
