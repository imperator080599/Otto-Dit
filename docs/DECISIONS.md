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
**Superseded in part by ADR-017** (2026-08-25): the rejection of free prose stands, but the
transverse-query gap it left is closed by « Interroger » — natural language translated into
a deterministic catalogue query, answered with stored records, never with prose.

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

## ADR-014 (rev. 2) — Documentation-file deadlines: sources, verification status, and the phase-in

**Status**: accepted 2026-08-25; **rev. 1 was factually wrong and is superseded** (2026-08-26).

### What rev. 1 got wrong, and why

Rev. 1 stated a **10-year** French retention period and attributed it to **C. com., art.
R. 823-10**. Both halves were wrong:

- **R. 823-10 is abrogé** since **2024-02-01**, and it never carried a retention period at
  all. Its successor is **art. D. 821-186**.
- The 10-year figure comes from the **2007 version of NEP 230**, long out of date.

The failure mode is worth recording because it will recur: rev. 1 was built from
search-result content quoting the primary text, because this environment cannot reach
legifrance.gouv.fr. Secondary sources return **repealed provisions with complete
confidence** — the quoted sentence was real, it was simply from a text no longer in force.
A citation that is verbatim is not thereby current.

### The rule, corrected

**France — commissariat aux comptes.** Verified on the primary text at Légifrance by the
founder (statutory auditor) on 2026-08-25.

| Rule | Value | Provision | In force since | Verification |
|---|---|---|---|---|
| Retention of the file | **6 years** | **C. com., art. R. 820-42** (décret n° 2023-1394, art. 9) | 2024-02-01 | **Primary text** (founder, Légifrance) |
| Closing the assembled file | **60 days** after report signature | **C. com., art. D. 821-186, III et IV** | 2024-02-01 | **Primary text** (founder, Légifrance) |
| NEP 230 | now codified | **C. com., art. A. 821-66** (arrêté du 28 décembre 2023): §09 = 60 days, §11 = six years, referring to R. 820-42 | 2024 | **Primary text** (founder, Légifrance) |
| ~~R. 823-10~~ | ~~—~~ | **abrogé au 2024-02-01**; carried no duration | — | — |

The 60 days is a **Code de commerce rule**, not merely doctrinal practice — rev. 1 called it
"pratique NEP-230/ISA 230", which understated it.

**PCAOB — issuer audits and referred component work.** `pcaobus.org` is blocked by this
environment's egress proxy, so **nothing below was read from the primary text in this
session**. The figures were confirmed and the phase-in supplied by the founder; every
PCAOB source is therefore carried as **[UNVERIFIED]** in the code as well as here, and must
be re-read against AS 1215 before it governs a real engagement.

| Rule | Value | Provision | Verification |
|---|---|---|---|
| Retention | 7 years from report release | AS 1215.14 | **[UNVERIFIED]** |
| Completion of documentation | **14 or 45 days — phased in**, see below | AS 1215.15 | **[UNVERIFIED]** |
| Post-completion additions | record date, preparer, reason | AS 1215.16 | **[UNVERIFIED]** |
| Broader record retention | 7 years | SEC Rule 2-06 | **[UNVERIFIED]** |

### Decision: the completion window is a function, not a constant

The 14-day period phases in by **fiscal year under audit** and **firm size**:

- fiscal years beginning **on or after 2024-12-15** for firms that issued **more than 100
  issuer audit reports in 2024**;
- fiscal years beginning **on or after 2025-12-15** for **all other firms**;
- before the applicable date, the legacy **45-day** period governs.

Modelling that as a constant would be wrong for most engagements for another year, so it is
`pcaobCompletionRule(fiscalYearStart, firm)` in `app/src/lib/kernel/retention.ts`. The
firm-level fact it turns on (`tenant.issuer_reports_2024`) is stored data; **null resolves
to the later phase-in**, because the conservative reading is the one that does not assume a
shorter deadline has already bitten.

### Decision: legal constants carry their provenance in the code

Every rule is a `LegalSource` — citation, enacting instrument, in-force date, what it
supersedes, verification status, who verified it and when. Consequences:

1. A pack **names a regime** (`docRules.ruleSet`), it does not restate a duration a decree
   can change under it. The human-readable basis note is **generated** from the sources, so
   the screen and the rule cannot drift apart.
2. `engagement.legal_basis` (migration 0008) stores which provision produced each stored
   date, so P7 answers "why does this date exist?" from stored facts.
3. `anyUnverified` is surfaced **in the UI**, not only in a comment: the engagement overview
   shows a warning while any governing provision is unverified.
4. Tests assert the **citations and the verification status**, not only the arithmetic —
   changing 6 back to 10 now requires changing a citation to make the suite pass.

### Standing rule

No legal or normative constant enters the code or the data model without reaching the
**primary text** and confirming it is **still in force**. Where the environment forbids it,
the constant is marked `[UNVERIFIED]` in the code and in the docs, never quietly asserted
from a secondary source.

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

## ADR-019 — Cost and extraction accuracy are measured, or declared unmeasured; never quietly extrapolated

