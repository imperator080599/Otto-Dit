# Plan §10 — la sécurité par ligne APPLIQUÉE à l'application (préparé le 2026-09-02 au soir, à exécuter avec le fondateur à l'écran)

**Ordre, tel que corrigé par le fondateur** : `withTenant` d'abord, puis le rôle, puis la chaîne
de connexion. Ce document est le plan complet, avec pour chaque étape la commande, le cas connu
MAUVAIS qui doit échouer (règle 17), et le retour arrière.

> **ÉTAT AU 2026-09-10 (corrigé — voir l'amendement daté ci-dessous) — étapes 1 ET 2 FAITES,
> MESURÉES ; étape 3 NON, et interdite sans mandat écrit.**
>
> **AMENDEMENT DU 2026-09-10 (PLAN_RLS steps 1-2, mandat du 9 septembre).** L'encadré ci-dessous,
> écrit le 2026-09-03, disait « étape 1 à MOITIÉ » — vrai ce jour-là. Il est resté tel quel
> pendant des dizaines de commits (rule 1 : « si le code doit s'écarter d'un document, on corrige
> le document dans le même commit » — pas fait, corrigé ici a posteriori) alors que le câblage
> qu'il décrivait comme manquant a été construit LE SOIR MÊME, commit `c36076f` (18:29 UTC, 7h14
> après la dernière rédaction de cet encadré, `e004053` à 11:15 UTC) : `executer()`
> (`app/src/app/refus.ts:75`) pose `withTenant` autour de chaque action serveur ; `q()`/`tx()`
> (`app/src/lib/db/client.ts:285-341`) posent le locataire eux-mêmes pour les rendus, quand le
> garde est armé et qu'aucune transaction n'est ouverte, via un « poseur » enregistré UNE FOIS
> (`app/src/lib/core/auth.ts:98`, `enregistrerPoseurDeLocataire`) — c'est l'option **(a)** du §1
> ci-dessous, choisie et construite, jamais l'option (b) (82 écrans à toucher). **Reconfirmé par
> lecture directe du code le 2026-09-10** (`executer()`, `q()`/`tx()`, `auth.ts` — les trois
> extraits cités existent tel que décrit), pas seulement cité d'une recherche antérieure (règle
> 12). Mesuré par le commit `c36076f` lui-même : `npm run screens:garde` (build de PRODUCTION,
> garde LOC-01 ARMÉ) — **85 routes, 0 échec**, au 2026-09-03. `tenant.test.ts` porte un test qui a
> CHANGÉ DE SENS le jour du câblage : « l'écran d'accueil ne lève plus : le câblage a-t-il été
> fait ? » — avant, il vérifiait l'inverse (qu'armer CASSAIT l'écran). **RE-MESURÉ pour de vrai le
> 2026-09-10** (base fraîche, `db:reset && demo:seed` immédiatement avant, puis
> `npm run screens:garde` complet, EXIT=0) : **91 routes, 0 échec** — l'application a grandi
> depuis le 2026-09-03 (91 routes aujourd'hui contre 85 alors, même compte que le balayage sans
> garde), et armer LOC-01 continue de ne RIEN casser. `tenant.test.ts` (15+ cas),
> `sans-locataire.test.ts` (6 cas) et `rls-couverture.test.ts` (7 cas) ré-exécutés le même jour
> sur PGlite fraîche : 35/35 verts.
>
> **Ce qui suit, dans l'encadré d'origine du 2026-09-03, restait exact et n'a pas besoin d'être
> réécrit — seule sa conclusion (« armer aujourd'hui éteindrait l'application ») est maintenant
> fausse : armer n'éteint plus rien, c'est ce que `screens:garde` mesure, deux fois, à sept jours
> d'écart.**
>
> **Ce qui est fait :** `app/src/lib/db/tenant.ts` (`withTenant`), `sans-locataire.ts` (la liste
> écrite + le garde LOC-01/LOC-02, armé depuis le rôle SERVI),
> `supabase/migrations/0140_role_applicatif.sql` (le rôle `otto_app`, ses droits, ses six
> retraits, les cinq politiques qui manquaient — **rejouable**, et éprouvée comme telle),
> `supabase/migrations/0141_portail_par_jeton_et_pieces.sql` (les deux dettes du §2 fermées LE
> SOIR MÊME — voir §2 plus bas, corrigé), et QUATRE suites qui les exercent sous un rôle **sans
> BYPASSRLS créé par le test lui-même** : `tenant.test.ts` (15+ cas, portail compris),
> `sans-locataire.test.ts` (6 cas — commentaire narratif corrigé le 2026-09-10, ses assertions
> n'ont pas changé), `rls-couverture.test.ts` (7 cas, revoit aussi les six retraits de 0140 et le
> registre des fonctions `definer`).
>
> **Ce qui n'est TOUJOURS PAS fait** (l'étape 3, seule) : le format exact `otto_app.<ref>` au
> pooler reste **[UNVERIFIED]** (§0bis A.6) — seul le fondateur, depuis sa machine, peut le
> vérifier par `psql`. La CI « rôle de production » (`.github/workflows/role-production.yml`)
> n'a JAMAIS tourné contre un vrai pooler réseau : aucun secret `OTTO_CI_DATABASE_URL` n'a été
> configuré — c'est la SEULE chose qui manque encore à « testé contre une base fraîche », et elle
> reste hors de portée d'une session sans accès à ce secret. `DATABASE_URL` reste intouché.
> L'étape 3 reste **interdite sans mandat écrit qui la nomme** (CLAUDE.md, interdits) —
> indépendamment de l'état des étapes 1/2.
>
> **Trois affirmations de ce plan ont été corrigées par la MESURE** — voir §0 bis.

