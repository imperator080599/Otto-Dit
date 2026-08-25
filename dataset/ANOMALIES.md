# ANOMALIES.md — the acceptance suite (generator-emitted, do not edit by hand)

Dataset: **Altiverre SAS FY2025** (fictional French subsidiary of Meridian Industrial
Group, Inc. — fictional US-listed parent). Seed `otto-altiverre-fy2025-v1`. 4727 FEC lines,
revenue 5,606,895.30 €, PBT 717,463.44 €. Pinned materiality: M 37,000.00 €,
PM 27,000.00 €, CTT 1,800.00 €, TE 27,000.00 €
(demo-params.json). **Every item below must be auto-detected — zero false negatives; false
positives are listed and triaged by the acceptance suite** (build-time regression evidence
only, per Gate 1: not extraction-reliability evidence).

## Substantive anomalies (NEP revenue cycle)

| id | What was seeded | Where it hides | Expected detection | Stratum |
|---|---|---|---|---|
| A1 | Same invoice booked twice (June + July), same invoice number and amount. | units: VE|VE-2025-0702|2, VE|VE-2025-0703|2 | duplicate_document | high_value |
| A2 | Goods invoice without any delivery note — client cannot provide it. | units: VE|VE-2025-0704|2 | missing_document | high_value |
| A3 | Invoice line: qty × unit price ≠ printed line total (1 800,00 € overbilling). | units: VE|VE-2025-0705|2 | price_mismatch | high_value |
| A4 | Delivery note shows 238 units delivered; invoice bills 260. | units: VE|VE-2025-0706|2 | qty_mismatch | high_value |
| A5 | Invoice dated 2026-01-06 recognized in FY2025 (entry 2025-12-31). | units: VE|VE-2025-0707|2 | cutoff | high_value |
| A6 | Round 50 000,00 € manual revenue JE posted on a Saturday (weekend + round + manual flags). | units: OD|OD-2025-0001|2 | manual_journal_flag | risk_flag |
| A8 | 3 credit notes to the same customer (C009) across the year — unexplained pattern. | units: VE|VE-2025-0710|1, VE|VE-2025-0711|1, VE|VE-2025-0712|1 | credit_note_pattern | risk_flag |
| A7 | TB credits 706000 by 25,000.00 € more than the FEC supports | tb_2025.csv vs FEC | reconciliation_diff (TB↔GL, account 706000) | reconciliation gate |

Notes: A6 surfaces through the deterministic JE risk flags (ADR-003) and enters the sample
as a risk-flag selection requiring an explanation; A8 surfaces as the credit-note-pattern
flag on customer C009 (3 credit notes). A1's two bookings share one evidence PDF — the
duplicate is detected both by sha256 dedupe and by duplicate invoice number across sampled
items.

## Control deviations (SOX OE cycle)

| id | Control | Instance | Expected deviation | Note |
|---|---|---|---|---|
| D1 | C-BR-01 | 2025-01 | missing_approval | Reconciliation prepared but never approved (Approved by empty). |
| D2 | C-BR-01 | 2025-06 | late_performance | Prepared 25 days after month end (requirement: ≤10 days). |
| D3 | C-BR-01 | 2025-06 | wrong_performer | Prepared and approved by the same person (SoD conflict). |
| D4 | C-BR-01 | 2025-09 | missing_evidence | No reconciliation could be provided for this month. |

Sampled instances (pinned seed): C-BR-01 → 2025-01, 2025-06, 2025-09;
C-REV-01 → 2025-W06, 2025-W11, 2025-W13, 2025-W31, 2025-W52. C-REV-01's sampled evidence is
clean (control concludes effective); one approval form is an unlabeled scan exercising the
OCR-mock + human-verify path.

## Placement robustness (ADR-015)

Substantive anomalies A1–A5 sit in the 100%-coverage stratum (each ≥ 1.1 × the pinned coverage cap of 2700000 cents), A6/A8 in the risk-flag stratum — detection is invariant to the random seed and to any coverage cap below the smallest anomaly amount. SOX deviations are placed inside the pinned attribute draw (seed otto-demo-sox-1); changing that seed re-draws other months and the deviations may fall outside the sample.

## Sampling record

Revenue population: 713 GL lines on 70x accounts,
population_hash `pophash-v1:489420a8686886179af7ddbf22723fd0c1611f28f06b5fe78c2761031acfed62`; coverage cap 27,000.00 €;
random size 4; seed `otto-demo-rev-1`;
16 units selected.
