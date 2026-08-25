# DEPLOY.md — Vercel + Supabase runbook

The prototype is **local-first**: it runs with zero external accounts (PGlite + recorded
adapters). Deployment turns on the production substrate; no application code changes.

## 1. Supabase project

1. Create a project in the region that matches the tenant market — **Paris (eu-west-3)** for
   EU tenants, a US region for US tenants (ADR-009, docs/06 §3).
2. Apply the migrations **in order** — they are plain Postgres and apply unchanged:
   ```bash
   for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -f "$f"; done
   ```
   (or `supabase db push` with the CLI).
3. Storage: create a private bucket `evidence`; serve blobs through short-TTL signed URLs.
   The local content-addressed store (`app/.data/blobs`) maps 1:1 to `sha256`-prefixed
   object keys.
4. **RLS**: `0004_rls.sql` enables row-level security and defines the tenant/engagement
   predicates through `otto_tenant()`. In production map it onto the JWT:
   ```sql
   create or replace function otto_tenant() returns uuid language sql stable as $$
     select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
   $$;
   ```
   Set `tenant_id` as a custom claim at sign-in. The data-access layer applies the same
   predicates in-app (ADR-007) — keep both.
5. **Append-only enforcement**: the triggers in `0003_infra.sql` reject UPDATE/DELETE on
   `event_log`, `ai_run`, `signoff`, `workpaper_edit`, `verification_check`,
   `export_record`. Additionally revoke those privileges from the application role:
   ```sql
   revoke update, delete on event_log, ai_run, signoff, workpaper_edit,
     verification_check, export_record from authenticated;
   ```
6. **Event-chain serialization** (ADR-016.2): local PGlite is single-connection, so the
   hash chain is serialized by construction. On Supabase, wrap the insert in a per-engagement
   advisory lock:
   ```sql
   select pg_advisory_xact_lock(hashtextextended(engagement_id::text, 0));
   ```
   inside the logging function, so concurrent writers cannot fork the chain.

## 2. Vercel

1. Import the repo, root directory `app/`.
2. Pin function regions to the data region: `cdg1`/`fra1` for EU tenants, `iad1` for US
   (`vercel.json` → `"regions": ["cdg1"]`).
3. Environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (pooled) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth + Storage |
| `OTTO_STORAGE=supabase` | switch the blob store from the local filesystem |
| `OTTO_OCR_ADAPTER` | `mock` (default, record/replay) · `anthropic` (written and unit-tested) · any other name → refuses to run |
| `OTTO_EXTRACT_MODEL` | model id for the `anthropic` extraction adapter (default `claude-sonnet-4-5`) |
| `OTTO_QUERY_PLANNER` | `disabled` (default) · `anthropic` — the « Interroger » fallback planner (ADR-017); the deterministic rules planner works with it disabled |
| `OTTO_QUERY_MODEL` | model id for the query planner |
| `ANTHROPIC_API_KEY` *or* Bedrock/Vertex credentials | extraction, planning, drafting (only if enabled) |
| `OTTO_PRICE_IN_PER_MTOK`, `OTTO_PRICE_OUT_PER_MTOK` | today's token prices, USD per million. **Unset ⇒ `cost_usd` is 0 and `npm run cost:measure` refuses to run** — prices are never hardcoded (ADR-019) |
| `MISTRAL_API_KEY` / `AZURE_DI_KEY`+`AZURE_DI_ENDPOINT` | reserved: a dedicated-OCR adapter is a deployment task, not shipped code — no adapter is written for a provider that could not be executed and verified during the build (ADR-019) |
| `OTTO_INFERENCE_REGION` | `eu` → Bedrock EU / Vertex EU (zero-retention); `us` → US inference |
| `OTTO_INBOUND_SECRET` | shared secret for the inbound-email webhook |

4. Swap the db adapter: `app/src/lib/db/client.ts` is the single seam — replace the PGlite
   client with `postgres`/`supabase-js` behind the same `q/q1/q01/tx` signatures. Nothing
   else in the codebase talks to the database directly.

## 3. Authentication

Local demo uses a user switcher + portal tokens (ADR-006). In production:

- Auditors: Supabase Auth magic links → map the session user onto `app_user.id`
  (same identity the data layer already uses).
- Client contacts: Supabase Auth magic links scoped to the contact; keep
  `client_contact.portal_token` as the fallback/no-account path, rotate on demand.
- The client portal must remain served from the whitelist surface
  (`app/src/lib/services/portal.ts`) — the isolation test asserts it touches no
  audit-documentation table.

## 4. Inbound email (per engagement)

1. Provision `eng-<token>@in.<your-domain>` and point it at an inbound webhook
   (SES → SNS → route handler, or Postmark inbound).
2. Handler verifies `OTTO_INBOUND_SECRET`, then calls `processInbound(engagementId, msg)`
   — the same function the fixtures use (`npm run demo:email`). Sender allow-listing and
   quarantine behaviour are already implemented.

## 5. Background jobs

Reminders are materialized lazily on read in the prototype. In production move them to
Supabase Queues (pgmq) + `pg_cron`:

```sql
select cron.schedule('otto-reminders', '0 7 * * 1-5', $$select otto_dispatch_reminders()$$);
```

`ensureReminders(engagementId)` contains the cadence logic to port.

## 6. Retention and lock (ADR-014)

- France (NEP pack): assembly lock at report date + 60 days; retention **10 years**.
- PCAOB pack: documentation completion ≤ 14 days after report release (45-day legacy tier
  configurable); retention **7 years** from report release; SEC Rule 2-06 extends scope to
  qualifying correspondence — include portal messages and review notes in the retention job.
- `engagement.retention_until` drives the ops policy; nothing may be deleted before it, and
  superseded analyses reflecting differing professional judgments are never purged.

## 7. Pre-flight checklist

- [ ] `npm test` green against the target build
- [ ] Migrations applied in order; `select count(*) from _migrations` matches the file count
- [ ] RLS verified with a cross-tenant probe (expect zero rows)
- [ ] Client-portal probe cannot reach any audit-documentation table
- [ ] Storage bucket private; signed URLs expire ≤ 5 minutes
- [ ] `ai_run` writes appear for every OCR/LLM call in a smoke test
- [ ] Event-chain verification job scheduled and alerting on failure
- [ ] DPA signed and the secret-professionnel/GDPR analysis complete (ASSUMPTIONS A13)
      **before** any real client data touches the deployment
