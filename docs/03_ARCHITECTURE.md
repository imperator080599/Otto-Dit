# 03 — Architecture

One workflow spine, event-driven, over shared deterministic services, driven by framework/
cycle **configuration packs** (D4). No per-section agents. LLMs only where they beat
deterministic code: extraction below the structured rungs, classification, drafting,
suggestion.

```
                        ┌──────────────── CLIENT PORTAL ────────────────┐
                        │  requests · uploads · statuses · confirmations │
                        └───────────────┬───────────────────────────────┘
                                        │ (RLS-scoped; never sees audit documentation)
 ┌──────────────┐   ┌──────────────┐   ┌┴─────────────────────┐   ┌───────────────────┐
 │   REQUEST    │⇄──│   EVIDENCE   │⇄──│  PROCEDURE / TESTING │⇄──│  DOCUMENTATION    │
 │   ENGINE     │   │   ENGINE     │   │  ENGINE              │   │  ENGINE           │
 └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘   └─────────┬─────────┘
        │                  │                      │                         │
 ═══════╧══════════════════╧══════════ SHARED SERVICES ═════════╧═══════════╧═════════
  ingestion · generic TB/GL importer (+ country adapters: FEC) · extraction ladder ·
  classification · reconciliation engine · sampling engine (monetary + attribute) ·
  exception/deviation engine · notification service · event log · ai_run registry
 ═════════════════════════════════════════════════════════════════════════════════════
                     FRAMEWORK PACKS (content/config): ISA core · NEP/France ·
                     PCAOB-SOX/COSO · CoA maps: PCG / IFRS / US GAAP
```

## 1. Spine engines

### 1.1 Request engine
- **Purpose**: turn procedures into client-facing evidence requests; own their lifecycle.
- **Inputs**: procedure definitions (pack), samples/populations (testing engine), follow-ups
  (exception engine), auditor edits.
- **Outputs**: `request` + `request_item` rows (each item linked to the GL lines / control
  instances / topic it serves), portal views, reminder notifications, status transitions
  (`draft → sent → partially_submitted → submitted → accepted/reopened`).
- **HITL**: request generation L2 (auditor approves send); reminders L1 (cadence visible,
  pausable, logged); client "All supporting evidence submitted" flips status L0.
- **Request kinds** (Gate 2): *standing/procedure-level* items (listings, TB/GL/FEC,
  explanations) exist from engagement setup, before any sampling; *per-tested-unit* items
  are generated only from sampled units (the over-asking mitigation applies to these, never
  to standing PBC). The SOX flow is two requests: population listing first, per-sampled-
  instance evidence after the draw.
- **Failure modes**: over-asking (per-unit items only from samples); reminder spam
  (cadence config + log); orphan requests (FK to procedure mandatory).
- **Audit-trail writes**: every status transition, send, reminder, and reopen → `event_log`.

### 1.2 Evidence engine
- **Purpose**: intake, store, classify and route every piece of client evidence with
  provenance.
- **Inputs**: portal uploads, per-engagement inbound email (stub in MVP: interface +
  fixtures), auditor uploads.
- **Outputs**: `evidence` rows (sha256, source, uploader, request_item link), extraction
  jobs, classification results (`invoice / delivery_note / credit_note / bank_statement /
  reconciliation_sheet / approval_record / other`), quarantine flags.
- **HITL**: intake L0/L1; classification L1 (auditor can reclass); anything ambiguous or
  anomalous (failed parse, injection-suspect content, unreadable) → quarantined as an
  exception for a human, never silently dropped.
- **Failure modes**: duplicate files (sha256 dedupe, duplicates flagged not merged — a
  duplicate invoice is audit information); wrong request_item attribution (auditor re-link
  UI, logged); malicious content (documents are UNTRUSTED: see 06 §AI governance).
- **Audit-trail writes**: intake, classification, re-link, quarantine → `event_log`.

### 1.3 Procedure / testing engine
- **Purpose**: build populations, select samples, execute deterministic tests, emit typed
  exceptions/deviations.
- **Inputs**: `tb_snapshot`/`gl_entry` (financial populations), `control` + frequency
  (control-instance populations), pack procedure templates, materiality, extraction results.
- **Outputs**: populations with risk flags (incl. deterministic JE flags, ADR-003),
  `sample`/`sample_item` (deterministic given seed — method + seed + parameters stored),
  `match` results (vouching: GL line ↔ invoice ↔ delivery note, tolerances from pack),
  attribute-test results per control instance, typed `exception`/`deviation` rows,
  follow-up drafts.
- **HITL**: population build L0; sampling parameters L3 (proposed + rationale, auditor
  validates); sample execution L0; vouching L0 (deterministic) with L2 verification where
  extraction confidence was low; exception raising L1; exception resolution L2–L4;
  **sample evaluation** (known + projected misstatement vs tolerable misstatement, Gate 2)
  computed L0, concluded L4.
