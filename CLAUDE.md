# OTTO — standing rules for any Claude session on this repo

OTTO is an AI-native platform for financial-statement audit and internal-control (SOX/ICFR)
assurance. Framework-agnostic core (ISA skeleton) + framework packs (ISA, NEP/France,
PCAOB/SOX+COSO in v1). Resume protocol: **read STATUS.md and docs/, then continue from
current state.**

## Non-negotiable rules

1. **docs/ is the source of truth.** If code must diverge from a doc, update the doc in the
   same commit and log the change in docs/DECISIONS.md.
2. **Synthetic data only, forever.** Every dataset, company, name, SIREN/EIN, IBAN and
   document in this repo is fabricated and clearly fictional. Never request or incorporate
   any firm's proprietary methodology or any real client data.
3. **Provenance and audit trail are implemented from the first feature**, never retrofitted.
   Every state change writes to event_log; every AI output writes an ai_run row
   (model, prompt version, tokens, output hash). P7 must stay answerable at all times:
   "Why does this evidence exist?", "What supports this conclusion?", "Where did this
   figure come from?"
4. **Tests are required** for all parsing, reconciliation, sampling, materiality, matching
   and attribute-testing logic. LLM/OCR calls live behind interfaces with record/replay
   mocks — the test suite runs with **zero** external API calls.
5. **Small vertical slices**, each ending in a working demo. Commit at every slice; update
   STATUS.md and DEMO.md in the same commit.
6. **No LLM where a deterministic rule suffices** (P4). LLMs only for extraction,
   classification, drafting, suggestion.
7. **HITL ceiling L2** for anything that enters the audit file, in every framework pack:
   AI prepares, a human must review/approve before it counts.
8. Never cite a standard by number unless certain or verified; otherwise mark [UNVERIFIED].
9. A framework pack = content/configuration, never a code fork. New framework or cycle =
   pack content, not architecture.

## Repo layout

- `docs/` — program documents (00 founder ideas … 09 gates, DECISIONS, ASSUMPTIONS,
  OPEN_QUESTIONS). Source of truth.
- `dataset/` — synthetic dataset **generator** (deterministic, seeded) + generated files +
  ANOMALIES.md (the acceptance suite).
- `app/` — Next.js + TypeScript application (local-first: runs with zero external accounts).
- `supabase/migrations/` — Postgres SQL migrations (applied locally to PGlite, in production
  to Supabase).
- `tests/` — cross-cutting/acceptance tests (unit tests may live next to code in app/).
- `STATUS.md` — current slice, done list, next actions, open threads. `DEMO.md` — how to run
  the two-part demo. `DEPLOY.md` — Vercel+Supabase runbook. `COST.md` — actual LLM/OCR spend.

## Dev commands

- App: `cd app && npm install && npm run db:setup && npm run dev` (see DEMO.md).
- Tests: `cd app && npm test` (Vitest; zero network).
- Dataset regeneration: `cd app && npm run dataset:generate` (deterministic, seeded).
