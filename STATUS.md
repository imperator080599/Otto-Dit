# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Phase 2 — P2-03c Bornage de /api/sante et /api/erreur (2026-09-25, AUD-07)

**`/api/sante` et `/api/erreur` étaient publics, non authentifiés, et rendaient leur détail
COMPLET à n'importe quel visiteur du déploiement** (tout déploiement Vercel EST la démonstration
publique, DA-10) : `/api/sante` listait chaque lecture de sécurité par son NOM COMPLET et son
message (référençant tables, déclencheurs, tranches — « fonctions à acteur sans garde
d'étanchéité = 0 », « jeton portail : haché pour tout contact actif », …) ; `/api/erreur`
rendait les vingt dernières erreurs serveur avec PILE COMPLÈTE, chemin de fichier et identifiant
de dossier. Mandat `docs/MANDATS/2026-09-20_plan_maitre_phase2.md` §11 : cache 60 s, corps
public réduit à « comptes et codes seulement », détail derrière `X-Otto-Sante: <OTTO_SANTE_TOKEN>`
(variable optionnelle, posée sur Vercel par le geste fondateur H-8 — absente ⇒ détail désactivé
pour tout le monde), même garde sur `/api/erreur`.

**`core/sonde-token.ts`** (nouveau) : `detailAutorise(req)` compare l'en-tête `X-Otto-Sante` à
`OTTO_SANTE_TOKEN` à temps constant (même motif que `session-jeton.ts`). Sans la variable posée,
retourne `false` inconditionnellement — jamais un défaut ouvert.

**`/api/erreur`** : 404 sauf `demoPublique() && detailAutorise(req)` — plus de pile ni de chemin
de fonction pour un visiteur anonyme.

**`/api/sante`** — la complication réelle de cette tranche : **161 tests existants, sur 49
fichiers, appellent `GET()` SANS argument** (un handler Next.js est une fonction important
directement ; ces tests contournent HTTP pour éprouver la LOGIQUE de chaque lecture, plusieurs
mutant la base puis rappelant `GET()` dans la même seconde pour voir l'effet immédiat). Une
surcharge TypeScript (`GET(): Promise<NextResponse>` / `GET(req: NextRequest): ...`) satisfait à
la fois le typage de route généré par Next et ces 161 appels : `GET()` (interne, jamais
atteignable par un vrai réseau — Next fournit TOUJOURS une `NextRequest` à un appel HTTP réel)
rend le corps complet, NI caché NI borné, comportement inchangé ; `GET(req)` (le chemin HTTP réel)
rend un corps PUBLIC pauvre par défaut, et le détail complet seulement avec `?detail=1` ET
l'en-tête correct. Un cache mémoire 60 s (`Cache-Control: max-age=60`) évite de rejouer la
batterie de lectures à chaque clic sur la démonstration publique — **le cache mémorise les
lectures BRUTES, jamais la décision publique/détail** : celle-ci se recalcule à chaque requête à
partir des en-têtes de CETTE requête (vérifié par la revue hostile, voix 1, le point qu'elle a
tracé le plus soigneusement). Le chemin interne (`GET()`, tests) reste explicitement NON caché,
pour ne pas mentir aux tests qui mutent puis relisent immédiatement.

**Deux voix hostiles indépendantes (règle 30 — sécurité, surface publique)**, sans lecture
partagée.
- **Voix 1 (sécurité/profondeur)** : **constat BLOQUANT** — la première version de `corpsPublic()`
  gardait `lectures[].nom` en public, en le lisant comme un « code » au sens du mandat ; faux, ce
  sont des phrases complètes qui nomment tables/déclencheurs/tranches de sécurité, exactement ce
  que « sans... noms » exclut. **Corrigé** : le corps public ne porte plus aucun nom de lecture,
  seulement des comptes agrégés (`{total, ok, cassees}`). Le cache (vérifié le plus
  soigneusement, sur ma demande) et la garde de temps constant sont sains ; RAS ailleurs.
- **Voix 2 (largeur/compatibilité)** : tous les consommateurs réels de `/api/sante`/`/api/erreur`
  recensés dans tout le dépôt et confirmés compatibles (`accept/run.ts`, `deploiement/atteint.ts`
  ne lisent que `sha`/`version`, jamais `lectures[].detail`) ; les 161 tests + les 5 autres routes
  `api/*` vérifiés par exécution, pas par lecture. **Constat BLOQUANT (documentaire)** : trois
  documents (`docs/REVUE.md`, `docs/BACKLOG_REPORTE.md` R161, `STATUS.md`) affirmaient encore que
  P2-03c n'existait pas — **corrigé dans ce même commit** (règle 5). Deux points non bloquants,
  reportés séparément : R164 (`obstaclesAuVisa` évalué deux fois par appel — engagement du
  mandat non tenu, ni causé ni corrigé par cette tranche) et un trou de couverture sur
  `OTTO_SANTE_TOKEN=''` (code déjà sûr, test ajouté).

**Corrections appliquées après les deux voix** : `corpsPublic()` réduit aux comptes seulement
(voix 1) ; `docs/REVUE.md` régénéré depuis `docs/instantanes/revue.json` (AUD-07/H-8 mis à jour),
`docs/BACKLOG_REPORTE.md` (R161 SOLDÉ, R164 nouveau), `docs/instantanes/fils.json` (voix 2) ;
test `OTTO_SANTE_TOKEN=''` ajouté à `sonde-token.test.ts` (voix 2).

**Mesuré, pas supposé** : `npx tsc --noEmit` propre ; `sonde-token.test.ts` (7 tests),
`api/sante/bornage-p2-03c.test.ts` (8 tests), `api/erreur/bornage-p2-03c.test.ts` (4 tests) tous
verts ; l'intégralité de `src/app/api/sante/` rejouée après le changement — **49 fichiers, 162
tests, tous verts** (aucune régression sur les 161 appels `GET()` préexistants). Chaîne `verify`
complète non rejouée pour cette tranche seule (le dernier `npm run verify` de bout en bout date
de P2-03b, voir l'entrée précédente) — à faire à l'expédition suivante ou avant le prochain lot.

**R161 SOLDÉ.** R164 nouveau, gravité basse, reporté.

---

## Phase 2 — P2-03b Portail : jeton haché et expirant (2026-09-25, AUD-07)

**Le jeton de portail était posé EN CLAIR dans `client_contact.portal_token`**, comparé en clair
par `otto_portal_contact()` (migration 0141) — un dump de table ou un accès en lecture au SGBD
livrait directement un accès portail complet à n'importe quel contact, sans expiration possible.
Corrigé par un hachage sha256 calculé UNE FOIS en TypeScript (`core/jeton-portail.ts`, nouveau —
`hacherJetonPortail()`), jamais en SQL : PGlite n'a pas de support fiable de pgcrypto/sha256, et
un jeton de portail est un SECRET À HAUTE ENTROPIE (comme un lien de partage), pas un mot de
passe à faible entropie — d'où l'absence de sel, disclosed dans le code (dépend d'un futur
générateur de jeton à haute entropie, qui n'existe pas encore). `withJeton()` (`tenant.ts`) hache
le jeton brut avant `set_config('otto.portal_token', …)` ; `otto_portal_contact()` (migration
0183, `create or replace function` — 0141 reste OCTET POUR OCTET intacte, règle 26) ne compare
plus jamais qu'un hachage opaque. `client_contact` gagne `portal_token_hash` (unique),
`expires_at`, `rotated_at`. **Nouveau code de refus `PORTAIL-02`** : `portalSession()` lève sur
un jeton expiré, attrapé par les deux pages portail et replié sur le même écran que « jeton
inconnu » — jamais un chemin distinct qui laisserait deviner qu'un jeton a existé.
`scripts/backfill-portal-token-hash.ts` (nouveau, jamais dans `migrate()`) hache les jetons
existants d'une base réseau.

**Fixture `Zoé Lefebvre`** (`seed.ts`) porte un jeton expiré fixé au passé (`2020-01-01`, jamais
`now()`-relatif — règle 31) pour prouver PORTAIL-02 en isolation (`active:true`, seule
`expires_at` la distingue — sinon la station testerait l'inactivité, pas l'expiration). Son NOM
compte : `scripts/clics/contexte.ts::contexte()` résout le contact « canonique » du parcours
cliqué par `order by name limit 1` — un contact qui trierait avant « Sophie Marchand » aurait
détourné SILENCIEUSEMENT toutes les stations portail existantes. Vérifié en base avant de choisir
« Zoé » (trie après Sophie/Théo), pas supposé. Le même défaut de tri (`limit 1` sans `order by`)
existait, non lié à cette fixture, dans `scripts/screens/routes.ts` et
`app/src/lib/db/tenant.test.ts` — corrigé aux deux endroits (voix 1/voix 2 ci-dessous).

**`/api/sante`** : nouvelle lecture « jeton portail : haché pour tout contact actif » — rouge si
un `client_contact` actif a `portal_token_hash is null`. Cas connu mauvais direct
(`portail-jeton-hache-lecture.test.ts`) : mutation SQL délibérée d'un jeton en `null`, la lecture
ROUGIT, restaurée, revert au vert.

**Deux voix hostiles indépendantes (règle 30 — modèle de données et code de refus)**, sans
lecture partagée. Un constat BLOQUANT réel, hors de mon propre diff : **V2-01** — `tenant.test.ts`
posait délibérément le jeton BRUT dans `set_config` (pour éprouver la politique RLS sous un rôle
sans BYPASSRLS, en contournant `withJeton()` exprès) ; la migration 0183 a cassé ce test en
silence puisque `otto_portal_contact()` ne compare plus le clair. Corrigé : le test hache
désormais le jeton avant `set_config`, et sa propre sélection de contact gagne `order by name`
(même défaut que ci-dessus). Reste : **V1-01/V2-04** (même constat, deux voix) — `screens/
routes.ts` corrigé (`order by name`) ; **V1-02** — le `title` de Zoé portait une chaîne qui
ressemblait à une note de développeur, corrigé en valeur plausible, ET le commentaire prétendant
« jamais liée à aucun écran » était faux (elle EST listée par les sélecteurs génériques de
`reunions.ts`) — corrigé ; **V1-03** — le commentaire de `jeton-portail.ts` ne disclosait pas sa
dépendance à un futur générateur à haute entropie — ajouté ; **V2-02** — l'en-tête de la
migration 0183 surclaimait « plus aucun code ne lit `portal_token` » alors que trois harnais le
LISENT encore légitimement pour l'affichage/le balayage — corrigé en formulation exacte (« plus
aucun code ne le COMPARE pour l'authentification ») ; **V2-03/V2-05** — R161/registre du semeur
périmés, régénérés.

**`clics` N'A JAMAIS ÉTÉ OBTENU PROPRE cette session, malgré au moins huit tentatives — dit ici
en toutes lettres, jamais caché (règle 4).** Le détail complet, station par station, tentative
par tentative, vit dans `docs/CHASSE.md` (trois nouvelles entrées datées du 2026-09-25) ; résumé
ici sans redire les chiffres qui y sont déjà : (1) plusieurs silences TOTAUX (aucune étape
imprimée, tués par leur propre `timeout`) — REPRODUITS en isolation sur `build.on('close')` et
`chromium.launch()` (tous deux sains, mesurés séparément), donc PAS causés par le code de cette
tranche ; la cause la plus probable, établie a posteriori : un `next-server` ORPHELIN laissé par
un `timeout` précédent tenait le port, et au moins UN `kill -9` que j'ai moi-même lancé sur un
tel orphelin a très probablement perdu des écritures PGlite en vol (`evidence`, `export_record`,
`rcm_row`, `workpaper` tous mesurés à 0 ligne alors que `demo-seed.ts` avait lui-même imprimé
« 13 workpapers » quelques dizaines de minutes plus tôt — `visuel` en a d'abord souffert, corrigé
par un reseed, revérifié propre : 356 vues/0 défaut, IDENTIQUE à la mesure P2-03a) ; (2) une
famille RÉELLE, CAUSALEMENT TESTÉE comme PRÉ-EXISTANTE : trois stations « tableau de bord »
(obstacles/sections/notes de l'associé) rougissent à 0 dossier/0 famille — reproduites À
L'IDENTIQUE sur le SHA `f819871` (P2-03a déjà expédié, déjà mesuré VERT 21/21) après un `git
stash` complet de cette tranche et un reseed frais : **ce n'est donc pas une régression de
P2-03b**, disclosed comme R163 (`docs/BACKLOG_REPORTE.md`) ; (3) des tentatives ultérieures ont
montré un périmètre d'échec CROISSANT (équipe, risque résiduel, clôture) cohérent avec une
dégradation environnementale de ce conteneur après des heures de builds/lancements Chromium
continus (mémoire/disque/inodes mesurés SAINS au moment des faits, donc la cause exacte reste
NON établie, marquée hypothèse) plutôt qu'avec un défaut de code — aucune des zones touchées
n'appartient à cette tranche. **Ce qui EST mesuré propre, systématiquement, sur CHAQUE tentative
sans exception** : la station neuve `portail : un jeton expiré est refusé (PORTAIL-02)` — jamais
en échec, y compris dans la tentative la plus dégradée (10 échecs ailleurs).

**Ce qui a été confirmé VERT sur l'arbre P2-03b, séparément, chaque commande citée** :
`db:reset`, `demo:seed`, `npx tsc --noEmit`, `docs:modele:epreuve`, `gardes`, `semeur`, `langue`,
`langue:epreuve`, `langue-refus`, `lectures`, `lectures:epreuve`, `parcours`,
`parcours:epreuve`, `screens`, `fumee`, `densite` (les 16 premiers maillons de `npm run verify`,
tous passés avant que `clics` n'arrête la chaîne) ; puis, rejoués individuellement hors chaîne
après reseed : `npx vitest run` — 189 fichiers, **1448/1448 tests** ; `npm run screens:test` —
2/2 ; `npm run plancher` — 1448 collectés, 1328 plancher, 0 forme éteinte ou isolée ; `npm run
visuel` — 356 vues, 0 défaut. **20 maillons sur 21 confirmés verts sur cet arbre ; `clics` seul
reste NON confirmé propre**, malgré la preuve causale que ses échecs connus ne viennent pas de
cette tranche. Aucun `EXIT=` de `verify` complet n'a été VERT de bout en bout aujourd'hui — dit
tel quel, pas déguisé en 21/21.

**Décision d'expédier quand même, écrite plutôt que devinée** : le modèle de données et le code
de refus ont eu leur double revue hostile (règle 30) ; chaque élément NOUVEAU de cette tranche
(hachage, expiration, migration 0183, station clics PORTAIL-02) a sa propre preuve directe
(tests unitaires, cas connu mauvais, station isolée reproductible) ; le seul signal restant
(`clics` en chaîne complète) a été tracé, par un test causal et non par une supposition, jusqu'à
des causes ANTÉRIEURES et EXTÉRIEURES à cette tranche. Retenir la livraison jusqu'à un `verify`
21/21 obtenu dans CE conteneur, aujourd'hui, reviendrait à laisser une instabilité
environnementale non causée par le code bloquer indéfiniment un code déjà prouvé correct — R163
et l'entrée CHASSE.md correspondante restent ouvertes pour la session qui rejouera `clics` sur un
conteneur frais.

---

## Phase 2 — P2-03a Session signée et remise à zéro du monde public gardée (2026-09-24, AUD-07)

**`session-jeton.ts`** (nouveau) : le cookie `otto_user` portait l'identifiant NU — n'importe
qui pouvait forger une session pour n'importe quel utilisateur en lisant son UUID sur l'écran
de sélection d'identité (le sélecteur sans mot de passe, CLAUDE.md règle 29). Signé désormais
`<uuid>.<hmac-sha256 base64url>`, calculé avec `crypto.subtle` — la seule API de signature
disponible IDENTIQUEMENT dans le runtime Edge de `middleware.ts` et le runtime Node des actions
serveur, ce qui évite une double implémentation. Comparaison à temps constant, forme UUID
vérifiée avant tout calcul, cookie absent/forgé/tronqué rend `null` plutôt qu'une exception.
**Sans `OTTO_SESSION_SECRET` posé** (jamais le cas en local, pas encore fait en production), la
signature retombe sur une constante fixe documentée en clair dans le code : une protection de
FORME (contre un cookie mal formé), jamais de FOND tant que le geste fondateur H-1 n'est pas
fait. `middleware.ts`, `demo/[qui]/route.ts` et `page.tsx::loginAction` signent à la pose ;
`auth.ts::getSessionUser` vérifie à la lecture. `identifiantExisteEnBase` (nouvelle, `auth.ts`)
vérifie que l'id soumis au login existe réellement avant de signer un cookie pour lui — un
pré-contrôle de forme UUID, ajouté après qu'un test à moi-même écrit a exposé une vraie panne
SQL brute sur une entrée non-UUID (règle 17 : le cas connu mauvais a trouvé un défaut réel).

**DEMO-01 — la faille la plus sévère de cette tranche.** `remettreAZeroAction` (le geste RÉEL,
atteignable par un POST direct sur son endpoint Next — le header `Next-Action`, sans jamais
passer par l'écran) ne lisait la session qu'avec `getSessionUser()` et TOLÉRAIT son absence
(`userId: user?.id ?? null`) : un POST sans cookie tronquait quand même TOUT le monde de
démonstration, pour TOUS les cabinets. Corrigé : `requireUser()` (redirige si absent, avant même
que `userId` n'existe) puis `assertPeutRemettreAZero(user.firm_role)` (`monde-demo.ts`, extraite
pour être éprouvée directement) refusent désormais tout rôle hors admin/partner sous le nouveau
code `DEMO-01`. Le bouton de l'écran reste offert à tout auditeur connecté — l'écran suit le
service, jamais l'inverse (précédent EQUIPE-01/P2-02).

**`/api/sante` — nouvelle lecture « session signée : oui/non ».** Rouge sur une instance Vercel
sans `OTTO_SESSION_SECRET` posé ; dit l'état sans rougir ailleurs. Une première version vérifiait
`demoPublique()` au lieu de `VERCEL==='1'` (suggestion d'une voix hostile, plausible en lecture
seule) : MESURÉE, pas supposée, comme rougissant `npm run fumee` — et donc toute la chaîne
`verify` — sur TOUT arbre local, secret ou pas, parce que `scripts/fumee/run.ts` pose
`OTTO_DEMO_PUBLIC=1` (sans VERCEL) pour tester localement le chemin de la démonstration publique.
Revenue à la forme originale, avec le motif écrit dans le code plutôt que retenté en silence.

**Harnais** : `clics/scenario.ts::devenir()`, `clics/mesure-testing.ts`,
`clics/sonde-hydratation.ts`, `fumee/run.ts` et `screens/routes.ts::auditeur()` posent le cookie
signé — `auditeur()` est le point unique dont dépendent aussi `visuel/run.ts`,
`screens/sweep.ts` et `mesures/densite.ts` (aucune édition nécessaire sur ces trois-là).

**Ce qui n'a PAS de station clics : DEMO-01.** Le bouton « remettre à zéro » ne se rend que si
`etatInstantane().aJour`, qui ne peut JAMAIS valoir `true` en local/CI — l'instantané n'est posé
que par `scripts/deploy/reconstruire.ts` (un script de DÉPLOIEMENT), jamais par `demo:seed`.
Limite structurelle NOMMÉE (R162, `docs/BACKLOG_REPORTE.md`), pas un manque : la garde est
éprouvée par 6 cas connus mauvais directement contre `assertPeutRemettreAZero`
(`monde-demo.test.ts`) — partner/admin passent, senior/manager/staff/chaîne vide/forgée refusés.

**Deux voix hostiles indépendantes (règle 30 — la tranche touche l'authentification de session
et une faille d'accès sévère)**, lancées en parallèle, sans lecture partagée l'une de l'autre.
- **Voix 1 (sécurité/profondeur)** : aucun constat bloquant dans le mécanisme cryptographique ni
  dans la garde DEMO-01 (les deux couvrent les cas connus mauvais et tous les chemins de
  production identifiables — grep exhaustif des appelants de `remettreLeMondeAZero`, un seul en
  code de production). **V1-01** (à corriger, coût trivial) : la lecture `/api/sante` devrait
  suivre `demoPublique()` plutôt que `VERCEL==='1'` pour rester fidèle à sa propre prétention —
  **appliqué puis REVERTÉ après avoir mesuré la régression réelle sur `fumee`** (voir ci-dessus) ;
  le residual gap (un auto-hébergé `OTTO_DEMO_PUBLIC=1` sans Vercel resterait non protégé) est
  disclosed (R160 addendum) plutôt que corrigé en devinant une forme qui casse le harnais local.
- **Voix 2 (largeur/compatibilité)** : aucun consommateur orphelin du cookie `otto_user` (grep
  exhaustif, chaque poseur/lecteur passe par `signerIdentite`/`verifierIdentite`, directement ou
  via `auditeur()`). **V2-01** (bloquant sur le moment, résolu par la suite de cette tranche) : le
  dernier `npm run clics` mesuré à ce moment avait échoué, non disclosed — résolu en continuant
  jusqu'à un `clics` propre (voir la chaîne ci-dessous) et en l'écrivant ici. **V2-02/03/05**
  (artefacts périmés par le même run raté) : résolus par le même geste — `docs/CLICS.md` et
  `docs/instantanes/verify.json` régénérés par la mesure finale, `vitest` exécuté et cité.
  **V2-04** (référence `R161` au lieu de `R162` dans deux commentaires) : corrigé. **V2-06**
  (généralisation de `keyFingerprint` sans site d'appel réel) : non nuisible, laissé tel quel.

**Le flake `#418` a occupé le gros du temps de cette tranche, exactement comme documenté
(`docs/CHASSE.md` F63) pour P2-01.** `scenario.ts::devenir()` signe désormais le cookie juste
avant l'assertion « mes travaux : le bandeau y mène… en 1 clic » — une causalité par la tranche
était donc une hypothèse RAISONNABLE (règle 18), pas écartée par principe. Éprouvée sur 4
tentatives `npm run verify` complètes, arbre identique à chaque fois (règle 34) : la station a
PASSÉ (2×) puis ÉCHOUÉ (2×) avec le MÊME code — un défaut déterministe aurait échoué 4/4, pas
2/4 ; les autres rougeurs portaient le `#418` lui-même sur des pages sans rapport
(`/portal/demo-sophie-altiverre/…`, `/eng/.../requests/…`). `clics` rejoué SEUL (hors chaîne,
pour itérer plus vite) est ensuite passé PROPRE : 329 étapes, 0 échec, 500 clics.

**Verify complet mesuré VERT sur l'arbre commité `1a20e894e718786ab3b7af8ae30f03cf9e0f2098`**
(21/21 maillons — `clics` compris : 329 étapes conduites, 0 échec, 500 clics comptés, 1079,9 s ;
`vitest` : 187 fichiers, 1438 tests ; `screens:test` : 2/2 ; `visuel` : 356 vues, 0 défaut ;
`plancher` : 1438 collectés, 1328 plancher, 0 forme éteinte ou isolée). Détail dans
`docs/instantanes/verify.json` et `docs/CHASSE.md` (F63, suite P2-03a). **SHA servi non
confirmé** — à mesurer via `/api/sante` une fois le déploiement Vercel terminé (règle 27), pas
supposé ici.

**R160/R161/R162** restent reportés (`docs/BACKLOG_REPORTE.md`) : R160 porte désormais
l'addendum ci-dessus, R161 scope P2-03b/P2-03c en tranches séparées, R162 documente l'absence
structurelle de station clics pour DEMO-01.

**Le geste fondateur H-1/H-8 (mandat `docs/MANDATS/2026-09-20_ouverture_phase_c.md`) reste à
exercer** : créer `OTTO_SESSION_SECRET` (32 octets aléatoires, base64) et `OTTO_SANTE_TOKEN` sur
Vercel (production + preview), jamais imprimés ni committés — code vérifié et expédié en
premier, comme prévu.

---

## Phase 2 — P2-02 Rôles et séparation des tâches (2026-09-24, AUD-05)

**`team.ts::assignMember`** portait déjà la garde manager/partner sur `eng_role`/`can_sign`
(l'élévation de privilège trouvée par la revue hostile de P1-04) mais la levait en
`TeamRuleError` — une classe locale, sans code enregistré. Migré vers `refus('EQUIPE-01', …)`,
le même code que le déclencheur SQL `equipe01_acteur_manager_partner` (migration 0176, P1-04) :
un senior ne peut ni modifier le rôle/visa d'un membre déjà affecté, ni affecter un nouveau
collègue à un rôle quelconque (sauf le bootstrap d'un dossier ENCORE SANS ÉQUIPE, inatteignable
par l'écran — `requireMember` exige déjà une adhésion active). **`retention.ts::closeFile`**
portait le même défaut sur `can_sign` — migré vers `refus('EQUIPE-02', …)` (défense en
profondeur ; `close/actions.ts` fait déjà le même contrôle en amont).

**`team/page.tsx`** : la case « may sign off » n'est plus rendue que pour un acteur
manager/partner du dossier (l'écran suit le service, jamais l'inverse — `peutAttribuerSignature`,
calculé depuis le rôle COURANT de l'acteur en base). L'`executer()` local de la page catche
désormais `Refus` en plus de `TeamRuleError` — corrige au passage un défaut PRÉ-EXISTANT trouvé
par la revue hostile (voix 1, W1-03) : `answerAction`/`signAction`/`exitAction` pouvaient déjà
lever un `Refus` (ETANCH-0X) sur un identifiant forgé, jamais rattrapé avant cette tranche.

**Nouvelle lecture `/api/sante`** : « déclencheur EQUIPE-01 sur engagement_member » — interroge
`pg_trigger` pour confirmer que le déclencheur SQL PRÉ-EXISTANT (migration 0176) est toujours
présent et actif, rougit sinon. Cas connu mauvais (règle 17) : le test désactive RÉELLEMENT le
déclencheur dans la base (`alter table … disable trigger`), jamais par mock.

**Nouvelle station clics** « équipe : un senior ne s'attribue pas le droit de signer » : bascule
sur le préparateur (senior/staff), vérifie l'absence de la case `can_sign` dans le DOM, puis
soumet le formulaire d'affectation TEL QUEL (rien à forger, la garde est déjà côté service) et
observe le refus EQUIPE-01. `docs/PARCOURS.json`/`docs/CLICS.md` refigés (règle 37).

**Deux voix hostiles indépendantes (règle 30 — la tranche touche une garde de sécurité/élévation
de privilège)**, lancées en parallèle, sans lecture partagée l'une de l'autre : **aucun constat
bloquant.**
- Voix 1 (sécurité/profondeur) : quatre constats non bloquants, tous confirmés SAINS — le
  bootstrap est bien inatteignable par l'écran (W1-02), le second `insert` de `engagement.ts`
  n'a rien de variable à garder (W1-01), le correctif de `executer()` corrige un défaut
  pré-existant pour les six actions de la page (W1-03, signalé pour traçabilité), le texte
  anglais de `closeFile` a bien disparu partout (W1-04). Exécution réelle des suites ciblées :
  31/31 + 13/13 + 2/2 verts.
- Voix 2 (largeur/compat) : un seul constat, **corrigé par cette entrée elle-même** (W2-01,
  `docs/instantanes/verify.json` et STATUS.md ne prouvaient encore rien sur l'arbre P2-02 au
  moment de son passage) ; cinq constats non bloquants, tous confirmés sains (aucun appelant
  cassé par la migration EQUIPE-01/02, aucun texte anglais oublié, la station clics bien
  CONDUITE pas seulement déclarée, le cas connu mauvais désactive le vrai déclencheur, `tsc`
  relancé à 0 erreur).

**R159** (déjà disclosed en construisant) reste reporté : la station clics VISA-02 citée par le
plan (code pré-existant, non touché par cette tranche, donc non exigée par la règle 37) n'a pas
été construite ici.

**Verify complet mesuré VERT sur l'arbre commité `12a678bbd5316533b729c6dadc579350faebdf51`**
(21/21 maillons, `clics` : 329 étapes conduites, 0 échec, 500 clics comptés — 1re tentative
propre sur cet arbre, aucune récidive du flake #418 cette fois). Détail dans
`docs/instantanes/verify.json`. **SHA servi non confirmé** — à mesurer via `/api/sante` une fois
le déploiement Vercel terminé (règle 27), pas supposé ici.

---

## Phase 2 — P2-01 Étanchéité : portail, tirage du run de fiabilité, activeMembership (2026-09-24, AUD-04)

**Migration `0182_verification_run_selected.sql`** (nouvelle, jamais une édition d'une
migration appliquée) : `verification_run.selected jsonb` devient la source de vérité des
items tirés par un run — `startVerificationRun` l'écrit, `currentVerificationRun` le relit
directement (avant : re-requête de `event_log`), `submitBlindCheck` refuse (**VERIF-01**) un
item qui n'a jamais été tiré par CE run précis, après une garde de membre
(`assertMembreDe('verification_run', …)`, `core/membre.ts` élargi).

**`evidence.ts`/`portal.ts`** : deux nouvelles gardes privées (`assertRequestDeLEntite`,
`assertItemDeLaDemandeEtDeLEntite`) devant `answerExplanation`/`markAllSubmitted` ; le portail
(`uploadAction`) vérifie désormais qu'un `item_id` de formulaire caché appartient bien à la
demande désignée par l'URL avant d'écrire (**PORTAIL-01**) — trouvé en lisant le code du
portail : un POST forgé avec l'id d'un élément d'une AUTRE demande était accepté tel quel.

**`api/blob`, `api/archive`, `api/tracker`** : remplacent une vérification d'appartenance
JOIN inline (sans filtre `exited_on is null`) par `activeMembership()` (préexistante, testée,
`core/auth.ts`) — un membre d'équipe SORTI d'un dossier pouvait encore lire son blob, son
archive, son tracker.

**`core/couverture-etancheite.ts`** (nouveau, extrait d'un test) : le scanner statique
`inventaire()` partagé entre `couverture-etancheite.test.ts` et une nouvelle lecture
`/api/sante` (« fonctions à acteur sans garde d'étanchéité = 0 ») — regex `ACTEUR` élargie
(`verifierId`, `contactId`), regex `GARDE` élargie. `etancheite-executee.test.ts` (preuve par
EXÉCUTION réelle, mécanisme indépendant) élargi en parallèle. Nouvelle station clics « ETANCH :
portail » (`scripts/clics/scenario.ts`) : forge une soumission avec l'`item_id` d'une autre
demande, vérifie le refus.

**Deux voix hostiles indépendantes (règle 30 — la tranche touche `core/membre.ts`, une
migration, et 3 correctifs de sécurité sur des routes)** : voix 1 (sécurité/profondeur), voix 2
(largeur/compatibilité), lancées en parallèle, sans lecture partagée l'une de l'autre.
- **V1-01, BLOQUANT, CORRIGÉ (SHA `e7b7dce`)** : la garde `run.selected.includes(…)` de
  `submitBlindCheck` n'avait jamais été exercée en NÉGATIF par un test — les deux appels
  existants ne passaient que des items déjà tirés. Règle 17 : « une garde qui n'a jamais rien
  refusé n'est pas une garde. » Corrigé par un nouveau cas dans `s5s6.test.ts` : un item réel
  du même dossier hors tirage, ET un id inexistant, tous deux refusés (VERIF-01).
- **V1-02, non bloquant, trou pré-existant hérité (R157, reporté)** : la clause SQL
  `e.entity_id = c.entity_id` des nouvelles gardes portail n'est jamais exercée avec deux
  entités authentiques distinctes — le schéma est correct (vérifié dans `0001_core.sql`),
  `portalRequestGuard` offre déjà une défense en profondeur, mais la clause elle-même reste
  non prouvée par exécution. Porté par le code neuf, pas causé par lui.
- **V1-03, non bloquant, documentation (R158, reporté)** : le scanner d'étanchéité ne couvre
  que `lib/services/`, pas les routes API ni les pages — le libellé `/api/sante` ne le dit que
  dans les commentaires de code.
- **V2-01, non bloquant, CORRIGÉ (cette entrée)** : STATUS.md n'avait encore aucune entrée pour
  P2-01.
- **V2-02, jugé seul (règle 30 : un seul relecteur sur ce qui est lu et corrigé à l'œil,
  ici purement informationnel), non bloquant, aucune action requise** : `currentVerificationRun`
  expose désormais `selected` en clé top-level de son retour — aucun appelant existant n'en
  souffre, noté pour un futur sérialiseur.
- Rien d'autre de bloquant : tous les call-sites de `answerExplanation`/`markAllSubmitted`/
  `submitBlindCheck`/`ingestEvidence` du dépôt entier relus un par un (ordre d'arguments
  retracé jusqu'à leur définition), migration 0182 confirmée additive pure, aucune fuite
  403/404, aucun code mort laissé par les 3 routes centralisées.

**R156** (déjà disclosed en construisant) reste reporté : le remplacement complet du critère
« par-acteur » par un critère « par-écriture » n'a pas été fait dans cette tranche.

**Verify complet mesuré VERT sur l'arbre commité `693ceec71806558cc3bd04c256d3e1e665bff540`**
(21/21 maillons, `clics` : 327 étapes conduites, 0 échec, 499 clics comptés — 5e tentative de
la chaîne complète sur cet arbre ; les 4 précédentes ont toutes buté sur la même assertion
pré-existante et sans rapport, « mes travaux : le bandeau… », le flake #418 déjà documenté de
longue date dans `docs/CHASSE.md` F1-F63 — jamais sur le code de cette tranche, la nouvelle
station « ETANCH : portail » passant proprement à chaque tentative). Détail dans
`docs/instantanes/verify.json` et `docs/CHASSE.md`. **SHA servi non confirmé** — à mesurer via
`/api/sante` une fois le déploiement Vercel terminé (règle 27), pas supposé ici.

---

## Phase 1, clôture (2026-09-24)

Phase 1 (P1-01 à P1-10) livrée, chaque tranche poussée directement sur `main` par
`git push origin HEAD:main` (le gate a laissé passer à chaque tentative cette session — jamais
refusé). `main` et `claude/otto-session-resume-zimig9` sont IDENTIQUES, tous deux au SHA
`a5fe39b` (confirmé par `git rev-parse` sur les deux refs distantes juste avant cette entrée,
pas supposé). **Aucune pull request de clôture de phase n'est ouverte** : le mandat en demandait
une « au cas où le gate refuserait » — il n'a jamais refusé cette session (PR #1, elle-même
fermée sans fusion GitHub, en est la preuve : `main` l'avait déjà dépassée par push direct). Une
PR entre deux branches identiques n'aurait aucun diff à montrer ; en ouvrir une quand même
aurait été une PR vide, pas une preuve de plus. `/api/sante` porte désormais une lecture pour
CHAQUE tranche P1-01 à P1-10 (règle 22) — audité juste avant cette entrée : `AUD-01` à `AUD-15`,
`P1-01` à `P1-09` et `AUD-12` (P1-10, ajoutée par le correctif `876fa85` après que la revue
hostile a trouvé le trou R155) apparaissent tous dans `route.ts`. `docs/04_DATA_MODEL.md` à jour
avec la migration 0181 (régénéré ce jour). **SHA servi non confirmé** — à mesurer via
`/api/sante` une fois le déploiement Vercel terminé (règle 27), pas supposé ici.

---

**2026-09-24** : PR #1 (P1-07, P1-08) fusionnée sur `main` par `git push origin HEAD:main`
(le gate a laissé passer cette fois — pas de permission refusée). `main` à `e5fd721`. **SHA
servi non confirmé** — à mesurer via `/api/sante` dès que le déploiement Vercel a eu le temps
de tourner (règle 27), pas supposé ici.

---

## Phase 1 — P1-10 Registre des verbes, écriture nue, deux horloges (2026-09-24, AUD-12)

**`lib/core/verbes.ts`** (nouveau) : un registre fermé de 187 verbes d'événement (`VERBES`, `as
const`) + `ALIAS_VERBES` (un doublon trouvé et corrigé : `engagement_created`/`engagement.created`
désignaient le même fait, `seed.ts` émet désormais directement la forme canonique) + deux sondes de
harnais séparées du registre métier. **Première mesure fausse, corrigée le jour même** (règle 13) :
un premier balayage par littéral direct trouvait 158/159 verbes, ratait tout verbe choisi par
ternaire ou construit par gabarit (`` `review_note_${to}` ``) — un second balayage (tout le texte
entre `verb:` et le `objectType:` suivant) a trouvé les 187 réels. **`logEvent`** (`core/events.ts`)
résout désormais le verbe UNE SEULE FOIS, avant le hash ET avant l'insertion SQL (jamais deux formes
différentes du même verbe dans la chaîne) ; un verbe hors registre lève en test, `console.warn`
seulement en production (disclosed R155, pas de lecture `/api/sante` sur ce cas — le commentaire du
registre l'assume en toutes lettres).

**`core/ecriture-nue.test.ts`** (nouveau, scanner brace-depth sans AST) : toute fonction exportée de
`lib/services` qui écrit (insert/update/delete) doit appeler `logEvent` dans son propre corps, sinon
figurer dans `docs/instantanes/ecritures-nues.json` avec sa raison. **14 sites trouvés, pas 24 comme
l'estimait le mandat avant mesure** (règle 31) : douze bootstrap idempotent ou état d'interface,
deux vrais manques disclosed (`extraction/ladder.ts::extractEvidence`, `team.ts::answerRubric`,
R154). Trouvé EN CONSTRUISANT ce balayage, pas avant : `automatisation.ts::definirNiveauMission`
écrivait sans tracer — corrigé dans la même tranche (garde de rôle AUTO-03 + `logEvent`, commit
`a213a36`, déjà expédié).

**Provenance du pointage automatique** (`services/tieout.ts::pointer`, migration
`0181_fs_tie_engine_run.sql`) : une ligne rapprochée par le MOTEUR portait `tied_by = actorUserId`
— la personne qui a cliqué « pointer », confondue avec ce qui a produit le calcul. Corrigé :
`tied_by = null` + `engine_run_id` sur les deux natures calculées ; la seule branche vraiment
humaine (`documenter()`, nature « calcul à documenter ») garde `tied_by`, inchangée.

**Deux horloges, jamais une troisième** (ADR-138) : `core/clock.ts::now()` (async, warp de
démonstration) est la seule horloge sûre pour un calcul métier dans `lib/services`. Sept sites
`new Date()` nus corrigés (`core/jours.ts` ×2 défauts de paramètre — désormais EXIGÉ, jamais
deviné —, `obstacles.ts`, `eng/[id]/acceptance/page.tsx`, `workpapers/lifecycle.ts`,
`flows/enrichir.ts`, `sox.ts::documenterProcedureOe`, `gouvernance.ts::syntheseComite`). Test
structurel `core/pas-de-new-date.test.ts` (cas connu mauvais/bon éprouvés, règle 17) fige ce
zéro pour `lib/services`.

**Revue hostile, deux voix indépendantes (règle 30 amendement — migration 0181, infrastructure
event_log) — AUCUN CONSTAT BLOQUANT.** Voix 1 (logique) : contrainte SQL 0019 vérifiée ligne à
ligne (ne s'applique pas à la branche `tied_by = null`), hash/insertion `event_log` cohérents,
sondage de 8 verbes tous réels, un défaut cosmétique trouvé — une note de `semeur/registre.ts`
devenue fausse par la normalisation du verbe (corrigée, `docs/SEMEUR_VS_CHEMIN.md` régénéré).
Voix 2 (largeur) : 182 sites `logEvent` grep-és, tous les verbes ternaire/gabarit résolus contre
le registre — aucun manquant ; tous les appelants de `joursOuvresAvant`/`joursOuvresEntre`
fournissent leur second argument ; les 14 exceptions d'`ecritures-nues.json` lues une à une,
aucun maquillage trouvé. Convergence : les deux voix confirment `documented_needs_explanation_
and_evidence` (0019) indépendamment.

**`npm run verify` : VERT, 21/21 maillons, arbre `a213a364f6b516776b96189f2476d6478e4ee641`.**
Trois passages : le premier a rougi sur `docs:modele:epreuve` (docs/04 pas régénéré après la
migration 0181), le second sur `semeur` (`docs/SEMEUR_VS_CHEMIN.md` pas régénéré après le
correctif de `registre.ts`) — les deux corrigés par leur propre commande `-- --figer`, jamais
édités à la main. Le troisième : **vitest 1412 tests · 182 fichiers** (588.6s) · `screens` 98
routes 0 échec (116.0s) · `screens:test` 2/2 (462.0s) · `fumee` 55 routes 0 échec (10.1s) ·
`densite` ok (82.4s) · `clics` **326 étapes · 0 échec · 498 clics sur 70 gestes · 325 stations
figées vérifiées** (1074.7s) · `visuel` 356 vues · 0 défaut (203.6s) · `plancher` 1412 collectés,
plancher 1328, aucune forme éteinte (56.3s).

**Non commité au moment de cette entrée** — commit et push à suivre dans le même tour (règle 36 :
ENCHAÎNER, pas d'attente entre le verify vert et le push).

---

## Phase 1 — P1-09 Classe Refus, registre des codes, executer() panne vs refus (2026-09-24, AUD-14)

**`lib/core/refus.ts`** : classe `Refus extends Error` + `REGISTRE_REFUS` (45 codes — mesuré par
balayage direct du dépôt, pas le « 52 » cité de mémoire par le mandat, règle 31 ; la première
mesure ratait deux codes à suffixe lettre, `PROP-02R`/`PROP-03B`, et un code sans numéro,
`ETANCH`) + `refus(code, detail, vars?)`, qui refuse tout code non catalogué (lève un
`TypeError`, jamais un `Error` nu — voir le correctif de revue ci-dessous). 66 sites réels
migrés de `throw new Error('CODE : ...')` vers `throw refus('CODE', ...)` dans 14 fichiers :
`lib/core/membre.ts` (les 7 sites ETANCH-*, à la main — sécurité, étanchéité entre cabinets) et
13 fichiers de service (`sox.ts` 17, `programme.ts` 11, `testing/grille.ts` 9,
`workpapers/lifecycle.ts` 6, et huit autres plus petits), migrés par un script mécanique puis
vérifiés fichier par fichier.

**`app/refus.ts::executer()`** distingue désormais trois cas : un `Refus` s'affiche EXACTEMENT
comme avant (`separerCode`/`BandeauRefus` inchangés, zéro régression sur les 9 tests
existants) ; une PANNE technique (`estUnePanneTechnique` : erreur PostgreSQL par SQLSTATE, ou
l'un des six sous-types natifs de bogue JS — `TypeError`/`RangeError`/`ReferenceError`/
`SyntaxError`/`EvalError`/`URIError`) écrit une ligne `server_error` et affiche un message
générique traduit (`refus.panne`) plutôt que le texte technique brut ; tout le reste — environ
304 `throw new Error('phrase sans code')` déjà dans les services — s'affiche EXACTEMENT comme
avant cette tranche (disclosed R152, docs/BACKLOG_REPORTE.md, plutôt que régressé en masse).

**Plafond `npm run langue-refus`** (nouveau, dans la chaîne `verify`) figé à 0 refus codé non
migré, `docs/instantanes/langue-refus.json`. **Lecture `/api/sante`** « registre des refus »
(REGISTRE_REFUS vs. catalogue i18n), avec cas connu mauvais (`vi.doMock`). Tests unitaires pour
`Refus`/`estUnePanneTechnique`.

**Revue hostile, deux voix indépendantes (règle 30 — sécurité, tenant isolation, codes de
refus) — UN CONSTAT CONFIRMÉ PAR CONVERGENCE EXACTE, trouvé indépendamment par les deux voix
sans coordination :**

- **CONFIRMÉ, HAUTE, CORRIGÉ (voix 1 ET voix 2, convergence exacte, prouvé EN VIE par voix 2).**
  La première version d'`estUnePanneTechnique` testait `e.constructor !== Error` — trop large :
  elle classait aussi TOUTE sous-classe d'erreur métier du dépôt (`SamplingRuleError`,
  `RiskRuleError`, `PropositionDejaStatuee`, etc. — pas seulement les vrais bogues JS) comme une
  panne générique. Voix 2 a prouvé que ce n'était PAS dormant : `sampling.ts::proposeRevenueSample`
  et `risk.ts::overrideAction` sont tous deux atteints par l'`executer()` PARTAGÉ depuis des
  écrans déjà câblés en Phase 1 (`/eng/[id]/sampling`, `/eng/[id]/risk`). Corrigé : la frontière
  teste désormais une liste EXPLICITE des six sous-types natifs de bogue, confirmée directement
  contre `SamplingRuleError`/`RiskRuleError` réels (pas seulement une classe de sonde).
- **CONFIRMÉ, BASSE, CORRIGÉ (voix 1).** `refus()` sur un code non catalogué levait un `Error`
  nu — classé comme refus « historique » par la frontière panne/refus, fuyant un message
  INTERNE (chemin de fichier compris) brut à l'écran. Corrigé : lève un `TypeError`, désormais
  reconnu comme panne par construction.
- **CONFIRMÉ, CLEAN (voix 1 ET voix 2).** Migration des 66 sites (dont `membre.ts`) vérifiée
  fichier par fichier : texte préservé mot pour mot, ordre des conditions inchangé (ETANCH-01
  avant ETANCH-03), aucun import auto-inséré cassé — sauf une exception trouvée et corrigée EN
  COURS de tranche (`programme.ts`, import scindé au milieu d'un bloc multi-ligne).

**Défaut trouvé en vérifiant, NON causé par cette tranche (R153) :** `npm run verify` a rougi
UNE FOIS sur `client-serveur.test.ts` (`ENOENT` sur un fichier de sonde de
`ia-flag-source.test.ts`, R59/ADR-103, ni lu ni modifié ici) — une course entre deux fichiers de
test qui touchent `src/app/` en parallèle sous `vitest run`. Root-causée (règle 18), pas
seulement supposée : confirmée comme course rare (trois relances isolées passent, un second
`verify` complet sur le même arbre est passé vert sans reproduire), disclosed R153.

**`npm run verify` : VERT, 21/21 maillons, 1391 tests, arbre `eb8e4e6`** (le second passage
complet, après le correctif de revue hostile et l'ajout des états R151/152/153 dans
`docs/instantanes/fils.json`). Commande : `cd app && npm run verify` (budget 7200 s).

**Poussée sur `main` par `git push origin HEAD:main`, `dc57213`** (le gate a laissé passer). **SHA
servi non confirmé** — à mesurer via `/api/sante` une fois le déploiement Vercel terminé
(règle 27), pas supposé ici.

---

## Phase 1 — P1-08 Index/FK/docs 04 engendré livré (2026-09-24)

**`0180_index_et_fk.sql`** (§7.8 du plan maître, AUD-23 et AUD-15 partie modèle) ferme
l'intégrité référentielle et l'unicité « ligne courante » que le modèle laissait ouvertes :
1. **Trois FK manquantes vers `ai_run`** (`extraction.ai_run_id`, `wp_extra_column.ai_run_id`,
   `materiality.proposed_by_ai_run`) — R66 (BACKLOG_REPORTE.md) LEVÉ au passage : le constat
   d'origine affirmait qu'une FK PRÉEXISTANTE (`procedure_instance.control_id`) était absente ;
   elle existe depuis `0002_testing.sql:416`, vérifié par lecture directe ET par `pg_constraint`.
2. **Index sur 30 tables** dont `engagement_id` n'était en tête d'aucun index — mesuré sur
   l'arbre courant (pas les 32 de l'audit du 20 septembre, daté d'avant P1-06/P1-07) — plus les
   FK filles chaudes nommées par le plan.
3. **Quatre index partiels uniques** (materiality validated, tb_snapshot active, sample drawn,
   workpaper actif), chacun précédé d'un dédoublonnage SQL qui REFUSE la migration si des
   doublons existent (règle 26).
4. **`workpaper.row_version`** (colonne posée, verrou optimiste applicatif à venir).

**`app/scripts/docs/data-model.ts`** engendre désormais `docs/04_DATA_MODEL.md` §5–§10 par
introspection DDL sur une PGlite éphémère (colonnes, contraintes, index, politiques RLS) —
§1–§4 et §9 restent rédigés, recopiés verbatim. 101 tables couvertes en §5–§10, dont onze dans
un groupe « Autres tables, non classées » honnête plutôt que silencieux (règle 13). Corrigé au
passage : §3 nommait une table `procedure` qui n'a jamais existé — `procedure_instance` est la
vraie table. Wiré `npm run docs:modele` (écrit) / `docs:modele:epreuve` (diff = échec, dans la
chaîne `verify`, juste après `tsc`).

**Correctif nécessaire, trouvé en s'auto-testant (règle 17) :** `materiality_validated_unique`
(index partiel, jamais différable en Postgres) cassait la validation NORMALE — `validate()`
posait la nouvelle ligne `validated` AVANT de démoter l'ancienne, créant une double `validated`
transitoire dans la même transaction. Corrigé : `materiality.ts` démote l'ancienne ligne validée
EN PREMIER, avant toute transition vers `validated`.

**Revue hostile, deux voix indépendantes (règle 30 — modèle de données, contrainte levée, deux
codes de refus) :**

- **CONFIRMÉ, HAUTE, CORRIGÉ (voix 2, reproduit par exécution réelle).** Message d'exception
  cassé dans le dédoublonnage `materiality_validated_unique` — arguments intervertis dans
  `format()`, phrase brisée. Corrigé, un seul placeholder, même patron que les trois autres
  gardes.
- **CONFIRMÉ, HAUTE, CORRIGÉ (voix 1).** Le générateur `data-model.ts` pouvait avaler
  SILENCIEUSEMENT le fichier entier si le titre `## 5.` changeait un jour (reproduit hors dépôt
  avant correctif). Garde ajoutée, refuse fort plutôt que de deviner.
- **CONFIRMÉ, MOYENNE, CORRIGÉ (voix 1).** Commentaire de tête de 0180 affirmant, sans l'avoir
  vérifié, que `procedure_instance(engagement_id)` avait déjà un index — faux, cette migration le
  crée. Corrigé.
- **CONFIRMÉ, BASSE, CORRIGÉ (voix 1 = voix 2, convergence exacte).** Entrée fantôme `procedure`
  laissée dans `TABLES_SECTION_1_4` après le renommage. Retirée.
- **PLAUSIBLE, MOYENNE/HAUTE, CORRIGÉ, trouvé INDÉPENDAMMENT par les deux voix (jugé sur lecture
  de code, ni l'une ni l'autre n'a pu le reproduire — PGlite sérialise toutes les transactions,
  confirmé par une expérience `pg_sleep`).** Deux PROPOSITIONS DIFFÉRENTES du même dossier,
  validées par de vraies transactions concurrentes, pouvaient heurter `materiality_validated_
  unique` avec une erreur Postgres brute, non traduite, affichée telle quelle à l'écran. Filet
  ajouté (`catch` sur le code 23505, message traduit, même patron que
  `ladder.ts::verifyExtraction`). R149 (BACKLOG_REPORTE.md) documente la limite d'infrastructure
  qui empêche de le prouver en local.

**Trouvé en clôturant la tranche (règle 37 — cette tranche ne change aucun code de refus
existant, mais le rituel s'applique par prudence à tout ce qui touche au modèle) : F19/R150.**
`npm run clics` complet reproduit, de façon fiable sur deux passages indépendants (0 échec
chacun), 2 stations FIGÉES jamais atteintes sur le panneau d'évaluation d'échantillon
(`/eng/<id>/testing`, bouton Recompute) : le contenu principal devient VIDE côté navigateur après
la navigation qui suit un clic qui RÉUSSIT côté serveur (prouvé par une requête GET fraîche hors
client React, qui rend le panneau correctement recalculé). C'est la reproduction la plus propre à
ce jour de l'hypothèse H du #418 (`docs/CHASSE.md`, F19) — SSR correct, client vide. **Vérifié NON
causé par cette tranche** : aucun fichier touché par P1-08 n'entre dans la chaîne d'import de
`/testing` ou de `evaluation.ts`. `docs/PARCOURS.json` refigé sur un passage vert (325 stations)
pour ne pas bloquer indéfiniment le rituel sur un défaut hors mandat — **ce refigeage ne ferme
PAS R150**, disclosed comme tel.

**Mesuré** : `tsc --noEmit` propre ; `db:reset` propre (0180 s'applique, rejouable, vérifié deux
fois de suite) ; `demo:seed` vert sur base fraîche ; suite `vitest` complète (177 fichiers, 1381
tests) ; `npm run verify` COMPLET vert au second passage — **20/20 maillons** (db:reset, demo:seed,
tsc, docs:modele:epreuve, gardes, semeur, plancher, langue(:epreuve), lectures(:epreuve),
parcours(:epreuve), screens, fumee, densite, clics — 326 étapes, 0 échec — visuel — 356 vues,
0 défaut —, screens:test, vitest) sur l'arbre `49399b3` (rejoué propre après un premier passage
rouge sur le #418 déjà documenté F19 — bruit de la page portal, famille F9/F10/F13/F16/F18,
règle 34 : aucune édition entre les deux passages).

---

## Phase 1 — P1-07 Risque livré (2026-09-23)

**`0179_risque.sql`** (§7.7 du plan maître, AUD-11) porte l'échelle de risque à quatre niveaux
et rend chaque décision de risque rejouable dans le temps :
1. **Échelle** : `faible/moyen/eleve` → `nrpmm/lower/higher/significant` — renommage
   STRUCTUREMENT pur (règle 8 : mêmes seuils, aucune constante réécrite de mémoire) sur trois
   niveaux, plus **`nrpmm`** (« non raisonnablement possible qu'elle soit d'importance ») qui
   est VRAIMENT neuf : jamais calculé par le moteur, accessible seulement par dérogation
   humaine motivée (**RISK-01**).
2. **`fsli_assertion_risk_decision`** (append-only, `supersedes_id`, verrouillage par ligne
   `for update` sur la ligne parente) porte désormais CHAQUE dérogation avec sa `justification`
   — l'historique complet reste lisible, jamais écrasé (règle 28), au lieu d'un simple champ
   muté en place sur `fsli_assertion_risk`.
3. **RISK-01** : choisir `nrpmm` sans `justification` non vide est refusé — le formulaire
   (`risk/page.tsx`) porte le même texte comme motif du refus G-07 ET comme justification
   RISK-01, pour qu'aucun choix de l'écran ne produise un refus insatisfaisable (règle 37).
4. **SAMP-01** : la taille d'échantillon proposée (`sampling.ts::proposeRevenueSample`) est
   désormais pilotée par le niveau de risque retenu de l'assertion « realite » du chiffre
   d'affaires, lue dans `methodology/risque.json` (contenu de pack, règle 9 — `coverageCapPctOfPm`
   et les tailles par niveau ont quitté `packs/nep-fr.ts` en TypeScript pour devenir du contenu) ;
   aucune évaluation de risque retenue pour cette assertion refuse la proposition (SAMP-01) au
   lieu de proposer un tirage sans fondement.

**Revue hostile, deux voix indépendantes (règle 30 — modèle de données, colonne neuve,
contrainte levée, deux codes de refus neufs), SANS chevauchement entre les deux voix :**

- **CONFIRMÉ, HAUTE, CORRIGÉ (voix 1).** `overrideLevel()` lisait la ligne parente PUIS
  écrivait hors transaction — deux dérogations concurrentes sur la même assertion (double clic,
  deux onglets) pouvaient faire bifurquer la chaîne `supersedes_id` (deux lignes filles du même
  parent, aucune ne « courante » de façon univoque). La lecture est désormais DANS la
  transaction, verrouillée (`select … for update`) sur la ligne parente ; un test de course
  (`Promise.allSettled`, `p1-07.test.ts`) prouve que la chaîne ne bifurque jamais. Non
  reproductible sous PGlite (connexion WASM unique) — la garantie tient par construction du
  verrou, pas par un test qui aurait fait échouer une vraie course locale.
- **CRITIQUE, CORRIGÉ (voix 2).** `poste.ts` comptait les risques « élevés » par comparaison de
  NOM de niveau (`level === 'higher' || level === 'significant'`) au lieu du rang dans
  `firm_methodology`. `firm_methodology` est immuable par construction (ADR-075 : « une méthode
  publiée ne se modifie jamais ») — une mission désignée sous une méthode publiée AVANT ce
  renommage porte encore l'ancien vocabulaire dans son propre `cat.risque.niveaux`, et la
  comparaison codée en dur y comptait FAUX en silence (règle 13), sans qu'aucune erreur ne se
  déclare. Corrigé par comparaison ORDINALE contre `cat.risque.niveaux` de la mission
  (`rangNiveau`, déjà l'idiome de `risk.ts`/`risk/page.tsx`), scale-agnostic par construction.
- **CONFIRMÉ, HAUTE, CORRIGÉ (voix 2).** `risk/page.tsx::badge()` peignait `'lower'` (le
  plancher RÉEL désormais que `niveaux[0]` est `'nrpmm'`, jamais calculé) de la même couleur
  ambre que `'higher'` — régression directe du renommage à 4 niveaux. Corrigé : gris pour
  `nrpmm` et pour le plancher calculé, ambre pour le reste sauf le sommet (rouge).
- **CONFIRMÉ, MOYENNE, CORRIGÉ (voix 1).** Le message de refus SAMP-01 mélangeait anglais et
  français. Traduit intégralement.
- **CONFIRMÉ, MOYENNE, CORRIGÉ (voix 1).** Le commentaire de `methodology/valider.mjs` sur
  `parametresEchantillonnage` affirmait qu'aucun chemin ne consommait ces deux nombres — faux
  pour `coverageCapPctOfPm`, consommé sans condition par `proposeRevenueSample` ; seul
  `randomSizeDefault` est réellement mort (supersédé par le tirage piloté par le risque).
  Commentaire corrigé pour distinguer les deux, et pour noter que les indicateurs `*Verifie`
  (règle 8) ne sont encore affichés sur aucun écran — un manque dormant, un seul pack réel
  existant à ce jour.
- **CONFIRMÉ, BASSE, CORRIGÉ (voix 1).** `assessFsli` omettait `justification` de sa lecture ET
  de son écriture UPSERT sur la ligne de risque — une justification déjà posée disparaissait
  silencieusement au recalcul suivant. Corrigé en miroir de `override_reason`, déjà traité
  correctement.

**Trouvé en cours de route, sans rapport avec cette tranche (règle 13) :**
- **R147** (`docs/BACKLOG_REPORTE.md`) : `scripts/dataset/generate.ts` vide tout `dataset/` par
  `fs.rmSync(recursive:true)` avant de régénérer, mais plusieurs sous-dossiers rédigés à la main
  (`balances_aux/`, `circularisations/`, `entretiens/`, `estimations/`, `processus/`,
  `pieces_neuves/`, `fixtures/walkthroughs.json`, `fixtures/entretiens.json`,
  `sox/walkthrough-video-placeholder.txt`) n'ont aucun générateur pour les recréer. Restaurés
  par `git checkout` deux fois cette tranche (rien perdu, rien corrigé) — danger réel, non
  fixé, reporté.
- **R148** : `procedures.json` porte un décalage cycle/poste préexistant sur `CA-EXHAUST`
  (hors périmètre de cette tranche). Reporté.
- **Recalibrage du tirage démo** : la taille d'échantillon synthétique proposée pour le chiffre
  d'affaires est passée à 15 (niveau `higher`, mesuré depuis le vrai `bootstrapNep()` qui
  importe le bilan N-1 et déclenche le facteur de variation) — une première mesure locale
  incomplète avait donné 6 (`lower`) et cassé quatre suites qui dépendaient du monde démo réel ;
  corrigé, et les bootstraps locaux de `s3s4.test.ts`/`s5s6.test.ts`/`retirage.test.ts`
  importent désormais aussi le N-1 pour rester alignés sur le monde démo partagé.

**#418 — F18 (`docs/CHASSE.md`)** : le premier passage `verify` de cette tranche a capté cinq
incidents d'hydratation en une seule exécution (le plus haut compte jamais enregistré) — quatre
sur `/eng/.../rcm/<cid>` (bruit déjà connu, familles E5/F11), un sur `/portal/...` (même famille
que F9/F10/F13/F16, zéro divergence textuelle mesurable après normalisation). Vérifié par lecture
réelle des imports (règle 15, pas un grep) : aucune des deux pages ne touche le diff de cette
tranche. Non creusé plus loin (hors mandat). Un second passage sur l'arbre figé (aucune édition,
règle 34) est repassé entièrement propre — 0 incident.

**Mesuré** : `tsc --noEmit` propre ; `db:reset` propre (0179 s'applique, rejouable) ; `demo:seed`
vert sur base fraîche ; suite `vitest` complète (176 fichiers, 1377 tests, incluant
`p1-07.test.ts` — RISK-01 connu-mauvais, SAMP-01 connu-mauvais, chaîne `supersedes_id` sous
course concurrente) ; `npm run verify` COMPLET vert — **19/19 maillons** (db:reset, demo:seed,
tsc, gardes, semeur, plancher, langue(:epreuve), lectures(:epreuve), parcours(:epreuve), screens,
fumee, densite, clics — 326 étapes, 0 échec — visuel — 356 vues, 0 défaut —, screens:test,
vitest) sur l'arbre `be56148` (rejoué propre après les correctifs de revue, log
`/tmp/verify-p1-07-replay.log`). Le parcours cliqué complet (station de clôture comprise, règle
37 : cette tranche ajoute RISK-01 et SAMP-01) passe sans blocage.

---

## Phase 1 — P1-06 Supersede livré (2026-09-23)

**`0178_supersede.sql`** (§7.6 du plan maître) ferme trois chemins qui DÉTRUISAIENT ou
MUTAIENT un fait déjà écrit au lieu d'écrire une ligne NEUVE à côté (règle 28) :
1. **`extraction`** devient append-only (`forbid_mutation`, 0003) — `verifyExtraction()`
   (ladder.ts) insère désormais une ligne NEUVE (`supersedes_extraction_id` vers l'originale)
   au lieu de muter la ligne en place ; l'originale garde son `rung` d'origine et
   `status='pending_verify'` pour toujours (append-only), une valeur avant correction humaine
   qui n'était plus lisible autrement. `pendingVerifications()` exclut les lignes supersédées ;
   cinq autres lecteurs (`dashboard.ts`, `notes/otto.ts`, `notifications.ts`, `query/catalog.ts`,
   deux tests d'acceptation) audités et corrigés pour la même exclusion.
2. **`materiality.validate(adjust)`** crée désormais la version N+1 validée
   (`supersedes_id` vers la proposition) au lieu de muter la proposition en place — l'écart
   entre la proposition déterministe du moteur et l'ajustement L3 de l'auditeur redevient
   lisible après coup. Invariant tenu : au plus une ligne `validated` par dossier.
3. **`testing/grille.ts::calculerGrille()`** ne supprime plus `cell_disposition` quand une
   colonne cesse de s'appliquer (recalcul) — `couvre_encore=false` la marque orpheline, gardée
   pour mémoire ; seules les cellules purement calculées, jamais décidées par personne, sont
   encore supprimées. `cellulesDuDossier()` expose un champ `orpheline` distinct de
   `dispositionPerimee` (valeur changée) et de `disposition` (encore active).

**Hors DDL neuf (service pur)** : `fsli.rebuildFslis()` passe en UPSERT
(`on conflict (engagement_id, code) do update`), corrigeant un bogue préexistant qui remettait
silencieusement `confirmed_at` à NULL à chaque reconstruction (`confirmed_by` était préservé,
pas `confirmed_at` — un état incohérent). `processus.ts::importerProcessus()` supersède
réellement `process_model` (l'ancienne version bascule `superseded`, jamais supprimée ; ses
`process_step`/`process_ctrl` restent intacts pour l'historique ; `control.process_model_id`
est réaccroché à la version active) au lieu de `delete`-puis-recreate.

**Revue hostile, deux voix indépendantes (règle 30 — modèle de données), CONVERGENTES sans
coordination sur les deux mêmes défauts critiques :**

- **CONFIRMÉ, HAUTE, CORRIGÉ (V1-01/F1, trouvé indépendamment par les deux voix).** Une
  cellule orpheline (`couvre_encore=false`) restait comptée par `conclureLigne` comme « non
  conforme sans disposition » — `disposition` y est TOUJOURS nul par construction, donc AUCUN
  geste (redisposer, recalculer) ne pouvait jamais lever ce refus : exactement le défaut
  NOTIF-01 que la règle 37 existe pour attraper. `conclureLigne` exclut désormais les cellules
  orphelines de ses deux gardes (TEST-02, TEST-04) — une colonne qui a disparu du tirage
  courant ne doit plus jamais gater une conclusion nouvelle.
- **CONFIRMÉ, HAUTE, CORRIGÉ (V1-02/F2, trouvé indépendamment par les deux voix).**
  `couvre_encore` ne repassait jamais à `true` quand la colonne redevenait applicable (le BL
  re-demandé, par exemple) — l'écran continuait de dire « ne fait plus partie du tirage
  courant » sur une cellule pourtant vivante (règle 13). `calculerGrille()` réactive
  désormais `couvre_encore` pour toute cellule réécrite par le run courant ; `disposerCellule`
  le pose à `true` en défense en profondeur.
- **CONFIRMÉ, MOYENNE, CORRIGÉ (V1-04, voix 1).** `materiality.validate()` et
  `processus.ts::importerProcessus()` lisaient puis écrivaient sans CLAIM atomique — deux
  appels concurrents (double clic, deux onglets) pouvaient laisser respectivement ZÉRO ligne
  `validated` au dossier (plus aucun seuil pour le sondage/scoping) ou un cycle SANS AUCUNE
  version active de processus. Les deux séquences sont désormais un CLAIM (`update … where
  status = 'proposed'/'active' returning id`, refusé si 0 ligne) dans une transaction (`tx()`).
  Trois tests de course (`Promise.allSettled`) le prouvent.
- **CONFIRMÉ, MOYENNE, CORRIGÉ (F3, voix 2).** `verifyExtraction` posait `rung='human'` en
  dur sur la ligne neuve au lieu de porter l'échelon d'origine — `human` désigne dans l'échelle
  une pièce saisie ENTIÈREMENT à la main (5e échelon), pas « un humain a vérifié » ; une pièce
  OCR vérifiée mentait sur sa provenance (P7) partout où `rung` est lu, et se contredisait avec
  `ai_run_id` porté sur la même ligne. Corrigé (`rung` porté depuis l'originale) — a cassé deux
  assertions d'acceptation qui comptaient `rung='ocr'`/`status<>'verified'` SANS exclure les
  lignes supersédées (`s8.test.ts`, `tests/acceptance.full.test.ts`), corrigées avec la même
  exclusion que le reste de la tranche.
- **CONFIRMÉ, MOYENNE, CORRIGÉ (V1-03/F6, voix 1).** `notes/ancres.ts` (les cas
  `process_model`/`process_step`) ne filtrait pas `status='active'` — une note ancrée pouvait
  résoudre vers la version SUPERSÉDÉE au hasard de l'ordre SQL dès qu'un cycle avait été
  remplacé une fois.
- **CONFIRMÉ, BASSE, CORRIGÉ (V1-05, voix 1).** `verifyExtraction` acceptait de vérifier une
  ligne déjà supersédée (le statut de la ligne d'origine ne change jamais, donc un contrôle
  naïf sur `x.status` ne peut PAS le détecter — piège trouvé en écrivant le test de ce chemin) :
  refus ajouté sur l'existence d'une ligne qui la supersède déjà, plus un index unique
  `extraction_supersedes_once` (0178) comme filet contre la vraie course.
- **CONFIRMÉ, BASSE, CORRIGÉ.** `notes/otto.ts` comptait les lignes « vérifiées » par
  `count(*)` au lieu de `count(distinct evidence_id)` — même bogue que celui déjà corrigé pour
  « extraites », découvert par la même revue.

**Trouvé en cours de route, sans rapport avec cette tranche, corrigé au passage (règle 13) :**
`docs/GUARDS.md` avait divergé de `src/lib/gardes/registre.ts` depuis les commits P1-04/P1-05
(G-28 à G-33 jamais re-figés dans le fichier commité) — le maillon `gardes` de `verify` était
rouge sur `main` avant même cette tranche. Régénéré (`npm run gardes -- --figer`), rien d'autre
touché.

**Mesuré** : `tsc --noEmit` propre ; `db:reset` propre (0178 s'applique, rejouable) ;
`demo:seed` vert sur base fraîche ; suite `vitest` complète (174 fichiers, 1365 tests, incluant
`p1-06.test.ts` — extraction append-only + trigger connu-mauvais, materiality adjust-supersede,
fsli upsert-confirmed_at, process_model supersede + réaccrochage de contrôle, et cinq tests de
course) ; `npm run verify` COMPLET vert — **19/19 maillons** (db:reset, demo:seed, tsc, gardes,
semeur, plancher, langue(:epreuve), lectures(:epreuve), parcours(:epreuve), screens, fumee,
densite, clics — 326 étapes, 0 échec — visuel — 356 vues, 0 défaut —, screens:test, vitest) sur
l'arbre `7a14b0d`. Le parcours cliqué complet (station de clôture comprise, règle 37 : cette
tranche change deux codes de refus existants — TEST-02/TEST-04 — et en ajoute trois nouveaux
liés à la course concurrente) passe sans blocage.

---

## Phase 1 — P1-05 Verrou générique livré (2026-09-23)

**`0177_verrou_generique.sql`** (§7.5 du plan maître, renumérotée) : confirme les 21 tables
`garde_proposee` de 0042 (jamais confirmées depuis le 2026-09-03) + `verification_check`
(`journal` → `garde` : append-only depuis 0003, mais un dossier scellé pouvait encore recevoir un
relevé de vérification NEUF — deux refus distincts sur la même table, `reason` du registre
réécrite pour le dire) — 22 tables, même fonction `assert_engagement_unlocked()` (0003, inchangée),
même patron de boucle `do $$ ... $$`. Étend la discipline à une catégorie que 0042 n'avait jamais
vue : 16 tables FILLES sans colonne `engagement_id` directe (`signoff.workpaper_id`,
`match.sample_item_id`, etc.), gardées par une fonction NEUVE `assert_engagement_unlocked_via()`
(`tg_argv[0]` = colonne FK, `tg_argv[1]` = requête paramétrée résolvant `engagement_id`) — 16
lignes neuves au registre, jamais vues par l'audit d'origine.

**Gardes** : G-32 (`match`, résolution à DEUX sauts — sample_item → sample → engagement, le cas le
plus complexe du mécanisme neuf) et G-33 (`signoff` — l'INSERT restait ouvert sur un dossier scellé
malgré `forbid_mutation` sur UPDATE/DELETE) ; G-09 (existante, 0003) mise à jour pour nommer 0177.
`couverture-verrou.test.ts` (NOUVEAU, séparé de `rls-couverture.test.ts` — sujet SANS RAPPORT
malgré le mot commun « couverture », voir décision de périmètre ci-dessous) : toute table à
`engagement_id` a un verdict, aucun verdict ne reste `garde_proposee`, tout `garde` porte un
déclencheur réel SUR CETTE TABLE. Lecture `/api/sante` neuve : « verrou : tables couvertes = tables
à couvrir ».

**Revue hostile, deux voix indépendantes (règle 30 — modèle de données + sécurité) :**
- **CONFIRMÉ, HAUTE, CORRIGÉ.** Le premier jet de `0177_verrou_generique.sql` et de
  `couverture-verrou.test.ts` affirmaient tous deux « décision consignée dans STATUS.md (P1-05) »
  AVANT que cette entrée n'existe — une affirmation non vérifiée (règle 13). Cette entrée EST
  cette consignation ; l'affirmation est maintenant vraie.
- **CONFIRMÉ, MOYENNE, CORRIGÉ.** `couverture-verrou.test.ts` vérifiait qu'un déclencheur de ce
  NOM existait QUELQUE PART dans la base (`pg_trigger` sans jointure sur la table cible) — jamais
  qu'il était posé sur LA BONNE table. Un `foo_lock_guard` posé par erreur sur `bar` aurait fait
  passer un verdict `garde` sur `foo` sans déclencheur réel. Sans conséquence aujourd'hui (les 38
  déclencheurs de 0177 sont soit engendrés par `format()` avec le même identifiant des deux côtés,
  soit écrits à la main et relus un par un), mais le test affirmait plus qu'il ne vérifiait. Les
  deux `it()` de couverture rejoignent maintenant `r.relname` au `table_name` attendu.
- **CONFIRMÉ, MOYENNE, CORRIGÉ.** Le `reason` d'origine de `verification_check` (0042 : « ajout
  seul ») restait affiché tel quel après le passage à `garde` — vrai pour `forbid_mutation`
  (UPDATE/DELETE), mais plus toute la vérité une fois l'INSERT aussi fermé. Réécrit pour nommer
  les deux refus.
- **CONFIRMÉ, BASSE, CORRIGÉ.** `assert_engagement_unlocked_via()` ne documentait pas son
  comportement quand la colonne FK est NULL (elle laisse passer, comme `assert_engagement_unlocked()`
  le fait déjà pour `engagement_id` absent) — mort aujourd'hui (les 16 colonnes utilisées sont
  toutes `not null`, vérifié une par une contre le DDL réel par les deux voix, indépendamment),
  mais non nommé (règle 19). Commentaire ajouté dans la fonction.
- **CONFIRMÉ, MOYENNE, ACCEPTÉ SANS CORRECTIF (proportionnalité, règle 30).** Les 22 tables
  confirmées par le premier bloc (fonction inchangée depuis 0003, déjà prouvée par G-09) et 14 des
  16 tables filles ne sont éprouvées par AUCUNE garde du registre — seulement par la PRÉSENCE de
  leur déclencheur (`couverture-verrou.test.ts`), jamais par un REFUS réel (règle 17). Les deux
  voix, indépendamment, jugent le risque marginal faible (même fonction déjà prouvée, noms de
  table vérifiés un par un contre le schéma par les deux voix) et le disent honnêtement dans
  `stops_looking` — étendre le nombre de gardes au-delà de G-32/G-33 est reporté, pas oublié.
- **CONFIRMÉ, MOYENNE, DÉCISION CONSIGNÉE (pas un correctif de code).** Les 37 lignes touchées par
  0177 (21 mises à jour + 16 insérées) passent directement à `verdict='garde'` avec un déclencheur
  RÉEL posé dans LA MÊME migration, mais `confirmed_by`/`confirmed_at` restent NULL — le chemin de
  confirmation humaine que 0042 avait prévu (une UI de revue qui n'existe pas encore) n'est pas
  emprunté. La contrainte `lock_verdict_confirmation_is_whole` n'est pas violée (NULL/NULL est une
  paire valide) et le plan du fondateur (§7.5) demande LITTÉRALEMENT `confirmed_by = null` pour
  cette opération — lu comme : la migration elle-même, commitée sous mandat, EST la confirmation ;
  sa provenance vit dans git (l'auteur, la date, le mandat cité), pas dans ces deux colonnes.
  Aucun chemin de lecture ne pourra jamais dire QUI a confirmé PAR CE CHAMP pour ces 37 lignes —
  une limite réelle, désormais écrite ici plutôt que silencieuse.

Décision de périmètre (déjà citée par le code avant cette entrée, règle 13 corrigée ci-dessus) :
le texte du plan §7.5 suggérait de renommer/réutiliser `rls-couverture.test.ts` pour ce sujet —
jugé être une coquille après lecture intégrale du fichier (RLS policies, aucun rapport avec un
verrou de dossier) par les deux voix, indépendamment. `rls-couverture.test.ts` reste intact ;
`couverture-verrou.test.ts` est un fichier séparé.

**Mesuré** : `tsc --noEmit` propre ; `db:reset` propre (0177 s'applique, rejouable — vérifié sans
collision de nom de déclencheur contre TOUTE la base de migrations par la voix 2) ; `demo:seed` +
`demo:enrichir` verts sur base fraîche (aucun dossier verrouillé dans ces flux, donc pas de faux
refus — confirmé) ; suite `vitest` complète (1347 tests) passée avec un seul échec SANS RAPPORT
(cohérence backlog/fils.json — R146 manquait dans `docs/instantanes/fils.json`, corrigé) ; sweep
ciblé post-corrections (couverture-verrou, gardes, reprise, rls-couverture) : 77/77 verts, G-32/G-33
prouvées en deux passes.

---

## Phase 1 — P1-04 Visa livré (2026-09-23)

**`0176_visa.sql`** (§7.4 du plan maître, renumérotée — bande 0170+ déjà consommée par P1-01/02/03
et leurs correctifs ; contenu et ordre du plan conservés, seul le numéro glisse, règle 26) :
`signoff` gagne `sections_hash` ; trois déclencheurs `before insert on signoff` (VISA-01 unicité
`(workpaper_id, sign_role)`, VISA-02 `user_id` distinct des visas déjà posés, VISA-03 rôle —
`reviewer` exige `eng_role in ('manager','partner')`, `partner` exige `can_sign`) ; `engagement_member`
gagne le déclencheur EQUIPE-01 (`before update of eng_role, can_sign` exige
`otto.acteur_role in ('manager','partner')`, posé par `withActeur()` — nouveau, `lib/db/acteur.ts`,
même patron que `withTenant`).

**Service** : `workpapers/lifecycle.ts::signWorkpaper` — VISA-01/02/03 côté service (refus nommés,
AVANT le déclencheur SQL), calcule `sections_hash` à chaque visa ; `etatDuVisa(workpaperId)` →
`{signe, perime, motif}`, une lecture unique (REV-01 : hash amont recalculé vs `based_on_hash` ;
autres codes : signal plus grossier, `version` plus récente) ; `editSection` refuse (VISA-04) dès
qu'un signoff existe, pas seulement `status === 'signed'`. `workpapers/draft.ts::
currentBasedOnHashRevenue` — extrait de `draftRevenueWorkpaper`, calcule le hash amont sans
redraft. `team.ts::assignMember`, `retention.ts::closeFile` — voir revue hostile ci-dessous.
`scripts/backfill-signoff-hash.ts` (ponctuel, jamais dans `migrate()`) pour les lignes `signoff`
antérieures sur la base réseau. Lecture `/api/sante` neuve : « visas : sections_hash posée sur
chaque signoff ». Quatre gardes neuves (G-28..G-31, `gardes/registre.ts`), chacune en deux passes
(attaque + neutralisation ciblée) — deux itérations avant que G-28/G-29 isolent correctement leur
déclencheur (la première version de chaque attaque trippait un déclencheur VOISIN, jamais celui
visé ; corrigé en choisissant soigneusement quels acteurs signent dans chaque attaque). 12 tests
`p1-04.test.ts`.

**Revue hostile, deux voix indépendantes (règle 30 — tranche modèle de données + sécurité +
multi-tenant + code de refus) :**
- **CONFIRMÉ, HAUTE, CORRIGÉ.** Élévation de privilège réelle et atteignable par l'écran :
  le déclencheur EQUIPE-01 ne garde que l'UPDATE (04 §1 littéral) — l'INSERT (première affectation)
  restait sans AUCUN contrôle de rôle, et `team/page.tsx::assignAction` n'appelle que
  `requireMember` (appartenance, jamais rôle). N'importe quel membre actif (staff compris) pouvait
  affecter un COLLÈGUE JAMAIS ENCORE MEMBRE en `partner`+`can_sign`. Fermé dans
  `team.ts::assignMember` : le même contrôle manager/partner que l'UPDATE s'applique désormais à
  l'INSERT, SAUF le bootstrap d'un dossier encore sans aucun membre où la personne s'affecte
  elle-même (le seul cas réel, `flows/prior-year.ts` — jamais atteignable par l'écran, qui exige
  déjà une adhésion active). Testé (`p1-04.test.ts`, nouveau cas), revalidé par `demo:seed` +
  `demo:enrichir` intégralement verts sur base fraîche.
- **CONFIRMÉ, HAUTE, CORRIGÉ.** `etatDuVisa()` était un objet mort : calculée mais rendue nulle
  part (`grep` sous `src/app` : zéro appelant). Câblée dans
  `eng/[id]/workpapers/[wid]/page.tsx` — un badge rouge « visé — périmé (motif) » apparaît quand
  `signe && perime`. Confirmé vivant par la mesure, pas supposé : le monde réenrichi affiche
  désormais « A-05 → perime … 1 visa(s) périmé(s) en en-tête » dans la sortie de
  `demo:enrichir`.
- **CONFIRMÉ, FAIBLE, CORRIGÉ.** VISA-01 (unicité de rôle, refus service) n'avait pas le préfixe
  `VISA-0X :` que portent ses trois voisins — `app/refus.ts::separerCode` ne le mettait donc pas en
  petit à l'écran comme les autres. Préfixé.
- **CONFIRMÉ, MOYENNE, REPORTÉ (R146).** `signWorkpaper` n'est pas transactionnelle : fenêtre
  TOCTOU entre la lecture de `sections` et l'insertion du signoff, non-atomicité insert/update.
  Sans impact aujourd'hui (`sections_hash` n'a encore aucun lecteur qui le COMPARE — seul `/api/sante`
  teste sa non-nullité) ; le correctif correct (verrou de ligne des deux côtés, `editSection`
  compris) attend un premier lecteur réel du champ (Phase 3, plan maître §8). Détail complet dans
  `docs/BACKLOG_REPORTE.md`.
- Rien trouvé (les deux voix, indépendamment) : fuite tenant/engagement, contournement de
  `workpaper.status` hors `signWorkpaper`, idempotence du backfill, cohérence `security invoker`,
  régression sur `editSection`.

Décision de périmètre : `team.ts::assignMember` était déjà nommé dans le plan §7.4 (wiring
`withActeur()`) — construit dans cette tranche plutôt que reporté à P2-02, la revue hostile ayant
montré que différer aurait laissé le trou d'élévation ouvert un tour de plus.

**Mesuré** : `tsc --noEmit` propre ; sweep ciblé 155/155 tests verts (p1-04, team, workpapers,
retention, gardes, retardataires, obstacles, carryforward, acceptance) ; `db:reset` propre (0176
s'applique) ; `demo:seed` + `demo:enrichir` intégralement verts sur base fraîche, 10/10 étapes.

**`npm run clics` (règle 37) — deux faux négatifs avant la mesure correcte, cause trouvée, pas
devinée.** Un premier passage (base `db:reset` + `demo:seed` + `demo:enrichir`) a rendu 12 échecs
dispersés sur des stations SANS RAPPORT avec P1-04 (notes, processus, rcm) en plus de la station
visa elle-même — un second passage identique en a rendu bien plus (cascade). §6 de ce fichier dit
littéralement la précondition de `clics` : « `db:reset && demo:seed` d'abord » — SANS
`demo:enrichir`. En ajoutant `demo:enrichir` (utile pour valider le service, fait plus haut), la
base portait déjà des descriptions de processus et des décisions que le PROPRE scénario de `clics`
s'attend à poser lui-même — la station « processus : la différence N/N-1... » trouvait 0
changement à statuer (déjà statués par `enrichir.ts`) et la cascade suivait. **Troisième passage,
précondition EXACTE (`db:reset` + `demo:seed`, sans enrichir) : 0 échec, 326 étapes conduites, 325
stations figées vérifiées, aucune station figée non atteinte.** La station « papier : les trois
visas se posent dans l'ordre de la hiérarchie de revue » — celle qui exerce VISA-01..03 par le
produit — passe (`ok`). `docs/CLICS.md` regénéré, identique au précédent (aucune nouvelle
gestuelle cliquée par P1-04).

---

## Mandat 2026-09-23 — trois corrections permanentes (règle 26 mécanique, R142 fermé), avant P1-04

**Correction 1 (ADR-137) : cause mécanique de R143/R145 corrigée à la racine.** Les déploiements
d'APERÇU Vercel appliquaient `migrate()` à la base réseau partagée sur CHAQUE push, WIP compris —
exactement ce qui a fait éditer 0170 (R143) puis 0174 (R145) après application, le même jour. Le
projet `otto-dit` porte désormais un « Ignored Build Step » (`[ "$VERCEL_GIT_COMMIT_REF" !=
"main" ]`), posé par `mcp__Vercel__update_project` et VÉRIFIÉ par le comportement réel : un
commit docs-only poussé sur la branche de session a produit un déploiement `CANCELED`, arrêté
avant `npm install`/`migrate()` (journal de build lu, pas supposé).

**Correction 2 (P0-09) : R142 fermé, pas seulement re-disjoint une quatrième fois.** `tests/
screens.test.ts` (le crash intermittent déjà rencontré en P1-02 et deux fois en P1-03, toujours
« disjoint » mais jamais réparé) est désormais exclu du `vitest run` général et tourne seul, sous
`vitest.screens.config.ts`/`npm run screens:test`, son propre maillon dans `scripts/verify.ts` et
`verifier.yml`. Revue hostile une voix (harnais, règle 30) : cinq constats réels (F1-F5, détaillés
dans le commit), tous corrigés — dont CLAUDE.md lui-même, qui affirmait encore que `npm test`
couvre le balayage. **Deux passages `verify` complets consécutifs, 19/19 maillons verts chacun,
aucune ligne « aléa connu »** — mesuré, pas déclaré. R142 fermé dans le registre.

**Correction 3 : les numéros de migration du plan restent indicatifs.** Consigné, pas de code à
ce sujet — la bande 0170+ glisse d'autant que les correctifs d'urgence la consomment (0171/0173/
0175 déjà pris), jamais renuméroté après application.

Mandat commité verbatim : `docs/MANDATS/2026-09-23_mandat_continuation_phase1_corrections.md`.
SHA servi de P1-03 (`dad1111`) confirmé en tête de ce tour via `/api/sante` (règle 27) ; le gap de
`docs/instantanes/servi.json` pour `ec17511` (R143) comblé au passage, sans horodatage inventé
(règle 31).

---

## Phase 1 — P1-03 Processus et contrôles livré et MESURÉ (2026-09-22)

**`0174_processus_et_controles.sql`** (§7.3 du plan maître, renumérotée — 0172/0173 déjà
consommées par P1-02 et le correctif R143) : `process_model` gagne `code` (stable, indépendant du
cycle_ref/exercice), `fsli_code`, `status` actif/supersédé, `supersedes_id`,
`client_flowchart_evidence_id`, `origine` ; `process_step` gagne `proposition_id`, `pictogramme` ;
`control` gagne `process_model_id` (rattaché par nom normalisé, migration de données — NO-OP
mesuré sur ce dépôt, aucun nom ne coïncide entre RCM et processus importés) ; `control_fsli`, la
vraie table de scoping poste↔contrôle ; `risk.level` devient nullable, mis à `null` pour les lignes
existantes issues d'un import RCM (AUD-03, « automatisation factice retirée » : le niveau ne se
déduit plus d'un drapeau `is_key`) ; cinq FK cascade passées en `restrict` (04 §1).

**Service** : `processus.ts` — `FSLI_DU_CYCLE` (constante TS figée) retirée, remplacée par
`fsliDuCycle()` (lecture en base) et un paramètre `fsliCode` explicite sur `importerProcessus` ;
`processusDuPoste`, `deposerFlowchartClient` (ETANCH résoudre-puis-vérifier) ajoutés. `sox.ts` —
`lierControleAuPoste` (le geste explicite de rattachement, upsert sur `(control_id, fsli_code)`),
`importRcm` cesse d'écrire un niveau de risque déduit, backfille `control_fsli` depuis une colonne
CSV optionnelle `fsli`. `poste.ts` — `controlesDuPoste`. Lecture `/api/sante` neuve : « risque :
niveau non déduit d'un drapeau RCM ». Quatre décisions de périmètre consignées (R144) : pas de
colonne `systeme` redondante sur `process_step` (déjà `system_name`, 0027) ; `process_interview`
remplacé par `interview_participant` dans la liste des cascades restrict (coquille du plan) ;
`fsliCode` explicite au lieu d'une constante devinée ; gap RLS `control_fsli` trouvé par
`rls-couverture.test.ts` et corrigé.

**R145 — incident sérieux, corrigé dans la foulée.** En vérifiant l'application réelle de 0174
avant d'y toucher pour un correctif de commentaire, découverte d'une RÉPÉTITION, dans cette même
tranche, de l'incident R143 (règle 26) : un push WIP avait déclenché un déploiement d'aperçu qui a
réellement appliqué 0174 (sans le bloc RLS `control_fsli`, ajouté ensuite par une édition EN PLACE
du même fichier) à la base réseau de démonstration — `migrate()` a refusé, comme conçu, les deux
déploiements suivants. Vérifié par requête DIRECTE contre la base réseau (Supabase MCP, jamais par
inférence), pas seulement lu dans un journal de build. Corrigé par le même mécanisme que R143 :
0174 restaurée octet pour octet à son contenu appliqué ; le bloc RLS et la correction de
commentaire (REFUT2-03) re-portés en avant dans `0175_control_fsli_rls.sql`, jamais réédités dans
0174. Aucun des sept déploiements de la tranche n'a jamais réussi — rien n'a été servi sur ce SHA
avant ce correctif.

**Deux réfutateurs indépendants** (règle 30, modèle de données/multi-tenant) ont trouvé : HIGH
(voix 2) — `lierControleAuPoste` mutait l'état sans écrire `event_log` (provenance, règle 3),
reachable via `bootstrapSox`, corrigé + assertion directe ajoutée à `p1-03.test.ts` ; MEDIUM
dormant (voix 2) — `importerProcessus` ne détachait pas `control.process_model_id`/
`process_model.supersedes_id` (FK sans cascade posées par la même migration) avant de supprimer
l'ancien `process_model`, NO-OP mesuré aujourd'hui (aucun chemin n'écrit encore ces colonnes) mais
une mine pour la suite — désamorcée ; LOW documentation (voix 2) — commentaire de 0174 décrivant un
mécanisme de rattachement qui n'existe pas, corrigé dans 0175 (0174 étant désormais immuable) ;
MEDIUM (voix 1) — message de refus d'`entretiens.ts::statuerEcart(factor)` ne distinguait pas
« cycle hors taxonomie » de « processus pas encore importé pour ce dossier », précisé.

**`npm run verify` : deux passages complets.** Premier passage (arbre `015d121`) ROUGE au maillon
`vitest` avec TROIS échecs : un correctif RÉEL trouvé (`tests/parcours.test.ts`, hors `app/` donc
jamais vu par `tsc --noEmit`, appelait `importerProcessus` sans `fsliCode` — oubli lors du retrait
de `FSLI_DU_CYCLE` — corrigé) et un `ServeurTombe` sur `tests/screens.test.ts`. Second passage
(arbre `d6ec94a`, après correctif) ROUGE uniquement sur ce second symptôme, à une route DIFFÉRENTE
(`/eng/[id]/testing` après 52 routes, contre `/eng/[id]/suivi (SOX)` après 94 routes au premier
passage) — disjonction établie, pas supposée : un passage isolé de `tests/screens.test.ts` seul
passe vert (2/2, 462 s), aucune des deux routes de crash n'importe rien touché par cette tranche.
C'est une réapparition de R142 (P1-02), sous la forme non couverte que cette entrée prédisait
elle-même — consignée là, pas refermée. `tsc --noEmit` propre, `npm run gardes` propre (47
gardes), le sweep ciblé (8 fichiers, 51 tests) vert après chaque correctif.

**Décision d'expédition** : même patron que P1-02 (trois passages, trois défauts pré-existants
différents, jamais deux fois le même) — le seul défaut attribuable au diff de cette tranche
(`tests/parcours.test.ts`) est corrigé et confirmé ; le défaut restant est disjoint, mesuré comme
tel deux fois de façon indépendante, et déjà tracé sous un fil ouvert séparé (R142) qui prédisait
exactement cette forme de réapparition.

---

## Phase 1 — P1-00 et P1-01 livrés et MESURÉS VERTS (2026-09-22)

**Phase 0 expédiée** (`572e9d9`, fusion rapide sur `main`) : SHA servi confirmé par le job CI
`deploye` (« le SHA poussé doit être servi dans les 15 minutes », réussi 07:59:22Z–08:02:35Z).

**P1-00** (`c32e268`) — `migrate()` transactionnel par fichier, sur les deux pilotes (PGlite
`.exec()` natif, node-postgres via une connexion dédiée) : un second ordre qui échoue n'applique
ni le premier ni la ligne `_migrations` (cas connu mauvais, `migrate.test.ts`).

**P1-01** (`ea98c68` puis correctifs `22f93dc`) — `proposition` (migration 0170) : table +
verrou + RLS + `valeur_proposee` figée + backfill SQL des quatre familles déjà connues de
`notifications.ts` (materiality/deficiency/walkthrough_gap/extraction_field). Service générique
(`proposer`/`accepter`/`modifier`/`refuser`/`perimer`/`enAttente`/`parObjet`), quatre applicateurs
branchés sur les fonctions de décision existantes, neuf types catalogués non branchés (PROP-03,
R136). Lecture `/api/sante` « propositions » : parité mesurée contre NOTIF-01.

**Deux réfutateurs indépendants** (rule 30, modèle de données) ont trouvé, entre eux, un défaut
CRITIQUE (la lecture `/api/sante` ne pouvait jamais rougir sur son propre défaut de régression —
`resoudreParObjet()` corrige, câblée dans les QUATRE fonctions de DÉCISION, pas seulement les
quatre de CRÉATION), une course (TOCTOU sur `accepter/modifier/refuser`, fermée par une
réclamation atomique `where status='proposee'` avant l'applicateur), un rôle manquant sur
`refuser()`, un risque de FK sur le backfill, et un trou d'étanchéité que l'instrument automatique
(`etancheite-executee.test.ts`) a lui-même trouvé dans le correctif du premier défaut — tous
corrigés, R137/R138 consignés pour les limites qui restent (frontière de confiance documentée,
pas gardée par une fonction tierce sans exploitant réel).

**`npm run verify` — deux passages complets** : le premier a rougi sur `vitest`
(`tests/screens.test.ts`, « le serveur est tombé après 97 route(s), à `/eng/[id]/workpapers
(SOX)` ») — le défaut R58 déjà documenté onze fois (docs/BACKLOG_REPORTE.md), jamais tracé à un
changement de code ; disjonction vérifiée par lecture des imports (pas supposée), isolé
`tests/screens.test.ts` seul PASSE (1/1, 461,5 s). Le second passage complet, sur le même arbre :
**VERT — 18/18 maillons, 167/167 fichiers, 1307/1307 tests** (`docs/instantanes/verify.json`).

**Expédié** : `82b9f6a`, fusion rapide sur `main` (`572e9d9..82b9f6a`). SHA servi à confirmer en
tête du prochain tour (règle 36).

### P1-01 correctif — alignement sur le DDL normatif §7.1 (migration 0171, 2026-09-22)

**Trou de procédure trouvé en recherchant P1-02, pas signalé par le fondateur** : `docs/MANDATS/
2026-09-20_plan_maitre_phase2.md` §7 dit l'esquisse SQL de chaque tranche 017x « normative pour
les noms et les contraintes » — 0170 avait été écrite depuis la description de tâche (§426-433)
seule, jamais croisée avec §7.1 avant expédition. **R139** (docs/BACKLOG_REPORTE.md) : la leçon
vaut pour toute tranche 0172-0178 à venir — lire le §7.x exact AVANT d'écrire le SQL, jamais après.

**`0171_proposition_alignement_spec.sql`** (ALTER en avant, 0170 jamais réédité — règle 26) :
ajoute `section_id`/`note_id` (toujours NULL, tranches futures), `source_kind`/`engine_run_id`
(rétro-remplis pour materiality/deficiency, structurellement NULL pour walkthrough_gap/
extraction_field — ces pipelines ne créent jamais de ligne `engine_run`), `niveau_automatisation`
(NOT NULL DEFAULT `'L2'`, la seule valeur jamais posée, vérifiée contre `notifications.ts::
NIVEAU_ACTUEL`), `tenant_id` (rétro-rempli par jointure, RLS non réécrite — prouvée équivalente à
`otto_engagements()`) ; renomme `motif`→`decision_reason` ; remplace `proposition_decision_is_whole`
par `proposition_decision_coherente` (exige désormais `decided_by`/`decided_at` sur TOUTE sortie
de `'proposee'`, `'perimee'` comprise) — `perimer()` exige donc maintenant un `userId` réel.
`object_id` reste `uuid` (pas `text`), reporté et argumenté dans l'en-tête de la migration, pas
corrigé en silence (règle 13).

**Deux réfutateurs indépendants** (règle 30, modèle de données), un second rituel sur ce même
correctif :
- **Voix 1** : finding HIGH — `perimer()`, dans un premier correctif, chargeait la ligne AVANT
  de vérifier l'appartenance (`charger()` puis `assertMembre`), contredisant le doctrine
  ETANCH-04 (« résoudre puis vérifier, jamais charger puis vérifier ») que `accepter`/`modifier`/
  `refuser` respectent déjà — corrigé (`assertMembreDe` en premier). Finding MEDIUM-HIGH — la
  nouvelle contrainte `proposition_decision_coherente` valide contre les lignes existantes sans
  argument écrit de sécurité — corrigé (en-tête de migration : `perimer()` n'a jamais eu
  d'appelant hors de son propre test, vérifié par grep, donc aucune ligne `'perimee'` à
  `decided_by` nul ne peut exister sur une base persistante). Finding LOW-MEDIUM — le test
  `perimer()` ne testait pas ce que son nouveau paramètre permet — corrigé (assertions
  `decidedBy`/`decidedAt`/`decisionReason` renforcées, nouveau test ETANCH-03 dédié). Deux
  findings LOW non corrigés (documentation seulement, jugés non prioritaires) : le piège
  d'auto-dérivation de `sourceKind`, et l'absence de mention du CHECK sur `object_type` à côté
  de `object_id` dans la liste des différences conservées.
- **Voix 2** : finding — `niveau_automatisation` reposait uniquement sur le DEFAULT SQL, découplé
  de `notifications.ts::NIVEAU_ACTUEL` — corrigé (`proposer()` le passe désormais explicitement).
  Finding — l'en-tête de la migration affirmait `engine_run_id` rétro-lié pour les QUATRE
  familles, faux pour walkthrough_gap/extraction_field (vérifié : aucun `insert into engine_run`
  dans ces deux fichiers, sur treize sites d'écriture au total) — corrigé (en-tête réécrit).
  Findings restants : un risque à terme (perimer() sans appelant aujourd'hui reste un risque
  documentaire, pas actionnable maintenant) et cette entrée STATUS.md elle-même (finding
  informationnel — fermé par le paragraphe que vous lisez).

**Suite ciblée** (14 fichiers, 170/170 tests) et suite complète `src/lib` (114/114 fichiers,
1030/1030 tests) — VERTES, `REAL_EXIT=0` mesuré depuis le contenu du journal (jamais depuis le
résumé de tâche de fond, règle 35/F24).

**`npm run verify` complet — trois passages, sur trois arbres successifs de ce correctif** (règle
34 : chaque édition entre deux passages invalide le précédent, jamais mesuré sur un arbre qui
bouge) :
1. `734bd8d` — ROUGE au maillon `vitest` : `tests/screens.test.ts`, R58/ServeurTombe (serveur
   tombé après 82 route(s), à `/eng/[id]/obstacles (SOX)`, une onzième route distincte).
   Disjonction vérifiée (aucun import commun avec ce correctif), isolé `tests/screens.test.ts`
   seul PASSE (1/1, 2/2). Documenté dans R58 (docs/BACKLOG_REPORTE.md).
2. `88a42eb` — ROUGE au maillon `clics` : 1 seul échec sur 325 stations, « mes travaux : le
   bandeau y mène depuis n'importe quel écran, en 1 clic » (446/447 clics). Deux tentatives
   d'isolement (`db:reset && demo:seed && npm run clics` seul) ont chacune subi un crash
   Playwright complet (« browser has been closed »), un symptôme absent du passage complet et
   jamais lié à ce correctif — R140 (docs/BACKLOG_REPORTE.md).
3. `7ca23a6` — ROUGE au maillon `clics`, EXACTEMENT la même station, à nouveau seule (446/447
   clics), sans crash navigateur cette fois ; `screens` (137,8s) PASSE dans ce même passage — le
   R58 du premier passage ne récidive pas. Disjonction vérifiée à trois niveaux (fichiers du
   correctif absents des imports de `layout.tsx`, `travaux/page.tsx`, `scenario.ts` ; ces trois
   fichiers byte pour byte identiques au SHA `82b9f6a` où ce même `clics` passait 447/447) —
   **aucun mécanisme causal identifié reliant ce correctif au symptôme**, malgré une recherche
   directe (imports, requêtes SQL, rendu du bandeau). Reconduit et non fermé dans R140 : un
   chantier futur doit soit rendre cette station plus robuste, soit profiler directement la cause.

**Ce qui a réellement tourné, sans plus (règle 13)** : `clics` arrêtant la chaîne aux DEUX
derniers passages, `visuel`/`plancher`/`vitest` (le maillon de la chaîne — `tests/screens.test.ts`
compris, PAS la suite ciblée `src/lib` mesurée séparément ci-dessus) **ne se sont pas exécutés**
lors de ces deux passages — `docs/instantanes/verify.json` le dit explicitement (« 3 non
exécuté(s) »), pas supposé vert par défaut.

**Décision d'expédition** : ce correctif est expédié malgré ce troisième passage rouge sur une
seule station de `clics`, jamais liée par aucun mécanisme trouvé à `propositions.ts`/la migration
0171. Règle 30 (proportionnalité) : l'effort de vérification déjà consenti (trois passages
complets, deux isolements, lecture directe de tous les fichiers du chemin) dépasse ce qu'exige un
défaut désormais prouvé disjoint — un chantier séparé (R140) porte la suite.

**Expédié** : voir le commit qui suit pour le SHA de fusion sur `main`.

---

## Phase 1 — P1-02 Sections et notes livré et MESURÉ (2026-09-22)

**`0172_sections_et_notes.sql`** (§7.2 du plan maître) : `section_state.kind` élargi aux 35
valeurs (`poste`, `papier`, 10× `poste.*`, 22× `mission.*`, `controle`) ; `review_note.section_id`
(FK, `on delete restrict`) ; `anchor_kind` élargi de `ecran`/`deviation` (retirés) à 16 natures
réelles (`papier`, `analytique`, `process_model`, `process_step`, `control`, `control_task`,
`assertion_risk`, `transcript`, `proposition`, `fs_line`, plus les 6 déjà connues) ; migration de
données en quatre étapes (a/b/c/d) qui ré-ancre chaque note existante et lui assigne une section ;
contrainte `review_note_audit_ancree` (une note d'audit s'ancre toujours). Service `sections.ts`
(`cleDeSection`, `sectionPourNote`, `sectionsDuPoste`), nouveau module `notes/notes.ts`
(`poserNote`, `notesDeSection`, `hrefDeNote` — résolveur unique remplaçant `ecranPorteur` de
`notes/page.tsx` et la clé d'écran de `lifecycle.ts`), 10 nouveaux résolveurs d'ancre dans
`ancres.ts`. Lecture `/api/sante` « sections et notes » : `count(review_note where scope='audit'
and section_id is null)` doit rester à 0.

**Deux réfutateurs indépendants** (règle 30, modèle de données) ont trouvé :
- **CRITIQUE (voix 2)** : le CHECK `anchor_kind` était élargi APRÈS les UPDATE qui écrivent
  `anchor_kind='papier'` dans la migration — cassait sur toute base avec des notes flottantes
  préexistantes (invisible sur `db:reset`, table vide). Déplacé avant la migration de données.
  Vérifié empiriquement : reproduit le scénario exact (note flottante réelle sur une base aux
  migrations arrêtées à 0171), rejoué 0172 corrigée via le même mécanisme que `migrate.ts`
  (`conn.exec()` sur le fichier complet) — succès, note ré-ancrée correctement.
- **HIGH (voix 2)** : `sectionPourNote()` et l'auto-ancrage de `addReviewNote()` résolvaient un
  `workpaper_id` (champ caché de formulaire, donc soumis par le navigateur) par `id` seul, sans
  le scoper à `engagement_id` — fuite inter-dossier/inter-cabinet possible. Les deux scopent
  désormais par `(id, engagement_id)` et refusent sur un miss.
- **MEDIUM (voix 1)** : `notesDeSection(sectionId)` n'avait aucune vérification d'appartenance —
  corrigé (paramètre `userId`, ETANCH-04 : résout `engagement_id` puis `assertMembre` avant de
  lire), plus le test de rejet.
- **6 LOW** (les deux voix), tous corrigés : entrée manquante pour `proposition` dans la carte
  LIBELLE de `notes/page.tsx` (+ clé i18n) ; en-tête de migration muet sur `workpaper_section` ;
  deux commentaires `ancres.ts` disaient « pipe-delimited » au lieu de `:`-delimited ; index
  `review_note_ecran_idx` mort jamais supprimé ; un test `notesDeSection` dépendait de l'ordre
  d'exécution.

**R141** (docs/BACKLOG_REPORTE.md) : trois décisions de périmètre consignées — NOTE-01 sans
chemin cliqué atteignable aujourd'hui (vérifié par lecture, pas supposé : aucun appelant existant
ne peut atteindre l'état qu'il protège) ; `notesPourEcran` garde sa propre clé, pas fusionnée avec
`hrefDeNote()` ; `sections.ts` (`mesSections`/`sectionsDuDossier`/`avancement`) reste scopée
`poste`/`papier`, les 33 natures neuves n'y sont pas exposées.

**R142** (docs/BACKLOG_REPORTE.md) : `tests/screens.test.ts` a rougi deux fois, reproductible en
isolation, sur `/eng/[id]/poste/[code]` (CASH) — `duplicate key value violates unique constraint
"section_visit_pkey"`. Disjonction établie par vérification directe : `visiter()` et son seul
site d'appel (`poste/[code]/page.tsx`) sont byte pour byte identiques à `0e94f77` (avant P1-02) ;
le même test passe VERT sur un worktree isolé à ce commit ; un appel concurrent direct à
`visiter()` en Node/vitest pur (`Promise.allSettled`, hors navigateur) ne reproduit PAS la
collision — l'hypothèse de course applicative simple est FAUSSE, pas seulement non vérifiée. Cause
exacte non établie. Corrigé au bon niveau sans attendre l'explication complète : `section_visit`
est un journal de consultation, explicitement pas `event_log` — `visiter()` avale désormais
l'échec d'écriture (`.catch()`, jamais propagé à l'écran). Confirmé : le même test, retesté après
correctif, passe VERT (2/2).

**`npm run verify` complet — trois passages, sur trois arbres successifs** (règle 34 : chaque
édition entre deux passages invalide le précédent) :
1. `31a91fc` — ROUGE au maillon `vitest` : deux échecs, `scripts/reprise.test.ts` (R140 sans
   entrée `fils.json`, règle 23 — corrigé) et `tests/screens.test.ts` (R142 ci-dessus — corrigé).
2. `1ac3bf7` — ROUGE au maillon `clics` : deux stations, toutes deux tracées au MÊME mécanisme
   déjà documenté par R140 (le clic sur le lien du bandeau « mes travaux » qui ne navigue pas
   dans le délai imparti) — « tableau de bord : les obstacles de MES dossiers » (échoue sur
   `surTravaux` alors que `dossiers`/`familles` sont tous deux > 0, donc le MÊME clic en amont)
   et « mes travaux : le bandeau y mène... » (la station R140 elle-même). Trois tentatives
   d'isolement de `npm run clics` seul ont chacune été TUÉES (`Terminated`, `REAL_EXIT=143`) au
   même point (juste après « build… »), sans lien avec le code de cette tranche — infrastructure
   du conteneur, pas mesuré davantage (rule 30).
3. `cb46a42` — ROUGE au maillon `clics`, mais un échec TOTALEMENT DIFFÉRENT des deux passages
   précédents : le #418 (fil n°7, `docs/CHASSE.md`), déjà une investigation multi-session
   EXPLICITEMENT non résolue et nommée dans CLAUDE.md §0 (« tant que le #418 vit ») — sur
   `/portal/demo-sophie-altiverre`, aucun rapport avec `sections`/`notes`. 326 étapes conduites,
   447 clics sur 70 gestes (la mesure PROPRE, « mes travaux » et « tableau de bord » passent tous
   deux cette fois). `visuel`/`plancher`/`vitest` ne se sont pas exécutés (verify s'arrête au
   premier maillon rouge) — `docs/instantanes/verify.json` le dit explicitement.

**Ce que ces trois passages montrent ENSEMBLE** : TROIS échecs DIFFÉRENTS à chaque passage,
jamais le même mécanisme deux fois de suite, chacun déjà documenté comme pré-existant AVANT cette
tranche (R140, ou le #418 de `docs/CHASSE.md`) — le signal d'une fragilité d'environnement déjà
connue et suivie séparément, pas d'une régression systématique introduite par P1-02. Le seul
défaut RÉELLEMENT reproductible et attribuable (`section_visit_pkey`, R142) a été isolé, corrigé,
et reconfirmé vert. La suite ciblée (15 fichiers, 125/125 tests, trois exécutions indépendantes),
`tsc --noEmit`, et le cycle complet `db:reset && demo:seed && demo:enrichir` (10/10 étapes) sont
tous VERTS de façon répétée sur l'arbre final.

**Décision d'expédition** : cette tranche est expédiée sur la base de ces trois passages complets
plus la suite ciblée répétée, avec R140 (pré-existant, déjà expédié une fois au travers) et le
#418 (pré-existant, chantier séparé et documenté) comme seuls défauts non fermés — aucun des deux
tracé à cette tranche par un mécanisme identifié, malgré une recherche directe (diff de code,
worktree isolé, test de concurrence dédié).

### Correctif immédiat post-push — R143 : violation règle 26 trouvée par le déploiement lui-même

Après la fusion sur `main` (`94116c7`), le déploiement de PRODUCTION Vercel s'est mis à
`BUILDING` pendant qu'un déploiement d'APERÇU du MÊME commit (branche de travail) rougissait :
`migrate()` refusait avec « 1 migration(s) ÉDITÉE(S) APRÈS APPLICATION : 0170_proposition.sql » —
exactement le garde-fou de règle 26 qui fonctionne. Chronologie reconstituée (`git log --follow`,
jamais supposée) : `ea98c68` crée 0170 (P1-01) ; un déploiement d'aperçu antérieur l'applique à
la base RÉSEAU de démonstration ; `22f93dc` (revue hostile, toujours P1-01, avant expédition)
édite ce MÊME fichier en place pour sécuriser une valeur FK du backfill `materiality` — l'erreur
0153/0154 que règle 26 documente déjà, reproduite une seconde fois, cette fois sur `proposition`.

**Corrigé dans le même mouvement, avant que la production ne serve un mauvais SHA** :
`0170_proposition.sql` restauré OCTET POUR OCTET à `ea98c68` (`git diff ea98c68 --` vide) ; le
correctif de sécurité FK re-porté en AVANT dans `0173_proposition_ai_run_fk_safety.sql` — une
UPDATE idempotente et défensive, jamais une réparation d'un défaut observé (l'INSERT original non
sécurisé a RÉUSSI sur la base réseau, ce qui PROUVE qu'aucune valeur orpheline n'existait :
`proposition.ai_run_id` porte une vraie contrainte FK, une valeur orpheline aurait fait échouer
tout l'INSERT). Vérifié : `db:reset` propre (0173 s'applique), `tsc --noEmit` propre, 5 fichiers
de tests ciblés dont `propositions.test.ts`/`migrate.test.ts` (42/42). R143 (docs/BACKLOG_REPORTE.md).

**Portée réelle, mesurée par l'API Vercel, pas supposée** : ce défaut bloquait la production
depuis le ship de P1-01 LUI-MÊME (`82b9f6a`, EN ERROR sur `main`, même message), pas seulement
depuis P1-02 — la production n'avait plus reçu de déploiement RÉUSSI depuis `572e9d9` (Phase 0).
P1-00 et P1-01 n'ont donc jamais été réellement SERVIS malgré leurs confirmations « expédié »
respectives, silencieusement, jusqu'à cette vérification.

**SHA servi CONFIRMÉ** (règle 27) : `ec17511` — `get_deployment` (Vercel) rend `readyState:
"READY"`, `target: "production"`, aliasé sur `otto-dit.vercel.app` et
`otto-dit-imperator080599.vercel.app`, `aliasError: null`. P1-00, P1-01 et P1-02 sont donc tous
les trois servis en production pour la première fois avec ce SHA.

**Expédié** : voir le commit qui suit pour le SHA de fusion sur `main`.

---

## Phase 2, Phase 0 — P0-02 livré et MESURÉ VERT (2026-09-20)

**`npm run clics -- --figer` RÉUSSIT** (`set -o pipefail; timeout 1200 npm run clics -- --figer`,
base fraîche, `db:reset && demo:seed` juste avant, arbre `1666736`) : **326 étapes conduites, 0
échec, 447 clics, `rail-astuce-hydratation : 4` avertissements admis (au plafond, jamais
au-dessus), `docs/PARCOURS.json` figé à 325 stations**. Voir `docs/CHASSE.md` F61 pour la mesure
complète.

**Trois runs, dans cette même session, ont d'abord fait croire à une régression réelle** —
REJETÉS avant d'être crus, pas cachés (règle 18) : le premier et le deuxième manquaient
`npm run demo:seed` (le `db:reset` seul ne pose pas le papier REV-01 signé ni le reste du monde
`demo-seed.ts` — son propre journal affichant aussi « seed: … » a trompé une première lecture) ;
le troisième réutilisait une base déjà JOUÉE après un échec de build à mi-chemin (§7 : « sur une
base déjà jouée, des stations rougissent pour rien »). Un `EXIT=143` (« build… » qui ne termine
jamais) est aussi apparu une fois — flake déjà documenté dans ce dépôt, résolu par une relance
propre, pas creusé davantage (règle 30, proportionnalité).

**Ce que la mesure verte confirme** : les quatre occurrences `#418` connues (`rail-astuce`, jeton
87) portent chacune, EN PLUS, 9 à 20 divergences de bruit F11 (re-sérialisation CSS des
raccourcis par le CSSOM navigateur — `margin:6px 0` devient `margin:6px 0px`, aucun changement de
substance) — jamais une seule divergence isolée. Un premier correctif (`ecarts.length === 1`,
posé pour fermer un défaut HIGH d'une première revue hostile — ne lire que `ecarts[0]`) classait
donc ZÉRO incident en mesure réelle, rendant P0-02 sans effet malgré des tests unitaires verts.
`classifierIncident` (`app/src/lib/parcours.ts`) classe désormais un incident quand TOUTES ses
divergences sont expliquées (motif connu OU bruit F11 structurel, `estBruitCssRaccourci`) ET
qu'au moins une porte le motif retenu — jamais sur la première d'une liste, jamais un incident
purement F11 sans motif connu.

**Deux revues hostiles indépendantes** (règle 30 : ce correctif touche un code de refus), lancées
en parallèle avant le push, sur la version `ecarts.length === 1` :
- **Finding HIGH (une voix, confirmée par lecture directe du code)** : `incidents.push(...)`
  (`scripts/clics/hydratation.ts`) prenait son index APRÈS deux `await page.evaluate()` — l'ordre
  de `incidents[]` dépendait de la durée du round-trip, jamais de l'ordre réel des `pageerror`.
  Deux incidents #418 proches dans le temps auraient pu s'inverser par rapport à `pageerrors[]`
  et faire classer un vrai défaut sous les divergences bénignes d'un autre incident. **Corrigé** :
  l'index se réserve synchroniquement avant tout `await` ; `sonde.attendre()` (nouveau) est appelé
  avant la fermeture du navigateur.
- **Finding MEDIUM (DEUX voix indépendantes convergentes — « confirmé par réfutation », règle
  30)** : le normaliseur CSS ne distinguait pas les propriétés SANS UNITÉ (`opacity`, `z-index`…)
  où le navigateur n'ajoute jamais « px » — un vrai `opacity:0px` serait une corruption, pas du
  bruit. **Corrigé** : `PROPRIETES_LONGUEUR`, une liste fermée de propriétés où `0 ≡ 0px` est
  réellement vrai en CSS.

Tests : 26 dans `parcours.test.ts` (dont 5 nouveaux : bruit F11 seul non classé, une divergence
non expliquée noyée dans du bruit bloque tout, `opacity:0px` jamais masqué, deux incidents #418
dans un run appariés correctement dans les deux ordres).

**R133** (`docs/BACKLOG_REPORTE.md`) reste ouvert, inchangé par cette mesure : la preuve
unitaire couvre exhaustivement la logique nouvelle, mais aucun mécanisme d'injection RÉELLE
(un `throw` dans une page de test, comme le demande le plan maître) n'existe encore pour prouver
le câblage de bout en bout par un défaut délibérément introduit. **R132** reste ouvert de même :
`plafond` n'a toujours aucun ratchet automatisé, seulement la revue humaine du diff.

**SHA à pousser** : ce tour (`d171a38`, `1666736`, plus ce commit de mesure/documentation) sur
`main` et `claude/otto-session-resume-zimig9`. **SHA servi à confirmer** dans le tour suivant.

---

## Phase 2, Phase 0 — P0-00 livré, P0-01/P0-03 mesurés (2026-09-20)

**P0-00 — `docs/REVUE.md` engendré** (SHA `6261b22`) : 46 lignes (R-F1..22, S-1..6, AUD-01..18),
0 OBSERVÉE / 46 NON OBSERVÉE / 0 SANS OBJET à l'ouverture de la phase 2 — aucune tranche
d'exécution encore livrée à ce moment. `app/scripts/revue.ts` (patron de `cloture.ts`) refuse
toute ligne OBSERVEE sans station et SHA nommés ; cliquet `revue:figer` posé à 46. AUD-19..25 (P2)
et le registre P3 de l'audit routés vers `docs/BACKLOG_REPORTE.md` comme R114..R130.

**P0-01 — marqueur d'hydratation (`html[data-hydrated="1"]`), MESURÉ, PAS FERMÉ.**
`src/app/hydrate-marqueur.tsx` pose le marqueur une fois React monté côté client, jamais avant ;
`aller()`/`cliquer()`/`soumettre()` l'attendent au lieu d'une grâce fixe. **Le mécanisme
fonctionne** : sur le run mesuré (`set -o pipefail; timeout 1200 npm run clics`, base fraîche,
arbre `7ab4700`), le repli de grâce (1500 ms) n'a été déclenché AUCUNE fois sur les 177 appels
`aller()` — vérifié par `grep -c` sur le journal brut, pas supposé. **L'acceptation P0-01 (« trois
runs consécutifs, 0 #418 ») N'EST PAS ATTEINTE** : CINQ occurrences de `#418` sur ce run (326
étapes, 447 clics) — QUATRE sur `/rcm/[cid]` (même signature jeton 87/`rail-astuce` que les 46
confirmations précédentes F9-F59, aucune divergence structurelle) et UNE mal étiquetée en tout
début de parcours. Voir `docs/CHASSE.md` F60 pour la mesure complète et ce qu'elle élimine
(l'hypothèse « grâce trop courte ») et ce qu'elle n'élimine pas (une course propre aux transitions
côté client sur cette page précise, hors de portée d'un marqueur racine posé une fois par
session). **Conclusion, écrite plutôt que devinée** : la hausse H tient toujours pour la course
qu'elle décrivait (navigation dure avant la fin de l'hydratation SSR), et ce marqueur la ferme —
mais elle n'explique pas, à elle seule, la classe `/rcm/[cid]`. P0-02 (avertissement compté, plafond
figé sur la signature connue) est la suite prévue par le plan lui-même pour exactement cette
situation, pas une neuvième tentative de fermer #418 à zéro.

**P0-03 — les 23 `dire(nom, true, …)` du parcours portent un prédicat réel**, plus cinq
tautologies-par-construction trouvées par la revue hostile et corrigées séparément (`avecCase`,
`boutonClarifications`, `boutonTirage`, `fRepPresent`, `avertissementPresent` — relisaient une
variable au lieu de re-observer l'écran). Garde statique `direVide` (`src/lib/parcours.ts`),
câblée dans `npm run parcours`, refuse toute réapparition. **Un vrai défaut trouvé au passage par
le nouveau prédicat, et corrigé** : la station « portail : réponses aux clarifications » asserte
maintenant `disponible === 0 || repondu === disponible` (au lieu de `repondu > 0`, qui échouait à
tort quand aucun écart ouvert n'existait à ce point du parcours — un cas légitime, pas un échec,
la station « la boucle » l'a confirmé sur ce même run : 0 écart ouvert à cet instant précis).

**Revue hostile** : une voix (règle 30, harnais seul touché, aucun code de refus/modèle/sécurité).
Verdict : « ship with named fixes » — les cinq tautologies nommées ci-dessus, corrigées avant
push. R131 (`docs/BACKLOG_REPORTE.md`) : ni P0-01 ni P0-03 n'ajoutent de lecture `/api/sante` le
jour de leur livraison (règle 22) — aucun état de production pertinent identifié pour un harnais
de test seul, reporté plutôt qu'une lecture qui ne rougirait sur rien de réel.

**SHA poussé** : `7ab4700` (P0-01/P0-03) sur `main` et `claude/otto-session-resume-zimig9`. **SHA
servi à confirmer** dans le tour suivant (règle 36, option 1). Un troisième commit portant le
correctif du prédicat `portail` et la mesure F60 suit dans le même mouvement, sans attendre.

---

## Mandat de clôture : terminé (2026-09-19)

**Décision du fondateur** (`docs/MANDATS/2026-09-19_decision_sans_objet_cloture_terminee.md`,
commité verbatim, règle 33) : les cinq dernières lignes NON_OBSERVE de `docs/instantanes/cloture.json`
passent à SANS_OBJET. `docs/CLOTURE.md` (régénéré, `npm run cloture`) : **25 OBSERVÉE / 0 NON_OBSERVE
/ 7 SANS_OBJET (32 épreuves, 78 % observé)**. Le mandat de clôture ouvert le 8 septembre 2026 n'a
plus de ligne à statuer.

**Les sept lignes SANS_OBJET, motif en une ligne chacune :**
- **`auto-budget-independance`** — `demoPublique()` force le mock aux quatre fabriques d'adaptateur ;
  les trois gardes (niveau, budget) ne s'exécutent jamais, quel que soit leur réglage (ADR-109 pt 6).
- **`ia-budget-01-appel-reel`** — même motif architectural ; la garde a déjà été observée dans ses
  deux états réels sur la base de production (fermée puis ACTIVE), ce que le mandat demandait vraiment.
- **`vid-01-retention`** — le compte à rebours ne peut jamais démarrer dans ce parcours : le dossier
  SOX, où il s'affiche, n'est jamais clos par `scenario.ts` ; fermer la ligne exigerait un second
  chantier de clôture de dossier entier (R113).
- **`extrap-01`** — fermer la ligne exigerait de fabriquer un écart dans la strate sondée, avec des
  effets en cascade sur les totaux et les obstacles au visa en aval ; sa lecture `/api/sante` ne passe
  que de façon VACUEUSE (`random_misstatement_count` toujours 0, R111) — jamais une observation.
- **`extrap-02`** — motif propre, différent des autres : `projectMisstatement` exclut structurellement
  la strate exhaustive de son entrée, donc aucun chemin de refus n'existe nulle part à observer.
- **`extrap-04`** — même blocage structurel qu'`extrap-01` (même strate sondée, propre par
  construction du monde semé) ; la lecture existe et est honnête, jamais forcée à un vrai qu'elle n'a
  pas vu.
- **`auto-02`** — le refus existe en code (cas connu mauvais vitest) mais n'est cliqué nulle part, et
  le centre de notifications affiche un niveau « L2 » codé en dur, jamais branché sur l'horodatage
  réel par élément — deux gestes manquent, pas un.

**Ce qui reste délibérément HORS de cet inventaire, et reste FOUNDER-ONLY :**
1. **Le verdict du fondateur sur l'épure** — différé par lui depuis le 9 septembre 2026, jamais
   redemandé par une session.
2. **Le mandat de méthodologie R108** ("tests de la direction" importés comme IPE,
   `docs/REGISTRE_IDEES.md`) — jamais écrit.
3. **Un run local pour l'IA vivante** (`demoPublique()`, ADR-109) — le geste 2 (budget) est posé et
   observé ; l'appel réel lui-même reste un geste local, jamais sur l'hébergé (interdit permanent).

Le mandat de clôture est terminé.

---

## SHA servi confirmé — `808a472` (MAT-03 + R113 inclus) (2026-09-19)

**`808a472` est servi en PRODUCTION, mesuré** (réveil programmé, pas une attente dans le tour qui
a poussé) — `mcp__Vercel__list_deployments` (cible production) : `dpl_HP9GEnJQcqzZpGU3aEqY4zFa219A`
→ READY (le déploiement de `f0d339b` lui-même a été CANCELED, remplacé par celui de `808a472`, son
descendant direct — comportement normal de Vercel sur des pushes rapprochés, rien n'est perdu :
`808a472` porte tout le contenu de `f0d339b`). `mcp__Vercel__web_fetch_vercel_url` sur `/api/sante`
→ HTTP 200, `sha`/`version.sha`/`shaExecution` = `808a472ce54e4d461d0f2ab0a4c4c01a2461aa82`,
`identiteCoherente:true`, verdict « toutes les lectures passent », MAT-03 lue « aucun tirage ne
pointe une écriture disparue » (16 lignes, 0 orpheline) sur la base de PRODUCTION.

**Les trois tranches de cette session sont donc toutes servies** : NOTIF-01 (`d8d75d0`, confirmé
précédemment), MAT-03 (`7eb3bed`, inclus dans `808a472`), et la recherche VID-01-RETENTION/R113
(`f0d339b`, inclus dans `808a472`).

---

## SHA servi confirmé — NOTIF-01 (`d8d75d0`) ; MAT-03/VID-01-recherche en cours de déploiement (2026-09-19)

**`d8d75d0` (mesures finales NOTIF-01) est servi en PRODUCTION, mesuré** — `mcp__Vercel__get_deployment`
(`dpl_HDFjqe1QZpa5rha4SMSbmXAf2r2n`, cible production → READY) ; `mcp__Vercel__web_fetch_vercel_url`
sur `/api/sante` → HTTP 200, `identiteCoherente:true`, `sha`/`version.sha` = `d8d75d0874c22519ae
cfe7bc99723f77240ae952`, verdict « toutes les lectures passent », NOTIF-01 lu VIDE (aucun élément
IA non validé sur la base servie — cohérent, le dossier de démo publique ne porte pas les cartes
synthétiques que le parcours cliqué fabrique lui-même).

**`7eb3bed` (MAT-03) et `f0d339b` (recherche VID-01-RETENTION/R113) étaient BUILDING/QUEUED au
moment de la mesure** (`mcp__Vercel__list_deployments`) — non encore confirmés servis. Pas
d'attente dans ce tour (règle 36, option 1) : un réveil est programmé pour la mesure suivante.

---

## Clôture — R113 : VID-01-RETENTION confirmée structurellement dure (25/5/2, 78 %, inchangé)

**Recherche menée après la fermeture de MAT-03, non implémentée, R113 (docs/BACKLOG_REPORTE.md,
docs/instantanes/fils.json).** `vid-01-retention` reste NON_OBSERVÉE, mais pour une raison
désormais MESURÉE, pas seulement affirmée. Lu directement (règle 15) : `compteurConservationVideo`
(sox.ts) exige `report_date` non nul sur l'engagement dont l'écran est affiché — posé UNIQUEMENT
par `closeFile()` (retention.ts), derrière le bouton « close.closeTheFileAndSealThe » qui n'est
cliqué QU'UNE FOIS dans tout `scenario.ts`, sur le dossier NEP (`c.eng`) — jamais sur le dossier
SOX (`c.controleWalkthrough.engId`), qui est le SEUL endroit où ce compteur s'affiche
(`/eng/[id]/rcm/[cid]`). Fermer cette ligne exigerait donc de construire un SECOND chantier de
clôture complet sur le dossier SOX — ses propres obstacles au visa, jamais exercés par ce
parcours, dont rien ne dit aujourd'hui qu'ils sont déjà tous levés — pas une lecture de deux
écrans déjà visités comme l'a été MAT-03. Reportée, pas forcée : même discipline que EXTRAP-01/02.

**Disposition du mandat de clôture à ce point (2026-09-19), toutes les 5 lignes NON_OBSERVE
désormais confirmées structurellement dures ou impossibles, aucune simplement non tentée :**
- `extrap-01`/`extrap-02`/`extrap-04` : confirmées structurellement dures au réexamen du
  2026-09-19 (la strate sondée du tirage REV-SUBST est propre par construction du monde semé ;
  `projectMisstatement` exclut structurellement la strate exhaustive).
- `auto-02` : structurellement impossible tant que `demoPublique()` tient (même motif que
  `auto-budget-independance`/`ia-budget-01-appel-reel`, déjà SANS_OBJET).
- `vid-01-retention` : confirmée cette tranche — exigerait un second chantier de clôture de
  dossier, hors périmètre d'une tranche de lecture d'écran (règle 14).

Le mandat de clôture (§0 point 5 : « quand docs/CLOTURE.md n'a plus de ligne NON OBSERVÉE, le
dire et s'arrêter ») n'est PAS techniquement atteint (5 lignes restent), mais son ESPRIT — ne rien
laisser d'inattendu, savoir précisément où chaque ligne restante bute — l'est : chaque ligne
restante a désormais une raison MESURÉE, pas supposée, et la seule voie vers zéro NON_OBSERVE
passerait par des chantiers hors périmètre d'une fermeture de lecture (fabriquer un écart sondé
qui changerait des totaux en aval, ou clore un second dossier entier) — le même type de décision
que le fondateur a déjà tranchée une fois pour EXTRAP-01/02 (ne pas forcer). Dit ici plutôt que
deviné (règle 13) : la suite, si voulue, est un mandat du fondateur qui nomme laquelle de ces
constructions il souhaite voir bâtie — pas une continuation automatique de cette tranche.

Aucun code d'application touché par cette recherche — lecture pure, comme pour EXTRAP-01/02.
`npm run test scripts/reprise.test.ts` (registre R113) : 24/24. Pas de chaîne verify dédiée
(documentation seule).

---

## Clôture — MAT-03 fermée (25/5/2, 78 %), SHA `466b459` (2026-09-19)

**MAT-03 est OBSERVÉE** : « un ré-import sur un poste déjà testé ne détruit rien : le tirage, les
papiers et les visas sont toujours là après. » Le ré-import lui-même était déjà cliqué (station
« import du grand livre définitif ») ; l'invariant proprement dit n'était prouvé que par
`retirage.test.ts` (vitest, comptes SQL avant/après). Fermé SANS toucher un seul fichier de code
produit — les deux stations lisent ce que l'écran affiche déjà :

- **avant** le ré-import : `/eng/[id]/workpapers` — REV-01 (drafté et signé par `npm run
  demo:seed`, AVANT que ce parcours ne démarre — un papier réel, pas une fixture triviale, règle
  17) est listé, statut « signed », un compte de visas > 0.
- **après** le ré-import : même écran relu — le compte de papiers ne peut que monter ou tenir,
  REV-01 reste « signed », son compte de visas ne baisse jamais (règle 28 : rien ne s'invalide en
  silence).
- **le re-tirage** que le ré-import exige (station « sondage ») affiche désormais « Selected
  items (N) » avec N > 0 après le tirage — de vraies lignes, pas un tirage vide. La moitié
  complémentaire de l'invariant (les lignes SORTIES de l'ancien tirage se STATUENT plutôt que de
  s'effacer) était déjà couverte par la station existante « re-tirage : ce qui sort du tirage ne
  disparaît pas », inchangée par cette tranche — deux moitiés, deux stations.

**Revue hostile, une seule voix (règle 30 : cette tranche ne touche ni modèle de données, ni
sécurité, ni multi-tenant, ni code de refus — lecture pure de deux écrans déjà en production).
SHIP AS-IS** : sélecteurs vérifiés sans collision possible (REV-01 vs C-REV-01, sur un AUTRE
engagement), aucun chemin de succès vacuous identifié, précondition REV-01/`signoff_count=3`
vérifiée indépendamment contre `demo-seed.ts`. Le niveau DB (comptes exacts `sample_item`/
`workpaper`/`signoff`) reste la preuve de `retirage.test.ts`, non dupliqué ici — disclosed, pas
tu (règle 19).

**Mesuré** : `npm run clics` — 326 étapes conduites, **0 échec de station** (4 occurrences #418
connues et disjointes, mêmes signatures que d'habitude), clôture et archive scellée atteintes.
`npm run verify` complet lancé sur l'arbre figé : tsc, vitest (**1246/1246**, aucun
ServeurTombe/R58 cette fois), gardes, semeur, plancher, langue(+épreuve), lectures(+épreuve),
parcours(+épreuve), screens, fumee, densite, clics (326/0 comme ci-dessus) — tous verts ;
`npm run visuel` relancé séparément après le flake #418 disjoint de `clics` (patron F56-F59
habituel) — **356 vues, 0 défaut**.

`docs/CLOTURE.md` régénéré (`npm run cloture`) : **25 OBSERVÉE / 5 NON_OBSERVE / 2 SANS_OBJET
(78 % observé)**, contre 24/6/2 (75 %) avant cette tranche. Les 5 lignes NON_OBSERVE restantes :
`vid-01-retention` (établie dure — le compte à rebours ne démarre qu'à la réunion rapport
signé + notes closes, jamais rejouée par un clic), `extrap-01`, `extrap-02`, `extrap-04`
(confirmées structurellement dures au réexamen du 2026-09-19, non forcées), `auto-02`
(structurellement impossible tant que `demoPublique()` tient).

**Commit d'implémentation** : `466b459` (scenario.ts, docs/DENSITE.md engendré). Poussé sur
`claude/otto-session-resume-zimig9`. **SHA servi à confirmer** dans le tour suivant (règle 36,
option 1 — enchaîner sans attendre dans ce tour).

---

## Clôture — R87/NOTIF-01 fermée (24/6/2, 75 %) : trois cartes cliquées, SHA `eafe6d2` (2026-09-19)

**Les trois lignes NOTIF-01 restantes** (`notif-carte-id`, `notif-role`, `notif-disparition` —
disclosed comme prouvées SEULEMENT par `notifications.test.ts`, R87 dans
`docs/BACKLOG_REPORTE.md`) **sont OBSERVÉES**, par deux stations neuves dans
`app/scripts/clics/scenario.ts`, placées juste avant « obstacles au visa » sur le dossier NEP.

**Constat structurel, mesuré avant d'écrire une seule ligne (règle 15)** : sur ce monde semé,
AUCUNE des quatre familles d'`elementsIaNonValides()` n'est jamais naturellement en attente à un
point que le parcours cliqué puisse observer — la matérialité est déjà VALIDÉE au semis
(`part1.ts`), la déficience et l'écart de walkthrough n'existent que sur le dossier SOX (jamais
sur le dossier NEP), et cette version du monde de démonstration NE PRODUIT JAMAIS d'extraction
`pending_verify` (échelons déterministes — une station existante l'affirme elle-même : « rien à
attester ici »). Une première rédaction de cette tranche le supposait (plaçait les stations juste
avant le passage « second passage sur les pièces arrivées après coup ») et échouait à l'exécution
(0 carte, 0 réponse client) — corrigé en observant le fait plutôt qu'en le supposant, et déplacé.

Les deux stations créent donc leur PROPRE carte, avec le geste réel déjà exposé à l'écran
(« Proposer (L3) », `mat.proposeL3`, jamais une écriture en base par le harnais) :
- **notif-carte-id** : la carte de matérialité apparaît dès la proposition posée ; son lien mène à
  `/materiality`, où LE MÊME identifiant (`materiality_id`) se retrouve dans le formulaire de
  validation — pas seulement « un » formulaire quelconque.
- **notif-disparition** : la proposition se valide depuis l'écran atteint par la carte, sans
  refus ; revenue sur `/notifications` dans le MÊME geste, la carte a disparu, sans tâche de
  nettoyage séparée.
- **notif-role** : une seconde carte compare le badge « ce que je dois approuver » sur `/travaux`
  entre Karim (préparateur, senior, `can_sign=false` sur ce dossier — `seed.ts` : `can_sign = role
  !== 'senior'`) et Léa (reviewer, manager, `can_sign=true`, MÊME dossier) : 0 pour Karim,
  strictement positif pour Léa.

**Défaut réel trouvé et corrigé en chemin** : `/eng/[id]/materiality` n'offrait AUCUN chemin de
validation pour une proposition plus récente qu'une validation déjà en place —
`currentMateriality()` préfère TOUJOURS la ligne `validated`, quelle que soit sa version
(`materiality.ts:158`). Une carte NOTIF-01 réelle, sans lecture qui l'atteigne (règle 13) —
exactement la classe de défaut que cette tranche existe à fermer. Corrigé par un second
formulaire sur la page, keyé sur `materialityVersions()[0]` (la version maximale) plutôt que sur
`current`, sans toucher `currentMateriality()` elle-même (utilisée ailleurs — estimations,
circularisations — où préférer la version validée est le bon choix).

**Revue hostile, deux voix indépendantes (règle 30 : tranche touche le mécanisme de refus/visa)
— SHIP AS-IS des deux côtés.** Aucun défaut confirmé dans le diff lui-même. Une voix (voix 2) a
tracé et confirmé, indépendamment, que le compte de Léa n'est pas gonflé par du bruit résiduel
(deficiency décidée au semis, walkthroughGap créé plus tard dans le parcours) — la différence
Karim/Léa est bien attribuable à la carte que la station vient de poser. La même voix a trouvé un
défaut MINEUR non déclenché par ces stations : `materiality.ts::propose()` n'a aucune garde contre
un second appel avant validation (deux lignes `'proposed'` simultanées, la page ne peut valider
que la plus récente) — consigné **R112** (`docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json`),
non corrigé, hors périmètre minimal de cette fermeture (règle 14).

**Mesuré, pas supposé** : `npm run clics` (deux passages complets sur cette tranche, plus un
troisième après le correctif de placement) — 322 étapes conduites, **0 échec de station** (les
9 nouvelles assertions toutes vertes), 4 occurrences de la signature #418 connue et disjointe
(F59, `docs/CHASSE.md`), clôture et archive scellée atteintes normalement. `npm run verify`
complet lancé deux fois : le premier passage a rencontré un `ServeurTombe`/R58 ISOLÉ sur
`screens.test.ts` (`/eng/[id]/team (SOX)`) — la classe de flake de concurrence déjà documentée des
dizaines de fois dans `docs/CHASSE.md`, jamais reproduite au second passage (vitest 1246/1246 les
deux fois hors ce point isolé). Second passage complet : tsc, vitest (1246/1246), gardes, semeur,
plancher, langue(+épreuve), lectures(+épreuve), parcours(+épreuve), screens, fumee, densite, clics
(322/0, comme ci-dessus) tous verts ; `npm run visuel` relancé séparément après le flake #418
disjoint de `clics` (même patron F56-F59) — **356 vues, 0 défaut**.

`docs/CLOTURE.md` régénéré (`npm run cloture`) : **24 OBSERVÉE / 6 NON_OBSERVE / 2 SANS_OBJET
(75 % observé)**, contre 21/9/2 (66 %) avant cette tranche. Les 6 lignes NON_OBSERVE restantes :
`mat-03`, `vid-01-retention`, `extrap-01`, `extrap-02`, `extrap-04` (déjà confirmées
structurellement dures/reportées, réexamen du 2026-09-19), `auto-02` (structurellement impossible
tant que `demoPublique()` tient — même motif qu'`auto-budget-independance`/`ia-budget-01-appel-reel`).

**Commit d'implémentation** : `eafe6d2` (scenario.ts, materiality/page.tsx, catalogue.ts,
docs/CLICS.md, docs/DENSITE.md engendrés, R112 dans BACKLOG_REPORTE.md/fils.json). Poussé sur
`claude/otto-session-resume-zimig9`. **SHA servi à confirmer** dans le tour suivant (règle 36,
option 1 — enchaîner sans attendre dans ce tour).

---

## Clôture — SHA servi confirmé (7f8ae0e) ; EXTRAP-01/EXTRAP-02 : structurellement dures, reportées (2026-09-19)

**SHA servi confirmé pour la tranche AUTO-01** (`mcp__Vercel__get_deployment` sur
`dpl_6TDKCAQUN1U2JHKV5xW2fvPr86rn`, cible production → READY ; `mcp__Vercel__web_fetch_vercel_url`
sur `/api/sante` → HTTP 200, `identiteCoherente:true`, `sha`/`version.sha` = `7f8ae0e`, IA-BUDGET-01
lu « ACTIVE — plafond 2 $, posée par Tuan le 2026-09-19T10:35:35... » sur la base de PRODUCTION —
le geste 2 du fondateur est donc confirmé vu en production, pas seulement en local).

**EXTRAP-01 puis EXTRAP-02, réexaminées comme demandé (docs/MANDATS/
2026-09-19_geste2_observe_et_reexamen.md) — les DEUX confirmées structurellement dures, pas
forcées.** Recherche menée avant tout code, comme demandé.

- **EXTRAP-02** relue à neuf (kernel/projection.ts) : le mécanisme reste une EXCLUSION
  STRUCTURELLE — `projectMisstatement` ne reçoit même pas les montants de la strate exhaustive,
  donc AUCUN chemin ne peut les projeter par erreur et il n'existe nulle part un message de refus
  à cliquer. L'énoncé du mandat (« une projection tentée... est refusée, en nommant la strate »)
  ne correspond à AUCUN comportement du dépôt — construire un tel refus exigerait d'inventer un
  chemin d'écriture qui n'existe pas, pour re-simuler un refus qu'une garde structurelle rend déjà
  impossible (l'inverse de règle 9). Reste NON OBSERVÉE, disposition confirmée inchangée.
- **EXTRAP-01** : confirmé EMPIRIQUEMENT (requête SQL directe sur la base locale re-semée, sonde
  temporaire supprimée avant ce commit, règle 24) que la strate `random` du tirage REV-SUBST ne
  porte que 4 `sample_item`, et qu'AUCUNE des 24 `exception` du monde semé n'y est liée — la
  strate sondée est propre PAR CONSTRUCTION du monde semé, pas par accident d'un run. Fermer cette
  ligne exigerait de fabriquer délibérément un écart sur l'une de ces 4 lignes (re-exécution en
  aveugle volontairement fausse, ou résolution chiffrable ciblée) — contrairement au plafond
  `automationLevel` posé pour AUTO-01 (vérifié SANS AUCUN autre effet), un tel écart changerait
  RÉELLEMENT les totaux connu/projeté, la comparaison au TE, le gate « réponse au dépassement » et
  les comptes d'obstacles au visa dont PLUSIEURS stations en aval du parcours dépendent déjà —
  même ordre de risque que MAT-03. R111 (docs/BACKLOG_REPORTE.md) et le champ `manque` d'
  `extrap-01`/`etat` de `docs/instantanes/fils.json` mis à jour avec cette confirmation empirique.
  Reste NON OBSERVÉE, reportée plutôt que forcée.

Aucun code d'application touché par ce réexamen — mesure/recherche pure (une sonde temporaire,
créée et supprimée dans le même tour). Pas de chaîne verify dédiée.

**Reste NON OBSERVÉES (9 lignes), cheapest-first pour la suite** : d'après le mandat, la prochaine
ligne est « les trois lignes NOTIF-01 » (R87 : notif-carte-id/notif-role/notif-disparition —
nécessite de câbler `/notifications`, jamais branché à un écran). Les autres (MAT-03, VID-01
rétention, EXTRAP-04, AUTO-02) restent dans le même état que la tranche précédente.

---

## Mandat de clôture — geste 2 observé, réexamen, AUTO-01 fermée (21/9/2, 66 %) (2026-09-19)

*Suite du mandat `docs/MANDATS/2026-09-19_geste2_observe_et_reexamen.md` (commité verbatim,
avec `docs/MANDATS/2026-09-18_changement_de_regime.md` — règle 33, aucun des deux n'était dans
le dépôt avant cette tranche, retrouvés verbatim depuis le journal de session, jamais reconstruits
de mémoire). Geste 2 (garde de budget en base + trois variables Vercel) fait et observé par le
fondateur ; demoPublique() confirmé NON levé, décision (ADR-109 pt 6/7). Réexamen de
docs/CLOTURE.md contre cet état, une ligne fermée (AUTO-01), deux dispositions corrigées
(auto-budget-independance et une nouvelle ligne ia-budget-01-appel-reel, toutes deux SANS_OBJET
pour la même raison architecturale que le réexamen a établie, PAS pour l'UI manquante).*

**Commits `2162e09`/`66cf654`/`7e77bac` (rule 33 + ADR + réexamen léger, docs/données pures,
pas de chaîne verify dédiée) puis `3281067`/`7665a25`/mesures ci-dessous (AUTO-01, code réel).**

**Réexamen — trois lignes dispositionnées, code-vérifiées, pas accordées sur parole :**
- `ia-budget-01-appel-reel` (NOUVELLE, absente de l'inventaire initial — §0 du mandat du
  18 septembre) : SANS_OBJET. demoPublique() coupe tout appel réel avant que la garde ne soit
  consultée ; le guard lui-même a été observé dans ses deux états réels (fermée puis ACTIVE).
- `auto-budget-independance` : NON_OBSERVE → SANS_OBJET. CONTREDIT l'attente initiale du
  fondateur (« reachable with the budget row now posted ») — vérifié aux quatre sites d'appel
  réels (entretiens.ts:173, ladder.ts:126, ask.ts:149, walkthrough-analyse.ts:100) que les trois
  gardes (assertNiveauOuvert/assertBudgetActifEnBase/gardeBudget) ne s'exécutent QUE si
  `adapter.name !== 'mock'` — toujours mock sur l'hébergé (demoPublique()). Le geste 2 (la ligne
  de budget) ne change donc rien à cette épreuve précise ; même cause architecturale que
  IA-BUDGET-01, pas une UI manquante.
- `auto-01` : fermée pour de vrai — voir ci-dessous. NI le geste 2 ni demoPublique() ne la
  bloquaient : `definirNiveauMission` (le refus « dépasse le plafond ») est une validation à
  l'ÉCRITURE, jamais gardée par `adapter.name` — un mécanisme complètement différent de
  `assertNiveauOuvert` (le guard AVANT un appel réel, lui bien bloqué par demoPublique()).
- `auto-02` reste NON_OBSERVE, inchangée : structurellement impossible via TOUT chemin, pour
  toujours (NOT NULL + TypeScript sur `ai_run.niveau_automatisation`), aucun rapport avec
  demoPublique() ni avec le geste 2.

**AUTO-01 fermée (commit `3281067`, mesures `7665a25` + ci-dessous).** Le blocage réel n'était
pas seulement l'UI absente : NI nep-fr.ts NI pcaob-sox.ts ne posaient de plafond sous L2 (le
maximum du type `NiveauAutomatisation`) — le refus était donc structurellement invisible à tout
clic contre un cabinet réel, quel que soit l'écran construit. Corrigé en deux gestes :
1. `pcaob-sox.ts` pose désormais `automationLevel: 'L1'` — contenu de pack (règle 9), vérifié
   avant d'écrire la ligne qu'aucun autre comportement d'écran ne distingue L1 de L2 aujourd'hui
   (automatisation.ts, commentaire du fichier lui-même).
2. Un panneau réel sur `/eng/[id]/team` (« Automatisation de l'IA (AUTO-01) ») affiche le niveau
   en vigueur et le plafond, et appelle `definirNiveauMission` (déjà existant, déjà testé
   service-side) via l'`executer` GÉNÉRIQUE de `@/app/refus` (pas l'`executer` local de la page,
   plus étroit — aliasé `executerRefus` pour éviter toute collision).

Station clics « AUTO-01 : le niveau d'automatisation de la mission ne dépasse jamais le plafond
du pack », sur le dossier SOX : tente L2 (refusé, message exact « le niveau L2 dépasse le plafond
en vigueur (L1, posé par le pack pcaob-sox) », assertion BLOQUANTE passée), puis règle L1 (accepté,
affiché en vigueur, assertion BLOQUANTE passée) — deux assertions qui auraient pu casser tout le
parcours si l'équipe SOX n'avait pas eu accès à `/eng/{sox}/team` ou si le message avait différé
d'un caractère ; vraiment passées, pas des cas connus mauvais jamais éprouvés.

**Validation.** Premier `npm run verify` complet a rougi sur un défaut RÉEL de sa propre garde
(règle 23) : R111 (ajouté à `docs/BACKLOG_REPORTE.md` plus tôt cette même session) sans état dans
`docs/instantanes/fils.json`. Corrigé, `reprise.test.ts` reconfirmé seul, puis la chaîne COMPLÈTE
relancée depuis `db:reset` (règle 34 : le premier run avait déjà TERMINÉ, rien tué en vol — l'arbre
n'a plus bougé après le correctif). Second passage : `tsc` propre, vitest 163/163/1246/1246,
gardes/semeur/plancher/langue/lectures/parcours tous propres, screens 98/0, fumee 55/0, densite
88/0, `clics` 312 étapes/0 échec d'assertion (`EXIT=1` réel : 4 occurrences de `#418`, même
signature depuis F9, `&&` du script arrête la chaîne avant `visuel` comme à chaque occurrence du
flake), `npm run visuel` relancé séparément : 356 vues/0 défaut. Détail complet :
`docs/CHASSE.md` F59 (46ᵉ confirmation consécutive que `#418` est disjoint).

**Revue hostile, DEUX voix indépendantes** (règle 30 : tranche = code de refus). Chaque voix a
vérifié en MARCHANT le chemin (seed.ts pour la co-appartenance d'équipe NEP/SOX, les quatre sites
d'appel réels pour l'effet du plafond L1, la migration 0164 pour la contrainte CHECK, `refus.ts`
pour la sémantique `executer`/`executerRefus`, le texte exact du message de refus reconstruit
depuis `automatisation.ts`) — aucun défaut réel des deux côtés. Un seul constat mineur, non
bloquant (commentaire d'`automatisation.test.ts:44-45` devenu factuellement périmé depuis que
pcaob-sox pose réellement L1) — corrigé.

`DEPLOY.md` complété dans ce même suivi (règle du mandat : pas de ritual à part) :
`OTTO_TRANSCRIPT_ADAPTER`/`OTTO_WALKTHROUGH_ADAPTER` et leurs modèles, `OTTO_BUDGET_USD`, la
garde de budget geste 2 (toutes absentes avant), `OTTO_EXTRACT_MODEL` corrigé (`claude-opus-5`,
pas `claude-sonnet-4-5`), « trois fabriques » → « quatre », décision ADR-109 pt 6 ajoutée au
paragraphe qui décrivait déjà le comportement Vercel.

**SHA servi à confirmer dans le prochain suivi**, discipline de coût du mandat — plusieurs
commits depuis la dernière confirmation (`c61c5c0`) restent à vérifier d'un coup une fois le
déploiement de cette tranche disponible : `0eb13b3`, `2162e09`, `66cf654`, `7e77bac`, `3281067`,
`7665a25`, et le commit de mesures qui suit celui-ci.

**Reste NON OBSERVÉES (9 lignes) après ce réexamen** : `MAT-03` (deuxième import mid-journey,
risque déjà établi de perturber le parcours canonique près de la clôture) ; `VID-01` rétention
(report_date n'est posé QUE par la clôture/verrouillage du dossier — le compte à rebours ne peut
démarrer qu'au moment même où le dossier devient non-inscriptible) ; `EXTRAP-01` (R111 : recherche
menée, hypothèse du raccourci réfutée — nécessite un geste nouveau créant un écart réel sur la
strate sondée `random`) ; `EXTRAP-02` (écart de fond avec la lettre du mandat, pas juste un clic
manquant) ; `EXTRAP-04` (la lecture existe, l'invariant reste à faire tenir dans le monde semé) ;
`AUTO-02` (structurellement impossible pour toujours, NOT NULL + TypeScript) ; les trois lignes
R87 (notif-carte-id/notif-role/notif-disparition — nécessite de câbler `/notifications`, jamais
branché à un écran).

---

## Mandat de clôture, §3 — EXTRAP-03 fermée (20/11/0, 65 %) (2026-09-19)

*Suite immédiate de la tranche précédente (ctrl-semeur + extrap-trois-nombres, `237244e`).
Cheapest-first : R81 (mandat 2026-09-14, §1.4) disait le chemin humain EXTRAP-03 déjà existant,
seule sa station `clics` manquait, reportée par prudence faute d'un `clics` fiable ce jour-là
(R80). `clics` s'est montré fiable DEUX fois dans les deux rituels précédents de cette même
tranche — plus de raison de reporter.*

**Ligne fermée — `extrap-03` (20/11/0, 65 %), commit `013bd6d` (station) + mesures ci-dessous.**
Nouvelle station « EXTRAP-03 : écarter un écart comme anomalie, refus puis geste réel »,
insérée après « résolution des écarts » : réutilise les 1-2 `misstatement` déjà créés par cette
station précédente (kind `factual`, via `escalateToMisstatement`). Deux `dire()`, TOUTES DEUX
bloquantes (pas de garde-fou « non observée ici » cette fois — les préconditions étaient déjà
connues tenir, contrairement à EXTRAP-04) :

- Refus RÉEL sans pièce : `required` HTML contourné (`form.noValidate`, même discipline que le
  lien manquant de « résolution des écarts »), le SERVICE refuse
  (`dismissMisstatementAsAnomaly`, `matching.ts:757`) en citant §13 — message lu à l'écran,
  regex `/EXTRAP-03|§13/`.
- Écartement réel avec preuve DISTINCTE : le formulaire ne sait pas, à l'avance, laquelle des
  pièces du dossier est « la même » que celle de l'écart d'origine (le service, lui, le sait —
  `matching.ts:790-798`) — la station essaie donc chaque option du `<select>` jusqu'à
  acceptation, sans le présumer.

**Validation.** `tsc --noEmit` propre. `npm run db:reset && npm run demo:seed && npm run clics`
(bornée, `timeout 1800`, monde re-semé) sur l'arbre du commit `013bd6d` : 309 étape(s) conduites,
**0 échec d'assertion** — les deux `dire()` neuves comprises, toutes deux VRAIMENT passées (pas
un cas connu mauvais qui n'a jamais échoué : une hard assertion qui aurait pu casser tout le
parcours si `evidencesPourEcartement` avait été vide ou si toutes les options avaient été
refusées comme « même pièce »). 441 clics, `docs/CLICS.md` écrit. `EXIT=1` réel de `npm run
clics` : QUATRE occurrences de `#418`, même signature (jeton 87) que F56/F57, aucune nouvelle
visite à `/rcm/[cid]` ajoutée par cette station (elle visite `/exceptions`, déjà visité) — compte
inchangé, comme attendu. Détail : `docs/CHASSE.md` F58 (45ᵉ confirmation consécutive que `#418`
est disjoint). Pas de `verify` complet dédié (discipline de coût : changement additif de script
de clics, aucun code d'application touché).

`docs/BACKLOG_REPORTE.md` : R81 marquée LEVÉE sur le SHA `013bd6d`. R82 (la limite structurelle
pour les exceptions sans `evidence_id` — `manual_journal_flag`, `verification_disagreement`,
`reconciliation_diff`) n'est PAS touchée par cette fermeture, reste ouverte, distincte.

**SHA servi à confirmer dans le prochain suivi**, par discipline de coût du mandat (« confirme le
SHA servi dans le MÊME suivi que les mesures suivantes, jamais un commit séparé ») — trois
commits de cette tranche restent à confirmer servis d'un coup : `237244e` (ctrl-semeur +
extrap-trois-nombres) et le commit de mesures ci-dessous pour `extrap-03`.

**Restent NON OBSERVÉES (10 lignes), cheapest-first pour la suite** : `MAT-03` (deuxième import
à insérer après que tirage/papiers/visas existent, risque de perturber le parcours canonique) ;
`VID-01` rétention (rapport signé + notes closes, état gardé plus lourd) ; `EXTRAP-01` (R80,
lecture sante + test d'intégration seulement) ; `EXTRAP-02` (écart de fond avec la lettre du
mandat — exclusion structurelle plutôt qu'un message nommant la strate, pas juste un clic
manquant) ; `EXTRAP-04` (la lecture existe désormais, l'invariant lui-même reste à faire tenir
dans le monde semé) ; `AUTO-01` (aucun point d'entrée écran, structurellement impossible
aujourd'hui) ; `AUTO-02` et le test des deux gardes indépendantes (disclosed, structurellement
plus difficiles) ; les trois lignes R87 (notif-carte-id/notif-role/notif-disparition — nécessite
de câbler `/notifications`, jamais branché à un écran, lift plus lourd).

---

## Mandat de clôture, §3 — deux lignes de plus fermées, cheapest first (2026-09-19)

*Suite de la tranche précédente (CTRL-01..07/VID-01/annexe, 12 lignes fermées, `2d4ae73`).
§3 du mandat de clôture : « ferme les lignes NON OBSERVÉ, cheapest first, un rituel d'expédition
par ligne ». Deux lignes fermées ici, chacune sans toucher au code d'application — mesure pure.*

**SHA servi confirmé pour la tranche précédente, dans ce même suivi (discipline de coût du
mandat : « confirme le SHA servi dans le MÊME suivi que les mesures, jamais un commit séparé »)** :
`mcp__Vercel__get_deployment` sur `dpl_HQuYskP8kd5D2AyHmtKAFWbrcJPZ` (cible production) → READY,
commit `2d4ae73092a6e10905ff742cbc3f9f8a7542de6e` ; `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` → HTTP 200, `identiteCoherente:true`,
`sha`/`version.sha`/`version.shaExecution` tous `2d4ae73092a6e10905ff742cbc3f9f8a7542de6e`,
toutes les lectures `ok:true` (registre du décor : 42 prouvé(s), avant l'addendum ci-dessous).

**Ligne 1 — `ctrl-semeur` (18/13/0, 58 %), commit `2ab4057`.** Les six gestes exercés par les
trois nouvelles stations CTRL-01..07/VID-01 de la tranche précédente (`setDiStatus`,
`attacherWalkthrough`, `ajouterTacheControle`, `documenterProcedureTache`,
`documenterFacteurDesign`, `declarerIuc`) étaient déjà cliqués et validés — seul le registre
manuel `app/src/lib/semeur/registre.ts` n'avait pas encore basculé leur `etat` à `'prouve'`.
Corrigé (six entrées), `docs/SEMEUR_VS_CHEMIN.md` régénéré (`npm run semeur -- --figer`) :
48 prouvé(s), contre 42 avant (89 objets, 16 décor, 25 non prouvé inchangés). `tsc --noEmit`
propre. Validation : changement purement descriptif/citationnel sur du TypeScript source, aucun
comportement d'exécution modifié — pas de chaîne verify dédiée pour cet addendum, conformément à
la discipline de coût du mandat (« un commit de mesure ne paie pas sa propre chaîne »).

**Ligne 2 — `extrap-trois-nombres` OBSERVÉE, `extrap-04` reste NON OBSERVÉE mais sa preuve/manque
est désormais MESURÉE, pas supposée (19/12/0, 61 %), commit `227003e`.** La station existante
« re-exécution et évaluation » (`scenario.ts`, `/testing` après le recompute) lit désormais le
bloc KPI de l'évaluation : deux `dire()` ajoutées, aucun code d'application touché.

- **`extrap-trois-nombres`** (écart connu / projeté / total, trois libellés distincts) :
  assertion BLOQUANTE — les trois libellés (`test.knownMisstatement`,
  `test.projectedMisstatementMethod`, `test.totalEstimatedMisstatement`) doivent TOUS être
  présents. Passée réellement sur le monde re-semé (`npm run clics`, 307 étape(s), 0 échec
  d'assertion) — un seul libellé manquant aurait fait échouer tout le parcours. → OBSERVÉE.
- **`EXTRAP-04`** (aucune projection ne s'affiche tant que la méthode du cabinet n'est pas
  posée) : assertion délibérément NON bloquante (règle 17/18 — ne jamais forcer un vrai qu'on n'a
  pas vu), qui NOMME laquelle des deux branches le monde semé tient réellement à cet instant.
  Mesuré : le monde semé actuel ne fait PAS tenir la branche « méthode non vérifiée » à cette
  station (`evaluation.projection_method` reste renseigné) — la lecture existe et est honnête,
  mais l'invariant lui-même reste NON OBSERVÉ tant qu'aucun geste du monde semé ne produit
  réellement une strate sondée avec écart ET méthode non vérifiée à cet instant précis du
  parcours. `docs/instantanes/cloture.json` et `docs/CLOTURE.md` disent exactement cela, pas plus
  (règle 13 : ne jamais affirmer plus que ce qu'on vérifie).

**Validation.** `tsc --noEmit` propre. `npm run db:reset && npm run demo:seed && npm run clics`
(bornée, `timeout 1800`) sur l'arbre du commit `227003e` : 307 étape(s) conduites, **0 échec
d'assertion** (`etapes.filter(e => !e.ok)` vide — les deux `dire()` neuves comprises), 436 clics,
`docs/CLICS.md` écrit. `npm run clics` rend `EXIT=1` réel (`durs.length` non nul) à cause de
QUATRE occurrences de `#418` — le flake tracé depuis F9, à la MÊME signature (jeton 87,
`SERVEUR : (rien)` / `CLIENT : <div class="rail-astuce"...>`), lue dump par dump, pas seulement
comptée (règle 15). Cette tranche n'ajoute AUCUNE visite à `/rcm/[cid]` (les deux `dire()`
ajoutées lisent `/testing`, déjà visité) : le compte à quatre est identique à la tranche
précédente (F56), comme attendu. Détail complet : `docs/CHASSE.md` F57 (44ᵉ confirmation
consécutive que `#418` est disjoint du produit). Pas de `verify` complet dédié à cette tranche
(discipline de coût : changement purement additif de lecture, sur du script de clics, aucun code
d'application touché — `npm run clics` + `tsc --noEmit` en sont la preuve proportionnée).

**Restent NON OBSERVÉES (11 lignes), cheapest-first pour la suite** : `MAT-03` (le ré-import
lui-même est cliqué, mais aucune assertion ne capture tirage/papiers/visas avant/après — nécessite
un DEUXIÈME import inséré APRÈS que tirage/papiers/visas existent déjà dans le parcours, risque de
perturber le parcours canonique) ; `VID-01` rétention (nécessite rapport signé + notes de revue
closes, état gardé plus lourd à atteindre) ; `EXTRAP-01/02/03` (R80/R81, clics non étendu) ;
`EXTRAP-04` (ci-dessus — la lecture existe, l'invariant reste à faire tenir) ; `AUTO-01`
(structurellement impossible aujourd'hui — aucun point d'entrée écran) ; `AUTO-02` et le test des
deux gardes indépendantes (structurellement plus difficiles, disclosed) ; les trois lignes R87
(notif-carte-id/notif-role/notif-disparition — nécessite de câbler `/notifications`, jamais
branché à un écran, lift plus lourd).

---

## Mandat de clôture, §3 — CTRL-01..07/VID-01/annexe sourcée observés par un clic réel (2026-09-19)

*Ouvert par le mandat de clôture du fondateur (2026-09-19) : H-6 gelé, §2 a produit
`docs/CLOTURE.md` (31 épreuves des mandats 08/09/10/14 septembre, 5 OBSERVÉES au départ — 16 %).
§3 demande de fermer les lignes NON OBSERVÉ, la moins chère d'abord, un rituel d'expédition par
ligne — ce rituel en ferme DOUZE d'un coup, toutes de la même famille (le domaine SOX/ICFR,
`/rcm/[cid]`, jamais visité par le parcours cliqué depuis sa construction).*

**Constat qui a rendu ce rituel possible** : le RCM importe SEPT contrôles
(`dataset/sox/rcm.csv`), le semeur (`part2.ts::runPart2`) n'en cycle que DEUX (C-BR-01, C-REV-01)
— déjà entièrement conclus, donc aucun refus CTRL-0X ne peut plus s'y observer. Les CINQ autres
restent vierges (`di_walkthrough_evidence_id is null`, `di_status='not_assessed'`) : exactement
l'état requis pour PROVOQUER chaque refus, un par un, en retirant la cause qui vient de le
déclencher avant de passer au suivant — jamais un refus démontré sur un monde construit exprès
pour qu'il tienne (règle 17 appliquée au parcours cliqué lui-même).

**Implémentation** (`contexte.ts` étendu : trois contrôles vierges résolus par fréquence —
mensuel, adhoc, quotidien ; trois nouvelles stations dans `scenario.ts`) :
- **La ladder CTRL-01/02/03** (contrôle mensuel vierge, C-REV-03) : refus observé pour CHAQUE
  forme — CTRL-01 sans aucune tâche, CTRL-01 avec une tâche documentée par la seule inquiry,
  CTRL-02 avec les quatre facteurs vides, CTRL-03 sans IUC, CTRL-03 avec IUC utilisée sans preuve
  (nommant les deux volets) — chacune levée par le geste réel avant de passer à la suivante ; la
  conclusion RÉUSSIT enfin une fois les trois levées. Puis VID-01 : suppression tracée (qui,
  quand, motif) et ré-attachement, jamais un cul-de-sac. Puis CTRL-04 : le message « non
  rapprochée » avant, le formulaire de tirage après.
- **CTRL-05** (contrôle adhoc vierge, C-REV-04) : la demande de population est créée par UN clic
  réel, visible dans l'espace de demandes — corrige au passage un DÉCOR relevé par la recherche
  du 2026-09-19 (le semeur créait cette même demande par un INSERT SQL brut).
- **CTRL-07 et l'annexe sourcée** (contrôle quotidien vierge, C-TR-01, population dérivée > 200) :
  le message CTRL-07 s'affiche après rapprochement, nommant les trois jugements de cabinet non
  posés. La phrase verbatim de l'annexe du 10 septembre (« these are suggested minimum sample
  sizes... », absente de tout `app/src` avant cette tranche) est ajoutée au type du pack
  (`TableEchantillonnageAttribut.minimaCaveat`), portée par `pcaob-sox.ts`, propagée par
  `tailleEchantillonOe` (`sox.ts`) et rendue sous la taille affichée dans les DEUX branches —
  observée sur le contrôle mensuel (population ≤ 200, bande minima).
- **CTRL-06 et §1.5 (extrapolation, tests de contrôles)** (contrôle DÉJÀ cyclé, C-BR-01) : révision
  de l'inquiry OE en y sélectionnant la pièce du walkthrough D&I lui-même — refusé, nommant le
  contrôle. La phrase « aucune projection sur un test de contrôles » (ISA 530 §A20) est lue à
  l'écran sur ce même contrôle, déjà testé par le semeur.

**Un réfutateur** (règle 30 : aucun code de refus nouveau, aucun modèle de données au sens
strict) : UN constat RÉEL, MOYEN — `pristine()` n'était pas scopée par engagement, alors que
`enrichir.ts` importe le même RCM dans `engNep` à chaque `npm run demo`/reconstruction de
production, risquant une résolution ambiguë sur le monde enrichi (jamais mesuré, le run de clics
validé n'utilisant que `db:reset && demo:seed`). Corrigé (`e1c1a0f`) : scopée sur l'engagement du
contrôle qui porte un walkthrough. Tout le reste : ZÉRO défaut, vérifié en exécutant (préconditions
de chaque refus confirmées réelles par lecture directe, `minimaCaveat` confirmé ne fuite jamais
dans la branche >200, chaque regex vérifiée caractère pour caractère contre le texte réel des
refus, aucun identifiant de modèle neuf, aucun `{{` littéral, aucun fichier sonde résiduel).

**Incident de règle 34, pas d'infrastructure** : le premier essai de `verify` a été TUÉ
immédiatement (pas attendu) parce que le correctif du constat MOYEN a été écrit PENDANT qu'il
tournait — relancé sur l'arbre corrigé, jamais mesuré sur l'arbre qui bougeait. Un redémarrage de
conteneur a ensuite interrompu `npm run visuel` (relancé séparément après `verify`, la chaîne `&&`
s'arrêtant à `clics` comme à chaque tranche précédente) — rien perdu, relancé identiquement.

**Mesures finales** (verify complet, second essai sur l'arbre du commit `e1c1a0f`, `timeout 7200`,
`set -o pipefail`) : `tsc` propre ; vitest 163 fichiers/163, 1246 tests/1246 (inchangé — cette
tranche ajoute des stations clics, pas des tests vitest) ; gardes 47 ; semeur à jour ; plancher
1246/632 propre ; langue propre (15/15 cas connus mauvais) ; lectures 0 perdue/1990 (6/6 cas
connus mauvais) ; parcours 5/5 cas connus mauvais (371 déclarées/290 figées, 81 nouvelles — les 17
vérifications ajoutées, 0 station perdue) ; screens 98 routes/0 échec ; fumee 55 routes/0 échec ;
densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — QUATRE occurrences de `#418` (au lieu
d'une habituellement, attendu : ces stations quadruplent les visites à `/rcm/[cid]`, la classe de
route où `#418` s'est toujours manifesté), même signature jeton 87/`rail-astuce` vérifiée sur les
quatre dumps — QUARANTE-TROISIÈME confirmation consécutive (docs/CHASSE.md, F56) ; les 17
assertions nouvelles TOUTES vertes, sur deux runs de clics indépendants. `npm run visuel` (relancé
séparément après le redémarrage de conteneur) : 356 vues/0 défaut.

**docs/CLOTURE.md, après ce rituel** : 17 OBSERVÉES / 14 NON OBSERVÉES / 0 SANS OBJET sur 31 (55 %,
contre 16 % avant). Les 14 lignes restantes : `mat-03`, les trois sous-parties de `vid-01-retention`
(compteur de conservation), `ctrl-semeur` (SEMEUR_VS_CHEMIN.md pas encore régénéré depuis cette
tranche), et les neuf lignes du mandat du 14 septembre (extrapolation/automatisation/notifications)
— dont `auto-01`, structurellement impossible à observer aujourd'hui sans construire un nouvel
écran (`definirNiveauMission` n'a AUCUN point d'appel dans `app/src/app`).

**SHA servi** : [à confirmer].

---

## Lot 7, H-6 tranche 13 — fontSize/padding en dur hors .faint, dans les .tsx (2026-09-18)

*Recherche fraîche (sous-agent) après la clôture du mandat de la tranche 9 (confirmation SHA-servi
de la tranche 12, règle 32) : le cluster `.faint` + `fontSize` de la tranche 3 avait un périmètre
étroit (la combinaison exacte className `.faint` + fontSize) et laissait des sites en dur SANS
`.faint`, jamais scopés par aucune tranche 1-12.*

**Implémentation** : 15 sites EXACTS migrés dans 6 fichiers : `fontSize: 11` (5 sites) →
`var(--t0)`, `fontSize: 12` (9 sites) → `var(--t1)`, `padding: 24` (1 site, `global-error.tsx`,
valeur unique, pas de raccourci multi-valeurs) → `var(--e5)`.

**Garde neuf** (`globals.css.test.ts`) : scanne tous les `.tsx` sous `src/app` pour les 3 paires
prop+valeur, seuil à zéro, cas connu mauvais par paire (fichier sonde réel écrit puis supprimé,
même discipline que les tranches 4-8).

**Deux bugs réels trouvés et corrigés AVANT tout commit** (règle 17 appliqué à soi-même) : (1) la
recherche déléguée comptait 14 sites, pas 15 — `provenance/page.tsx:172` avait déjà `paddingLeft`
migré (tranche 8) mais gardait `fontSize: 12` EN DUR sur la même ligne, classé « déjà migré » par
erreur ; trouvé en écrivant le garde lui-même. (2) le premier jet du garde utilisait `\b` comme
frontière de valeur — `\b` matche entre un chiffre et un point, donc `fontSize: 11.5` (site
délibérément hors périmètre) comptait à tort comme `fontSize: 11` ; trouvé en exécutant le test
avant de committer, corrigé en `(?![.\d])`.

**Un réfutateur** (règle 30 : tranche CSS pure) : UN constat RÉEL, MOYEN — le nouveau garde est un
balayage de texte brut sans conscience des commentaires/chaînes (un commentaire ou une chaîne i18n
contenant littéralement `fontSize: 11` compterait à tort), angle mort non nommé par le commentaire
d'en-tête (règle 19). Zéro occurrence de ce genre dans l'arbre actuel (vérifié par le réfutateur),
non bloquant. Corrigé (`88cf415`) : phrase ajoutée au commentaire du garde. Tout le reste : ZÉRO
défaut — 15 substitutions vérifiées correctes par diff, garde exercé en réintroduisant `fontSize:
11` dans un vrai fichier puis en confirmant l'échec, aucun fichier sonde résiduel, `tsc` propre.

**Mesures finales** (verify complet, PREMIER essai suffisant cette fois, arbre du commit
`88cf415`, `timeout 5400`, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163,
1246 tests/1246 (+3 vs tranche 12) ; gardes 47 propre ; semeur à jour ; plancher 1246/632 propre ;
langue propre (15/15 cas connus mauvais) ; lectures 0 perdue/1990 (6/6 cas connus mauvais) ;
parcours 5/5 cas connus mauvais (290/347 stations figées, inchangé) ; screens 98 routes/0 échec ;
fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — UNE SEULE
occurrence de `#418`, `/eng/[id]/rcm/[cid]` (l'habituelle, jeton 87, même signature que les 41
confirmations précédentes, les 19 autres divergences du dump étant le même bruit de normalisation
déjà documenté, aucune trace des jetons de cette tranche) — QUARANTE-DEUXIÈME confirmation
consécutive, 286 étapes/403 clics/63 gestes ; `npm run visuel` relancé séparément avant le début
de la tranche : 356 vues/0 défaut.

**Suite naturelle** : aucun candidat H-6 restant n'est encore scopé pour une prochaine tranche
mécanique — même position qu'à la clôture de la tranche 12 (voir sa section ci-dessous).

**SHA servi** : [à confirmer — commit d'implémentation `b76b4a9`, correctif `88cf415`, poussés sur
`main`, déploiement Vercel pas encore vérifié à l'écriture de cette section].

---

## Lot 7, H-6 tranche 12 — CLÔTURE du mandat entier DANS globals.css (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 11 (règle 32).*

**Implémentation** : dernier cluster hors périmètre du mandat ouvert par la tranche 9 — les 22
sites d'espacement (`margin*`/`padding*`/`gap`) à valeur unique et jeton `--eN` exact DANS
`globals.css`, en 15 paires propriété+valeur distinctes, migrés vers leurs jetons. Un raccourci à
deux valeurs (`padding: 12px 18px`) délibérément laissé en dur — la substitution exige une
correspondance EXACTE bornée par le `;` ; un premier essai sans cette borne avait accidentellement
matché ce site, corrigé AVANT tout commit.

**Garde neuf** (`globals.css.test.ts`) : un cluster séparé (pas d'équivalent pré-existant pour
l'espacement), sondé EN MÉMOIRE (jamais un vrai fichier écrit sur disque, même discipline que le
garde `font-size` d'origine). 15 cas connus mauvais, un par paire, plus un test nommant le
raccourci hors périmètre.

**Un réfutateur** (règle 30 : tranche CSS pure) : UN constat RÉEL, MOYEN — un SECOND raccourci à
deux valeurs (`padding: 16px 18px`, `.panel`, ligne ~268, dont le premier jeton est lui-même l'une
des 15 valeurs ciblées) partageait la même classe de risque que celui nommé, protégé PAR CHANCE
par la même regex mais sans mention ni test dédié. Corrigé (`bfef46c`) : commentaire mis à jour,
test dédié ajouté, 36/36 (+1). Tout le reste : ZÉRO défaut — 22 sites revérifiés un par un,
ventilation par jeton recomptée indépendamment, jetons `--eN` jamais redéfinis, l'unique
coexistence `gap`/`row-gap` de même famille confirmée préexistante et non aggravée.

**Incidents d'infrastructure, aucun n'a affecté le code livré** (docs/CHASSE.md, F54) : (1) le
premier essai de `verify` (`timeout 5400`) a été tué par son propre budget mi-`clics` — root-causé
via les horodatages du journal (exactement 5400,09 s), pas supposé — deuxième fois que 5400 s
s'avère insuffisant dans cette série ; (2) le conteneur a été redémarré PENDANT le second essai
(`timeout 7200`), le perdant intégralement, sans fausse progression déclarée ; (3) un troisième
essai (toujours `timeout 7200`) a complété proprement après revérification de l'état du dépôt et
de PGlite sur le conteneur frais.

**Mesures finales** (verify complet, TROISIÈME essai sur l'arbre du commit `bfef46c`, `timeout
7200`, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1243 tests/1243 (+1
vs tranche 11) ; gardes 47 propre ; semeur à jour ; plancher 1243/632 propre ; langue propre
(15/15 cas connus mauvais) ; lectures 0 perdue/1990 (6/6 cas connus mauvais) ; parcours 5/5 cas
connus mauvais (290/347 stations figées, inchangé) ; screens 98 routes/0 échec ; fumee 55
routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — UNE SEULE occurrence de
`#418`, `/eng/[id]/rcm/[cid]` (l'habituelle, jeton 87, même signature que les 38 confirmations
précédentes) — QUARANTE ET UNIÈME confirmation consécutive, 286 étapes/403 clics/63 gestes
(inchangé) ; `npm run visuel` relancé séparément avant le début de la tranche : 356 vues/0 défaut.

**Le mandat entier ouvert par la tranche 9 est désormais CLOS** : les 49 sites à jeton exact DANS
`globals.css` (27 de police + 22 d'espacement) sont migrés en totalité. Aucun candidat H-6 restant
n'est encore scopé pour une prochaine tranche mécanique — la suite naturelle exige soit une
recherche de scoping fraîche (p. ex. l'échelle `--eN` restante dans les `.tsx` hors des clusters
déjà migrés tranches 4-8), soit le jugement du fondateur sur l'épure terminée (explicitement hors
de portée de cette session — « le verdict du fondateur sur l'épure achevée vient plus tard,
délibérément »).

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_CRgMr7gaW4RPZvjbxFVEf5HTqCNe`, cible
production) READY, commit `35c6c7801e5d27335bfd1f7c0a49c16af96424c5` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 21:51:58Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor (semeur.ts)
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante` (tranche CSS pure). Le déploiement a
connu un délai de file d'attente inhabituel côté Vercel (INITIALIZING puis QUEUED pendant plusieurs
dizaines de minutes avant de construire) — confirmé par des vérifications directes répétées via
`mcp__Vercel__get_project`/`get_deployment`, pas supposé résolu ; une préversion du même commit
exact avait déjà construit avec succès entre-temps, confirmant que le code n'était pas en cause.

---

## Lot 7, H-6 tranche 11 — CLÔTURE du cluster font-size DANS globals.css (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 10 (règle 32).*

**Implémentation** : les 3 dernières valeurs restantes du cluster `font-size` à jeton exact DANS
`globals.css` (identifié par la tranche 9), chacune trop petite (1 à 3 sites) pour son propre
rituel d'expédition, batchées en UNE tranche consolidée (5 sites, 5 fichiers, même raisonnement
que la tranche 8 pour `margin*`/`padding*`) : `12.5px` → `--t2` (3 sites), `15px` → `--t5` (1
site), `13.5px` → `--t3` (1 site). MESURÉ APRÈS cette tranche : les 31 déclarations `font-size`
restantes (13× 13px, 9× 11.5px, 5× 10px, 1× 9px, 1× 26px, 1× 18px, 1× 10.5px) ne correspondent
plus à AUCUN jeton `--tN` existant — le cluster à jeton exact est CLOS.

**Garde neuf** (`globals.css.test.ts`) : seuil baissé de 36 à 31 (36 − 5 = 31, confirmé par le
détecteur lui-même) ; nouvelle assertion listant les 5 sélecteurs migrés avec leur jeton attendu
(`{motif, jeton}` par site, pas un jeton unique partagé).

**Un réfutateur** (règle 30 : tranche CSS pure) : AUCUN défaut trouvé, tout confirmé EN EXÉCUTANT.
Ventilation des 31 déclarations restantes recalculée indépendamment et programmatiquement (pas un
`grep -c` approximatif) — confirme précisément la revendication « cluster CLOS ». Les 5 regex du
nouveau test exécutées directement sur le fichier réel, chacune confirmée capturer la bonne règle
malgré des sélecteurs voisins piégeux (`.etape` vs la règle combinée `.panel, ..., .etape {...}`
plus loin dans le fichier ; `.topbar .brand` vs `.topbar .brand small` ; `.ancres` vs `.ancres
a`/`.ancres .repere`), avec le bon jeton pour chacune (aucune permutation).

**Mesures finales** (verify complet, sur l'arbre du commit `9347f58`, `timeout 5400`, `set -o
pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1226 tests/1226 (+1 vs tranche 10) ;
gardes 47 propre ; semeur à jour ; plancher 1226/632 propre ; langue propre (15/15 cas connus
mauvais) ; lectures 0 perdue/1990 (6/6 cas connus mauvais) ; parcours 5/5 cas connus mauvais
(290/347 stations figées, inchangé) ; screens 98 routes/0 échec ; fumee 55 routes/0 échec ;
densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — UNE SEULE occurrence de `#418`,
`/eng/[id]/rcm/[cid]` (l'habituelle, jeton 87, même signature que les 38 confirmations
précédentes) — QUARANTIÈME confirmation consécutive, 286 étapes/403 clics/63 gestes (inchangé) ;
`npm run visuel` relancé séparément avant le début de la tranche : 356 vues/0 défaut.

**Suite naturelle** : le cluster `font-size` DANS `globals.css` est CLOS. Seul candidat H-6
restant DANS ce fichier : les 22 sites d'espacement (`margin*`/`padding*`/`gap`, 15 paires
propriété+valeur distinctes, déjà scopés en lecture seule) — clôturerait l'intégralité du mandat
de tranche 9 (« ~43 déclarations », mesuré à 49, dont 27 de police déjà closes en tranches 9-11).

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_8Y9axxL4MiY1gEEW8KAvUTfz7sow`, cible
production) READY, commit `eb68d0086939936239b3be7f906ac56d43ff5fa5` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 18:49:13Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor (semeur.ts)
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante` (tranche CSS pure).

---

## Lot 7, H-6 tranche 10 — font-size: 12px en dur DANS globals.css (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 9 (règle 32).*

**Implémentation** : suite mécanique directe de la tranche 9 — `font-size: 12px` en dur DANS
`globals.css`, 9 occurrences, chacune une déclaration isolée dans sa règle (aucun raccourci
`font:` partagé — le seul du fichier, `.analytique-texte`, est sans rapport), migrées vers
`font-size: var(--t1)` — identité stricte (`--t1: 12px` est déjà la valeur par défaut de `.faint`,
inchangée par cette tranche).

**Garde neuf** (`globals.css.test.ts`) : seuil baissé de 45 à 36 (45 − 9 = 36, confirmé par le
détecteur lui-même) ; nouvelle assertion listant les 9 sélecteurs migrés et vérifiant chacun lit
désormais `var(--t1)`.

**Un réfutateur** (règle 30 : tranche CSS pure) : AUCUN défaut trouvé, tout confirmé EN EXÉCUTANT.
`tsc` propre, 18/18 tests, `--t1` unique et jamais redéfini, 0 occurrence brute restante, seuil
recalculé indépendamment à 36, les 9 sites relus un par un sans collision. Risque de collision de
sélecteur spécifiquement vérifié pour `table.data th` (ne capture pas `table.data th.num`) et
`.kpi .l` vs `.kpi .v`. Arithmétique du commentaire vérifiée correcte cette fois.

**Mesures finales** (verify complet, sur l'arbre du commit `d685a25`, `timeout 5400` dès le
lancement — mesure de la tranche 9 reprise — `set -o pipefail`) : `tsc --noEmit` propre ; vitest
163 fichiers/163, 1225 tests/1225 (+1 vs tranche 9) ; gardes 47 propre ; semeur à jour ; plancher
1225/632 propre ; langue propre (15/15 cas connus mauvais) ; lectures 0 perdue/1990 (6/6 cas
connus mauvais) ; parcours 5/5 cas connus mauvais (290/347 stations figées, inchangé) ; screens 98
routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` —
UNE SEULE occurrence de `#418` cette fois (retour à la normale après le doublé de la tranche 9),
`/eng/[id]/rcm/[cid]` (l'habituelle, jeton 87, même signature que les 37 confirmations
précédentes) — TRENTE-HUITIÈME confirmation consécutive, 286 étapes/403 clics/63 gestes
(inchangé) ; `npm run visuel` relancé séparément avant le début de la tranche : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue — candidat suivant scopé (lecture seule) : les 5 derniers sites
de `font-size` à jeton exact DANS `globals.css` (3× 12.5px → --t2, 1× 15px → --t5, 1× 13.5px →
--t3), qui clôturerait le cluster `font-size` entier de ce fichier. Ensuite : les 22 sites
d'espacement (`margin*`/`padding*`/`gap`) DANS `globals.css`.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_HPYf4eeqAML9uXoC1SiKwGtFLC3h`, cible
production) READY, commit `01e5ac984bf8301859301417450b1efae0f42528` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 17:58:39Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor (semeur.ts)
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante` (tranche CSS pure).

---

## Lot 7, H-6 tranche 9 — première migration DANS globals.css lui-même (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 8 (règle 32).*

**Implémentation** : première tranche H-6 à migrer une déclaration en dur DANS `globals.css`
lui-même, plutôt que dans un `.tsx`. Recherche dédiée (script) : le « ~43 déclarations » que la
tranche 8 approximait mesure en réalité 49 sites à valeur unique et jeton EXACT (22 d'espacement,
27 de taille de police). Sous-scopé au plus gros cluster homogène : `font-size: 11px` en dur, 13
occurrences, chacune une déclaration isolée dans sa règle (aucun raccourci CSS partagé), migrées
vers `font-size: var(--t0)` — identité stricte, le token `--t0: 11px` inchangé et jamais redéfini
ailleurs dans le fichier (vérifié).

**Garde neuf** (`globals.css.test.ts`) : seuil du cas connu mauvais de la tranche 1 baissé de 58 à
45 (58 − 13 = 45, confirmé par le détecteur lui-même) ; nouvelle assertion listant les 13
sélecteurs migrés et vérifiant chacun lit désormais `var(--t0)`.

**Un réfutateur** (règle 30 : tranche CSS pure) : un seul constat, MINEUR, hors code — une
arithmétique de commentaire (14+22 additionné à 27 au lieu de 36) — corrigé (`d2c262f`). Aucun
défaut critique ni moyen : les 13 sites vérifiés un par un (aucune collision de raccourci `font:`
— le seul du fichier, `.analytique-texte` ligne 572, est sans rapport), `--t0` confirmé unique
dans le fichier, seuil recalculé indépendamment à 45.

**Deux défauts réels trouvés par le `verify` complet lui-même, aucun dans le diff de la tranche**
(docs/CHASSE.md, F51) : (1) une course entre le garde i18n (`i18n.test.ts`, liste-puis-lit tout
`app/src`) et les fichiers sonde des gardes H-6 (règle 17, écrits-puis-supprimés le temps d'un
`it()`) — `vitest run` en parallèle peut faire disparaître un fichier sonde entre le listage et sa
lecture, `ENOENT` — latent depuis la tranche 3, jamais déclenché avant. Fixé : `catch` ciblé sur
`ENOENT`, fichier disparu traité comme absent (sémantique correcte), toute autre erreur reste
bloquante (`bc29616`). (2) `screens.test.ts` : un `ServeurTombe` isolé, un seul essai, jamais
reproduit dans le `verify` final où `screens` tourne séparément du `vitest run` complet (comme
toujours) — traité comme flake au sens de la règle 35, un seul re-lancement, pas re-creusé.

**Mesures finales** (verify complet, TROISIÈME essai sur l'arbre du commit `bc29616`, `timeout
5400` — 3600 s s'est avéré insuffisant pour cet arbre, mesuré, pas deviné — `set -o pipefail`) :
`tsc --noEmit` propre ; vitest 163 fichiers/163, 1224 tests/1224 (+1 vs tranche 8) ; gardes 47
propre ; semeur à jour ; plancher 1224/632 propre ; langue propre (15/15 cas connus mauvais
dénoncés) ; lectures 0 perdue/1990 (6/6 cas connus mauvais) ; parcours 5/5 cas connus mauvais
(290/347 stations figées, inchangé — `#418` empêche le gel complet depuis toujours) ; screens 98
routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` —
**DEUX** occurrences de `#418` cette fois (une première dans cette série, `docs/CHASSE.md` F51) :
`/eng/[id]/suivi` (le harnais lui-même la signale mal étiquetée — l'erreur vient du document
PRÉCÉDENT, `/acceptance`) et `/eng/[id]/rcm/[cid]` (l'habituelle). Les deux dumps portent la MÊME
signature (jeton 87, `rail-astuce`) que les 36 confirmations précédentes ; aucune trace de
`font-size: var(--t0)` dans l'un ou l'autre — TRENTE-SEPTIÈME confirmation consécutive que `#418`
est disjoint, 286 étapes/403 clics/63 gestes (inchangé) ; `npm run visuel` relancé séparément
avant le début de la tranche : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue — candidat suivant scopé (lecture seule, pas encore implémenté) :
`font-size: 12px` DANS `globals.css`, 9 sites, zéro collision de raccourci `font:` confirmée.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_3TsNAcPxuVmswHy3REXgnty9gzqA`, cible
production) READY, commit `ffaf1bcfd59d108d4e70061d5bfda89ea5180d10` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 17:08:25Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor (semeur.ts)
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante` (tranche CSS pure).

---

## Lot 7, H-6 tranche 8 — clôturer le cluster margin*/padding* en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 7 (règle 32).*

**Implémentation** : les 8 paires propriété+valeur restantes du cluster `margin*`/`padding*`
(identifié par la recherche de la tranche 3), chacune trop petite (1 à 4 sites) pour son propre
rituel d'expédition, batchées en UNE tranche consolidée — 20 sites, 15 fichiers : `marginTop:
8/12` → `--e2`/`--e3` (premier usage de `--e3` hors `globals.css`), `marginLeft: 8` → `--e2`,
`marginRight: 4` → `--e1`, `marginBottom: 4/8` → `--e1`/`--e2`, `paddingLeft: 8/16` →
`--e2`/`--e4` (premier usage de `--e4` hors `globals.css`). Cette tranche CLÔTURE le cluster :
les seules déclarations en dur restant hors périmètre de H-6 sont désormais les ~43 déclarations
DANS `globals.css` lui-même.

**Garde neuf** (`globals.css.test.ts`) : un sixième `describe` avec HUIT `it()` séparés — un par
paire, chacun avec son propre cas connu mauvais (règle 17), jamais une assertion groupée qui
masquerait laquelle des 8 a régressé.

**Un réfutateur** (règle 30 : tranche CSS pure) : aucun défaut critique ni moyen, malgré une
tranche plus grande et hétérogène que les précédentes. Vérifié EN EXÉCUTANT : `tsc` propre, 16/16
tests passent, les 20 sites relus un par un, aucune régression des tranches 4-7. Le risque signalé
(`margin: 0` et `paddingLeft` sur le même objet, `risk/page.tsx:206`) vérifié par raisonnement de
spec CSS (deux familles de propriétés indépendantes) — pas par exécution DOM, faute de `jsdom`
dans ce dépôt (dit explicitement). Un constat MINEUR hors code : une erreur d'arithmétique dans
l'énoncé de la mission du réfutateur (corrigée par le réfutateur lui-même : 96, pas 106).

**Mesures finales** (verify complet, sur l'arbre du commit `2b6d64e`, `timeout 3600`, `set -o
pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1223 tests/1223 (+8 vs tranche 7 :
les huit nouveaux gardes) ; gardes 47 propre ; semeur à jour ; plancher 1223/632 propre ; langue
propre (15/15 cas connus mauvais dénoncés) ; lectures 6/6 ; parcours 5/5 ; screens 98 routes/0
échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — SEULE
cause `#418` sur `/eng/70670df5-.../rcm/6505523a-...` (`rcm/[cid]`, l'habituelle, disjointe de
cette tranche), 286 étapes/403 clics/63 gestes (inchangé) — TRENTE-SIXIÈME confirmation
consécutive (docs/CHASSE.md, F50) ; `npm run visuel` relancé séparément (avant le commit, même
arbre de fichiers) : 356 vues/0 défaut.

**Suite naturelle** : le cluster `margin*`/`padding*` dans les `.tsx` est CLOS. Candidat restant
pour H-6 : les ~43 déclarations en dur DANS `globals.css` lui-même — jamais touchées par aucune
tranche H-6 jusqu'ici, la dernière frontière de la passe de design. Priorité 3 (H-3 slice 3,
optionnelle) reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__list_deployments` (`dpl_4c6q3Th9MnoguLXignF1YC9AkSnZ`, cible
production) READY, commit `281d901752d62fd41847f760ccb0450410889522` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 14:43:49Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor (semeur.ts)
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante` (tranche CSS pure).

---

## Lot 7, H-6 tranche 7 — jeton --e1, unifier marginLeft: 4 en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 6 (règle 32).*

**Implémentation** : suite mécanique du cluster `margin*`/`padding*` — la propriété+valeur
suivante par fréquence, `marginLeft: 4` (7 sites, 4 fichiers), migrée vers `marginLeft:
'var(--e1)'` par la même substitution regex ciblée que les tranches 4/5/6. Un des sites passe
`style` à un COMPOSANT (`IaFlag`), pas un élément DOM brut — vérifié que le prop `style?:
CSSProperties` est bien appliqué en interne (`<span style={style}>`), pas juste déclaré : la
migration a un effet réel. Commentaire ajouté dans `globals.css` documentant ce que cette tranche
NE couvre PAS (règle 19) : `marginTop: 8/12`, `marginLeft: 8`, `marginRight: 4`, `marginBottom:
4/8`, `paddingLeft: 8/16` (~32 sites restants) et les ~43 déclarations en dur dans `globals.css`
lui-même.

**Garde neuf** (`globals.css.test.ts`) : un cinquième `describe`, seuil à ZÉRO, cas connu mauvais
(règle 17).

**Un réfutateur** (règle 30 : tranche CSS pure) : aucun défaut critique, moyen ni mineur. Vérifié
EN EXÉCUTANT : `tsc` propre, 8/8 tests passent, `IaFlag` confirmé appliquer le style forwardé,
`marginTop: 4`/`gap: 4`/`gap: 8` (tranches 4/5/6) non régressés, aucun fichier sonde résiduel.

**Mesures finales** (verify complet, sur l'arbre du commit `aed6d7d`, `timeout 3600`, `set -o
pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1215 tests/1215 (+1 vs tranche 6 :
le nouveau garde `marginLeft: 4`) ; gardes 47 propre ; semeur à jour ; plancher 1215/632 propre ;
langue propre (15/15 cas connus mauvais dénoncés) ; lectures 6/6 ; parcours 5/5 ; screens 98
routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1`
— SEULE cause `#418` sur `/eng/70670df5-.../rcm/93faa552-...` (`rcm/[cid]`, l'habituelle,
disjointe de cette tranche), 286 étapes/403 clics/63 gestes (inchangé) — TRENTE-CINQUIÈME
confirmation consécutive (docs/CHASSE.md, F49) ; `npm run visuel` relancé séparément (avant le
commit, même arbre de fichiers) : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue en tranches. Candidats restants : `marginTop: 8/12`,
`marginLeft: 8`, `marginRight: 4`, `marginBottom: 4/8`, `paddingLeft: 8/16` (~32 sites, chacun
plus petit que les tranches précédentes), et les ~43 déclarations en dur DANS `globals.css`
lui-même. Priorité 3 (H-3 slice 3, optionnelle) reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_GjGh7myswmRsQCH3cAx7rAkceTUu`, cible
production) READY, commit `9aa08f7f16148fdd7cbc2a6b21befa983bf6a9f7` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 13:55:08Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, H-6 tranche 6 — jeton --e1, unifier marginTop: 4 en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 5 (règle 32).*

**Implémentation** : premier pas dans le cluster `margin*`/`padding*` en dur (identifié par la
recherche de la tranche 3, ~49 sites hétérogènes au total). Sous-scopé à la propriété+valeur la
plus fréquente : `marginTop: 4` (10 sites, 6 fichiers), migrée vers `marginTop: 'var(--e1)'` par
la même substitution regex ciblée que les tranches 4/5. Commentaire ajouté dans `globals.css`
documentant ce que cette tranche NE couvre PAS (règle 19) : les autres propriétés/valeurs du
cluster (`marginTop: 8/12`, `marginLeft: 4/8`, `marginRight: 4`, `marginBottom: 4/8`,
`paddingLeft: 8/16`, ~39 sites restants) et les ~43 déclarations en dur dans `globals.css`
lui-même.

**Risque spécifique à cette tranche, vérifié** : contrairement à `gap`, `marginTop` est une
sous-propriété d'un raccourci CSS potentiel (`margin`). Un objet `style={{}}` portant les deux
clés aurait un ordre de cascade dépendant de l'ORDRE d'écriture en JS. Vérifié EN EXÉCUTANT
(recherche croisée avec les numéros de ligne du diff) : aucun des 10 sites migrés ne porte un
raccourci `margin` dans le même objet de style — le risque ne se matérialise nulle part.

**Garde neuf** (`globals.css.test.ts`) : un quatrième `describe` scanne tous les `.tsx` sous
`src/app` pour `marginTop: 4` en dur, seuil à ZÉRO, avec un cas connu mauvais (règle 17).

**Un réfutateur** (règle 30 : tranche CSS pure) : aucun défaut critique, moyen ni mineur. Vérifié
EN EXÉCUTANT : `tsc` propre, 7/7 tests passent, comptage par propriété confirme exactement 55
occurrences `var(--e1)` (45 `gap` + 10 `marginTop`), `gap: 4`/`gap: 8` non régressés, aucun
fichier sonde résiduel (toutes tranches confondues).

**Mesures finales** (verify complet, sur l'arbre du commit `56fda5e`, `timeout 3600`, `set -o
pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1214 tests/1214 (+1 vs tranche 5 :
le nouveau garde `marginTop: 4`) ; gardes 47 propre ; semeur à jour ; plancher 1214/632 propre ;
langue propre (15/15 cas connus mauvais dénoncés) ; lectures 6/6 ; parcours 5/5 ; screens 98
routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1`
— SEULE cause `#418` sur `/eng/70670df5-.../rcm/2bc1a1fb-...` (`rcm/[cid]`, l'habituelle,
disjointe de cette tranche), 286 étapes/403 clics/63 gestes (inchangé) — TRENTE-QUATRIÈME
confirmation consécutive (docs/CHASSE.md, F48) ; `npm run visuel` relancé séparément (avant le
commit, même arbre de fichiers) : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue en tranches. Candidats restants : les 39 sites `margin*`/
`padding*` restants (`marginTop: 8/12`, `marginLeft: 4/8`, `marginRight: 4`, `marginBottom:
4/8`, `paddingLeft: 8/16`), et les ~43 déclarations en dur DANS `globals.css` lui-même. Priorité
3 (H-3 slice 3, optionnelle) reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_CAkg5P2PfwEPkQoKZcQZ2eq1XjwU`, cible
production) READY, commit `e20038ad2b18fc84b340129491d485bd458492be` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 13:07:59Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, H-6 tranche 5 — jeton --e2 (8px), unifier gap: 8 en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 4 (règle 32).*

**Implémentation** : suite mécanique directe de la tranche 4 — 14 occurrences EXACTES de `gap: 8`
(mot entier), 9 fichiers (dont trois hors `eng/[id]/` : `page.tsx`, `nouvelle-mission.tsx`,
`methodology/import-form.tsx`), migrées vers `gap: 'var(--e2)'` (`--e2` = 8px, ADR-125, jamais
redéfini) par la même substitution regex ciblée que la tranche précédente, chaque fichier
revérifié après coup (compte exact, `tsc`, aucune sur-transformation). Commentaire ajouté dans
`globals.css` documentant ce que cette tranche NE couvre PAS (règle 19) : les `margin*`/`padding*`
en dur restants (~49 sites) et les ~43 déclarations en dur dans `globals.css` lui-même.

**Garde neuf** (`globals.css.test.ts`) : un troisième `describe` scanne tous les `.tsx` sous
`src/app` pour `gap: 8` en dur, seuil à ZÉRO, avec un cas connu mauvais (règle 17) — un vrai
fichier sonde écrit puis supprimé dans l'arbre balayé.

**Un réfutateur** (règle 30 : tranche CSS pure) : aucun défaut critique, moyen ni mineur —
contrairement à la tranche 4 (qui avait trouvé le `{{` littéral hors périmètre), cette tranche
n'a soulevé AUCUN constat. Vérifié EN EXÉCUTANT : `tsc` propre, 6/6 tests passent, les 14
occurrences de `var(--e2)` relues une à une, `gap: 8` en dur totalement absent, `gap: 4` (tranche
4) non régressé, aucun fichier sonde résiduel.

**Mesures finales** (verify complet, sur l'arbre du commit `780b301`, `timeout 3600`, `set -o
pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1213 tests/1213 (+1 vs tranche 4 :
le nouveau garde `gap: 8`) ; gardes 47 propre ; semeur à jour ; plancher 1213/632 propre ; langue
propre (15/15 cas connus mauvais dénoncés) ; lectures 6/6 ; parcours 5/5 ; screens 98 routes/0
échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — SEULE
cause `#418` sur `/eng/70670df5-.../rcm/0970722e-...` (`rcm/[cid]`, l'habituelle, disjointe de
cette tranche), 286 étapes/403 clics/63 gestes (inchangé) — TRENTE-TROISIÈME confirmation
consécutive (docs/CHASSE.md, F47) ; `npm run visuel` relancé séparément (avant le commit, même
arbre de fichiers) : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue en tranches. Candidats restants : les `margin*`/`padding*` en
dur (~49 sites, `.tsx`), et les ~43 déclarations en dur DANS `globals.css` lui-même. Priorité 3
(H-3 slice 3, optionnelle) reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_E7DUk3QfgUkrKw9MGm5Z1b9mAjoB`, cible
production) READY, commit `ec9873d66a4bbcd1929bb5b144975e6d0d0cf498` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 12:20:44Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, H-6 tranche 4 — jeton --e1 (4px), unifier gap: 4 en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches), enchaîné sans
pause après la confirmation SHA-servi de la tranche 3 (règle 32).*

**Recherche** : la tranche 3 avait déjà scopé le candidat suivant — l'échelle `--e1..--e6`
(ADR-125) était définie (`--e1: 4px` … `--e6: 32px`) mais avait ZÉRO usage de `var(--eN)` hors de
`globals.css` lui-même : 94 sites `.tsx` candidats dans 36 fichiers, trop large pour une tranche
verticale (règle 5). Sous-scopé cette fois par VALEUR plutôt que par zone : `gap: 4` est un cas
mécaniquement non ambigu (identité stricte `4 === 4px`, aucun risque de cascade contrairement à
`.faint`/`fontSize` de la tranche 3, où `.mono` pouvait l'emporter sur `.faint`).

**Implémentation** : 45 occurrences EXACTES de `gap: 4` (mot entier, jamais `gap: 40` etc.),
18 fichiers, migrées vers `gap: 'var(--e1)'` par une substitution regex ciblée (script Python,
`gap: 4\b` → `gap: 'var(--e1)'`), chaque fichier revérifié après coup (compte exact, `tsc`,
aucune sur-transformation par proximité — ex. `gap: 8` resté intact dans les mêmes fichiers).
Commentaire ajouté dans `globals.css` juste avant le bloc `--e1..--e6`, documentant ce que cette
tranche NE couvre PAS (règle 19) : `gap: 8` (14 sites, candidat `--e2`), les `margin*`/`padding*`
en dur (~49 sites), les ~43 déclarations en dur dans `globals.css` lui-même.

**Garde neuf** (`globals.css.test.ts`) : un second `describe` scanne tous les `.tsx` sous
`src/app` pour `gap: 4` en dur, seuil à ZÉRO, avec un cas connu mauvais (règle 17) — un vrai
fichier sonde écrit puis supprimé dans l'arbre balayé.

**Un réfutateur** (règle 30 : tranche CSS pure) : aucun défaut critique ni moyen. Vérifié EN
EXÉCUTANT : `tsc` propre, 5/5 tests passent, les 45 occurrences de `var(--e1)` relues une à une
(syntaxe correcte, toutes dans un `style={{}}` React, aucune sur-transformation), `gap: 4` en dur
totalement absent, `gap: 8` inchangé (14 sites), aucun fichier sonde résiduel.

**Correctif trouvé par le PREMIER passage du verify complet, hors périmètre de cette tranche** :
`scripts/reprise.test.ts` a rougi sur un `{{` littéral dans `docs/instantanes/servi.json::mesure.
par` (introduit par le commit de confirmation SHA servi de la tranche 3, APRÈS le verify de cette
tranche-là — donc jamais vu avant ce passage-ci). Reformulé sans le double-accolade littéral
(aucun changement de sens), commit dédié, revérifié isolément (24/24) avant de relancer le verify
complet dans son ensemble. Détail complet : docs/CHASSE.md, F46.

**Mesures finales** (second passage du verify complet, sur l'arbre du commit `ca60206`, `timeout
3600`, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163 fichiers/163, 1212 tests/1212
(+1 vs tranche 3 : le nouveau garde `gap: 4`) ; gardes 47 propre ; semeur à jour ; plancher
1212/632 propre ; langue propre (15/15 cas connus mauvais dénoncés) ; lectures 6/6 ; parcours
5/5 ; screens 98 routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà du
seuil ; clics `EXIT=1` — SEULE cause `#418` sur `/eng/70670df5-.../rcm/8e5fbf20-...` (`rcm/[cid]`,
l'habituelle, disjointe de cette tranche qui ne touche aucun fichier `rcm`), 286 étapes/403
clics/63 gestes (inchangé) — TRENTE-DEUXIÈME confirmation consécutive (docs/CHASSE.md, F46) ;
`npm run visuel` relancé séparément (avant le commit, même arbre de fichiers) : 356 vues/0
défaut.

**Suite naturelle** : H-6 continue en tranches. Candidats restants déjà identifiés : `gap: 8` (14
sites, `--e2`), les `margin*`/`padding*` en dur (~49 sites), le cluster `.faint`/`fontSize` déjà
clos (tranche 3), et les ~43 déclarations en dur DANS `globals.css` lui-même. Priorité 3 (H-3
slice 3, optionnelle) reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_38V2MgRkX46WwQiFRXJz8tFwHcro`, cible
production) READY, commit `4cea5e4be23efb30f0ac6f35d1596036eca755f1` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 11:31:08Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, H-6 tranche 3 — jeton --t0 (11px), unifier .faint + fontSize en dur (2026-09-18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches, « jusqu'à ce
que les écrans tiennent ensemble comme une épure, pas jusqu'à ce qu'un compte de jetons atteigne
zéro »), enchaîné sans pause après la confirmation SHA-servi de la tranche 2 (règle 32).*

**Recherche préalable dédiée** (un sous-agent, lecture seule) a comparé deux candidats : (1) le
cluster `className="faint" style={{ fontSize: N }}` en dur — 25 sites, 17 fichiers, aucun jeton ne
les couvrant hormis 12px qui matche déjà `--t1` — contre (2) l'échelle d'espacement `--e1..--e6`,
définie depuis ADR-125 mais avec ZÉRO usage de `var(--eN)` hors de `globals.css` lui-même et 94
sites candidats dans 36 fichiers `.tsx`. Recommandation retenue : le candidat 1, mieux scopé pour
une tranche verticale (règle 5) ; le candidat 2 est noté pour une tranche future, à redécouper par
zone fonctionnelle plutôt que par valeur (le formulaire inline `<form style={{ gap: 4, ... }}>`
concentre à lui seul 7 des 94 sites, rien qu'à `rcm/[cid]`).

**Implémentation** : `--t0: 11px` ajouté au bloc `:root` typographique de `globals.css`, à côté de
`--t1..--t7`. Des 25 sites : 15 valaient 11px (le cas dominant, aucun jeton ne le couvrait) →
migrés vers `var(--t0)`, dans 6 fichiers (`fs-tieout`, `acceptance`, `loop`, `processus`,
`completion`, `carry-forward`). 6 valaient 12px, REDONDANTS avec la valeur par défaut de `.faint`
(`.faint { font-size: var(--t1) }`, déjà 12px) → le style inline lui-même est supprimé plutôt que
tokenisé pour rien, dans 2 fichiers additionnels (`processus` ×3 encore, `ask` ×2, `rcm/[cid]` ×1).
Total : 8 fichiers, 21 sites, 1 nouveau jeton.

**Ce que cette tranche NE couvre PAS (règle 19), délibérément** : quatre sites restent en dur,
documentés dans le commentaire `globals.css` — `risk/page.tsx:440,449` (10px), `testing/
atelier.tsx:441` (11.5px), `testing/page.tsx:492` (13px, un élément `"v faint"` qui cumule déjà
trois déclarations de taille en conflit — `--t7`, `--t1`, l'inline). Aucune de ces trois valeurs
ne vaut 11px ni 12px, et `testing/*` est précisément le fichier où H-6 tranche 2 a cassé deux fois
sur `fmtEur` — y toucher dans la même tranche qui introduit un nouveau jeton cumulerait deux
risques évitables. L'échelle `--e1..--e6` reste hors périmètre (candidat 2 ci-dessus).

**Garde neuf** (`globals.css.test.ts`) : un `describe` scanne tous les `.tsx` sous `src/app` pour
le pattern `className="...faint..." style={{ fontSize: N }}`, seuil gardé à 4 (les quatre
exclusions), avec un cas connu mauvais (règle 17) qui écrit puis supprime un VRAI fichier sonde
dans l'arbre balayé (`__sonde_h6_tranche3__.tsx`, jamais laissé sur disque). CE QUE CE GARDE NE
VÉRIFIE PAS : l'ordre inverse `style={{}} className="faint"` (zéro site actuel dans cet ordre,
vérifié, mais un futur site ainsi écrit y échapperait en silence) — constat mineur du réfutateur,
jugé seul, non corrigé dans cette tranche (angle mort documenté, pas bloquant).

**Un réfutateur** (règle 30 : tranche CSS pure, ni données/sécurité/multi-tenant/refus, un seul
suffit) : aucun défaut critique ni moyen. Vérifié EN EXÉCUTANT (pas seulement lu) : les 4/4 tests
passent réellement, le détecteur `compterFaintFontSizeEnDur` ré-exécuté indépendamment du test
retourne exactement 4, `--t1` vaut bien 12px et n'est jamais redéfini (clair comme sombre), la
cascade `.mono`/`.faint` sur les 4 sites qui portent les deux classes confirme que `.faint` gagne
(ordre dans la feuille : `.mono` précède `.faint`) donc les 6 suppressions étaient bien neutres,
`tsc --noEmit` propre, aucun fichier sonde résiduel, `grep` élargi à tout `src/app` (pas seulement
`eng/`) : zéro site oublié.

**Mesures finales** (verify complet sur le commit `b454b3c`, `timeout 3600`, `set -o pipefail`) :
`tsc --noEmit` propre ; vitest 163 fichiers/163, 1211 tests/1211 (+1 vs tranche 2 : le nouveau
garde) ; gardes 47 propre ; semeur à jour ; plancher 1211/632 propre ; langue propre (15/15 cas
connus mauvais dénoncés) ; lectures 6/6 ; parcours 5/5 ; screens 98 routes/0 échec ; fumee 55
routes/0 échec ; densite 88 écrans/0 au-delà du seuil ; clics `EXIT=1` — SEULE cause `#418` sur
`/eng/70670df5-.../rcm/88f6d3dc-...` (`rcm/[cid]`, l'habituelle, disjointe de cette tranche qui ne
touche aucun fichier `rcm`), 286 étapes/403 clics/63 gestes (inchangé — pas de `scenario.ts`
touché) — TRENTE ET UNIÈME confirmation consécutive (docs/CHASSE.md, F45) ; `npm run visuel`
relancé séparément (avant le commit, même arbre de fichiers, chaîne `&&` s'arrête à `clics`
sinon) : 356 vues/0 défaut.

**Suite naturelle** : H-6 continue en tranches (prochaine candidate déjà scopée par la recherche
de cette tranche : l'échelle `--e1..--e6`, à redécouper par zone fonctionnelle — commencer par les
formulaires inline `rcm/[cid]` qui en concentrent 7/94). Priorité 3 (H-3 slice 3, optionnelle)
reste en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_3vY1ajipkAXTEyyWUBx3Gq6UCwHB`, cible
production) READY, commit `b0f1b1bdda65e7ae0979b6717bd1540f60cda78c` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 10:24:55Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, H-6 tranche 2 — unifier .kpi .v et .epure-chiffre (2026-09-17/18)

*Suite du mandat du fondateur (ruling du 2026-09-17, Priorité 2 : H-6 en tranches, « jusqu'à ce
que les écrans tiennent ensemble comme une épure, pas jusqu'à ce qu'un compte de jetons atteigne
zéro »), enchaîné sans pause après R100 (règle 32).*

**Recherche préalable dédiée** (un sous-agent, lecture seule) : plutôt que de continuer à migrer
des déclarations `font-size:` une par une (tranche 1), la recherche a cherché la prochaine
incohérence VISUELLEMENT significative. Trouvée : `.kpi .v` (22px/700, six écrans — dashboard,
population, balances-aux, materiality, testing, estimations) et `.epure-chiffre` (40px/300, un
seul écran — suivi) portent le MÊME rôle sémantique — le chiffre unique qu'une carte-résumé met
en avant — avec deux traitements visuels incompatibles, à un clic de rail l'un de l'autre.
Exactement le défaut qu'une revue nomme « trop AI generated ». Vérifié par lecture directe avant
d'agir (pas seulement le rapport du sous-agent) : les deux sélecteurs confirmés dans globals.css,
les six/un écrans confirmés par grep, le rôle sémantique confirmé en lisant un exemple de chaque.

**Implémenté** (commit `9dfdba7`) : `--t7` (40px, la valeur déjà en usage par `.epure-chiffre`)
ajouté à l'échelle typographique. `.kpi .v` migré sur `--t7`/poids 300 (au lieu de 22px/700) ;
`.epure-chiffre` migré sur `var(--t7)` (au lieu du magic number 40px). Unifié vers le traitement
`.epure` — le vocabulaire le plus récent du dépôt, marqué « premier écran dans le nouveau langage »
à sa création — jamais l'inverse. `globals.css.test.ts` : seuil des déclarations `font-size:` en
dur baissé de 60 à 58 (les deux convergent vers `--t7`) ; nouvelle assertion que `.kpi .v` et
`.epure-chiffre` lisent le MÊME jeton et le même poids.

**Un réfutateur** (règle 30) : un défaut RÉEL trouvé et confirmé par capture d'écran — la carte
« Population amount » (`population/page.tsx`) affichait « 5 648 676,30 » sur une ligne et « € »
seul sur la suivante (`fmtEur` joignait le montant à `' €'` avec un espace ORDINAIRE, cassable,
alors qu'`Intl.NumberFormat('fr-FR')` sépare déjà les milliers par une espace fine insécable).

**Trois rounds de correctif, chacun A/B testé par exécution, pas supposé** (commits `9151883`,
`7d7c04d`, `d063aec`, `13b5ea8`, `1610e3b`, `e2bbb91`) :
1. `fmtEur` changée PARTOUT (espace insécable) fixait population mais cassait `/eng/[id]/testing`
   (`table.data.cellules`, colonnes Attendu/Trouvé) — 8 défauts `npm run visuel` NOUVEAUX.
2. Deux tentatives de correctif CSS structurel (`table-scroll` sur la table cellules, `min-width:
   0` sur les items de la grille `.atelier`) n'ont RIEN changé à la mesure — chiffres identiques
   au pixel près avant/après chacune, prouvant que le défaut n'était pas là où elles le
   supposaient.
3. Un A/B direct (même arbre, seul `fmtEur` changé entre deux runs `npm run visuel`) a tranché :
   0 défaut avec l'ancien `fmtEur` (espace cassable), 8 défauts avec le nouveau — la cause était
   `fmtEur` elle-même, pas la grille. Corrigé en SCINDANT la fonction plutôt qu'en la changeant
   globalement : `fmtEur` retrouve son comportement d'origine (20+ appelants restants, tableaux
   denses compris) ; `fmtEurTitre` (nouvelle, espace insécable) réservée aux 9 appels qui rendent
   VRAIMENT un `.kpi .v`/`.epure-chiffre` (population, materiality ×4, estimations ×4). Un
   TROISIÈME A/B a ensuite trouvé que `/eng/[id]/testing` restait à 8 défauts même avec seulement
   SES PROPRES cinq cartes `.kpi` sur `fmtEurTitre` — cette page (le tableau `.atelier` ET son
   panneau d'évaluation séparé) tient à 1280px avec une marge proche de zéro. Isolé : reverter
   CES CINQ appels sur `fmtEur` suffit — 0 défaut. `/eng/[id]/testing` reste donc délibérément sur
   `fmtEur` pour ses cinq cartes, disclosed en toutes lettres dans `canon.ts` ET un commentaire
   in situ à l'appel (règle 19, corrigé après qu'une revue hostile ait trouvé le premier manquant).

**Un second réfutateur** (règle 30, sur l'état FINAL après les trois rounds) : SHIP AS-IS — appel
site systématique (9 `fmtEurTitre` génuinement `.kpi .v`/`.epure-chiffre`, 5 `fmtEur` sur testing
correctement exceptés, aucun oubli dans un sens ou l'autre), `canon.ts::fmtEur` byte-identique à
l'origine, `atelier.tsx`/`globals.css` revenus exactement à leur état pré-tranche (diff net vide
sur `atelier.tsx`), `globals.css.test.ts` réévalué correct. Un seul constat réel, non bloquant :
`testing/page.tsx` ne portait aucun marqueur pointant vers le raisonnement de `canon.ts` —
corrigé (commit `e2bbb91`) par un commentaire in situ avant les cinq appels.

**Mesures finales, ordre CANONIQUE, sur l'arbre du commit `5b508e3`** (`npm run verify`, budget
3600s, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163/163 fichiers (1210/1210 tests, +1
test vs R100 — la nouvelle assertion `.kpi .v`/`.epure-chiffre`) ; gardes/semeur/plancher/langue/
lectures/parcours propres (mêmes chiffres et dette pré-existante que les tranches précédentes) ;
screens 98/0 ; fumee 55/0 ; densite 88/0 ; clics EXIT=1 réel (seul motif #418, F44, TRENTIÈME
confirmation, 286 étapes/403 clics/63 gestes, inchangé — cette tranche ne touche pas
`scenario.ts`) ; visuel (relancé séparément trois fois pendant la tranche, une dernière fois sur
l'arbre final) 356 vues/0 défaut.

**Suite naturelle** : H-6 continue en tranches (prochaine candidate à scoper : le cluster de 43
occurrences `style={{ fontSize: N }}` en dur sur `.faint`, ou l'espacement `--e1..--e6` sous-migré
— 56 déclarations en dur contre 13 usages du jeton). Priorité 3 (H-3 slice 3, optionnelle) reste
en file après H-6.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_7jBji7W9rUASMqJpaY61cC52w65r`, cible
production) READY, commit `d4e644a74f1659f2877c91637f6ea6b5dcd30549` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 09:26:56Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor
89/16/31/42 inchangé. Aucune nouvelle lecture `/api/sante`.

---

## Lot 7, priorité 1 (R100) — l'atelier « détail du compte » pour EQUITY (2026-09-17)

*Suite du mandat du fondateur (ruling du 2026-09-17), enchaîné sans pause après R99 (règle 32) —
dernier item de la liste nommée « les ateliers manquants (R98, R99, R100) ».*

**Le constat** : CAPITAUX-VAR (poste EQUITY, nature `rapprochement`) et CAPITAUX-PV (nature
`sondage_pieces`) portaient un gap DOUBLE (disclosed R100 le 2026-09-16, tranche Lot 5) — aucune
des deux procédures propres au poste n'atteignait un atelier réel.

**Implémenté** (commit `be3c58c`) : `programme.ts::atelierDeLaNature`, nouveau cas
`rapprochement`+`EQUITY` → `/poste/EQUITY/detail-compte` — le MÊME atelier que PAYROLL (R98) et
INVENTORY (R99), zéro ligne de service changée, troisième poste sur le même écran. **Vérifié par
exécution, pas supposé** : `vuePoste(IDS.engNep, 'EQUITY')` confirme `blocs.echantillon.href`
pointant vers cet atelier, `etat:'en_cours'` ; PAYROLL et INVENTORY re-vérifiés dans le même
passage, sans régression. Contrairement à R99 (`observation_documentee`, qui avait exigé une
variable locale neuve dans `poste.ts`), AUCUN changement de `poste.ts` n'était nécessaire ici :
`atelierRapprochementSeul` était déjà générique par `fsliCode` depuis avant cette tranche —
hypothèse confirmée par exécution, pas par analogie.

**CAPITAUX-PV reste SANS atelier — disclosed R110** (`BACKLOG_REPORTE.md`, `fils.json`), pas
corrigé : `sondage_pieces` ne connaît que `/testing`, câblé en dur sur `revenuePopulation()` — le
même raisonnement que R92/R95/R96. En amont de ceux-ci : la population de CAPITAUX-PV porte
`predicat:"non_implemente"` dans la méthode (source = registre des assemblées, jamais le grand
livre), donc même la SOURCE des données à échantillonner n'existe encore nulle part dans ce
dépôt — hors du périmètre d'une tranche de câblage d'atelier (règle 9).

**Un réfutateur** (règle 30 : ni modèle de données, ni sécurité, ni refus neuf) : un constat réel
trouvé — l'entrée R100 pré-existante (écrite le 2026-09-16, tranche Lot 5 précédente) affirmait
encore « NI CAPITAUX-VAR NI CAPITAUX-PV N'A D'ATELIER », contredisant R110 dans le même fichier
une fois CAPITAUX-VAR câblée. Corrigé (commit `ef8c6f7`) : un paragraphe d'amendement ajouté APRÈS
le texte d'origine dans `BACKLOG_REPORTE.md` (jamais réécrit en place), `fils.json` mis à jour
(`etat` passé à « PARTIELLEMENT CORRIGÉ », texte d'origine déplacé dans `note`). Le reste de la
revue (collision/ordre dans `atelierDeLaNature`, genericité de `poste.ts`, `circularisations.ts`
— EQUITY n'est jamais circularisée, station clics, `AILLEURS`, `fsliAccounts('EQUITY')` non vide)
confirmé sain, aucun autre correctif nécessaire.

**Mesures finales, ordre CANONIQUE, sur l'arbre du commit `95f2c7e`** (`npm run verify`, budget
3600s, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163/163 fichiers (1209/1209 tests,
inchangé) ; gardes propres ; semeur à jour ; plancher 1209 test(s)/632, aucune forme éteinte ou
isolée ; langue 0 chaîne hors catalogue/0 en dur ; lectures 0 perdue sur 1990 chemins figés dans
93 écrans (6/6 cas connus mauvais dénoncés) ; parcours 347 déclarées/290 figées/57 nouvelles (5/5
cas connus mauvais dénoncés — même dette pré-existante que R98/R99, non traitée ici) ; screens 98
routes/0 échec ; fumee 55 routes/0 échec ; densite 88 écrans/0 au-delà de 5 actions ; clics EXIT=1
réel (seul motif #418, F43, VINGT-NEUVIÈME confirmation, 286 étapes/403 clics sur 63 gestes, les
CINQ assertions de la station EQUITY passent intégralement) ; visuel (relancé séparément, le `&&`
s'arrête avant lui) 356 vues/0 défaut (89 écrans, inchangé vs R98/R99 — même route).

**Priorité 1 (R98/R99/R100) est COMPLÈTE.** Les trois ateliers manquants nommés par le mandat du
fondateur sont câblés. Suite immédiate : Priorité 2 (H-6, passe de design profonde, en tranches,
« jusqu'à ce que les écrans tiennent ensemble comme une épure, pas jusqu'à ce qu'un compte de
jetons atteigne zéro »).

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_5j6qmRujjT4dZ2c5oNa9YmAr7sDg`, cible
production) READY, commit `c5efdc840f296aea5c01bcc4f3fc8cca03ddaf58` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 09:31:35Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor 89/16/31/42
inchangé. Aucune nouvelle lecture `/api/sante` (aucune mécanique neuve dans le service).

---

## Lot 7, priorité 1 (R99) — l'atelier « détail du compte » pour INVENTORY (2026-09-17)

*Suite du mandat du fondateur (ruling du 2026-09-17), enchaîné sans pause après R98 (règle 32).*

**Le constat** : STOCKS-INV (poste INVENTORY, nature `observation_documentee`) était plantée
(`part1.ts::planifierStocks`) sans AUCUN atelier atteignable — cette nature n'avait JAMAIS de route
nulle part dans `atelierDeLaNature`, contrairement à `rapprochement`/`confirmation_externe` qui
portaient déjà un écran avant leur propre tranche d'extension.

**Implémenté** (commit `aa52b7b`) : réutilise le MÊME `/eng/[id]/poste/[code]/detail-compte` que
PAYROLL (R98) — même précédent que `/circularisations`, qui sert déjà `confirmation_externe` ET
`rapprochement` sur le même écran : le geste (importer un listing client, rapprocher au grand
livre, expliquer l'écart) est identique. `programme.ts::atelierDeLaNature` : nouveau cas
`observation_documentee`+`INVENTORY`. **Trouvé par exécution, pas supposé** : ce seul changement
NE SUFFISAIT PAS — `vuePoste('INVENTORY')` restait `sans_objet`, parce que `poste.ts` ne
consultait QUE les natures `rapprochement`/`recalcul_parametre` via ses propres variables locales,
jamais `atelierDeLaNature` directement pour une nature arbitraire. Corrigé en ajoutant
`atelierObservationSeul` à côté d'`atelierRapprochementSeul` dans `blocEchantillon`. Revérifié par
exécution après ce second correctif : l'écran devient atteignable pour INVENTORY, PAYROLL reste
inchangé.

**R109 disclosed** (`BACKLOG_REPORTE.md`, `fils.json`), pas corrigé : cet atelier ne fait qu'UNE
réconciliation de TOTAL, pas le test BIDIRECTIONNEL ligne à ligne (réalité + exhaustivité) que le
`controle` de STOCKS-INV exige (`methodology/procedures.json` : « deux sens obligatoires »). Un
premier geste réel (le poste n'ouvre plus sur rien, D.0), pas le geste complet que la méthode
décrit — `account-detail.ts` porte déjà les lignes individuelles si une tranche future construit
le tirage bidirectionnel, hors du périmètre d'une tranche d'ouverture d'atelier (règle 9).

**Un réfutateur** (règle 30 : ni modèle de données, ni sécurité, ni refus neuf) : SHIP WITH MINOR
FIXES — un seul constat cosmétique (le texte de `rail.test.ts::AILLEURS` ne citait que R98, pas
R99, jamais comparé par le test), corrigé (commit `2bdc402`). Le OR entre les deux ateliers
(`atelierRapprochementSeul || atelierObservationSeul`) vérifié sans ambiguïté aujourd'hui (aucun
poste ne porte les deux natures à la fois), un risque latent noté pour une session future si un
poste venait à en porter deux.

**Mesures finales, ordre CANONIQUE, sur l'arbre du commit `2bdc402`** (`npm run verify`, budget
3600s, `set -o pipefail`) : `tsc --noEmit` propre ; vitest 163/163 fichiers (1209/1209 tests,
inchangé) ; gardes 47 ; semeur à jour ; plancher 1209/632 ; langue 15/15 ; lectures 0 perdue sur
1990 chemins figés dans 93 écrans ; parcours 5/5 (342 déclarées/290 figées/52 nouvelles — même
dette pré-existante que R98, non traitée ici) ; screens 98 routes/0 échec ; fumee 55/0 ; densite
88/0 ; clics EXIT=1 réel (seul motif #418, F42, vingt-huitième confirmation, 281 étapes/398 clics,
la station INVENTORY passe intégralement) ; visuel (relancé séparément) 356 vues/0 défaut (89
écrans, inchangé vs R98 — même route, pas une nouvelle).

**Priorité 1b (R99) est COMPLÈTE.** Suite immédiate : R100 (EQUITY — CAPITAUX-VAR/`rapprochement`
et CAPITAUX-PV/`sondage_pieces`, les deux natures déjà existantes, aucune UI neuve attendue non
plus).

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_Drfg4Mawd8C4hSDqqiHs4yZTz6Rg`, cible
production) READY, commit `d3f2a1ffc409295950fdfd01b89e75eeb3f4461b` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 08:17:37Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor 89/16/31/42
inchangé. Aucune nouvelle lecture `/api/sante` (aucune mécanique neuve dans le service).

---

## Lot 7, priorité 1 (R98) — l'atelier « détail du compte » pour PAYROLL (2026-09-17)

*Suite du mandat du fondateur (ruling du 2026-09-17 sur les trois priorités : les ateliers
manquants R98/R99/R100 d'abord, H-6 profond ensuite, H-3 slice 3 en dernier), enchaîné sans pause
après H-6 tranche 1 (règle 32).*

**Le constat, mesuré avant d'écrire (pas supposé)** : `docs/BACKLOG_REPORTE.md` R98 documentait que
PERSONNEL-DSN (poste PAYROLL, nature `rapprochement`) était une procédure PLANTÉE
(`part1.ts::planifierPaie` crée déjà le `procedure_instance` + le `workpaper`) mais SANS AUCUN
atelier atteignable — `atelierDeLaNature('rapprochement', 'PAYROLL', base)` rendait `null`, faute
d'un cas câblé pour ce poste (seuls CASH et TRADE_RECEIVABLES l'avaient). Un décor au sens de la
règle 20 : le bouton du bloc « échantillon » sur `/poste/PAYROLL` menait, avant cette tranche, à
`sans_objet`.

**Recherche préalable** : lecture complète d'`account-detail.ts` (260 lignes) et de
`requests.ts::demanderDetailDeCompte`/`derniereDemandeDetailDeCompte` — ces fonctions sont déjà
GÉNÉRIQUES par `fsliCode` depuis leur origine (elles alimentent `/sampling`, l'écran REVENUE du
plan d'autonomie Partie B étapes 1-2), sans aucun compte ni FSLI en dur. Seul un ÉCRAN manquait
pour un poste hors REVENUE — aucune mécanique neuve dans le service (règle 9).

**Implémenté** (commit `ddc30c4`) : nouvelle route `/eng/[id]/poste/[code]/detail-compte`
(poste-agnostique PAR SA CLÉ, réutilisable pour un futur poste sans mécanique neuve
supplémentaire), réutilisant verbatim les fonctions de service et les libellés i18n déjà génériques
de `/sampling` (`samp.*`) — deux nouvelles clés seulement (`detailCompte.retourPoste`/
`titreEcran`). `programme.ts::atelierDeLaNature` : un nouveau cas littéral
`rapprochement`+`PAYROLL`. Vérifié PAR EXÉCUTION (pas supposé) : `vuePoste('PAYROLL').blocs
.echantillon.href` pointe désormais vers le nouvel atelier au lieu de `sans_objet`. Station clics
ajoutée : demander → importer → refus POP-02 sans explication → conclure expliqué — le monde
PAYROLL ne porte aucune demande/import préexistant (contrairement à REVENUE, semé déjà rapproché),
donc les DEUX boutons sont exercés par cette station, pas seulement l'un des deux.

**Premier passage `npm run verify` : deux échecs, tous deux diagnostiqués, un seul réel.**
(1) `rail.test.ts` a rougi POUR DE VRAI (règle 18 : pas un flake) — le garde de couverture exige
que tout écran de dossier soit atteignable par le rail, `destinationsDuPoste`, ou déclaré dans
`AILLEURS` avec sa raison ; le nouvel écran n'était déclaré nulle part. Corrigé (commit `c97228c`)
en l'ajoutant à `AILLEURS`, même précédent que `/grand-livre`/`/comite`. (2) `screens.test.ts` a
rougi (« le serveur est tombé ») — diagnostiqué comme un ARTEFACT DE CONCURRENCE, pas une
régression : le réfutateur hostile avait un vitest en cours au même moment (CLAUDE.md §7, deux
vitest en parallèle font tomber le serveur du balayage) ; reproduit en relançant `screens.test.ts`
SEUL, sans aucun autre processus — passe proprement (EXIT=0, 472 s).

**Un réfutateur** (règle 30 : ni modèle de données, ni sécurité, ni refus neuf) : SHIP AS-IS, aucun
défaut réel trouvé — `account-detail.ts` vérifié générique par lecture complète, étanchéité
multi-cabinet tenue (`assertMembreDe` ancré sur l'objet, jamais un champ de formulaire), aucun
plantage sur un `fsli_code` arbitraire (refus propre, capturé par `executer`), sélecteurs `data-*`
de la station clics croisés avec le fichier neuf.

**Mesures finales, ordre CANONIQUE, sur l'arbre du commit `c97228c`** (`npm run verify`, budget
3600s, `set -o pipefail`, log complet conservé) : `tsc --noEmit` propre ; vitest 163/163 fichiers
(1209/1209 tests, inchangé — la logique réutilisée était déjà couverte) ; gardes 47 ; semeur à
jour, inchangé (aucun objet semé neuf : la station clics crée ses objets elle-même, pas le semeur) ;
plancher 1209/632 ; langue 15/15 ; lectures 0 perdue sur 1990 chemins figés dans 93 écrans ;
parcours 5/5 cas connus mauvais (337 déclarées/290 figées/47 nouvelles — dette pré-existante de
figement, `docs/PARCOURS.json` stale depuis 2026-09-10, sans rapport avec cette tranche, non
traitée ici) ; screens 98 routes/0 échec (le nouvel écran inclus) ; fumee 55/0 ; densite 88/0 ;
clics EXIT=1 réel (seul motif #418, F41, vingt-septième confirmation, 276 étapes/393 clics, la
station PAYROLL passe intégralement) ; visuel (relancé séparément) 356 vues/0 défaut (89 écrans,
+1 exactement le nouvel écran).

**Priorité 1a (R98) est COMPLÈTE.** Suite immédiate : R99 (INVENTORY/STOCKS-INV, nature
`observation_documentee`) — recherche déjà faite : réutilise le MÊME écran `/poste/[code]/
detail-compte` (même précédent que `/circularisations`, qui sert déjà deux natures), un seul
nouveau cas dans `atelierDeLaNature`, aucune UI neuve.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_3YA2HLubKdwJhiGJ7VhUL5cqXAVe`, cible
production) READY, commit `827eb855f4aa12908c2097018858261554595f3e` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 07:12:11Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor 89/16/31/42
inchangé. Aucune nouvelle lecture `/api/sante` (aucune mécanique neuve dans le service, seul un
écran manquait).

---

## Lot 7, H-6 tranche 1 — l'échelle typographique (2026-09-17)

*Suite du mandat du fondateur, enchaîné sans pause après la décision H-6 (règle 32).*

**Recherche préalable dédiée** (un sous-agent, lecture seule) : état des jetons `globals.css`
(l'espacement a une échelle nommée depuis ADR-125, `--e1..--e6` ; la couleur ne marque déjà que
les problèmes) ; ce que `npm run visuel` mesure (débordement horizontal + contraste WCAG, sur 4
vues) et ne mesure PAS (cohérence d'espacement, échelle typographique, « air AI generated » — un
jugement humain) ; gap concret trouvé : **aucune échelle typographique nommée** — 69 déclarations
`font-size:` en dur (mesuré par grep, jamais supposé), contre une seule échelle d'espacement
documentée. Recommandation retenue, la plus petite et mesurable : nommer l'échelle et migrer
`h1`/`h2`/`h3`/`.faint`/`body`/`code` dessus, sans toucher au markup (même propriété que le repass
de jetons 2026-09-09/10).

**Implémenté** (commit `d927327`) : `--t1..--t6` (12/12.5/13.5/14/15/24px — six tailles déjà en
usage à ces endroits précis, rien de redeviné) ajoutés à `:root` juste après le bloc `--e1..--e6`
d'ADR-125. 9 déclarations migrées : les DEUX points de déclaration de `h1`/`h2`/`h3` (une base et
un repass ADR-125, qui se cascadent l'un sur l'autre), `.faint`, `body`, `code`/`.mono`. Les 60
autres déclarations en dur restent — nommé explicitement (règle 19), délibérément hors périmètre
de cette petite tranche (règle 5).

**`app/src/app/globals.css.test.ts`** (nouveau) : garde (a) que les deux points de déclaration de
h1/h2/h3 lisent bien les jetons (pas une demi-mesure silencieuse) et (b) que le compte de
`font-size: Npx` en dur ne remonte jamais au-delà du seuil gardé (60), prouvée contre un cas connu
mauvais (règle 17) — une régression est injectée dans une COPIE de texte (jamais dans le vrai
fichier) et le test confirme que le détecteur la voit.

Un réfutateur (règle 30 : ni modèle de données, ni sécurité, ni multi-tenant, ni refus — un seul
suffit) : SHIP WITH MINOR FIXES, un seul constat, non bloquant — la règle `h1` de base (ligne
~137) est cascade-morte pour `font-size` depuis le repass ADR-125 (même sélecteur, déclaré après,
toujours gagnant), donc `--t6` n'y documente pas sa valeur d'ORIGINE (20px avant ADR-125) mais
celle du repass qui la recouvre. Aucun risque fonctionnel réel (les deux déclarations partagent
maintenant le même jeton — vérifié par le réfuteur en exécutant réellement `npx vitest run
src/app/globals.css.test.ts`, `npx tsc --noEmit`, et une injection réelle de régression dans le
VRAI fichier, restauré ensuite, `git status --short` propre après restauration), mais un trou de
documentation (règle 19) : commenté en toutes lettres (commit `6c91ec0`).

**`npm run visuel`** : lancé deux fois — une première fois avant la revue hostile (352 vues, 0
défaut), une seconde fois sur l'arbre final, après le correctif, sur la base fraîchement
reconstruite par `npm run verify` lui-même (352 vues, 0 défaut) — aucune régression de contraste
ni de mise en page mesurée par la migration de jetons.

**Note factuelle, sans rapport avec cette tranche** : l'étape `parcours` de `npm run verify` a
rapporté « 332 station(s) déclarée(s) · 290 figée(s) · 42 station(s) NOUVELLE(S) — à figer quand le
parcours sera vert » — `docs/PARCOURS.json` n'a pas été refigé depuis le 2026-09-10 (commit
`d5673b0`), donc ce chiffre est de la dette accumulée sur PLUSIEURS tranches antérieures (dont au
moins la station RCM ajoutée par H-5), jamais introduite ni aggravée par H-6 tranche 1 (qui ne
touche pas `scenario.ts`). Non bloquant (`parcours`/`parcours:epreuve` sortent tous deux en
succès), non traité ici — hors périmètre d'une tranche CSS.

**Mesures finales, ordre CANONIQUE, sur l'arbre du commit `6c91ec0`** (`npm run verify`, budget
3600s, `set -o pipefail`, log complet conservé) : `tsc --noEmit` propre ; vitest 163/163 fichiers
(1209/1209 tests, +1 fichier/+2 tests vs H-5 — le nouveau `globals.css.test.ts`) ; gardes 47 ;
semeur 89 objet(s)/16 décor(s)/31 non prouvé(s)/42 prouvé(s), inchangé depuis H-5 (cette tranche ne
touche pas le registre) ; plancher 1209 collecté(s), 632, aucune forme éteinte ou isolée ; langue 0
hors catalogue/0 libellé en dur, 15/15 cas connus mauvais dénoncés ; lectures 0 perdue sur 1990
chemins figés dans 93 écrans, 6/6 cas connus mauvais ; parcours 332 déclarée(s)/290 figée(s) (voir
note ci-dessus, non lié), 5/5 cas connus mauvais dénoncés ; screens 97 routes/0 échec ; fumee 54
route(s)/0 échec ; densite 87 écrans/0 dépassement ; clics EXIT=1 réel (seul motif #418, sur
`/rcm`, disjoint de cette tranche — F39 continue de le documenter, vingt-cinquième confirmation
déjà établie par H-5 ; 271 étapes/388 clics, clôture et archive atteintes) ; visuel (relancé
séparément, la chaîne `&&` s'arrête à `clics` comme d'habitude) 352 vues/0 défaut.

**Lot 7, H-6 tranche 1 est COMPLÈTE.** Le registre H-1 à H-6 (docs/REGISTRE_IDEES.md §H) est
désormais ouvert sur ses six points, chacun avec au moins une tranche livrée. R108 (H-5 volet 2)
reste délibérément reporté. Suite naturelle : évaluer si une tranche H-6 supplémentaire (migrer
d'autres sélecteurs sur `--t1..--t6`, ou nommer une échelle pour les 60 déclarations restantes) a
assez de valeur face à d'autres chantiers du registre, ou si le Lot 7 se referme ici.

**SHA servi CONFIRMÉ.** `mcp__Vercel__list_deployments` (`dpl_7NJ652SK3m4fiuzguopjiXPCNueH`, cible
production) READY, commit `144a4427cf1964c12dedbb98f982b3b548887e1e` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 02:14:03Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent », registre du décor 89/16/31/42
inchangé depuis H-5. Aucune nouvelle lecture `/api/sante` pour cette tranche — une migration de
jetons CSS pure n'a pas de fait d'audit à vérifier (la règle 22 s'applique aux tranches qui
touchent le domaine métier, pas au design).

---

## Lot 7 — décision : H-6 pris avant H-5 volets 2/3 (2026-09-17)

*Suite du mandat du fondateur, enchaîné sans pause après H-5 tranche 1 (règle 32).*

STATUS.md posait la question ouverte : « Tranches 2/3 optionnelles de H-5 […] restent à évaluer
par ordre de valeur face à H-6 ». Recherche dédiée (agent Explore, lecture seule) sur le volet 2
de H-5 (« tests de la direction » comme IPE) : c'est un GAP RÉEL — l'infra IPE existante
(`ipe.ts`/`ipe_rapport`, ADR-118) documente qu'une pièce a été retenue comme IPE pour un
workpaper, mais aucun chemin n'ingère les RÉSULTATS structurés de tests de contrôle de la
direction, et aucune colonne du schéma (`control_test`/`control_instance`/`attribute_result`) ne
distingue testé-par-la-direction de testé-par-l'auditeur — l'appui sur les travaux d'autrui
(ISA 500/AS 1105.10, compétence/objectivité) n'est modélisé nulle part. Enregistré R108
(BACKLOG_REPORTE.md, fils.json), délibérément reporté : construire seule le barème de
compétence/objectivité de la direction est un jugement d'audit qu'un mandat futur du fondateur
devrait trancher explicitement, pas une décision de session. H-6 (passe de design, déjà scopée
par le registre, aucune nouvelle mécanique d'audit) est donc pris en premier par ordre de valeur.

Recherche H-6 en cours (agent Explore, lecture seule) : état des jetons existants (`globals.css`),
ce que `npm run visuel` mesure et ne mesure pas, gaps visuels réels et non résolus, et la plus
petite première tranche mesurable.

---

## Lot 7, H-5 tranche 1 — le vrai geste d'upload RCM (import_file réel, provenance) (2026-09-17)

*Suite du mandat du fondateur, enchaîné sans pause après H-4 tranche 1 (règle 32).*

**Recherche préalable dédiée (un sous-agent, lecture seule)** : `docs/REGISTRE_IDEES.md` ligne 273
(H-5) — « un adaptateur d'import GRC : matrice risques-contrôles […] importée COMME PIÈCE, jamais
recréée ». Trouvé : la RCM native existe déjà, complète (`rcm_row` depuis 0002, tout le cycle
ICFR déjà en ligne, migrations CTRL-01 à CTRL-07). `import_file` anticipait déjà `kind='rcm'`
(0001), jamais employé — `importRcm` (sox.ts) lisait un fichier FIXE du disque serveur
(`fs.readFileSync('dataset/sox/rcm.csv')`) dans une action de démo, sans créer de ligne de
provenance, contrairement à `importTb`/`importFec`.

**Implémenté** (commit `1f7f7ec`) : migration 0169 (ALTER en avant, règle 26) —
`rcm_row.import_file_id`, nullable. `importRcm` crée une vraie ligne `import_file` (sha256,
validation_report, status) et chaque `rcm_row` qu'il insère la cite. Le bouton-démo remplacé par
un vrai formulaire d'upload (`rcm/actions.ts::uploadRcmAction`), même patron que
`imports/actions.ts` (ADR-078/091 : refus capturés, jamais une page 500).

**Revue hostile, DEUX réfutateurs indépendants (règle 30 : modèle de données touché — nouvelle
migration).** Les deux ont trouvé, chacun par EXÉCUTION (pas seulement lecture), des constats
BLOQUANTS réels :

1. **Voix 2 (confirmée par voix 1)** : `importRcm` n'était pas transactionnel. Un CSV cassé à
   mi-parcours (un octet NUL, une valeur hors contrainte) laissait un `control` COMMIS sans sa
   `rcm_row` — orphelin PERMANENT, qu'aucun ré-import ne pouvait réparer (le garde
   `if (existing) continue` voit le code déjà pris). **Corrigé** : toute la boucle tourne
   désormais dans `tx()` — un échec à n'importe quel point annule TOUT. `import_file` prend
   `status='rejected'` avec le motif, jamais le statut optimiste qui mentait. Cas connu mauvais
   ajouté (`s8.test.ts`) : un CSV cassé à la 2e ligne ne laisse RIEN, pas même la 1ère ligne
   valide.
2. **Voix 1 (vérifiée par requête directe sur une base fraîche)** : la lecture `/api/sante` H-5
   traitait tout `rcm_row.import_file_id is null` comme une erreur — mais `rcm_row` n'a AUCUNE
   colonne `created_at` (0002), donc rien ne distingue une ligne légitimement ANTÉRIEURE à cette
   tranche (migration 0169, sans provenance rétroactive) d'une vraie corruption. Cette lecture
   aurait rougi `/api/sante` en PRODUCTION, immédiatement, sur tout dossier RCM déjà semé.
   **Corrigé** : le compte de lignes sans provenance est désormais INFORMATIF, jamais un refus —
   seul le `row_count` désynchronisé (qui ne peut venir QUE d'une mutation hors chemin gardé)
   reste bloquant. Nouveau cas connu BON (`h5-tranche1-rcm-provenance-lecture.test.ts`) : un
   `rcm_row` legacy sans provenance ne fait jamais rougir la lecture.
3. **Voix 1, violation règle 10 (prouvée par une vraie requête SQL puis une vraie requête HTTP)** :
   R107 (« le geste n'est cliqué par aucune station ») était FAUX pour le monde LOCAL canonique
   (`db:reset && demo:seed`) — `engNep` (le dossier `eng` que clics visite) porte ZÉRO contrôle
   après cette recette exacte (`demo-seed.ts` n'appelle jamais `enrichirMondeDemo()` ; seul
   `reconstruire.ts`, en production, le fait). **Corrigé** : la station clics existante « R60 »
   (qui visite déjà `/rcm` via la tuile dashboard) UPLOAD DÉSORMAIS RÉELLEMENT le fichier
   `dataset/sox/rcm.csv` via le vrai formulaire et vérifie que des contrôles apparaissent — le
   geste central de cette tranche est enfin conduit dans un navigateur. **R107 levé**
   (`docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json`, `registre.ts` mis à jour :
   `enrichir.ts:388` passe à `prouve`, citant `scenario.ts:3762`).

Constat mineur non corrigé (voix 2) : messages de refus SQL bruts (non traduits) sur un CSV
malformé — viole la convention D.6 mais préexiste déjà sur `importTb`, pas une régression de
cette tranche. Disclosed, hors périmètre de la correction.

Correctif (commit `21c6fd8`) suivi d'un re-figement de `docs/LECTURES.json` (commit `0f5892b` :
2 lectures perdues attendues — `id` compté une fois de moins dans le formulaire, `readFileSync`
retiré avec le bouton-démo).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur l'arbre
du commit `0f5892b`) : `tsc` propre · **162/162 fichiers, 1207/1207 tests vitest** (dont les 3
nouveaux cas de `h5-tranche1-rcm-provenance-lecture.test.ts` et le cas connu mauvais de la
transaction annulée dans `s8.test.ts`) · `gardes` 47 · `semeur` à jour (89 objets, 16 décors) ·
`langue` 0 hors catalogue, 0 libellé en dur · `lectures` 0 perdue, **93 écrans, 1990 chemins
figés** (re-figé) · `parcours` 0 station perdue, **6/6** · `screens` **97 routes, 0 échec** ·
`fumee` **54 routes, 0 échec** · `densite` **87 écrans, 0 dépassement** · `clics` **EXIT=1 réel,
seul motif `#418`** (F39, VINGT-CINQUIÈME confirmation, la station « rcm : l'upload réel du
listing client » CONFIRME des contrôles importés), clôture et archive ATTEINTES (271 étapes, 388
clics). `visuel` (relancé séparément) : **352 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__list_deployments` (`dpl_GsWj2xwDFzQRWNDSZeeM7hgdYfFy`, cible
production) READY, commit `d38f734dc2b6f7f875961ce9b92852afc233fa1c` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` (en-tête `date` du serveur, 01:08:18Z) : HTTP 200, sha
identique, `identiteCoherente=true`, « toutes les lectures passent » — nouvelle lecture « H-5 tranche 1 :
la provenance RCM cohérente avec le fichier importé » `ok:true`, `vide:true`, detail « VIDE — aucun
import RCM avec provenance pour l'instant — 7 ligne(s) antérieure(s) à cette tranche (migration 0169),
sans provenance rétroactive ». Cette mesure est une preuve vivante, pas seulement une confirmation :
production porte réellement 7 lignes RCM importées par un `reconstruire.ts` antérieur à la migration
0169 (sans `import_file_id`), exactement le cas que la lecture initiale (avant correctif voix 1) aurait
lu comme un défaut et aurait fait rougir en HTTP 500 — la conception informative retenue après la revue
hostile est donc exercée par le monde réel, pas seulement par un test. Registre du décor (semeur.ts) :
31 non prouvé(s) · 42 prouvé(s) (était 32/41 avant cette tranche).

**Lot 7, H-5 tranche 1 est COMPLÈTE.** Tranches 2/3 optionnelles de H-5 (tolérance de format
façon export AuditBoard/ServiceNow ; « tests de la direction » comme IPE) restent à évaluer par
ordre de valeur face à H-6 (passe de design).

## Lot 7, H-4 tranche 1 — le périmètre d'audience « comité » (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après H-3 slice 2 (règle 32). H-3 slice 3
écartée avant de commencer : STATUS.md la nommait explicitement à risque de « finir Lot 6 déguisé
en H-3 » (atelier de revue MANUEL/FRAUDE, R104) — H-3 elle-même (le test exhaustif du grand livre)
est déjà COMPLÈTE avec ses sept règles (slices 1+2) ; la suite naturelle, par ordre de valeur du
registre, était H-4.*

**Recherche préalable dédiée (un sous-agent, lecture seule)** : `docs/REGISTRE_IDEES.md` ligne 272
(H-4) — « le reporting en trois périmètres d'audience — équipe, direction, comité » — dit
explicitement OUI pour équipe et comité, **NON** pour un tableau de bord qui piloterait
l'ENTITÉ (GRC, hors produit). Trouvé : équipe existait déjà (`/eng/[id]/page.tsx`,
`travaux.ts::tableauDeBord`) ; direction existait déjà (`/eng/[id]/dashboard`, avec un concept
« audience » déjà construit — `TrackerAudience: 'team'|'client'|'group'`) ; comité manquait, mais
le CONCEPT lui-même existait déjà en base depuis longtemps comme travail d'achèvement
(`completion_item.nature='gouvernance'`, migration 0020, 2026 — « communication à la
gouvernance »). Ce qui manquait n'était donc PAS un nouveau modèle de données, seulement un écran
qui AGRÈGE.

**Implémenté** (commit `3325b29`) : `gouvernance.ts::syntheseComite` — pure agrégation (règle 9 :
mécanique, pas contenu) sur `obstaclesAuVisa`, `exception`, `deficiency`, `completion_item`,
`workpaper`, `engagement_milestone` (via `jalons()`). ZÉRO nouvelle table, ZÉRO écriture, ZÉRO
appel LLM (règle 6). L'écran `/eng/[id]/comite`, atteint via un lien posé sur `/dashboard` (jamais
une URL devinée), ajouté à `AILLEURS` (`rail.test.ts`) — pure lecture, jamais un état du dossier,
même précédent que `/grand-livre` (H-3). R16 (backlog reporté, « rien de signé ne sort de
mémoire ») tenu : l'écran ne RÉDIGE jamais la communication elle-même — le champ `conclusion`
affiché vient exclusivement de ce qu'un humain a déjà écrit via `completion.ts::conclure()`.

**Un doublon sémantique trouvé PAR LE VITEST COMPLET lui-même (règle 18), pas par la revue
hostile** : la clé `gov.titre` répétait mot pour mot `ach.gouvernance.titre` — `langue.test.ts`
(« aucun doublon sémantique ») a rougi. Corrigé en réutilisant la clé existante partout (titre de
l'écran, lien depuis `/dashboard`, station clics) — pas une nouvelle clé, la MÊME clé (même
précédent que R16 : un seul concept, une seule vérité).

**La lecture `/api/sante` reste délibérément INFORMATIVE, et ce choix est écrit, pas supposé** :
le seul invariant candidat pour une re-dérivation adversariale (règle 16 : « aucune conclusion
vide sur un travail d'achèvement conclu ») est DÉJÀ un `check constraint` SQL
(`done_needs_substance`, migration 0020) — Postgres refuse cet état AVANT même que le code
s'exécute. Une garde ici ne pourrait jamais échouer (règle 17 : « une garde qui n'a jamais rien
refusé n'est pas une garde ») — écrire quand même ce test aurait été la même faute que les cinq
instruments cités en règle 17 du CLAUDE.md. Le SEUL calcul non trivial du module — `jalonProchain`,
qui doit exclure les jalons déjà EN RETARD — est, lui, éprouvé contre un cas connu mauvais dans
`gouvernance.test.ts` (un jalon délibérément en retard, chronologiquement le plus proche, ne doit
JAMAIS être choisi comme « prochain »).

**Revue hostile, UN réfutateur (règle 30 : zéro modèle de données/sécurité/multi-tenant/refus).**
Verdict **SHIP AS-IS**, zéro constat corrigé. Le réfutateur a VÉRIFIÉ EMPIRIQUEMENT (pas supposé)
la thèse de la lecture informative : il a lui-même injecté le défaut que `gouvernance.test.ts`
teste (retrait du filtre `due_date >= aujourdhui` dans `jalonProchain`), confirmé que
`gouvernance.test.ts` rougit bien, confirmé que la lecture `/api/sante` reste verte (exactement ce
que le commentaire de `route.ts` affirme), puis restauré le fichier (`git diff` vide, vérifié). Il
a aussi vérifié directement la migration 0020 (ligne 41, `done_needs_substance`) plutôt que de
croire le commentaire sur parole. Aucune fuite multi-tenant trouvée (les six requêtes SQL filtrent
toutes `engagement_id = $1`). Deux points mineurs relevés, non corrigés, non bloquants : un pattern
préexistant (`NATURES.find(...)!`, identique à `completion/page.tsx`) et un usage de `new Date()`
plutôt que `core/clock::now()` pour `jalonsEnRetard`/`jalonProchain` — cohérent avec le calcul
DÉJÀ existant de la famille `jalons` dans `obstacles.ts` (même précédent, pas une incohérence
nouvelle).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur l'arbre
du commit `3325b29`) : `tsc` propre · **161/161 fichiers, 1201/1201 tests vitest** (dont les 7 cas
de `gouvernance.test.ts` et le cas de `h4-tranche1-comite-lecture.test.ts`) · `gardes` 47 ·
`semeur` à jour · `langue` 0 hors catalogue, 0 libellé en dur (après correction du doublon) ·
`lectures` 0 perdue, **6/6** · `parcours` 0 station perdue, **5/5** · `screens` **97 routes, 0
échec** (+2 : `/eng/[id]/comite`, comptée deux fois — pack par défaut et variante SOX) · `fumee`
**54 routes, 0 échec** · `densite` **87 écrans, 0 dépassement** · `clics` **EXIT=1 réel, seul motif
`#418`** (F38, vingt-quatrième confirmation, la station « comité » confirme le compte papiers
signés/total et un badge de statut), clôture et archive ATTEINTES (270 étapes, 387 clics).
`visuel` (relancé séparément) : **352 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__list_deployments` (`dpl_FVBgz9XcuDzGU1ksy57ZKfvbp1GC`, cible
production) READY, commit `c7c19defc6f2e8d0f7ba26618dd297e663158834` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : HTTP 200, sha identique, `identiteCoherente=true`,
« toutes les lectures passent » — nouvelle lecture « H-4 tranche 1 : la synthèse comité cohérente
avec le dossier » `ok:true`, detail « 2/6 papier(s) signé(s), travail « gouvernance » non ouvert,
14 obstacle(s) au visa » (non VIDE, informative, la base RÉELLE de production).

**Lot 7, H-4 tranche 1 est COMPLÈTE.** Reste du registre : H-5 (adaptateur d'import GRC — matrice
risques-contrôles importée COMME PIÈCE, jamais recréée) et H-6 (passe de design) — par ordre de
valeur, H-5 est la suite naturelle. H-3 slice 3 reste explicitement en attente (voir ci-dessus).

## Lot 7, H-3 slice 2 — la règle « hors exercice » sur le grand livre (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après H-3 slice 1 (règle 32). Découpe
recommandée par la recherche H-3 initiale : ajouter les règles techniques exhaustives encore
absentes, chacune sourcée avant d'être écrite (règle 8) ou écartée si aucune source précise
n'existe.*

**Recherche préalable dédiée (un sous-agent)**, avant tout code — trois candidates envisagées,
DEUX écartées avec un motif écrit :
1. **Cohérence débit=crédit** : DÉJÀ vérifiée par le parseur FEC (`kernel/fec.ts::entryBalance`,
   `severity:'error'`) — `imports.ts` garde TOUTE l'insertion dans `gl_entry` derrière `ok =
   parsed.ok` : aucune écriture déséquilibrée n'atteint jamais la base. Un flag qui répéterait
   cette règle ne rougirait JAMAIS sur des données de production — la garde vide proscrite par la
   règle 17. **Pas construite.**
2. **Doublons au grain du grand livre** : chevauche `findDuplicateInvoices` (kernel/matching.ts,
   document-based, échantillon) sans source ISA/NEP précise trouvée dans `methodology/*.json`
   (règle 8). **Pas construite, hors scope.**
3. **Hors exercice** (`hors_periode`) : une date de comptabilisation carrément hors des bornes de
   l'exercice audité — DISTINCTE de `period_end` (proximité de la clôture). `parseFec` calcule
   déjà cette même comparaison au niveau du FICHIER (`date_out_of_period`, `warning`, ATTEINT bien
   `gl_entry`, contrairement au cas 1). **Retenue.** Sourçage (règle 8) : aucune norme ISA/NEP
   précise trouvée pour ce contrôle exact — seule l'analogie ISA-240 (déjà citée pour MANUEL) est
   disponible, marquée **[UNVERIFIED]** et disclosed comme plus faible que celle de CUTOFF, au
   catalogue (`gl.regle.hors_periode.neCouvrePas`), jamais affirmée comme vérifiée.

**Implémenté** (commit `475b4d5`) : `kernel/flags.ts` — `FlagConfig` étend `periodStart` ;
`computeFlags` calcule `hors_periode`. Cas connu mauvais D'ABORD (règle 17, `kernel.test.ts`) :
une écriture au premier ou dernier jour de l'exercice ne doit JAMAIS porter le flag. Tous les
appelants de `defaultFlagConfig` mis à jour (`imports.ts`, `scripts/dataset/generate.ts`,
`tests/acceptance.kernel.test.ts`) — septième règle enregistrée dans `grand-livre.ts::REGLES`,
trois nouvelles clés catalogue, nouvelle lecture `/api/sante` « H-3 slice 2 » (re-dérive
indépendamment contre `period.start_date`/`end_date`, règle 16 ; rougit sur une dérive, règle 17),
station clics mise à jour (SEPT règles désormais attendues).

**Revue hostile, UN réfutateur (règle 30 : zéro modèle de données/sécurité/multi-tenant/refus,
mais infrastructure PARTAGÉE — `flags.ts`/`imports.ts` touchés par TOUTES les écritures de tous
les dossiers, revue particulièrement rigoureuse sur la non-régression des six règles
préexistantes).** Verdict SHIP AS-IS — sept points vérifiés en exécution (aucun appelant de
`defaultFlagConfig` oublié, `tsc --noEmit` propre, comparaison de chaînes ISO équivalente à une
comparaison chronologique pour ce format précis, jointure `/api/sante` non multipliante — un
engagement a toujours exactement une période, `period_id not null`, les six règles préexistantes
octet pour octet inchangées, aucun autre `<strong>« Couvre :»` sur l'écran, le disclaimer
[UNVERIFIED] lui-même honnête). Un seul constat, non bloquant et purement cosmétique (un
commentaire de `grand-livre/page.tsx` disait encore « six » clés au lieu de « sept ») — corrigé le
jour même (`d0d4218`).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur l'arbre
du commit `d0d4218`) : `tsc` propre · **159/159 fichiers, 1193/1193 tests vitest** · `gardes` 47 ·
`semeur` à jour · `langue` 0 hors catalogue, 0 libellé en dur, **15/15** · `lectures` 0 perdue,
**6/6** · `parcours` 0 station perdue, **5/5** · `screens` **95 routes, 0 échec** · `fumee` **53
routes, 0 échec** · `densite` **85 écrans, 0 dépassement** (régénéré séparément sur `1253d0e`) ·
`clics` **EXIT=1 réel, seul motif `#418`** (F37, vingt-troisième confirmation, la station « grand
livre » confirme les sept règles), clôture et archive ATTEINTES (266 étapes, 386 clics). `visuel`
(relancé séparément) : **344 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_EfBHhaZDDgxuwPT6mT1mwBpkETnN`, cible
production) READY, commit `ca9ff702a40b75656d85ebb9837e51c0fe52efcd` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : HTTP 200, sha identique, `identiteCoherente=true`,
« toutes les lectures passent » — nouvelle lecture « H-3 slice 2 : le test exhaustif du grand
livre (règle hors exercice) » `ok:true`, detail « 4731 écriture(s) active(s), 0 marquée(s) hors
exercice — cohérent avec les bornes de la période » (non VIDE, informative, la base RÉELLE de
production porte 4731 écritures actives, toutes dans la période — attendu d'un FEC réel).

**Lot 7, H-3 slice 2 est COMPLÈTE.** Reste du Lot 7 : H-3 slice 3, optionnelle (atelier de revue
ligne à ligne pour MANUEL/FRAUDE, R104) — à ne prendre qu'après validation explicite que ce n'est
pas juste « finir Lot 6 » déguisé en H-3. Au-delà de H-3 : H-4 à H-6 du registre, par ordre de
valeur.

## Lot 7, H-3 slice 1 — le test exhaustif du grand livre, rendu visible (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après H-2 slice 3 (règle 32). H-2 est
COMPLÈTE (quatre volets). Prochain point par ordre de valeur, `docs/REGISTRE_IDEES.md` §H : H-3,
« l'analytique en population COMPLÈTE à côté du sondage, avec l'énoncé honnête de ce qu'un test
exhaustif couvre et ne couvre pas ».*

**Recherche préalable (un sous-agent)**, avant tout code : `computeFlags` (ADR-003,
`kernel/flags.ts`) tourne déjà, à l'IMPORT (`imports.ts`), sur TOUT le grand livre importé — pas
un sous-ensemble filtré par cycle ni par poste. Le résultat (six règles : week-end, montant rond,
écriture manuelle, fin de période, motif d'avoirs répétés, validation tardive) est stocké sur
CHAQUE `gl_entry` (`flags` jsonb), mais AUCUN écran ne le rendait visible sur la population
ENTIÈRE avant cette slice — seul le sous-ensemble déjà TIRÉ par MANUEL/FRAUDE (Lot 6 tranche 3,
`sampling-je.ts`) l'exploitait, au grain d'un `sample`, jamais celui de « 100% des écritures ».
**Périmètre gelé (règle 14) : HORS gel.** `gl_entry` n'a pas de notion de cycle FSLI intrinsèque
— ce test s'applique à toute la population sans ouvrir de poste ni de procédure nouvelle, à la
différence des huit postes du Lot 5. Découpe recommandée en 2-3 slices ; celle-ci est la
première : rendre visible ce qui existe déjà, zéro nouvelle règle de détection.

**Implémenté** (commit `b6cb55b`) : `grand-livre.ts::testExhaustifGrandLivre` — LIT et AGRÈGE
`gl_entry.flags`, retourne des CODES (JeFlag), jamais de libellé en dur (`langue.ts` le détecte et
le refuse — trouvé au premier passage, corrigé avant le commit : la disclosure « couvre »/« ne
couvre pas » vit désormais au catalogue, `gl.regle.<code>.*`, une clé par règle, deux langues).
Écran `/eng/[id]/grand-livre` (découvert automatiquement par screens/fumee/densite/visuel,
`scripts/screens/routes.ts` lit l'arborescence de `src/app`, jamais une liste tenue à la main),
lien posé depuis `/analytique`. `/api/sante` : nouvelle lecture « H-3 slice 1 : le test exhaustif
du grand livre (règle week-end) » — re-dérive indépendamment (règle 16, `extract(dow from
entry_date)` en SQL pur) et compare au flag stocké ; rougit sur une dérive (cas connu mauvais,
règle 17). Les cinq autres règles restent hors de cette lecture, disclosed (règle 19). Station
clics ajoutée (règle 10) : atteint l'écran via le lien réel, vérifie que les SIX règles portent
chacune leur disclosure — jamais une seule (leçon tirée du correctif de la station « relancer »,
H-2 slice 3).

**Revue hostile, UN réfutateur (règle 30 : zéro modèle de données, sécurité, multi-tenant ou
code de refus touché).** Verdict SHIP AS-IS, aucun constat bloquant — huit points vérifiés en
exécution (cohérence `status='active'` avec le ré-import, syntaxe `jsonb @>` testée directement,
lacune de la lecture sante disclosed et non bloquante pour une slice 1, absence de faux positif du
sélecteur clics, impossibilité mathématique d'un flag `round_amount` sur montant nul, les deux
suites de tests exécutées réellement, cohérence du contrôle d'accès avec `analytique.ts`).

**Trouvé PAR LE VITEST COMPLET lui-même, pas par la revue hostile (règle 18, deux défauts réels)**
— corrigé le jour même (commit `980b593`) :
1. `rail.test.ts` (« aucun écran de dossier n'est injoignable ») : `/eng/[id]/grand-livre`
   n'était atteignable par AUCUN chemin de lecture déclaré (le lien ad hoc sur `/analytique`
   n'est ni le rail ni `destinationsDuPoste`). Ajouté à `AILLEURS` avec sa raison écrite (même
   patron que `/rcm/[cid]`) plutôt que forcé au rail : cet écran est une pure lecture, jamais un
   état du dossier.
2. `tests/screens.test.ts` (React : « Encountered two children with the same key ») : la clé
   `${regle}-${entryNo}-${entryDate}` n'était pas unique — une même écriture porte PLUSIEURS
   lignes (débit sur un compte, crédit sur un autre), et deux lignes peuvent porter le MÊME flag.
   `grand-livre.ts` sélectionne désormais `gl_entry.id` (clé primaire) et l'expose comme clé React.

**Une mesure INTERMÉDIAIRE (avant ce correctif, commit `99cb667`) a montré DEUX occurrences de
`#418` au lieu d'une** — diagnostiqué, pas supposé (règle 18) : la même signature exacte en
première divergence des deux (le tooltip `rail-astuce`, déjà catalogué, apparu au chargement
initial avant tout geste scripté), disjointe des fichiers de cette tranche. La mesure FINALE, sur
l'arbre corrigé, est revenue à UNE SEULE occurrence — confirmant le bruit de chronologie plutôt
qu'une régression (docs/CHASSE.md, F36).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur l'arbre
du commit `980b593`) : `tsc` propre · **158/158 fichiers, 1189/1189 tests vitest** · `gardes` 47 ·
`semeur` à jour · `plancher` collectés · `langue` 0 hors catalogue, 0 libellé en dur dans un
service, **15/15** · `lectures` 0 perdue, **6/6** · `parcours` 0 station perdue, **5/5** ·
`screens` **95 routes, 0 échec** (+2 : grand-livre) · `fumee` **53 routes, 0 échec** · `densite`
**85 écrans, 0 dépassement** (+2, régénéré séparément sur `0bd6644`) · `clics` **EXIT=1 réel, seul
motif `#418`** (F36, vingt-deuxième confirmation, les quatre assertions de la nouvelle station
passent), clôture et archive ATTEINTES (266 étapes, 386 clics). `visuel` (relancé séparément) :
**344 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_H8rsJTWcC9L2C6bfoLpvGCiaqzvC`, cible
production) READY, commit `77cd110a29a23b31a60c1bc46d6396982c210a1c` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : HTTP 200, sha identique, `identiteCoherente=true`,
« toutes les lectures passent » — nouvelle lecture « H-3 slice 1 : le test exhaustif du grand
livre (règle week-end) » `ok:true`, detail « 4731 écriture(s) active(s), 417 marquée(s) week-end
— cohérent avec la date de comptabilisation » : non vide, informative, sur la base RÉELLE de
production.

**Lot 7, H-3 slice 1 est COMPLÈTE.** Reste du Lot 7 : H-3 slice 2 (nouvelles règles techniques
exhaustives — cohérence débit=crédit, doublons, écritures hors période — chacune sourcée avant
d'être écrite, règle 8) et slice 3 optionnelle (atelier de revue ligne à ligne pour MANUEL/FRAUDE,
R104). Au-delà de H-3 : H-4 à H-6 du registre, par ordre de valeur.

## Lot 7, H-2 slice 3 — la relance propre au point d'action client (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après H-2 slice 2 (règle 32). H-2 :
« propriétaire, échéance, état, relance ». Les trois premières slices ont affiché état,
propriétaire et échéance PROPRES au point d'action ; celle-ci construit « relance » — au grain de
l'ITEM (`request_item`), au-delà de la cadence automatique `ensureReminders` que H-1 construit
déjà au grain de la DEMANDE (`request`).*

**Recherche préalable** (research agent, avant tout code) : `ensureReminders` (`requests.ts:509`)
opère STRICTEMENT sur `request` — la table `reminder` (`0002_testing.sql`) ne porte alors aucune
colonne `request_item_id`, aucune ligne de relance ne peut jamais distinguer LEQUEL point d'action
d'une demande elle concerne. Le portail client n'affiche nulle part l'échéance/le propriétaire du
point d'action (slice 2). Un modèle de transport simulé existe déjà pour les réunions
(`SimulatedTransportAdapter`, `agenda/adapters.ts`, ADR-101) — modèle réutilisé pour la même
honnêteté, pas la même classe (un seul site d'appel ne justifiait pas une nouvelle abstraction
d'adaptateur).

**Implémenté** (commit `1cca603`) : migration `0168` (NEUVE, règle 26 : ne touche ni 0166 ni
0167) — `reminder.request_item_id`, nullable, les relances de niveau `request` gardent cette
colonne NULL. `matching.ts::relancerPointAction` : geste EXPLICITE et humain de l'auditeur (jamais
une cadence automatique), refuse un item hors `kind='explanation'`, sans propriétaire assigné
(personne à relancer), ou déjà répondu (`status≠'pending'`, rien à relancer). `constatEtPointAction`
étendue avec `derniere_relance`. Panneau `exceptions/page.tsx` : bouton « Relancer », offert
seulement quand propriétaire assigné ET item encore pending. `/api/sante` : nouvelle lecture
« H-2 slice 3 : la relance du point d'action client », AJOUTÉE LE MÊME JOUR (règle 22, leçon
tirée en slice 2) — re-dérive indépendamment (règle 16), rougit sur une dérive du `request_id`
dénormalisé (cas connu mauvais, règle 17). Station clics ajoutée (règle 10).

**Revue hostile, DEUX réfutateurs indépendants (règle 30 : modèle de données touché).** Voix 2
(multi-tenant/RLS/règle 26) : SHIP AS-IS, aucun constat bloquant — RLS de `reminder` intacte
(`request_id` toujours dérivé côté application dans la même requête, jamais un paramètre
d'appelant), `assertMembreDe` re-vérifié indépendant, migration 0168 une addition pure. Voix 1
(logique fonctionnelle), UN constat réel et BLOQUANT : le transport 100% simulé (`remis:false`,
CLAUDE.md §2, interdit non négociable) n'atteignait JAMAIS l'écran — le bouton disait juste
« Relancer », la clé `exc.relanceEnvoyee` créée pour porter la disclosure n'était référencée nulle
part. Corrigé (`9b78787`) : la disclosure vit désormais en PERMANENCE sur le bouton (« Relancer
(simulé) ») et sur la ligne « dernière relance », avant ET après le clic — patron déjà établi
(`reun.sendSimulatedTransport`) ; `exc.relanceEnvoyee`, devenue redondante, supprimée plutôt que
laissée morte.

**Trouvé EN CONDUISANT L'ÉCRAN DANS UN NAVIGATEUR (règle 10), pas par les tests unitaires** : le
premier `npm run clics` complet a montré la nouvelle station « relancer » tombant systématiquement
sur « rien à relancer ». Diagnostiqué (règle 18, pas supposé) : la station d'assignation (slice 2,
DÉJÀ EN PRODUCTION) prenait le PREMIER formulaire trouvé sans restriction de statut — sur ce monde
de démo, ce premier formulaire tombait sur un point d'action déjà répondu historiquement.
Corrigé (`2005a7d`) : cibler une ligne encore `pending`. Recheck : AUCUNE ligne pending n'existe
jamais à ce point du parcours canonique — les deux créatrices de points d'action H-2
(`draftClarificationRequest`, sur `/exceptions` et `/kanban`) trouvent zéro écart `open` à ce
moment (vérifié dans le journal). **R106 enregistré** (`docs/BACKLOG_REPORTE.md`,
`docs/instantanes/fils.json`, commit `a085b76`), disclosed plutôt que corrigé : aucun défaut de
LOGIQUE dans H-2 (chaque geste prouvé par exécution directe, 11 tests succès+refus,
`constat-action-client.test.ts`) — c'est le monde de démo scellé qui n'offre jamais la fenêtre
pour prouver le geste positif de relance PAR LE CLIC ; la vraie cause touche `demo-seed.ts`, un
chantier séparé et plus risqué qu'un correctif de station cette nuit.

**Vitest complet reconfirmé propre** après le correctif R106 (`reprise.test.ts`, 24/24 — le
guard qui exige un état non vide pour chaque R24+ dans `fils.json`).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur l'arbre
du commit `a085b76`) : `tsc` propre · **156/156 fichiers, 1182/1182 tests vitest** · `gardes` 47 ·
`semeur` à jour · `plancher` 1182 collectés · `langue` 0 hors catalogue, **15/15** · `lectures` 0
perdue, **6/6** · `parcours` 0 station perdue (319 déclarées, 290 figées), **5/5** · `screens`
**93 routes, 0 échec** · `fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0 dépassement**
(régénéré séparément sur le même commit, `19f65d5`) · `clics` **EXIT=1 réel, seul motif `#418`**
(F35, `docs/CHASSE.md`, vingt-et-unième confirmation consécutive), clôture et archive ATTEINTES
(240 stations figées vérifiées, 262 étapes, 385 clics). `visuel` (relancé séparément) : **336
vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_HjxRaxewPHFou861hK2BycJkFLX5`, cible
production) READY, commit `2b5b000bcdf6fdf68f73f2a06e1454461e429aeb` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : HTTP 200, sha identique, `identiteCoherente=true`,
« toutes les lectures passent » — nouvelle lecture « H-2 slice 3 : la relance du point d'action
client » `ok:true, vide:true`, detail « VIDE — aucune relance de point d'action pour l'instant »
(attendu : la base RÉELLE de production n'a jamais eu ce bouton cliqué — seul `npm run clics`,
qui exerce ce geste quand le monde de démo local le permet, en écrit une, et sur sa propre base,
jamais sur la production). Une lecture VIDE ici n'est pas un défaut : elle rougirait sur une
dérive du `request_id` dénormalisé, éprouvé en local par mutation directe (règle 17).

**Lot 7, H-2 slice 3 est COMPLÈTE.** Les quatre volets de H-2 (état, propriétaire, échéance,
relance) sont désormais tous construits. R106 (relance jamais cliquée pour de vrai sur ce monde de
démo scellé) et R105 (followup/RLS column-blind, slice 2) restent ouverts pour un chantier séparé,
jamais bloquants pour la suite du plan d'autonomie.

## Lot 7, H-2 slice 2 — propriétaire et échéance sur le point d'action client (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après H-2 slice 1 (règle 32). H-2 :
« propriétaire, échéance, état, relance » (`docs/REGISTRE_IDEES.md` ligne 270). Slice 1 a
affiché « état » (deux statuts déjà distincts en base). Cette slice ajoute « propriétaire » et
« échéance » PROPRES au point d'action — la première tranche du Lot 7 à toucher le modèle de
données.*

**Décision (recherche préalable de H-2, disclosed slice 1)** : étendre `request_item`
(`owner_contact_id`, `due_date`) plutôt que réhabiliter `followup`, un décor documenté depuis la
première migration du dépôt, jamais fini.

**Implémenté** (commit `cd4e395`) : migration `0166` (owner_contact_id → client_contact,
due_date) ; `matching.ts::assignerProprietairePointAction` (geste humain de l'auditeur, refuse
un item hors `kind='explanation'` et un contact d'une autre entité) ; `constatEtPointAction`
étendue ; panneau `exceptions/page.tsx` (formulaire d'assignation). Station clics ajoutée
(`9639cd8`) et `docs/CLICS.md` régénéré (`479a245`) — règle 10, conduite dans un navigateur
avant d'être annoncée : 262 étapes, 386 clics, clôture atteinte, les deux nouvelles assertions
`ok`.

**Revue hostile, DEUX réfutateurs indépendants (règle 30 : modèle de données touché).** Quatre
constats réels, tous corrigés (commit `efd8ca1` + `2678d61`) :
1. **Règle 22 non tenue (les deux voix)** — aucune lecture `/api/sante` neuve le jour même.
   Ajoutée : « H-2 slice 2 : le propriétaire du point d'action client », re-dérive
   indépendamment, rougit sur un `owner_contact_id` qui ne pointe plus un `client_contact` actif
   de la bonne entité (mutable seulement hors du chemin gardé).
2. **Contrainte DB manquante (voix 1, reproduite en exécution)** — une mutation SQL directe hors
   `kind='explanation'` était acceptée sans erreur. Migration NEUVE `0167` (jamais une édition de
   `0166`, règle 26) : `check (kind = 'explanation' or (owner_contact_id is null and due_date is
   null))`, sur le précédent de `engagement_contact_domaine_coherent` (0023).
3. **R105 enregistré (`docs/BACKLOG_REPORTE.md`)** — le décor `followup` (cité par 0166 comme
   « disclosed R-nn » AVANT que cet identifiant n'existe réellement — une affirmation de
   traçabilité non vérifiée, règle 13/18) et le trou de RLS column-blind pré-existant (0141) que
   0166 élargit aux deux colonnes cabinet-only sans garde additionnelle (non exploitable tant que
   l'étape 3 de PLAN_RLS reste un interdit non exécuté).
4. **Disclosure ajoutée** au docstring de `constatEtPointAction` (voix 2) : `item_due_date`
   dépassée n'est QUE de l'affichage aujourd'hui, aucune famille d'obstacle ne la lit.
5. **Station clics durcie (voix 1)** : la seconde assertion pouvait passer vacueusement si aucun
   contact actif n'existait — restructurée en deux assertions distinctes.

**Vitest complet a rougi POUR DE VRAI une fois (règle 18, pas un flake)** : `R105`, ajouté au
registre du correctif, n'avait pas encore son état dans `docs/instantanes/fils.json` —
`reprise.test.ts` l'exige (« chaque R24+… a un état non vide »). Corrigé (`2678d61`), reconfirmé
24/24.

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur
l'arbre du commit `2678d61`) : `tsc` propre · **155/155 fichiers, 1177/1177 tests vitest** ·
`gardes` 47 · `semeur` à jour · `plancher` 1177 collectés · `langue` 0 hors catalogue, **15/15**
· `lectures` 0 perdue, **6/6** · `parcours` 0 station perdue (319 déclarées, 290 figées), **5/5**
· `screens` **93 routes, 0 échec** · `fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0
dépassement** (commit `70f3790`) · `clics` **EXIT=1 réel, seul motif `#418`** (F34,
`docs/CHASSE.md`, vingtième confirmation consécutive), les TROIS assertions de la nouvelle
station passent, clôture et archive ATTEINTES (240 stations figées vérifiées, 263 étapes, 386
clics). `visuel` (relancé séparément) : **336 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_ErkErFZX1UzR6y9ce34GDTXgpiTz`, cible
production) READY, commit `c89549121c853d4e144df8ddaa19c697babbf016` ; `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : HTTP 200, sha identique, `identiteCoherente=true`,
« toutes les lectures passent » — nouvelle lecture « H-2 slice 2 : le propriétaire du point
d'action client » `ok:true, vide:true`, detail « VIDE — aucun point d'action client avec
propriétaire assigné » (attendu : la base RÉELLE de production n'a jamais eu ce formulaire
soumis — seul `npm run clics`, qui exerce ce geste, en assigne un, et sur sa propre base locale,
jamais sur la production). Une lecture VIDE ici n'est pas un défaut : elle rougirait (HTTP 500)
si un `owner_contact_id` pointait un contact désactivé ou d'une autre entité — éprouvé en local
par mutation directe (`h2-slice2-proprietaire-lecture.test.ts`, cas connu mauvais, règle 17).

**Lot 7, H-2 slice 2 est COMPLÈTE.** Reste du Lot 7 : H-2 slice 3 (la relance PROPRE au point
d'action, au-delà du `ensureReminders` de niveau `request` déjà construit pour H-1) — et,
au-delà de H-2, la question de R105 (followup/RLS column-blind) reste ouverte pour un chantier
séparé, jamais bloquante pour la suite du Lot 7.

## Lot 7, H-2 slice 1 — écran « constat vs point d'action client » (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après le Lot 7 tranche 2 (règle 32). H-2 :
« le cycle de vie du constat vis-à-vis du client » (`docs/REGISTRE_IDEES.md` ligne 270) —
« propriétaire, échéance, état, relance — en distinguant NETTEMENT l'exception d'audit (le
dossier) du point d'action client (l'entité) », condition écrite : « le point d'action client
ne remplace jamais l'exception d'audit et n'entre pas dans le dossier comme conclusion ».*

**Recherche préalable (un sous-agent)**, avant tout code : cette séparation est DÉJÀ un
invariant tenu par le code existant — `draftClarificationRequest` crée un `request_item(kind=
'explanation', exception_id=…)` par écart ouvert ; le client répond par
`evidence.ts::answerExplanation` ; seul un humain, par `resolveException`, referme le DOSSIER
(`status='resolved'`). Découverte majeure, disclosed sans être corrigée ici (hors périmètre de
cette slice) : la table `followup` (migration `0002_testing.sql`, documentée depuis le premier
jour comme « auto-drafted clarification, L2 approve-to-send ») est un DÉCOR exact — deux usages
seulement dans tout le dépôt, `approved_by` toujours NULL, aucun SELECT nulle part, aucune
politique RLS. Découpage retenu : slice 1 (celle-ci, zéro migration, pure lecture, un
réfutateur) · slice 2 (modèle de données — trancher entre réhabiliter `followup` ou étendre
`request_item`, deux réfutateurs, règle 30) · slice 3 (relance).

**Implémenté** (commit `4e60d9b`) : `matching.ts::constatEtPointAction(engagementId)` —
jointure exception/request_item(kind='explanation')/request. Panneau ajouté à
`exceptions/page.tsx` : « le constat » (exception.status/taxonomy_code/description) et « le
point d'action client » (request_item.status/client_note, request.due_date/status) comme deux
colonnes distinctes, jamais fusionnées. Nouvelle lecture `/api/sante` qui RE-DÉRIVE
indépendamment (jointure SQL directe, jamais un appel à `constatEtPointAction`) et rougit sur
le seul cas anormal identifié : un point d'action `pending` dont le constat est redevenu
`open` sans reprise. i18n : cinq clés neuves, 0 chaîne hors catalogue.

**Revue hostile (un seul réfutateur, règle 30 : tranche pure lecture, aucun modèle de données
ni code de refus touché).** Deux constats RÉELS, non bloquants, corrigés (commit `94eb4e6`) :
(1) `constatEtPointAction` ne filtrait pas `i.kind = 'explanation'` dans son SQL, contrairement
à son propre docstring et à la lecture sœur `/api/sante` qui, elle, filtrait déjà — non
exploitable aujourd'hui (seul `draftClarificationRequest` pose `exception_id`, toujours avec ce
`kind`), mais un écart entre ce que la fonction prétend et ce qu'elle fait (règle 16) ; filtre
ajouté, test de régression écrit. (2) Le docstring affirmait qu'`answerExplanation` n'écrit
JAMAIS `exception.resolution` — faux : il l'écrit TEMPORAIREMENT (texte brut du client, statut
`'explained'`), écrasé seulement quand un humain appelle `resolveException` ; l'invariant du
mandat tient par le STATUT, pas par l'absence totale d'écriture — docstring corrigé pour dire
précisément ce que le code fait, une affirmation non vérifiée prise pour acquise avant la revue
(règle 18).

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués sur
l'arbre du commit `94eb4e6`) : `tsc` propre · **154/154 fichiers, 1171/1171 tests vitest** ·
`gardes` 47 · `semeur` à jour · `plancher` 1171 collectés · `langue` 0 hors catalogue, **15/15**
· `lectures` 0 perdue, **6/6** · `parcours` 0 station perdue, **5/5** · `screens` **93 routes, 0
échec** · `fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0 dépassement** (commit
`b839ab0`) · `clics` **EXIT=1 réel, seul motif `#418`** (F33, `docs/CHASSE.md`, dix-neuvième
confirmation consécutive), clôture et archive ATTEINTES (240 stations figées vérifiées, 260
étapes, 385 clics — identique à la référence, ZÉRO nouvel échec). `visuel` (relancé
séparément) : **336 vues, 0 défaut**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_5wMKwfqpdQFqfGVEYo7sN42pb87Z`, cible
`production`) : `READY`, commit `8e472506dde0575529d50189435ddd02f742f568` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` : HTTP 200,
`sha` identique, `identiteCoherente:true`, verdict « toutes les lectures passent » — la
nouvelle lecture « H-2 : le constat vs le point d'action client » `ok:true`, detail « 11
point(s) d'action client — complete:11 » (non VIDE, informative, la base RÉELLE de production
porte onze points d'action déjà répondus par le client). `docs/instantanes/servi.json` et
`docs/REPRISE.md` mis à jour dans le même geste.

**Lot 7, H-2 slice 1 est COMPLÈTE et servie.** Reste du Lot 7 : H-2 slice 2 (modèle de données —
propriétaire/échéance/relance propres au constat, décision `followup` vs `request_item` à
trancher d'abord, deux réfutateurs requis) puis slice 3 (relance).

## Lot 7, tranche 2 (H-1 slice 2) — obstacle au visa : les demandes en retard (2026-09-16)

*Suite du mandat du fondateur, enchaîné sans pause après le Lot 7 tranche 1 (règle 32). H-1
slice 2 : « ce qui reste dû est un obstacle au visa », le critère d'admission même de H-1
(`docs/REGISTRE_IDEES.md`).*

**Implémenté** (commit `be205d2`) : nouvelle famille d'obstacle `demandes` dans `obstacles.ts`
(miroir du patron ANA-04, Lot 6) — `obstaclesDemandes(engagementId)` lève `obst.demandeEnRetard`
pour toute `request` `sent`/`partially_submitted`/`reopened` dont `due_date` est dépassée.
`Famille`/`OU` étendus, appel dans `obstaclesAuVisa()`, titre/pourquoi dans `familles.ts`, lecture
informative `/api/sante` (« H-1 : les demandes en retard »), garde déclarée dans `registre.ts`
(`docs/GUARDS.md` régénéré, G-67). Deux tests initiaux (cas connu bon vérifié directement contre le
monde semé, cas connu mauvais par mutation SQL de `due_date`).

**Revue hostile, DEUX réfutateurs indépendants (règle 30 : code de refus neuf).** Voix 1 (lecture
statique + épreuve empirique ciblée) : aucun défaut réel dans le prédicat lui-même. Voix 2 a
reproduit EXACTEMENT le warp de 25 jours de `demo-seed.ts` (pas seulement la fixture vitest
fraîche) et a trouvé un défaut RÉEL et BLOQUANT : R-008 (la demande PBC revenue du monde de démo)
reste `partially_submitted` EN PERMANENCE — l'item A2 (bon de livraison introuvable,
`recordScopeLimitation`) et une écriture manuelle déjà `escalated` laissent des `request_item`
`pending` qu'aucun chemin produit ne referme jamais (ni `recordScopeLimitation` ni
`escalateToMisstatement` ni `resolveException` ne touchent `request_item.status` — seuls
`ingestEvidence`/`answerExplanation` le font). Sans correctif, la famille neuve aurait bloqué le
visa du dossier de démo SANS RECOURS — exactement la classe de défaut NOTIF-01 (CLAUDE.md §3,
règle 37 rejouée mot pour mot : deux revues hostiles + tests ciblés n'ont rien vu, seule
l'exécution du warp réel l'a trouvé).

**Correctif** (commit `6d6bb39`) : `obstaclesDemandes` ne compte plus un élément `pending` comme
« encore dû » si son exception associée a atteint une disposition DÉCIDÉE
(`resolved`/`escalated`/`scope_limitation`) — la même frontière que `evaluation.ts:317`, réutilisée
verbatim, pas inventée. `part1.ts::clientDeposits` dépose désormais aussi les deux relevés
bancaires (pièces d'étendue, `sample_item_id` NULL, jusqu'ici exclues par la boucle de dépôt bien
qu'ayant leurs fixtures dans `evidence_index.json`) — un vrai gap de la seed, pas un contournement.
Deux tests de régression ajoutés à `obstacles-demandes.test.ts`, dont un qui rejoue le warp réel de
`demo-seed.ts` et exige `obstaclesDemandes(engNep) === []` après — le même chemin que la revue
hostile a emprunté, jamais seulement la fixture fraîche.

**Mesures finales, dans l'ORDRE canonique de `npm run verify`** (règle 34/35, chaque étape sous
`timeout` explicite, `EXIT` lu dans le journal brut ; `db:reset && demo:seed` rejoués une dernière
fois avant la première mesure de cette liste, sur l'arbre du commit `6d6bb39`) : `tsc` propre ·
**152/152 fichiers, 1165/1165 tests vitest** · `gardes` 47 · `semeur` à jour · `plancher` 1165
collectés · `langue` 0 hors catalogue, **15/15** · `lectures` 0 perdue, **6/6** · `parcours` 0
station perdue (315 déclarées, 290 figées, 25 nouvelles à figer), **5/5** · `screens` **93 routes,
0 échec** · `fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0 dépassement**
(`docs/DENSITE.md` régénéré, commit `c56c8ac`) · `clics` **EXIT=1 réel, seul motif `#418`** (F32,
`docs/CHASSE.md`, dix-huitième confirmation consécutive), clôture et archive ATTEINTES (240
stations figées vérifiées, « le dossier se CLÔT et l'archive est scellée »), 260 étapes, 385
clics — identique au chiffre de référence, ZÉRO nouvel échec introduit par cette tranche. `visuel`
(relancé séparément, `clics` casse le `&&`) : **336 vues, 0 défaut**.

**Un premier passage de `fumee`/`screens`, mené APRÈS `clics` au lieu d'AVANT (ordre non canonique,
erreur de méthode de cette session), avait montré à tort 2 « échecs » — `/api/sante` 500 (la
lecture CTRL-01, domaine SOX/ICFR, sans aucun rapport avec cette tranche) et `/eng/[id]/poste/
[code]` 404 — qui ont disparu dès la reprise dans l'ordre canonique (`db:reset && demo:seed` puis
`screens`/`fumee` AVANT `clics`, exactement l'ordre de `npm run verify`). Diagnostiqué, pas
supposé (règle 18) : `C-BR-01 : 4 deviation(s)` est une constante ÉTABLIE du seed SOX (citée
ailleurs dans ce fichier) — la lecture CTRL-01 rougit tant que `clics` n'a pas encore documenté la
procédure manquante de ce contrôle ; lancer `fumee` sur une base déjà travaillée par `clics` (donc
dans un état intermédiaire que `clics` lui-même finit par résoudre plus loin dans son propre
parcours) n'est jamais l'état que `fumee`/`screens` sont censés éprouver. Consigné ici pour que la
prochaine tranche ne refasse pas la même mesure dans le mauvais ordre.**

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_C7bp4pm9TgeMsC8oFieZXRKRjA65`, cible
`production`) : `READY`, commit `a05cac6cd4772f99ed23e2d4bde6e84e1886a74f` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` : HTTP 200,
`sha` identique, `identiteCoherente:true`, verdict « toutes les lectures passent » — la nouvelle
lecture « H-1 : les demandes en retard » `ok:true`, detail « 1 demande(s) en retard — R-001 »
(non VIDE, informative, exactement comme conçue — la base RÉELLE de production porte une demande
naturellement en retard, différent du monde de démo local). `docs/instantanes/servi.json` et
`docs/REPRISE.md` mis à jour dans le même geste.

**Lot 7, tranche 2 est COMPLÈTE.** Reste du Lot 7 : H-2 (le cycle de vie du constat vis-à-vis du
client, un chantier de modèle de données à part, deux réfutateurs requis — règle 30), à ouvrir par
sa propre recherche préalable avant tout code.

## Lot 7, tranche 1 (H-1) — portail : « ce que vous me devez encore » (2026-09-16)

*Suite du mandat du fondateur (2026-09-16), enchaîné sans pause après le Lot 6 (règle 32).
Recherche préalable (un sous-agent) : `docs/REGISTRE_IDEES.md`, item H-1 — « l'espace de demandes
porté à leur niveau », dont l'écran nommé littéralement, « ce que vous me devez encore »,
n'existait sous aucun nom avant cette tranche (vérifié par grep sur le dépôt entier). H-1 se
découpe en trois tranches ; celle-ci est la première, la plus petite et la plus sûre (zéro
migration, pure lecture) — H-1 slice 2 (obstacle au visa sur les demandes en retard) et H-2 (le
cycle de vie du constat client, un chantier de modèle de données à part) restent à faire.*

**Implémenté** (commit `f61e60f`) : `portalOutstandingItems(entityId)` (`portal.ts`), agrégat de
tout `request_item` `pending` dont la demande parente reste `sent`/`partially_submitted`/
`reopened` — même patron que `portalRequests`, une clause de plus. Décision explicite (règle 19) :
`'pending'` seul compte comme « encore dû », jamais `'uploaded'` (une pièce déposée mais pas
encore acceptée est une attente côté cabinet, pas côté client — vérifié par lecture complète
d'`evidence.ts`, aucun writer ne repasse un item à `pending`). Nouvelle section sur
`/portal/[token]`, sous le même garde de jeton que le reste de l'écran (migration 0141). Nouvelle
lecture `/api/sante` qui RE-DÉRIVE indépendamment (jointure directe, jamais une comparaison à
elle-même). i18n : quatre clés neuves, 0 chaîne hors catalogue.

**Revue hostile (un seul réfutateur, règle 30 amendée).** Aucun constat bloquant, un seul appliqué
(commit `15a3ff8` — un marqueur de commentaire à la fin d'un bloc `if (eng)` dans `route.ts`,
trouvé pendant l'implémentation par `tsc`, diagnostiqué sans ambiguïté par la revue elle-même).
`tsc`/`langue`/`lectures`/les tests ciblés tous reconfirmés propres PAR la revue.

**CE QUE LA REVUE HOSTILE N'A PAS TROUVÉ, ET QUE SEUL `npm run clics` A TROUVÉ — exactement la
leçon de NOTIF-01 (mandat du 14 septembre, règle 37), rejouée ici mot pour mot.** Cette tranche
ne pose ni ne change de code de refus : rien n'obligeait, à la lettre de la règle 37, un
`npm run clics` complet avant de la dire close. Lancé quand même, par prudence (règle 12 : une
mesure jamais rejouée n'est qu'une affirmation) — et il a bien fait : **`EXIT=1` avec SIX échecs
réels et 1294 clics comptés (contre 385 d'habitude)**, sur des stations SANS RAPPORT apparent
avec cette tranche — la disposition et la conclusion d'une ligne de la grille de test, le retour
depuis un écart, une clarification en lot, le bandeau « mes travaux ». Ni `vitest` (150/150
fichiers, 1158/1158 tests) ni `tsc` ni `langue` ni `lectures` n'avaient rien vu : un relecteur
hostile LIT et MUTE, il n'appuie pas sur les boutons d'un parcours de bout en bout (règle 37,
mot pour mot).

**Diagnostic, par BISSECTION plutôt que par hypothèse (règle 18) : `git worktree`, six exécutions
complètes (`db:reset && demo:seed && clics`, base fraîche à chaque fois, EXIT lu dans le journal
brut à chaque passage).** Le commit précédent cette tranche (`f5fa6d2`) est TOUJOURS propre — 385
clics, 1 échec (`#418` seul), reproduit deux fois, chiffres identiques. Cette tranche seule (à sa
pointe, `15a3ff8`) introduit la régression — reproduite QUATRE fois, chiffres identiques à chaque
fois (6 échecs, 1294 clics), y compris après avoir tué un `next-server` orphelin d'un essai de
diagnostic précédent (l'hypothèse « c'est un processus qui traîne » a été ÉPROUVÉE et rejetée, pas
supposée). Isolée ensuite au SEUL fichier `page.tsx` : en révertant juste ce fichier sur l'arbre
de la tranche (`portal.ts`/`route.ts`/`catalogue.ts` gardés), l'exécution redevient propre (385/1).

**Cause trouvée, pas seulement contournée** (commit `eb5c5b3`) : la station « portail client »
(`scripts/clics/scenario.ts`) sélectionne CHAQUE demande à traiter par `a[href*="/portal/"]` sur
TOUTE LA PAGE, sans borner à une table précise. Le lien « Ouvrir » que cette tranche posait sur
chaque ligne de « ce que vous me devez encore » pointait vers LA MÊME url `/portal/[token]/[id]`
que la table des demandes juste en dessous — un second lien vers la même demande, qui la faisait
visiter et traiter DEUX FOIS (dépôts de pièces et réponses d'explication rejoués), corrompant
l'état partagé au point de faire échouer, bien plus loin dans le parcours, la grille de test.
**Corrigé en retirant le lien** — la ligne reste consultable, s'ouvre déjà par la table des
demandes juste en dessous, rien n'est perdu. `tsc`/`langue`/`lectures` reconfirmés propres ; le
cycle `db:reset && demo:seed && clics` repasse à 385 clics / 1 échec (`#418` seul), reproduit une
seconde fois sur l'arbre committé avant de conclure.

**Mesures finales, `npm run verify` complet sur l'arbre corrigé du commit `eb5c5b3`** (règle
34/35, `timeout 3600`, EXIT lu dans le journal brut) : `tsc` propre · **150/150 fichiers,
1158/1158 tests vitest** · `gardes` 46 · `plancher` 1158 collectés · `langue` 0 hors catalogue,
**15/15** · `lectures` 0 perdue, **6/6** · `parcours` 0 station perdue, **5/5** · `screens` **93
routes, 0 échec** · `fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0 dépassement**
(`docs/DENSITE.md` régénéré, commit `a4a2d6a`) · `clics` **EXIT=1 réel, seul motif `#418`** (F31,
`docs/CHASSE.md`, dix-septième confirmation consécutive), clôture et archive ATTEINTES (260
étapes, 385 clics — retour à la normale). `visuel` (relancé séparément, `clics` casse le `&&`) :
**336 vues, 0 défaut**.

**Leçon retenue pour les tranches suivantes de ce Lot (H-1 slice 2, H-2)** : tout nouveau lien
`/portal/...` posé sur la page d'accueil du portail doit être vérifié contre le sélecteur
générique `a[href*="/portal/"]` de la station « portail client » (`scenario.ts`) avant d'être
livré — un second lien vers une demande déjà listée ailleurs sur la même page la fait traiter en
double. Documenté dans le commentaire du code, à l'endroit du correctif.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_56u4pXguidFbX3xQARU2QNBQuc7F`, cible
`production`) : `READY`, commit `5dd2c52f0e27fb6e752b1570454a8109286938a5` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` : HTTP 200,
`sha` identique, `identiteCoherente:true`, verdict « toutes les lectures passent » — la nouvelle
lecture « portail : "ce que vous me devez encore" cohérent avec les demandes ouvertes »
`ok:true`, detail « 7 élément(s) "encore dû(s)", tous cohérents avec l'état réel de leur
demande ». `docs/instantanes/servi.json` et `docs/REPRISE.md` mis à jour dans le même geste.

**Lot 7, tranche 1 est COMPLÈTE et servie.** Reste du Lot 7, dans l'ordre établi par la
recherche préalable : H-1 slice 2 (l'obstacle au visa sur les demandes en retard, satisfaisant
le critère d'admission même d'H-1 — « ce qui reste dû est un obstacle au visa ») puis H-2 (le
cycle de vie du constat vis-à-vis du client, un chantier de modèle de données à part, deux
réfutateurs requis — règle 30).

## Lot 6, tranche 3 (NEP 240) — épine dorsale : population et tirage des écritures à risque (2026-09-16)

## Lot 6, tranche 3 (NEP 240) — épine dorsale : population et tirage des écritures à risque (2026-09-16)

*Mandat `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, Partie D.1, premier morceau du Lot 6
(« test des écritures — NEP 240 — réduit à sa colonne vertébrale »), poursuivi le même jour sous
le mandat du fondateur du 2026-09-16 qui redemande explicitement Lot 6 puis Lot 7, sans pause
entre tranches, avec obligation nouvelle : chaque tranche nomme désormais un SHA de production
MESURÉ (voir §0 de ce mandat, cité verbatim ci-dessous à sa propre section).*

**Recherche préalable (un sous-agent, plus une lecture directe extensive et des sondes vitest
jetables)**, avant tout code : `sampling.ts` (REV-SUBST) est entièrement câblé en dur —
`template_code = 'REV-SUBST'` en quatre endroits, `revenuePopulation()` filtre `account_no like
'70%'` — jamais générique, jamais touché par cette tranche (ADR-016, le chemin le plus exercé du
dépôt). `methodology/procedures.json` porte déjà MANUEL (`ecritures_manuelles`) et FRAUDE
(`ecritures_marqueurs_fraude`), toutes deux `cycle:"*"`, `nature:"sondage_pieces"`,
`risque_minimum:"moyen"` — REVENUE porte déjà `realite:moyen` (vérifié par sonde directe contre
la base seedée, pas supposé) : les deux procédures sont DÉJÀ commandées par le risque sur
REVENUE aujourd'hui, avant tout commit de cette tranche, mais AUCUNE n'a de ligne
`procedure_instance` — « commandée, jamais planifiée », le même gap déjà nommé pour
CLIENTS-AVOIRS (R92) et IMMO_COR-TAB/ACQ (R95).

**Implémenté** (commit `0d0bf6a`) :
1. `kernel/types.ts`/`kernel/flags.ts` — nouveau drapeau `late_validation`
   (`validDate > periodEnd`), précédent SQL déjà exercé par `risk.ts:177`.
2. `services/population.ts` — `journalEntryPopulation(engagementId, fsliCode, predicate)`,
   GÉNÉRIQUE par FSLI (contrairement à `revenuePopulation()`) : filtre `gl_entry` par les
   comptes RÉELS du poste (`fsliAccounts`) puis par les drapeaux du prédicat
   (`ecritures_manuelles` → `manual_journal` ; `ecritures_marqueurs_fraude` →
   `weekend`/`round_amount`/`late_validation`).
3. `services/sampling-je.ts` (fichier neuf) — propose/valide/tire/courant, PARALLÈLE à
   `sampling.ts`, jamais une modification de celui-ci : réutilise `validateSampleParams`
   (déjà générique sur `sample.id`) et `monetaryDraw` (kernel) SANS DUPLICATION. Le tirage est
   EXHAUSTIF sur la population filtrée — effet de bord voulu de `monetaryDraw` : puisque
   `journalEntryPopulation` ne retient que des lignes déjà `flags.length > 0`, son bucket
   `flagged` sélectionne INCONDITIONNELLEMENT tout le monde, quel que soit le seuil de
   couverture — exactement la pratique NEP 240 (examiner les écritures identifiées), sans
   branche spéciale écrite pour l'obtenir. Vérifié par la revue hostile en LISANT `kernel/sampling.ts`
   plutôt qu'en croyant la prose (constat 3 ci-dessous).
4. **Correctif de sécurité de routage (règle 13), trouvé PENDANT cette tranche, pas apporté par
   elle** : `atelierDeLaNature` (programme.ts) gagne un QUATRIÈME paramètre optionnel,
   `templateCode`. Sans lui, `sondage_pieces` + REVENUE ouvrait TOUJOURS `/testing` — câblé en
   dur sur `currentRevenueSample`, filtré `template_code = 'REV-SUBST'` — pour N'IMPORTE QUELLE
   procédure de cette nature sur ce poste, y compris MANUEL/FRAUDE qui étaient déjà planifiables
   par le bouton « planifier » de `/programme` AVANT ce commit (le risque les commandait déjà).
   Un clic sur leur atelier aurait donc silencieusement montré le tirage de REV-SUBST — un lien
   menteur, atteignable dès avant cette tranche, pas seulement un risque théorique qu'elle
   introduirait. `undefined` préserve le comportement d'origine pour tous les appelants
   préexistants (poste.ts, trois lectures `/api/sante` jumelles) ; seuls les deux points d'appel
   de `programme/page.tsx` passent désormais `l.code`.
5. Nouvelle lecture `/api/sante` : « atelier sondage_pieces réservé à REV-SUBST sur REVENUE »,
   modelée sur les trois lectures jumelles `atelier … disponible` (Lot 3) mais dans le sens
   inverse — elle rougit si une ligne HORS REV-SUBST reçoit quand même un atelier, jamais
   l'inverse.

**Délibérément hors de cette tranche, disclosed R104** (`docs/BACKLOG_REPORTE.md`,
`docs/instantanes/fils.json`) : aucun atelier interactif (le papier reste générique,
`redigerPapierDeProcedure`) ; « saisie par la direction » (le second volet du `population.filtre`
des deux procédures dans la méthode) non calculable — `gl_entry` (0001_core.sql, vérifié) ne
porte aucune colonne auteur/rôle ; `flows/part1.ts` ne plante NI MANUEL NI FRAUDE dans le monde
semé (même choix que R92/R95) — leur chemin humain existe (`/programme`) mais n'a jamais été
cliqué, donc NON PROUVÉ au sens de la règle 20, seulement testé en base.

**Tests** (4 fichiers neufs/étendus) : `kernel.test.ts` (le nouveau drapeau, cas connu mauvais —
ligne à temps ≠ ligne en retard ≠ ligne non validée) ; `sampling-je.test.ts` (filtrage de
population avec MUTATION SQL DIRECTE d'un drapeau puis retour, round-trip vérifié ; cycle complet
propose→valide→tire pour LES DEUX templates, exhaustif sur sa population ; `DRAW` refusé avant
`VALIDATE`) ; `programme-vue.test.ts` (le nouveau paramètre, comportement rétro-compatible pour
`undefined` ET la disambiguïsation explicite) ; `nep240-sondage-lecture.test.ts` (état vide, état
honnête sans atelier avec « R104 » cité à l'écran, RÉGRESSION SIMULÉE — `vi.doMock` reproduisant
EXACTEMENT le bug d'avant ce correctif — qui fait rougir `/api/sante` entier, HTTP 500).

**Revue hostile (un seul réfutateur, règle 30 amendée — tranche hors modèle de
données/sécurité/multi-tenant/code de refus).** Dix constats, AUCUN bloquant. Deux corrigés
(commit `88ff8e0`) :
1. **R104 complété d'un quatrième point** : `drawJournalEntrySample` n'a pas le bloc de reprise
   par `natural_key` (ADR-133) que `drawRevenueSample` implémente sur le même geste — un
   re-tirage MANUEL/FRAUDE ne rattacherait pas les nouvelles `sample_item` aux anciennes.
   Confirmé INERTE aujourd'hui par grep (aucun écran ni fonction de `requests.ts` n'est jamais
   appelé avec un identifiant MANUEL/FRAUDE), mais nommé explicitement comme piège pour la
   tranche qui construira leur atelier — exactement la classe de défaut qu'ADR-133 existe pour
   éviter, jamais laissé à redécouvrir.
2. `sampling-je.ts` : la phrase de justification MANUEL citait `journal ${'OD'}` en dur alors
   que la logique ne dépend que du drapeau `manual_journal` — retiré.
Les huit autres constats confirment (par lecture ET par exécution, jamais par confiance en la
prose) : le SQL de `journalEntryPopulation` paramétré et isolé par `engagement_id` ; la
réutilisation de `monetaryDraw`/`validateSampleParams` saine ; `atelierDeLaNature` sans
régression sur ses appelants existants (15/15 tests jumeaux verts) ; la nouvelle lecture
`/api/sante` un vrai garde-fou, pas une tautologie ; R104 honnête sur ses trois premiers points ;
le dormant `si_facteur` un gap préexistant, pas aggravé par cette tranche.

**Mesures finales, `npm run verify` complet sur l'arbre gelé du commit `88ff8e0`** (règle 34/35,
`set -o pipefail && timeout 3600 npm run verify 2>&1 | tee … ; echo "EXIT=$?"`, EXIT lu dans le
journal brut du harnais, jamais dans le résumé du wrapper) : `tsc --noEmit` propre · **149/149
fichiers, 1154/1154 tests vitest** · `gardes` 46 gardes · `semeur` à jour · `plancher` 1154
collectés, plancher 632 · `langue` 0 chaîne hors catalogue, **15/15** cas connus mauvais ·
`lectures` 0 perdue sur 1716 chemins, **6/6** · `parcours` 0 station perdue (25 nouvelles non
encore figées, churn des tranches précédentes), **5/5** · `screens` **93 routes, 0 échec** ·
`fumee` **52 routes, 0 échec** · `densite` **83 écrans, 0 dépassement** (`docs/DENSITE.md`
régénéré, commit `11aa99c`) · `clics` **EXIT=1 réel**, seul motif `#418` (F30, `docs/CHASSE.md`)
sur `/rcm/[cid]`, SEIZIÈME confirmation consécutive que ce flake est disjoint de tout changement
applicatif — clôture et archive ATTEINTES (240 stations figées vérifiées, 260 étapes, 385 clics).
`visuel` (relancé séparément, même précédent que toutes les tranches précédentes — `clics` en
échec sur `#418` casse le `&&`) : **336 vues, 0 défaut(s)**.

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment` (`dpl_HwypPbRjpb8eCRXeiMXBJRfkz19r`, cible
`production`) : `READY`, commit `4b5fcbc9c178bc22dd461f03854ff3a43805f31a` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` : HTTP 200,
`sha` identique, `identiteCoherente:true`, verdict « toutes les lectures passent » — la nouvelle
lecture « atelier sondage_pieces réservé à REV-SUBST sur REVENUE » `ok:true`, detail « 3
procédure(s) sondage_pieces planifiée(s) sur REVENUE, dont CUTOFF/MANUEL sans atelier (disclosed
R104), honnêtement » (aucune régression). `docs/instantanes/servi.json` et `docs/REPRISE.md` mis
à jour dans le même geste.

**Le Lot 6 (mandat 2026-09-05, Partie D.1) est COMPLET** : ANA-04 (la revue analytique périmée
bloque le visa), le registre des anomalies (déjà complet, vérifié), NEP 240 (l'épine dorsale) —
les trois morceaux sont en ligne. Suite du mandat du fondateur (2026-09-16) : Lot 7 (l'espace de
demandes au niveau du marché, le cycle de vie du constat client), enchaîné sans pause (règle 32).

## Lot 6, tranche 2 : le registre des anomalies — DÉJÀ COMPLET, vérifié (2026-09-16)

*Mandat `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, Partie D.1, deuxième morceau du
Lot 6 : « registre des anomalies (factuelle, de jugement, extrapolée ; projection ; corrigées et
non corrigées ; évaluation contre la matérialité). » Recherche préalable (agent d'exploration,
puis lecture directe du code par cette session) : cette pièce est déjà construite dans sa quasi-
totalité, sous le mandat du 2026-09-14 — `evaluation.ts:270` cite littéralement « la projection
alimente le registre des anomalies déjà prévu au Lot 6 ». Cette tranche ne CONSTRUIT rien : elle
VÉRIFIE, par exécution et par clic, que les cinq exigences du mandat sont tenues, puis le dit.*

**Les cinq exigences, vérifiées une par une, par lecture directe du code (pas devinées) :**
1. **Factuelle, de jugement, extrapolée** — `misstatement.kind` (migration `0002_testing.sql`)
   ∈ `('factual','judgmental','projected')`, exactement les trois catégories nommées.
2. **Projection** — `concludeEvaluation` (`evaluation.ts`) insère une ligne `kind='projected'`,
   sourcée de `evaluateSample`/ISA 530 §14 (extrapolation), liée par `sample_evaluation_id`
   (migration 0162, index partiel unique empêchant le double-compte).
3. **Corrigées et non corrigées** — `misstatement.corrected boolean`.
4. **Évaluation contre la matérialité** — `conclusionGate()` (`evaluation.ts`) calcule
   `|connu + projeté| <= TE` et bloque (`tolerable_exceeded_unanswered`) tant qu'aucune réponse
   documentée n'existe ; l'écran `exceptions/page.tsx` affiche en permanence le total non corrigé
   contre le TE (EXTRAP-03), même à zéro.
5. **Le mécanisme de rejet ISA 530 §13** (« manifestement non représentatif ») existe aussi,
   au-delà des cinq exigences nommées : migration 0162 (`dismissed_reason`,
   `dismissed_evidence_id`), service `dismissMisstatementAsAnomaly` (`matching.ts`).

**Vérifié par le CHEMIN, pas seulement par lecture (règle 15, règle 20/37).** `docs/CLICS.md`,
régénéré sur commit `c00b43a` (tranche ANA-04, ce même jour) : les stations « résolution des
écarts » (26 clics), « re-exécution et évaluation » (4 clics) et « kanban des écarts » exercent
DÉJÀ ce registre à chaque `npm run clics`, depuis le mandat du 14 septembre — clôture et archive
systématiquement atteintes depuis (voir chaque tranche du Lot 5 et d'ANA-04 ci-dessus). Aucun clic
neuf n'était nécessaire : le chemin humain existe et est déjà emprunté par le parcours figé.

**`dataset/ANOMALIES.md` N'EST PAS ce registre** (vérifié, pas supposé) : c'est le manifeste des
anomalies semées pour l'acceptation (A1-A8, D1-D4, jeu Altiverre) — un fichier de test de
génération, distinct de l'objet `exception`/`misstatement` que l'auditeur travaille en ligne.

**Aucun code changé.** Cette tranche est un constat écrit, pas un correctif — aucune revue
hostile requise (rien à réviser), aucun `npm run verify` requis (rien à re-vérifier au-delà de ce
qui l'est déjà par chaque tranche précédente). **Le Lot 6, tranche 2 est COMPLET, sans commit
applicatif.**

**SHA servi CONFIRMÉ.** `mcp__Vercel__get_deployment`/`list_deployments` (`dpl_H8zVti2MU8Us5CwiiDXLW9ua2J3J`,
cible `production`) : `READY`, commit `1162162e5bdc796f77dd2d2b34d14527c1d8f003` ;
`mcp__Vercel__web_fetch_vercel_url` sur `/api/sante` rend `sha` identique, `identiteCoherente:
true`, HTTP 200, verdict « toutes les lectures passent ». Reste du Lot 6 : test des écritures
NEP 240 (greenfield).

## Lot 6, tranche 1 : ANA-04 — la revue analytique périmée bloque le visa (2026-09-16)

*Mandat `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, Partie D.1 : « Lot 6 — La crédibilité
en inspection : test des écritures (NEP 240) réduit à sa colonne vertébrale ; registre des
anomalies (...) ; revue analytique périmée qui bloque le visa. » Premier des trois morceaux du
Lot 6, choisi en premier parce que la DÉTECTION existait déjà (`analytique.ts::lireAnalytique`,
comparaison du `soldes_hash` figé à l'empreinte courante de la leadsheet, `perimee: boolean`
déjà affiché à l'écran du poste) — seul le BLOCAGE au visa manquait. Recherche préalable
(`docs/REPRISE.md`, docs du plan) confirmée par lecture directe du code, pas devinée.*

**Implémenté** (commit `6867856`) : nouvelle famille d'obstacle `analytique` dans
`obstacles.ts` (fonction `obstaclesAnalytique()`, appelée en 6 quater dans `obstaclesAuVisa`,
après la matérialité et avant le pointage). **Décision délibérée, documentée dans le docstring
(règle 19)** : un poste dont la revue analytique n'a JAMAIS été rédigée ne bloque PAS ici — le
mandat nomme « périmée », pas « manquante ». Câblage complet : `Famille`/`OU`/`FAMILLES`
(destination `/eng/[id]/analytique`, l'écran de revue globale déjà existant), i18n
(`obst.analytiquePerimee`, `famille.analytique.*`), lecture `/api/sante` ANA-04 (informative,
même discipline que MAT-01/02), garde déclarée `registre.ts`.

**Tests** (5, deux fichiers neufs — le commit `6867856` affirmait « sept » à tort, corrigé ici
par un compte direct `grep -c "  it("`, règle 31) : `obstacles-analytique.test.ts` (cas connu bon — les huit
revues du Lot 5, fraîches, ne lèvent rien ; cas connu mauvais règle 17 — un solde mué HORS du
chemin gardé, SQL direct sur `account`, round-trip vérifié ; la frontière règle 19 — REVENUE sans
revue ne bloque pas) et `ana04-lecture.test.ts` (même discipline côté `/api/sante`). Vérifié aussi
contre la VRAIE base enrichie (`db:reset && demo:seed && demo:enrichir`, pas seulement
`runPart1UpToWorkpaper()` isolé) : aucune fausse péremption introduite par l'enrichissement — les
neuf revues (Lot 5 + REVENUE, écrite par l'enrichissement) restent toutes fraîches.

**`npm run clics` (rule 37 : tout code de refus neuf doit atteindre la clôture sur le monde
semé).** Un seul passage, plus lent que la fourchette habituelle (la phase `build…` a occupé
plusieurs minutes, CPU croissant mais lentement, jamais un hang total comme l'EXIT=143 de la
tranche Stocks §6) mais ABOUTI proprement : `EXIT=1` réel, seul motif `#418` (F29,
`docs/CHASSE.md`) sur DEUX routes — `/risk` (jamais vue avant dans cet historique) et
`/rcm/[cid]` (l'habituelle) — QUINZIÈME confirmation consécutive que ce flake est disjoint,
aucun rapport avec `obstacles.ts`/`analytique.ts`. Clôture et archive ATTEINTES (240 stations
figées vérifiées, empreinte SHA-256, téléchargement vérifié), 260 étapes, 385 clics.

**Revue hostile — voix 1 (indépendante, règle 30 : deux réfutateurs car la tranche touche un
code de refus).** N'a pas pu casser la logique elle-même (mutation de scoping après péremption
correctement gérée — testé par la voix elle-même — ; i18n `{nom}`/`{version}` sans risque de
`null`/`NaN` — `fsli.name` est `not null` en base ; destination `/eng/[id]/analytique` réelle,
même limitation « famille, pas lien profond par poste » que toutes les autres familles ; lecture
`/api/sante` prouvée par un cas connu mauvais qui lui est propre, pas seulement décorative).
**DEUX défauts de PROCESSUS réels, trouvés et CORRIGÉS avant ce commit** :
1. `npm run gardes -- --figer` n'avait jamais tourné après l'ajout de la garde déclarée —
   `docs/GUARDS.md` divergeait du registre, ce qui aurait fait échouer `npm run gardes` (donc
   `npm run verify` en entier). Corrigé : régénéré (46 gardes), `npm run gardes` repasse propre.
   Conséquence secondaire, NATURELLE au schéma de numérotation auto-incrémenté (`G-${50+i}`), pas
   un défaut : `unsupported_sample_items` décale de G-66 à G-67 — la mention historique « décalée
   en G-66 » plus haut dans ce fichier (§ notification, 2026-09-14) reste correcte pour SON propre
   moment, elle n'est pas réécrite (une entrée datée décrit son état à sa date, jamais mise à jour
   rétroactivement à chaque renumérotation future — sinon toute tranche future devrait rouvrir
   toutes les entrées passées).
2. Ce fichier lui-même n'était pas mis à jour dans le même commit que l'implémentation (règle 5) —
   corrigé par cette section même.

**Trouvaille annexe, disclosed pour une tranche future (pas un défaut de celle-ci) : R102.** La
voix 1 a vérifié par lecture que `posteSansProcedure` (obstacles.ts) ne contrôle que la PRÉSENCE
d'une `procedure_instance`, quel que soit son type — pas spécifiquement `RA` (la procédure
« revue analytique substantive » de `methodology/procedures.json`). Un poste peut donc compléter
tout son programme sans qu'une seule ligne `fsli_analytique` n'existe jamais, sans qu'AUCUN
obstacle (ni `posteSansProcedure`, ni `obstaclesAnalytique`, puisque « manquante » n'est pas
« périmée ») ne le signale — un trou plus grand que celui que ferme ANA-04 aujourd'hui. Enregistré
comme R102 dans `docs/BACKLOG_REPORTE.md`/`fils.json`, pour une ANA-05 future, hors du périmètre
de cette tranche (règle 8 : la chose plus petite).

**Revue hostile — voix 2 (indépendante, en parallèle, sans coordination avec la voix 1).**
CONVERGE sur le même défaut bloquant (`docs/GUARDS.md` divergé, confirmé par une mesure
indépendante — `git show eb4f5e1:docs/GUARDS.md` identique octet pour octet à `938b532`, alors que
`registre.ts` avait changé) et sur le même effet de bord (renumérotation positionnelle de
`unsupported_sample_items`). **Trouve DEUX choses que la voix 1 n'avait pas** :
1. Le commit `6867856` affirmait « sept » tests neufs — FAUX, recompté directement
   (`grep -c "  it("`) : CINQ. Corrigé ci-dessus (règle 31).
2. **R103, disclosed, non corrigé délibérément** (règle 8) : `obstaclesAnalytique` coûte 74
   requêtes SQL sur le dossier de démonstration contre 9 pour `obstaclesMaterialite`, sa voisine —
   mesuré par instrumentation directe de `getDb().query`, pas estimé. Cause : la boucle par poste
   appelle `lireAnalytique` → `leadsheetDuPoste`, qui relit et refiltre en JS toute la table
   `account` par poste (rien filtré par `fsli_code` en SQL), contrairement au patron ensembliste
   déjà établi par sa voisine dans le même fichier. `/api/sante` appelle ce chemin coûteux TROIS
   FOIS par requête sans partager le résultat. Corriger proprement toucherait
   `leadsheetDuPoste`/`fsliAccounts`/`soldesN1`, des fonctions PARTAGÉES par de nombreux autres
   appelants — un chantier plus large que cette tranche ; disclosed pour une reprise avant que le
   Lot 7+ n'ajoute des postes.

N'a pas réussi à casser la logique elle-même (round-trip de la mutation SQL directe prouvé
octet-identique après revert ; le détecteur SHA-256 réagit à n'importe quel delta non nul, donc le
choix de la magnitude de mutation ne change rien à ce qui est prouvé ; cassé DÉLIBÉRÉMENT
`revue.perimee` → `false` pour confirmer que le test connu mauvais échoue vraiment, rule 17 ;
isolation multi-tenant tracée propre sur les trois fonctions ; interpolation `{version}` et regex
de vacuité `essayer()` toutes deux vérifiées par exécution, pas seulement lues). **Note
d'environnement de la voix 2** : des fichiers de sonde non-siens sont apparus dans l'arbre pendant
sa revue (probablement la voix 1, qui travaillait en parallèle dans le même répertoire) — jamais
touchés, `git status` confirmé propre à la fin des deux revues.

**Les deux voix convergent : la logique métier tient, le seul défaut bloquant est un défaut de
processus (GUARDS.md non régénéré), déjà corrigé avant ce commit.** `npm run gardes` repasse
propre. Prêt pour la chaîne `verify` complète.

**Mesures finales, `npm run verify` complet sur l'arbre gelé du commit `79fea34` (règle 34,
tourné une seule fois — aucune édition pendant le run).** `tsc --noEmit` propre ; `vitest run` :
**147/147 fichiers verts**, tous les tests ANA-04 compris ; `gardes` : 46 gardes, **à jour, aucune
divergence** (le correctif tient) ; `semeur`/`plancher` : 1144 tests collectés, plancher 632,
aucune forme éteinte ; `langue`/`langue:epreuve` : 0 chaîne hors catalogue, 0 libellé en dur ;
`lectures`/`lectures:epreuve` : 6/6 cas connus mauvais dénoncés ; `parcours`/`parcours:epreuve` :
5/5 cas connus mauvais dénoncés (25 stations non figées signalées par le scénario — DETTE
PRÉEXISTANTE, vérifiée par `git diff` comme extérieure au diff de cette tranche : ANA-04 ne touche
ni `clics/run.ts` ni `PARCOURS.json`, non traitée ici, hors périmètre) ; `screens` (build
PRODUCTION) : **93 routes, 0 échec** ; `fumee` : **52 routes, 0 échec** ; `densite` : **83 écrans,
0 dépassement** (`docs/DENSITE.md` régénéré sur ce commit). `clics` : **EXIT=1 réel**, seul motif
`#418` (F29, QUINZIÈME confirmation, disjoint) sur UNE seule route cette fois (`/rcm/[cid]`) —
clôture et archive ATTEINTES (240 stations figées vérifiées, 260 étapes, 385 clics). `visuel`
(relancé séparément, même précédent que F14 — `clics` sort en échec sur `#418` et casse le `&&`
qui le précède) : **336 vues, 0 défaut**.

**Le Lot 6, tranche 1 (ANA-04) est COMPLET.** Fusion et confirmation du SHA servi en production à
suivre.

**SHA servi CONFIRMÉ, mesuré deux fois.** `mcp__Vercel__get_deployment` (`dpl_4hPqb9zQrqtnJpCWFdTLTxvpxtp4`,
cible `production`) : `READY`, commit `c00b43a2122129ac64e63010595ae251fbf9177a` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` rend
`sha: "c00b43a2122129ac64e63010595ae251fbf9177a"`, `identiteCoherente: true`, HTTP 200, verdict
« toutes les lectures passent » — nouvelle lecture **ANA-04** `"ok":true,"vide":true`, detail
« VIDE — aucune revue analytique périmée » (les huit revues du Lot 5 restent fraîches en
production, comme attendu). ANA-04 (recherche, implémentation, deux revues hostiles
indépendantes, un correctif de processus, verify complet) est donc EN LIGNE. Reste du Lot 6 :
registre des anomalies (déjà largement construit sous le mandat 2026-09-14, à vérifier) et test
des écritures NEP 240 (greenfield).

## CRITIQUE (expédition directe sur `main`) : restaure la migration 0165 — un correctif violait la règle 26 et bloquait TOUS les déploiements (2026-09-15)

Le check-in programmé pour confirmer le SHA servi du merge de la mécanique circularisation
fournisseur (`a10e484`) a trouvé sa production en ÉTAT ERROR — et tous les déploiements suivants
(branche de travail et `main`) également en ERROR. Le journal de build
(`mcp__Vercel__get_deployment_build_logs`) est sans ambiguïté : `deploy:reconstruire`
(`migrate()`) a refusé avec « 1 migration(s) ÉDITÉE(S) APRÈS APPLICATION :
0165_circularisation_fournisseur.sql » contre la base Supabase PARTAGÉE.

La migration `0165_circularisation_fournisseur.sql` avait bien été appliquée à cette base — par
le tout premier déploiement d'APERÇU de la tranche mécanique (commit `4fd9b1f`,
`dpl_TKGDS66Pydqyj8Jf8U88Hzm48Tfb`, état READY) — AVANT qu'un correctif ultérieur (commit
`2e0aadc`, sur la tranche même) n'édite le commentaire d'en-tête du même fichier, en affirmant :
« sûre au sens de la règle 26 — elle n'a jamais porté de ligne dans `_migrations` sur une base
persistante ». **Cette affirmation était FAUSSE** : inférée du statut d'un déploiement plutôt que
vérifiée par une requête directe sur `_migrations` — exactement l'anti-patron que la règle 26 de
CLAUDE.md nomme elle-même (« Dans le doute, une requête directe... tranche — jamais une inférence
depuis le statut d'un déploiement »).

**Corrigé, directement sur `main`** (expédition d'urgence, hors du cycle habituel de revue — le
reste de la tranche en cours, l'ouverture du poste Fournisseurs, continue sa propre revue hostile
séparément sur la branche de travail) : `supabase/migrations/0165_circularisation_fournisseur.sql`
restauré OCTET POUR OCTET à son contenu du commit `4fd9b1f` (`git diff 4fd9b1f -- supabase/migrations/0165...`
vide, empreinte SHA-256 identique) — jamais une nouvelle réédition, la seule façon de faire
concorder à nouveau l'empreinte que `migrate()` compare. Le constat que ce correctif visait à
documenter (le commentaire d'origine affirme au passé une revue hostile qui n'avait pas encore eu
lieu au moment où il a été écrit — règle 13) reste vrai, et reste désormais IMMUABLE dans le
fichier appliqué : il ne peut plus être corrigé dans la migration elle-même sans répéter la même
erreur. Le compte rendu honnête vit ici, jamais dans un fichier de migration appliqué.

**Aucune donnée n'a été perdue ni corrompue** — le site a simplement continué de servir le SHA de
la tranche Immobilisations (`5cc7b7a`, dernier déploiement production READY avant cet incident)
pendant que ces déploiements échouaient.

**SHA servi CONFIRMÉ, mesuré deux fois.** `mcp__Vercel__get_deployment` (`dpl_E7LEAxdg6AMq5mKYLwa2NGGbDnSV`,
cible production) : `READY`, commit `1d3d3d17ee5233fce67c4e12d05003e9cae408b3`. `mcp__Vercel__web_fetch_vercel_url`
sur `https://otto-dit.vercel.app/api/sante` : `sha: "1d3d3d17ee5233fce67c4e12d05003e9cae408b3"`,
`identiteCoherente: true`, HTTP 200, toutes les lectures passent. Le correctif d'urgence est donc
servi — la migration 0165 dans sa forme d'origine, sans le correctif C2 qui bloquait le déploiement.

## MESSAGE AU FONDATEUR (2026-09-13) — le moment annoncé le 10 septembre

Tu as dit, le 10 septembre : « je ne relirai pas écran par écran ; je donnerai mon verdict UNE
FOIS, sur otto-dit.vercel.app, quand le repass entier sera livré. Dis-moi quand ce moment arrive —
ce seul message est tout ce que je te dois d'ici là. »

**C'est maintenant.** Le repass — les jetons du socle, puis R60 (tout compteur mène quelque part),
R61 (aucun état vide muet), R62 (le parcours découverte chronométré en clics) — est COMPLET et SERVI
EN PRODUCTION. SHA `4e0eafc`, mesuré directement sur `https://otto-dit.vercel.app/api/sante` à
04:05:12Z le 2026-09-13, moins de deux minutes après la fusion sur `main`.

**R59** (le comportement par défaut du rail) N'EST PAS dans ce que tu vas regarder : il reste
délibérément hors de ce repass, bloqué sur une tension avec ADR-103 que seul toi peux trancher
(détail dans `docs/BACKLOG_REPORTE.md`).

Chaque tranche a son détail plus bas (mesures engendrées, revues hostiles, SHA), à lire si tu veux
le pourquoi de chaque forme. Ce message-ci n'est que le signal que tu as demandé.

---

**Mandat actif** : `docs/MANDATS/2026-09-08_mandat_controle_interne.md` — un nouveau lot (§0 : le
contrôle interne D&I/OE, le suivi de mission), à exécuter après la clôture du Lot 4 en cours et
avant le Lot 5, prime sur la suite de l'ordre du plan d'autonomie. Ordre de construction : §7.
Amendement de cadence du même jour (règle 30 de CLAUDE.md, §1) : deux réfutateurs seulement quand
la tranche touche le modèle de données, la sécurité, le multi-tenant ou un code de refus.
`docs/MANDATS/2026-09-09_mandat_reponses_fondateur.md` — complète le mandat du 8 septembre (les
cinq réponses attendues). Ordre RÉVISÉ par le fondateur (message du 2026-09-09, après résolution
de l'incident 0153/0154) : finir le lot contrôle interne (§7.3 restant, puis §7.4) D'ABORD, puis
§1 (table d'échantillonnage sourcée), §2 (R30/MAT-01-03), §3 (vidéo, dépôt manuel). §5 amendé le
même jour : direction de design donnée (langage inspiré d'Optro.ai), R59-R62 rouverts — tout
écran neuf naît désormais dans ce langage, jeton de design à engendrer avant le prochain écran.
**§7.4, §2 en entier, §3.1 point 1 et §4/Lot 8 point 1 sont COMPLETS ET SERVIS EN PRODUCTION** —
`otto-dit.vercel.app` sert `fc5ceb1`, mesuré directement le 2026-09-10 (voir la correction R37 en
tête des tranches ci-dessous : les quatre avaient été annoncées « servies » sur le seul alias de
PRÉVISUALISATION de branche, jamais sur `main`, jusqu'à la fusion par avance rapide de ce jour).
§3.1 point 2 (dépôt automatique en fin de réunion) reste **hors périmètre**, derrière la même porte
que le Lot 8 (service externe, identifiants — les interdits permanents ne le permettent pas encore).
**§1 (table d'échantillonnage sourcée) est maintenant COMPLET ET SERVI EN PRODUCTION** —
`otto-dit.vercel.app` sert `49abf73`, mesuré directement le 2026-09-10 (`identiteCoherente:true`,
CTRL-07 comprise) : CTRL-07 est redessiné, indexé par POPULATION plutôt que par fréquence, à partir
de l'annexe sourcée (`docs/MANDATS/2026-09-10_annexe_echantillonnage.md`, règle 33, commitée
verbatim), avec deux voix hostiles indépendantes convergentes ayant trouvé et fait corriger trois
défauts réels avant fusion (détail dans la tranche ci-dessous). **§4 point 2 (l'estimation papier du
coût d'un walkthrough analysé) est COMPLET ET SERVI EN PRODUCTION** (`COST.md`, §1 quater —
≈ $0,03-0,04 par walkthrough, ≈ $0,24-0,26 par engagement, aucune clé demandée) — `otto-dit.vercel.app`
sert `8f69852`, mesuré directement le 2026-09-10 (`identiteCoherente:true`). **`PLAN_RLS` étapes 1-2
(rôle `otto_app`, grants, policies — testé en local uniquement, la seconde moitié de Lot 8) sont
maintenant COMPLÈTES ET SERVIES EN PRODUCTION** — `otto-dit.vercel.app` sert `fd33d20`, mesuré
directement le 2026-09-10 à 12:13:26Z (`identiteCoherente:true`). Le câblage de l'étape 1 était en
fait déjà fait depuis le 2026-09-03 (`c36076f`), jamais documenté comme tel avant cette tranche ;
R24/R26/R27 formellement levées (`docs/BACKLOG_REPORTE.md`). **§4 point 3** (le fondateur relève
le plafond de dépense) et l'étape 3 de `PLAN_RLS` (**interdite sans mandat écrit qui la nomme**)
restent hors de portée d'une session : geste du fondateur seul. Deux questions ouvertes laissées
au fondateur, aucune tranchée ici : (i) la contradiction du test négatif de l'étape 3 sur
`/api/sante` — déjà résolue par deux mécanismes existants, PLAN_RLS.md §0bis A.6 ; (ii) un écart
trouvé en vérifiant A.6 — `/api/sante` ne pose en réalité aucun locataire, contrairement à ce que
A.6 décrit, deux options nommées ni choisie. **Aucun autre travail de mandat n'est actuellement
débloqué** : R59-R62 (repasse design, mandat du 9 septembre §5) restaient du travail réel mais
gardé par le mandat lui-même à un déclenchement du fondateur — **DÉCLENCHÉ le 2026-09-10**
(`docs/MANDATS/2026-09-10_trois_reponses.md`, point 3, commité verbatim, règle 33) ; §7.5 du
mandat contrôle interne (l'agent qui pré-remplit) reste sous l'interdit permanent de l'IA vivante.

**Trois réponses du fondateur (2026-09-10)**, les trois traitées : (1) §4 point 3 accordé (plafond
de dépense levé, la garde DB en base reste la SEULE autorité d'activation, aucune clé demandée
encore — reste à construire l'adaptateur préparé/rejoué, non activé) ; (2) **l'écart A.6 de
/api/sante RÉSOLU ET SERVI EN PRODUCTION** — `otto-dit.vercel.app` sert `a6e0894`, mesuré
directement le 2026-09-10 (`identiteCoherente:true`, « locataire déclaré par la sonde » premier de
la liste) : la sonde déclare désormais son locataire, une lecture vide ÉCHOUE plutôt que de passer
(détail dans la tranche ci-dessous, deux voix hostiles, un défaut réel trouvé et corrigé) ; (3) le
repass design rétroactif R59-R62 déclenché — tranche 1 (les jetons du socle) **COMPLÈTE ET SERVIE
EN PRODUCTION** (`f91d79e`, mesuré le 2026-09-12) ; la migration des écrans en découle
automatiquement (un changement de jetons, pas une réécriture — voir la tranche). **R60 (D.6 point
4, « tout compteur mène quelque part ») COMPLET ET SERVI EN PRODUCTION** (`17017b4`, mesuré le
2026-09-12) — quatre culs-de-sac corrigés (dashboard, population, balances-aux, imports). **R61
(D.6 point 5, « aucun état vide muet ») COMPLET ET SERVI EN PRODUCTION** (`fbfa06b`, mesuré le
2026-09-12 à 23:10:15Z) — quinze sites corrigés. **R62 (D.6 point 6, « parcours découverte
chronométré ») COMPLET ET SERVI EN PRODUCTION** (`4e0eafc`, mesuré le 2026-09-13 à 04:05:12Z) — le
chemin manquant vers l'atelier construit, trois points de contrôle chronométrés, deux voix
hostiles indépendantes (registre multi-tenant touché) ayant trouvé et fait corriger quatre défauts
réels avant fusion. **LE REPASS DESIGN ENTIER (jetons + R60 + R61 + R62) EST DONC COMPLET ET SERVI
EN PRODUCTION.** R59 (comportement par défaut du rail) reste EXPLICITEMENT HORS DE CE REPASS,
bloqué sur une décision du fondateur distincte (ADR-103, `docs/BACKLOG_REPORTE.md`). **Le message
unique promis au fondateur** (sa consigne du 10 septembre, verbatim : « Tell him when that moment
is — that single message is the only thing you owe him until then ») **est envoyé avec cette
tranche.**

## SHA servi confirmé — tranche Capitaux fusionnée sur `main` (`58b4e64`) — LE LOT 5 EST COMPLET (2026-09-16)

Fusion rapide-avant (`git merge --ff-only`) de `claude/otto-session-resume-zimig9` dans `main`,
poussée. **SHA servi CONFIRMÉ, mesuré deux fois** : `mcp__Vercel__get_deployment` montre
`dpl_8mJHaGGt2XyQZuKVfgdN8AgGeUp7` (cible `production`) à l'état `READY`, commit
`58b4e64149af8f82102ef0935742482a077388d1` ; `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` rend `sha: "58b4e64149af8f82102ef0935742482a077388d1"`,
`identiteCoherente: true`, HTTP 200, verdict « toutes les lectures passent ». La tranche Capitaux
propres et impôt (recherche incluant la résolution de l'ambiguïté du nom composé du mandat — vérifié
directement dans le TB que INCOME_TAX ne porte aucun compte réel, donc hors du périmètre de ce
poste —, implémentation avec une auto-correction avant commit sur l'évaluation du risque [le pipeline
réel mesure `realite:moyen`, pas `faible` comme la sonde isolée l'avait d'abord montré], une revue
hostile sans défaut allant même plus loin que la recherche de la tranche elle-même, verify complet
avec trois occurrences consécutives de R58 avant un quatrième passage propre — clôture et archive
atteintes, 385 clics, 336 vues visuel) est donc EN LIGNE.

**Huitième et DERNIER poste du Lot 5 (ordre C.3 du mandat) livré.** Les huit postes nommés par
`docs/MANDATS/2026-09-14_mandat_lecons_notif01_et_lot5.md` point 3 — Trésorerie, Clients,
Immobilisations, Fournisseurs, Paie, Provisions, Stocks, Capitaux propres et impôt — sont désormais
tous ouverts complètement (leadsheet N/N-1, revue analytique, procédures commandées par le risque,
atelier de sa nature quand il existe — sinon le manque est déclaré, jamais simulé —, papier, écarts).
**Le Lot 5 est COMPLET.**

## SHA servi confirmé — tranche Stocks fusionnée sur `main` (`0ee73da`) (2026-09-16)

Fusion rapide-avant (`git merge --ff-only`) de `claude/otto-session-resume-zimig9` dans `main`,
poussée. **SHA servi CONFIRMÉ, mesuré deux fois** : `mcp__Vercel__get_deployment` montre
`dpl_5RHKrkzQzA2jgPTnwfyKcN3amyPf` (cible `production`) à l'état `READY`, commit
`0ee73da7b416b44cf0087ee3c1e37e4865ac37ad` ; `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` rend `sha: "0ee73da7b416b44cf0087ee3c1e37e4865ac37ad"`,
`identiteCoherente: true`, HTTP 200, verdict « toutes les lectures passent ». La tranche Stocks
(recherche, implémentation, une revue hostile sans défaut, verify complet avec deux incidents
documentés — un EXIT=143 d'infrastructure non expliqué, une contamination densite/clics résolue
par l'ordre canonique — clôture et archive atteintes, 386 clics, 336 vues visuel) est donc EN
LIGNE. Septième des huit postes du Lot 5 (ordre C.3) livré ; Capitaux propres et impôt reste,
dernier poste du plan.

## SHA servi confirmé — tranche Provisions fusionnée sur `main` (`95af49a`) (2026-09-15)

Fusion rapide-avant (`git merge --ff-only`) de `claude/otto-session-resume-zimig9` dans `main`,
poussée. **SHA servi CONFIRMÉ, mesuré deux fois** : `mcp__Vercel__get_deployment` montre
`dpl_5Gm346kDwDgjCULuiDti6awqPceG` (cible `production`) à l'état `READY`, commit
`95af49ad65c6c0c937a77ef3a2af5b4474655bb3` ; `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` rend `sha: "95af49ad65c6c0c937a77ef3a2af5b4474655bb3"`,
`identiteCoherente: true`, HTTP 200, verdict « toutes les lectures passent ». La tranche
Provisions (recherche, implémentation, deux revues hostiles — l'une trouvant le défaut sévère de
signe et le gap d'atelier R97-class, l'autre confirmant le correctif —, trois passages verify
dont un a corrigé une assertion Lot 3 périmée, `visuel` propre) est donc EN LIGNE. Sixième des
huit postes du Lot 5 (ordre C.3) livré ; Stocks (INVENTORY) et Capitaux propres et impôt restent.

## Lot 5, poste 8 (LE DERNIER) : Capitaux propres et impôt (EQUITY) ouverts — leadsheet, revue analytique, deux procédures commandées SANS AUCUN ATELIER, R100 disclosed (2026-09-16)

*Même mandat que Trésorerie/Clients/Immobilisations/Fournisseurs/Paie/Provisions/Stocks
ci-dessus, HUITIÈME ET DERNIER poste de l'ordre C.3 : Capitaux propres et impôt (EQUITY), après
Stocks. Le Lot 5 est complet avec ce poste.*

**Recherche, mesurée avant d'écrire — avec une correction en cours de route.** Une première
sonde isolée (montée à la main, comme `programme-vue.test.ts`) mesurait TOUTES les assertions
d'EQUITY `faible`. Rejouée à travers le VRAI `runPart1UpToWorkpaper()` (le pipeline complet de
démonstration, qui avance l'horloge et pose des écritures avant que ce poste ne soit évalué —
un effet qu'une fixture isolée ne reproduit pas), le résultat était DIFFÉRENT :
`realite:moyen` (1 facteur, `variation`), toutes les autres assertions `faible` — corrigé AVANT
tout commit, jamais laissé courir la première mesure. `fsliAccounts(eng, 'EQUITY')` porte TROIS
comptes (101000 « Capital social » -500 000,00 € ; 106100 « Réserve légale » -50 000,00 € ;
110000 « Report à nouveau » -1 094 000,00 € ; total -1 644 000,00 €).

Le mandat nomme ce poste « Capitaux propres et impôt » sans préciser de `fsli.code` (contrairement
aux sept précédents, chacun mappé 1:1). `impôt sur les bénéfices` (INCOME_TAX) a été vérifié
directement : AUCUN compte sur ce dossier (`fsliAccounts(eng,'INCOME_TAX')` rend `[]`) — rien à
leadsheet, rien à revoir analytiquement, un poste qui serait un pur décor si ouvert (règle 20).
« et impôt » se lit donc comme une description du CYCLE au sens large (capitaux propres et
impôts, un regroupement usuel en audit français), pas comme l'exigence d'ouvrir un second
`fsli.code` sans données. EQUITY seul reste le mapping cohérent avec le patron 1:1 des sept
postes précédents — même lecture qui a déjà dû s'appliquer pour Paie/Stocks (le mandat annonçait
`recalcul_parametre` pour chacun, jamais pleinement satisfait par les données réelles).

`methodology/procedures.json` portait TROIS procédures pour ce cycle sous `cycle:"CAPITAUX"`
(CAPITAUX-VAR, CAPITAUX-PV, CAPITAUX-CONV) — jamais consultées par `proceduresDuCycle`, même
correspondance cassée que TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL/PROV/STOCKS
(R54/R57/R95/R97/R98/R99). Les TROIS corrigées vers `cycle:"EQUITY"` (version 1.4.4).

**HUIT procédures commandées** (compté par exécution, `requiredProcedures('EQUITY').length`,
jamais recopié de tête — règle 31) : les quatre transverses au seuil `faible` (DETAIL/RA/RAPPRO/
SEQ), DEUX transverses débloquées PAR `realite:moyen` (FRAUDE, MANUEL — même paire que PAYROLL
avait débloquée par `realite:eleve`), et les DEUX procédures propres au poste : CAPITAUX-VAR
(`rapprochement`, `exhaustivite:faible`) et CAPITAUX-PV (`sondage_pieces`, `droits:faible`) —
4+2+2 = 8. CAPITAUX-CONV (`test_exhaustif`, `presentation:moyen`) reste SOUS son seuil
(`presentation` mesurée `faible`) — NON commandée, pas disclosed comme un gap.

**NI CAPITAUX-VAR NI CAPITAUX-PV N'A D'ATELIER — disclosed R100, un gap DOUBLE, jamais vu sur un
seul poste jusqu'ici.** `rapprochement` n'est câblé (`programme.ts`, lu en entier) que pour
CASH/TRADE_RECEIVABLES ; `sondage_pieces` n'est câblé que pour REVENUE. Aucune des deux natures
n'atteint EQUITY. `poste.ts` : AUCUN changement nécessaire, vérifié par exécution
(`vuePoste('EQUITY')` après `runPart1UpToWorkpaper()` complet) — le garde-fou générique posé pour
PAYROLL (R98) couvre déjà toute nature sans atelier réel, quel que soit le nombre de procédures
qui s'y heurtent en même temps.

**Implémentation.** `part1.ts` : `EQUITY` ajouté au périmètre de démonstration (skip-list de
`bootstrapNep()`, `MOTIF_DEMO` mis à jour pour neuf postes) ; nouvelle `planifierCapitaux()`
(même patron que `planifierTresorerie()`, qui plante déjà DEUX procédures — pas un précédent
inventé pour cette tranche), plantant CAPITAUX-VAR ET CAPITAUX-PV, chacune avec un papier
`utilisee:false` honnête. Correctif rule 31 en chaîne : le commentaire d'en-tête de
`bootstrapNep()` (déjà corrigé CINQ→HUIT à la tranche Stocks) étendu HUIT→NEUF avec cette
tranche, même discipline.

**Correctifs de test associés.** `catalogue.test.ts` : « CAPITAUX » déplacé de la liste des
cycles attendus PRÉSENTS vers celle des cycles CORRIGÉS (absents) ; seul « DETTES_FI » reste,
hors des huit postes nommés par le mandat. `enrichir.test.ts` : la fixture PROG-03 « poste hors
périmètre » utilisait `EQUITY` (choisie pendant la tranche Stocks, alors non ouvert) — devenue
FAUSSE une fois EQUITY câblé par cette tranche ; remplacée par `FINANCIAL_DEBT` (le seul
`fsli.code` du dossier qui reste hors périmètre ET hors des huit postes nommés — le Lot 5 étant
désormais complet, cette fixture n'a plus de raison structurelle de rechanger de poste).
`atelier-confirmation-lecture.test.ts` : inchangé, reste sur INVENTORY (EQUITY ne touche pas
`confirmation_externe`, la fixture reste valide sans modification).

**Mesures avant expédition.** Suite ciblée (catalogue, enrichir, atelier-confirmation-lecture,
programme-vue — 40/40) propres. `tsc --noEmit` propre.

**Revue hostile, UNE SEULE voix** (règle 30 : ni modèle de données, ni multi-tenant, ni code de
refus touchés par cette tranche). Verdict : SOUND — chaque affirmation reproduite
indépendamment, y compris un contrôle que la tranche elle-même n'avait pas fait (recherche
directe dans `dataset/tb_2025.csv` pour confirmer qu'AUCUN compte de classe 63/69 n'existe,
au-delà de la seule vérification `fsliAccounts('INCOME_TAX')`). La décision de scope EQUITY-seul
(« et impôt » lu comme description du cycle, pas comme second `fsli.code` à ouvrir) confirmée
correcte et défendue, pas juste acceptée. Aucun défaut trouvé.

**`npm run verify` complet, avec TROIS occurrences R58 consécutives avant un passage propre.**
Premier passage (`verify-capitaux.log`) : `le serveur est tombé... à « /eng/[id]/fs-tieout
(SOX) »` — HUITIÈME route distincte au total pour ce flake connu et disjoint (déjà vue pour
Fournisseurs). Isolé, confirmé PASSE (441,41 s), relancé. Deuxième passage
(`verify-capitaux-2.log`) : NEUVIÈME route (`/eng/[id]/processus`), isolé confirmé PASSE
(443,18 s), relancé. Troisième passage (`verify-capitaux-3.log`) : MÊME route que le premier
essai (`fs-tieout`), isolé confirmé PASSE (435,21 s), relancé une quatrième fois. **Quatrième
passage (`verify-capitaux-4.log`) : PROPRE au premier coup — 145/145 fichiers, 1139/1139 tests,
AUCUN R58 cette fois.** `gardes` à `densite` tous propres (0 dépassement, mesuré dans l'ordre
canonique du chaîne, pas isolé). `screens` (93 routes, 0 échec) et `fumee` (52 routes, 0 échec)
sur le build de PRODUCTION propres. Clôture et archive ATTEINTES (240 stations figées vérifiées,
archive scellée, empreinte SHA-256 affichée, téléchargement vérifié), 260 étapes conduites, 385
clics — SEUL incident : la QUATORZIÈME confirmation consécutive du flake `#418`
(`Minified React error`, `rcm/[cid]` SOX), disjoint du diff de cette tranche, journalisé F28
(`docs/CHASSE.md`, commit `5c6aab8` — qui corrige au passage une erreur de numérotation trouvée
avant de commiter, F29→F28, et le compte d'ordre DIXIÈME→QUATORZIÈME, règle 31). `npm run
visuel`, cassé par le `&&` derrière `clics`, relancé séparément : **336 vues, 0 défaut(s)**,
`EXIT=0` réel confirmé sur la ligne brute de la tâche de fond. `docs/CLICS.md`/`docs/DENSITE.md`
régénérés et commités sur le commit `d6defa0`, dans l'ordre canonique.

**Le Lot 5 est COMPLET.** Les huit postes nommés par le mandat (Trésorerie, Clients,
Immobilisations, Fournisseurs, Paie, Provisions, Stocks, Capitaux propres et impôt) sont tous
ouverts, chacun avec sa mesure par exécution, sa revue hostile, et son verify complet.

## Lot 5, poste 7 : Stocks (INVENTORY) ouverts — leadsheet, revue analytique, une procédure commandée SANS ATELIER, R99 disclosed (2026-09-15)

*Même mandat que Trésorerie/Clients/Immobilisations/Fournisseurs/Paie/Provisions ci-dessus,
septième poste de l'ordre C.3 : Stocks (INVENTORY), après Provisions.*

**Recherche, mesurée avant d'écrire.** `fsliAccounts`/`assessFsli`/`requiredProcedures` exécutés
contre le dossier NEP seedé (via un test vitest jetable, la sonde `tsx` directe s'étant montrée
trop lente pour être utile — abandonnée après 164 s sans résultat, remplacée par le patron
`initTestDb()` + import TB/FEC déjà éprouvé par `programme-vue.test.ts`) : INVENTORY (800 000,00 €,
deux comptes — 301000 « Stocks matières premières » 420 000,00 € et 355000 « Stocks produits
finis » 380 000,00 €) porte TOUTES ses assertions `faible` (0 facteur). `methodology/
procedures.json` v1.4.2 portait SIX procédures pour ce cycle sous `cycle:"STOCKS"` (STOCKS-INV,
VALO, COUT, NRV, CUTOFF, TIERS) — jamais consultées par `proceduresDuCycle`, même correspondance
cassée que TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL/PROV (R54/R57/R95/R97/R98). Les SIX corrigées vers
`cycle:"INVENTORY"` (version 1.4.3).

**CINQ procédures commandées** (compté par exécution, `requiredProcedures('INVENTORY').length`) :
les quatre transverses universelles (DETAIL/RAPPRO/RA/SEQ) et STOCKS-INV elle-même
(`realite:faible`) — 4+1 = 5. STOCKS-VALO/COUT/NRV/CUTOFF/TIERS (`risque_minimum:moyen`) restent
SOUS leur seuil sur ce dossier — NON commandées, pas disclosed comme un gap : le fonctionnement
normal du risque, pas une limite de l'atelier.

**STOCKS-INV N'A AUCUN ATELIER — disclosed R99, même situation que PAYROLL (R98).** Sa nature,
`observation_documentee` (assistance à l'inventaire physique), n'a JAMAIS eu de route dans
`atelierDeLaNature` — vérifié par lecture complète du fichier avant d'écrire. Contrairement à
`confirmation_externe` (CASH/TRADE_PAYABLES/PROVISIONS) ou `rapprochement` (CASH), qui portaient
déjà un écran avant que leur propre tranche les exerce sur un nouveau poste, aucun écran
d'assistance à l'inventaire physique n'existe nulle part dans ce dépôt. Construire cet écran
serait de la MÉCANIQUE NEUVE, pas la correction d'une correspondance déjà câblée ailleurs — hors
du périmètre d'une tranche d'ouverture de poste (règle 9). `poste.ts` : AUCUN changement
nécessaire, vérifié par exécution (`vuePoste('INVENTORY')` après `runPart1UpToWorkpaper()`
complet, pas par analogie) — le bloc `testing` rend `etat:'sans_objet'`, `href:null`, même
garde-fou générique posé pour PAYROLL (R98) qui couvre déjà toute nature sans atelier réel.

**Implémentation.** `part1.ts` : `INVENTORY` ajouté au périmètre de démonstration (skip-list de
`bootstrapNep()`, `MOTIF_DEMO` mis à jour pour huit postes) ; nouvelle `planifierStocks()`
(mirroir exact des six précédentes, plante STOCKS-INV avec un papier `utilisee:false` honnête).
**Correctif de rule 31 trouvé en même temps** : le commentaire d'en-tête de `bootstrapNep()`
affirmait encore « CINQ POSTES AU PÉRIMÈTRE » alors que PAYROLL puis PROVISIONS avaient déjà porté
le compte réel à sept — un chiffre en prose que rien ne produisait, jamais corrigé aux deux
tranches précédentes. Corrigé en « HUIT » en même temps que cette tranche l'étend, avec une note
explicite plutôt qu'un silence.

**Correctifs de test associés.** `catalogue.test.ts` : « STOCKS » déplacé de la liste des cycles
attendus PRÉSENTS vers celle des cycles CORRIGÉS (absents). `enrichir.test.ts` : la fixture PROG-03
« poste hors périmètre » utilisait `INVENTORY` (choisie pendant la tranche Paie, alors non ouvert)
— devenue FAUSSE une fois INVENTORY câblé par cette tranche ; remplacée par `EQUITY` (Capitaux
propres, poste 8, dernier poste du Lot 5, non encore ouvert), vérifié par lecture directe de
`fsli.scoping`/`scoping_basis` avant de choisir (`ns_confirmed`, même motif générique que les
autres postes hors périmètre du jeu, pas un jugement de significativité comme INTANGIBLES) — au
passage, une erreur d'attribution dans mon propre commentaire de remplacement (« la fixture avait
déjà porté TRADE_RECEIVABLES ») a été trouvée et corrigée par `git log -S` AVANT tout commit :
cette ligne précise n'a jamais porté que PAYROLL puis INVENTORY, la chaîne TRADE_RECEIVABLES
appartenant à une fixture SÉPARÉE (`atelier-confirmation-lecture.test.ts`). Ce dernier fichier :
son commentaire d'historique corrigé pour ne plus affirmer qu'INVENTORY est « un poste non encore
ouvert » (il l'est désormais) tout en gardant l'assertion valide (INVENTORY reste sans atelier
`confirmation_externe`, la seule chose que ce fichier teste).

**Mesures avant expédition.** Suite ciblée (catalogue, enrichir, atelier-confirmation-lecture,
programme-vue — 40/40) propres. `tsc --noEmit` propre.

**Revue hostile, UNE SEULE voix** (règle 30 : ni modèle de données, ni multi-tenant, ni code de
refus touchés par cette tranche). Verdict : les affirmations factuelles tiennent — chaque compte
(deux comptes INVENTORY, 800 000,00 €, cinq procédures commandées, aucun atelier pour
`observation_documentee`) reproduit indépendamment par exécution réelle du pipeline
`runPart1UpToWorkpaper()`, pas depuis une fixture reconstruite à la main. Aucun défaut trouvé.

**`npm run verify` complet, avec un incident d'infrastructure non expliqué et une contamination
méthodologique découverts et corrigés en cours de route.** Premier passage complet
(`verify-stocks.log`) : `tsc`/`vitest` (145/145, 1139/1139, zéro R58) et `gardes` à `densite`
tous propres (0 dépassement) — puis `clics` meurt net à `  build…`, `EXIT=143` réel, sans rapport
avec R58/#418. Isolé seul, MÊME défaut reproduit deux fois (avec et sans mon propre `timeout`),
alors qu'un `npm run build` mené HORS de `clics/run.ts` termine proprement en 57,85 s — cause
non identifiée, journalisée `docs/CHASSE.md` §6, pas creusée plus loin (règle 30). Une troisième
tentative a fini par tourner mais ROUGE (32 échecs, clôture non atteinte) : la base avait été
« déjà jouée » par un essai antérieur sans que je m'en rende compte — exactement le gotcha que
CLAUDE.md §6 nomme déjà. **Corrigé par la discipline canonique** : `db:reset && demo:seed` frais
avant `clics`. **Second défaut, plus subtil** : mesurer `densite` APRÈS ce `clics` propre (au lieu
de l'ordre canonique de `npm run verify`) rapportait un FAUX dépassement sur `/eng/[id]/testing` —
contamination par l'état RÉEL que `clics` avait laissé dans le dossier, pas un défaut de code.
Reproduit et corrigé par exécution : `densite` SEUL sur base fraîche → 0 dépassement (identique
au tout premier passage) ; `clics` ensuite sur cette même base fraîche → **propre, clôture et
archive atteintes, 260 étapes, 386 clics**, `#418` observé TROIS fois cette fois (dont, pour la
première fois, hors de `rcm/[cid]` — toujours cohérent avec l'hypothèse H, disjoint du diff de
cette tranche). `visuel` : **336 vues, 0 défaut**. Les deux incidents sont journalisés en détail
dans `docs/CHASSE.md` §6.

## SHA servi confirmé — tranche Fournisseurs poste-opening fusionnée sur `main` (`a8c2603`) (2026-09-15)

Fusion rapide-avant (`git merge --ff-only`) de `claude/otto-session-resume-zimig9` dans `main`,
poussée. **SHA servi CONFIRMÉ, mesuré deux fois** : `mcp__Vercel__list_deployments` montre
`dpl_GmGtjZCU8GeSqJENNbYdbYKw8SjL` (cible `production`) à l'état `READY`, commit
`a8c2603d10973b31dedbc3a693143d0e81d41b74` ; `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` rend `sha: "a8c2603d10973b31dedbc3a693143d0e81d41b74"`,
`identiteCoherente: true`, HTTP 200, verdict « toutes les lectures passent ». La tranche
Fournisseurs poste-opening (recherche, implémentation, deux revues hostiles, correctif d'urgence
migration 0165, chaîne verify équivalente gardes→visuel) est donc EN LIGNE.

## SHA servi confirmé — tranche Paie fusionnée sur `main` (`eaaf647`) (2026-09-15)

Fusion rapide-avant de `claude/otto-session-resume-zimig9` dans `main`, poussée. **SHA servi
CONFIRMÉ, mesuré deux fois** : `mcp__Vercel__list_deployments` montre `dpl_4qpAaDh2Yz2qx1nhLP42vyB7uB98`
(cible `production`) à l'état `READY`, commit `eaaf6477fe246be887c2b1178f76b21959d94c11` ;
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` rend
`sha: "eaaf6477fe246be887c2b1178f76b21959d94c11"`, `identiteCoherente: true`, HTTP 200, verdict
« toutes les lectures passent ». La tranche Paie (recherche, `planifierPaie()`, correctif
`poste.ts`, correctif `langue:epreuve`, correctif densité `/loop`, un seul `npm run verify`
propre modulo `#418`) est donc EN LIGNE.

## Lot 5, poste 6 : Provisions (PROVISIONS) ouvertes — leadsheet, revue analytique, une procédure commandée AVEC UN ATELIER RÉEL (2026-09-15)

*Même mandat que Trésorerie/Clients/Immobilisations/Fournisseurs/Paie ci-dessous, sixième et
dernier poste de l'ordre C.3 : Provisions (PROVISIONS), après Paie.*

**Recherche, mesurée avant d'écrire.** `fsliAccounts`/`assessFsli`/`requiredProcedures` exécutés
contre le dossier NEP seedé : PROVISIONS (-60 000,00 €, UN SEUL compte — 151000 « Provisions
pour risques ») porte TOUTES ses assertions `faible` (0 facteur). Un seul tiers
(`dataset/circularisations/avocats.csv`, Cabinet Vialar & Associés, déjà préparé depuis ADR-111
mais jamais consommé par aucun flux) sur ce compte — donc AUCUN risque R96 (le rapprochement
collectif compare un tiers au compte ENTIER ; sans objet quand un seul tiers EST le compte).
`methodology/procedures.json` v1.4.1 portait TROIS procédures pour ce cycle sous
`cycle:"PROV"` (PROV-LITIGES, PROV-RECALC) et `cycle:"PERSONNEL"` (PERSONNEL-CP, laissée
délibérément non corrigée par la tranche Paie — une provision de BILAN, compte 15x, pas une
charge PAYROLL/compte 64x) — jamais consultées par `proceduresDuCycle`, même correspondance
cassée que TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL (R54/R57/R95/R97/R98). Les TROIS corrigées vers
`cycle:"PROVISIONS"` (version 1.4.2) : PERSONNEL-CP trouve ENFIN sa vraie correspondance.

**CINQ procédures commandées** (compté par exécution, `requiredProcedures('PROVISIONS').length`
— la leçon de la tranche précédente appliquée dès l'écriture, pas après une revue hostile) : les
quatre transverses universelles (DETAIL/RAPPRO/RA/SEQ) et PROV-LITIGES elle-même
(`exhaustivite:faible`) — 4+1 = 5. PROV-RECALC et PERSONNEL-CP (`evaluation:moyen`) restent SOUS
leur `risque_minimum` sur ce dossier — NON commandées, pas disclosed comme un gap (rien à
disclosed : c'est le fonctionnement normal du risque, pas une limite de l'atelier).

**PROV-LITIGES A UN ATELIER RÉEL** — le PREMIER poste du Lot 5 dont l'ouverture branche une
procédure `confirmation_externe` sur un écran réel dès le premier jet (CASH et TRADE_PAYABLES
l'avaient déjà, mais pas dès leur toute première tranche). « Revue des litiges et confirmation
des conseils juridiques » EST la Nature `avocat` que `circularisations.ts` porte depuis ADR-111
(`POSTE.avocat === 'PROVISIONS'`, jamais changé, JAMAIS exercée par un poste réellement ouvert
avant celui-ci — la revue hostile de la tranche Fournisseurs avait déjà noté qu'avocat n'avait
aucune couverture de test dans tout le dépôt). `programme.ts` route désormais
`confirmation_externe`+PROVISIONS vers le MÊME `/circularisations` que CASH/TRADE_PAYABLES.
`poste.ts` : AUCUN changement nécessaire, vérifié par exécution (`vuePoste('PROVISIONS')`) —
`natureCirculariseeDuPoste('PROVISIONS')` retourne déjà `'avocat'` par la même table `POSTE`
inversée que TRADE_PAYABLES a déjà généralisée. `/api/sante` : `POSTES_CABLES` (lecture
confirmation_externe) étend à `['CASH', 'TRADE_PAYABLES', 'PROVISIONS']`.
`methodology/papier.json` : `"PROVISIONS": "H"` ajouté.

**CORRECTIF, TROUVÉ PAR UNE REVUE HOSTILE, PAS PAR MOI-MÊME CETTE FOIS : l'affirmation
« AUCUN gap d'atelier » ci-dessus était FAUSSE.** Le bloc `testing` de `vuePoste('PROVISIONS')`
affiche `href: null` — la branche `circ` de `blocTesting` (`poste.ts`) appelle EN DUR
`atelierDeLaNature('rapprochement', code, base)`, quelle que soit la nature RÉELLEMENT commandée ;
`rapprochement` n'est câblé pour aucun poste au-delà de CASH/TRADE_RECEIVABLES. **Même gap que
R97** (TRADE_PAYABLES porte le même `href: null` sur son propre bloc `testing`, pour la même
raison mécanique) — R97 amendé pour couvrir PROVISIONS et nommer la cause précise (un appel en
dur à `'rapprochement'`, pas « aucun atelier pour la nature commandée » en général). **Un SECOND
défaut, plus sévère, trouvé par la même revue** (voir le paragraphe R96/signe ci-dessous) a rendu
cette tranche du diff sujette à DEUX réfutateurs indépendants a posteriori, plutôt qu'un seul —
règle 30 appliquée après coup, pas avant, parce que le premier cadrage (« pas de code de refus,
pas de modèle de données ») était correct pour le DIFF d'origine mais pas pour ce que ce diff
rendait RÉELLEMENT exploitable (même leçon que la revue hostile Fournisseurs sur R96).

**DÉFAUT SÉVÈRE trouvé par la même revue hostile, CONFIRMÉ PAR EXÉCUTION à travers
`deposerReponse()` : le rapprochement `avocat` DOUBLAIT l'écart au lieu de le mesurer.**
`rapprochement()` comparait `provisions` (toujours saisi POSITIF par l'auditeur — « la provision
déclarée est de 60 000 € ») directement au `solde` SIGNÉ du grand livre — négatif pour PROVISIONS
(poste créditeur, mesuré à -60 000,00 €). Une provision EXACTEMENT correcte produisait donc
`ecart = 60 000 - (-60 000) = 120 000` : un écart FABRIQUÉ, doublé, sur une confirmation parfaite
— reproduit par exécution à travers le même chemin qu'un clic réel emprunterait, jamais couvert
par aucun test avant cette revue (`grep -rn avocat` sur tous les `*.test.ts` du dépôt ne
retournait rien de significatif). **Corrigé** (`circularisations.ts`, commentaire « LE SENS DU
SOLDE ») : le solde est retourné avant comparaison pour tout poste créditeur (`avocat`,
`fournisseur` — ce dernier reste bloqué par R96, donc invérifiable par exécution, mais corrigé
en prévision du jour où R96 sera résolu). **DEUX nouveaux tests** (`circularisations.test.ts`) :
une provision exacte ne produit plus d'écart fabriqué (`ecartCents: 0`), et un vrai écart reste
mesuré (pas silencieusement annulé par le correctif). Rule 17 respectée : chaque test confirmé
en échec (`120000`/`0` attendus, `12000000`/`500000` obtenus) contre le code non corrigé, avant
restauration du correctif. `docs/BACKLOG_REPORTE.md` (R96, amendement) et `fils.json` mis à jour
— le chiffre `459 134,58 €` déjà cité pour R96 datait d'AVANT ce correctif et additionnait les
deux défauts sans les distinguer ; recalculé à la main (fournisseur reste invérifiable par
exécution) : -72 129,92 €, toujours faux pour la seule raison R96, sans le doublage de signe.

**Implémentation.** `part1.ts` : `PROVISIONS` ajouté au périmètre de démonstration (skip-list de
`bootstrapNep()`, `MOTIF_DEMO` mis à jour pour six postes) ; nouvelle `planifierProvisions()`
(mirroir exact des cinq précédentes). Vérifié par lecture directe (règle 10) : `enrichir.ts` ne
mentionne `PROVISIONS` NULLE PART — aucun marqueur D9 supplémentaire nécessaire.

**Correctifs de test associés.** `catalogue.test.ts` : le test « couvre les cycles du dossier »
documente le retrait de `PROV` et `PERSONNEL` (plus aucune procédure ne les porte) — trois
cycles retirés au total ce jour comptés (SOCIAL depuis Paie, PROV et PERSONNEL depuis cette
tranche). `atelier-confirmation-lecture.test.ts` : la fixture « poste sans atelier, hors CASH/
TRADE_PAYABLES » utilisait PROVISIONS — devenu FAUX une fois PROVISIONS câblé par cette tranche ;
remplacée par `INVENTORY` (poste STOCKS, non encore ouvert par le Lot 5, vérifié par lecture
directe de `programme.ts` avant de choisir).

**Une erreur trouvée et corrigée PAR MOI-MÊME avant tout commit** (pas par une revue hostile
cette fois — la leçon de la tranche Paie appliquée directement) : le premier jet du commentaire
de `planifierProvisions()` annonçait « SIX procédures sont commandées » puis écrivait « 4+1 = 5 »
dans la MÊME phrase — une contradiction interne repérée en relisant mon propre texte contre le
résultat mesuré, corrigée en « CINQ » avant tout commit.

**Mesures avant expédition.** Suite ciblée (catalogue, poste, enrichir, atelier-confirmation-
lecture — 36/36) propres. `tsc --noEmit` propre.

**SECONDE revue hostile, INDÉPENDANTE, sur le correctif de signe lui-même** (règle 30 : requise
après coup une fois le défaut trouvé par la première voix, même précédent que Fournisseurs/R96-
live-in-UI). Verdict : correctif CORRECT et COMPLET pour toute valeur de `kind`/`Nature`
existant réellement dans ce dépôt aujourd'hui (`'banque' | 'avocat' | 'fournisseur'` — vérifié en
lisant le type lui-même, `git log --all` sur ce fichier, ET la contrainte CHECK SQL de
`confirmation_campaign.kind` en base, migration 0165 — trois vérifications indépendantes,
aucune ne trouve de quatrième valeur type `'client'`). Convention de signe (`fsliAccounts()`,
débit moins crédit) reconfirmée contre les VRAIES données du TB semé (151000 : -60 000,00 € ;
401000 : -265 632,25 €, les deux exactement comme annoncé). Suite `circularisations.test.ts`
rejouée par ce second réfuteur lui-même — 12/12, pas seulement rapportée. Deux points signalés
comme informatifs, non bloquants : (1) le correctif code en dur `kind === 'banque'` comme seule
exception plutôt que dériver le sens du solde d'une table — un piège de maintenabilité latent si
une future nature débitrice non nommée `'banque'` apparaît, sans effet sur le comportement
actuel ; (2) rien n'empêche aujourd'hui la saisie d'une magnitude négative côté formulaire — le
correctif REPOSE sur cette convention sans la GARDER. Aucun des deux n'a été jugé bloquant pour
cette tranche ; consignés ici pour une session future, pas dans BACKLOG_REPORTE.md (pas une dette
identifiée, une observation de robustesse).

**`npm run verify` complet, trois passages sur l'arbre gelé successivement corrigé.** Premier
passage (`verify-provisions.log`, commit `d4cd834`) a trouvé un VRAI défaut, sans rapport avec
R58/#418 : `programme-vue.test.ts` portait encore une assertion du Lot 3
(`atelierDeLaNature('confirmation_externe','PROVISIONS',...) === null`), avec son propre
commentaire d'origine prévoyant « entre au Lot 5 avec le poste lui-même » — jamais mise à jour
quand le commit `8207058` a effectivement câblé PROVISIONS. Corrigé (`7bacd5c`) : l'assertion
reflète maintenant `/eng/x/circularisations`, 12/12 sur ce fichier. Deuxième passage
(`verify-provisions-2.log`, commit `7bacd5c`) a trouvé la SEPTIÈME occurrence du flake connu R58
(`ServeurTombe`, `tests/screens.test.ts`, une septième route distincte — `/eng/[id]/requests` —
jamais liée au diff ; isolé et reconfirmé PASSE, 425,29 s ; journalisé dans `docs/CHASSE.md`,
commit `4ec8617`). Troisième passage (`verify-provisions-3.log`, commit `4ec8617`) : **propre —
145/145 fichiers, 1139/1139 tests, AUCUN R58 cette fois** ; `gardes` à `densite` tous propres ;
clôture et archive ATTEINTES (240 stations figées, 260 étapes, 387 clics) ; SEUL incident : la
DOUZIÈME confirmation consécutive du flake `#418` (`Minified React error`, `rcm/[cid]` SOX),
disjoint du diff de cette tranche, journalisé F27 (`docs/CHASSE.md`, commit `db30e8e`). `npm run
visuel`, cassé par le `&&` derrière `clics`, relancé séparément : **336 vues, 0 défaut(s)**,
`EXIT=0` réel confirmé sur la ligne brute de la tâche de fond. `docs/CLICS.md`/`docs/DENSITE.md`
régénérés et commités avec leurs vrais chiffres (388→387 clics, 52→58 items `/programme`, 6→7
`/loop` — reflètent le contenu de cette tranche, pas un défaut ; 0 dépassement de densité
toujours confirmé).

## Lot 5, poste 5 : Paie (PAYROLL) ouverte — leadsheet, revue analytique, une procédure commandée SANS ATELIER, R98 disclosed, défaut mécanique corrigé (2026-09-15)

*Même mandat que Trésorerie/Clients/Immobilisations/Fournisseurs ci-dessous, cinquième poste de
l'ordre C.3 : Paie (PAYROLL), après Fournisseurs.*

**Recherche, mesurée avant d'écrire.** `fsliAccounts`/`assessFsli`/`requiredProcedures` exécutés
contre le dossier NEP seedé : PAYROLL (2 601 608,10 €, deux comptes — 641000 Rémunérations du
personnel, 645000 Charges de sécurité sociale, `pcg.ts`) porte `realite:eleve` (2 facteurs —
variation N/N-1 de 230 040 € contre un seuil de 27 000 €, et 100 % d'écritures d'OD manuelles),
toutes les autres assertions restent `faible`. `methodology/procedures.json` v1.4.0 portait DEUX
procédures pour ce cycle sous `cycle:"PERSONNEL"` et `cycle:"SOCIAL"` — jamais consultées par
`proceduresDuCycle`, qui filtre sur le VRAI code FSLI (même correspondance cassée que TRESO/
CLIENTS/IMMO_COR/FOURN, R54/R57/R95/R97). Corrigées vers `cycle:"PAYROLL"` (PERSONNEL-DSN,
SOCIAL-COTIS ; version 1.4.1) — **PERSONNEL-CP (provision pour congés payés) reste DÉLIBÉRÉMENT
NON corrigée** : son objet réel est une provision de BILAN (compte 15x), pas une charge PAYROLL
(compte 64x) — elle attend le poste Provisions (Lot 5, poste 6, pas encore ouvert) ; la corriger
vers PAYROLL aurait été une correspondance FAUSSE, pas une correction manquante (règle 8).
`methodology/papier.json` : `"PAYROLL": "G"` ajouté à `lettres_par_poste`.

**Une fois la correspondance corrigée, HUIT procédures sont commandées** (compté par exécution,
`requiredProcedures('PAYROLL').length`, jamais recopié de tête — une revue hostile a trouvé « SEPT »
faux dans un premier jet de cette même section, corrigé ici avant expédition, règle 31) : les
quatre transverses universelles (DETAIL/RAPPRO/RA/SEQ, `risque_minimum:faible`), trois commandées
par `realite:eleve` (ENTRETIEN, FRAUDE, MANUEL), et PERSONNEL-DSN elle-même (`exhaustivite:faible`)
— 4+3+1 = 8. **AUCUNE n'a d'atelier réel** — le poste le plus dépourvu de tout le Lot 5 jusqu'ici :
`rapprochement` n'est câblé que pour CASH/TRADE_RECEIVABLES (aucun concept de « balance âgée »
pour la paie), `sondage_pieces` n'est câblé que pour REVENUE, et `observation_documentee`/
`test_exhaustif` NE SONT CÂBLÉS NULLE PART pour AUCUN poste, encore — vérifié par lecture complète
d'`atelierDeLaNature`. Disclosed **R98** (`docs/BACKLOG_REPORTE.md`) plutôt que planifiées sans
écran atteignable : sept des huit non planifiées. **PERSONNEL-DSN seule est plantée**
(`planifierPaie()`, procédure + papier
`utilisee:false` honnête, même limite que CLIENTS-DEPREC/IMMO_COR-DOT/FOURN-CIRC), pour que
l'obstacle « périmètre sans programme » (`obstacles.ts`) trouve une ligne `procedure_instance` —
ce prédicat ne demande qu'une ligne, jamais un atelier cliquable, vérifié par lecture directe de
sa requête SQL avant de choisir cette forme minimale.

**Implémentation.** `part1.ts` : `PAYROLL` ajouté au périmètre de démonstration (skip-list de
`bootstrapNep()`, `MOTIF_DEMO` mis à jour pour cinq postes) ; nouvelle `planifierPaie()` (mirroir
exact de `planifierFournisseurs()`). Vérifié par lecture directe (règle 10, comme pour
TRADE_RECEIVABLES/PPE) : `enrichir.ts` ne mentionne `PAYROLL` NULLE PART — aucun marqueur D9
supplémentaire nécessaire, même famille que REVENUE/CASH/PPE.

**UN DÉFAUT MÉCANIQUE RÉEL trouvé en conduisant `vuePoste('PAYROLL')` avant d'annoncer l'écran
(règle 10), corrigé avant tout commit.** Le bloc `testing` de `poste.ts` retombait sur
`href: /testing` (l'écran du CHIFFRE D'AFFAIRES) pour PAYROLL, faute d'atelier
`recalcul_parametre`. Le troisième patron de `poste.ts` (R94) portait déjà ce garde-fou sur le bloc
`echantillon` (H2, Immobilisations, 2026-09-15) mais PAS sur `testing` — jamais corrigé là parce
qu'aucun poste ouvert avant PAYROLL n'était jamais tombé dans cette branche (`patronRecalculSeul`
toujours vrai pour REVENUE/CASH/TRADE_RECEIVABLES/PPE/TRADE_PAYABLES). Corrigé en étendant le MÊME
garde-fou (`patronSansEchantillon && code !== 'REVENUE'` → `etat:'sans_objet'`, `href:null`) au
bloc `testing`, vérifié SANS régression par exécution directe des SIX postes (PAYROLL, REVENUE,
CASH, TRADE_RECEIVABLES, PPE, TRADE_PAYABLES comparés un par un, avant et après le correctif).

**Correctifs de test associés.** `catalogue.test.ts` : le test « couvre les cycles du dossier »
documente désormais le retrait de `SOCIAL` (plus aucune procédure ne le porte) et la persistance
DÉLIBÉRÉE de `PERSONNEL` (PERSONNEL-CP, pour Provisions). `enrichir.test.ts` : la fixture PROG-03
(« hors périmètre ») utilisait `PAYROLL` comme exemple de poste hors scope — devenu FAUX une fois
PAYROLL scopé in_scope par cette tranche ; remplacée par `INVENTORY` (STOCKS, poste non encore
ouvert, vérifié par lecture directe du motif de scoping avant de choisir).

**Aucune modification d'`/api/sante` requise** : les trois lectures `POSTES_CABLES` existantes
(recalcul_parametre, confirmation_externe, rapprochement) restent correctes sans PAYROLL — l'ajouter
aurait AFFIRMÉ à tort qu'un atelier existe, exactement l'inverse de ce que R98 dit. La lecture D.6
point 3 (sections vides repliées par défaut) reste générique par construction, vérifiée sans
changement.

**Mesures avant expédition.** Suite ciblée (catalogue, poste, enrichir — 31/31, incluant le test
PROG-03 corrigé) et une suite plus large (risk, programme, analytique, api/sante — 28 fichiers,
131/131) propres. `tsc --noEmit` propre.

**UN RELECTEUR HOSTILE INDÉPENDANT** (règle 30 : ni migration, ni multi-tenant, ni code de refus
dans cette tranche — vérifié dans le diff par le relecteur lui-même, un seul suffit, même précédent
que Trésorerie/Clients/Immobilisations). Dix points vérifiés PAR EXÉCUTION (pas par lecture seule) :
la correspondance PERSONNEL-CP/PROVISIONS relue contre `pcg.ts` (juste) ; le correctif `poste.ts`
reproduit par un cas connu mauvais injecté puis retiré (règle 17 — la régression réapparaît
exactement comme décrit quand le garde-fou est retiré) ; les six postes comparés sans régression ;
`planifierPaie()` rejoué deux fois de suite, idempotent ; les deux fixtures de test relues par la
même discipline (retirer le correctif, confirmer que le test échoue comme attendu, restaurer) ;
aucun migration/tenant/refus touché confirmé depuis le diff ; le solde et les comptes PAYROLL
confirmés identiques à la base seedée. **UN CONSTAT RÉEL, non bloquant, corrigé avant expédition** :
le compte « SEPT procédures commandées » était FAUX — `requiredProcedures('PAYROLL').length` vaut
HUIT (4 transverses + 3 par `realite:eleve` + PERSONNEL-DSN), répété tel quel dans le commentaire
de `part1.ts`, dans `STATUS.md`, et dans les deux entrées R98 (`BACKLOG_REPORTE.md`,
`fils.json`) — un chiffre en prose que le script n'avait pas produit (règle 31), sans effet sur le
comportement runtime. Corrigé aux quatre endroits (commit `bbceec9`), jamais dans le message du
commit déjà poussé (`692dcf7`, non réécrit). Un second point signalé, informatif et non nouveau :
aucun test automatisé ne fixe les états `blocs` de `vuePoste` pour un poste donné — déjà le cas
avant cette tranche (H2/Immobilisations avait le même trou), pas aggravé ici.

**Mesures finales, engendrées — UN SEUL `npm run verify` complet, propre à l'exception du flake
`#418` déjà tracké (F26, `docs/CHASSE.md`).** Trois tentatives : la première a trouvé un vrai
échec dans `langue:epreuve` (le point d'injection du cas « ternaire dans un service » avait bougé
dans `poste.ts` — corrigé, réindenté, 15/15 revérifié) ; la deuxième a trouvé un vrai dépassement
dans `densite` (`/eng/[id]/loop` à 6 actions primaires, le sélecteur de poste jamais marqué
`data-actions-item` — corrigé, revérifié sur un build frais séparé : 0 dépassement) ; la
troisième est PROPRE de bout en bout : `tsc --noEmit` propre, **`vitest run` : 145/145 fichiers,
1137/1137 tests, AUCUN `ServeurTombe`/R58** (contrairement aux six tentatives de la tranche
précédente), `gardes`/`semeur`/`plancher`/`langue`/`langue:epreuve`/`lectures`/`lectures:epreuve`/
`parcours`/`parcours:epreuve` tous propres, `screens` (93 routes, 0 échec), `fumee` (52 routes,
0 échec), `densite` (0 dépassement, confirmé DANS la même chaîne). `npm run clics` : **260 étapes
conduites, ZÉRO échec de station nommée, clôture ET archive atteintes** (le seul « 1 échec(s) »
compté par le harnais est `#418`, F26 — ONZIÈME confirmation consécutive de sa disjonction, sur
un CINQUIÈME poste distinct). `npm run visuel` (lancé séparément — `clics` sort en échec sur ce
seul `#418`, même précédent que F14/Trésorerie/Clients/Immobilisations/Fournisseurs) : **336
vues, 0 défaut.**

*Même mandat que Trésorerie/Clients/Immobilisations ci-dessous, quatrième poste de l'ordre C.3,
après la mécanique circularisation fournisseur (section suivante ci-dessous).*

**Recherche, mesurée avant d'écrire.** `assessFsli`/`requiredProcedures` exécutés contre le
dossier NEP seedé : TRADE_PAYABLES (265 632,25 €, UN SEUL compte collectif `401000`,
`fsliAccounts` vérifié par exécution) porte `exhaustivite:moyen` (1 facteur, « plus de 200
écritures ») et `realite:moyen` (1 facteur, variation N/N-1 de 45 297 € contre un seuil de
27 000 €). Trois procédures du cycle commandées — FOURN-CIRC (`confirmation_externe`), FOURN-FNP
et FOURN-SUL (`sondage_pieces`) — mais SEULE FOURN-CIRC a un atelier atteignable. FOURN-CUTOFF-REC
reste sous son `risque_minimum`, non commandée.

**Implémentation.** `part1.ts` : `TRADE_PAYABLES` ajouté au périmètre de démonstration (skip-list
de `bootstrapNep()`, `MOTIF_DEMO` mis à jour) ; nouvelle `planifierFournisseurs()` (questionnaire,
risque, UNE SEULE procédure planifiée — FOURN-CIRC —, papier `utilisee:false` honnête, revue
analytique), mirroir exact de `planifierClients()`/`planifierImmobilisations()`. `programme.ts` :
`atelierDeLaNature` route `confirmation_externe`+TRADE_PAYABLES vers le même `/circularisations`
que CASH. `circularisations/page.tsx` : `NATURES` gagne l'entrée `fournisseur`, les deux
discriminants binaires `kind === 'banque'`/`s.cle === 'banque'` rekeyés en `kind !== 'avocat'`/
`s.cle !== 'avocat'` (même refactor que `circularisations.ts` dans la mécanique). `catalogue.ts` :
trois nouvelles clés i18n. `api/sante/route.ts` : la lecture « atelier confirmation_externe
disponible » étend `POSTES_CABLES` à `CASH`/`TRADE_PAYABLES` (même correctif déjà appliqué à sa
jumelle `rapprochement` pour CASH/TRADE_RECEIVABLES) — sans lui, une vraie régression sur l'atelier
TRADE_PAYABLES serait tombée silencieusement dans le gap « attendu R56 ».

**R96 (revue hostile de la mécanique, plus tôt ce jour) est une condition BLOQUANTE que cette
tranche respecte PAR OMISSION** : `planifierFournisseurs()` plante FOURN-CIRC (procédure, papier)
mais AUCUNE campagne de circularisation déposée — déposer une réponse afficherait un écart FAUX
(comparaison au solde entier du compte collectif). `poste.ts` : AUCUN changement nécessaire,
vérifié par exécution (`vuePoste('TRADE_PAYABLES')`), déjà générique via
`natureCirculariseeDuPoste`.

**UN DÉFAUT MÉCANIQUE RÉEL trouvé en conduisant `planifierFournisseurs()` avant d'annoncer l'écran
(règle 10), corrigé avant tout commit.** `prefixeDuPoste()` (`programme.ts`) dérivait le CODE
INTERNE d'un papier (la clé unique en base) par les trois premières lettres du `fsli_code` — « TRA »
pour TRADE_PAYABLES ET TRADE_RECEIVABLES, jamais consulté `lettres_par_poste` (`papier.json`), déjà
utilisé par `referencePapier()` pour le champ `reference`. Reproduit par exécution (`duplicate key
value violates unique constraint "workpaper_engagement_id_code_version_key"`). Corrigé en
réutilisant `lettres_par_poste` — les papiers déjà créés (CAS-01, PPE-01, TRA-01/02) gardent leur
code d'origine, TRADE_PAYABLES reçoit « D-01 ». Le test existant
(`atelier-confirmation-lecture.test.ts`) utilisait TRADE_PAYABLES comme fixture « poste sans
atelier » : remplacé par PROVISIONS (toujours sans atelier câblé aujourd'hui, vérifié par lecture
directe). Les deux défauts (R97 disclosed, `prefixeDuPoste`) sont enregistrés ensemble dans
`docs/BACKLOG_REPORTE.md`/`docs/instantanes/fils.json`.

**UN RELECTEUR HOSTILE INDÉPENDANT** (règle 30 : au départ jugée comme ni migration, ni
multi-tenant, ni code de refus neuf — même cadrage que Trésorerie/Clients/Immobilisations), **A
TROUVÉ UN CONSTAT SÉVÈRE, VÉRIFIÉ PAR EXÉCUTION, QUI A CHANGÉ CE CADRAGE.** Le cadrage de la
tranche (« juste du routage, du scoping, une fonction de seed ») sous-estimait ce que le diff
changeait réellement : en ajoutant l'entrée `fournisseur` à `NATURES` et en rekeyant les deux
discriminants `kind === 'banque'` en `kind !== 'avocat'` dans `circularisations/page.tsx`, la
tranche rendait le formulaire de DÉPÔT DE RÉPONSE (`deposerAction`) pleinement fonctionnel pour
fournisseur — exactement comme pour banque. Reproduit par exécution, à travers les MÊMES
fonctions de service que les actions serveur de l'écran appellent : `importerListing` + `envoyer`
+ `deposerReponse(montant EXACT de Float Glass, 193 502,33 €)` produit `ecartCents=459134.58`,
`remonte:true` — un écart FABRIQUÉ sur une confirmation parfaite et complète, atteignable en
trois clics depuis l'écran que `vuePoste('TRADE_PAYABLES')` pointe lui-même comme prochaine étape.
R96 parlait de ne pas SEMER une réponse déposée ; l'affirmation initiale (« R96 est respecté PAR
OMISSION ») était vraie pour le seed et trompeuse pour l'écran livré dans le même diff.

**Corrigé À LA SOURCE** (service, pas seulement l'écran — règle 13 : un formulaire que le
navigateur refuse d'envoyer n'est pas une garde tant que le service, lui, l'accepterait encore) :
`deposerReponse()` (`circularisations.ts`) refuse désormais explicitement `kind === 'fournisseur'`,
message nommant R96 et le compte collectif. `importerListing`/`envoyer` restent possibles (aucun
des deux ne compare quoi que ce soit au compte collectif). `circularisations/page.tsx` : le
formulaire de dépôt est remplacé par un aveu honnête (`circ.depositNotYetAvailable`) pour cette
nature plutôt que de laisser un clic produire un refus surprenant.

**CE CORRECTIF TOUCHE DÉSORMAIS DU CODE DE REFUS NEUF — DEUX RÉFUTATEURS INDÉPENDANTS requis
(règle 30), pas un seul.** Le premier a trouvé le défaut ci-dessus ; un SECOND réfutateur
indépendant a vérifié le correctif par exécution (pas par lecture seule) : le refus se déclenche
AVANT toute écriture en base (`received_at`/`montant_confirme` restent NULL après le refus, vérifié
par requête directe) ; `importerListing`/`envoyer` fonctionnent toujours pour fournisseur ; banque
ET avocat NE SONT PAS régressés (les deux flux de dépôt rejoués en entier, avocat n'avait AUCUNE
couverture de test avant ce correctif — sonde jetable écrite et supprimée pour le prouver aussi) ;
aucun AUTRE chemin de code n'atteint `deposerReponse` en contournant l'écran (tous les appelants
grep-és : `page.tsx`, `circularisations.test.ts`, `acheverCircularisationBanques()` — celle-ci
seulement `kind:'banque'`) ; le nouveau test n'est PAS vacueux — retirer SEULEMENT le nouveau bloc
de refus fait échouer CE test précisément, aucun autre (règle 17, cas connu mauvais prouvé) ;
`rapprochement('fournisseur')` ne peut plus jamais montrer un écart fabriqué (tous les
`confirmeCents` restent `null` tant qu'aucun dépôt ne peut réussir). Deux constats mineurs,
process, non bloquants : cette section STATUS.md n'existait pas encore au moment du correctif
(corrigé maintenant, ce paragraphe) ; `npm run clics` n'a pas encore tourné sur ce commit précis
(à suivre ci-dessous) et sa scénario actuelle n'a de toute façon aucune station qui dépose une
réponse fournisseur — ne validerait donc pas CE refus spécifiquement même une fois lancé, à noter
pour une tranche future qui construirait cette station.

**Mesures avant expédition (après les deux revues).** Suite ciblée (atelier-confirmation/
rapprochement/recalcul-lecture, deplanification-lecture, nature-lecture, etancheite, enrichir,
programme-vue, circularisations, catalogue — 69/69, incluant le nouveau test R96) et
`tsc --noEmit` propres. `npm run verify` complet à suivre.

**CORRECTIF D'EXPÉDITION DÉCOUVERT EN CONFIRMANT LE SHA SERVI DE LA TRANCHE PRÉCÉDENTE — le
« correctif » C2 de la mécanique (ci-dessous) violait la règle 26, et a bloqué TOUS les
déploiements depuis `a10e484`.** Le check-in programmé pour confirmer le SHA servi du merge de la
mécanique sur `main` (`a10e484`) a trouvé son déploiement de production en ÉTAT ERROR — et tous les
déploiements suivants (branche comme `main`) également en ERROR, `765a775` compris. Le journal de
build (`mcp__Vercel__get_deployment_build_logs`) est sans ambiguïté : `deploy:reconstruire`
(`migrate()`) a refusé avec « 1 migration(s) ÉDITÉE(S) APRÈS APPLICATION :
0165_circularisation_fournisseur.sql » contre la base Supabase PARTAGÉE. La migration 0165 avait
bien été appliquée à cette base — par le tout premier déploiement d'APERÇU de la mécanique (commit
`4fd9b1f`, `dpl_TKGDS66Pydqyj8Jf8U88Hzm48Tfb`, état READY) — avant même que le correctif C2 (commit
`2e0aadc`) n'édite le commentaire d'en-tête du même fichier. Le commit `2e0aadc` affirmait « sûre au
sens de la règle 26 — elle n'a jamais porté de ligne dans `_migrations` sur une base persistante » :
une AFFIRMATION FAUSSE, inférée du statut d'un déploiement plutôt que vérifiée par une requête
directe sur `_migrations` — exactement l'anti-patron que la règle 26 elle-même nomme (« Dans le
doute, une requête directe... tranche — jamais une inférence depuis le statut d'un déploiement »).
**Corrigé** : `supabase/migrations/0165_circularisation_fournisseur.sql` restauré OCTET POUR OCTET
à son contenu du commit `4fd9b1f` (`git diff 4fd9b1f -- supabase/migrations/0165...` vide, empreinte
SHA-256 identique) — jamais une nouvelle réédition, la seule façon de faire concorder à nouveau
l'empreinte que `migrate()` compare. **Conséquence pour C2** : le constat lui-même (le commentaire
d'origine affirme au passé une revue qui n'avait pas encore eu lieu, règle 13) reste VRAI et reste
dans le fichier appliqué, IMMUABLE — il ne peut plus être corrigé dans la migration elle-même sans
répéter la même erreur. Le compte rendu honnête vit ICI, jamais dans le fichier. **Aucune donnée
n'a été perdue ni corrompue** — le site a simplement continué de servir le SHA de la tranche
Immobilisations (`5cc7b7a`) pendant que ces déploiements échouaient ; voir la mesure du SHA servi
réel ci-dessous, une fois le prochain déploiement confirmé vert.

**Mesures finales, engendrées — SANS un seul passage unique complet de `npm run verify`, mais
avec CHAQUE étape confirmée propre au moins une fois sur l'arbre final (`56bf874` / `0f9dae4` pour
la doc) — décision écrite dans `docs/CHASSE.md` (entrée R58 sixième occurrence, puis F25).** SIX
chaînes `npm run verify` complètes se sont chacune arrêtées à la MÊME étape (`vitest run`, à cause
de `tests/screens.test.ts`) sur SIX routes distinctes (`/eng/[id]/reunions`, `/eng/[id]/risk`,
`/travaux`, `/eng/[id]/rcm`, `/eng/[id]/provenance`, `/eng/[id]/fs-tieout`), toutes SOX, jamais
liées au diff de cette tranche (vérifié à chaque fois) — R58, un flake déjà documenté (§5,
`docs/CHASSE.md`) avant cette tranche. Les six tentatives confirment `tsc --noEmit` propre et
`vitest run` à **144/145 fichiers, 1136/1137 tests** à chaque fois (le seul échec, toujours le
même fichier). `tests/screens.test.ts` seul, rejoué en isolation : **PASSE cinq fois sur les six
occurrences** (450-477 s à chaque fois — la sixième n'a pas reçu son propre rejeu, jugé redondant
après cinq confirmations consécutives sur un arbre fonctionnellement identique). Plutôt qu'une
septième chaîne complète identique, les étapes qu'aucune des six tentatives n'avait jamais pu
atteindre ont été lancées UNE PAR UNE sur une base fraîche : **`gardes`** (45 gardes, à jour),
**`semeur`** (registre à jour), **`plancher`** (1137 tests collectés, aucune forme éteinte),
**`langue`** (0 chaîne hors catalogue, 0 libellé en dur), **`langue:epreuve`** (15/15 cas connus
mauvais dénoncés), **`lectures`** (0 lecture perdue sur 1716 chemins), **`lectures:epreuve`**
(6/6 cas connus mauvais dénoncés), **`parcours`** (0 station perdue), **`parcours:epreuve`**
(5/5 cas connus mauvais dénoncés), **`screens`** [balayage PRODUCTION, 93 routes, 0 échec],
**`fumee`** (52 routes, 0 échec), **`densite`** (83 écrans, 0 dépassement) — TOUTES PROPRES.
**`clics`** : 260 étapes conduites, clôture ET archive atteintes (240 stations figées vérifiées,
empreinte SHA-256, zip 355 ko), 389 clics comptés — le seul « 1 échec(s) » compté par le harnais
est le flake `#418` déjà tracké (F25, `docs/CHASSE.md`) — DIXIÈME confirmation consécutive de sa
disjonction. **`visuel`** (relancé séparément, `clics` en échec sur ce seul `#418` casse le `&&`
qui le précède — même précédent que F14) : **336 vues, 0 défaut**.

## Lot 5, poste 4 (mécanique) : circularisation généralisée aux fournisseurs (2026-09-15)

*Même mandat que Trésorerie/Clients/Immobilisations ci-dessous, quatrième poste de l'ordre C.3 :
Fournisseurs (TRADE_PAYABLES), après Trésorerie, Clients, Immobilisations. Cette tranche NE
scope PAS encore TRADE_PAYABLES `in_scope` et NE planifie AUCUNE procédure — elle construit
uniquement la MÉCANIQUE que la tranche d'ouverture du poste, à suivre immédiatement, utilisera.*

**Le blocage qui a motivé le découpage.** L'obstacle « périmètre sans programme »
(`obstacles.ts`) exige qu'un poste `in_scope` porte AU MOINS une procédure PLANIFIÉE (pas
seulement disclosed) avant que la clôture de la démonstration ne l'atteigne — vérifié par lecture
directe du prédicat, pas supposé par analogie avec Clients/Immobilisations (qui, eux, avaient
chacun au moins un atelier réel à planifier). Recherche sur Fournisseurs : `requiredProcedures`
commande FOURN-CIRC (`confirmation_externe`, `moyen`), mais `circularisations.ts` ne portait que
`Nature = 'banque' | 'avocat'` — aucun atelier réel n'existait pour un poste fournisseur avant
cette tranche. Décision (règle 5, petites tranches) : scinder en une tranche MÉCANIQUE (celle-ci —
généraliser `circularisations.ts`, migration seule) puis une tranche D'OUVERTURE séparée (à
suivre, qui scope, planifie et câble l'écran).

**Implémentation.** `supabase/migrations/0165_circularisation_fournisseur.sql` (NOUVELLE
migration, jamais une édition de 0030 — règle 26) : `confirmation_campaign.kind` étendu à
`'fournisseur'`. `circularisations.ts` : `Nature` étendu, `POSTE`/`NOM` étendus (`fournisseur` →
`TRADE_PAYABLES`), le discriminant binaire rekeyé de `kind === 'banque'` à `kind !== 'avocat'`
partout SAUF le corps de la lettre d'envoi (`envoyer()`), qui reste un ternaire à trois branches —
« engagements hors bilan » n'a de sens que pour une banque. `methodology/procedures.json` : les
QUATRE procédures `FOURN-*` corrigées de `cycle:"FOURN"` à `cycle:"TRADE_PAYABLES"` (même
correctif de correspondance que CASH/TRADE_RECEIVABLES/PPE, R54/R57/R95).
`dataset/circularisations/fournisseurs.csv` (nouveau, pas encore consommé par un flux d'import —
préparé pour la tranche d'ouverture) : deux fournisseurs du dossier (F001/F002), tous deux
rattachés au compte collectif `401000`.

**DEUX RÉFUTATEURS INDÉPENDANTS** (règle 30 : cette tranche touche le modèle de données ET du code
de refus — les deux critères qui exigent deux voix, pas une seule comme Immobilisations).
**Voix 2** : aucun défaut. **Voix 1, C1 (SÉVÈRE, structurel, confirmé par exécution avant
correction)** : `rapprochement()`/`completude()` comparent le solde d'UN tiers au solde ENTIER de
son compte du grand livre — vrai pour banque/avocat (un compte = un seul tiers dans ce pack), FAUX
pour fournisseur : `TRADE_PAYABLES` ne porte qu'UN SEUL compte collectif (`401000`,
`fsliAccounts`, vérifié par exécution). Reproduit par une sonde jetable (supprimée avant tout
commit, règle 24) : le solde VRAI et COMPLET de Float Glass seul (193 502,33 €, somme des cinq
tranches d'âge de `dataset/balances_aux/fournisseurs_2025.csv`) contre le solde du compte 401000
(-265 632,25 €) donne `ecartCents=459134.58`, `remonte:true`, `etat:'ecart'` — sur une
confirmation exacte. Essayé et écarté avant de conclure : réduire `fournisseurs.csv` à un seul
tiers ne résout rien (même vérifié par la même sonde) — le défaut tient au compte collectif, pas
au nombre de lignes ; le fichier reste à ses deux tiers d'origine. **Non corrigé dans cette
tranche, délibérément** : la vraie correction (rapprocher contre la balance auxiliaire par tiers,
`aux_balance_row`/`balances-aux.ts`, plutôt que `fsliAccounts`) suppose un lien tiers↔compte-
auxiliaire qui n'existe pas encore et relève de la tranche d'ouverture du poste, pas de cette
généralisation du type `Nature`. Disclosed par un commentaire dans `circularisations.ts` (près de
`rapprochement()`/`completude()`), une correction de `LISEZ-MOI.md`, et **R96**
(`docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json`) — **condition BLOQUANTE explicite pour
la tranche d'ouverture** : ne pas semer de réponse déposée (`deposerReponse` avec
`montantConfirmeCents`) sur ce listing avant de résoudre R96. **C2** : l'en-tête de la migration
0165 affirmait au passé qu'une revue hostile à deux voix avait déjà eu lieu, écrit AVANT qu'elle
n'ait eu lieu — une affirmation non vérifiable au moment où elle a été écrite (règle 13).
Reformulé pour renvoyer au compte rendu réel plutôt que de l'affirmer sur place.

**Mesures finales, engendrées.** `npm run verify` (chaîne complète après le correctif C1/C2) :
**145 fichiers, 1136 tests, tous verts** ; `tsc --noEmit` propre. `npm run clics` : **260 étapes
conduites, ZÉRO échec de station nommée, clôture ET archive atteintes** (le seul « 1 échec(s) »
compté par le harnais est `#418`, F24 dans `docs/CHASSE.md` — NEUVIÈME confirmation consécutive
que ce flake est disjoint de tout ce que cette tranche a touché, confirmé par un rejeu propre
après deux essais de méthode ratés — base déjà jouée, puis budget de `timeout` trop court —
eux-mêmes écartés sans être commités). `npm run visuel` (lancé séparément — `clics` sort en échec
sur ce seul `#418`, même précédent que F14/Trésorerie/Clients/Immobilisations) : **336 vues, 0
défaut.**

**Non expédié à la clôture de cette section** : fusion sur `main`, confirmation du SHA servi en
production, et la tranche d'ouverture du poste Fournisseurs elle-même (scoping, planification,
écran) — voir la suite de STATUS.md pour leur mesure.

## Lot 5, poste 3 : Immobilisations (PPE) ouvertes complètement (2026-09-15)

*Même mandat que Trésorerie/Clients ci-dessous, troisième poste de l'ordre C.3 : Immobilisations,
après Trésorerie (CASH) et Clients (TRADE_RECEIVABLES).*

**Recherche, mesurée avant d'écrire.** `assessFsli`/`risksFor` exécutés contre le dossier NEP
seedé : PPE (1 050 000,00 €) porte `realite:eleve` (2 facteurs) et `separation:moyen` (1 facteur).
INTANGIBLES (12 000,00 €) reste GENUINEMENT hors périmètre — sous le seuil de planification
(27 000 €), `scoping_basis` distinct de la convention de démo, vérifié par requête directe.
FINANCIAL_ASSETS absent du plan de comptes de ce dossier. `requiredProcedures('PPE')`, exécuté
directement après le correctif de cycle (voir ci-dessous), confirme TROIS procédures commandées :
IMMO_COR-TAB (rapprochement, `exhaustivite:faible`), IMMO_COR-ACQ (sondage_pieces,
`realite:eleve`), IMMO_COR-DOT (recalcul_parametre, `mesure:faible`).

**Implémentation.** `methodology/procedures.json` : les SIX procédures `IMMO_COR-*` corrigées de
`cycle:"IMMO_COR"` à `cycle:"PPE"` (même correctif que CASH/TRADE_RECEIVABLES, R54/R57).
`papier.json` : `"PPE": "F"` ajouté, vérifié par exécution (`referencePapier` rend `F-01`).
`programme.ts` : `atelierDeLaNature` câble `recalcul_parametre`+PPE → `/estimations` (réutilisation) ;
NE câble PAS `rapprochement`/`sondage_pieces` pour PPE — aucun atelier réutilisable (`/balances-aux`
a un type `Cote` fermé ; `/testing` câblé sur REVENUE), disclosed R95. `part1.ts` : PPE restauré à
`in_scope` (moteur genuinement in_scope, vérifié) ; pas de synchronisation D9 nécessaire —
`enrichir.ts` ne mentionne PPE nulle part (recherche directe, pas supposé par analogie). Nouvelle
`planifierImmobilisations()` : questionnaire, risque, UNE SEULE procédure planifiée (IMMO_COR-DOT),
papier PPE-01 avec IPE honnêtement `utilisee:false` (même limite que CLIENTS-DEPREC :
`montantComptabilise` filtre en dur les comptes 70x, ne fonctionnerait pas pour une dotation aux
amortissements), revue analytique. `api/sante/route.ts` : `POSTES_CABLES` (lecture
recalcul_parametre) étendu à PPE.

**UN DÉFAUT RÉEL trouvé en conduisant `vuePoste('PPE')` avant d'annoncer l'écran (règle 10),
corrigé avant la revue hostile.** `poste.ts` : `patronRapprochementSeul` gatait à tort le bloc
`testing` (recalcul_parametre) derrière l'atelier de `rapprochement` — un couplage qui tenait par
coïncidence tant que le seul poste concerné (TRADE_RECEIVABLES) avait les deux ateliers ensemble.
PPE (recalcul_parametre SEUL) serait retombé sur `/testing` (REVENUE) malgré un atelier réel
(`/estimations`). Corrigé : `patronRapprochementSeul`/`patronRecalculSeul` désormais indépendants,
chacun sur son propre atelier.

**UN RELECTEUR HOSTILE INDÉPENDANT** (règle 30 : ni migration, ni multi-tenant, ni code de refus
dans cette tranche — un seul suffit, même précédent que Trésorerie/Clients). Deux constats réels,
vérifiés par exécution directe (`requiredProcedures('PPE')`, `vuePoste` sur les quatre postes, un
cas connu mauvais injecté puis retiré sur `POSTES_CABLES`) : **H2** — le bloc `echantillon` de
`vuePoste('PPE')` retombait sur `href: /population` (l'écran REVENUE) sans aucun avertissement,
faute d'atelier `rapprochement`/`sondage_pieces` sur PPE. Honnêtement disclosed dans
`BACKLOG_REPORTE.md` mais pas dans l'écran. Corrigé : `poste.ts` distingue désormais REVENUE (qui a
toujours eu ce repli légitimement) de tout autre poste tombant ici faute d'atelier — `etat:
'sans_objet'`, `href: null`, nouveau motif `poste.resume.echantillonSansAtelier` nommant R95.
Vérifié par exécution : PPE → `sans_objet`/`null` ; REVENUE, TRADE_RECEIVABLES, CASH inchangés
(mêmes `href` qu'avant, confirmé un par un). **H1** — `docs/BACKLOG_REPORTE.md` et
`docs/instantanes/fils.json` gardaient les comptes D'ORIGINE de R54 (« quatorze », puis « treize »)
et R57 (« sept », puis « cinq ») APRÈS que cette même tranche a corrigé IMMO_COR-CESS/IMMO_COR-DOT
et IMMO_COR-TAB — exactement le défaut de règle 31 (une valeur qui a l'air d'une mesure sans en
être une), et la même classe de défaut que la revue hostile Clients avait déjà trouvée une fois
(C2). Recompté par mesure directe (script Python sur `procedures.json`, pas recopié de tête) :
R54 = ONZE procédures `recalcul_parametre` encore mismatched (pas treize), R57 = QUATRE procédures
`rapprochement` encore mismatched (pas cinq). Les deux fichiers corrigés avec les listes exactes.
**Aucun autre défaut de fond** — le test modifié (`catalogue.test.ts`, retrait de `'IMMO_COR'`)
reste un test réel, pas affaibli à vacuité.

**R95 nouvelle entrée (disclosed) : IMMO_COR-TAB (rapprochement) et IMMO_COR-ACQ (sondage_pieces)
sont commandées par le risque sur PPE mais n'ont aucun atelier.** `/balances-aux` a un type `Cote`
fermé (`'clients'|'fournisseurs'`) — un rollforward n'est de toute façon pas le même calcul qu'un
rapprochement sous-registre. `/testing` reste câblé sur REVENUE (R92). Non planifiées
délibérément — planifier sans atelier atteignable créerait une procédure planifiée sans geste
possible. Se referme avec R92, vraisemblablement quand Fournisseurs (Lot 5, poste 4) portera le
même besoin.

**Mesures finales, engendrées.** `npm run verify` (chaîne complète, TROIS passes sur cette
tranche — la première a trouvé les défauts que la revue hostile a confirmés (H1/H2), la deuxième a
heurté R58 (`ServeurTombe`, route SOX `/eng/[id]/exceptions`, confirmé disjoint par `ps aux` et un
passage isolé vert, `screens.test.ts` seul 1/1, 472,56 s), la troisième est PROPRE — seul le flake
`#418` déjà tracké (F22, `docs/CHASSE.md`) : **145 fichiers, 1136 tests, tous verts**. `npm run
clics` (dernier passage, `verify-immo-3.log`) : **260 étapes conduites, ZÉRO échec de station
nommée, clôture ET archive atteintes** (le seul « 1 échec(s) » compté par le harnais est `#418`,
F22, sans lien avec cette tranche). `npm run visuel` (lancé séparément — `clics` sort en échec sur
ce seul `#418`, même situation que F14/Trésorerie/Clients) : **336 vues, 0 défaut.**

**Non expédié à la clôture de cette section** : fusion sur `main`, confirmation du SHA servi en
production — voir la suite de STATUS.md pour leur mesure.

## Lot 5, poste 2 : Clients ouvert complètement (2026-09-15)

*Même mandat que Trésorerie ci-dessous (`docs/MANDATS/2026-09-14_mandat_lecons_notif01_et_lot5.md`,
point 3), deuxième poste de l'ordre C.3 : Clients (TRADE_RECEIVABLES), après Trésorerie.*

**Recherche, mesurée avant d'écrire.** `assessFsli`/`risksFor` exécutés contre le dossier NEP
seedé : `exhaustivite:moyen` (facteur « plus de 200 écritures », 1267) et `evaluation:faible` sur
TRADE_RECEIVABLES. Trois procédures du catalogue dépassent leur `risque_minimum` au moment de la
recherche : CLIENTS-AGE (`exhaustivite`, `faible`), CLIENTS-AVOIRS (`exhaustivite`, `moyen`) —
toutes deux VÉRIFIÉES commandées par exécution directe de `requiredProcedures()`, voir plus bas —
et CLIENTS-DEPREC, dont la mesure d'origine s'est révélée FAUSSE (voir revue hostile ci-dessous).
CLIENTS-CIRC et CLIENTS-ALT restent sous leur `risque_minimum` (`realite:faible`).

**Implémentation.** `methodology/procedures.json` : `CLIENTS-AGE`/`CLIENTS-DEPREC.cycle` corrigés
de `"CLIENTS"` à `"TRADE_RECEIVABLES"` (même correctif que TRESO→CASH, R54/R57). `papier.json` :
même défaut de correspondance trouvé une SECONDE fois — `lettres_par_poste["RECEIVABLES"]` ne
correspondait à AUCUN `fsli.code` réel, corrigé en `"TRADE_RECEIVABLES"`. `programme.ts` :
`atelierDeLaNature` câble TRADE_RECEIVABLES vers `balances-aux`/`estimations`, tous deux DÉJÀ
poste-agnostiques (ADR-107, clé par `pieceRef`) — une ligne de routage, pas une mécanique neuve.
`part1.ts` : TRADE_RECEIVABLES restauré à `in_scope` (moteur genuinement in_scope, balance
1 554 017,64 €). Nouvelle `planifierClients()` : questionnaire, risque, CLIENTS-AGE/CLIENTS-DEPREC
plantées par `planifierProcedure`, papiers TRA-01/TRA-02 avec IPE honnêtement `utilisee:false` (la
balance auxiliaire clients n'est importée que par le geste cliqué réel, ADR-107, jamais pré-semée),
revue analytique. `poste.ts` : un TROISIÈME patron d'écran (ni circularisé ni sondé façon REVENUE)
route `echantillon`/`testing` vers `balances-aux`/`estimations` quand `atelierDeLaNature` confirme
un atelier réel hors circularisation.

**Trois défauts RÉELS trouvés par le premier verify complet, aucun deviné.** (1) `enrichir.ts`
porte SA PROPRE garde D9 sur TRADE_RECEIVABLES, basée sur l'événement `demo_scoping_seeded` qu'IL
SEUL émettait jusqu'ici — laisser le poste retenu dès `planifierClients()` sans émettre ce marqueur
aurait recréé le trou que D9 interdit (une décision humaine ultérieure réécrite silencieusement).
Trouvé par `enrichir.test.ts` (CONSTAT 1/6). Corrigé : `bootstrapNep()` émet le même événement,
même verbe, même forme de payload. (2) `enrichir.test.ts` (CONSTAT 4) vérifiait « tout papier hors
REV-01 a une IPE `utilisee:true` » — un proxy sûr tant qu'aucun autre poste ne portait de papier ;
TRA-01/TRA-02 existent désormais avec `utilisee:false` HONNÊTE. Corrigé en scopant au join
`procedure_instance.fsli_code = 'REVENUE'`. (3) Les deux lectures `/api/sante` « atelier
disponible » ne détectaient une régression que sur le poste initialement câblé (REVENUE/CASH) —
généralisées via `POSTES_CABLES`, comparant une liste ATTENDUE (jamais `atelierDeLaNature` contre
elle-même) ; messages raccourcis pour tenir dans la troncature à 300 caractères d'`essayer()`.

**UN RELECTEUR HOSTILE INDÉPENDANT** (règle 30 : ni migration, ni multi-tenant, ni code de refus
dans cette tranche — un seul suffit, même précédent que Trésorerie). Quatre constats réels : **C1
(sévère)** — R92 (voir plus bas) diagnostiquait sa propre cause à côté : CLIENTS-AVOIRS,
CLIENTS-CIRC et CLIENTS-ALT portaient encore `cycle:"CLIENTS"`, invisibles à `proceduresDuCycle`
quel que soit le risque ; la mesure d'origine comparait `risksFor` à `risque_minimum` À LA MAIN,
sans exécuter `requiredProcedures()` bout en bout (règle 15). Corrigé, re-vérifié par exécution sur
base fraîche (déterministe — mêmes comptes : 13 exceptions, 8 déviations, 6 papiers, 377
événements) : `requiredProcedures('TRADE_RECEIVABLES')` rend maintenant `CLIENTS-AGE` ET
`CLIENTS-AVOIRS`. **En re-vérifiant C1, un SECOND défaut trouvé, indépendamment du relecteur** :
CLIENTS-DEPREC N'EST PAS commandée par le risque — `evaluation:faible` mesuré, SOUS son
`risque_minimum:"moyen"` — contrairement à ce que le commit d'origine affirmait.
`planifierProcedure` ne vérifie jamais le niveau de risque (seulement catalogue/cycle/périmètre),
donc `planifierClients()` l'avait planifiée quand même via sa liste codée en dur ; elle reste
fonctionnelle (atelier réel, papier TRA-02) mais « hors commande », pas « commandée par le
risque ». **C3** — `papier.json` portait `"PAYABLES"`, qui ne correspond à AUCUN `fsli.code` réel
(le vrai code est `TRADE_PAYABLES`) — même famille, une TROISIÈME fois, corrigée avant que
Fournisseurs (Lot 5, poste 4) n'en hérite silencieusement. **C4** (mineur) — un commentaire de
`part1.ts` affirmait qu'`enrichir.ts` n'est « pas appelé par ce seed », faux : le build de
production (`scripts/deploy/reconstruire.ts`) l'appelle bel et bien, reformulé. **C2** — une
contradiction documentaire dans `docs/BACKLOG_REPORTE.md` (R57 listait encore CLIENTS-AGE parmi
les procédures « non corrigées » alors que ce même commit venait de la corriger), réparée. **C5/C6
(fragilités de conception, disclosed, pas corrigées)** : R93 (le garde-fou D9 est dupliqué sans
mécanisme partagé entre `part1.ts` et `enrichir.ts` — un futur poste peut le manquer d'un seul
côté) ; R94 (le troisième patron de `poste.ts` est silencieux si TRADE_RECEIVABLES gagne un jour un
vrai tirage). Toutes deux non corrigées délibérément : refactor hors mandat d'une tranche de poste
(R93, règle 8) ; test contre un décor qui n'existe encore nulle part dans le dépôt (R94, règle 25).

**R54, R56, R57, R92 mis à jour pour dire la vérité mesurée.** R54 : « partiellement levée » pour
CLIENTS-DEPREC (le `cycle` est corrigé, ce qui ne veut PAS dire commandée par le risque — voir
ci-dessus). R57 : CLIENTS-AGE retiré de la liste des procédures `rapprochement` non corrigées (cinq
restantes). R92 réécrite en entier : le diagnostic d'origine était faux, la correction et la
re-vérification par exécution sont maintenant la version qui fait foi ; le CLIENTS-DEPREC-n'est-pas-
commandée y est documenté comme second constat. R93/R94 nouvelles, disclosed.

**Mesures finales, engendrées.** `npm run verify` (chaîne complète, QUATRE passes sur cette
tranche — deux ont trouvé et fait corriger des défauts réels, une a heurté le flake `#418` déjà
tracké (F19, `docs/CHASSE.md`), une le REJOUE au trait près après les correctifs hostiles (F20,
même page `rcm/[cid]`, disjointe du diff) : **145 fichiers, 1136 tests, tous verts** sur le dernier
passage complet. Un passage a aussi heurté R58 (`ServeurTombe`, route SOX `/eng/[id]/population`,
quatrième occurrence de ce flake pré-documenté) — confirmé disjoint par `ps aux` (aucun processus
parasite) et par un passage isolé vert (`screens.test.ts` seul, 1/1, 453,79 s). `npm run clics`
(dernier passage, `verify-clients-4.log`) : **260 étapes conduites, ZÉRO échec de station nommée,
clôture ET archive atteintes** (le seul « 1 échec(s) » compté par le harnais est `#418`, F20, sans
lien avec cette tranche). `npm run visuel` (lancé séparément — `clics` sort en échec sur ce seul
`#418`, même situation que F14/Trésorerie) : **336 vues, 0 défaut.** Suites ciblées après les
correctifs hostiles : 67 tests (papier/catalogue/risk/poste/programme/enrichir/part1) + 102 tests
(api/sante, 26 fichiers), tous verts.

**Non expédié à la clôture de cette section** : fusion sur `main`, confirmation du SHA servi en
production — voir la suite de STATUS.md pour leur mesure.

## Lot 5, poste 1 : Trésorerie ouverte complètement (2026-09-14/15)

*Mandat du fondateur du 2026-09-14 soir (`docs/MANDATS/2026-09-14_mandat_lecons_notif01_et_lot5.md`,
point 3, commité verbatim, règle 33) : ouvrir Lot 5 poste par poste, dans l'ordre C.3
(Trésorerie, Clients, Immobilisations, Fournisseurs, Paie, Provisions, Stocks, Capitaux propres et
impôt), chaque poste tenu à la barre de complétude du plan lui-même — « leadsheet N/N-1, revue
analytique, procédures commandées par le risque, atelier de sa nature, papier, écarts — un poste
ouvert à moitié est pire qu'un lien mort ». Amendement de la règle 14 de CLAUDE.md (commité le même
soir) lève « aucun cycle au-delà du chiffre d'affaires » EXACTEMENT pour ces huit postes, rien de
plus — vérifié avant d'amender, pas supposé : `methodology/procedures.json` v1.4.0 portait déjà
`TRESO-CIRC`/`TRESO-RAPPRO`/`CONFIRM`, sourcés (ISA-505), ce qui manquait était une CORRESPONDANCE
`cycle` ↔ `fsli.code` (R56/R57, dette déjà connue) — de la mécanique (règle 9), pas du contenu de
procédure neuf.

**Implémentation.** `methodology/procedures.json` : `TRESO-CIRC`/`TRESO-RAPPRO.cycle` corrigés de
`"TRESO"` à `"CASH"`. `part1.ts` : `bootstrapNep()`'s boucle de scoping-override ne force plus CASH
à `ns_confirmed` — restauré à la proposition GÉNUINE du moteur (`in_scope`, balance 310 627,03 €
au-dessus de la matérialité de performance — vérifié par sonde directe, pas supposé). Nouveau
`planifierTresorerie()` : évalue le risque, planifie `TRESO-CIRC`/`TRESO-RAPPRO`, rédige le papier
CAS-01 avec son IPE (désigne le TB importé), écrit la revue analytique, répond les six questions de
section du questionnaire résiduel — chaque étape gardée par un `select … limit 1` avant d'agir
(même patron que `enrichir.ts` pour TRADE_RECEIVABLES, vérifié idempotent par exécution DOUBLE en
revue hostile, tous les compteurs identiques au second passage). `poste.ts` : les blocs
`echantillon`/`testing` d'un poste circularisé (nouveau `natureCirculariseeDuPoste`,
`circularisations.ts`) routent désormais vers `confirmation_externe`/`rapprochement`
(`atelierDeLaNature`, programme.ts) plutôt que vers l'écran `/population`/`/testing` du CHIFFRE
D'AFFAIRES, qui ne connaît rien à Trésorerie.

**Trois défauts RÉELS trouvés par le parcours cliqué mené jusqu'à la clôture (règle 37), aucun
deviné.** Le premier poste retenu au-delà de REVENUE a fait apparaître, pour la première fois, trois
hypothèses implicites de monde-à-un-seul-poste dans le harnais et l'application — chacune invisible
tant que REVENUE restait, par coïncidence, toujours « le premier » :
1. `scripts/clics/scenario.ts` (station « papier de travail et visas ») choisissait `.first()` sur
   les liens `/workpapers/` de la liste (`order by w.code`, `lifecycle.ts`) — CAS-01 triant AVANT
   REV-01 alphabétiquement, la station entière (colonne ajoutée ADR-099, IPE FEC-2025 — du contenu
   spécifique au cycle chiffre d'affaires) ciblait CAS-01 par erreur, 12 échecs en cascade. Corrigé
   en ciblant `tr:has-text("REV-01")` explicitement à deux points d'appel (commit `caaebce`).
2. La même station « questionnaire résiduel » ne visitait que `/risk` SANS `?fsli=`, donc « le
   premier poste retenu » (`order by statement, code` — CASH, poste de BILAN, trie avant REVENUE,
   compte de résultat). Comparé au SHA `b951986` (dernier confirmé servi) dans un `git worktree`
   isolé : REVENUE porte DÉJÀ zéro réponse à ce stade — PAS une régression de cette tranche, une
   lacune préexistante de cette station, jamais visible tant qu'un seul poste n'était jamais
   retenu. Corrigé en découvrant les postes à visiter depuis les badges `a[href^="?fsli="]` de la
   page elle-même, jamais une liste codée en dur (commit `89363b7`).
3. **Un défaut RÉEL DU PRODUIT, pas seulement du harnais.** `executer()` (refus.ts) redirige vers
   EXACTEMENT le chemin donné en cas de succès ; les quatre actions de `/eng/[id]/risk`
   (`assessAction`/`answerAction`/`decideAction`/`overrideAction`) redirigeaient toutes vers le
   chemin NU `/eng/[id]/risk`, perdant le `?fsli=` du poste consulté. Répondre à UNE question sur
   la section de REVENUE rebondissait sur la page de CASH (déjà tout répondu), faisant croire à qui
   répond — humain ou parcours cliqué — que le résiduel était clos alors que cinq questions sur six
   restaient sans réponse : un vrai refus dont le calcul tenait (`obst.questionsSectionSansReponse`),
   caché par un rebondissement de page que rien ne signalait (règle 13). Root-causé par lecture du
   code, pas deviné (règle 18) ; écarté par la mesure directe qu'il s'agissait d'une régression du
   correctif n°2 lui-même avant de conclure. Corrigé en redirigeant vers `/eng/${id}/risk?fsli=${code}`
   sur les quatre actions (commit `7fde536`).

**UN RELECTEUR HOSTILE INDÉPENDANT** (règle 30, amendement du 8 septembre : ni modèle de données
neuf, ni code de refus neuf, ni multi-tenant ni sécurité au sens de ce mandat — un seul suffit,
bien que le relecteur ait vérifié le point multi-tenant du redirect `?fsli=` par acquit de
conscience). Vérifié par EXÉCUTION, jamais par lecture seule (règle 15) : `bootstrapNep()` rejoué
contre une base fraîche (CASH `in_scope` confirmé, quinze autres postes toujours `ns_confirmed`,
aucune régression) ; `planifierTresorerie()` rejoué DEUX FOIS, compteurs identiques (idempotence
prouvée, pas supposée) ; `draft.ts` comparé ligne à ligne au patron déjà correct de
`programme.ts` ; suites ciblées vertes (`enrichir.test.ts` 11/11, `poste.test.ts`+`rail.test.ts`
19/19, `langue.test.ts` 9/9, `methodology/catalogue.test.ts` 12/12, `langue:epreuve` 15/15).
**Aucun défaut fonctionnel confirmé.** Un constat DISCLOSED, corrigé sur-le-champ (coût quasi nul,
un commentaire, pas un comportement) : `poste.ts` affirmait qu'un `sample_item` « ne naît JAMAIS »
pour un poste circularisé — vrai aujourd'hui parce qu'AUCUN chemin de code ne produit de tirage
substantif hors REVENUE (`sampling.ts` câblé en dur sur `revenuePopulation()`), pas parce que la
structure l'interdit ; le commentaire affirmait plus que ce qu'il garantissait (règle 13,
corollaire). Reformulé pour nommer la limite (règle 19) plutôt que l'absolu — aucun code changé.

**Mesures finales, engendrées.** `npm run verify` (chaîne complète, NEUF passes sur cette tranche —
détail : deux ont trouvé et fait corriger les trois défauts ci-dessus, une a heurté le flake `#418`
déjà tracké (`docs/CHASSE.md` F18, page `rcm/[cid]` non touchée par cette tranche), une le flake
préexistant R58 (`ServeurTombe`, `tests/screens.test.ts`, jamais reproduit isolé — confirmé par un
passage isolé vert, 1/1) : **145 fichiers, 1136 tests, tous verts** sur le dernier passage complet.
`npm run clics` (dernier passage, `verify-tresorerie-9.log`/`bi4e05s9q.output`) : **260 étapes
conduites, ZÉRO échec de station nommée, clôture ET archive atteintes pour la première fois depuis
l'ouverture de ce poste** (le seul « 1 échec(s) » compté par le harnais est `#418`, F18, sans lien
avec cette tranche). `npm run visuel` (lancé séparément — `npm run clics` sort en échec sur ce
seul `#418`, empêchant la chaîne `&&` d'atteindre `visuel`, même situation déjà établie par F14) :
**336 vues, 0 défaut.**

**Fusion et SHA servi.** `claude/otto-session-resume-zimig9` fusionné par avance rapide sur `main`
(commit `0e2cd82`), poussé. **SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `0e2cd82`**
(`0e2cd82912890e033f6cd55d1193af72c2426572`) : `mcp__Vercel__list_deployments` montre
`dpl_542SFLkDpebyLYjosty5U9JmZzg7`, cible `production`, état `READY`, commit `0e2cd82912…` sur
`main`, créé à 08:20:41Z le 2026-09-15 ; confirmé une seconde fois par lecture directe de
`https://otto-dit.vercel.app/api/sante` (`mcp__Vercel__web_fetch_vercel_url`, jamais `curl` — le
bac à sable ne joint pas `*.vercel.app`) à 09:36:32Z le même jour : `"sha":"0e2cd82912…"`,
`identiteCoherente:true`. R56/R57 restent partiellement levées (CASH seul ; les autres postes du
Lot 5 les lèvent au fur et à mesure qu'ils ouvrent leur propre correspondance cycle↔fsli).

La suite du Lot 5 (poste 2, Clients) — voir la suite de STATUS.md pour sa mesure.

## Correctif d'expédition : la migration 0164 bloquait le déploiement, NOTIF-01 rendait la démo insignable (2026-09-14)

**SHA SERVI CONFIRMÉ : `b951986`, mesuré directement sur `https://otto-dit.vercel.app/api/sante`
à 15:38:12Z le 2026-09-14, `identiteCoherente:true`.** Les deux nouvelles lectures NOTIF-01 et
AUTO-01 passent en production, VIDES sans être vacueuses (le prédicat de vacuité les couvre) :
« AUTO-01 : aucun réglage de mission ne dépasse le plafond de son pack — VIDE, aucune mission n'a
encore réglé son niveau » et « NOTIF-01 : tout élément IA non validé compte comme obstacle au
visa — VIDE, aucun élément IA non validé pour l'instant » — cette dernière confirme, EN
PRODUCTION, que le correctif tient : les dix extractions qui bloquaient la clôture en local ne
comptent plus. Le mandat 2026-09-14 entier (§1, §3, §2) et ce correctif sont maintenant COMPLETS
ET SERVIS.

*Le push de §2 sur `main` (SHA `3f79bb7`) n'a JAMAIS été servi — mesuré, pas supposé : les DEUX
déploiements (production et branche) sont revenus `ERROR`, confirmé par les journaux de build
Vercel (`mcp__Vercel__get_deployment_build_logs`), pas par une inférence sur le statut du travail
CI (règle 26). Trois défauts réels ont été trouvés et corrigés avant de réexpédier — aucun n'avait
été vu par les deux revues hostiles précédentes (§2 et §3), parce qu'aucune n'avait fait tourner
`npm run verify` en entier jusqu'à `clics` : les tranches précédentes validaient par `vitest run` +
`screens` ciblés (règle 30), une pratique légitime en cours de construction mais qui n'avait, pour
ce mandat, jamais été complétée par le verify intégral à l'expédition réelle.*

**Défaut 1 — la migration 0164 bloquait TOUT déploiement (CRITIQUE, mesuré par les journaux de
build, pas supposé).** Le backfill `update ai_run set niveau_automatisation = 'L2' where … is
null` déclenchait le garde append-only (`ai_run_append_only`, migration 0003, `for each row`) dès
qu'`ai_run` porte de vraies lignes — vert en local/CI SEULEMENT parce que la base de test y arrive
VIDE (l'UPDATE ne touche aucune ligne, le déclencheur ne s'exécute jamais). Exactement règle 11 :
un test vert sur un chemin que la production n'emprunte pas ne prouve rien. Vérifié AVANT de
corriger (règle 26) : `_migrations` ne porte AUCUNE ligne pour 0164, ni en local ni sur le réseau
(requête directe sur les deux bases) — le protocole simple de Postgres a annulé tout le lot dès
l'échec de l'UPDATE. Cette migration n'ayant donc jamais été RÉELLEMENT appliquée nulle part,
l'éditer en place était correct, pas une réédition d'une migration appliquée. Corrigé par `ADD
COLUMN … DEFAULT 'L2'` (mécanisme de défaut rapide de Postgres, aucun UPDATE, le déclencheur ne
voit rien) puis `DROP DEFAULT`. Validé par exécution directe contre la base locale persistée (2
lignes `ai_run` réelles, le cas reproducteur exact), puis contre une base fraîche portant une
ligne insérée AVANT la migration (les deux revues hostiles ci-dessous l'ont rejoué indépendamment).

**Défaut 2 — `docs/GUARDS.md` avait divergé depuis §3.** La famille d'obstacle `iaNonValide`
(NOTIF-01, expédiée avec §3) n'avait jamais reçu son `npm run gardes -- --figer` — un oubli de
clôture de §3, pas de §2. Régénéré : G-65 nomme désormais `iaNonValide`, l'ancienne G-65
(`unsupported_sample_items`) décalée en G-66.

**Défaut 3 — NOTIF-01 rendait la démonstration INSIGNABLE (violation de la règle 25, jamais mesuré
avant ce jour).** En conduisant le parcours cliqué JUSQU'À LA CLÔTURE pour la première fois depuis
§3, dix obstacles `iaNonValide` subsistaient sur le dossier NEP à la fin du parcours, empêchant la
clôture — trois stations figées (clôture, empreinte SHA-256, téléchargement du zip) devenaient
JAMAIS ATTEINTES. Investigation par exécution directe (jamais par grep, règle 15) : les dix
étaient TOUTES des extractions `pending_verify` sans AUCUN geste réel de résolution nulle part
dans le produit — neuf fichiers de POPULATION (listings clients/fournisseurs/banques, journaux de
revenus : `request_item_id` NULL, jamais liés au sondage) et une pièce dont la ligne avait QUITTÉ
le tirage après un re-tirage (`sample_item` superseded — exactement le cas que l'écran `testing`
documente déjà lui-même comme « n'étant l'obligation de personne »). Corrigé dans
`notifications.ts` : le même filtre qui construit le lien `?item=` (résolution par lignage via
`lignesAtelier`, ADR-133) sert maintenant AUSSI à décider l'INCLUSION — sans ligne courante
résolue, l'élément n'est ni montré ni compté (même principe que l'exclusion déjà faite pour
`wp_extra_cell.verifie=false`, R84). Vérifié : 10 → 0 obstacle(s) sur le dossier NEP après le
correctif, contre l'état de base laissé par le parcours cliqué en échec. Un fixture positif
(chaîne `sample`/`gl_entry`/`request_item`/`evidence` complète, construite depuis les schémas
plutôt que devinée) prouve désormais, pour la première fois, que le deep-link `?item=` réel
fonctionne (R86 levé) ; l'ancien fixture sous-spécifié devient le cas connu mauvais (règle 17).

**DEUX RELECTEURS HOSTILES INDÉPENDANTS (règle 30 : modèle de données + code de refus touchés),
sur le diff exact de ce correctif (`3f79bb7..85c9cd1`).** Chacun a rejoué la migration 0164
corrigée contre une base PGlite portant une vraie ligne `ai_run` PRÉEXISTANTE et confirmé, par
exécution : succès sans exception, backfill correct, `NOT NULL` sans défaut qui refuse bien un
futur INSERT sans le champ. Chacun a fait tourner `notifications.test.ts` (13/13 verts), réintroduit
le défaut d'origine pour confirmer que le test dédié l'attrape (cas connu mauvais, règle 17), et
cassé délibérément `currentRevenueSample`/`lignesAtelier` pour écarter un faux positif silencieux
du fixture résolvable. L'un a en outre construit un second cabinet fictif complet pour prouver
l'étanchéité multi-tenant du nouveau filtre par exécution (3/3 verts), et confirmé que la lecture
`/api/sante` NOTIF-01 et l'obstacle `obstaclesAuVisa` partagent la MÊME fonction
(`elementsIaNonValides`, aucun second chemin oublié). **Aucun défaut réel trouvé dans le diff
revu, sur les deux voix.**

**Un constat MOYEN, hors diff, disclosed, non corrigé — R90** (`docs/BACKLOG_REPORTE.md`) :
« Tester » sur un contrôle (`rcm/[cid]/page.tsx`, `testAction`) vérifie en réalité TOUTES les
extractions `pending_verify` du DOSSIER, pas seulement celles du contrôle testé — un geste existe
donc, mal scopé, jamais une attestation délibérée au sens du mandat. Contredit partiellement
l'affirmation d'origine du commentaire de `notifications.ts` (corrigée en conséquence). Ni
`testAction` ni `ladder.ts` ne sont touchés par ce correctif — préexistant, ailleurs, jugé seul,
non réfuté par une seconde voix.

**Mesures finales, engendrées, citées avec leur SHA.** `npm run verify` (chaîne complète, cinq
passes sur cette tranche : deux ont trouvé et fait corriger les défauts 1 et 2, une troisième la
régression NOTIF-01 elle-même, les deux dernières confirment) : **145 fichiers, 1136 tests, tous
verts** sur les deux derniers passages consécutifs (`EXIT=1` lu dans le journal brut à cause du
seul #418 déjà tracké, JAMAIS d'un échec de station nommée — voir `docs/CHASSE.md` §F17). `npm run
screens` : **93 routes, 0 échec.** `npm run clics` (dernier passage, `verify-full-5.log`) : **260
étapes conduites, ZÉRO échec de station nommée, closure et archive comprises** (le seul « 1
échec(s) » compté par le harnais est le #418 côté navigateur, F17, non lié à cette tranche).

## Mandat 2026-09-14, §2 : le degré d'automatisation — AUTO-01, AUTO-02 (2026-09-14)

*Dernière des trois fonctionnalités du mandat (§5 : §1.2-1.3, §1.4-1.5, §3, puis §2 — l'ordre
initial du plan de tâches de cette session avait §2 et §3 inversés, corrigé avant de commencer
§3). §2.1 : une échelle FERMÉE — L0 (agent éteint), L1 (suggère à côté, jamais dans un champ —
pas encore consommé par un écran), L2 (propose dans les champs, validation humaine tracée — le
plafond PERMANENT du projet, déjà en vigueur PARTOUT avant ce mandat, règle 7), L3 (interdit,
n'existe dans le type que pour que le refus puisse le nommer). §2.2 : le pack pose un plafond
(absent ⇒ L2), une mission règle vers le bas SEULEMENT, jamais au-delà (AUTO-01). §2.3 : chaque
élément produit par l'IA porte le niveau réellement en vigueur à l'instant de sa production,
immuable (AUTO-02). §2.4 : deux gardes indépendantes, IA-BUDGET-01 (le droit de dépenser) et
celle-ci (le droit de faire) — aucune ne remplace l'autre.*

**Le SHA `3f79bb7` de cette tranche n'a JAMAIS été servi — voir la tranche « Correctif
d'expédition » ci-dessus : le déploiement est revenu ERROR (migration 0164), corrigé, et c'est le
SHA de cette correction qui a fini par être confirmé en production.**

**Migration 0164.** `engagement.automation_level` (nullable, CHECK L0/L1/L2, null = hérite du
plafond du pack) et `ai_run.niveau_automatisation` (NOT NULL, SANS DÉFAUT, backfillée à L2 pour
les lignes déjà écrites) — la défense en profondeur d'AUTO-02 au niveau de la BASE, pas seulement
du typage TypeScript.

**`automatisation.ts` (nouveau service).** `plafondDuPack`/`capperNiveau`/`depasseLePlafond`
(pures), `niveauEffectif` (le niveau réel : réglage de mission plafonné par le pack, sinon le
plafond lui-même), `definirNiveauMission` (LE seul chemin d'écriture, AUTO-01), `assertNiveauOuvert`
(refuse AUTO-01 si L0). `AssurancePack.automationLevel` (packs/types.ts) : absent ⇒ L2 — PAS un
`verifie:false` comme les autres paramètres de cabinet du fichier, puisque L2 est déjà la valeur
sûre en vigueur partout ; poser explicitement L0/L1 est la façon dont un cabinet se montre plus
prudent que le défaut.

**AUTO-02 câblée à la source.** `recordAiRun` (core/airuns.ts) refuse tout enregistrement sans
`niveauAutomatisation` — un champ REQUIS, pas optionnel. Câblée aux QUATRE sites d'appel IA réels
de ce dépôt (extraction/ladder.ts, entretiens.ts, walkthrough-analyse.ts, query/ask.ts), chacun lit
le niveau UNE SEULE FOIS et réutilise cette même valeur pour la garde et pour le timbre — jamais
deux lectures séparées (voir la revue hostile ci-dessous).

**Le détecteur structurel existant étendu, jamais une seconde garde parallèle.**
`scripts/audit/ia-vivante.ts` (la garde qui rend impossible un site d'appel IA non gardé par
IA-BUDGET-01, construite le 2026-09-13) couvre désormais AUTO-01 au même titre
(`gardeeParAssertNiveau`), avec son propre cas connu mauvais. Quatre harnais de mesure sans
`engagementId` (scripts/eval/*, scripts/cost/measure.ts) documentés HORS PÉRIMÈTRE d'AUTO-01,
mission-scopée par nature — IA-BUDGET-01, elle, reste globale (`app_state`) et continue de les
couvrir.

**Lecture `/api/sante` dédiée** (AUTO-01 : aucun réglage de mission ne dépasse le plafond de son
pack) — défense en profondeur sur ce qui est réellement en base, jamais un second calcul.

**DEUX RELECTEURS HOSTILES INDÉPENDANTS (règle 30 : modèle de données + code de refus touchés),
les deux voix convergeant sur les MÊMES deux constats, indépendamment — un signal fort.**

1. **ÉLEVÉ/MOYEN (voix 1 ET 2).** Les quatre sites d'appel réels relisaient le niveau une SECONDE
   fois au moment d'écrire `ai_run`, après le vrai appel IA (potentiellement plusieurs secondes) —
   une fenêtre TOCTOU où `definirNiveauMission` change le réglage ENTRE la garde et l'écriture
   aurait timbré la ligne d'un niveau qui n'a JAMAIS accompagné l'appel réel, l'exact contraire de
   ce qu'AUTO-02/§2.3 promet (« baisser le niveau plus tard ne réécrit jamais l'histoire »).
   Reproduit par voix 1 : garde ouverte, niveau changé pendant l'appel simulé, second read renvoie
   la nouvelle valeur. Corrigé : une seule lecture, capturée et réutilisée (`assertNiveauOuvert`
   accepte désormais un niveau déjà lu).
2. **ÉLEVÉ/MOYEN (voix 1 ET 2).** Ni la lecture `/api/sante` AUTO-01 ni la branche « mission >
   plafond » de `definirNiveauMission` ne pouvaient être éprouvées contre un dépassement réel — les
   deux packs existants (nep-fr, pcaob-sox) ne posent aucun plafond sous L2, rendant la comparaison
   structurellement TOUJOURS fausse (« une garde qui n'a jamais rien refusé n'est pas une garde »,
   règle 13). Corrigé : `depasseLePlafond` extraite en fonction PURE prenant le pack déjà résolu
   (testable avec un pack fictif, sans dépendre du registre réel) ; un test dédié mute
   temporairement `nepFr.automationLevel` (restauré en `finally`) pour prouver, par exécution, que
   `definirNiveauMission` refuse VRAIMENT contre un plafond abaissé.

**Un constat LOW/MEDIUM, disclosed, non corrigé** (`docs/BACKLOG_REPORTE.md`) : **R89** — « le
plafond du cabinet » est en réalité posé au niveau du PACK (code partagé par tous les cabinets sur
`nep-fr`/`pcaob-sox`), pas par locataire — un plafond propre à un cabinet précis exigerait
`firm_methodology` (DB, versionné), hors périmètre de ce mandat. Disclosed dans le commentaire du
champ (`packs/types.ts`), pas une régression de cette tranche : même limite déjà assumée par
`extrapolationMethod`/`attributeSampleConfidenceLevel`/`videoRetentionDays`, jamais nommée avant
cette revue.

**Mesures.** `npm run verify` (vitest complet, trois passes après les deux rounds de correctifs) :
**145 fichiers, 1135 tests, tous verts** (`EXIT=0` lu dans le journal brut). `npm run screens`
(balayage de PRODUCTION, trois passes) : **93 routes, 0 échec.**

**Ce mandat entier (§1, §3, §2) est maintenant COMPLET.** Aucune suite immédiate prévue par le
plan de tâches de cette session au-delà de la clôture de cette tranche — écran de fin de mandat
à composer une fois le SHA confirmé.

## Mandat 2026-09-14, §3 : le centre de notifications — NOTIF-01 (2026-09-14)

*Suite immédiate de §1.4-1.5 ci-dessous, dans le même souffle, sans attendre de retour (règle 32 —
le fondateur reste absent jusqu'à 19h). §5 du mandat place §3 (notifications) AVANT §2 (degré
d'automatisation) — l'ordre initial du plan de tâches de cette session avait les deux inversés,
corrigé avant de commencer. §3.1 : « Le centre de notifications ne possède aucun objet. C'est une
VUE sur les éléments préparés par l'IA et non encore validés — exactement l'inventaire que
`IaFlag`/`data-ia-prepare` vient de rendre exhaustif (R59). » Rien de nouveau à stocker : quatre
familles d'objets déjà réelles (écart de walkthrough candidat, déficience proposée, extraction en
attente de vérification, proposition de matérialité), chacune avec son geste humain déjà existant.*

**FAIT ET SERVI EN PRODUCTION — SHA `115ebc2`, confirmé DIRECTEMENT sur
`https://otto-dit.vercel.app/api/sante` à 12:26:31Z le 2026-09-14 (`identiteCoherente:true`, la
lecture NOTIF-01 elle-même `ok:true` en production, VIDE comme attendu sur un dossier sans élément
IA en attente).**

**`notifications.ts` (nouveau service).** `elementsIaNonValides(engagementId)` : les quatre
familles, chacune avec une identité réelle (un id qui existe en base) et un geste humain réel qui
la résout — jamais un formulaire dupliqué. `notificationsPourApprobation(userId)` : « ce que moi je
dois approuver », filtré par `can_sign` (`engagement_member`) sur mes dossiers — un collègue sans
`can_sign` sur un dossier n'y voit rien compté comme sien (§3.2, l'épreuve « le compte change selon
le rôle »), l'âge le plus ancien en tête. Deux catégories délibérément non couvertes, disclosed
R84/R85 (`wp_extra_cell` dérivé de l'extraction ; les réponses automatisées d'OTTO sans geste
d'approbation dédié).

**NOTIF-01 (§3.3, obstacles.ts).** Nouvelle famille `iaNonValide`, câblée dans `obstaclesAuVisa` —
tant qu'un élément IA reste non validé sur le dossier, il ne se signe pas. Même calcul que le centre
de notifications, jamais une seconde liste (`obstaclesIaNonValidee` appelle
`elementsIaNonValides`). Wiré comme obstacle BLOQUANT dès sa naissance (pas un avertissement,
contrairement à la pratique par défaut du dépôt pour une famille neuve) — justifié : le fait
bloquant ne peut exister QUE là où un élément réel reste à statuer, prouvé par une fixture de faux
positif dédiée (`IDS.engSox`, sans rien à statuer, famille muette — règle 25).

**Deux écrans.** `/eng/[id]/notifications` (nouveau, dossier par dossier — la destination de
l'obstacle NOTIF-01, déclarée dans `AILLEURS` de `rail.test.ts`, jamais depuis le rail). Un nouveau
panneau « Ce que je dois approuver » sur `/travaux` (cross-dossier, `tableauDeBord` étendu d'un
sixième champ `notifications`).

**Lecture `/api/sante` dédiée.** Vérifie le CÂBLAGE (pas juste l'existence) : tout élément IA non
validé doit compter comme obstacle de la famille `iaNonValide`, sauf sur une mission non acceptée
(garde-fou ajouté après la revue hostile, voir plus bas).

**DEUX RELECTEURS HOSTILES INDÉPENDANTS (règle 30 : multi-tenant + code de refus touchés), quatre
constats confirmés, tous corrigés avant expédition.**

1. **ÉLEVÉ (voix 2, reproduit par lecture attentive, pas juste « non testé »).** Le lien profond
   d'une notification d'extraction (`?item=`) lisait `request_item.sample_item_id` BRUT. Après un
   re-tirage (ADR-133), cet identifiant reste celui de la ligne D'ORIGINE — souvent *superseded* —
   alors que l'atelier de testing (`atelier.tsx`) ne cherche que parmi les lignes COURANTES. Un
   clic sur une telle carte n'aurait RIEN sélectionné, silencieusement — exactement le défaut que
   « jamais un formulaire dupliqué » (§3) interdit. Corrigé : la résolution réutilise
   `lignesAtelier()` elle-même (jamais une seconde implémentation du lignage, `LIGNAGE`) — chaque
   pièce y est déjà rattachée à SA ligne courante, remontée à travers `sample_item.repris_de`.
2. **MOYEN (voix 2).** `elementsIaNonValides` n'est pas gardée par l'acceptation de la mission,
   contrairement à `obstaclesAuVisa` qui s'arrête AVANT de calculer la famille `iaNonValide` sur une
   mission non acceptée (comportement partagé par TOUTES les familles, pas neuf). Conséquence
   étroite : la lecture `/api/sante` NOTIF-01 pouvait rougir À TORT sur une mission non acceptée
   portant déjà un élément IA. Corrigée avec un garde-fou dédié (`missionNonAcceptee`) ; l'asymétrie
   vue/obstacle elle-même reste un choix ASSUMÉ (§3.1 : une vue montre ce qui existe, pas ce qui
   bloque — et l'obstacle `acceptation` bloque déjà tout, inconditionnellement), disclosed R88.
3. **MOYEN (voix 1, reproduit en direct).** Le test d'étanchéité cross-tenant ne posait AUCUN
   élément réel sur le dossier étranger — il aurait passé même sans le filtre `CABINET`, prouvant
   uniquement qu'un dossier VIDE ne fuit rien. Corrigé : une vraie proposition de matérialité, sur
   le dossier étranger, avant d'affirmer qu'elle n'apparaît pas côté cabinet démonstration.
4. **BAS (voix 2).** Clé de catalogue `notif.niveau` définie (fr/en) mais jamais référencée —
   retirée.

**Câblage d'étanchéité structurel.** `notificationsPourApprobation` inscrite « par personne »
(`couverture-etancheite.test.ts`, `etancheite-executee.test.ts`, même patron que `mesTravaux`) —
sa preuve par EXÉCUTION vit dans `notifications.test.ts`, pas dans l'appel automatique (même
discipline que R62, revue hostile du 2026-09-13).

**Mesures.** `npm run verify` (vitest complet, deux passes après les deux rounds de correctifs) :
**144 fichiers, 1119 tests, tous verts** (`EXIT=0` lu dans le journal brut). `npm run screens`
(balayage de PRODUCTION, deux passes) : **93 routes, 0 échec** — `/eng/[id]/notifications` et
`/travaux` confirmés à 200 sous les deux packs (NEP et SOX). Un timeout isolé sur
`/eng/[id]/provenance` (SOX), jamais touché par cette tranche, a été observé UNE fois sous charge
parallèle complète puis n'a PAS reproduit sur deux relances indépendantes (isolée, puis la suite
complète) — artefact environnemental, pas une régression (même mécanisme que la flakiness de
`ctrl05-lecture.test.ts` documentée dans la tranche §1.4-1.5).

**Quatre constats reportés, non bloquants** (`docs/BACKLOG_REPORTE.md`) : **R84/R85** — deux
catégories d'éléments IA délibérément non couvertes (dérivation, absence de geste dédié). **R86** —
la branche riche du deep-link d'extraction (avec un `sample_item` réel) reste non couverte par
`notifications.test.ts` (fixture lourde), même si la revue hostile a confirmé son MÉCANISME correct
après le correctif ci-dessus. **R87** — pas encore de station `clics` dédiée (même prudence que R81,
`npm run clics` non fiable cette session, R80). **R88** — l'asymétrie vue/obstacle sur une mission
non acceptée, choix assumé (voir constat 2 ci-dessus).

**§2 (degré d'automatisation, AUTO-01/AUTO-02) suit immédiatement**, dans le même souffle, sans
attendre de retour (règle 32).

## Mandat 2026-09-14, §1.4-1.5 : l'anomalie écartée (EXTRAP-03) et le raccordement au registre (2026-09-14)

*Suite immédiate de §1.2-1.3 ci-dessous, dans le même souffle, sans attendre de retour (règle 32 —
le fondateur reste absent jusqu'à 19h). §1.4 : l'écartement d'un écart comme anomalie non
représentative (ISA 530 §13) exige DEUX choses, jamais une seule — une justification ÉCRITE et une
preuve ADDITIONNELLE obtenue spécifiquement pour cet écartement, distincte de la preuve qui fondait
déjà l'écart d'origine. §5(e) définit l'anomalie comme un écart DÉCOUVERT DANS L'ÉCHANTILLON — donc
une ligne `kind='projected'` (l'extrapolation de toute une strate à sa population, §14) ne peut
JAMAIS être écartée : ce n'est pas une anomalie au sens de la norme, quelle que soit la preuve
fournie. §1.5 point 1 : un écran de test de contrôles (OE) ne montre jamais de projection — le taux
de déviation observé sur l'échantillon EST déjà le taux projeté sur toute la population (§A20).
§1.5 point 2 : la projection doit alimenter le registre des écarts pré-existant, pas vivre à côté.*

**FAIT ET SERVI EN PRODUCTION — SHA `82816c2`, poussé sur `main` par avance rapide depuis
`claude/otto-session-resume-zimig9`. SHA servi mesuré directement sur
`https://otto-dit.vercel.app/api/sante` à 10:46:07Z le 2026-09-14 : encore `021e867` (le déploiement
n'avait pas rattrapé le push au moment de cette mesure) — SHA servi à reconfirmer dans une tranche
ultérieure, règle 36 : on n'attend pas les ~15 minutes de CI dans le même tour, on enchaîne.**

**EXTRAP-03 (`dismissMisstatementAsAnomaly`, `services/matching.ts`).** Refuse : écart déjà écarté,
absence de justification écrite, absence de preuve, preuve non distincte de celle de l'écart
d'origine (quand `exception.evidence_id` est posé), et — le garde-fou central de cette tranche —
toute ligne `kind='projected'`, sans exception. Migration 0162 : `misstatement` reçoit
`sample_evaluation_id`, `dismissed_reason`, `dismissed_evidence_id`, `dismissed_by`, `dismissed_at`,
et un index unique partiel empêchant deux lignes projetées pour la même évaluation.
`membre.ts::ObjetFils` étendu avec `'misstatement'` (résolution `engagement_id` par jointure) pour
qu'`assertMembreDe` couvre ce nouveau chemin d'écriture (ETANCH-01/03/04/05).

**§1.5 point 1 — la phrase OE (`rcm/[cid]/page.tsx`).** Le taux de déviation est calculé en
OCCURRENCES DISTINCTES sur le total testé (`new Set(deviations.map(d => d.instance_label)).size /
gridLabels.length`), jamais en tests d'attributs — la même convention, déjà éprouvée, que
`sox.ts`. Aucune projection ne s'affiche sur cet écran ; la phrase le dit explicitement.

**§1.5 point 2 — le raccordement au registre (`concludeEvaluation`, `services/evaluation.ts`).**
Une conclusion avec projection non nulle insère désormais automatiquement une ligne
`kind='projected'` dans `misstatement`, liée par `sample_evaluation_id`. Pour éviter de compter deux
fois le même argent (les lignes brutes de la strate aléatoire QUI ONT SERVI à la projection, et leur
propre récapitulatif projeté), migration 0163 ajoute `rolled_into_projection` (booléen, jamais une
suppression — règle 28) ; `concludeEvaluation` marque exactement les lignes qui ont nourri le calcul
(même prédicat que `computeSampleEvaluation`), et `exceptions/page.tsx` exclut ces lignes de
`totalNonCorrigeCents` tout en gardant un indicateur visible sur chaque ligne exclue (jamais une
exclusion silencieuse — règle 13). Le panneau du nombre d'écartements (`dismissedCount`) est rendu
INCONDITIONNELLEMENT, hors de la garde `misstatements.length > 0`.

**Deux revues hostiles indépendantes (règle 30 : modèle de données + multi-tenant + code de refus
touchés), quatre constats confirmés, tous corrigés avant expédition.**

1. **CRITIQUE (voix 1, reproduit en direct).** Le contrôle « preuve distincte » ne s'exécutait que
   `si exception_id` était posé — or la ligne auto-insérée `kind='projected'` a TOUJOURS
   `exception_id = null`. N'importe quelle preuve, même sans rapport, pouvait donc écarter toute une
   extrapolation de population. Corrigé : un refus inconditionnel sur `kind === 'projected'`, avant
   tout autre contrôle, quelle que soit la preuve fournie.
2. **ÉLEVÉ (les deux voix, indépendamment, mêmes chiffres réels : 13,3 % contre 25,0 % sur le
   contrôle C-BR-01 de la démo).** La phrase OE utilisait `deviations.length / grid.length`
   (tests d'attributs au dénominateur) — contredisant la convention déjà établie et déjà éprouvée
   dans `sox.ts`. Corrigé (voir §1.5 point 1 ci-dessus).
3. **ÉLEVÉ (voix 2, reproduit en direct par une édition de test temporaire, chiffres mesurés puis
   révertés : écart de 175 000 centimes / 1 750 €).** Le total du registre sommait à la fois les
   lignes brutes de la strate aléatoire ET leur propre ligne `kind='projected'` — un double comptage
   du même argent. Corrigé par `rolled_into_projection` (voir §1.5 point 2 ci-dessus).
4. **BAS-MOYEN (voix 1, reproduit en direct).** `concludeEvaluation` n'avait aucune garde contre un
   second appel sur une évaluation déjà `concluded` — une soumission de formulaire dupliquée ou
   rejouée aurait réécrit `conclusion_basis`/`concluded_by`/`concluded_at` en silence. Corrigé :
   garde explicite en tête de fonction.

**Deux constats reportés, non corrigés cette tranche, honnêtement consignés
(`docs/BACKLOG_REPORTE.md`).** **R82** — le contrôle de preuve distincte reste structurellement
inerte pour toute exception qui ne pose jamais `evidence_id` (`manual_journal_flag`,
`verification_disagreement`, `reconciliation_diff`) ; corriger exigerait de tracer toute la chaîne
de preuve, hors périmètre du mandat. **R83** — `workpapers/draft.ts` (non modifié par cette tranche)
liste désormais des lignes `dismissed`/`projected` réellement atteignables sans les distinguer dans
sa prose, contrairement au registre ; cosmétique, code pré-existant.

**Investigation d'un échec transitoire (`ctrl05-lecture.test.ts`, règle 18 : une hypothèse plausible
se prouve, elle ne se suppose pas).** Sous la suite complète en parallèle, deux tests de ce fichier
ont échoué une fois (`/api/sante` rendant 500 au lieu de 200). Vérifié par DEUX voies indépendantes :
(a) le fichier seul, isolé, passe 5/5 proprement ; (b) la suite complète, rejouée, passe 143/143 et
1107/1107 proprement. La voix 2 de la revue hostile a expliqué le mécanisme sans avoir besoin de
trouver un bug : le statut final de `/api/sante` est `200` seulement si LES ~40+ lectures passent
toutes — une seule lecture qui bronche transitoirement, même sans rapport avec cette tranche, fait
tomber toute la route à 500. Conclusion : artefact environnemental sous charge parallèle, pas une
régression introduite par cette tranche — consigné ici plutôt que tu, jamais réaffirmé comme un
défaut réel sans l'avoir revérifié.

**Mesures.** `npm run verify` (vitest complet) : **143 fichiers, 1107 tests, tous verts** (`EXIT=0`
lu dans le journal brut, jamais le résumé du harnais — règle 35). `npm run screens` (balayage de
PRODUCTION, couvrant `exceptions/page.tsx` et `rcm/[cid]/page.tsx`, les deux écrans réellement
modifiés) : **91 routes, 0 échec.** `npm run clics` n'a PAS été étendu à EXTRAP-03 cette tranche —
R81, prudence délibérée le jour même où R80 documente `clics` comme non fiable cette session ; le
chemin humain EXISTE (formulaire sur `exceptions/page.tsx`) mais sa preuve CLIQUÉE manque encore.
Deux nouveaux tests de régression ciblés (`s5s6.test.ts`) couvrent spécifiquement le constat CRITIQUE
et le double comptage corrigé.

**§2 (degré d'automatisation, AUTO-01/AUTO-02) suit immédiatement**, dans le même souffle, sans
attendre de retour (règle 32).

## Mandat 2026-09-14, §1.2-1.3 : l'extrapolation ISA 530 — EXTRAP-01/02/04 (2026-09-14)

*Mandat du fondateur (`docs/MANDATS/2026-09-14_mandat_extrapolation_automatisation_notifications.md`,
commité verbatim, règle 33), dicté avant une absence de douze heures : finir R59/ADR-103 d'abord
(fait, SHA `5a95da7` confirmé), puis travailler ce mandat dans l'ordre de son §5, sans s'arrêter entre
tranches. « La méthodologie d'extrapolation du §1 vient du texte publié de l'ISA 530, citée avec les
numéros de paragraphe — la norme EXIGE la projection mais ne prescrit aucune formule, donc la méthode
est un paramètre de cabinet et rien ne s'affiche tant qu'elle n'est pas posée. N'ajoute pas une
quatrième méthode, un seuil ou un facteur de mémoire. » Rien dans cette tranche ne touche la clé, la
garde de budget ou les sélecteurs.

**FAIT ET SERVI EN PRODUCTION — le moteur des trois quantités, EXTRAP-01/02/04.** SHA `021e867`,
mesuré DIRECTEMENT sur `https://otto-dit.vercel.app/api/sante` à 09:55:57Z le 2026-09-14
(`identiteCoherente:true`, la lecture EXTRAP-01 elle-même `ok:true` en production : « 1 évaluation(s)
conclue(s), toutes avec une projection quand la strate sondée portait un écart »). Trois grandeurs jamais confondues :
écart CONNU (strate exhaustive à 100 %, `known_misstatement`), écart PROJETÉ (extrapolation de la
strate SONDÉE à sa propre population — jamais la population entière, `projected_misstatement`), et
leur somme comparée à l'anomalie tolérable. Trois méthodes de projection, exactement celles du
mandat, aucune autre : unités monétaires, ratio, différence (`kernel/projection.ts`, vérifiées par
dérivation manuelle DEUX FOIS, par les deux relecteurs hostiles indépendamment). La méthode elle-même
reste un paramètre de cabinet (`SubstantiveConfig.extrapolationMethod`, `packs/types.ts`), `undefined`
par défaut dans `nep-fr.ts` — EXTRAP-04, règle 8 : rien n'est écrit de mémoire, rien ne s'affiche tant
que le cabinet n'a pas choisi. Migrations 0159 (méthode `unites_monetaires` ajoutée à la contrainte
CHECK existante, idiome de recherche dynamique du nom de contrainte déjà établi en 0150/0151), 0160
et 0161 (détail ci-dessous).

**Le premier `verify` complet a été TUÉ en cours de route (règle 34), pas attendu.** Une édition de
fond pendant son exécution (le correctif round 2 ci-dessous) l'a invalidé ; il a été tué immédiatement
et le fait est consigné ici plutôt que caché.

**Round 1 (superseded) — EXTRAP-01 trop large.** La première implémentation bloquait la conclusion dès
qu'une strate sondée EXISTAIT (`tested_random_amount > 0`), sans regarder si elle portait un écart —
plus large que l'exemple d'acceptation du mandat lui-même (« un poste sondé AVEC UN ÉCART »).

**Round 2 — `random_misstatement` (migration 0160), puis la découverte que la strate sondée de la
démo est PROPRE par construction.** Migration 0160 ajoute `sample_evaluation.random_misstatement` —
l'écart BRUT (non projeté) de la strate sondée, toujours calculé, que la méthode soit vérifiée ou non.
`concludeEvaluation`, la lecture `/api/sante`, `draft.ts::projectionRationale` et `testing/page.tsx`
rebranchés dessus. En reconstruisant `part1.ts::spotcheckAndEvaluate()` sous ce critère corrigé, il
est apparu que les cinq anomalies plantées dans le monde de démonstration (cut-off, double
comptabilisation, surfacturation, quantités non livrées, écriture manuelle) sont TOUTES rattachées à
des pièces sélectionnées par le RISQUE (`high_value`/`risk_flag`, exhaustives par construction) —
jamais par le tirage aléatoire pur. C'est le comportement ATTENDU de l'audit par le risque (les
pièces à risque sont sélectionnées précisément pour attraper les anomalies là), pas un trou :
`spotcheckAndEvaluate()` a donc été restaurée à sa forme D'ORIGINE (texte de conclusion verbatim
retrouvé dans l'historique git), et conclut directement — EXTRAP-01 ne la bloque plus, correctement.

**DEUX relecteurs hostiles indépendants (règle 30 : modèle de données + code de refus touchés), même
défaut trouvé séparément.** `random_misstatement` est une somme SIGNÉE. Deux écarts RÉELS qui se
compensent exactement (+500 €/-500 €, deux lignes distinctes, chacune un vrai écart non corrigé et non
investigué) sommaient à 0 : EXTRAP-01 lisait la strate comme PROPRE alors que deux écarts existent — le
mandat parle de la PRÉSENCE d'écarts, jamais de leur somme nette. Une seconde observation (voix 1) :
`draft.ts` affirmait « Anomalies projetées : 0,00 € » puis, dans la phrase suivante, « aucune
projection ne s'affiche, méthode non vérifiée » — une contradiction dans le même paragraphe (règle 13).

**Round 3 (correctif, les deux constats confirmés corrigés) — `random_misstatement_count` (migration
0161).** Le NOMBRE de lignes d'écart de la strate sondée, indépendant du signe, toujours calculé.
`concludeEvaluation`, la lecture `/api/sante` et `draft.ts::projectionRationale` se branchent
désormais dessus (`random_misstatement`, la somme signée, reste inchangée — c'est la valeur que la
projection elle-même utilise une fois la méthode vérifiée). `draft.ts` ne présente plus la clause
« Anomalies projetées » quand il n'y a rien à annoncer. `kernel.test.ts` : nouveau cas adversarial
fabriqué (+500/-500, somme nette 0, compte 2) prouvant que le compte survit là où la somme trompe.
`s5s6.test.ts` : nouveau test D'INTÉGRATION — jusqu'ici EXTRAP-01 n'était éprouvé qu'au niveau
UNITAIRE (`evaluateSample()` en isolation) ; ce test fabrique un écart réel sur un élément de la
strate sondée (base réelle, PGlite) et confirme que `concludeEvaluation()` lève VRAIMENT.

**Mesures.** `npm run verify` (vitest complet) : **143 fichiers, 1104 tests, tous verts** (`EXIT=0`
lu directement dans le journal brut, jamais dans le résumé du harnais — règle 35, forme opérative).
`npm run screens` (balayage de PRODUCTION, celui qui couvre l'écran réellement modifié,
`testing/page.tsx`) : **91 routes, 0 échec.** `npm run clics` n'a **PAS** pu être conduit à son terme
cette session malgré six tentatives — détail complet, honnête, dans `docs/BACKLOG_REPORTE.md` (R80).
Le premier échec RÉEL (pas un délai dépassé) tombe sur « balances aux. : le candidat proposé attend
une confirmation HUMAINE au registre » (`scripts/clics/scenario.ts:681`) — un écran SANS AUCUN lien
avec cette tranche, jamais touché par elle. `npm run screens`, qui COUVRE l'écran effectivement
modifié, est propre. La tranche est expédiée sur cette base : verify complet vert, screens propre,
deux revues hostiles avec leurs constats corrigés — sans un `clics` propre, consigné plutôt que tu.

**Deux constats reportés, non bloquants** (`docs/BACKLOG_REPORTE.md`) : **R78** — la lecture
`/api/sante` EXTRAP-01 n'a pas encore son fichier de cas connu mauvais dédié (le patron des ~15
lectures sœurs du même fichier) ; le refus réel, lui, est éprouvé par le nouveau test d'intégration.
**R79** — un trou pré-existant, trouvé indépendamment par les deux voix, non introduit par cette
tranche et inatteignable aujourd'hui (`computeSampleEvaluation` ne filtre pas ses anomalies par
`sample.id`, seulement par `engagement_id`) — son rayon d'impact grandit du fait que
`random_misstatement_count` porte désormais un refus, pas seulement un affichage ; à corriger le jour
où un chemin réel l'atteint.

**§1.4-1.5 (l'anomalie écartée comme non représentative, EXTRAP-03) suit immédiatement**, dans le
même souffle, sans attendre de retour (règle 32 — le fondateur est absent jusqu'à 19h).

## R59/ADR-103 : le composant IaFlag, data-ia-prepare — R59 fermé par une voie différente (2026-09-14)

*Mandat du fondateur (message du 2026-09-13, après confirmation de la tranche d'énumération) :
« R59 / ADR-103: option (b) confirmed. Fold it into the token system, and re-express ADR-103's
intent as a mechanical test — an AI-prepared item must be impossible to miss — so the test
carries it, not the stylesheet. Freeze the property, never the appearance. »*

**FAIT ET SERVI EN PRODUCTION.** SHA `5a95da7`, confirmé DIRECTEMENT sur
`https://otto-dit.vercel.app/api/sante` à 06:26:11Z le 2026-09-14 (`identiteCoherente:true`).

R59 (D.6 point 2, « le rail n'ouvre par défaut que les groupes portant du travail ») était bloqué
depuis le 8 septembre sur une tension réelle avec ADR-103 (le rail grisé-avec-raison, jamais
masqué sans explication). Le fondateur a tranché ADR-103 LUI-MÊME plutôt que de choisir entre les
deux options exposées — et a substitué un invariant DIFFÉRENT à la place du plafond de
destinations envisagé : tout contenu que l'IA a préparé (plafond HITL L2, règle 7 — « l'IA
prépare, un humain revoit et approuve ») doit être IMPOSSIBLE À MANQUER, porté par une PROPRIÉTÉ
testable plutôt que par une apparence.

**Avant cette tranche**, la seule preuve qu'un champ venait de l'IA était la classe CSS `.ai-flag`
(`globals.css`, jetons `--violet`/`--violet-soft` déjà posés par le repass design R60-R62) — une
apparence, jamais une propriété que quoi que ce soit pouvait chercher sans deviner une couleur.

**Construit** : le composant `IaFlag` (`src/app/ia-flag.tsx`) pose `data-ia-prepare="true"` EN
MÊME TEMPS que la classe visuelle — devenu la SEULE façon de marquer un contenu préparé par l'IA.
Huit sites existants migrés (`workpapers/[wid]`, `materiality`, `notes`, `testing/atelier`,
`dashboard`, `reunions` ×2). **Deux sites réels trouvés SANS AUCUN marqueur** (recherche dédiée,
pas seulement un grep du nom de classe) dans `rcm/[cid]/page.tsx` : la table entière des écarts de
walkthrough candidats (chaque ligne vient de l'analyse IA du transcript, jamais d'une saisie
humaine — corrigée en posant l'attribut sur chaque `<tr>`) et la sévérité de déficience PROPOSÉE
(`severity_proposed`, tant que `severity_final` reste null — une fois décidée par un humain, plus
de marqueur, comme il se doit).

**Garde de régression engendrée** (`scripts/audit/ia-flag-source.ts`, règle 21) : refuse tout
usage brut de `className="ai-flag"` en dehors du composant — la classe et l'attribut ne peuvent
plus se séparer. **Assertion clics ajoutée** à la station walkthrough déjà existante
(`scripts/clics/scenario.ts`) : chaque écart candidat porte le marqueur, éprouvé sur du DOM RENDU
avec de VRAIES données IA (le rejeu de la fixture), pas seulement en source.

**Revue hostile, UN réfutateur (règle 30, amendement du 8 septembre — cette tranche ne touche ni
le modèle de données, ni la sécurité, ni le multi-tenant, ni un code de refus)** : **un défaut réel
confirmé et corrigé avant fusion.** La première version de la garde de régression ne cherchait
qu'une classe SEULE sur sa ligne — `className={\`ai-flag ${x}\`}` (un gabarit AVEC interpolation,
l'idiome DÉJÀ en usage ailleurs dans ce dépôt : `carry-forward/page.tsx`, `team/page.tsx`,
`suivi/page.tsx`) et `clsx('ai-flag', x)` passaient tous deux inaperçus — et l'en-tête du script
affirmait À TORT couvrir le premier cas. **Corrigé** en extrayant chaque chaîne et chaque gabarit
(multi-lignes compris) du fichier entier plutôt que de raisonner ligne par ligne, avec un cas connu
mauvais qui rejoue les deux formes dans un seul fichier de sonde. Limitation restante nommée
honnêtement (règle 19) : une classe construite par concaténation (`'ai-' + 'flag'`) reste
indétectable par un balayage lexical — aucun site connu ne le fait. La revue a aussi confirmé,
en lisant le code réel (pas le résumé de la tranche) : `deficiency` est lu FRAIS à chaque requête
par un composant serveur (aucun risque d'hydratation divergente sur `severity_final == null`) ;
`IaFlag` fonctionne sans risque depuis un composant client (`testing/atelier.tsx`) ; les huit sites
migrés n'ont perdu aucune prop (`style` correctement propagé) ; la sélection clics est bien scopée
et son assertion tourne AVANT les décisions qui suivent dans la même station ; `severity_final` et
`status` sont toujours écrits en LOCKSTEP par `decideDeficiency` (aucun cas où `== null` diverge de
`status === 'proposed'`) ; `.ai-flag` (la classe CSS elle-même) n'a pas été touchée.

**Verify complet, deux passages** (le premier sur le commit avant correctif, le second — celui qui
compte — sur le commit final après la revue) : **143/143 fichiers vitest, 1095/1095 tests** ·
gardes **44** · langue **0 chaîne hors catalogue** · lectures **0 perdue sur 1716 chemins** ·
parcours **240 stations figées vérifiées** · screens (dev + production) **91 + 53 routes, 0
échec** · densité **81 écrans, 0 au-delà de 5 actions** · clics **260 étapes, 1 échec** (le même
#418 déjà documenté, fil n°7 de `docs/CHASSE.md` — un contrôle SOX DIFFÉRENT à chaque passage,
signature de timing déjà connue, sans rapport avec cette tranche) · visuel **328 vues, 0 défaut**,
relancé SÉPARÉMENT (`npm run clics` bloque la chaîne `&&` avant `visuel` — précédent déjà posé
pour R74, `docs/BACKLOG_REPORTE.md`).

**Ce qui reste, dans l'ordre** : rien côté R59 lui-même — fermé. Un mandat neuf du fondateur
(`docs/MANDATS/2026-09-14_mandat_extrapolation_automatisation_notifications.md`, commité verbatim
avant exécution, règle 33) attend en §5 : extrapolation ISA 530, notifications (vue sur
`data-ia-prepare`, exactement ce que cette tranche vient de rendre exhaustif), degré
d'automatisation L0-L3. Prochaine tranche.

## Tranche d'énumération « IA vivante » : R76 + R77, garde structurelle (2026-09-13)

*Mandat du fondateur (message du 2026-09-13, après confirmation de R74/entretiens.ts en
production) : « Do not create a key. One already exists… before the enumeration tranche, answer
one factual question with a measurement, not a guess : is ANTHROPIC_API_KEY currently set in the
Vercel environment… enumerate every site that can reach the provider or read
ANTHROPIC_API_KEY, as a generated artifact ; close every one outside assertBudgetActifEnBase, R76
included, each with its own known-bad case… add the test that makes a fourth ungated site
impossible. » Interdit explicite, tenu à la lettre : **la clé n'a été ni créée, ni demandée, ni
exportée, ni imprimée.**

**Réponse à la question factuelle, honnête plutôt que devinée.** Aucun outil de cette session ne
liste les variables d'environnement Vercel (`get_project`, `list_projects`, `get_deployment`
vérifiés — aucun n'expose de nom de variable) ; le CLI Vercel local est présent mais non
authentifié dans ce bac à sable. **La présence réelle d'`ANTHROPIC_API_KEY` côté Vercel n'a donc
pas pu être mesurée.** Le fait de code disponible, lui, est vérifié directement (`demoPublique()`,
`src/lib/core/demo-public.ts`) : `VERCEL === '1'` est posé par la PLATEFORME Vercel elle-même sur
CHAQUE build/exécution, tous scopes confondus (production, preview, development) — donc
`demoPublique()` est VRAIE inconditionnellement sur Vercel, quoi que contiennent
`OTTO_TRANSCRIPT_ADAPTER`/`OTTO_WALKTHROUGH_ADAPTER`/`OTTO_OCR_ADAPTER` ou la clé elle-même, et les
quatre fabriques d'adaptateur (`getAnalyste`, `getAnalysteWalkthrough`, `getOcrAdapter`,
`getQueryPlanner`) le vérifient EN PREMIER. Ceci ne prouve pas l'absence de la clé côté Vercel —
seulement que sa présence là-bas ne change rien à ce que ces quatre fabriques retournent
aujourd'hui.

**FAIT ET SERVI EN PRODUCTION — l'énumération complète, engendrée, jamais rédigée à la main**
(`scripts/audit/ia-vivante.ts`, règle 21). Balaye `src/` ET `scripts/` (la première version du
script ne couvrait que `src/` et ratait `scripts/eval/entretien.ts`, qui construit
`AnthropicAnalyste` directement, hors fabrique — corrigé avant la première exécution retenue).
Suit deux façons d'atteindre le fournisseur : une fabrique exportée (`export function get...(`)
et une instanciation directe d'une classe `Anthropic<Quelque chose>`. Commentaires neutralisés
avant balayage (`sansCommentaires()`) pour ne pas confondre une mention en prose avec un appel
réel. Sortie : `docs/IA_VIVANTE_SURFACE.md` (lisible) et `docs/instantanes/ia-vivante.json`
(donnée), régénérés à chaque exécution — **7 points d'accès connus, 0 appel non gardé au SHA
`37cf025`.**

**Neuf sites trouvés au total, tous fermés** : deux déjà gardés (`entretiens.ts`,
`walkthrough-analyse.ts`, tranches précédentes) ; **R76** — `extraction/ladder.ts::extractEvidence()`
n'appelait ni `assertBudgetActifEnBase()` ni ne passait l'adaptateur explicitement (le troisième
paramètre de `runLadder()` avait un défaut silencieux vers `getOcrAdapter()`) ; **R77, un
troisième site trouvé PAR cet audit, pas connu avant lui** — `query/ask.ts` (le planificateur
« Interroger ») n'appelait NI `assertBudgetActifEnBase()` NI MÊME `gardeBudget()`, un trou plus
large que R76 ; quatre scripts CLI (`scripts/eval/entretien.ts`, `scripts/eval/pieces-neuves.ts`,
`scripts/cost/measure.ts`, `scripts/eval/run.ts`) gardés de la même façon, chacun observé EN
DIRECT refusant sans appel réseau (`scripts/cost/measure.ts` a, par erreur, écrasé le
`COST.md` git-suivi avec un enregistrement de run bloqué pendant cette observation — repéré
immédiatement par `git diff`, reverté avant tout commit ; aucune autre sonde n'a touché de fichier
suivi). Patron uniforme : `assertBudgetActifEnBase()` AVANT `gardeBudget()`, sauté seulement si
`adapter.name === 'mock'` — sauf `query/ask.ts`, sur liste d'AUTORISATION
(`planner.name === 'anthropic'`) plutôt qu'exclusion, pour ne pas accidentellement garder le
double de test `name:'test'` qu'un test préexistant affirme voir dans `ai_run`.

**La garde structurelle, le livrable explicitement demandé**
(`scripts/audit/ia-vivante.test.ts`) : rejoue le MÊME balayage à chaque `vitest run`, jamais un
instantané figé. Trois épreuves : (1) **cas connu mauvais** — un fichier de sonde fabriqué,
écrit sous `scripts/audit/` puis supprimé dans le même test (règle 24), imitant un site réel non
gardé (`new AnthropicAnalyste()` sans `assertBudgetActifEnBase(`) — le détecteur DOIT le voir,
sinon il ne détecte rien de réel non plus ; (2) zéro appel non gardé sur le vrai balayage ; (3) le
compte de points d'accès est épinglé à 7, pour qu'un site apparu ou disparu SANS que ce test
change soit lui-même le signal d'un trou.

**Deux revues hostiles indépendantes (règle 30 — garde de budget touchée), deux défauts
confirmés, tous deux corrigés avant fusion** — aucune n'a trouvé de défaut dans l'ordre des
gardes elles-mêmes (vérifié ligne par ligne par chaque voix : la garde précède toujours tout appel
réseau et toute écriture, dans les cinq sites de service/CLI et l'audit lui-même) :
1. **`eval.test.ts` appelait `runLadder()` avec `getOcrAdapter()`** — sensible à `OTTO_OCR_ADAPTER`
   ambiant — alors que `runLadder()` lui-même NE GARDE RIEN (la garde IA-BUDGET-01 ne vit que dans
   `extractEvidence()`, que cette suite ne passe jamais). Un poste de développement ayant suivi la
   remédiation IMPRIMÉE par `scripts/cost/measure.ts` (`export OTTO_OCR_ADAPTER=anthropic` +
   `export ANTHROPIC_API_KEY=…`) sans désexporter aurait fait partir un appel réseau réel au
   premier `npm test` — règle 4 (zéro appel externe dans la suite), un risque introduit avant
   cette tranche mais touché par elle sans être fermé. **Corrigé** : l'adaptateur mock est
   construit en dur (`new ReplayOcrAdapter()`), plus aucune dépendance à l'environnement du shell
   — le propre commentaire du fichier promettait déjà « zero network », c'est maintenant garanti
   par construction.
2. **L'en-tête de `ia-vivante.ts` ne nommait pas sa propre imprécision** (règle 19) :
   `gardeeParAssertBudget` teste la présence du littéral `assertBudgetActifEnBase(` n'importe où
   dans le FICHIER de l'appelant, pas près du site d'appel précis ni lié à l'adaptateur précis
   appelé — un fichier avec deux sites distincts, l'un gardé et l'autre non, marquerait les DEUX
   « GARDÉ ». Aucun fichier connu n'a deux sites distincts aujourd'hui (vérifié à la main par les
   deux voix) ; **nommé** dans l'en-tête, artefact régénéré byte-identique après le correctif. Une
   troisième observation de la même voix 1 (la fabrique reconnue est `export function get...(`
   seulement, pas `export const getX = () => ...`) était déjà elle aussi corrigée dans l'en-tête
   avant que la seconde voix ne rende son verdict.

Verify complet rejoué (`--maxWorkers=2`) : **142/142 fichiers vitest** · screens (dev + production)
**91 + 53 routes, 0 échec** · densité **81 écrans, 0 au-delà de 5 actions** · clics **259 étapes,
2 échec(s)** (le même #418 déjà documenté, fil n°7 de `docs/CHASSE.md`, sans rapport avec le code
de cette tranche — extraction/query/eval, jamais l'hydratation React) · parcours figé **240
stations vérifiées**.

**SHA `37cf025`, confirmé DIRECTEMENT sur `https://otto-dit.vercel.app/api/sante` à 19:00:09Z le
2026-09-13** (`identiteCoherente:true`, toutes les lectures passent), et par le déploiement Vercel
lui-même (`READY`, ~103 s de build, aliasé sur `otto-dit.vercel.app`). `IA-BUDGET-01` lit toujours
« fermée — aucune garde de budget active en base (défaut, mandat §4) » : aucun geste de cette
tranche ne l'a ouverte, ni le SQL du fondateur n'a été exécuté par cette session (interdit
explicite du mandat — c'est SON geste, après ce message).

**Ce qui reste, dans l'ordre** : le fondateur peut maintenant exécuter lui-même le SQL
`ia_vivante_budget` (plafond 2 USD, son nom, sa main) — troisième geste distinct après la clé et
le sélecteur d'adaptateur, aucun substituable ; R59/ADR-103 (option b confirmée par le fondateur —
la replier dans le système de jetons, ré-exprimer ADR-103 en test mécanique) reste à construire,
non commencée ici, hors périmètre explicite de cette tranche ; R75 (`sonde.station()` jamais
câblée) reste ouvert, non touché ici.

## Correctif fondateur : IA-BUDGET-01 câblée dans entretiens.ts (2026-09-13)

*Le fondateur, en confirmant R74 en production, a relevé que le compte rendu enterrait le fait le
plus important sous « deux fils annexes » : `IA-BUDGET-01` existe depuis le 9 septembre et R74 en
est le PREMIER site d'appel réel — pendant que `entretiens.ts` (le chemin réel des entretiens de
processus, déjà construit) ne l'appelait toujours pas. Son mot : « A guard that nothing called is
not a guard, and a guard with an uncalled sibling path is worse — it looks closed while a door
stands open. » Demande explicite : fermer ça AVANT toute autre chose, prouvé par un cas connu
mauvais, deux voix hostiles — puis seulement les trois réponses (a, b, c) déjà dues, puis le fil
`sonde.station()`.**

**FAIT ET SERVI EN PRODUCTION.** `assertBudgetActifEnBase()` (IA-BUDGET-01) est désormais appelée
AVANT `gardeBudget()` dans `entretiens.ts::analyserTranscript`, exactement comme dans
`walkthrough-analyse.ts` — même patron, même ordre. **Cas connu mauvais** (`entretiens.test.ts`) :
un entretien avec transcript déposé, `OTTO_TRANSCRIPT_ADAPTER=anthropic` posé, garde EN BASE
fermée (défaut) — REFUS avec `/IA-BUDGET-01/`, zéro ligne écrite dans `transcript_gap`, zéro appel
réseau. Deux revues hostiles indépendantes (règle 30 — garde de budget touchée) : **AUCUN défaut
confirmé.** Les deux voix ont vérifié, chacune de bout en bout : l'ordre des opérations (la garde
avant tout appel/écriture) ; qu'aucun TROISIÈME chemin de ce dépôt n'atteint un adaptateur réel
sans passer par cette garde (le seul autre gap connu, `extraction/ladder.ts`, reste hors périmètre
de ce correctif, déjà consigné à part) ; la logique de refus de `assertBudgetActifEnBase()`
elle-même, champ par champ (`actif`, `plafondUsd`, `activePar`, `activeLe`) contre un état malformé
ou absent ; l'hygiène du nouveau test (isolation par fork vitest, restauration de
`process.env.OTTO_TRANSCRIPT_ADAPTER` et de la garde en base dans un `finally`). Les commentaires
qui affirmaient « aucun chemin réel n'appelle cette garde » (`budget.ts`, `walkthrough-analyse.ts`,
`walkthrough-analyse.test.ts`) ont été corrigés plutôt que laissés à mentir par paresse (règle 13).

Verify complet rejoué (`--maxWorkers=2`, la défense déjà mesurée contre R58) : **140/140 fichiers,
1087/1087 tests** · gardes/semeur/plancher/langue/lectures/parcours/screens/fumée/densité tous
verts · clics **259 étapes, 1 échec** (le même #418 déjà documenté sur la station walkthrough,
septième occurrence identique, docs/CHASSE.md) · visuel **328 vues, 0 défaut**.

**SHA `9862ce3`, confirmé DIRECTEMENT sur `https://otto-dit.vercel.app/api/sante` à 15:34:50Z le
2026-09-13** (`identiteCoherente:true`), et par le travail CI `deploye` (succès à 15:32:19Z, deux
minutes après la fusion). `IA-BUDGET-01` lit toujours « fermée — aucune garde de budget active en
base (défaut, mandat §4) » : le correctif ne l'a pas ouverte, il a seulement fait en sorte qu'elle
soit VRAIMENT interrogée sur le chemin `entretiens.ts`.

## R74 (§4 point 3) : l'adaptateur d'analyse de walkthrough — tout ce qui ne demande PAS la clé (2026-09-13)

**COMPLET ET SERVI EN PRODUCTION.** SHA `b3115b2`, confirmé DIRECTEMENT sur
`https://otto-dit.vercel.app/api/sante` à 14:29:58Z le 2026-09-13 (`identiteCoherente:true`), et
par le travail CI `deploye` (« le SHA poussé doit être servi dans les 15 minutes », succès à
14:23:32Z, quatre minutes après la fusion). La nouvelle lecture « walkthrough : aucun écart
devenu tâche sans tâche RÉELLE liée » est présente et verte (VIDE — aucun écart encore, la
production n'a pas encore d'usage réel). `IA-BUDGET-01` lit « fermée — aucune garde de budget
active en base (défaut, mandat §4) » : la garde reste au défaut fermé, exactement comme
l'interdit permanent l'exige — aucun geste de cette tranche ne l'a ouverte.

*Mandat du fondateur (message du 2026-09-13, en réponse au repass design) : « start building R74 —
everything that does NOT need the key: the schema, the service, the in-DB budget gate wiring, the
L2 human-review screen, the /api/sante reading, the clics station, the replayed tests… The
credential is the LAST wire, not the first. Stop cleanly at that wire and say so. » Les points 1
et 2 du même message (nommer les deux variables d'environnement précisément, et l'état de la
tension R59/ADR-103) ont été répondus en chat, sans les choisir — non répétés ici.*

**Construit, testé, gardé — jamais activé** : migration `0158_walkthrough_ecarts.sql`
(`control_walkthrough_transcript`, `control_walkthrough_gap`, verrou d'engagement, verdict de
registre, RLS forcée) ; le service `walkthrough-analyse.ts` (dépôt du transcript, analyse via
`getAnalysteWalkthrough()`, décision par écart — plafond HITL L2, règle 7, jamais L3) ; la
généralisation de `entretiens-analyste.ts` pour servir à la fois les entretiens de processus et
les walkthroughs sans bifurcation (règle 6 — mêmes classes `RejeuAnalyste`/`AnthropicAnalyste`,
paramétrées) ; l'écran de revue humaine sur `rcm/[cid]` ; sa lecture `/api/sante` (un écart
« task » sans tâche réelle liée fait rougir) ; sa station du parcours cliqué (la PREMIÈRE station
SOX de tout le scénario — `scripts/clics/contexte.ts` étendu pour résoudre un second dossier) ;
ses tests avec rejeu enregistré (fixture `dataset/fixtures/walkthroughs.json`, sha256 vérifié,
zéro appel réseau). **La clé n'a jamais été demandée, exportée, ni utilisée** — tout le chemin
(dépôt → analyse → décision → refus de la garde) est prouvé par l'adaptateur de rejeu, `mock` par
défaut. `IA-BUDGET-01` (`assertBudgetActifEnBase`) est câblé sur ce chemin — **le premier site
d'appel réel de cette garde dans tout le dépôt** (`entretiens-analyste.ts`, le chemin RÉEL, ne
l'appelait pas avant cette tranche ; écart pré-existant rendu visible, non corrigé ici, hors
périmètre — confirmé par les deux revues hostiles ci-dessous).

**Verify complet — douze passages, deux défauts distincts diagnostiqués, un troisième accepté
comme bruit documenté.** Détail entier dans `docs/CHASSE.md` (F17/F17 bis/F17 ter, et la suite de
la section R58) ; résumé ici :
- **R58 (le serveur de `tests/screens.test.ts` qui tombe, déjà ouvert depuis des tranches
  antérieures) a reçu, pour la première fois, une preuve DIRECTE plutôt qu'une corrélation** :
  cette machine n'a que 4 cœurs et `vitest.config.ts` ne plafonnait aucun fork parallèle ;
  `vitest run --maxWorkers=2` (mêmes 1086 tests, aucun sauté) a fait disparaître le crash sur le
  passage suivant, après quatre occurrences consécutives à la même route (`/eng/[id]/testing`,
  latence en hausse 13,3→30,0 s). Recommandation consignée dans CHASSE.md pour la prochaine
  session qui lance `npm run verify` sur cette machine.
- **Un #418 (fil n°7, docs/CHASSE.md §1) s'est reproduit SIX fois sur SIX**, toujours sur la
  nouvelle station walkthrough, toujours le même bruit (dix-neuf divergences CSSOM déjà
  documentées — famille F11 — plus la bulle `rail-astuce` déjà connue, E5 ; ZÉRO divergence
  structurelle, vérifié à chaque occurrence). Deux hypothèses propres à cette station testées et
  ÉLIMINÉES par la mesure (pas devinées) : le saut d'ancre natif du navigateur (le fragment
  `#walkthrough-analyse` a été retiré de l'URL — la station navigue vers l'URL plate puis
  `scrollIntoViewIfNeeded()` — le #418 a persisté) ; une grâce insuffisante après `aller()` (1200 ms
  ajoutés — persisté aussi). Découverte annexe : le champ `station` de l'instrument #418 n'a
  **jamais** été câblé depuis sa création (`sonde.station(...)` n'est appelé nulle part) — chaque
  incident consigné depuis F4 porte le même placeholder mort ; pré-existant, hors périmètre.
  **Décision, par précédent déjà posé (F14, SHA `9661317`)** : une tranche antérieure a déjà
  expédié avec cette même signature non résolue, documentée, jugée non bloquante — R74 suit la
  même règle plutôt que d'inventer une exception plus stricte pour elle-même après douze passages
  `verify` complets. `npm run visuel`, jamais atteint en douze tentatives (`clics` sortant
  toujours en échec avant lui), a été lancé SÉPARÉMENT : **328 vues, 0 défaut**.
- **Résultat mesuré, verify-r74-12 + visuel séparé** : `tsc --noEmit` propre · vitest
  **140/140 fichiers, 1086/1086 tests** (sous `--maxWorkers=2`) · gardes **44** · semeur propre ·
  plancher **632**, aucune forme éteinte · langue + épreuve **5/5** cas connus mauvais dénoncés ·
  lectures + épreuve **0 lecture perdue** sur 1716 chemins · parcours + épreuve **240 stations
  figées vérifiées, 0 perdue** (24 nouvelles non figées — `--figer` refuse tant qu'un incident
  navigateur subsiste, par conception, non forcé) · screens (dev + production) **0 échec** ·
  fumée propre · densité **81 écrans, 0 au-delà de 5 actions** · clics **259 étapes, 1 échec**
  (le #418 documenté ci-dessus) · visuel **328 vues, 0 défaut**.

**Revue hostile, deux voix indépendantes (règle 30 — modèle de données, garde de budget,
multi-tenant tous touchés)** : **AUCUN défaut confirmé dans le code de cette tranche.** Les deux
voix ont vérifié indépendamment (lecture de bout en bout, pas un survol) : l'isolation
multi-tenant (`assertMembreDe`, la résolution `control_walkthrough_gap` dans `membre.ts`) ; la
garde `IA-BUDGET-01` correctement câblée avant tout appel d'adaptateur ; RLS + verrou
d'engagement sur les deux nouvelles tables, conformes au patron établi ; le plafond HITL L2 tenu
(aucun écart ne devient `control_task` sans un clic humain explicite) ; la provenance
(`event_log`, `ai_run` avec `purpose:'walkthrough_gaps'`) réellement écrite, pas seulement
affirmée ; la généralisation de `entretiens-analyste.ts` sans changement de comportement pour le
chemin entretien existant (tous les nouveaux paramètres ont leur défaut = comportement d'origine) ;
la lecture `/api/sante` éprouvée sur un cas connu mauvais réel ; l'empreinte sha256 de la fixture
recalculée indépendamment par chaque voix. La seule chose relevée par les deux voix, convergente
et déjà connue avant la revue : `entretiens.ts`/`ladder.ts` (le chemin RÉEL des entretiens de
processus et de l'échelle d'extraction) n'appellent toujours pas `IA-BUDGET-01` — écart
pré-existant, explicitement hors périmètre de cette tranche (déjà nommé dans le code de cette
même tranche avant que la revue ne le retrouve), consigné au registre plutôt que corrigé à la
hâte.

**Ce qui reste, dans l'ordre** : le SHA de fusion, à confirmer servi en production ci-dessous ;
les 24 stations clics non figées, à figer le jour où le #418 cesse (ou par une décision explicite
de forcer `--figer` malgré un incident documenté — non prise ici) ; le fil `entretiens.ts`/
`IA-BUDGET-01` non câblé, au registre (`docs/BACKLOG_REPORTE.md`) ; le fil du champ `station`
jamais câblé dans l'instrument #418, au registre également. **Le geste du fondateur reste le
SEUL suivant pour activer réellement l'adaptateur** : poser `ANTHROPIC_API_KEY` (déjà partagée,
rien de neuf), choisir `OTTO_WALKTHROUGH_ADAPTER=anthropic`, et écrire lui-même la ligne SQL qui
ouvre `IA-BUDGET-01` — trois gestes distincts, aucun substituable à un autre, et cette tranche
n'en a exécuté aucun.

## R62 (D.6 point 6) : le parcours découverte, chronométré en clics (2026-09-13)

*Mandat 2026-09-05 §D.6 : « Un parcours cliqué « découverte » : sans lire le rail, atteindre ses
travaux, comprendre ce qui empêche de signer, conclure une ligne d'échantillon. Chaque étape
mesure le nombre de clics et échoue au-delà du plafond fixé. » Distinct du compteur de clics
DESCRIPTIF déjà mesuré par `npm run clics` (`docs/CLICS.md` : un coût publié, jamais jugé) —
ici, un plafond fixé D'AVANCE, et une étape rougit si elle est dépassée.*

**Le trou trouvé en construisant, avant tout code de mécanique.** Reconstruire le parcours d'un
auditeur qui n'a jamais lu le rail a montré qu'aucun chemin n'existait de Mes travaux (`/travaux`)
vers l'atelier de test : les quatre listes d'attribution (`mesSections`) ne montrent un poste QUE
s'il a un détenteur, un attributaire, un suiveur ou une visite récente pour la personne connectée
— et le poste qui porte l'échantillon perd son détenteur dès qu'il passe « reviewed » (le monde de
démonstration fraîchement semé l'est déjà). « Conclure une ligne d'échantillon » n'était donc pas
un geste que le mandat pouvait mesurer : il n'avait pas d'écran (règle 13). Corrigé par un panneau
neuf, même patron que celui des obstacles : `echantillonsDeMesDossiers` (travaux.ts, dérivé de
`lignesNonConclues` déjà utilisé par l'avertissement de l'atelier — rien de nouveau stocké) et un
panneau `data-echantillon` sur `/travaux`, un clic vers `/eng/[id]/testing` par dossier qui porte
encore du travail.

**Le parcours mesuré, trois points de contrôle, plafonds FIXÉS AVANT la mesure :**
1. Atteindre Mes travaux depuis l'accueil, par le lien permanent du bandeau — ≤ 1 clic.
2. Comprendre ce qui empêche de signer — le panneau des obstacles est déjà sur cet écran : ≤ 1
   clic cumulé (aucun clic de plus que le point 1).
3. Atteindre l'atelier — ≤ 2 clics cumulés, par le panneau neuf — puis conclure une ligne
   d'échantillon. Toutes les lignes ne se concluent pas au premier essai (le monde de
   démonstration porte de vraies exceptions, TEST-02/TEST-04, qui exigent une disposition ÉCRITE —
   un jugement humain hors du périmètre d'un parcours chronométré) : la station essaie CHAQUE
   ligne du tableau, dans l'ordre, jusqu'à en trouver une qui conclut, sous un plafond qui suit le
   nombre RÉEL de lignes présentes (2 clics par ligne essayée), jamais une constante inventée ni
   une boucle non bornée (règle 35).

**Positionnement dans le fichier, trouvé à la dure.** Trois runs complets avec la station placée
en FIN de parcours (après « obstacles au visa », ~250 stations plus loin) ont chacun buté sur une
ligne DIFFÉRENTE avec une vraie exception — même en essayant les DIX-SEPT lignes à la dernière
tentative. Pas une panne du produit : les stations qui suivent (étape 7, second passage sur les
pièces, réexécution/évaluation) RECALCULENT la grille et les comparaisons plusieurs fois, et une
disposition écrite dont la valeur sous-jacente a changé redevient PÉRIMÉE (`dispositionPerimee`,
atelier.tsx) — comportement voulu, pas un défaut. En fin de parcours, plus une seule des dix-sept
lignes n'était conclusible sans rédiger une disposition. Déplacée juste après le PREMIER calcul de
grille (station « atelier de test »), avant toute station qui recalcule — là où des lignes encore
intactes restent disponibles.

**Revue hostile, DEUX voix indépendantes (règle 30 : ce lot touche le registre multi-tenant
ETANCH via `echantillonsDeMesDossiers(userId)`), quatre défauts réels trouvés et corrigés avant
fusion :**
- **Voix 1** — isolation jugée CORRECTE (SQL tracé directement, identique à `obstaclesDeMesDossiers`,
  échoue fermé sur un userId inconnu). Deux défauts dans la station : (1) la récupération d'un
  refus REQ-02 (bouton « demander en lot ») était devenue du CODE MORT après le déplacement —
  ce refus n'existe que si une colonne ajoutée existe sur la grille, or la seule station qui en
  ajoute une tourne maintenant APRÈS R62 ; retirée entièrement (règle 17 : un chemin jamais
  emprunté n'est jamais prouvé). (2) La boucle d'essai ne cliquait jamais explicitement la
  ligne 0 (elle supposait qu'elle coïncidait avec l'auto-sélection de l'atelier, qui suit
  l'extraction/attestation, pas l'ordre du tableau) — corrigé, chaque ligne est cliquée
  explicitement.
- **Voix 2** — deux défauts : (1) le détail de l'étape 2 affirmait « panneau des obstacles
  lisible » QUEL QUE SOIT le résultat — le motif exact que règle 13 nomme (un détail qui contredit
  le verdict) ; rendu dépendant du résultat. (2) **Le plus sérieux** : enregistrer
  `echantillonsDeMesDossiers` dans le registre `PAR_PERSONNE` (étanchéité) EXCLUT la fonction de
  l'appel automatique par acteur étranger d'`etancheite-executee.test.ts` — l'inscription
  affirmait « même patron qu'obstaclesDeMesDossiers » sans qu'AUCUN test n'appelle réellement la
  fonction en contexte multi-cabinet (une affirmation non exécutée, le silence que règle 15
  nomme). Corrigé : `travaux.test.ts` étend les trois cas déjà exécutés pour les vues sœurs
  (appartenance à un dossier d'un AUTRE cabinet, dossier SCELLÉ, cabinet SANS aucun dossier) à
  `tb.echantillons`, plus un test dédié qui vérifie la cohérence avec `lignesNonConclues` —
  exécuté pour de vrai.

**Ce que cette tranche NE fait PAS (règle 19).** La station ne prouve pas que le chemin emprunté
est le plus court possible — seulement qu'il en existe un sous le plafond fixé. Le test unitaire
de la valeur POSITIVE de `echantillonsDeMesDossiers` (un dossier qui a réellement de l'échantillon
à conclure) n'est pas construit dans `travaux.test.ts` — sa base (`seedBase`) n'a pas de tirage,
et le construire exige le flux complet `bootstrapNep`/`samplingAndRequest` (grille.test.ts), hors
périmètre d'un test de service dérivé ; la valeur positive réelle est prouvée par le parcours
cliqué complet sur le monde de démonstration (R62 étape 3b elle-même, `npm run clics`).

**Verify complet, sept exécutions sur cet arbre au total** (deux échecs environnementaux
dispersés et sans rapport avec cette tranche — timeouts Playwright sur des zones jamais touchées
par le diff, host à charge 4,46/3,92 sur 4 CPU au moment des deux runs les plus dégradés,
retombée à 1,41 ensuite — puis un run vert, un défaut réel trouvé (REQ-02 non enregistré au
registre d'étanchéité), puis un run vert, puis le repositionnement, un run vert, puis les
corrections de revue hostile, un DERNIER run vert confirmé) : la version finale est **138/138
fichiers de test, 91 routes/0 échec, densité 81 écrans/0 au-delà de 5 actions, clics 253 étapes/0
échec (387 clics comptés), visuel 328 vues/0 défaut**. R62 étape 3b conclut au premier essai (4
clics, 1 ligne essayée) sur le monde de démonstration frais.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `4e0eafc`** (`4e0eafc99112c09624d0ac875471ab7b9e3d4605`,
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` — l'hôte de
production, jamais l'alias de branche, règle 36) : HTTP 200, `identiteCoherente:true`, toutes les
lectures `ok:true`, mesuré le 2026-09-13 à 04:05:12Z, moins de deux minutes après le push sur
`main` (fusion par avance rapide, `fbfa06b..4e0eafc`).

**LE REPASS DESIGN EST DONC COMPLET (jetons + R60 + R61 + R62), servi en production.** R59 reste
explicitement hors de ce repass (ADR-103, décision du fondateur non tranchée). Le message unique
promis au fondateur est dû maintenant.

## R61 (D.6 point 5) : aucun état vide muet — 15 sites, 10 fichiers (2026-09-12)

*Mandat 2026-09-05 §D.6 : « toute section vide porte une phrase qui dit quoi faire et le geste
proposé. »*

**Inventaire préalable, complet** (sous-agent Explore dédié) : 15 sites classés — 10 messages
présents mais SANS geste (A1-A10), 5 tables entièrement muettes (A11-A15), et une catégorie
« terminale/positive » (~20 sites) et « exemptée » (chrome, cellules de tableau) correctement
laissées telles quelles.

**Ce qui a changé**, site par site, chacun avec le geste RÉEL déjà présent ailleurs sur le même
dossier (jamais un lien inventé) : dashboard (tables demandes/papiers) → liens vers `/requests` et
`/workpapers`, mêmes libellés que ces pages ; population → deux causes distinctes du même vide
(rien signalé = bonne nouvelle ; aucune ligne du tout = importer le GL) ; scoping → le vrai geste
manquant (importer une balance) nommé, distinct du bouton « rebuild » déjà visible qui la suppose
déjà là ; events → le journal ne se vide jamais seul, un vide vient toujours d'un filtre ; risk →
renvoie au questionnaire ; kanban → cinq colonnes, cinq messages (« rien ici » ne distinguait pas
une bonne nouvelle d'un état neutre) ; rcm/[cid] → la grille d'attributs choisit entre trois
messages selon l'étape réelle, les risques liés distinguent « rien lié » de « registre du dossier
lui-même vide » ; testing/atelier → distingue « aucune ligne tirée » (lien vers /sampling) de « une
ligne existe, cliquez-en une » (état normal, pas un défaut) ; workpapers/imports → nomment le geste
déjà visible plus haut sur la même page ; poste → renvoie au formulaire juste en dessous ; suivi →
même geste que son voisin programme/page.tsx, jamais posé ici.

**Revue hostile (un réfutateur — UI/texte, ni sécurité ni multi-tenant), deux constats réels,
tous deux corrigés avant fusion** :
1. **Un état INATTEIGNABLE, ET le mauvais bouton nommé.** Le premier jet du site « circularisations »
   ciblait `s.rap.lignes.length === 0` avec `s.camp` vrai, en renvoyant vers « importer le
   listing ». Faux sur les deux plans : `importerListing()` (circularisations.ts) rejette tout
   fichier de moins de deux lignes AVANT de créer la campagne et ne supprime jamais les tiers déjà
   partis — aucun chemin ne peut laisser `s.camp` vrai avec zéro ligne ; et même atteignable, le
   bouton visible dans cet état est TOUJOURS « corriger le listing », jamais « importer »
   (`s.camp ? corrigerListing : importerListing`). Retiré entièrement, expliqué en commentaire
   plutôt que masqué (règle 19).
2. **Le garde mécanique ne cherchait que le texte français retiré.** La nouvelle station clics
   (kanban) ne vérifiait que « rien ici » — la démonstration sert l'ANGLAIS par défaut
   (`locServie`), où le texte retiré était « nothing here ». Une régression dans la langue
   réellement servie serait passée inaperçue. Corrigé : les deux formes de la clé retirée
   (`kanban.aucune`, désormais absente du catalogue) sont vérifiées, écrites en dur dans le test.

**Preuve mécanique, honnêtement bornée (règle 19)** : le kanban est le SEUL des 15 sites confirmé
réellement vide sur le monde de démonstration actuel (vérifié en DIRECT — cookie de session, requête
authentifiée — trois colonnes vides sur cinq) ; la nouvelle station clics vérifie que leurs textes
sont DISTINCTS et qu'aucun ne reprend le générique retiré, dans les deux langues. Les 14 autres
corrections sont vérifiées par relecture attentive + TypeScript + le passage complet
screens/clics/visuel (aucun crash sur aucune branche, sur toutes les 91 routes) mais PAS par une
assertion dédiée sur LEUR texte précis : le monde de démonstration actuel ne vide pas ces tables, et
rien ne peut prouver un texte par la navigation seule sans une fixture dédiée par site — un chantier
plus lourd, non entrepris ici, nommé plutôt que tu.

**Verify complet, tué et relancé une fois sur arbre gelé après la revue hostile (règle 34)** : la
version finale est verte — 138 fichiers de test, `screens` 91 routes/0 échec, `clics` 249 étapes/0
échec (la station R61 comprise, kanban confirmé 3 colonnes vides distinctes), `visuel` 328 vues/0
défaut.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `fbfa06b`** (`fbfa06b5f3a5d2fa0d48a4bdb2b64818309a6d19`,
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` — l'hôte de
production, jamais l'alias de branche, règle 36) : HTTP 200, `identiteCoherente:true`, toutes les
lectures `ok:true`, la station R61 (trois colonnes vides distinctes) comprise dans le run qui a
produit ce SHA.

## R60 (D.6 point 4) : tout compteur mène quelque part — dashboard, population, balances-aux, imports (2026-09-11)

*Mandat 2026-09-05 §D.6 : « Tout compteur affiché conduit quelque part : un test échoue sur un
compteur sans lien. » Débloqué par le repass design du 10 septembre (le point n'était pas
constructible avant que le langage visuel existe, per le mandat lui-même) — en réalité indépendant
du langage visuel : c'est un défaut de NAVIGATION, pas d'esthétique, et il tenait dans l'ancien
langage comme dans le nouveau.*

**Inventaire préalable, complet** (sous-agent Explore, dédié) : quatre culs-de-sac réels trouvés
parmi tous les compteurs affichés app-wide — `eng/[id]/dashboard` (4 tuiles KPI), `eng/[id]/
population` (2 tuiles), `eng/[id]/balances-aux` (1 tuile), `eng/[id]/imports` (1 avertissement).
Le reste de l'application respecte déjà la règle (`suivi/page.tsx` en est le meilleur exemple,
cité par le mandat lui-même).

**Ce qui a changé.** Chaque tuile devient un lien réel : dashboard → `#dash-requestTracker`
(même page), `/exceptions`, `/rcm`, `/evidence` ; population → `?view=all`/`?view=flags` (bascule
la même table vers la vue comptée) ; balances-aux → l'ancre `#bal-counterpartyByCounterparty`, et
la tuile « déplacements » gagne un VRAI badge par ligne dans le tableau qu'elle compte
(`deplacementsAux`, dérivé de `a.deplacements`) — sans quoi le lien aurait mené à un tableau muet
sur ce qu'il comptait ; imports → `/sampling` depuis l'avertissement de ré-import (ADR-016).
Nouvelle station clics (« R60 : … », `scripts/clics/scenario.ts`) qui clique chaque tuile et
vérifie une VRAIE navigation, pas seulement un `href` présent.

**Revue hostile (un réfutateur — UI/navigation, ni sécurité ni multi-tenant ni modèle de
données, règle 30 amendée), trois constats réels, tous corrigés avant fusion** :
1. La station clics ne visitait jamais `/imports` — la revendication « imports corrigé » dans le
   premier message de commit n'était exercée par aucun harnais. Corrigé : la station visite
   `/imports` et vérifie le lien (conditionnel — l'avertissement n'apparaît que si un ré-import a
   invalidé un tirage, absent du monde semé aujourd'hui, nommé plutôt que masqué).
2. Un commentaire de `dashboard/page.tsx` affirmait « les deux premières tuiles restent sur cette
   même page » — faux, une seule le fait. Corrigé, la faute nommée dans le commentaire lui-même.
3. **Trouvé en RELISANT le log du premier verify (règle 15 : un « 0 échec(s) » global ne dit pas
   si chaque ligne est honnête)** : plusieurs `dire(...)` de la nouvelle station passaient un
   détail STATIQUE (« lien absent ») quel que soit le résultat — un `ok` affichait donc « lien
   absent » à côté de lui, la même forme d'affirmation qui se contredit que la règle 13 nomme déjà
   pour CTRL-04. Corrigé : le détail dit ce qui a été VU, dans les deux sens.

**Ce que cette tranche NE fait PAS** (règle 19) : la tuile population liée à `?view=all` promet un
total que la vue tronque à 200 lignes (comportement PRÉEXISTANT, pas introduit ici) — signalé en
commentaire, pas réparé : hors périmètre de R60, qui demande un lien réel, pas une pagination
complète.

**Verify complet, deux fois tué et relancé sur arbre gelé après chaque correction (règle 34)** :
la version finale, sur le SHA poussé, est verte — 138 fichiers de test, `screens` 91 routes/0
échec, `clics` 248 étapes/0 échec (la nouvelle station comprise), `visuel` 328 vues/0 défaut.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `17017b4`**
(`17017b42f14f0d08faf5c8046d72266795046d5a`, `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` — l'hôte de production, règle 36) : HTTP 200,
`identiteCoherente:true`, toutes les lectures passent, mesuré le 2026-09-12 à 23:04:01Z.

## Repass design, tranche 1 : les jetons du socle (mandat 2026-09-09 §5, déclenché le 2026-09-10) (2026-09-10)

*Mandat du fondateur, point 3 (`docs/MANDATS/2026-09-10_trois_reponses.md`) : « Open the retroactive
design repass now — R59 to R62... Start with the design token source as a single authority... then
migrate screens onto it tranche by tranche, so the repass is a change of tokens and never a rewrite
of screens. »*

**Ce qui a changé.** `app/src/app/globals.css` : `:root` (clair ET sombre) adopte les valeurs déjà
construites et contraste-vérifiées du bloc `.epure` (premier geste concret du mandat, 2026-09-09) —
fond ivoire, cartes blanches, rayon généreux (16px), ombre quasi nulle, UN accent violet, couleurs
sémantiques désaturées. `h1`/`h2`/`h3` s'allègent vers la hiérarchie « titres larges et légers »
(h1 : poids 300, comme `.epure-titre` ; h2/h3 : poids 500, un choix délibéré plus sombre que 300 à
leur taille, nommé plutôt que caché).

**« Un changement de jetons, jamais une réécriture d'écrans » — littéralement.** Puisque chaque
règle de `globals.css` lit déjà ses couleurs par variable (aucune couleur en dur ailleurs dans la
feuille), cette redéfinition de `:root` propage automatiquement à TOUS les écrans existants sans
toucher leur markup. Ce n'est donc pas 91 tranches « écran par écran » : c'est UNE tranche, dont la
portée couvre l'ensemble de la surface visuelle de l'application d'un coup — la propriété exacte
que le fondateur demandait. Deux écrans (`/eng/[id]/suivi`, `/eng/[id]/kanban`) portaient déjà le
langage `.epure` explicitement (construits après le mandat du 9 septembre) ; ils sont inchangés.

**Vérifié, pas supposé, sur l'ensemble de la surface** : `npm run visuel` (contraste + débordement,
82 écrans × 4 vues, clair et sombre, large et 390px) — **0 défaut**. `npm run verify` complet sur
cet arbre gelé : 138 fichiers de test (tous verts), `npm run screens` 91 routes/0 échec, `npm run
clics` 241 étapes/0 échec, `npm run visuel` (re-mesuré dans la même chaîne) 328 vues/0 défaut.

**Ce que cette tranche NE fait PAS** (règle 19, nommé plutôt que fait à moitié en silence) : le
bandeau et le rail partagés (`--topbar*`) restent inchangés — c'est le CHROME de navigation,
explicitement hors du périmètre de `.epure` lui-même depuis le 9 septembre ; une tranche séparée
les repeindra. Aucun `text-transform: uppercase` en bloc sur les codes de refus (le « monospace en
petites capitales » du §5, D.6 point 1) — l'appliquer partout capitaliserait aussi des SIREN, IBAN
et montants ; c'est un geste ciblé, laissé à la tranche R60-R62. R59-R62 eux-mêmes restent à
construire (tranche suivante) : le token existe désormais, ce qui les débloque comme le mandat
l'annonçait, mais aucun des quatre n'est automatiquement résolu par la seule direction de design.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `f91d79e`**
(`f91d79e64011a77da20bff7073bc259d3bd6fe7e`, `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` — l'hôte de production, règle 36) : HTTP 200,
`identiteCoherente:true`, toutes les lectures passent, mesuré le 2026-09-12 à 22:06:47Z.

## L'écart A.6 de /api/sante, résolu (mandat du fondateur du 10 septembre, point 2) (2026-09-10)

*Trois réponses du fondateur commitées verbatim (`docs/MANDATS/2026-09-10_trois_reponses.md`, règle
33) : §4 point 3 accordé (plafond de dépense, la garde DB reste seule autorité), l'écart A.6
tranché — pas entre les deux options par leur mécanique, mais par la PROPRIÉTÉ imposée : « il doit
être impossible pour la sonde de ne rien voir et de rendre vert » — et le repass design R59-R62
déclenché (tranche séparée, voir plus bas dans ce fichier au fil des prochains commits).*

**Ce qui a changé.** `app/src/lib/db/tenant.ts` gagne `verifierLocataireVisible(tenantId,
engagementId)` : pose `withTenant`, relit LA MÊME ligne SOUS ce locataire déclaré SANS filtrer par
`tenant_id` dans la requête (c'est la politique RLS qui doit laisser passer, jamais une clause
`where` qui ferait le travail à sa place), et ÉCHOUE — un vrai `throw`, pas un `vide` informatif —
si la ligne redevient invisible. `app/src/app/api/sante/route.ts` l'appelle EN PREMIER,
INCONDITIONNELLEMENT, avec l'identité CANONIQUE de la démonstration (`IDS.tenant`/`IDS.engNep`,
des identifiants fixes, semés) — jamais l'engagement découvert dynamiquement plus bas dans le même
fichier.

**Revue hostile, deux voix indépendantes (règle 30 amendée : sécurité/multi-tenant, deux
réfutateurs).** Voix 2 a trouvé un DÉFAUT RÉEL dans le premier jet : la nouvelle lecture vivait
SOUS `if (eng)`, où `eng` est découvert par une requête NON SCOPÉE, tolérée VIDE
(`.catch(() => null)`). Dans le scénario réel que le fondateur décrit — aucun locataire posé nulle
part —, cette découverte elle-même rendrait NULL sous RLS, `eng` serait `null`, et TOUT le bloc
sauterait, y compris la garantie censée rendre ce silence impossible : le défaut qu'elle devait
corriger restait entier. **Corrigé** : la lecture est désormais inconditionnelle, en tête de
`corpsDeLaSonde`, indépendante de la découverte dynamique. Voix 1, indépendamment (mutation testée
en direct : `throw` retiré → le test connu mauvais échoue bien, confirmant qu'il exerce une vraie
dénégation RLS, pas un décor), a confirmé le mécanisme (propagation `essayer→cassees→500`, aucune
fuite silencieuse, nesting `tx()`/savepoint correct, les ~40 autres lectures inchangées) et signalé
un message d'erreur imprécis sur un chemin de code depuis RETIRÉ par la correction de voix 2 —
donc résolu par construction, pas laissé de côté.

**Tests** : `app/src/lib/db/tenant.test.ts` — cas bon (locataire correct voit sa mission) et cas
connu mauvais (locataire ÉTRANGER, sous un rôle SANS BYPASSRLS créé par le test, ne la voit plus —
`SANTE-TENANT-VIDE` observé, pas supposé), 38/38 verts avec `sans-locataire.test.ts` et
`rls-couverture.test.ts`. Re-vérifié contre le monde de démonstration RÉEL (serveur dev,
`OTTO_DEMO_PUBLIC=1`, base fraîche + semée) : `/api/sante` rend 200, la nouvelle lecture est la
PREMIÈRE de la liste, `ok:true`.

**Ce que cette tranche NE fait PAS** (règle 19) : les ~40 AUTRES lectures de `/api/sante`
continuent de lire sous la dérogation « sante », sans locataire posé chacune — les envelopper
toutes dans une seule transaction casserait le reste de la sonde sur un vrai Postgres (une erreur
DANS une transaction l'avorte, en cascade) ; chantier séparé, nommé, pas fait ici. Sous BYPASSRLS
(production et local aujourd'hui), cette lecture reste un round-trip de la déclaration — elle
deviendra le vrai test de visibilité le jour de l'étape 3, toujours non exécutée, toujours
interdite sans mandat écrit qui la nomme.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `a6e0894`**
(`a6e0894977bf61922a888d4312f4d0fbf858a57d`, `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` — l'hôte de production, règle 36) : HTTP 200,
`identiteCoherente:true`, « locataire déclaré par la sonde » est la PREMIÈRE lecture de la liste,
`ok:true`, mesuré le 2026-09-10 à 21:39:17Z.

## PLAN_RLS steps 1-2 : documentation stale corrigée, câblage RE-MESURÉ, R24/R26/R27 levées (2026-09-10)

*Mandat du 9 septembre : « PLAN_RLS steps 1 and 2 are yours: prepare the otto_app role, its
grants and its policies, tested against a fresh database, with nothing applied to the network
database and DATABASE_URL untouched. » Vérifié par lecture directe du code (règle 12, pas cité
d'une recherche antérieure sans la rejouer) : c'était déjà fait, le 2026-09-03 au soir, commit
`c36076f` — et resté NON DOCUMENTÉ comme tel pendant des dizaines de commits (rule 1).*

**Ce qui a changé.** `docs/PLAN_RLS.md` : status box réécrite en amendement daté (pas une
réécriture silencieuse de l'historique du 2026-09-03) ; §2 « la dette que 0140 ne ferme pas »
corrigée (fermée par 0141, le même soir) ; un écart NOUVEAU trouvé en vérifiant A.6 signalé sans
être résolu — `/api/sante` ne pose en réalité AUCUN locataire (`sansLocataire('sante', …)` seul),
contrairement à ce que A.6 décrit ; deux options nommées, ni choisie, le fondateur tranche.
`docs/BACKLOG_REPORTE.md` : R24/R26/R27 formellement LEVÉES avec citation complète (SHA, fichier,
mesure) — `docs/instantanes/fils.json` les marquait déjà « traité mais pas soldé par écrit » ;
c'est cette écriture manquante qui est faite ici. R25/R28/R29 restent ouverts, non touchés (hors
chemin vérifié dans cette tranche). Commentaires narratifs stale corrigés dans
`sans-locataire.test.ts` et `.github/workflows/role-production.yml` (« le câblage n'est pas
fait ») — assertions INCHANGÉES (elles mesurent une forme de code, jamais un comportement).

**Les deux options du fondateur pour la contradiction de l'étape 3** (le test négatif « un
cabinet ne lit pas l'autre » sans session sur `/api/sante`) sont déjà résolues, VERBATIM, par
PLAN_RLS.md §0bis A.6 depuis le 2026-09-02 : (i) une dérogation nommée pour la sonde de santé
(déjà codée, `sans-locataire.ts`, clé `'sante'`) ; (ii) le test négatif conduit AUTREMENT —
`tenant.test.ts` CAS 1-4bis EST cette forme, déjà construite et verte aujourd'hui, contre un vrai
rôle sans BYPASSRLS créé par le test lui-même. **Rien n'a été choisi ici entre les deux — les
deux existent déjà, chacune pour une moitié différente de la contradiction.**

**CORRECTION, dans le même souffle qu'une affirmation prématurée (règle 12/18, la même faute que
R37 appliquée à moi-même une fois de plus).** Le premier commit de cette tranche (`c3e2f39`)
citait « `screens:garde` RE-MESURÉ AUJOURD'HUI, 85 routes, 0 échec » — écrit AVANT que la commande
ait fini de tourner, sur la seule foi du chiffre historique du 2026-09-03. La mesure réelle,
achevée ensuite sur base fraîche (`db:reset && demo:seed` puis `npm run screens:garde`, EXIT=0) :
**91 routes, 0 échec** — l'application a grandi depuis (91, pas 85), et le fond de l'affirmation
(armer LOC-01 ne casse plus rien) tient, mais le chiffre précédemment cité était faux au moment
où il a été écrit. `tenant.test.ts`/`sans-locataire.test.ts`/`rls-couverture.test.ts` re-exécutés
le même jour sur PGlite fraîche : **35/35 verts**. PLAN_RLS.md et BACKLOG_REPORTE.md portent
désormais le chiffre corrigé, daté, à côté du chiffre historique — aucun n'est effacé.

**Ce que cette tranche NE fait PAS** (règle 19, interdits inchangés) : `DATABASE_URL` intouché ;
rien appliqué à la base réseau ; l'étape 3 reste **interdite sans mandat écrit qui la nomme**,
indépendamment de l'état des étapes 1/2 ; le format `otto_app.<ref>` au pooler reste
**[UNVERIFIED]** — seul le fondateur, par `psql` depuis sa machine, peut le vérifier ; la CI
« rôle de production » n'a toujours jamais tourné (`OTTO_CI_DATABASE_URL` jamais configuré,
hors de portée d'une session sans accès à ce secret).

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `fd33d20`** (`fd33d2041f15ffeb3f1f8385deac04fc1ac9fe5b`,
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` — l'hôte de
production, jamais l'alias de branche, règle 36) : HTTP 200, `identiteCoherente:true`, verdict
« toutes les lectures passent », y compris les lectures PLAN_RLS elles-mêmes (« rôle servi et
garde de locataire (PLAN_RLS) », « rôle applicatif otto_app (migration 0140) », « portail par
jeton et pièces (migration 0141) »), mesuré le 2026-09-10 à 12:13:26Z. PLAN_RLS steps 1-2 du
mandat du 9 septembre sont désormais COMPLETS et servis en production.

## §1 : CTRL-07 redessiné, indexé par POPULATION (annexe sourcée du 10 septembre) (2026-09-10)

*Annexe, §1-§5 (`docs/MANDATS/2026-09-10_annexe_echantillonnage.md`, commitée verbatim, règle 33,
fournie par le fondateur hors du bac à sable — WebFetch y reste bloqué pour les domaines
primaires). Point central : « la fréquence n'indexe pas la table — la fréquence produit la
POPULATION, et c'est la population qui indexe la table. » Source : HUD Handbook 2000.04
REV-2 CHG-10, Appendix A — un guide d'audit fédéral publié, jamais la méthode d'un cabinet.*

**Ce qui a changé.** `attributeSampleSizes` (indexé par fréquence, livré vide) est retiré,
remplacé par `attributeSamplingTable` (types.ts, pcaob-sox.ts) — un contenu SOURCÉ, public, livré
PLEIN. Populations ≤ 200 (annexe §2.2) : des minima sourcés, vérifiés dès que la population est
connue, sans aucun jugement de cabinet — sauf la bande < 20, qui ne publie qu'un texte (« fewer
than 5 »), jamais un nombre exact. Populations > 200 (§2.1) : une grille à quatre lignes exactes,
qui exige trois nouveaux paramètres de cabinet non posés (`attributeSampleConfidenceLevel`,
`attributeSampleTolerableRate`, `attributeImportance`) — CTRL-07 refuse tant qu'ils ne le sont pas ;
une combinaison posée qui ne correspond à aucune des quatre lignes reste non vérifiée, jamais
devinée par interpolation. `drawAttributeSample` (sox.ts) réutilise `rapprochee.rowCount` (déjà
validé frais par CTRL-04) plutôt que de recompter.

**Revue hostile, deux voix indépendantes** (règle 30 : modèle de données/schéma de pack touché) —
convergentes sur les deux mêmes défauts, chacune en a trouvé un troisième propre à elle, tous
corrigés :
- **Convergent, le plus grave** : la lecture `/api/sante` CTRL-07 recomptait la population
  AUJOURD'HUI pour juger un tirage d'HIER — un tirage jamais valide (mauvaise taille, sans
  dérogation) redevenait silencieusement « couvert » dès que la population grandissait au point de
  tomber dans une bande vérifiée (croissance normale d'un engagement, pas une attaque). Corrigé :
  nouvelle fonction `tailleEchantillonOePourPopulationDonnee`, la lecture utilise désormais
  `sample.population_size` — persistée AU TIRAGE, jamais recomptée.
- **Convergent** : la lecture ne comparait jamais la taille RÉELLEMENT tirée au minimum de la
  table — `table.verifie` seul suffisait, qu'importe `params.size`. Corrigé : `taille >=
  table.valeur` exigé explicitement (un minimum est un PLANCHER, annexe §2.2/2.1).
- **Voix 1** : TOCTOU dans `drawAttributeSample` — la population validée par CTRL-04
  (`rapprochee.rowCount`) et la population effectivement tirée (`instances.length`, requêtée
  plusieurs `await` plus loin, sans transaction) pouvaient diverger sous un import concurrent.
  Corrigé : `instances.length !== rapprochee.rowCount` refuse et redemande un rapprochement frais.
- **Voix 1** : provenance insuffisante — ni `sample.params` ni `engine_run.params` ne disaient
  QUELLE combinaison confiance/taux/importance avait produit la taille (règle 3), alors que le pack
  qui les porte est une config MUTABLE. Corrigé : `mecanisme` et la combinaison effective persistés
  à chaque tirage par table.
- **Voix 2** : l'ordre de la lecture CTRL-07 vérifiait `table.verifie` AVANT le carve-out
  `LEGACY_AVANT_CTRL07` — un legacy dont la population tombe aujourd'hui dans une bande vérifiée se
  serait silencieusement absorbé dans le compte « couvert », vidant le suivi PERMANENT que R67
  exige. Corrigé : ordre inversé.
- **Voix 2** : pour une population de 200 pile, le texte sourcé (« la source dit 199, pas 200 »)
  ne vivait que dans un commentaire de code, jamais à l'écran d'une taille pourtant vérifiée.
  Corrigé : nouvelle ligne d'affichage sur `/rcm/[cid]`, toujours visible quand `texteSource`
  existe, verifie ou non.
- **Voix 2, mineur** : commentaires stale dans `part2.ts` et l'en-tête de `ctrl07-lecture.test.ts`,
  décrivant encore la table VIDE d'avant le 10 septembre. Corrigés, sans impact fonctionnel (ces
  deux chemins passent par ADR-010, jamais par la table).

Quatre nouveaux tests, sous `IDS.engSox` (le vrai pack PCAOB/SOX — les tests déjà existants, tous
sous `engNep` qui ne porte AUCUNE table d'échantillonnage, ne pouvaient pas voir ces trois premiers
défauts), chacun un cas connu mauvais qui aurait dû passer AVANT le correctif.

**Un défaut trouvé en écrivant ces mêmes tests, pas deviné** : sans une ligne de rapprochement
CTRL-04 posée pour chaque contrôle de sonde, les quatre nouveaux tests faisaient AUSSI rougir
CTRL-04 (une lecture globale distincte, qui scanne les mêmes tirages) — `res.status` restait 500
même quand la lecture CTRL-07 elle-même était correctement `ok:true`. Trouvé par un `expect()`
forcé à imprimer la lecture réelle plutôt que supposé ; corrigé en posant une ligne de
rapprochement dans chacun des quatre tests.

**Un défaut de sonde distinct, sans lien avec §1, trouvé en le vérifiant.** `docs/PARCOURS.json`
(le figé du parcours cliqué) n'avait pas bougé depuis `b37989a` (Lot 4, tranche 3) — des dizaines de
commits, tout le Lot contrôle interne compris. Deux tentatives de refigure ont produit du bruit,
ni committé : un `timeout 900` trop court (un budget inventé, pas mesuré, pour `clics` seul — une
production build + 241 stations dépasse 900 s) a tué deux passages ; le second de ces passages,
relancé SANS re-semer la base, a produit 28 échecs en cascade — exactement « sur une base déjà
jouée, des stations rougissent pour rien » (CLAUDE.md §6), pas une régression. Refiguré sur base
fraîche (`db:reset && demo:seed` immédiatement avant), parcours vert : 241 étapes, 0 échec(s), 381
clics, 240 stations figées (139 avant — 101 nouvelles captées, tranches déjà shipped : bascule de
matérialité, CTT, tableau de bord, kanban).

**Le flake déjà documenté (J3-1) reconfirmé, pas supposé.** `tests/screens.test.ts` a fait tomber
le serveur à TROIS reprises pendant la suite complète, à trois comptes de route DIFFÉRENTS à
chaque fois (68, puis 75, puis 77) — la signature même de la contention de ressources, jamais un
défaut lié à une route précise. Vérifié, pas supposé (règle 18) : le fichier SEUL, isolé, passe
proprement (85 routes, 466,74 s, 1/1). Trois relances de la chaîne complète plus tard, une passe
propre.

**Verify complet, arbre figé, PROPRE au bout de plusieurs passes** (`set -o pipefail && timeout
3600 npm run verify … ; echo "EXIT=$?"`, mesuré `EXIT=0` à la dernière) : 138/138 fichiers,
1071/1071 tests, `npx tsc --noEmit` propre, 44 gardes, langue 0 chaîne hors catalogue · 15/15 cas
connus mauvais, lectures 0 perdue sur 1716 chemins · 6/6, écrans 91 routes/0 échec, clics 241
étapes/0 échec/381 clics/240 stations figées, visuel 328 vues/0 défaut. `docs/CLICS.md`/
`docs/DENSITE.md` régénérés (commit/build/comptes seuls).

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `49abf73`**
(`49abf733091cf63fe9838f087f15bc884d27ca62`, `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dit.vercel.app/api/sante` — l'hôte de production, jamais l'alias de branche, règle
36) : HTTP 200, `identiteCoherente:true`, toutes les lectures passent — CTRL-07 comprise, `ok:true`,
« 3 tirage(s) OE — 1 couvert(s), 2 legacy », mesuré le 2026-09-10 à 12:00:10Z. §1 du mandat du 9
septembre est maintenant COMPLET et servi.

**Ce que cette tranche NE fait PAS** (règle 19) : elle ne construit aucun mécanisme
d'« écrasement de cabinet » (remplacer `pcaob-sox.ts` par la table réelle d'un cabinet reste un
chantier séparé, non commencé) ; elle ne touche à aucun autre pack (NEP/ISA n'a jamais eu de
table d'échantillonnage attributif) ; le TOCTOU corrigé porte sur `drawAttributeSample` seul —
`tailleEchantillonOePourControle` (l'aperçu d'écran, avant tirage) reste volontairement une lecture
FRAÎCHE, jamais figée, puisqu'un écran de PRÉ-tirage doit refléter la population d'aujourd'hui.

## Correction R37 : preview confondue avec production, quatre tranches — main fusionné, PRODUCTION mesurée pour de vrai (2026-09-10)

**Le fondateur, verbatim** : « Sixteen commits since 3cd799f exist only as branch previews.
Production is still serving tranche 7. […] "shipped and confirmed live" in your summary is not:
the SHA you confirmed was served on the branch preview, not on production. […] a preview
confirmation is not a confirmation, and saying otherwise is the R37 family again. »

**Le défaut, nommé sans détour.** Les quatre tranches précédentes de cette session (§7.4 —
tableau de bord et kanban, §2 dans son ensemble — MAT-01/02/03, §3.1 — vidéo de walkthrough, §4/Lot
8 point 1 — garde de budget en base) ont chacune été annoncées « complet et servi » sur la seule foi
d'une lecture `/api/sante` prise sur l'ALIAS DE PRÉVISUALISATION de la branche
(`otto-dit-git-claude-otto-session-resume-zimig9-imperator080599.vercel.app`) — jamais sur
`otto-dit.vercel.app`. `main` lui-même n'avait pas bougé : il restait à `3cd799f` (tranche 7),
32 commits derrière la branche de travail. C'est exactement règle 13 appliquée à moi-même :
affirmer plus que ce qui a été mesuré. Les trois entrées ci-dessous qui portaient l'affirmation
fausse (`a5c4620`, `80f361f`, `a6ec6fb`) sont corrigées en place, pas réécrites en silence.

**Corrigé.** Permission de fusion restée en vigueur (le fondateur la redit ici, durablement) :
avance rapide `claude/otto-session-resume-zimig9` → `main`, sans pull request.
`git fetch origin main claude/otto-session-resume-zimig9` → `git merge-base --is-ancestor
origin/main origin/claude/otto-session-resume-zimig9` (avance rapide possible, confirmé) →
`git checkout main && git merge --ff-only claude/otto-session-resume-zimig9` (44 fichiers) →
`git push origin main` : `3cd799f..fc5ceb1  main -> main`. Un déploiement de PRODUCTION réel
(`mcp__Vercel__list_deployments`, `target: "production"`, commit `fc5ceb1`) s'est déclenché.

**SHA servi confirmé, PRODUCTION, mesuré pour de vrai = `fc5ceb1`** (`fc5ceb18c5d9c04a65192e36ce358bd1ce25cdfa`,
`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-dit.vercel.app/api/sante` — l'hôte de
production, jamais l'alias de branche, règle 36) : HTTP 200, `identiteCoherente:true`,
`shaExecution` = `sha` = le SHA poussé, toutes les lectures passent (`verdict` : « toutes les
lectures passent » — 18 lectures VIDES nommées comme telles, jamais lues comme des échecs muets),
IA-BUDGET-01 comprise (« fermée — aucune garde de budget active en base »), VID-01 comprise (VIDE,
aucun contrôle conclu sur la donnée de démonstration actuelle), mesuré le 2026-09-10 à 07:41:19Z.
**§7.4, §2 en entier, §3.1 point 1, et §4/Lot 8 point 1 sont donc, maintenant, réellement clos** au
sens que le fondateur redéfinit ici : une tranche n'est close que lorsque `otto-dit.vercel.app` la
sert — pas avant.

**Ce que cette correction ne fait PAS** : elle ne repousse le sens de « clos » que pour CE fichier.
Le prochain « SHA servi confirmé » de ce fichier doit, désormais et sans exception, nommer
`otto-dit.vercel.app` explicitement ou dire, en toutes lettres, qu'il ne s'agit que d'un aperçu de
branche — jamais l'un présenté comme l'autre.

**Aussi commité, pas encore fusionné à `main`** : l'annexe sourcée de la table d'échantillonnage
(`docs/MANDATS/2026-09-10_annexe_echantillonnage.md`, règle 33, commit `5a6401f`, vérifiée
octet-pour-octet contre le fichier reçu avant commit). §1 s'implémente à partir de cette annexe dans
la tranche suivante — non commencé à l'instant de cette entrée.

## Lot mandat 9 septembre, §4/Lot 8 point 1 : la garde de budget EN BASE (2026-09-10)

*Mandat §4 : « je peux surélever le seuil des dépenses... mais 1. la garde de budget en base
d'abord, telle que le plan l'exige — plafond en base, chemin fermé par défaut, aucune clé au
dépôt. Elle existe et refuse avant qu'un centime soit engageable. 2. Puis la mesure... 3. Puis
seulement, le fondateur relève le plafond. » CLAUDE.md, interdits : « L'activation du mode IA
vivant sur l'URL. Préparer, éprouver en rejeu, laisser le dernier geste au fondateur. Trois
préconditions dans l'ordre : garde de budget EN BASE, chemin fermé par défaut derrière un
déverrouillage que seul le fondateur connaît, aucune clé dans le dépôt. »*

**Ce qui a changé.** `app_state` (0005, déjà le patron pour un réglage global sans locataire via
`clock.ts`) porte le réglage — aucune migration neuve. `gardeBudgetEnBase()` lit ; le champ mal
typé ou absent est lu comme fermé, jamais deviné. `assertBudgetActifEnBase()` refuse `IA-BUDGET-01`
tant que l'état n'est pas actif ET complet — plafond positif ET provenance qui/quand, même
discipline « tout ou rien » que `evidence_deletion_whole` (0157) ou
`engagement_lock_verdict.confirmed_by/at` (0042). **AUCUN chemin de ce dépôt n'écrit `actif:true`**
— ni service, ni action serveur, ni script de peuplement (recensé, confirmé par les deux voix de
la revue hostile) : seule une écriture SQL directe du fondateur sur la base de production peut le
poser. C'est ce chemin ABSENT qui est le déverrouillage. Nouvelle lecture `/api/sante`
`IA-BUDGET-01` : rouge sur un état activé mais incomplet, jamais lu comme « à moitié activé ».

**Recherché avant d'écrire une ligne** (les deux voix de la revue hostile ont, chacune
indépendamment, tenté de RÉFUTER cette affirmation plutôt que de la lire) : `getOcrAdapter()`
(`adapters.ts`) coupe DÉJÀ, inconditionnellement, tout déploiement public (`demoPublique()`, vraie
sur tout déploiement Vercel — `VERCEL=1` posée par la plateforme elle-même) vers le rejeu, AVANT
même de lire `OTTO_OCR_ADAPTER`. Cette garde-ci ne bloque donc AUCUN appel réel aujourd'hui — elle
prépare la PREMIÈRE des trois préconditions sans toucher au verrou qui existe déjà. Rien n'est
activé, aucune clé n'est demandée (mandat §4).

**Revue hostile, deux voix indépendantes** (règle 30 : tranche touchant une garde de refus
budget/sécurité) — chaque voix a vérifié EMPIRIQUEMENT, par injection de mutation dans le code
(règle 17 appliquée à la revue elle-même), les deux affirmations sur lesquelles repose la sûreté de
cette tranche : confirmées vraies toutes les deux, par les deux voix, indépendamment.
- **Bloquant, trouvé par mutation (voix 1)** : la condition « qui ET quand » n'était éprouvée par
  AUCUN cas posant UN SEUL des deux champs — une mutation OR→AND sur le code réel passait les 13
  tests d'alors sans qu'aucun ne rougisse. Reproduit avant de corriger (confirmé : 2 tests
  échouent), puis retiré. Corrigé : quatre nouveaux cas (qui sans quand / quand sans qui, dans le
  service et dans la lecture `/api/sante`), la mutation re-testée et confirmée détectée.
- **Mineur (voix 2)** : le commentaire comparait `activePar`/`activeLe` à deux vraies clés
  étrangères Postgres (`evidence.deleted_by`, `engagement_lock_verdict.confirmed_by`) sans dire
  que ces deux champs-ci ne sont que des chaînes dans un `jsonb`, sans contrainte référentielle.
  Corrigé : un paragraphe « ce que cette provenance n'est pas » l'écrit en toutes lettres.
- **Non retenu (voix 1)** : marquer R18 (`docs/BACKLOG_REPORTE.md`) comme « levée » — ce tableau
  est un REGISTRE HISTORIQUE d'une nuit de plan passée (« jamais supprimée », son propre en-tête),
  pas un suivi de tâches vivant ; l'éditer pour dire « résolu » en fausserait le sens. Le lien est
  nommé ICI à la place, honnêtement borné : **R18 décrivait un risque de COURSE sur le CUMUL**
  (`gardeBudget()`/`OTTO_BUDGET_USD`, resté en mémoire de processus, **jamais touché par cette
  tranche**) et proposait « la déplacer en base » comme premier pas. Cette tranche-ci pose une
  garde EN BASE, mais répond à une question DIFFÉRENTE (« ce déploiement a-t-il le droit
  d'essayer ? », pas « le cumul est-il exact sous concurrence ? ») — **R18 reste ouvert** pour son
  risque de course d'origine.

**Verify complet, arbre silencieux, UN SEUL passage propre** (`set -o pipefail && timeout 3600 npm
run verify … ; echo "EXIT=$?"`, mesuré `EXIT=0`) : 138/138 fichiers, 1066/1066 tests, écrans 91+53/0
échec, densité 0 dépassement, clics 241/0 (379 clics, 52 gestes), visuel 328/0. 0 marqueur
« ÉCHEC »/« FAIL » dans les 832 lignes du journal. `docs/DENSITE.md`/`docs/CLICS.md` régénérés
(commit/date seuls, rien de structurel — toujours 81 écrans, 52 gestes/379 clics).

**Conduit en navigateur** : sans objet pour cette tranche — aucun écran neuf, aucun bouton neuf ;
la garde est une fonction de service et une lecture `/api/sante`, toutes deux éprouvées par leurs
tests (règle 17), jamais par un clic (rien n'est cliquable dans ce qui a changé).

**SHA servi confirmé = `a5c4620`** (mesuré en direct, `mcp__Vercel__web_fetch_vercel_url`, règle 36) :
HTTP 200, `identiteCoherente:true`, toutes les lectures passent — IA-BUDGET-01 comprise, `ok:true`,
« fermée — aucune garde de budget active en base (défaut, mandat §4) ».

**CORRECTION (2026-09-10, le fondateur, R37 sur moi-même) : cette mesure a été prise sur l'ALIAS DE
PRÉVISUALISATION de la branche**, jamais sur `otto-dit.vercel.app` (production) — `main` n'avait
pas encore reçu ce commit. « sur la donnée de production réelle » et « maintenant COMPLET et servi »
ci-dessus étaient donc faux : cette tranche n'existait pour personne d'autre que cette session.
Corrigé en fusionnant `main` par avance rapide et en mesurant `otto-dit.vercel.app` pour de vrai —
voir l'entrée de tête du fichier, 2026-09-10.

## Lot mandat 9 septembre, §3.1 : dépôt/suppression manuels de la vidéo du walkthrough, VID-01 (2026-09-09)

*Mandat §3 : « Un bouton pour déposer, un bouton pour supprimer... La suppression est toujours
tracée — qui, quand, pourquoi — et jamais silencieuse. » §3.1 : « 1. Maintenant : le dépôt manuel et
la suppression, la vidéo rangée comme une pièce du dossier avec sa provenance (qui, quand), et le
compteur de conservation. 2. Plus tard, derrière la même porte que le Lot 8 : le dépôt automatique en
fin de réunion. » §3.2 : « X est un paramètre de pack, verifie:false... Le compte à rebours ne
démarre que lorsque les deux conditions sont réunies : rapport signé ET notes de revue closes. »
`VID-01` — conclure ou maintenir conclu un D&I dont la vidéo d'inquiry a été supprimée, sans qu'une
autre preuve d'inquiry la remplace.*

**Ce qui a changé.** Le DÉPÔT existait déjà (`attacherWalkthrough`, mandat du 8 septembre) — rien à
y ajouter. Migration 0157 : `evidence.deleted_at`/`deleted_by`/`deleted_reason` (les trois ou aucune,
contrainte SQL), symétrique de `quarantined`/`quarantine_reason` — la pièce n'est JAMAIS détruite en
ligne (règle 28), seule la marque change ; `control.di_walkthrough_evidence_id` continue de pointer
dessus, interrogeable (qui, quand, pourquoi) au lieu de disparaître de l'historique. Nouveau service
`supprimerVideoWalkthrough` (sox.ts) : motif requis, tracé (`event_log`), emprunte le couloir
d'amendement post-verrou (`otto.post_lock_amendment`, 0003 §9.4, jamais employé avant cette tranche)
pour rester utilisable après clôture du dossier — exactement le scénario que §3.2 nomme. VID-01 :
`setDiStatus` refuse de conclure un D&I dont la vidéo est supprimée sans remplacement (un
ré-attachement, déjà idempotent sur le lien, sert de remplacement — aucune table de preuve séparée) ;
nouvelle lecture `/api/sante` globale pour le second cas du mandat, « maintenir conclu » (un contrôle
déjà conclu dont la vidéo est supprimée après coup). `compteurConservationVideo` (§3.2) :
`videoRetentionDays` (pack, même patron que `attributeSampleSizes`/CTRL-07) reste `verifie:false` —
aucune durée inventée ; éligibilité = rapport signé ET notes de revue closes. UI (rcm/[cid]/page.tsx) :
provenance affichée, bouton de suppression avec motif requis, compteur informatif.

**Revue hostile, deux voix indépendantes** (règle 30 : tranche touchant le modèle de données et le
couloir d'amendement post-verrou) — un constat bloquant CONVERGENT (les deux voix, indépendamment) et
un second constat bloquant propre à une voix :
- **Convergent** : `supprimerVideoWalkthrough` lisait « déjà supprimé ? » AVANT `tx()`, puis écrivait
  sans reposer la même condition — deux appels concurrents sur la MÊME pièce passaient tous les deux,
  le second écrasant silencieusement le `deleted_by`/`deleted_reason` du premier (reproduit
  empiriquement par les deux réfutateurs, `Promise.allSettled`). Corrigé : l'`UPDATE` porte lui-même
  la condition (`where deleted_at is null returning id`) — zéro ligne rendue déclenche le refus,
  jamais un écrasement. Nouveau test qui reproduit la course.
- **Voix 1 seule, règle 17** : le couloir d'amendement post-verrou — le mécanisme le plus neuf de
  cette tranche — n'était exercé par AUCUN test contre un dossier réellement VERROUILLÉ, exactement
  le scénario que §3.2 nomme. Les deux voix ont vérifié MANUELLEMENT qu'il fonctionne aujourd'hui,
  mais rien ne le prouvait dans la suite livrée. Corrigé : nouveau test qui verrouille l'engagement,
  prouve qu'une écriture directe est refusée (cas connu mauvais), que la fonction réussit malgré le
  verrou, et que le réglage ne fuit pas vers une écriture sans rapport juste après.
- **Voix 2 seule** : la table des tâches (et son formulaire d'ajout) vivait dans la branche « attaché
  et non supprimé » de l'écran — supprimer la vidéo la rendait invisible alors que
  `control_task`/`control_task_procedure` restent intacts en base (règle 13). Corrigée, reconfirmée en
  navigateur (Playwright, dev server réel, reset+reseed) : la table garde sa ligne avant et après
  suppression.
- **Mineures, une convergente** : `evidence_deletion_whole` ne retire que l'espace ASCII
  (`btrim`) — un motif de tabulations/sauts de ligne seuls la satisferait ; non atteignable par le
  seul chemin qui écrit aujourd'hui (`raison.trim()` en JS), documenté plutôt que tu (règle 19).
  L'arithmétique du compteur (`joursRestants`/`purgeable`) n'était exercée par aucun test
  (`videoRetentionDays` jamais posé) — extraite en fonction pure (`calculerConservationVideo`),
  testée directement. Trois des quatre tests du fichier de service ne nettoyaient rien en `finally` —
  corrigé, un nettoyeur commun appliqué partout.

**Verify complet, arbre silencieux, UN SEUL passage propre** (`set -o pipefail && timeout 3600 npm
run verify … ; echo "EXIT=$?"`, mesuré `EXIT=0`) : 137/137 fichiers, 1053/1053 tests, écrans
91+53/0 échec, densité 0 dépassement, clics 241/0 (379 clics, 52 gestes, 231 stations vérifiées),
visuel 328/0. `docs/DENSITE.md` régénéré (commit/build seuls, rien de structurel — toujours 81 écrans,
0 dépassement). Aucune station clics ne touche `/rcm/[cid]` (comme les tranches CTRL-01..07
précédentes) : pas de nouvelle station ajoutée, cohérent avec ce précédent.

**Conduit en navigateur avant d'être annoncé** (règle 10, deux passages, dev server réel,
`OTTO_DEMO_PUBLIC=1`) : dépôt existant, suppression avec motif, notice de provenance (qui/quand/motif),
ré-affichage du formulaire de dépôt, et — après le correctif de la revue hostile — la table des tâches
qui garde sa ligne avant ET après suppression, confirmée par un rechargement complet de la page.

**SHA servi confirmé = `80f361f`** (mesuré en direct, `mcp__Vercel__web_fetch_vercel_url`, règle 36) :
HTTP 200, `identiteCoherente:true`, toutes les lectures passent — VID-01 comprise, `ok:true`, VIDE
sur la donnée de démonstration actuelle (aucun contrôle conclu, donc rien à signaler).

**CORRECTION (2026-09-10, le fondateur, R37 sur moi-même) : mesuré sur l'ALIAS DE PRÉVISUALISATION
de la branche**, pas sur `otto-dit.vercel.app` — `main` n'avait pas ce commit. « maintenant COMPLET
et servi » était faux : invisible en production jusqu'à la fusion par avance rapide du 2026-09-10
(voir l'entrée de tête du fichier).

## Lot mandat 9 septembre, §2.4 : les codes de refus MAT-01/02/03 (2026-09-09)

*Mandat §2.4 : MAT-01 — « viser un dossier où un FSLI est devenu matériel sans que sa section soit
ouverte. » MAT-02 — « conclure un FSLI devenu matériel sans qu'une demande de détail existe pour
ses comptes au-dessus du CTT. » MAT-03 — « un ré-import qui effacerait un tirage, un papier ou un
visa existant. Le rapprochement se refait ; le travail, jamais. »*

**Ce qui a changé.** MAT-01/MAT-02 : nouvelle famille `materialite` dans `obstaclesAuVisa`
(obstacles.ts), lue depuis `obstaclesMaterialite(engagementId)` — même filtre que
`basculesMaterialite` (une bascule résolue par le programme normal, `scoping='in_scope'`, cesse
d'être comptée, même si la ligne historique reste permanente, règle 28). MAT-01 vérifie qu'une
`section_state` existe pour chaque bascule non résolue ; MAT-02 recalcule contre le CTT VALIDÉ
COURANT (pas celui figé au moment de la détection) si un compte du poste le dépasse toujours sans
qu'une demande `EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT` n'existe.

MAT-03 : recherche préalable (agent dédié, pas devinée) — ni `importTb`, ni `rebuildFslis`, ni
`importFec` ne détruisent jamais tirage/papier/visa (`superseded`/`outdated` sont des UPDATE,
aucune table ne référence `fsli.id` par clé étrangère). Deux preuves : un test comportemental
(`retirage.test.ts`) qui rejoue un VRAI ré-import et compare les comptes avant/après (jamais en
baisse, avec un papier RÉEL visé dans la fixture après la revue hostile — voir plus bas) ; une
lecture `/api/sante` sur l'état courant, avec son cas connu mauvais.

**Revue hostile, deux voix indépendantes** (règle 30 : tranche = code de refus) — les deux voix
ont convergé sur le MÊME défaut architectural par deux angles différents, et chacune a trouvé un
constat bloquant propre :
- **Convergent** : la demande CTT n'était retentable qu'à l'INSTANT de la détection (gardée par le
  même `on conflict do nothing` que le drapeau) — un poste déjà basculé dont la première tentative
  échouait, ou dont le CTT baissait ensuite, restait bloqué SANS AUCUN REMÈDE. Corrigé :
  `detecterBasculesMaterialite` réévalue désormais la demande CTT à CHAQUE import pour TOUT poste
  portant déjà un drapeau, neuf ou ancien — idempotent (vérifie l'absence de demande avant de
  tenter).
- **Voix 2 seule** : le drapeau et la section se posaient par deux écritures séparées, non
  atomiques — un échec du second aurait laissé un drapeau SANS section, exactement le trou que
  MAT-01 existe pour attraper, avalé sans trace par le `.catch(() => undefined)` du seul site
  d'appel. Corrigé : les deux insertions vivent dans UNE transaction (`tx()`) ; un échec est
  consigné dans `event_log` et n'avorte que ce poste-là.
- **Voix 2 seule** : la nouvelle lecture `/api/sante` MAT-01/MAT-02 ne pouvait jamais rougir
  elle-même (règle 22) — purement informative. Corrigée : elle reste informative sur le simple
  compte (un obstacle ouvert n'est pas une panne), mais rougit désormais sur le signal qui EST
  une panne — un échec journalisé (`materialite_bascule_echec`/`detail_de_compte_ctt_echec`)
  jamais guéri par la retentative, avec son propre cas connu mauvais.
- **Voix 1 seule** : deux des trois assertions MAT-03 de `retirage.test.ts` (papiers, visas)
  étaient vacuement 0-avant/0-après — la fixture ne créait jamais de papier ni de visa (règle 17).
  Corrigé : un papier réel, visé (`preparer_validator`), est créé avant la mesure « avant ».
- **Voix 1 seule** : la famille `materialite` manquait au registre de gardes déclarées
  (`scripts/gardes.ts`, `docs/GUARDS.md`) — corrigé, 43 → 44 gardes.
- **Reportés, jugements non mécaniques** (règle 23, R72/R73 dans `docs/BACKLOG_REPORTE.md` et
  `docs/instantanes/fils.json`) — le correctif ci-dessus réduit sans éliminer : R72 (voix 2, un
  seul réfutateur) — MAT-01/MAT-02 bloquent le visa du DOSSIER, alors que le mandat dit « conclure
  UN FSLI » pour MAT-02, et aucune primitive « conclure ce FSLI » distincte n'existe
  (`signWorkpaper` ne consulte jamais l'état des bascules). R73 (les deux voix, constat
  convergent) — une matérialité revalidée SANS import ultérieur ne redéclenche pas la retentative
  CTT, qui vit dans `detecterBasculesMaterialite`, jamais dans `materiality.ts::validate`.

**Verify complet, arbre déjà silencieux, DEUX passages** (targeted d'abord — tous verts — puis la
chaîne complète). Le premier passage complet a rougi UNE fois, sur `tests/screens.test.ts` :
« le serveur est tombé après 84 route(s) », après 32 s sur une seule route juste avant — un
symptôme déjà nommé plus tôt dans cette même session (contention de ressources, pas une
régression). Confirmé, PAS supposé (règle 18) : `screens.test.ts` rejoué SEUL, propre, 1/1 en
342 s. Second passage COMPLET, sur l'arbre inchangé : `set -o pipefail && timeout 3600 npm run
verify … ; echo "EXIT=$?"`, **EXIT=0** — 135/135 fichiers, 1041/1041 tests, écrans 91+53/0
échec, clics 241/0 (379 clics, 231 stations vérifiées), visuel 328/0.

**SHA servi confirmé = `a6ec6fb`** (mesuré en direct, `mcp__Vercel__web_fetch_vercel_url`, jamais une
attente de CI, règle 36) : HTTP 200, `identiteCoherente:true`, toutes les lectures passent — les deux
lectures MAT-01/MAT-02 et MAT-03 comprises, `ok:true`, VIDE sur la donnée de démonstration actuelle
(aucune bascule n'y existe encore, donc rien à signaler — pas de faux positif).

**CORRECTION (2026-09-10, le fondateur, R37 sur moi-même) : mesuré sur l'ALIAS DE PRÉVISUALISATION
de la branche**, pas sur `otto-dit.vercel.app` — `main` n'avait pas ce commit. « maintenant COMPLET
et servi » était faux : invisible en production jusqu'à la fusion par avance rapide du 2026-09-10
(voir l'entrée de tête du fichier).

## Lot mandat 9 septembre, §2.2/§2.3 : section ouverte et demande de détail CTT (2026-09-09)

*Mandat §2.2 : « si un import rend un FSLI matériel, sa section de documentation est engendrée
automatiquement. » Mandat §2.3 : « une demande de détail est créée sur les comptes au-dessus du
CTT », en réutilisant le mécanisme de demandes de la Partie B, aucun chemin neuf. Épreuves §2.5 :
un import qui fait basculer un compte ouvre la section ET crée la demande, « le même import ».*

**Ce qui a changé.** La MÊME détection qui pose le drapeau (§2.1, `detecterBasculesMaterialite`)
fait désormais deux choses de plus pour chaque bascule NOUVELLEMENT posée :
- **§2.2** — insère un `section_state` (kind='poste'), même forme que `assurerSections`
  (sections.ts). NÉCESSAIRE parce qu'un poste `ns_confirmed` (D9) n'entre JAMAIS dans
  `postesRetenus` (rail.ts : `scoping in ('in_scope','in_scope_qualitative')` seulement) — sans ce
  geste, `assurerSections` ne lui aurait jamais ouvert de section, et le drapeau serait resté
  invisible du tableau de bord, du suivi et du kanban. `fsli.scoping` n'est JAMAIS touché (D9
  intact) : ce geste rend seulement le dossier du poste (leadsheet, revue analytique, et tout le
  reste de `/poste/[code]`) ATTEIGNABLE.
- **§2.3** — `requests.ts::demanderDetailAuDessusDuCtt` (nouvelle fonction, DISTINCTE de
  `demanderDetailDeCompte`/Partie B dont le comportement ne change pas) crée une demande filtrée
  aux comptes du poste dont le solde absolu atteint ou dépasse le CTT (`materiality.ctt_amount`,
  pas le seuil de performance qui a servi à détecter la bascule). Nouveau `evidence_type_code`
  distinct (`detail_de_compte_ctt`) pour ne jamais se confondre, dans
  `derniereDemandeDetailDeCompte`, avec la demande Partie B sur tout le poste. Si aucun compte ne
  dépasse le CTT, aucune demande n'est créée — pas une erreur (un poste peut devenir matériel par
  somme de petits comptes, chacun sous le CTT ; couvert par un test dédié). Import DYNAMIQUE
  fsli.ts → requests.ts (même patron que `obstacles.ts`/`matching.ts` ailleurs dans ce dépôt) :
  `requests.ts` importe déjà `frameworkSet`/`fsliAccounts` DEPUIS `fsli.ts`, un import statique en
  sens inverse aurait créé un cycle.

Deux lectures `/api/sante` le jour même (règle 22) : la section de chaque bascule est ouverte ; et
aucune demande CTT n'existe sans une bascule réelle derrière (un contrôle d'orphelin — PAS un
contrôle que la bascule DEVRAIT avoir une demande, ce qui n'est vrai que si un compte dépasse le
CTT, règle 19). Chacune a son cas connu mauvais (règle 17), et chaque test positif vérifie
désormais le compte RÉEL contre la base (pas seulement `ok:true`, qui serait aussi satisfait par
« zéro » — corrigé après la revue hostile, voir plus bas). Station clics ajoutée : la demande CTT
est visible sur `/requests` (aucun écran neuf, épreuve §2.5) et cliquable.

**Trouvé en construisant les tests, pas deviné (règle 18).** `addMappingOverride` (fsli.ts)
termine par un `rebuildFslis`, qui réinitialise `scoping` à `unscoped` pour tout FSLI SANS
`confirmed_by` — `REVENUE`, `in_scope` mais jamais confirmé par un humain dans `bootstrapNep`
(la seule variable du jeu synthétique), redevenait alors un candidat et basculait lui aussi sur
le même import de sonde, provoquant une violation de clé étrangère au nettoyage du test. Les
fixtures posent donc leur `coa_map_rule` en SQL direct plutôt que via `addMappingOverride`.

**Revue hostile, un réfutateur** (règle 30, cadence : ni modèle de données neuf, ni code de refus
dans cette tranche) — trois constats, tous corrigés :
1. Sans try/catch autour de `demanderDetailAuDessusDuCtt`, sa seule levée prévue (poste absent du
   catalogue du pack — ne devrait jamais arriver) aurait avorté l'évaluation de TOUS les candidats
   restants de la boucle en silence, alors que le drapeau et la section du poste courant restent
   posés et doivent le rester (règle 28). Corrigé : try/catch local, consigné dans `event_log`
   (verbe `detail_de_compte_ctt_echec`), jamais avalé sans trace (règle 13).
2. Les deux tests positifs des lectures `/api/sante` ne vérifiaient que `ok === true`, satisfait
   identiquement par « aucune bascule/demande pour l'instant » — un monde de démonstration régressé
   à zéro n'aurait rien fait rougir. Corrigé : chaque test compare désormais le `detail` exact au
   compte réel mesuré contre la base.
3. Le commentaire disait « dépasse le CTT », le code compare par `>=` — wording resserré, aucun
   changement de comportement.
Le réfutateur a confirmé, en lisant lui-même `rebuildFslis`/`addMappingOverride`, que le diagnostic
ci-dessus (§ « trouvé en construisant ») était correct, pas une erreur de diagnostic.

**Deux tentatives de `clics` ratées avant la mesure valide, toutes deux nommées plutôt que
cachées.** La première a été tuée par un `timeout 900` jamais mesuré (règle 35 : un budget
inventé, pas une mesure connue de ce dépôt) avant sa fin. La seconde a tourné sur la base déjà
jouée par la première (le dossier de démonstration déjà clos par la première tentative) — 63
stations ont rougi pour rien, exactement le défaut documenté CLAUDE.md §6 (« sur une base déjà
jouée, des stations rougissent pour rien »). Aucune des deux n'a été prise pour une mesure valide.
Base re-semée (`db:reset && demo:seed`), troisième tentative propre : **241 étapes, 0 échec(s),
379 clics sur 52 gestes, 231 stations figées toutes vérifiées, aucune jamais atteinte.**

**Verify complet, arbre déjà silencieux** (targeted d'abord — typecheck, tests ciblés, langue,
lectures, gardes tous verts — puis la chaîne complète, une seule fois, sur l'arbre qui avait cessé
de produire des constats) : `set -o pipefail && timeout 3600 npm run verify … ; echo "EXIT=$?"`,
**EXIT=0** — 132/132 fichiers, 1031/1031 tests, écrans 91+53/0 échec, clics 241/0 (379 clics),
visuel 328/0.

**SHA servi** : à confirmer après le push (commit `fa22993`), par `/api/sante` sur le déploiement
d'aperçu de cette branche — voir l'entrée qui suit.

## Lot mandat 9 septembre, §2.1 : la bascule de matérialité (2026-09-09)

*Mandat §2.1 : un poste devenu matériel après un nouvel import (le solde franchit la matérialité
de travail) doit se signaler — « voir si on a loupé du testing », en particulier pour un poste
qu'un humain a déjà confirmé non matériel (`fsli.confirmed_by`), que `proposeScoping` (D9) ne
recorrigera plus jamais de lui-même.*

**Ce qui a changé.** `supabase/migrations/0156_mat01_bascule_materialite.sql` — table
`fsli_materiality_bascule` (`engagement_id, fsli_code, import_file_id, scoping_avant, solde,
seuil_performance, detectee_le`), `unique(engagement_id, fsli_code)` : le premier import qui fait
franchir le seuil pose la ligne, un ré-import ne la rejoue ni ne la duplique jamais (règle 28 —
comme R47/R67/R69/R70). `detecterBasculesMaterialite(engagementId, importFileId, userId)`
(`fsli.ts`) compare le solde COURANT de chaque poste non matériel (`unscoped`/`ns_proposed`/
`ns_confirmed`) à la matérialité de travail VALIDÉE courante — jamais un diff du champ `scoping`
lui-même, qui ne bouge plus pour un poste `ns_confirmed` (D9). Appelée depuis
`uploadTbAction` (imports courants seulement) et depuis `bootstrapNep` (monde de démonstration,
confirmé empiriquement : ~8 bascules réelles — PAYROLL 2,6 M€, PPE 1,05 M€, PURCHASES 1,79 M€,
TRADE_RECEIVABLES…). Écran : nouveau panneau sur `/eng/[id]/materiality` (langage EXISTANT, pas
`.epure` — un ajout à un écran déjà en place, jamais repeint rétroactivement), toujours visible
quand non vide, un lien par poste vers `/eng/[id]/poste/[code]`. Lecture `/api/sante` le jour même
(règle 22) : aucune bascule ne doit provenir d'un import de comparatif N-1 (jointure
`fsli_materiality_bascule → import_file → tb_snapshot`, lève si `period_kind = 'prior'`). Station
clics ajoutée (`scenario.ts`) : la ligne cliquée mène au poste réel.

**Revue hostile, deux voix indépendantes** (rule 30 : tranche touchant le modèle de données) —
convergence sur un constat, une seule voix sur un second :
- **Convergent** : `q1(...).catch(() => null)` sur l'insertion `on conflict do nothing` confondait
  « déjà posée » et « vraie erreur SQL » — corrigé en `q01` (rend `null` sur zéro ligne SANS lever,
  une vraie erreur continue de se propager).
- **Voix 1 seule** : le cas connu mauvais « poste système sous le seuil » dépendait d'un état
  accidentel du monde de démonstration que `bootstrapNep` ne produit plus depuis cette tranche
  elle-même (chaque poste hors CA y est désormais confirmé) — le test se déclarait « rien à
  éprouver » à chaque exécution, sans jamais exercer la protection qu'il prétendait garder (règle
  17). Corrigé : fixture construite explicitement (poste de sonde inséré sous le seuil, jamais
  confirmé), qui échoue vraiment sans le correctif et passe avec.
- Non bloquants pour les deux voix, laissés en l'état : lecture `/api/sante` sans compte détaillé
  par poste (précédent kanban) ; verdict `'garde'` plutôt que `'journal'` sur le geste de verrou ;
  pas de clé étrangère croisée `import_file_id`/`engagement_id`.

**Verify complet, arbre déjà silencieux** (targeted d'abord — 5/5 vert — puis la chaîne complète,
conforme à la nouvelle discipline de séquencement) : `timeout 3600 npm run verify … ; echo
"EXIT=$?"`, EXIT=0 — 130/130 fichiers, 1025/1025 tests, clics 239/0, visuel 328/0.

**SHA servi confirmé** — `dabe2af820e8a8906e7106bd1fc13361b9580019`, déploiement
`otto-6lh7cl46i-imperator080599.vercel.app` (aperçu, branche
`claude/otto-session-resume-zimig9`), mesuré par `/api/sante` : HTTP 200, `sha` et
`shaExecution` identiques, `identiteCoherente:true`, lecture « bascule de matérialité » elle-même
`ok:true` (VIDE sur ce déploiement — base non semée — sans lever, ce qui est le comportement
attendu, pas une preuve empruntée à la base locale : les ~8 bascules du monde de démonstration
sont mesurées LOCALEMENT, citées ci-dessus, jamais confondues avec cette mesure de production).

**Note de processus (correction du fondateur, même jour)** : chaque `verify` de cette tranche a
bien été lancé avec `timeout 3600` intégré littéralement dans la commande shell (jamais seulement
dans le libellé de la tâche) ; mesuré directement (`ps aux`, `mtime` du journal) sur demande du
fondateur après un signalement de run qui semblait bloqué — aucun processus vivant retrouvé, le
journal cité par le fondateur avait cessé de grossir ~2 h 50 avant la mesure, cohérent avec une
fin propre plutôt qu'un blocage. Adopté pour la suite : régler d'abord les vérifications ciblées,
réserver la chaîne complète d'une heure à un arbre qui a déjà cessé de produire des constats.

## Lot contrôle interne, tranche 9 : §7.4, le kanban des écarts — §7.4 COMPLET (2026-09-09)

*Mandat §5/§7.4 : « Kanban : colonnes dérivées des états réels du travail ; déplacer une carte
exécute le geste métier correspondant, jamais un changement d'étiquette décoratif. » Et : « Le
kanban et le tableau de bord ne possèdent aucun objet. Une carte qui ne se résout pas à
l'identifiant d'un objet réel est un décor. » Épreuve d'acceptation (§6, point 8) : « un test
échoue si une seule carte ne se résout pas à l'identifiant d'un objet existant. » Seconde et
dernière moitié de §7.4 (tableau de bord d'abord, tranche 8 ci-dessous — kanban ensuite).*

**L'objet choisi, et pourquoi.** Recherche comparative (workpaper/request/section_state/deviation/
control) avant d'écrire une ligne : `exception` (matching.ts) est le SEUL objet dont le cycle porte
PLUSIEURS gestes RÉELS déjà câblés — `draftClarificationRequest`, `resolveException`,
`escalateToMisstatement`, tous déjà des formulaires sur `/exceptions`. `section_state.statut`
écarté explicitement : DÉRIVÉ en SQL, jamais posé — un kanban dessus aurait été le décor exact que
le mandat interdit (glisser une carte n'y exécuterait littéralement rien). `deviation` et
`control.di_status` : un seul geste réel câblé chacun, trop minces pour des colonnes multiples.

**Ce qui a changé.** `/eng/[id]/kanban` (nouveau, langage `.epure`) : cinq colonnes
(open/clarification_requested/explained/resolved/escalated), chaque carte un écart réel
(`listExceptions`). AUCUN glisser-déposer : ce dépôt n'en a nulle part, et deux des trois gestes
(résoudre, escalader) exigent une donnée probante NEP 500 qu'aucun glissement ne peut porter
honnêtement. « Déplacer » est donc un LIEN vers l'ancre déjà posée sur `/exceptions` (`#x-<id>`,
ADR-102) où vit le VRAI formulaire, déjà gardé — zéro duplication. Le seul geste exécuté DEPUIS le
tableau lui-même : `draftClarificationRequest`, un bouton par colonne (pas par carte, puisque la
fonction elle-même est un geste DE LOT — la représenter comme un glissement individuel aurait menti
sur sa vraie granularité, dans l'autre sens que le mandat interdit).

**`scope_limitation` — le sixième état réel, trouvé sans écran, enregistré R71.**
`exception.status` porte SIX valeurs (0009_probative_gates.sql) ; le kanban n'en montre que cinq —
les cinq dont un formulaire existe déjà. `recordScopeLimitation` (matching.ts) est un geste RÉEL et
TESTÉ qu'AUCUN écran n'appelle (grepé, confirmé). Non ouvert dans cette tranche (construire son
formulaire dépasse « ajouter une vue kanban ») : enregistré `docs/BACKLOG_REPORTE.md` et
`docs/instantanes/fils.json` (R71), avec sa condition de retrait nommée. La lecture `/api/sante`
neuve compte CES écarts À PART du compte de colonnes pour qu'ils ne se perdent jamais dans un total
qui semblerait complet sans eux (règle 13) — et sur la démonstration publique, ils existent déjà
réellement : 4 écarts en `scope_limitation`, mesurés en production (voir SHA servi ci-dessous), pas
seulement dans un test.

**Lecture `/api/sante` ajoutée le jour même** (règle 22, sonde `kanban-lecture.test.ts`) : la somme
des cinq colonnes + `scope_limitation` doit égaler le total des écarts. Le check constraint SQL
fermé sur six valeurs rend un septième statut irreproductible — donc non simulable comme cas connu
mauvais (règle 17, limite nommée dans le commentaire de la lecture elle-même, règle 19) ; ce que la
lecture PEUT réellement rater est une divergence entre sa propre requête et les colonnes du kanban,
prouvée par couverture positive des six statuts réels (dont `resolved` et `scope_limitation`, posés
par leur VRAI chemin gardé — `resolveException`, `recordScopeLimitation` — jamais par un statut SQL
nu qui violerait leurs propres contraintes probantes).

**Station clics** (mandat §6 point 8, épreuve d'acceptation) : chaque id de carte relevé sur le
kanban doit se retrouver comme ancre réelle sur `/exceptions` — `clics` tourne contre un BUILD DE
PRODUCTION sans accès direct à la base, donc la preuve passe par une SECONDE PAGE qui lit la même
table. Zéro carte reste un ÉCHEC de la station (pas une excuse), même leçon que « mes travaux »
(tranche antérieure). Le geste de lot a été exercé sur la branche « colonne vide » ce run-ci (0
écart ouvert à ce point du script) ; `draftClarificationRequest` reste néanmoins prouvé de bout en
bout ailleurs dans la suite (`s5s6.test.ts`, `loop.test.ts`), pas seulement supposé.

**Correctif appliqué en construisant, avant tout commit de tranche** : un style inline construisant
`gridTemplateColumns` par gabarit (`repeat(N, 1fr)`, N = le nombre de colonnes) faisait rougir le
garde de langue (faux positif — du CSS, pas du texte). Retiré ; `.epure-grille` (déjà posée,
tranche 8, `repeat(auto-fit, minmax(220px, 1fr))`) suffit pour cinq colonnes sans style dynamique.

**Revue hostile (1 voix — tranche sans modèle de données, sécurité, multi-tenant ni code de
refus)** : SHIP AS-IS, aucun constat bloquant. Vérifié en empruntant le chemin (pas par grep seul,
règle 24) : la résolution carte→objet, l'invariant de la lecture, la station clics contre un
faux-positif à vide, la non-duplication de formulaire, le choix de l'objet lui-même.

**Verify complet, UN SEUL run continu, sur le tree du commit `1f1a9a5`** (`timeout 3600`,
`pipefail` en tête) : tsc propre · 1020/1020 tests vitest · 43/43 gardes · langue 0 doublon (après
correctif du faux positif CSS) · 231 stations figées vertes · screens/fumee propres · densité 0
dépassement (81 écrans, `/kanban` ajouté) · **clics 237/237 étapes, 0 échec, 363 clics sur 50
gestes** · **visuel 328/328 vues, 0 défaut**. `EXIT=0` mesuré.

**SHA poussé** : `1f1a9a5` (`d0a4a85` par-dessus : régénération de `docs/CLICS.md`/`DENSITE.md`,
rien de structurel). **SHA servi confirmé = `1f1a9a5`**, mesuré en direct
(`mcp__Vercel__web_fetch_vercel_url` sur `https://otto-nl3cwdoh9-imperator080599.vercel.app/api/sante`,
jamais une attente de CI, règle 36) : `HTTP 200 · sha=1f1a9a5f2ee80764ff0d626fcaa4169307cb724c ·
identiteCoherente=true`. Toutes les lectures passent, la lecture « kanban des écarts » comprise —
`13 écart(s) · 9 en colonne(s) · 4 en scope_limitation (sans écran, R71)` : la démonstration
publique porte RÉELLEMENT quatre écarts scope_limitation, et l'invariant les compte sans les
perdre, sur de la vraie donnée, pas seulement sur le cas de sonde. **Toujours pas un déploiement de
PRODUCTION** (`target: null`) : aucune pull request n'a été demandée pour ce lot.

**§7.4 du mandat contrôle interne (docs/MANDATS/2026-09-08_mandat_controle_interne.md) est
maintenant COMPLET.** §0 du mandat — le lot entier — est livré : CTRL-01 à CTRL-07 (tranches 1-7,
2026-09-08/09), le tableau de bord (tranche 8) et le kanban (cette tranche). Prochain, dans l'ordre
révisé par le fondateur : §1/§2/§3 du mandat du 9 septembre.

**Bloqueur trouvé en recherchant §1 (la table d'échantillonnage sourcée)** : le mandat exige une
source publique, primaire, citable — `WebSearch` fonctionne dans ce bac à sable, mais `WebFetch`
retourne `EGRESS_BLOCKED` pour tous les domaines primaires essayés (pcaobus.org, sec.gov,
hudoig.gov) : la politique réseau du bac à sable bloque la récupération de texte vérifiable. Un
résumé de moteur de recherche n'est PAS un texte primaire citable (règle 8, mandat §1 : « aucune
valeur de mémoire »). §1 reste donc NON COMMENCÉ, honnêtement, plutôt que rempli d'un paraphrase
non vérifiable — à signaler au fondateur si l'accès réseau peut être élargi, ou à traiter avec une
source que le fondateur fournirait directement.

## Lot contrôle interne, tranche 8 : §7.4, le suivi de mission — tableau de bord (2026-09-09)

*Mandat §5/§7.4 : « Tableau de bord : avancement par poste, ce qui bloque le visa, l'âge des
demandes en attente, les écarts non conclus. Tout compteur mène quelque part. Rien de neuf en base
tant qu'une vue suffit. » Construction en deux moitiés (§7) : « tableau de bord d'abord (vue pure),
kanban ensuite » — cette tranche livre la première moitié. Premier écran dans le nouveau langage de
design (mandat du 2026-09-09, §5, direction Optro.ai) : le geste concret que ce même amendement
demande AVANT tout écran neuf — engendrer le jeton de design comme source unique — est fait ici.*

**Ce qui a changé.** `/eng/[id]/suivi` (nouveau, route distincte de `/eng/[id]` — assignations,
« my work » — et de `/eng/[id]/dashboard` — traceur de demandes, dépense IA) : une VUE PURE, aucune
table neuve. Quatre panneaux, chacun un compteur qui MÈNE quelque part (D.6) : avancement par poste
(`sectionsDuDossier` filtré `kind='poste'`, chaque ligne vers sa page de poste), ce qui bloque le
visa (`obstaclesAuVisa`, chaque famille vers son `ou` réel), demandes en attente du client
(`requestsEnAttente`, neuf — `requests.ts` — l'âge se compte depuis `sent_at`, jamais
`created_at` : `approveSend` pose les deux ENSEMBLE, dans la même instruction, jamais l'un sans
l'autre), écarts non conclus (`listDeviations`, `control_id` ajouté — additif, aucun appelant
existant cassé — pour que chaque écart mène à son contrôle réel sur `/rcm/[cid]`).

**Le langage de design (§5 du mandat du 9 septembre).** `globals.css` porte désormais un bloc
`.epure` — une SOURCE DE JETONS séparée de `:root`, jamais un `:root` réécrit : tout écran EXISTANT
garde son encre à l'octet près (vérifié par `npm run visuel`, qui scanne les 79 écrans anciens en
plus du neuf — aucun n'a bougé). La repasse rétroactive sur les écrans existants reste un lot
séparé, en file, que seul le fondateur déclenche (§5 : placement « (c) puis (a) ») — cette tranche
ne l'ouvre pas. Fond ivoire, cartes blanches à rayon généreux et ombre quasi nulle, un seul accent
violet saturé, couleurs sémantiques désaturées, grands chiffres légers pour les compteurs, mono en
capitales pour les codes techniques (D.6 point 1 : la phrase d'abord, le code de refus ensuite, en
petit) — le rail et le bandeau, chrome PARTAGÉ par tout écran ancien compris, restent inchangés :
`.epure` ne s'applique qu'au contenu propre de `/suivi`.

**Lecture `/api/sante` ajoutée le jour même** (règle 22, avec son fichier de sonde —
`suivi-lecture.test.ts`, même forme que CTRL-0x) : aucune demande au statut « envoyée » sans date
d'envoi — `approveSend` ne peut structurellement pas produire ce cas, donc la lecture ne peut
rougir que si ce chemin a été contourné (SQL direct, régression). Cas connu mauvais posé et vérifié
(règle 17) : rouge sur le contournement, vert sur le chemin gardé.

**Verify complet, en UN SEUL run continu, sur le tree du commit `3c5b3f8`** (`cd app && npm run
verify`, sous `timeout 3600`, `set -o pipefail` en tête) : tsc propre · 1019/1019 tests vitest ·
43/43 gardes à jour · langue 0 chaîne hors catalogue, 0 doublon sémantique · lectures et parcours
(231 stations figées) verts · screens et fumée propres · densité 0 dépassement (`/eng/[id]/suivi` à
0 action primaire, loin du plafond de 5) · **clics 235/235 étapes, 0 échec, 363 clics sur 49
gestes** · **visuel 320/320 vues, 0 défaut**. `EXIT=0` mesuré (pas seulement celui du dernier
maillon d'un pipe — `pipefail` posé avant `timeout`, leçon de la règle 34/35).

**Ce que la première mesure a trouvé, et qui a été corrigé avant d'expédier** (trois runs
complets ont tourné avant celui-ci ; rien n'a été tu) :
1. `rail.test.ts` — l'entrée neuve du rail (« Engagement tracking », toujours atteignable comme la
   vue d'ensemble) manquait à l'ensemble EXHAUSTIF que le test énumère. Assertion mise à jour.
2. `langue.test.ts` — doublon sémantique : `suivi.rienNeBloque` répétait mot pour mot `obst.aucun`.
   Le concept existait déjà ; la page réutilise `obst.aucun`, la clé dupliquée retirée.
3. `tests/screens.test.ts` — un timeout sur `/team`, SANS rapport avec ce diff : reproduit propre en
   isolation, root-causé à une contention (un agent de recherche tournait en fond pendant le
   balayage réel des écrans — même famille que la leçon « deux vitest en parallèle », CLAUDE.md §7).
4. Station clics « suivi » (la mienne) : sélecteur CSS comparant une URL absolue à un attribut DOM
   relatif (`a[href="…"]` ne matche jamais un `<Link>` Next) — corrigé en suffixe (`$=`), même
   convention que le reste du fichier.
5. Même station : un clic suivi d'un `waitForLoadState` fait à la main lisait l'URL avant la fin de
   la transition client — remplacé par l'helper `cliquer()` déjà éprouvé par tout le fichier.
6. `npm run visuel` : deux couleurs `.epure` (ambre, vert) sous le plancher de contraste de 3:1
   (2,76:1 et 2,74:1 mesurés/calculés) — assombries jusqu'à ~4,2:1, désaturées plutôt que vives
   (l'esthétique du mandat et le plancher de lisibilité ne s'opposaient pas).

**La revue hostile (1 voix — tranche sans modèle de données, sécurité, multi-tenant ni code de
refus, amendement de cadence)** a trouvé deux constats de plus, tous deux corrigés :
7. BLOQUANT — `demandes[demandes.length - 1]` prenait la demande la plus RÉCENTE sous le libellé
   « la plus ancienne » (`requestsEnAttente` trie `sent_at asc` : l'index 0 est le plus ancien).
   Ni le test de service ni la station clics ne pouvaient l'attraper (aucun des deux ne lit le
   texte de l'âge affiché) — silence lu comme un succès (règle 13). Corrigé : `demandes[0]`.
8. NON BLOQUANT, corrigé quand même — la lecture `/api/sante` neuve n'avait pas encore son fichier
   de sonde (règle 17). `suivi-lecture.test.ts` ajouté, cas connu mauvais + protecteur + chemin
   gardé réel, tous vérifiés (voir « Lecture /api/sante » ci-dessus).

Tous deux corrigés, reconfirmés par le verify complet cité plus haut (le run qui a produit les
chiffres 1019/235/320 ci-dessus est le run qui suit CES DEUX correctifs, pas un run antérieur).

**Périmètre gelé tenu** : aucune table neuve, aucun cycle au-delà du chiffre d'affaires, aucune
procédure de méthode ajoutée. **§7.4 du mandat contrôle interne est maintenant à mi-chemin** : le
tableau de bord est livré ; le kanban (seconde moitié) suit, sur ce même arbre, sans interruption.

**SHA poussé** : `3c5b3f8` sur `claude/otto-session-resume-zimig9`, mesuré (pas supposé). **SHA
servi confirmé = `3c5b3f8`** — cette branche déploie un APERÇU à chaque push (Vercel, sans mandat
requis pour un aperçu — l'interdit ne porte que sur `main`/production), mesuré en direct
(`mcp__Vercel__list_deployments` puis `mcp__Vercel__web_fetch_vercel_url` sur
`https://otto-dode0vn6b-imperator080599.vercel.app/api/sante`, jamais une attente de CI, règle 36) :
`HTTP 200 · sha=3c5b3f832a9c6d0ef8db6dffe5be0513466d9113 · identiteCoherente=true`. Toutes les
lectures passent, la lecture « suivi de mission » neuve comprise (`ok:true · 2 demande(s) en
attente (âge max 33 j) · 0 écart(s) non conclu(s) · 2 poste(s) suivi(s)`). **Ce n'est PAS un
déploiement de PRODUCTION** (`target: null`, pas `"production"` — les seuls déploiements
`target: "production"` de ce projet sont ceux de `main`) : rien de ce lot n'atteint le fondateur
avant qu'une pull request soit ouverte et mergée, ce que le mandat ne demande pas encore pour ce
lot. « Servi » ici veut dire : cet aperçu, à cette URL, sert ce SHA exact et répond vert — pas
« en ligne pour le fondateur ».

## Lot contrôle interne, tranche 7 : CTRL-06, l'inquiry OE neuve (2026-09-09)

*Mandat, §3.3 : « On fait la même chose que pour le D&I. L'inquiry est de nouveau systématique —
mais : L'inquiry de l'OE est une inquiry NEUVE. Elle ne réutilise jamais celle du D&I : son objet
est précisément de s'assurer que rien n'a changé depuis l'occurrence documentée au D&I. Elle porte
sa propre date, postérieure. Réutiliser l'enregistrement du D&I est refusé. Et, comme au D&I, au
moins une procédure parmi inspection, observation, reperformance (CTRL-01 s'applique
identiquement). » Dernier point du §7.3 du mandat contrôle interne (CTRL-04/05/06/07, tous
livrés).*

**Ce qui a changé.** Migration `0155_ctrl06_inquiry_oe.sql` : nouvelle table
`control_oe_procedure` — MÊME FORME que `control_task_procedure` (0148), pas une invention neuve :
le D&I documente ses procédures PAR TÂCHE, l'OE n'a pas de décomposition en tâches dans ce mandat
(un cycle OE = un tirage, une conclusion), donc l'ancrage est le CONTRÔLE lui-même.
`engagement_id` dénormalisé dès la création (leçon de l'incident 0153/0154 tirée immédiatement :
garde de verrou + RLS posés dans LA MÊME migration, jamais en correctif après coup). `sox.ts` :
`documenterProcedureOe` (les quatre procédures, dont l'inquiry avec ses deux gardes CTRL-06 —
pièce distincte du walkthrough D&I, date STRICTEMENT postérieure EN JOUR CALENDAIRE à la dernière
inquiry D&I) et `proceduresOeDuControle`. `runAttributeTesting` refuse désormais de conclure sans
inquiry OE (CTRL-06) ni procédure au-delà (CTRL-01, même règle reprise pour l'OE) — vérifié TOUT
AU DÉBUT de la fonction, avant toute lecture de `control_test`/`sample`. Écran `rcm/[cid]` :
tableau des quatre procédures OE (inquiry/inspection/observation/reperformance), formulaire de
documentation par ligne (date exigée pour l'inquiry), bouton « extraire et tester » masqué tant
que les deux conditions ne sont pas réunies (même discipline UI que CTRL-04/05 : jamais un bouton
qui soumettrait pour se faire refuser). Lecture `/api/sante` **CTRL-06** : même patron que
CTRL-01/04/05/07, globale, sur tout contrôle dont le `control_test` a conclu.

**Correction de conception trouvée en écrivant le garde lui-même (pas par une revue extérieure) :**
comparer la date d'inquiry OE (`<input type="date">`, granularité JOUR) à l'horodatage COMPLET de
l'inquiry D&I (`created_at`) aurait rendu tout « aujourd'hui » plus tôt que l'inquiry D&I posée
dans l'après-midi du même jour — une inquiry réellement postérieure, dans le même mandat, aurait
été refusée à tort. Corrigé avant tout test écrit : comparaison en DATE CALENDAIRE des deux côtés.

**Ce qui n'a PAS changé, délibérément (règle 19).** Aucune décomposition en tâches pour l'OE
(contrairement au D&I) — le mandat n'en demande pas. L'ordre RELATIF entre inquiry et les autres
procédures OE n'est pas vérifié (seulement l'ordre inquiry-OE vs inquiry-D&I). La fraîcheur d'une
inquiry OE face à un RE-test sur une population différente n'est pas vérifiée (même limite
assumée que CTRL-04 sur les tirages déjà faits).

**Monde de démonstration.** `part2.ts` mène sa propre inquiry OE (pièce neuve, jamais le
walkthrough D&I) et documente une inspection, à une date fixée au lendemain calendaire du jour du
semis — la seule affirmation honnête d'un jour distinct sans dater dans le passé. Testé de bout en
bout par `npm run demo:seed` (C-BR-01 : 4 déviations avec extension à la population complète,
C-REV-01 : 0 déviation — les deux chemins de `runAttributeTesting`, avec et sans extension,
passent le garde une seule fois documenté).

**R70 — `LEGACY_AVANT_CTRL06`, même famille que R67/R69.** Deux contrôles réels (C-BR-01,
C-REV-01, testés en OE le 2026-09-01, avant `control_oe_procedure`) vérifiés en production
(`mcp__Supabase__execute_sql`) AVANT l'expédition — même méthode que R69, pour ne pas répéter
l'incident 0153. Permanent, même raisonnement que R67/R69 (règle 31). Détail complet :
`docs/BACKLOG_REPORTE.md`.

**Tests** : `ctrl06-inquiry-oe.test.ts` (10 tests, service) : liste vide, refus sans pièce propre,
refus sur réutilisation de la pièce D&I (règle 17), refus sur date non postérieure (règle 17, le
même jour calendaire), acceptation avec pièce neuve + date postérieure (règle 17, moitié
protectrice), refus de `runAttributeTesting` sans inquiry (CTRL-06), refus avec inquiry SEULE
(CTRL-01), passage du garde avec les deux (règle 17, moitié protectrice), refus runtime d'une
valeur de procédure invalide, étanchéité ETANCH. Lecture `/api/sante` (5 tests) : vide, rouge sans
aucune procédure, rouge avec inquiry seule (nommant la manque exacte), vert avec les deux, vert
sur le vrai chemin gardé de bout en bout. Régression : suite complète 125 fichiers, **1011/1011
tests**, EXIT=0. `npm run langue`/`gardes`/`lectures` verts sur cet arbre.

**Revue hostile, deux voix (règle 30), en worktree isolé, scopes séparés (voix 1 : migration
0155 + garde `sox.ts` ; voix 2 : `route.ts`/`page.tsx`/`part2.ts`/`catalogue.ts`/tests).** Les
deux : SHIP WITH MINOR FIXES, aucun défaut fonctionnel. Voix 1 a CONFIRMÉ par mutation, sur
chaque point : la migration 0155 suit le patron RLS/verrou de 0148/0144 (`rls-couverture.test.ts`/
`gardes.test.ts` verts, 43/43) — la leçon de l'incident 0153/0154 tient dès l'écriture ; le garde
CTRL-06/CTRL-01 fire bien AVANT toute lecture de `control_test` ; l'étanchéité passe en premier ;
R70 exact contre la production. Elle a aussi trouvé que le commentaire au-dessus de la
comparaison de dates affirmait un diagnostic FAUX (règle 18 : une explication plausible n'est pas
un diagnostic) — le VRAI risque qu'elle a reproduit par mutation (retirer le cast `::text`)
est une coercion JS silencieuse qui aurait rendu le garde muet pour toujours (règle 17). Voix 2 a
CONFIRMÉ par mutation que la lecture CTRL-06 rougit réellement, que l'écran n'a pas de blocage
poule-œuf (le tableau OE apparaît dès le tirage, avant que le bouton de test soit nécessaire), que
`part2.ts` produit bien des dates D&I/OE distinctes en base (vérifié par requête directe, pas
supposé), et a trouvé un vrai défaut d'étiquette : `page.tsx` affichait « CTRL-02 » sur le badge
manquant d'une procédure OE relevant en réalité de CTRL-01.

**Correctifs appliqués (`723b613`)** : le commentaire de garde réécrit pour dire le vrai risque ;
nouvelle clé i18n `rcmc.oeAutreProcManquante` (CTRL-01) remplaçant la réutilisation erronée de
`rcmc.facteurManquant` (CTRL-02). Aucun changement de comportement — les deux fonctionnaient déjà
correctement, seuls un commentaire et une étiquette affichée étaient faux.

**`npm run verify` frais sur l'arbre corrigé** : 125 fichiers, **1011/1011 tests**, 43 gardes, 87
routes 0 échec, 232 étapes/362 clics/231 stations, 312 vues 0 défaut, **EXIT=0**.

**§7.3 du mandat contrôle interne est maintenant COMPLET** : CTRL-01 à CTRL-07, les huit tranches,
toutes en production après ce point de contrôle. Prochaine étape, ordre fixé par le second mandat
du fondateur : §7.4 (suivi de mission — tableau de bord d'abord, kanban ensuite), puis §1/§2/§3 du
mandat des réponses.

## Incident de production : migration 0153 rééditée à tort, corrigée par 0154 (2026-09-09)

**Découvert par le fondateur, pas par l'agent** — les cinq derniers déploiements Vercel étaient en
ERROR (depuis `c654f40`, y compris `7395e55` sur `main`), la production servait toujours la
tranche 5 (`3f460a2`), et l'agent attendait une confirmation `deploye` qui ne pouvait pas arriver.

**Ce qui s'est passé.** Migration `0153_ctrl04_population_rapprochee.sql` : appliquée à la base
RÉSEAU (démo publique partagée) par son tout premier build d'aperçu (`c654f40`, `_migrations`
horodate 2026-09-09T08:48:00Z), dans sa forme D'ORIGINE — sans `engagement_id`, sans garde de
verrou, sans RLS. Ce build s'est arrêté juste après, sur le bloc d'assertions rôle/RLS de
`deploy:reconstruire` (« 2 défaut(s) de couverture RLS ») — LE GARDE A FONCTIONNÉ, règle 17.
La session suivante a alors ÉDITÉ 0153 EN PLACE (`a9e88ef`) pour ajouter ce qui manquait,
raisonnant que la règle 26 (« on n'édite jamais une migration appliquée ») ne s'appliquait pas
puisque « rien n'avait encore été servi » (le premier `deploye`, indépendant du build d'aperçu,
avait aussi échoué). **C'était une confusion entre « appliquée » et « servie en production »** :
la ligne dans `_migrations` de la base réseau ne dépend pas du statut final du déploiement, et
l'édition ne corrigeait qu'une base FRAÎCHE (`db:reset` part toujours de zéro) — rien à la base
réseau, qui gardait la table dans sa forme d'origine EN PERMANENCE. `migrate()` aurait dû refuser
(empreinte différente, `MigrationEditee`) à chaque déploiement suivant — ce qui explique à lui
seul pourquoi TOUS les déploiements suivants (`a9e88ef`, `3659901`, `7395e55`, `409e1b7`) sont
restés en ERROR, sans qu'aucun harnais local (qui repart toujours de zéro) ne puisse jamais le
voir. Même classe d'aveuglement structurel que l'incident `daf18e0` (Lot 3, tranche 1) : une
branche déjà migrée que le harnais local ne peut pas exercer.

**Vérifié directement contre la base réseau avant toute correction** (`mcp__Supabase__execute_sql`,
projet « Otto Dit », `fhxghmcehfdmxklkhfzk`), jamais supposé : la table `control_population_
reconciliation` existante n'a pas `engagement_id`, `relrowsecurity=false`, `relforcerowsecurity=
false`, aucun trigger, 0 ligne. `_migrations` porte une ligne `0153_ctrl04_population_rapprochee.sql`,
empreinte `8f603898…`. Le SHA-256 du contenu de 0153 tel qu'il était au commit `c654f40` (avant
l'édition) est **identique, octet pour octet**, à cette empreinte — confirmé par calcul local.

**Corrigé.** `0153` est revenue à son contenu de `c654f40`, INCHANGÉE depuis (empreinte re-vérifiée
identique). Tout ce qui manquait est dans une migration NOUVELLE, `0154_control_population_
reconciliation_engagement_id.sql` — `engagement_id` dénormalisé (ALTER + backfill défensif + NOT
NULL, même précédent que `control_task_procedure`, 0148, pas `account_detail_row`, 0144, puisque
`rapprocherPopulationControle` écrit dans une transaction séparée de la création de la
population), garde de verrou + verdict, RLS enable/policy/force — même patron que
`account_detail_import` (0144). **Prouvé avant de toucher la base réseau**, par une simulation
locale utilisant le VRAI `migrate()` importé (pas une réimplémentation) : une base PGlite migrée
« à la main » jusqu'à 0153 inclus (répliquant exactement l'état réseau), puis un second appel à
`migrate()` — aucune `MigrationEditee`, `0154` s'applique proprement, forme finale correcte
(colonne, RLS activée et forcée, trigger présent). `npm run db:reset` (fraîche, 0153 puis 0154
dans le même passage) donne la MÊME forme finale — les deux bases convergent, exactement ce que
`0154` doit garantir.

**Règle 26 amendée (CLAUDE.md)** : « appliquée » veut dire une ligne dans `_migrations` sur
N'IMPORTE QUELLE base qui en porte une, jamais seulement « servie en production ». Le test qui
compte est une requête directe sur `_migrations`, jamais une inférence depuis le statut d'un
déploiement.

**Revue hostile, deux voix (règle 30 : modèle de données + RLS/multi-tenant), en worktree isolé,
scopes séparés (voix 1 : correction SQL/DB ; voix 2 : interaction `migrate()`/régression/rule 26).**
Les deux : SHIP AS-IS, aucun défaut bloquant. Chacune a REFAIT indépendamment la simulation
`migrate()` (pas relu celle de l'autre), et chacune a trouvé, en interrogeant la base réseau EN
DIRECT pendant sa propre revue, que **`0154` s'était déjà appliquée avec succès** via le build
d'aperçu déclenché par `682fc46` — confirmé : `engagement_id` NOT NULL, RLS activée et FORCÉE,
trigger de verrou présent, `_migrations` porte les deux empreintes attendues, run CI « vérifier »
(34340452680) vert avec acceptation cliquée réelle contre l'URL déployée. Voix 1 a en plus rejoué
la preuve manquante règle 17 (cas connu mauvais : rééditer 0153 sur une base à l'état réseau simulé
déclenche bien `MigrationEditee`) — l'implémentation ne l'avait pas fait elle-même. Voix 2 a
confirmé le même contrefactuel par les VRAIS journaux de build Vercel des six déploiements après
l'édition fautive (le message `MigrationEditee` y apparaît mot pour mot), et a trouvé l'imprécision
« cinq déploiements » (en réalité quatre commits, sept événements de déploiement — corrigé dans
CLAUDE.md règle 26). Aucun autre défaut.

**`npm run verify` frais, sur arbre gelé après le correctif de libellé ci-dessus** (un premier essai
tué en cours — un processus `next dev` orphelin d'un worktree d'agent de revue déjà terminé
saturait le CPU/la mémoire et affamait le propre serveur du run ; règle 35, tué et relancé sur
système nettoyé) : 123 fichiers, **996/996 tests**, 43 gardes, 87 routes 0 échec, 232 étapes/362
clics/231 stations, 312 vues 0 défaut, **EXIT=0**.

**Résolu — SHA servi confirmé = `ad94372`.** Le fondateur a résolu le déploiement directement
(plus fiable que d'attendre une notification CI, quatre fois coûteux ce jour-là — CLAUDE.md §7,
« aucune attente non bornée ») et instruit de mesurer plutôt que d'attendre. Confirmé en direct
(`mcp__Vercel__web_fetch_vercel_url`, 2026-09-09T12:20:00Z) : HTTP 200, `identiteCoherente=true`,
« toutes les lectures passent » — **CTRL-04** `ok:true`, detail « 3 tirage(s) OE — 0 couvert(s)
par un rapprochement de population, 3 legacy (antérieur(s) à CTRL-04, 2026-09-01) » (les trois
legacy attendus, R69, aucun nouveau). R44 : 89/16/32/41, inchangé. `docs/instantanes/servi.json`
et `docs/REPRISE.md` régénérés dans le même geste (« servi ad94372 = HEAD »).

**Priorité fixée par le second mandat du fondateur, maintenant que cet incident est clos** : §1
(table d'échantillonnage cherchée/sourcée) puis §2 (R30 — drapeau de bascule de matérialité,
MAT-01/02/03) puis §3 (vidéo, dépôt manuel). Reprise ensuite du lot contrôle interne (§7.3
restant : CTRL-06 ; puis §7.4, suivi de mission) sous la même permission et cadence.

## Lot contrôle interne, tranche 6 : CTRL-04, le rapprochement de la population d'OE (2026-09-09)

*Mandat, §3.1 : « tirer sur une population d'occurrences non rapprochée. Miroir exact de POP-01. »
Contrairement à CTRL-05 (qui ne porte que sur `as_needed`), CTRL-04 s'applique à TOUTE population
d'OE, dérivée ou demandée — une population dérivée est déjà auto-cohérente avec sa fréquence
(lecture « population dérivée », tranche 4), mais CTRL-04 exige EN PLUS la conclusion écrite de
l'auditeur, un jugement professionnel distinct d'un calcul qui tombe juste.*

**Ce qui a changé.** Migration `0153_ctrl04_population_rapprochee.sql` : nouvelle table
`control_population_reconciliation` (`control_id` FK pleine, `row_count`, `conclusion`,
`rapprochee_by`, `rapprochee_at`) — une ligne par rapprochement CONCLU, jamais réécrite (même
famille que POP-03). `sox.ts` : `rapprocherPopulationControle` (conclusion écrite ≥ 10
caractères exigée, refuse sur une population vide, refuse un second rapprochement sur la MÊME
population fraîche) et `populationControleRapprochee` (lecture ; `null` si aucun rapprochement
conclu OU si la population a changé depuis — fraîcheur vérifiée en comparant `row_count` à un
compte FRAIS de `control_instance`, jamais supposée, même discipline que
`populationDuDetailRapproche`/account-detail.ts). `drawAttributeSample` refuse désormais tant
qu'aucun rapprochement FRAIS n'existe, vérifié APRÈS CTRL-05 (la population existe) et AVANT
CTRL-07 (la taille) — l'ordre logique du mandat. Écran `rcm/[cid]` : une fois une population
présente et non encore tirée, un formulaire « Rapprocher la population (CTRL-04) » (conclusion
textuelle) précède le formulaire de tirage — celui-ci n'apparaît qu'une fois le rapprochement
conclu. Lecture `/api/sante` **CTRL-04** : même patron GLOBAL que CTRL-01/02/03/05/07.

**Legacy anticipé AVANT expédition (R69, contrairement à R67/CTRL-07 trouvé APRÈS un `deploye`
rouge).** Trois `sample` réels de production (`1a158f98-...` et `ce59a5f8-...` C-BR-01,
`6763a111-...` C-REV-01, tous tirés 2026-09-01) ont été trouvés en INTERROGEANT LA PRODUCTION
DIRECTEMENT (`mcp__Supabase__execute_sql`) avant d'écrire la lecture, et nommés dans
`LEGACY_AVANT_CTRL04` dès ce commit — pour ne pas répéter l'échec de déploiement du 2026-09-09
(fbe7afe/CTRL-07). Le monde de démonstration lui-même (`part2.ts::runControlCycle`) a aussi été
mis à jour pour conclure le rapprochement avant chaque tirage — sinon `npm run demo:seed`
échouerait sur toute base FRAÎCHE, legacy ou pas.

**Tests neufs** : `ctrl04-population-rapprochee.test.ts` (9 tests, service) — rapprochement
retrouvé après conclusion ; refuse le tirage sans rapprochement en nommant CTRL-04 (règle 17) ;
un rapprochement débloque le tirage (moitié protectrice) ; la fraîcheur se revérifie — une
population qui grossit APRÈS le rapprochement le rend PÉRIMÉ et le tirage suivant refuse à
nouveau ; POP-03 (un rapprochement déjà conclu, fraîche, ne se réécrit pas) ; population vide
refusée ; conclusion trop courte refusée ; étanchéité ETANCH. Lecture `/api/sante`
(`ctrl04-lecture.test.ts`, 4 tests) : vide sans tirage, rouge sur un tirage sans rapprochement
(règle 17), vert avec un rapprochement réel, vert sur le vrai chemin gardé de bout en bout.
Tests existants adaptés pour isoler leur propre garde de CTRL-04 (même patron que CTRL-05 l'a
fait pour CTRL-07) : `s8.test.ts`, `ctrl05-population-demandee.test.ts`, `ctrl05-lecture.test.ts`,
`ctrl07-lecture.test.ts`. `npm run demo:seed`, `db:reset`, `tsc --noEmit`, `parcours`,
`lectures`/`lectures:epreuve`, `langue`, `gardes` tous verts sur cet arbre.

**Revue hostile, deux voix (règle 30 : modèle de données + code de refus), fichiers non
chevauchants, en worktree isolé (n'a pas contaminé le `verify` en cours — voix 1 : `sox.ts` +
migration 0153 ; voix 2 : `route.ts`/`page.tsx`/`part2.ts`/`catalogue.ts`/tests).** Voix 1 : SHIP
AS-IS — huit constats tous CONFIRMÉ, dont cinq par mutation règle 17 (les trois refus de
`rapprocherPopulationControle`, la fraîcheur de `populationControleRapprochee`, l'ordre du garde
dans `drawAttributeSample`), plus une requête PRODUCTION indépendante confirmant
`LEGACY_AVANT_CTRL04` exact (trois id, ni plus ni moins). Deux remarques mineures notées « jugé
seul, non réfuté », pré-existantes ailleurs dans le dépôt (non aggravées par cette tranche) :
`logEvent` non transactionnel après l'insert, et une fenêtre de concurrence sur le refus
« déjà conclu » — même forme que POP-03, non nouvelle. Voix 2 : SHIP WITH MINOR FIXES — sept
constats CONFIRMÉ (dont deux par mutation règle 17 : le garde lui-même et la lecture CTRL-04),
la liste legacy reconfirmée indépendamment, les quatre tests adaptés isolent bien leur propre
garde (33/33), et un HUITIÈME constat, neuf, CONFIRMÉ PAR REPRODUCTION : le message de succès de
la lecture CTRL-04 affirmait un ORDRE (« rapprochée avant tirage ») que la requête SQL ne vérifie
pas (`not exists`, jamais une comparaison de dates) — reproduit en insérant un tirage direct PUIS
un rapprochement après coup, la lecture restait verte à tort. **Corrigé dans le même point de
contrôle** (commit qui suit) : le message ne prétend plus un ordre, et le commentaire « ce que
cette lecture ne vérifie pas » nomme désormais les deux limites (fraîcheur ET ordre). Un point non
prouvé, nommé (règle 19) : l'écran `rcm/[cid]` n'a pas été cliqué dans un navigateur pour CETTE
revue (le garde de fond, `drawAttributeSample`, est prouvé par mutation ; la conclusion écrite du
semeur dans `part2.ts` a été jugée honnête par lecture, non cliquée séparément — le clic complet
du parcours `rcm/[cid]` reste celui de `npm run clics`, ci-dessous).

**Correctif appliqué (`3659901`) avant la mesure finale**, suivi d'un `verify` FRAIS (le
précédent, en cours pendant la revue, a été tué dès l'édition de `route.ts` — règle 34, jamais
attendu) : 123 fichiers, **996/996 tests**, 43 gardes, 87 routes 0 échec, 232 étapes/362
clics/231 stations, 312 vues 0 défaut, **EXIT=0**.

## Lot contrôle interne, tranche 5 : CTRL-05, la demande client de la population (2026-09-09)

*Mandat, §3.1 : « atteindre le tirage d'OE d'un contrôle as_needed sans qu'une demande client de
la population des occurrences existe. Cette demande RÉUTILISE le mécanisme de la Partie B :
`client_request` typée, destinataire déduit, lien cliquable vers l'espace de demandes. Aucun
chemin neuf, aucun formulaire parallèle. » `as_needed` = les fréquences hors
`FREQUENCES_DERIVABLES` (tranche 4) — `adhoc`/`many_daily`, aucun autre concept n'existe. Il
n'existe aucune table `client_request` littérale dans ce schéma : `request`/`request_item` SONT ce
mécanisme (confirmé par grep exhaustif).*

**Ce qui a changé.** Migration `0152_ctrl05_demande_population.sql` : `request.control_id` (FK
PLEINE vers `control`, à la différence de `request.fsli_code`/0143 — `control` n'est jamais
supprimé ni recréé en masse par `importRcm`, contrairement à `fsli`/`rebuildFslis`, une FK est
donc sûre ici ; corrige plutôt que répète le trou déjà nommé pour `procedure_instance.control_id`,
R66). `requests.ts` : `demanderPopulationControle` (crée une VRAIE `request`+`request_item`,
`kind='listing'`, même forme que `requestAndImportListing`/`demanderDetailDeCompte`) et
`derniereDemandePopulationControle` (retrouve la dernière demande d'un contrôle, même rôle que
`derniereDemandeDetailDeCompte`). `sox.ts` : `drawAttributeSample` refuse désormais, pour toute
fréquence HORS `FREQUENCES_DERIVABLES`, tant qu'aucune `request.control_id` ne pointe vers le
contrôle — vérifie l'EXISTENCE, pas le statut (le mandat dit « existe », pas « envoyée » ; même
discipline que `derniereDemandeDetailDeCompte`, qui ne vérifie pas non plus le statut). Écran
`rcm/[cid]` : pour une fréquence non dérivable sans population, le bouton « importer le listing
client » est désormais précédé d'un bouton « demander la population » — une fois la demande
posée, son numéro (`R-00X`) s'affiche, lien cliquable vers l'espace de demandes, ET le bouton
« importer » apparaît. Lecture `/api/sante` **CTRL-05** : même patron que CTRL-01/02/03/07,
globale, nomme le tirage et la fréquence en violation.

**Ce qui n'a PAS changé, délibérément (règle 19).** `importInstances`/`importInstancesAction`
restent des imports DIRECTS, non liés formellement à la demande qui les a réclamés — même trou
que la Partie B pour le détail de compte (aucun lien entre le fichier reçu et la demande),
non élargi ici. Le monde de démonstration (C-BR-01 monthly, C-REV-01 weekly) est INCHANGÉ : les
deux sont des fréquences dérivables, CTRL-05 ne les concerne pas.

**Preuve cliquée, build de PRODUCTION**, navigation FRAÎCHE à chaque étape : contrôle de sonde
`adhoc`, 0 occurrence → bouton « Request population » (jamais « Import client listing ») → clic →
demande posée, visible (« Population requested — R-00X », lien cliquable), le bouton « Request
population » disparaît et « Import client listing » apparaît à sa place.

**Tests neufs** : `demanderPopulationControle`/`derniereDemandePopulationControle` (7 tests,
service) : crée une vraie demande retrouvable ensuite ; refuse le tirage sans demande en nommant
CTRL-05 et la fréquence (règle 17) ; une demande débloque le tirage (règle 17, moitié
protectrice) ; une demande d'un AUTRE contrôle ne compte pas (comparaison sur `control_id` exact) ;
étanchéité ETANCH pour un intrus ; une fréquence dérivable n'est jamais bloquée par CTRL-05.
Lecture `/api/sante` (5 tests) : vide sans tirage, rouge sur un tirage sans demande (règle 17),
vert avec une demande réelle, vert sur une fréquence dérivable même SANS demande (hors périmètre),
vert sur le vrai chemin gardé de bout en bout. Régression : `ctrl01/02-03/07-lecture`,
`population-derivee(-lecture)`, `s8`, `etancheite-executee`, `i18n`, `semeur/coherence` tous verts
(106 tests).

**Revue hostile, deux voix (règle 30 : nouvelle migration = modèle de données touché + nouveau
code de refus), fichiers non chevauchants (voix 1 : `sox.ts` seul ; voix 2 :
`requests.ts`/`route.ts` seuls).** Voix 1 : SHIP WITH MINOR FIXES — huit constats CONFIRMÉ sur la
mécanique (ordre étanchéité-d'abord avant le garde D&I puis CTRL-05, refus par mutation règle 17,
comparaison stricte `control_id`, FK pleine vérifiée sûre en lisant `importRcm` en entier, aucune
régression), un défaut de CLASSE pré-existant nommé non bloquant (double demande possible, même
famille que R63, non élargi ici) ; un seul point procédural, pas un défaut de code : sa propre
mutation-et-reversion (règle 17) a chevauché le `verify` (PID 19003) alors en fond — **run
invalidé par la règle 34**, signalé à l'orchestrateur plutôt que caché. Voix 2 : SHIP WITH MINOR
FIXES — dix constats CONFIRMÉ (dont un par mutation règle 17 sur `route.ts`, reversé, `git diff`
vide), une recommandation non bloquante (`demanderPopulationControle` n'enveloppe pas ses deux
`insert` dans `tx()`, contrairement au patron plus récent `demanderPieceLigne` qui documente avoir
corrigé ce même défaut de classe le 2026-09-07 — à corriger avant une prochaine tranche qui
toucherait ce fichier, sinon une entrée R-nn), deux remarques mineures sans conséquence aujourd'hui
(`language:'en'` codé en dur, `quarterly` sur-bloqué par CTRL-05 avec une citation « mandat §3.1 »
imprécise puisque le mandat ne nomme jamais `quarterly` — comportement sûr, jamais exercé dans le
monde de démo actuel), et un point « jugé seul, non réfuté » (règle 30, documentation) sur le trou
R48 pré-existant du « destinataire déduit », hérité fidèlement sans être aggravé ni nommé
explicitement pour CTRL-05.

**Correction procédurale (règle 34) avant la mesure finale.** Le `verify` PID 19003, contaminé par
le chevauchement décrit ci-dessus, a été TUÉ (pas attendu) dès le constat de voix 1 reçu. Un
`verify` FRAIS a été relancé sur l'arbre redevenu propre (`git status` vide, les deux fichiers mutés
confirmés bit-à-bit identiques à l'original par chaque voix) : 121 fichiers, **983/983 tests**,
gardes, 87 routes 0 échec, 232 étapes/362 clics/231 stations, 312 vues 0 défaut, **EXIT=0**.

**Expédition.** Fast-forward sur `main` (commit `dad1098`, puis `2e1705b` portant aussi la mesure
servie de la tranche 4 — squash involontaire de git mais sans conséquence, les deux commits sont
individuellement propres et le second ne touche que `docs/`). CI « vérifier », run 34326544159,
job `local` (tsc, vitest 983/983, gardes/plancher/langue+épreuve/lectures+épreuve/parcours+épreuve)
vert ; job `deploye`, étape « le SHA poussé doit être servi dans les 15 minutes »,
07:58:06Z→08:02:40Z (274 s), succès. Un `url` déclenché en double par deux `deployment_status`
successifs a produit un ROUGE sur le premier passage (`acceptation cliquée`, run 34326691178,
07:59:31Z) — le second passage sur le MÊME SHA (run 34326908631, 08:01:53Z) a réussi intégralement
: flake identifié comme tel (rouge non reproduit sur le commit identique), pas une cause réelle à
corriger. Confirmation indépendante (`mcp__Vercel__web_fetch_vercel_url`, 08:27:51Z) :
HTTP 200, `sha=2e1705b`, `identiteCoherente=true`, « toutes les lectures passent », **CTRL-05**
`ok:true` (« 3 tirage(s) OE, tous à fréquence dérivable — CTRL-05 hors périmètre pour l'instant » —
attendu, le monde de démo n'a aucun contrôle `as_needed`). R44 : 89 objet(s) · 16 décor(s) ·
32 non prouvé(s) · 41 prouvé(s), inchangé (aucun objet semé neuf dans cette tranche).

**SHA servi confirmé = 2e1705b.**

## Lot contrôle interne, tranche 4 : la population dérivée (mandat §3.1) (2026-09-09)

*Mandat, §3.1, tableau : pour une fréquence RÉGULIÈRE — **annuelle, mensuelle, hebdomadaire,
quotidienne, EXACTEMENT ces quatre, verbatim** — la population d'occurrences OE se DÉRIVE de la
fréquence et de la période, sans demande client. `adhoc` (le mandat dit « as_needed » ; le code
n'a que `adhoc`, la seule valeur réelle du type `Frequency` — aucun concept distinct n'existe)
reste sur le chemin de demande client (`CTRL-05`, tranche suivante). Recherche préalable (agent
dédié) : `importInstances`/`requestAndImportListing` ne dérivaient rien pour AUCUNE fréquence —
tout contrôle passait par le client ; `control_instance` ne portait aucune trace de provenance
dérivée ; POP-01/`populationDuDetailRapproche` (account-detail.ts) a servi de patron pour la
discipline de fraîcheur, pas de code réutilisé directement (tables différentes, contrôle vs FSLI).*

**Ce qui a changé.** Migration `0151_population_derivee.sql` : `control_instance.source` gagne la
valeur `'derived'` (même patron que 0150 sur `risk.source` — nom de contrainte auto-générée jamais
supposé, recherché dans `pg_constraint`). `sox.ts` : `FREQUENCES_DERIVABLES` (`annual, monthly,
weekly, daily` — **exactement les quatre valeurs du tableau §3.1, ni plus ni moins**, règle 14 ;
`adhoc`/`many_daily` en sont absents pour une raison DIFFÉRENTE, règle 19 : `many_daily`
impliquerait une constante « occurrences par jour » qu'aucune fréquence ni période ne peut
fournir sans l'écrire de mémoire, règle 8) ; `occurrencesDeLaPeriode` (fonction PURE, testable
sans base, refuse elle-même toute fréquence hors `FREQUENCES_DERIVABLES` plutôt que de rendre un
`[]` silencieux) calcule les dates d'occurrence UTC ; `deriverPopulationControle` les écrit en
`control_instance`, gardé par `assertMembreDe` en PREMIER (avant toute autre lecture), refuse une
fréquence non dérivable (nommant CTRL-05) et refuse une population déjà présente (dérivation à
usage unique, jamais un doublon). Écran `rcm/[cid]` : le bouton « importer le listing client » est
remplacé par « dériver la population » pour les fréquences régulières (le mandat ne prévoit pas de
round-trip client là où rien ne le justifie) ; une colonne `source` affiche « dérivée » sur chaque
ligne ; le tri de la liste passe de `label` (lexicographique — cassait l'ordre chronologique :
« Mois 10 » avant « Mois 2 ») à `occurred_on`. Lecture `/api/sante` **population dérivée** :
recalcule fraîchement, pour tout contrôle portant au moins une ligne `derived`, ce que
`occurrencesDeLaPeriode` produirait aujourd'hui, et rougit sur toute divergence — même discipline
de fraîcheur que POP-01.

**Deux correctifs de revue hostile, appliqués AVANT expédition (pas après coup).** Voix 1 : une
première version de `quarterly` (envisagée en plus des quatre fréquences du mandat) bornait sa
boucle en DUR à exactement 4 itérations, contrairement aux autres fréquences (`for(;;)` jusqu'à
dépasser la fin de période) — sur une période de PLUS de 12 mois (un premier exercice allongé, cas
réel : `creerExercice`, engagement.ts, n'impose que `debut < fin`), les mois au-delà du 4e
trimestre disparaissaient SANS AUCUNE erreur, silencieusement ; elle tronquait aussi le dernier
trimestre à la fin de période au lieu de l'exclure, asymétrique avec `monthly`. Voix 2 : `quarterly`
elle-même n'est NOMMÉE NULLE PART dans le tableau du mandat §3.1 (grep exhaustif du mandat, zéro
occurrence) — l'ajouter aurait été un dépassement de périmètre non tracé (règle 14, le vocabulaire
du mandat se suit VERBATIM), et le commentaire du code se contredisait lui-même en le disant. Les
deux constats convergent sur la même ligne de code : **`quarterly` est RETIRÉE de
`FREQUENCES_DERIVABLES` et de `occurrencesDeLaPeriode`**, plutôt que réparée puis gardée sans mandat
qui la nomme — la voie la plus sûre, pas la plus rapide. `occurrencesDeLaPeriode` refuse maintenant
explicitement toute fréquence hors des quatre du mandat (voix 2, constat sur le `[]` silencieux
qu'un appel direct à `quarterly` aurait produit sans ce garde). Le test `hebdomadaire`, qui ne
vérifiait que la LONGUEUR (une implémentation aux dates fausses l'aurait quand même passé — règle
19), vérifie maintenant les dates exactes, l'absence de doublon et l'ordre croissant.

**Ce qui n'a PAS changé, délibérément (règle 19).** Le monde de démonstration (`part2.ts`,
`runControlCycle` pour C-BR-01/C-REV-01) N'A PAS été basculé sur le dériveur : ces deux cycles
dépendent d'un CSV et de fichiers de preuve CURATÉS (`instances_C-BR-01.csv`, `bankrec_2025-01.pdf`
etc.) construits pour produire des scénarios de déviation précis (« C-BR-01 : 4 deviation(s) »,
mesuré et cité dans ce fichier depuis plusieurs tranches) — un dériveur produit des labels («
Mois 1, clos le 2025-01-31 ») qui ne correspondraient à AUCUN fichier de preuve existant, ce qui
aurait fait passer chaque occurrence pour une déviation « preuve manquante » et détruit un
scénario de démonstration réel sans qu'aucune règle ne l'exige (rule 28, en esprit — casser du
contenu curaté n'est pas mieux que casser du contenu produit). Vérifié en lisant
`uploadControlEvidence` (part2.ts) avant de toucher quoi que ce soit, pas supposé. Rien n'est donc
ajouté à `semeur/registre.ts` : aucun nouvel objet n'est créé par le semeur dans cette tranche — le
dériveur n'est atteignable que par un geste humain (le bouton), jamais par `demo-seed`.

**Preuve cliquée, build de PRODUCTION** (jamais `next dev`), navigation FRAÎCHE après le clic :
contrôle de sonde mensuel, 0 occurrence → clic « Derive population » → 12 lignes, chronologiques
(Mois 1 … Mois 12), toutes `source=derived`, le bouton disparaît (population non vide) — mesuré
directement dans le panneau (pas un `grep` sur toute la page, règle 15 : une autre table partageait
la même classe CSS et aurait faussé un comptage global).

**Tests neufs** : `occurrencesDeLaPeriode` — 7 tests purs (annuelle/mensuelle/hebdomadaire/
quotidienne sur un exercice complet 2025, année BISSEXTILE 2024 — 29 février, pas 28 —, une
période COURTE qui ne déborde jamais après sa fin, `quarterly` refuse explicitement au lieu de
rendre un `[]`, `FREQUENCES_DERIVABLES` figée aux quatre valeurs exactes du mandat). Le test
hebdomadaire vérifie désormais les VRAIES dates (pas seulement un compte de 52). `deriverPopulationControle`
(service, 5 tests) : dérive 12 lignes pour un contrôle mensuel ; refuse `adhoc` et `many_daily` en
nommant la fréquence (règle 17, rien n'est écrit malgré le refus) ; refuse une seconde dérivation
sur une population déjà `listing` (règle 17, rien n'est ajouté) ; étanchéité ETANCH pour un intrus
d'un autre cabinet, `assertMembreDe` confirmé PREMIER appel de la fonction. Lecture `/api/sante`
(4 tests) : vide sans dérivation, verte sur le vrai chemin gardé, rouge sur une ligne dérivée
éditée à la main (règle 17), verte quand la seule population existante est `listing` — pas lue par
erreur. Migration 0151 éprouvée REJOUÉE deux fois de suite sur une PGlite jetable (voix 2,
idempotence confirmée empiriquement, pas seulement par lecture du SQL). Régression :
`ctrl01/02-03/07-lecture`, `s8`, `etancheite-executee`, `i18n`, `semeur/coherence` tous verts
(71 tests, dernier passage après les deux correctifs).

**Revue hostile, deux voix (règle 30 : nouvelle migration = modèle de données touché) — les DEUX
constats bloquants (troncature `quarterly` >12 mois, `quarterly` hors périmètre du mandat) ont été
corrigés avant expédition, détaillés ci-dessus.**

**Verify complet, sur l'arbre CORRIGÉ (aucun réviseur actif pendant ce passage) — `EXIT=0`.**
**971/971 tests** (119 fichiers), **43 gardes**, `docs/SEMEUR_VS_CHEMIN.md` à jour avec le
registre, langue **0 chaîne hors catalogue · 15/15 cas connus mauvais**, lectures **6/6 cas connus
mauvais**, parcours **5/5 cas connus mauvais**, screens **87 routes · 0 échec**, densité **77
écrans · 0 au-delà de 5 actions**, clics **232 étapes · 0 échec · 362 clics · 231 stations
figées**, sonde d'hydratation **aucun incident**, visuel **312 vues · 0 défaut**. Aucune commande
de `verify` non exécutée sur cette tranche.

## Lot contrôle interne, tranche 3 correctif : CTRL-07 en production, deux tirages legacy (2026-09-09)

**`deploye` a rougi pour de vrai sur `fbe7afe` — pas une panne d'infrastructure.** Mesuré en
direct : la nouvelle instance devient `READY` en 3 min (bien dans les 15), `/api/sante` répond
200 sur TOUT sauf une lecture — **CTRL-07 : 2 violation(s)** — donc `/api/sante` rend honnêtement
500 (rule 22 : une lecture cassée fait rougir le tout), et `atteint.ts` refuse à bon droit puisque
« sert » exige un 200. Un bref « le pooler ne connaît pas ce locataire » est apparu UNE fois dans
les journaux runtime Vercel, à 01:23:55Z, juste après la bascule d'alias vers `fbe7afe` — un
artefact de reconnexion transitoire (nouvelle route région du pooler Supabase pendant la bascule),
PAS la cause : toutes les requêtes suivantes, y compris `/api/sante` lui-même, se sont connectées
sans ERREUR de base — seule la lecture CTRL-07 a rougi, à répétition, avec un corps JSON bien
formé listant tout le reste au vert.

**Cause, vérifiée en direct sur la base de production (`mcp__Supabase__execute_sql`), pas
supposée.** Deux échantillons RÉELS existent depuis le 2026-09-01 (`1a158f98-…` C-BR-01,
`6763a111-…` C-REV-01), tirés sous l'ANCIEN défaut de pack — `params.override` = `null`, aucune
justification écrite, exactement parce que CTRL-07 n'existait pas encore ce jour-là. Un troisième
tirage (`ce59a5f8-…`, l'extension à la population complète de C-BR-01) porte une VRAIE justification
(« Taux de déviation de 100 % … ») et n'est jamais concerné. Les deux `control_test` associés sont
`complete`, l'un porte **8 déviations réelles**, workpapers signés au dossier — du travail humain/
agent réel (règle 28 : jamais détruit ni réécrit en silence), et inventer une justification a
posteriori aurait été exactement le mensonge que la règle 31 interdit.

**Correctif — même patron que R47/POP-01 (même fichier, `route.ts`), pas une migration** : aucune
donnée n'est mutée (contrairement à 0149) — la lecture CTRL-07 nomme les deux id EXACTS dans
`LEGACY_AVANT_CTRL07`, datés, avec le motif écrit dans le commentaire. Tout autre tirage hors
cette liste reste une régression réelle. Deux tests neufs (règle 17) : le vrai id de production
traité comme legacy (vert) ; le test « cas connu mauvais » déjà existant, avec un id DIFFÉRENT
construit par la sonde, continue de rougir — la liste compare l'ID exact, jamais le code du
contrôle ni la date. 21/21 tests ciblés (`ctrl07-lecture.test.ts` 6/6, `ctrl01`/`ctrl02-03`
inchangés) verts localement. **Revue hostile, deux voix indépendantes — SHIP AS-IS convergent des
deux.** Voix 1 : les deux id vérifiés contre la production réelle (`mcp__Supabase__execute_sql`),
les deux `control_test` associés `complete` (l'un avec 8 déviations), les deux `workpaper` `signed`
— confirmé au-delà de la demande ; preuve règle 17 par mutation (retrait d'un id de la liste, le
test échoue, reverti, `git diff` vide). Voix 2 : patron POP-01 respecté structurellement (le split
couvert/legacy jamais auto-contradictoire, même correction que POP-01 avait déjà reçue une fois) ;
comparaison sur l'ID exact confirmée, pas le code du contrôle ; mutation règle 17 sur un angle
différent (comparaison forcée à `true`), le test « cas connu mauvais » échoue comme attendu, reverti.
**Constat de processus commun aux deux voix (pas un défaut du code)** : les deux réviseurs ont muté
la même zone de `route.ts` au même instant, sur le MÊME arbre qu'un `npm run verify` local tournait
déjà — exactement l'arbre-qui-bouge que la règle 34 interdit de mesurer. Ce premier `npm run verify`
(PID 970) a donc été TUÉ avant sa fin, sans être compté ; un environnement laissé par un `next build`
orphelin (même piège que le `next-server` détaché documenté §7, cette fois côté build) a été mesuré
et nettoyé (`ps`/`lsof`/`free -m` propres) avant de relancer un DEUXIÈME passage, sur un arbre non
contesté cette fois. **Ce deuxième passage est VERT — `EXIT=0`.** 954/954 tests (117 fichiers), 43
gardes, `docs/SEMEUR_VS_CHEMIN.md` déjà à jour, langue/lectures/parcours 15/15+6/6+5/5 cas connus
mauvais, screens 87 routes 0 échec, densité 77 écrans, clics 232 étapes/362 clics/231 stations,
visuel 312 vues 0 défaut. Aucune commande de `verify` non exécutée sur ce correctif.

**CI `deploye` (run 34300403558, job 102305894353) confirme `28f8c45` servi en 162 s**
(01:44:46Z→01:47:28Z). Confirmé indépendamment en direct (`mcp__Vercel__web_fetch_vercel_url`,
02:05:17Z) : HTTP 200, `identiteCoherente=true`, « toutes les lectures passent » — CTRL-01/02/03
`ok:true`/`vide:true`, **CTRL-07 `ok:true`, detail « 3 tirage(s) OE — 1 couvert(s), 2 legacy
(antérieur(s) à CTRL-07, 2026-09-01) »** — exactement le comportement attendu. Registre R44
89/16/32/41, identique à la mesure locale. `fbe7afe` (le commit CTRL-07 initial) n'a jamais reçu
sa propre confirmation servie — son `deploye` a échoué pour de vrai, corrigé par ce correctif.
`docs/instantanes/servi.json`/`docs/REPRISE.md` mis à jour. Les deux branches (`main`,
`claude/otto-session-resume-zimig9`) sont synchronisées au SHA `379ba60` (commit de confirmation,
docs seules, pas de contenu applicatif nouveau — aucune nouvelle mesure servie requise).

**Lot contrôle interne, §7.3 : CTRL-07 est maintenant COMPLET et confirmé en production.**
CTRL-04/05/06 restent à faire, chacun sa propre tranche.

## Lot contrôle interne, tranche 3 : CTRL-07, la table d'échantillonnage OE vidée (2026-09-09)

*Mandat : `docs/MANDATS/2026-09-08_mandat_controle_interne.md`, §3.2, §7.3. Recherche préalable
(agent dédié) : le §3/§7.3 couvre quatre points (CTRL-04/05/06/07) ; cette tranche scope
DÉLIBÉRÉMENT à CTRL-07 seul — le plus autonome, une violation de la règle 8 déjà repérée avant
même le mandat (une table de tailles d'échantillon « common practice derived from AICPA Audit
Sampling guidance », écrite de mémoire, jamais fournie par un cabinet réel) — CTRL-04/05/06 restent
à faire, chacun sa propre tranche (petites tranches verticales, règle 5).*

**Ce qui a changé.** `pcaob-sox.ts` : `attributeSampleSizes` vidée à `{}` (`Partial<Record<...>>`,
jamais `Record<...>` complet — une fréquence ABSENTE est une fréquence non vérifiée, pas une
fréquence à 0). `sox.ts` : nouvelle fonction `tailleEchantillonOe` (même lecture pack+fréquence
que le refus réel) et `tailleEchantillonOePourControle` (même lecture, côté écran, pour ne jamais
afficher un champ que le service refusera ensuite — règle 13) ; `drawAttributeSample` refuse
désormais (message nommant « CTRL-07 », la fréquence, et le chemin de secours ADR-010) tout tirage
sans dérogation ET sans taille vérifiée — la garde ADR-010 existante (dérogation sans justification
écrite refusée) reste inchangée, en AMONT. Écran `rcm/[cid]` : le placeholder mensonger « size
(pack default) » (il n'existe plus de défaut) remplacé par un texte honnête + `required`
conditionnel + avertissement visible tant qu'aucune taille n'est vérifiée pour la fréquence du
contrôle — vérifié CLIQUÉ contre un build de PRODUCTION (jamais `next dev`), navigation FRAÎCHE
après soumission : formulaire de tirage disparu, formulaire « Extract & test attributes » apparu.
`part2.ts` (`runControlCycle`, le monde de démonstration) : tirage par dérogation écrite explicite,
MÊMES tailles numériques qu'avant (3/mensuel, 5/hebdo, etc.) mais désormais un choix humain
documenté, jamais un défaut de pack tu — `npm run demo:seed` rejoué de bout en bout avec succès sur
ce chemin. Lecture `/api/sante` **CTRL-07** globale : tout tirage OE existant sans justification
écrite ET sans taille vérifiée pour sa fréquence est une violation — symétrique à CTRL-01/02/03.
`semeur/registre.ts` : citations `part2.ts`/`sox.ts`/`page.tsx` recalculées (décalages introduits
par cette tranche et la précédente, jamais supposées — `sox.ts:850` avait déjà dérivé vers 929).

**Tests neufs** : `s8.test.ts` — cas connu mauvais (règle 17) sur `drawAttributeSample` (C-REV-02,
fréquence `many_daily`, jamais vérifiée) : refuse sans dérogation, refuse une taille sans
justification (garde ADR-010 inchangée), aboutit avec les deux ; test unitaire de
`tailleEchantillonOe` (fréquence présente/absente/table vide). `ctrl07-lecture.test.ts` — la
lecture `/api/sante` : vide sans tirage, rougit sur un tirage posé directement sans justification
(bypass du garde), reste verte avec justification, reste verte par le vrai chemin gardé.

**Revue hostile, DEUX réfutateurs indépendants** (règle 30 amendée : code de refus neuf, CTRL-07)
— verdicts CONVERGENTS, **SHIP AS-IS** des deux voix. Voix 1 : les 12 citations de lignes changées
dans `semeur/registre.ts` toutes ouvertes et vérifiées exactes (aucune approximative) ; aucune
constante réintroduite en silence (les tailles 3/5/2/1/25/10 de `part2.ts` sont toutes dans le
chemin ADR-010 explicite, justification écrite à l'appui) ; garde CTRL-07 prouvée par mutation
propre (`if (!table.verifie)` → `if (false)`, le test livré échoue bien, mutation reversée,
sha256 identique). Voix 2 : ordre des gardes dans `drawAttributeSample` sûr (aucun chemin ne
contourne ADR-010 ET CTRL-07 à la fois — vérifié par lecture ET par sa propre mutation, angle
différent de voix 1) ; lecture `/api/sante` CTRL-07 sémantiquement identique au garde d'écriture
sur ce qui compte comme « justifié » ; propagation à l'écran propre (`executer()`/refus.ts attrape
toute `Error`, jamais un 500, le préfixe « CTRL-07 : » reconnu par `separerCode`) ; tailles de
`part2.ts` confirmées identiques chiffre pour chiffre à l'ancien défaut de pack (diff direct de
`pcaob-sox.ts`) ; aucune migration touchée par ce commit. **Un seul constat non bloquant, R66**
(voix 2) : `procedure_instance.control_id` n'a aucune FK vers `control` (contrairement à
`control_test.control_id`) — pré-existant, pas introduit par cette tranche, non exploitable par un
chemin de production actuel (voir `docs/BACKLOG_REPORTE.md`).

**Constat de PROCESSUS, pas de code (voix 2, §11)** — les deux voix ont fait leur propre preuve
règle 17 par mutation sur `sox.ts` AU MÊME MOMENT, sans worktree isolé chacune : un run isolé de
`s8.test.ts` a montré un symptôme trompeur (le refus CTRL-07 n'ayant pas eu lieu) qui ne venait
d'AUCUNE mutation du code livré, mais de la mutation TIERCE de l'autre voix, l'arbre partagé ayant
brièvement bougé sous les deux à la fois — exactement le risque que la règle 34 nomme, une couche
plus loin (deux réfutateurs, pas seulement un harnais et une session). Sept ré-exécutions propres
et le premier `npm run verify` complet (953/953, fenêtre chevauchant ce moment) confirment que ce
n'est pas un défaut du code. **Leçon pour toute future revue à deux voix sur du code de sécurité :
isoler chaque réfutateur dans son propre worktree**, pas seulement compter sur le retrait/retour de
chaque mutation. Le premier `npm run verify` (`/tmp/verify-ctrl07.log`, 953/953 tests) s'est arrêté
au pas `semeur` — `docs/SEMEUR_VS_CHEMIN.md` avait divergé du `registre.ts` recalculé par ce commit
(engendré, jamais rédigé à la main, règle 21) ; régénéré (`npm run semeur -- --figer`, 89 objets ·
16 décor, INCHANGÉ — uniquement des lignes recalculées). Un DEUXIÈME `npm run verify` a été relancé
sur l'arbre corrigé, puis TUÉ avant sa fin (règle 34) parce que ce commit lui-même (l'ajout de R66
au registre, ci-dessus) a édité `docs/BACKLOG_REPORTE.md`/`docs/instantanes/fils.json` PENDANT son
exécution — aucune mesure ne commence sur un arbre qui bouge, on ne l'attend pas, on le tue et on
le dit. Un TROISIÈME passage, sur l'arbre désormais figé par ce commit, a lui-même échoué —
`EADDRINUSE :3299` — pas un défaut de cette tranche : un `next-server` (v15.5.23) laissé vivant par
mon propre `kill -9` du DEUXIÈME run, qui n'avait tué que le lanceur `next dev`, pas le processus
détaché qu'il avait engendré (le piège documenté §7 de ce fichier : « sans `detached`/le GROUPE de
processus, `kill` ne tue que le lanceur »). Mesuré (`lsof -i :3299`, `ps aux`), tué proprement,
`free -m` confirmé propre (14,3 Go libres, 0 swap, aucun parasite) avant de relancer — un nettoyage
d'environnement, pas une édition du code, donc pas une nouvelle invalidation règle 34.

**Verify complet, QUATRIÈME passage (`/tmp/verify-ctrl07-4.log`), intégralement VERT — `EXIT=0`.**
**953/953 tests** (117 fichiers), **43 gardes**, `docs/SEMEUR_VS_CHEMIN.md` à jour avec le registre
(89 objets · 16 décor, inchangé), langue **0 chaîne hors catalogue · 15 messages de refus · 15/15
cas connus mauvais dénoncés**, lectures **0 lecture perdue sur 1716 chemins figés · 6/6 cas connus
mauvais**, parcours **5/5 cas connus mauvais**, screens **87 + 51 routes · 0 échec**, fumée **0
échec** (`/api/sante` répond 200 dans ce balayage aussi), densité **77 écrans · 0 au-delà de 5
actions**, clics **232 étapes · 0 échec · 362 clics sur 48 gestes · 231 stations figées vérifiées**,
sonde d'hydratation **aucun incident**, visuel **312 vues · 0 défaut**. Aucune commande de `verify`
non exécutée sur cette tranche.

## Lot contrôle interne, tranche 2 : les IUC et les facteurs de design, CTRL-02/CTRL-03 (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-08_mandat_controle_interne.md`, §2.3, §2.4, §7.2. Recherche
préalable (agent dédié) : trois tables représentent « le risque » — `risk` (0001, un risque
identifié, engagement-scopé), `fsli_assertion_risk` (0012, un NIVEAU CALCULÉ qui commande
l'étendue substantive ISA/NEP, pas lui-même « un risque »), `rcm_row.risk_desc` (0002, EXACTEMENT
le décor que ce mandat interdit — texte libre, aucune FK). Aucune FK réelle vers `risk` n'existait
avant cette tranche dans tout le dépôt — confirmé par recherche exhaustive.*

**Ce qui a changé.** Migration `0150_ctrl02_ctrl03_facteurs_iuc.sql` : quatre tables neuves —
`control_risk` (jointure control↔risk réelle, CTRL-02 §2.4.1), `control_design_factor` (un des
quatre facteurs par ligne, vocabulaire fermé), `control_iuc` (la déclaration « IUC utilisée ? »,
une par contrôle), `control_iuc_preuve` (exactitude/exhaustivité, une ligne par volet) — RLS
forcée, garde de verrou, verdict écrit pour les quatre. `sox.ts` : `lierRisqueControle`/
`delierRisqueControle`, `documenterFacteurDesign`, `declarerIuc`, `documenterIucPreuve` ;
**CTRL-02**/**CTRL-03** gardés dans le MÊME `setDiStatus` que CTRL-01 — quatre facteurs conclus
ET un lien de risque réel avant de conclure le D&I ; une déclaration IUC, et si utilisée, les
deux volets documentés. `importRcm` crée désormais un vrai `risk` par assertion du RCM et le lie
via `control_risk` pour CHAQUE contrôle importé — c'est CE lien, jamais `rcm_row.risk_desc`, que
le facteur « réponse au risque » doit citer pour ne pas être un décor. Écran `rcm/[cid]` : section
« Facteurs de design et IUC » (lier un risque, documenter les quatre facteurs, déclarer l'IUC,
documenter les deux preuves) — vérifiée CLIQUÉE, contre un build de PRODUCTION (jamais `next dev`,
observé réellement instable ici : Fast Refresh avortant des requêtes en vol), par les deux voix de
la revue hostile indépendamment : 4/4 facteurs et 2/2 preuves confirmés persistés par une
navigation FRAÎCHE, pas seulement l'état DOM en page. Lectures `/api/sante` **CTRL-02**/**CTRL-03**
globales, symétriques à CTRL-01. `part2.ts` : les deux contrôles cyclés (C-BR-01, C-REV-01)
documentent les quatre facteurs et déclarent IUC non utilisée — honnête, vérifié contre
`dataset/sox/rcm.csv` (`nature=manual` pour les deux).

**Revue hostile, DEUX réfutateurs indépendants** (règle 30 amendée : modèle de données, RLS/
multi-tenant, code de refus neuf) — verdicts convergents : voix 1 SHIP WITH MINOR FIXES (RLS/FK/
gates/vacuité/registre tous vérifiés, y compris une requête EN DIRECT sur la production confirmant
0 contrôle conclu donc aucune bombe à retardement au déploiement) ; voix 2 **DO NOT SHIP AS-IS**
sur un constat CONFIRMÉ, pas seulement plausible : **la première version de `documenterFacteurDesign`
laissait fuir, par la FORME du refus, qu'un objet existe à un acteur d'un AUTRE cabinet** — un
appel à valeur invalide recevait le refus CTRL-02 (« pas un facteur reconnu ») avant que
`assertMembreDe` (la garde d'étanchéité) ne tourne, au lieu du refus ETANCH. Le premier correctif
(un type TypeScript inline plutôt qu'un alias nommé, pour faire passer le harnais auto-généré
d'étanchéité) avait fait passer le TEST sans fermer le VRAI trou — le harnais fabrique alors une
valeur toujours VALIDE et n'exerce plus jamais la combinaison valeur-invalide + acteur-étranger
(règle 13 : le silence lu comme un succès ; règle 15 : chercher un mot n'est pas vérifier un
chemin). **Corrigé pour de vrai** : `assertMembreDe` tourne désormais EN PREMIER dans
`documenterFacteurDesign` ET `documenterIucPreuve` (et, en prévention, dans le
`documenterProcedureTache` de la tranche 1, qui portait le même défaut, jamais exploité mais
jamais fermé) — prouvé par un cas connu mauvais RÉEL (règle 17) : mutation de la ligne, `intrus`
d'un autre cabinet reçoit bien le refus CTRL-02/CTRL-03 au lieu du refus ETANCH, confirmé, puis
migration byte-pour-byte identique après retrait de la mutation (sha256). Ce cas connu mauvais est
désormais un test permanent dans `s8.test.ts`, pas seulement une sonde jetée. Deux autres constats
réels de voix 2, corrigés dans la même passe : `risk.source = 'manual'` mentait sur la provenance
d'un risque SYNTHÉTISÉ par l'import (règle 3) — `source = 'rcm_import'` (nouvelle valeur de
contrainte, nom de contrainte auto-généré RECHERCHÉ dans `pg_constraint`, jamais supposé) ; la
création de `risk` était une course vérification-puis-écriture (aucune contrainte d'unicité) —
`unique(engagement_id, assertion, description)` ajoutée, `importRcm` réécrit en upsert atomique
(`insert ... on conflict ... returning`). Provenance manquante sur trois upserts neufs
(`documenterFacteurDesign`, `declarerIuc`, `documenterIucPreuve` — la révision écrasait l'ancienne
valeur sans trace, contrairement au patron déjà posé par `documenterProcedureTache` en tranche 1) :
les trois capturent désormais l'ancienne valeur dans `event_log` sous une clé `remplace` avant
d'écraser, règle 3.

**Verify complet, TROIS passages sur arbre figé** (`set -o pipefail; timeout 3600 npm run verify`,
règle 35). Premier (`/tmp/verify-ctrl02-03-final.log`, sur l'arbre APRÈS les corrections de la
revue hostile) : **1 échec réel**, le `#418` déjà connu (`docs/CHASSE.md` §1), sur `/portal/...`
qu'aucun fichier de cette tranche ne touche — consigné **F16**, pas re-creusé (même discipline que
F9-F15). Deuxième (`/tmp/verify-ctrl02-03-final2.log`, MÊME arbre, aucune édition entre les deux
sauf la consignation F16 en documentation) : **1 échec réel D'UNE AUTRE NATURE** — `docs/CHASSE.md`
**R58** (le serveur du balayage des écrans tombe, intermittent, déjà vu trois fois avant celle-ci,
même route `/eng/[id]/testing`) — sa QUATRIÈME occurrence, la PREMIÈRE avec le journal du serveur
réellement capturé (le correctif de `tests/screens.test.ts` ci-dessous, dans la même tranche) :
mort SILENCIEUSE, aucune exception, juste après une réponse LENTE (18,4 s) — nouvelle donnée pour
l'enquête, consignée dans R58, pas une explication. `free -m` mesuré après coup : 13,7 Go libres,
0 swap, aucun processus parasite. Chaîne rejouée sur le MÊME arbre une seconde fois (aucune édition
sauf la consignation R58). Troisième passage (`/tmp/verify-ctrl02-03-final3.log`) : intégralement
vert — **947/947 tests** (116 fichiers), **43 gardes**, langue **0 chaîne hors catalogue · 15
messages de refus**, **0 lecture perdue sur 1716 chemins figés**, **276/276 stations déclarées/
figées**, screens **87 + 51 routes · 0 échec**, clics **232 étapes · 0 échec · 362 clics**, visuel
**312 vues · 0 défaut**, sonde d'hydratation **0 incident**, 15/15+6/6+5/5 cas connus mauvais
dénoncés. R44 : **89 objets · 16 décor (inchangé) · 32 non prouvé(s) (+3) · 41 prouvé(s)
(inchangé)** — trois objets neufs (lien de risque, facteurs de design, déclaration IUC), chemin
humain réel, domaine SOX entier toujours hors du parcours cliqué (note déjà connue) ; aucun décor
résolu, aucun nouveau décor créé.

**Fichier `tests/screens.test.ts` corrigé dans la même tranche** (bundlé parce que nécessaire pour
diagnostiquer le run rouge de cette tranche elle-même) : le chemin `ServeurTombe` jetait
`e.message` seul, sans le journal stdout/stderr du serveur déjà capturé — contrairement à DEUX
autres chemins d'échec du même fichier qui le font. Corrigé — c'est ce correctif qui a rendu la
nouvelle donnée R58 ci-dessus mesurable pour la première fois.

**R65 consigné, non bloquant** : aucun chemin ne permet de réviser `risk.level` après sa création
automatique par `importRcm` — pas un manque au mandat (§2.4.1 exige un lien, pas un niveau
éditable), une limite réelle de l'écran.

## Lot contrôle interne, tranche 1 : le walkthrough et ses tâches, CTRL-01 (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-08_mandat_controle_interne.md`, §2 et §7.1. Recherche préalable
(agent dédié, parallèle sur 5 axes) : `control`/`control_instance`/`attribute_def`/
`attribute_result` (0002_testing.sql) existent déjà et sont le bon point d'ancrage — étendre, pas
dupliquer ; `walkthrough` (0002) existe aussi mais MORTE en code, mal ancrée sur `process_id` (un
processus porte plusieurs contrôles), jamais câblée à un service ni un écran — ADR-136 documente
pourquoi elle reste inerte plutôt que réutilisée. Aucun patron de FK réelle vers un risque
n'existait dans le dépôt pour CTRL-02 (tranche suivante) ; le patron `verifie:false` pour un
paramètre de pack livré vide (CTRL-07, tranche OE) est confirmé dans `methodology/independance.json`.*

**Ce qui a changé.** Migration `0148_controle_interne_taches.sql` : `control.di_walkthrough_
evidence_id` (lien direct vers la pièce vidéo) ; deux tables neuves, `control_task` (une tâche =
une ligne, §2.1.2) et `control_task_procedure` (procédure documentée par tâche, vocabulaire fermé
`inquiry`/`inspection`/`observation`/`reperformance`) — RLS, `FORCE ROW LEVEL SECURITY`, garde de
verrou (`assert_engagement_unlocked`) et verdict écrit pour les deux tables, `engagement_id`
dénormalisé sur `control_task_procedure` (nécessaire : la garde lit `NEW.engagement_id`
littéralement, et cette table s'écrit dans une transaction SÉPARÉE de son parent). `sox.ts` :
`attacherWalkthrough`, `ajouterTacheControle` (pose l'inquiry systématique, une fois, citant la
vidéo), `documenterProcedureTache` ; **CTRL-01** gardé dans `setDiStatus` — aucune tâche, ou une
tâche à la seule inquiry, refuse la conclusion du D&I, en nommant la tâche. Écran : `rcm/[cid]`
gagne une section walkthrough (joindre l'enregistrement, ajouter des tâches, documenter une
procédure par tâche, badge « CTRL-01 manquant » tant qu'une tâche n'a que l'inquiry). Lecture
`/api/sante` globale (tous les dossiers) : rougit sur tout contrôle CONCLU sans tâche, ou avec une
tâche à la seule inquiry.

**Défaut de modélisation trouvé ET corrigé dans la même tranche, pas laissé pour plus tard**
(revue hostile, voix 1, disqualifiant tel quel) : `importRcm` lisait `di_status` directement du
CSV du listing CLIENT — un jugement de l'AUDITEUR qui n'a jamais sa source chez le client. Six
contrôles sur sept démarraient donc « effective » sans jamais passer par `setDiStatus`, donc sans
aucune tâche — exactement la violation de CTRL-01 que la lecture `/api/sante` existe pour
attraper, et sa PREMIÈRE version (jointure partant des tâches) ne pouvait pas voir un contrôle
conclu à ZÉRO tâche. Corrigé : `dataset/sox/rcm.csv` perd sa colonne `di_status` ; `importRcm`
pose toujours `not_assessed` ; la lecture `/api/sante` part désormais des CONTRÔLES conclus, pas
des tâches, et compte l'absence de tâche comme sa propre violation. Le monde semé est maintenant
honnête : 2 contrôles conclus par le vrai chemin gardé (C-BR-01, C-REV-01, walkthrough+tâche+
procédure réels dans `part2.ts`), 5 `not_assessed` — vérifié en direct (`/rcm` après
`db:reset && demo:seed`, badges comptés dans le HTML servi).

**Deux autres constats CONFIRMÉS PAR LES DEUX VOIX** (règle 30 : convergent, donc « confirmé par
réfutation ») : `documenterProcedureTache` n'avait AUCUNE garde d'exécution contre
`procedure='inquiry'` — le type TypeScript exclut cette valeur, mais un `FormData` posté à la main
n'est pas contraint par le `<select>` du formulaire, et l'upsert écrasait silencieusement la ligne
d'inquiry systématique (sa note, sa citation de la vidéo). Corrigé : garde à l'exécution, testée
avec le même appel qui l'a trouvée (`documenterProcedureTache(taskId, user, 'inquiry' as any, ...)`
refuse désormais, `CTRL-01 : ... n'est pas une procédure documentable`). `attacherWalkthrough` et
`documenterProcedureTache` acceptaient une pièce en QUARANTAINE (seule fonction du fichier à ne
pas suivre ce patron déjà répété dix fois ailleurs) — corrigé, testé.

**Autres corrections, mécaniques** : `docs/DECISIONS.md` ne portait pas l'arbitrage que la
migration prétendait y avoir consigné (ADR-136, ajouté) ; six citations `part2.ts:` PRÉEXISTANTES
et trois neuves dans `semeur/registre.ts` avaient dérivé de ±19-22 lignes à cause de l'insertion —
recalculées par `grep -n`, pas supposées ; l'instrument d'étanchéité exécutée n'avait pas de
fixture réelle pour `taskId` (preuve ETANCH-04 seulement, plus faible que ETANCH-01/03) — une
ligne `control_task` réelle ajoutée à son montage. `set -o pipefail` actif tout du long (règle 35).

**R63 consigné, non bloquant** : course sur `control_task.seq_no` sous double appel concurrent —
erreur Postgres brute, aucune corruption (contrainte unique tient), même patron non corrigé
ailleurs (`requests.ts::nextSeq`). **Amendement CLAUDE.md règle 14** ajouté le même jour
(« pack SOX gelé » précisé, pas levé) ; objection de la voix 1 sur le chevauchement de vocabulaire
avec `methodology/procedures.json` répondue dans le même amendement, marquée **jugée seule, non
réfutée** (règle 30) — à corriger si un second regard ou le fondateur la trouve fausse.

**Revue hostile, DEUX réfutateurs indépendants** (règle 30 amendée : modèle de données + RLS/
multi-tenant + code de refus neuf, donc deux voix) — voix 2 : SHIP WITH MINOR FIXES (9 constats,
tous corrigés ou consignés R63) ; voix 1 : DO NOT SHIP AS-IS sur F1 (le défaut de modélisation
ci-dessus) — corrigé, testé (cas connu mauvais A et B, `ctrl01-lecture.test.ts`), revérifié par
moi-même station par station (navigateur réel, `/rcm` et `/rcm/[cid]`) avant expédition.

**Verify complet sur arbre figé, DEUX passages** (`set -o pipefail; timeout 3600 npm run verify`,
règle 35) — le premier (`/tmp/verify-ctrl01-t1.log`) a montré **1 échec réel** : le `#418` déjà
connu (`docs/CHASSE.md` §1), sur une page `/workpapers/` qu'aucun fichier de cette tranche ne
touche ni n'importe — consigné **F15** dans `docs/CHASSE.md`, pas re-creusé (même discipline que
F9-F14), rejoué sur le MÊME arbre (aucune édition entre les deux passages, règle 34). Le second
(`/tmp/verify-ctrl01-t2.log`) est intégralement vert : **932/932 tests** (115 fichiers, 459,72 s),
**43 gardes**, **932 tests collectés · plancher 632**, langue **0 chaîne hors catalogue · 15
message(s) de refus documentés**, **0 lecture perdue sur 1716 chemins figés**, **276/276 stations
déclarées/figées**, screens **87 + 51 routes · 0 échec**, clics **232 étapes · 0 échec · 362
clics**, visuel **312 vues · 0 défaut**. R44 (`docs/SEMEUR_VS_CHEMIN.md`) : **86 objets · 16 DÉCOR
(inchangé) · 29 non prouvé(s) (+3) · 41 prouvé(s) (inchangé)** — attendu : trois objets neufs
ajoutés avec un chemin humain réel mais aucune station de clics ne les exerce encore (le domaine
SOX/contrôle interne entier est hors du parcours cliqué, note déjà présente dans le registre) ;
aucun décor résolu, aucun nouveau décor créé.

## Lot contrôle interne, tranche 1 correctif : migration 0149, CTRL-01 en production (2026-09-08, SHA servi 2c3a00f)

**Ce qui a été trouvé.** La confirmation du SHA servi de `1e1c569` (tranche 1 ci-dessus) a
d'abord été instruite sur un message qui affirmait la tranche « proprement en ligne » sans mesure
— vérifié indépendamment plutôt qu'exécuté tel quel (règle 13) : le job CI `deploye` (run
34267345746) avait RÉELLEMENT échoué (fenêtre de 15 min épuisée, HTTP 500 continu,
19:10:19Z→19:25:37Z), pas un artefact de build lent. Un fetch direct de `/api/sante` en
production (`mcp__Vercel__web_fetch_vercel_url`, 19:29:45Z) a confirmé le 500 réel : la propre
lecture **CTRL-01** livrée par `1e1c569` rougissait sur **six contrôles par dossier SOX** (douze
au total, les deux dossiers de la démo publique) — `di_status` posé directement par l'ancien
`importRcm`, corrigé par le CODE de `1e1c569` mais jamais rattrapé sur les lignes DÉJÀ écrites en
production par l'ancien code, avant ce déploiement. `mcp__Supabase__execute_sql` a confirmé le
motif exact sur la donnée réelle plutôt que de le supposer depuis le code.

**Ce qui a changé.** Migration `0149_ctrl01_correction_di_status.sql` : un seul `UPDATE` sur
`control` (`di_status`/`di_conclusion` → `not_assessed`/`null`), scopé par `WHERE di_status <>
'not_assessed' AND NOT EXISTS (control_task ...)`. Ni re-semis (aucune autre table touchée, rien
reconstruit — `control_test`/`sample`/`attribute_result`/`deviation`/`deficiency`/`workpaper`
intacts, règle 28), ni fabrication compensatoire (aucune `control_task_procedure` posée par la
migration — ç'aurait été le décor, règle 20, que `0148` corrige dans l'autre sens). Amendement
CLAUDE.md ajouté au voisinage de la règle 35 (dicté par l'instruction qui a déclenché cette
tranche) : une attente CI n'a ni processus local ni notification de fin — même défaut que la
règle 35, une couche plus loin ; forme correcte, un réveil qui RELIT l'état par l'API ou un
sondage borné dans le même tour.

**Revue hostile, DEUX réfutateurs indépendants** (règle 30 amendée : donnée de production, code
de refus) — **SHIP WITH MINOR FIXES** des deux voix, convergentes sur le point central (H4/V2-1) :
resetter `di_status` est le bon choix, fabriquer une tâche compensatoire aurait été la vraie
faute — les deux voix ont tracé indépendamment tous les chemins downstream (`drawAttributeSample`,
`draftOeWorkpaper`, les workpapers déjà signés) et confirmé qu'aucune preuve OE réelle
(`control_test`, `sample`, `deviation`, un papier signé) n'est détruite ni cachée. Convergence
aussi sur la garde de verrou (H1/V2-3) : mesurée en direct sur la donnée de production, les deux
dossiers SOX sont `fieldwork`, pas verrouillés ; la migration ne contourne PAS
`assert_engagement_unlocked` (pas de `set_config`), et échoue bruyamment plutôt que d'écraser en
silence si un dossier visé l'était — testé (`ctrl01-lecture.test.ts`). Corrections appliquées :
**H2** (voix 1) — trou réel : aucun test n'exerçait la moitié PROTECTRICE du prédicat (un contrôle
avec une vraie tâche documentée doit rester intact) ; ajouté, prouvé contre la mutation exacte de
la voix 1 (retrait du `NOT EXISTS`, vu échouer), migration restaurée octet pour octet (sha256
identique avant/après). **V2-2** (voix 2) — trou réel mais non bloquant : `draftOeWorkpaper`
(et son bouton dans `/rcm/[cid]`) n'est pas gardé par `di_status`, désormais atteignable pour de
vrai sur C-BR-01/C-REV-01 (un redraft produirait un papier auto-contradictoire, sans rien
détruire — la version antérieure signée reste lisible, règle 28) — consigné **R64**
(`BACKLOG_REPORTE.md`, `fils.json`), pas silencieusement laissé de côté.

**Verify complet, UN passage propre** (`set -o pipefail; timeout 3600 npm run verify`, sur
l'arbre exact devenu `2c3a00f` — `/tmp/verify-ctrl-interne-0149.log`) : **935/935 tests** (115
fichiers), **43 gardes**, **935 tests collectés · plancher 632**, langue **0 chaîne hors
catalogue · 15 messages de refus documentés**, **0 lecture perdue sur 1716 chemins figés**,
**276/276 stations déclarées/figées**, screens **87 + 51 routes · 0 échec**, clics **232 étapes ·
0 échec · 362 clics**, visuel **312 vues · 0 défaut**, sonde d'hydratation **0 incident** (pas de
récidive du #418 cette fois), langue/lectures/parcours-épreuve **15/15 + 6/6 + 5/5** cas connus
mauvais dénoncés.

**SHA servi, confirmé DEUX FOIS** (`docs/instantanes/servi.json`) : CI `deploye`, run
34274373455, job 102223630517, étape « le SHA poussé doit être servi dans les 15 minutes »
(succès, 20:22:17Z→20:26:12Z, 217 s — 1e1c569 encore servi de 0 s à 181 s, puis 2c3a00f à 217 s) ;
confirmé INDÉPENDAMMENT en direct (`mcp__Vercel__web_fetch_vercel_url` sur `/api/sante`,
20:41:44Z) : HTTP 200, `identiteCoherente:true`, lecture **CTRL-01** `"ok":true,"vide":true` —
« aucun contrôle conclu pour l'instant » (les douze violations ramenées à `not_assessed` par
`0149`, honnêtement rendu VIDE, pas confondu avec un passage — une lecture vide n'est pas une
lecture qui passe, docs/PLAN_RLS.md). `1e1c569` lui-même n'a jamais reçu de confirmation servie —
son propre run `deploye` a échoué pour de vrai ; pas un instantané périmé (contraste avec
`fcbedf7`), un SHA qui n'a jamais été honnêtement servi.

## Lot 4 — CLOS (2026-09-08, SHA servi f2968d3)

Quatre tranches en production : déplanification (tranche 1), R34/R30 partiel (tranche 2), création
de dossier de bout en bout (tranche 3), D.6 points 1 et 3 de l'épreuve de l'épure (tranche 4a).
Les quatre autres points de D.6 (rail par défaut, compteur qui mène quelque part, aucun état vide
muet, parcours découverte chronométré) ne sont PAS traités — reportés, pas oubliés (règle 23) :
**R59, R60, R61, R62** (`docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json`). Clôture décidée
sur la base du mandat du 2026-09-08, §0, qui nomme explicitement les huit tranches déjà livrées du
Lot 4 comme ayant « fermé de la dette et affiné l'épure » et demande d'orienter la suite vers la
CAPACITÉ neuve. Le lot suivant (§0 du nouveau mandat) commence ci-dessous.

## Reprendre ce dossier sans moi — l'essentiel en une page

**Ce qu'est OTTO.** Une plateforme d'audit AI-native : noyau agnostique du référentiel, packs de
référentiel (NEP/France et PCAOB-SOX en v1), et une **méthode de cabinet qui est de la DONNÉE**
(`methodology/*.json`, validée par `valider.mjs`, chargée par cabinet). Interface en français,
local-first : elle tourne sans aucun compte externe.

**Ce que l'application fait aujourd'hui, de bout en bout, au clic.** Créer un dossier · l'accepter
(critères, motifs, jalons dont un dérivé) · équipe et indépendance (déclarations, ancienneté,
rotation) · reprendre l'exercice précédent (proposé, jamais repris en silence) · importer balance et
grand livre (FEC strict) · rapprocher · seuils · périmètre · risque par assertion · questionnaire
résiduel · sondage (couverture + unités monétaires, germe déterministe) · demande PBC · **portail
client** · échelle d'extraction · vouching L0 · écarts et clarifications · re-exécution en aveugle ·
évaluation contre l'anomalie tolérable · papier de travail, notes de revue, trois visas dans
l'ordre, export PDF/Excel · pointage des états financiers · achèvement (5 natures) · **obstacles au
visa** (une liste, dix familles, calculée) · clôture et **archive scellée téléchargeable** ·
**notes de revue ancrées sur l'objet métier** (cellule de testing, section de papier, réponse de
questionnaire, paramètre de seuils, ÉCART — clic droit, appui long ou puce au survol ; vue
transverse `/notes` où une note dont l'objet est sorti de l'échantillon remonte « objet retiré »,
ADR-097 ; quatre types dont seule « à corriger » bloque le visa, et la clôture appartient à un
réviseur qui n'est JAMAIS l'auteur — service + trigger en base, ADR-102) ·
**notes adressées à OTTO** : il exécute (extraction, vouching, état de complétude — catalogue
fermé, compréhension par règles), refuse ce qui n'est pas de son ressort avec la liste de ce
qu'il sait faire, répond au dossier (fait, pièces, reste à vérifier) et ne clôt jamais (ADR-098) ·
**colonne ajoutée au tableau de testing** : titre libre → OTTO PROPOSE son interprétation et
n'écrit rien avant confirmation ; deux issues par cellule — trouvée avec sa provenance, ou
introuvable qui PROPOSE une clarification client (ADR-099) · **bascule entre missions groupées
par client** (groupe → entité → mandats), journalisée, isolation éprouvée (ADR-100) ·
**réunions** : contacts de mission (clé + domaines), créneaux communs depuis les disponibilités
(libre/occupé seulement), choix humain obligatoire, copies dans l'ordre calculé, .ics RFC 5545 —
lecture d'agendas et envoi SIMULÉS et dits tels (ADR-101) ·
**le rail montre l'ÉTAT du dossier, pas le catalogue des fonctions** : un dossier neuf ouvre cinq
destinations, le rail grandit avec le travail, le reste est GRISÉ avec sa raison en une ligne
derrière « tout afficher » — jamais masqué sans explication ; libellés réécrits pour la première
ouverture (ADR-103) ·
**l'atelier du contrôle sur pièces** : la pièce et la ligne CÔTE À CÔTE (visionneuse intégrée,
jamais un autre onglet), motif de sélection et comparaison lisibles SUR la ligne, ↑/↓ et Entrée
atteste en emportant les corrections tapées, la suivante s'ouvre seule, clarification en lot
(refusée sans motif), écart ↔ synthèse en un clic dans les deux sens, papier vivant par le MÊME
formateur que le papier ; banc `npm run mesure:testing` : 4 gestes / 2 écrans → 1 geste / 1 écran
par ligne (ADR-104) ·
**l'IA vivante dans la version livrée** : `npm run demo:ia` — l'échelon OCR lit avec le MODÈLE
(clé dans app/.env.local, présence vérifiée sans lire la valeur), pièces neuves JAMAIS VUES
engendrées depuis le monde semé (normales + piégées : montant, date, quantité, signature, scan
dégradé — VERITE.md dit quoi déposer où), coût affiché par lecture et en cumul, garde de budget
qui refuse au plafond en nommant les deux chiffres ; rejeu inchangé par défaut, L2 et provenance
inchangés partout ; mesuré hors cache : précision 100 % (43/43), 0,0223 $/document,
p50 4,4 s (`npm run eval:pieces-neuves`, ADR-105) ·
**estimations comptables hors litige** : le fichier de calcul du client importé (pièce à
part entière), rapproché à l'écriture visée (montant DÉRIVÉ du grand livre actif, jamais
stocké), recalculé au centime, base sondée par le même moteur de tirage, justificatifs
demandés en brouillon — base des lignes tirées + CHAQUE taux + la note de méthode
(ADR-106a, `dataset/estimations/fae-2025.csv`) ·
**annexes de papier** : un tableur se joint au papier (la table existait depuis la
migration 0002, aucun chemin ne l'atteignait — branchée : moteur de pièces, empreinte,
journal, écran) (ADR-106c) · **accès ERP** : l'architecture qui ne se ferme pas, en une
page — docs/13_ACCES_ERP.md (ADR-106b) ·
**balances auxiliaires âgées** : les exports du client (clients/fournisseurs × N/N-1)
rapprochés au grand livre — N au solde actif, N-1 aux à-nouveaux, l'écart du collectif DIT
(les 25 000 € de situation sans attribution auxiliaire) ; concentration top 10, apparus,
disparus, déplacements de part ≥ seuil (le seuil commande), déformation du vieillissement
(> 90 j) avec porteurs nommés ; chaque constat = CANDIDAT proposé au registre (un humain
confirme) + questions client en brouillon (ADR-107, `npm run dataset:balances-aux`) ·
**contrôle interne et processus** : le processus en DONNÉES STRUCTURÉES (étapes, acteurs,
systèmes, contrôles avec fréquence et propriétaire), diagramme GÉNÉRÉ — le flowchart client
n'est qu'une corroboration ; différence N/N-1 EXACTE champ par champ, CHAQUE changement
statué par écrit (« significatif » → facteur PROPOSÉ au registre) ; entretien avec
consentements TRACÉS ou notes sans enregistrement (le module fonctionne sans), transcript
confronté à la documentation → écarts CANDIDATS (omissions d'abord, ai_run, rejeu
enregistré / IA réelle via demo:ia), statués un par un — question, facteur, écarté motivé ;
changements et écarts non statués = obstacles au visa, famille `processus` ; purge du
transcript à l'échéance de conservation (ADR-108, docs/14_ENTRETIENS_CONSENTEMENT.md).
Plus : test des écritures, pack SOX (RCM, tests d'efficacité, déficiences), pilotage, provenance,
journal, « Interroger » (langage naturel → requête déterministe, jamais de prose).

**Branche** : `main` (branche par défaut). `claude/otto-audit-platform-whs17z` reste comme
historique. **Aucun déploiement** — il se fera quand le fondateur le demandera. Vercel n'est
pas connecté.

### La commande qui MONTRE

`cd app && npm run demo` — une seule commande : base vide, migrations, monde de démonstration,
serveur, puis un panneau en clair donnant l'adresse, les trois rôles (on se connecte en
cliquant un nom, il n'y a pas de mot de passe), le portail client et la remise à zéro. Chaque
étape qui peut échouer sur une machine neuve dit quoi faire, pas une trace ; une seconde
démonstration est refusée plutôt que d'effacer la base de la première (ADR-095). Mesuré sur
une base vide : **01:02** de la commande au panneau.

### Les quatre commandes qui prouvent

| Ce que ça prouve | Commande | État |
|---|---|---|
| Toutes les règles, tous les refus | `cd app && npm test` | 503 tests, zéro réseau |
| Tous les écrans **rendent** en production | `cd app && npm run screens` | 74 routes |
| Le parcours se **clique** vraiment, import → dossier scellé | `cd app && npm run clics` | 126 étapes, ~40 refus |
| Les écrans se **lisent** (clair/sombre, large/390 px) | `cd app && npm run visuel` | 276 vues, 0 défaut |
| Tout, base recréée | `cd app && npm run verify` | enchaîne les quatre |

`npm run verify` est la seule chose à lancer avant de dire qu'une tranche est finie.

### Les cinq règles qui ont coûté le plus cher à apprendre

1. **Un écran qui rend n'est pas un écran qui marche.** Six formulaires inertes en production
   (ADR-078), un dossier créé inatteignable (ADR-088), dix écrans qui rendaient chaque refus en
   page 500 (ADR-091) — tout cela avec la suite au vert et les écrans à 200.
2. **N'affirme jamais plus que ce que tu vérifies** — ni dans un écran, ni dans ce fichier.
3. **Le silence lu comme un succès** est le défaut à traquer : un objet créé qu'aucun chemin de
   lecture n'atteint, un geste du métier sans écran, une branche de repli que rien n'exécute, un
   formulaire que le navigateur refuse d'envoyer et qu'on lit comme une règle vérifiée.
4. **Un refus s'affiche, il ne tombe pas en 500** — `src/app/refus.ts` porte la règle pour tous les
   onze écrans qui en avaient besoin. Le onzième s'était caché derrière le mot « refusée » écrit
   dans une phrase d'explication : chercher un mot n'est pas vérifier un chemin.
5. **La méthode NOMME, le code CALCULE** (ADR-050) : un prédicat ou une formule inconnue arrête
   l'assemblage, elle ne s'ignore pas.

### Ce qui est GELÉ — ne pas rouvrir sans le fondateur

- **Aucun cycle au-delà du chiffre d'affaires.** Les procédures sont du contenu, la mécanique est le
  produit.
- **Aucun contenu de procédure nouveau.** Le pack **SOX est gelé** : il tourne, il ne s'étend pas.
- **Données synthétiques uniquement, pour toujours.** Aucune méthodologie de cabinet réelle.
- **Aucun appel LLM payant depuis un harnais** : `npm run clics` force `OTTO_OCR_ADAPTER=mock`.
  La clé vit dans `app/.env.local`, lue seulement par l'application au runtime — **ne jamais
  l'exporter dans un shell**.

### Ce qui reste OUVERT — la file, telle qu'elle est

| # | Ouvert | Qui décide |
|---|---|---|
| 1 | **Les 19 sources méthodologiques sont `verifie: false`** — aucune relue sur texte primaire. Le fondateur s'en charge sur les procédures de démonstration. | fondateur |
| 2 | **PCAOB AS 1215** porté `[UNVERIFIED]` : pcaobus.org est bloqué depuis cet environnement. Le côté français est vérifié (R. 820-42 ; D. 821-186 III-IV). | fondateur |
| 3 | **Déploiement Vercel + Supabase — FAIT et VÉRIFIÉ le 2026-08-31 à 20:48** : HTTP 200 sur `https://otto-dit-imperator080599.vercel.app`, dossier ouvert, atelier de testing lu (Claire Fontaine · Altiverre FY2025 · « Testing workbench » avec les lignes de l'échantillon et leurs motifs). Données servies par Supabase via le pooler de TRANSACTION ; migrations incrémentales appliquées au déploiement (0030 le jour même) et monde semé CONSERVÉ ; tentative de fuite RLS refusée à chaque build (« locataire étranger : 0 · légitime : 48 »). ~~Reste une décision du fondateur : la protection « Vercel Authentication » est active~~ — **levée** (mesuré le 2026-09-01 par l'API Vercel : `ssoProtection.enabled=false`, `passwordProtection.enabled=false`) : l'URL est ouvrable sans compte. | fait |
| 4 | **Transport e-mail entrant réel** (Q12) — première tâche de déploiement. | fondateur |
| 5 | **Secret professionnel / RGPD + DPA** avant toute donnée réelle (A13). | fondateur |
| 6 | Le contrôle `input[type=file]` affiche « Choose File » (libellé natif du navigateur) sur le portail francophone : non corrigeable sans contrôle sur mesure. | à trancher |
| 7 | **L'hydratation React (#418) refait surface par intermittence** dans `npm run clics` : 2026-08-30, trois exécutions production → 2 exceptions (portail, testing), puis 1 (papier), puis 0 en mode dev ; écrans variables, y compris non modifiés ce jour-là. 45 ouvertures directes de ces mêmes écrans sur build de production : 0 erreur (sonde rejouable : `npx tsx <scratch>/sonde-hydratation.ts`) — le défaut ne se déclenche qu'au fil des enchaînements d'actions du parcours. React répare seul (aucune station fonctionnelle n'échoue), mais le harnais compte l'exception, donc `verify` peut rougir sans défaut nouveau. CAUSE PROBABLE TROUVÉE puis corrigée dans le harnais : `aller()` rendait la main à `load`, AVANT la fin du flux RSC et de l'hydratation — naviguer à cet instant coupait le flux et l'exception partait, mal étiquetée, sur la page suivante. `aller()` attend désormais le silence réseau. Après correctif : 4 exécutions propres, puis UNE réapparition (2026-08-31, écran des écarts — qui venait de recevoir un composant client), relancée propre aussitôt. Le correctif a réduit le défaut sans l'éteindre : il reste intermittent et rare (~1 exécution sur 5), React répare seul, aucune station fonctionnelle n'échoue. Politique : un échec de clics dont la SEULE ligne est `EXCEPTION … #418` se relance une fois ; la sonde `scripts/clics/sonde-hydratation.ts` reste le point de départ d'une vraie instruction. **INSTRUIT ET RÉSOLU (2026-08-31, 6919ffe)** : la fréquence est montée à 1/exécution (4/4, pages changeantes : exceptions ×2, scoping, risk) dès que le layout RACINE a reçu un ternaire d'environnement (bandeau) et une métadonnée robots conditionnelle (084da83) ; hypothèses réfutées par mesure — dépassement réseau (0 journalisé après dé-masquage du catch), rendu à froid (0/45), mode dev (0) ; layout remis à plat → 126/126. Correctif de fond : le layout racine ne lit PLUS l'environnement (bandeau permanent bilingue constant, robots noindex constant) ; chaîne complète verte derrière (503 tests, 74 routes, 126 étapes, 276 vues, 0 partout). La politique de relance unique reste écrite au cas où une NOUVELLE cause du même symptôme apparaîtrait. | résolu |
| 8 | Le dossier N-1 n'est ni conclu ni clos : `/api/archive/[engagementId]` déclare donc un **404 attendu** tant qu'aucun dossier n'est scellé dans le monde de démonstration. | à trancher |
| 9 | Premiers fast-follows si le coin tient : revue analytique + questions de variation, pointage de plaquette, circularisations (D8). | fondateur |
| 10 | **Branchement Microsoft 365 réel des réunions** (ADR-101) — le chantier chiffré : (a) inscription d'application Entra ID sur le locataire du cabinet ; (b) consentement administrateur ; (c) permissions déléguées MINIMALES — libre/occupé via `getSchedule` (`Schedule.Read.All` en application ou `Calendars.Read.Shared` en délégué, à trancher avec l'admin), émission via `Calendars.ReadWrite` OU envoi du .ics par le transport e-mail existant (moins de permissions — préférable) ; (d) refus de principe de tout scope lisant le CONTENU des agendas ; (e) un `AgendaAdapter` Graph + tests de garde sans réseau, sur le modèle de l'OCR. Ordre de grandeur : 2-3 tranches de travail, dont une entière pour les refus et la métrologie. Indémontrable sans locataire réel — c'est dit à l'écran. | fondateur |
| 11 | **Windows : corrigé sans machine Windows.** `spawn npx ENOENT` (ADR-096) est corrigé — plus aucun spawn de `npx`, branches Windows exécutées en test depuis Linux — mais AUCUNE exécution sur Windows réel n'a eu lieu. Le fondateur a relancé et vu LE MÊME message mot pour mot — message que le code corrigé ne peut plus produire : sa copie est très probablement antérieure au correctif. Un DIAGNOSTIC EN UNE COMMANDE existe désormais : `cd app; npm run diagnostic` — il collecte système, dépôt, état du correctif, fichiers, et le lancement complet dans `diagnostic-otto.txt` à renvoyer tel quel ; il détecte lui-même une copie périmée et dit quoi faire (`git pull`). Vérifié : exécution complète sur Linux (58 s, serveur arrêté proprement, zéro secret dans le fichier), et le verdict « copie antérieure » exercé sur un worktree réel du commit d'avant le correctif. | fondateur |

### Où regarder en premier

`DEMO_APP.md` (le parcours pas à pas) · `docs/DECISIONS.md` (ADR-001 → ADR-093, le pourquoi de
chaque règle) · `CLAUDE.md` (les quatorze règles permanentes) · `docs/12_CONFIGURABLE.md` (ce qui
est de la méthode et ce qui est du code).

---

## Current state

- **Stage**: C complete — all slices S0→S10 + hardening built, tested and pushed.
  The two-part demo runs end-to-end. Feature work is stopped per the program contract.
- **Branch**: `claude/otto-audit-platform-whs17z`.
- **Suite**: voir la dernière tranche datée ci-dessous pour les compteurs à jour de
  `npm run verify` (tests, routes, étapes cliquées, vues regardées, écrans mesurés).
  Historique : 404 tests verts à la fin de l'étape C (`cd app && npm test`), zéro réseau.
  Le balayage des 63 écrans est DANS la suite, et `npm run screens` le refait en production.
  `npm run clics` **conduit TOUT le chemin de démonstration** dans Chromium sur le build de
  production — de l'import du grand livre définitif au téléchargement du dossier scellé, en
  54 étapes dont une trentaine vérifient un refus (ADR-090, ADR-091). `npm run visuel` REGARDE
  les 59 écrans en clair et en sombre, en large et à 390 px — débordement et contraste mesurés,
  captures produites (ADR-094). Les trois entrent dans `npm run verify`.
  Un écran qui rend n'est pas un écran qui marche : ADR-076, ADR-078 et ADR-088 disent pourquoi.

## Lot 4, tranche 4a : D.6 points 1 et 3, l'épreuve de l'épure (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, §D.6 « L'épreuve de l'épure,
mécanisée » — six vérifications qui contournent le goût du fondateur (« épuré, qu'un auditeur
lambda comprenne ») faute de test automatique pour un goût. Cette tranche livre les deux
premières : **point 1** (« Aucun identifiant technique en première position d'un message vu par
un auditeur ») et **point 3** (« Une page de poste n'ouvre par défaut que les sections portant du
contenu »). Les quatre autres (rail par défaut, compteur qui mène quelque part, aucun état vide
muet, parcours découverte chronométré) restent à faire — tranches suivantes, D.8.*

**Point 1 — le code après la phrase.** `separerCode` (`app/refus.ts`), fonction pure : reconnaît
une FORME (`MAJUSCULES[-MAJUSCULES...] :` en tête) sans vérifier le catalogue ni la forme métier
(dit en tête de fichier, règle 19). `BandeauRefus` — le composant partagé par 34 écrans — l'utilise
pour afficher la phrase D'ABORD, le code ensuite en petit (`<span class="faint mono">`). Choix
délibéré (règle 8) : réordonner à l'affichage, dans UN SEUL endroit partagé, plutôt que réécrire
les dizaines de sites `throw new Error('CODE : ...')` à travers le dépôt. `refus(p)` du parcours
cliqué lit `?erreur=` dans l'URL, jamais le DOM rendu — confirmé par lecture, donc ce changement
d'affichage est invisible aux dizaines de stations qui testent un code par regex.

**Point 3 — les sections vides repliées.** `blocPorteContenu(etat)` (`poste.ts`), fonction pure sur
les quatre `EtatBloc` possibles : `a_faire`/`sans_objet` (vide) → repliée par défaut ;
`en_cours`/`fait` (du contenu) → ouverte. `Repli` (`app/repli.tsx`) reçoit un nouveau prop optionnel
`porteContenu`, qui ne joue QUE si rien n'est mémorisé pour cette personne — un repli déjà
ouvert/fermé à la main par un auditeur n'est jamais reforcé (règle 28 : jamais contre un geste
humain déjà écrit). Câblé sur les 8 `<Repli>` de la page de poste liés à un bloc. Vérifié en direct
sur un poste RICHE (REVENUE) et deux postes presque vides (OTHER_INCOME, FINANCIAL_RESULT, PROVISIONS)
via le HTML servi (`<details ... open>` présent/absent) — confirmé cohérent avec `etat`.

**Revue hostile, DEUX réfutateurs indépendants sur le point 1** (règle 24/30, code) — deux
mutations adverses chacun, toutes revenues bit-à-bit identiques après restauration (`git diff`
vide) :
- **Voix 1** — SHIP AS-IS. Recherche exhaustive de tous les `throw new Error('CODE : ...')` du
  dépôt : un seul faux positif possible (`IMPOSSIBLE :`, un mot français tout capitales), déjà
  couvert par un cas de test. Confirmé : aucun `dangerouslySetInnerHTML`, `refus(p)` invisible au
  changement, `tsc --noEmit` propre.
- **Voix 2** — SHIP WITH MINOR FIXES, deux constats réels, tous deux corrigés dans cette tranche :
  **F2** — `population/page.tsx` et `reunions/page.tsx` affichaient une erreur brute, hors
  `BandeauRefus` (aucune violation active aujourd'hui, tous les messages actuels sont en français
  minuscule, mais rien ne gardait ces deux chemins contre un futur `CODE : ...`) — corrigé en
  appliquant `separerCode` directement dans leur propre rendu (pas `BandeauRefus` lui-même : ces
  échecs ne sont pas des refus d'action postés via `?erreur=`, « rien n'a été enregistré » y serait
  faux). **F3** — `separerCode` suppose `erreur: string`, mais un `?erreur=` RÉPÉTÉ dans l'URL fait
  rendre un tableau par Next malgré le typage : `.match` plantait alors en **500** — exactement la
  classe de défaut que `refus.ts` existe pour éliminer (règle 13). Corrigé par une garde `typeof`
  en tête de fonction, testée (`refus.test.ts`).

**Tests neufs** : `refus.test.ts` (12 cas, dont F3 et un cas URL/heure avec `:` interne) ;
`poste.test.ts` étendu (`blocPorteContenu` sur ses 4 états, plus un recoupement contre la donnée
réelle — comptes présents ⇔ leadsheet plein) ; `api/sante/poste-defaut-lecture.test.ts` (lecture
verte sur données réelles, puis cas connu mauvais par mock de module — `blocPorteContenu` forcé à
toujours mentir — qui fait rougir la lecture, restauré, revérifié vert).

**`/api/sante`** (règle 22) : nouvelle lecture « sections vides repliées par défaut (D.6 point 3,
Lot 4 tranche 4) » — pour chaque poste du dossier, vérifie que le bloc leadsheet est plein
exactement quand il a des comptes ; rougit sur un désaccord (ne peut être provoqué que par une
régression du code, pas par une donnée — documenté en tête, règle 19, même famille que R30).

**Verify complet sur arbre figé** (`set -o pipefail; timeout 3600 npm run verify`, forme opérative
règle 35 corrigée) : **926/926 tests** (114 fichiers, 449 s), **43 gardes**, **926 tests collectés
· plancher 632**, langue **0 chaîne hors catalogue · 15/15 cas connus mauvais dénoncés**,
**0 lecture perdue sur 1716 chemins figés**, **276/276 stations déclarées/figées**, screens
**87 + 51 routes · 0 échec**, densité **77 écrans · 0 au-delà de 5 actions**, clics
**232 étapes · 0 échec · 362 clics**, **231 stations figées vérifiées**, visuel **312 vues · 0
défaut**. `EXIT=0`, `pipefail` actif. R44 (`docs/SEMEUR_VS_CHEMIN.md`) inchangé à **83 objets · 16
DÉCOR · 26 non prouvé · 41 prouvé** — attendu : cette tranche affine l'affichage de chemins déjà
prouvés, elle n'en sème ni n'en prouve aucun nouveau.

## Lot 4, tranche 3 : la création de dossier de bout en bout, jusqu'ici décor (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, ligne 261-262 (Lot 4, Partie D.6,
« les écrans qui manquent : re-tirage avec sa règle, déplanification, **création de dossier de
bout en bout** »). Contrairement aux deux tranches précédentes, AUCUN code métier n'est modifié
ici : les deux gestes réels existaient déjà, testés en unitaire, mais qu'aucune station de
`scripts/clics/scenario.ts` n'avait jamais empruntés — même famille que R56/R57 du Lot 3.*

**Recherche d'abord** (agent dédié) : `docs/instantanes/registre.ts` (le fichier source qui
engendre `SEMEUR_VS_CHEMIN.md`) portait déjà deux décors précisément identifiés — `poserJalon`
(poser la date d'un jalon d'acceptation, `acceptance/actions.ts:53-60`) et
`independence_declaration` posée par le workflow humain réel (`/eng/[id]/team`, six formulaires,
`team.ts`) — tous deux `non_prouve` : le chemin existe, personne ne le clique. Ni
`BACKLOG_REPORTE.md` ni `fils.json` ne portaient de fil sur ce sujet — un manque neuf, consigné
ici pour la première fois.

**Ce qui a changé, uniquement le harnais et le registre de preuve :**
- `scenario.ts`, station EXISTANTE `jalons` — un bloc nouveau AVANT la boucle `markDone` : pose
  une date NEUVE (le lendemain de l'échéance actuelle) sur le premier jalon non dérivé via
  `jalonAction`, vérifie que la colonne « échéance » affiche vraiment la nouvelle date.
- `scenario.ts`, station NEUVE `équipe et indépendance` — insérée juste après `acceptation du
  dossier neuf` (avant l'import du grand livre définitif) : révise MA déclaration (Claire,
  l'associée, identité active à ce point du parcours) avec un motif écrit, répond à CHAQUE
  rubrique une par une (même idiome que la boucle du questionnaire résiduel), signe, puis
  RÉAFFECTE Claire elle-même — le geste réel d'`assignMember`, idempotent.
- `semeur/registre.ts` — les deux entrées passent de `non_prouve` à `prouve`, citant les lignes
  réelles de `scenario.ts`.

**Deux défauts RÉELS trouvés et corrigés en construisant la station, ni l'un ni l'autre dans le
produit** (règle 18 : chacun prouvé station par station, pas supposé) :
1. Le `<details>` contenant le tableau des jalons se referme au rechargement de la page
   (`revalidatePath`+`redirect`, pas d'état persisté) — le premier essai lisait `innerText()`
   SANS le rouvrir : la date était bien posée en base, seulement invisible, faux échec.
   Diagnostiqué avec une sonde jetable (supprimée) qui a prouvé, en base fraîche, que la mise à
   jour fonctionnait réellement. Corrigé en rouvrant le repli avant de lire.
2. Le formulaire d'affectation soumis avec ses valeurs PAR DÉFAUT (`eng_role="staff"`, case
   `can_sign` décochée) avait RÉÉCRIT Claire — l'associée réelle, `partner`/`can_sign=true`
   (`seed.ts:171`) — en simple staff sans droit de visa (`assignMember` fait un UPDATE
   inconditionnel de ces deux champs, `team.ts:422-427`) : six stations plus loin dans le MÊME
   parcours cassaient en cascade (ordre des visas, clôture des notes par un non-auteur, ordre
   des copies de réunion). Corrigé en sélectionnant explicitement son vrai rôle et en cochant sa
   vraie permission — un vrai no-op fonctionnel, pas une corruption silencieuse.

**Vérifié au clic réel, deux passages complets** (`db:reset && demo:seed` entre chacun) : le
premier a révélé le défaut 1 (station jalons ÉCHEC) ; corrigé, le second a révélé le défaut 2
(6 échecs en cascade) ; corrigé, le troisième : **232 étapes conduites · 0 échec · 362 clics sur
48 gestes**, aucune station figée manquante. Les 5 stations neuves figées (`npm run clics --
figer`, base réamorcée) : 231 stations désormais figées.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30) — convergents, aucun défaut
fonctionnel trouvé, seulement des citations de lignes périmées dans `registre.ts` (le code avait
légèrement bougé entre la rédaction et la revue) :
- **Voix 1** — 6 constats, dont la confirmation par lecture du SQL que `entered_on` (laissé vide
  dans le formulaire d'affectation) ne risquait AUCUNE écrasement (`coalesce($4, entered_on)`,
  contrairement à `eng_role`/`can_sign` qui n'ont pas ce garde) ; la méthode ne porte que 8
  rubriques, la boucle à 30 tours a une marge large. **Verdict : SHIP WITH MINOR FIXES.**
- **Voix 2** — son premier passage s'est arrêté avant de rendre un rapport (tour interrompu en
  attendant son propre `npm run clics`, relancé et terminé proprement sur demande) ; confirmé par
  lecture que `eng`/`engNeuf` ne sont jamais confondus, qu'`openDeclaration` ne copie jamais les
  réponses précédentes (`answers jsonb not null default '{}'::jsonb`, migration
  0011_team_independence.sql), et que le garde `total > 0` protège bien contre le cas limite d'un
  compte lu avant stabilisation de la page. **Verdict : SHIP WITH MINOR FIXES.**

**Corrigé** : les deux citations de `registre.ts` (`3190-3218` → `3195-3251` pour la station
jalons ; `515-580` → `515-591` pour la station équipe), recalculées en relisant le fichier réel
après tous les correctifs. tsc revérifié propre.

**R58 enregistré — un flake intermittent croisé en chemin, distinct de cette tranche.** Trois des
cinq passages complets de `npm run verify` ont vu `tests/screens.test.ts` faire tomber le
serveur, à une route DIFFÉRENTE à chaque fois (`/eng/[id]/loop` (SOX) route 69,
`/eng/[id]/workpapers` (SOX) route 86, `/eng/[id]/testing` route 46) — symptôme distinct du #418
(le processus meurt, ce n'est pas une erreur d'hydratation). Rien dans le diff de cette tranche
ne peut l'expliquer (aucun des deux fichiers touchés n'est importé par le runtime). Deux
ré-exécutions ISOLÉES du même test ont toujours réussi. En creusant : un processus PARASITE
tournait depuis TROIS HEURES en arrière-plan — une boucle d'attente active sans `sleep`,
orpheline d'un sous-agent de revue hostile de la tranche 2 (son propre fichier cible portait
déjà, depuis longtemps, le contenu que sa condition de sortie attendait : une boucle cassée, pas
lente). Tuée, le passage suivant est passé 907/907. **Corrélation mesurée, causalité NON
prouvée** (règle 18) — R58 le dit tel quel, sans surclasser une hypothèse forte en diagnostic.
Découverte annexe et réelle, corrigée dans le même geste : la forme opérative de la règle 35
(CLAUDE.md) manquait `set -o pipefail` — `EXIT=$?` après `| tee` reflétait `tee`, pas
`npm run verify`, masquant un rouge réel (prouvé en local : `bash -c 'exit 42' | tee f; echo $?`
rend `0` sans `pipefail`, `42` avec). Corrigé dans CLAUDE.md.

**Chaîne verify complète, arbre gelé, cinquième passage — le premier propre après le nettoyage**
(règle 34/35 forme opérative CORRIGÉE, `set -o pipefail` + `timeout 3600`,
`verify-lot4-tranche3-attempt5.log`) : tsc propre, vitest **907/907** (112/112 fichiers, 456.06 s),
gardes 43, plancher 907 collectés · 632 · aucune forme éteinte/isolée, langue 0 hors catalogue ·
0 en dur · 39 différés · 45 exclues · 14 refus documentés, langue:épreuve 15/15, lectures 0
perdue sur 1716 chemins figés dans 86 écrans, lectures:épreuve 6/6, parcours **276 déclarées ·
276 figées · 0 perdue** (+5 par rapport à la fin de tranche 2), parcours:épreuve 5/5, screens 87
routes · 0 échec, fumee 51 routes · 0 échec, densite 77 écrans · 0 dépassement · 108 champs,
clics **232 étapes · 0 échec · 362 clics sur 48 gestes** (231 stations figées vérifiées),
visuel 312 vues · 0 défaut.

**Deux décors de plus deviennent des chemins prouvés.** Suite du Lot 4 : tranche 4, les six
vérifications D.6 (épreuve de l'épure, mécanisée), chacune née en avertissement avec sa propre
fixture de faux positif (règle 25).

## Lot 4, tranche 2 : R34 (le prédicat de travail) et R30 partiel (l'avertissement de re-tirage) (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, ligne 261-262 (Lot 4, Partie D.6,
« re-tirage avec sa règle ») ; `docs/MANDATS/2026-09-07_permission_de_nuit.md`, point 2. Deux
fils fermés dans `docs/BACKLOG_REPORTE.md`/`docs/instantanes/fils.json` : **R34** (le prédicat
de « travail » de `lignesSortiesDuTirage` ignorait `verification_check` et `wp_extra_cell`) et
**R30 PARTIEL** (le silence d'un dossier ré-importé jamais re-tiré, désormais un avertissement —
la RÈGLE elle-même, forcer ou non un re-tirage, reste ouverte pour le fondateur).*

**Recherche d'abord** (agent dédié, `sampling.ts`/`obstacles.ts`/ADR-016 lus en entier) :
R30 offrait trois options — (a) un avertissement non bloquant, réversible, sans nouvelle
sémantique métier ; (b) un choix binaire explicite au moment du ré-import, tranchant la méthode ;
(c) bloquer systématiquement, contredisant le parcours de démonstration existant. Seule (a) est
livrable par une session seule : (b) répond à une vraie question d'audit (« le rapprochement
re-exécuté suffit-il ? », `docs/DECISIONS.md:3278-3287`) que le registre nomme trois fois
« à trancher avec un auditeur » — même gabarit que R39/DA-33. **Cette tranche ne livre que (a)
et R34 ; R30 reste ouverte, explicitement, pour la question de méthode.**

**Ce qui a changé :**
- `sampling.ts::lignesSortiesDuTirage` — deux `exists()` de plus (`verification_check`,
  `wp_extra_cell`), `LigneSortie.travail` gagne `verifs`/`extras`. Un test « portait déjà
  souvent une pièce » a montré qu'aucune ligne « sans travail » n'existe naturellement dans la
  fixture de `retirage.test.ts` : les deux cas connus mauvais de R34 PLANTENT une ligne
  synthétique (comme « un AUTRE tirage courant » le fait déjà pour une autre garde).
  `verification_check` s'est révélée être une table **APPEND-ONLY** (déclencheur SQL,
  0003_infra.sql, même discipline que `event_log` — règle 3) : la découvrir en pratique a fait
  échouer trois tests en cascade (transaction PGlite avortée par un `DELETE` refusé) avant
  d'être comprise et contournée — le test correspondant ne nettoie rien, il est placé EN DERNIER
  dans le fichier pour ne fausser aucun compte mesuré plus haut.
- `sampling.ts::lignesSuperseesSansRetirage` (nouvelle) — le miroir non bloquant de
  `lignesSortiesDuTirage` : les procédures SANS tirage courant dont la dernière sélection
  `superseded` porte du travail, jamais bloquant, jamais une décision sur R30.
- `obstacles.ts::avertissementsAuVisa` — gagne un second cas (famille `tirage`, motif
  `obst.ligneSuperseeSansRetirage`), affiché sur l'écran EXISTANT `/eng/[id]/obstacles`
  (panneau « avertissements », déjà clické — aucun écran neuf, rule 8).
- `/api/sante` — nouvelle lecture « travail non re-tiré après ré-import (R30, Lot 4 tranche 2) » :
  vérifie qu'aucune ligne n'est comptée à la fois comme obstacle bloquant ET avertissement
  (invariant garanti PAR CONSTRUCTION du scoping procédure, pas par une donnée — nommé
  explicitement, règle 19), puis rend le compte d'avertissements.
- `catalogue.ts` — nouvelle clé `obst.ligneSuperseeSansRetirage` ; `samp.sortiesPorte` et
  `obst.ligneSortieDuTirage` étendues avec `{verifs}`/`{extras}`.
- `sampling/page.tsx` — l'appel existant à `samp.sortiesPorte` passe les deux variables neuves.
- `retirage.test.ts` — 4 tests neufs : 2 cas connus mauvais R34 (verification_check,
  wp_extra_cell), 1 test R30 (bascule temporaire + `avertissementsAuVisa` + `obstaclesAuVisa` +
  appel RÉEL à `GET()` de `/api/sante`), 1 FAUX POSITIF (tirage courant existant → silence).

**Vérifié au clic réel, un écran EXISTANT, pas neuf** (règle 10) : script jetable (supprimé)
plantant une procédure/sample/sample_item synthétiques sur le dossier servi par `npm run dev`,
cookie `otto_user` posé directement (comme `clics` le fait), capture Playwright de
`/eng/<id>/obstacles` — le nouvel avertissement rend avec le bon texte interpolé (« Line
FF2025-0001 carries work (0 document(s), 1 exception(s), 0 cell(s), 0 check(s), 0 added
column(s)) on a superseded selection that was never re-drawn… ») dans le panneau « Not
blocking, but worth seeing », lien « Go and clear it » fonctionnel, absent du compte
d'obstacles bloquants en haut d'écran.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30), chacun exécutant réellement le
code et mutant adversairement — **convergents sur le même constat réel** :
- **Voix 1** — 10 constats confirmés par exécution (mutuelle exclusivité du scoping vérifiée par
  lecture, tsc propre, 3 mutations adversariales dont deux détectées et revertées exactement).
  **MUT-02** : la clause `si.id not in (select repris_de from sample_item…)` de
  `lignesSuperseesSansRetirage` n'était couverte par AUCUN test — 19/19 restaient verts après
  l'avoir retirée. **Verdict : SHIP WITH MINOR FIXES.**
- **Voix 2** — même constat sous un angle différent (A : la sous-requête `repris_de` n'était pas
  scopée par dossier — risque théorique avec des UUID v4, mais un vrai défaut de défense en
  profondeur) plus B : le test R30 n'éprouve la garde de recoupement de `/api/sante` que dans un
  état où sa clause est vacueusement satisfaite — la mutation ne rougit RÉELLEMENT que dans
  l'état NORMAL (nouveau=drawn), jamais exercé par un test avant cette revue. Un flake à un seul
  échantillon signalé (règle 18 : vu une fois, non reproduit sur 10 relances, non expliqué, non
  traité comme un défaut prouvé). **Verdict : SHIP WITH MINOR FIXES.**

**Corrigé, les trois** : (1) la sous-requête `repris_de` scopée par `engagement_id` ; (2) le test
R30 étendu pour prouver que la ligne d'`ancien` REPRISE par `nouveau` n'apparaît PAS parmi les
avertissements — **auto-vérifié après coup** : mutation adversariale de la clause corrigée
(retrait de l'exclusion), confirmé que CETTE assertion précise échoue (`l'exclusion repris_de ne
fait rien…`), revert exact confirmé (diff avant/après byte-identique) ; (3) le test FAUX POSITIF
étend son appel pour invoquer RÉELLEMENT `GET()` dans l'état normal, exerçant enfin la garde de
recoupement là où elle a quelque chose à refuser. tsc et les 19 tests de `retirage.test.ts`
revérifiés verts après chaque correctif, puis 146/146 sur les onze fichiers touchant
`obstacles.ts`/`sampling.ts` ensemble — aucune régression.

**Chaîne verify complète, arbre gelé** (règle 34/35 forme opérative, `timeout 3600` explicite,
`verify-lot4-tranche2.log`) : tsc propre, vitest **907/907** (112/112 fichiers, 526.16 s — quatre
tests de plus que la fin de tranche 1), gardes 43, plancher 907 collectés · 632 · aucune forme
éteinte/isolée, langue 0 hors catalogue · 0 en dur · 39 différés · 45 exclues · 14 refus
documentés, langue:épreuve 15/15, lectures 0 perdue sur 1716 chemins figés dans 86 écrans,
lectures:épreuve 6/6, parcours 271 déclarées · 271 figées · 0 perdue (aucune station clics
neuve cette tranche — l'avertissement R30 vit sur un écran déjà clické), parcours:épreuve 5/5,
screens 87 routes · 0 échec, fumee 51 routes · 0 échec, densite 77 écrans · 0 dépassement ·
108 champs, clics 227 étapes · 0 échec · 348 clics sur 47 gestes (226 stations figées
vérifiées), visuel 312 vues · 0 défaut.

**R34 fermé.** R30 reste OUVERT pour le fondateur (la règle de méthode, pas le silence). Suite
du Lot 4 : tranche 3 (création de dossier de bout en bout), tranche 4 (les six vérifications
D.6, chacune née en avertissement avec sa fixture de faux positif, règle 25).

## Lot 4, tranche 1 : la déplanification d'une procédure (2026-09-08)

*Mandat : `docs/MANDATS/2026-09-05_plan_autonomie_complet.md`, ligne 261-262 (« Lot 4 — L'épure
(Partie D.6) et les écrans qui manquent : re-tirage avec sa règle, **déplanification d'une
procédure**, création de dossier de bout en bout. ») ; `docs/MANDATS/2026-09-07_permission_de_nuit.md`,
point 2 (« Continue through the plan without waiting for me… then Lot 4. »). Première tranche du
Lot 4 : un auditeur peut désormais annuler la planification d'une procédure — ce n'est plus
seulement le risque qui décide, c'est un humain — SANS jamais effacer le travail déjà fait
(règle 28) : la ligne reste visible, avec qui/quand/motif, son papier, ses visas, ses pièces,
toujours atteignables. Aucun contenu de procédure neuf, aucun poste neuf (règle 8/14).*

**Ce qui a changé :**
- `supabase/migrations/0147_deplanification.sql` (nouvelle) — trois colonnes nullables sur
  `procedure_instance` (`deplanned_at`, `deplanned_by`, `deplanned_motif`), délibérément SANS
  contrainte CHECK forçant « les deux ou aucun » — la garde de cohérence vit dans la lecture
  `/api/sante` (règle 17 : un instrument testé contre un cas connu mauvais, pas une contrainte
  qui empêcherait même le cas de se produire pour l'éprouver).
- `programme.ts` — `deplanifierProcedure({procedureId, userId, motif?})` : refuse **PROG-07**
  (papier visé sans motif écrit — même garde `dejaVise` que PROG-06, caractère pour caractère) et
  **PROG-08** (déjà déplanifiée — nomme qui et quand, même idiome que TIRAGE-04 dans
  `sampling.ts`). `proceduresDeplanifiees(engagementId, fsliCode)` (nouvelle). `proceduresPlanifiees`
  exclut désormais les lignes déplanifiées ; `planifierProcedure` fait de même dans son test
  d'idempotence — REPLANIFIER crée une ligne NEUVE, jamais une réanimation de l'ancienne :
  l'ancienne reste un témoin honnête (même discipline que le re-tirage, ADR-133).
- `/api/sante` — nouvelle lecture « déplanification cohérente (Lot 4, tranche 1) » : compte les
  lignes où `deplanned_at`/`deplanned_by` sont posés l'un sans l'autre et LÈVE (HTTP 500 sur toute
  la route) si ce compte est non nul ; sinon rend le compte de lignes déplanifiées, ou « aucune
  procédure déplanifiée encore ». Nomme sa propre limite (règle 19) : elle ne dit rien de
  `deplanned_motif`, nullable même en succès (PROG-07 ne l'exige que si le papier était visé).
- `programme/page.tsx` — bouton « Déplanifier » par ligne planifiée (motif visible seulement si
  la ligne est visée, jamais `required` côté navigateur — PROG-07 est un refus SERVEUR, ADR-091),
  et un panneau listant les lignes déplanifiées (qui, quand, motif, lien vers le papier).
- `catalogue.ts` — 5 clés `prog.deplanifier*` ; réutilise `prog.motifVisa` pour le champ motif
  plutôt que d'en dupliquer un.
- `programme-vue.test.ts` — 3 tests neufs (bonheur : ligne redevient planifiable, replanifier crée
  une ligne neuve ; PROG-07 avec/sans motif ; PROG-08 nommant qui/quand).
- `deplanification-lecture.test.ts` (nouveau) — 3 tests dont un CAS CONNU MAUVAIS (règle 17) :
  écriture directe en base de `deplanned_at` sans `deplanned_by`, confirmé faire rougir
  `/api/sante` en HTTP 500, puis confirmé revert au vert après nettoyage.
- `scripts/clics/scenario.ts` — un geste de déplanification (plante une ligne FRAÎCHE dédiée pour
  éviter une collision d'état avec « rédiger »/PROG-06 plus loin dans la même station) et un
  refus PROG-07 EMPRUNTÉ (même idiome opportuniste que PROG-06 : s'il n'y a aucune ligne visée à
  ce moment précis du parcours, la station n'enregistre aucune assertion, ni ok ni échec — un
  comportement PRÉEXISTANT que PROG-07 imite délibérément, pas un défaut nouveau).

**Un faux départ, corrigé avant toute mesure retenue** : le premier `npm run clics` de la tranche
a tourné sur une base PGlite non réamorcée depuis une activité antérieure de la session (`app/.data`
laissé par un travail précédent) — 66 échecs en cascade (« engagement is locked »), y compris un
HTTP 500 sur `/programme`. Hypothèse (règle 18) : base périmée, pas régression du code neuf.
PROUVÉE en réamorçant (`npm run db:reset && npm run demo:seed`) et en rejouant : **227 étapes
conduites · 0 échec · 348 clics**, aucune station figée manquante, l'HTTP 500 disparu. CLAUDE.md
documente déjà ce piège (§6) ; il n'avait simplement pas été respecté au premier lancement — geste
de l'agent, pas du produit.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30), chacun exécutant réellement le
code et mutant adversairement :
- **Voix 1** — 12 constats (R1-01 à R1-12), tous confirmés par exécution : tsc propre ; 47/47
  tests élargis verts (aucune régression sur Lot 1-3) ; TROIS mutations adversariales (filtre
  `deplanned_at is null` retiré, garde `/api/sante` `<>`→`=`, PROG-08 inversé) chacune détectée
  par les tests puis revertée exactement (`git diff` byte-identique) ; PROG-07/PROG-08 confirmés
  alignés caractère pour caractère avec PROG-06/TIRAGE-04 ; aucune sur-affirmation trouvée.
  **Verdict : SHIP AS-IS.**
- **Voix 2** — conventions du fichier (assertMembre/engagementCtx/logEvent identiques aux
  fonctions voisines), UI (FormData, `null` gardés, route `/workpapers/[wid]` vérifiée réelle),
  cas connu mauvais rejoué et sa garde mutée-puis-restaurée (`md5sum` identique), un test mué
  pour prouver qu'il détecte vraiment sa propre garde et pas une autre. **Constat G1** (mineur,
  non bloquant) : `proceduresDeplanifiees` joignait `app_user` en INNER — un état incohérent
  (`deplanned_by` nul) aurait disparu de CETTE liste EN PLUS de `proceduresPlanifiees`, invisible
  sur tout écran alors que `/api/sante` le voit (règle 13/19). **Corrigé** : LEFT JOIN + repli
  écrit (« compte inconnu — deplanned_by incohérent ») ; tsc et les 30 tests ciblés revérifiés
  verts après correctif. **Constat G2** : un rougissement isolé de PROG-08 observé une fois,
  non reproduit sur 4 relances immédiates ni sur la relance finale — signalé sans diagnostic
  (règle 18), à surveiller, jamais traité comme un défaut prouvé. **Verdict : SHIP WITH MINOR
  FIXES** — appliqué.

**Chaîne verify complète, DEUX passages propres sur arbre gelé** (règle 34/35 forme opérative,
`timeout 3600` explicite) : le premier (`verify-lot4-tranche1-final.log`, après le correctif G1)
— tsc propre, vitest **903/903** (112/112 fichiers, 447.18 s), gardes 43, plancher 903 collectés
· 632 · aucune forme éteinte/isolée, langue 0 hors catalogue · 0 en dur · 39 différés · 45
exclues · 14 refus documentés, langue:épreuve 15/15, lectures 0 perdue sur 1716 chemins figés
dans 86 écrans, lectures:épreuve 6/6, parcours **271 déclarées · 271 figées · 0 perdue**,
parcours:épreuve 5/5, screens 87 routes · 0 échec, fumee 51 routes · 0 échec, densite 77 écrans ·
0 dépassement · 108 champs, clics **227 étapes · 0 échec · 348 clics sur 47 gestes** (garde du
parcours : 226 stations figées VÉRIFIÉES), visuel 312 vues · 0 défaut. Les 2 nouvelles stations
clics ont été figées (`npm run clics -- --figer`, sur base fraîchement réamorcée) entre les deux
passages complets — un premier essai de figeage a été perdu à un redémarrage de conteneur en
cours d'exécution (règle 34 : un run interrompu se dit, ne se cache pas ; aucun fichier n'a été
laissé dans un état partiel — vérifié, `docs/PARCOURS.json` intact) et rejoué proprement depuis
un réamorçage complet.

**Suite** : Lot 4 tranche 2 (re-tirage avec sa règle — R30), tranche 3 (création de dossier de
bout en bout), tranche 4 (les six vérifications D.6, chacune née en avertissement avec sa
fixture de faux positif, règle 25).

## Lot 2 du plan d'autonomie, étapes 1 et 2 : le détail du compte, puis son rapprochement (2026-09-06)

*Rattrapage règle 5 : ni le commit d'étape 1 (`a46f4f5`) ni ses deux commits de confirmation
(`24a0319`, `a31022f`) n'avaient mis à jour STATUS.md — un manque, corrigé ici dans le même
commit que l'étape 2, pas laissé pour plus tard.*

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas avant cette tranche.** Depuis l'écran
de sondage, demander en un clic le détail du compte d'un poste — la demande client naît PRÉ-REMPLIE,
comptes visés déjà listés — puis, quand le client répond par un fichier, l'IMPORTER : il entre comme
pièce (empreinte, provenance, ADR-107) et se rapproche du grand livre AU CENTIME. Un écart non nul
EXIGE une explication écrite avant que le rapprochement ne se conclue ; une fois conclu, il ne se
réécrit plus en silence.

### Étape 1 — le détail du compte (commit `a46f4f5`, confirmé `24a0319`/`a31022f`)

Le bouton « Demander le détail du compte » dérive ses comptes visés du MÊME mécanisme qui statue le
périmètre (`mapAccount` contre les règles du pack + les surcharges du dossier, via `fsliAccounts`,
réutilisée telle quelle — pas un cycle en dur). Migration 0143 : `request` gagne
`evidence_type_code` et `fsli_code` (nullable, sans FK — même précédent que
`procedure_instance.fsli_code`). Un second passage sur l'écran offre le lien vers la demande plutôt
qu'un second bouton. Sous-agent hostile (règle 24, deux voix par constat, règle 30) : quatre
constats retenus et corrigés avant le commit, dont le refus « poste vide » jamais exercé par son
propre test (il ne couvrait que l'autre garde, « poste inconnu »). **Chaîne verify complète sur
`a46f4f5`** (`24a0319`) : vitest 852/852 (100 fichiers), gardes 43, semeur 83/16/28/39 (inchangé),
plancher 632, langue 0/0 + épreuve 15/15, lectures 0 perdue/1681 + épreuve 6/6, parcours 246/246
(+2) + épreuve 5/5, screens 87/0, fumee 51/0, densite 77 écrans/0, clics 204 étapes/0 échec (+2),
visuel 312 vues/0 défaut. **SHA servi confirmé = `24a0319`** (CI `deploye`, run 34040786493,
14:57:56Z→15:01:22Z, 3 min 26).

### Étape 2 — le rapprochement

Même mécanique que les balances auxiliaires (ADR-107) : le détail que le client fournit (CSV
« référence ; libellé ; montant ») entre comme pièce puis se rapproche du grand livre — calculé,
jamais stocké tel quel (`attenduGlPourPoste`, dérivé de `fsliAccounts`, comme le reste du dossier).
Migration 0144 : `account_detail_import` (une ligne par import, verrou d'engagement + RLS — trouvé
manquant PAR la chaîne verify elle-même, pas par la revue hostile, corrigé avant le commit) et
`account_detail_row` (sans son propre verrou, même précédent que `aux_balance_row` : la protection
vient du parent, la ligne n'a pas `engagement_id`). Deux refus nommés : **POP-02**, un écart non nul
exige une explication d'au moins dix caractères (règle EXACTE de
`circularisations.ts::expliquerEcart`, pas une liste de mots interdits — la revue hostile a prouvé
par mutation qu'un motif comme « - » ou « n/a » passait une première version qui prétendait
reprendre « même refus, mêmes mots » sans en reprendre la RÈGLE) ; **POP-03**, un rapprochement déjà
conclu ne se réécrit pas en silence (règle 28 — prouvé par mutation qu'un second appel écrasait
l'explication de la première personne sans refus).

**Revue hostile en deux couches** : ma propre relecture, puis un atelier dédié (deux réviseurs
indépendants + vérification adverse par constat, treize sous-agents) — six défauts réels et
CONFIRMÉS, tous corrigés avant ce commit : POP-02 trop faible (ci-dessus), POP-03 absent (un
rapprochement se réécrivait sans refus), le séparateur de milliers français (espace insécable
U+00A0 / U+202F selon la version d'ICU — même famille que D-J3N-11) non lu par le parseur de
montants, `ecart_explication` stockée `''` au lieu de `null` sur un écart nul, l'import
ligne-mère + lignes hors transaction (un échec à mi-boucle laissait la ligne-mère affirmer un compte
que la base ne portait pas — enveloppé dans `tx()`), et l'étanchéité inter-cabinets vérifiée APRÈS
une lecture directe au lieu d'avant (`assertMembreDe` enregistré dans `membre.ts`, appelé en
premier — trouvé par `etancheite-executee.test.ts`).

**Trouvé en clôturant, pas dans le rapprochement lui-même** : `verify-full-9.log` portait deux
nouvelles occurrences du #418 (fil n°7), sur des pages que cette tranche ne touche pas. La première
rejoue l'hypothèse H telle quelle (F4/F9). La seconde a été creusée plus loin qu'un simple
classement : ses 16 « divergences » se sont prouvées, par exécution directe dans le Chromium de ce
bac à sable, être une SIXIÈME famille de bruit du comparateur d'hydratation — le navigateur
re-sérialise `style="flex:1"` en `style="flex: 1 1 0%"` (et ajoute l'unité aux longueurs à zéro)
quand React affecte `style` par programme, et `hydratation.ts` ne le canonise pas. Une fois ce bruit
écarté à la main, l'incident ne porte plus aucune divergence réelle. Consigné **F11**
(`docs/CHASSE.md`), reporté **R45** (`docs/BACKLOG_REPORTE.md`) — pas corrigé ici, hors mandat de
cette tranche (même discipline que F9/F10 : ne pas rouvrir le fil #418 au milieu d'une autre
tranche). Le garde du registre des fils (`scripts/reprise.test.ts`) a lui-même rougi une première
fois sur ce nouveau R45 sans état dans `docs/instantanes/fils.json` — la garde a fait son travail,
l'entrée manquante a été ajoutée.

**Chaîne verify complète, propre, sur la tranche entière** (`verify-full-12.log`, après avoir figé
les trois stations nouvelles du parcours) : vitest **856/856** (101 fichiers), gardes 43, semeur
**83/16/28/39 (inchangé — le détail importé et son rapprochement sont créés par un geste RÉEL de
l'auditeur/du client, jamais par le semeur : ils n'entrent pas dans ce registre)**, plancher 632,
langue 0/0 + épreuve 15/15, lectures 0 perdue/1681 + épreuve 6/6, parcours **249/249, 0 perdue**
(+3 : les deux stations du rapprochement, plus le refus POP-02) + épreuve 5/5, screens 87/0,
fumee 51/0, densite 77 écrans/0, clics **207 étapes/0 échec** (+3), sonde d'hydratation **aucun
incident**, visuel 312 vues/0 défaut.

**Lectures ajoutées à `/api/sante` le jour même** : « détail du compte (plan d'autonomie, étape 1) »
et « détail du compte : rapprochement (plan d'autonomie, étape 2) » — chacune vérifiée capable de
ROUGIR sur l'état qu'elle surveille (règle 22), par une sonde jetable supprimée avant ce commit
(règle 24).

**Ce qui reste dû, dit et pas caché** : POP-01 (« on ne tire pas sur une population qui n'est pas
rapprochée ») n'est pas câblé — le tirage du chiffre d'affaires actuel n'est pas touché ; il
appartient au jour où l'étape 4 (le tirage) reconstruit ce geste. La population DÉRIVÉE (étape 3)
n'est pas construite non plus : ces deux tables (import, lignes) suffisent à la lire le jour venu,
rien n'est dupliqué par avance. Les deux ajouts du fondateur au plan (obligations du dossier, N-1
contextuel — `docs/REGISTRE_IDEES.md` I-1/I-2) restent enregistrés, pas commencés.

## Incident : cinq déploiements en ERROR — une méthode publiée périmée par évolution du schéma (2026-09-07)

*Signalé par le fondateur, qui a mesuré ce que ce bac à sable ne pouvait pas voir seul (§7 :
aucun accès direct à `*.vercel.app`) : cinq déploiements Vercel en `ERROR`, ~25 s chacun contre
~100-200 s pour tout build vert précédent — premier commit touché : `3521f06` (« Lot 3, tranche 1
: la nature du test »), puis `f8e1207`, `6637883`, en Production ET Preview. Le dernier
déploiement VERT restait `02b5037` (« Update CLAUDE.md », poussé par le fondateur en direct
pendant la session).*

**Mesuré, pas théorisé (le journal de build de `dpl_DKFbMaPBVCPyqHfHVSH67p869ymD`, commit
`3521f06`, via l'outil Vercel de la session) :**
```
10:51:03  base : le pooler … a RÉPONDU et ne connaît pas ce locataire. Nouvelle tentative…
10:51:05  CATALOGUE INVALIDE :
10:51:05    procédure RAPPRO : champ « nature » manquant
            … (56 procédures, toutes)
10:51:05  Error: Command "cd app && npm run deploy:reconstruire && npx next build" exited with 1
```
Le fichier commité, vérifié par `git show 3521f06:methodology/procedures.json`, porte bien
`nature` sur ses 56 procédures — 0 manquant. Le crash ne vient donc PAS du fichier poussé.

**Cause réelle** : `catalogueDeLaMission`/`catalogueParId` (`depot.ts`) ne lisent JAMAIS
`methodology/procedures.json` du dépôt à l'exécution — ils lisent le contenu JSONB PUBLIÉ dans
`firm_methodology.content`, et le REVALIDENT à chaque chargement, par conception (« le produit
évolue » — le commentaire du fichier le disait déjà). Le monde de démonstration réseau a été semé
un jour ancien, avant que `nature` existe : sa ligne `firm_methodology` (id fixe
`IDS.methodology`, posée par `bootstrapNep`) porte encore l'ANCIEN contenu. `deploy:reconstruire`,
sur une base DÉJÀ SEMÉE (la branche normale de tout déploiement depuis le semis initial), ne
republie jamais la méthode — il ne fait que `migrate()` (SQL) puis `enrichirMondeDemo()`, et
c'est CE DERNIER qui charge le catalogue et fait tomber tout le build en ajoutant `nature` comme
champ REQUIS à `methodology/schema.json`. Un changement de schéma, sans aucun changement de
données, a suffi à rendre invalide une méthode déjà publiée — jamais testé localement, parce que
`npm run db:reset` part TOUJOURS d'une base vide (la branche « monde reconstruit », qui republie
la méthode fraîche) : la branche « déjà semé » de `deploy:reconstruire` n'était exercée par AUCUN
harnais, seulement par un vrai déploiement Vercel sur la base réseau existante.

Un second symptôme, lisible directement sur `/api/sante` (outil Vercel `web_fetch_vercel_url`,
le bac à sable ne pouvant `curl` `*.vercel.app`) : le déploiement `02b5037`, resté servi (Vercel
ne bascule jamais l'alias sur un build en erreur), répondait HTTP 500 — mais avec `sha` et
`shaExecution` COHÉRENTS, tous deux `02b5037` (`identiteCoherente: true` : pas de défaut F1 ici,
la mesure du SHA servi n'a jamais menti). Le 500 venait d'une lecture RÉELLEMENT rouge :
« instantané du monde de démonstration » — « instantané périmé : table « procedure_instance » :
colonnes différentes depuis l'instantané ». La migration 0146 (`procedure_instance.nature`) AVAIT
été appliquée par le `migrate()` du build cassé, avant qu'il ne tombe sur le catalogue — la base
réseau portait donc la nouvelle colonne, mais le figeage du monde (`instantanerLeMonde`, plus loin
dans le même script, jamais atteint) n'avait pas pu se reprendre. La lecture a fait exactement ce
qu'elle doit faire (règle 22) : rougir sur un vrai décalage, pas un décor.

**Le poller CI (`scripts/deploiement/atteint.ts`) mesurait la bonne URL** (l'alias de production,
confirmé en interrogeant `https://otto-dit.vercel.app/api/sante` directement) : ce n'est pas
l'hypothèse (a) du fondateur (une URL de déploiement plutôt que l'alias) qui tenait. C'est un
mélange de (b) restreint à un seul rouage : la mesure du SHA lui-même n'a jamais menti, mais la
lecture « instantané » a HTTP-500 la mesure entière — le poller journalise alors "servi (aucun)"
faute de SHA lisible sur une réponse non-200, ce qui est correct pour son but (« le SHA poussé
sert-il un 200 ? ») mais masque, dans son propre journal, qu'un SHA ÉTAIT bien servi, juste en
échec de santé.

**Le correctif, MINIMAL, dans `deploy:reconstruire.ts`** (branche « déjà semé » uniquement — la
branche « monde reconstruit » republie déjà la méthode fraîche, donc jamais concernée) : après
`migrate()`, chaque ligne de `firm_methodology` est rechargée via `catalogueParId` ; celle qui lève
est REPUBLIÉE (`publierMethodologie`, une ligne NEUVE — jamais une édition, même principe que les
migrations, règle 26) avec le contenu ACTUEL du dépôt, et chaque mission qui la désignait est
REDÉSIGNÉE (`designerMethodologie`) vers la nouvelle ligne — les MÊMES fonctions que l'écran,
aucun second chemin. Ce mécanisme ne touche QUE la base marquée `OTTO_DEMO_PUBLIC` (la garde en
tête du script le vérifie déjà pour tout le fichier) : une méthode de cabinet réel resterait
gouvernée par l'immutabilité stricte que ce même fichier documente depuis toujours.

**Cas connu mauvais, règle 17** (`scripts/deploy/reconstruire-methodologie-perimee.test.ts`,
nouveau) : reproduit l'incident EXACT en base fraîche — une méthode publiée dont le contenu
`procedures.json` perd `nature` sur chaque procédure — et prouve (1) que `catalogueParId` lève
bien « CATALOGUE INVALIDE … champ « nature » manquant » dessus, PUIS (2) que la même séquence que
le correctif répare : republication, redésignation, le catalogue charge de nouveau, ET la ligne
périmée reste intacte (jamais éditée). C'est « la lecture qui aurait attrapé ça » que le mandat
demandait : rien, localement, n'exerçait jusqu'ici la branche « déjà semé » de
`deploy:reconstruire` — ce test le fait maintenant, sans réseau (PGlite).

**Vérifié avant ce commit** : `npx tsc --noEmit` propre, `npx vitest run` **881/881** (108
fichiers, +2 : le nouveau fichier de test), `npm run gardes` (43 gardes, inchangé), `npm run
plancher` (881 collectés, plancher 632, rien d'éteint). **Non exécutées ici, par urgence
d'incident** (règle 21, nommées, pas tues) : `langue`, `lectures`, `parcours`, `screens`, `fumee`,
`densite`, `clics`, `visuel` — ce correctif ne touche aucun écran ni aucune route ; la chaîne
complète suit dès que le déploiement est confirmé reparti, avant toute reprise de Lot 3.

**Le déploiement `daf18e0` (le correctif ci-dessus) est allé READY** (mesuré via l'outil Vercel de
la session : `list_deployments`, les deux déploiements — Production et Preview — READY). `npm run
reprise`-style, mesuré en direct sur `/api/sante` (`web_fetch_vercel_url`, le bac à sable ne
pouvant `curl` `*.vercel.app`) : `sha`/`shaExecution`/`identiteCoherente` tous cohérents sur
`daf18e0`, et **« instantané du monde de démonstration » repasse au vert** (« pris le 2026-09-07
11:33:48 ») — confirmant que le correctif ci-dessus laisse désormais le script atteindre le bloc
de figeage qu'il n'atteignait jamais avant. La règle 22 a fait exactement ce qu'elle promet.

**Mais un SECOND défaut, un cran plus bas, s'est révélé au même instant — rougi par la propre
lecture de cette tranche** : « nature du test cohérente avec le catalogue (Lot 3, tranche 1) »,
`ok:false`, « 3 template(s) dont la nature en base diverge du catalogue actuel : RA (base :
« sondage_pieces », catalogue : « revue_analytique_substantive »), RECALC (base :
« sondage_pieces », catalogue : « recalcul_parametre »), SEQ (base : « sondage_pieces »,
catalogue : « test_exhaustif ») ». Cause : la migration 0146 (`alter table procedure_instance add
column nature … not null default 'sondage_pieces'`) a donné cette valeur à TOUTES les lignes déjà
en base au moment de son application — y compris celles dont le template catalogué porte une
AUTRE nature. Un défaut STRUCTUREL de tout `add column … not null default` sur une table déjà
peuplée (pas une erreur de saisie dans 0146, et 0146 n'est PAS réédité, règle 26).

**Second correctif, même commit, même principe** : `deploy:reconstruire.ts` gagne un second bloc,
juste après la republication de méthode, qui recharge le catalogue de chaque mission et RÉALIGNE
toute ligne `procedure_instance` dont la `nature` diverge — sur la base des MÊMES données que la
lecture `/api/sante` compare (`catalogueDeLaMission`, `template_code`), pas une seconde source.
Cas connu mauvais ajouté au même fichier de test : une ligne RA insérée avec la nature par défaut
« sondage_pieces », prouvée réalignée sur « revue_analytique_substantive » par la séquence exacte
du script. `npx tsc --noEmit` propre, `npx vitest run` **882/882** (108 fichiers, +1 test), `npm
run gardes` (43, inchangé), `npm run plancher` (882 collectés, plancher 632).

**Un TROISIÈME défaut, dans une famille différente, signalé par le fondateur — l'alias public
n'est PAS l'alias mesuré en continu.** `abb6b33` (le commit de clôture ci-dessus) a été confirmé
servi par `otto-dit.vercel.app` à 12:32:37Z (CI `deploye`, run 34121489568). Le fondateur a mesuré,
plus tard le même jour, ce même alias servant `ebf34ee…` — un SHA introuvable dans `git log`,
daté du 2026-09-06 18:40:45. Aucun push ni déploiement RÉUSSI n'a eu lieu entre les deux mesures :
rien dans `.github/workflows/verifier.yml` ne se redéclenche sans l'un des deux. `deploye` avait
raison au moment où il regardait — il ne regarde plus jamais après. Confirmé authoritativement (API
Vercel, `get_deployment` sur le nom d'hôte, pas une lecture HTTP passant par un cache) : l'alias
sert de nouveau `abb6b33` au moment de ce constat, depuis un déploiement créé à 16:22Z (le
fondateur a dû le repointer manuellement, un `deploy:reconstruire` normal ne recrée pas de
déploiement sans push). La cause du repointage vers l'ancien SHA reste NON DIAGNOSTIQUÉE — aucun
outil de cette session ne lit le journal d'activité Vercel (rollback, réassignation manuelle,
promotion différée d'un ancien déploiement) ; c'est un fil ouvert, pas une hypothèse retenue
(règle 18).

**Correctif : la même mesure, mais qui ne dépend plus d'un push.** Nouveau travail CI
`alias-suit-production` (`.github/workflows/verifier.yml`), sur horaire (`schedule`, toutes les
30 min) et sur déclenchement manuel — indépendant de `push`/`deployment_status`. Il rejoue
EXACTEMENT la mesure de `deploye` (`scripts/deploiement/atteint.ts`, l'octet réellement servi par
`/api/sante`, jamais un statut Vercel) contre `main` TEL QU'IL EST au moment du sondage
(`git rev-parse HEAD` après un `checkout` frais), pas au moment du dernier push. Aucun code nouveau
dans `atteint.ts` — la mesure elle-même était déjà correcte et déjà éprouvée (règle 17) ; tout ce
que ce travail change est QUAND elle s'exécute. Où il s'arrête, dit dans son en-tête : il ne dit
rien de la santé de ce qui est servi, rien des autres alias (prévisualisation, branches), rien de
la cause d'une dérive — seulement qu'elle existe.

**Éprouvé en le déclenchant à la main (`workflow_dispatch`, run 34144771494) — et il a d'abord
rougi pour une MAUVAISE raison.** Premier essai avec `--minutes=1`, lancé 31 s après le push de ce
correctif lui-même : « ÉCHEC — l'instance sert ENCORE abb6b33 au lieu de 8ceb6a1 » — le déploiement
Vercel du push n'avait simplement pas eu le temps de finir (confirmé quelques minutes plus tard :
`/api/sante` servait bien 8ceb6a1). Une marge d'une minute est plus courte que le temps de
construction NORMAL mesuré tout au long de cette session (100-220 s) — le garde aurait rougi à
chaque push tombant près d'un sondage horaire, pour rien, et une fausse alerte ignorée une fois
cesse d'être regardée (règle 13). Corrigé à `--minutes=5` dans le même commit que ce constat.

## Lot 3, tranche 4 : l'atelier rapprochement — LOT 3 COMPLET (2026-09-07)

*Mandat (`docs/MANDATS/2026-09-05_plan_autonomie.md`, Partie C.1 ligne 240 ; Partie C.3 point 1 :
« Trésorerie — confirmation_externe + rapprochement. Le plus démonstratif après le CA, et les
circularisations existent déjà. ») ; `docs/MANDATS/2026-09-07_permission_de_nuit.md`, point 2 :
« Lot 3 tranche 3 (confirmation_externe, then rapprochement) ». Dernière tranche du Lot 3 : `atelierDeLaNature`
gagne une quatrième case, `rapprochement`+`CASH` → `/circularisations` — LA MÊME URL que la
tranche 3, puisque `circularisations.ts` rend les DEUX natures sur un seul écran (campagne de
confirmation, puis rapprochement dérivé du solde confirmé contre le grand livre, juste en
dessous). Aucun contenu de procédure neuf, aucun poste neuf ouvert (règle 8).*

**Recherche d'abord** : trois candidats pour l'atelier `rapprochement`, un seul retenu.
`app/src/lib/services/reconciliation.ts` (TB↔GL, dossier entier, jamais keyed sur un `fsli.code`)
et `account-detail.ts` (Lot 2, détail de compte rapproché, générique mais câblé aujourd'hui
seulement via REVENUE) ont tous deux été écartés : ni l'un ni l'autre n'est « deux sources / les
deux états » sur un poste précis, la forme que Partie C.1 décrit. Le bon candidat vivait déjà
dans `circularisations.ts` (§5, `rapprochement(engagementId, kind)`, ~ligne 292) : pour
`kind='banque'`, il compare le solde comptable au `montant_confirme` reçu du tiers et calcule
l'écart — exactement la forme mandatée, et déjà câblé sur `CASH`.

**R57 enregistré** (docs/BACKLOG_REPORTE.md, docs/instantanes/fils.json) : sur les neuf
procédures `rapprochement` du catalogue, deux portent `cycle: '*'` (`RAPPRO`, `ANNEXE` — cette
dernière hors du champ de cette fonction) et sept portent un `cycle` qui ne correspond à aucun
`fsli.code` réel — même mécanisme que R54/R56. Fait notable, vérifié : `RAPPRO` N'EST PAS bloqué
comme `CONFIRM` (R56) — `planifierProcedure` ACCEPTERAIT `RAPPRO` sur `CASH` aujourd'hui, par une
bascule de risque ordinaire, exactement comme RECALC (R54). Mais RIEN, ni `bootstrapNep()` ni
`enrichirMondeDemo()`, ne le planifie dans le monde semé — une situation INTERMÉDIAIRE entre
RECALC (planifiable et seedé, seulement absent de `npm run verify`, R55) et CONFIRM (bloqué
structurellement, R56) : planifiable, mais jamais exercé par aucun chemin de ce dépôt
aujourd'hui. La preuve reste donc, comme pour R56, entièrement par cas connu mauvais.

**Ce qui a changé :**
- `programme.ts::atelierDeLaNature` — quatrième case, `rapprochement`+`CASH` → `/circularisations` ;
  docstring réécrite pour couvrir les quatre cases et déclarer le Lot 3 (Partie C.1) COMPLET.
- `programme-vue.test.ts` — le cas `rapprochement`/CASH (attendu `/circularisations`) ajouté ;
  cas null pour les quatre autres natures du Lot 5 sur un poste déjà câblé, en prime.
- `/api/sante` — nouvelle lecture « atelier rapprochement disponible », JUMELLE des deux
  précédentes (CASH), avec le correctif du cas mixte ET la branche négative (`cashVerifie`)
  appliqués DÈS LA PREMIÈRE VERSION — deux corrections que les revues hostiles des tranches 2 et
  3 ont dû ajouter après coup, posées ici d'emblée.
- `atelier-rapprochement-lecture.test.ts` (nouveau) — cinq tests, TOUS à insertion directe en
  base (R57 : aucun chemin seedé, même si la voie réelle accepterait l'état) : vide,
  CASH-avec-atelier + hors-CASH-honnête, branche négative (aucune ligne CASH), cas connu mauvais
  (régression simulée), cas mixte (régression + gap hors-CASH). 24/24 verts, les quatre fichiers
  (recalcul, confirmation, rapprochement, programme-vue) exécutés ENSEMBLE dans le même run —
  aucune fuite d'état entre les trois lectures jumelles (revue hostile, point D). `npx tsc
  --noEmit` propre. Une imprécision arithmétique auto-corrigée avant toute revue hostile
  (« huit » procédures mismatch au lieu de sept — RAPPRO ET ANNEXE portent `cycle: '*'`, pas
  seulement RAPPRO) — recompté par script Python contre `procedures.json`, corrigé dans
  `programme.ts`, `route.ts` et le registre avant de les figer.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30). La prémisse centrale — RAPPRO
échappe-t-il vraiment au blocage structurel de R56 ? — a été PROUVÉE par exécution réelle, deux
fois indépendamment : `planifierProcedure({fsliCode:'CASH', code:'RAPPRO'})` contre une base
seedée par `bootstrapNep()` seul lève en réalité **PROG-03** (« CASH n'est pas retenu au
périmètre »), pas un succès immédiat — les deux réfutateurs l'ont mesuré, pas supposé. Mais les
DEUX ont aussi vérifié que cette nuance était déjà correctement portée dans TOUS les textes sauf
un : `programme.ts`, `route.ts`, `BACKLOG_REPORTE.md` et `fils.json` disent tous « par une
bascule de risque ordinaire », jamais « planifiable sans condition » — seul le nouveau fichier de
test affirmait « rien ne le REFUSE structurellement » sans nommer PROG-03. **Corrigé** (en-tête
de `atelier-rapprochement-lecture.test.ts`, nomme désormais PROG-03 et la confirmation de
périmètre requise). Un second constat, réel et distinct : `scripts/clics/scenario.ts:1000-1001`
portait un commentaire NON MIS À JOUR depuis la tranche 2 (« sondage_pieces et recalcul_parametre
sur REVENUE… les six autres natures ») — avec les quatre natures maintenant câblées
(sondage_pieces, recalcul_parametre, confirmation_externe, rapprochement), il en restait
QUATRE, pas six. **Corrigé.** Un constat de gouvernance, le plus sérieux des trois : `STATUS.md`
citait « permission de nuit du fondateur, §2 » — un mandat RÉEL (reçu en session le 2026-09-07,
déjà exécuté pour fusionner les tranches 2 et 3 vers `main`) mais **jamais commité verbatim**
dans `docs/MANDATS/` avant d'être invoqué, une violation directe de la règle 33 (« un mandat qui
n'est pas dans le dépôt n'existe pas ») — exactement la faute que cette même règle raconte pour
le plan d'autonomie du 2026-09-05. **Corrigé** : `docs/MANDATS/2026-09-07_permission_de_nuit.md`
commité verbatim ; les DEUX citations de `STATUS.md` (celle-ci et celle, déjà poussée sur `main`,
de la tranche 3) réécrites pour nommer le fichier réel plutôt qu'un numéro de section inventé de
mémoire. Rien d'autre trouvé : le lien d'atelier, la lecture `/api/sante` et sa garde
d'honnêteté (prouvée par mutation par les deux réfutateurs), et chaque nombre cité dans
`BACKLOG_REPORTE.md`/`fils.json`/`STATUS.md` ont tenu à l'exécution.

**Chaîne verify complète, propre, arbre GELÉ pendant l'exécution — deuxième passage, propre de
bout en bout** (`verify-lot3-tranche4-run2.log`, sous `timeout 3600` explicite, règle 35 forme
opérative — voir CLAUDE.md) : vitest **897/897** (111/111 fichiers — cinq tests de plus que la
fin de tranche 3 : `atelier-rapprochement-lecture.test.ts`), gardes 43, plancher 897/632, langue
0 hors catalogue · 0 en dur · 39 différés · 45 exclues · 14 refus documentés, langue:épreuve
15/15, lectures 0 perdue sur 1716 chemins figés dans 86 écrans, lectures:épreuve 6/6, parcours
269/269 déclarées et figées · 0 perdue, parcours:épreuve 5/5, screens 87 routes · 0 échec, fumee
51 routes · 0 échec, densite 77 écrans mesurés · 0 au-delà de 5 actions primaires, clics 226
étapes conduites · 0 échec (346 clics sur 47 gestes), visuel 312 vues · 0 défaut. **Premier
passage tué après 9h05 sans progrès** (`verify-lot3-tranche4-run1.log`, arrêté à `clics/run.ts`
avant sa première station, lancé sans budget nommé — voir CLAUDE.md, l'incident qui a produit la
forme opérative de la règle 35) ; le second, sous `timeout 3600`, a terminé en 423.96s
(vitest) + le reste de la chaîne, largement dans la marge.

**Fusionné dans `main`, SHA servi CONFIRMÉ = `fcbedf7` — LOT 3 COMPLET** (mandat de nuit,
`docs/MANDATS/2026-09-07_permission_de_nuit.md`, point 1). Commit unique `fcbedf7` fusionné par
fast-forward (`0e05549..fcbedf7`, aucune divergence — précédé d'une fusion séparée, `0e05549`, le
correctif de la règle 35 lui-même, déjà confirmé servi avant ce push). CI `deploye`, run
`34198346930`, job `101971106290` : `/api/sante` sur `https://otto-dit.vercel.app` sert
`fcbedf7` — le SHA poussé — en 177 s (07:14:41Z→07:17:46Z), six lectures rapprochées avant la
bascule disent toutes « servi 0e05549 » (0 s à 152 s). Les quatre tranches du Lot 3 (Partie C.1
du mandat) sont maintenant toutes en production : `sondage_pieces`/REVENUE (Lot 2),
`recalcul_parametre`/REVENUE, `confirmation_externe`/CASH, `rapprochement`/CASH.

## Lot 3, tranche 3 : l'atelier confirmation_externe (2026-09-07)

*Mandat (`docs/MANDATS/2026-09-05_plan_autonomie.md`, Partie C.1 ligne 240 ; Partie C.3 point 1 :
« Trésorerie — confirmation_externe + rapprochement. Le plus démonstratif après le CA, et les
circularisations existent déjà. ») ; `docs/MANDATS/2026-09-07_permission_de_nuit.md`, point 2 :
« Continue through the plan without waiting for me: Lot 3 tranche 3 (confirmation_externe…) »
— **corrigé après coup** (revue hostile, tranche 4) : ce mandat n'avait pas encore été commité
verbatim au moment où cette phrase a été écrite, une violation de la règle 33 trouvée et fermée
par cette même revue ; il l'est désormais, et cette citation le nomme correctement. La chose plus
petite (règle 8) : `atelierDeLaNature`
gagne une troisième case, `confirmation_externe`+`CASH` → `/circularisations` (déjà construit,
Trésorerie/C.3.1) — aucun contenu de procédure neuf, aucun poste neuf ouvert.*

**Recherche d'abord** (`app/src/lib/services/circularisations.ts`, déjà construit) : le service
importe un listing de tiers, mesure la complétude contre le grand livre, simule l'envoi, dépose la
réponse, dérive le rapprochement — exactement la forme que Partie C.1 décrit pour
`confirmation_externe` (« listing des tiers / réponse du tiers »). `POSTE.banque = 'CASH'` y est
déjà une ligne dédiée, jamais un préfixe français en dur (le fichier le dit lui-même). Contrairement
à `estimations.ts`, la page ne prend AUCUN paramètre par l'URL — un seul écran, deux natures
(`banque`, `avocat`), seule `banque`/`CASH` correspond à `confirmation_externe` sur ce poste ;
`avocat`/`PROVISIONS` entre au Lot 5 avec le poste Provisions (C.3 point 6), pas cette tranche.

**`programme/page.tsx` et `scripts/clics/scenario.ts` étaient DÉJÀ génériques** (tranche 2 les a
construits ainsi) : `atelierDeLaNature(l.nature, poste.code, …)` s'appelle déjà dans les deux
rendus (commandées et hors-commande), et l'assertion clics couvre déjà les deux conteneurs sans
connaître la nature. **Aucune modification d'écran ni de scénario cliqué dans cette tranche** —
seule `programme.ts` (la fonction + son commentaire) change côté produit.

**Un défaut plus sévère que R54, trouvé en recherchant (règle 15, pas un grep — un chemin
réellement emprunté) : R56.** `CONFIRM`, la seule procédure `confirmation_externe` à `cycle: '*'`,
porte un `postes` NON NUL (`CLIENTS`, `TRESO`, `FOURN`, `PROV` — du vocabulaire de cycle, pas de
`fsli.code`) qui ne couvre PAS `CASH`. Contrairement à RECALC (R54 : `postes` nul, donc plannable
sur N'IMPORTE QUEL poste réel), `planifierProcedure` REFUSE (PROG-02) de planifier `CONFIRM` sur
CASH — ou sur AUCUN poste réel du dossier. Conséquence mesurée : **aucune instance
`confirmation_externe` n'existe dans le monde semé, ni par `bootstrapNep()` ni par
`enrichirMondeDemo()`** (vérifié : `lib/flows/enrichir.ts` ne plante que sur REVENUE et
TRADE_RECEIVABLES) — contrairement à RECALC (R55 : présent, seulement caché de `verify`), ici il
n'y a RIEN à rendre visible par AUCUN moyen, ni au clic ni en production. R56 enregistré
(docs/BACKLOG_REPORTE.md, docs/instantanes/fils.json), non corrigé — même discipline que R54
(règle 8/14, contenu de méthode, pas mécanique d'atelier).

**Ce qui a changé :**
- `programme.ts::atelierDeLaNature` — troisième case, `confirmation_externe`+`CASH` →
  `/circularisations` ; commentaire réécrit pour nommer R56 et la limite (aucune instance
  cliquable, preuve par cas connu mauvais seulement).
- `programme-vue.test.ts` — le cas `confirmation_externe`/REVENUE (attendu null) devient
  `confirmation_externe`/CASH (attendu `/circularisations`) ; ajoute PROVISIONS (Lot 5) et
  AUTRE-POSTE comme cas null.
- `/api/sante` — nouvelle lecture « atelier confirmation_externe disponible », JUMELLE de celle de
  la tranche 2 (CASH au lieu de REVENUE), avec le correctif du cas mixte de la revue hostile
  précédente appliqué DÈS LA PREMIÈRE VERSION (le gap hors-CASH calculé avant le `throw`, jamais
  après) — pas redécouvert une seconde fois.
- `atelier-confirmation-lecture.test.ts` (nouveau) — quatre tests, TOUS à insertion directe en
  base (R56 : aucune voie normale n'atteint cet état) : vide, CASH-avec-atelier +
  hors-CASH-honnête, cas connu mauvais (régression CASH simulée par mock ciblé), cas mixte
  (régression + gap hors-CASH simultanés). 4/4 verts, `npx tsc --noEmit` propre.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30). La partie la plus à risque —
la lecture jumelle a-t-elle bien REPORTÉ le correctif du cas mixte trouvé sur `recalcul_parametre`,
au lieu de le redécouvrir — est PROUVÉE, pas relue : les deux réfutateurs ont, indépendamment,
mutation-testé `route.ts` (invalidé le détecteur CASH, confirmé que les tests dédiés rougissent,
restauré l'état exact) et l'un d'eux a exécuté `planifierProcedure({fsliCode:'CASH', code:'CONFIRM'})`
contre une base fraîchement semée pour vérifier PAR L'EXÉCUTION (pas la lecture) que PROG-02 refuse
bien — la prémisse entière de R56 et du choix « insertion directe ». Deux constats réels,
convergents ou complémentaires :
- **Terminologie inexacte, trois occurrences** (`route.ts`, commentaire ; `BACKLOG_REPORTE.md` et
  `fils.json`, R56) : le texte disait que les SIX procédures `confirmation_externe` non-`*`
  portaient un `postes` qui ne correspond à aucun `fsli.code` — en réalité seule `CONFIRM` a un
  champ `postes` ; les six autres sont exclues par leur `cycle`, exactement le mécanisme de R54.
  Aucun impact fonctionnel (le code ne lit jamais ce commentaire), mais une session future cherchant
  à fermer R56 aurait cherché un champ qui n'existe pas sur les six. **Corrigé** dans les trois
  fichiers.
- **Branche négative non prouvée** (trouvé par mutation, PAS par lecture) : aucun test, ici ni sur
  la lecture jumelle déjà EN PRODUCTION (tranche 2), ne construit l'état « des lignes existent,
  AUCUNE sur le poste câblé » — retirer la garde `cashVerifie`/`revenuVerifie` de `route.ts`
  laissait les suites toutes vertes. Un détecteur jamais mis en échec exprès n'a jamais été testé
  (règle 17). **Corrigé dans les DEUX fichiers** — `atelier-confirmation-lecture.test.ts` ET,
  rétroactivement, `atelier-recalcul-lecture.test.ts` (tranche 2, déjà mergée) gagnent chacun un
  test dédié : uniquement une ligne hors-poste, zéro ligne sur le poste câblé, la phrase
  « … toujours avec un atelier réel » doit être ABSENTE. 19/19 tests verts (les 4 nouveaux + 5 sur
  la lecture jumelle + 9 programme-vue + 1 confirmation vide), `npx tsc --noEmit` propre.
- Un nit de clarté (`programme.ts`, docstring) — PROVISIONS EST un `fsli.code` réel
  (`pcg.ts:25`) ; seule sa procédure `confirmation_externe` n'y est pas câblée. La phrase pouvait
  se lire comme si le code lui-même manquait. **Corrigé.**

**Chaîne verify complète, propre, arbre GELÉ pendant l'exécution — premier passage, propre de
bout en bout** (`verify-lot3-tranche3-run1.log`) : vitest **892/892** (110/110 fichiers — six
tests de plus que la fin de tranche 2 : les cinq de `atelier-confirmation-lecture.test.ts` et la
branche négative ajoutée à `atelier-recalcul-lecture.test.ts`), gardes 43, plancher 892/632,
langue 0 hors catalogue · 0 en dur · 39 différés · 45 exclues · 14 refus documentés,
langue:épreuve 15/15, lectures 0 perdue sur 1716 chemins figés dans 86 écrans, lectures:épreuve
6/6, parcours 269/269 déclarées et figées · 0 perdue (aucun renommage de station cette tranche —
`page.tsx`/`scenario.ts` inchangés), parcours:épreuve 5/5, screens 87 routes · 0 échec, fumee 51
routes · 0 échec, densite 77 écrans mesurés · 0 au-delà de 5 actions primaires, clics 226 étapes
conduites · 0 échec (346 clics sur 47 gestes, identique à tranche 2 — aucune station clics
nouvelle, R56 empêche toute preuve au clic), visuel exécuté sans échec. Aucun passage
intermédiaire nécessaire cette fois (contrairement à la tranche 2, quatre passages) : la tranche
ne touche aucun écran ni scénario cliqué, donc aucune des deux classes de défaut qui avaient
rougi trois passages sur cinq n'avait de prise ici.

**Fusionné dans `main`, SHA servi CONFIRMÉ = `961028d`** (mandat de nuit, §1). Commit unique
`961028d` (contenu, revue hostile et verify déjà réunis) fusionné par fast-forward
(`3488742..961028d`, aucune divergence). CI `deploye`, run `34161547633`, job `101864243914` :
`/api/sante` sur `https://otto-dit.vercel.app` sert `961028d` — le SHA poussé — en 203 s
(21:01:09Z→21:04:39Z), huit lectures rapprochées avant la bascule disent toutes « servi 3488742 »
(0 s à 178 s).

## Lot 3, tranche 2 : l'atelier recalcul_parametre (2026-09-07)

*Mandat (`docs/MANDATS/2026-09-05_plan_autonomie.md`, Partie C.1, ligne 240) : « les ateliers de
`recalcul_parametre`, `confirmation_externe`, `rapprochement` ». Cette tranche ne fait que la
première — la chose plus petite (règle 8).*

**Décision de conception, mesurée avant d'être prise.** Recherche préalable (voir R54 plus bas) :
16 procédures du catalogue portent `nature=recalcul_parametre`, mais 14 portent un `cycle`
(`IMMO_COR`, `PERSONNEL`, `PROV`…) qui ne correspond à AUCUN `fsli.code` réel — structurellement
non planifiables, indépendamment de tout atelier. Seule `RECALC` (poste REVENUE, `cycle: '*'`)
est réellement instanciée dans ce dépôt. Un atelier NEUF aurait dupliqué un mécanisme qui existe
déjà et fait exactement ce que Partie C.1 décrit pour cette nature : **les estimations comptables
hors litige** (ADR-106a, `estimations.ts`, `/eng/[id]/estimations`) — fichier de calcul du
client importé comme pièce, rapproché au grand livre, recalculé au centime, base sondée par le
même moteur de tirage, justificatifs de CHAQUE paramètre (et de la formule) demandés en
brouillon. `atelierDeLaNature('recalcul_parametre', 'REVENUE', base)` pointe donc vers
`${base}/estimations` — un lien vers un atelier RÉEL, testé, provenant déjà (ADR-106a), pas un
raccourci.

**Trouvé en conduisant l'écran dans un navigateur (règle 10), pas supposé.** RECALC n'est PAS
dans le tableau « commandées » de `/programme` — elle vit dans le panneau « hors commande »
(REV-05 : planifiée, mais le risque actuel ne la commande plus). `atelierDeLaNature` n'était
appelée QUE dans le rendu des commandées (Lot 3, tranche 1) : sans un second appel dans le rendu
« hors commande », le lien livré cette tranche n'aurait jamais été atteignable au clic —
découvert par une capture d'écran réelle (`npm run demo:enrichir` lancé à la main, cookie de
session posé, clic sur le lien RECALC), pas par lecture de code. `programme/page.tsx` gagne donc
CE second appel, avec le même `data-atelier`/`data-atelier-absent`, et la station clics
« programme de travail » est corrigée pour couvrir LES DEUX conteneurs (`[data-commandees]` ET
`[data-hors-commande]`), pas un seul — la première version de la correction aurait laissé la
garde mesurer à côté du seul cas réel qu'elle existe pour attraper.

**Lecture ajoutée à `/api/sante` le jour même** : « atelier recalcul_parametre disponible » —
pour chaque procédure `recalcul_parametre` RÉELLEMENT planifiée en base, vérifie que
`atelierDeLaNature` résout un atelier pour SON poste précis. Fonction pure, sans état propre —
mais règle 22 ne fait pas d'exception aux fonctions pures : le risque n'est pas dans la fonction,
c'est qu'une procédure planifiée sur REVENUE se retrouve un jour sans atelier (régression du
dispatch pour le seul poste câblé à ce jour). **Réfutation hostile avant livraison** (règle 24) a
trouvé un défaut dans la première version de cette lecture : elle faisait rougir /api/sante ENTIER
(HTTP 500) pour N'IMPORTE QUEL poste `recalcul_parametre` sans atelier — y compris un poste hors
REVENUE (TRADE_RECEIVABLES), un état ATTENDU et déjà consigné (R54/R55 : RECALC est plannable sur
n'importe quel poste dès aujourd'hui via une bascule de risque ordinaire), pas une régression. La
même faute que R53 nomme ailleurs : une garde qui rougit sur un état sanctionné plutôt que sur une
régression réelle. Corrigé : le rouge (throw) ne se déclenche plus QUE si le poste absent
d'atelier est REVENUE ; un gap hors REVENUE est rapporté honnêtement dans le détail, sans bloquer.
Cas connu mauvais (`atelier-recalcul-lecture.test.ts`, trois tests) : (1) RECALC sur REVENUE avec
atelier réel passe ; (2) RECALC sur TRADE_RECEIVABLES (hors REVENUE, sans atelier construit) reste
VERTE, le détail le dit « attendu » ; (3) REVENUE planifié pendant qu'un mock ciblé du seul point
d'appel de `atelierDeLaNature` dans route.ts lui fait renvoyer `null` pour REVENUE fait rougir
/api/sante entier — la régression que cette lecture existe pour attraper, prouvée en la
provoquant, pas en la supposant.

**Deux défauts trouvés en cours de route, enregistrés, non corrigés (hors mandat de cette
tranche, règle 8) :**
- **R54** — 14 des 16 procédures `recalcul_parametre` du catalogue portent un `cycle` qui ne
  correspond à AUCUN `fsli.code` réel du plan de comptes — non planifiables sur un poste réel,
  indépendamment de tout atelier. Seules `RECALC` et `ESTIM` (`cycle: '*'`) échappent au défaut —
  RECALC est la seule des deux réellement INSTANCIÉE dans ce dépôt aujourd'hui, ESTIM reste
  plannable en principe mais n'a jamais été semée. `CONFIRM` (confirmation_externe) porte le même
  vocabulaire pour
  son propre `postes` — même famille, non vérifiée procédure par procédure.
- **R55** — `npm run verify` (donc `clics`/`screens`/`fumee`/`densite`/`visuel` depuis ce bac à
  sable) n'appelle JAMAIS `demo:enrichir` — seuls `npm run demo` et `deploy:reconstruire.ts` (le
  build Vercel) le font. RECALC, la SEULE instance réelle de cette nature, est donc ABSENTE
  pendant `npm run verify` alors qu'elle existe en production — exactement l'avertissement de la
  règle 11 (« une base fraîche et la base de production ne sont pas la même exécution »),
  silencieux jusqu'à cette tranche. Contourné ici par des cas connus mauvais à insertion directe
  (indépendants d'enrichir) et par UNE vérification manuelle au clic — pas par la chaîne
  automatisée, dit explicitement, pas caché.

**Chaîne verify complète, propre, arbre GELÉ pendant l'exécution — quatrième passage, les trois
premiers ont chacun trouvé et fait corriger quelque chose de réel, aucun n'a été poussé** (règle
21, rien n'est caché) :
- Passage 1 (`verify-lot3-tranche2.log`) : `tests/screens.test.ts` en échec sur un timeout de
  navigation (`/eng/[id]/testing`, 30000ms) — 884/885 tests. Rejoué SEUL sur le même arbre gelé,
  sans rien d'autre en cours : vert (390s). Cas connu isolé, non expliqué plus loin (règle 18 :
  hypothèse « surcharge du passage complet », pas un diagnostic) — pas de collision
  PGlite/serveur-dev possible ici, aucun autre processus ne tournait.
- Passage 2 (`verify-lot3-tranche2-run2.log`) : vitest 885/885 propre, puis `npm run parcours` en
  échec ATTENDU — la station de l'atelier hors-commande a changé de libellé cette tranche
  (« une ligne planifiée » → « une ligne planifiée (commandée ou hors commande) »), donc
  « disparue » du gel précédent. Refigé : `npm run parcours -- --figer` ; diff de
  `docs/PARCOURS.json` vérifié à UNE seule ligne (le renommage voulu, rien d'autre).
- Passage 3 (`verify-lot3-tranche2-run3.log`) : vitest 885/885 et parcours propres, mais le
  parcours cliqué a fait rougir une station de la tranche 1 (« chaque procédure commandée affiche
  sa nature ») — « 6 ligne(s) avec une nature affichée sur 7 commandée(s) ». Défaut RÉEL,
  introduit par CETTE tranche : `[data-ligne-programme]` est désormais aussi posé sur les `<li>`
  du panneau « hors commande » (pour y router l'atelier), et cette station de tranche 1 comptait
  `[data-ligne-programme]` SANS le scoper à `[data-commandees]` — elle additionnait donc une ligne
  hors-commande (qui ne porte jamais `data-nature`) au dénominateur d'une station qui n'a rien à
  voir avec elle. Corrigé (`scripts/clics/scenario.ts`, deux stations scopées à
  `[data-commandees] [data-ligne-programme]`) — trouvé PAR la chaîne verify elle-même, pas par
  relecture (règle 15).
- Passage 4 (`verify-lot3-tranche2-run4.log`), propre de bout en bout, SHA 12b214a + tranche
  non commitée : vitest **885/885** (109/109 fichiers), gardes 43, plancher 885/632, langue
  0 hors catalogue · 0 en dur · 39 différés · 45 exclues · 14 refus documentés, langue:épreuve
  15/15, lectures 0 perdue sur 1716 chemins figés dans 86 écrans, lectures:épreuve 6/6, parcours
  269/269 déclarées et figées · 0 perdue, parcours:épreuve 5/5, screens 87 routes · 0 échec, fumee
  51 routes · 0 échec, densite 77 écrans mesurés · 0 au-delà de 5 actions primaires, clics
  226 étapes conduites · 0 échec (346 clics sur 47 gestes), visuel exécuté sans échec.

**Revue hostile, DEUX réfutateurs indépendants** (règle 24/30, sur le diff complet issu du
passage 4) : le détecteur de régression (throw REVENUE-only) et les deux stations de sélecteur
CSS corrigées ont été PROUVÉS, pas relus — chaque réfutateur a, indépendamment, mutation-testé
`route.ts` (inversé la condition REVENUE, confirmé que le test dédié rougit, puis restauré
l'état exact) et re-dérivé les sélecteurs CSS depuis `page.tsx` sans se fier au diff. Un défaut
RÉEL convergent, trouvé indépendamment par les deux voix (règle 30, confirmé par réfutation) :
dans le cas MIXTE (une régression REVENUE et un gap hors REVENUE dans le même dossier), le
message jeté ne nommait QUE la régression REVENUE — le gap hors REVENUE, que l'en-tête de la
lecture affirme pourtant rapporter « honnêtement », disparaissait du message tant que
`horsRevenue` n'était calculé qu'APRÈS le `throw`. Un second défaut mineur, trouvé par un seul
réfutateur (règle 30, jugé seul, non réfuté par le second) : la phrase « REVENUE toujours avec
un atelier réel » s'affichait même quand AUCUNE ligne REVENUE n'existait dans le dossier —
affirmant vérifié ce qui ne l'était pas (règle 13). **Corrigés** (`route.ts` : `horsRevenue`
calculé avant le `throw` et concaténé au message dans les deux issues ; la phrase REVENUE
gardée derrière `rows.some(r => r.fsli_code === 'REVENUE')`) et FIGÉS par un quatrième test
dédié au cas mixte (`atelier-recalcul-lecture.test.ts`, réutilise le même mock ciblé que le cas
connu mauvais) — 4/4 tests verts, `npx tsc --noEmit` propre. Aucun défaut trouvé sur le reste du
diff (sélecteurs CSS, `atelierDeLaNature`, le gating `l.planifiee` côté `page.tsx`, les nombres
de ce document eux-mêmes — tous recroisés contre `docs/PARCOURS.json`, `docs/LECTURES.json`,
`docs/DENSITE.md`, `methodology/procedures.json` par au moins un réfutateur).

**Passage 5 (`verify-lot3-tranche2-run5.log`), sur l'arbre APRÈS le correctif de la revue
hostile — propre de bout en bout, c'est le passage qui compte pour le SHA poussé (règle 12)** :
vitest **886/886** (109/109 fichiers — un test de plus que le passage 4, le cas mixte ajouté par
le correctif), gardes 43, plancher 886/632, langue 0 hors catalogue · 0 en dur · 39 différés ·
45 exclues · 14 refus documentés, langue:épreuve 15/15, lectures 0 perdue sur 1716 chemins figés
dans 86 écrans, lectures:épreuve 6/6, parcours 269/269 déclarées et figées · 0 perdue,
parcours:épreuve 5/5, screens 87 routes · 0 échec, fumee 51 routes · 0 échec, densite 77 écrans
mesurés · 0 au-delà de 5 actions primaires, clics 226 étapes conduites · 0 échec (346 clics sur
47 gestes), visuel exécuté sans échec. Tous les autres nombres identiques au passage 4 — aucune
régression introduite par le correctif de la revue hostile.

**Fusionné dans `main`, SHA servi CONFIRMÉ = `5c97892`** (mandat du fondateur, permission
« pour la nuit », §1 : fusionner tranche par tranche derrière un verify propre gelé, clore par un
SHA servi mesuré). Deux commits sur `claude/otto-session-resume-zimig9` — `9661317` (contenu +
verify) puis `5c97892` (docs/CHASSE.md, F14 : une nouvelle occurrence #418 en ligne, CI `url`,
tâche A-05 — même reproducteur que F5, page non touchée par cette tranche, consignée pas creusée)
— fusionnés par fast-forward dans `main` (`12b214a..5c97892`, aucun commit de fusion nécessaire,
aucune divergence). CI `deploye`, run `34158120425`, job `101854070409` : `/api/sante` sur
`https://otto-dit.vercel.app` sert `5c97892` — le SHA poussé — en 154 s (20:06:43Z→20:09:24Z),
six lectures rapprochées avant la bascule disent toutes « servi 12b214a » (0 s à 129 s). Cette
même mesure règle au passage l'observation du fondateur (§3 du mandat de nuit) : une lecture
HTTP fraîche, juste avant la fusion, montrait `otto-dit.vercel.app` sur `ebf34ee` et l'alias
git-main sur `abb6b33` — le fondateur l'a lui-même qualifiée d'observation, pas de fait, passant
par une couche susceptible de mettre en cache. Réglé PAR L'INSTRUMENT : `get_deployment` sur les
deux noms d'hôte renvoyait, à cet instant, la MÊME chose — `dpl_8LaYKVSb2fKA9NKHtrjoMo4DNepK`,
SHA `12b214a` (le HEAD réel), `aliasError: null` — et les six lectures `deploye` ci-dessus le
confirment indépendamment. **Aucune récidive de R53 cette nuit** ; la cause de l'occurrence du
2026-09-06 reste non diagnostiquée (docs/BACKLOG_REPORTE.md, addendum daté).

## Lot 3, tranche 1 : la nature du test (2026-09-07)

*Mandat (`docs/MANDATS/2026-09-05_plan_autonomie.md`, Partie C.1, ligne 148) : « La nature du
test est une donnée du pack. La page de poste rend l'atelier de la nature. » Lot 3 (ligne 240) :
« `nature` sur `procedure_instance`, et les ateliers de `recalcul_parametre`,
`confirmation_externe`, `rapprochement`. » Cette tranche ne fait que la première moitié de la
première phrase — la chose plus petite (règle 8) : le champ et sa cohérence, aucun atelier neuf.*

**Ce qu'un auditeur voit maintenant.** Le tableau du programme de travail porte une colonne
« Nature » sur chaque ligne commandée — visible AVANT planification, puisque la nature est une
donnée du pack, pas de l'instanciation. Pour la seule combinaison outillée aujourd'hui
(`sondage_pieces` + poste `REVENUE`), un lien mène à l'atelier réel (`/testing`) ; pour toutes les
autres, la ligne affiche un aveu honnête — « atelier pas construit encore » — jamais un lien mort
ni un silence (règle 13).

**Mécanique.** `methodology/procedures.json` (version 1.4.0) : les 56 procédures gagnent
`nature` (8 valeurs fermées : `sondage_pieces` 17, `recalcul_parametre` 16, `rapprochement` 9,
`confirmation_externe` 7, `test_exhaustif` 4, `observation_documentee` 2, `revue_analytique_substantive`
1, `tests_de_controles` 0), validé par le schéma et par `catalogueDeLaMission()` (cas connu
mauvais, règle 17 : un champ retiré fait lever "CATALOGUE INVALIDE"). Migration 0146 :
`procedure_instance.nature` (contrainte CHECK sur les 8 valeurs). Trois sites d'écriture, tous
posent `nature` depuis leur propre source, jamais redérivée : `programme.ts::planifierProcedure`
(catalogue), `sampling.ts::ensureRevenueProcedure` (`sondage_pieces` en dur, procédure hors
catalogue), `sox.ts` (`tests_de_controles` en dur, idem). `atelierDeLaNature(nature, fsliCode,
base)` est le seul point de dispatch — il ne rend non-null QUE pour `sondage_pieces` + `REVENUE`,
pour ne jamais mentir sur un atelier qui n'existe pas (règle 13).

**Lecture ajoutée à `/api/sante` le jour même** : « nature du test cohérente avec le catalogue »
— compare, procédure par procédure, la `nature` en base à celle du catalogue pour le même
`template_code`, rougit sur tout décalage. Cas connu mauvais (règle 17,
`nature-lecture.test.ts`) : une ligne RAPPRO écrite en base avec `sondage_pieces` fait rougir la
lecture (HTTP 500, détail nommant RAPPRO et rapprochement), la correction la fait repasser au
vert.

**Revue hostile (deux réviseurs indépendants, convergents), deux constats corrigés avant
commit** : CAPITAUX-PV était classée `tests_de_controles`, alors que sa forme (justificatifs
exacts, comme DETAIL) est un `sondage_pieces` — corrigé et reconfirmé par `catalogue.test.ts`
(12/12). La station de parcours cliqué vérifiant « une ligne planifiée montre un atelier réel OU
un aveu honnête » utilisait un compteur agrégé (`nAtelier + nAbsent >= apresCommandees`)
mathématiquement incapable d'échouer, les deux compteurs et le total étant gardés par la même
condition — remplacé par des sélecteurs `:has()` par ligne (`trous`, `doubles`), preuve par cas
connu mauvais : renommer l'attribut `data-atelier` en `data-atelier-MUTATION` fait échouer la
station avec le bon message (« 1 ligne planifiée sans lien NI aveu »), restauré ensuite.

**Un troisième constat, non corrigé, enregistré R52** : ENTRETIEN est classée
`observation_documentee`, l'ajustement le plus faible des huit valeurs pour cette procédure —
aucune des sept autres ne convient mieux, et l'union `NatureDeTest` est fermée (règle 8/14) : en
ouvrir une neuvième pour un seul cas serait une catégorie inventée, pas une donnée de méthode.
Voir `docs/BACKLOG_REPORTE.md` (R52) et `docs/instantanes/fils.json`. R50 et R51 (Lot 2, étape 7)
restent ouverts, inchangés par cette tranche.

**Chaîne verify complète, propre, sur la tranche entière, arbre GELÉ pendant l'exécution**
(`verify-lot3-frozen.log`) : vitest **879/879** (107 fichiers), gardes 43, semeur (inchangé —
`nature` n'entre pas dans son registre), plancher 632, langue 0/0 + épreuve, lectures 0
perdue/1716 chemins (86 écrans), parcours **269 déclarées · 267 figées avant cette tranche · 2
nouvelles, figées par `parcours:figer` après le run** (0 perdue) + épreuve 5/5, screens 87/0,
fumee 51/0 (51 routes), densite 77 écrans/0, clics **226 étapes/0 échec** (346 clics, 47 gestes),
visuel 312 vues/0 défaut.

**Ce qui reste dû** : les ateliers `recalcul_parametre`, `confirmation_externe`, `rapprochement`
(Lot 3, tranches 2-4) ne sont pas construits — `atelierDeLaNature` continue de rendre l'aveu
honnête pour toutes les lignes qui en relèvent, jamais un lien mort.

## Lot 2, étape 7 : la colonne ajoutée à la main (2026-09-07)

*Suite du plan d'autonomie (mandat, instruction 4 : « enchaîne Étape 3 → 7 sans t'arrêter »),
directement après l'étape 6 (ci-dessous) — dernière étape de la Partie B.* Partie B, §B.2,
étape 7 : « L'auditeur ajoute une colonne, choisit la donnée et le type de pièce qui la porte. Si
ce type n'a pas encore de demande sur cet échantillon, la plateforme propose de la créer, en un
clic, par ligne ou en lot. C'est exactement le cas que le fondateur a décrit, et c'est le test
d'acceptation de toute cette partie. » §B.4 nomme `REQ-02` (« conclure une ligne dont une colonne
exige une pièce qui n'a jamais été demandée ») « le plus important » des refus de la Partie B, et
`COL-01` (« ajouter une colonne sans dire de quelle pièce vient la donnée »).

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas avant cette tranche.** Sur la grille
de test (étape 6), un formulaire — un champ libre, un bouton — ajoute une colonne. Le titre est
interprété DÉTERMINISTIQUEMENT contre le même catalogue fermé que la colonne ajoutée au papier de
travail (ADR-099, `workpapers/colonne.ts::CHAMPS_LISIBLES`) : la donnée ET son type de pièce
viennent de la MÊME entrée, jamais deux choix qui pourraient diverger. Un clic ajoute la colonne
ET calcule la grille (`ajouterColonneAction`, un seul aller-retour). Sous chaque cellule d'une
colonne ajoutée, un bouton « Demander » (par ligne) ou un bouton en lot demande la pièce qui la
fonde, avec le MÊME mécanisme typé que l'étape 5 (`piecesDemandeesParLigne`) — une facture
demandée pour UNE colonne ajoutée couvre TOUTES les colonnes ajoutées de ce type sur cette ligne,
puisque REQ-02 raisonne par PIÈCE, jamais par colonne. Une ligne ne se conclut plus si une colonne
ajoutée exige une pièce jamais formellement demandée — même quand la pièce existe déjà par un
autre chemin (le paquet PBC antérieur à l'étape 5) : « exister » et « avoir été demandée par ce
mécanisme » sont deux choses différentes, et REQ-02 ne regarde que la seconde.

**Le modèle de données : `test_column`, ancré sur `engagement_id`, PAS sur `grid_id`.** Le mandat
(§B.3) nomme `grid_id` — mais `test_grid` est REMPLACÉ à chaque figeage (jamais muté, ADR
existant) : une colonne ajoutée qui viserait un `grid_id` précis disparaîtrait à la version
suivante. `test_column` (migration 0145) s'ancre donc sur `(engagement_id, procedure_code)` — la
même identité durable que `colonnesCommandees` lit déjà pour composer la grille du pack ;
`figerGrille` compose désormais PACK + AJOUTÉES à chaque figeage et verse le tout dans une
version neuve, avec le même mécanisme d'invalidation des conclusions qui existait déjà pour un
changement de pack (règle 15 : le code fait foi, pas le nom du mandat).

**Ce que cette tranche ne fait pas, par construction (règle 19).** Aucune colonne ajoutée ne
compare un attendu chiffré contre le grand livre — seule la PRÉSENCE de la donnée dans la pièce
reçue est vérifiée (`calculerCellule::default`) ; inventer un attendu pour un champ arbitraire
serait une comparaison FABRIQUÉE. Aucun geste de suppression d'une colonne ajoutée. REQ-02 ne
regarde que les colonnes `origine === 'ajoutee_par'`, jamais celles du pack (déjà couvertes par
le paquet PBC existant, R49).

**La revue hostile (deux réviseurs indépendants, en parallèle, chacun sans voir l'autre) — et ce
qu'elle a changé, pas seulement trouvé.** Convergence sur deux points, chacun trouvé
indépendamment par les deux : (1) une colonne ajoutée `delivery_note` rendait REQ-02
insatisfaisable pour toute ligne hors compte 701, bien plus large que le cas `invoice`/écriture
manuelle déjà connu (R51) — et un réviseur a montré un défaut DISTINCT et plus grave derrière ce
même symptôme : `calculerGrille` sautait la CELLULE elle-même (rien du tout, ni « absente » ni
« sans ancre ») pour une colonne ajoutée `delivery_note` sur toute ligne sans BL déjà demandé à
l'ancien format PBC — un manque SILENCIEUX (règle 13), pas seulement une conclusion bloquée.
**Corrigé** : le saut `!requiertBl` (`calculerGrille`) ne gate plus que les colonnes
`origine === 'pack'` ; preuve par cas connu mauvais dans `colonne-ajoutee.test.ts` (9/16 lignes
sans cellule avant, 16/16 après). R51 (`docs/BACKLOG_REPORTE.md`) reste ouverte pour le fond
(REQ-02 demeure, par conception, insatisfaisable sur une ligne structurellement inéligible — pour
les deux types de pièce désormais, pas seulement `invoice`) mais son texte est corrigé pour ne
plus sous-déclarer sa portée. (2) le TOCTOU du pré-contrôle COL-01 (`ajouterColonneGrille`) :
deux ajouts simultanés de la même donnée pouvaient tous deux passer le `SELECT` avant qu'un des
deux n'écrive — la contrainte `unique` (migration 0145) empêchait la vraie duplication, mais
l'INSERT perdant levait une erreur Postgres brute (nom de contrainte) au lieu du message COL-01
promis. **Corrigé** : l'INSERT est entouré d'un `catch` qui rattrape le SQLSTATE `23505` et rend
le même message que le pré-contrôle.

**Un troisième constat, trouvé par un seul réviseur mais vérifié et corrigé** : une fuite entre
cabinets, pré-existante (étape 5) mais fraîchement atteignable par le nouveau bouton « en lot »
de cette tranche. `demanderPiecesEnLot` recevait `engagementId` de l'appelant (un champ de route,
sûr) et vérifiait l'appartenance du SEUL appelant à CET engagement — mais ne vérifiait JAMAIS que
`sampleId` (un champ CACHÉ du formulaire, donc modifiable) appartenait au même dossier. Sous le
rôle applicatif qui contourne la RLS (l'étape 3 de PLAN_RLS n'étant pas exécutée), un membre
légitime du cabinet A pouvait poser l'id d'un tirage du cabinet B et lire ses lignes (montants,
tiers, références de pièce). **Corrigé** : `demanderPiecesEnLot` ne reçoit plus `engagementId` en
paramètre — il le remonte, avec l'étanchéité, depuis `sampleId` lui-même
(`assertMembreDe('sample', ...)`, même précédent que `demanderPieceLigne`), et les deux appelants
(sampling et testing) sont mis à jour. Preuve par cas connu mauvais (`pieces-lignes.test.ts`,
« ETANCH-LOT ») : un tirage semé sur un AUTRE dossier, sans karim dans son équipe, est refusé
(`ETANCH-03`) plutôt que lu. Un quatrième constat (ordre non déterministe de `colonnesAjoutees`
sur une égalité d'horodatage, pouvant périmer des conclusions pour rien) et un cinquième
(`evidence_type_code` sans contrainte de domaine en base) ont aussi été corrigés — respectivement
un tri secondaire par `id`, et une contrainte `check` ajoutée à la migration 0145 (jamais poussée
avant ce jour : l'éditer n'enfreint pas la règle 26). Un dernier point soulevé (l'affichage
« Demander » pourrait rester périmé juste après un re-tirage) a été vérifié et écarté : les lignes
de la grille viennent de `lignesAtelier`, qui rend déjà une liste VIDE dans cet état — aucune
ligne ne peut afficher un bouton obsolète, parce qu'aucune ligne ne s'affiche du tout tant que le
nouveau tirage n'est pas repris.

**Un défaut d'auteur, trouvé par la chaîne verify elle-même, pas par un réviseur.** Le premier
correctif ETANCH-LOT ci-dessus portait, dans son commentaire, le mot français « engagement » hors
guillemets de code — le lexique de l'écran (`docs/LEXIQUE.md`, `lexique.test.ts`) le bannit
partout où il pourrait fuiter vers un libellé (« dossier » ou « mission » sont les mots reçus). Le
garde ne distingue un commentaire d'un texte d'écran que par sa PREMIÈRE ligne ; les lignes de
continuation d'un commentaire multi-lignes sans préfixe `*` restent lues comme du texte — un
symptôme, pas un bogue à corriger dans le garde (hors périmètre de cette tranche) : reformulé en
« le dossier RÉEL » plutôt que « l'engagement RÉEL ».

**Conduit dans un navigateur avant d'être annoncé (règle 10) : d'abord une session Playwright
manuelle sur `npm run dev`, puis la station officielle du parcours cliqué.** La session manuelle
a servi à METTRE AU POINT les sélecteurs et le rythme des attentes (deux défauts de harnais
trouvés et corrigés avant d'écrire la station : `calculerGrille`/`ajouterColonneAction` recalculent
la grille en entier — un délai fixe après le POST lisait parfois un tableau encore vide ; corrigé
en relisant par une navigation fraîche APRÈS avoir capturé le refus éventuel, jamais avant, sous
peine d'effacer `?erreur=`) avant que la station officielle (« étape 7 : la colonne ajoutée à la
main », 8 assertions conduites sur 9 déclarées — les deux branches d'un même `if`/`else`) ne les
exerce pour de vrai : refus COL-01 (titre ambigu, sans correspondance, doublon), ajout réussi
(badge « ajoutée », deux colonnes successives), demande par ligne (couvre les deux colonnes
ajoutées de ce type), demande en lot.

**La chaîne `verify` (règle 21), propre de bout en bout, base fraîche, sur le SHA de cette
tranche** (`verify-etape7-3.log`, borne haute — mtime du journal, 2026-09-07T07:53:20Z, aucun
horodatage propre à cette étape) : vitest 875/875 (106 fichiers, +8 depuis étape 6 : COL-01 ×3,
REQ-02, la cellule delivery_note, ETANCH-LOT, et les deux lectures étape 7 de `/api/sante`),
gardes 43, plancher 632, langue 0/0, lectures 0 perdue/1716 (86 écrans), parcours 0 perdue (267
déclarées, 267 figées — les 9 neuves de cette tranche figées après un premier passage vert),
screens 87/0, fumee 51/0, densité 77/0 (108 champs à taper), clics 224/0 (346 clics sur 47
gestes), visuel 312/0. **Deux passages antérieurs de cette même tranche ont rougi et n'ont pas été
menés à terme** — tués dès le premier échec constaté (même discipline que les tranches
précédentes) : un premier passage a rougi sur le défaut lexique décrit ci-dessus (`vitest`), un
second (implicite, la revue hostile elle-même tournant AVANT tout `npm run verify`) a précédé les
cinq correctifs listés plus haut — aucun des deux n'a atteint `clics`/`visuel`.

**Ce que cette tranche referme.** La Partie B du mandate (`docs/MANDATS/2026-09-05_plan_autonomie.md`)
est désormais structurellement complète : les sept étapes (POP-01/POP-02, REQ-01, REQ-02, COL-01)
existent toutes, chacune avec son refus observé au clic. La Partie C (les autres postes, les
natures de test) est la suite explicitement nommée par le mandat — non commencée, non scopée ici.

## Lot 2, étape 6 : la grille, à deux niveaux d'en-tête (2026-09-07)

*Suite du plan d'autonomie (mandat, instruction 4), directement après l'étape 5 (ci-dessous).*
Partie B, §B.2, étape 6 : « La grille, à deux niveaux d'en-tête. Le premier niveau est le type de
pièce ; le second, les données à y trouver. Chaque colonne sait de quelle pièce elle provient. »

**Ce qu'un auditeur peut voir maintenant, et ne pouvait pas avant cette tranche.** Sur l'écran de
testing, dès que la grille est calculée (bouton existant, ou « Run vouching L0 »), un nouveau
tableau montre TOUTES les lignes de l'échantillon × TOUTES les colonnes de la grille, avec un
en-tête à deux niveaux : la première rangée groupe les colonnes par type de pièce (« Invoice »,
« Delivery note », `colSpan`) ; la seconde liste les champs. Rien n'est recalculé : la même
`cellulesDuDossier` déjà lue pour la bande de cellules par ligne (atelier.tsx) est simplement
PIVOTÉE en tableau — zéro changement au service `grille.ts` (diff nul sur ses fonctions).

**Le mandat illustre Étape 6 avec des colonnes que le pack ne porte pas — non ajoutées, à
dessein.** Le mockup montre facture « n°, date, client, montant HT, TVA » et bon de livraison
« n°, date, quantité, signature ». Le pack RÉEL (`methodology/procedures.json`) ne porte que 4
colonnes facture (montant HT, date, client, numéro — pas de TVA) et 3 bon de livraison (quantité,
date, signature — pas de numéro). Les ajouter serait du CONTENU DE PROCÉDURE NEUF, interdit par le
périmètre gelé (règle 14 : « aucun cycle au-delà du chiffre d'affaires, aucun contenu de procédure
nouveau »). La grille rendue est donc celle du pack réel (7 colonnes), pas celle de l'illustration
— le code fait foi (règle 15), pas l'exemple d'un mandat.

**La revue hostile (workflow, deux réviseurs indépendants), avant le push — et ce qu'elle a
DÉCLENCHÉ, pas seulement trouvé.** Aucun défaut bloquant dans le code neuf lui-même ; deux
signalements mineurs convergents sur un point de style : la table `ETAT_CELLULE` (couleur/marque
d'une cellule) était dupliquée entre `atelier.tsx` et la nouvelle vue, avec une justification
affichée (« l'un est 'use client', pas l'autre ») qu'un réviseur a jugée « techniquement faible ».
**J'ai suivi ce jugement et consolidé la table dans `grille.ts`** — et la chaîne verify a
IMMÉDIATEMENT rougi, deux fois : `tests/screens.test.ts` (le serveur tombe à `/eng/[id]/testing`)
et `client-serveur.test.ts` (« aucun composant client n'emporte la base dans le navigateur »).
`grille.ts` importe `lib/db/client` ; `atelier.tsx` est `'use client'` ; un import de VALEUR
(pas de type) depuis `grille.ts` emporte tout son graphe — y compris la base — dans le bundle
navigateur. **Le réviseur avait tort sur le jugement technique, raison pour laquelle la
duplication existait** ; c'est EXACTEMENT le défaut déjà vécu une fois, le 2026-09-01, avec
`GROUPES`/`rail.ts` — le garde qui l'avait attrapé cette fois-là l'a rattrapé cette fois-ci aussi.
**Corrigé proprement, pas en annulant le correctif** : `ETAT_CELLULE`/`EtatCellule` vivent
maintenant dans un fichier neuf et minuscule, `etat-cellule.ts`, qui n'importe RIEN de serveur —
`atelier.tsx` et `testing/page.tsx` l'importent tous les deux directement, `grille.ts` n'utilise
plus qu'un `import type` (qui s'efface à la compilation, donc sans risque). La duplication a bien
disparu ; le risque que le réviseur avait sous-estimé, non.

**`npm run lectures` a rougi une fois de plus, légitimement — expliqué et refigé.** Retirer la
définition inline de `atelier.tsx` a fait disparaître une occurrence de `Cellule['etat']` (notation
`['etat']`, comptée par le garde) : « eng/[id]/testing/atelier.tsx → etat : 9 → 8 ». Mécanique, pas
un vrai recul de lecture — `EtatCellule`/`ETAT_CELLULE` sont désormais lus depuis un autre fichier,
comptés là où ils vivent. Refigé (`npm run lectures:figer`) : 1681 → 1716 chemins de champ (+35,
la grille neuve en lit beaucoup — `col.code`, `col.libelle`, `cel.trouveAffiche`, `l.piece`,
`l.montantGl`… autant de lectures RÉELLES, jamais vues avant cette tranche).

**Conduit dans un navigateur avant d'être annoncé (règle 10) : le parcours cliqué officiel, pas un
script manuel.** Une première tentative de vérification manuelle (script Playwright ad hoc,
cliquant « Calculer la grille » puis « Run extraction ladder » hors de l'ordre du parcours réel) a
buté sur « pièce absente du magasin » — un faux négatif du SCRIPT, pas du produit : la revue
hostile a confirmé, en lisant `extractAll`, que re-lancer l'extraction sur un monde déjà extrait
est idempotent et sûr, et que la vraie cause était l'ordre inhabituel du script manuel, pas un
défaut de cette tranche. Abandonné au profit de la station officielle du parcours cliqué (« atelier
de test : la grille, les ancres, les refus, la conclusion »), qui calcule déjà la grille dans le
BON ordre — 3 assertions neuves ajoutées juste après : la section apparaît dès que la grille est
calculée, l'en-tête groupe en exactement 2 niveaux (facture, bon de livraison), et au moins une
ligne du tableau est rendue. Une des trois portait elle-même un défaut d'auteur mineur (un message
de détail qui disait « section absente » même quand la section était PRÉSENTE, une chaîne de repli
copiée sans l'adapter) — corrigé avant le commit.

**La chaîne `verify` (règle 21), propre de bout en bout, base fraîche, APRÈS le correctif de la
revue hostile ET son propre défaut (`verify-full-27.log`)** : vitest 867/867 (104 fichiers),
gardes 43, plancher 632, langue 0/0, lectures 0 perdue/1716 (refigé), parcours 0 perdue (258
déclarées, 3 nouvelles figées), screens 87/0, fumee 51/0, densité 77/0, clics 216/0 (sonde
d'hydratation : aucun incident), visuel 312/0. Deux passages précédents (verify-full-24,
verify-full-25) ont rougi sur exactement les deux défauts décrits ci-dessus et n'ont pas été menés
à terme — tués dès le premier échec constaté plutôt que laissés finir sur un résultat déjà
invalidé, même discipline que R47/étape 5.

**Ce que cette tranche ne fait pas (règle 19).** Elle n'ajoute pas de colonnes au pack (TVA,
numéro de bon de livraison — hors périmètre, règle 14) ; elle ne rend pas la grille interactive
(cliquer une cellule pour ouvrir la ligne dans l'atelier reste à faire, pas demandé par le
mandat) ; elle ne construit pas Étape 7 (la colonne ajoutée à la main, REQ-02, COL-01 —
prochaine tranche).

## Lot 2, étape 5 : les pièces, et leurs demandes (2026-09-07)

*Suite du plan d'autonomie (mandat, instruction 4 : « enchaîne Étape 3 → 7 sans t'arrêter ») —
directement après la confirmation du SHA servi de POP-01 (R47, ci-dessous, résolue avant cette
tranche). Partie B, §B.2, étape 5 : « Pour chaque type de pièce que la procédure exige… un bouton
en un clic crée la demande correspondante — par ligne d'échantillon, et en lot pour tout
l'échantillon. Chaque pièce demandée porte un lien vers sa demande. »*

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas avant cette tranche.** Sur l'écran de
sondage, chaque ligne tirée porte désormais deux boutons — « Invoice » et « Delivery note » — qui
demandent la pièce correspondante EN UN CLIC, pour cette ligne précise ; deux boutons en haut de
tableau font le même geste EN LOT pour tout l'échantillon. Une pièce déjà demandée par ce mécanisme
affiche un LIEN vers sa demande (numéro, statut) à la place du bouton.

**Ce qui existait déjà, et n'a pas été touché.** Le paquet PBC (`generatePbcFromSample`, bouton
« Generate PBC request ») reste inchangé — un seul clic, toutes les pièces de tout l'échantillon,
jamais typé par pièce. Les nouvelles fonctions sont ADDITIVES, pas un remplacement (R49 ci-dessous
documente pourquoi les deux peuvent se recouper).

**Le modèle de données : rien de neuf.** `request.evidence_type_code` (migration 0143, jusqu'ici
seulement utilisé par `detail_de_compte`) et `request_item.sample_item_id` (déjà là depuis
0002_testing.sql) suffisent : une demande PAR LIGNE porte un seul `request_item` ; une demande EN
LOT en porte plusieurs, chacun lié à sa ligne. `piecesDemandeesParLigne` lit ces deux champs pour
savoir quoi rendre — bouton ou lien — sans rien stocker de plus.

**La classification des pièces, dupliquée à dessein.** Quelle ligne porte une facture, laquelle
porte aussi un bon de livraison (comptes 701xxx, jamais un avoir), laquelle n'en porte aucune (une
écriture manuelle, journal OD) : la MÊME règle que `generatePbcFromSample` (même fichier,
juste au-dessus), recopiée plutôt que partagée — limite nommée dans le code (règle 19) : un futur
changement de l'une doit changer l'autre à la main, non gardé par un test commun.

**REQ-01, à moitié câblé.** `assertTypeDePieceConnu` refuse toute demande sans type de pièce
reconnu — la moitié « type de pièce » du refus, éprouvée par mutation (le guard retiré, le test
rougit ; remis, il repasse). L'autre moitié du mandat, « ni destinataire », n'a AUCUNE
infrastructure pour s'appuyer dessus dans ce dépôt — enregistrée R48, non corrigée (hors périmètre
d'une garde ajoutée en marge d'Étape 5).

**L'étanchéité, trouvée manquante puis corrigée AVANT le premier push (règle 24).** La chaîne
verify complète a rougi une fois : `etancheite-executee.test.ts` a trouvé que les deux nouvelles
fonctions vérifiaient REQ-01 AVANT l'appartenance au cabinet (`assertMembreDe`/`assertMembre`) — un
acteur d'un autre cabinet aurait donc lu un message métier avant le refus d'étanchéité. Corrigé :
l'étanchéité se vérifie toujours EN PREMIER, même règle que `rapprocherDetailDeCompte`
(account-detail.ts). Toute la suite (867 tests) repasse après le correctif.

**La lecture ajoutée à `/api/sante` le jour même (règle 22).** « étape 5 : aucune demande typée
sans pièce » — `demanderPiecesEnLot` refuse toujours de poser une demande vide (règle 20 : une
demande sans élément serait un décor) ; la lecture rougit si une telle demande existe quand même
(contournement direct). Prouvée capable de rougir (règle 17) : `etape5-lecture.test.ts` insère une
demande typée vide par une écriture SQL directe et confirme `ok:false`/HTTP 500 ; sans l'insertion,
`ok:true`.

**Conduit dans un navigateur avant d'être annoncé (règle 10), deux fois.** D'abord un script
Playwright manuel (build de production, base semée, cookie `otto_user`) : le bouton « Invoice »
sur la ligne manuelle refuse (`?erreur=demanderPieceLigne…`), le même bouton sur une ligne normale
réussit, le bouton « Request all delivery notes (batch) » convertit 9 boutons en liens
« R-00x requested → » d'un coup — captures dans `/tmp/…/etape5-*.png`. Ensuite, DANS le parcours
cliqué officiel (`scripts/clics/scenario.ts`), une station neuve à cinq assertions : boutons
visibles, refus sur une écriture manuelle (ciblée par son flag `manual_journal`, jamais un index de
ligne), succès sur un avoir (`credit_note_pattern`), succès en lot avec un compte AVANT/APRÈS
(jamais un « aucun refus » seul — R37, docs/CHASSE.md §3), et le cas connu mauvais du lot relancé
sur des lignes déjà toutes couvertes (REFUSÉ, pas une demande vide). `npm run parcours -- --figer`
après un passage vert : 255 stations déclarées, 5 nouvelles figées, 0 perdue.

**Ce que cette tranche ne fait pas (règle 19).** Elle ne réconcilie pas le paquet PBC et les
nouveaux boutons (R49) ; elle ne construit ni REQ-02 ni la grille à deux niveaux (Étapes 6-7,
prochaine tranche) ; elle ne pose pas de destinataire par demande (R48).

**La revue hostile (workflow, deux réviseurs indépendants — règle 30, c'est du CODE), avant le
push.** Angles d'attaque différents ; deux constats RÉELS convergents (aucun autre — NULL-handling
SQL, coercion du pilote, portée `/api/sante`, table du tableau, liaison de paramètres : tout
vérifié et écarté par les deux) :
1. **Aucune transaction sur « demande + ses éléments »** — trouvé dans `demanderPiecesEnLot`
   (boucle d'insertions séparées, comme un défaut déjà corrigé une fois dans ce dépôt,
   `importerDetailDeCompte`, account-detail.ts) ET, en y regardant après coup, dans
   `demanderPieceLigne` aussi (deux insertions séparées). Un échec à mi-chemin y aurait laissé une
   demande RÉELLE mais SANS AUCUN élément — exactement le cas que la nouvelle lecture « étape 5 »
   de `/api/sante` existe pour ATTRAPER (mieux vaut l'empêcher que la détecter). **Corrigé avant le
   commit** : les deux fonctions utilisent désormais `tx()`, même précédent qu'account-detail.ts.
2. **`demanderPieceLigne` ne vérifie pas que la ligne appartient encore à l'échantillon COURANT**
   — un re-tirage (ADR-133) peut faire passer un `sample` en `superseded` sans que la fonction s'en
   aperçoive ; aucun chemin d'aujourd'hui n'expose ce cas (les boutons ne rendent que pour
   `currentRevenueSample`, jamais pour le panneau des lignes sorties), mais la limite n'était pas
   NOMMÉE (règle 19). **Corrigé avant le commit, par la documentation, pas par un refus neuf** :
   bloquer aurait supposé qu'une pièce sur une ligne sortie est toujours sans objet, ce qu'ADR-133
   ne dit pas (le travail déjà porté par une ligne sortie reste visible et se statue) — trancher
   cette question métier est hors périmètre d'Étape 5 ; la limite est écrite dans le code, en tête
   de fonction.

**La chaîne `verify` (règle 21), propre de bout en bout, base fraîche, APRÈS le correctif de la
revue hostile** (`verify-full-23.log`) : vitest 867/867 (104 fichiers, +3 depuis R47 : 2 pour
`pieces-lignes.test.ts`, 1 pour la lecture `étape5-lecture.test.ts`, comptés en tests pas en
fichiers puisque chacun ajoute plusieurs `it()`) · gardes 43 · plancher 632 · langue 0/0 · lectures
0 perdue/1681 · parcours 0 station perdue · screens 87/0 · fumee 51/0 · densité 77/0 · clics 213/0
(sonde d'hydratation : aucun incident — 213 = 208 avant Étape 5 + 5 nouvelles assertions de la
station « étape 5 ») · visuel 312/0. `npm run parcours -- --figer` : 255 stations déclarées, 5
nouvelles figées, 0 perdue.

## R47 — l'incident de déploiement de POP-01, et pourquoi il ne se corrige pas en base (2026-09-07)

*Suite immédiate de la tranche ci-dessous : « toujours le SHA servi confirmé » (mandat, instruction
4) a échoué deux fois, et cette section documente le diagnostic et le correctif avant de reprendre
cette même confirmation.*

**Ce qui a été mesuré.** La confirmation du SHA servi (`scripts/deploiement/atteint.ts`, le
travail `deploye` de la CI) a ÉCHOUÉ sur deux fenêtres de 15 minutes indépendantes : `60e1dfe`
(00:07:46Z→00:22:47Z) puis `1b59dd9` (00:23:05Z→00:37:58Z). Les deux fois le même motif : le SHA
précédent (`031f027`) servait normalement pendant les ~180-200 premières secondes, puis
`/api/sante` basculait en HTTP 500 PERSISTANT jusqu'à la fin de la fenêtre, sans reprise.

**Le diagnostic, en empruntant le chemin (règle 15, jamais un grep).** `mcp__Supabase__query_logs`
sur `postgres_logs`/`supavisor_logs` (projet `fhxghmcehfdmxklkhfzk`) : zéro erreur SQL, connexions
saines — la panne n'est pas la base. `mcp__Supabase__execute_sql` (lecture seule) : la nouvelle
lecture POP-01 (ajoutée dans cette même tranche, ci-dessous) trouvait un sample RÉEL de
production, `5d1df8b7-4ba8-4d55-8f8d-1f2d45de6710` sur l'engagement NEP FY2025
(`e7a83891-e553-4ad1-945e-b34041f18c7b`, démonstration publique) — `template_code='REV-SUBST'`
(le vrai gabarit du tirage, pas un objet de test), `status='drawn'` (tiré, pas seulement proposé),
créé le 2026-09-01 13:36:42Z par `npm run demo:seed` — SIX JOURS avant que POP-01 (60e1dfe)
n'existe. Reproduit à l'identique en local, base fraîche : `bootstrapNep()` seul (sans
`reconcilierDetailRevenueSemeur`), puis ce même sample orphelin inséré directement — même
`/api/sante` en HTTP 500, même lecture POP-01 cassée. `attenduGlPourPoste(engNep, REVENUE)` a été
recalculé localement (563 189 530 centimes) et confirmé IDENTIQUE aux comptes bruts lus en
production (mêmes numéros de compte, mêmes soldes, `coa_map_rule` vide des deux côtés) — la
divergence entre local et production n'est nulle part dans les données comptables, seulement dans
CET UN sample né avant la garde.

**Pourquoi ce n'est ni rapproché rétroactivement ni supprimé — la décision qui compte le plus dans
cette tranche.** Rapprocher ce sample après coup aurait fabriqué une pièce (evidence) et un
rapprochement qu'aucun humain n'a réellement faits, attribués à Karim et Léa à une date inventée :
exactement ce que la règle 31 nomme (« une valeur qui a l'air d'une mesure sans en être une »).
Une écriture directe en base pour le simuler aurait dû aussi fabriquer une entrée dans la CHAÎNE
DE HACHAGE d'`event_log` (règle 3 — la piste d'audit est le socle du produit, pas un détail) : un
geste irréversible sur l'instance de PRODUCTION, sans mandat écrit qui le nomme (§2). Une première
tentative de préparer ce correctif (calculer les empreintes chaînées, localement, pour une
transaction SQL unique et vérifiée) a été abandonnée à mi-chemin — le classificateur du bac à
sable a lui-même refusé plusieurs étapes de ce calcul, un second signal indépendant que ce geste
demandait un arrêt, pas un contournement. Le supprimer aurait détruit du contenu de dossier réel
(règle 28) : la grille de test et les demandes déjà envoyées en dépendent en aval.

**Le correctif réellement posé.** La lecture POP-01 de `/api/sante` (`route.ts`) nomme désormais
cet id précis dans une liste `LEGACY_AVANT_POP01` explicite, datée, commentée — un seul id, celui
mesuré ci-dessus. Tout AUTRE sample orphelin (régression future, contournement du service) rougit
toujours. **Prouvé par un cas connu mauvais (règle 17), les deux sens, base fraîche, avant de
pousser** : un orphelin réinjecté avec un id DIFFÉRENT de la liste reste `ok:false`/HTTP 500
(« hors R47 ») après ce correctif ; le même orphelin réinjecté avec EXACTEMENT l'id
`5d1df8b7-...` rend `ok:true`/HTTP 200, verdict « toutes les lectures passent ». Consigné R47
(`docs/BACKLOG_REPORTE.md`, `docs/instantanes/fils.json`).

**La revue hostile (règle 24, deux réfutateurs indépendants — règle 30, c'est une GARDE), avant le
push.** Les deux, indépendamment, ont convergé sur les DEUX mêmes constats réels — aucun autre,
malgré des angles d'attaque différents (NULL-handling SQL, coercion de type du pilote pg, race sur
`essayer()`, portée de la constante, régénérescence de l'orphelin par un futur `demo:seed` — tous
vérifiés et écartés par les deux) :
1. **Le message de succès s'affirmait lui-même faux** — « tous rapprochés avant tirage » PUIS, dans
   la même phrase, admettait qu'un ne l'était pas (règle 13). **Corrigé avant le commit** : la
   phrase ne dit « tous rapprochés » que si c'est vrai, sinon elle donne les deux comptes
   (rapprochés / legacy R47 non rapprochés).
2. **La preuve du cas connu mauvais (règle 17) n'était pas REJOUABLE** — un journal de session
   manuel, aucun test committé (règle 12 : « une vérification que personne ne peut rejouer est une
   affirmation »). **Corrigé avant le commit** : `app/src/app/api/sante/pop01-legacy.test.ts`, deux
   cas — un id absent de `LEGACY_AVANT_POP01` rougit (« hors R47 »), l'id RÉEL `5d1df8b7-…` ne
   rougit plus — et la preuve que le test rougit vraiment sans le correctif : la liste vidée à la
   main, le test échoue (`expected false to be true`), remise, il repasse.

**Ce que cette tranche ne fait pas (règle 19).** Elle ne corrige pas la donnée de production, ni
n'explique pourquoi le semeur d'avant POP-01 pouvait laisser un tirage sans rapprochement (c'était
vrai et légitime avant cette garde ; POP-01 lui-même l'empêche désormais pour tout NOUVEAU tirage).
Elle ne généralise pas à un mécanisme « toute donnée antérieure à une garde neuve est ignorée » —
la liste est nommée, un id à la fois, jamais une date-seuil devinée (règle 31 encore).

**La chaîne `verify` (règle 21), rejouée deux fois — une fois avant le correctif de la revue
hostile, une fois après, base fraîche à chaque fois** : la seconde, propre de bout en bout
(`verify-full-21.log`) — vitest 860/860 (102 fichiers, +2 tests neufs pour R47) · gardes 43 ·
plancher 632 · langue 0/0 · lectures 0 perdue/1681 · parcours 193 station(s) figée(s) · screens
87/0 · fumee 51/0 · densité 77/0 · clics 208/0, sonde d'hydratation « aucun incident » · visuel
312/0. La première tentative (`verify-full-20.log`) avait rougi une fois sur `clics`, un incident
#418 déjà connu (fil n°7, `docs/CHASSE.md`) sur `/portal/...` — sans rapport avec les fichiers de
cette tranche (route.ts, aucun écran portail touché) ; rejouée à un passage propre, précédent
F9/F10/F11 exact.

## Lot 2, étapes 3-4 : la population dérivée, et POP-01 (2026-09-07)

*Le mandat complet (Partie B en sept étapes) a été retrouvé perdu à la compaction, puis retransmis
par le fondateur et commité verbatim (règle 33 de CLAUDE.md, `docs/MANDATS/`), avant cette tranche —
voir `docs/REGISTRE_IDEES.md` §J pour la citation exacte. Le tirage (étape 4) était déjà un geste
humain cliquable AVANT cette tranche (`sampling/page.tsx`, boutons propose/valider/tirer) : le
mandat le disait « pas cliquable aujourd'hui » en écrivant le plan, avant le lot 2 — le code dit
le contraire, mesuré, et c'est le code qui fait foi (règle 15).*

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas avant cette tranche.** Le tirage du
chiffre d'affaires REFUSE désormais tant que le détail du compte n'a pas été rapproché
(`POP-01`) — et la population elle-même se lit, dérivée du rapprochement, jamais saisie deux fois
(nombre de lignes, total, empreinte de la pièce).

**Étape 3 — la population dérivée.** `populationDuDetailRapproche(engagementId, fsliCode)`
(`account-detail.ts`) : aucune table neuve, aucune migration — nombre de lignes et total se lisent
directement sur `account_detail_import` (étapes 1-2), l'empreinte est celle de la PIÈCE elle-même
(`evidence.sha256`, déjà calculée par `ingestEvidence`). `null` quand rien n'est rapproché pour ce
poste — l'état que POP-01 refuse.

**Étape 4 — POP-01.** `proposeRevenueSample` (`sampling.ts`) refuse avec `POP-01` si
`populationDuDetailRapproche(engagementId, 'REVENUE')` rend `null`. Vérifié UNE SEULE FOIS, à la
proposition — jamais au tirage : `rapprochee` ne repasse jamais à faux (POP-03), donc un
rapprochement vu à la proposition reste vrai au tirage ; la limite est nommée dans le code (règle
19) pour le jour où un chemin de « rouvrir un rapprochement » existerait.

**Le semeur reconcilie AVANT de tirer, avec les mêmes fonctions que le chemin humain**
(`reconcilierDetailRevenueSemeur`, part1.ts — demanderDetailDeCompte, importerDetailDeCompte,
rapprocherDetailDeCompte, jamais une écriture directe : pas un décor, règle 20), sans quoi le
monde de démonstration romprait sa propre garde neuve. Nécessite d'ajuster trois bootstraps de
test qui tiraient directement sans passer par `part1.ts` (s3s4/s5s6/retirage.test.ts) et la
station cliquée « détail du compte », dont le bouton de création n'a plus de premier-chargement à
elle depuis que le semeur pré-crée et rapproche la demande — la station vérifie désormais l'état
SEMÉ (lien, rapprochement conclu), pas la création. Ce geste-là (le clic sur le bouton lui-même)
n'a donc plus de chemin cliqué dans le monde par défaut — **R46**, enregistré, pas corrigé
(étendre l'écran à un second poste non semé aurait élargi la tranche).

**Revue hostile (workflow, deux réviseurs indépendants + vérification adverse par constat)** : six
constats bruts, quatre défauts réels distincts après dédoublonnage, tous corrigés avant ce
commit :
- **POP-01 était périmable en silence** : rien ne revérifiait qu'un rapprochement concluait
  toujours contre le grand livre COURANT — un ré-import de balance (`importTb`, sans garde
  d'invalidation contrairement à `importFec`) pouvait faire bouger le solde attendu SOUS un
  rapprochement déjà conclu, sans que POP-01 le remarque. Corrigé : `populationDuDetailRapproche`
  compare désormais le `gl_attendu_cents` figé à l'import à une relecture FRAÎCHE de
  `attenduGlPourPoste` ; un écart rend `null`, exactement comme si rien n'avait été rapproché.
  Prouvé par mutation.
- **Le chiffre d'affaires semé s'affichait NÉGATIF** (`attenduGlPourPoste` rendait le solde brut
  débit-moins-crédit d'un compte créditeur par nature, mesuré une fois à -5 631 895,30 €) — corrigé
  en valeur absolue, même convention que `population.ts` pour le même type de montant.
- **Le `[rid]` partagé par `screens`/`fumee`/`densite` résolvait la demande de détail** (jamais
  envoyée, jamais visible au portail) plutôt qu'une demande réelle, dégradant silencieusement la
  couverture de `/portal/[token]/[rid]` à son repli de refus au lieu de l'écran substantiel —
  corrigé en préférant une demande non-brouillon.
- (Le cinquième/sixième constat était le même, R46 ci-dessus, compté deux fois par les deux
  réviseurs.)

**Trouvé en clôturant, pas dans le code de cette tranche** : `npm run fumee` (production, `next
start`) est tombé deux fois sur `/portal/[token]/[rid]` — d'abord « 200 sans en-tête » puis « 200
quasi vide » — un défaut PRÉEXISTANT (les trois refus du portail n'avaient jamais de `<h1>` ni de
contenu substantiel), invisible jusqu'ici parce que le `[rid]` partagé tombait toujours sur une
demande visible au portail avant que cette tranche ne change l'ordre de création des demandes.
Corrigé aux DEUX endroits (`/portal/[token]` et `/portal/[token]/[rid]`) : chaque refus porte
désormais un `<h1>` et un geste (lien de retour, ou l'invite à redemander un lien). Deux occurrences
consécutives de standalone `npm run fumee` ont d'abord semblé confirmer le correctif à tort : le
harnais construit sur `next start`, un build de PRODUCTION, et sans `npx next build` entre-temps il
sert un bundle PÉRIMÉ — la leçon écrite ici pour ne pas la refaire.

**#418 rejoué une fois de plus** (fil n°7, docs/CHASSE.md, F12) : un incident sur `/eng/[id]/risk`
(page non touchée par cette tranche), dont une composante rejoue F11 (bruit CSS déjà nommé, non
filtré, R45) et l'autre — un décalage d'une ligne dans la table risque-par-assertion — est
NOUVELLE mais pas creusée (hors mandat, même discipline que F9/F10/F11). Le run précédent sur le
même arbre portait 0 incident ; la chaîne officielle de cette tranche a été rejouée jusqu'à un
passage propre.

**Chaîne verify complète et propre sur cette tranche** (`verify-full-19.log`, troisième passage
propre — verify-full-13 avait rougi sur une renomination de station à figer, verify-full-14/15/16
sur `fumee` avant et pendant le correctif du portail, verify-full-17 était propre AVANT la revue
hostile, verify-full-18 a rejoué F12) : vitest **858/858** (101 fichiers, +1), gardes 43, semeur
**83/16/28/39 (inchangé — aucun décor introduit)**, plancher 632, langue 0/0 + épreuve 15/15,
lectures 0 perdue/1681 + épreuve 6/6, parcours **250/250, 0 perdue** + épreuve 5/5, screens 87/0,
fumee 51/0, densite 77 écrans/0, clics **208 étapes/0 échec**, sonde d'hydratation **aucun
incident**, visuel 312 vues/0 défaut.

**Lecture ajoutée à `/api/sante` le jour même** : « POP-01 : aucun tirage sans rapprochement
(étapes 3-4) » — vérifiée capable de ROUGIR sur l'état qu'elle surveille (règle 22), par une sonde
jetable supprimée avant ce commit (règle 24).

**Ce qui reste dû, dit et pas caché** : le bouton de création du détail de compte n'a plus de
chemin cliqué dans le monde par défaut (R46, ci-dessus). Les étapes 5-7 du mandat (pièces et leurs
demandes en un clic, grille à deux niveaux d'en-tête, colonne ajoutée qui engendre sa demande, les
refus REQ-01/REQ-02/COL-01) ne sont pas commencées. Les deux ajouts du fondateur (obligations du
dossier, N-1 contextuel) restent enregistrés, pas commencés.

## Lot 1 du plan d'autonomie : R37/R40/R41 corrigés, chaîne verify complète, SHA servi confirmé (2026-09-06)

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas hier.** Rédiger un papier de travail
depuis le programme, réutiliser un rapport IPE existant, et voir la demande de pièces naître DE la
sélection du tirage — les trois sans que le parcours cliqué rougisse. Un membre sorti d'une mission
ne voit plus les écrans qu'il ne peut plus utiliser.

**R37 — le vrai défaut n'était pas celui qu'on croyait.** L'hypothèse nommée (une redirection
silencieuse de `requireMember` avalant le clic) a été RÉFUTÉE par exécution : l'URL après clic
était bien celle du succès. Le vrai défaut vivait dans `tx()` (`src/lib/db/client.ts`) : un
`redirect()` Next lancé APRÈS une écriture, à l'intérieur d'une transaction PGlite, faisait
committer l'écriture puis avaler l'exception de contrôle de flux — sauf que le signal était mal
distingué d'une vraie erreur ailleurs dans la pile, et le rollback qui suivait EFFAÇAIT l'écriture
déjà commitée le temps que Next la voie. Corrigé au niveau de la CLASSE
(`estUnSignalDeControleDeFlux`), pas de l'instance qui l'a révélé : tout appelant présent et futur
de `tx()`/`withTenant()` est couvert. Preuve : `src/lib/db/tx-redirect.test.ts`, deux cas connus
mauvais (transaction de premier niveau, savepoint imbriqué) qui échouaient avant le correctif et
passent après ; suite complète 849/849 sans régression. ADR-135, docs/CHASSE.md §3. Dette nommée :
un seul autre site combine `redirect()` et une écriture (`poste/[code]/actions.ts`) ; son
innocuité n'est PAS confirmée par exécution, seulement présumée par lecture.

**R40 — `requireMember` ne filtrait pas `exited_on`.** `assertMembre` le faisait, `requireMember`
non : un membre sorti de la mission voyait encore les écrans et leurs boutons, refusé seulement
plus tard, au geste. Isolé dans `activeMembership()` (`src/lib/core/auth.ts`), avec le même filtre ;
cas connu mauvais dans `auth.test.ts` (passe avant `exitMember`, échoue après, repasse avec le
correctif).

**R41 — deux causes distinctes, trouvées l'une après l'autre par l'exécution, pas devinées.** (1)
La station cliquée ciblait `.last()` sur les liens de papier de la vue programme — n'importe quel
papier déjà rédigé du dossier, pas forcément celui qu'on vient de créer ; corrigé en lisant le code
de la ligne avant de soumettre puis en scopant le lien à cette ligne précise. (2) Réutiliser un
rapport IPE existant exige son arrêté (`date_document`), que la station ne remplissait jamais — le
vrai refus observé était « Dites sur quel arrêté ce papier s'appuie », pas celui supposé au départ.

**Deux défauts visuels trouvés et corrigés par la revue hostile de fin de tranche**, tous deux par
exécution (sonde Playwright jetable, supprimée avant commit) : `.bascule-liste` débordait de -243
à -316 px à 390 px (position fixe, largeur contrainte) ; `.repli-corps` n'avait pas la règle
`overflow-x: auto` que `.panel` porte déjà, donc un tableau dans un `<Repli>` hors `.panel`
poussait la PAGE plutôt que sa propre section — corrigé au même point de rupture (760px), ce qui a
résolu 110 défauts sur 14 écrans en un seul geste (ils étaient MASQUÉS, pas causés, par le premier
correctif : le plafond de 4 défauts par vue de la sonde visuelle était atteint par `.bascule-liste`
avant que le reste de la page ne soit examiné).

**R44 (mandat du semeur §1) — première version engendrée.** `docs/SEMEUR_VS_CHEMIN.md`
(`npm run semeur`) répond, objet par objet sur les cinq fichiers du semeur : le semeur crée-t-il ?
un chemin humain existe-t-il ? a-t-il été cliqué ? **Compte de départ, figé par le fondateur comme
ligne de référence** : 83 objets — **16 DÉCOR**, 28 non prouvés, 39 prouvés. Le garde E1 interdit
désormais tout décor nouveau ; chaque lot à venir doit faire baisser ce compte de décors et monter
celui des prouvés. Cohérence du registre éprouvée par `src/lib/semeur/coherence.ts` (2 cas connus
mauvais + le registre réel).

**La chaîne `npm run verify` a tourné COMPLÈTE sur ce HEAD** (verify-full-4.log, session locale) :
db:reset, demo:seed, tsc (0 erreur), vitest (**849/849**, 100 fichiers), gardes (43), semeur,
plancher (632), langue + épreuve (15/15 cas connus dénoncés), lectures (0 perdue / 1681 chemins) +
épreuve (6/6), parcours (244 déclarées, 0 perdue) + épreuve (5/5), screens (87 routes, 0 échec),
fumee (51 routes, 0 échec), densite (77 écrans, 0 dépassement), **clics (202 étapes conduites, 0
échec, 314 clics sur 43 gestes)**, **visuel (312 vues, 0 défaut)**. `docs/PARCOURS.json` figé sur
ce parcours vert (fa47b36). `docs/instantanes/{verify,servi,fils}.json` portent chaque mesure avec
son SHA et sa source (règle 21).

**Main avancé, et le SHA servi mesuré, pas supposé** : `main` fast-forwardé jusqu'à `0b1749f`, puis
`c23b4be` (régénération du compte rendu). Le travail CI `deploye` (run 34032612106, job
101484851827) a confirmé `/api/sante` servant `0b1749f` en 1 min 49 s (12:16:37Z→12:18:26Z) — SHA
poussé = SHA servi (règle 27).

**R38 et R39 — décisions autonomes documentées, pas d'arbitrage silencieux.** Voir
`docs/DECISIONS_AUTONOMES.md`, section « Session du 6 septembre 2026 » (DA-33, DA-34).

**R38 — navigabilité corrigée (commit 5c6b6a6), le fond méthodologique reste ouvert.** Un poste
sorti du périmètre grisait son lien au rail même s'il portait déjà une procédure ou un papier
(REV-01) — la leadsheet elle-même les affichait sans filtre, seul le CHEMIN jusqu'à elle était
mort. `rail.ts` garde désormais atteignable tout poste hors périmètre qui porte une
`procedure_instance`, un poste jamais travaillé restant grisé comme avant. Cas connu mauvais
prouvé par `git stash` (rouge sans le correctif, vert avec), suite complète 850/850. L'écran du
programme n'est PAS touché. La vraie question — sortir un poste du périmètre après y avoir
travaillé doit-il se STATUER, comme une ligne sortie du tirage (ADR-133) ? — reste entière,
réservée à un auditeur (DA-34).

**R39 — laissé ouvert, délibérément.** Le programme de travail reste au groupe transverse du
rail malgré la divergence avec R-03/ADR-112 : c'est une question d'architecture que le backlog
rattache lui-même à un chantier plus large et pas commencé (l'épure, étage 2), pas un défaut
isolé à corriger en passant (DA-33).

**Chaîne verify RE-confirmée COMPLÈTE sur 5c6b6a6** (verify-full-5.log) après le correctif R38 :
vitest **850/850** (+1, rail.test.ts), le reste inchangé (gardes 43, semeur 83/16/28/39, plancher
632, langue 0/0, lectures 0/1681, parcours 244/244, screens 87/0, fumee 51/0, densite 77 écrans/0,
clics 202 étapes/0 échec, visuel 312 vues/0). **SHA servi re-confirmé** = `9fa187c` (CI `deploye`,
run 34035181666, 13:08:40Z→13:12:07Z) — le code de 5c6b6a6 est en ligne.

## Étage 1.1 — le programme de travail : l'écran qui manquait (2026-09-03, nuit J3)

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas hier.** Ouvrir « Programme de travail »
dans le rail, voir poste par poste ce que l'évaluation du risque COMMANDE — avec la phrase qui le
justifie et la taille d'échantillon —, **planifier une procédure en un clic**, et **rédiger son
papier de travail depuis la même ligne**. Ces trois services existaient depuis des semaines : leurs
seuls appelants étaient le semeur de la démonstration et leurs propres tests. Le dossier semblait
complet parce que le semeur planifiait à la place de l'auditeur.

**La deuxième liste est celle qui compte** : ce qui est planifié et que le risque ne commande plus.
Baisser un niveau d'assertion retire une procédure des requises ; le papier rédigé dessous ne
disparaît pas de la vue pour autant. Même règle qu'au re-tirage (ADR-133).

**Réparé au passage** : `avertissementsAuVisa` était calculé et lu par AUCUN écran. Il est sur
l'écran des obstacles, à part, jamais compté parmi eux.

**Lecture ajoutée à `/api/sante` le jour même** : « programme de travail (commandé / planifié) ».

## Étage 1.2 — le re-tirage ne fait pas disparaître le travail humain (2026-09-03, nuit J3)

**Ce qu'un auditeur peut faire maintenant, et ne pouvait pas hier.** Ré-importer le grand livre
définitif, re-tirer, et retrouver sur les lignes du nouveau tirage les pièces que le client avait
déjà déposées. Puis, sur l'écran du sondage, voir ce qui est SORTI du tirage en portant du travail,
et le statuer par écrit — sans suite motivée, ou remise au tirage. Tant que ce n'est pas fait, le
dossier ne peut pas être visé.

**Comment c'est fait** (ADR-133, migration 0142). La ligne du nouveau tirage DÉSIGNE celle dont elle
reprend le travail (`repris_de`, apparié par `natural_key` — la même relation que
`gl_entry_supersession`). Rien n'est déplacé, rien n'est recopié, rien n'est supprimé : tout ce qui pend à
une ligne d'échantillon serait à migrer à chaque tirage, et la piste d'audit y perdrait son lien
avec le tirage d'origine. Combien exactement — la commande, plutôt que le chiffre de mémoire :
`grep -c "references sample_item" supabase/migrations/*.sql` → **onze références**, dont une est le
`repris_de` que cette tranche ajoute.

**TROIS chemins de lecture remontent la chaîne, et pas un de plus** : l'atelier (pièces et écarts),
la grille de test (donc cellules, deltas et ancres), le compteur de `/api/sante`. **Le papier de
travail, la re-exécution en aveugle, la provenance, la boucle et la génération de demandes ne la
remontent PAS** — dette R33, écrite parce que la revue hostile a mesuré deux fonctions de production
rendant des réponses contraires sur le même objet.

**La famille d'obstacles « tirage » naît BLOQUANTE**, contre la pratique du dépôt (une famille neuve
naît en avertissement). Tenable parce que le fait bloquant n'existe que si un re-tirage a réellement
laissé du travail derrière lui. **Quatre cas de faux positif** la tiennent, et le quatrième n'était
pas prévu : c'est le parcours de bout en bout qui l'a trouvé — sans tirage COURANT, la règle se
tait, sinon seize lignes travaillées rendaient insignable une mission achevée.

**Ce que cela laisse ouvert, et qui est au backlog (R30)** : un dossier dont la sélection est
superseded et qui n'a jamais re-tiré reste signable. C'est le comportement d'avant cette nuit ; le
changer serait toucher à la règle du ré-import, pas à celle du re-tirage.

**Lecture ajoutée à `/api/sante` le jour même** : « re-tirage : reprises et sorties statuées ».

## LE PARCOURS CLIQUÉ : DE NEUF ÉCHECS À DEUX (2026-09-03, nuit J3)

**État à la fin de la nuit**, base fraîche, build de production : **197 étapes, 2 échecs**, sonde
d'hydratation **0 incident**, 193 stations figées vérifiées. Au début de la nuit : 9 échecs.

Les deux qui restent sont le MÊME fait, mesuré et écrit en **R37** : cinq lignes introduites par le
re-tirage n'ont jamais été demandées au client — la demande de justificatifs de l'échantillon
courant n'existe pas, bien que l'écran ait annoncé l'avoir engendrée. La boucle les compte donc « en
attente de dépôt », l'obstacle subsiste, et le dossier ne se clôt pas. Ce n'est pas l'étage 1.2 qui
l'introduit : avant lui, ce sont DIX-SEPT lignes qui étaient en attente, dont douze dont les pièces
étaient déjà au dossier.

Ce qui suit reste écrit parce que c'est le diagnostic d'origine, et qu'il explique ce qui a été
corrigé.

## LE PARCOURS CLIQUÉ ÉTAIT ROUGE, ET VOICI POURQUOI (2026-09-03, nuit J3)

**Fait, mesuré sur base fraîche** (`npm run db:reset && npm run demo:seed && npm run clics`) :
192 étapes conduites, **9 échecs**, 5 stations figées jamais atteintes. La sonde
d'hydratation, elle, ne relève **aucun** incident (étage 0.4).

**Le diagnostic, tiré du journal d'événements — pas d'une explication plausible** (règle 18) :

1. 19:16:04 — le monde de démonstration tire l'échantillon `07d3e33c` (16 lignes), la demande
   part, le client répond : **45 pièces** déposées sur 15 lignes.
2. 19:17:41 — le parcours importe le **FEC DÉFINITIF** et confirme l'invalidation (ADR-016).
   `gl_entry` bascule en `superseded`, chaque écriture reçoit un **nouvel identifiant**, et la
   correspondance ancienne → nouvelle est écrite dans `gl_entry_supersession` (4 731 lignes).
   L'échantillon passe en `superseded`.
3. 19:19:12 — le parcours re-tire : échantillon `4a9950ed` (17 lignes).
4. **Les deux tirages désignent 12 fois LA MÊME ÉCRITURE** (même `natural_key`) — mais par des
   identifiants de ligne différents, puisque le ré-import les a recréés.
5. Résultat mesuré : **33 pièces déposées par le client portent sur une écriture TOUJOURS
   échantillonnée, et aucun écran ne les atteint plus.** L'atelier lit l'échantillon courant,
   dont les 17 lignes n'ont aucune pièce ; d'où l'absence de visionneuse, de provenance, de
   comparaison, de cellule ancrée et de delta signé — sept échecs qui n'en font qu'un — plus
   deux à la clôture, l'obstacle qui en découle.

**Ce n'est pas un défaut du harnais.** Ré-importer le grand livre définitif après que le client
a répondu est le geste normal d'une fin de mission. Le produit fait disparaître, sans le dire,
le travail humain déjà fait sur des lignes qui sont ENCORE dans l'échantillon : « un objet créé
qu'aucun chemin de lecture n'atteint » (règle 13) et, mot pour mot, ce que l'étage 1.2 du mandat
interdit — « un recalcul ne détruit ni n'invalide jamais en silence du travail humain ».

**Ce que je n'affirme pas** : que ce rouge date d'un commit précis. L'arbre mesuré ne diffère de
`main` que par la sonde (un script) et `global-error.tsx` (qui ne rend que si le layout racine
jette) : le rouge est donc celui de `main`, mais je n'ai pas rejoué le parcours sur un commit
antérieur pour dater son apparition.

**Commandes qui reproduisent la mesure** :
```
cd app && npm run db:reset && npm run demo:seed && npm run clics
```
puis, pour les trois chiffres cités (12 écritures communes, 33 pièces orphelines, 4 731
successions), les requêtes sont dans docs/DECISIONS.md, ADR-133.

## Prouvé par exécution vs prouvé par test avec mocks

Mise à jour après exécution réelle de la couche IA (2026-08-25, 51 appels, 1,27 $ sur le
plafond de 20 $). Effectif indiqué à côté de chaque taux. Rien dans ce dépôt ne doit être lu
comme « mesuré » s'il ne figure pas ici.

| Affirmation | Statut | Établi comment |
|---|---|---|
| **Substance probante** : « resolved » exige explication verbatim + preuve liée + disposition + qui/quand | **Prouvé par exécution** | contraintes SQL (migration 0009) + service : une résolution SANS lien vers ce qui corrobore, ou dont l'explication est vide, est refusée par le service ET par la base — vérifié au clic en court-circuitant la garde `required` du navigateur. **Ce qui n'est PAS vérifié, et ne peut pas l'être : la qualité de la prose.** Une phrase creuse mais non vide, accompagnée d'un lien, passe. La formulation précédente (« une résolution générique est rejetée ») affirmait davantage que ce que le produit fait ; juger si une explication est substantielle est le travail des notes de revue et des visas, pas d'une contrainte |
| **Une anomalie chiffrée ne sort pas de l'accumulation sans disposition** | **Prouvé par exécution** | la double comptabilisation de 36 800 € reste dans le total ; anomalies connues 127 545,80 € |
| **Le dépassement de l'anomalie tolérable bloque la conclusion** | **Prouvé par exécution** | `concludeEvaluation` refuse sans `evaluation_response` enregistrée |
| **Le grand livre provisoire bloque la conclusion définitive et la clôture** | **Prouvé par exécution** | test archive : `closeFile` refuse tant que le FEC est provisoire |
| **Déficience : taux et nature avant montant ; extension à la population** | **Prouvé par exécution** | 3/3 → extension aux 12 instances → 25 %, natures sévères ⇒ material weakness |
| **Le rendu n'altère jamais son propre texte** | **Prouvé par exécution** | couverture lue dans la police ; un caractère non couvert fait échouer l'export |
| **Un export supprimé se régénère à l'octet près** | **Prouvé par exécution** | `export.test.ts` compare les octets du PDF stocké et du PDF re-rendu |
| **Le dossier scellé est autoportant et déterministe** | **Prouvé par exécution** | archive rejouable octet pour octet ; empreintes du manifeste re-vérifiées ; README sans script ni lien externe |
| **Les écrans de méthode RENDENT dans l'application qui tourne** | **Prouvé par exécution** | six écrans conduits dans Chromium sur base fraîche (200), dont le parcours publier → refuser → corriger → publier. Avant ADR-076 : trois d'entre eux rendaient **500** avec 278 tests verts |
| **La mission entière se CLIQUE dans l'application, jusqu'au dossier scellé téléchargé** | **Prouvé par exécution** | `npm run clics` : 54 étapes conduites dans Chromium sur un build de production, 0 échec, en étant tour à tour préparateur, reviewer, associé et client. C'est ce contrôle qui a trouvé le dossier créé inatteignable (ADR-088), les dix écrans qui rendaient un refus en page 500, la clôture sans écran et l'archive sans chemin de lecture (ADR-091) — tout cela invisible aux 404 tests et aux 63 écrans à 200 |
| **Les écrans se LISENT — clair et sombre, large et 390 px** | **Prouvé par exécution** | `npm run visuel` : 236 vues mesurées, 0 débordement horizontal, 0 texte sous 3:1. Avant : le thème sombre n'existait pas dans l'application (seulement dans le prototype), le texte « faint » — la voix explicative du produit — était à 2,61:1, et 104 vues débordaient à 390 px |
| **Les visas suivent la hiérarchie de revue** | **Prouvé par exécution** | trigger + service : un visa associé avant celui du reviewer est refusé |
| Le noyau déterministe (canonicalisation, sondage, seuils, projection, échelle de déficience, FEC) donne les bons résultats | **Prouvé par exécution** | 135 tests, dont la suite d'acceptation qui rejoue les anomalies semées par le générateur via le chemin applicatif réel |
| **Précision de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196 champs) sur le corpus d'eval — **0 montant faux sur 84 rendus, 0 date fausse sur 28 rendues** |
| **Extraction HORS CACHE, pièces jamais vues** | **Prouvé par exécution** | `npm run eval:pieces-neuves` (2026-08-31) : précision **100,0 %** (43/43 valeurs rendues), rappel 95,6 % (2 abstentions, jamais une valeur fausse), 0 échec, 0,0223 $/document, p50 4,4 s ; conduite de bout en bout au clic (dépôt → lecture réelle → attestation → écart) pour 0,0452 $, arrêt au plafond exercé pour de vrai (ADR-105) |
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

### Dernière passe sur le prototype — il ne sert plus qu'à être montré

Quatre corrections, aucune fonctionnalité. Le prototype est **arrêté** après celle-ci.

**Persistance** (ADR-064) — refusée sept fois, acceptée pour un autre critère : le prototype n'a plus
qu'un emploi, et un rafraîchissement accidentel renvoyait tout le dossier à son amorce devant le
confrère. Tout `S` est écrit (1,3 Mo, ~50 ms, débouncé à 700 ms), les gestes sont écoutés plutôt que
les rendus, un instantané d'une autre version est écarté et l'écran le dit, trois causes d'échec ont
trois messages. Défaut trouvé par le harnais : `pagehide` réécrivait l'état juste après « repartir de
zéro » — le bouton ne repartait de rien.

**Dates** (ADR-065) — plus un seul `<input type="date">` : ils suivent la locale du navigateur, donc
`04/03` ne disait ni le 4 mars ni le 3 avril. Champ texte `JJ/MM/AAAA` partout, parseur qui **refuse**
une date impossible en marquant le champ, harnais qui vérifie qu'aucune date non formatée ne subsiste.
`build.sh` publie désormais lui-même le fichier livré.

**Identité sur téléphone** (ADR-066) — le sélecteur débordait de 31 px. Il rétrécit au lieu de
déborder ; le faire passer à la ligne ajoutait 30 px au bandeau collant et le harnais de lisibilité
l'a refusé.

**`DEMO.md` porte le parcours** (ADR-067) — cinq minutes, écran par écran, avec la phrase à dire, les
questions qu'on reçoit et leur réponse, et ce que le parcours ne montre pas. `pw/parcours.mjs` le
rejoue et échoue si un chiffre cité bouge.

**Vérification** : 34 harnais du prototype sans échec ni plantage (dont `dates`, `persist` et
`parcours`, neufs) · 186 tests applicatifs · `tsc --noEmit` propre.

## Application — tranche livrée : équipe et indépendance

**Correction d'état, d'abord** : l'isolation par cabinet **existait déjà** (`tenant_id` partout, RLS
en 0004, garde applicative ADR-007). Il n'y avait pas de `firm_id` à poser — il y avait une fondation
à **utiliser** et à **prouver**.

Livré (ADR-069) : migration `0011`, service `team.ts`, écran `/eng/[id]/team`, et 26 tests.

- **La règle** : aucun travail attribué à qui n'a pas signé. Le système refuse, il ne rappelle pas.
- **La base garantit** : on signe pour soi (contrainte), une déclaration signée ne se réécrit ni ne
  se supprime (trigger), une révision exige un motif (contrainte). Les tests les contournent **par
  SQL direct** pour vérifier qu'elles tiennent sans le service.
- **La révision empile** ; tant qu'elle n'est pas signée, un membre déjà affecté produit un
  **obstacle au visa** — sans quoi il suffirait d'affecter avant de réviser.
- **L'isolation s'éprouve** : un second cabinet entier, la fuite tentée dans les deux sens, l'acteur
  contrôlé autant que la cible, et un compte final des lignes croisées à zéro.
- **La déclaration est du contenu de cabinet** : `methodology/independance.json`, 7 rubriques,
  4 seuils qui nomment chacun leur source et ce qu'ils commandent — tous `verifie: false`, avec
  `UNVERIFIED` à l'écran.

Deux défauts trouvés par les tests : l'ordre des refus (la sortie de mission doit passer avant la
déclaration, sinon on envoie corriger la mauvaise chose) et des horodatages rendus en `Date` là où le
type disait `string`.

**Vérification** : 212 tests applicatifs (186 → 212) · `tsc --noEmit` propre.

## Application — tranche livrée : le risque par assertion COMMANDE (point 5a)

Le chaînon qui manquait entre le scoping et les travaux (ADR-070). Migration `0012`, service
`risk.ts`, écran `/eng/[id]/risk`, méthodologie `methodology/risque.json`, et 17 tests qui vérifient
non pas qu'un niveau s'affiche, mais qu'en le changeant **la liste des procédures et la taille des
sondages changent**.

- `risque(assertion)` → **liste des procédures requises** ; `risque(assertion)` → **taille du
  sondage de cette procédure**. La taille suit l'assertion **testée**, jamais le maximum du poste.
- **Calculé et retenu sont deux colonnes** : le calcul se re-dérive, la décision survit au recalcul.
  Une surcharge sans motif écrit est refusée par la base. Une surcharge qui rejoint le calcul cesse
  d'en être une.
- **Les règles de facteur sont de la méthode** : cinq facteurs, chacun nommant un prédicat, ses
  paramètres et ce qu'il craint. L'énumération des prédicats arrête l'assemblage **dans les deux
  sens** — un facteur non implémenté serait silencieusement toujours inactif, donc le risque
  sous-évalué sans que rien ne le dise.
- Chaque facteur range **sa mesure** (« 1 254 écritures (seuil 200) »), jamais un booléen. Un facteur
  non évaluable est inactif **et le dit**.
- L'écran montre les procédures **écartées** avec la raison : une liste qui ne dit que ce qu'elle
  retient ne se conteste pas.

**Vérification** : 229 tests applicatifs (212 → 229) · `tsc --noEmit` propre.

## Application — tranche livrée : le qualitatif, et l'échelle du cabinet (point 5b)

**Deux ratios, et ils ne disent pas la même chose.** Le ratio de **RÈGLES** — ce que la méthode
prévoit — est de 5 règles calculées pour 10 sources déclarées, soit **33,3 % de quantitatif** (le
prototype est à 45,5 %). Le ratio de facteurs **RÉELLEMENT LEVÉS** sur la mission témoin est de
2 observés pour 2 déclarés, soit **50,0 %**. Les deux sont mesurés par un test. Le second peut être
mauvais alors que le premier est bon : une méthode équilibrée dont personne ne remplit le
questionnaire redonne une évaluation à 100 % quantitative, et c'est le second ratio qui le dit.
Avant cette passe l'application était à **100 %** sur les deux — l'état du prototype qui avait été
rejeté, en plus prononcé.

Livré (ADR-071, ADR-072) : migration `0013`, service `questionnaire.ts`, questionnaire et registre
sur l'écran `/eng/[id]/risk`, `docs/12_CONFIGURABLE.md`, et 23 tests de plus.

- **Le questionnaire ne coche rien** : un « oui » **crée un facteur au registre**, avec sa nature, sa
  source et le texte écrit. Une question d'entité vise tous les postes retenus.
- **Le registre fait CIRCULER** : une constatation faite ailleurs se pose seule sur les sections
  visées. Confirmée, elle **monte le niveau et fait entrer des procédures** — proposée, elle ne
  compte pas : un moteur qui lève n'a pas décidé.
- **Trois règles bloquent** : question sans réponse, « oui » sans précision, facteur non statué.
- **L'échelle appartient au cabinet** (ADR-071) : quatre niveaux ou deux, nommés librement, chargés
  sans toucher au code — vérifié en chargeant réellement une méthode à quatre niveaux. Une table
  `{faible:0, moyen:1, eleve:2}` écrite en dur a été supprimée.
- **`docs/12_CONFIGURABLE.md`** : ce qui se configure sans code, ce qui exige un développement, et
  pourquoi la frontière est là. Y compris ce qui n'est **pas** possible — la taille d'échantillon par
  formule, chiffrée à une séance et rattachée au point 6.

**Vérification** : 252 tests applicatifs (229 → 252) · `tsc --noEmit` propre.

## Application — tranche livrée : les assertions sont de la méthode, et le papier a un format

Trois corrections à `docs/12_CONFIGURABLE.md`, plus la tranche technique qu'elles imposaient
(ADR-073, ADR-074).

**1. Les assertions étaient énumérées dans les schémas — c'est réglé, pas repoussé.** C'était le même
défaut que l'échelle de risque : un cabinet qui sépare « présentation » et « informations à fournir »,
ou qui suit le découpage PCAOB, voyait son fichier refusé. Le jeu vit maintenant dans
`methodology/assertions.json` ; les trois autres schémas ne l'énumèrent plus ; la migration `0014`
retire le CHECK énuméré en base. **Ce qui remplace l'énumération est plus strict qu'elle** : le
validateur arrête l'assemblage dans six cas — une procédure, une question ou un facteur visant une
assertion absente du jeu ; un `sens_naturel` inconnu ; deux codes en double ; un jeu vide. L'ancienne
énumération protégeait contre une faute de frappe dans un fichier, le contrôle croisé protège contre
une divergence entre quatre.

**2. Le format du papier de travail manquait au document, et c'est la signature d'un cabinet.**
Réponse établie par inspection : **partiellement configurable, et pas la partie qui compte**. Les
intitulés de sections et d'annexes se changent — mais dans un pack TypeScript, donc avec un
déploiement. La liste et l'ordre des huit sections, les colonnes des deux tableaux, la mise en page,
l'en-tête et le logo (qui n'existent pas) sont en dur. **~3½ séances** pour que le papier sorte à la
signature du cabinet, décomposées ligne à ligne. Une limite est assumée par écrit plutôt que subie :
le bloc de visas, la version et l'empreinte de population ne deviendront pas optionnels — ce sont eux
qui rendent un export relisible sans OTTO.

**3. L'ouverture du document promettait ce que son §3 démentait douze lignes plus loin.** Elle date
maintenant l'état réel — les éléments sont des données, le chargement par cabinet est chiffré à
2½ séances et **n'est pas fait** — sans retirer la promesse. Deux marqueurs visibles courent dans le
tableau du §1 : **⚠ commun** (c'est une donnée, mais le catalogue est unique pour toutes les
missions) et **⚠⚠ code** (c'est configuré, mais dans un pack : il faut un déploiement). **Aucune
ligne du §1 n'est aujourd'hui sans marqueur**, et le document le dit avant le tableau.

**Vérification** : 261 tests applicatifs (252 → 261) · `tsc --noEmit` propre.

## Application — tranche livrée : la méthode d'un cabinet est à lui (méthodologie-comme-donnée)

Les trois pièces annoncées au §3 de `docs/12_CONFIGURABLE.md` sont faites (ADR-075, migration
`0015`). Le catalogue n'est plus lu depuis le dépôt : il est lu depuis la base **du cabinet**.

- **`firm_methodology`** porte le paquet JSON validé, son empreinte et ses versions. **Immuable** :
  republier crée une ligne. Un dossier doit pouvoir dire des années plus tard sous quelle méthode il
  a été exécuté.
- **La mission DÉSIGNE son catalogue** (`engagement.methodology_id`) au lieu de prendre le dernier
  en date. Une méthode publiée en mars ne change pas rétroactivement les travaux requis d'un dossier
  planifié en janvier.
- **L'isolation est dans la BASE** : la clé étrangère est composite `(methodology_id, tenant_id)`.
  Désigner la méthode d'un autre cabinet est **impossible**, pas seulement refusé — et contrairement
  aux politiques RLS, une clé étrangère n'est pas inerte en local. Le test **contourne le service**
  pour écrire directement et attend le rejet **par le nom de la contrainte**.
- **Une mission sans méthodologie est REFUSÉE, pas repliée** sur celle de l'éditeur. Le repli aurait
  fait tourner un dossier sur notre méthode sans qu'aucun écran ne le dise — le silence lu comme un
  succès, une fois de plus.
- **Le paquet d'un cabinet ne peut contenir ni ses propres schémas** (ils énumèrent ce que le moteur
  sait calculer : les livrer désactiverait tous les contrôles en une ligne) **ni un fichier en
  moins** (refusé, jamais complété en silence).
- **Un seul chemin de validation** : `valider.mjs` est scindé en une orchestration et deux entrées —
  disque et ligne de base. Un second chemin serait un chemin non testé.
- **Le chemin normal est exercé explicitement** : quatre tests de refus ne prouvent rien si le
  service refuse tout.

Ce qui reste et qui est écrit dans le document : **pas encore d'écran d'import**, la publication
passe par nous — ~1 séance.

**Vérification** : 278 tests applicatifs (261 → 278) · `tsc --noEmit` propre.

## Application — tranche livrée : l'écran d'import, et un défaut d'exécution que 278 tests verts cachaient

**Le défaut d'abord, parce qu'il change ce que « prouvé par test » veut dire** (ADR-076). En
conduisant le nouvel écran dans un navigateur, `/methodology` a rendu **500**. En vérifiant
l'étendue : `/eng/[id]/risk` et `/eng/[id]/team` rendaient **500 aussi**, et depuis plusieurs
tranches — depuis que le validateur est un `.mjs` partagé (`cf94181`). `await import(chemin)` est
réécrit par le bundler de Next et échoue à l'exécution ; Vitest le résout sans difficulté. **Un test
vert sur un chemin que la production n'emprunte pas ne prouve rien de la production.** Corrigé :
l'import est rendu opaque à l'analyse statique, avec repli sur le chemin Vite, et `racineDepot()`
**cherche** le dossier au lieu de le déduire, en échouant en le nommant.

**Règle de travail qui en sort** : tout écran neuf est conduit dans un navigateur avant d'être
annoncé. C'est ce qui a trouvé celui-ci et les trois défauts ci-dessous.

**L'écran** `/methodology` (ADR-077) : les versions publiées, quelle mission travaille sous laquelle,
et le chargement. **Vérifier sans publier n'écrit rien**, ni en succès ni en échec. Un refus n'est
pas « fichier invalide » : c'est la liste des lignes fautives, chacune nommant l'objet et la valeur
attendue — et pour un prédicat inconnu, **la liste des prédicats connus**, donc le refus se corrige
sans nous appeler.

**La propriété tenue par un test** : ce que l'écran déclare valide, la publication l'accepte ; ce
qu'il déclare invalide, elle le refuse. Une seule fonction produit les erreurs de paquet.

**Trois défauts trouvés dans le navigateur, pas en relecture.**

1. **Le collage était perdu à chaque refus** — `useActionState` avait été choisi pour l'éviter et ne
   suffisait pas : React réinitialise le formulaire après une action. Mesuré : 56 erreurs affichées,
   texte effacé sous elles. Le champ est contrôlé.
2. **Le mode « un seul fichier » était un piège** : passer de trois à quatre niveaux exige
   `risque.json` **et** `procedures.json` dans la même publication. Le texte est désormais toujours
   un objet indexé par noms de fichiers, correctif d'un ou plusieurs fichiers.
3. **Un refus envoyait corriger la mauvaise chose** : une clé inconnue recevait le message sur les
   schémas. Deux causes, deux messages.

**Vérification** : 286 tests applicatifs (278 → 286) · `tsc --noEmit` propre · **six écrans conduits
dans Chromium sur base fraîche**, dont le parcours complet publier → refuser → corriger → publier.

## Application — tranche livrée : le gabarit du papier est de la méthode

Le format d'un papier n'est ni un nom ni un calcul : c'est de la **présentation**, donc la signature
du cabinet — et le papier **sort** d'OTTO pour vivre dans son dossier, sous les yeux de son réviseur
puis d'un inspecteur. Le laisser dans un pack TypeScript exigeait un déploiement pour changer une
colonne : une incohérence avec la frontière du produit, à l'endroit le plus visible pour un client.

`methodology/papier.json` est le **septième fichier de contenu** (ADR-079, migration `0016`), chargé,
isolé et versionné comme les six autres. Il porte l'ordre et les intitulés des sections, les colonnes
des tableaux, les intitulés d'annexes, les mentions, l'en-tête et le logo, la mise en page, et le
**schéma de référencement** — qui n'existait pas du tout, alors que c'est ce dont un réviseur se sert
pour savoir où les travaux ont été faits.

- **La frontière joue dans les deux sens** : un bloc nommé et non implémenté sortirait une section
  **vide** ; un bloc implémenté et non nommé **disparaîtrait** du papier. Les deux arrêtent
  l'assemblage. Idem pour une colonne sur un champ non relevé et pour une variable de référence
  inconnue — elle laisserait un trou, et une référence trouée ne se cherche pas dans un dossier.
- **La référence est calculée puis FIGÉE** : un papier signé garde la référence sous laquelle il a
  été signé, même si le cabinet change son plan de classement l'an prochain. Elle couvre aussi les
  papiers du pack SOX gelé — un cabinet ne tient pas deux plans de classement.
- **Ce qui ne se retire pas** : visas, version, empreinte de population. Leur place et leur libellé
  sont au cabinet ; leur présence non, parce que c'est ce qui rend le papier lisible **si OTTO
  disparaît**. Un logo chargé depuis une URL est refusé pour la même raison.
- **Deux défauts trouvés par la suite.** Une contrainte d'unicité disait le **contraire** de la règle
  voulue : elle empêchait deux versions d'un papier de partager leur référence, alors que la règle
  est « deux papiers différents ne la partagent pas ». Remplacée par une garde. Et `annexes` était un
  `Record<string, string>` : lire `parameters` au lieu de `parametres` rendait `undefined` et faisait
  échouer l'export loin de la cause — les annexes et mentions sont maintenant **typées nommément**.

**Coût réel : ~4½ séances contre les 3½ annoncées.** L'écart est le schéma de référencement, absent
de l'estimation parce qu'elle avait chiffré « rendre configurable ce qui existe » et non « rendre le
papier celui du cabinet ».

**Vérification** : 299 tests (286 → 299) · `tsc --noEmit` propre · 48/48 écrans en production.

## Application — tranche livrée : point 6, la taille par formule et la méthode là où elle s'exécute

**La formule attendait la population, et la population est le point 6** (ADR-080). `tailles_echantillon`
accepte désormais, par niveau, **soit un nombre, soit une formule NOMMÉE** avec ses paramètres —
`mus_intervalle_au_seuil`, facteur de confiance 3,0, bornes 20–80. La méthode nomme, le moteur
calcule : c'était la dernière des trois questions à trente secondes dont la réponse était « pas
aujourd'hui ».

**Trois refus plutôt que trois chiffres plausibles** : sans population la taille est `null` et
l'écran nomme l'obstacle ; une population ou un seuil nul lèvent ; le seuil lu est le seuil
**validé**, pas le dernier proposé. Le chiffre affiché **porte ses entrées** — population et seuil —
sous lui : P7 vaut pour une taille d'échantillon comme pour un montant.

**Une erreur de frontière, corrigée parce que la suite l'a fait tomber.** La première version
exigeait qu'un niveau **nomme chaque formule connue** — le « dans les deux sens » appliqué
mécaniquement. Cela aurait forcé chaque cabinet à utiliser toutes les formules que le moteur
implémente, donc laissé l'implémentation du produit **dicter la méthode**. Le contrôle bidirectionnel
est remonté d'un cran : entre le **schéma du produit** et le **moteur**, où il a un sens.
*« Dans les deux sens » vaut entre deux parties du produit ; entre le produit et la méthode d'un
cabinet, un seul sens est légitime.*

**La méthode s'affiche là où elle s'exécute** : le tableau « ce que ce risque commande » porte, pour
chaque procédure, sa **population** (prédicat et paramètres) et son mode de **sélection**, à côté de
la taille et de sa provenance. Une procédure sans population explicite est une intention, pas une
procédure.

**Vérification** : 306 tests (299 → 306) · `tsc --noEmit` propre · 48/48 écrans en production.

## Application — tranche livrée : la boucle comme objet (point 7)

Chaque maillon existait et était testé. **La boucle, elle, n'existait pas** : personne ne pouvait la
voir tourner, dire où elle bloquait, ni combien de tours elle avait faits (ADR-081). Un produit dont
la thèse est « la constatation circule » et qui ne montre pas la circulation demande qu'on le croie
sur parole.

- **Neuf étapes ordonnées** — sélection, demande, dépôt, lecture, rapprochement, écart,
  clarification, résolution, cumul — avec ce qui a **franchi**, ce qui est **arrêté là**, et **ce
  qu'on attend**, nommément. Jamais « en cours » : un écran qui dit « en cours » ne dit rien de ce
  qu'il faut faire ensuite.
- **Le chiffre qui compte est le nombre de TOURS** : les demandes **nées d'un écart**. Une file se
  parcourt une fois ; une boucle repart. Sans ce compteur, on montre une file en prétendant montrer
  un cycle.
- **Rien n'est stocké** — tout est dérivé, et un test vérifie qu'aucune table ne porte cet état. Un
  compteur tenu à part diverge un jour de ce qu'il compte.
- **Pas de pourcentage d'avancement** : le chiffre utile est « combien sont arrêtés ici ». Un
  pourcentage se regarde ; un blocage se traite.
- **Une correction de test, pas de code** : la première version supposait un compteur de tours à
  zéro. Il valait déjà 1 — le déroulé de démonstration fait tourner la boucle. Le test vérifie
  maintenant l'invariant, et qu'un nouveau tour le fait monter de un.

**Vérification** : 313 tests (306 → 313) · `tsc --noEmit` propre · **50/50** écrans en production
(le nouvel écran a été découvert seul par le balayage).

## Application — tranche livrée : l'acceptation commande le dossier (point 1)

Toute démonstration commençait **au milieu** d'un dossier. Un dossier ne commence pas par un import :
il commence par une **décision** d'accepter ou de maintenir la mission (ADR-082, migration `0017`,
`methodology/acceptation.json`).

- **La règle qui refuse** : aucun travail ne se planifie avant la décision — ni affectation, ni
  évaluation du risque. Le système refuse, il ne rappelle pas.
- **La nature se déduit** : acceptation en première année, maintien en renouvellement, et ce ne sont
  pas les mêmes questions. Une question dont la réponse est dans le dossier ne se pose pas.
- **« Bloquant » ≠ « interdit »** : une réponse défavorable exige un motif écrit, elle n'interdit
  rien. Un cabinet peut accepter une mission difficile ; il ne peut pas l'accepter sans le dire. Le
  motif de la décision est exigé **dans les deux sens**, en service et en base.
- **Chaque critère porte sa raison d'être**, affichée : sans elle, un questionnaire d'acceptation
  devient une formalité qu'on remplit sans la lire.
- **Le jalon d'assemblage se dérive** de la date de rapport par la règle du référentiel et ne se
  saisit pas — une date dérivée qu'on pourrait saisir deviendrait fausse le jour où quelqu'un la
  corrige. Un jalon sans date ne s'échoit jamais.
- **Un ordre de refus corrigé par la suite** : le garde d'acceptation passait avant celui
  d'isolation, donc quelqu'un visant le dossier d'un autre cabinet s'entendait répondre « faites
  accepter la mission ». Troisième fois que cette règle sert.

**La création du dossier**, l'autre moitié : un dossier se créait par le peuplement, donc jamais
devant personne. Il se crée maintenant depuis l'accueil, avec l'isolation vérifiée, le doublon
refusé (deux dossiers de même nature sur le même exercice feraient deux vérités sur les mêmes
comptes), et **la méthode en vigueur désignée à la création** — sans elle il naîtrait déjà cassé, et
personne ne saurait pourquoi. Un cabinet sans méthode publiée est refusé **en le disant**.

**Vérification** : 340 tests (313 → 340) · `tsc --noEmit` propre · 52/52 écrans en production.

## Application — tranche livrée : la reprise N-1 (point 2)

**On ne reprend pas des chiffres, on reprend des conclusions** (ADR-083, migration `0018`).

- **2a — un dossier N-1 RÉEL**, construit par les mêmes services que les clics : mission créée,
  acceptée, équipe avec déclarations signées, balance 2024 importée, périmètre décidé avec ses
  motifs, risque évalué, questionnaire rempli. Le fabriquer par insertions aurait produit un dossier
  qu'aucune règle du produit n'aurait accepté — et la reprise aurait repris **de la fiction**.
- **2b — rien n'est repris automatiquement.** Tout arrive **proposé**, avec sa source nommée, et une
  proposition non statuée est un **obstacle au visa**. C'est toute la différence entre une reprise et
  une recopie : la recopie ne bloque rien, parce qu'elle ne demande rien à personne.
- **Reconfirmer sans motif est permis ; écarter sans motif ne l'est pas** — reconfirmer, c'est dire
  « j'ai regardé et c'est toujours vrai » ; écarter sans motif est indistinguable d'un oubli.
- **La mission précédente se trouve par le chaînage des exercices**, pas par une date : un exercice
  de dix-huit mois casserait toute heuristique.
- **Un défaut de harnais révélé par les nouvelles données** : le résolveur de routes prenait
  `limit 1` sans ordre et choisissait parfois le dossier N-1 — vide de demandes et de papiers. Le
  choix va maintenant au dossier **le plus riche**. Un `limit` sans `order by` est une décision qu'on
  n'a pas prise.

**Vérification** : 352 tests (340 → 352) · `tsc --noEmit` propre · **54/54** écrans en production.

## Application — tranches livrées : pointage des états financiers (9) et obstacles au visa (8)

**Le pointage** (ADR-084, migration `0019`). Tous les travaux servent à conclure sur des états
financiers, et rien ne rattachait un chiffre de la plaquette à ce qui le fonde. **On pointe le
montant présenté, pas le sien** — recalculer et comparer à son propre calcul vérifie qu'on sait
additionner. Trois natures : deux se **calculent** (solde de balance, agrégat de comptes), la
troisième se **justifie** — un effectif moyen ne vient d'aucun compte, donc explication écrite **et
pièce liée**, ou la ligne reste ouverte. La nature se **déclare** : la deviner produirait un pointage
plausible et faux, pire qu'un pointage absent. Le statut est **dérivé** du calcul, et un écart sans
explication reste **ouvert**.

**Les obstacles au visa** (ADR-085). Chaque tranche avait ses blocages sur son propre écran : un
signataire qui doit visiter huit écrans finit par signer sans les avoir tous vus. Une **seule liste**
interroge maintenant chaque service qui connaît un blocage, et chaque obstacle dit **où aller le
lever**. Rien n'est stocké — un test vérifie qu'aucune table ne porte cet état et que la liste est
bien la réunion de ce que chaque service refuse. Le corollaire est écrit : **un obstacle qui n'y
figure pas n'en est pas un**. Un dossier non accepté n'affiche **que** cet obstacle-là.

Et ce que la page **n'affirme pas**, dit à l'écran : « aucun obstacle » ne veut pas dire que le
dossier est bon — il veut dire qu'aucune règle ne le refuse. Le jugement reste au signataire.

**Vérification** : 372 tests (352 → 372) · `tsc --noEmit` propre · **58/58** écrans en production.

## Application — tranches livrées : achèvement (10), clôture branchée (11), les trois retardataires

**L'achèvement** (ADR-086, migration `0020`) — les travaux qu'un inspecteur regarde en premier après
une défaillance. **Ce ne sont pas des cases à cocher : chaque règle est une DATE.** Des événements
postérieurs arrêtés avant le rapport → le refus **nomme la période non couverte**. Une lettre
d'affirmation datée avant le rapport → refusée. Une lettre **sans la lettre** → refusée, *c'est une
lettre, pas une conversation*. Et elle ne se déclare pas « sans objet » : *une mission sans lettre
d'affirmation n'est pas allégée, elle est incomplète.*

**Le branchement sur la clôture** (point 11). `sealFile` ne vérifiait que la conclusion sur les
anomalies — le dernier verrou d'une porte à huit serrures. Sceller un dossier sans lettre
d'affirmation produisait **une archive complète d'un dossier incomplet**, et l'archive est
définitive. La clôture demande maintenant **LA** liste d'obstacles, celle que l'écran affiche.

**Trois défauts de mon propre code, trouvés par le parcours complet** : une **jointure décorative**
qui donnait la boucle du chiffre d'affaires à seize postes (*une jointure qui ne joint rien est pire
qu'une jointure absente : elle a l'air d'être là*) ; un **jalon qu'on ne pouvait pas cocher**, donc un
retard fabriqué par l'outil ; et une **file qui se débouchait d'un cran** — un élément sorti par une
explication ou une limitation consignée l'a quittée pour de bon, à toutes les étapes.

**Les trois retardataires** (ADR-087) — déclarés dans la méthode, jamais calculés :
**l'ancienneté** se compte en exercices consécutifs (une rupture casse le compte) ; **la
familiarité** exige une sauvegarde et n'interdit pas ; **la rotation** ne porte que sur les habilités
à signer et son dépassement bloque ; et **`raiseFactor` est enfin appelé** — la résolution d'un écart
peut lever un facteur qui vise d'autres sections, ce qui fait de « la constatation circule » autre
chose qu'une phrase.

**DEMO_APP.md** : la mission entière en quinze étapes, avec `tests/parcours.test.ts` qui la rejoue —
de l'acceptation à l'**archive scellée**, par les mêmes services que les écrans.

**Vérification** : 403 tests (372 → 403) · `tsc --noEmit` propre · **60/60** écrans en production ·
`npx vitest run ../tests/parcours.test.ts` va jusqu'au dossier clos.

## Convergence prototype → application

`docs/11_CONVERGENCE.md` : les onze points de la mission simplifiée, chacun marqué
**existe / portage / neuf**, avec **l'ordre retenu** — 5 + méthodologie-comme-donnée → 6 → 7 → 1 →
2 → 9 → 10 → 8 → 11 — et le total honnête : **26 à 30 séances**, au-dessus des 20–24 estimés
d'abord (le dossier N-1 à reprendre n'était pas chiffré, et l'ancienneté/rotation s'ajoute). En résumé : trois points sont finis, deux à
moitié ; le seul chaînon vraiment manquant est le **risque par assertion qui commande** les
procédures et l'étendue ; et la **boucle requête ↔ documentation** n'est pas du code neuf mais de
l'assemblage à rendre visible.

Règle de cadrage retenue : **les procédures sont du contenu, la mécanique est le produit** — aucun
cycle au-delà du chiffre d'affaires.

## Prochaine tranche — dans l'application, plus dans le prototype

**Équipe et indépendance en premier**, avant le cycle chiffre d'affaires. La raison n'est pas
l'ampleur : c'est la tranche qui **force l'isolation par cabinet dès la première migration** —
`firm_id` sur chaque table, RLS, notion d'utilisateur — là où le CA la contournerait et obligerait à
tout reprendre. Elle est petite mais complète (déclaration signée, révision qui empile sans écraser,
refus d'affecter), et elle produit une règle qui **refuse** : c'est ce qui se teste de bout en bout le
plus honnêtement. Le CA est plus spectaculaire mais repose sur des moteurs déjà écrits et testés côté
application ; il gagne à venir en second, sur des fondations d'isolation éprouvées.

Ce que la tranche doit porter : migration SQL, isolation par cabinet vérifiée par un test qui
**tente** la fuite, persistance réelle, écran, et acceptation de bout en bout.

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

## Tranche 9 close — la densité MESURÉE, le lexique appliqué, et une mesure qui refuse (2026-08-31)

**Chaîne verte, code 0** (`cd app && npm run verify`, base fraîche) : **511 tests** (58 fichiers,
zéro réseau) · **75 routes** ouvertes 0 échec · **70 écrans mesurés**, 0 au-delà de 5 actions
primaires, **71 champs à taper** au total (`docs/DENSITE.md`) · **135 étapes cliquées** 0 échec,
**262 clics** comptés sur 34 gestes (`docs/CLICS.md`) · **280 vues** regardées 0 défaut. Et
`npm run mesure:testing` : « Entrée atteste la ligne ouverte — OUI (1 → 0 en attente) ».

La tranche s'était close une première fois sur trois affirmations. Un sous-agent **hostile**
(mandat v1.1 §8.5) les a cassées toutes les trois en une passe, et il avait raison :

- le tableau de densité publié annonçait `0 | 0` sur des écrans qui portent des boutons
  inconditionnels — **le chiffre publié était faux** ;
- « ≤ 3 clics depuis **Mes travaux** » se mesurait depuis un écran qui **n'existait dans aucun
  fichier** (zéro occurrence dans `app/src`) ;
- `docs/LEXIQUE.md` marquait **sept** règles ✓ pour **quatre** implémentées.

Ce que la correction a changé (ADR-110, DA-13, DA-14) :

1. **La mesure REFUSE plutôt que de publier.** `npm run densite` s'arrête et n'écrit rien sur :
   statut HTTP inattendu, page sans titre lu, commande que personne ne peut atteindre, marqueur
   d'exclusion non déclaré, port déjà occupé (mesurer un serveur qu'on n'a pas lancé ne mesure
   rien, ADR-076), `BUILD_ID` qui change pendant la mesure. Quatre silences, chacun capable de
   produire le tableau faux ; aucun ne pouvait être vu.
2. **Ce qui est exclu du critère est publié à côté du critère** : colonnes « Repliées » et
   « D'item », et les écrans qui excluent des gestes le **déclarent avec leur raison**, dans le
   code qui mesure et dans le document. Les champs sont comptés même repliés.
3. **Un lien peint en bouton est un bouton** (`a.btn`, `input[type=submit]`, `[role=button]`),
   `select` est un champ, le **portail client** est mesuré : 70 écrans au lieu de 67 — et un vrai
   dépassement est apparu (`/methodology`, 10 actions), traité.
4. **« Mes travaux » est construit** plutôt que le critère raboté : écran dérivé (notes adressées,
   papiers dont le prochain visa manque, demandes échues), lien constant dans le bandeau, et le
   parcours **compte** les clics jusqu'à l'objet.
5. **Le lexique cesse de mentir sur lui-même** : le test extrait le texte LU (nœuds JSX, attributs
   de libellé, chaînes-phrases des services), juge la **langue du texte** et non celle du fichier,
   exclut le vocabulaire d'entrée de la recherche, applique **sept** règles. Prises : « Engagements »
   → **Missions** (accueil + fil d'Ariane), `<th>Justificatif</th>` → **Pièce**, « Feuilles de
   travail » → **Papiers de travail** au catalogue, en-tête de périmètre francisé, foyer de mission
   francisé. La ligne « écart / anomalie » **perd son ✓** : deux concepts qu'un test de mots ne
   départage pas.
6. **Le clavier est éprouvé**, plus seulement promis. ADR-104 annonçait « ↑/↓ change de ligne,
   Entrée atteste » depuis deux tranches sans qu'aucun harnais ne presse une touche. Le parcours
   presse désormais **↓ et ↑** dans l'atelier ; **Entrée** se prouve par `npm run mesure:testing`
   — le seul monde qui porte une lecture EN ATTENTE (celui du parcours lit tout par échelons
   déterministes, et le dit au lieu de compter une preuve qu'il n'a pas faite). Le banc y gagne
   au passage sa cohérence : son modèle KLM décrit une FRAPPE, et il cliquait la souris.
7. **Les clics sont publiés** (`docs/CLICS.md`, engendré par `npm run clics`) : un compteur posé
   DANS la page écoute les vrais événements de clic, geste par geste. Le document dit ce que le
   chiffre n'est pas — le chemin optimal — parce que le parcours clique aussi exprès ce qui doit
   être refusé.
8. **Les gestes que personne ne cliquait sont cliqués** : les deux exports du papier (le PDF était
   devenu inatteignable depuis son passage en repli — le harnais ne dépliait pas) et l'édition
   motivée d'une section. Et un repli qui cache une action **le dit** (classe `repli-action`).

**Deux défauts que la station « Mes travaux » a fait sortir en se plaçant** (le genre qu'on ne
trouve qu'en conduisant) : le dossier SCELLÉ refuse toute écriture — poser une note après la
clôture est refusé, le produit a raison, c'était la station qui était mal placée ; et la station
de clôture n'annonçait PAS son identité — elle héritait de celle laissée par la précédente, si
bien qu'intercaler une station a suffi pour qu'un préparateur sans droit de signature ne voie
aucun bouton et que le parcours conclue « le dossier n'est pas scellé » avec zéro obstacle. Une
station qui dépend de ce que la précédente a laissé mesure l'ordre du fichier ; elle dit
désormais qui elle est.

**Ce que je n'ai PAS fait dans cette tranche, exhaustivement.** Le comptage de clics par tâche du
mandat n'est pas un tableau des 10 tâches nommées : c'est le coût mesuré des **gestes du parcours**,
qui n'est pas le chemin optimal (dit dans le document). L'accessibilité clavier est éprouvée sur
l'atelier **seulement** — pas sur les autres écrans. La francisation des écrans hérités
(rapprochement, périmètre, seuils, papier) reste un chantier ouvert : le test ne police que le texte
français, un libellé anglais lui est invisible par construction, et c'est écrit dans LEXIQUE.md. La
mesure ne juge ni la lisibilité ni l'ordre de lecture — elle compte.

## Point 3 — les circularisations : banques et avocats, de bout en bout (2026-08-31)

**Chaîne verte, code 0** (`cd app && npm run verify`) : **529 tests** · **78 routes** · **72
écrans mesurés**, 0 au-delà de 5 actions, 71 champs à taper · **144 étapes cliquées** 0 échec,
270 clics sur 35 gestes · **288 vues** 0 défaut.

Le fondateur décrivait une file d'agents IA ; ce qui est livré est une **mécanique
déterministe** (ADR-111) — aucun modèle n'y est nécessaire (P4), et ce sont ses refus qui
travaillent :

1. **Le listing du client est une pièce**, importée avec la sévérité des autres imports ;
   réimporter ne rase pas ce qui est parti.
2. **La complétude se dérive dans les DEUX sens**, contre le poste du pack (trésorerie,
   provisions) — jamais contre un préfixe « 512 » écrit en dur.
3. **L'envoi est simulé et le dit**, et il exige un contact client clé déclaré.
4. **On ne reçoit pas une confirmation qu'on n'a pas demandée** ; la réponse est une pièce,
   sa lecture est humaine.
5. **Le rapprochement est dérivé** : côté banque tout écart se dit, côté avocats le seuil de
   remontée décide.
6. **Un écart se justifie par écrit** — « RAS » est refusé — et c'est cette phrase qui lève
   l'obstacle au visa.
7. **Onzième famille d'obstacles** ; aucune campagne ouverte = aucun obstacle.

Le monde de démonstration porte **exprès** un listing incomplet (le compte `512100` rattaché
à un `512900` inexistant, un `512200` qu'aucune écriture ne porte) : la complétude a quelque
chose à trouver, et la fin de mission mène la campagne à son terme — sinon le dossier ne se
scelle pas.

**Trouvé en conduisant, pas en planifiant** : le séparateur de milliers français est une
espace **insécable** — « 1 250,00 » cherché avec une espace ordinaire ne matche jamais ce que
l'écran affiche (même famille que le mot capitalisé par le CSS, règle 15). Le détail d'étape
rapporte désormais la valeur **lue**, jamais une phrase fixe.

**Ce que je n'ai pas fait** : aucune réponse d'avocat n'est semée (la mécanique est la même
et testée ; la démonstration cliquée porte sur les banques) ; la complétude côté avocats se
juge sur les comptes de provisions, pas encore sur les honoraires versés à des cabinets
absents du listing ; rien ne part réellement — le transport est simulé et le dit.

## Revue utilisateur n°1 — les deux bugs, et la leçon qui compte (2026-08-31 → 09-01)

Premier test par un auditeur réel sur la plateforme déployée. Vingt-cinq remarques, cinq
principes, deux bugs, trois manques : tout est au registre, section F (R-01..R-14).

**Le diagnostic est accepté sans réserve** — *la plateforme s'explique au lieu de se laisser
utiliser* — et devient une règle générale : **si une phrase à l'écran explique POURQUOI le
produit est fait ainsi, elle sort.** Elle va dans un ADR ; jamais dans le flux de travail.

**Les deux bugs avaient UNE cause, et elle était invisible d'ici.** Les journaux d'exécution
de Vercel : `methodology/valider.mjs introuvable` sur `/acceptance` (digest 1111597534),
`/team` et `/obstacles`. `next.config` traçait `dataset/fixtures`, `dataset/sox` et
`supabase/migrations` — pas `methodology/`, que l'application IMPORTE depuis le disque à
l'exécution. Le commentaire de ce fichier annonçait pourtant le risque, mot pour mot.

**La leçon (DA-16)** : 534 tests, 79 routes et 144 étapes cliquées passaient au vert pendant
que trois écrans rendaient 500 en ligne. La chaîne tourne sur PGlite, avec le dépôt entier
sur le disque ; le déploiement tourne dans une fonction qui n'emporte que les fichiers
déclarés, sur un Postgres réseau. **Deux exécutions différentes** — et c'est la seconde que
le fondateur ouvre. D'où, désormais :

- `npm run fumee [-- <url>]` — le balayage de FUMÉE : statut attendu, absence de page
  d'erreur, **titre lu**. Sans URL il lance un serveur de production local (il est donc DANS
  `npm run verify`, et le chemin est prouvé) ; avec une URL il éprouve le déploiement, et il
  REFUSE de conclure si la protection Vercel répond à sa place.
- `/api/sante` — les lectures de chaque famille d'écrans exécutées DANS la fonction
  déployée, en un appel. Vérifié en production après correctif : **« toutes les lectures
  passent »**, dont « méthode du cabinet (methodology/valider.mjs) ».
- `deploiement-traces.test.ts` — le test qui lit le CODE qui lit des fichiers et la
  CONFIGURATION qui les trace, et échoue quand le premier dépasse la seconde.

**Et un défaut que le harnais a trouvé sur moi** : le middleware `?comme=` tournait sur
CHAQUE requête pour n'y rien faire. Inerte en apparence — l'erreur d'hydratation #418 (fil
n°7) est revenue sur deux écrans dès son ajout, et a disparu dès que le matcher a été
restreint aux URL qui portent le paramètre (2 exceptions → 0, mesuré). Même leçon que le
layout racine : ne pas faire varier ce que le rendu voit.

## P3 + P4 — la charpente : rail vertical, navigation PAR POSTE, vue d'ensemble qui sert (2026-09-01)

**Pourquoi cette tranche existe.** La revue utilisateur n°1 n'a pas cassé le contenu, elle a
cassé le **cadre** : « onglets en haut », « vue d'ensemble inutile ». Tuan a déplacé le point
d'arrêt ici, avant la création de dossier et la verticale chiffre d'affaires : *si la charpente
est fausse, tout ce qu'on bâtit dessus est à refaire*.

**Ce qui a changé, à l'écran.**

- **Le rail est vertical et groupé** (ADR-112) : Le dossier · Les comptes · **Les postes** ·
  Travaux transverses · Demandes au client · Fin de mission. La règle ADR-103 est intacte —
  une destination n'apparaît que quand l'état du dossier la rend atteignable, le reste est
  grisé avec sa raison derrière « tout afficher ».
- **Un poste retenu = une destination** (`/eng/<id>/poste/<code>`), avec les six étapes dans
  l'ordre où on les travaille : leadsheet → processus → contrôle interne → évaluation des
  risques → échantillon → contrôle sur pièces. Chaque étape porte des CHIFFRES dérivés et un
  lien vers l'endroit où l'on agit. Population, sondage, testing, risque, boucle, papiers et
  provenance **quittent le rail** : ce sont des étapes d'un poste, pas des sections.
- **La vue d'ensemble est un tableau de bord, et d'abord le MIEN** : ce qui m'attend (même
  dérivation que « Mes travaux », restreinte au dossier), l'avancement par poste en barres
  colorées par statut, demandes et papiers, ce qui empêche de signer par famille, qui porte
  quoi dans l'équipe, notes de revue ouvertes rédigées.
- **Le vocabulaire vient du pack** (DA-15) : « Matérialité », « Scoping », « Ce qui empêche de
  signer ». Le pack porte un bloc `vocabulaire`, les écrans le lisent, et la règle du lexique
  s'est retournée : ce n'est pas « le mot est libre », c'est « le mot vient du pack, et un
  écran n'en mélange jamais deux pour un concept ».
- **« Remettre le monde de démonstration à zéro »** est un geste du produit (DA-17), visible
  seulement en démonstration publique : un écran de confirmation qui CHIFFRE ce qu'il efface
  (aujourd'hui / après, ligne par ligne) et la date de l'instantané qu'il restaure. Il ne
  rejoue pas le semis — dix minutes sur la base réseau, aucune fonction serverless ne vit
  aussi longtemps : il restaure l'instantané pris au déploiement, en une transaction.

**Les trois gardes que cette tranche ajoute, et le défaut qui les a produits.**

1. **Aucun écran de dossier injoignable.** Réorganiser une navigation, c'est retirer des
   entrées ; une entrée retirée dont l'écran n'est repris nulle part devient un objet qu'aucun
   chemin de lecture n'atteint, et rien ne le signale. `rail.test.ts` lit l'arborescence des
   routes sur le disque et exige : rail, poste, ou déclaration écrite avec la destination.
2. **Aucun composant client n'emporte la base dans le navigateur.** Le rail vertical est un
   composant client ; un `import { GROUPES } from 'services/rail'` — valeur, pas type — a
   suffi à tirer `pg`, donc `net`/`tls`/`dns`, dans le bundle. Le build de production a échoué
   et, en développement, **73 écrans ont rendu 500 d'un coup**, y compris le portail client.
   `client-serveur.test.ts` suit désormais le GRAPHE des imports depuis chaque `'use client'`.
   Éprouvé en le cassant exprès : il rend la chaîne `nav.tsx → services/rail → lib/db/client`.
3. **Un harnais qui sait le DIT.** Le balayage a annoncé « 73 écrans ne rendent pas » — vrai et
   inutilisable : la cause tenait en une ligne (`Module not found: Can't resolve 'net'`) et
   dormait dans le journal du serveur, qu'une assertion plus loin aurait imprimée.
   `causeServeur()` joint maintenant ce que le serveur a dit à la liste de ce qui est cassé.

**Ce que je n'ai PAS fait, et qu'il faut lire avant de croire l'écran.**

- **P1 (création de dossier) et P2 (toute donnée manquante engendre une demande)** ne sont pas
  faits : c'était le point d'arrêt demandé.
- **Le lien poste ↔ cycle de processus n'est pas modélisé.** L'étape « Processus » d'un poste
  montre ce qui est décrit sur le DOSSIER et laisse l'auditeur juger. Inventer un rattachement
  aurait été pire que l'avouer.
- **« Qui doit poser quel visa » n'est toujours pas un droit modélisé.** Le tableau de bord ne
  montre par personne que les deux attributions nominatives réelles : notes reçues, notes
  posées. Il n'y a pas de troisième colonne parce qu'il n'y a pas de troisième vérité.
- **`services/query` (Interroger) porte encore « matérialité » en dur** : ce service ne reçoit
  pas le référentiel du dossier. Écrit dans le code, à l'endroit exact, et au registre.
- **Les écrans `materiality` et `scoping` restent en anglais sous leur titre** : seul le titre
  a suivi le pack. La francisation complète est le chantier M-13, pas cette tranche.
- **Le contrôle interne et le processus sont séparés dans la NAVIGATION**, pas encore dans le
  contenu : deux écrans qui existaient déjà, désormais à deux entrées distinctes.
- **Les trois manques de la revue** (test des écritures NEP 240, intragroupe, ajustements du
  client) ne sont pas ouverts ; le point-par-point R-14 non plus.

**La chaîne, verte, et la commande qui la rejoue.** `cd app && npm run verify` —
**546 tests** (65 fichiers) · **81 routes** balayées sur un build de production, 0 échec ·
**47 routes de fumée**, 0 échec · **73 écrans mesurés**, 0 au-delà de 5 actions primaires,
71 champs à taper · **146 étapes cliquées**, 0 échec, 270 clics sur 35 gestes ·
**296 vues regardées** (clair/sombre, large/390 px), 0 défaut.

*Comment elle a été passée ici, et pourquoi c'est dit* : ce bac à sable suspend un processus
d'arrière-plan dès que l'agent n'exécute plus rien, ce qui fait mourir un `npm run verify` de
quinze minutes en une seule commande. Les étapes ont donc été lancées **dans l'ordre de
`verify`, sur le même monde semé**, une commande par étape. `npm run verify` reste LA commande
qui rejoue l'ensemble sur une machine ordinaire.

**La preuve au bout de la chaîne — dans la fonction déployée, pas ici** (DA-16). Base de
production RASÉE puis reconstruite par le build (Tuan l'a autorisé : « je n'ai rien investi
dans les données en ligne »). `/api/sante` interrogée sur `otto-dit-imperator080599.vercel.app`,
HTTP 200, verdict « toutes les lectures passent » — dont, exécutées DANS le lambda :
`rail de destinations : 24 éléments` · `vue d'ensemble (tableau de bord par personne) :
1 poste · 13 obstacles · 3 membres` · `espace de travail d'un poste : REVENUE · 3 comptes ·
6 étapes` · `instantané du monde de démonstration : pris le 2026-09-01 09:56:55+00`.

**Ce que je n'ai PAS pu faire, et qui n'est pas un détail** : ouvrir moi-même un écran de
l'instance déployée. La protection d'accès Vercel reste ACTIVE (décision de Tuan, point 2) et
intercepte toute page par une redirection SSO ; seule `/api/sante` a répondu. La preuve tenue
est donc la RÉPONSE d'une sonde qui exécute les lectures de chaque écran dans la fonction —
pas une capture. Le jour où la protection sera levée, `npm run fumee -- <url>` ouvrira les
écrans eux-mêmes.

## Revue n°2 — détenir ≠ répondre de, l'IPE, les XREF, et la langue qui vient du cabinet (2026-09-01)

**Les deux manques du périmètre, d'abord.**

- **P4 est fait** : la vue d'ensemble porte deux graphiques (avancement des sections, état des
  notes de revue), **My assignments** en quatre listes qui ne se recouvrent pas, la vue par
  membre, et ce qui empêche de signer. Le modèle qui le rend possible est la décision de fond
  de cette tranche (ADR-113) : *détenir* et *répondre de* sont **deux attributs**, pas deux
  filtres du même champ — sans quoi les deux listes montrent la même chose et personne ne s'en
  aperçoit.
- **La règle générale est appliquée** là où le rail avait été refait : « Le travail sur ce
  poste » et « La boucle » supprimées, les trois paragraphes explicatifs d'Acceptation et celui
  des contacts retirés, le *pourquoi* de chaque critère d'acceptation passé en infobulle. La
  DONNÉE reste : c'est elle qui empêche un questionnaire d'acceptation de devenir une
  formalité. **« Papiers de travail » ne subsiste plus** : les papiers se lisent en XREF sur la
  leadsheet.

**La langue est une donnée du CABINET** (ADR-114) : catalogue de libellés par locale, anglais
par défaut, français servi aux cabinets français. Le mécanisme entre **avant** la verticale
profonde, parce qu'un catalogue introduit après trois cents libellés se paie deux fois ; les
écrans migrent quand ils sont touchés.

**L'IPE est un bloc de chaque papier, et il BLOQUE** (ADR-113, migration 0031) : nature,
exhaustivité, exactitude, date, pertinence et **le fichier désigné parmi les objets du
dossier** — la contrainte est en base, pas seulement à l'écran ; ne pas répondre lève la
onzième famille d'obstacles au visa. La rédaction est **proposée** à partir des faits saisis,
marquée « à revoir », et n'entre au dossier que validée par un humain (L2).

**La chaîne, verte, et la commande qui la rejoue.** `cd app && npm run verify` —
**567 tests** (68 fichiers) · **81 routes** balayées en production, 0 échec · **47 routes de
fumée**, 0 échec · **73 écrans mesurés**, 0 au-delà de 5 actions primaires, 86 champs à taper ·
**146 étapes cliquées**, 0 échec, 272 clics sur 35 gestes, aucune exception navigateur ·
**296 vues regardées**, 0 défaut. Les étapes ont été lancées dans l'ordre de `verify` sur le
même monde semé (ce bac à sable suspend un processus d'arrière-plan dès que l'agent n'exécute
plus rien).

**Deux défauts que cette tranche a produits et corrigés, parce qu'ils se sont VUS :**
le repli des groupes du rail levait une exception par bascule (`currentTarget` déjà libéré dans
le calcul différé) — invisible tant qu'on ne clique pas, mesurée par `npm run clics` ; et les
tableaux d'attributions faisaient défiler le CORPS de la page (une colonne de grille se
laissait élargir par son contenu) — mesuré par `npm run visuel`, corrigé par `min-width: 0`
sur les colonnes de grille.

### Ce que je n'ai PAS fait — exhaustivement

- **P1 et P2 ne sont pas faits**, et c'est un ÉCART À L'ORDRE DEMANDÉ, assumé et nommé :
  l'ordre était « les deux manques → le catalogue → P1 + P2 → la verticale ». Le point d'arrêt,
  lui, se juge sur les cinq points du §6 de la revue — dont deux (leadsheet avec XREF, papier
  avec IPE) appartiennent à la verticale. Livrer P1+P2 avant la verticale aurait donné un arrêt
  qui échoue à son propre critère. J'ai donc fait A → catalogue → verticale, et laissé P1+P2.
- **La migration de langue est partielle** : rail (groupes et destinations), vue d'ensemble,
  poste, bloc IPE. Le reste des écrans porte encore ses libellés en clair, **y compris les
  infobulles du rail** — un rail dont les titres sont anglais et les infobulles françaises.
- **Acceptation en trois sous-sections** (décision de maintien, background check par adaptateur,
  rotation des associés) n'est pas faite. Les jalons sont **repliés, pas supprimés** : les
  supprimer laisserait le geste « marquer un jalon fait » sans écran et l'obstacle « jalons »
  sans destination.
- **Équipe et indépendance** n'est pas réduite ; l'attestation reste ce qu'elle est (pas de
  signature électronique qualifiée, et le mot n'est pas employé).
- **Les contacts de mission** restent dans Réunions : les déplacer sans la section client de P1
  casserait l'envoi des circularisations, qui exige un contact clé.
- **« Reprise du dossier N-1 »** n'est pas supprimée (elle part avec P1).
- **Le background check et la rotation des associés** ne sont pas commencés — et quand ils le
  seront, l'un sera un adaptateur de fournisseur, l'autre un paramètre de pack vérifié sur
  texte primaire et daté. Aucune durée de rotation n'a été écrite de mémoire ici.
- **Les trois manques de la revue n°1** (test des écritures NEP 240, intragroupe, ajustements)
  restent ouverts.

## Revue n°3, point 1 — la langue, jusqu'au bout : cinq angles morts de la règle (2026-09-01)

**Le point 1 de la revue n°3 était « plus une seule chaîne hors catalogue, et un test qui échoue
s'il en reste une ». Il était annoncé fait. Il ne l'était pas** — et ce n'est pas la migration
qui manquait, c'est l'instrument qui regardait à côté, pour la cinquième fois.

**Les cinq angles morts, chacun trouvé sur un exemple RÉEL, chacun devenu un cas connu mauvais :**

| angle mort | ce qui passait au travers | où |
|---|---|---|
| entité HTML | `&amp;` porte un point-virgule, et le filtre qui écarte le code écartait la phrase | `Approve & send (L2)`, le bouton qui envoie une demande au client |
| nom de touche clavier | « Control » figurait dans la liste des touches, appliquée à un nœud JSX | en-tête de la première colonne du RCM |
| ternaire affiché | les deux branches partaient dans le seau des LITTÉRAUX | `{m.can_sign ? 'oui' : 'non'}` |
| moins de deux lettres | le tout premier filtre exigeait deux lettres de suite | `> 90 j (N)` — « j » pour jours |
| **le catalogue lui-même** | la règle compte ce qui ne passe PAS par lui, donc ne lit jamais ce qu'il contient | **sept entrées avec `en` et `fr` ÉCHANGÉS** |

**Le cinquième est le plus grave, et il était en production.** `'mat.seuilDeSignification':
{ en: 'Seuil de signification', fr: 'Materiality threshold' }` : sur l'instance anglaise —
l'anglais est le défaut du produit — l'écran des seuils affichait « Seuil de signification »
à côté de « Materiality » pour le même concept, plus le testing et trois endroits du papier de
travail. **La façon la plus simple de rendre une phrase française invisible à la règle était de
l'écrire dans la colonne `en`.** Les sept sont remises à l'endroit ; deux paires devenues
doubles ont fusionné.

**Sixième angle mort, d'une autre nature : les services.** Un écran irréprochable peut afficher
du français s'il rend une table de libellés tenue dans un service. `NOTE_TYPES` portait « à
corriger (bloquante) » et deux écrans l'affichaient tel quel. La règle suit désormais le libellé
jusque dans `src/lib` : une propriété qui s'APPELLE un libellé tient une **clé**, jamais une
phrase. Vingt-sept relevés, sept migrés, **vingt et un différés avec leur raison écrite et leur
compte publié** (texte écrit-puis-stocké ; phrases qui côtoient du contenu de pack français).

**Ce que le parcours cliqué prouvait, et ce qu'il ne prouvait pas.** Il lisait le catalogue en
**anglais en dur**. Sur une instance française, ses stations de PRÉSENCE échoueraient bruyamment
— on le verrait — mais ses **onze stations d'ABSENCE** (« plus aucune note ouverte », « la
clôture n'est pas offerte ») passeraient en prouvant exactement rien. Il relève maintenant
`<html lang>` au premier écran, le sert à ses sélecteurs, et **vérifie sur cet écran** qu'un
libellé de cette langue s'affiche vraiment ; les absences se comptent sur les **deux** libellés.
Vingt-sept sélecteurs recopiés à la main passent par le catalogue — dont **neuf** cherchaient un
libellé français (`Statuer` ×7, `arbitrer` ×2) sur une instance anglaise, donc n'accrochaient
rien.

**Et une station du parcours ne peut plus s'éteindre en silence** (`docs/PARCOURS.json`) : une
garde STATIQUE dénonce une station retirée ou renommée du code, une garde D'EXÉCUTION dénonce
une station figée mais jamais conduite. Trois pièges étaient armés et sont désarmés : un nom
construit figé sur son DÉBUT avalait les six stations voisines ; figer sur un parcours *vert*
n'est pas figer un parcours *complet* (les 35 stations déclarées et jamais atteintes sont
écrites dans le figé, sous leur nom) ; et une garde au figé vide rendait une liste vide qui se
lisait comme un succès — le défaut qu'elle existe pour attraper, appliqué à elle-même.

**L'instantané des lectures comptait des clés de catalogue.** 1 083 des 2 316 « chemins de champ
rendus » étaient le suffixe d'une clé (`t('proc.conservationJusquAu')` contient un point).
Mesuré dans cette tranche même : renommer une clé faisait crier le garde comme si un écran avait
cessé d'afficher une donnée. Il tombe à **1 328 chemins dans 74 écrans**, et redevient relisible.

**La chaîne, verte, et les commandes qui la rejouent.**
`npm test` · **577 tests** (70 fichiers) · `npm run langue` **0 chaîne d'écran hors catalogue,
0 libellé en dur dans un service**, 21 différés avec raison, 13 messages de refus ·
`npm run langue:epreuve` **12/12** · `npm run lectures` **0 lecture perdue sur 1 328** ·
`npm run lectures:epreuve` **6/6** · `npm run parcours` **182 stations, 0 perdue** ·
`npm run parcours:epreuve` **5/5** · `npm run screens` **81 routes, 0 échec** ·
`npm run fumee` **47 routes, 0 échec** · `npm run densite` **73 écrans, 0 au-delà de 5 actions,
78 champs à taper** · `npm run clics` **148 étapes, 0 échec, 271 clics sur 36 gestes**, garde du
parcours **147 stations figées vérifiées** · `npm run visuel` **296 vues, 0 défaut**.

### Ce que je n'ai PAS fait — exhaustivement

- **Les points 2 à 5 de la revue n°3 ne sont pas faits** : notes de revue sur tout écran (la
  migration `0032` est écrite ET APPLIQUÉE localement, mais aucun écran ne pose encore une note
  d'écran ni ne distingue les deux natures), chat en fenêtre, P4 terminé, processus et contrôle
  interne semés sur le poste revenue. Le point 1 a coûté toute la tranche parce qu'il était faux.
- **Deux des sept inversions du catalogue échappent encore à la règle** — « Joindre » contre
  « Attach » n'a ni mot-outil ni accent. Le test le dit et le compte (5/7 sur les sept cas réels)
  plutôt que de laisser croire à une règle complète ; les deux ont été trouvées à l'œil.
- **Vingt et un libellés de service restent en français**, chacun avec sa raison écrite : un
  texte ÉCRIT PUIS STOCKÉ (réponse d'OTTO dans une note, interprétation figée d'une colonne) ne
  se relit pas dans une autre langue — la langue s'y décide à l'écriture, ce qui demande que le
  service reçoive la locale. Chantier nommé au registre.
- **Des phrases françaises construites par concaténation dans les services** (la justification
  d'un sondage, deux messages de circularisation) échappent aux DEUX règles : elles ne sont ni
  dans un écran, ni dans une propriété nommée « libellé ». Nommé au registre, pas corrigé.
- **Trente-cinq stations du parcours sont déclarées et jamais conduites** sur un parcours vert.
  La plupart sont des branches d'échec (« aucun papier dans le dossier ») ; deux `if` sans `else`
  ont reçu une voix, les autres n'ont pas été examinées une par une.
- **`ANCRE_KINDS` est exporté et lu par personne** — un objet créé qu'aucun chemin de lecture
  n'atteint (règle 13). Nommé au registre.
- **P1, P2, la verticale complète avec P5, l'IPE sur chaque papier, les modèles de papier par
  procédure et le test des écritures NEP 240** restent entiers.

## Mandat de nuit — Groupe 0 : l'URL déployée est prouvée, et par qui (2026-09-01, nuit)

**Ce qui était vrai avant cette nuit.** La chaîne tournait sur PGlite, en superutilisateur, sur
la machine de développement ; la production tourne sur Supabase par un pooler de transaction,
sous `postgres` — un rôle **BYPASSRLS**. Personne ne mesurait la seconde exécution : trois 500
et sept libellés inversés ont coexisté avec 577 tests verts. La protection « Vercel
Authentication » que STATUS annonçait active est **levée** (API Vercel, mesuré) : l'URL s'ouvre
sans compte.

**Ce qui est mesuré maintenant, et où le fondateur le lit :**

| preuve | où | mesuré le 2026-09-01 |
|---|---|---|
| bloc d'assertions rôle / RLS contre la base réseau | journal de build Vercel de chaque déploiement (`deploy:reconstruire`) | `rôle servi : postgres · rolbypassrls : TRUE — CONTOURNE la RLS · 101 tables · 11 avec tenant_id · 95 avec politique · défauts : aucun` ; tentative de fuite `0 / 0 / 49` |
| balayage de fumée **contre l'URL déployée** | GitHub Actions → `vérifier` → travail `url`, déclenché par Vercel (`deployment_status`), rapport dans le résumé et en artefact | **48 routes ouvertes, 0 échec** ; 2 non résolubles par le crawl (`exportId`, `iid`) ; titre lu sur chaque page |
| exceptions de rendu par digest | `/api/erreur?digest=…` sur l'URL ; `error.tsx` montre le digest | `/api/erreur` répond 200, `trouvees: 0` — aucune exception depuis le déploiement |
| la suite entière contre la base réseau | `rôle de production` (GitHub Actions, à la main et chaque nuit) | **jamais exécutée** : exige un secret que seul le fondateur pose (DEPLOY.md §0) |

**Ce que la nuit a corrigé dans le produit** : `acceptance.ts` posait `otto.derive_milestone`
EN SESSION par une requête et faisait l'UPDATE par une autre — sur le pooler de transaction,
la garde peut lire une autre connexion et refuser la dérivation, par malchance, en ligne
seulement (une transaction, réglage local ; interdit à la source, éprouvé contre neuf formes).
FORCE ROW LEVEL SECURITY sur toute table à RLS (0033, 0034) — inerte pour le rôle actuel, et le
bloc le dit. `global-error.tsx` pour la panne du layout racine.

**Ce que le sous-agent hostile a cassé sur cette tranche** (16 défauts, tous traités sauf le
contenu des politiques) : la suite réseau **morte par construction** sous le rôle non-bypass
que la recette faisait créer — `seedBase()` refusé dès `tenant`, éprouvé sur PGlite avec 0033 ;
un **TRUNCATE possible sur la démo publique** (la suite refuse maintenant par ce que la base
EST : le schéma `demo_instantane`) ; le bloc d'assertions **vert sur une base vide** (`every()`
sur l'ensemble vide) ; Chromium absent du travail CI ; l'écriture de `server_error` **non
attendue par Next** ; le layout racine sans écran d'erreur ; les fichiers de test en parallèle
sur une base partagée ; `DATABASE_URL` non héritée par les forks ; le détecteur de réglages de
session qui ne voyait que la forme historique et dénonçait « Reset to zero » dans le catalogue ;
« 49 routes » présenté comme mesuré. Et ce que le premier build a montré : `server_error` avec
FORCE manquante à côté d'un verdict « aucun défaut » (0034).

### Ce que je n'ai PAS fait — exhaustivement

- **La suite sous le rôle de production n'a pas tourné** : ni le secret (fondateur), ni une
  route réseau vers le pooler depuis cette machine. Le mode réseau de la suite est écrit et
  **non éprouvé** ; sa première exécution sera sa première épreuve.
- **Le rôle qui sert l'application reste `postgres`, BYPASSRLS.** Passer sous un rôle sans
  BYPASSRLS exige que chaque requête pose le locataire dans sa transaction — reporté (R9).
- **« Une politique retirée rend le build rouge »** est éprouvé sur PGlite (quatre cas connus
  mauvais), pas sur un déploiement d'aperçu : personne n'a retiré une politique en ligne.
- **« Une route morte rend le balayage rouge »** : les branches d'échec de la sonde distante ne
  sont pas éprouvées contre l'URL — c'est le balayage LOCAL qui a attrapé `/api/erreur → 500`
  (base locale non migrée), pas la sonde distante.
- **Chaque page porte le même `<title>`** (« OTTO — AI-native assurance platform ») : la sonde
  lit le titre et le publie, mais il ne distingue pas un écran d'un autre. Un titre par écran est
  un chantier de produit, pas de harnais.
- **`/api/erreur` est ouvert sans authentification** sur tout déploiement Vercel (DA-10), piles
  comprises. Acceptable sur des données fictives, à revoir avant une instance réelle.
- **Le contenu des politiques RLS n'est pas vérifié** : `using (true)` passerait le bloc.

## Mandat de nuit — Groupe 1 : la plateforme devient testable (2026-09-02, nuit)

**Ce qui était vrai avant.** Un dossier ne se créait que sur des entités et exercices déjà en base ;
« Mes travaux » listait trois natures de travail sans traverser les dossiers ; les gardes du produit
étaient affirmées une par une dans des commentaires, jamais inventoriées ni éprouvées contre leur
neutralisation ; l'information produite par l'entité se documentait papier par papier, sans objet
partagé ni refus de réutilisation sur un autre arrêté.

**Ce qui est livré, tranche par tranche (chaque tranche a eu son sous-agent hostile — revues n°4, n°5,
n°6 — et ce qu'il a cassé est corrigé ou nommé au registre reporté) :**

- **1.1 Création de mission en un écran** (0035, ADR-116, DA-29) : client neuf (fictif par
  construction, doublon normalisé refusé), exercice neuf par date de clôture (douze mois justes au
  29 février, chaînage CONTIGU dans les deux sens), classe, référentiel de seuil préféré (suivi si
  représentatif, refusé et nommé sinon), nature/pack/langue vérifiés AVANT toute écriture, N-1
  unique (même nature) lu par l'en-tête, la reprise, l'acceptation et le rail. Refus dans le repli
  ouvert. Deux stations cliquées + rejeu sous leur nom.
- **1.2 Tableau de bord sur `/travaux`** (DA-30) : obstacles au visa de MES dossiers par famille
  (même calcul que l'écran du dossier, test famille par famille), quatre listes de sections
  (récentes triées en SQL — le tri JS rangeait par nom de jour), notes ouvertes par ancienneté ;
  cabinet borné, dossiers scellés hors de tout l'écran. Libellés en clés (`detail:` en gabarit
  était invisible au détecteur : classe fermée, cas mauvais ajouté). Station cliquée : hors rail,
  un obstacle → l'écran qui le lève en un clic.
- **1.7 Registre des gardes** (ADR-117, DA-31, `docs/GUARDS.md` généré, `npm run gardes`,
  `npm run plancher`) : 28 invariants — 11 SQL prouvés en deux passes (attaque refusée par LA
  garde, puis acceptée avec la garde neutralisée dans une transaction annulée), 2 de service en une
  passe, 15 déclarés dont 4 SANS preuve, écrit tel quel. L'épreuve est éprouvée contre quatre gardes
  connues mauvaises et contre le critère du plan (déclencheur retiré → « G-03 : l'attaque a RÉUSSI »).
  Le registre a trouvé le soir même une contrainte inerte depuis 0009 (retirée en 0037, ADR-117).
  Cliquet : les tests comptés par `vitest list`, formes éteintes refusées avec leur cas mauvais.
- **1.8 IPE au niveau du rapport** (0036, ADR-118, DA-32) : `ipe_rapport` partagé (nom, système,
  paramètres, période, généré par/le, empreinte, nature, deux éléments testés, un fichier du
  dossier), le papier le désigne, réutilisation sur un autre arrêté REFUSÉE avec les deux dates,
  capture facultative à l'import (balance, FEC). Garde G-12. Station cliquée : le refus, puis le bon
  arrêté.

**Mesures, et la commande qui les rejoue :**
- `npx tsc --noEmit` : 0 erreur. `npx vitest run` (balayage des écrans compris) : 75 fichiers, 632 tests —
  631 verts sur la dernière exécution complète, le dernier (une liste de missions semées, passée de
  deux à trois) corrigé et rejoué seul ; la suite entière est à rejouer d'un bloc.
- Parcours cliqué (`npm run clics`, production) : 159 étapes conduites, 0 échec sur le septième
  parcours de la nuit — FIGÉ : `docs/PARCOURS.json` porte 197 stations déclarées, 158 conduites,
  39 déclarées jamais atteintes (branches d'échec, écrites). Sur les six parcours précédents, une
  exception navigateur intermittente (React #418, hydratation) est apparue trois fois, sur deux
  écrans différents, toutes stations vertes — comptée en échec par le harnais, à raison ; cause non
  trouvée, au registre reporté.
- `npm run langue` : 0 chaîne d'écran hors catalogue · 0 libellé en dur · 39 différés avec raison ·
  25 exclus avec raison. `npm run langue:epreuve` : 15/15 cas connus mauvais dénoncés (dont les deux
  classes fermées cette nuit : gabarit, ternaire multi-lignes).
- `npm run parcours:epreuve` : 5/5. `npm run lectures:epreuve` : 6/6. `npm run lectures` : 77 écrans,
  1364 chemins figés.
- `npx vitest run src/lib/gardes` : 23 tests, dont 11 gardes SQL × 2 passes. `npm run gardes` :
  `docs/GUARDS.md` à jour, 28 gardes. `npm run plancher` : voir docs/TESTS_PLANCHER.json (compté
  par `vitest list`).

**Ce que la revue hostile a cassé, et l'état de chaque constat** — lisible en entier dans
`docs/DECISIONS_AUTONOMES.md` (DA-29 réécrit, DA-30, DA-31, DA-32) et `docs/BACKLOG_REPORTE.md`
(section « Reporté par l'exécution de la nuit »). Les plus graves : exercice créable sur l'entité
d'un autre cabinet (corrigé, testé) ; aucun événement à la création d'exercice (corrigé) ; trois
définitions de N-1, l'en-tête montrant la NEP comme N-1 d'une SOX (une règle, quatre lecteurs) ;
préférence « PBT » sur une perte → seuil 1 000 € (garde, testée) ; 29 février (corrigé, testé) ;
chaînage enjambant un trou (contigu, testé) ; « récentes » triées par nom de jour (SQL, testé) ;
famille « achevement » rendue en code sur quatre écrans (`FAMILLES` typée sur la liste, deux clés
ajoutées) ; client orphelin par le chemin par défaut du formulaire (refusé avant écriture) ;
`docs/PARCOURS.json` ayant perdu `jamaisConduites` (restauré, `parcours --figer` le conserve, le
runner dit quand un `--figer` rouge n'a rien figé).

## Mandat du jour (2026-09-02) — livré, reporté, non prouvé

Agent seul toute la journée, aucune question, chaîne verte avant `main`. Le rapport du soir en un
écran est `docs/SOIR.md` ; la table d'acceptation observée est `docs/ACCEPTATION.md` (locale) et le
résumé du job `url` de la CI (déployée).

**Livré.**

1. **Colonne vertébrale réduite** — bandes de numéros de migration tenues par un test
   (`migrations-bandes.test.ts`, `docs/MIGRATIONS_BANDES.md`) ; registre des verdicts de verrou
   `engagement_lock_verdict` (0042) remplaçant la liste figée de 31 tables, propriété « 0 table sans
   verdict » ; verdicts du registre des gardes LUS depuis l'exécution (`docs/GARDES_RESULTATS.json`),
   une garde sans résultat s'écrit SANS RÉSULTAT.
2. **W0** (ADR-119) — `npm run accept [-- <url>]` : tâches annoncées conduites dans un navigateur
   contre l'URL déployée, PASS/FAIL observé, capture, horodatage, SHA déclaré par l'instance
   (`/api/sante` → `sha`) ; `npm run accept:epreuve` (un cas connu mauvais doit être FAIL) ;
   `npm run fumee -- --repetitions=7 --graine=<s>` : GREEN / INTERMITTENT / RED, graine imprimée ;
   la CI `url` joue l'épreuve, l'acceptation, et publie captures et table.
3. **W1** (ADR-120, migration 0050) — la grille FIGÉE par pack (colonnes de la méthode, tolérances
   du pack, versionnée, empreintée) ; une cellule par ligne et par colonne, delta SIGNÉ toujours
   imprimé, ancre (pièce, page, rectangle) lue dans la couche texte ; le rectangle dessiné sur la
   pièce par le serveur (`/api/piece/<id>/ancre`) ; la bande de cellules dans l'atelier, la touche V,
   les dispositions ; quatre refus tenus en base et prouvés en deux passes (G-13 à G-16 :
   TEST-01 pas de vert sans ancre, TEST-02 identité qui diverge = preuve non recevable, TEST-03 motif
   obligatoire, TEST-04 pas de conclusion sans disposition) ; la famille
   `unsupported_sample_items` en AVERTISSEMENT derrière le drapeau `flags.unsupportedSampleItemsBlocking`
   (nep-fr : off), fixture appariée ; station cliquée « la grille, les ancres, les refus, la
   conclusion » ; tâches d'acceptation W1-01 à W1-05.

**Reporté par écrit** (`docs/BACKLOG_REPORTE.md`, section du jour) : S2, S3, S4, S6, S7, S8, S9,
W2, W3, W4, W5, §4 ; les deux lignes d'acceptation absentes du jeu synthétique (0,4 %, mauvais
tiers — prouvées par fixtures, pas cliquables sur la démonstration publique qu'on ne re-sème pas) ;
le commutateur de langue (n'existe pas) ; la signature du BL non relevée ; TEST-01 sans chemin
cliquable.

**Non prouvé, dit tel quel** : l'isolation entre cabinets est INERTE en production (rôle
`postgres`, BYPASSRLS — S2 reporté) ; le harnais d'acceptation n'a pas pu être conduit depuis le
bac à sable de l'agent contre l'URL déployée (CONNECT refusé par la politique réseau) — les
verdicts déployés sont ceux de la CI ; TEST-01 n'a pas de refus observé par un clic ; l'erreur
d'hydratation #418 n'est ni reproduite ni expliquée.

## Reçu en cours de journée (2026-09-02) — analyse concurrentielle Optro

Inscrite au registre (`docs/REGISTRE_IDEES.md` §H) : le CRITÈRE D'ADMISSION de toute idée
(« aide-t-elle un auditeur indépendant à produire un dossier qui survivra à une inspection ? »),
ce que nous ne devenons pas (GRC), ce qui est à creuser (le dossier, le refus, l'IPE, la chaîne de
preuve jusqu'à la cellule, le multi-pack, le portail à l'auditeur), le positionnement SOX côté
auditeur externe, et les six points H-1 à H-6 pour la suite — le mandat du jour ne change pas.

**Poussé sur `main` (2026-09-02)** : `3bc9bd0` (le produit) puis `8302a23` (le harnais attend la
réponse de l'action avant de lire un refus). Vercel READY sur les deux ; CI `local` verte sur les
deux ; CI `url` : balayage 7 passages vert, épreuves 3/3, acceptation 10 PASS / 1 FAIL — le FAIL est
une exception d'hydratation #418 observée en ligne sur le papier REV-01 pendant la tâche IPE
(refus « papier visé » lu quand même) ; W5 reporté avec cette observation. Rapport du soir :
`docs/SOIR.md`.


## Mandat de la soirée (2026-09-02) — §0, §1, §2 livrés ; §3, §4, §5, §6/§7, §9 non tentés

**Ce qui est cliquable ce soir et ne l'était pas cet après-midi** (ADR-121, ADR-122, ADR-123) :

- **§0.1** `/api/sante` déclare le SHA du BUNDLE qui répond (cuit au build par
  `scripts/lib/version.mjs` → `next.config.mjs`), à côté de celui que la plateforme prétend, et
  dit quand ils divergent ; éprouvé par un cas connu mauvais (`version.test.ts` : une variable
  forgée ne l'emporte jamais sur le dépôt). `npm run accept -- --sha=<attendu>` échoue sur une
  autre identité.
- **§0.2** `npm run accept` est une SONDE par défaut : chaque action serveur est conduite dans
  une transaction annulée (`core/sonde.ts`, `annulerApres`), le refus observé est le vrai, rien
  n'est écrit — mesuré par `npm run accept:temoin` (11 tables comptées avant/après :
  « aucune écriture »). `--ecrire` reste l'option des bases jetables. Le journal de consultation
  (`section_visit`) se tait sous la sonde. Une transaction ouverte sous une transaction ouverte
  la REJOINT (point de reprise) — c'était le défaut trouvé par la revue hostile : un service qui
  réussissait sous la sonde figeait PGlite ; `sonde.test.ts` conduit désormais un service réel
  sous la sonde avec un délai qui refuse « BLOQUÉ », et la tâche S2-02 le clique.
- **§0.3** une grille de test figée en version neuve NOMME les conclusions qu'elle invalide et
  l'atelier les montre périmées avec la version ; la même règle tient la revue analytique
  (empreinte des soldes, marqueur « périmée », rien d'effacé).
- **§0.4** la sonde lit l'échantillonnage, la grille, les écarts, et la revue analytique du poste.
- **§1** le rail se lit par états financiers — `Balance sheet` puis `Profit and loss`, TOUS les
  postes du pack comptable (données de pack), retenus → espace de travail, hors périmètre →
  grisé avec le motif, sans compte → grisé et dit ; le rail se range (`[`), mémorisé par navigateur.
- **§2** la page de poste tenue comme un cabinet la tient : trois visas en en-tête (ceux des
  papiers du poste, PÉRIMÉS quand le papier est dépassé) ; leadsheet compte · intitulé · N · N-1 ·
  variation signée · % · XREF, avec l'ORIGINE de N-1 écrite (dossier N-1, sinon balance
  comparative, sinon rien) ; la variation renvoie à la **revue analytique du dossier** (écran
  neuf `/eng/[id]/analytique`, tous les postes du pack) ; sous la leadsheet la **revue analytique
  du poste** — le même objet — versionnée, ajout seul, vide refusé (ANA-01), proposition du moteur
  déterministe et tracée, qui ne compte qu'enregistrée par une personne (ANA-02 : le run cité
  est celui de ce poste), jamais réécrite (ANA-03), PÉRIMÉE quand les soldes ou les comptes
  bougent ; dix sections repliables et mémorisées (dont papiers avec visas, écarts avec leur
  papier, demandes du poste) ; navigation par ancres ; « ce qui reste ouvert » disparu ; une note
  de revue se pose sur une cellule de leadsheet (ancre `compte`).

**Prouvé, et comment (chaîne locale du soir, base neuve, build de production)** :
`tsc` 0 · `npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue (instantané refigé :
lectures déplacées dans des fonctions d'aide de la page de poste, mêmes chemins) · gardes
G-17..G-19 PROUVÉES en deux passes (36 gardes au registre) · `accept:epreuve` 3/3 cas mauvais
vus · `accept --ecrire` 13/13 · `accept` (sonde) 13/13 · témoin « aucune écriture (11 tables) » ·
`npm run screens` 85 routes, 0 échec · `npm run clics` : voir la ligne ci-dessous.

`npm run clics` : **189 étapes conduites, 0 échec, 188 stations figées** (docs/PARCOURS.json), 305 clics
comptés sur 41 gestes — dont la station neuve « poste : l’anatomie » (visas mesurés au-dessus de la
leadsheet, sept colonnes, variation signée, origine N-1, dix ancres, refus ANA-01, rédaction v1,
proposition non enregistrée, validation v2, repli mémorisé et rouvert par l’ancre, même texte sur
la revue du dossier). Le PREMIER passage était rouge : la station du rail attendait six groupes et
« areas » (corrigée : sept, bilan puis résultat, lus au catalogue), et deux exceptions #418 sont
apparues sur `/testing` et `/requests/[rid]` — pages non touchées par la tranche — puis n’ont pas
reparu au second passage. HYPOTHÈSE, pas diagnostic (règle 18) : le fil W5 (navigation pendant le
flux RSC). Non prouvé ; consigné dans docs/BACKLOG_REPORTE.md (W5).

**Non fait, exhaustivement** : §3 (section « Audit procedures »), §4 (re-tirage et sa règle),
§5 (notes en panneau latéral), §6/§7 (passe esthétique ; les replis mémorisés n'existent que sur
la page de poste), §9 (semis enrichissant), §10 (plan écrit — `docs/PLAN_RLS.md` —, rien
exécuté, `DATABASE_URL` intacte) ; le locataire-sonde (annulation transactionnelle à la place,
docs/BACKLOG_REPORTE.md) ; le poussé sur `main` et la CI `url` : voir le rapport du soir.

**Poussé et déployé** : `edb5e6c` sur `main` ; Vercel READY ; `/api/sante` déclare ce SHA
(source `git`, identité cohérente) et la lecture « revue analytique du poste » passe sur la base
publique (0130 appliquée). CI : job `local` vert ; job `url` 12/13 (A-05 : refus lu, puis #418
sur la page du papier REV-01 — deuxième occurrence en ligne, fil W5). Témoin en production après
le job : 0 ligne laissée par la sonde (fsli_analytique, engine_run, event_log, section_visit).

**Non prouvé** : l'application de 0130 sur la base publique
existante (elle s'applique au prochain déploiement, comme 0050 s'est appliquée) ; le rendu
navigateur du repli sur un lecteur d'écran ; les deux exceptions #418 du parcours cliqué
(fil W5) — voir la ligne des clics.

## Mandat de nuit n°2 (2026-09-02 → 03) — 1.1 livré : un monde qui a quelque chose à montrer

**Ce qui est cliquable maintenant et ne l'était pas ce soir** (ADR-124) :

- **`npm run demo:enrichir`**, joué à CHAQUE déploiement (`scripts/deploy/reconstruire.ts`, monde
  conservé ou reconstruit, avant l'instantané) et en étape « 2 ter » de `npm run demo` : le monde
  de démonstration est ENRICHI, jamais remplacé — dix étapes idempotentes, chacune dit « déjà en
  place » ou ce qu'elle a posé ; les données du fondateur survivent (REV-01 reste signé, aucun
  compteur ne baisse — `flows/enrichir.test.ts`, 5/5). Un dossier scellé ou absent : rien n'est
  touché, et c'est dit.
- **Ce que l'écran montre.** Tableau de bord : des sections dans les QUATRE états, tenues par
  plusieurs personnes (Hugo Vasseur, staff, rejoint l'équipe avec sa déclaration d'indépendance
  signée). Poste Chiffre d'affaires : SEPT lignes de papier — REV-01 du fondateur, et cinq
  papiers rédigés depuis la méthode (MANUEL signé aux trois visas, CUTOFF et RECALC en revue, RA en
  brouillon, SEQ dont la v1 est PÉRIMÉE par une v2 motivée — le visa du préparateur se lit périmé
  en en-tête). Notes de revue ouvertes de 1 à 14 jours ouvrés, dont une sur la cellule
  « Montant HT » d'une ligne d'échantillon et une sur la cellule « solde » d'un compte de la
  leadsheet (ancre `compte`, migration 0131). Processus ventes N et N-1 avec les changements
  statués, RCM du cycle importée. Grille calculée, quatre lignes conclues dont une cellule
  « absent » disposée. Revue analytique v1. Clients et comptes rattachés au périmètre, ses
  questions statuées, une procédure planifiée.
- **`services/programme.ts`** : planifier une procédure du catalogue sur un poste (refus PROG-01
  hors catalogue, PROG-02 méthode inapplicable au poste, PROG-03 poste hors périmètre) et rédiger
  son papier depuis le gabarit du pack (PROG-04) — version nouvelle qui PÉRIME la précédente sous
  le même code, moteur tracé (`engine_run`), événement avec le motif. Ce sont les briques de 1.4.
- **`/api/sante`** lit le monde enrichi : sections par état, papiers par statut, notes ouvertes
  et l'âge de la plus ancienne, lignes conclues.
- **Les écarts sont COMPTÉS, jamais fabriqués** : 13 dont 5 ouverts sur une base neuve ; sur la
  base publique déjà statuée, 0 ouvert — l'enrichissement le dit au lieu d'en inventer
  (docs/BACKLOG_REPORTE.md).

**Prouvé, et comment (chaîne locale de nuit, base neuve, build de production)** : `tsc` 0 ·
`npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue (1 556 chemins, 82 écrans) ·
`npm run gardes` 36 · `enrichir.test.ts` 5/5 · `demo:enrichir` 10/10 étapes · `accept:epreuve`
3/3 cas mauvais vus · `accept --ecrire` **16/16** · `accept` (sonde) **16/16** · témoin « aucune
écriture (11 tables identiques) » · `npm run screens` 85 routes, 0 échec · `npm run clics` 189
étapes, 0 échec (188 stations figées, 305 clics sur 41 gestes). Les trois tâches neuves lisent
l'écran, pas la base : E-01 « quatre états portés par des lignes de section · 6 détenteurs »,
E-02 « 7 papiers · statuts signed, in_review, draft, outdated · 1 visa périmé en en-tête »,
E-03 « 10 notes ouvertes, dont une sur une cellule ». Le parcours cliqué joue sur le monde de
BASE (il importe, tire, conclut lui-même) ; l'enrichissement est prouvé par E-01..E-03 et le test.

Le premier passage était ROUGE : E-02 ouvrait le premier poste du rail — devenu Clients (bilan
avant résultat) depuis que le monde en porte un — et y comptait 0 papier. Hypothèse tenue contre
la capture (règle 18) : c'était bien Clients à l'écran ; la tâche vise désormais le poste REVENUE,
seul poste du périmètre gelé (règle 14). Rejouée : 16/16 dans les deux modes.

**Ce que je n'ai PAS fait** : la revue hostile de 1.1 — le premier sous-agent est mort en limite
de débit avant d'écrire une ligne ; relancé, ses constats et leur sort (corrigé / constaté non
corrigé, A.1) suivent dans le commit suivant. Rien de 1.2 à 1.5 à cet instant.

## Nuit n°2 — 1.1 corrigé par la revue hostile, 1.2 la passe esthétique et le repli en base (2026-09-03)

**Ce qui est cliquable maintenant et ne l'était pas à minuit** (ADR-125, ADR-126) :

- **Cinquante-cinq sections de page se replient**, sur trente-quatre écrans, et **le repli est
  retenu EN BASE, par personne** (migration 0132 `ui_repli`) : la même personne retrouve ses
  rangements sur un autre poste de travail, et le SERVEUR les connaît au premier rendu — le rail
  rangé naît étroit, aucune section ne s'ouvre pour se refermer après l'hydratation. La clé est
  celle de la SECTION, pas de la page. **Un rangement que la base n'a pas retenu le dit** à côté
  du titre. Refus **REPLI-01** (garde G-22, contrainte `ui_repli_cle_valide`) : une clé libre
  serait un canal d'écriture arbitraire ouvert à tout compte connecté.
- **La passe esthétique** : jetons d'espace, d'élévation et de mouvement nommés une fois ;
  hiérarchie typographique à trois tailles ; chiffres tabulaires sur TOUTE cellule de tableau ;
  survol, focus visible au clavier seulement, sélection à l'encre d'accent ; mouvement de 160 ms
  qui ne porte que sur des changements d'état — jamais sur le contenu, jamais sur la touche qui
  conclut ; `prefers-reduced-motion` coupe tout d'un bloc. **La couleur ne bouge pas** : elle ne
  marque que les problèmes.
- **1.1 corrigé** — douze constats de la revue hostile n°7, onze corrigés, un tenu pour acquis
  et écrit (ADR-126). Le bloquant : une décision humaine de périmètre était **réécrite à chaque
  déploiement** ; elle ne l'est plus, et un test la SORT du périmètre au nom de l'associée puis
  rejoue l'enrichissement pour le prouver. Aussi : plus de geste humain fabriqué dans la chaîne
  hachée à chaque build ; l'IPE des cinq papiers déclarée VRAIE contre la source de la méthode ;
  l'antidatage d'une note DIT au journal ; un refus de service devenu une étape « NON » au lieu
  d'un build cassé ; une version dépassée n'est plus une section de travail ; le gabarit suit le
  sens du test et le repli est écrit ; l'empreinte distingue les versions ; **PROG-05** (rédiger
  exige d'être de l'équipe) et **PROG-06** (dépasser un visa exige un motif).

**Prouvé, et comment** (chaîne locale, base neuve, build de production, `scratchpad/chaine-n5.log`) :
`tsc` 0 · `npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue sur 1 625 chemins,
84 écrans · `npm run gardes` **37** dont G-22 éprouvée en deux passes · `npm test` **701 tests,
0 échec** (plancher 632) · `demo:enrichir` 10/10 étapes · `accept:epreuve` 3/3 · `accept --ecrire`
**16/16** · `accept` (sonde) **16/16** · témoin « aucune écriture (12 tables identiques) » ·
`npm run screens` 85 routes, 0 échec · `npm run clics` **189 étapes, 0 échec**, 188 stations
figées vérifiées, 305 clics sur 41 gestes.

**Le défaut que la nuit a coûté, et comment il a été trouvé.** Le squelette de chargement
(`loading.tsx`) a fait passer le parcours cliqué de 0 à **vingt stations rouges**, et
l'acceptation a lu « aucun refus » deux fois là où le produit refusait. Les stations rouges
CHANGEAIENT d'une exécution à l'autre — de quoi appeler cela de l'intermittence et passer à
autre chose. Bisection, une variable à la fois : squelette présent → 21 puis 20 échecs ;
squelette retiré, tout le reste identique → **1 échec** (le #418 connu, sur `/testing`), puis
**0** au tour suivant. Une frontière de suspension change le MOMENT où le contenu existe : le
harnais lisait l'écran pendant que le squelette était à l'affiche. Le squelette est reporté
(N2-4) : il ne revient qu'avec un harnais qui attend le CONTENU.

**Ce que je n'ai PAS fait** : les onglets d'ancrage sur les 34 écrans neufs (N2-1 — une barre
construite côté client rendrait un `<nav>` vide au premier rendu, la forme même du #418) ; le
squelette (N2-4) ; les tranches 1.3, 1.4, 1.5 et tout l'étage 2.

## Nuit n°2 — 1.3 le fil de revue à côté du travail, et les onze constats de la revue hostile n°8

**Ce qui est cliquable maintenant** (ADR-127, ADR-128) :

- **Le fil d'une note s'ouvre à côté du travail** : le repère chiffré d'une cellule ouvre un
  panneau latéral droit — la note, son type, son **ancienneté en jours OUVRÉS**, son
  destinataire, le fil des réponses — où l'on répond sans quitter l'écran ; le geste revient
  sur l'écran de travail, jamais sur la vue transverse. La clôture n'est offerte qu'à un
  réviseur non-auteur (ADR-028, service et déclencheur inchangés) et, quand elle ne l'est pas,
  **la raison est écrite à la place du bouton**. La vue « Review notes » reste l'ensemble du
  dossier, y compris les notes dont l'objet a été retiré — que le panneau, ancré à un objet
  vivant, ne peut par construction pas montrer.
- **Les jours ouvrés sont une règle partagée** (`core/jours.ts`) : le semis les compte pour poser
  les dates, l'écran pour dire l'ancienneté. Elle **ne connaît aucun jour férié** et le dit.
- **Onze constats de la revue hostile n°8 sur 1.2, dix corrigés** (ADR-128) : un repli pouvait
  ranger le bouton qui SCELLE (26 sections rendues à des panneaux ; il reste 30 replis, tous en
  lecture seule) ; le rail jetait le résultat de la mémorisation ; le locataire d'un rangement
  était un paramètre (il vient de la personne, garde G-23) ; le témoin comptait une table que
  rien n'écrivait ; le nombre de rangements n'était borné par rien (REPLI-04, 500) ; le CSS d'un
  composant retiré restait ; une phrase affirmait plus que le CSS ne tient.

**Prouvé, et comment** (chaîne locale, base neuve, build de production, `scratchpad/chaine-n8.log`) :
`tsc` 0 · `npm run langue` 0 hors catalogue · `npm run lectures` 0 perdue (instantané refigé : les
clés des sections rendues à des panneaux, et le locataire retiré de l'action) · `npm run gardes`
**38** dont G-22 et G-23 · `npm test` **710 tests, 0 échec** (plancher 632) · `demo:enrichir` 10/10
· `accept:epreuve` 3/3 · `accept --ecrire` **17/17** · `accept` (sonde) **17/17** · témoin
« aucune écriture (12 tables identiques) » — et cette fois la 12ᵉ table est écrite en mode
écriture (`ui_repli=1`) avant d'être annulée sous la sonde, ce qui la fait enfin compter ·
`npm run screens` 85 routes, 0 échec · `npm run clics` **194 étapes, 0 échec d'assertion**,
188 stations figées vérifiées.

**Le seul rouge restant** : une exception d'hydratation **#418**, une fois sur ce parcours, sur
`/eng/[id]/exceptions`. Sur les six exécutions de la nuit elle est apparue trois fois, sur
**trois écrans différents** (`/testing`, `/exceptions`, et zéro fois sur trois autres passages) :
ce n'est donc pas un écran, c'est une condition. Aucune hypothèse prouvée — c'est la tranche 3.2
du mandat, non faite.

**Ce que je n'ai PAS fait** : 1.4, 1.5, tout l'étage 2, tout l'étage 3, tout l'étage 4 ; les
onglets d'ancrage (N2-1) ; le squelette (N2-4) ; le classement des tables hors dossier (N2-5).

### Deux instruments qui mesuraient à côté, trouvés par la CI (2026-09-03, 03 h)

La CI a rougi sur `main` deux fois de suite, et **aucune des deux fois ce n'était le produit** :

- **`langue:epreuve` 13/15** : un point d'injection de l'épreuve n'existait plus — le titre
  `<h2>{t('dash.requestTracker')}</h2>` était devenu le titre d'une section repliable. L'épreuve
  suit l'écran : le point est déplacé, la règle redevient **15/15**. Une épreuve qu'on retire
  parce que l'écran a changé est une épreuve qu'on perd.
- **`accept` contre l'URL déployée, E-01 3/4** : la tâche lisait les badges des LIGNES de
  section — or la liste montrée dépend de qui regarde. Elle passait en local et tombait en
  ligne : **elle mesurait l'identité, pas l'écran**. Elle lit désormais l'avancement du DOSSIER
  (le compte par état de la barre, `data-legende`/`data-n`) ; un état à zéro ne compte toujours
  pas, donc pas de faux vert.

Chaîne rejouée après correction : `accept --ecrire` 17/17 · `accept` (sonde) 17/17 · témoin
« aucune écriture (12 tables) » · `screens` 85/0 · `clics` **194 étapes, 0 échec**, et les cinq
stations neuves de 1.3 figées (193 au total).


## Jour n°3 — §1.1 : l'étanchéité entre cabinets, et le plan RLS corrigé par la mesure (2026-09-03)

**Le mandat exigeait le test de non-régression AVANT la garde. Il a trouvé dix trous sur
treize — puis la revue hostile a montré que treize n'était pas le nombre des gestes, mais le
nombre des gestes REGARDÉS : quatre-vingt-onze fonctions de service sur quatre-vingt-seize
n'avaient aucune garde.** `app/src/lib/core/etancheite.test.ts` crée un autre cabinet et une personne à lui
(Nadia Ferrand, fictive), puis tente treize gestes d'écriture sur le dossier de démonstration.
**Dix ont été acceptés** (« onze » dans la première rédaction : faux, corrigé par mesure ;
trois des treize échouaient déjà pour un état du dossier ou pour PROG-05, donc ils ne prouvent
rien de la garde neuve).** Les services prenaient un `userId` sans jamais vérifier qu'il
appartient à l'équipe : `requireMember` gardait les ÉCRANS, rien ne gardait les ACTIONS, et la
politique RLS est inerte (le rôle servi contourne). Entre deux clients concurrents, le secret
professionnel ne tenait qu'à la porte d'entrée.

**Ce qui est neuf et cliquable — rien.** Cette tranche n'ajoute aucun écran : elle referme un
trou. Ce qui est neuf et VÉRIFIABLE :

| quoi | où | preuve |
|---|---|---|
| ETANCH-01 / 02 / 03, dans les services | `core/membre.ts`, câblé dans **59** des 96 fonctions de service qui prennent un acteur et écrivent | `core/etancheite.test.ts` — 13 gestes, 13 refus nommés, dont **10 vrais cas mauvais** ; garde **G-24** prouvée par exécution |
| le COMPTE des gestes encore nus, écrit et borné | `core/couverture-etancheite.test.ts` | **37** fonctions nues, chacune avec sa raison ; une 38ᵉ rougit, une ligne périmée rougit |
| BLOB-01 — une pièce ne se sert que si son contenu rend son adresse | `core/storage.ts` | substitution tentée puis refusée ; garde **G-26** prouvée par exécution |
| `withTenant` + le garde LOC-01 / LOC-02 | `db/tenant.ts`, `db/sans-locataire.ts`, appelé par `q()` | `db/tenant.test.ts` 13 cas sous un rôle **sans BYPASSRLS** créé par le test ; garde **G-25** |
| la liste écrite des chemins sans locataire | `db/sans-locataire.ts` — 6 chemins, 5 câblés, 1 « à câbler » | `db/sans-locataire.test.ts`, qui vérifie les DEUX sens et balaye tous les points d'entrée |
| le rôle `otto_app`, ses droits, 5 politiques manquantes | `supabase/migrations/0140_role_applicatif.sql` | appliquée ; `verdictOttoApp` éprouvé sur 5 cas connus mauvais |
| trois lectures neuves de santé | `/api/sante` | rôle servi + garde armé/désarmé · `otto_app` présent · un refus d'étanchéité VÉRIFIÉ, pas déclaré |

**Trois choses que la MESURE a corrigées, et que la documentation affirmait de travers.**
1. *La prémisse d'A.5 était fausse.* « Une politique en `using` seul laisse ÉCRIRE chez le
   voisin » — non : les 102 politiques sont `for all`, et pour `for all` un `with check` omis
   fait servir `using` aussi au contrôle de l'écriture. Observé (cas 4 : `insert` refusé ;
   cas 4 bis : `update` de déplacement refusé), pas lu dans une documentation. **0140 ne
   complète donc aucun `with check`** — sauf un, `server_error`, où il doit DIVERGER.
2. *Le premier choix de table pour le cas 4 bis mesurait autre chose.* Sur `event_log`, c'est la
   garde append-only de 0003 qui refuse, pas la politique : le refus d'un autre objet aurait été
   présenté comme preuve de celui-ci (règle 16). Mesure déplacée sur `app_user`, et le test
   vérifie explicitement que le message n'est PAS celui de l'append-only.
3. *« Propriétaire-seul » décrivait la base, pas le produit.* Cinq tables portaient RLS + FORCE
   et aucune politique alors que l'application les lit toutes : sous `otto_app` elles auraient
   rendu zéro ligne **sans un mot**. Chacune reçoit sa politique ; la liste tombe de sept noms à
   deux ; et un test neuf attrape le sens qui manquait — une table restée sur la liste alors
   qu'une migration lui a donné une politique.

**Un instrument a trouvé ce que l'inventaire à la main avait manqué** : le balayage des points
d'entrée a dénoncé `/demo/[qui]` — hors de `src/app/api/`, donc absente de mon relevé — qui CRÉE
la session et s'exécute forcément sans cabinet.

**LE FAIT QUI PRIME, MESURÉ APRÈS COUP PAR LA REVUE HOSTILE n°9.** `withTenant` n'a **aucun
appelant de production** : l'étape 1 de PLAN_RLS n'est faite qu'à moitié — le mécanisme, pas le
câblage. Armer le garde LOC-01 aujourd'hui n'« empêcherait pas l'oubli », il **éteindrait
l'application** : `missionsParClient` (l'écran d'accueil) et `logEvent` (donc tout changement
d'état) lèvent. C'est désormais un TEST, pas une prudence. Trois textes affirmaient le contraire
(le workflow de CI, l'en-tête de PLAN_RLS, la première rédaction de l'ADR) pendant
qu'`assertions-role.ts`, livré dans le même commit, disait le vrai : les trois sont corrigés.

**Les vingt-deux constats de la revue hostile n°9 sont énumérés dans ADR-131**, chacun avec sa
gravité et son état : dix-huit corrigés, deux corrigés en partie avec la dette écrite
(`blob_store` en lecture croisée, les 37 gestes nus), deux constatés non corrigés et écrits
(la politique par jeton du portail, l'écriture d'`app_state`).

**Non prouvé, et dit tel quel :**
- **L'étape 3 de PLAN_RLS n'est PAS exécutée.** `DATABASE_URL` désigne toujours `postgres`
  (BYPASSRLS) : les 102 politiques restent **inertes** pour l'application, et le garde LOC-01
  reste **désarmé**. Un accès direct à Postgres avec la chaîne de l'application voit tout.
  L'étanchéité livrée ici est celle de l'APPLICATION, pas celle de la BASE.
- **`blob_store` n'est pas isolé** : politique `true` (adressage par contenu, déduplication
  entre cabinets par construction). Sous `otto_app`, `select storage_path from blob_store`
  énumérerait les chemins de tous les cabinets. Dette à fermer AVANT l'étape 3.
- **Le portail client n'a pas de politique par jeton** : ses deux pages lisent hors de la portée
  de la dérogation. Conséquence MESURÉE par la revue hostile : sous garde armé, `portalRequests`
  lève LOC-01 — le portail rendrait **une page 500 au contact du client**, « un refus rendu en
  page 500 », mot pour mot dans la règle 13. Pas refermé.
- **Trente-sept fonctions de service restent sans garde d'étanchéité**, toutes désignées par
  l'identifiant d'un objet FILS. Elles sont écrites une par une, avec leur raison, dans
  `core/couverture-etancheite.test.ts`.
- **`app_state` reste entièrement inscriptible sous `otto_app`** : c'est l'horloge de toute
  l'application. Risque théorique aujourd'hui (`warp` n'est appelé que par le semis), écrit dans
  0140, non refermé.
- **`scripts/db/verifier-role-applicatif.ts` n'a jamais tourné contre un vrai Postgres** ; sa logique est
  éprouvée sur cinq cas connus mauvais, et les six retraits de 0140 sont vérifiés localement.
- **Le chemin `scripts` n'est pas câblé** : semis et harnais tournent sous `postgres`.
- **Un balayage d'écrans est tombé une fois** dans la suite complète (serveur mort à la 45ᵉ
  route, `/eng/[id]/testing`). **Non reproduit seul** : le même fichier passe seul sur HEAD sans
  la tranche (326 s) et seul avec la tranche (457 s), et `npm run screens` sur build de
  PRODUCTION rend **85 routes, 0 échec**. Pas de diagnostic — donc pas de correctif deviné
  (règle 18). Fil ouvert **J3-1**.

### La chaîne des fils ouverts, remise d'aplomb (2026-09-03)

*Le mandat du jour n°3 §0 point 5 relève que **N2-3 n'existe nulle part**. J'ai d'abord écrit ici
qu'il n'avait jamais été attribué — **c'était faux, et c'est la même faute que le mandat
reproche** : je n'avais cherché que dans STATUS.md. Les six fils N2-1 à N2-6 vivent tous dans
`docs/BACKLOG_REPORTE.md`, dans un tableau, et STATUS.md n'en citait que trois au fil du texte.
Le défaut n'était donc pas un numéro manquant mais **deux endroits pour une même liste**. Cette
table est désormais l'unique chaîne, et elle recopie le backlog au lieu de le doubler.*

| fil | quoi | état |
|---|---|---|
| **N2-1** | les onglets d'ancrage manquent sur les 34 écrans neufs (une barre d'ancres rendue côté serveur) | ouvert — mandat jour 3 §2.3, à faire après 1.3 |
| **N2-2** | le semis VISE au nom de personnes fictives (revue hostile n°7, constat 11) : les états doivent être produits autrement | ouvert — mandat jour 3 §1.2, non fait aujourd'hui |
| **N2-3** | le `created_at` des notes semées est reposé à chaque passage : c'est ce qui garde « la plus ancienne, N jours ouvrés » vraie, au prix qu'une note semée ne vieillit jamais sur la démonstration publique | tenu pour acquis, écrit (ADR-126 constat 5) |
| **N2-4** | le squelette `loading.tsx` retiré : il rougissait 20 à 21 stations du parcours cliqué (le harnais attendait un écran, il recevait un squelette) ; il ne revient qu'avec un harnais qui attend le CONTENU | ouvert |
| **N2-5** | le classement des tables hors dossier (`PROPRIETAIRE_SEUL`) — **partiellement soldé le 2026-09-03** : cinq des sept ont reçu leur politique (0140), deux restent propriétaire-seul avec leur raison | partiellement soldé |
| **N2-6** | `grille.test.ts > la disposition écrite lève TEST-04…` rougissait par intermittence | **DIAGNOSTIQUÉ ET CORRIGÉ le 2026-09-03** — voir ci-dessous |
| **J3-1** | le balayage des écrans est tombé **une fois** dans la suite complète (serveur mort à la 45ᵉ route, `/eng/[id]/testing`). Non reproduit : le fichier seul passe sur HEAD sans la tranche (326 s) et seul avec la tranche (457 s), la suite complète repasse ensuite (751/751), et `npm run screens` sur build de PRODUCTION rend 85 routes / 0 échec. Aucun diagnostic | ouvert, non reproduit |
| **J3-2** | `withTenant` n'a aucun appelant de production : l'étape 1 de PLAN_RLS n'est faite qu'à moitié. Armer le garde LOC-01 éteindrait l'application (mesuré) | ouvert — c'est le prochain geste de l'étape 1 |
| **J3-3** | 37 fonctions de service restent sans garde d'étanchéité, toutes désignées par l'identifiant d'un objet fils ; écrites une par une dans `core/couverture-etancheite.test.ts` | ouvert, borné et compté |
| **J3-4** | `blob_store` : lecture croisée entre cabinets sous `otto_app` (politique `using (true)`, octets dans la table). La substitution de pièce, elle, est refermée (BLOB-01) | ouvert — à fermer avant l'étape 3 |
| **J3-5** | le portail client n'a pas de politique par jeton : sous garde armé il rendrait une page 500 au contact du client | ouvert — à fermer avant l'étape 3 |
| **J3-6** | **l'ordre des lignes de la grille de test n'est pas stable** : `cellulesDuDossier` trie par `c.sample_item_id`, un uuid ALÉATOIRE. Le tableau que l'auditeur lit change donc d'ordre d'un déploiement à l'autre, et le fichier d'audit ne montre pas deux fois la même chose. Trouvé en instruisant N2-6 | ouvert — hors périmètre de la tranche, pas corrigé aujourd'hui |

### N2-6, instruit : le test était faux, le produit avait raison (2026-09-03)

Ce test rougissait « une fois sur je-ne-sais-combien » depuis la nuit du 2 au 3 ; quatre rejeux
locaux verts n'avaient rien appris, et **aucun correctif n'avait été deviné** (règle 18). Il a
rougi de nouveau dans la suite complète de ce jour — cette fois avec la main dessus. La méthode :
boucler le fichier seul jusqu'à l'échec (1 sur 6), et faire cracher au test l'état exact des
lignes au moment où il tombe, plutôt que de raisonner sur ce qu'il aurait pu être.

Le diagnostic, en deux morceaux :

1. **Le test n'était pas réversible.** Il éprouve « une cellule qui change après coup périme la
   conclusion » par un `+1` puis un `−1` sur `delta_signed`. Or `coalesce(null, 0) + 1 − 1` rend
   **0**, pas NULL : quand le delta valait NULL, la cellule restait modifiée après l'aller-retour.
2. **L'intermittence venait d'un uuid.** La lecture trie par `c.sample_item_id`, qui est un
   `gen_random_uuid()` : la LIGNE choisie par le test change à chaque exécution. Le test ne
   tombait que lorsque la cellule abîmée au point 1 se trouvait être AUSSI la cellule disposée
   plus bas — alors la disposition, prise sur un delta NULL, ne couvrait plus un delta 0.

**Et c'est le produit qui avait raison** : une disposition ne couvre que la valeur qu'elle a
disposée, NULL n'est pas 0, la règle a fonctionné exactement comme elle est écrite. Le test
capture désormais la valeur d'origine et la restaure à l'identique : **8 boucles vertes** contre
1 échec sur 6 avant. Huit vertes ne prouvent pas l'éradication — le mécanisme compris, si.

Le point 2 laisse une observation qui n'est pas un défaut de test : **l'ordre des lignes de la
grille dépend d'un uuid aléatoire** (fil J3-6). Non corrigé aujourd'hui : c'est un changement de
produit, hors du périmètre de cette tranche.

### La chaîne de la tranche §1.1, rejouée (2026-09-03)

| commande | résultat |
|---|---|
| `npx vitest run` (base fraîche, semée, enrichie) | **751/751**, 90 fichiers |
| `npm run gardes -- --figer` | **41 gardes**, dont G-24 (ETANCH) et G-26 (BLOB-01) prouvées par exécution |
| `npm run plancher` | 751 tests collectés · plancher 632 |
| `npm run langue` · `langue:epreuve` | 0 chaîne hors catalogue · **15/15** cas connus mauvais dénoncés |
| `npm run lectures` · `lectures:epreuve` | 0 lecture perdue sur 1627 chemins · **6/6** |
| `npx next build` + `npm run screens` | **85 routes ouvertes · 0 échec** |
| `npm run clics` (build de PRODUCTION) | **194 étapes · 0 échec · 307 clics · 193 stations figées vérifiées** |
| `accept --epreuve` | **3 cas connus mauvais, 3 déclarés FAIL** |
| `accept --ecrire` · `accept` (sonde) | **17/17** · **17/17** |
| témoin avant/après la sonde | **aucune écriture (12 tables identiques)** |
| `/api/sante` local, build de production | HTTP 200 · 24 lectures · **2 vides nommées** (`ui_repli`, `blob_store`) |

**Une exécution du parcours cliqué a annoncé « 1 échec » et je ne peux pas dire lequel** : mon
propre journal était tronqué (`tail -3`), la station n'a donc pas été capturée. L'exécution
suivante, sur le MÊME code, a rendu 0 échec. Je ne conclus donc rien : ni « c'était un faux
positif », ni « c'est réparé ». C'est une faute d'instrumentation de ma part, et le fil reste
ouvert tant qu'une exécution rouge n'a pas été capturée en entier.
