# DECISIONS.md — Architecture Decision Records

Format: {id · decision · alternatives considered · rationale · confidence H/M/L · how to
reverse}. Founder overrides asynchronously by editing this file. D1–D13 from the master
prompt are **accepted founder defaults** and are not restated; only deviations from them or
new decisions appear here.

---

## ADR-001 — Local runtime: PGlite (embedded Postgres) with Supabase-compatible SQL migrations

- **Decision**: The app runs locally on PGlite (Postgres compiled to WASM, file-persisted,
  zero external accounts). All schema lives in `supabase/migrations/*.sql` written in
  Postgres SQL that applies unchanged to Supabase in production; a small runner applies them
  to PGlite for local dev/demo/tests.
- **Alternatives**: (a) Supabase CLI local stack — requires Docker, unavailable/heavy in
  many environments, breaks "runs and demos locally without external accounts" in this
  container; (b) SQLite — diverges from Postgres SQL, would fork the migrations.
- **Rationale**: D7 keeps Supabase as the production target; local-first build rule demands
  a zero-dependency local runtime. PGlite gives real Postgres semantics with one npm package.
- **Confidence**: H. **Reverse**: swap the db adapter to `postgres`/supabase-js client;
  migrations are already Supabase-native. RLS policies ship in the migrations but are
  enforced in production (local demo runs as table owner; see ADR-007 and 06_SECURITY).

## ADR-002 — Extraction ladder gains a "PDF text layer" rung between XML and OCR

- **Decision**: Ladder = (1) structured e-invoice XML (Factur-X CII) → (2) embedded PDF text
  layer + deterministic field parsing → (3) external OCR adapter (Mistral OCR / Claude
  native, pluggable, mocked in tests) → (4) LLM extraction → (5) human verify below
  confidence threshold.
- **Alternatives**: original ladder XML → OCR → LLM.
- **Rationale**: most digitally-born PDFs carry an exact text layer; parsing it is free,
  deterministic and offline — it also lets the local demo run real extraction with zero API
  calls (D12 cost discipline).
- **Confidence**: H. **Reverse**: remove rung 2 from the ladder config; adapters are ordered
  config, not code structure.

## ADR-003 — Deterministic journal-entry risk flags in MVP; full JET module later

- **Decision**: The population/ledger analytics in S3 compute deterministic JE risk flags
  (weekend/holiday posting, round amounts, manual-journal source, period-end posting,
  unusual credit-note patterns). The full JET module (parameter workbench, L3 validation
  flow) is roadmap.
- **Alternatives**: full JET in MVP; no JET at all in MVP.
- **Rationale**: the acceptance dataset seeds a weekend round-amount manual JE and a
  credit-note pattern — the prototype must detect them (zero false negatives). Flags are
  cheap SQL; the full module competes with the wedge. France baseline JET exists free
  (SmartFEC+), so differentiation is follow-up + documentation integration, later.
- **Confidence**: H. **Reverse**: promote the flags UI to a full module in a later slice.

## ADR-004 — Partner chatbot rejected; provenance answer views instead

