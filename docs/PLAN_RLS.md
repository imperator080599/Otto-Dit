# Plan §10 — la sécurité par ligne APPLIQUÉE à l'application (préparé le 2026-09-02 au soir, à exécuter avec le fondateur à l'écran)

**Ordre, tel que corrigé par le fondateur** : `withTenant` d'abord, puis le rôle, puis la chaîne
de connexion. Rien de ce qui suit n'a été exécuté ce soir ; `DATABASE_URL` n'est pas modifiée.
Ce document est le plan complet, avec pour chaque étape la commande, le cas connu MAUVAIS qui
doit échouer (règle 17), et le retour arrière.

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

**A.5 — `with check` d'abord, pas en quatrième.** Une politique en `using` seul empêche de LIRE
chez le voisin mais laisse ÉCRIRE chez lui (un `insert` d'un dossier d'un autre `tenant_id`
passe). C'est CE point qui décide si l'isolation est réelle. Première action de l'étape 1 :
recenser les politiques de 0004/0029 sans `with check` —
`select tablename, policyname from pg_policies where schemaname = 'public' and with_check is null` —
et les compléter dans **0140** (`create policy … using (…) with check (…)`, même prédicat).
Le test de fuite de l'étape 1 (cas 4) devient le PREMIER cas, et il doit échouer sur le schéma
actuel avant 0140 (règle 17).

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
- *Les fonctions `SECURITY DEFINER`* : `grant execute on all functions` accorde tout en bloc,
  et une fonction appartenant à `postgres` s'exécute avec les droits du propriétaire — elle
  CONTOURNE la RLS. Recensement avant l'étape 2 :
  `select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where nspname = 'public' and prosecdef` ;
  pour chacune : soit `security invoker` (par défaut : `otto_tenant()`, `otto_engagements()`,
  les gardes de verrou), soit un `security definer` JUSTIFIÉ et statué par écrit dans 0140.
  Verdict attendu : aucune fonction `definer` n'existe aujourd'hui — à VÉRIFIER par la requête,
  pas à supposer.
- *Les migrations après bascule* : `_migrations` est fermée à `otto_app`. Les migrations
  ET le semis ET la remise à zéro tournent sous `SUPABASE_DB_URL` (rôle `postgres`), au build
  (`scripts/deploy/reconstruire.ts`) — jamais sous la chaîne de l'application. Écrit ici, et à
  écrire dans DEPLOY.md le jour de l'étape 3.
- *Ce qui tourne hors requête* : à ce jour AUCUNE tâche de fond, aucun cron, aucun webhook
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

**Le garde contre l'oubli** : sous un rôle sans BYPASSRLS, un `q()` hors transaction et sans
session lisible **lève** (« requête sans locataire ») au lieu de rendre zéro ligne. Testé par le
cas 1.

**Retour arrière** : aucun (le code est inerte sous BYPASSRLS — c'est l'étape 2 qui l'arme).

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
- La sonde d'acceptation et le témoin restent valables : un `set local` vit et meurt avec la
  transaction annulée.
