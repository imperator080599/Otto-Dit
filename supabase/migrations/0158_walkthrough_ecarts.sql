-- 0158 — §4 point 3 (mandat du 10 septembre 2026, point 1 ; R74) : l'ANALYSE
-- DE WALKTHROUGH — transcript déposé, écarts candidats entre ce qui est
-- DÉCRIT (le propriétaire du contrôle, dans l'enregistrement vidéo déjà
-- ancré sur `control.di_walkthrough_evidence_id`, 0148) et ce qui est
-- DOCUMENTÉ (`control_task.description`, 0148).
--
-- MÊME FORME QUE `entretiens.ts`/`transcript_gap` (0027), jamais une
-- bifurcation (règle 6) : COST.md §1 quater le dit noir sur blanc — « un
-- walkthrough analysé COMME S'IL suivait cette même forme — la plus proche
-- et la seule mesurée ». Deux tables neuves, PAS une réutilisation
-- d'`interview_transcript`/`transcript_gap` : un walkthrough est ancré sur
-- `control`, jamais sur `process_interview` (0148 l'a déjà tranché pour la
-- vidéo — le transcript suit le même ancrage). L'adaptateur lui-même
-- (`AnalysteTranscript`, entretiens-analyste.ts) EST réutilisé tel quel,
-- généralisé pour prendre un fichier de fixtures et un prompt en paramètre —
-- c'est le code qui se partage, pas le schéma d'un domaine différent.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle n'active rien — la
-- garde de budget EN BASE (`app_state.ia_vivante_budget`, IA-BUDGET-01,
-- extraction/budget.ts) reste la SEULE autorité, posée par une écriture SQL
-- directe du fondateur, jamais par ce dépôt ; `demoPublique()` coupe déjà
-- inconditionnellement tout déploiement public vers le rejeu, quoi que
-- porte l'environnement. Elle ne touche ni CTRL-01 ni CTRL-02 (le D&I se
-- conclut par les quatre facteurs de design et les tâches documentées,
-- inchangés) : un écart candidat peut devenir une tâche documentée
-- (`ajouterTacheControle`, sox.ts, réutilisée), jamais une conclusion.

create table control_walkthrough_transcript (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null unique references control(id) on delete restrict,
  contenu text not null,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

create table control_walkthrough_gap (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  seq int not null,
  kind text not null check (kind in ('omission_doc','omission_orale','contradiction')),
  citation text not null default '',
  description text not null,
  ai_run_id uuid references ai_run(id),
  status text not null default 'candidate'
    check (status in ('candidate','question','task','dismissed')),
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  decision_reason text,
  request_id uuid references request(id),
  control_task_id uuid references control_task(id),
  unique (control_id, seq),
  constraint walkthrough_gap_decision_is_whole check (
    (status = 'candidate' and decided_by is null and decided_at is null)
    or (status <> 'candidate' and decided_by is not null and decided_at is not null)
  )
);

create index idx_control_walkthrough_gap_control on control_walkthrough_gap(control_id);

-- Même famille que `transcript_gaps` (0027) : un nouvel usage de modèle est
-- un nouveau NOM de purpose, jamais rangé dans une case approximative.
alter table ai_run drop constraint ai_run_purpose_check;
alter table ai_run add constraint ai_run_purpose_check
  check (purpose in ('extraction','classification','drafting','suggestion','ocr','transcript_gaps','walkthrough_gaps'));

create trigger control_walkthrough_transcript_lock_guard before insert or update or delete on control_walkthrough_transcript
  for each row execute function assert_engagement_unlocked();
create trigger control_walkthrough_gap_lock_guard before insert or update or delete on control_walkthrough_gap
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('control_walkthrough_transcript', 'garde', 'le transcript déposé d''un walkthrough est du contenu du dossier — même patron qu''interview_transcript (0042)'),
  ('control_walkthrough_gap',        'garde', 'les écarts candidats entre le walkthrough et les tâches documentées sont du contenu du dossier — même patron que transcript_gap (0042)');

do $$
begin
  execute 'alter table control_walkthrough_transcript enable row level security';
  execute 'alter table control_walkthrough_transcript force row level security';
  execute 'create policy control_walkthrough_transcript_eng on control_walkthrough_transcript using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_walkthrough_gap enable row level security';
  execute 'alter table control_walkthrough_gap force row level security';
  execute 'create policy control_walkthrough_gap_eng on control_walkthrough_gap using (engagement_id in (select otto_engagements()))';
end $$;
