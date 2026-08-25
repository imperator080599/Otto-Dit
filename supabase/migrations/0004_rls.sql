-- 0004_rls: row-level security scaffolding (production enforcement on Supabase; local
-- PGlite runs as table owner so these are inert locally — the data-access layer enforces
-- the same predicates in-app, ADR-007). DEPLOY.md maps otto_tenant()/otto_user() onto
-- Supabase JWT claims (auth.jwt()) at deploy time.

create or replace function otto_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('otto.tenant_id', true), '')::uuid
$$;

create or replace function otto_engagements() returns setof uuid
language sql stable as $$
  select e.id from engagement e where e.tenant_id = otto_tenant()
$$;

do $$
declare
  t text;
begin
  -- tenant-rooted tables
  foreach t in array array['tenant','app_user','entity','corp_group','engagement'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  execute 'create policy tenant_self on tenant using (id = otto_tenant())';
  foreach t in array array['app_user','entity','corp_group','engagement'] loop
    execute format('create policy %I_tenant on %I using (tenant_id = otto_tenant())', t, t);
  end loop;

  -- engagement-scoped tables
  foreach t in array array[
    'engagement_member','import_file','tb_snapshot','gl_entry','gl_entry_supersession',
    'fsli','reconciliation','materiality','risk','procedure_instance','request',
    'inbound_email','evidence','sample','exception','misstatement','verification_check',
    'process','control','deviation','deficiency','workpaper','review_note'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;

  -- infrastructure
  execute 'alter table event_log enable row level security';
  execute 'create policy event_log_tenant on event_log using (tenant_id = otto_tenant())';
  execute 'alter table ai_run enable row level security';
  execute 'create policy ai_run_tenant on ai_run using (tenant_id = otto_tenant())';
end $$;

-- Client-portal scoping note (06 §1): the portal NEVER queries these tables directly in
-- production; it goes through dedicated views/API filtered to request/request_item/
-- reminder/own-evidence for the contact's engagement. Those service endpoints carry their
-- own checks; RLS here is the auditor-side backstop.
