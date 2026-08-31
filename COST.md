# COST.md — LLM/OCR spend for the build and the demo

**Budget (D12): ≤ ~$200 for the entire build + demo. Actual: $1.61** — measured, not
estimated, against a $20 prepaid ceiling with auto-recharge disabled (ADR-020).

Read the two sections below in order and do not confuse them: **§1 is what was measured by
executing code**, §3 is what was *computed on paper*. A figure that has never been produced
by a real call is an extrapolation, whatever its number of decimals.

## 1. Live-execution measurement (`npm run cost:measure`)

<!-- MEASURED:BEGIN -->

**Status: measured.** Adapter `anthropic`, model `claude-opus-5`, prices
$5/$25 per MTok (supplied at run time), budget
$5.00.

| Measure | Value |
|---|---|
| Documents processed | 23 / 23 |
| Reached the model rung (3–4) | 1 (4.3 %) |
| Rungs reached | text_layer: 21, ocr: 1, xml: 1 |
| Tokens in / out | 2730 / 415 |
| **Total spend** | **$0.0240** |
| Cost per document (all documents) | $0.0010 |
| Cost per document that reached the model | $0.0240 |
| **Cost per engagement (×100 documents)** | **$0.10** |
| Gap vs the ≈$0.30 extrapolation | 0.3× (lower) |
| Model-rung latency p50 / p95 | 5606 ms / 5606 ms |
| Failure rate (call raised) | 0/23 (0.0 %) |

No call failed.

Per-document detail:

| Document | Rung | Fields | Tokens in/out | Cost | Latency |
|---|---|---|---|---|---|
| `AV2025-0001.pdf` | text_layer | 8 | 0/0 | $0.0000 | 180 ms |
| `AV2025-0002.pdf` | text_layer | 8 | 0/0 | $0.0000 | 11 ms |
| `AV2025-0003.pdf` | text_layer | 8 | 0/0 | $0.0000 | 11 ms |
| `BL2025-0095.pdf` | text_layer | 5 | 0/0 | $0.0000 | 6 ms |
| `BL2025-0314.pdf` | text_layer | 5 | 0/0 | $0.0000 | 8 ms |
| `BL2025-0472.pdf` | text_layer | 5 | 0/0 | $0.0000 | 6 ms |
| `BL2025-0473.pdf` | text_layer | 5 | 0/0 | $0.0000 | 6 ms |
| `BL2025-0474.pdf` | text_layer | 5 | 0/0 | $0.0000 | 6 ms |
| `BL2025-0475.pdf` | text_layer | 5 | 0/0 | $0.0000 | 12 ms |
| `BL2025-0476.pdf` | text_layer | 5 | 0/0 | $0.0000 | 6 ms |
| `FA2025-0060.pdf` | text_layer | 8 | 0/0 | $0.0000 | 5 ms |
| `FA2025-0145.pdf` | text_layer | 9 | 0/0 | $0.0000 | 5 ms |
| `FA2025-0477.pdf` | text_layer | 8 | 0/0 | $0.0000 | 4 ms |
| `FA2025-0481.pdf` | ocr | 7 | 2730/415 | $0.0240 | 5606 ms |
| `FA2025-0702.pdf` | text_layer | 9 | 0/0 | $0.0000 | 7 ms |
| `FA2025-0703.pdf` | text_layer | 8 | 0/0 | $0.0000 | 7 ms |
| `FA2025-0704.pdf` | text_layer | 9 | 0/0 | $0.0000 | 8 ms |
| `FA2025-0705.pdf` | text_layer | 9 | 0/0 | $0.0000 | 6 ms |
| `FA2025-0706.pdf` | text_layer | 9 | 0/0 | $0.0000 | 7 ms |
| `FA2025-0707.pdf` | text_layer | 9 | 0/0 | $0.0000 | 6 ms |
| `FA2025-0708_facturx.pdf` | xml | 9 | 0/0 | $0.0000 | 15 ms |
| `releve_512100_2025-11.pdf` | text_layer | 3 | 0/0 | $0.0000 | 15 ms |
| `releve_512100_2025-12.pdf` | text_layer | 3 | 0/0 | $0.0000 | 10 ms |

<!-- MEASURED:END -->

**Session total, 2026-08-25.** The founder supplied a prepaid key, so the AI layer has now
actually run:

| Run | Documents | Model-rung calls | Spend |
|---|---|---|---|
| Smoke test (one bitmap scan) | 1 | 1 | $0.024 |
| Eval, before ADR-021 | 28 | 24 | $0.578 |
| Eval, dictionary partially in place | 28 | 18 | $0.426 |
| Eval, ADR-021 complete | 28 | 8 | **$0.189** |
| Cost measurement (synthetic dataset) | 23 | 1 | **$0.024** |
| **Total** | | | **$1.27 of the $20 ceiling** |