- **Failure modes**: tolerance misconfiguration (pack defaults + per-engagement override
  logged); population incompleteness (**per-FSLI gate**: the tested FSLI's accounts must
  each be clean or carry a `documented_difference` reconciliation state — an absolute
  engagement-wide gate would deadlock on any open difference, Gate 2); extraction
  garbage-in (confidence threshold routes to human verify before matching); mid-engagement
  re-import (ADR-016 invalidation rule: explicit confirmation supersedes dependent samples,
  tested items carriable via top-up draws; natural keys keep links resolvable).
- **Audit-trail writes**: population built, params proposed/validated, sample drawn (with
  seed), each test executed, each exception raised/transitioned → `event_log`.

### 1.4 Documentation engine
- **Purpose**: assemble pack-formatted workpapers from tested facts; own review and sign-off.
- **Inputs**: everything upstream (via traceability links), pack workpaper formats +
  language, auditor edits, review notes.
- **Outputs**: `workpaper` (structured JSON sections rendered to UI/PDF/Excel), drafts of
  objective/method/conclusion prose (LLM, pack language), `workpaper_edit` rows (visible
  modification flag + mandatory justification), `review_note` lifecycle, dated `signoff`
  chain, exports.
- **HITL**: draft assembly L1 from deterministic facts; drafted prose L2 (must be approved);
  edits L4 human with L0 flagging; conclusion L4/L5 — the system never concludes alone.
- **Failure modes**: drafted prose overstating assurance (templates constrain wording;
  conclusions require explicit human completion of "exceptions resolved?" gates); stale
  workpaper after upstream change (dirty-flag recompute: workpaper marks itself outdated if
  any linked fact changed after draft).
- **Audit-trail writes**: draft created/regenerated, every edit, every note transition,
  every sign-off (dated, user-bound, immutable) → `event_log`.

## 2. Shared services

| Service | Purpose / notes | HITL | Key failure modes → mitigation |
|---|---|---|---|
| Ingestion | File storage, sha256, MIME sniffing, virus-scan hook (prod) | L0 | corrupt files → quarantine exception |
| Generic TB/GL importer | CSV/Excel + column-mapping profiles; validation (balance, duplicates, date range); snapshot versioning | L1 (mapping confirmed by human first time, L3) | silent column misread → mapping preview + row-level validation report |
| Country adapters | FEC first: full 18-field validator (order, dates AAAAMMJJ, decimal comma, encodings ISO 8859-15/UTF-8, tab/pipe, Montant+Sens variant, balance per journal/entry, filename SirenFECAAAAMMJJ) | L0 | tolerant parse + strict report; hard-fail only on structural breaks |
| Extraction ladder | (1) Factur-X/CII XML → (2) PDF text layer + deterministic field parse → (3) OCR adapter (pluggable: Mistral OCR/Claude native; mock for tests) → (4) LLM structured extraction → (5) human verify. Confidence + provenance (doc, page, zone where available) on every field | L1; **L2 below confidence threshold** | wrong-field extraction → per-field confidence, verify UI; cost blowout → ladder ordering + batch |
| Classification | Doc-type classifier: filename/MIME/layout heuristics first, LLM fallback | L1 | misclass → auditor reclass, logged |
| Reconciliation engine | Deterministic: TB↔GL per account, TB N↔N-1 roll, client-base↔GL (later) | L0 | false comfort → per-account diffs listed, never netted |
| Sampling engine | One engine, two methods: **monetary** (high-value coverage above cap + seeded random remainder) and **attribute** (frequency-based size tables from pack, ADR-010). Deterministic given (population_hash, seed, params) | params L3; draw L0 | non-reproducible samples → seed + params + population hash stored on `sample` |
| Exception/deviation engine | Typed objects with lifecycle: `open → clarification_requested → explained → resolved | escalated(misstatement/deficiency)`; drives follow-up drafts | raise L1; resolve L2–L4 | exception flood → dedupe by (type, unit); severity ordering |
| Notification service | Portal + email (stub locally); reminder cadences | L1 | spam → per-engagement cadence config, log, pause |
| Event log | Append-only, every state change: (actor{user\|system\|ai}, verb, object, before/after hash, ts) | L0 | tamper → append-only + hash chain (prod: DB privileges) |
| ai_run registry | Every LLM/OCR call: model, prompt id+version, input/output hash, tokens, cost, engagement link | L0 | untracked AI output → all LLM calls go through one client that refuses to run without an ai_run context |

## 3. Framework pack system

**A pack is rows + templates + config, never code.** Binding: `engagement.framework_set`
references ≥1 assurance pack + exactly 1 accounting-map pack + 1 language.

Contents of a pack (stored under `app/src/lib/packs/<id>/`, loaded into DB at setup):

