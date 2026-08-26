-- 0011_team_independence: qui est sur la mission, depuis quand, et sa déclaration.
--
-- Trois choses qu'un dossier doit porter et qu'aucun outil ne suit :
--   1. QUI est sur la mission, à quel grade, entré quand et sorti quand ;
--   2. DEPUIS COMBIEN D'EXERCICES chacun est sur ce client — la familiarité se
--      COMPTE, elle ne se juge pas ;
--   3. SA DÉCLARATION D'INDÉPENDANCE, datée et signée par lui-même.
--
-- LA RÈGLE QUI REND TOUT CELA RÉEL, et c'est le seul point qui compte : aucun
-- travail ne peut être attribué à un membre dont la déclaration n'est pas
-- signée, et un travail attribué sous une déclaration devenue caduque est un
-- OBSTACLE AU VISA. Le système REFUSE, il ne rappelle pas — même famille que
-- « on ne clôt pas sa propre note » (0009) et que l'ordre des visas (0009).
--
-- Les rubriques et les seuils ne sont PAS ici : ce sont du contenu de cabinet,
-- versionnés dans methodology/independance.json. Chaque cabinet remplace les
-- siens sans qu'une ligne de code bouge.

-- ===== 1. la personne sur la mission : entrée, sortie =====
alter table engagement_member add column entered_on date;
alter table engagement_member add column exited_on date;
alter table engagement_member add constraint engagement_member_dates
  check (exited_on is null or entered_on is null or exited_on >= entered_on);

comment on column engagement_member.exited_on is
  'Sortie de la mission. Un membre sorti n''est pas supprimé : ses travaux et ses visas restent au dossier, et la piste doit pouvoir dire qui il était.';

-- ===== 2. la déclaration d'indépendance : une PILE, jamais un écrasement =====
-- Une déclaration se révise en cours de mission quand les circonstances
-- changent. La révision n'écrase rien : elle empile une version, et l'ancienne
-- reste lisible avec sa signature. C'est ce qui rend l'historique opposable —
-- « il avait déclaré quoi, et quand ? » doit avoir une réponse.
create table independence_declaration (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  engagement_id uuid not null references engagement(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  version int not null check (version >= 1),
  -- pourquoi CETTE version existe. Vide pour la première, écrit pour toute révision :
  -- une révision sans motif est indistinguable d'une erreur de manipulation.
  reason text not null default '',
  -- les réponses aux rubriques de methodology/independance.json :
  -- { "interets": {"answer":"oui"|"non", "detail":"…"}, … }
  answers jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  signed_at timestamptz,
  -- ON SIGNE POUR SOI. Personne ne signe la déclaration d'un autre.
  signed_by uuid references app_user(id),
  superseded_by uuid references independence_declaration(id),
  unique (engagement_id, user_id, version),
  constraint declaration_signed_by_self check (signed_by is null or signed_by = user_id),
  constraint declaration_signature_is_whole check (
    (signed_at is null and signed_by is null) or (signed_at is not null and signed_by is not null)
  ),
  constraint declaration_revision_has_a_reason check (
    version = 1 or btrim(reason) <> ''
  )
);
create index independence_declaration_lookup on independence_declaration (engagement_id, user_id, version desc);

comment on table independence_declaration is
  'Historique par membre et par mission. Une révision EMPILE une version ; elle n''écrase jamais la précédente, qui reste lisible avec sa signature.';
comment on column independence_declaration.signed_by is
  'Toujours égal à user_id : on signe pour soi. Contrainte, pas convention.';

-- Une déclaration SIGNÉE est un fait daté : elle ne se réécrit pas. On la
-- remplace en ouvrant une version suivante. Seul `superseded_by` peut encore
-- être posé, parce qu'il enregistre précisément ce remplacement.
create or replace function guard_signed_declaration() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'une déclaration d''indépendance ne se supprime pas : elle se révise (version suivante)';
  end if;
  if old.signed_at is not null then
    if new.signed_at is distinct from old.signed_at
       or new.signed_by is distinct from old.signed_by
       or new.answers is distinct from old.answers
       or new.version is distinct from old.version
       or new.user_id is distinct from old.user_id
       or new.engagement_id is distinct from old.engagement_id
       or new.reason is distinct from old.reason then
      raise exception 'déclaration déjà signée le % : elle ne se réécrit pas, elle se révise (version suivante)', old.signed_at;
    end if;
  end if;
  return new;
end $$;

create trigger independence_declaration_append_only
  before update or delete on independence_declaration
  for each row execute function guard_signed_declaration();

-- ===== 3. services autres que la certification =====
-- Le ratio d'honoraires se CALCULE ; il n'est pas une appréciation. Le plafond
-- vit dans methodology/independance.json, marqué non vérifié comme le reste.
create table non_audit_service (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  engagement_id uuid not null references engagement(id) on delete restrict,
  nature text not null,          -- clé de methodology/independance.json → natures_sacc
  label text not null check (btrim(label) <> ''),
  amount_cents bigint not null check (amount_cents > 0),
  provided_on date not null,
  provider text not null check (btrim(provider) <> ''),
  recorded_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);
create index non_audit_service_by_engagement on non_audit_service (engagement_id);

-- Les honoraires d'audit de la mission, dénominateur du ratio. Nul par défaut :
-- un ratio calculé sur un dénominateur supposé serait pire que pas de ratio.
alter table engagement add column audit_fee_cents bigint;
comment on column engagement.audit_fee_cents is
  'Honoraires d''audit de la mission. Tant qu''ils ne sont pas saisis, le ratio de services non-audit N''EST PAS CALCULÉ — il n''est pas estimé.';

-- ===== 4. l'isolation vaut aussi pour les nouvelles tables =====
do $$
declare t text;
begin
  foreach t in array array['independence_declaration','non_audit_service'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
