# 08 — Backlog (Stage C build order)

Vertical slices; each = migrations + code + tests + STATUS/DEMO update + commit. Definition
of done (DoD) per slice below; global DoD: unit tests green with zero network; event_log +
ai_run written by every feature from the start (CLAUDE.md rule 3); no LLM where a rule
suffices (P4).

| # | Slice | Contents | DoD |
|---|---|---|---|
| S0 | Scaffold | Next.js+TS app; PGlite db layer + migrations runner (`supabase/migrations/*.sql`); Vitest; base UI shell (layout, nav, dev auth switcher); i18n scaffold; event_log + ai_run + engine_run infrastructure; append-only + lock triggers (test-asserted); seed script (tenant, users, entity, group, engagements) | `npm run db:setup && npm run dev` shows both demo engagements; `npm test` green; event_log written on seed |
| C1a | **Deterministic kernel** (ADR-015, before any dataset bytes) | Pure unit-tested libraries: gl_entry canonicalization + natural keys; population_hash canonical spec (04 §7bis, single module); CoA→FSLI mapping; population builder + ADR-003 JE flags; materiality math (incl. TE); sampling engine (monetary + attribute + verification subsample); vouching tolerance checks; misstatement projection math; deficiency severity rules | All kernel functions unit-tested; determinism asserted; zero DB/network deps (pure functions over typed rows) |
| C1b | Dataset generator (imports the kernel) | PCG CoA, TB N/N-1 CSVs, FEC (~3–6k balanced entries, monthly patterns, seeded anomalies), 12–20 evidence PDFs (incl. 1 Factur-X w/ embedded CII XML, delivery notes, credit note, 2 bank statements), contacts; SOX: RCM (7 controls incl. 1 ITGC), instance populations + listing CSV, 6–10 control PDFs; **pinned demo params** (`dataset/demo-params.json`); substantive anomalies pinned to deterministic strata where possible; SOX deviations placed inside the pinned draw; each PDF emitted **with** its extraction fixture + expected-exception manifest; emits `dataset/ANOMALIES.md` | Regeneration byte-identical for fixed seed; FEC passes own validator; **kernel-level zero-FN acceptance test runs at this slice** (headless: population→flags→draw→match→expected exceptions); placement-invariant test wired into the suite from here on |
| S1 | Import & reconcile | Engagement setup w/ framework_set; generic TB/GL importer + column mapping profiles; FEC adapter (full validator per 05 §2); TB↔GL reconciliation; PCG→FSLI mapping + overrides | User stories 1–4 ACs; validator rejects mutated fixtures; seeded TB↔FEC mismatch surfaces |
| S2 | Materiality & scoping | Framework-aware proposal (L3, pack benchmarks + rationale) → validate → compute PM/CTT; FSLI scoping ns_proposed → confirm; qualitative override | Stories 5–6 ACs; math unit-tested; versions supersede |
| S3 | Population & sampling | Revenue population from GL + deterministic JE risk flags (ADR-003); sampling engine (monetary: coverage+random, seeded); params L3 flow | Stories 7–8 ACs; determinism test; flags detect seeded JE anomalies |
| S4 | Requests & portal | Request engine (generate from sample, L2 send, statuses, seq numbers); client portal (magic token, FR strings, uploads, "Tous les justificatifs…", partial statuses); reminders (cadence, log, pause, time-warp helper); evidence inbox; inbound-email interface + fixtures | Stories 9–11 ACs; client-isolation test (client reaches zero audit documentation) |
| S5 | Extraction ladder | Factur-X XML rung; PDF text-layer rung + per-doc-type field parsers; OCR/LLM adapter interfaces + record/replay mock; confidence + per-field provenance; verify UI (L2 per ADR-012) | Story 12 ACs; ladder tests incl. Factur-X exactness; zero network |
| S6 | Matching & exceptions | Deterministic vouching (amount/qty/price/date/counterparty w/ pack tolerances); typed exceptions + lifecycle; follow-up drafts (L2); misstatement promotion (ADR-011); verification spot-check (ADR-012.3, `verification_check`) | Story 13 ACs; all seeded substantive anomalies → exceptions (regression suite) |
| S7 | Workpaper engine | Pack-formatted draft (NEP-FR): sections, sample table w/ links, attribution per ADR-012.4, spot-check section; edits w/ flag+justification; review notes; dated immutable sign-offs; outdated-detection (based_on_hash); PDF+Excel export per ADR-013 (self-contained, hash-stamped, versioned) | Story 14 ACs; export includes evidence sha256s + params; re-draft resets sign-offs |
| S8a | SOX foundations | RCM import/edit (four surfaces only: RCM table, instance list, attribute grid, deviation list — Gate 2); D&I gate; **listing→control_instance importer (owned here)**; two-request flow: population listing request first, per-sampled-instance evidence request after the draw | Listing import tested; D&I gate blocks OE on not-assessed controls |
| S8b | SOX OE testing | Attribute sampling (frequency table ADR-010); attribute testing → typed deviations; deficiency rules ladder (L3) + aggregation view; EN OE workpaper via S7 engine | Story 15 ACs; all seeded deviations surface; same engines proven under second pack |
| S9 | Traceability | Event-log viewer; three provenance answer views across both cycles | Story 16 ACs; ≤3 clicks each |
| S10 | Dashboard & polish | Engagement dashboard (progress, exceptions/deviations, badges); client-safe view; tracker Excel (audience variants); full two-part demo script polished | Story 17 ACs; DEMO.md walkthrough passes start-to-finish on committed dataset |
| H | Hardening | Acceptance suite = ANOMALIES.md (zero false negatives, FPs triaged); README; DEPLOY.md (Vercel+Supabase runbook, env vars, live adapters, SMTP); COST.md (actual spend + per-engagement extrapolation vs D12) | `npm test` green incl. acceptance; docs complete; final push |

Dependency notes (restructured at Gate 2, ADR-015): C1a builds the entire deterministic
kernel as pure libraries; C1b imports it — the generator and the app can never drift
because they run the same code against the same canonical spec. S1–S3 wire the kernel to
DB/UI/flows; S5 needs C1b's PDFs+fixtures; S6 needs S3+S5; S7 needs S6; S8a/S8b reuse
S3–S7 engines (the pack-pluggability proof); S9/S10 read everything. The placement-
invariant test runs in every slice from C1b onward. Global DoD addition: sample
evaluation (projection vs TE) math is kernel arithmetic under unit test (Gate 2,
audit-partner lens); verification disagree flow (exception + escalation) asserted in
S6/S7 tests.

Post-repo milestones (NOT in this build, tracked for the founder): live email transport
(Q12), real-corpus extraction eval (A11/A12), A8/A13 GTM falsification, secret-professionnel
legal review, pilot recruitment.