| Element | NEP/France pack (demo) | PCAOB-SOX/COSO pack (demo) |
|---|---|---|
| Terminology | FR: "seuil de signification", "caractère probant"… | EN: materiality, ICFR, deficiency… |
| Materiality benchmarks | benchmark menu + % ranges + rationale templates (FR) | same structure, EN, plus ICFR materiality reference |
| Clearly-trivial threshold | % range of materiality, pack default | same, PCAOB wording |
| Procedure templates | revenue/AR substantive testing program | OE control-testing program |
| Sampling config | monetary: coverage cap + random size defaults | attribute: frequency table (ADR-010) |
| Tolerances | vouching tolerances (amount abs/%, date window) | attribute pass/fail definitions |
| Exception taxonomy | price/qty/date/counterparty/missing-doc/duplicate… → misstatement types (factual/judgmental/projected) | deviation types (missing approval, late performance, wrong performer, missing evidence) → deficiency ladder (deficiency/SD/MW) |
| Workpaper formats | FR-language substantive workpaper layout | EN-language OE workpaper layout |
| Checklists | France statutory set (roadmap items listed in 01 §2a) | AS 2201-shaped OE prerequisites (D&I gate) |
| Importers | FEC adapter binding + PCG CoA map | generic importer + US GAAP/IFRS map |
| Doc rules | file closed ≤ **60 days** after report signature (C. com. D. 821-186 III-IV), retention **6 years** (C. com. R. 820-42) — ADR-014 rev. 2 | completion **14 or 45 days** per the AS 1215.15 phase-in (computed per engagement from fiscal year + firm size), retention **7 years** (AS 1215.14) — ADR-014 rev. 2 |

The **ISA core pack** carries the shared skeleton (assertion set, risk levels, generic
templates in EN); national packs override/extend it. Adding UK ISA / IDW PS later =
authoring one directory of content.

## 4. Event flows (MVP loops)

### 4.1 Substantive loop (revenue/AR, NEP pack)
1. `tb_imported` + `gl_imported` → reconciliation runs → `reconciliation_ok` (hard gate).
2. Materiality proposed (L3) → validated → thresholds computed → FSLI scoping proposed →
   confirmed (D9).
3. Population built for revenue/AR from GL (+ JE risk flags) → sampling params proposed
   (L3) → validated → `sample_drawn` (seeded).
4. Request engine generates PBC request (items ↔ sampled GL lines) → auditor approves send
   (L2) → `request_sent` → portal + reminders.
5. Client uploads / marks "All supporting evidence submitted" → `evidence_received` →
   classification → extraction ladder → (low confidence → human verify L2).
6. Matching runs per sampled line (invoice, delivery note, credit notes; tolerances) →
   `match_completed` → typed exceptions raised on failures.
7. Exceptions → auto-drafted clarification requests (L2 approve) → client responds →
   resolve (explained/corrected) or escalate → `misstatement` proposed (ADR-011).
8. Documentation engine drafts FR workpaper → auditor reviews/edits (flagged) → review
   notes → sign-offs → export PDF/Excel.

### 4.2 Control-testing loop (OE, PCAOB-SOX pack)
1. RCM imported/edited → controls typed (frequency, ITGC domain, D&I status gate).
2. For each in-scope control: instance population requested via request engine (e.g. 12
   monthly bank recs) → client provides listing/evidence.
3. Attribute sampling per frequency table (L3 params) → `sample_drawn`.
4. Evidence per instance → extraction (signatures/dates/fields as attributes where
   deterministic; else L2 verify) → attribute testing → typed deviations.
5. Deviations → follow-up loop (same engine) → deficiency proposal per pack ladder (L3:
   rules-first severity + drafted narrative) → aggregation view.
6. Documentation engine drafts EN OE workpaper (same engine, different pack format) →
   review → sign-off → export.

**The demo's point**: steps 3–6 in both loops run on the *same* sampling, extraction,
exception and documentation engines with different pack config.

## 5. Provenance chain (P7)

Every fact node carries typed links; the three questions are answered by graph walks, all
persisted (no recomputation at question time):

- **"Why does this evidence exist?"** `evidence → request_item → {sample_item → sample →
  procedure → risk → FSLI/assertion | control_instance → control_test → control → process}`.
- **"What supports this conclusion?"** `workpaper.section → linked facts (matches,
  sample_items, exceptions+resolutions, reconciliations) → evidence + extractions (+
  ai_run where AI drafted/extracted, + verifier where human-verified)`.
- **"Where did this figure come from?"** any rendered number carries a `fact_ref`
  (extraction field / computation node with formula + inputs / TB-GL cell), click-through
  in UI and footnoted in exports.

Deletion is forbidden everywhere provenance flows: supersede-with-version, never overwrite
(see 04 §versioning).

## 6. Non-goals of this architecture (v1)

Confirmations rails, ERP connectors, transcription, FS tie-out, full audit file/archive,
issuer-side SOX — all sequenced in 01/08; none require spine changes (that is the test of
D4).
