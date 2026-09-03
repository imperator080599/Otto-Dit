-- 0141 — LES DEUX DETTES QUE 0140 A NOMMÉES SANS LES FERMER
-- (mandat du soir, étage 0.2). Tant qu'elles vivent, l'étape 3 de PLAN_RLS est
-- INTERDITE : le rôle applicatif y lirait les pièces de tous les cabinets, et
-- le portail client rendrait une page 500 au contact.

-- ══ 1. LE PORTAIL CLIENT, PAR JETON ════════════════════════════════════════
--
-- LE PROBLÈME. Le contact client n'appartient à AUCUN cabinet : il n'a pas de
-- locataire, et les politiques par locataire ne peuvent donc rien pour lui.
-- Sous un rôle sans BYPASSRLS, ses deux écrans lèvent — mesuré par la revue
-- hostile n°9 (constat 20) : `LOC-01 : requête sans locataire sur « request »`.
-- Un refus rendu en page 500 au client est la forme même du défaut que la
-- règle 13 nomme.
--
-- LA RÉPONSE. Le jeton EST l'identité, comme le cookie l'est pour l'auditeur :
-- il se pose dans la transaction (`otto.portal_token`), et des politiques
-- PERMISSIVES s'ajoutent à celles du locataire — PostgreSQL les combine par OU.
-- Une session d'auditeur ne pose pas de jeton et ne gagne donc rien ; une
-- session de portail ne pose pas de locataire et ne voit que son entité.
--
-- OÙ CETTE RÈGLE CESSE DE REGARDER, dit ici :
--   · elle ne borne pas ce que le contact fait de ce qu'il voit ; la liste
--     blanche du portail (docs/04 §9.7) reste tenue en application ;
--   · un jeton fuité vaut l'accès, comme un lien de partage — c'est le modèle
--     assumé du portail, pas un défaut de cette migration ;
--   · elle ne dit rien des contacts DÉSACTIVÉS d'un jeton encore connu : la
--     fonction ci-dessous exige `active`.

-- ── POURQUOI CES DEUX FONCTIONS SONT `SECURITY DEFINER` ────────────────────
-- MESURÉ, PAS SUPPOSÉ. Écrites en `security invoker` (le défaut, et la règle du
-- dépôt), elles produisent une RÉCURSION INFINIE : la politique de `engagement`
-- appelle `otto_portal_entity()`, qui lit `client_contact`, dont la politique
-- remonte à `engagement`. Sous PGlite, la lecture ne rend pas une erreur
-- lisible mais « ERRORDATA_STACK_SIZE exceeded » — et, vue de l'application,
-- ZÉRO LIGNE. C'est le silence que la règle 13 nomme, produit par la garde
-- elle-même. Constaté en bissectant les huit politiques une par une.
--
-- `security definer` est ici le cas JUSTIFIÉ que docs/PLAN_RLS.md (A.6)
-- prévoyait. Ce qu'elles font mérite ce droit et rien de plus : résoudre UN
-- jeton vers UN contact actif, puis vers son entité. Elles ne rendent aucune
-- donnée de dossier, ne prennent aucun argument (donc rien à injecter), et
-- `search_path` est figé — sans quoi un schéma temporaire pourrait détourner
-- `client_contact`.
--
-- CE QU'ELLES NE FONT PAS : elles ne vérifient pas que le porteur du jeton est
-- légitime. Un jeton fuité vaut l'accès, comme un lien de partage — c'est le
-- modèle assumé du portail (ADR-006), écrit ici pour qu'on ne le découvre pas
-- ailleurs.

/* LE REGISTRE EST CRÉÉ ICI S'IL N'EXISTE PAS, ET VOICI POURQUOI CETTE LIGNE
   EXISTE — c'est la trace d'un défaut qui a coûté trois déploiements.

   0140 a été appliquée en production le 3 septembre. Le SOIR du même jour,
   j'ai AJOUTÉ ce registre au fichier 0140 — un fichier DÉJÀ APPLIQUÉ. Une
   migration appliquée ne rejoue jamais : `_migrations` la connaît par son nom.
   Sur une base fraîche, 0140 crée la table et tout va bien ; sur la base de
   PRODUCTION, elle n'existera JAMAIS. 0141, qui écrit dedans, a donc échoué à
   chaque déploiement — `relation "rls_definer_justifiee" does not exist` — et
   trois tranches poussées sur `main` ne sont jamais arrivées à l'URL.

   La règle, apprise à ce prix : ON N'ÉDITE PAS UNE MIGRATION APPLIQUÉE. Ce que
   0140 a gagné après coup se recrée donc ICI, de façon idempotente : sur une
   base fraîche c'est un no-op, sur la production c'est la réparation. Et la
   récidive est désormais rendue impossible par l'empreinte que `migrate()`
   enregistre à l'application (voir `db/migrate.ts`). */
create table if not exists rls_definer_justifiee (
  nom text primary key,
  raison text not null check (btrim(raison) <> ''),
  inscrite_le timestamptz not null default now()
);
alter table rls_definer_justifiee enable row level security;
alter table rls_definer_justifiee force row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'otto_app') then
    execute 'revoke all on rls_definer_justifiee from otto_app';
  end if;
end $$;

/* INSCRITES AU REGISTRE AVANT D'EXISTER : la garde de 0140 (et celle de toute
   migration ultérieure) lit cette table, pas un commentaire. */
insert into rls_definer_justifiee (nom, raison) values
  ('otto_portal_contact', 'PORTAIL CLIENT (0141) : résout UN jeton vers UN contact actif. En security invoker, elle produit une RÉCURSION INFINIE entre la politique de engagement et celle de client_contact — mesuré. Sans argument, search_path figé, ne rend aucune donnée de dossier.'),
  ('otto_portal_entity', 'PORTAIL CLIENT (0141) : l''entité du contact que le jeton désigne. Même raison, même forme.')