## 0. L'état de départ, mesuré

- La production tourne sous `postgres` (**BYPASSRLS**) ; PGlite en local tourne en propriétaire.
  Les politiques (0004, 0029, 0034 FORCE partout, 0130) existent sur TOUTES les tables et sont
  **inertes** pour l'application — le bloc d'assertions de chaque build l'imprime en toutes
  lettres (`app/src/lib/db/assertions-role.ts`, ADR-115).
- Le prédicat est par **locataire** : `otto_tenant()` lit `current_setting('otto.tenant_id', true)`
  et `otto_engagements()` en dérive les dossiers du cabinet. **Aucune politique par dossier**
  (un membre du cabinet lit tous les dossiers du cabinet ; `requireMember` fait le reste en
  application). Ce plan ne change pas cela : il rend le prédicat par locataire EFFECTIF.
- Le pooler Supabase est en **mode transaction** (port 6543) : un réglage de session (`SET`,
  `set_config(…, false)`) peut partir sur une autre connexion à la requête suivante — interdit
  à la source (ADR-115). Seul `set local` DANS une transaction est sûr.
- Depuis ce soir, `tx()` **rejoint** la transaction courante (point de reprise) au lieu d'en
  ouvrir une seconde (ADR-123, revue hostile) : une transaction ouverte en tête de requête
  englobe donc tous les `q()` et tous les `logEvent` qu'elle contient. C'est la brique qui
  rend `withTenant` possible sans réécrire les services.

## 0 bis. AVANT TOUT — les quatre questions que le plan du soir ne posait pas (addendum A.4–A.6 du mandat de nuit n°2)

**A.5 — `with check` d'abord, pas en quatrième. ~~Une politique en `using` seul laisse ÉCRIRE
chez le voisin.~~ FAUX ICI, ET C'EST UNE MESURE QUI LE DIT (2026-09-03).**

Ce que le recensement a rendu, sur le schéma complet migré :

| mesure | valeur |
|---|---|
| politiques `public` | **102** |
| dont `for all` | **102** (aucune `for select` / `for insert` séparée) |
| dont **sans** `with check` | **101** (seule `ui_repli_tenant` en porte un) |
| fonctions `security definer` | **0** sur 12 |
| tables publiques · vues | **109** · 0 |
| rôles non système | **1** — `postgres`, superutilisateur, BYPASSRLS |

