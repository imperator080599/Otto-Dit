-- 0009_probative_gates: turn four review findings into constraints rather than conventions.
-- Founder review, 2026-08-25. Each block below exists because a workpaper was refused
-- signature for the defect it now makes impossible.

-- ===== 1. "resolved" must carry substance (NEP 500: an interview is not evidence) =====
-- Ten exceptions of six different natures previously carried the same sentence
-- ("Réponse du client examinée et corroborée"). A status that can be reached with a free-
-- text platitude is a status that proves nothing, so the columns below are required by a
-- CHECK: the client's explanation verbatim, a LINK to what corroborates it, a disposition,
-- and who concluded when.
alter table exception add column client_explanation text;
alter table exception add column corroboration_evidence_id uuid references evidence(id);
alter table exception add column corroboration_gl_entry_id uuid references gl_entry(id);
alter table exception add column disposition text
  check (disposition in ('corrected', 'no_misstatement', 'compensated', 'already_accumulated'));

comment on column exception.client_explanation is
  'The explanation received, verbatim. Not a summary written by the auditor.';
comment on column exception.disposition is
  'corrected = a correcting entry exists (link it); no_misstatement = evidence shows there was none; compensated = other evidence covers the assertion; already_accumulated = the same event is already carried as a misstatement raised on another exception (a duplicate booking raises one exception per side but overstates the accounts once). Anything else must be escalated.';

alter table exception add constraint exception_resolution_is_probative check (
  status <> 'resolved' or (
    resolution is not null and btrim(resolution) <> ''
    and client_explanation is not null and btrim(client_explanation) <> ''
    and disposition is not null
    and (corroboration_evidence_id is not null or corroboration_gl_entry_id is not null)
    and resolved_by is not null and resolved_at is not null
  )
);

-- ===== 1b. the third path: a scope limitation is not a resolution =====
-- Some exceptions can never be corroborated — the delivery note was never archived, the
-- final ledger is not yet available. Forcing those into "resolved" is what produced the
-- generic sentences in the first place. They get their own terminal state, which records
-- what could not be obtained, what was attempted instead, and how much is at risk; it
-- never pretends to be evidence, and it follows through to the conclusion.
alter table exception drop constraint exception_status_check;
alter table exception add constraint exception_status_check check (
  status in ('open','clarification_requested','explained','resolved','escalated','scope_limitation')
);
alter table exception add column alternative_procedures text;
alter table exception add constraint exception_limitation_is_documented check (
  status <> 'scope_limitation' or (
    client_explanation is not null and btrim(client_explanation) <> ''
    and alternative_procedures is not null and btrim(alternative_procedures) <> ''
    and resolved_by is not null and resolved_at is not null
  )
);

-- ===== 2. a quantified exception cannot leave the accumulation silently =====
-- FA2025-0702 (36 800 €, probable double booking) was marked resolved and vanished from
-- the known-misstatement total. A quantified exception may only be resolved when the
-- disposition says what happened to the money; otherwise it must be escalated.
alter table exception add constraint exception_quantified_needs_disposition check (
  status <> 'resolved' or amount_impact is null or disposition in ('corrected', 'no_misstatement', 'compensated', 'already_accumulated')
);

-- ===== 3. exceeding tolerable misstatement demands a documented response =====
-- The engine may not conclude while known + projected exceeds tolerable misstatement.
create table evaluation_response (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  evaluation_id uuid not null references sample_evaluation(id) on delete restrict,
  kind text not null check (kind in ('extend_testing', 'revise_strategy', 'conclude_with_justification')),
  rationale text not null check (btrim(rationale) <> ''),
  decided_by uuid not null references app_user(id),
  decided_at timestamptz not null default now()
);
create index evaluation_response_eval_idx on evaluation_response(evaluation_id);

-- ===== 4. control testing: extension and magnitude basis =====
-- A 100 % deviation rate is not a sample result, it is the absence of a control. The
-- engine records that the population must be tested in full, and refuses to conclude from
-- the sample until that is done or a human overrides it with a reason.
-- control_test had no timestamp, so "the latest test" was resolved by uuid order — which
-- is not chronological. After an extension that silently pointed at the superseded test.
alter table control_test add column created_at timestamptz not null default now();
alter table control_test add column extension_required boolean not null default false;
alter table control_test add column extension_reason text;
alter table control_test add column extension_waived_by uuid references app_user(id);
alter table control_test add column extension_waiver_reason text;

-- The magnitude exposure behind a severity proposal must say where the number came from.
alter table deficiency add column magnitude_basis text;
alter table deficiency add constraint deficiency_magnitude_is_justified check (
  status = 'proposed' or (magnitude_basis is not null and btrim(magnitude_basis) <> '')
);

-- ===== 5. provisional ledger =====
-- Auditing a non-final FEC is legitimate; concluding on one silently is not.
alter table engagement add column ledger_is_provisional boolean not null default false;
alter table engagement add column ledger_provisional_reason text;
comment on column engagement.ledger_is_provisional is
  'Set when the imported ledger is not the final one (e.g. TB/GL differences awaiting the definitive FEC). Blocks a final conclusion until cleared.';

-- ===== 6. sign-off order =====
-- preparer_validator -> reviewer -> partner. A partner visa before the reviewer's is not a
-- data-entry mistake, it is a broken review hierarchy.
create or replace function assert_signoff_order() returns trigger
language plpgsql as $$
declare
  has_preparer boolean;
  has_reviewer boolean;
begin
  select exists(select 1 from signoff s where s.workpaper_id = new.workpaper_id and s.sign_role = 'preparer_validator'),
         exists(select 1 from signoff s where s.workpaper_id = new.workpaper_id and s.sign_role = 'reviewer')
    into has_preparer, has_reviewer;
  if new.sign_role = 'reviewer' and not has_preparer then
    raise exception 'review order: a reviewer visa requires the preparer/validator visa first';
  end if;
  if new.sign_role = 'partner' and not (has_preparer and has_reviewer) then
    raise exception 'review order: a partner visa requires the preparer/validator and reviewer visas first';
  end if;
  return new;
end $$;

create trigger signoff_order_guard before insert on signoff
  for each row execute function assert_signoff_order();

-- ===== 7. sealed archive (ADR-022) =====
-- Closing the file produces a sealed, self-contained export whose hash is recorded here.
create table file_archive (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  sealed_at timestamptz not null default now(),
  sealed_by uuid not null references app_user(id),
  storage_path text not null,
  sha256 text not null,
  size_bytes bigint not null,
  manifest jsonb not null,
  retention_until date not null,
  legal_basis jsonb not null
);
create index file_archive_eng_idx on file_archive(engagement_id);
