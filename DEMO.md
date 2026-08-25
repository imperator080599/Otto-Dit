# DEMO.md — the two-part demo, step by step

One fictional group, two engagements, the same engines:

- **Part 1 — audit légal (NEP/France pack, French outputs)**: revenue substantive testing on
  *Altiverre SAS* (fictional French subsidiary, SIREN 999 888 777, FY2025).
- **Part 2 — SOX 404 component work (PCAOB/COSO pack, English outputs)**: operating-
  effectiveness testing of two controls at the same subsidiary, referred by the group
  auditor of *Meridian Industrial Group, Inc.* (fictional US-listed parent).

Cast (all fictional): **Vermeil Audit** — Claire Fontaine (partner, signs), Léa Moreau
(manager, reviews), Karim Benali (senior, prepares). Client: Sophie Marchand (CFO),
Théo Girard (chef comptable).

## 0. Start

```bash
cd app
npm install
npm run db:setup      # migrations + base world (2 engagements on 1 entity)
npm run dev           # http://localhost:3000
```

Two ways to run the demo:

- **Live walkthrough** (recommended for a first showing) — follow §1–§2 below and click
  every step yourself, starting from an empty engagement.
- **Pre-driven state** — `npm run demo:seed` executes both parts through the *same service
  calls the UI makes*, then you browse the finished engagements. `npm run demo:seed part1`
  or `part2` runs one part. Reset anytime with `npm run db:reset && npm run db:setup`.

Time-warp for the reminder cadence: reminders materialize lazily against a demo clock;
the request page shows the log after `npm run demo:email` or once the clock advances (the
test suite exercises the cadence directly).

## 1. Part 1 — Audit légal (NEP), French workpaper

Sign in as **Karim Benali** → engagement *Altiverre FY2025 — Audit légal (NEP)*.
Framework badges: `nep-fr` · `pcg` · `fr`.

1. **Data & imports** — import `dataset/tb_2025.csv` (current) and `dataset/tb_2024.csv`
   (prior); columns are auto-mapped (`Compte / Intitulé / Débit / Crédit`, `;`, decimal
   comma). Then import `dataset/999888777FEC20251231.txt` through the FEC adapter: 18-field
   order, AAAAMMJJ dates, per-entry balance, filename pattern. The import history shows the
   validation report; JE risk flags are computed at import.
2. **Reconciliation** — *Recompute*. The seeded **A7** difference surfaces on **two**
   accounts (Dr 411000 / Cr 706000, 25 000,00 € — an unposted top-side entry present only in
   the TB export), each raising a typed exception. Document both differences (a note is
   required) to open the per-FSLI population gate.
3. **Materiality** — *Propose (L3)*: the engine picks the benchmark by rule (PBT, because
   the result is representative), computes **M 37 000 € / PM 27 000 € / CTT 1 800 € /
   TE 27 000 €** and drafts the French rationale. Adjust or *Validate* — validation also
   refreshes the scoping proposals.
4. **Scoping** — FSLIs below performance materiality are `ns_proposed`, never silently NS
   (D9). Confirm one NS; scope one in qualitatively (a written basis is required).
5. **Population** — the revenue population (70x accounts) with its hash; toggle to the
   flagged view: the seeded **A6** weekend/round/manual JE and the **A8** credit-note
   pattern on customer C009 are flagged.
6. **Sampling** — *Propose parameters*: coverage cap = PM, 4 random items, deterministic
   seed. *Validate* (you may edit any parameter), then *Draw*: 16 items — 9 high-value,
   3 risk-flagged, 4 random, each with its selection reason.
7. **Generate PBC request** → R-001 with per-item links (invoice, delivery note, an
   explanation item for the manual JE) plus standing items (bank statements). *Approve &
   send* — the L2 gate.
8. **Client portal** (open `/portal/demo-sophie-altiverre` in another window, French UI) —
   upload the evidence from `dataset/evidence/`, type an answer to the explanation item,
   press **« Tous les justificatifs ont été transmis »**. One delivery note cannot be
   provided (that is seeded anomaly **A2**).
9. **Testing** → *Run extraction ladder*: the Factur-X invoice is parsed exactly from its
   embedded CII XML (rung 1), born-digital PDFs via the text layer (rung 2), and the one
   unlabeled "scan" falls to the OCR adapter — which **always** queues for side-by-side
   human verification (ADR-012). Verify it.
