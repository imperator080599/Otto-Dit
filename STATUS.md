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

## Next actions

1. C1a: deterministic kernel (canonicalization, population_hash, population+flags,
   materiality math, sampling, tolerances, projection, deficiency rules) + unit tests.
2. C1b: dataset generator importing the kernel; commit dataset + ANOMALIES.md.
3. S1… per docs/08_BACKLOG.md.

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
