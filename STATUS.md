# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Current state

- **Stage**: C (execution) — Stage B complete (docs 03–08 + Gate 2 applied); S0 scaffold
  built and tested; next: C1a deterministic kernel per ADR-015.
- **Branch**: `claude/otto-audit-platform-whs17z`.

## Done

- Repo scaffold, CLAUDE.md standing rules.
- docs/00_FOUNDER_IDEAS.md (verbatim founder document).
- docs/01_IDEA_ASSESSMENT.md — all 33 founder ideas judged + capability sweep (France
  statutory, ICFR/SOX, cross-cutting).
- docs/02_TARGET_CONCEPT.md — spine, pack system, workspaces, wedge, NOT-list, 5 improvements.
- docs/DECISIONS.md (ADR-001..011), ASSUMPTIONS.md (A1..A10), OPEN_QUESTIONS.md (Q1..Q10).

## Done (Stage B + Gate 2 + S0)

- docs 03–08 complete; Gate 2 (7 agents) executed → 09_GATES.md Gate 2 section.
  Adopted: sample evaluation vs TE (materiality.te_*, sample_evaluation), per-FSLI
  reconciliation gate with documented_difference, standing request items, gl_entry
  natural keys + ADR-016 re-import invalidation, ADR-015 kernel-first dataset contract
  (C1a/C1b split, pinned demo params, placement-invariant test), engine_run +
  verification_run + blind capture (migration 0006), S8a/S8b split.
- S0 scaffold: Next.js 15 + TS app in app/; PGlite + migrations 0001–0006 (all apply,
  tested); hash-chained event log + append-only + lock triggers (tested); seed demo world
  (2 engagements); packs (nep-fr, pcaob-sox, pcg + skeleton maps); UI shell + dev auth +
  portal tokens; `npm run db:setup && npm run dev` works; `npm test` green (4 tests).

## Done (C1a + C1b)

- C1a kernel: canon (cents, dates, pophash-v1, party normalization), flags (ADR-003),
  sampling (monetary/attribute/verification), materiality (M/PM/CTT/TE), fsli-map,
  matching (vouching + taxonomy + duplicates), projection (ISA 530-shaped), deficiency
  ladder, FEC validator. 27 unit tests green.
- C1b generator (imports the kernel, ADR-015): Altiverre FY2025 — 4,727 FEC lines
  (validator-clean), revenue 5.61M€, PBT 0.72M€ (pinned), TB N/N-1 CSVs, 30 evidence
  files (invoices incl. Factur-X w/ CII XML, delivery notes, 3 avoirs, 2 bank statements,
  2 bank recs, 5 credit approvals incl. 1 unlabeled OCR-mock), RCM (7 controls incl.
  ITGC), instance listings, pinned demo-params.json, extraction fixtures + evidence index
  + expected-anomaly manifest + generator-emitted ANOMALIES.md.
- Placement verified: A1–A5 in the 100%-coverage stratum, A6 high-value+flagged, A8
  risk-flag; SOX deviations inside the pinned attribute draw. **Byte-identical
  regeneration confirmed.** C1 acceptance suite: 12 tests green (zero false negatives,
  zero false positives on clean units).

## Done (S1–S4)

- S1/S2: generic TB importer (auto column mapping) + FEC adapter wiring (flags at import,
  natural-key supersession, ADR-016 invalidation guard); TB↔GL reconciliation with
  documented_difference + per-FSLI gate; FSLI mapping + lead sheets; materiality
  (L3 propose/adjust/validate, M/PM/CTT/TE); scoping propose-and-confirm. A7 reseeded as
  a balanced unposted top-side (Dr 411000 / Cr 706000).
- S3/S4: population service (hash-bound, gate-checked), sampling propose→validate→draw
  (app path reproduces the pinned manifest draw exactly, engine_run recorded), PBC request
  generation (per-unit + BL + explanation + standing items), L2 send, lazy reminder
  cadence + pause + time-warp, client portal FR/EN (uploads, explanation answers,
  "Tous les justificatifs ont été transmis"), evidence engine (sha dedupe flags,
  quarantine), inbound-email stub (allow-list + demo:email). Client-isolation
  test-asserted.
- Suite: 56 tests green; next build clean.

## Next actions

1. S5 extraction ladder (Factur-X XML, text-layer parsers, OCR/LLM mock adapters,
   verify UI) → S6 matching & exceptions + follow-ups + verification spot-check.
2. S7 workpaper engine; S8 SOX; S9-S10; hardening per docs/08_BACKLOG.md.

## Done (Stage A gate + D13)

- Gate 1 executed (6 lenses + red team) → docs/09_GATES.md with dispositions; ADR-012
  (L2 evidence contract), ADR-013 (export boundary contract), ADR-014 (lock/retention).
- D13 research pass executed → docs/10_D13_RESEARCH.md. Corrections applied: France
  retention 10y (not 6+); PCAOB completion 14d/45d-tier + 7y; A1/A2/A3/A4 verified;
  CNCC/FRC citations fixed; Factur-X claim scoped to invoice legs.
- ASSUMPTIONS: A8 reclassified kill-criterion; A11–A13 added (L2 economics, OE extraction,
  secret professionnel). OPEN_QUESTIONS: Q11–Q12 added.

## Open threads (founder review items)

1. **Buyer intersection** (Gate 1, CPO/investor/red-team): does an independent (non-network)
   component-auditor segment exist at buyable scale? A8 falsification test defined.
2. **Real-corpus extraction eval** (A11/A12): pre-pilot gate requiring permissioned real
   documents — founder must source; cannot be done in this synthetic-only repo.
3. Standing logged objection: sidecar positioning (D3) caps the provenance moat at the
   export boundary — mitigated by ADR-013 self-contained exports, revisit at v2.
