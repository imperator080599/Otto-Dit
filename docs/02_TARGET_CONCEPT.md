# 02 — Target concept (≤3 pages)

## What OTTO is

OTTO is an AI-native assurance platform that runs the **middle loop** of financial-statement
audit and internal-control (SOX/ICFR) testing: population → risk-based selection → client
request → evidence intake → extraction → testing → typed exceptions/deviations → follow-up →
auto-drafted, fully traceable workpaper → review → conclusion. Its objective is to cut human
assurance-hours per engagement radically, at equal or better quality, with every figure
click-through to its source. [REC] It is global and framework-agnostic by construction: an
ISA-shaped core with **framework packs** (v1: ISA, NEP/France, PCAOB AS + SOX 404/COSO 2013;
accounting maps: PCG, IFRS, US GAAP). Adding a jurisdiction is content, never a fork (D1).

## The spine (D4)

One workflow spine, event-driven (P5), over shared deterministic services. No per-section
agents.

```
REQUEST ENGINE ⇄ EVIDENCE ENGINE ⇄ PROCEDURE/TESTING ENGINE ⇄ DOCUMENTATION ENGINE
        └──────────────── shared services ────────────────┘
  ingestion · generic TB/GL importer (+country adapters: FEC first) · extraction ladder
  (e-invoice XML → PDF text layer → OCR → LLM) · classification · reconciliation engine ·
  sampling engine (monetary AND attribute) · exception/deviation engine · notification
  service · immutable event log · ai_run registry
```

- **Request engine**: generates PBC/evidence requests from procedures (each request item
  linked to the GL lines or control instances it serves), tracks statuses, runs reminder
  cadences, receives the client's "All supporting evidence submitted" signal.
- **Evidence engine**: intake via portal upload and per-engagement inbound email; stores
  documents with provenance; routes them into the extraction ladder; quarantines anomalies.
- **Procedure/testing engine**: builds populations from the ledger or the RCM, samples
  (deterministic given seed), executes deterministic vouching/attribute tests with
  tolerances, emits **typed** exceptions (substantive) and deviations (controls), drives
  follow-up requests.
- **Documentation engine**: drafts pack-formatted workpapers (objective, scope, method,
  sample table with per-item evidence links and extracted fields, exceptions/resolutions,
  conclusion draft), enforces the L2 gate, review notes, dated sign-offs, visible
  modification flags with mandatory justification, documentation lock, exports (PDF/Excel).

LLMs appear only where they beat deterministic code: field extraction below the XML/text
rungs, document classification, drafting (rationales, workpaper prose, clarification
requests), suggestion (benchmark, deficiency classification). Everything else is SQL, rules
and arithmetic (P4). Every AI output is logged (model, prompt version, tokens, output hash)
and gated at **L2 before it enters the file**, in every pack (D5).

## The pack system (D1/P3)

A **framework pack** = terminology, thresholds and benchmark tables, procedure templates,
workpaper formats and language, deficiency/misstatement taxonomies, sample-size conventions,
importers/validators, checklists, retention and lock rules. Packs bind at engagement setup
(`framework_set`), and one engagement can carry several (a French subsidiary of a US-listed
group runs NEP + PCAOB/SOX on the same ledger — the v1 demo does exactly this). Accounting
mapping packs (PCG/IFRS/US GAAP) map chart-of-accounts → FSLI independently of the assurance
framework. The v1 demo must prove pluggability: **the same engines run a NEP revenue
substantive cycle (French workpaper) and a PCAOB/COSO operating-effectiveness cycle (English
workpaper) on the same synthetic subsidiary.**

## Two workspaces (D6)

- **Auditor workspace**: engagements, populations, samples, exceptions, workpapers, review.
  The tracker lives here — Excel status files are generated exports, never maintained (P6).
- **Client portal**: request list with per-item statuses, uploads, "All supporting evidence
  submitted", reminder-driven. The client **never** sees audit documentation — enforced by
  data design (row-level security + separate surface), not by UI hiding.

## The wedge (D2/D3)

v1 proves the middle loop end-to-end on **two cycle types** with the same engines:
(a) revenue/receivables substantive testing, (b) SOX operating-effectiveness control
testing. OTTO runs **alongside** incumbent audit-file software and exports formatted
workpapers into it (D3) — no rip-and-replace sale. The verified market gap this attacks:
no shipped product does ledger-native evidence ingestion → automatic vouching/attribute
testing → typed exceptions → auto-drafted traceable workpaper for audit firms (France
verified; globally, Fieldguide's claims are marketing-stage, DataSnipper still has the
auditor build the workbook).

## What OTTO deliberately is NOT

- **Not a chatbot UI.** AI is embedded in the workflow; partner questions are answered by
  provenance views with sources, not a conversation box.
- **Not a methodology.** OTTO executes and documents the firm's decisions under public
  standards; it does not sell judgment. Parameters are proposals (L3), conclusions are human
  (L4/L5).
- **Not a full audit file in v1.** No opinion, no completion memos, no archiving of the
  whole engagement — it exports into the incumbent file (D3).
- **Not an issuer-side SOX program tool.** OTTO serves the external/component auditor's
  testing, not management's 404(a) program (AuditBoard/Workiva territory).
- **Not self-learning on client data.** Reconfirmed roll-forward only (D9).

## The 5 strongest improvements over the founder's original concept (blunt)

1. **Killed the agent zoo.** "An AI agent per audit section" became one spine + four engines
   + configuration packs. Same outcomes, testable, debuggable, and a new framework costs
   content, not architecture.
2. **Made it global from day one.** The original was implicitly a French CAC tool. The core
   is ISA-shaped, France is a pack, SOX/ICFR is a pack — which also unlocks the strongest
   beachhead the founder actually lives in: European component auditors of US-listed groups,
   who need NEP + SOX on the same engagement.
3. **Inverted the OCR assumption.** France mandates machine-readable invoices from Sept 2026;
   the extraction ladder starts at structured XML (exact, free), falls back to PDF text and
   only then to OCR/LLM. Cost per evidence page drops by an order of magnitude and accuracy
   rises exactly when the product ships.
4. **Typed exceptions and deviations as first-class objects.** The original had "relance
   client si écart"; the redesign makes every gap a typed, lifecycle-tracked object that
   drives follow-up, misstatement/deficiency evaluation and the aggregation views — this is
   what makes P8 ("auditors consume exceptions") real and what incumbents lack.
5. **Traceability as architecture, not feature.** Request ↔ evidence ↔ assertion ↔ risk ↔
   procedure ↔ sample item ↔ exception ↔ conclusion ↔ reviewer is the data model itself;
   the three provenance questions are answerable by construction, which is the whole
   inspection-defensibility story (H2A, PCAOB) and the moat against Excel-plugin rivals.