10. **Run vouching (L0)** → the exceptions appear, typed: **duplicate invoice (A1)**,
    **missing delivery note (A2)**, **price mismatch (A3)**, **quantity mismatch (A4)**,
    **cut-off (A5)**, plus the manual-JE and credit-note-pattern flags.
11. **Exceptions** → *Draft clarification request* (L2) → approve → answer from the portal
    → the exceptions become `explained`. Resolve them; escalate the cut-off to an
    **uncorrected misstatement** (36 330 €).
12. **Verification spot-check** → *Draw subsample* (seeded, reproducible over the
    machine-passed items) → re-perform **blind**: you type the values you read from the
    document *before* the machine result is revealed; agreement is computed.
13. **Sample evaluation** → *Recompute*: known + projected misstatement against TE, then
    record the conclusion (L4). The conclusion gate opens only when every exception is
    dispositioned *and* the evaluation is concluded.
14. **Workpapers** → *Draft REV-01*: French, assembled from stored facts, every figure
    click-through to its evidence, attribution "performed by OTTO engine run … / validated
    by …". Edit a section (justification required → visible modification flag), add a
    review note (Léa → Karim → addressed → closed), then sign
    préparateur/réviseur/associé. **Export PDF and Excel** — terminal, hash-stamped and
    self-contained (annexes: sampling parameters, evidence sha256s, modification history,
    review trail, sign-offs).

## 2. Part 2 — SOX 404 component (PCAOB/COSO), English workpaper

Switch to *Altiverre FY2025 — SOX 404 component*. Badges: `pcaob-sox` · `en`.
The overview shows the **group-auditor referral instructions**.

15. **RCM & controls** — import the RCM: 7 controls incl. 1 ITGC, with risks, assertions,
    COSO components and D&I status. `C-REV-03` is `not_assessed`: try to test it and the
    **D&I gate** blocks you; assess it first.
16. **C-BR-01 — Monthly bank reconciliation** → *Import client listing* (12 instances) →
    *Draw & request evidence*: the pack frequency table sizes the sample (monthly ⇒ 3),
    overridable only with a written justification; the per-instance evidence request is
    sent (the two-request flow: population listing first, evidence after the draw).
17. Client provides the signed reconciliations — one sampled month has none (seeded).
18. *Extract & test attributes* → the attribute grid fills, and the seeded deviations
    surface: **missing approval**, **performed late**, **wrong performer (SoD)**,
    **missing evidence**.
19. Record the dispositions → *Propose deficiency (L3)*: the rules engine proposes a
    severity from magnitude, key-control and compensating-control facts, with its full
    basis; the human records the decision. The aggregation view lists it by severity.
20. *Draft OE workpaper* → **OE-C-BR-01**, English, PCAOB-shaped, produced by the **same**
    documentation engine as REV-01. Sign and export.
21. Repeat for **C-REV-01** (weekly credit approvals): clean run, control concludes
    effective — including the OCR-mock approval form that went through human verification.

## 3. Traceability finale (both engagements)

22. **Provenance** → the three questions, answered from stored links:
    - *Why does this evidence exist?* → evidence → request item → sample item → sample
      (method, seed) → procedure → risk.
    - *What supports this conclusion?* → engine run, sign-offs, every supporting document
      with its sha256 and extraction rung, AI involvement, manual modifications.
    - *Where did this figure come from?* → ledger row + import file + natural key →
      extraction fields → vouching checks.
23. **Event log** → filter by actor (user/system/ai) or verb; the hash chain verifies live.
24. **Dashboard** → progress, exceptions, deviations, deficiencies, workpaper states, AI
    spend; export the tracker in **team / client / group** variants (the client workbook
    carries no exceptions, deviations or internal review statuses).

## What the demo proves — and what it does not

**Proves**: the middle loop runs end-to-end on two cycle types with one set of engines and
two content packs; every seeded anomaly and deviation is detected (`npm test`, zero false
negatives); provenance and the audit trail hold at every step.

**Does not prove** (see docs/09 Gate 1): extraction reliability on *real* client documents,
the L2 verification-time economics, or any market/adoption hypothesis. Those are pre-pilot
gates (ASSUMPTIONS A11/A12) and require permissioned real evidence, which this repo
deliberately does not contain.
