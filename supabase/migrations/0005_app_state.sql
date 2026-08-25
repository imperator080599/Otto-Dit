-- 0005_app_state: small key/value store for app-level state (demo clock offset,
-- settings). Not audit data; excluded from provenance rules.

create table app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