- **Decision**: No conversational UI in v1. The partner-question need is served by
  deterministic provenance views (S9: "why does this evidence exist / what supports this
  conclusion / where did this figure come from") and the dashboard.
- **Alternatives**: RAG chatbot over the engagement.
- **Rationale**: unsourced conversational answers feeding partner decisions are inspection
  poison and contradict the positioning ("no chatbot UI", 07_MVP_PRD UX principles).
  A future assistant, if any, must answer only with links into the traceability graph.
- **Confidence**: H. **Reverse**: add an assistant surface over the same provenance API.

## ADR-005 — UI: hand-rolled CSS design system, no component framework

- **Decision**: No Tailwind/MUI/etc. A small custom CSS system (tokens, layout primitives)
  in the Next.js app.
- **Alternatives**: Tailwind; shadcn/ui.
- **Rationale**: local-first and lean: fewer deps, faster installs, full control of the
  clean enterprise look (idea #16); the UI surface in MVP is bounded.
- **Confidence**: M. **Reverse**: introduce Tailwind incrementally; pages are plain React.

## ADR-006 — Demo auth: dev user-switcher (auditor side) + tokenized portal links (client side)

- **Decision**: Locally, auditor users are selected via a dev login switcher (no password,
  clearly labeled demo mode); the client portal uses per-contact magic tokens in URLs —
  the same mechanism production uses, minus email delivery. Production runbook (DEPLOY.md):
  Supabase Auth magic links for both sides.
- **Alternatives**: full Supabase Auth locally (needs external service or Docker stack).
- **Rationale**: local-first rule; the security model (roles, RLS, engagement membership) is
  still exercised because authorization checks run in the app's data layer either way.
- **Confidence**: H. **Reverse**: wire Supabase Auth session → same internal user identity.

## ADR-007 — Tenant isolation enforced in the data-access layer locally; RLS policies shipped for Supabase

- **Decision**: Every query goes through a data-access layer that scopes by tenant/
  engagement/audience (auditor vs client). The same predicates are expressed as Postgres RLS
  policies in the migrations for production enforcement on Supabase.
- **Alternatives**: rely on RLS only (unenforceable under PGlite single-role local mode).
- **Rationale**: defense in depth; the client-never-sees-audit-documentation guarantee (D6)
  must hold in the local demo too.
- **Confidence**: H. **Reverse**: n/a (production keeps both layers).

## ADR-008 — Dataset generator written in TypeScript inside the app workspace, output committed

- **Decision**: `dataset/` holds generated files + ANOMALIES.md; the generator is TypeScript
  (`app/scripts/dataset/`), run via `npm run dataset:generate`, deterministic from a fixed
  seed. Generated files are committed so the demo needs no generation step.
- **Alternatives**: Python generator; regenerate-on-demand only.
- **Rationale**: one toolchain (D7), deterministic seeds make the acceptance suite stable;
  committing outputs keeps the demo turnkey.
- **Confidence**: H. **Reverse**: regenerate with a new seed; ANOMALIES.md is emitted by the
  generator so docs and data cannot drift.

## ADR-009 — Inference & data residency (per verified context)

- **Decision**: Build on the Anthropic first-party API behind a thin provider-abstraction
  layer (`LlmClient` interface). Production inference switches per tenant market: AWS
  Bedrock EU (in-region/zero-retention modes) or Vertex EU for EU-resident engagements; US
  inference for US engagements. OCR adapters equally pluggable (Mistral OCR 3 default, Azure
  Document Intelligence alternative). The demo runs entirely on record/replay fixtures —
  zero live calls required.
- **Alternatives**: Bedrock-only (slower feature access), EU-only (blocks US market).
- **Rationale**: verified context §3; abstraction is cheap now, expensive later.
- **Confidence**: H. **Reverse**: implement another `LlmClient`; call sites are unchanged.

## ADR-010 — OE sample-size defaults (pack content, overridable)

- **Decision**: PCAOB/SOX pack ships frequency-based operating-effectiveness sample-size
  defaults commonly published in audit literature: recurring automated/annual 1, quarterly 2,
  monthly 2–3 (default 3), weekly 5, daily 20–25 (default 25), many-times-daily 25–40
  (default 25, risk-adjustable +15). Stored as overridable pack config with the basis
  logged; every deviation from defaults requires justification. [ASSUMPTION — conventions
  vary by firm; these are the widely circulated AICPA-derived tables, to be sanity-checked
  in the D13 pass.]
- **Alternatives**: statistical attribute sampling calculator (roadmap; overkill for MVP).
- **Confidence**: M. **Reverse**: edit pack config; sampling engine takes size as input.

## ADR-011 — Misstatement & deficiency objects created from day one; full evaluation workflows later

- **Decision**: Exceptions can be promoted to `misstatement` rows (factual/judgmental/
  projected; corrected/uncorrected) and deviations to `deficiency` rows (pack taxonomy) in
  MVP, with aggregation views; the full ISA 450 evaluation memo and SOX aggregation-to-MW
  reasoning stay L3-proposal + human conclusion, richer workflows roadmap.
- **Rationale**: without typed downstream objects the wedge's exceptions dead-end (assessment
  #21); full workflows are not needed to prove the loop.
- **Confidence**: H. **Reverse**: extend, don't restructure.
