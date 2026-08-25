-- 0007: exports are stored artifacts (terminal, hash-stamped, ADR-013) — the recorded
-- bytes are what was handed to the audit file; re-export supersedes.

alter table export_record add column storage_path text;
alter table export_record add column size_bytes bigint not null default 0;
