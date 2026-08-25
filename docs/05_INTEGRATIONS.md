# 05 — Integrations & I/O

Principle: generic core, country/vendor specifics as adapters (D7). Everything below runs
locally with zero external accounts; live adapters are configuration (DEPLOY.md).

## 1. Generic TB/GL import (core)

- **Formats**: CSV (auto-detect separator `;`/`,`/tab, encoding UTF-8/ISO-8859-15, decimal
  comma/point), Excel (first sheet or named range).
- **Column mapping**: interactive mapping UI → saved `mapping_profile` (per tenant+source
  system) proposing itself next time (L3 first import, L1 after). Canonical TB targets:
  account_no, label, debit, credit, balance (any 2-of-3 amount forms accepted, third
  derived). Canonical GL targets: journal, entry_no, entry_date, account_no, label, piece_ref,
  piece_date, debit, credit (+optional aux, lettering, currency).
- **Validation** (all imports): row-level type/date checks; TB balance Σdebit=Σcredit;
  GL entry-level balance per entry_no; duplicate detection; period-range check; orphan
  accounts (GL accounts absent from TB) — report persisted on `import_file.validation_report`,
  every violation listed with row numbers. Reject only structural breaks; warn otherwise.

## 2. FEC adapter (France pack)

Strict validator per art. A.47 A-1 LPF (verified spec, §3 of master context):
18 fields in exact order (`JournalCode…Idevise`), tab or pipe separated, dates `AAAAMMJJ`,
decimal comma, encodings ISO 8859-15 or UTF-8, `Montant`+`Sens` variant accepted and
normalized to Debit/Credit, filename pattern `SirenFECAAAAMMJJ`. Checks: field count/order,
per-entry balance, per-journal totals, global balance, EcritureDate within period,
ValidDate presence, SIREN consistency with entity, duplicate EcritureNum within journal.
Output: canonical `gl_entry` rows + validation report (violations with line numbers) +
JE risk flags computed at import (ADR-003).

## 3. Factur-X / e-invoice reader (extraction rung 1)

- Detect PDF/A-3 embedded attachment (`factur-x.xml`, CII syntax); parse seller, buyer,
  invoice number, dates, line items (qty, unit price, net), totals, VAT breakdown, IBAN.
- Profiles: MINIMUM→EN16931 (line items only where profile carries them); UBL accepted
  later (same canonical invoice model).
- Exact by construction → confidence 1.0, no AI, no cost. France reality from Sept 2026
  (décret 2026-07-27): all VAT-liable companies receive via accredited platforms — this
  rung becomes the default for French evidence. [ViDA/EU timeline: see D13 findings]

## 4. OCR / LLM ladder (rungs 2–4)

| Rung | Adapter | Cost basis | When |
|---|---|---|---|
| 2. PDF text layer | local (unpdf/pdfjs) + deterministic field parsers per doc_type | $0 | digitally-born PDFs (most invoices/statements today) |
| 3. OCR | pluggable: Mistral OCR 3 ($2/1k pages, $1 batch, EU) or Azure Doc Intelligence prebuilt-invoice ($10/1k, EU+US). **[UNVERIFIED prices; no adapter shipped]** — neither could be executed during the build, so neither is written: they are deployment tasks (ADR-019) | per page | scans/images or rung-2 field parse below threshold |
| 4. LLM structured extraction | Anthropic API (Sonnet default, Haiku for classification) behind `LlmClient`; native PDF read ~1.5–3k tok/page | per tokens | complex/degraded docs; always structured output, document text treated strictly as data (06 §AI) |
| 5. Human verify | UI | — | any field below pack confidence threshold (default 0.9) or auditor spot-check |

All adapters implement one `ExtractionAdapter` interface; tests + local demo use the
recorded/mock adapter (zero network). Per-field provenance: (evidence, page, zone?) kept at
every rung. Benchmark on the synthetic dataset during build; actuals → COST.md.

## 5. Per-engagement inbound email

Design (real): address `eng-<token>@in.<domain>` per engagement → webhook (SES/Postmark) →
`inbound_email` row → attachments become `evidence(source=email)` routed by sender match to
client_contact + open request items; unmatched → evidence inbox triage. Locally (MVP):
same pipeline fed by fixture `.eml` files via `npm run demo:email` (interface real,
transport mocked). Security: sender allow-list per engagement; unknown senders quarantined.

## 6. Exports

| Export | Content | Format |
|---|---|---|
| Workpaper (per pack) | NEP: French substantive workpaper; PCAOB: English OE workpaper — objective, scope, method, sample table w/ per-item evidence refs + extracted fields, exceptions/deviations + resolutions, conclusion, sign-off block, modification flags | PDF (pdf-lib renderer) + Excel (exceljs) |
| Client tracker (P6, idea #30) | Requests × items × statuses, % received per section; **audience variants**: client (no internal statuses/notes), team (full incl. "Awaiting review from X"), group/component reporting later | Excel |
| Evidence bundle | Per workpaper: linked evidence files + index sheet with sha256s | zip (roadmap) |

Exports are generated views — never round-tripped back in (P6). Every exported figure
carries its workpaper ref; exceptions/notes filtered by audience rules (04 §9.7).

## 7. LATER (designed-for, not built in v1)

- **ERP fallback ladder** (idea #33): API (per-vendor connectors) → standardized exports
  (SAF-T, FEC, ISO 20022 camt) → portal upload. Client consent-per-scope model retained.
  Evidence pulled via API carries source-system provenance and ITGC-reliance implications —
  gated on the controls side maturing.
- **Confirmations** (D8): own request/chase/reconcile state; execute via confirmation.com /
  Circit rails where mandated; open-banking evidence (Circit-style) as a later rung.
- **Microsoft 365**: OneDrive/SharePoint pickup, Outlook add-in for request threads.
- **Transcription** (walkthroughs): Deepgram/AssemblyAI/Gladia (EU) behind one interface.
- **Accounting SaaS pulls** (France SME): Pennylane/Cegid/Sage exports as import profiles.
