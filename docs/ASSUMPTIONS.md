# ASSUMPTIONS.md

Tagged register of load-bearing assumptions. [FACT] items live in the docs where used; this
file tracks what we are *assuming* and how each would be falsified. Updated at every stage.

| id | Assumption | Basis | Falsified by | Status |
|---|---|---|---|---|
| A1 | AuditBoard/Workiva serve the issuer side of SOX (management's 404(a) program), not the external auditor; external-auditor-side SOX component tooling is largely firm-internal | Market scan in verified context §3 | D13 research pass finding a shipped external-auditor SOX product | **Verify in D13** |
| A2 | EU-wide e-invoicing waves (ViDA) make the structured-XML extraction rung progressively dominant across the EU | ViDA direction of travel | D13: timeline materially slower than assumed | **Verify in D13** |
| A3 | PCAOB retention = 7 years from report release date, documentation completion within 45 days (AS 1215) [UNVERIFIED until D13] | Professional knowledge | D13 source check | **Verify in D13** |
| A4 | OE sample-size conventions per ADR-010 are close enough to common practice to ship as overridable defaults | Widely circulated AICPA-derived tables | D13 sanity check; pilot feedback | **Verify in D13** |
| A5 | Mid-size firms will accept a sidecar tool exporting workpapers into their audit file (D3) rather than demand full integration | Founder's practice experience; DataSnipper's success as a sidecar | Pilot feedback | Open |
| A6 | Clients (SME finance teams) will use a portal given email-native fallback exists | e-Recup/AUDITdrive adoption in France | Pilot feedback | Open |
| A7 | Deterministic vouching with tolerances covers the large majority of revenue evidence checks; LLM needed only for extraction/classification, not matching | Nature of invoice/GR/GL data | Build-time benchmark on synthetic + pilot data | Open |
| A8 | A per-mandate price of €150–600/yr is viable for the French independent-cabinet segment while per-engagement pricing scales for component/SOX work | H2A fee data (median PE fee ≈ €4,220) | GTM tests | Open (not build-relevant) |
| A9 | The synthetic dataset is representative enough that zero-false-negative detection on it is meaningful evidence of the engines' design | Seeded anomalies mirror real failure modes | Pilot on real (permissioned) data post-v1 | Open |
| A10 | PGlite supports all SQL used by the app (no extensions beyond core Postgres) | PGlite docs/maturity | Build-time failures → fall back to constraints in app layer | Open, monitored during build |
