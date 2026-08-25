-- 0003_infra: event log (hash-chained, append-only), ai_run registry, notifications,
-- append-only triggers, documentation-lock trigger. See docs/04 §8-9, docs/06 §4-5.

create table event_log (
  id bigserial primary key,
  tenant_id uuid not null,
  engagement_id uuid,
  actor_kind text not null check (actor_kind in ('user','system','ai')),
  actor_id uuid,
  verb text not null,
  object_type text not null,
  object_id text,
  payload jsonb not null default '{}'::jsonb,
  prev_hash text not null default '',
  hash text not null,
  created_at timestamptz not null default now()
);
create index event_log_eng_idx on event_log(engagement_id, id);
create index event_log_obj_idx on event_log(object_type, object_id);

create table ai_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  engagement_id uuid,
  purpose text not null check (purpose in ('extraction','classification','drafting','suggestion','ocr')),
  adapter text not null,
  model text not null,
  prompt_id text not null,
  prompt_version text not null,
  input_hash text not null,
  output_hash text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_run_eng_idx on ai_run(engagement_id);

create table notification (
  id uuid primary key default gen_random_uuid(),
  recipient_kind text not null check (recipient_kind in ('app_user','client_contact')),
  recipient_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===== append-only enforcement (04 §9.1) =====

create or replace function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'table % is append-only (OTTO audit-trail rule)', tg_table_name;
end $$;

create trigger event_log_append_only before update or delete on event_log
  for each row execute function forbid_mutation();
create trigger ai_run_append_only before update or delete on ai_run
  for each row execute function forbid_mutation();
create trigger signoff_append_only before update or delete on signoff
  for each row execute function forbid_mutation();
create trigger workpaper_edit_append_only before update or delete on workpaper_edit
  for each row execute function forbid_mutation();
create trigger verification_check_append_only before update or delete on verification_check
  for each row execute function forbid_mutation();
create trigger export_record_append_only before update or delete on export_record
  for each row execute function forbid_mutation();

-- ===== documentation lock (04 §9.4, ADR-014) =====
-- Generic: any table carrying engagement_id gets a lock guard. Post-lock writes are
-- rejected unless the app sets otto.post_lock_amendment = 'on' for a justified amendment
-- (the amendment itself is recorded in event_log by the service layer).

create or replace function assert_engagement_unlocked() returns trigger
language plpgsql as $$
declare
  eng uuid;
  eng_status text;
begin
  eng := (to_jsonb(coalesce(new, old)) ->> 'engagement_id')::uuid;
  if eng is null then
    return coalesce(new, old);
  end if;
  select status into eng_status from engagement where id = eng;
  if eng_status in ('locked','archived')
     and coalesce(current_setting('otto.post_lock_amendment', true), '') <> 'on' then
    raise exception 'engagement % is % — writes rejected (post-lock amendments require justification flow)', eng, eng_status;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'import_file','tb_snapshot','gl_entry','fsli','reconciliation','materiality',
    'risk','procedure_instance','request','evidence','sample','exception',
    'misstatement','process','control','deviation','deficiency','workpaper','review_note'
  ] loop
    execute format(
      'create trigger %I_lock_guard before insert or update or delete on %I
         for each row execute function assert_engagement_unlocked()', t, t);
  end loop;
end $$;
