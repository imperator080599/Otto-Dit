-- 0140 — LE RÔLE APPLICATIF `otto_app`, SANS BYPASSRLS (docs/PLAN_RLS.md, étape 2 ;
-- mandat du jour n°3, §1.1). Cette migration CRÉE le rôle et ses droits. Elle ne
-- bascule RIEN : `DATABASE_URL` continue de désigner `postgres`. La bascule est
-- l'étape 3 du plan, qui n'est PAS exécutée et ne le sera qu'avec le fondateur.
--
-- ── CE QUE LA MESURE A DIT, ET QUI CORRIGE LE PLAN ──────────────────────────
-- Le plan (addendum A.5) posait : « une politique en `using` seul empêche de
-- LIRE chez le voisin mais laisse ÉCRIRE chez lui ». C'est FAUX ici, et ce
-- n'est pas la documentation qui le dit — c'est l'observation
-- (`app/src/lib/db/tenant.test.ts`, cas 4 et 4 bis, joués sous un rôle sans
-- BYPASSRLS) : les 102 politiques du schéma sont `for all`, et pour `for all`
-- un `with check` OMIS fait servir `using` AUSSI au contrôle de l'écriture.
-- Un `insert` au nom d'un autre cabinet est refusé ; un `update` qui déplace
-- une ligne chez le voisin est refusé. Il n'y a donc AUCUN `with check` à
-- compléter, et cette migration n'en complète aucun. Chiffres mesurés le
-- 2026-09-03 : 102 politiques, toutes `for all`, 101 sans `with check` (seule
-- `ui_repli_tenant` en porte un), 0 fonction `security definer` sur 12,
-- 109 tables publiques, 0 vue, un seul rôle non système (`postgres`, superutilisateur).
--
-- ── OÙ CETTE MIGRATION CESSE DE REGARDER ────────────────────────────────────
-- · Elle ne pose PAS de mot de passe. Un secret n'entre pas dans le dépôt ;
--   `alter role otto_app password '…'` se fait à la main (PLAN_RLS étape 3.1).
-- · Elle ne rend PAS les politiques effectives pour l'application : tant que
--   `DATABASE_URL` désigne un rôle BYPASSRLS, elles restent inertes, et le bloc
--   d'assertions de chaque build l'imprime en toutes lettres (ADR-115).
-- · Elle n'ajoute AUCUNE politique par dossier : le prédicat reste par cabinet
--   (`otto_tenant()`), `requireMember` et `assertMembre` précisent en
--   application (core/membre.ts).

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'otto_app') then
    create role otto_app login nobypassrls nosuperuser noinherit;
  end if;
end $$;

grant usage on schema public to otto_app;
grant select, insert, update, delete on all tables in schema public to otto_app;
grant usage, select on all sequences in schema public to otto_app;
grant execute on all functions in schema public to otto_app;
-- CE QUE `alter default privileges` NE COUVRE PAS, dit ici (revue hostile n°9,
-- constat 19) : sans `for role`, la clause ne s'applique qu'aux objets créés
-- PAR LE RÔLE QUI EXÉCUTE CETTE MIGRATION. Les migrations locales tournent sous
-- le propriétaire PGlite, la production sous `postgres`, mais la CI « rôle de
-- production » migre sous le rôle que `OTTO_CI_DATABASE_URL` désigne. Une table
-- créée plus tard par un AUTRE rôle n'aurait aucun droit pour `otto_app` —
-- l'échec serait bruyant (`permission denied`), pas silencieux, mais il faut
-- savoir où le chercher.
alter default privileges in schema public grant select, insert, update, delete on tables to otto_app;
alter default privileges in schema public grant usage, select on sequences to otto_app;

-- ── DEUX TABLES QUE L'APPLICATION NE DOIT PAS ATTEINDRE ─────────────────────
-- `grant … on all tables` accorde en bloc : ce qui suit reprend ce qu'il ne
-- fallait pas donner. Chaque retrait porte sa raison.
--
-- `_migrations` : les migrations, le semis et la remise à zéro tournent sous
-- `SUPABASE_DB_URL` (rôle `postgres`), au build (`scripts/deploy/reconstruire.ts`)
-- — jamais sous la chaîne de l'application. C'est la réponse écrite à l'angle
-- mort A.6 « qui applique les migrations après bascule ».
revoke all on _migrations from otto_app;
-- `notification` : AUCUN chemin de l'application ne la lit ni ne l'écrit
-- aujourd'hui (vérifié par recherche sur src/ et scripts/ le 2026-09-03 : zéro
-- occurrence hors du recensement lui-même). Une table qu'aucun chemin
-- n'atteint est un objet mort (règle 13) : on ne lui ouvre pas de droit « au
-- cas où ». Le jour où une notification s'écrit, elle demandera son droit et
-- sa politique, et ce refus la fera parler.
revoke all on notification from otto_app;

