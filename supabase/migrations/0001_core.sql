-- 0001_core: tenancy, people, engagement, financial data, assurance config
-- Postgres SQL, applied to PGlite locally and Supabase in production (ADR-001).
-- Conventions: uuid pk gen_random_uuid(); text+CHECK instead of enums; no hard deletes
-- where provenance flows (04_DATA_MODEL §9).

create table tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  name text not null,
  email text not null,
  firm_role text not null check (firm_role in ('partner','manager','senior','staff','admin')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table entity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  name text not null,
  country text not null,
  registry_type text not null check (registry_type in ('siren','ein','fictional')),
  registry_no text,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table corp_group (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  name text not null,
  listing text,
  created_at timestamptz not null default now()
);

create table component (
  id uuid primary key default gen_random_uuid(),
  corp_group_id uuid not null references corp_group(id) on delete restrict,
  entity_id uuid not null references entity(id) on delete restrict,
  role text not null check (role in ('parent','component')),
  significance text,
  created_at timestamptz not null default now()
);

create table referral_instruction (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references component(id) on delete restrict,
  title text not null,
  body text not null,
  issued_by text not null,
  received_at timestamptz,
  status text not null default 'received' check (status in ('received','acknowledged','addressed')),
  created_at timestamptz not null default now()
);

create table period (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entity(id) on delete restrict,
  label text not null,
  start_date date not null,
  end_date date not null,
  prior_period_id uuid references period(id),
  created_at timestamptz not null default now()
);

create table engagement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  entity_id uuid not null references entity(id) on delete restrict,
  period_id uuid not null references period(id) on delete restrict,
  component_id uuid references component(id),
  kind text not null check (kind in ('statutory_audit','sox_component','integrated')),
  name text not null,
  -- framework_set: { assurance_packs: ['nep-fr'|...], accounting_map: 'pcg'|..., language: 'fr'|'en' }
  framework_set jsonb not null,
  status text not null default 'setup' check (status in ('setup','fieldwork','review','locked','archived')),
  locked_at timestamptz,
  report_date date,
  retention_until date,
  created_at timestamptz not null default now()
);

create table engagement_member (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  eng_role text not null check (eng_role in ('partner','manager','senior','staff')),
  can_sign boolean not null default false,
  created_at timestamptz not null default now(),
  unique (engagement_id, user_id)
);

create table client_contact (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entity(id) on delete restrict,
  name text not null,
  email text not null,
  title text,
  portal_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== financial data =====

create table import_file (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  kind text not null check (kind in ('tb','gl_generic','fec','rcm','listing')),
  filename text not null,
  sha256 text not null,
  mapping_profile jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  status text not null check (status in ('validated','validated_with_warnings','rejected')),
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table tb_snapshot (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  period_kind text not null check (period_kind in ('current','prior')),
  version integer not null default 1,
  import_file_id uuid not null references import_file(id),
  status text not null default 'active' check (status in ('active','superseded')),
  created_at timestamptz not null default now()
);

create table account (
  id uuid primary key default gen_random_uuid(),
  tb_snapshot_id uuid not null references tb_snapshot(id) on delete restrict,
  number text not null,
  label text not null,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  balance numeric(18,2) not null default 0
);
create index account_snapshot_idx on account(tb_snapshot_id, number);

create table gl_entry (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  import_file_id uuid not null references import_file(id) on delete restrict,
  line_no integer not null,
  -- natural identity surviving re-imports (Gate 2): journal|entry_no|line-in-entry
  natural_key text not null,
  journal_code text not null,
  journal_lib text,
  entry_no text not null,
  entry_date date not null,
  account_no text not null,
  account_label text,
  aux_no text,
  aux_label text,
  piece_ref text,
  piece_date date,
  label text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  lettering text,
  lettering_date date,
  valid_date date,
  amount_ccy numeric(18,2),
  ccy text,
  flags jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','superseded')),
  created_at timestamptz not null default now()
);
create index gl_entry_eng_idx on gl_entry(engagement_id, account_no) where status = 'active';
create index gl_entry_nk_idx on gl_entry(engagement_id, natural_key);

-- carry-forward identity across re-imports (Gate 2, senior-manager lens)
create table gl_entry_supersession (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  old_gl_entry_id uuid not null references gl_entry(id),
  new_gl_entry_id uuid references gl_entry(id),
  reason text not null default 'reimport',
  created_at timestamptz not null default now()
);

create table coa_map_rule (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null,
  engagement_id uuid references engagement(id) on delete restrict, -- null = pack default
  account_prefix text not null,
  fsli_code text not null,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);
create index coa_map_rule_idx on coa_map_rule(pack_id, engagement_id);

create table fsli (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  code text not null,
  name text not null,
  statement text not null check (statement in ('BS','IS')),
  balance numeric(18,2) not null default 0,
  scoping text not null default 'unscoped' check (scoping in ('unscoped','in_scope','ns_proposed','ns_confirmed','in_scope_qualitative')),
  scoping_basis text,
  confirmed_by uuid references app_user(id),
  confirmed_at timestamptz,
  unique (engagement_id, code)
);

create table reconciliation (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  kind text not null check (kind in ('tb_gl','tb_py','base_gl')),
  status text not null check (status in ('clean','differences','superseded')),
  computed_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

-- per-account diffs with a resolution lifecycle (Gate 2: the hard gate is per scoped
-- account, and a documented difference is a legal resolution state)
create table reconciliation_item (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references reconciliation(id) on delete restrict,
  account_no text not null,
  tb_amount numeric(18,2) not null,
  gl_amount numeric(18,2) not null,
  delta numeric(18,2) not null,
  status text not null default 'open' check (status in ('open','documented_difference','resolved')),
  note text,
  resolved_by uuid references app_user(id),
  resolved_at timestamptz
);

-- ===== assurance config =====

create table materiality (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  version integer not null default 1,
  benchmark_code text not null,
  benchmark_amount numeric(18,2) not null,
  pct numeric(7,4) not null,
  amount numeric(18,2) not null,
  perf_pct numeric(7,4) not null,
  perf_amount numeric(18,2) not null,
  ctt_pct numeric(7,4) not null,
  ctt_amount numeric(18,2) not null,
  -- tolerable misstatement for sampling evaluation (Gate 2, audit-partner lens)
  te_pct numeric(7,4) not null,
  te_amount numeric(18,2) not null,
  rationale text not null,
  proposed_by_ai_run uuid,
  validated_by uuid references app_user(id),
  validated_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed','validated','superseded'))
);

create table risk (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text,
  process_id uuid,
  assertion text not null,
  level text not null check (level in ('low','medium','high','significant')),
  description text not null,
  source text not null default 'pack_default' check (source in ('pack_default','questionnaire','manual')),
  created_at timestamptz not null default now()
);

create table procedure_instance (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  pack_id text not null,
  template_code text not null,
  kind text not null check (kind in ('substantive','control_test','analytical')),
  fsli_code text,
  control_id uuid,
  title text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned','in_progress','complete')),
  created_at timestamptz not null default now()
);
