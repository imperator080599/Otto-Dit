-- ADR-101 : LES INVITATIONS DE RÉUNION — tout le déterministe, derrière un
-- adaptateur simulé (le modèle de l'échelle d'extraction, et de l'e-mail Q12 :
-- interface réelle, transport simulé — et l'écran le DIT).
--
-- Les contacts de la MISSION : le contact client CLÉ (celui qui fait le lien
-- entre nos demandes et les responsables internes) et les contacts par
-- domaine. C'est une donnée de mission, pas d'entité : la DAF est la clé du
-- mandat d'audit légal, pas de tous les mandats à venir.

create table engagement_contact (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  client_contact_id uuid not null references client_contact(id) on delete restrict,
  role text not null check (role in ('cle','domaine')),
  domaine text,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, client_contact_id),
  constraint engagement_contact_domaine_coherent
    check ((role = 'domaine' and domaine is not null and domaine <> '') or (role = 'cle' and domaine is null))
);
-- UNE seule clé par mission — la contrainte le dit, pas une convention.
create unique index engagement_contact_cle on engagement_contact(engagement_id) where role = 'cle';

create table meeting_invitation (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  objet text not null,
  debut timestamptz not null,
  fin timestamptz not null,
  destinataire_contact_id uuid not null references client_contact(id),
  -- L'ORDRE DES COPIES, CALCULÉ ET FIGÉ à la création : contact clé, puis
  -- l'équipe du plus senior au moins senior, à grade égal alphabétique.
  copies jsonb not null,
  corps text not null,
  ics text not null,
  statut text not null default 'choisie' check (statut in ('choisie','envoyee_simulee')),
  created_by uuid not null references app_user(id),
  sent_by uuid references app_user(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meeting_invitation_bornes check (fin > debut)
);
create index meeting_invitation_eng_idx on meeting_invitation(engagement_id);

create trigger engagement_contact_lock_guard
  before insert or update or delete on engagement_contact
  for each row execute function assert_engagement_unlocked();
create trigger meeting_invitation_lock_guard
  before insert or update or delete on meeting_invitation
  for each row execute function assert_engagement_unlocked();

do $$
declare t text;
begin
  foreach t in array array['engagement_contact','meeting_invitation'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