-- ── LES CINQ TABLES SANS LOCATAIRE QUE L'APPLICATION LIT ────────────────────
-- Elles portaient RLS + FORCE et AUCUNE politique : sous `otto_app`, elles
-- rendraient ZÉRO LIGNE sans un mot — l'horloge de démonstration muette, les
-- pièces jointes introuvables, la sonde de santé aveugle. Le silence lu comme
-- un succès (règle 13). Chacune reçoit donc une politique, et chaque politique
-- porte par écrit POURQUOI son prédicat est `true`.

-- `app_state` : clé/valeur d'application (décalage d'horloge de la
-- démonstration, préférences d'affichage). Aucun contenu de mission, aucun
-- nom de client — le fichier d'audit n'en dépend pas.
-- ET L'ÉCRITURE, EXAMINÉE (revue hostile n°9, constat 10 : la justification
-- d'origine ne parlait que de lecture). Elle reste ouverte, et c'est délibéré :
-- `core/clock.ts` écrit `clock_offset`, et la remise à zéro de la démonstration
-- l'efface. RISQUE NOMMÉ : cette clé est l'horloge de TOUTE l'application —
-- échéances, âge des notes, jours ouvrés — donc un cabinet la décalerait pour
-- tous les autres. Aujourd'hui `warp` n'est appelé que par `scripts/demo-seed.ts`
-- (recensé), donc le risque est théorique ; le jour où un écran l'appelle, cette
-- table demandera une clé par locataire.
drop policy if exists app_state_applicatif on app_state;
create policy app_state_applicatif on app_state using (true) with check (true);

-- `blob_store` : octets ADRESSÉS PAR CONTENU (`aa/sha256`), déduplication
-- comprise — deux cabinets qui déposent les mêmes octets retombent sur la même
-- ligne, par construction (0028). Une colonne `tenant_id` casserait cela.
-- RISQUE RÉSIDUEL — LA PREMIÈRE RÉDACTION LE SOUS-ESTIMAIT DEUX FOIS, ET LA
-- REVUE HOSTILE n°9 (constat 9) l'a mesuré :
--   1. Les OCTETS sont dans la table (`bytes bytea not null`, 0028), et
--      `readBlob` fait `select bytes … where storage_path = $1`. La politique
--      `true` n'expose donc pas des « chemins à connaître » : sous `otto_app`,
--      `select bytes from blob_store` rend TOUTES LES PIÈCES DE TOUS LES
--      CABINETS en une requête — factures, confirmations bancaires, annexes.
--   2. L'ÉCRITURE reste ouverte (`insert` : l'application dépose des pièces),
--      et `saveBlob` fait `on conflict (storage_path) do nothing` tandis que
--      `readBlob` ne revérifie JAMAIS le sha256. Un cabinet pouvait donc
--      pré-insérer un couple chemin/octets et faire relire SES octets à la
--      place de la pièce d'un autre. Ce second point est refermé aujourd'hui
--      dans le code : `readBlob` recalcule le sha256 et refuse un contenu qui
--      ne correspond pas à son adresse (core/storage.ts).
-- CE QUI RESTE OUVERT : la lecture croisée (point 1). Dette à régler AVANT
-- l'étape 3 — probablement une table de rattachement par locataire, puisqu'une
-- colonne `tenant_id` casserait la déduplication.
-- Pas de `delete`, pas d'`update` : la table est immuable par contrat.
drop policy if exists blob_store_applicatif on blob_store;
create policy blob_store_applicatif on blob_store using (true) with check (true);
revoke update, delete on blob_store from otto_app;

-- `itgc_area` : référentiel ITGC (trois lignes : access / change / operations),
-- rattaché à aucune mission. Lecture seule pour l'application ; il est semé
-- sous `postgres`.
drop policy if exists itgc_area_applicatif on itgc_area;
create policy itgc_area_applicatif on itgc_area using (true);
revoke insert, update, delete on itgc_area from otto_app;

-- `engagement_lock_verdict` : registre d'installation (0042) — un verdict par
-- TABLE du schéma, jamais par cabinet. Lu par le registre des gardes et par la
-- sonde de santé ; écrit par migration.
drop policy if exists engagement_lock_verdict_applicatif on engagement_lock_verdict;
create policy engagement_lock_verdict_applicatif on engagement_lock_verdict using (true);
revoke insert, update, delete on engagement_lock_verdict from otto_app;

