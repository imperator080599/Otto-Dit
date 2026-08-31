-- 0027 — LE CONTRÔLE INTERNE ET LES PROCESSUS (point 2, ADR-108).
--
-- CORRECTION DE CONCEPTION VOULUE : on ne lit PAS le flowchart du client.
-- La plateforme héberge le processus en DONNÉES STRUCTURÉES — étapes,
-- acteurs, systèmes, entrées/sorties, contrôles rattachés avec fréquence et
-- propriétaire — et GÉNÈRE le diagramme. La comparaison N/N-1 devient une
-- différence EXACTE et déterministe, jamais stockée : seules les DONNÉES des
-- deux versions et les DÉCISIONS humaines (chaque changement statué) le sont.
-- Le flowchart fourni par le client est une pièce de corroboration, pas la
-- source.

create table process_model (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  cycle_ref text not null,
  exercice text not null check (exercice in ('n','n1')),
  name text not null,
  evidence_id uuid not null references evidence(id),
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, cycle_ref, exercice)
);

create table process_step (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process_model(id) on delete cascade,
  code text not null,                 -- stable d'une version à l'autre : la différence s'appuie dessus
  seq int not null,
  label text not null,
  actor_name text not null,
  system_name text not null,
  inputs text not null default '',
  outputs text not null default '',
  unique (process_id, code)
);

create table process_ctrl (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process_model(id) on delete cascade,
  step_code text not null,
  code text not null,
  label text not null,
  frequency text not null,
  owner_name text not null,
  unique (process_id, code)
);

-- CHAQUE CHANGEMENT N/N-1 SE STATUE — significatif ou non, motivé, signé.
-- Le code du changement est stable (dérivé de la différence) ; la décision
-- survit au recalcul, et une décision orpheline (le changement a disparu
-- après un remplacement de version) est simplement ignorée par la lecture.
create table process_change_decision (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  change_code text not null,
  significance text not null check (significance in ('significatif','non_significatif')),
  reason text not null,
  decided_by uuid not null references app_user(id),
  decided_at timestamptz not null default now(),
  unique (engagement_id, change_code)
);

-- L'ENTRETIEN — participants, date, support, compréhension documentée.
-- Le module FONCTIONNE SANS ENREGISTREMENT (support « notes ») ; un
-- enregistrement exige le consentement de CHAQUE participant, tracé, et une
-- durée de conservation explicite (docs/14_ENTRETIENS_CONSENTEMENT.md).
create table process_interview (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  cycle_ref text not null,
  date_entretien date not null,
  sujet text not null,
  support text not null check (support in ('notes','enregistrement')),
  comprehension text not null default '',
  retention_until date,               -- exigée pour un enregistrement, purge à l'échéance
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

create table interview_participant (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references process_interview(id) on delete cascade,
  seq int not null,
  nom text not null,
  qualite text not null default '',
  consent_recording boolean not null default false,
  consent_at timestamptz,
  unique (interview_id, seq)
);

create table interview_transcript (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references process_interview(id) on delete cascade,
  contenu text not null,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

-- LES ÉCARTS CANDIDATS entre ce qui est DIT et ce qui est DOCUMENTÉ — le
-- seul endroit du module où un modèle intervient. Jamais une conclusion :
-- un candidat devient question au client, facteur de risque proposé, ou
-- s'écarte avec un motif — TOUJOURS par une décision humaine signée.
create table transcript_gap (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references process_interview(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in ('omission_doc','omission_orale','contradiction')),
  citation text not null default '',
  description text not null,
  ai_run_id uuid references ai_run(id),
  status text not null default 'candidate'
    check (status in ('candidate','question','factor','dismissed')),
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  decision_reason text,
  request_id uuid references request(id),
  unique (interview_id, seq)
);

-- Un nouvel usage de modèle = une nouvelle valeur NOMMÉE de purpose : la
-- provenance doit dire « pourquoi cette lecture existe », pas la ranger dans
-- une case approximative.
alter table ai_run drop constraint ai_run_purpose_check;
alter table ai_run add constraint ai_run_purpose_check
  check (purpose in ('extraction','classification','drafting','suggestion','ocr','transcript_gaps'));

create index idx_process_model_eng on process_model(engagement_id);
create index idx_process_interview_eng on process_interview(engagement_id);
create index idx_transcript_gap_itv on transcript_gap(interview_id);
