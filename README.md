# OTTO — AI-native assurance platform (prototype)

OTTO runs the **middle loop** of financial-statement audit and internal-control (SOX/ICFR)
testing: population → risk-based selection → client request → evidence intake → extraction
→ testing → typed exceptions/deviations → follow-up → auto-drafted, fully traceable
workpaper → review → conclusion.

Framework-agnostic core (ISA-shaped) + **framework packs**. v1 ships two: **NEP/France**
(French statutory, French workpapers) and **PCAOB AS / SOX 404 + COSO 2013** (English ICFR
workpapers). Both run on the *same engines* — that is the point (docs/02).

> **All data in this repository is synthetic and clearly fictional.** No firm methodology,
> no client data. See CLAUDE.md rule 2.

## Quick start (zero external accounts)

```bash
cd app
npm install
npm run db:setup      # applies supabase/migrations to a local PGlite store + seeds the world
npm run demo:seed     # drives BOTH demo parts end-to-end through the real services
npm run dev           # http://localhost:3000
npm test              # 116 tests, zero network calls
```

Two measurement commands, optional and incapable of spending anything by default:

```bash
npm run eval:extraction   # per-field precision/recall of the extraction ladder → docs/EVAL_EXTRACTION.md (ADR-018)
npm run cost:measure      # live-adapter cost/latency/failure under a $ budget guard → COST.md (ADR-019)
```

Sign in as any of the three demo auditors (no passwords — demo mode). Client portal:
`/portal/demo-sophie-altiverre` (CFO) or `/portal/demo-theo-altiverre` (chief accountant).

See **DEMO.md** for the step-by-step two-part walkthrough.

## What is in here

| Path | Contents |
|---|---|
| `docs/` | **Source of truth.** 00 founder ideas · 01 idea assessment · 02 target concept · 03 architecture · 04 data model · 05 integrations · 06 security/compliance · 07 MVP PRD (+ demo script) · 08 backlog · 09 gates (two adversarial review rounds) · 10 research pass · EVAL_EXTRACTION (measured) · 10_FALSIFICATION · DECISIONS (ADR-001..019) · ASSUMPTIONS · OPEN_QUESTIONS |
| `dataset/` | Synthetic dataset: FEC (4 731 lines), TB N/N-1, 30 evidence PDFs (incl. Factur-X with embedded CII XML), SOX RCM + control listings, pinned demo params, extraction fixtures, **ANOMALIES.md** (the acceptance contract) |
| `app/src/lib/kernel/` | Deterministic kernel — canonicalization, FEC validator, JE flags, sampling (monetary/attribute/verification), materiality, FSLI mapping, vouching, misstatement projection, deficiency rules. Pure functions, no DB/network |
| `app/src/lib/services/` | Engines wired to Postgres: imports, reconciliation, materiality/scoping, population, sampling, requests, evidence, extraction ladder, matching, verification, evaluation, SOX, workpapers, provenance, dashboard |
| `app/src/lib/packs/` | Framework packs (content/config only, never a code fork) |
| `app/src/app/` | Next.js UI — auditor workspace + client portal |
| `supabase/migrations/` | Postgres SQL (applies unchanged to PGlite locally and Supabase in production) |
| `dataset/eval/` | Extraction-eval corpus: `synthetic/` generated and seeded, `public/` a local-only slot for published documents (never committed). **No client document, ever** (ADR-018) |
| `tests/` | Cross-cutting acceptance suites |

## Architecture in one paragraph

One workflow spine — **request ↔ evidence ↔ testing ↔ documentation** engines — over shared
deterministic services (importers, reconciliation, sampling, matching, exception engine,
event log, ai_run registry), driven by configuration packs. LLM/OCR appear only where they
beat deterministic code (extraction below the structured rungs, classification, drafting);
every such call is logged as an `ai_run`, and rungs 3–4 are **always** human-verified before
use (the L2 evidence contract, ADR-012). Every state change is appended to a hash-chained
`event_log`; nothing is deleted, everything supersedes.

## Engineering guarantees

- **Deterministic**: imports, reconciliation, sampling, matching, projection and deficiency
  rules are pure functions of inputs + config + seed. The dataset generator imports the same
  kernel the app runs (ADR-015), so the two can never drift.
- **Offline**: the entire demo and test suite run with zero external accounts and zero
  network calls. OCR/LLM adapters exist behind a real interface with a record/replay
  implementation; live adapters are configuration (DEPLOY.md).
- **Auditable**: append-only event log (hash-chained, verified in the UI), immutable
  sign-offs, justified-and-flagged manual edits, self-contained hash-stamped exports.
- **Acceptance**: `tests/acceptance.full.test.ts` asserts every seeded anomaly and deviation
  in `dataset/ANOMALIES.md` surfaces through the app path — zero false negatives, false
  positives enumerated. *Scope*: build-time regression evidence about engine design, **not**
  extraction-reliability evidence on real documents (see docs/09 Gate 1, ASSUMPTIONS A9/A12).

## Standing rules

Read `CLAUDE.md` before contributing. In short: docs/ is the source of truth; synthetic data
only; provenance from the first feature; tests required for all parsing/reconciliation/
sampling/materiality/matching/attribute logic; small vertical slices; no LLM where a
deterministic rule suffices; HITL ceiling L2 for anything entering the audit file.