-- `server_error` : les exceptions de rendu, écrites par le crochet
-- d'instrumentation. C'est la SEULE table où `using` et `with check` doivent
-- DIVERGER, et c'est délibéré :
--   · `with check (true)` — une erreur s'écrit TOUJOURS. Une exception peut
--     survenir avant toute session (donc sans locataire) ; un crochet qui
--     échoue à consigner la panne est la panne qui disparaît.
--   · `using (tenant_id is null or tenant_id = otto_tenant())` — on ne LIT que
--     les siennes, plus celles qu'aucun cabinet ne revendique.
drop policy if exists server_error_applicatif on server_error;
create policy server_error_applicatif on server_error
  using (tenant_id is null or tenant_id = otto_tenant())
  with check (true);
revoke update, delete on server_error from otto_app;

-- ── LE RECENSEMENT `SECURITY DEFINER` (angle mort A.6), FIGÉ ICI ────────────
-- `grant execute on all functions` accorde tout en bloc, et une fonction
-- `security definer` s'exécuterait avec les droits de son propriétaire :
-- elle CONTOURNERAIT la RLS. Mesuré : 0 fonction `definer` sur 12. Ce bloc le
-- REVÉRIFIE à l'application de la migration et ARRÊTE tout si une apparaît —
-- une règle qui ne s'exécute jamais n'est pas une règle.
/* LE REGISTRE DES `SECURITY DEFINER` JUSTIFIÉES — une TABLE, pas un
   commentaire. Le bloc ci-dessous garde le jour de l'application ; le registre
   permet à une migration ULTÉRIEURE d'ajouter une fonction `definer` en
   écrivant sa raison au même endroit, plutôt qu'en désarmant la garde. Le code
   tient la même liste (assertions-role.ts, DEFINERS_JUSTIFIEES) et un test
   vérifie que les deux disent la même chose — deux sources qui divergent, c'est
   toujours celle qu'on croit qui a tort (règle 1). */
create table if not exists rls_definer_justifiee (
  nom text primary key,
  raison text not null check (btrim(raison) <> ''),
  inscrite_le timestamptz not null default now()
);
alter table rls_definer_justifiee enable row level security;
alter table rls_definer_justifiee force row level security;
revoke all on rls_definer_justifiee from otto_app;

do $$
declare n int;
begin
  /* LES FONCTIONS D'EXTENSION SONT EXCLUES (revue hostile n°9, constat 18).
     Sur un projet Supabase, `public` peut porter des fonctions installées par
     une extension (pgcrypto, uuid-ossp…), dont certaines sont `security
     definer` par construction. Compter celles-là ferait LEVER ce bloc, donc
     échouer TOUTE la chaîne de migrations, donc le déploiement — et ce
     comportement n'a jamais été observé contre la cible réelle
     (`role-production.yml` : « CE TRAVAIL N'A JAMAIS TOURNÉ »). On ne compte
     donc que les fonctions qui appartiennent au SCHÉMA, pas à une extension. */
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef
     and not exists (select 1 from pg_depend d
                     where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from rls_definer_justifiee j where j.nom = p.proname);
  /* LA LISTE DES JUSTIFIÉES VIT DANS LE CODE (assertions-role.ts,
     DEFINERS_JUSTIFIEES) et non ici : une migration ne se relit pas, un
     recensement si. Ce bloc garde le jour de l'application ; le verdict du
     build et la suite gardent tous les jours. Au 2026-09-03, 0141 en ajoute
     deux (le portail par jeton), et elles sont créées APRÈS ce bloc. */
  if n > 0 then
    raise exception '0140 : % fonction(s) SECURITY DEFINER dans public — elles contournent la RLS. Statuez-les par écrit (DEFINERS_JUSTIFIEES) avant d''accorder execute à otto_app.', n;
  end if;
end $$;

-- ── CE QUI TOURNE HORS REQUÊTE (angle mort A.6) ─────────────────────────────
-- Recensé le 2026-09-03 : AUCUNE tâche de fond, aucun cron applicatif, aucun
-- webhook entrant. Les relances sont posées par `ensureReminders` DANS une
-- requête ; l'horloge de démonstration est une valeur d'`app_state` lue à la
-- demande ; le seul cron du dépôt est un travail de CI GitHub
-- (`role-production.yml`), qui parle avec sa propre chaîne. Le jour où l'un
-- naît, il n'aura pas de cookie : il posera son locataire par `withTenant`
-- explicitement, et le garde de `q()` (app/src/lib/db/sans-locataire.ts) le
-- lui rappellera en refusant.
