# DECISIONS.md — Architecture Decision Records

Format: {id · decision · alternatives considered · rationale · confidence H/M/L · how to
reverse}. Founder overrides asynchronously by editing this file. D1–D13 from the master
prompt are **accepted founder defaults** and are not restated; only deviations from them or
new decisions appear here.

---

## ADR-001 — Local runtime: PGlite (embedded Postgres) with Supabase-compatible SQL migrations

- **Decision**: The app runs locally on PGlite (Postgres compiled to WASM, file-persisted,
  zero external accounts). All schema lives in `supabase/migrations/*.sql` written in
  Postgres SQL that applies unchanged to Supabase in production; a small runner applies them
  to PGlite for local dev/demo/tests.
- **Alternatives**: (a) Supabase CLI local stack — requires Docker, unavailable/heavy in
  many environments, breaks "runs and demos locally without external accounts" in this
  container; (b) SQLite — diverges from Postgres SQL, would fork the migrations.
- **Rationale**: D7 keeps Supabase as the production target; local-first build rule demands
  a zero-dependency local runtime. PGlite gives real Postgres semantics with one npm package.
- **Confidence**: H. **Reverse**: swap the db adapter to `postgres`/supabase-js client;
  migrations are already Supabase-native. RLS policies ship in the migrations but are
  enforced in production (local demo runs as table owner; see ADR-007 and 06_SECURITY).

## ADR-002 — Extraction ladder gains a "PDF text layer" rung between XML and OCR

- **Decision**: Ladder = (1) structured e-invoice XML (Factur-X CII) → (2) embedded PDF text
  layer + deterministic field parsing → (3) external OCR adapter (Mistral OCR / Claude
  native, pluggable, mocked in tests) → (4) LLM extraction → (5) human verify below
  confidence threshold.
- **Alternatives**: original ladder XML → OCR → LLM.
- **Rationale**: most digitally-born PDFs carry an exact text layer; parsing it is free,
  deterministic and offline — it also lets the local demo run real extraction with zero API
  calls (D12 cost discipline).
- **Confidence**: H. **Reverse**: remove rung 2 from the ladder config; adapters are ordered
  config, not code structure.

## ADR-003 — Deterministic journal-entry risk flags in MVP; full JET module later

- **Decision**: The population/ledger analytics in S3 compute deterministic JE risk flags
  (weekend/holiday posting, round amounts, manual-journal source, period-end posting,
  unusual credit-note patterns). The full JET module (parameter workbench, L3 validation
  flow) is roadmap.
- **Alternatives**: full JET in MVP; no JET at all in MVP.
- **Rationale**: the acceptance dataset seeds a weekend round-amount manual JE and a
  credit-note pattern — the prototype must detect them (zero false negatives). Flags are
  cheap SQL; the full module competes with the wedge. France baseline JET exists free
  (SmartFEC+), so differentiation is follow-up + documentation integration, later.
- **Confidence**: H. **Reverse**: promote the flags UI to a full module in a later slice.

## ADR-004 — Partner chatbot rejected; provenance answer views instead

