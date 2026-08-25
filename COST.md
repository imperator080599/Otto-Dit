# COST.md — LLM/OCR spend for the build and the demo

**Budget (D12): ≤ ~$200 for the entire build + demo. Actual: $0.00.**

## Actual spend

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

Spend is not self-reported: every OCR/LLM call must go through the `ai_run` registry
(model, prompt id + version, input/output hash, tokens, cost). The dashboard reads that
table, so the figure above is queryable, not asserted:

```sql
select count(*) runs, sum(tokens_in) tin, sum(tokens_out) tout, sum(cost_usd) usd from ai_run;
```

## Extrapolated cost per engagement (live adapters enabled)

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
