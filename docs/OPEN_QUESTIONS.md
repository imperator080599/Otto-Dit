# OPEN_QUESTIONS.md

Each question carries **my default answer** (applied and built). Founder: correct only what
is wrong; silence = default stands.

| id | Question | Default applied | Correct if wrong |
|---|---|---|---|
| Q1 | Should the MVP demo include live LLM/OCR calls, or run fully on the deterministic ladder + record/replay fixtures? | **Fully offline demo** (rungs 1–2 are real and deterministic; OCR/LLM adapters implemented but mocked). D12 spend ≈ $0; a `LIVE_ADAPTERS=1` env path exists for when keys are provided. | |
| Q2 | Engagement lock: hard-freeze writes at lock, or lock-with-append-only amendments (documented additions after assembly per ISA 230-style rules)? | **Lock-with-append-only**: post-lock modifications blocked except justified additions recorded as amendment events — closer to real assembly rules than a hard freeze. | |
| Q3 | Sample sizes for the substantive (monetary) side of the demo: fixed coverage rule or pack-configurable formula? | Pack-configurable: high-value coverage (all items > performance-materiality-derived cap) + random remainder to a pack-default size; both parameters visible and overridable at L3. | |
| Q4 | Client portal language for the demo subsidiary | **French** portal strings for the NEP engagement view (D10: portal follows engagement language); auditor workspace English. | |
| Q5 | Do we model the US parent's own FS audit in the demo dataset? | **No** — parent exists as group context (referral instructions, component reporting); the demo works the French subsidiary only. Anything more dilutes the wedge. | |
| Q6 | One engagement carrying both packs, or two engagements on one entity? | **Two engagements on one entity** (statutory NEP engagement + SOX component engagement), sharing the entity/ledger. Cleaner isolation of materiality, teams and workpapers; mirrors real practice (separate files). | |
| Q7 | Deficiency severity proposal: rules-only or LLM-assisted in MVP? | **Rules-first** (magnitude vs materiality thresholds + compensating-control/ key-control flags) producing an L3 proposal with written basis; LLM only drafts the narrative. | |
| Q8 | Reminder cadence default | 3 business days after request due/partial, then weekly; per-engagement override; auditor-visible log; pausable. | |
| Q9 | Currency handling in MVP | Single-currency (EUR) engagements; `Montantdevise/Idevise` parsed and stored, conversion out of scope. | |
| Q10 | Where does the demo's "review" happen for sign-off chains (manager+partner)? | Two review levels in demo (senior reviewer + signing partner), configurable list per engagement. | |
| Q11 | Is OTTO-held content itself "audit documentation" subject to file retention rules (NEP 10y / AS 1215 7y), independent of the incumbent file? | **Yes** (ADR-013.5): treat OTTO's store as audit documentation; retention per pack applies to it; exports carry hashes so file and OTTO can be tied at inspection. | |
| Q12 | Live inbound email (SMTP/webhook) in MVP, or interface-real transport-stubbed? | **Interface-real, transport-stubbed** (fixtures + `demo:email`); live transport is a DEPLOY.md runbook item — it is an environment property, not provable in this repo. Gate 1 CPO objection noted: wiring live transport is the FIRST post-repo task before any pilot. | |
