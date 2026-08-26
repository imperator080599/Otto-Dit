-- 0017_acceptance_milestones : la création du dossier, et ce qui doit précéder les travaux.
--
-- CE QUI MANQUAIT, ET POURQUOI C'EST UN BOUT DE L'ARC. Toute démonstration
-- commençait AU MILIEU d'un dossier : l'entité, l'exercice et le référentiel
-- étaient semés, et rien ne disait comment on en arrive là. Or un dossier ne
-- commence pas par un import : il commence par une DÉCISION d'accepter ou de
-- maintenir la mission — et cette décision n'existait nulle part.
--
-- LA RÈGLE QUI REFUSE, et c'est elle qui fait de cette tranche autre chose
-- qu'un formulaire : AUCUN TRAVAIL NE S'ATTRIBUE, AUCUNE PROCÉDURE NE SE
-- PLANIFIE tant que l'acceptation n'est pas DÉCIDÉE. Le système refuse ; il ne
-- rappelle pas. Même famille que « aucun travail sans déclaration signée ».

-- ===== 1. acceptation et maintien =====
create table engagement_acceptance (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  -- Première année = acceptation ; renouvellement = maintien. Ce ne sont pas
  -- les mêmes questions : on n'évalue pas un client qu'on ne connaît pas comme
  -- un client dont on a le dossier de l'an dernier.
  kind text not null check (kind in ('acceptation', 'maintien')),
  -- Les réponses aux critères du cabinet, tels que methodology/acceptation.json
  -- les déclare : { "integrite_direction": { "answer": "oui", "detail": "…" } }
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  -- Une acceptation SANS motif écrit ne se relit pas, et un refus encore moins :
  -- c'est la pièce qu'un inspecteur demande en premier quand un dossier tourne mal.
  decision_reason text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  methodology_version text not null default '',
  created_at timestamptz not null default now()
);
create unique index engagement_acceptance_une_par_mission on engagement_acceptance (engagement_id);

-- Décider sans motif écrit est impossible, dans les deux sens : accepter comme refuser.
alter table engagement_acceptance add constraint decision_needs_a_written_reason check (
  status = 'open'
  or (btrim(coalesce(decision_reason, '')) <> '' and decided_by is not null and decided_at is not null)
);

comment on table engagement_acceptance is
  'La décision d''accepter ou de maintenir la mission. Aucun travail ne se planifie avant elle : le système refuse, il ne rappelle pas.';

-- ===== 2. les jalons =====
-- Quatre dates que l'équipe pose, et une CINQUIÈME qu'elle ne pose pas : le
-- délai d'assemblage se DÉRIVE de la date de rapport par la règle du référentiel
-- (C. com. D. 821-186 III-IV pour la France, AS 1215 pour PCAOB — kernel
-- retention.ts, ADR-014 rev. 2). Une date dérivée qu'on pourrait saisir
-- deviendrait fausse le jour où quelqu'un la corrige à la main.
create table engagement_milestone (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  code text not null,
  label text not null,
  due_date date,
  done_at timestamptz,
  done_by uuid references app_user(id),
  -- true = calculé par le noyau, non saisissable
  derived boolean not null default false,
  -- ce qui fonde la date, quand elle est dérivée
  basis text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (engagement_id, code)
);

-- Une date DÉRIVÉE ne se pose pas à la main : la garde le dit plutôt que de
-- laisser une saisie écraser un calcul en silence.
create or replace function guard_derived_milestone() returns trigger
language plpgsql as $$
begin
  if new.derived and (tg_op = 'UPDATE') and new.due_date is distinct from old.due_date
     and current_setting('otto.derive_milestone', true) is distinct from 'on' then
    raise exception
      'le jalon « % » est dérivé de la règle du référentiel : il se recalcule, il ne se saisit pas', new.code;
  end if;
  return new;
end $$;

create trigger engagement_milestone_derived
  before update on engagement_milestone
  for each row execute function guard_derived_milestone();

comment on column engagement_milestone.derived is
  'true = la date vient du noyau (règle du référentiel). Une date dérivée qu''on pourrait saisir deviendrait fausse le jour où quelqu''un la corrige à la main.';

do $$
declare t text;
begin
  foreach t in array array['engagement_acceptance','engagement_milestone'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
