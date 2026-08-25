# STATUS.md

**Resume protocol**: read this file and docs/, then continue from current state.

## Current state

- **Stage**: C complete — all slices S0→S10 + hardening built, tested and pushed.
  The two-part demo runs end-to-end. Feature work is stopped per the program contract.
- **Branch**: `claude/otto-audit-platform-whs17z`.
- **Suite**: 146 tests green (`cd app && npm test`), zero network calls. Prod build clean.

## Prouvé par exécution vs prouvé par test avec mocks

Mise à jour après exécution réelle de la couche IA (2026-08-25, 51 appels, 1,27 $ sur le
plafond de 20 $). Effectif indiqué à côté de chaque taux. Rien dans ce dépôt ne doit être lu
comme « mesuré » s'il ne figure pas ici.

| Affirmation | Statut | Établi comment |
|---|---|---|
| **Substance probante** : « resolved » exige explication verbatim + preuve liée + disposition | **Prouvé par exécution** | contraintes SQL (migration 0009) + tests : une résolution générique est rejetée par le service ET par la base |
| **Une anomalie chiffrée ne sort pas de l'accumulation sans disposition** | **Prouvé par exécution** | la double comptabilisation de 36 800 € reste dans le total ; anomalies connues 127 545,80 € |
| **Le dépassement de l'anomalie tolérable bloque la conclusion** | **Prouvé par exécution** | `concludeEvaluation` refuse sans `evaluation_response` enregistrée |
| **Le grand livre provisoire bloque la conclusion définitive et la clôture** | **Prouvé par exécution** | test archive : `closeFile` refuse tant que le FEC est provisoire |
| **Déficience : taux et nature avant montant ; extension à la population** | **Prouvé par exécution** | 3/3 → extension aux 12 instances → 25 %, natures sévères ⇒ material weakness |
| **Le rendu n'altère jamais son propre texte** | **Prouvé par exécution** | couverture lue dans la police ; un caractère non couvert fait échouer l'export |
| **Un export supprimé se régénère à l'octet près** | **Prouvé par exécution** | `export.test.ts` compare les octets du PDF stocké et du PDF re-rendu |
| **Le dossier scellé est autoportant et déterministe** | **Prouvé par exécution** | archive rejouable octet pour octet ; empreintes du manifeste re-vérifiées ; README sans script ni lien externe |
| **Les visas suivent la hiérarchie de revue** | **Prouvé par exécution** | trigger + service : un visa associé avant celui du reviewer est refusé |
| Le noyau déterministe (canonicalisation, sondage, seuils, projection, échelle de déficience, FEC) donne les bons résultats | **Prouvé par exécution** | 135 tests, dont la suite d'acceptation qui rejoue les anomalies semées par le générateur via le chemin applicatif réel |
| **Précision de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196 champs) sur le corpus d'eval — **0 montant faux sur 84 rendus, 0 date fausse sur 28 rendues** |
| **Rappel de l'extraction, tous barreaux** | **Prouvé par exécution** | 100,0 % (n=196). Avant ADR-021 : 14,3 % (n=196) sans le barreau modèle |
| **Barreau 3–4 (modèle) : précision, latence, taux d'échec** | **Prouvé par exécution** | 51 appels réels : précision 100 % (n=194 valeurs rendues), latence p50 ≈ 5,1 s, **échecs 0/51** |
| **Coût réel par document et par mandat** | **Prouvé par exécution** | 0,0240 $ par document au barreau modèle (n=1 sur le dataset, n=8 sur le corpus) ; **0,10 $ par mandat** (mix dataset, 100 doc.) à **0,68 $** (mix corpus, 29 % au modèle). COST.md §1 |
| Le barreau déterministe lit 20/28 documents du corpus, hors ligne et gratuitement | **Prouvé par exécution** | `npm run eval:extraction` : 71,4 % (n=28) au barreau gratuit, latence p50 **7 ms** |
| Le dictionnaire d'étiquettes s'étend par contenu, pas par code (ADR-021) | **Prouvé par exécution** | 6 mises en page (fr ×2, de, es, it, en) lues par un seul chemin de code ; tests de régression sur les deux collisions trouvées par l'eval |
| Une date ambiguë est refusée, jamais devinée | **Prouvé par exécution** | tests unitaires + eval : les seuls échecs du modèle avant ADR-021 étaient des abstentions, pas des valeurs fausses |
| Les scans n'ont réellement aucune couche texte | **Prouvé par exécution** | test dédié : extraction de texte vide sur les 8 documents bitmap |
| **Délais du dossier (60 j / 6 ans / échelonnement PCAOB)** | **Prouvé par exécution** | 11 tests sur `kernel/retention.ts` + service : citations et statut de vérification assertés, pas seulement l'arithmétique |
| La chaîne de hachage de l'event_log, les verrous documentaires, les exports auto-portants | **Prouvé par exécution** | tests S7/S9/S10 + acceptation |
| Les deux packs (NEP, PCAOB/SOX) tournent sur les mêmes moteurs | **Prouvé par exécution** | acceptation : mêmes services, contenu de pack différent |
| « Interroger » ne produit jamais de prose et refuse ce qu'il ne traduit pas | **Prouvé par exécution** | 13 tests, dont le rejet d'un plan proposant du SQL |
| Un adaptateur live refuse de tourner sans clé ; le défaut ne dépense rien | **Prouvé par exécution** | `adapters.test.ts` |
| Classification documentaire | **Prouvé par exécution, insuffisant** | 20/28 (71,4 %, n=28). Les 8 échecs sont les scans bitmap : aucun mot-clé à lire, ils partent au barreau modèle de toute façon |
| Rétention PCAOB (7 ans) et fenêtre AS 1215.15 | **[UNVERIFIED]** | pcaobus.org bloqué par le proxy : chiffres confirmés par le fondateur, **non relus sur texte primaire**. Marqué `unverified` dans le code, visible dans l'écran mandat |
| Le temps de vérification L2 (A11) | **Non établi** | chronométrage chez un pilote, pas mesurable sur corpus |
| Fiabilité sur **pièces clients réelles** | **Non établi, et ne le sera pas ici** | eval en environnement pilote, sur autorisation écrite (ADR-018) |

## Done

**Stage A** — docs/00 founder ideas (verbatim), 01 idea assessment (all 33 ideas judged +
capability sweep), 02 target concept; DECISIONS/ASSUMPTIONS/OPEN_QUESTIONS seeded.
**Gate 1** (6 lenses + red team) → ADR-012 L2 evidence contract, ADR-013 export boundary,
ADR-014 lock/retention; A8 reclassified kill-criterion; A11–A13 added.
**D13 research** — docs/10: SOX auditor-side gap confirmed; PCAOB AS 1215 (7y retention;
14d/45d completion, **phased in**); ViDA timeline; FRC/CNCC citations. Its France-retention
finding was **wrong and has been retracted** — the rule is **6 years** (C. com. R. 820-42)
with the file closed in **60 days** (D. 821-186 III-IV): ADR-014 rev. 2.
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
2. ~~Founder review item #2 — run the AI layer once~~ **DONE** (2026-08-25): 51 live calls,
   $1.27 of the $20 ceiling. Results in COST.md §1 and docs/EVAL_EXTRACTION.md; the recall
   strategy they forced is ADR-021.
3. **Founder review item #3 — PCAOB primary text** (ADR-014 rev. 2): AS 1215.14/.15/.16 and
   the 14-day phase-in are carried as **[UNVERIFIED]** — pcaobus.org is blocked from this
   environment. The French side is now verified on the primary text (6 years, R. 820-42;
   60 days, D. 821-186 III-IV) and corrected throughout.
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
