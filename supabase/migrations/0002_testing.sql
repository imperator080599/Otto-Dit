-- 0002_testing: requests, evidence, extraction, sampling, matching, exceptions,
-- ICFR set, documentation. See docs/04_DATA_MODEL.md.

create table request (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  seq_no integer not null,
  procedure_id uuid references procedure_instance(id),
  title text not null,
  language text not null default 'en',
  status text not null default 'draft' check (status in ('draft','sent','partially_submitted','submitted','accepted','reopened')),
  due_date date,
  sent_at timestamptz,
  approved_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, seq_no)
);

create table request_item (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references request(id) on delete restrict,
  kind text not null check (kind in ('document','listing','explanation')),
  description text not null,
  sample_item_id uuid,
  control_instance_id uuid,
  exception_id uuid,
  deviation_id uuid,
  status text not null default 'pending' check (status in ('pending','uploaded','complete','na')),
  client_note text,
  created_at timestamptz not null default now()
);

create table reminder (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references request(id) on delete restrict,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  channel text not null default 'portal' check (channel in ('portal','email')),
  status text not null default 'scheduled' check (status in ('scheduled','sent','cancelled','paused'))
);

create table inbound_email (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  from_addr text not null,
  subject text,
  received_at timestamptz not null default now(),
  raw_path text,
  status text not null default 'pending' check (status in ('pending','processed','quarantined'))
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  request_item_id uuid references request_item(id),
  inbound_email_id uuid references inbound_email(id),
  filename text not null,
  mime text not null,
  sha256 text not null,
  size_bytes bigint not null default 0,
  storage_path text not null,
  source text not null check (source in ('portal','email','auditor')),
  audience text not null default 'client_provided' check (audience in ('client_provided','internal')),
  uploaded_by_kind text not null check (uploaded_by_kind in ('client_contact','app_user','system')),
  uploaded_by_id uuid,
  doc_type text check (doc_type in ('invoice','delivery_note','credit_note','bank_statement','reconciliation_sheet','approval_record','listing','contract','other')),
  class_confidence numeric(4,3),
  quarantined boolean not null default false,
  quarantine_reason text,
  created_at timestamptz not null default now()
);
create index evidence_eng_idx on evidence(engagement_id);
create index evidence_sha_idx on evidence(engagement_id, sha256);

