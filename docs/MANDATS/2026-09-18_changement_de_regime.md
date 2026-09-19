CHANGE OF REGIME. From now, the objective is no longer to improve OTTO.
It is to CLOSE it. Read this entire message before acting.

═══════════════════════════════════════════════════════════════════
§0 — DO THIS FIRST. It is short (~30 minutes) and it unblocks me.
═══════════════════════════════════════════════════════════════════

GESTE 1 IS DONE. I posted a fresh ANTHROPIC_API_KEY in Vercel tonight.
Measured facts, verified against the Vercel API — take them as given,
but never trust them over what the code actually reads:

  project otto-dit, team Imperator
  ANTHROPIC_API_KEY, type=sensitive, visibility=secret, three entries:
    · target=production, no branch filter
    · target=preview, gitBranch=claude/otto-session-resume-zimig9
    · target=preview, gitBranch=claude/otto-audit-platform-whs17z
  DATABASE_URL: production, preview (no branch filter), development
  NOTHING ELSE EXISTS. No OTTO_TRANSCRIPT_ADAPTER, no
  OTTO_WALKTHROUGH_ADAPTER, no OTTO_OCR_ADAPTER, nowhere.

  WATCH OUT: the two preview entries are BRANCH-SCOPED. Your current
  branch is covered. If you ever open a NEW branch, its preview
  deployments will have NO key, and you would wrongly conclude the key
  was never posted. If that happens, say so — do not diagnose it as a
  missing founder gesture.

  THE KEY IS NEVER PRINTED. Not in a log, not in a file, not in a
  commit, not in a test output, not in an error message. Any check you
  write proves the key is SEEN without ever revealing it — presence,
  length, prefix, or simply a call that succeeds. A key that appears in
  an artefact is a key that must be revoked; one already was tonight.

NOW PRODUCE docs/GESTES_FONDATEUR.md: the exact, verbatim recipe for
the two remaining founder gestures, GENERATED from the code that
actually reads them. Never from memory. Never approximated. For each:
what to do, exactly where, and the exact way to verify afterwards that
it landed.

  GESTE 2 — the budget guard in the database. THIS IS THE ONE THAT
  MATTERS, because an independent measurement against the PRODUCTION
  Supabase database (done by my supervisor, not by you) found:

    · no table named ia_vivante_budget
    · no table and no column anywhere in the public schema whose name
      contains budget, plafond, ceiling, cost or coût — except
      ai_run.cost_usd and wp_extra_column.cout_usd
    · app_state contains EXACTLY ONE row: key='clock_offset'
    · ai_run exists, with: tenant_id, engagement_id, purpose, adapter,
      model, prompt_id, prompt_version, input_hash, output_hash,
      tokens_in, tokens_out, cost_usd, latency_ms, created_at,
      niveau_automatisation

  Establish from THE CODE AND THE MIGRATIONS which of these is true,
  and say WHICH, plainly:

    (a) the guard is built and lives under a different name or shape
        than "ia_vivante_budget" — then give its exact SQL statement,
        its exact verification query, and say where the ceiling value
        lives;
    (b) the guard is built in the LOCAL/PGlite world only and was
        never migrated to production — then name the missing migration
        and what applying it requires;
    (c) the guard was never built at all — then SAY SO. The founder's
        9 September mandate §4 forbids activating anything before it
        exists, so building it becomes the FIRST NON OBSERVÉ line of
        the inventory below, ahead of everything else.

  Do not paper over this. An honest (c) is worth far more than a
  confident (a) that turns out to be invented. If you are not certain,
  say you are not certain and say what would settle it.

  GESTE 3 — the three adapter selectors. Name them exactly as the code
  reads them, give the exact value that switches each from mock to
  live, and CONFIRM BY READING THE CODE that the default-when-absent is
  mock (they are currently not declared in Vercel at all, so the
  platform is running on that default right now).

  FIRST CEILING: 2 USD. Deliberately low, so that IA-BUDGET-01 is SEEN
  refusing a real call at least once before any larger figure is
  allowed. Write the recipe so that this refusal is the first thing
  observed after the gestures are performed.

Commit that file, say it is ready, and continue with the rest of this
message without waiting for me.

═══════════════════════════════════════════════════════════════════
§1 — H-6 IS FROZEN.
═══════════════════════════════════════════════════════════════════

