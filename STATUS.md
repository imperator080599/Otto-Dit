# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Current state

- **Stage**: B (development plan) — docs 03–07 drafted, Gate 1 + D13 research applied;
  writing 08_BACKLOG, then Gate 2.
- **Branch**: `claude/otto-audit-platform-whs17z`.

## Done

- Repo scaffold, CLAUDE.md standing rules.
- docs/00_FOUNDER_IDEAS.md (verbatim founder document).
- docs/01_IDEA_ASSESSMENT.md — all 33 founder ideas judged + capability sweep (France
  statutory, ICFR/SOX, cross-cutting).
- docs/02_TARGET_CONCEPT.md — spine, pack system, workspaces, wedge, NOT-list, 5 improvements.
- docs/DECISIONS.md (ADR-001..011), ASSUMPTIONS.md (A1..A10), OPEN_QUESTIONS.md (Q1..Q10).

## Next actions

1. docs/08_BACKLOG.md, then Gate 2 (Stage B lenses + red team) → 09_GATES.md; commit+push.
2. Stage C: app scaffold → dataset generator → slices S1–S10 per backlog.

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
