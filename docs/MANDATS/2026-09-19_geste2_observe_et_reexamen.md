GESTES_FONDATEUR.md received and reviewed. Your demoPublique() finding
is the most valuable thing produced in this project this week, and you
were right not to lift it on your own initiative.

GESTE 2 IS DONE AND OBSERVED. Performed by me a few minutes ago, and
verified — do not assume, but here is what was measured:

  · app_state.ia_vivante_budget now exists:
    {"actif": true, "plafondUsd": 2, "activePar": "Tuan",
     "activeLe": "2026-09-19T10:35:35.092106+00:00"}
  · Vercel, targets production AND preview: OTTO_BUDGET_USD=2,
    OTTO_PRICE_IN_PER_MTOK=5, OTTO_PRICE_OUT_PER_MTOK=25. The two
    prices are the published rate for claude-opus-5 ($5 / $25 per
    MTok), the default at adapters.ts:87 — sourced, not remembered.
    They will take effect at your next deployment.
  · /api/sante, line IA-BUDGET-01, read live at 10:39Z on sha 0eb13b3:
    "ACTIVE — plafond 2 $, posée par Tuan le 2026-09-19T10:35:35...",
    ok:true. It said "fermée" ten minutes earlier. The guard has now
    been seen in both states.
  · NONE of the four selectors is set. Deliberately.

YOUR SQL WAS VERIFIED INDEPENDENTLY BEFORE IT RAN, and corrected on one
point. Checked against the production database: app_state_pkey is
PRIMARY KEY (key), so the ON CONFLICT is valid; value is jsonb NOT NULL;
updated_at defaults. The point that mattered most: RLS IS active on
app_state, but its single policy `app_state_applicatif` is
FOR ALL / USING true / WITH CHECK true for all roles, and otto_app has
rolbypassrls = false — so the application reads the row. No silent trap.
The one correction: now()::text emits "2026-09-19 10:35:35+00" (space,
no T); now() passed directly to jsonb_build_object emits proper ISO-8601,
and that is the form that was used.

ALSO MEASURED, AND ABSENT FROM YOUR DOCUMENT: there is a second schema,
demo_instantane, mirroring all 124 public tables, and its app_state
holds only clock_offset. If the demo world is ever restored from that
snapshot, the ia_vivante_budget row disappears and the guard silently
reverts to "fermée". Record this where a future reader finds it before
being confused by it.

FOUNDER DECISION ON demoPublique() — NOT LIFTED, AND THIS IS A DECISION,
NOT A DEFERRAL. Record it as an ADR (or extend ADR-109), in these terms:
  1. otto-dit.vercel.app is public and unauthenticated. Lifting the
     guard lets anyone holding the link spend real money.
  2. And the 2 USD ceiling would not have protected against it. Your
     own §"troisième réglage" established why: costUsd() returns 0
     unless both price variables are set, so cost_usd would have stayed
     0 forever, the cumulative counter would never reach the ceiling,
     and gardeBudget() would never refuse — while the real provider
     bill climbed. A ceiling that cannot refuse is not a ceiling. That
     finding is what decided this.
Do not re-raise it and do not scope a lift. Real AI will be demonstrated
LOCALLY, where VERCEL is unset and the four factories read their
selectors normally. Nothing hosted needs to change for that.

NOW RE-EXAMINE docs/CLOTURE.md AGAINST THIS STATE and say plainly which
remaining NON OBSERVÉ lines are now reachable. My expectation — to be
confirmed or REFUTED by reading the code, not by agreeing with me:
  · AUTO-01, AUTO-02 and the two-guard test of §2.4 are code paths
    reachable with the mock adapters and the budget row now posted, so
    they are observable today. Note that /api/sante already carries
    "AUTO-01 : aucun réglage de mission ne dépasse le plafond de son
    pack" but it reads VIDE — no engagement has set its automation
    level yet. A VIDE reading is not an observation; that is the gap.
  · "IA-BUDGET-01 seen refusing a real call" is NOT reachable on the
    hosted deployment. Mark it SANS OBJET, motive: demoPublique /
    ADR-109 makes a real call architecturally impossible there, and the
    equivalent observation belongs to a local run, outside this
    inventory. The guard itself has now been observed in both states
    (fermée, then ACTIVE), which is what the mandate's §2.4 asks of it.
If your reading contradicts any of this, follow your reading and say so.

Also fix, inside the next ritual and not as one of its own: DEPLOY.md is
a second source of truth that lies — it omits OTTO_TRANSCRIPT_ADAPTER,
OTTO_WALKTHROUGH_ADAPTER and the whole geste-2 budget guard, and states
a default of claude-sonnet-4-5 for OTTO_EXTRACT_MODEL where the code
says claude-opus-5. Add the three variables I just posted while you are
there. One commit.

Everything else from the closing mandate stands: H-6 frozen; nothing
enters a tranche that is not a line of docs/CLOTURE.md; the MAT-03
mid-journey ruling and the VID-01 split ruling; EXTRAP-01 then EXTRAP-02
in one ritual; the three NOTIF-01 lines; one shipping ritual per line;
full verify once per ritual on the finished tree; SHA confirmed in the
same follow-up; rules 34, 35, 36.

When docs/CLOTURE.md has no NON OBSERVÉ line left, SAY SO AND STOP.