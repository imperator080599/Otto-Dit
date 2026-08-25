# COST.md — LLM/OCR spend for the build and the demo

**Budget (D12): ≤ ~$200 for the entire build + demo. Actual: $0.00.**

Read the two sections below in order and do not confuse them: **§1 is what was measured by
executing code**, §3 is what was *computed on paper*. A figure that has never been produced
by a real call is an extrapolation, whatever its number of decimals.

## 1. Live-execution measurement (`npm run cost:measure`)

<!-- MEASURED:BEGIN -->

**Status: the live run has NOT been executed. Measured spend remains $0.00 — because no
call was made, not because calls were free.**

Attempted: `npm run cost:measure` over the 23 synthetic evidence documents, adapter
`anthropic`, model `claude-sonnet-4-5`, budget $20.00. The command refused to start:

- ANTHROPIC_API_KEY is not set in this environment.
- OTTO_PRICE_IN_PER_MTOK / OTTO_PRICE_OUT_PER_MTOK are not set — without today’s price list a $ budget cannot be enforced, so the run is refused rather than run blind.

Everything below the "Extrapolated" heading is therefore still an **extrapolation, not a
measurement**. To turn it into one, from an environment that has the credentials:

```bash
export OTTO_OCR_ADAPTER=anthropic
export ANTHROPIC_API_KEY=…
export OTTO_PRICE_IN_PER_MTOK=…      # today's price list, in USD per million tokens
export OTTO_PRICE_OUT_PER_MTOK=…
cd app && npm run cost:measure -- --budget=20 --yes
```

The command meters every call through `ai_run`, stops the moment cumulative spend reaches
the budget, and rewrites this block with measured cost per document, cost per engagement,
latency, failure rate and the gap against the ≈$0.30 extrapolation.

<!-- MEASURED:END -->

**Why no key exists here.** This repository was built in a remote execution environment
with no vendor credentials: a direct `POST /v1/messages` returns
`401 authentication_error: x-api-key header is required`. That is a fact about the build
environment, not a claim about the product. The adapter, the metering and the budget guard
are written and unit-tested (`src/lib/services/extraction/adapters.test.ts`); only the
credential is missing.

## 2. Build + demo spend to date

| Item | Runs | Tokens | Cost |
|---|---|---|---|
| OCR adapter calls (replay fixtures) | 1 per demo run | 0 | **$0.00** |
| LLM drafting/classification | 0 | 0 | **$0.00** |
| **Total build + demo** | — | — | **$0.00** |

Why zero: the demo and the test suite run entirely on the deterministic rungs of the
extraction ladder (structured Factur-X XML + PDF text layer) plus a **record/replay** OCR
adapter, and every drafted narrative in the prototype is produced by deterministic
pack templates rather than a model (P4 — no LLM where a rule suffices). The live adapters
are implemented behind the same interface and refuse to run unless explicitly configured,
so the demo cannot silently spend (ADR-009, OPEN_QUESTIONS Q1).

**Proven by execution vs proven by mocks** — the same split as STATUS.md:

| Claim | How it is established |
|---|---|
| The demo and the suite spend $0 | **By execution.** 116 tests and the two-part demo run with zero network; `select sum(cost_usd) from ai_run` returns 0. |
| The deterministic rungs (1–2) parse the dataset correctly | **By execution.** `npm run eval:extraction` scores them per field on a corpus the parsers never saw. |
| A live adapter refuses to run unconfigured | **By execution** (adapters.test.ts). |
| Rung 3–4 precision, latency and cost | **Not established.** No live call has ever run. The mock is a replay of fixtures, so any number derived from it describes the fixture, not a model. |
| ≈$0.30 per engagement | **Extrapolation only** (§3). Turn it into a measurement with `npm run cost:measure`. |

Spend is not self-reported: every OCR/LLM call must go through the `ai_run` registry
(model, prompt id + version, input/output hash, tokens, cost). The dashboard reads that
table, so the figure above is queryable, not asserted:

```sql
select count(*) runs, sum(tokens_in) tin, sum(tokens_out) tout, sum(cost_usd) usd from ai_run;
```

## 3. Extrapolated cost per engagement (live adapters enabled) — NOT a measurement

[ESTIMATE — basis stated per line; verified 2026-08-25 price points from the program brief.]

Assumptions for a mid-size French statutory engagement: revenue cycle sampled at ~25 items,
~2.5 documents per item, plus ~40 standing/other documents ⇒ **~100 evidence documents**,
~1.5 pages each ⇒ ~150 pages.

| Rung | Share of pages | Unit price | Cost |
|---|---|---|---|
| 1 — structured e-invoice XML (Factur-X/UBL) | 30% today → 70%+ by FY2027 (docs/10 §C) | $0 | $0.00 |
| 2 — PDF text layer (deterministic parse) | ~40% | $0 | $0.00 |
| 3 — OCR (Mistral OCR 3, batch $1/1 000 pages) | ~25% (≈38 pages) | $0.001/page | ~$0.04 |
| 4 — LLM structured extraction (Sonnet, ~2 000 tok/page in, 300 out) | ~5% (≈8 pages) | $2/$10 per MTok | ~$0.06 |
| Drafting (rationale, clarifications, workpaper prose — if model-drafted) | ~20 calls | ~1 500 in / 600 out | ~$0.18 |
| **Total per engagement** | | | **≈ $0.30** |

Even at 10× the document volume and with every page forced to the LLM rung, an engagement
stays around **$5–15** — immaterial against the ~€4 220 median French PE audit fee, and
against the hours the loop is meant to displace. The binding constraint on this product is
**not** inference cost; it is extraction accuracy and the L2 verification time it implies
(ASSUMPTIONS A11/A12), which is a people-time question, not a token question.

Batch API (−50%) and prompt caching (0.1× on cache reads) apply on top for volume runs;
EU-resident inference via Bedrock EU / Vertex EU costs the same to ~+10% (ADR-009).

## What would change these numbers

- **More structured evidence** (EU e-invoicing wave, docs/10 §C) pushes rung 1 up and cost
  down over time — for invoice legs only; delivery notes, contracts and PODs stay on rungs
  3–4.
- **SOX/ICFR evidence** (screenshots, system reports, approval emails) has *no* deterministic
  rung: an OE-heavy engagement sits proportionally more on rungs 3–4 (A12).
- **Live drafting** of workpaper prose is the largest single line; it is optional and can
  stay deterministic per pack.
