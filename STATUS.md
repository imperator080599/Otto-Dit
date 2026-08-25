# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Current state

- **Stage**: C complete — all slices S0→S10 + hardening built, tested and pushed.
  The two-part demo runs end-to-end. Feature work is stopped per the program contract.
- **Branch**: `claude/otto-audit-platform-whs17z`.
- **Suite**: 116 tests green (`cd app && npm test`), zero network calls. Prod build clean.

## Prouvé par exécution vs prouvé par test avec mocks

Le tableau ci-dessous est la réponse au retour #4. Rien d'autre dans ce dépôt ne doit être
lu comme « mesuré » s'il n'y figure pas.

| Affirmation | Statut | Établi comment |
|---|---|---|
| Le noyau déterministe (canonicalisation, sondage, seuils, projection, échelle de déficience, FEC) donne les bons résultats | **Prouvé par exécution** | 116 tests, dont la suite d'acceptation qui rejoue les anomalies semées par le générateur via le chemin applicatif réel |
| Les barreaux 1–2 (XML Factur-X, couche texte) extraient correctement | **Prouvé par exécution** | `npm run eval:extraction` : précision/rappel par champ sur un corpus que les parseurs n'avaient jamais vu |
| Le barreau 2 ne couvre **qu'une** mise en page | **Prouvé par exécution** | même eval : rappel 14,3 % sur l'ensemble du corpus, 100 % sur la mise en page FR canonique, 0 % sur DE/ES/IT/EN et sur toutes les variantes scannées |
| Les scans n'ont réellement aucune couche texte | **Prouvé par exécution** | test dédié : extraction de texte vide sur les 8 documents bitmap |
| La chaîne de hachage de l'event_log, les verrous documentaires, les exports auto-portants | **Prouvé par exécution** | tests S7/S9/S10 + acceptation |
| Les deux packs (NEP, PCAOB/SOX) tournent sur les mêmes moteurs | **Prouvé par exécution** | acceptation : mêmes services, contenu de pack différent |
| « Interroger » ne produit jamais de prose et refuse ce qu'il ne traduit pas | **Prouvé par exécution** | 13 tests, dont le rejet d'un plan proposant du SQL |
| Un adaptateur live refuse de tourner sans clé | **Prouvé par exécution** | `adapters.test.ts` |
| Le barreau 3 (OCR/LLM) extrait correctement | **Non établi** | l'adaptateur mock rejoue des fixtures : tout chiffre qui en sort décrit la fixture, pas un modèle |
| Coût réel par document et par mandat, latence, taux d'échec du barreau 3–4 | **Non établi** | aucun appel réel n'a jamais tourné : cet environnement n'a pas de clé (`401 x-api-key header is required`). Commande prête : `npm run cost:measure -- --budget=20 --yes` (ADR-019) |
| ≈ 0,30 $ par mandat | **Extrapolation** | arithmétique sur des prix et des parts de barreaux supposés (COST.md §3) |
| Le temps de vérification L2 (A11) | **Non établi** | chronométrage chez un pilote, pas mesurable sur corpus |

## Done

**Stage A** — docs/00 founder ideas (verbatim), 01 idea assessment (all 33 ideas judged +
capability sweep), 02 target concept; DECISIONS/ASSUMPTIONS/OPEN_QUESTIONS seeded.
**Gate 1** (6 lenses + red team) → ADR-012 L2 evidence contract, ADR-013 export boundary,
ADR-014 lock/retention; A8 reclassified kill-criterion; A11–A13 added.
**D13 research** — docs/10: SOX auditor-side gap confirmed; PCAOB AS 1215 (7y retention,
14d/45d completion); ViDA timeline; FRC/CNCC citations; **France retention corrected to
10 years**.
**Stage B** — docs/03 architecture, 04 data model, 05 integrations, 06 security/compliance,
07 MVP PRD + demo script, 08 backlog. **Gate 2** (6 lenses + red team) → ADR-015
kernel-first dataset contract, ADR-016 re-import invalidation; sample evaluation vs TE;
per-FSLI reconciliation gate; standing request items; engine_run + verification_run +
blind capture; S8a/S8b split.
**Stage C** —
- S0 scaffold: Next.js 15 + PGlite, migrations 0001–0007, hash-chained event log,
  append-only + documentation-lock triggers, packs, UI shell, dev auth + portal tokens.
- C1a kernel (pure, unit-tested) → C1b generator importing it: Altiverre FY2025 dataset
  (4 731-line FEC, TB N/N-1, 30 evidence PDFs incl. Factur-X, SOX RCM + listings, pinned
  demo params, extraction fixtures, generator-emitted ANOMALIES.md). Byte-identical
  regeneration verified.
- S1–S2 imports/reconciliation/FSLI/materiality/scoping · S3–S4 population/sampling/
  requests/portal/evidence/inbound · S5–S6 extraction ladder/vouching/exceptions/
  follow-ups/blind verification/sample evaluation · S7 workpaper engine (edits, notes,
  sign-offs, self-contained hash-stamped exports) · S8a–S8b SOX OE cycle (RCM, D&I gate,
  attribute sampling/testing, deviations, deficiency ladder, English OE workpaper on the
  same engine) · S9–S10 provenance answer views, event-log viewer, dashboard, audience
  tracker exports, demo:seed.
- Hardening: consolidated acceptance suite (zero false negatives, false positives
  enumerated — none), README, DEMO.md, DEPLOY.md, COST.md.
- **Retours founder (2026-08-25)** — docs/01 idea table (one row per idea, verdicts first);
  « Interroger » NL→requête déterministe sur catalogue fermé (ADR-017, page `/eng/[id]/ask`);
  harnais d'eval extraction sur corpus public/synthétique (ADR-018, `npm run eval:extraction`,
  docs/EVAL_EXTRACTION.md); adaptateur live + métrologie coût/latence/échec sous garde de
  budget (ADR-019, `npm run cost:measure`); docs/10_FALSIFICATION.md; ADR-014 réécrit avec
  références sourcées.

## Next actions (post-repo, founder-gated)

1. **Founder review item #1 — buyer intersection** (Gate 1): does an independent
   (non-network) component-auditor segment exist at buyable scale? A8 falsification test
   defined in ASSUMPTIONS; the six phone questions and their kill thresholds are in
   docs/10_FALSIFICATION.md.
2. **Founder review item #2 — run the AI layer once** (ADR-019): with a key and today's
   price list, `cd app && npm run cost:measure -- --budget=20 --yes`, then
   `OTTO_OCR_ADAPTER=anthropic npm run eval:extraction` to score rungs 3–4 against the
   corpus. Both rewrite their own reports. Nothing else in the repo is blocked on this.
3. **Founder review item #3 — retention references** (ADR-014): confirm which article now
   carries the French 10-year sentence post-2023 recodification, and that R. 820-42's
   6 years captures no part of the statutory file. The primary sites are unreachable from
   this environment; the citations came from search-result content quoting them.
4. Wire live inbound email transport (Q12) — the first deployment task.
5. Legal: secret professionnel / GDPR analysis + DPA (A13) before any real client data.
6. First fast-follows if the wedge holds: analytical review + auto variance questions,
   FS booklet tie-out, confirmations (D8).

## Open threads

- Standing logged objection (Gate 1): sidecar positioning (D3) caps the provenance moat at
  the export boundary — mitigated by ADR-013 self-contained exports; revisit at v2 if OTTO
  becomes the file of record.
- Acceptance-suite scope is deliberately narrow: build-time regression evidence about
  engine design, never extraction-reliability or tool-evaluation evidence (docs/09 Gate 1).