Its mechanical CSS-token mandate is declared closed, exhausted or not.
Twelve consecutive tranches (2 through 13), roughly fifteen hours of
work, went into replacing hardcoded CSS values with token names: no new
screen, no new audit capability, no new refusal code, no visible change
to anything a viewer can see. The "deep design pass" instruction you
were given was badly bounded — that was my supervisor's error, not
yours, and it is corrected here.

Do not open another CSS, token, or refactor tranche. Do not scope one.
Do not measure how many candidates remain. Any future one requires an
explicit written founder order naming it.

═══════════════════════════════════════════════════════════════════
§2 — THEN PRODUCE ONE MEASUREMENT: the closing inventory.
═══════════════════════════════════════════════════════════════════

A GENERATED artefact, never hand-written prose (rule 21), committed as
docs/CLOTURE.md. It lists EVERY acceptance test ("épreuve") written in
the founder's mandates under docs/MANDATS/ —

  · 8 September, internal control: CTRL-01..CTRL-07 and the nine
    épreuves of its §6
  · 9 September, the five answers: MAT-01, MAT-02, MAT-03, VID-01,
    and the épreuves of §2.5 and §3
  · 10 September, the sampling annex: the pack parameters and CTRL-07
  · 14 September: EXTRAP-01..EXTRAP-04 and the six épreuves of §1.6,
    AUTO-01, AUTO-02 and the two-guard test of §2.4, NOTIF-01 and the
    four épreuves of §3.4

— and puts against each one EXACTLY ONE of:

  OBSERVÉ      — with the clicked path that observes it, and the SHA
                 where it was measured
  NON OBSERVÉ  — with one sentence naming precisely what is missing
  SANS OBJET   — with the founder decision that deferred it

"OBSERVÉ" means observed by DRIVING the real journey in the seeded
world. Not by reading the code. Not by a unit test alone. Where a
refusal is claimed, that refusal must have been SEEN refusing, against
the world AS IT IS SEEDED TODAY — not against a world constructed to
make it fire. That distinction is not pedantry: it is exactly how the
NOTIF-01 deadlock was found, and it is the only thing that makes this
inventory worth its cost.

Nothing in this inventory is declared. Everything is measured.

═══════════════════════════════════════════════════════════════════
§3 — THEN CLOSE THE GAPS, AND STOP.
═══════════════════════════════════════════════════════════════════

Close the NON OBSERVÉ lines, cheapest first, ONE shipping ritual per
line. Nothing that is not on that list enters a tranche — not an idea
from the registry, not an improvement you notice in passing, not a
refactor that would "only take a moment".

When the list is empty, SAY SO AND STOP. That sentence is the
deliverable. It is the end of the prototype.

═══════════════════════════════════════════════════════════════════
COST DISCIPLINE — effective immediately.
═══════════════════════════════════════════════════════════════════

The per-tranche ritual (full verify ~90 min + hostile review + deploy +
a separate "SHA servi confirmé" commit with its own deploy) now costs
more than the tranches it protects.

  · Group one whole inventory line into ONE shipping ritual. Do not
    split a line into micro-tranches that each pay the full ritual.
  · Run the FULL verify chain ONCE per ritual, on the finished tree. A
    docs-only or measurement-only commit does not earn its own chain.
  · Confirm the served SHA in the SAME follow-up as the measures, not
    in a commit of its own.
  · Rule 34 still holds without exception: never measure a tree that
    is moving.

═══════════════════════════════════════════════════════════════════
UNCHANGED.
═══════════════════════════════════════════════════════════════════

Standing permissions: work continuously, commit, push to main, deploy,
confirm, take the next inventory line without asking. Rules 35 and 36
hold — a bounded budget enforced by `timeout` INSIDE the command (not
in its label), and never end a turn whose only remaining action is
waiting: pipeline the next slice, or put `sleep N && <query>` inside
the same tool call.

Permanent interdictions: the key is posted, and that alone activates
NOTHING. You do not flip a selector and you do not open a budget on
your own initiative — both remain founder gestures, and both wait for
docs/GESTES_FONDATEUR.md and my hand. No real data, no paid service,
PLAN_RLS step 3 never, DATABASE_URL untouched. R108 (management's tests
as IPE, ISA 500 / AS 1105.10) stays deferred until a founder mandate
arrives — do not implement it and do not re-raise it.

Your D-J3N-19 decision — declining to build the MANUEL/FRAUDE workshop
under H-3's banner because it is Lot 6 work relabeled — was correct and
is confirmed. Keep refusing mislabeled work. In a closing phase that
instinct is the most valuable one you have.

Start with §0.