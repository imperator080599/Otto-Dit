-- 0006_engine_runs: engine-run identity for deterministic runs, verification runs with
-- blind capture, ai_run linkage on drafted/classified artifacts (Gate 2, AI-architect
-- lens; ADR-012 implementability).

create table engine_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  engagement_id uuid references engagement(id) on delete restrict,
  engine text not null,           -- 'importer' | 'reconciliation' | 'population' | 'sampling' | 'matching' | 'attribute_testing' | 'workpaper_draft' | 'deficiency_rules' | 'projection'
  engine_version text not null,   -- app version tag
  pack_id text,
  config_hash text not null,      -- hash of the pack/engagement config consumed
  params jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index engine_run_eng_idx on engine_run(engagement_id, engine);

alter table sample add column engine_run_id uuid references engine_run(id);
alter table reconciliation add column engine_run_id uuid references engine_run(id);
alter table match add column engine_run_id uuid references engine_run(id);
alter table workpaper add column engine_run_id uuid references engine_run(id);
alter table deficiency add column engine_run_id uuid references engine_run(id);
alter table deficiency add column narrative_ai_run_id uuid references ai_run(id);
alter table evidence add column class_ai_run_id uuid references ai_run(id);

-- The spot-check subsample is itself a seeded, reproducible draw over the machine-passed
-- population (the one selection an inspector probes hardest).
create table verification_run (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  procedure_id uuid not null references procedure_instance(id),
  engine_run_id uuid references engine_run(id),
  seed text not null,
  rate numeric(5,4) not null,
  min_items integer not null,
  machine_passed_population_hash text not null,
  machine_passed_count integer not null,
  drawn_count integer not null,
  created_at timestamptz not null default now()
);

alter table verification_check add column verification_run_id uuid references verification_run(id);
-- Blind capture: the verifier's independently entered values, recorded BEFORE the machine
-- result is revealed; agreement computed by the engine, not asserted by the verifier.
alter table verification_check add column blind_values jsonb;
alter table verification_check add column escalation text
  check (escalation in ('none','expand_subsample','reperform_procedure'));
