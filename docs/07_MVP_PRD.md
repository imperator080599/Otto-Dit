# 07 — MVP PRD

## 1. Scope (D2)

The middle loop, end-to-end, on two cycle types sharing every engine:

- **(a) Revenue/AR substantive testing** — NEP/France pack, French outputs: ledger
  population → risk-based sampling → PBC request → evidence intake → extraction ladder →
  deterministic vouching → typed exceptions → follow-up → auto-drafted French workpaper →
  review/sign-off → export.
- **(b) SOX operating-effectiveness testing** — PCAOB/COSO pack, English outputs: RCM →
  control-instance population via request engine → frequency-based attribute sampling →
  evidence → attribute testing → typed deviations → deficiency ladder (L3) + aggregation →
  English OE workpaper via the same documentation engine.

Plus the shared foundations those loops need: engagement setup with `framework_set`,
generic TB/GL importer + FEC adapter, TB↔GL reconciliation, PCG→FSLI mapping,
framework-aware materiality (L3), FSLI scoping (propose-and-confirm), client portal with
"All supporting evidence submitted" + reminders, evidence inbox, provenance views, event
log, dashboard with client-safe view + Excel tracker export.

## 2. NOT-YET (explicit, with reasons)

| Deferred | Reason |
|---|---|
| Bank/lawyer confirmations | D8 — rails/legal weight deserve a dedicated slice; state model designed |
| Full JET module | deterministic risk flags ship in MVP (ADR-003); SmartFEC+ covers France baseline free |
| Analytical review + auto variance questions | first fast-follow; proves nothing new about the engines (01 #25) |
| FS booklet tie-out | reuses the engines; layout-heavy OCR needs its own eval set (01 #20) |
| Estimates (ISA 540) | judgment-heavy; mechanics generalize later (01 #29) |
| Video/transcript walkthroughs | transcription post-MVP; consent + cost; walkthrough entity ships (01 #12/#31) |
| ERP/API evidence pulls | North Star, sequenced after wedge (01 #33) |
| Related-party screening | deterministic matching design retained; needs external data care (01 #19) |
| Full ISA 450 memo, TCWG/management letters, rep letter | objects + aggregation ship; memo workflows are pack content later |
| Multi-currency, consolidation, parent's own audit | Q9/Q5 — dilutes the wedge demo |
| M365/Outlook integration, live SMTP | inbound-email interface ships stubbed (05 §5) |
| EQCR, acceptance/independence workflows | data-model-ready, not wedge |

## 3. User stories & acceptance criteria (by slice)

**S1 Foundations**
1. As a senior, I create an engagement binding `framework_set` (packs, CoA map, language).
   *AC: two engagements on one entity (NEP statutory / SOX component) coexist; packs load
   their config; event_log records creation.*
2. As a senior, I import TB (N, N-1) via column mapping and the FEC via the adapter.
   *AC: mapping preview; validation report lists violations w/ row numbers; FEC 18-field
   validator passes the dataset file and rejects mutated fixtures (wrong order, bad dates,
   unbalanced entry, bad filename); re-import supersedes, never overwrites.*
3. As a senior, I see TB↔GL reconciliation per account. *AC: seeded TB↔FEC mismatch on one
   account is surfaced as an exception; all other accounts tie; diffs listed per account.*
4. As a senior, I see accounts mapped to FSLIs (PCG default map) and can override.
   *AC: override persists as engagement-level rule; event logged.*

**S2 Materiality & scoping**
5. As a manager, I receive a materiality proposal (benchmark, %, written rationale, pack
   language) and validate or adjust it; thresholds compute automatically.
   *AC: proposal is L3 (drafted rationale logged as ai_run in live mode, fixture in demo);
   validation stores validator+date; PM and CTT computed per pack config; new version
   supersedes.*
6. As a manager, I confirm FSLI scoping. *AC: below-threshold FSLIs are `ns_proposed`,
   never silently NS (D9); confirming/overriding requires action + basis; dashboard shows
   scoping state.*

**S3 Population & sampling (revenue)**
7. As a senior, I build the revenue population from the GL and see JE risk flags.
   *AC: population reconciles to scoped FSLI balances (hard gate); seeded weekend
   round-amount manual JE and credit-note pattern are flagged; flags filterable.*
8. As a senior, I validate proposed sampling parameters and draw the sample.
   *AC: params (coverage cap, random size, seed) proposed with rationale, editable (L3);
   draw deterministic — same population+seed+params ⇒ same items (test-asserted);
   selection reasons recorded (high_value / random / risk_flag).*

**S4 Requests & portal**
9. As a senior, I approve the auto-generated PBC request. *AC: items link to sampled GL
   lines; L2 send gate; request numbered (R-001…).*
10. As a client contact, I open my magic link, see my requests, upload files per item,
    answer explanation items in text (Gate 2), and press "All supporting evidence
    submitted". *AC: statuses flow sent→partially_submitted→submitted; explanation-type
    items accept typed answers feeding exception resolution; standing (procedure-level)
    items exist before any sampling; portal is French (engagement language); client can
    reach zero audit documentation (test-asserted).*
11. As a senior, I see reminders fire on the configured cadence with a visible log.
    *AC: cadence configurable/pausable; reminders logged; demo time-warp helper advances
    the clock.*

**S5 Extraction**
12. As a senior, I see extracted fields with per-field confidence and provenance, and I
    verify anything below threshold. *AC: Factur-X parsed exactly (rung 1, confidence 1.0);
    text-layer rung parses the born-digital PDFs; sub-threshold fields queue in a verify
    UI (L2) and store verifier+date; every field keeps (evidence, page) provenance;
    OCR/LLM adapters exist behind the interface with record/replay mocks (zero network in
    tests/demo).*

**S6 Matching & exceptions**
13. As a senior, I run vouching and consume typed exceptions, not raw matches.
    *AC: tolerances from pack config; all seeded substantive anomalies produce exceptions
    (acceptance suite: zero false negatives; false positives listed+triaged); exception
    lifecycle transitions logged; clarification request drafts require approval (L2);
    an exception can be promoted to a misstatement (factual/judgmental/projected,
    corrected/uncorrected — ADR-011); the sample evaluation (known + projected
    misstatement vs TE, kernel arithmetic) recomputes on every disposition (Gate 2);
    blind verification spot-check: verifier enters independent values BEFORE the machine
    result is revealed; disagreement auto-raises an exception with an escalation decision
    (expand subsample / re-perform), all stored on verification_run/check.*

**S7 Workpaper (NEP)**
14. As a senior, I open the auto-drafted French revenue workpaper; every figure
    click-throughs to source. *AC: sample table rows link evidence + extraction fields;
    attribution reads "Performed by OTTO engine run #x — Validated by [name, date]"
    (ADR-012.4); a verification spot-check section lists the blind re-performed
    machine-passed items (`verification_check`, ADR-012.3); edits require justification
    and show a visible modification flag; review notes lifecycle works; sign-offs are
    dated, immutable, and re-drafting after sign-off resets to require re-sign; PDF and
    Excel exports are terminal, versioned, hash-stamped and self-contained per ADR-013
    (embedded sample params, evidence sha256s, modification history, review trail).*

**S8 SOX OE cycle**
15. As an IC senior, I run an OE test end-to-end on the same engines.
    *AC: RCM lists controls (frequency, D&I gate blocks not-assessed); instance population
    requested via request engine; attribute sample sized per pack frequency table
    (overridable, ADR-010); all seeded deviations surface (missing approval, late
    performance, wrong performer, missing evidence); deficiency proposals carry rules
    basis + drafted narrative (L3); aggregation view lists deficiencies by severity;
    English OE workpaper via the S7 engine with the same traceability.*

**S9 Traceability**
16. As a partner, I answer the three provenance questions in ≤3 clicks each.
    *AC: "why does this evidence exist" from any evidence; "what supports this conclusion"
    from any workpaper section; "where did this figure come from" from any rendered
    number; event-log viewer filters by object/actor/verb.*

**S10 Dashboard**
17. As a manager, I track both engagements; as a client, I see only my safe view.
    *AC: progress by request/section/status; exception+deviation counts; framework badges;
    client-safe flag test-asserted; tracker exports to Excel in audience variants.*

## 4. NFRs

- **Determinism**: imports, reconciliation, sampling, matching, deficiency rules are pure
  functions of inputs+config+seed; test-asserted.
- **Offline**: full demo with zero external accounts/API calls (Q1); live adapters behind
  env flags.
- **Performance**: FEC 6k lines imported+validated+flagged < 10s local; UI interactions
  < 200ms perceived on demo data.
- **Auditability**: every state change in event_log (hash-chained); AI outputs in ai_run.
- **i18n**: string scaffold day one; UI EN; portal + workpapers follow engagement language
  (D10).
- **Quality gates**: all parsing/recon/sampling/materiality/matching/attribute logic under
  unit test; acceptance suite = ANOMALIES.md (zero false negatives; false positives
  triaged in the suite's output). **Scope of that claim (Gate 1)**: the suite is
  build-time regression evidence about engine design — it is NOT evidence of extraction
  reliability on real documents (A9/A12) nor an ISA 500-style tool evaluation; those are
  pre-pilot gates outside this repo.
- **Accessibility/UX baseline**: keyboard-navigable tables, readable density, no modal mazes.

## 5. UX principles

Workflow-first: the user is always inside an engagement → cycle → step; AI is embedded in
the flow (proposals, drafts, flags), never a chat box. Exceptions and judgment items are
the working surface (P8); populations are one click deeper. Clean, fast, readable,
enterprise-grade; every AI-touched artifact visibly labeled with its validation state;
every figure a link (P7). French where the engagement says so (D10).

## 6. Demo script (the prototype must pass this, end to end)

**Cast (all fictional)**: audit firm *Vermeil Audit (cabinet fictif)* — Claire Fontaine
(partner), Karim Benali (senior). Group: *Meridian Industrial Group, Inc.* (US-listed,
fictional). Subsidiary: *Altiverre SAS*, Lyon, industrial glazing, SIREN 999 888 777,
FY2025 (Jan–Dec). Client contacts: Sophie Marchand (CFO), Théo Girard (chef comptable).
Dataset: `dataset/` (committed, regenerable via seeded generator; anomalies in
`dataset/ANOMALIES.md`).

**Part 1 — Audit légal (NEP pack, French outputs), engagement "Altiverre FY2025 — NEP"**
1. Sign in (demo switcher) as Karim → engagement dashboard: framework badges NEP/PCG/FR.
2. Import TB N + N-1 (CSV, column mapping) → import FEC `999888777FEC20251231.txt` →
   validation report (clean file passes; violations demo on mutated fixture).
3. Reconciliation view: **one account mismatch surfaces (seeded)** → exception raised;
   other accounts tie.
4. Materiality: proposal (benchmark + % + French rationale) → validate (the demo
   validates the proposal's pinned values from dataset/demo-params.json — free adjustment
   is possible but moves the acceptance path, see DEMO.md) → M, PM, CTT and TE computed.
   FSLI scoping: NS proposals → confirm (one qualitative in-scope override).
5. Revenue population: JE risk flags visible (**seeded weekend round-amount manual JE,
   credit-note pattern**). Sampling: params proposed → validate → deterministic draw
   (high-value + random, reasons shown).
6. PBC request R-001 auto-generated (items ↔ sampled lines) → L2 approve → sent.
7. Portal (Sophie's magic link, French UI): upload evidence per item (incl. **1 Factur-X**),
   leave one item empty, press "Tous les justificatifs ont été transmis" on the rest →
   statuses update; reminder log shows cadence on the gap.
8. Evidence inbox: classification; extraction — Factur-X exact, text-layer for the rest,
   **one low-confidence field → verify UI (L2)**.
9. Matching runs → exceptions: **duplicate invoice, missing delivery note, price mismatch,
   quantity mismatch, cut-off error** (all seeded) as typed objects with lifecycles.
10. Follow-ups: auto-drafted clarification (FR) → approve → client answers (fixture) →
    resolve two, escalate one → **misstatement proposed (uncorrected)**.
11. Verification spot-check (ADR-012.3): a seeded verification_run draws the subsample
    of machine-passed items; blind re-perform (independent values entered before reveal)
    → agreement computed → section appears in the workpaper. Sample evaluation: known +
    projected misstatement computed against TE; senior records the conclusion basis
    ("Évaluation des anomalies", Gate 2).
12. Workpaper **REV-01 (FR)** drafted: attribution "Performed by OTTO engine run … —
    Validated by …"; sample table with per-item evidence links + extracted fields; edit
    one cell → justification + visible flag; review note (Claire) → address → close;
    sign-offs validateur/réviseur/associé (dated); export **PDF + Excel** (terminal,
    hash-stamped, self-contained per ADR-013).
13. Dashboard: progress %, exceptions, client-safe toggle, tracker Excel (client vs team
    variants).

**Part 2 — SOX 404 component work (PCAOB/COSO pack, English outputs), engagement
"Altiverre FY2025 — SOX component"**
14. Switch engagement: referral instructions from group auditor visible (data model).
15. RCM: revenue + treasury controls incl. **1 ITGC**; D&I gate demo (one control blocked
    until assessed).
16. Control C-BR-01 "Monthly bank reconciliation": population listing requested first
    (R-101, standing item) → client provides the 12-month listing → instances imported;
    attribute sampling per frequency table (monthly → pack default, overridable) →
    deterministic draw → per-sampled-instance evidence request (R-102) sent (Gate 2
    two-request flow).
17. Client uploads the signed reconciliations for the sampled months via the portal.
18. Attribute testing (prepared timely / preparer≠approver / approval present / items
    resolved): **seeded deviations surface — missing approval, performed late, wrong
    performer, missing evidence for one instance**.
19. Deficiency ladder: rules-based severity proposal + drafted narrative (L3) → confirm →
    aggregation view by severity.
20. Workpaper **OE-C01 (EN, PCAOB-style)** via the same engine: attributes matrix, deviation
    log, conclusion gate → review → sign-off → export PDF/Excel.
21. Traceability finale, both engagements: from a workpaper figure → extraction → evidence
    → request → sample → procedure → risk; event-log viewer; "why does this evidence
    exist" on a control PDF. **Same engines, two packs, two languages — the pluggability
    proof.**

Acceptance: `npm test` (in `app/`) runs the full suite including the ANOMALIES.md
acceptance tests — every seeded anomaly/deviation detected, zero false negatives; false
positives enumerated and triaged in the test output.
