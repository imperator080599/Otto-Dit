-- 0008_retention: documentation-file deadlines become real, computed data with provenance
-- (ADR-014 rev. 2). Previously `retention_until` existed but nothing ever wrote it, and the
-- period itself was wrong (10 years, from a 2007 text). Two changes:
--
--   1. the completion/assembly deadline is stored alongside the retention date, because
--      under C. com. art. D. 821-186 III–IV it is a legal deadline, not a convention;
--   2. `legal_basis` records WHICH provision produced each date, with its verification
--      status — so P7 can answer "why does this date exist?" from stored facts, and an
--      [UNVERIFIED] source is visible in the data rather than only in a comment.
--
-- The PCAOB 14-day window phases in by fiscal year and firm size, so the firm-level fact
-- the test depends on is stored on the tenant.

alter table engagement add column doc_completion_due date;
alter table engagement add column legal_basis jsonb;

-- Phase-in test for AS 1215.15: firms that issued more than 100 issuer audit reports in
-- 2024 are subject to the 14-day window for fiscal years beginning on/after 2024-12-15;
-- all other firms from 2025-12-15. Null = unknown, which resolves to the smaller-firm
-- (later) phase-in — the conservative reading is the one that does NOT assume a shorter
-- deadline has already bitten.
alter table tenant add column issuer_reports_2024 integer;

comment on column engagement.doc_completion_due is
  'Date by which the assembled file must be closed. FR: report_date + 60d (C. com. D. 821-186 III-IV). PCAOB: report_date + 14d or 45d per AS 1215.15 phase-in.';
comment on column engagement.retention_until is
  'Date until which the file must be kept. FR: report_date + 6 years (C. com. R. 820-42, in force 2024-02-01). PCAOB: + 7 years (AS 1215.14).';
comment on column engagement.legal_basis is
  'Provenance of the two dates above: citation, enacting instrument, in-force date, verification status.';
