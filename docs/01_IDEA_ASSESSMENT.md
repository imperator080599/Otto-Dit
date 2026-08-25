# 01 — Idea assessment

Every distinct idea in docs/00_FOUNDER_IDEAS.md, judged against the **global multi-framework
product** (ISA core + NEP/France + PCAOB/SOX packs). Verdicts: **MVP** (in the D2 wedge build),
**LATER** (roadmap, sometimes data-model-ready now), **REDESIGN** (the idea's goal is right, the
mechanism is wrong — better version given), **REJECT** (with reason). HITL levels per Annex
(L0 deterministic … L5 partner judgment). "Simpler alt" applies P1/P4: eliminate > redesign >
deterministic > AI > human review > human execution.

Idea numbering follows document order; two adjacent UX lines are merged (#16).

## 1. Assessment table — founder ideas

| # | Idea (short) | Problem & who has it | Verdict | HITL | Simpler alt (P1/P4) | Key risk |
|---|---|---|---|---|---|---|
| 1 | Two faces: audit-documentation workspace + client request portal, communicating | PBC chase and evidence flow is scattered across email/Excel; whole team + client | **MVP** — this *is* D6, the product's skeleton | — | None; the two-sided link is the point | Portal adoption by small clients → email-native intake (D6) is the mitigation |
| 2 | TB upload (audited year) | Every engagement starts from the TB; team | **MVP** (S1) | L0 | Generic importer + column mapping, no AI | Dirty exports → validation + mapping UI |
| 3 | GL upload (full-year transactions) | Population source for all testing; team | **MVP** (S1) | L0 | Generic importer core; FEC is a country adapter, not the foundation | File size → stream parsing, snapshot versioning |
| 4 | GL↔TB reconciliation | Foundation check before any reliance on the ledger; team | **MVP** (S1) | **L0** | Pure SQL/arithmetic per account — zero AI | False comfort if mapping wrong → per-account diff surfaced, not just a total |
| 5 | Ground methodology in official public documentation | Legal/IP hygiene; founder | **MVP** (constraint, not feature) | — | It is input hygiene (§2), enforced in pack content | Public-source drift → cite-or-[UNVERIFIED] rule |
| 6 | Per-section AI agents/bots (fetch populations, reconcile, chase, select per GRA + threshold, fill templates, chase anomalies) | The middle loop eats the hours; team | **REDESIGN** → one workflow spine (request ↔ evidence ↔ testing ↔ documentation engines) + configuration packs, per D4. Same outcomes, no per-section agent zoo | L0–L2 by step | Most steps are deterministic (population build, reconciliation, status chase); LLMs only extract/classify/draft | Agent-per-section = N unmaintainable forks, undebuggable, cost-explosive; also the GRA is firm jargon → guided risk questionnaire in pack content |
| 7 | OCR to read received documents | Evidence arrives as PDFs; team | **MVP, REDESIGN** → extraction *ladder*: structured e-invoice XML → PDF text layer → OCR → LLM, with confidence + human-verify below threshold (S5) | L1/**L2** | From Sept 2026 French invoices are machine-readable (Factur-X) — XML rung is free and exact; OCR is the fallback, not the default | Extraction errors entering the file → confidence gating + L2 verify UI |
| 8 | Workflow sending meeting-invite emails (fraud interview, analytical review) | Scheduling friction; senior | **LATER** (thin) | L1 | P1: Outlook/calendar already solves scheduling; at most an .ics template from a pack checklist later | Zero differentiation; fails P12 (minutes saved ≈ trivial) |
| 9 | General chatbot for the partner | Partner wants answers without digging into sections | **REJECT** as chatbot UI; **REDESIGN** → provenance answer views ("what supports this conclusion / where is this figure from", S9) + engagement dashboard (S10) | L1 read-only | The underlying need is *queryable structure*, not conversation; deterministic views over the traceability graph beat a chatbot | Chatbot invites unsourced answers into partner decisions — inspection poison; also positioning ("not a chatbot UI") |
| 10 | Progress dashboard (% docs per section, client limited view, Excel export, email to contacts) | Status meetings + hand-made trackers; team + client | **MVP** (S10) | L0/L1 | Pure aggregation over statuses that already exist in-product (P6) | Client-safe view must be provably scoped (no audit doc leakage) — RLS-enforced |
| 11 | Automated macroeconomic / external-factors analysis | Planning-phase context; senior | **LATER**, demoted | L4 | P4: a generic LLM essay adds no assurance value; if kept, an assist that drafts *questions* for management from public entity facts | Generic filler text in the audit file; low P12 score |
| 12 | IC meeting **video** integration: AI documents understanding, asks clarifications, documents control steps; then OE: request instance list, select, obtain evidence, document | Walkthrough + OE documentation is heavy; IC team | **SPLIT**: OE testing loop = **MVP** (D2b, S8 — population → attribute sampling → evidence → deviations → workpaper). Video/transcript walkthrough capture = **LATER** (transcription explicitly post-MVP); walkthrough entity in data model now | OE: L1–L2; video: L2 | OE loop is mostly deterministic (frequency-based sample sizes, attribute checklists); video adds cost and consent/recording issues without being on the critical path | Conflating the two delays the provable wedge; video consent (client employees) + storage cost |
| 13 | Semi-automated JET (AI pre-fills criteria, human validates, auto-extract entries) | JET is mandatory and manual; team | **LATER** as module; **MVP keeps deterministic JE risk flags** (weekend posting, round amounts, manual journals, unusual credit-note patterns) inside population analytics (S3) because the acceptance dataset seeds those | L3 params / L0 extraction | Criteria are deterministic SQL filters; no AI needed to *run* them. France: CNCC SmartFEC+ is free and does baseline JET — differentiation is integration with follow-up + documentation, not the queries | Rebuilding a free tool; scope creep into MVP |
| 14 | Templates: Excel attachments, total-discrepancy flag, human-editable beyond the normalized frame, visible "modified" flag + mandatory justification | Real testing overflows templates; team | **MVP** (S7 workpaper engine) | L2 edit flag: L0 | The modification-flag idea is excellent and cheap — keep exactly as proposed | Free-form edits eroding structure → edits logged as workpaper_edit rows, never silent |
| 15 | Templates show evidence type obtained and how used (e.g. delivery note → quantity) | Reviewer can't see what supported what; reviewer | **MVP** (S7: per-item evidence links + extracted fields per assertion) | L0 render | This is P7 bidirectional traceability rendered in the workpaper — core, not optional | None material |
| 16 | Ergonomic, readable, clean design (2 lines merged) | Enterprise audit tools are miserable; everyone | **MVP** (UX principle: workflow-first, no chatbot, fast, readable) | — | — | Taste is not a backlog item — enforced via UX principles in 07_MVP_PRD |
| 17 | Review notes (human-only comments) | Review loop lives in email/Word today | **MVP** (S7: review notes lifecycle + dated sign-offs) | L4 | Plain CRUD + state machine — zero AI | Notes must be excludable from client view by construction |
| 18 | AI agents remember past audits (same client) and continuously improve | Roll-forward pain; team | **REDESIGN** per D9 → *reconfirmed roll-forward*: prior-year facts proposed, must be re-validated each year; **REJECT** self-learning on client data | L2/L3 | Deterministic copy-and-flag of prior-year structures beats model fine-tuning; no training on client data, ever | Self-learning = confidentiality breach risk, model drift, indefensible at inspection (H2A/PCAOB) |
| 19 | Fraud-relationship agent (org chart vs customers/suppliers, e.g. cousin is a supplier) | Related-party/fraud detection; partner | **REDESIGN** → deterministic related-party screening (name/address/IBAN/registry cross-match between master data, GL counterparties, declared related parties) = **LATER**; **REJECT** kinship inference | L3 | Matching is deterministic; "cousin" detection requires data nobody has and would be a GDPR incident, not a feature | High false positives; privacy; the useful 80% is string/identifier matching |
| 20 | FS booklet tie-out ("pointage plaquette"): OCR the FS + notes, tie every figure to audited TB, reconciliation template with cross-refs | Completion-phase tie-out is slow, late, manual; senior | **LATER** — high-priority roadmap; reuses extraction ladder + matching engine + workpaper engine unchanged | L2 | Same engines as the wedge — that's why it's a fast follow, not MVP scope creep | Layout-heavy OCR on FS booklets is harder than invoices; needs its own eval set |
| 21 | One-click synthesis of IC deficiencies + misstatements | Completion + TCWG comms; manager/partner | **MVP partial**: deviation→deficiency aggregation view (S8, S10); misstatement entity in data model; full ISA 450 corrected/uncorrected evaluation workflow = **LATER** | L0 view; L3 eval | Aggregation is a query over typed objects that MVP already creates | Without typed exceptions/deviations from day one this feature is impossible — hence data model now |
| 22 | AI proposes materiality benchmark + % with written rationale; human validates; computation automatic | Materiality memo is boilerplate + arithmetic; manager | **MVP** (S2) | **L3** propose / L0 compute | Benchmark choice is a short rules table per pack (profit-oriented → PBT 5% etc.) + LLM-drafted rationale; arithmetic is code | Rationale must cite engagement facts, not generic prose |
| 23 | Auto FSLI scoping by materiality; qualitative scoping below threshold | Scoping table is mechanical; senior | **MVP** (S2) | L1 + L3 override | Pure threshold comparison; qualitative override is a human flag with justification | Silent auto-descope → D9: propose-and-confirm, never silent |
| 24 | Per-section dashboard: accounts composing FSLI, below-CTT marked NS, status modifiable | Section lead sheets; team | **MVP** (S2/S10) | L1 + L3 override | Aggregation view over fsli_map — deterministic | Same as #23 — NS must be a *proposed* status |
| 25 | Auto analytical review N vs N-1 (monetary + % thresholds, human-validated), auto-send variance questions to client | Preliminary analytics + inquiry loop; senior | **LATER** (first fast-follow): variance calc is trivial, but the wedge (D2) is substantive + OE testing; auto-drafted variance questions reuse the request engine later | L1 calc / L2 send | Deterministic variance vs thresholds; LLM only drafts the question text | Scope discipline: it competes with the wedge for S3/S4 capacity without proving anything new |
| 26 | Bank confirmations: request list, completeness vs ledger, send, chase, integrated inbox, reconcile, exceptions | Confirmations are a chase-heavy ritual; team | **LATER** per D8 (not MVP); completeness-vs-ledger check is a good deterministic design to keep | L1/L2 | Deterministic: bank list vs 512* accounts (PCG) / cash GL; the *workflow* is the value, not AI | Legal weight of confirmations demands bulletproof delivery/identity — do it properly, later |
| 27 | Banks that only accept confirmation.com | Rail lock-in; team | **Answer (D8): coexist** — OTTO owns request/chase/reconcile state; execution goes through confirmation.com/Circit where mandated; OTTO records rail + outcome | — | Don't rebuild a trust network v1 | Fighting entrenched rails wastes the wedge |
| 28 | Lawyer confirmations (same loop + litigation/provision comparison vs GL above CTT) | Same ritual, legal letters; team | **LATER** per D8, same engines + extraction of litigation tables | L2 | Same as #26 | Free-text legal replies are genuinely hard extraction — needs its own eval |
| 29 | Non-litigation estimates (ISA 540): reconcile client's Excel base to GL, test the base by sampling, justify %/ratios/formulas | Estimates testing; senior | **LATER** — engines generalize (importer + reconciliation + sampling + vouching on the client's base); assumptions testing stays L4/L5 | L2 mech / L5 judgment | Base-to-ledger tie = reconciliation engine; base testing = sampling engine on an arbitrary table | Judgment-heavy core of estimates must never look "automated" — only the mechanics |
| 30 | In-platform progress tracker replacing side Excels; per-audience exports (team vs client vs group); statuses incl. "Awaiting review from X"; request numbers linked to sections | Every senior maintains parallel trackers; team + component reporting | **MVP** (P6 embodied; S4 statuses + S10 exports) | L0/L1 | Statuses already exist in-product; exports are generated views — the Excel is *output*, never maintained | Status taxonomy must match real review flow (Not received / Received / In progress / Awaiting review from X / Reviewed) or adoption dies |
| 31 | Process-review meetings: transcript + video vs client's flowchart; AI flags inconsistencies | Walkthrough consistency; IC team | **LATER** (transcription post-MVP; comparison is hard, hallucination-prone) — walkthrough data model in MVP so it lands cleanly | L2 | First ship: structured walkthrough capture (steps, owners, systems) — deterministic diff vs RCM; video diff later | Overpromising on "AI watched the meeting" — inspection-indefensible without careful design |
| 32 | "All supporting evidence submitted" client button; partial/complete statuses; auto-reminders on unfilled/partial | Evidence chase status ambiguity; team + client | **MVP** (S4) — one of the best cheap ideas in the document | L1 (cadence visible/configurable) | Pure state machine + scheduled reminders — zero AI | Reminder spam → cadence config + auditor-visible log + pause |
| 33 | ERP API access to eliminate client requests (with client-side approval of inspected transactions) | Requests exist because auditors lack source access; everyone | **LATER** — correct North Star (P1: eliminate the request), sequenced behind the wedge; ladder per 05_INTEGRATIONS: API → standardized exports → portal upload | L1 + client consent | The consent-per-scope idea is good and survives into the design | ERP API sprawl (one per vendor); evidence reliability/provenance of pulled data (ISA 500); premature now |

## 2. Capability sweep — what the founder document misses

Judged the same way; placement = MVP / roadmap / data-model-only (schema now, feature later).

### 2a. France statutory pack content (NEP engagements)

| Capability | Verdict | Placement | Note |
|---|---|---|---|
| Conventions réglementées special report | LATER | data-model-only (flag on related-party transactions → report template later) | Pack content, pure template + list |
| Going concern / procédure d'alerte | LATER | data-model-only (risk + conclusion fields) | Judgment-heavy, L5; pack checklist later |
| Subsequent events | LATER | roadmap (pack checklist + request template) | Cheap once request engine exists |
| Related parties | LATER | data-model-only; ties to idea #19 screening | |
| ISA 450 misstatement aggregation, corrected/uncorrected workflow | **MVP data model + basic view**; full evaluation workflow LATER | misstatement entity created by exceptions from day one | Without this the wedge's exceptions dead-end |
| Review hierarchy + dated sign-offs | **MVP** (S7) | — | Preparer/reviewer roles, dated, immutable |
| Review notes lifecycle (open → addressed → closed) | **MVP** (S7) | — | Idea #17 formalized |
| Documentation lock at assembly deadline (~60 days) + retention (6+ years France) | **MVP mechanism** (engagement lock state, append-only after lock); retention policy per pack config | — | Lock is an architecture property, can't be retrofitted |
| Prior-year roll-forward | data-model-only (D9) | period-linked entities, `rolled_from` refs | Reconfirm-not-copy |
| Representation letter | LATER | roadmap (pack template + e-sign later) | |
| TCWG / management letter communication | LATER | roadmap — generated from deficiency + misstatement objects | Overlaps SOX deficiency comms |

### 2b. ICFR / SOX pack content

| Capability | Verdict | Placement | Note |
|---|---|---|---|
| RCM (risk-control matrix) | **MVP** (S8) | — | Import/edit; controls typed (frequency, type, ITGC domain) |
| Process walkthroughs | data-model-only MVP; guided capture LATER; video LATER | walkthrough entity | Idea #12/#31 land here |
| Design & implementation assessment | MVP-lite: D&I status + conclusion per control (prerequisite gate before OE) | guided D&I flow LATER | OE on a badly designed control is meaningless — gate needed |
| Operating-effectiveness testing, frequency-based sample sizes | **MVP** (S8, D2b) | — | Published conventions as overridable pack defaults (e.g. daily 25/40, weekly 5–15, monthly 2–5, quarterly 2, annual 1) logged [ASSUMPTION → verify in D13] |
| ITGC domains (access, change, operations) | MVP-lite: one ITGC in demo RCM; domains in data model | full ITGC library LATER | |
| Deficiency taxonomy + evaluation ladder (deficiency → significant deficiency → material weakness) + aggregation | **MVP** (S8, L3 proposal) | — | Pack-specific taxonomy (PCAOB/COSO); aggregation view |
| Controls-reliance decision feeding substantive strategy | LATER | data model links control_test → risk → procedure now | The integrated-audit hinge; needs both loops mature |
| Management letter / deficiency communication | LATER | generated from deficiency objects | |
| Group-auditor referral instructions + component reporting | data-model-only MVP (group, component, referral_instruction entities); reporting pack LATER | founder's component-auditor pain (#30) partially covers reporting | Beachhead-relevant (D11) |

### 2c. Cross-cutting capabilities neither list named

| Capability | Verdict | Placement | Note |
|---|---|---|---|
| Sampling engine as a first-class shared service (monetary/coverage+random AND attribute/frequency) | **MVP** (S3/S8) | — | One engine, two methods — the pack-pluggability proof |
| Typed exception/deviation objects with lifecycle (open → explained → resolved/misstatement-or-deficiency) | **MVP** (S6/S8) | — | P8: auditors consume exceptions, never populations |
| Per-engagement inbound email intake | **MVP stubbed** (S4: interface + fixtures; live SMTP in deploy runbook) | — | D6 email-native reality |
| ai_run logging (model, prompt version, tokens, output hash) per output | **MVP** (day one) | — | FRC-guidance-as-spec; inspection defensibility |
| Immutable event log | **MVP** (day one) | — | P11 |
| Engagement acceptance/independence workflow | LATER | data-model-only (engagement metadata) | Out of wedge |
| EQCR (engagement quality review) | LATER | roadmap | Extension of sign-off hierarchy |
| Audit report / opinion generation | **REJECT v1** | — | D3: OTTO runs alongside the audit file software; the opinion lives there |
| Time tracking / billing | **REJECT** | — | Fails P12 for this product; commodity |

## 3. What this assessment changes vs the founder document (blunt)

1. **The agent-per-section architecture is rejected** (#6): one spine + packs delivers the same outcomes debuggably (D4). The founder's list reads as "an agent per pain"; the product is four engines and content packs.
2. **The chatbot is rejected outright** (#9) — the need is real, the mechanism is wrong; traceability views answer partner questions with sources.
3. **OCR-everywhere becomes an extraction ladder** (#7): France's e-invoicing mandate makes structured XML the *first* rung; OCR is the fallback. This inverts the cost model.
4. **Self-learning client memory is rejected** (#18) and replaced by reconfirmed roll-forward — the only inspection-defensible version.
5. **Confirmations, JET, analytics, estimates, FS tie-out, video walkthroughs are all sequenced out of MVP** — they reuse the same engines and land as packs/modules later. The wedge stays: two testing loops, one spine (D2).