on conflict (nom) do update set raison = excluded.raison;

create or replace function otto_portal_contact() returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from client_contact c
  where c.portal_token = nullif(current_setting('otto.portal_token', true), '')
    and c.active
$$;

create or replace function otto_portal_entity() returns uuid
language sql stable security definer set search_path = public as $$
  select c.entity_id from client_contact c where c.id = otto_portal_contact()
$$;

/* Le rôle applicatif doit pouvoir les appeler ; `grant … on all functions` de
   0140 est passé AVANT leur création. */
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'otto_app') then
    execute 'grant execute on function otto_portal_contact() to otto_app';
    execute 'grant execute on function otto_portal_entity() to otto_app';
  end if;
end $$;

-- Le contact se lit lui-même, et lui seul.
create policy client_contact_portail on client_contact
  for select using (id = otto_portal_contact());

-- Les missions de SON entité — c'est ce que `portalSession` rend.
create policy engagement_portail on engagement
  for select using (entity_id = otto_portal_entity());

-- L'entité elle-même : le nom du client s'affiche en tête du portail.
create policy entity_portail on entity
  for select using (id = otto_portal_entity());

-- Les demandes ENVOYÉES de ses missions, et leurs éléments. Une demande en
-- brouillon n'est pas encore une demande : le portail ne la voit pas.
create policy request_portail on request
  for select using (
    status <> 'draft'
    and engagement_id in (select id from engagement where entity_id = otto_portal_entity()));

create policy request_item_portail on request_item
  for select using (exists (
    select 1 from request r where r.id = request_item.request_id
      and r.status <> 'draft'
      and r.engagement_id in (select id from engagement where entity_id = otto_portal_entity())));

-- Les pièces attachées à ces éléments : celles que le client a déposées, et
-- celles qu'on lui a demandées. Jamais le reste du dossier.
create policy evidence_portail on evidence
  for select using (exists (
    select 1 from request_item i join request r on r.id = i.request_id
    where i.id = evidence.request_item_id and r.status <> 'draft'
      and r.engagement_id in (select id from engagement where entity_id = otto_portal_entity())));

-- ET L'ÉCRITURE DU CLIENT : déposer une pièce, répondre à une explication,
-- marquer « tout est envoyé ». Trois écritures, bornées aux mêmes éléments.
create policy evidence_portail_depot on evidence
  for insert with check (exists (
    select 1 from request_item i join request r on r.id = i.request_id
    where i.id = evidence.request_item_id and r.status <> 'draft'
      and r.engagement_id in (select id from engagement where entity_id = otto_portal_entity())));

create policy request_item_portail_reponse on request_item
  for update using (exists (
    select 1 from request r where r.id = request_item.request_id
      and r.status <> 'draft'
      and r.engagement_id in (select id from engagement where entity_id = otto_portal_entity())));

-- ══ 2. `blob_store` — LES OCTETS NE SE LISENT PLUS ENTRE CABINETS ═════════
--
-- CE QUE 0140 LAISSAIT OUVERT, ET QUE LA REVUE HOSTILE A MESURÉ (constat 9) :
-- les octets sont DANS la table (`bytes bytea`), et la politique valait `true`.
-- Sous `otto_app`, `select bytes from blob_store` rendait toutes les factures,
-- confirmations bancaires et annexes de TOUS les cabinets en une requête. Ce
-- n'était pas « des chemins énumérables » : c'était le contenu.
--
-- POURQUOI PAS UNE COLONNE `tenant_id`. Le magasin est adressé par CONTENU et
-- déduplique par construction (0028) : deux cabinets qui déposent les mêmes
-- octets retombent sur la même ligne. Une colonne de locataire casserait cela,
-- ou obligerait à dupliquer les octets.
--
-- LA RÉPONSE : la pièce se lit par ce qui la RÉFÉRENCE. Trois tables portent un
-- `storage_path` et un dossier — `evidence`, `export_record` (par son papier) et
-- `file_archive`. La déduplication survit : les mêmes octets restent atteignables
-- par chaque cabinet qui les a déposés, par SA propre ligne.
--
-- OÙ CETTE RÈGLE CESSE DE REGARDER :
--   · l'INSERTION reste ouverte (`with check (true)`) — il faut pouvoir déposer
--     avant que la ligne qui référence existe, et les deux sont dans la même
--     transaction. La substitution de contenu, elle, est refermée dans le code :
--     `readBlob` recalcule le sha256 et refuse un contenu qui ne rend pas son
--     adresse (BLOB-01, garde G-26) ;
--   · une pièce qu'AUCUNE des trois tables ne référence devient illisible pour
--     l'application. C'est voulu : un octet que rien ne réclame n'a pas de
--     raison d'être servi.

drop policy if exists blob_store_applicatif on blob_store;
create policy blob_store_par_reference on blob_store
  using (
    exists (select 1 from evidence e
            where e.storage_path = blob_store.storage_path
              and e.engagement_id in (select otto_engagements()))
    or exists (select 1 from export_record x join workpaper w on w.id = x.workpaper_id
               where x.storage_path = blob_store.storage_path
                 and w.engagement_id in (select otto_engagements()))
    or exists (select 1 from file_archive a
               where a.storage_path = blob_store.storage_path
                 and a.engagement_id in (select otto_engagements()))
    /* Le portail : le client relit la pièce qu'il vient de déposer. */
    or exists (select 1 from evidence e
               join request_item i on i.id = e.request_item_id
               join request r on r.id = i.request_id
               where e.storage_path = blob_store.storage_path and r.status <> 'draft'
                 and r.engagement_id in (select id from engagement where entity_id = otto_portal_entity()))
  )
  with check (true);
