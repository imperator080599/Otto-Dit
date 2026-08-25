# 10 — D13 research pass (single, timeboxed — executed 2026-08-25)

Method: parallel researchers on the four D13 questions; WebSearch worked, direct fetches to
several primary domains were egress-blocked, so findings rest on search-result content
quoting the primary texts, corroborated across independent sources. Items needing
re-verification before *publishing compliance-grade docs* are flagged. France facts from
the master context were not re-researched (final per D13).

## A. External-auditor-side SOX/ICFR tooling (→ A1)

- [FACT] **AuditBoard (SOXHUB)** and **Workiva** are issuer-side 404(a) SOX-program tools:
  scoping, RCMs, management testing, certifications by internal audit/SOX teams; external
  auditors appear only as viewers of evidence packages. (netwrix.com & vero-ai.com roundups;
  workiva.com/solutions/sox-compliance via search content, 2026-08-25)
- [FACT] **Fieldguide** is the closest firm-side product: AI "Field Agents" for scoping,
  evidence review and control testing in an engagement platform (top-100 US firms: CBIZ,
  CRI, Wipfli, BerryDunn…), but SOX positioning sits in *risk-advisory/co-sourced* work
  (SOC/SOX services), not a PCAOB AS 2201 integrated-audit methodology. [ESTIMATE on the
  latter — product pages partially unfetchable]
- [FACT] **DataSnipper** ships explicit external-audit test-of-controls use cases
  (extraction, matching, cross-referencing in Excel; used by Deloitte, Protiviti, GT) —
  mechanics only: no walkthroughs, sampling rationale, deficiency evaluation, engagement flow.
- [FACT] **Thomson Reuters Audit Intelligence** (2024) targets substantive testing; no
  controls/ICFR module announced. **CCH Knowledge Coach** = methodology content incl.
  PCAOB titles, no controls-testing automation. **TeamMate** = internal audit.
- Conclusion: **A1 confirmed with nuance** — no product packages the external-auditor ICFR
  workflow (walkthroughs → D&I → attribute testing → deficiency evaluation under AS 2201);
  nothing serves referred/component SOX work. Fieldguide is the competitor to watch; the
  differentiation seam is auditor-methodology depth + the integrated substantive/controls
  spine.

## B. PCAOB documentation rules (→ A3, pack config)

- [FACT] AS 1215.14: retention **7 years from report release date** (or fieldwork
  substantial completion if no report; or engagement cessation), longer if law requires.
- [FACT] AS 1215.15: assembly ("documentation completion date") was ≤45 days after report
  release; **amended to ≤14 days** by the AS 1000-related amendments. [ESTIMATE, converged
  across sources] Phase-in: >100-issuer firms FYs beginning ≥2024-12-15; all others
  ≥2025-12-15 — i.e. 14 days is the operative default for new engagements in 2026; a
  further-amended AS 1215 is posted effective 2026-12-15.
- [FACT] AS 1215.16: nothing may be deleted/discarded after the completion date; additions
  must record **date added, preparer name, reason** → OTTO's post-lock amendment record
  (Q2/ADR-014) matches this verbatim.
- [FACT] SEC Rule 2-06 Reg S-X: 7-year retention with **broader scope** — workpapers plus
  memoranda/correspondence/communications (incl. electronic) containing conclusions,
  opinions, analyses or financial data; [ESTIMATE] 2-06(c): records inconsistent with final
  conclusions must be retained → OTTO must never purge superseded analyses reflecting
  differing judgments (supersede-don't-delete already; add "inconsistent-record" retention
  flag to roadmap).
- [UNVERIFIED] AS 1215.18–.19 other-auditor documentation handoff before report release —
  professional knowledge; directly relevant to the component data model; verify before
  building the referral-reporting pack.

## C. EU e-invoicing / ViDA (→ A2)

- [FACT] ViDA = Council Directive (EU) 2025/516, adopted 2025-03-11, in force 2025-04-14;
  domestic EN 16931 mandates allowed without derogation immediately; **intra-EU B2B
  structured e-invoicing + near-real-time digital reporting from 2030-07-01**; legacy
  national systems converge by 2035-01-01.
