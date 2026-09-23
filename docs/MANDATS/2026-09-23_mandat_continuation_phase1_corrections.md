# Mandat du fondateur — 2026-09-23 (continuation Phase 1, trois corrections permanentes)

Reçu en session, commité verbatim (règle 33) avant exécution.

---

CONTINUE — Phase 1. First, in this turn's first commit, confirm the served
SHA of dad1111 via /api/sante (rule 27), then go on. Do not end this turn
while a task remains.

THREE STANDING CORRECTIONS, effective immediately:

1. Rule 26 twice in one day (R143, R145) has one mechanical cause: every
   push of a WIP commit to the session branch triggers a Vercel PREVIEW
   build, and reconstruire.ts applies the migration to the SHARED demo
   database. From now on: (a) a migration is pushed ONLY in its final form,
   after local `db:reset` + targeted tests + hostile review — WIP commits
   stay local (rule 24 already puts the review BEFORE the push);
   (b) you are AUTHORISED, by this written mandate (plan §20, AUD-18), to
   disable preview builds for every branch except main on the Vercel
   project otto-dit, through the Vercel connector: set the project's
   "Ignored Build Step" command to
      [ "$VERCEL_GIT_COMMIT_REF" != "main" ]
   (exit 0 = build skipped; on main the test is false → exit 1 → build
   runs). Verify it by reading the project settings back, then push one
   docs-only commit to the session branch and confirm NO preview deployment
   was created. Record it as an ADR. Nothing else in Vercel is touched. If
   the connector cannot change that setting, say so in one line: the
   founder will set it by hand (Vercel → Project otto-dit → Settings →
   Git → Ignored Build Step → the same command).

2. R142 (tests/screens.test.ts crashing under full-suite load) must stop
   tainting rituals: CLAUDE.md §7 already names the cause ("deux vitest en
   parallèle font tomber le serveur du balayage"). New task P0-09 (harness,
   one reviewer): exclude ../tests/screens.test.ts from the general
   `vitest run` include in app/vitest.config.ts and run it as its own
   maillon `screens:test` (`vitest run ../tests/screens.test.ts
   --no-file-parallelism`) placed in scripts/verify.ts and verifier.yml
   right before the final `vitest` link (the seed is still intact there,
   F62 order respected). Acceptance: two consecutive full `verify` runs
   with 18/18 (now 19/19) links green, no "aléa connu" line. Do it BEFORE
   P1-04, then update R142.

3. The plan's migration numbers (0175 supersede, 0176 risque, …) are
   indicative: your fix-forwards consumed 0171/0173/0175. Keep the plan's
   CONTENT and ORDER (§7.5 → §7.10), take the next free number each time,
   and never renumber anything applied.

THEN continue Phase 1 in the plan's order: P1-04 (visa: VISA-01..04,
EQUIPE-01), P1-05 (verrou générique), P1-06 (supersede), P1-07 (risque,
RISK-01, tirage relié), P1-08 (index/FK, docs:modele), P1-09 (Refus),
P1-10 (verbes, écritures nues, deux horloges) — second ritual of the band,
two hostile reviewers, docs/04 regenerated, /api/sante readings per guard,
Phase 1 exit criterion measured, then Phase 2 (P2-01..P2-05) in the same
breath. A `verify` with a red link is not green: fix or isolate the cause
(as in P0-09), never "accept as disjoint" twice for the same cause.
Founder gestures (plan §20) stay "en attente"; report in one short French
paragraph per task and the generated report per phase.