create table extraction (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references evidence(id) on delete restrict,
  rung text not null check (rung in ('xml','text_layer','ocr','llm','human')),
  status text not null default 'complete' check (status in ('complete','failed','pending_verify','verified')),
  ai_run_id uuid,
  fields jsonb not null default '[]'::jsonb, -- [{name, value, confidence, page, zone?}]
  overall_confidence numeric(4,3),
  verified_by uuid references app_user(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index extraction_evidence_idx on extraction(evidence_id);

-- ===== sampling =====

create table sample (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  procedure_id uuid not null references procedure_instance(id) on delete restrict,
  method text not null check (method in ('monetary_coverage_random','attribute_frequency','verification_spotcheck')),
  params jsonb not null default '{}'::jsonb,
  seed text not null,
  population_hash text not null,
  population_size integer not null,
  population_amount numeric(18,2),
  coverage_amount numeric(18,2),
  rationale text,
  status text not null default 'proposed' check (status in ('proposed','validated','drawn','superseded')),
  supersedes_sample_id uuid references sample(id),
  validated_by uuid references app_user(id),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table sample_item (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references sample(id) on delete restrict,
  unit_kind text not null check (unit_kind in ('gl_entry','control_instance','match')),
  unit_id uuid not null,
  selection_reason text not null check (selection_reason in ('high_value','random','risk_flag','carried_forward')),
  amount numeric(18,2),
  carried_from_item_id uuid references sample_item(id),
  status text not null default 'pending' check (status in ('pending','tested','exception','complete'))
);
create index sample_item_sample_idx on sample_item(sample_id);

-- sample evaluation: projection of misstatements + comparison vs TE (Gate 2)
create table sample_evaluation (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references sample(id) on delete restrict,
  version integer not null default 1,
  known_misstatement numeric(18,2) not null default 0,
  projected_misstatement numeric(18,2) not null default 0,
  projection_method text not null default 'ratio' check (projection_method in ('ratio','difference','none')),
  tested_coverage_amount numeric(18,2) not null default 0,
  tested_random_amount numeric(18,2) not null default 0,
  untested_amount numeric(18,2) not null default 0,
  te_amount numeric(18,2) not null,
  conclusion_basis text,
  status text not null default 'draft' check (status in ('draft','concluded','superseded')),
  concluded_by uuid references app_user(id),
  concluded_at timestamptz,
  created_at timestamptz not null default now()
);

create table match (
  id uuid primary key default gen_random_uuid(),
  sample_item_id uuid not null references sample_item(id) on delete restrict,
  status text not null default 'pending_evidence' check (status in ('matched','exception','pending_evidence','pending_verify')),
  checks jsonb not null default '[]'::jsonb, -- [{check, expected, found, tolerance, pass, source}]
  computed_at timestamptz not null default now()
);
create index match_item_idx on match(sample_item_id);

create table exception (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  taxonomy_code text not null,
  kind text not null default 'substantive' check (kind in ('substantive','reconciliation','import','verification')),
  sample_item_id uuid references sample_item(id),
  match_id uuid references match(id),
  evidence_id uuid references evidence(id),
  reconciliation_item_id uuid references reconciliation_item(id),
  severity text not null default 'normal' check (severity in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','clarification_requested','explained','resolved','escalated')),
  description text not null,
  amount_impact numeric(18,2),
  resolution text,
  resolved_by uuid references app_user(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index exception_eng_idx on exception(engagement_id, status);

create table followup (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid references exception(id),
  deviation_id uuid,
  request_id uuid not null references request(id),
  drafted_by_ai_run uuid,
  approved_by uuid references app_user(id),
  status text not null default 'draft' check (status in ('draft','approved','sent','answered')),
  created_at timestamptz not null default now()
);

create table misstatement (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  exception_id uuid references exception(id),
  kind text not null check (kind in ('factual','judgmental','projected')),
  amount numeric(18,2) not null,
  corrected boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed','confirmed','dismissed')),
  notes text,
  created_at timestamptz not null default now()
);

-- verification spot-check on machine-passed items (ADR-012.3); a disagree raises an
-- exception (Gate 2: the control must have a consequence flow)
create table verification_check (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  procedure_id uuid not null references procedure_instance(id),
  sample_item_id uuid not null references sample_item(id),
  verifier_id uuid not null references app_user(id),
  result text not null check (result in ('agree','disagree')),
  disagreement_note text,
  exception_id uuid references exception(id),
  seconds_spent integer,
  performed_at timestamptz not null default now()
);

-- ===== ICFR / SOX =====

create table process (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  name text not null,
  description text
);

create table walkthrough (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete restrict,
  status text not null default 'not_started' check (status in ('not_started','in_progress','complete')),
  performed_by uuid references app_user(id),
  performed_at timestamptz,
  notes text
);

create table itgc_area (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('access','change','operations')),
  name text not null
);

create table control (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  process_id uuid references process(id),
  code text not null,
  name text not null,
  description text not null,
  frequency text not null check (frequency in ('many_daily','daily','weekly','monthly','quarterly','annual','adhoc')),
  nature text not null check (nature in ('manual','automated','itdm')),
  effect text not null check (effect in ('preventive','detective')),
  is_key boolean not null default true,
  itgc_area_id uuid references itgc_area(id),
  owner_name text,
  di_status text not null default 'not_assessed' check (di_status in ('not_assessed','effective','deficient')),
  di_conclusion text,
  created_at timestamptz not null default now(),
  unique (engagement_id, code)
);

create table rcm_row (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  risk_desc text not null,
  assertions text[] not null default '{}',
  coso_component text
);

create table control_instance (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references control(id) on delete restrict,
  label text not null,
  occurred_on date,
  performer_name text,
  source text not null default 'listing' check (source in ('listing','evidence')),
  created_at timestamptz not null default now(),
  unique (control_id, label)
);

create table control_test (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references control(id) on delete restrict,
  procedure_id uuid references procedure_instance(id),
  sample_id uuid references sample(id),
  status text not null default 'draft' check (status in ('draft','testing','complete')),
  conclusion text,
  concluded_by uuid references app_user(id),
  concluded_at timestamptz
);

create table attribute_def (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references control(id) on delete restrict,
  code text not null,
  description text not null,
  required boolean not null default true,
  expected_evidence text,
  unique (control_id, code)
);

create table attribute_result (
  id uuid primary key default gen_random_uuid(),
  sample_item_id uuid not null references sample_item(id) on delete restrict,
  attribute_code text not null,
  result text not null check (result in ('pass','fail','na')),
  basis text not null check (basis in ('extraction_field','human')),
  extraction_field_ref jsonb,
  note text,
  created_at timestamptz not null default now(),
  unique (sample_item_id, attribute_code)
);

create table deviation (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  sample_item_id uuid references sample_item(id),
  attribute_code text not null,
  taxonomy_code text not null,
  status text not null default 'open' check (status in ('open','clarification_requested','explained','resolved','escalated')),
  description text not null,
  resolution text,
  resolved_by uuid references app_user(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table deficiency (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  severity_proposed text not null check (severity_proposed in ('deficiency','significant_deficiency','material_weakness')),
  severity_final text check (severity_final in ('deficiency','significant_deficiency','material_weakness')),
  basis jsonb not null default '{}'::jsonb,
  narrative text not null,
  status text not null default 'proposed' check (status in ('proposed','confirmed','dismissed','communicated')),
  aggregation_group text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===== documentation =====

create table workpaper (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  pack_id text not null,
  code text not null,
  procedure_id uuid references procedure_instance(id),
  control_test_id uuid references control_test(id),
  title text not null,
  language text not null default 'en',
  sections jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','in_review','reviewed','signed','outdated')),
  version integer not null default 1,
  based_on_hash text,
  engine_run_ref text,
  post_lock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (engagement_id, code, version)
);

create table workpaper_edit (
  id uuid primary key default gen_random_uuid(),
  workpaper_id uuid not null references workpaper(id) on delete restrict,
  user_id uuid not null references app_user(id),
  section text not null,
  before_value text,
  after_value text,
  justification text not null,
  edited_at timestamptz not null default now()
);

create table wp_attachment (
  id uuid primary key default gen_random_uuid(),
  workpaper_id uuid not null references workpaper(id) on delete restrict,
  evidence_id uuid not null references evidence(id)
);

create table review_note (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  workpaper_id uuid references workpaper(id),
  author_id uuid not null references app_user(id),
  assignee_id uuid references app_user(id),
  status text not null default 'open' check (status in ('open','addressed','closed')),
  text text not null,
  addressed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table signoff (
  id uuid primary key default gen_random_uuid(),
  workpaper_id uuid not null references workpaper(id) on delete restrict,
  user_id uuid not null references app_user(id),
  sign_role text not null check (sign_role in ('preparer_validator','reviewer','partner')),
  signed_at timestamptz not null default now()
);

create table export_record (
  id uuid primary key default gen_random_uuid(),
  workpaper_id uuid not null references workpaper(id) on delete restrict,
  format text not null check (format in ('pdf','xlsx')),
  content_hash text not null,
  supersedes_export_id uuid references export_record(id),
  exported_by uuid references app_user(id),
  exported_at timestamptz not null default now()
);

-- deferred FKs for cross-file references
alter table request_item add constraint request_item_sample_item_fk
  foreign key (sample_item_id) references sample_item(id);
alter table request_item add constraint request_item_control_instance_fk
  foreign key (control_instance_id) references control_instance(id);
alter table request_item add constraint request_item_exception_fk
  foreign key (exception_id) references exception(id);
alter table request_item add constraint request_item_deviation_fk
  foreign key (deviation_id) references deviation(id);
alter table followup add constraint followup_deviation_fk
  foreign key (deviation_id) references deviation(id);
alter table risk add constraint risk_process_fk
  foreign key (process_id) references process(id);
alter table procedure_instance add constraint procedure_control_fk
  foreign key (control_id) references control(id);