- [FACT] Domestic wave: Italy live 2019 (FatturaPA/SdI); Romania 2024 (RO_CIUS); Belgium +
  Croatia 2026-01 (Peppol/EN 16931); Poland KSeF FA(3) 2026-02/04; Greece 2026-03/10
  (myDATA); **France 2026-09** (receive all + issue large/mid; SMEs 2027-09; Factur-X/UBL/
  CII via PDPs); Germany receive since 2025-01, issue 2027 (> €800k) / 2028 (all)
  (XRechnung/ZUGFeRD); Slovakia 2027; Spain slips to 2027–2028 (Verifactu postponed;
  Crea y Crece decree [ESTIMATE]); Latvia/Slovenia 2028.
- Conclusion: **A2 confirmed** — structured XML majority of EU domestic B2B invoice volume
  by end-2027, effectively all by end-2028. Extraction-ladder priority list: EN 16931
  UBL/CII, Factur-X/ZUGFeRD embedded XML, then FatturaPA, KSeF FA(3), RO_CIUS as country
  parsers with clearance-ID verification as an *evidence attribute* (a government-assigned
  invoice ID is itself audit evidence). **Honest scope note**: this covers invoice legs
  only — delivery notes, contracts, PODs, remittances stay on OCR rungs (gate 1 red-team
  correction stands).

## D. Citation verification

- [FACT] FRC "AI in Audit — Illustrative example and documentation guidance", **26 June
  2025**; documentation split central-repository vs audit-file; context-dependent
  explainability; accountability via ISQM (UK) 1 / ISA (UK) 220. Plus **March 2026
  "Generative and Agentic AI" factsheet** — cite both.
- [FACT] CNCC: "IA & Audit : Bonnes pratiques" fiches, June 2025 + advanced 2025/2026
  edition; systematized human supervision + traceable AI documentation (prompts, model
  version, human review) per NEP 500 + EU AI Act; model *charte IA* for firms.
  **Correction**: good-practice guidance, not a norme — soften any "CNCC requires review
  before the file" wording to "CNCC good practice expects systematized human review".
- ~~[FACT] France retention is 10 years (art. R.823-10)~~ — **RETRACTED 2026-08-26. This
  finding was wrong.** R. 823-10 is **abrogé** since 2024-02-01 and never carried a
  retention period; the ten-year sentence comes from the **2007 version of NEP 230**, out of
  date. The rule in force is **six years**, C. com. art. **R. 820-42** (décret 2023-1394,
  art. 9), with the file closed within **60 days** under art. **D. 821-186 III-IV**; NEP 230
  is now art. **A. 821-66**. Verified on the primary text at Légifrance by the founder — see
  ADR-014 rev. 2. This pass reached only search-result content quoting Légifrance, which
  returned a repealed provision verbatim and confidently: **a quoted citation is not a
  current one**.
- [ESTIMATE] OE sample-size tables are **not** codified (AS 2315 sets principles only);
  they are firm-methodology conventions attributed to the AICPA Audit Guide: Audit
  Sampling (public secondary sources: kfinancial.com, linfordco.com publish
  annual=1, quarterly=2, monthly=2–5, weekly=5, daily=25). ADR-010's defaults bracket
  these; present as "common practice derived from AICPA guidance", never as PCAOB/SEC
  requirements. Academic anchor: Christensen/Elder/Glover, *Accounting Horizons* 29(1)
  2015. Amended AS 2315 effective 2026-12-15 — re-check before citing sampling
  requirements for FY2027+.

## Applied to the repo

France 10y + PCAOB 7y/14d(45d legacy) → 03/04/06 + pack config; AS 1215.16 amendment
fields → lock design (already aligned); A1/A2/A3/A4 statuses updated; CNCC/FRC citations
corrected in 06; Factur-X claim scoped to invoice legs in 02; country-parser priority list
→ 05 roadmap.