The budget guard sat at **$5** throughout — a bug detector, not a budget (ADR-020). It never
tripped.

## 1 bis. Hors cache : les pièces neuves (mode IA réelle, ADR-105) — 2026-08-31

**Statut : mesuré.** `npm run eval:pieces-neuves` sur les **7 pièces jamais vues** de
`dataset/pieces_neuves/` (aucune dans le cache de rejeu — la première mesure d'extraction de
ce dépôt dont le modèle ne pouvait rien connaître), même chemin de code que l'application
(`runLadder`), adaptateur `anthropic`, modèle `claude-opus-5`.

| Mesure | Valeur |
|---|---|
| Pièces | 7 (6 lues au modèle, 1 par la couche texte — gratuite) |
| **Précision** | **100,0 %** (43/43 valeurs rendues correctes) |
| Rappel | 95,6 % (43/45 — 2 abstentions de `invoiceRef` sur les BL ; jamais une valeur fausse) |
| Échecs d'appel | 0/6 |
| **Coût par document lu au modèle** | **$0.0223** |
| Coût de la mesure | $0.1337 |
| Latence p50 (modèle) | 4 432 ms |
| Scan dégradé (photo, rotation, bruit) | lu **7/7** champs |

Et la **conduite de bout en bout** dans Chromium sur build de production (dépôt portail →
lecture réelle → attestation L2 → vouching) : **$0.0452** pour deux lectures, écarts
`amount_mismatch` (32 803,20 lu ≠ 32 160,00 écrit) et `qty_mismatch` (113 livrées < 128
facturées) nés des vraies lectures ; **l'arrêt au plafond exercé pour de vrai** (plafond
0,001 $ < dépense 0,0452 $ → lecture refusée à l'écran, zéro appel parti). Dépense totale de
la journée pour la tranche ADR-105 : **≈ $0.31** (deux passes d'eval + la conduite), toujours
contre le plafond prépayé de 20 $.

## 1 ter. L'analyste de transcript (ADR-108) — 2026-08-31

**Statut : mesuré.** `npm run eval:entretien` — UNE analyse réelle du transcript du jeu de
données contre la documentation du processus (le chemin `anthropic` de l'analyste ne devait
pas rester une branche que rien n'exécute), modèle `claude-sonnet-5`, appel d'outil forcé.

| Mesure | Valeur |
|---|---|
| Écarts plantés retrouvés | **3/3** (omission_doc, omission_orale, contradiction) |
| Écarts supplémentaires proposés | 3 (plausibles — des CANDIDATS, une personne statue) |
| Jetons entrés / sortis | 2 625 / 816 |
| **Coût de l'analyse** | **$0.0335** |
| Latence | 8,1 s |

Dans l'application, ce chemin est derrière `npm run demo:ia` (OTTO_TRANSCRIPT_ADAPTER),
garde de budget ADR-105 en amont, un `ai_run` par analyse ; la démonstration et les
harnais restent sur le rejeu enregistré — zéro appel payant.

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
| The demo and the suite spend $0 | **By execution.** 135 tests and the two-part demo run with zero network; `select sum(cost_usd) from ai_run` returns 0. |
| The deterministic rungs (1–2) read 20/28 corpus documents correctly | **By execution.** `npm run eval:extraction`, per field, on a corpus the readers never saw. |
| A live adapter refuses to run unconfigured | **By execution** (adapters.test.ts). |
| Rung 3–4 precision, latency and cost | **By execution.** 51 live calls across four runs: precision 100 % (n=194 returned values), 0 wrong amounts of 84, 0 wrong dates of 28, latency p50 ≈5.1 s, failure rate 0/51. |
| Cost per document and per engagement | **By execution** — §1 below. |
| ≈$0.30 per engagement | **Superseded by measurement.** Measured $0.10 (dataset mix) to $0.68 (corpus mix, 29 % of documents on the model rung). The extrapolation was the right order of magnitude for the wrong reason: it assumed a rung split that neither corpus shows. |

Spend is not self-reported: every OCR/LLM call must go through the `ai_run` registry
(model, prompt id + version, input/output hash, tokens, cost). The dashboard reads that
table, so the figure above is queryable, not asserted:

```sql
select count(*) runs, sum(tokens_in) tin, sum(tokens_out) tout, sum(cost_usd) usd from ai_run;
```

## 3. The original extrapolation, kept for comparison — NOT a measurement

The table below is what was computed on paper before anything ran. It is retained so the
gap against §1 stays visible: it predicted ≈$0.30 per engagement; measurement gives $0.10 on
the synthetic dataset (4 % of documents reach the model) and ≈$0.68 on the eval corpus
(29 % reach it, because it is deliberately full of scans). The prediction landed close on
the total while being wrong about the mechanism — it assumed OCR-per-page pricing and a
20-call drafting line, neither of which exists in the shipped path.

### Original extrapolation

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