- **Decision**: No conversational UI in v1. The partner-question need is served by
  deterministic provenance views (S9: "why does this evidence exist / what supports this
  conclusion / where did this figure come from") and the dashboard.
- **Alternatives**: RAG chatbot over the engagement.
- **Rationale**: unsourced conversational answers feeding partner decisions are inspection
  poison and contradict the positioning ("no chatbot UI", 07_MVP_PRD UX principles).
  A future assistant, if any, must answer only with links into the traceability graph.
- **Confidence**: H. **Reverse**: add an assistant surface over the same provenance API.

## ADR-005 — UI: hand-rolled CSS design system, no component framework

- **Decision**: No Tailwind/MUI/etc. A small custom CSS system (tokens, layout primitives)
  in the Next.js app.
- **Alternatives**: Tailwind; shadcn/ui.
- **Rationale**: local-first and lean: fewer deps, faster installs, full control of the
  clean enterprise look (idea #16); the UI surface in MVP is bounded.
- **Confidence**: M. **Reverse**: introduce Tailwind incrementally; pages are plain React.

## ADR-006 — Demo auth: dev user-switcher (auditor side) + tokenized portal links (client side)

- **Decision**: Locally, auditor users are selected via a dev login switcher (no password,
  clearly labeled demo mode); the client portal uses per-contact magic tokens in URLs —
  the same mechanism production uses, minus email delivery. Production runbook (DEPLOY.md):
  Supabase Auth magic links for both sides.
- **Alternatives**: full Supabase Auth locally (needs external service or Docker stack).
- **Rationale**: local-first rule; the security model (roles, RLS, engagement membership) is
  still exercised because authorization checks run in the app's data layer either way.
- **Confidence**: H. **Reverse**: wire Supabase Auth session → same internal user identity.

## ADR-007 — Tenant isolation enforced in the data-access layer locally; RLS policies shipped for Supabase

- **Decision**: Every query goes through a data-access layer that scopes by tenant/
  engagement/audience (auditor vs client). The same predicates are expressed as Postgres RLS
  policies in the migrations for production enforcement on Supabase.
- **Alternatives**: rely on RLS only (unenforceable under PGlite single-role local mode).
- **Rationale**: defense in depth; the client-never-sees-audit-documentation guarantee (D6)
  must hold in the local demo too.
- **Confidence**: H. **Reverse**: n/a (production keeps both layers).

## ADR-008 — Dataset generator written in TypeScript inside the app workspace, output committed

- **Decision**: `dataset/` holds generated files + ANOMALIES.md; the generator is TypeScript
  (`app/scripts/dataset/`), run via `npm run dataset:generate`, deterministic from a fixed
  seed. Generated files are committed so the demo needs no generation step.
- **Alternatives**: Python generator; regenerate-on-demand only.
- **Rationale**: one toolchain (D7), deterministic seeds make the acceptance suite stable;
  committing outputs keeps the demo turnkey.
- **Confidence**: H. **Reverse**: regenerate with a new seed; ANOMALIES.md is emitted by the
  generator so docs and data cannot drift.

## ADR-009 — Inference & data residency (per verified context)

- **Decision**: Build on the Anthropic first-party API behind a thin provider-abstraction
  layer (`LlmClient` interface). Production inference switches per tenant market: AWS
  Bedrock EU (in-region/zero-retention modes) or Vertex EU for EU-resident engagements; US
  inference for US engagements. OCR adapters equally pluggable (Mistral OCR 3 default, Azure
  Document Intelligence alternative). The demo runs entirely on record/replay fixtures —
  zero live calls required.
- **Alternatives**: Bedrock-only (slower feature access), EU-only (blocks US market).
- **Rationale**: verified context §3; abstraction is cheap now, expensive later.
- **Confidence**: H. **Reverse**: implement another `LlmClient`; call sites are unchanged.

## ADR-010 — OE sample-size defaults (pack content, overridable)

- **Decision**: PCAOB/SOX pack ships frequency-based operating-effectiveness sample-size
  defaults commonly published in audit literature: recurring automated/annual 1, quarterly 2,
  monthly 2–3 (default 3), weekly 5, daily 20–25 (default 25), many-times-daily 25–40
  (default 25, risk-adjustable +15). Stored as overridable pack config with the basis
  logged; every deviation from defaults requires justification. [ASSUMPTION — conventions
  vary by firm; these are the widely circulated AICPA-derived tables, to be sanity-checked
  in the D13 pass.]
- **Alternatives**: statistical attribute sampling calculator (roadmap; overkill for MVP).
- **Confidence**: M. **Reverse**: edit pack config; sampling engine takes size as input.

## ADR-011 — Misstatement & deficiency objects created from day one; full evaluation workflows later

- **Decision**: Exceptions can be promoted to `misstatement` rows (factual/judgmental/
  projected; corrected/uncorrected) and deviations to `deficiency` rows (pack taxonomy) in
  MVP, with aggregation views; the full ISA 450 evaluation memo and SOX aggregation-to-MW
  reasoning stay L3-proposal + human conclusion, richer workflows roadmap.
- **Rationale**: without typed downstream objects the wedge's exceptions dead-end (assessment
  #21); full workflows are not needed to prove the loop.
- **Confidence**: H. **Reverse**: extend, don't restructure.

## ADR-012 — The L2 evidence contract (adopted from Gate 1)

- **Decision**: L2 is defined per extraction rung and per act, resolving the
  threshold-vs-ceiling ambiguity:
  1. **Rungs 1–2 (structured XML, PDF text layer)**: deterministic, L0/L1. Fields enter
     matching without per-item human verification; reliability is covered by (3).
  2. **Rungs 3–4 (OCR/LLM)**: in v1, **every** extracted item used in testing is
     human-verified in a side-by-side UI (source evidence + extracted fields); confidence
     scores order the queue (triage) and are **never a bypass**.
  3. **Verification spot-check control (machine-passed items)**: per procedure, a seeded
     random subsample of machine-PASSED sample items is re-performed blind by a human
     (`verification_check` rows: item, verifier, result, time spent). Result is part of the
     workpaper. This is the engagement-level tool-reliability control (ISA 500-shaped
     evaluation of the automated tool's output); the synthetic-dataset suite is build-time
     regression only, never reliability evidence.
  4. **Attribution**: workpapers state "Performed by OTTO engine run #… (adapters, params,
     evidence hashes) — Validated by [name, date]"; humans are validators/reviewers, not
     fictitious preparers.
  5. **Injection boundary**: untrusted document content reaches drafting prompts only via
     deterministic-match outputs (typed fields), never as raw text.
- **Rationale**: Gate 1 (audit partner + AI architect): the undefined L2 act made the hours
  claim and the safety claim mutually destructive; this contract makes the validation act
  explicit, priced, and inspectable.
- **Confidence**: H on structure, M on the spot-check default rate (pack config, default
  10% min 3). **Reverse**: relax rung-3/4 per-item verification only when a real-corpus
  calibration benchmark (A11/A12) justifies threshold-gated verification, per pack.

## ADR-013 — Export boundary contract (adopted from Gate 1)

- **Decision**: While OTTO runs alongside an incumbent audit file (D3):
  1. OTTO sign-offs constitute the **preparation and detailed-review record**; the
     incumbent file's final sign-off remains authoritative in v1.
  2. Export is a **terminal, versioned, hash-stamped event** (export id + content hash
     rendered on every page; logged in event_log).
  3. Exports are **self-contained for inspection**: embedded sample parameters (seed,
     method, population hash), per-item evidence references with sha256s, exception log
     with resolutions, modification history (workpaper_edit), review-note trail, sign-off
     block, and OTTO version — the archived artifact answers P7 without OTTO access.
  4. Re-export after review changes **supersedes**: new version carries a supersession
     notice naming the replaced export id; the founder's pilot kill-metric is review
     round-trip count per workpaper.
  5. OTTO content is treated as audit documentation (Q11 default): retention per pack
     applies to OTTO's own store regardless of the incumbent file.
- **Confidence**: H. **Reverse**: when OTTO becomes the file of record (v2+), sign-off
  authority flips by pack config; the export machinery remains for component reporting.

## ADR-014 — Lock & retention configuration (sources, verification status)

- **Decision**: pack config, engagement-overridable with justification.

### NEP/France — retention **10 years**, assembly lock report date + 60 days (config)

| Element | Reference | Wording relied on | Source consulted | Date |
|---|---|---|---|---|
| Obligation to constitute a per-entity audit file | **C. com., art. R. 823-10** (Légifrance id `LEGIARTI000048539934`) | "Le commissaire aux comptes constitue pour chaque personne […] un dossier contenant la documentation de l'audit des comptes" | legifrance.gouv.fr article page — **found via web search only** | 2026-08-25 |
| 10-year retention | Provision retaining "les dossiers et documents établis […] en application de l'article R. 823-10 […] **conservés pendant dix ans, même après la cessation des fonctions**" — carried today in the Book VIII regulatory part (the historical carrier, art. R. 821-27, is **abrogé**; the post-2023 recodification places the rule alongside art. R. 820-42, which sets a **6-year** period for a *different* set of documents — those established under R. 821-186 / R. 822-26) | verbatim clause above | search-result content quoting Légifrance + CNCC "Titre deuxième du livre VIII — partie réglementaire" (éd. sept. 2024) | 2026-08-26 |
| Documentation standard | **NEP-230** (arrêté du 10 avril 2007 portant homologation), documentation formalisée sur un support conservable pendant la durée légale de conservation | — | legifrance JORF listing | 2026-08-26 |

- **Verification status — read this before freezing the constant.** `legifrance.gouv.fr`,
  `doc.cncc.fr` and `pcaobus.org` are **blocked by this build environment's egress proxy**;
  every citation above was obtained from search-result content that quoted the primary text,
  not from the primary document itself. Two points genuinely need the founder's eye on
  Légifrance: (a) **which article now carries** the 10-year sentence after the 2023
  recodification of Book VIII, and (b) that the **6-year** period of art. R. 820-42 does not
  capture any part of the statutory audit file we retain. The 10-year figure itself was
  corroborated twice independently (Légifrance article text and an H2A sanctions decision,
  CS-2025-13, 2026-02); the previously carried "6+ years" was wrong and is corrected.

### PCAOB/SOX — retention **7 years**, documentation completion **≤ 14 days**

| Element | Reference | Wording relied on | Source consulted | Date |
|---|---|---|---|---|
| Retention 7 years | **AS 1215.14** | "retained for seven years from the report release date"; if no report is issued, seven years from the date fieldwork was substantially completed; if the engagement ceased, seven years from that date | pcaobus.org AS 1215 (search-result content quoting the paragraph) | 2026-08-26 |
| Completion date ≤ 14 days | **AS 1215.15 as amended** | "A complete and final set of audit documentation should be assembled for retention (i.e., archived) as of a date not more than **14 days** after the report release date (documentation completion date)" — reduced from 45 days by the amendments adopted with **AS 1000** (PCAOB release of **13 May 2024**) | pcaobus.org AS 1215 + AS 1000 adopting release (search-result content) | 2026-08-26 |
| No deletion after completion; additions must record date added, preparer, reason | **AS 1215.16** | verbatim requirement implemented as our post-lock amendment record | pcaobus.org AS 1215 | 2026-08-25 |
| Broader record retention (7 years, incl. correspondence and records inconsistent with final conclusions) | **SEC Rule 2-06 of Regulation S-X** (17 CFR 210.2-06) | 7-year retention of records relevant to the audit or review | sec.gov / law.cornell.edu (search-result content) | 2026-08-25 |

- **Verification status**: same egress caveat. A separate page "AS 1215 (effective on
  12/15/2026)" exists on the PCAOB site — confirm which version governs the engagement's
  fiscal year before shipping the tier logic. The 45-day legacy tier stays configurable per
  engagement (firm issuer-count tiering of the AS 1000 phase-in).

- **Confidence**: H on the figures (10y / 7y / 14d), **M on the exact French article number**
  post-recodification. **Reverse**: edit pack config (`docRules` in
  `app/src/lib/packs/*.ts`) — no code change, and the pack note renders the basis in every
  workpaper.

## ADR-015 — Kernel-first dataset contract (adopted from Gate 2)

- **Decision**: The deterministic kernel (gl_entry canonicalization + natural keys,
  population_hash canonical serialization, CoA→FSLI mapping, population builder + JE
  flags, materiality math, sampling engine both methods, vouching tolerance checks,
  misstatement projection math) is built as pure unit-tested libraries **before** any
  dataset bytes exist (slice C1a). The generator (C1b) imports that kernel, computes the
  real draw under pinned demo params (`dataset/demo-params.json`), places anomalies
  robustly (substantive anomalies pinned to deterministic strata — high-value or
  risk-flagged — wherever possible), and emits each evidence PDF together with its
  extraction fixture and an expected-exception manifest, so all fixtures co-move on
  regeneration. A placement-invariant test runs from C1 onward: recompute population →
  flags → draw with the current engine + pack config and assert every manifest
  anomaly/deviation is detectable — drift fails at the slice that caused it.
- **Rationale**: Gate 2 (CPO/CTO/engineer/red team convergent): committing an acceptance
  oracle before the semantics that define it exist guarantees late, cascading breakage.
- **Confidence**: H. **Reverse**: n/a — strictly safer ordering.

## ADR-016 — Re-import invalidation rule + audit-chain serialization

- **Decision**: (1) TB/GL re-import into an engagement with a drawn sample requires an
  explicit "invalidate downstream" confirmation: dependent samples are marked superseded
  (their tested items preserved and carriable via `carried_from_item_id` top-up draws),
  affected workpapers flip to `outdated`, and the cascade is event-logged. Silent
  cross-version provenance is impossible; the inspector question "the GL changed after the
  draw — why is this sample valid?" has a stored answer. gl_entry natural keys +
  `gl_entry_supersession` keep request/evidence links resolvable across versions.
  (2) Event-log hash chain: local PGlite writes are single-connection serialized; on
  Supabase the chain per engagement must be written through a serialized path (pg advisory
  lock per engagement id in the insert function) — documented for DEPLOY, verified by the
  chain-verification job/test either way.
- **Confidence**: H. **Reverse**: pack-level config could later allow "amend population"
  flows (delta reconciliation + top-up) without full supersession; schema already permits.

## ADR-017 — "Interroger" : traduction langage naturel → requête déterministe (rouvre ADR-004)

- **Contexte** : le fondateur rouvre la décision de rejet du chatbot. Le rejet de la prose
  libre est maintenu (une réponse hallucinée qui oriente le jugement de l'associé sur un
  dossier signé est indéfendable) ; mais ses exemples — « quelles sections ont des exceptions
  non résolues au-dessus du seuil ? », « quelles demandes ont plus de 10 jours de retard ? »
  — ne sont pas des jugements, ce sont des **requêtes**.
- **Décision** : une troisième voie, ni chatbot ni vue figée.
  1. **Catalogue fermé** de requêtes paramétrées (`app/src/lib/services/query/catalog.ts`) :
     chaque entrée = identifiant, libellé FR/EN, schéma de paramètres typés, SQL écrit à la
     main, colonnes de résultat, constructeur de liens.
  2. **Planificateur** : le LLM reçoit la question et le catalogue, et renvoie en sortie
     structurée `{templateId, params}` — **un identifiant du catalogue et des paramètres
     typés, jamais du SQL, jamais de prose**. Un planificateur déterministe (mots-clés +
     extraction de nombres/unités) sert de repli hors ligne et de garde-fou.
  3. **Validation** : `templateId` doit exister dans le catalogue ; chaque paramètre est
     validé contre son schéma (type, bornes, énumération). Toute violation ⇒ refus.
  4. **Exécution** : la plateforme exécute le SQL **du catalogue** avec paramètres liés.
  5. **Rendu** : toujours une table d'enregistrements stockés avec liens cliquables, plus la
     requête interprétée en clair (modifiable). **Jamais de phrase générée sur le fond.**
  6. **Refus explicite** : si aucune entrée du catalogue ne convient, le système répond
     « je ne sais pas traduire cette question en requête » et propose les questions voisines
     du catalogue. Il ne répond pas approximativement.
- **Ce que cela ne fait pas** : pas de conclusion, pas d'interprétation, pas d'agrégat
  inventé, aucun accès aux tables hors catalogue, aucune écriture.
- **Traçabilité** : chaque traduction est un `ai_run` (purpose `suggestion`, prompt versionné,
  hachage entrée/sortie) ; chaque exécution est un `event_log` (`nl_query_executed` avec
  templateId + params) ou `nl_query_refused`. L'associé voit donc *ce qui a été demandé à la
  base*, pas seulement la réponse.
- **Alternatives écartées** : (a) text-to-SQL libre — surface d'injection et requêtes
  invérifiables ; (b) RAG sur le dossier — ramène la prose non sourcée ; (c) statu quo (vues
  figées) — ne couvre pas les questions transverses, ce qui était l'objection.
- **Confiance** : H. **Réversible** : supprimer la page `/eng/[id]/ask` ; le catalogue reste
  utilisable comme vues.

## ADR-018 — Évaluation d'extraction sur corpus public et synthétique uniquement

- **Contexte** : le gate pré-pilote demandait un corpus de documents clients réels. Le
  fondateur écarte définitivement cette voie : secret professionnel et obligations
  contractuelles. La demande est retirée.
- **Décision** : la fiabilité d'extraction se mesure sur un **corpus public et synthétique**
  construit et versionné dans le repo (`app/scripts/eval/`), avec vérité terrain générée en
  même temps que les documents :
  - variantes de mise en page et de langue (FR, DE, ES, IT, EN), libellés et ordres
    différents, TVA multi-taux, pièces sans libellés ;
  - variantes « scan » : rendu bitmap sans couche texte, bruit poivre-et-sel, rotation,
    gradient de luminosité type photo, tracé irrégulier type manuscrit ;
  - métriques **par champ** : précision, rappel, F1, et **taux de faux positifs distinct sur
    les montants et les dates** (un montant faux avec confiance haute est le pire cas) ;
    plus latence, taux d'échec et coût par document par barreau.
- **Limite assumée et écrite dans le rapport** : un bitmap bruité rendu par nos soins n'est
  pas la photo d'une facture froissée. Le harnais mesure la **dégradation relative** entre
  barreaux et entre formats, pas une performance terrain absolue.
- **Évaluation sur documents réels** : uniquement chez un client pilote, dans son
  environnement, sur autorisation écrite, hors de ce repo. Ce n'est plus un pré-requis de
  construction mais une étape du pilote.
- **Confiance** : H. **Réversible** : n/a (contrainte du fondateur, non négociable).