Pour une politique `for all`, PostgreSQL fait servir `using` **aussi** de contrôle à l'écriture
quand `with check` est omis. La documentation le dit ; une documentation n'est pas une
observation (règle 15), donc le test le TENTE et regarde :
- `tenant.test.ts` **cas 4** — un `insert` dans `event_log` au nom d'un autre cabinet, sous le
  bon locataire, rôle sans BYPASSRLS → **refusé** (`new row violates row-level security policy`),
  et rien ne reste.
- `tenant.test.ts` **cas 4 bis** — un `update` qui DÉPLACE une ligne existante chez le voisin →
  **refusé** aussi. (Premier choix de table faux : sur `event_log` c'est la garde *append-only*
  de 0003 qui refuse, pas la politique — on aurait présenté le refus d'un autre objet comme
  preuve de celui-ci, règle 16. La mesure se fait donc sur `app_user`, et le test vérifie
  explicitement que le message n'est PAS celui de l'append-only.)

**Conséquence : 0140 ne complète AUCUN `with check` sur les 101 politiques.** Elle en écrit un
seul là où il doit DIVERGER de `using` — `server_error`, qui doit accepter toute écriture
(une panne n'a pas de locataire) et ne rendre en lecture que les siennes.

**Ce qui reste vrai de l'inquiétude d'origine** : le jour où une politique `for select` ou
`for update` séparée apparaîtra, elle n'aura pas ce filet. Rien ne l'interdit aujourd'hui ;
c'est une dette nommée, pas un garde.

**A.4 — la liste écrite des chemins SANS locataire légitime.** Le garde « un `q()` hors
transaction et sans session lisible lève » casserait la connexion elle-même : la recherche d'un
utilisateur par courriel PRÉCÈDE la session ; les pages publiques (accueil, sélection d'identité
de démonstration, portail client par jeton), `/api/sante`, `/api/erreur`, les routes de blob
signées, et les scripts (semis, migration, harnais) n'ont pas de session non plus. La liste vit
dans le code (`app/src/lib/db/sans-locataire.ts`), chaque chemin avec sa raison, et un test
échoue si un chemin NON listé contourne le garde : le garde lève une erreur nommée
(« requête sans locataire ») dont le message cite le chemin ; le test parcourt les routes
publiques et vérifie qu'elles sont toutes listées. Sous BYPASSRLS (aujourd'hui), les chemins
listés lisent normalement ; sous `otto_app`, ils lisent ce que leur politique laisse (le
portail par jeton n'a pas de locataire : sa politique doit être PAR JETON, à écrire dans 0140).

**A.6 — quatre angles morts, comblés par écrit.**
- *Les fonctions `SECURITY DEFINER`* — **RECENSÉES LE 2026-09-03 : ZÉRO sur douze.** Les douze
  fonctions de `public` (`otto_tenant`, `otto_engagements`, les neuf gardes de verrou et
  `forbid_mutation`) sont toutes `security invoker`. La migration 0140 ne se contente pas de
  l'écrire : elle **revérifie** à l'application et lève si une `definer` apparaît — une règle
  qui ne s'exécute jamais n'est pas une règle. Reste un angle mort NOMMÉ : ces gardes lisent
  des tables pour décider de refuser ; sous un rôle sans BYPASSRLS et SANS locataire posé,
  elles ne verraient rien, donc elles ne refuseraient rien. C'est l'argument premier du garde
  LOC-01 (`sans-locataire.ts`), qui transforme ce zéro silencieux en refus.
  Le texte d'origine du plan, conservé :
  `grant execute on all functions` accorde tout en bloc,
  et une fonction appartenant à `postgres` s'exécute avec les droits du propriétaire — elle
  CONTOURNE la RLS. Recensement avant l'étape 2 :
  `select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where nspname = 'public' and prosecdef` ;
  pour chacune : soit `security invoker` (par défaut : `otto_tenant()`, `otto_engagements()`,
  les gardes de verrou), soit un `security definer` JUSTIFIÉ et statué par écrit dans 0140.
  Verdict attendu : aucune fonction `definer` n'existe aujourd'hui — à VÉRIFIER par la requête,
  pas à supposer.
- *Les migrations après bascule* — **TRANCHÉ ET APPLIQUÉ (0140)** : `revoke all on _migrations
  from otto_app`, avec la raison écrite dans la migration.
  `_migrations` est fermée à `otto_app`. Les migrations
  ET le semis ET la remise à zéro tournent sous `SUPABASE_DB_URL` (rôle `postgres`), au build
  (`scripts/deploy/reconstruire.ts`) — jamais sous la chaîne de l'application. Écrit ici, et à
  écrire dans DEPLOY.md le jour de l'étape 3.
- *Ce qui tourne hors requête* — **RECENSÉ LE 2026-09-03 : AUCUN.** Le seul `cron` du dépôt est
  un travail de CI GitHub (`role-production.yml`), qui parle avec sa propre chaîne.
  À ce jour AUCUNE tâche de fond, aucun cron, aucun webhook
  entrant n'existe dans l'application (les relances sont posées par `ensureReminders` DANS une
  requête ; l'horloge de démonstration est une valeur d'`app_state`). Le jour où l'un naît, il
  pose son locataire par `withTenant` explicitement — il n'a pas de cookie.
- *Le format `otto_app.<ref>` est `[UNVERIFIED]`* : **étape 2 bis** — le fondateur essaie la
  chaîne depuis sa machine avec `psql` AVANT de toucher Vercel :
  `psql "postgresql://otto_app.<ref>:…@…:6543/postgres" -c "select current_user, (select rolbypassrls from pg_roles where rolname = current_user)"`
  et attend `otto_app` / `f`. Tant que cette ligne n'a pas été vue, l'étape 3 n'existe pas.
- *La contradiction de l'étape 3* : `/api/sante` n'a pas de session et déclencherait le garde.
  Tranché : `/api/sante` est un chemin LISTÉ sans locataire (A.4) et lit sous une DÉROGATION
  NOMMÉE (`withTenant(<locataire de la démonstration>)` posé par la route elle-même, parce
  qu'elle ne sert que la démonstration publique) ; le test négatif « un cabinet ne lit pas
  l'autre » se conduit AUTREMENT : par le harnais d'acceptation avec deux identités de deux
  cabinets (le second cabinet fictif est créé par `creerMission` avant l'étape 3), jamais par
  la sonde de santé.

  **ÉCART TROUVÉ LE 2026-09-10, PAS ENCORE RÉSOLU — signalé, jamais choisi seul (interdit,
  l'étape 3 est un geste du fondateur).** Ce paragraphe décrit le code comme lisant sous
  `withTenant(<locataire de la démonstration>)`. Vérifié par lecture directe le 2026-09-10 :
  `app/src/app/api/sante/route.ts:68` appelle `sansLocataire('sante', () => corpsDeLaSonde())`
  et **rien d'autre** — aucun `withTenant`, aucun `set_config('otto.tenant_id', …)`. Sous le rôle
  BYPASSRLS servi aujourd'hui, ça ne change rien (les politiques sont inertes). Mais si l'étape 3
  s'exécutait EXACTEMENT comme ce paragraphe le décrit, `/api/sante` ne poserait aucun locataire
  et lirait `otto_tenant()` = null : la quasi-totalité de ses lectures rendrait VIDE (la plupart
  des `essayer()` traitent le vide comme non fatal), pas le contenu réel du cabinet de
  démonstration que ce paragraphe promet. **Deux options, nommées, ni choisies** : (i) faire
  poser réellement le locataire de démonstration par la route (un `withTenant` explicite ajouté
  à `corpsDeLaSonde()`), pour que le paragraphe ci-dessus redevienne vrai ; (ii) corriger ce
  paragraphe pour décrire ce que la route fait VRAIMENT (une dérogation LOC-01 pure, sans
  locataire posé) et accepter qu'une fois l'étape 3 faite, `/api/sante` deviendra largement VIDE
  jusqu'à ce que ce geste soit fait séparément. Le fondateur tranche ; ni l'un ni l'autre n'a été
  fait ici.
- *Point de restauration et surveillance* : avant l'étape 3, un `pg_dump` du schéma public
  (ou le point de restauration Supabase) ; dans les minutes qui suivent la bascule, lire
  `server_error` et le journal Vercel pour le taux d'erreurs « requête sans locataire » —
  c'est ce chiffre qui distingue « ça marche » de « une partie de l'application est muette ».

## 1. `withTenant` — poser le locataire dans CHAQUE transaction (code, sans changer la base)

**Ce qu'on écrit.**
```ts
// app/src/lib/db/tenant.ts
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tx(async (run) => {
    await run(`select set_config('otto.tenant_id', $1, true)`, [tenantId]);   // LOCAL à la transaction
    return fn();
  });
}
```
- **Les actions serveur** : `executer()` (app/refus.ts) conduit déjà chaque geste par
  `conduire()` ; on y ajoute `withTenant(session.tenant_id, …)` autour — un seul endroit.
- **Les rendus (server components)** : ils appellent `q()` hors transaction. Deux voies,
  UNE à choisir avec le fondateur :
  - (a) **`q()` pose le locataire lui-même** quand aucune transaction n'est active et qu'une
    session est lisible (`cookies()` de `next/headers`, déjà lue par `getSessionUser`) :
    chaque `q()` devient une courte transaction `set local` + requête. Coût : un aller-retour
    de plus par requête sur le pooler ; avantage : aucun écran à toucher.
  - (b) **chaque page ouvre `withTenant`** en tête (après `requireMember`) : explicite, mais
    82 écrans à toucher et un oubli = une page vide sans erreur (règle 13).
  Recommandation : (a), avec le garde ci-dessous qui rend l'oubli impossible.
- **Les scripts et les tests** : `seedBase`, `demo:seed`, les harnais parlent sous
  `postgres`/propriétaire ; ils continuent de passer (BYPASSRLS) — jusqu'à l'étape 2 où la
  CI « rôle de production » les rejouera sous le rôle applicatif AVEC `withTenant`.

**Le cas connu MAUVAIS (à écrire AVANT, doit échouer sur l'ancien code, passer sur le
nouveau)** — `app/src/lib/db/tenant.test.ts`, joué sous un rôle SANS BYPASSRLS créé par le test
lui-même (PGlite permet `create role … nobypassrls` et `set role`) :
1. `set role otto_app_test; select count(*) from engagement` **hors** `withTenant` → **0 ligne**
   (et pas une erreur) — c'est le silence que la règle 13 nomme : le garde (ci-dessous) doit le
   transformer en refus.
2. `withTenant(<autre cabinet>, …)` → 0 ligne du cabinet de démonstration.
3. `withTenant(<cabinet démo>, …)` → les lignes attendues ; et un `logEvent` DANS ce
   `withTenant` écrit `event_log` (policy `event_log_tenant`) sans erreur.
4. `insert` d'un dossier d'un autre `tenant_id` sous `withTenant(démo)` → refusé par la
   politique (`with check`) — vérifier que les politiques 0004/0029 portent bien un `with
   check` ; sinon les compléter (migration 0140) : une politique `using` seule laisse ÉCRIRE
   chez le voisin.

**Le garde contre l'oubli — ÉCRIT (`app/src/lib/db/sans-locataire.ts`).** Sous un rôle sans
BYPASSRLS, un `q()` qu'aucun `withTenant` et aucune dérogation n'englobe **lève LOC-01** en
citant la table visée, au lieu de rendre zéro ligne. Il regarde le CONTEXTE ASYNCHRONE, pas la
base : `withTenant` pose DEUX fois — dans la base (`set local`, pour les politiques) et dans le
contexte (pour le garde).

**Il s'arme tout seul, à partir du rôle SERVI** (une requête sur `pg_roles` à l'ouverture de la
base) : désarmé sous un rôle BYPASSRLS — donc inerte aujourd'hui, en production comme en local
— armé sous `otto_app`. `OTTO_GARDE_LOCATAIRE=1/0` tranche à la main.

**Il a REFUSÉ, et c'est observé, pas déclaré** (règle 17) : `tenant.test.ts` l'arme et vérifie
qu'une lecture nue lève LOC-01 en nommant `engagement` ; que la même lecture passe sous
`withTenant` et sous une dérogation listée ; qu'une clé de dérogation NON écrite est refusée
(LOC-02) armé ou non ; et — la branche que rien n'exécuterait autrement — qu'un pilote qui
répond « rolbypassrls = false » arme le garde sans variable d'environnement.

**La liste écrite des chemins sans locataire (A.4)** vit dans le même fichier : **sept** chemins,
**six câblés** (`session`, `choix-identite`, `lien-demo`, `portail-client`, `sante`, `erreur`) et
un déclaré **à câbler** (`scripts`, qui tourne sous `postgres`). Le compte est ASSERTÉ par le
test, pas récité — la première rédaction disait « six chemins, cinq câblés » en énumérant six
clés dans la même parenthèse. `sans-locataire.test.ts` vérifie les DEUX sens : une clé annoncée
câblée et absente du code rougit, une clé annoncée « à câbler » et posée rougit.

**Le balayage des points d'entrée a été REFAIT, parce que le premier mentait.** Il comptait
quatre marqueurs de texte — `sansLocataire(`, `requireUser(`, `requireMember(`,
`getSessionUser(` — et déclarait « couvert » tout fichier qui en portait un ; il ne trouvait que
**deux** découverts. Or `requireUser` et `getSessionUser` prouvent qu'une SESSION existe, jamais
qu'un LOCATAIRE est posé : l'écran d'accueil portait les deux marqueurs et lisait `engagement`
hors de toute portée. Le critère est désormais le seul vrai — poser un locataire, c'est appeler
`withTenant(` ou `sansLocataire(` — et le résultat est celui qu'il faut dire en face : sur
**52** points d'entrée, **6** en posent un. Le cas connu mauvais du critère (l'accueil) est un
test à part entière.

*Ce balayage a trouvé une route que l'inventaire à la main avait manquée* — `/demo/[qui]`, hors
de `src/app/api/` : elle CRÉE la session, donc elle s'exécute forcément sans cabinet.

**Et toute pose de `otto.tenant_id` est écrite** : le commentaire du garde affirmait « il
n'existe pas d'autre chemin dans ce dépôt, et le test le vérifie » — il en existait un
(`scripts/deploy/reconstruire.ts`) et aucun test ne vérifiait rien. Un balayage énumère
désormais les trois poses connues et rougit sur une quatrième.

*Ce balayage a trouvé une route que l'inventaire à la main avait manquée* — `/demo/[qui]`,
hors de `src/app/api/` : elle CRÉE la session, donc elle s'exécute forcément sans cabinet.

**Retour arrière** : aucun tant que le rôle servi contourne la RLS — le code est alors inerte.
**MAIS l'armement n'est pas une bascule sans conséquence**, et la première rédaction le laissait
croire : tant que le câblage n'est pas fait, armer refuse `logEvent` — donc tout changement
d'état — et l'écran d'accueil. Mesuré par `tenant.test.ts`, « ce que l'armement coûterait
aujourd'hui ».

## 2. Le rôle applicatif `otto_app` sans BYPASSRLS (base)

**Migration 0140** (bande de la soirée) :
```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'otto_app') then
    create role otto_app login nobypassrls nosuperuser noinherit;
  end if;
end $$;
grant usage on schema public to otto_app;
grant select, insert, update, delete on all tables in schema public to otto_app;
grant usage, select on all sequences in schema public to otto_app;
alter default privileges in schema public grant select, insert, update, delete on tables to otto_app;
alter default privileges in schema public grant usage, select on sequences to otto_app;
grant execute on all functions in schema public to otto_app;
-- le mot de passe se pose À LA MAIN par le fondateur (jamais dans une migration) :
-- alter role otto_app password '…';
```
- `otto_app` **n'est pas propriétaire** : FORCE ROW LEVEL SECURITY (0034) le tient de toute façon.
- Les tables « propriétaire-seul » (`_migrations`, `app_state`, `engagement_lock_verdict`,
  `demo_instantane`…) restent fermées à `otto_app` **sauf** celles que l'application lit :
  `engagement_lock_verdict` (registre des gardes, lu par `/api/sante`) et `app_state`
  reçoivent une politique de lecture, listée dans `assertions-role.ts` (la liste
  propriétaire-seul y est déjà tenue — une table oubliée arrête le build, c'est voulu).
- **La remise à zéro de la démonstration** (`demo/remise-a-zero`, `truncate` + reprise de
  l'instantané) et **le semis au build** tournent sous `postgres` : ils gardent leur chaîne
  (`SUPABASE_DB_URL` du build), pas celle de l'application.

**CE QUE 0140 FAIT RÉELLEMENT (écrite et appliquée le 2026-09-03)**, au-delà du canevas
ci-dessus :
- elle **retire** deux droits que `grant … on all tables` avait donnés en bloc : `_migrations`
  (les migrations tournent sous `postgres`) et `notification` — **aucun chemin de l'application
  ne la lit ni ne l'écrit**, recensé ; une table qu'aucun chemin n'atteint est un objet mort
  (règle 13), on ne lui ouvre pas de droit « au cas où » ;
- elle donne une **politique** aux cinq tables que l'application lit et qui n'en avaient
  aucune — `app_state`, `blob_store`, `itgc_area`, `engagement_lock_verdict`, `server_error` :
  sous `otto_app` elles auraient rendu ZÉRO LIGNE sans un mot (horloge muette, pièces jointes
  introuvables, sonde de santé aveugle). Chaque prédicat `true` porte sa justification écrite ;
- elle **revérifie** l'absence de fonction `security definer` et lève sinon.

`PROPRIETAIRE_SEUL` (dans `assertions-role.ts`) tombe donc de sept noms à deux, et un test
neuf attrape le sens qui manquait : une table restée sur la liste alors qu'une migration lui a
DONNÉ une politique — une justification périmée que rien ne voyait.

**LA DETTE QUE 0140 NE FERMAIT PAS — FERMÉE PAR 0141, LE SOIR MÊME (corrigé le 2026-09-10 ;
resté stale sur cette page pendant des dizaines de commits, rule 1).**
`supabase/migrations/0141_portail_par_jeton_et_pieces.sql` :
1. `blob_store` — sa politique `true` (énumérable entre cabinets) est remplacée par
   `blob_store_par_reference` : les octets ne se lisent que par une référence existante
   (`evidence`/`export_record`/`file_archive`/portail), jamais par le seul `storage_path`.
   **Fermé.** Cas connu mauvais couvert : `tenant.test.ts`, « les OCTETS d'une pièce ne se
   lisent plus entre cabinets ».
2. **Le portail client** reçoit ses politiques par jeton (`client_contact_portail`,
   `engagement_portail`, `entity_portail`, `request_portail`, `request_item_portail`,
   `evidence_portail`, `evidence_portail_depot`, `request_item_portail_reponse` — huit
   politiques, plus `blob_store_par_reference`, neuf en tout), portées par deux fonctions
   `security definer` JUSTIFIÉES et enregistrées dans `rls_definer_justifiee`
   (`otto_portal_contact`, `otto_portal_entity`). **Fermé.** Cas connu mauvais couverts :
   `tenant.test.ts`, quatre cas — jeton inconnu, contact désactivé, jeton correct (missions
   propres seulement, zéro papier de travail ni note de revue), byte de blob non référencé.

**Reconfirmé par lecture directe de 0141 le 2026-09-10**, pas seulement cité d'une recherche
antérieure (règle 12) : les neuf politiques et les deux fonctions `definer` existent telles que
décrites ci-dessus, dans le fichier de migration lui-même.

**Le cas connu MAUVAIS** : la CI « rôle de production » (`role-production.yml`), qui n'a
jamais tourné, se lance avec `OTTO_CI_DATABASE_URL` sur le rôle `otto_app` d'une base de CI
SÉPARÉE : le bloc d'assertions doit imprimer `rolbypassrls : false`, la tentative de fuite
inter-cabinets du build doit **échouer** (elle est aujourd'hui le seul exercice des politiques),
et la suite doit passer — chaque fichier de test posant `withTenant`. Si un test lit zéro ligne
là où il en attend, c'est un `q()` sans locataire : le garde de l'étape 1 le nomme.

**Retour arrière** : `drop owned by otto_app; drop role otto_app;` — rien d'autre ne dépend du rôle
tant que l'étape 3 n'est pas faite.

## 3. La chaîne de connexion (production) — le seul geste qui touche l'URL

Avec le fondateur à l'écran, dans cet ordre, et **pas un soir** :
1. Poser le mot de passe de `otto_app` (SQL, à la main, jamais dans le dépôt).
2. Vercel → Environment Variables → `DATABASE_URL` : `postgresql://otto_app.<ref>:…@…:6543/postgres`
   (pooler de transaction ; `otto_app.<ref>` comme utilisateur — **[UNVERIFIED]** : le format
   `rôle.<ref>` au pooler n'a été vu que pour `postgres`, DEPLOY.md). Garder l'ancienne valeur
   sous la main.
3. Redéployer **sans re-semer** (le semis reste sous `SUPABASE_DB_URL`) ; lire le bloc
   d'assertions du build : `rolbypassrls : false`, FORCE partout, 0 table sans politique.
4. `npm run accept` contre l'URL, **en sonde** (défaut), puis `/api/sante` : les lectures
   passent, la version est celle attendue (`--sha=`).
5. **Le cas connu MAUVAIS en production** : ouvrir l'application avec l'identité d'un
   cabinet, appeler `/api/sante` qui lit le dossier de l'AUTRE cabinet de démonstration
   (s'il en existe un ; sinon en créer un fictif par `creerMission` sous un second locataire
   AVANT l'étape 3) : zéro ligne. Un seul chiffre du voisin = retour arrière immédiat.

**Retour arrière** : remettre l'ancienne `DATABASE_URL`, redéployer. Aucune donnée n'a bougé.

## Ce que ce plan ne fait pas, et le dit

- Pas de politique **par dossier** (un membre lit tout le cabinet) : c'est la règle actuelle du
  produit, `requireMember` la précise en application ; une politique par dossier exigerait de
  poser AUSSI l'utilisateur (`otto_user()`) par transaction et de réécrire `otto_engagements()`
  — une autre tranche, après celle-ci.
- Pas de RLS sur PGlite en local hors des tests dédiés (le propriétaire contourne, FORCE ou pas).
- ~~Pas d'isolation de `blob_store`~~ **FERMÉ par 0141** (corrigé le 2026-09-10, voir §2 —
  politique `blob_store_par_reference` remplace `true`).
- ~~Pas de politique par jeton pour le portail client~~ **FERMÉ par 0141** (corrigé le
  2026-09-10, voir §2 — huit politiques par jeton, deux fonctions `definer` justifiées).
- Pas de couverture du chemin `scripts` par le garde : il tourne sous `postgres`, le garde y
  est désarmé, et le câblage ne changerait rien tant que la CI « rôle de production » ne
  rejoue pas le semis sous `otto_app` — **toujours vrai** (règle 12, reconfirmé le 2026-09-10 :
  `role-production.yml` n'a toujours jamais tourné, `OTTO_CI_DATABASE_URL` toujours absent).
- La sonde d'acceptation et le témoin restent valables : un `set local` vit et meurt avec la
  transaction annulée.