**Status**: accepted (2026-08-25, founder retour #4)
**Context**: COST.md carried a $0.00 headline and a ≈$0.30/engagement extrapolation. Both
were true and both were misleading together: $0.00 meant *the AI layer had never run*, and
the $0.30 was arithmetic on assumed prices and assumed rung shares, sitting one heading away
from a number that looked measured. The founder's objection is correct: an unexecuted ladder
is not a cheap ladder, it is an unknown one.

**Decision**:
1. **Every quantitative claim carries its provenance**: *proven by execution*, *proven by
   test with mocks*, or *extrapolated*. STATUS.md and COST.md both carry that split as a
   table, and the words "measured" and "extrapolated" are never used interchangeably.
2. **A live adapter exists behind the existing interface** (`AnthropicDocAdapter`, forced
   tool use, native PDF input, no prose channel), metered into `ai_run` on every call:
   tokens, cost, latency, model, prompt id + version, input/output hashes.
3. **`npm run cost:measure`** runs the ladder end to end over the synthetic dataset with a
   live adapter and rewrites the measured block of COST.md with cost per document, cost per
   engagement, latency p50/p95, failure rate and the gap against the extrapolation. It
   refuses to start unless a live adapter is selected, its key is present, **today's token
   prices are supplied**, and `--yes` is passed; it aborts the moment cumulative spend
   reaches `--budget` (default $20).
4. **Prices are never hardcoded.** `rateFor()` returns zero unless the price list is given
   at run time. A build cannot invent a rate, and a dollar budget cannot be enforced against
   an invented one — so the run is refused rather than run blind.
5. **This environment cannot execute step 3**: it holds no vendor credential
   (`401 x-api-key header is required`). The blocked run is recorded verbatim in COST.md
   rather than papered over. The measurement is a founder action, not a missing feature.

**Consequences**: the $0.30 figure stays flagged as an extrapolation until someone runs the
command with a key. The guard rails mean the first live run costs at most the budget passed
to it. `OTTO_OCR_ADAPTER=mock` (the default) can never spend.

**Rejected**: hardcoding a price table (rates move, and a stale rate silently corrupts every
future cost figure); shipping an unrun adapter for a second vendor merely to look
multi-provider — an adapter that has never executed is a liability, so the second provider
stays a deployment task.

## ADR-020 — API credentials live in one ignored file, and never in a shell

**Status**: accepted (2026-08-25)
**Context**: the founder supplied a prepaid API key with a $20 hard ceiling and no
auto-recharge. Two risks, both realistic: committing the key, and *leaking billing* — an
exported `ANTHROPIC_API_KEY` is picked up by any Anthropic-aware tool in the same terminal,
so an agent's own model calls would silently drain the project's prepaid credits.

**Decision**:
1. The key lives in **`app/.env.local`**, mode 600, ignored at **both** the repo root and
   `app/`. Nothing else in the tree contains it; `git log --all -p` was searched for
   `sk-ant-api` before the first commit.
2. **It is never exported into a shell.** Next.js loads `.env.local` natively; the two
   measurement scripts call `loadEnvLocal()` and populate **their own process** only.
   Existing `process.env` values win, so a deliberate per-run override still works.
3. The adapter is chosen **per run** (`--adapter=anthropic`), never by a global export, so
   the default path (`mock`) cannot spend by accident. Logs print `keyFingerprint()` —
   length and last four characters — never the key.
4. **Token prices are runtime configuration** (`OTTO_PRICE_*` in the same file), never
   hardcoded (ADR-019).

**The budget guard is a bug detector, not a budget.** It is set to **$5** while the expected
spend of a full eval is ~$0.19 and of a cost run ~$0.02. Reaching $5 therefore means a loop
or a retry storm, not an expensive workload — the run aborts and says so instead of
continuing. The SDK client is constructed with `maxRetries: 1` for the same reason: the
default retry behaviour is the cheapest way to turn one bug into a bill.

**Consequences**: a fresh clone cannot spend anything until someone writes `.env.local`.
Measured spend for everything in this session: **$1.27** of the $20 ceiling.

## ADR-021 — Recall strategy: the deterministic rung grows by dictionary, never by parser

**Status**: accepted (2026-08-25). Supersedes the per-layout parsing approach in ADR-002.
**Context**: the first live eval settled the question the ladder had been ducking. Measured
on the 28-document corpus (rungs 1–2 only, no model):

| | Deterministic rungs alone | With the model rung |
|---|---|---|
| Recall | **14.3 %** (n=196) | **99.0 %** (n=196) |
| Precision | 100 % (n=28) | 100 % (n=194) |
| Wrong amounts | 0 of 12 returned | 0 of 84 returned |

Rung 2 scored 100 % on the one layout it was written for and 0 % on the other five. Its
recall is therefore a function of **how many parsers have been written**, i.e. O(layouts) of
code. The model rung, which had never seen any of these layouts or any of the four scan
degradations, reached 99 % at 100 % precision with **no code per layout at all**.

**The constraint**: the answer must stay maintainable as the number of layouts tends to
infinity. That rules out the obvious response — write more parsers.

**Decision**:
1. **No new per-layout parser code, ever.** The parser count is frozen. This is the
   maintainability invariant, and it is the reason the rest follows.
2. **The deterministic rung grows along one axis only: a label dictionary**
   (`app/src/lib/packs/labels.ts`) — field synonyms, document-type keywords and date-order
   markers, per language. Adding German is adding strings; it is **content, not code**
   (CLAUDE.md rule 9). One code path reads them all.
3. **Escalate rather than half-read.** The dictionary claims a document only if **every**
   required field for its type resolves. A partial deterministic read would silently give
   back recall the model rung already has.
4. **Abstain rather than guess.** `05/03/2025` is a different day in Lyon and in Chicago.
   The reader resolves a date only when the numbers settle it (a part > 12) or the
   document's own wording does, and the wording evidence must be **unanimous** — a
   bilingual page settles nothing and escalates. The model is instructed identically
   ("a wrong figure is far worse than a null"), and the eval shows it complies: every one
   of its failures was an abstention, never a wrong value.
5. **Everything else is the model rung**, which is layout-agnostic by construction, and
   whose output remains **always** human-verified (ADR-012 is untouched).

**Measured result of adopting it** (same corpus, same 28 documents):

| | Before | After |
|---|---|---|
| Recall | 14.3 % | **100 %** (n=196) |
| Precision | 100 % | **100 %** (n=196) |
| Wrong amounts / dates | 0 / 0 | **0 of 84 / 0 of 28** |
| Documents on the free rung | 4/28 | **20/28** |
| Document classification | 8/28 | **20/28** |
| Cost per 28-document run | — | $0.578 → **$0.189** |
| Latency p50 | — | 5 062 ms → **7 ms** |

**Two dictionary failure modes found by the eval, both now pinned by tests.** They are the
price of this design and the reason the escalation rule matters:

- `ust` (German VAT) matched **inside** `Customer`, so an English invoice read a buyer name
  as a VAT amount. Labels now match on **word boundaries**.
- The generic `Total` on a `Total HT` line claimed the gross amount before `Total TTC` was
  tried. Label specificity is now resolved **document-wide**, not line by line.

Neither produced a wrong figure in the file: rule 3 turned both into escalations. They cost
money, not correctness — which is the trade this design is built to make.

**Consequences**: cost scales with the share of documents no dictionary can read (scans,
photographs, handwriting) rather than with the number of layouts in circulation. Entry
sprawl is the new maintenance risk, and it is bounded by the two rules above plus the eval,
which re-measures precision on every run. A dictionary entry that starts stealing fields
shows up as an `fp`, and `fp` is the column an auditor cannot afford.

**Rejected**: writing a parser per layout (does not survive the constraint); sending
everything to the model (throws away a free, instant, offline rung that now covers 71 % of
the corpus); letting the dictionary return partial reads (trades recall for cost silently).

## ADR-022 — Le dossier clôturé : la base **et** un export scellé

**Statut** : accepté (2026-08-25, revue fondateur)
**Question posée** : (a) qu'est-ce qui constitue le dossier clôturé ? (b) que reçoit un
inspecteur H2A ? (c) que subsiste-t-il si le cabinet cesse son abonnement ?

**Décision** — la position par défaut du fondateur est retenue, avec une précision qui la
rend opérante : **les deux**, et l'un est une projection de l'autre.

1. **La base est la source de vérité vivante.** Le contenu des papiers de travail n'existe
   nulle part ailleurs qu'en enregistrements structurés (ADR-013). PDF, Word et Excel sont
   des **projections en lecture** : un export supprimé se régénère à l'octet près
   (`export.test.ts`, « a deleted export regenerates byte-for-byte from the database »).
2. **La clôture produit en plus un export scellé**, horodaté, autoportant et lisible sans
   la plateforme, dont l'empreinte est enregistrée (`file_archive`, migration 0009). Il
   contient : les papiers de travail **régénérés depuis les enregistrements** (jamais
   recopiés d'un fichier), toutes les pièces non mises en quarantaine, le journal
   d'événements avec sa chaîne de hachage, les anomalies, les déficiences, les visas, un
   `MANIFEST.json` (empreinte de chaque fichier, base légale des dates, état de la chaîne)
   et un `README.html` sans script ni lien externe.
3. **Ce que reçoit un inspecteur** : ce fichier scellé, dont chaque empreinte se recalcule
   hors ligne (`sha256sum`). Rien à installer, rien à demander au cabinet. Si l'inspecteur
   veut interroger le dossier plutôt que le lire, la base répond en plus — mais elle n'est
   pas nécessaire.
4. **Fin d'abonnement** : le scellé est autoportant **par construction**, précisément pour
   que la conservation de six ans ne dépende pas de la survie d'un contrat SaaS. La
   plateforme remet le scellé au cabinet ; l'obligation de conservation reste celle du
   cabinet, pas celle de l'éditeur. Un dossier non scellé à la résiliation doit l'être
   avant, ce qui est l'objet du délai de 60 jours (art. D. 821-186 III).

**Ce qui bloque la clôture** : `closeFile` refuse tant que la porte de conclusion n'est pas
ouverte — anomalie non traitée, évaluation non conclue, dépassement de l'anomalie tolérable
sans réponse enregistrée, ou **grand livre provisoire**. On ne clôture pas un dossier
audité sur un FEC provisoire.

**Déterminisme** : l'archive est une fonction pure de l'état stocké (`buildArchive`) —
entrées triées, horodatages issus de la date du rapport et jamais de l'horloge, requêtes
totalement ordonnées. Deux constructions du même état donnent les mêmes octets. Sceller à
nouveau **plus tard** produit une archive différente, et c'est correct : le scellement est
lui-même un événement du dossier.

**Rejeté** : le scellé seul (on perd la capacité d'interroger et la traçabilité vivante) ;
la base seule (la conservation six ans dépendrait d'un abonnement, et l'inspecteur devrait
utiliser l'outil de l'audité).

## ADR-023 — Le rendu accepte l'Unicode utile ; le chrome vient du pack

**Statut** : accepté (2026-08-25, revue fondateur)
**Contexte** : le PDF français imprimait « l?état des anomalies », « n?a été identifiée »,
« (? 25 000,00 €) », et le papier SOX anglais portait des annexes en français. Deux
instances avaient été corrigées une par une (le signe €, la ligne d'attribution). Le
fondateur a eu raison de refuser le correctif : c'étaient des **classes**, pas des
instances.

**Décision** :
1. **La police doit couvrir le contenu, pas l'inverse.** Une police Unicode est
   *vendorisée* dans le dépôt (`app/assets/fonts`, DejaVu Sans) — pas lue sur la machine
   hôte, sans quoi un export ne serait plus reproductible ailleurs. Rien n'est translittéré.
2. **Une substitution est une erreur, pas un repli.** La couverture est lue dans la police
   elle-même (`hasGlyphForCodePoint` ; `encodeText` **n'échoue pas** sur un glyphe absent —
   il dessine .notdef, ce qui est exactement la substitution silencieuse qu'on veut
   interdire). Un caractère non couvert fait **échouer l'export**. Un papier de travail qui
   modifie discrètement son propre texte n'est pas un papier de travail.
3. **Tout le chrome vient du pack** : titres d'annexes, ligne d'attribution, mentions
   « aucune », en-têtes — au même titre que le corps. Le moteur n'écrit plus une seule
   chaîne visible en dur.

**Effet immédiat** : le contrôle a refusé un export et découvert `⇒` (U+21D2), absent de la
première police retenue et jusque-là imprimé « ? » dans le papier SOX. La police a été
changée pour une police qui le couvre — dans ce sens-là.

## ADR-024 — Substance probante : trois issues, aucune générique

**Statut** : accepté (2026-08-25, revue fondateur — motifs bloquants 1 à 3)
**Contexte** : dix anomalies de six natures différentes portaient la même phrase
(« Réponse du client examinée et corroborée — traité »), une double comptabilisation de
36 800 € sortait de l'accumulation sans explication, et le papier constatait lui-même un
dépassement de l'anomalie tolérable avant de conclure quand même. Complet en apparence,
vide en substance : le mode de défaillance que le produit prétend éliminer.

**Décision** — une anomalie a exactement **trois** issues terminales, et deux d'entre elles
sont impossibles à atteindre sans substance (contraintes SQL, migration 0009) :

| Issue | Ce que le système exige | Effet sur l'accumulation |
|---|---|---|
| `resolved` | l'explication reçue **mot pour mot**, la conclusion d'audit, une **disposition**, et un **lien** vers la pièce ou l'écriture qui corrobore, plus qui a conclu et quand | sort de l'accumulation, avec sa preuve |
| `escalated` | une anomalie chiffrée à l'état des anomalies | entre dans connu + projeté |
| `scope_limitation` | ce qui n'a pas pu être obtenu, **les procédures alternatives mises en œuvre**, le montant exposé | ne prétend jamais être corroborée ; remonte dans la conclusion |

Une anomalie **chiffrée** ne peut pas être `resolved` sans disposition (`corrected`,
`no_misstatement`, `compensated`, `already_accumulated`) : c'est ce qui empêche 36 800 €
de disparaître. `already_accumulated` existe pour le cas de la double comptabilisation, qui
lève deux anomalies (une par écriture) alors que les comptes ne sont surévalués **qu'une
fois** — l'occurrence jumelle est close en le disant, liée à la même facture, ni supprimée
ni comptée deux fois.

**Dépassement de l'anomalie tolérable** : `concludeEvaluation` **refuse** tant que
`evaluation_response` n'enregistre pas une réponse — `extend_testing`, `revise_strategy` ou
`conclude_with_justification` — avec sa motivation. L'échantillon ne fournit plus une base
raisonnable de conclusion sur la population : on étend, on révise, ou on documente pourquoi
la conclusion tient malgré tout.

**Grand livre provisoire** : auditer un FEC provisoire est légitime ; conclure dessus
silencieusement ne l'est pas. `engagement.ledger_is_provisional` bloque la conclusion
définitive et la clôture, et la raison figure dans le papier.

**Conséquence mesurée sur le dossier de démonstration** : les anomalies connues passent de
36 330 € à **127 545,80 €** — non parce que le moteur a changé d'avis, mais parce que les
réponses du client admettent cinq anomalies dont aucune correction n'est comptabilisée à la
date du rapport. Le dossier ne conclut plus « rien d'autre à signaler ».

## ADR-025 — Déficience : le taux et la nature avant le montant ; extension obligatoire

**Statut** : accepté (2026-08-25, revue fondateur — motif bloquant 4)
**Contexte** : un contrôle clé de trésorerie testé sur 3 instances, 3 en échec — dont une
sans aucun justificatif et une où le préparateur avait approuvé sa propre réconciliation —
ressortait en simple « deficiency », parce que seule la magnitude décidait.

**Décision** :
1. **Le taux compte, et il compte en premier.** Un taux de déviation de 100 % sur un
   contrôle clé propose **material weakness par défaut** : le contrôle n'a pas fonctionné
   sur la période testée. La proposition se discute **vers le bas**, par une décision
   humaine motivée (`decideDeficiency` refuse une réduction sans motif écrit) — l'inverse
   de ce qui se passait.
2. **La nature compte.** Absence totale de justificatif et défaut de séparation des tâches
   sont des indicateurs qualitatifs : ils portent la proposition à *significant deficiency*
   au minimum, quel que soit le montant.
3. **On ne conclut pas d'un échantillon où rien n'est passé.** À 100 % de déviation,
   `control_test.extension_required` est posé et `proposeDeficiency` **refuse** de tourner :
   la population entière doit être testée (ou l'extension écartée avec motif). Le jeu de
   données générait deux réconciliations pour une population de douze, ce qui rendait
   l'extension vide de sens : il en génère désormais onze (le mois manquant restant la
   déviation semée).
4. **La magnitude dit d'où elle vient.** `deficiency.magnitude_basis` est obligatoire, et
   l'exposition est **dérivée de la balance** (trésorerie 512x pour le rapprochement
   bancaire, créances 411x pour la validation de crédit), non choisie. Les 15 000 € du
   papier précédent ne venaient de nulle part.

**Résultat sur le dossier de démonstration** : 3 instances → 3 déviations → extension aux
12 instances → 3 mois déviants sur 12 (25 %), natures `missing_evidence` et
`wrong_performer`, exposition = solde de trésorerie de clôture ⇒ **material weakness**
proposée et confirmée.

## ADR-026 — Naviguer par section d'audit, pas par fonction ; moteurs partagés

**Statut** : accepté (2026-08-25, revue fondateur — réorganisation du prototype, lot 1)

**Contexte** : le prototype cliquable était rangé par fonction — matérialité, scoping,
revue analytique, échantillonnage, test des écritures. Constat du fondateur, statutaire en
exercice : « un auditeur ne travaille jamais ainsi. Il ouvre UNE section — le chiffre
d'affaires — et y enchaîne évaluation du risque, périmètre des comptes, procédures,
sélections, requêtes, papiers de travail, conclusion. L'organisation actuelle est celle de
la machine, pas celle du travail. »

**Décision** :

1. **Les moteurs restent partagés ; c'est la navigation qui change.** Un seul calcul de
   seuils, un seul tirage d'échantillon, une seule revue analytique, un seul moteur de
   rapprochement. Ils sont appelés depuis les sections au lieu d'être exposés comme des
   écrans. Aucune duplication de logique par cycle : un pack de cycle reste du contenu.

2. **Trois espaces, distincts par construction et pas par filtrage.**
   - *Espace auditeur* : planification transverse (import et rapprochement, matérialité,
     scoping, test des écritures, circularisations, synthèse, piste d'audit, frontière
     déterministe/modèle) **puis une section de travail par poste retenu au scoping**.
   - *Portail client* : contacts, paramétrage, vue client.
   - *Pilotage* : avancement, exports, vue transverse des notes de revue.
   Le bandeau de seuils **n'est construit que dans l'espace auditeur**. Le client ne voit
   pas la matérialité parce que le composant n'existe pas dans son espace — ce n'est pas une
   case à décocher qui pourrait être décochée par erreur.

3. **Le scoping crée les sections.** Le rail de navigation est dérivé de
   `postesEnPerimetre()` : bouger le seuil de planification fait apparaître et disparaître
   des sections de travail. Vérifié : 18 sections à 1 %, 16 à 5 %, 15 à 9 %.

4. **L'évaluation du risque commande.** Facteurs *observés* (calculés sur le grand livre :
   volume, part d'écritures manuelles, saisies par la direction, validations postérieures à
   la clôture, concentration de décembre, variation N/N-1) et facteurs *déclarés* (jugement :
   estimation, fraude, contrôle interne, présentation, litige). Règle : 0 facteur → faible,
   1 → moyen, 2 et plus → élevé, **surchargeable par l'auditeur avec motif obligatoire**.
   Le niveau retenu détermine la liste des procédures requises et la taille du tirage
   aléatoire (6 / 15 / 30, table affichée à l'écran).
   Vérifié sur le chiffre d'affaires : élevé → moyen → faible fait passer les procédures de
   7 à 5 puis 3, et le tirage de 30 à 15 puis 6. **Deux leviers indépendants** : le risque
   commande le nombre tiré, la matérialité commande la strate exhaustive (209 → 85 → 13
   éléments à 1 %, 5 % et 10 %).

5. **Un questionnaire de risque qui ne commande rien est décoratif.** C'est la raison d'être
   du point 4 : la chaîne facteurs → niveau → procédures → échantillon → couverture est
   visible à l'écran et bouge sous la main.

**Conséquence de conception** : ajouter un cycle, c'est ajouter des entrées au catalogue de
procédures et éventuellement des facteurs observés — pas un écran, pas une route, pas un
moteur.

## ADR-027 — Le portail client est un environnement, pas une vue filtrée

**Statut** : accepté (2026-08-25, revue fondateur — lot 1)

**Contexte** : le prototype précédent réduisait « la vue client » à une case à cocher
masquant des colonnes. C'est un modèle de sécurité par omission d'affichage.

**Décision** :

1. **Statuts, mot pour mot ceux du fondateur** : « non reçu », « partiellement soumis »,
   « tout est déposé » (bouton actionné par le client), puis côté auditeur « en cours de
   traitement » et « en attente de revue par X ». Le dernier est marqué `client:false` dans
   la table des statuts et **replié** par `statutVisibleClient()` avant tout rendu côté
   client : le client ne peut pas déduire l'organisation ni l'avancement de la revue.
2. **Le bouton « tout est déposé » appartient au client** et ne s'active que lorsque chaque
   élément a reçu au moins un document. Sans ce signal, la demande reste partiellement
   soumise et n'entre pas dans la file de traitement — c'est exactement le mécanisme
   demandé pour ne pas faire perdre de temps à l'équipe.
3. **Chacun voit ce dont il répond.** Un contact voit les requêtes qui lui sont adressées ;
   seul le référent général voit l'ensemble. Un référent par section, avec repli explicite
   et signalé sur le référent général quand aucun n'est déclaré.
4. **Le fil de messages d'une requête est distinct des notes de revue.** Deux objets, deux
   fils, deux visibilités. Aucune note de revue ne transite par le portail.
5. **Vérifié automatiquement** : le corps de la vue client ne contient ni « en attente de
   revue », ni aucun nom de membre de l'équipe d'audit, ni bandeau de seuils, ni le mot
   « matérialité ». L'export « client » et l'export « auditeur du groupe » ne contiennent
   aucun nom de réviseur ; l'export « équipe interne » en contient, et c'est son objet.

## ADR-028 — Notes de revue : ancrage obligatoire, clôture par le réviseur, blocage réel

**Statut** : accepté (2026-08-25, revue fondateur — lot 1)

**Contexte** : le module de notes de revue précédent produisait des commentaires flottants,
clôturables par n'importe qui, sans effet sur rien.

**Décision** :

1. **Ancrage obligatoire.** Une note se pose **sur un objet** : compte de la section, ligne
   d'évaluation du risque, procédure, élément sélectionné, ligne de papier de travail,
   requête, conclusion. L'ancre est un paramètre de construction — il n'existe aucun chemin
   dans l'interface pour créer une note « sur la section ». Cliquer une note ramène à son
   objet et le surligne.
2. **Typage à quatre valeurs** : à corriger (bloquante) / à documenter / question /
   remarque pour N+1. **Seules les bloquantes empêchent le visa.**
3. **Le préparateur répond, seul le réviseur clôt — et jamais l'auteur de la note.**
   `peutClore(uid, note)` exige un rôle réviseur ou associé **et** `note.auteur !== uid`.
   Le bouton n'est pas masqué : il n'est pas rendu. Une note ne se supprime jamais.
4. **Blocage réel.** `obstaclesVisa()` liste les obstacles ; le bouton « viser la section »
   n'est pas rendu tant qu'il en reste un, et la clôture du dossier est refusée s'il
   subsiste une note bloquante ouverte, toutes sections confondues. Les obstacles couvrent
   aussi les pièces non reçues, les écarts sans explication, les surcharges de statut ou de
   niveau de risque sans motif, la conclusion non rédigée et les papiers N-1 non
   reconfirmés.
5. **Récurrence.** Une note portant sur la même section et du même type qu'une note de
   l'exercice précédent est marquée « récurrente ». C'est un signal de qualité obtenu par
   simple rapprochement, pas une anomalie de plus.
6. **Vue transverse par responsable, ancienneté, type et section** : c'est la vue de travail
   d'un chef de mission, et elle porte le compteur de jours ouvrés paramétré au portail.

## ADR-029 — Enchaînement : la règle crée la requête dans SA section

**Statut** : accepté (2026-08-25, revue fondateur — lot 1)

**Décision** : une règle qui se déclenche dans une section y crée une requête ; la requête
apparaît au portail client chez le contact qui répond de cette section ; le dépôt d'une
pièce rend testable la ligne de papier de travail correspondante ; l'écart relevé remonte à
la synthèse des anomalies. Deux enchaînements sont câblés et vérifiés de bout en bout :

- **Sélection → justificatifs.** Un bouton crée une requête portant un élément par écriture
  sélectionnée, avec la référence de l'écriture. Le dépôt marque la ligne « reçue », inscrit
  les noms de fichiers déposés et ouvre la saisie du montant relevé.
- **Revue analytique → explication.** Une variation qui dépasse le seuil en montant ou en
  pourcentage ouvre une requête d'explication portant la question composée.

**Ce qui reste humain, délibérément** : la lecture du montant porté sur la pièce. Le dépôt
rend le contrôle *exécutable* ; il ne remplit pas la colonne. Une ligne sans pièce ne porte
aucun contrôle et le papier le dit — c'est ce qui distingue une diligence d'un tableau
rempli. Dans l'application, l'échelle d'extraction propose une valeur qui reste à vérifier
(≈ 1 à 2 min par pièce) ; dans le prototype, il n'y a ni pièce ni modèle, donc rien n'est
lu.

**Horloge de mission** : simulée et déterministe (départ 15/03/2026 09:12, +7 min par
événement) pour que les horodatages du journal soient rejouables à l'identique. Le journal
est en ajout seul ; le chaînage par hachage appartient à l'application, pas au prototype,
et le prototype le dit.

## ADR-030 — Le registre des facteurs de risque : ce sont les constatations qui circulent

**Statut** : accepté (2026-08-25, revue fondateur — « le point qui est la thèse du produit »)

**Contexte** : après la réorganisation par section (ADR-026), la mécanique circulait — une
requête créait une ligne de papier. Constat du fondateur : ce n'est pas la mécanique qui doit
circuler, ce sont les **constatations**. « Si mon entretien avec le responsable du cycle vente
révèle un changement d'ERP, cela doit apparaître seul dans l'évaluation du risque du chiffre
d'affaires, des créances et des stocks — je ne dois pas le ressaisir. »

**Décision** :

1. **Le facteur de risque est un objet de première classe**, pas un champ d'une section.
   Il porte : source (procédure qui l'a levé, vue où la relire, référence précise), nature
   (qualitative / quantitative), description, FSLI **et assertions** touchés, statut
   (proposé / confirmé / écarté), motif, effet retenu sur le niveau de risque, auteur et
   horodatage de la décision.

2. **Candidats dérivés, décisions conservées.** Les candidats sont re-calculés à chaque
   rendu par les règles — ils suivent donc la matérialité et les seuils — tandis que la
   décision humaine est conservée par identifiant stable. Bouger un seuil ne perd jamais un
   arbitrage. C'est la propriété qui permet de régler les seuils en cours de mission.

3. **Rien ne s'applique sans décision humaine.** Un facteur proposé est affiché dans la
   section concernée mais ne compte pas dans le niveau de risque. Seul un facteur *confirmé*
   et *retenu comme majorant* entre dans `facteursActifs()` et fait donc bouger le niveau,
   les procédures requises et la taille d'échantillon. Confirmer **en neutralisant** exige un
   motif, écarter aussi. Un facteur écarté sans motif écrit **ne compte pas comme statué**.

4. **Un facteur non statué bloque le visa** de chaque section qu'il touche, au même titre
   qu'une note bloquante ou qu'une pièce manquante.

5. **Une constatation, un facteur.** L'identifiant est keyé sur la constatation métier, pas
   sur la section : une pièce datée hors exercice qui touche le chiffre d'affaires et les
   créances est **un** facteur à deux cibles, pas deux facteurs au même texte. Même règle
   pour la facture comptabilisée deux fois, qui porte le même marqueur sur deux écritures.

6. **Vue de triage unique** — point d'entrée du dossier, pas des facteurs éparpillés : tous
   les facteurs proposés, par section, par source, par ancienneté, avec le lien retour vers
   la procédure qui les a levés.

### Le garde-fou, et ce qu'il a coûté

Le fondateur a posé la contrainte avant de voir le code : « si chaque analyse se met à lever
des facteurs, je noie. C'est le défaut classique des outils d'analyse de données en audit —
trois cents alertes que personne ne lit. » Chaque règle porte donc un **seuil de pertinence
explicite, nommé, modifiable en cours de mission**, le compteur est affiché en permanence
dans le bandeau supérieur, et la vue de triage alerte au-delà de quinze.

La règle « écritures saisies par la direction » a exigé trois formulations, et le chemin
mérite d'être conservé parce qu'il dit ce que vaut le garde-fou :

| Formulation | Facteurs levés |
|---|---|
| « la direction a saisi ≥ 5 écritures sur le poste » | 8 — un par poste, du bruit |
| « … pour un cumul ≥ seuil de planification » | 13 — pire |
| « … et porteuses d'un second marqueur (OD, week-end, montant rond, validation tardive) » | 11 |
| **« … pesant ≥ 5 % de la masse du poste, plancher au seuil de remontée »** | **1** |

En regardant la distribution : douze postes entre 11 k€ et 244 k€, **aucune coupure
naturelle**. Il n'existait pas de seuil absolu défendable, parce que le générateur attribue
la saisie par la direction au hasard (62 écritures sur 1 605, 3,9 %, réparties partout) :
**il n'y a aucune concentration à trouver dans ce jeu de données**. Choisir un montant qui
« donne trois facteurs » aurait été régler le nombre et non le critère. Le critère qui a un
sens est **relatif** — la direction pèse-t-elle sur ce poste une part anormale de sa masse ?
La vue de triage affiche explicitement qu'une règle qui ne lève rien n'est pas une règle
cassée, et invite à baisser le seuil pour voir le compromis.

**Résultat mesuré** : **8 facteurs** au réglage par défaut (2 écarts de rapprochement,
1 concentration d'écritures de direction, 1 pièce hors exercice, 3 écritures particulières,
1 compte hors listing de circularisation), pour une cible de 15. Le seuil est un levier réel
et monotone : la règle « direction » passe de 1 facteur à 5 % à 10 facteurs à 1 %.

**Ce que le mécanisme prépare** : l'entretien de cycle, l'analyse des balances auxiliaires et
l'analyse sectorielle lèveront leurs constatations **par cette même porte**, avec leur source.
Le chemin manuel — lever un facteur à la main, avec sa source libre, sur plusieurs postes et
plusieurs assertions — est déjà le chemin qu'ils emprunteront ; il est implémenté et testé.

## ADR-031 — La sélection appartient à la procédure, pas à la section

**Statut** : accepté (2026-08-25, revue fondateur)

**Contexte** : après ADR-026, une section portait une sélection et un papier. Un réviseur ne
pouvait donc pas savoir quelle sélection nourrissait quel test — et le catalogue de preuve
(ADR-032), keyé FSLI × assertion × **procédure**, n'avait aucun objet sur lequel accrocher ses
colonnes. Construire le catalogue sur la structure précédente aurait signifié le refaire.

**Décision** : la procédure est l'unité de travail. Chaque procédure requise porte sa
population, son unité d'échantillonnage, son germe, son papier de travail et sa conclusion.
Une sélection affiche, faute de quoi elle n'est pas revoyable :

- la **population définie à l'écran** — numéros de comptes visibles, période, filtre appliqué
  en toutes lettres, nombre d'éléments, masse ;
- l'**unité d'échantillonnage** (écriture comptable, tiers à circulariser) ;
- la **procédure servie** et l'**assertion visée** ;
- la **méthode**, le **seuil de la strate exhaustive**, le **germe** ;
- la **référence du papier de travail** alimenté.

En tête de section, un **plan de travail** : procédure → assertion → population → sélection →
papier → statut. C'est la vue qu'un réviseur ouvre en premier ; les procédures s'ouvrent une à
une depuis cette table. Effet secondaire mesuré : le rendu d'une section passe de 56 ms à
21 ms, une seule procédure étant construite à la fois.

**Populations réellement distinctes** : le test de détail porte sur la population entière du
poste ; la séparation des exercices sur les dix jours encadrant la clôture ; l'examen des
écritures manuelles sur le journal d'opérations diverses et les saisies de la direction ; le
recalcul sur les mouvements au-dessus du seuil de remontée ; la circularisation sur les tiers
auxiliaires, avec une unité d'échantillonnage différente. Sur le chiffre d'affaires : 268, 15,
10 et 268 éléments selon la procédure — ce ne sont pas quatre vues de la même liste.

## ADR-032 — Catalogue de preuve : la méthode livrée avec l'outil

**Statut** : accepté (2026-08-25, revue fondateur)

**Contexte** : le tableau de testing arrivait vide. « C'est l'actif le plus précieux du
produit : un cabinet sans département méthodologie achète la méthode avec l'outil. »

**Décision** : un catalogue livré, keyé `FSLI/PROCÉDURE` avec repli générique `*/PROCÉDURE`.
Chaque entrée déclare les **types de justificatifs attendus**, et pour chaque type les
**champs à relever**, la **donnée de référence contre laquelle le champ est contrôlé**, la
**règle de contrôle** et la **tolérance**. Exemple du test de détail sur le chiffre d'affaires :
facture de vente (montant HT contre la ligne du grand livre ; date contre l'exercice ; client
contre le compte auxiliaire ; numéro contre la référence de pièce) et bon de livraison
(quantité contre la quantité facturée ; date antérieure ou égale à la clôture ; signature
exigée).

**Ce que le catalogue câble** :
1. Les **colonnes du papier de travail** en découlent : une ligne par élément × document ×
   champ, avec la valeur relevée à côté de la donnée qu'elle contrôle, l'écart et la tolérance.
2. La **requête client est générée** depuis le catalogue : chaque élément nomme les documents
   attendus, et la requête porte la liste des champs qui y seront relevés. Le client n'a plus à
   deviner ce qu'on lui demande.
3. Une ligne sans pièce ne porte aucun contrôle — la règle d'ADR-029 tient, au niveau du champ.

**Une règle de contrôle n'est pas une égalité.** Premier jet : « date de facture » comparée à
la date de comptabilisation, tolérance exacte. Résultat, une facture datée du 5 et comptabilisée
le 8 — c'est-à-dire une facture normale — ressortait en écart. Chaque champ déclare donc sa
règle : *dans l'exercice*, *antérieure ou égale*, *même exercice que la référence*, ou une
tolérance en jours. Sur le jeu d'essai, les écarts relevés passent de 3 à 1, et celui qui reste
est un vrai écart de montant.

**La lecture des pièces reste humaine.** Un bouton « remplir comme si vous lisiez les pièces »
peuple les champs depuis les données synthétiques, et dit ce qu'il est : le prototype ne
contient aucun document, et la lecture d'une pièce relève de l'échelle d'extraction.

## ADR-033 — Trois moments de revue analytique, deux masses, un espace d'achèvement

**Statut** : accepté (2026-08-25, revue fondateur)

1. **Revue analytique : trois diligences, pas trois affichages.** *Préliminaire* en
   planification, transverse, avec ratios calculés des deux exercices, requête d'explication
   par ligne (texte composé, destinataire pré-rempli depuis le portail) et **alimentation du
   registre des facteurs de risque**. *Substantive* dans la section, comme procédure à valeur
   probante. *Finale* à l'achèvement, cohérence d'ensemble avant signature.

2. **Bilan et compte de résultat**, avec double appartenance assumée : stocks, provisions et
   dotations aux amortissements figurent dans les deux masses, marqués « aussi ». Le classement
   n'est pas binaire et le rail ne le force pas.

3. **Espace achèvement** — il n'existait aucun endroit où finir une mission : pointage des
   états financiers, revue analytique finale, événements postérieurs, continuité
   d'exploitation, évaluation finale des anomalies et incidence sur l'opinion, lettre
   d'affirmation, communication à la gouvernance, assemblage et clôture. La clôture **refuse**
   tant qu'une section n'est pas visée, qu'une note bloquante est ouverte, qu'un facteur n'est
   pas statué, que l'opinion n'est pas arrêtée ou qu'un point de diligence manque. Le délai
   d'assemblage (60 jours, *C. com., art. D. 821-186, III et IV*) et la durée de conservation
   (6 ans, *C. com., art. R. 820-42*) sont ceux vérifiés sur le texte primaire lors des travaux
   de rétention.

4. **Pointage : trois natures de rapprochement**, parce que supposer que tout vient de la
   balance ferait échouer le module sur la majorité des annexes — *solde de balance*,
   *agrégat de comptes*, *calcul à documenter*. Sur onze montants, trois ne se lisent dans
   aucun solde : ils se saisissent avec la documentation de leur origine, et restent non
   rapprochés tant qu'elle manque.

5. **Filtres cumulables** sur les requêtes, des deux côtés : statut, section, destinataire,
   échéance (en retard / à venir), recherche texte. Le portail client n'expose que les statuts
   qui lui sont visibles.

6. **Classeur multi-feuilles** (SpreadsheetML, sans dépendance) : une feuille par section plus
   une feuille de synthèse portant l'avancement et « qui doit quoi ». Trois périmètres de
   colonnes ; vérifié : seul l'export « équipe interne » cite un réviseur. L'envoi périodique
   est **composé** — destinataires réels choisis parmi les contacts du portail, objet, corps,
   pièce jointe — et s'arrête là : ce fichier n'a ni serveur ni transport sortant.

7. **La pédagogie se replie.** Chaque règle de conception s'exprime une fois, sous forme de
   statut, de compteur ou de pastille ; sa justification vit dans une page « Principes de
   conception » consultable à part. Les encadrés didactiques passent de 47 à 29, et les 29
   restants sont fonctionnels — obstacles au visa, blocages, compteurs — non explicatifs.

**Le garde-fou s'est refermé une deuxième fois, de la même façon.** La règle de levée depuis la
revue analytique préliminaire, d'abord écrite « variation ≥ 3 × le seuil de planification »,
levait cinq facteurs dont une **hausse de 1,7 % du chiffre d'affaires** : sur un compte de 5 M€,
trois fois le seuil est un mouvement ordinaire, et le multiple absolu ne mesure que la taille du
compte. Réécrite en **déformation relative** — montant au moins égal au seuil de planification
ET variation d'au moins 25 % du solde N-1 — elle lève un seul facteur, sur le compte bancaire
qui bouge de 39 %. Registre total : **9 facteurs** pour une cible de 15.

## ADR-034 — L'étendue des travaux suit l'assertion, pas le poste

**Statut** : accepté (2026-08-25, revue fondateur — troisième signalement)

**Contexte** : `tailleEchantillon(p)` appelait `niveauMax(p)`, le risque le plus élevé du poste
toutes assertions confondues. La refonte par procédure (ADR-031) avait fait de la procédure
l'unité de travail sans en tirer la conséquence méthodologique : sur le chiffre d'affaires, le
test de séparation des exercices recevait la taille d'échantillon de l'exhaustivité. Le point
avait été signalé trois fois et n'avait jamais figuré dans une déclaration d'omissions.

**Décision** : une procédure répond à UNE assertion ; les deux tables d'étendue s'appliquent
au niveau de risque de cette assertion.

| Risque de l'assertion | Tirage aléatoire | Seuil de la strate exhaustive |
|---|---|---|
| faible | 6 | seuil de planification |
| moyen | 15 | moitié du seuil de planification |
| élevé | 30 | tiers du seuil de planification |

Plus le risque est élevé, plus le seuil descend, donc plus d'éléments sont couverts un par un.
Les deux tables sont affichées dans le bloc d'évaluation du risque, avec le niveau retenu par
assertion et les procédures qu'il commande. **Une section porte des échantillons de tailles
différentes, et c'est normal.** Conséquence mesurée sur le chiffre d'affaires : la strate
exhaustive du test de détail passe de 85 à 148 éléments — c'est le prix de la règle, pas un
effet de bord.

## ADR-035 — Un test unidirectionnel doit le dire ; une population annoncée doit être testée

**Statut** : accepté (2026-08-25, revue fondateur)

**Contexte** : le filtre de séparation des exercices était `e.date >= CUTOFF_DEB`, sans borne
haute, sur un grand livre qui s'arrête au 31/12/2025. La procédure ne pouvait donc trouver que
des opérations de 2025 relevant de 2026 ; la période affichée annonçait pourtant « du
21/12/2025 au 10/01/2026 ». La population déclarée était plus large que la population testée.

**Décision** : le filtre est borné à ce qui existe (21/12/2025 au 31/12/2025), la période
annoncée est celle qui est testée, et la limitation est écrite sur le papier :

> Sens couvert : opérations comptabilisées en 2025 dont le fait générateur relève de 2026. Le
> sens inverse exige le grand livre de l'exercice suivant, indisponible à la date de ces
> travaux. Le test est donc unidirectionnel et ne fonde aucune conclusion sur l'exhaustivité du
> rattachement.

Une pastille « unidirectionnel » figure au plan de travail. Un test de séparation des exercices
est bidirectionnel par nature ; s'il ne l'est qu'à moitié, le papier le dit.

## ADR-036 — Le taux d'anomalie du jeu d'essai est un paramètre, pas un artefact

**Statut** : accepté (2026-08-25, revue fondateur)

**Contexte** : `pieceSynth` produisait les écarts par modulos premiers sur l'empreinte de la
référence de pièce — `h % 17` pour les montants, `h % 23` pour les quantités, `h % 31` pour les
signatures. Le taux n'était pas décidé, il tombait : environ **6 % de factures au montant faux**,
soit le portrait d'une entreprise en perdition et un contre-argument en démonstration
commerciale.

**Décision** : cinq taux déclarés, réalistes, avec leur base, leur motif métier, et des pièces
**nommément désignées** — retenues à la construction du jeu de données pour couvrir plusieurs
journaux, plusieurs tiers et plusieurs ordres de grandeur. Aucun écart ne provient d'une
fonction du numéro de pièce.

| Anomalie | Base | Taux visé | Pièces posées |
|---|---|---|---|
| Montant de la pièce ≠ montant comptabilisé | 1 598 écritures | 1,00 % | 16 |
| Quantité livrée < quantité facturée | 323 ventes | 1,24 % | 4 |
| Bon de livraison non signé | 323 ventes | 1,55 % | 5 |
| Livraison postérieure à la clôture | 323 ventes | 0,62 % | 2 |
| Taux appliqué hors barème | 1 598 écritures | 0,50 % | 8 |

Chaque pièce porte un **motif écrit** (avoir de fin d'exercice non comptabilisé, livraison
partielle, bon signé par un intérimaire non habilité…) et un **delta écrit**, pas calculé. Une
vue « Jeu de données » affiche le taux visé, le taux constaté et signale toute divergence entre
la cible déclarée et les pièces réellement posées. Effet mesuré : sur les 163 éléments du test
de détail du chiffre d'affaires, 8 écarts sur 1 141 contrôles, soit **0,61 % de factures au
montant faux** contre 6 % auparavant.

## ADR-037 — Le travail est l'objet unique de la mission ; l'achèvement est une phase

**Statut** : accepté (2026-08-25, revue fondateur)

1. **Un seul objet.** « Détermination de la matérialité », « test de détail sur le chiffre
   d'affaires » et « événements postérieurs » sont trois instances du même objet : code,
   nature, intitulé, rattachement, assertion, préparateur, réviseur, niveau de revue exigé,
   échéance, heures budgétées, heures réalisées, statut, référence du papier. Les procédures
   d'ADR-031 sont **migrées**, pas dupliquées : leur casier d'exécution reste dans `proc()`,
   leur casier d'organisation vit dans `trav()`. 106 travaux : 7 de planification, 91 de
   section, 8 d'achèvement. Le **programme de travail** est la liste, filtrable et imprimable.

2. **Responsabilités, en règles refusées par le système.** Préparateur et réviseur sont
   obligatoirement deux personnes différentes. Le niveau de revue **découle du risque** : une
   procédure sur une assertion « élevé », une section à risque « élevé », la matérialité,
   l'opinion et la clôture appellent une revue de second niveau — et un travail de niveau 2 ne
   peut être revu que par un associé. Un travail passe « achevé » par son préparateur seul,
   « revu » par son réviseur seul, et jamais avant d'être achevé. Un travail sans préparateur
   ou sans réviseur est un **obstacle au visa** de sa section.

3. **Heures.** Budget proposé par un barème affiché (base + heures par élément sélectionné),
   modifiable travail par travail parce que c'est une décision ; réalisé saisi. Agrégation par
   phase, par section et par personne, avec l'écart. La plateforme mesure ainsi sa propre
   proposition de valeur : 343,75 h de budget sur cette mission, ventilées.

4. **Correction de structure : l'espace « achèvement » est supprimé.** Les trois espaces sont
   trois **audiences** — auditeur, client, pilotage — avec des droits distincts. L'achèvement
   est une **phase** : en faire un espace mélangeait deux axes, la preuve étant que la
   planification, phase elle aussi, vivait déjà dans l'espace auditeur. L'espace auditeur porte
   désormais le dossier entier ordonné par phase : Dossier · 1 Planification · 2 Contrôle
   interne · 3 Bilan · 4 Compte de résultat · 5 Achèvement.

5. **Vue globale de la mission**, dans l'ordre des questions d'un chef de mission : avancement
   par phase puis par section, **charge par personne** avec détection de surcharge, notes de
   revue par destinataire et ancienneté, facteurs non statués, demandes clients en retard par
   contact, obstacles au visa agrégés avec le chemin vers chacun, jalons avec décompte.
   Exportable dans les trois périmètres, imprimable.

## ADR-038 — Système visuel : jeu de jetons fermé, la couleur ne signale que les problèmes

**Statut** : accepté (2026-08-25, revue fondateur — lot design)

**Diagnostic accepté** : le prototype avait huit rayons de bordure, quatre accents dont un
violet d'information, la pile de polices système, et une pastille pastel sur chaque cellule
d'état. Le facteur décisif n'était pas la teinte mais l'incohérence.

**Décision** :

1. **La couleur ne signale que les problèmes.** « Conforme », « reçu », « rapproché » sont
   l'état par défaut d'un dossier et ne portent aucune couleur. Deux teintes sémantiques
   seulement : anomalie `#9B2C2C`, attention `#8A5A00`. Le vert et le violet sémantiques sont
   supprimés, la classe `pill.ok` n'existe plus.
2. **Jeu fermé.** Fond `#F4F6F3`, panneau `#FFFFFF`, encres `#14171A` / `#4A534E` / `#79837D`,
   filet `#DFE4DE`, accent unique `#1F4D3D` **identique dans les trois espaces** — les espaces
   se distinguent par un libellé et un filet. Rayon : deux valeurs (3 px, 999 px). Espacement :
   échelle stricte 4/8/12/16/24/32. Cinq tailles de police.
3. **Typographie intégrée**, aucune requête réseau : IBM Plex Mono pour les chiffres,
   références et empreintes, en chiffres tabulaires. **Substitution déclarée** : Public Sans
   était demandée ; elle n'est pas disponible hors ligne dans cet environnement et aucun réseau
   n'est autorisé. Instrument Sans est retenue — même famille de grotesques neutres — et la
   substitution est écrite dans la feuille de style pour être remplacée d'un seul bloc
   `@font-face`. Quatre graisses sous-ensemblées en WOFF2 : **71 Ko en base64**.
4. **Signature** : la référence du papier de travail en chasse fixe, petite, coin supérieur
   droit de chaque panneau, sous le filet. Second emprunt : les pastilles d'état du papier de
   travail sont remplacées par des **marques de pointage** (`p` pointé, `a` à exécuter,
   `x` écart, `n` non reçu) avec leur légende sous le tableau ; seules `x` et `n` sont colorées.

**Compteurs de conformité, mesurés sur la feuille de style livrée** : rayons distincts **2**
(cible 2) · couleurs littérales hors jetons **0** (cible 0) · tailles de police **5** (cible ≤ 5)
· espacements hors échelle **0** (cible 0). Teintes d'encre effectivement rendues à l'écran : 6,
toutes issues du jeu.

---

## ADR-039 — Un état ne se saisit pas, il se déduit

**Contexte** : la ligne d'un papier de travail portait un drapeau `recu` posé par le code du
portail au moment du dépôt, et l'écran affichait quatre pastilles d'état calculées à côté.
Un drapeau stocké se désynchronise : régénérer un échantillon, supprimer une requête, changer
un germe laissait le drapeau à `true` sur une pièce que personne n'avait plus déposée. Et une
case « pièce reçue » cochable à la main aurait permis de déclarer reçue une pièce inexistante.

**Décision** :

1. **La réception est dérivée, jamais stockée.** `ligneRecue()` et `docRecu()` lisent les
   dépôts du client sur la requête qui demandait la pièce. Le papier de travail ne conserve
   que ce qu'un auditeur a réellement saisi : les valeurs relevées et les résolutions
   d'écart. `deposer()` ne pose plus aucun drapeau.
2. **Cinq états dérivés, un par ligne de contrôle** : *en attente* → *reçue* → *traitée sans
   écart* → *écart à expliquer* → *écart expliqué*. Ils remplacent les marques de pointage de
   l'ADR-038 plutôt que de s'y ajouter : la marque EST l'affichage de l'état (`n a p x e`).
3. **La priorité entre états d'une même ligne est une décision écrite** (`PRIORITE_ETAT`) :
   `écart` avant `en attente` avant `reçue` avant `expliqué` avant `traitée`. On montre
   d'abord ce qui appelle une action de l'auditeur, puis ce qui appelle une action du client.
   Ce n'est pas le plus fréquent qui gagne, c'est le plus exigeant.
4. **Ces cinq états s'agrègent** au bloc « Avancement des justificatifs » de chaque section et
   au tableau de bord de pilotage. Aucun de ces nombres n'est saisi.

**Duplication supprimée** : le bloc « Responsabilités et heures », répété dans chaque section,
disparaît — l'affectation et les heures appartiennent au programme de travail, une seule fois.
Ce que la section porte désormais, c'est l'**action** : un bouton « le testing est terminé »
dans le papier de travail, qui porte le travail à « achevé » et le soumet à son réviseur. Il
est refusé tant qu'un justificatif manque, qu'un contrôle n'est pas saisi, qu'un écart n'est
pas résolu ou que la conclusion n'est pas écrite, et il nomme le réviseur qu'il saisit.

---

## ADR-040 — Un seul casier de résolution d'écart, et seul le résiduel entre au cumul

**Contexte** : la synthèse des anomalies affichait, pour les écarts nés du rapprochement et du
test des écritures, des phrases pré-écrites du type « doublon reconnu par le client ; extourne
non comptabilisée à date ». Ces phrases avaient l'apparence d'une résolution sans en porter
aucun élément probant. La vue d'achèvement offrait pire : une case à cocher « corrigée par le
client » qui retirait un montant du cumul sans explication, sans lien, sans auteur.

**Décision** :

1. **Le papier de travail porte la résolution** : écart constaté (calculé), part expliquée
   (saisie), écart résiduel (soustraction, jamais saisi), explication reçue du client mot pour
   mot, conclusion de l'auditeur, qualification, lien vers la pièce ou l'écriture qui
   corrobore, auteur et horodatage.
2. **C'est la contrainte probante de la migration 0009, réutilisée telle quelle** : sans les
   six éléments, la résolution n'est pas acquise et l'écart reste **entier** au cumul. La
   corroboration est un LIEN : une écriture citée qui n'existe pas au grand livre est refusée.
3. **Un seul casier pour tous les écarts.** Écart de papier, écart de rapprochement, écriture
   relevée au test des écritures passent par le même objet et la même carte, rendue là où
   l'écart naît. Les phrases pré-écrites sont conservées, mais enregistrées pour ce qu'elles
   sont : des explications *reçues*, qui ne résolvent rien à elles seules.
4. **La case « corrigée » de l'achèvement est supprimée.** Une anomalie quitte le cumul par
   une résolution documentée, pas par une case.
5. **La part expliquée est bornée** à l'écart constaté et à son sens : une résolution qui
   agrandirait l'écart, ou l'inverserait, n'en est pas une.
6. **Un écart intégralement expliqué reste listé**, avec son constaté, sa part expliquée et son
   résiduel nul. Le faire disparaître de la liste est exactement ce qui avait permis, dans
   l'application, à un montant de quitter le cumul sans que rien ne l'explique.
7. **Un écart non chiffré** — une date de pièce, un tiers, une référence — n'entre pas au cumul
   mais exige les mêmes éléments probants. Même casier, pas un second chemin.

**Double comptage signalé, jamais déduit** : une facture de vente est relevée dans la section
« Clients » ET dans la section « Chiffre d'affaires » ; son écart entrait deux fois au cumul
alors qu'il ne fausse les comptes qu'une fois. La synthèse le signale, nomme les pièces
concernées et renvoie à la qualification « déjà cumulée ». Rien n'est soustrait d'office : le
côté qui reste est une décision d'auditeur.

---

## ADR-041 — La contrainte probante s'applique à toutes les tables de résolution (migration 0010)

**Contexte** : la migration 0009 avait rendu `exception.status = 'resolved'` inatteignable sans
substance. Deux autres tables pouvaient encore clore un constat sur une phrase :

- `reconciliation_item` — `'documented_difference'` **libère le verrou de population Gate 2**
  et ne demandait qu'une note libre ;
- `deviation` — `'explained'` retire une défaillance de contrôle du décompte ouvert et ne
  demandait qu'un texte libre. Le flux de démonstration y écrivait littéralement
  « deviation stands as a control failure » tout en la portant « expliquée ».

Une règle qui tient sur une table et pas sur ses voisines est une convention, pas une contrainte.

**Décision** :

1. **`reconciliation_item`** reçoit les quatre colonnes de 0009 et la même contrainte CHECK
   pour `documented_difference` et `resolved`. Le service prend désormais le type
   `ResolutionInput` de l'exception — le même type, pas un type parallèle.
2. **`deviation`** reçoit la même forme (explication mot pour mot, lien probant, conclusion,
   auteur), mais **pas les mêmes qualifications** : un test de contrôle ne porte aucun montant,
   les mots de l'argent n'y ont pas leur place. Deux dispositions seulement sortent une
   déviation du décompte, et toutes deux sont des affirmations sur la preuve :
   `control_operated` et `compensating_control`. Il n'existe délibérément pas de disposition
   « expliquée par la direction » : une déviation qui subsiste reste ouverte et alimente le taux.
3. **Le troisième chemin, encore une fois.** L'écart TB/GL du dossier de démonstration tient à
   une écriture **absente** du grand livre : il n'y a, par construction, ni écriture à citer ni
   pièce à joindre. Plutôt que d'affaiblir `documented_difference`, `reconciliation_item`
   reçoit `scope_limitation`, calqué sur celui de 0009 : il enregistre ce qui n'a pas pu être
   obtenu et ce qui a été fait à la place, il ne prétend jamais être corroboré, et il n'est
   tolérable qu'avec `engagement.ledger_is_provisional`, qui bloque la conclusion finale.
4. **Les flux de démonstration sont corrigés, pas contournés** : `part1` emprunte la limitation
   de périmètre, `part2` laisse les déviations ouvertes.

**Vérifié** : quatre assertions de niveau base de données prouvent que le service n'est pas la
seule barrière — `reconciliation_closure_is_probative`,
`reconciliation_limitation_is_documented` et `deviation_closure_is_probative` refusent
l'écriture directe. 148 tests passent.

---

## ADR-042 — L'ampleur d'un écart du jeu d'essai découle de sa cause

**Contexte** : les seize écarts de montant du jeu de données étaient tous posés entre 3 % et
10 % de la pièce qui les porte — plusieurs à 5,00 % et 10,00 % exactement — quelle que soit la
cause écrite à côté. « Avoir de fin d'exercice non comptabilisé » y valait la même chose qu'un
arrondi de saisie. Conséquence mesurée : **un seul** écart dépassait le seuil de remontée, si
bien que la chaîne « écart relevé → résolution → cumul → opinion » ne pouvait jamais être
observée sur un papier de travail. Une part choisie pour faire un joli nombre n'est pas un
écart d'audit — et la correction ne consiste pas à grossir trois montants pour obtenir un
compte agréable, mais à laisser la cause fixer l'ampleur.

**Décision** : chaque écart déclare sa **nature**, et chaque nature sa **bande**, exprimée en
part de la pièce parce qu'une erreur est proportionnelle à ce sur quoi elle porte :

| Nature | Bande | Ce que c'est |
|---|---|---|
| arrondi ou frais non ventilé | ≤ 1 % | une saisie arrondie, une commission non éclatée |
| régularisation partielle | 2 % – 12 % | une remise non déduite, un taux ajusté, un reliquat |
| document ou ligne omis | 10 % – 40 % | un avoir jamais comptabilisé, un retour non crédité |

La bande est **vérifiée à l'écran** (vue « Jeu de données ») : si un écart en sort, c'est la
table qui est fausse. Le nombre d'écarts dépassant le seuil de remontée passe de 1 à **6** —
ce nombre est **constaté, pas visé**, et il est affiché comme tel.

**Conséquence observée** : les six écarts au-dessus du seuil de remontée tombent tous dans un
échantillon, et les petits en sortent — ce qu'une sélection stratifiée par les montants doit
précisément produire.

**Point ouvert relevé, non traité** : avec un seuil de planification de 27 000 € et une facture
médiane de 15 420 €, la strate exhaustive à la moitié du seuil retient plus de la moitié de la
population — 163 éléments sur 323. La règle de l'ADR-034 rencontre ici une population dont les
éléments approchent le seuil ; ce n'est pas un défaut de la règle mais un cas qu'elle traite
mal, et la stratification est la réponse habituelle. À arbitrer.

---

## ADR-043 — Une version du fichier est un ajout, jamais un écrasement ; et sa prise en compte est une décision

**Contexte** : le prototype ne connaissait qu'un seul état de la balance et du grand livre. Un
mandat réel en reçoit trois à cinq — provisoire, après écritures d'inventaire, après revue de
l'expert-comptable, parfois après une révision de dernière minute. L'écrasement était donc
impensé, et avec lui toutes ses conséquences : un échantillon tiré sur une population qui n'existe
plus, un travail achevé sur des chiffres périmés, un visa engageant un associé sur un fichier
qu'il n'a pas vu.

**Décision** :

1. **Une version n'est jamais une régénération.** C'est le grand livre précédent **plus** les
   écritures passées depuis. Régénérer redistribuerait les montants du générateur et déplacerait
   les anomalies : deux versions ne seraient plus comparables. Vérifié par test : le grand livre
   de la v1 est un préfixe exact de celui de la v2, puis de la v3 (1 605 → 1 609 → 1 611
   écritures, aucune écriture antérieure modifiée).
2. **Chaque écriture de version déclare sa cible** : balance, grand livre, ou les deux. Une
   écriture à sens unique crée — ou résorbe — un écart de rapprochement, et c'est voulu :
   l'écriture de situation absente du premier fichier est reprise en v2 et l'écart disparaît de
   lui-même ; un avoir passé à la balance seule en v3 en rouvre un.
3. **Une version reçue n'est pas une version prise en compte.** On lit d'abord le rapport
   d'impact, puis on décide, et la décision est journalisée. Basculer le grand livre sous une
   mission en cours sans le dire est ce que fait un tableur.
4. **Le rapport d'impact est le cœur, pas les colonnes.** Six réponses, toutes obtenues en
   évaluant réellement le dossier sur les deux versions : comptes qui ont bougé · comptes qui
   franchissent le seuil de remontée · postes qui entrent ou sortent du périmètre · sélections
   périmées, avec les éléments entrés et sortis · travaux achevés ou revus sur une version
   antérieure · anomalies résorbées par la nouvelle version, et anomalies qu'elle fait apparaître.
5. **Les seuils bougent avec la version** : la référence de matérialité est calculée sur la
   balance. Un compte peut donc changer de côté sans avoir bougé d'un centime. Le rapport vérifie
   ce cas à chaque transition et **dit explicitement quand il ne s'en présente aucun** — la
   formulation initiale l'affirmait ; la mesure a montré qu'il ne se produisait pas sur ce jeu de
   données, et le texte a été rendu conditionnel plutôt que supprimé.
6. **« À reconfirmer » est un état DÉRIVÉ, pas une écriture.** Un travail achevé sur une version
   antérieure n'est pas « encore achevé » : il est à reconfirmer, avec son motif. Le statut stocké
   n'est pas modifié — revenir à la version d'exécution le rend à son état antérieur sans qu'aucune
   écriture n'ait eu lieu. C'est la règle de l'ADR-039 appliquée au versionnement.
7. **Un visa posé sur une version antérieure est signalé et remis en cause**, jamais effacé.
8. **Chaque papier de travail cite sa version** et son empreinte, et l'export porte les deux en
   tête : deux classeurs d'apparence identique peuvent parler de fichiers différents.
9. **Le rapprochement est rejoué à chaque version, et chaque version garde le sien** : un écart
   résorbé reste lisible sur la version où il avait été relevé.

**Effets mesurés sur le jeu de données** — v1 → v2 : résultat courant 750 863 € → 671 063 €
(quatre écritures de clôture), seuils 37 000/27 000/1 800 → 33 000/24 000/1 600, écart de
rapprochement de 25 000 € résorbé, 32 sélections modifiées. v2 → v3 : 671 063 € → 695 363 €,
seuils → 34 000/25 000/1 700, le poste **Immobilisations incorporelles entre au périmètre**
(licence immobilisée), 24 sélections modifiées, nouvel écart de rapprochement de 6 200 €.
Les trois versions restent équilibrées, balance et grand livre, zéro écriture déséquilibrée.

**Coût** : rapport d'impact 88 ms au premier rendu, 40 ms sans cache, 17 ms avec ; bascule de
version 49 ms. Le cache est clé sur la version **et** sur l'état saisi qu'il lit, plutôt que sur
un vidage posé au bon endroit et oublié au prochain.
