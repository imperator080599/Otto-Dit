-- 0031 — LES SECTIONS DU DOSSIER, ET L'INFORMATION PRODUITE PAR L'ENTITÉ (revue n°2).
--
-- 1. SECTION_STATE — « détenir » et « répondre de » sont DEUX attributs.
--
-- La revue le dit et c'est la remarque qui commande tout le reste : « Currently
-- With Me » (on me l'a envoyée) et « Assigned To Me » (j'en réponds) ne sont pas
-- deux filtres du même champ. Modélisés en un seul, les deux listes montrent la
-- même chose et la vue perd son sens. Il y a donc un PROPRIÉTAIRE (owner_id,
-- qui répond de la section) et un DÉTENTEUR courant (holder_id, dans le camp de
-- qui elle se trouve). « Envoyer à » déplace le second sans toucher au premier.
--
-- Une SECTION est une unité du dossier qu'on ouvre, qu'on travaille et qu'on
-- fait avancer : un POSTE (code de FSLI) ou un PAPIER (identifiant). Aucune
-- table de plus pour l'objet lui-même — la section porte l'état, l'objet reste
-- où il est.
--
-- Le STATUT n'est PAS stocké ici. L'échelle est unique et tenue partout
-- (not_started · in_preparation · completed · reviewed), mais elle se DÉRIVE de
-- l'état réel — le visa du papier, l'avancement du contrôle sur pièces. Un
-- statut tenu à part diverge un jour de ce qu'il prétend décrire, et c'est
-- toujours le statut qu'on croit. Ce qui est stocké ici est ce qui ne se dérive
-- pas : une DÉCISION (qui répond de la section, à qui on l'a envoyée).
--
-- 2. SECTION_WATCH — « Tracked By Me » est un ABONNEMENT VOLONTAIRE, pas une
--    déduction. On suit ce qu'on a choisi de suivre.
--
-- 3. SECTION_VISIT — « Recent » est un JOURNAL DE CONSULTATION par personne.
--    Il ne remplace pas event_log (la piste d'audit du dossier) : lire n'est
--    pas un changement d'état, et une piste d'audit qui enfle d'une ligne à
--    chaque coup d'œil cesse d'être lisible.
--
-- 4. IPE — Information Produced by the Entity, attachée au PAPIER.
--    Un test substantif appuyé sur un listing du client dont l'exhaustivité n'a
--    pas été éprouvée ne prouve rien. La contrainte de base rend l'aveu
--    obligatoire : dire « oui » sans documenter exhaustivité, exactitude, date,
--    nature, pertinence et SANS DÉSIGNER LA PIÈCE est refusé par la base, pas
--    seulement par l'écran.

create table section_state (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  kind text not null check (kind in ('poste','papier')),
  ref text not null,
  label text not null,
  /* répond de la section */
  owner_id uuid references app_user(id),
  /* la détient en ce moment — « on me l'a envoyée » */
  holder_id uuid references app_user(id),
  updated_at timestamptz not null default now(),
  unique (engagement_id, kind, ref)
);
create index section_state_owner on section_state (owner_id);
create index section_state_holder on section_state (holder_id);

create table section_watch (
  section_id uuid not null references section_state(id) on delete cascade,
  user_id uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  primary key (section_id, user_id)
);

create table section_visit (
  id bigserial primary key,
  section_id uuid not null references section_state(id) on delete cascade,
  user_id uuid not null references app_user(id),
  visited_at timestamptz not null default now()
);
create index section_visit_user on section_visit (user_id, visited_at desc);

create table ipe (
  id uuid primary key default gen_random_uuid(),
  workpaper_id uuid not null references workpaper(id) on delete restrict,
  /* A-t-on utilisé une information produite par l'entité auditée ? */
  utilisee boolean not null,
  nature text check (nature in ('manuelle','systeme')),
  /* le code du rapport, quand elle est générée par le système (ex. SAP) */
  rapport_code text,
  /* LE MÊME OBJET que celui reçu au portail OU IMPORTÉ — jamais une pièce
     jointe orpheline : c'est la condition pour que la provenance tienne.
     Deux natures, parce que le dossier en porte deux : une pièce reçue
     (evidence) et un fichier importé (le grand livre, la balance, un listing
     déposé comme import). Exactement UNE des deux. */
  evidence_id uuid references evidence(id),
  import_file_id uuid references import_file(id),
  exhaustivite text,
  exactitude text,
  date_document date,
  approprie boolean,
  /* La rédaction peut être PROPOSÉE par le modèle ; elle n'entre au dossier
     qu'après validation humaine (plafond L2). */
  redige_par_ia boolean not null default false,
  valide_par uuid references app_user(id),
  valide_le timestamptz,
  created_at timestamptz not null default now(),
  unique (workpaper_id),
  constraint ipe_documente check (
    utilisee = false
    or (nature is not null
        and (evidence_id is not null) <> (import_file_id is not null)
        and btrim(coalesce(exhaustivite, '')) <> ''
        and btrim(coalesce(exactitude, '')) <> ''
        and date_document is not null
        and approprie is not null)
  )
);

do $$ begin
  execute 'alter table section_state enable row level security';
  execute 'create policy section_state_eng on section_state using (engagement_id in (select otto_engagements()))';
  execute 'alter table section_watch enable row level security';
  execute 'create policy section_watch_eng on section_watch using (exists (
    select 1 from section_state s where s.id = section_watch.section_id
      and s.engagement_id in (select otto_engagements())))';
  execute 'alter table section_visit enable row level security';
  execute 'create policy section_visit_eng on section_visit using (exists (
    select 1 from section_state s where s.id = section_visit.section_id
      and s.engagement_id in (select otto_engagements())))';
  execute 'alter table ipe enable row level security';
  execute 'create policy ipe_eng on ipe using (exists (
    select 1 from workpaper w where w.id = ipe.workpaper_id
      and w.engagement_id in (select otto_engagements())))';
end $$;

-- 5. LA LANGUE EST UNE DONNÉE DU CABINET (revue n°2 §2 — DA-15 étendu).
--
-- Figer l'anglais en dur reproduirait exactement le défaut dénoncé pour le
-- vocabulaire : du non modulable. Une plateforme qui vise plusieurs
-- référentiels vise plusieurs langues — c'est la même dimension. Le catalogue
-- de libellés porte les deux locales ; le CABINET dit laquelle il sert.
-- Défaut : l'anglais.
alter table tenant add column locale text not null default 'en'
  check (locale in ('en','fr'));
