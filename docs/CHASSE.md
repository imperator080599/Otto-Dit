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

### Ce que cette récidive NE change PAS

Le passage qui a suivi cette occurrence (voir STATUS.md, tranche « contrôle interne, tranche 1 »)
a été refait et est passé propre — donc la LIVRAISON n'a jamais été bloquée sur un rouge non
diagnostiqué (règle 32 : jamais expédier pendant que la chaîne verify est rouge sans en connaître
la cause). Mais l'INSTRUMENT (règle 35) mérite mieux qu'une ré-exécution silencieuse : la
prochaine occurrence doit capturer 1 et 2 ci-dessus AVANT de relancer, pas après.
