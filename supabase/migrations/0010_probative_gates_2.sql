-- 0010_probative_gates_2: the same constraint, everywhere a difference can be closed.
-- Founder review, 2026-08-26. Migration 0009 made "resolved" impossible to reach on an
-- exception without substance. Two other tables could still close a finding on a sentence:
-- reconciliation_item, whose 'documented_difference' RELEASES the Gate-2 population gate,
-- and deviation, whose 'explained' removes a control failure from the open count. A rule
-- that holds on one table and not on its neighbours is a convention, not a constraint.

-- ===== 1. a documented reconciliation difference is not a note =====
-- 'documented_difference' is the state that lets an FSLI be tested despite a TB/GL gap.
-- Reaching it required only free text. It now requires the same four things as an
-- exception: the explanation received verbatim, a LINK to what corroborates it, a
-- disposition saying what the difference is, and who concluded when.
alter table reconciliation_item add column client_explanation text;
alter table reconciliation_item add column corroboration_evidence_id uuid references evidence(id);
alter table reconciliation_item add column corroboration_gl_entry_id uuid references gl_entry(id);
alter table reconciliation_item add column disposition text
  check (disposition in ('corrected', 'no_misstatement', 'compensated', 'already_accumulated'));

comment on column reconciliation_item.client_explanation is
  'The explanation received, verbatim. Not a summary written by the auditor.';
comment on column reconciliation_item.disposition is
  'Same four dispositions as exception.disposition: what happened to the difference. A timing difference that reverses on the definitive ledger is no_misstatement, and the corroborating link is the entry or the evidence that shows it.';

alter table reconciliation_item add constraint reconciliation_closure_is_probative check (
  status = 'open' or (
    note is not null and btrim(note) <> ''
    and client_explanation is not null and btrim(client_explanation) <> ''
    and disposition is not null
    and (corroboration_evidence_id is not null or corroboration_gl_entry_id is not null)
    and resolved_by is not null and resolved_at is not null
  )
);

-- ===== 2. an explained control deviation is not a note either =====
-- 'explained' takes a deviation out of the open count. It required only free text.
-- The dispositions here are NOT the money words used for an exception: a control test
-- has no amount. Only two outcomes take a deviation out of the count, and both are
-- assertions about evidence, not about a balance.
alter table deviation add column client_explanation text;
alter table deviation add column corroboration_evidence_id uuid references evidence(id);
alter table deviation add column disposition text
  check (disposition in ('control_operated', 'compensating_control'));

comment on column deviation.disposition is
  'control_operated = evidence produced after the test shows the control did operate as designed, so there was no deviation; compensating_control = a linked control covers the same assertion. A genuine deviation has neither: it stays open and counts in the deviation rate. There is deliberately no "explained by management" disposition.';

alter table deviation add constraint deviation_closure_is_probative check (
  status not in ('explained', 'resolved') or (
    resolution is not null and btrim(resolution) <> ''
    and client_explanation is not null and btrim(client_explanation) <> ''
    and disposition is not null
    and corroboration_evidence_id is not null
    and resolved_by is not null and resolved_at is not null
  )
);

-- ===== 3. the third path, again: a difference nobody can corroborate =====
-- The TB/GL difference in the demo engagement exists because an entry is ABSENT from the
-- ledger: there is, by construction, no entry to link and no document to attach. Migration
-- 0009 met the same wall on exceptions and answered it with scope_limitation rather than by
-- weakening 'resolved'. The same answer here: the item records what could not be obtained
-- and what was done instead, it never pretends to be corroborated, and it is only tolerable
-- alongside engagement.ledger_is_provisional, which blocks the final conclusion.
alter table reconciliation_item drop constraint reconciliation_item_status_check;
alter table reconciliation_item add constraint reconciliation_item_status_check check (
  status in ('open','documented_difference','resolved','scope_limitation')
);
alter table reconciliation_item add column alternative_procedures text;
alter table reconciliation_item add constraint reconciliation_limitation_is_documented check (
  status <> 'scope_limitation' or (
    client_explanation is not null and btrim(client_explanation) <> ''
    and alternative_procedures is not null and btrim(alternative_procedures) <> ''
    and resolved_by is not null and resolved_at is not null
  )
);

-- The probative constraint of section 1 must not catch the limitation path, which has its
-- own rule above: it applies to the two states that claim the difference is understood.
alter table reconciliation_item drop constraint reconciliation_closure_is_probative;
alter table reconciliation_item add constraint reconciliation_closure_is_probative check (
  status not in ('documented_difference', 'resolved') or (
    note is not null and btrim(note) <> ''
    and client_explanation is not null and btrim(client_explanation) <> ''
    and disposition is not null
    and (corroboration_evidence_id is not null or corroboration_gl_entry_id is not null)
    and resolved_by is not null and resolved_at is not null
  )
);
