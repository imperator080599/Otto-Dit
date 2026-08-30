-- ADR-097 : une note de revue s'ancre sur l'OBJET MÉTIER, jamais sur une
-- position à l'écran. « Ligne 12 colonne 4 » se casse au prochain tirage ;
-- « l'écriture au journal VE n° 0706, champ date » survit à tout ce qui
-- recalcule, parce que l'ancre est l'identité MÉTIER de l'objet :
--   sample_item          → gl_entry.natural_key (survit aux ré-imports ET aux
--                          re-tirages : un nouvel échantillon qui contient la
--                          même écriture reprend la note à son bord)
--   workpaper_section    → code du papier + clé de section (survit aux
--                          nouvelles versions du papier)
--   questionnaire_answer → code de la question (survit aux millésimes)
--   materiality_param    → nom du paramètre de seuils
-- L'état « objet retiré » n'est PAS stocké : il se DÉRIVE à la lecture en
-- résolvant l'ancre (services/notes/ancres.ts) — un drapeau stocké mentirait
-- dès le recalcul suivant (le principe des statuts dérivés, ADR passé).

alter table review_note add column anchor_kind text
  check (anchor_kind in ('sample_item','workpaper_section','questionnaire_answer','materiality_param'));
alter table review_note add column anchor_ref text;
alter table review_note add column anchor_field text;
alter table review_note add column anchor_label text;

-- Une ancre est complète ou absente : une note « à moitié ancrée » serait une
-- position d'écran déguisée.
alter table review_note add constraint review_note_anchor_complete
  check ((anchor_kind is null and anchor_ref is null and anchor_field is null and anchor_label is null)
      or (anchor_kind is not null and anchor_ref is not null and anchor_label is not null));

-- L'attribution : à un membre de l'équipe OU à OTTO. OTTO n'est pas un
-- app_user — un destinataire machine avec un id humain serait un mensonge de
-- schéma. Le comportement d'exécution d'OTTO est la tranche suivante ; la
-- colonne appartient à celle-ci parce que l'attribution fait partie du geste
-- de pose.
alter table review_note add column assignee_kind text not null default 'user'
  check (assignee_kind in ('user','otto'));
alter table review_note add constraint review_note_assignee_coherent
  check (assignee_kind = 'user' or assignee_id is null);

-- LES RÉPONSES. Une note reçoit des réponses (du préparateur, ou d'OTTO à la
-- tranche suivante) ; la réponse ENTRE AU DOSSIER comme le reste. payload
-- porte le compte rendu structuré d'une réponse machine (ce qui a été demandé,
-- fait, sur quelles pièces, ce qui reste à vérifier) — vide pour un humain.
create table review_note_reply (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references review_note(id) on delete restrict,
  engagement_id uuid not null references engagement(id) on delete restrict,
  author_kind text not null check (author_kind in ('user','otto')),
  author_id uuid references app_user(id),
  text text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint review_note_reply_author_coherent
    check ((author_kind = 'user' and author_id is not null) or (author_kind = 'otto' and author_id is null))
);
create index review_note_reply_note_idx on review_note_reply(note_id);

-- Même verrou et même isolation que la note elle-même.
create trigger review_note_reply_lock_guard
  before insert or update or delete on review_note_reply
  for each row execute function assert_engagement_unlocked();

do $$
declare t text;
begin
  foreach t in array array['review_note_reply'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
