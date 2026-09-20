PHASE 2 — PHASE C OPENS.

STEP 0 — GET THE THREE ARTEFACTS INTO THE REPOSITORY. They were produced by
the supervising session (Fable, 20 September 2026) and could not be pushed
from there. They live in the attached claude.ai project "Otto Dit" as three
docs: `claude/OTTO_Plan_Maitre_Phase2.md`, `claude/OTTO_Audit_Phase2.md`,
`claude/OTTO_Audit_Phase2.json`. Read them with the Projects tool and write
them, byte for byte, to:
  docs/MANDATS/2026-09-20_plan_maitre_phase2.md
  docs/AUDIT.md
  docs/instantanes/audit.json
Commit them on main with the message "Phase 2 : audit technique et plan
maître (mandat 2026-09-20, §4 et §5)" and push. If the Projects tool is not
available or the docs are missing, STOP and ask the founder for the file
`0001-phase2-audit-et-plan.patch` (then `git am` it). Do nothing else
before this step is done and pushed.

STEP 1 — READ, in this order and in full: CLAUDE.md;
docs/MANDATS/2026-09-20_plan_maitre_phase2.md (the master plan — it is the
reference for everything below); docs/MANDATS/2026-09-20_mandat_revue_fondateur_phase2.md;
docs/AUDIT.md; then run `cd app && npm run reprise` and read docs/REPRISE.md,
docs/CHASSE.md, the first 200 lines of STATUS.md.

The plan has already decided the architecture, the data model, the UX, the
order and the acceptance criteria. Execute it integrally, phase by phase,
task by task (P0-00 … P7-03). Do not re-derive it. Where the plan and the
mandate differ, the mandate wins; where the plan and CLAUDE.md differ,
CLAUDE.md wins. Decisions the plan leaves open are yours: take them, write
them in docs/DECISIONS_AUTONOMES.md (D-P2-nn) with the reason, and continue.

STEP 2 — START WITH P0-00: build docs/REVUE.md (generated, one line per
R-F1..22, S-1..6 — all six are confirmed by the audit, none is SANS OBJET —
and AUD-01..18). AUD-19..25 and the audit's P3 list go to BACKLOG_REPORTE.md
as new R-nn entries citing docs/AUDIT.md. Commit it, report the counts.

Then Phase 0 (the proof chain), and only when its exit criterion is measured
— `set -o pipefail; timeout 7200 npm run verify | tee …; echo EXIT=$?` gives
EXIT=0 on HEAD, PARCOURS.json re-frozen, `clics --station` working — open
Phase 1. One shipping ritual per screen group (plan §0.4), never per
micro-slice; full verify once per ritual on the frozen tree; two hostile
reviewers on anything touching the data model, security, tenancy or a
refusal code; served SHA confirmed in the same follow-up.

EVERY TRANCHE THAT REMOVES A DISPLAY SHIPS THE STATION THAT WATCHES THE GUARD
BEHIND IT STILL REFUSE, on the world as it is seeded (rule 37). A screen made
simpler at the cost of a guard is a regression.

THE FOUNDER WANTS TO INTERVENE AS LITTLE AS POSSIBLE. Therefore:
  · Plan §20, H-1 and H-8: you are AUTHORISED, by this written mandate, to
    create the NEW Vercel variables OTTO_SESSION_SECRET (32 random bytes,
    base64) and OTTO_SANTE_TOKEN through the Vercel connector when the plan
    reaches P2-03 — production and preview targets. Generate the values
    yourself; never print them in a log, a file, a commit or a message.
    You are NOT authorised to touch DATABASE_URL, ANTHROPIC_API_KEY or any
    variable that already exists.
  · Plan §20, H-2 and H-3 (a separate preview database, OTTO_CI_DATABASE_URL):
    do NOT create databases or projects. Record these two lines as
    "en attente du fondateur" in docs/REVUE.md and move on; they do not
    block any phase.
  · Plan §20, H-4 and H-5 (founder's verdicts on the palette, the Send
    control, the "Changes since N-1" wording): apply the plan's defaults,
    take screenshots, show them to the founder in one short message, and
    CONTINUE without waiting. If he answers, apply his words in the next
    ritual; if he does not, the defaults stand and REVUE.md says so.
  · Never end a turn to wait (rule 36). Never ask the founder a question
    that the plan, the mandate or CLAUDE.md already answers.

Unchanged: demoPublique stays; no live AI on the hosted URL; never reseed
the public demo; PLAN_RLS step 3 never; no real data, no paid service, no
new model identifier in a pushed artefact, the key never printed. Rules 34,
35, 36 hold.

When docs/REVUE.md has no NON OBSERVÉE line left, say so and stop.
