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
> **Révisé le 2026-08-26 par l'ADR-047** : la coupure d'exhaustivité ne suit plus le risque.
> Elle vaut le seuil de planification, sans modulation. Ce qui suit reste valable pour la
> TAILLE de l'échantillon.


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

---

## ADR-044 — Le test des écritures : des critères réglables, et surtout un entonnoir

**Contexte** : six critères en dur, sans un seul paramètre, et un compteur unique — « 590
écritures retenues ». Le fondateur : *« 457 écritures en journal d'OD ne veut rien dire
isolément. »* Un nombre isolé ne dit ni ce que le critère ajoute aux autres, ni combien
d'écritures plusieurs signaux désignent ensemble.

**Décision** :

1. **Un critère est un objet** : identité, ce qu'il cherche en une phrase, ses paramètres
   déclarés, son prédicat. Seize au catalogue, dont dix paramétrés. On les active, on les règle,
   on les désactive, on en crée.
2. **Créer un critère, ce n'est pas écrire du code** : cinq *formes* instanciables — montant entre
   deux bornes, préfixe de compte, journal, libellé contenant, auteur de la saisie. C'est ce qu'un
   auditeur ajoute réellement en cours de mission.
3. **Trois modes de combinaison** : au moins un · au moins N · expression explicite (ET, OU, NON,
   parenthèses sur les codes de critères). L'évaluateur **refuse** toute expression qu'il ne
   comprend pas — code inconnu, opérateur en fin d'expression, parenthèse non fermée, deux
   opérateurs qui se suivent. Une expression mal formée qui s'évaluerait à « faux » donnerait une
   sélection vide et d'apparence normale : c'est le pire des deux résultats possibles.
4. **L'entonnoir** : population de départ, puis pour chaque critère ce qu'il retient **seul** et ce
   qu'il **ajoute** que les précédents n'avaient pas désigné, le cumul, la masse. Puis la
   distribution : combien d'écritures remplissent 1, 2, 3… critères, et combien en remplissent au
   moins autant. Deux diagnostics distincts sont signalés : les critères qui ne retiennent
   **rien**, et ceux qui retiennent mais **n'ajoutent rien**.
5. **Modèles réutilisables** : trois livrés (paramétrage courant, écritures de clôture, ciblé
   manipulation du résultat), plus ceux que l'auditeur enregistre. Un modèle sans nom ou dont le
   nom existe déjà est refusé.

**Le défaut exige deux critères — et c'est une décision de méthode, pas un réglage de confort.**
« Montant supérieur au seuil de planification » retient à lui seul **441 écritures sur 1 602** :
sur une entreprise dont la facture médiane approche le seuil de planification, ce critère décrit
un tiers du grand livre et ne désigne rien. Avec « au moins un », la sélection est de 590
écritures — 37 % de la population, illisible. Avec « au moins deux » : **97 écritures, 6,1 % de
la population et 14,2 % de la masse**. Le nombre est une conséquence de la règle, pas une cible,
et l'entonnoir montre ce que donnerait chaque valeur de N.

**Deux critères sont catalogués sans être exécutables, et le disent** :

- **Saisie hors heures ouvrées** — le fichier des écritures comptables ne porte que la *date* de
  validation (champ `ValidDate`), jamais l'heure. Ce critère exige le journal applicatif de l'ERP.
  Il est catalogué et désactivé plutôt que fabriqué : une heure inventée ferait un critère qui
  trouve toujours quelque chose.
- **Jour férié — [UNVERIFIED]** — la liste des fêtes légales relève du code du travail,
  art. L. 3133-1. Le texte primaire n'a **pas** pu être atteint : l'accès à legifrance.gouv.fr est
  bloqué par le proxy réseau de cet environnement. Le critère fonctionne, sa liste est marquée
  UNVERIFIED dans le code **et à l'écran**, et les dates mobiles de 2025 sont calculées, pas
  recopiées.

**Constaté sur le jeu de données** : « Référence de pièce absente » ne retient aucune écriture —
le générateur remplit toujours le champ. Le signalement le dit, plutôt que de laisser croire à un
critère efficace.

---

## ADR-045 — La meilleure attribution en lot est celle qu'on n'a pas à faire

**Contexte** : le programme de travail exigeait de choisir un préparateur et un réviseur dans deux
listes déroulantes, cent douze fois. Un bouton « affecter selon la règle » existait, mais la règle
tenait en trois lignes de code — tout au préparateur unique, la revue à la superviseure ou à
l'associée selon le niveau — et n'était affichée nulle part.

**Décision** : le système **propose**, l'auditeur **corrige**. Deux règles se composent.

1. **QUI, par grade** — huit cas, affichés en tableau avec le nombre de travaux que chacun attrape.
   Ce que le travail demande, pas qui est disponible : un travail de niveau 2 se prépare au niveau
   superviseur et se revoit par l'associée ; une procédure répondant à une assertion « élevé » se
   prépare au niveau senior ; une procédure sans sélection est un travail d'assistant.
2. **LEQUEL, à grade égal** — celui dont la charge est la plus faible, les travaux étant parcourus
   dans un ordre fixe (phase puis code). La proposition est donc **rejouable à l'identique**, et
   l'équilibre des heures en découle au lieu d'être visé. La revue est comptée pour un cinquième
   de la préparation.

**Rien n'est écrit tant que personne n'accepte.** La proposition s'affiche dans une colonne, à côté
de l'affectation réelle, jamais à sa place — la règle de l'ADR-039 appliquée à l'affectation. Une
ligne corrigée à la main est marquée « corrigé » : la proposition ne change pas, l'écart reste
visible, c'est la décision de l'auditeur.

**L'équipe passe de trois à six personnes** — deux seniors, deux superviseurs — parce qu'avec un
seul senior et un seul superviseur la question de l'équilibrage ne se pose pas et la règle est
décorative.

**Attribution en lot** : case à cocher par ligne, « tout sélectionner » sur le **résultat filtré**,
puis un préparateur ou un réviseur appliqué en une action. Chaque affectation passe par la même
fonction que l'affectation unitaire : un lot qui violerait la règle est refusé travail par travail
et le nombre de refus est affiché, plutôt que forcé en masse.

**Ce que la proposition révèle de la mission, et qu'on n'a pas corrigé.** Le bloc affiche la part
du budget par grade : **senior 83 %, assistant 9 %, superviseur 8 %**, et l'associée revoit
**74 travaux sur 112**. Ce n'est pas un défaut de la règle de dotation : 65 procédures de section
répondent à une assertion évaluée « élevé », soit 55 % du budget, et une telle assertion se prépare
au niveau senior et se revoit par l'associée. Le levier est l'évaluation du risque, pas le grade
inscrit dans la règle — et l'écran le dit au lieu d'aplatir les heures pour faire joli. Deux cas de
la règle ne s'appliquent à aucun travail de cette mission ; ils sont signalés comme tels.

---

## ADR-046 — Une section est un lieu, pas une page

**Contexte** : une section rendait ses sept blocs d'un seul tenant. Mesuré à 390 px de large :
**6 129 px pour le chiffre d'affaires**, soit près de sept écrans de téléphone d'un seul
défilement. Un bouton « replier » aurait masqué le défaut sans le corriger — on aurait encore eu
une page, simplement pliée.

**Décision** :

1. **Six destinations, une seule affichée** — comptes · risque · plan de travail · requêtes ·
   notes · conclusion. On s'y déplace, on ne les traverse pas.
2. **Le plan de travail est l'atterrissage.** C'est ce qu'un réviseur ouvre en premier ; il
   n'avait aucune raison d'être le troisième bloc d'un défilement.
3. **Une procédure ouverte REMPLACE le plan de travail**, avec un fil d'Ariane pour revenir.
   Elle s'y ajoutait, ce qui allongeait la page au moment précis où l'on voulait se concentrer.
4. **Le bandeau collant porte l'état de la section** dès qu'on y entre : poste, risque retenu,
   rapport au seuil de planification, obstacles au visa, état du visa, et les quatre compteurs
   dérivés (attendus, reçus, traités, écarts à expliquer). Il **remplace** les compteurs de
   mission plutôt que de s'y ajouter : à l'intérieur d'une section, l'état de la mission
   n'apprend rien, et la hauteur collante ne bouge pas (294 px au téléphone, inchangée).
5. **Les replis s'ouvrent selon ce qui demande attention** — note bloquante, écart non résolu,
   facteur non statué, pièce manquante. C'est la règle de la couleur (ADR-038) appliquée à la
   place occupée : l'écran donne de l'espace aux problèmes. L'état que l'auditeur change
   lui-même est mémorisé pour la session, **par section** : sa décision l'emporte sur la règle.
   La navigation affiche le même compte, de sorte qu'on voit d'où vient le travail sans ouvrir.
6. **« Tout déplier » et « tout replier » existent**, mais ce sont des secours.

**Le même traitement ailleurs, sur critère mesuré.** Un panneau `blk()` devient repliable pour
les vues qui réunissent **deux conditions mesurées à 390 px** : au moins trois panneaux, et au
moins deux écrans de téléphone de contenu. Replier une vue d'un écran et demi coûterait un clic
sans rien rendre lisible — `pil.avance` (1,3 écran), `ach.cloture` (1,6) et `cli.contacts` (1,5)
restent donc d'un tenant. Le portail client y figure malgré sa taille de départ : il grandit avec
le nombre de requêtes. Par défaut, un panneau s'ouvre s'il porte quelque chose à traiter ; à
défaut, le premier l'est, pour qu'une vue repliée ne soit jamais une page vide.

**Hauteurs mesurées à 390 px, avant → après** :

| Vue | Avant | Après |
|---|---|---|
| Section chiffre d'affaires | **6 129 px** (6,9 écrans) | **1 674 px** (1,6 écran) |
| Section clients | 5 322 px (6,0) | 1 674 px (1,6) |
| Test des écritures | 6 874 px (7,8) | 1 900 px (2,2) |
| Versions du fichier | 4 233 px (4,7) | 1 100 px (1,3) |
| Vue globale de la mission | 3 256 px (3,8) | 1 200 px (1,4) |
| Registre des facteurs | 5 570 px (6,3) | 4 220 px (5,0) |

Le registre des facteurs reste long **parce que huit facteurs attendent une décision** : c'est la
règle qui fonctionne, pas un reste à corriger. Statuer les facteurs le raccourcit.

**Un défaut préexistant trouvé en chemin** : `aller()` appelait `scrollIntoView` sur le contenu,
qui amenait son haut **sous** la barre collante — au téléphone, les 294 premiers pixels de chaque
vue étaient invisibles à l'arrivée, sur toutes les vues, depuis toujours. Corrigé par
`scroll-margin-top` ; un test l'asserte désormais sur cinq vues. Corrigé aussi : le bandeau
affichait « / planification 23 466 % » là où « 235 × » se lit d'un coup d'œil.

---

## ADR-047 — La strate exhaustive n'est pas un levier de risque (révise l'ADR-034)

**Arbitrage de l'auditeur, 2026-08-26.** L'ADR-034 faisait descendre le seuil de la strate
exhaustive avec le risque de l'assertion — seuil de planification, sa moitié, son tiers. Signalé
comme point ouvert à la livraison précédente : sur une population dont la facture médiane
(15 420 €) approche le seuil de planification (24 000 €), la strate à la moitié du seuil retenait
163 éléments sur 323. Un « échantillon » de la moitié d'une population n'est pas un échantillon.

**Décision du fondateur, adoptée telle quelle** :

1. **La strate exhaustive est celle des éléments INDIVIDUELLEMENT SIGNIFICATIFS** — ceux dont une
   anomalie, à eux seuls, serait significative. Cette coupure vaut **le seuil de planification,
   sans modulation**. Un élément de 20 000 € n'est pas plus ou moins individuellement significatif
   selon que l'assertion qu'il sert est jugée moyenne ou élevée.
2. **Le risque agit sur la taille de l'échantillon** et, par voie de conséquence, sur
   **l'intervalle de sondage** (intervalle = masse ÷ taille). Deux leviers, pas trois.
3. **Sondage en unités monétaires** implémenté comme méthode disponible : intervalle = masse ÷
   taille, éléments supérieurs à l'intervalle retenus d'office, les autres avec une probabilité
   proportionnelle à leur valeur, départ aléatoire tiré du germe. Déterministe et rejouable —
   vérifié : même germe, même sélection ; germe changé, sélection changée.
4. **Garde-fou** : quand les éléments individuellement significatifs dépassent **25 %** de la
   population, l'écran le dit, en nommant le nombre et la part, et propose le sondage en unités
   monétaires ou une stratification en bandes — cette dernière **non implémentée et signalée comme
   telle**. Le système ne bascule jamais seul.
5. **La méthode retenue figure sur le papier de travail** avec sa justification, et se change par
   procédure. La taille se force aussi par procédure ; effacer la surcharge rend la règle de risque.

**Ce que la mesure a montré, et qui a conduit à un garde-fou de plus.** À la taille dictée par le
risque (15 éléments), le sondage en unités monétaires sur le chiffre d'affaires donne un intervalle
de **376 578 €, soit 15,7 × le seuil de planification**. Un intervalle plus large que le seuil
laisse passer, sans jamais les voir, des anomalies individuellement significatives : la méthode
tourne, le papier a l'air rempli, et l'échantillon ne prouve rien. C'est le défaut de la strate à
moitié de population, pris par l'autre bout. **Un second garde-fou le dit** et donne la taille qui
ramène l'intervalle au seuil — une division, masse ÷ seuil, pas un choix.

**Résultat mesuré sur la mission entière**, sur les sept anomalies de montant dépassant le seuil de
remontée :

| Méthode | Anomalies détectées | Éléments à tester |
|---|---|---|
| Strate au seuil + tirage à la taille de risque | **5 / 7** | 1 856 |
| Unités monétaires, intervalle ramené au seuil | **7 / 7** | 2 157 |

Les deux manquées — un avoir de 4 850 € sur une facture de 23 794 €, un virement de 6 720 € sur une
écriture de 21 871 € — sont précisément des éléments **juste sous** la coupure d'exhaustivité, que
le tirage aléatoire de quinze éléments sur deux cent cinquante ne rencontre pas. Le sondage en
unités monétaires les atteint parce que leur probabilité est proportionnelle à leur valeur.

**Conclusion, contre l'intuition de départ** : le sondage en unités monétaires n'est pas ici la
méthode qui teste *moins*. À intervalle adéquat, il teste **16 % d'éléments en plus** — et c'est ce
qui lui permet de ne rien manquer. L'économie apparente du premier essai (15 éléments au lieu de
115) venait d'un intervalle inadéquat, c'est-à-dire d'un échantillon qui ne prouvait rien.

**Garde-fou déclenché sur 24 procédures de 48** dans l'état par défaut : c'est la mesure, pas un
réglage. Sur ce dossier, la moitié des populations ont plus d'un quart d'éléments individuellement
significatifs — le seuil de planification est bas au regard de la taille des pièces, et l'écran le
dit à chaque fois.

> *Mise à jour du 2026-08-26, après l'ADR-048.* Le catalogue étant passé à 56 procédures, la mesure
> est désormais de **27 procédures sur 56** — même proportion, population de procédures différente.
> L'ADR-050 y ajoute une exception : le garde-fou ne s'applique pas à une **sélection imposée
> exhaustive**, parce qu'il signale qu'on teste presque tout *sans l'avoir décidé*.

---

## ADR-048 — La méthodologie est de la donnée versionnée, pas du code

**Demande du fondateur, 2026-08-26, littérale** : le catalogue de procédures doit être livré sous
forme de **données structurées versionnées dans le dépôt**, consommées par **le prototype ET
l'application**, le prototype l'intégrant **à la construction** et ne le contenant pas en dur.
« Sinon je paierai deux fois ce travail et la version qui compte sera enfermée dans une
démonstration. »

**Décision.**

1. Le catalogue vit dans `methodology/` **à la racine du dépôt**, hors de `app/` et hors de
   `prototype/` : c'est de la méthode, pas du code applicatif.
2. `methodology/valider.mjs` est **le** validateur et **le** chargeur. Sans dépendance — la suite
   doit tourner sans réseau (règle 4 du CLAUDE.md). Il est appelé par
   `app/src/lib/methodology/catalogue.ts` **et** par `prototype/src/gen-catalogue.mjs`.
3. Un catalogue invalide **arrête** l'assemblage du prototype (`exit 1`) et fait échouer la suite
   de l'application. Il n'existe pas de chemin qui livre un produit bâti sur des données non
   vérifiées.
4. `_catalogue.gen.js` est **engendré** à chaque assemblage et **non versionné**.

**Ce que la validation stricte a immédiatement trouvé.** Le validateur partagé, plus strict que
celui qu'il remplace (motifs, longueurs minimales, champs inconnus jusque dans les justificatifs),
a relevé au premier passage que le motif des codes n'admettait qu'un seul tiret alors que
`FOURN-CUTOFF-REC` en porte deux. Le motif a été élargi à `^[A-Z_]+(-[A-Z_]+)*$` : le nom d'une
procédure peut être composé.

---

## ADR-049 — Ce qui se relève et ce qui se contrôle sont deux choses

**Constat.** Le catalogue traitait tout champ de justificatif comme un **contrôle** : une valeur
relevée, une référence, un écart. Appliqué à la recherche de passifs non enregistrés, cela donnait
une règle « date du fait générateur antérieure ou égale à la clôture », qui relevait comme anomalie
**toute facture normale du cycle** — et jugeait conforme, par la même règle inversée, le passif
omis lui-même. Le harnais l'a montré : zéro écart sur les passifs omis, soixante-douze écarts sur
des décaissements réguliers.

**Décision.**

1. Un champ de justificatif peut être marqué **`releve_seul`** : il se relève et **ne se compare à
   rien**. Il alimente le jugement ou un autre contrôle, et **ne produit jamais d'écart**.
2. Le validateur **interdit** qu'un champ porte à la fois `releve_seul` et une `regle` : le
   catalogue ne dira pas deux choses contraires au même endroit.
3. Le contrôle de la recherche de passifs non enregistrés n'est **pas une date**, c'est une
   **recherche** : la dette attendue au bilan de clôture y figure-t-elle ? La date du fait
   générateur est relevée, c'est elle qui dit si une dette était attendue ; le contrôle porte sur
   sa présence au passif.
4. Le jeu de données a été refait en conséquence. Un extrait postérieur où **tous** les faits
   générateurs normaux tombaient après la clôture rendait le test trivial — un tri de dates
   suffisait. Les soixante décaissements se répartissent maintenant en trois natures : **29**
   règlent une dette régulièrement comptabilisée, **28** sont des charges de l'exercice suivant,
   **3** sont des passifs non enregistrés.

**Mesure.** Sur les soixante décaissements, la procédure relève **3 écarts, exactement les trois
passifs omis, et rien d'autre**. Aucun faux positif.

**Défaut corrigé au passage.** Les trois passifs omis portaient des références nommées
(`FF2026-0042`, `FF2026-0117`, `FF2026-0203`) mais la boucle du jeu de données n'engendrait que des
multiples de sept : `FF2026-0117` n'en est pas un et **n'a jamais existé**. Deux passifs sur trois
étaient posés. Les références sont désormais **posées à des rangs fixes**, la numérotation les
réservant. Une donnée d'essai nommée doit être posée, pas espérée.

---

## ADR-050 — Sonder une population qu'on cherche à compléter ne prouve rien

**Décision.** Une procédure du catalogue peut déclarer `"selection": "exhaustive_au_seuil"` :
**aucun tirage**, tous les éléments de la population sont testés, et l'étendue se règle par le
**seuil de remontée** qui borne la population — pas par une taille d'échantillon.

**Pourquoi.** La recherche de passifs non enregistrés sert l'**exhaustivité**. Tirer un échantillon
dans une population que l'on examine précisément pour trouver ce qui manque au grand livre ne dit
rien sur ce qui n'a pas été tiré. C'est une procédure de **sélection d'éléments spécifiques**, pas
de sondage, et la donnée doit le dire — sans quoi la détection des trois passifs omis dépendrait du
germe du tirage, ce qui est le contraire d'une preuve.

**Le seuil est le levier, et il est déclaré.** Le seuil de remontée retenu est le **seuil de
signification manifeste** (1 600 € sur ce dossier), pas le seuil de planification (24 000 €). Le
catalogue le dit et dit pourquoi : des dettes omises individuellement non significatives
**s'additionnent**, et un seuil de remontée au seuil de planification les laisserait passer par
construction. Sur ce dossier, cela met 60 décaissements au papier de travail, pour 100 % de la
masse — c'est le coût de la procédure, et il est affiché.

**Conséquence sur le garde-fou d'exhaustivité (ADR-047).** Il ne s'applique pas à une sélection
imposée. Le garde-fou dit « vous testez presque tout **sans l'avoir décidé** » ; ici c'est décidé,
écrit au catalogue et motivé. Le déclencher quand même le rendrait insignifiant partout ailleurs.
La méthode n'est alors pas offerte au choix à l'écran, et une tentative de la ramener à un sondage
depuis l'interface est sans effet — vérifié par le harnais.

**Défaut de robustesse trouvé en même temps.** Deux prédicats (`tiers_sans_reponse`,
`avoirs_apres_cloture`) étaient **nommés** par le catalogue et rendaient `null` : la procédure se
présentait comme « avec sélection » alors que sa sélection valait `null`, ce qui faisait planter
deux harnais — et aurait planté l'écran. Ils sont désormais **déclarés absents avec leur raison**,
affichée à côté de la procédure ; une procédure dont le prédicat est absent cesse de se dire
échantillonnée. Un prédicat nommé que personne n'implémente ni ne déclare absent est un défaut de
construction, et le harnais du catalogue le relève.

---

## ADR-051 — Une anomalie ne quitte le cumul que par une résolution ou par une écriture

**Demande du fondateur, 2026-08-26** : une section « Ajustements et retraitements », branchée sur le
versionnement. Le rapport d'impact dit CE QUI a changé ; cette section doit dire POURQUOI, écriture
par écriture — avec la NATURE de chaque ajustement, et pour les corrections passées en réponse à un
constat d'audit, une **réconciliation automatique** avec l'état des anomalies.

**Décision.**

1. **La section ne tient aucun registre.** Un ajustement **est** une écriture de version. Elle lit
   celui qui existe plutôt que d'en ouvrir un second, qui aurait divergé.
2. **Trois natures**, portées par la donnée : `inventaire` (le client termine son exercice),
   `retraitement` (reclassement, changement d'estimation, erreur trouvée par le client ou son
   expert-comptable), `correction_audit` (le client corrige parce que NOUS avons relevé quelque
   chose). Seule la troisième se réconcilie.
3. **Chaque écriture porte son justificatif et son auteur côté client**, et son impact est ventilé
   **par poste** et **par masse**. Δ résultat = Σ (crédit − débit) sur les comptes 6 et 7 ;
   Δ situation nette = Σ (débit − crédit) sur les comptes 1 à 5. Les deux sont **égaux par
   construction** — c'est la partie double, et l'écran le **vérifie** au lieu de l'affirmer.
   Δ capitaux propres = Δ résultat + les mouvements portés directement aux comptes de capitaux.
4. **La réconciliation est automatique.** Une correction d'audit nomme la **pièce** qu'elle corrige ;
   l'anomalie portée sur cette pièce quitte le cumul non corrigé pour exactement ce que l'écriture
   porte. Le montant imputé est **borné à l'anomalie et à son sens** — c'est la borne déjà écrite
   pour la part expliquée d'une résolution (ADR-013). Une correction **partielle** laisse le reste au
   cumul. Les anomalies sont servies **du plus gros résiduel au plus petit**, sans quoi l'ordre de la
   liste déciderait de ce qui reste au cumul.
5. **Il n'y a pas de case « corrigée ».** Une anomalie ne quitte le cumul que de deux façons : une
   **résolution probante** enregistrée là où l'écart est né, ou une **écriture de correction**
   présente dans une version prise en compte. Pas de troisième chemin.
6. **Deux signaux, distincts.**
   - *Anomalie qualifiée « corrigée » sans écriture identifiée* : le dossier affirme qu'une
     correction existe, aucune écriture de version ne la porte. Le cumul est faux.
   - *Écriture de correction sans anomalie correspondante* : le client dit répondre à un constat que
     notre dossier ne porte pas. Soit nous avons omis de le consigner, soit il corrige autre chose.
   La plateforme **pose la question, elle ne tranche pas**.
7. **La règle du versionnement tient ici aussi** (ADR-030) : une correction **annoncée** dans une
   version reçue et **non prise en compte** n'a rien corrigé. La table de bascule dit de combien le
   cumul bougerait, et **chaque ligne est un calcul réel** — la version y est prise en compte, le
   dossier réévalué, puis l'état rétabli.

**Le jeu de données** reçoit une **version 4**, « Après les constats de l'audit », avec quatre
écritures : trois répondent à une anomalie relevée au test des écritures, la quatrième dit répondre
à un constat absent du dossier (c'est le signal 2, présent par construction).

**Mesure**, à la prise en compte de la version 4 : **3 anomalies sur 4 passent de « non corrigée » à
« corrigée » sans aucune saisie**, pour 103 130 € ; le cumul non corrigé tombe de 123 130 € à
26 200 €. Les 20 000 € qui restent sont le solde de la correction partielle `OD-V4-003` — 30 000 €
passés sur un constat de 50 000 €.

**Défaut corrigé au passage.** La synthèse des anomalies et la vue d'achèvement affichaient
constaté, expliqué et résiduel sans colonne « corrigé » : le pied de table ne s'additionnait plus
dès qu'une écriture corrigeait quelque chose (129 330 − 0 ≠ 26 200). La colonne existe maintenant
dans les deux vues, et le harnais vérifie que le pied s'additionne.

**Le noyau existe aussi côté application** (`app/src/lib/kernel/adjustments.ts`, 17 tests) : c'est
une règle du produit, pas un effet de démonstration. Les tests couvrent la borne, le signe, la
correction partielle, l'ordre de service, les deux signaux, et la correction annoncée qui ne corrige
rien.

---

## ADR-052 — L'indépendance ne se rappelle pas, elle refuse

**Demande du fondateur, 2026-08-26.** Un écran d'équipe et d'indépendance, avec une règle qui le
rende réel : aucun travail attribuable à un membre dont la déclaration n'est pas signée, et un travail
attribué à quelqu'un dont la déclaration est devenue caduque comme obstacle au visa de sa section.

**Décision.**

1. **L'équipe est une donnée**, plus une liste figée : grade, rôle, courriel, dates d'entrée et de
   sortie, et **nombre d'exercices consécutifs sur ce client**. On ajoute, on modifie.
2. **On ne retire pas quelqu'un qui a signé quelque chose.** Un membre portant une trace au dossier —
   un travail, une note, un visa, une déclaration — reçoit une **date de sortie**. Même famille de
   règle que le journal d'événements, qui ne se réécrit pas.
3. **Déclaration par membre et par exercice, sept rubriques.** Elle se **signe soi-même** : le bouton
   n'est pas rendu ailleurs, et la fonction refuse. Un « oui » sans précision écrite ne se signe pas.
4. **Une révision empile, elle n'écrase pas.** La version signée reste lisible avec sa signature ; la
   nouvelle part de ses réponses ; tant qu'elle n'est pas signée, le membre est **caduque**.
5. **La règle qui rend tout cela réel** : `affecter()` refuse un membre sans déclaration valide, et
   `obstaclesVisa()` porte les travaux attribués à un membre devenu caduque. La **répartition
   proposée** filtre les mêmes personnes — proposer quelqu'un que l'affectation refuserait ensuite
   serait une proposition fausse.
6. **Confirmation de l'associé signataire pour l'ensemble**, impossible tant qu'un membre n'a pas
   signé ou qu'une menace n'a pas de sauvegarde écrite.
7. **Deux menaces déduites de l'ancienneté** — rotation du signataire, familiarité — exigeant chacune
   une **sauvegarde décrite**.
8. **Registre des services autres que la certification** : nature, montant, date, prestataire,
   admissibilité, et ratio d'honoraires rapporté à la mission.

**Réserve, portée à l'écran et non seulement ici.** Durée de rotation, seuil de familiarité, seuil de
déclaration des cadeaux, plafond du ratio et **liste des services interdits** sont des **paramètres
déclarés**, modifiables, marqués **[UNVERIFIED]**. Aucun texte primaire n'est atteignable depuis cet
environnement. C'est la même réserve que celle du catalogue méthodologique — et sur l'indépendance,
une valeur fausse coûte plus cher qu'ailleurs.

**État du dossier à l'amorce, choisi pour que la règle se voie** : Hugo n'a pas signé, Inès a ouvert
une révision en mars, et les dix travaux de la section Clients qui lui avaient été attribués en
novembre bloquent désormais le visa de cette section.

---

## ADR-053 — Quatre dates, pas cent

**Décision.** Les échéances des travaux ne se saisissent plus : elles se **déduisent de quatre jalons
de mission** — intervention intérimaire, intervention finale, date du rapport, et échéance
d'assemblage. Une règle écrite et affichée fait la correspondance.

- **L'échéance d'assemblage ne se saisit pas** : c'est un délai légal compté depuis la date du
  rapport. Une date qu'on peut taper à la main est une date qu'on peut taper fausse.
- Chaque échéance **reste modifiable** ligne par ligne et **en lot** sur la sélection. Une échéance
  écrite ne bouge plus quand le jalon bouge — c'est une décision — et se rend à la règle quand on
  l'efface.
- **Ajout d'un travail à la main**, rattachable à une section, portant les mêmes règles que les
  autres : affectation, budget, échéance déduite, niveau de revue, statuts.
- **« Sans objet » plutôt qu'une suppression**, avec **motif obligatoire**. Le travail reste au
  programme, motivé, cesse de produire des obstacles et de consommer du budget. Un travail **déjà
  achevé n'est pas sans objet** : c'est une diligence exécutée.

**Corollaire (ADR-054 ci-dessous)** : le barème de budget et les règles de revue **quittent** le
programme de travail. Ce sont des explications de règles, pas des surfaces de travail — la règle
agit, dans la colonne « budget » et dans le refus d'affecter un réviseur de niveau insuffisant.

---

## ADR-054 — Deux noms proches pour deux objets différents est un défaut, et il se mesure

**Constat du fondateur.** « Plan de travail » (destination d'une section) et « Programme de travail »
(livrable d'organisation de la mission) désignaient deux objets sans rapport.

**Décision.** La destination devient **« Procédures d'audit »**, et sa référence de papier suit
(`PGM-01` → `PRO-01`). Surtout, la vérification devient **mesurable** : un harnais compare tous les
libellés navigants deux à deux — inclusion, distance d'édition ≤ 2, deux mots partagés en tête ou en
queue — et **exige une raison écrite** pour chaque couple à risque admis. Un couple non admis fait
échouer le harnais. Le harnais se vérifie lui-même : il retrouve le défaut d'origine si on le
réintroduit.

Quatre autres collisions corrigées : « Règles » → « Règles de conception », « Ratios » → « Ratios de
planification », « Rapprochement » (achèvement) → « Pointage plaquette ↔ comptes audités »,
« Export » (mission) → « Exporter cette vue ». Sept couples restent admis, chacun avec sa raison
écrite — pour l'essentiel le même objet à deux portées.

---

## ADR-055 — Les facteurs qualitatifs remontent ; le questionnaire ne garde que le résiduel

**Mesure de départ, donnée par le fondateur.** Le registre comptait **cinq règles de levée
quantitatives et une seule qualitative** : l'évaluation du risque reposait à **83 %** sur des
variations chiffrées.

**Décision, en deux temps.**

1. **Cinq règles qualitatives de plus**, qui lèvent depuis des procédures qui les captent déjà :
   `ESTIM` (part du poste portée par des comptes d'estimation — la subjectivité se **mesure**),
   `TIERS_UNIQUE` (dépendance à un tiers unique), `RETRAITEMENT` (changement d'estimation ou de
   méthode passé en cours de mission), `CORRECTION_N` (le poste a exigé une correction sur constat
   d'audit), `NOTE_N1` (anomalie relevée sur ce poste l'exercice précédent).
2. **Un questionnaire RÉSIDUEL** : dix questions au total, **six par section** et quatre pour
   l'entité, chacune portant **la raison pour laquelle aucune autre source du dossier n'y répond**.
   Si cette raison tombe, la question doit disparaître. Les cinq anciennes cases à cocher
   « déclarées » sont supprimées : elles n'avaient ni justification ni source.

**Une réponse « oui » crée un facteur au registre**, avec sa source — le questionnaire n'a pas de
chemin à lui. Le facteur naît **confirmé** : la réponse EST la décision humaine, et redemander à
quelqu'un de confirmer ce qu'il vient de répondre est la cérémonie qui fait qu'on cesse de lire. Il
reste écartable avec motif comme tout autre facteur.

**Ce qui bloque, et pourquoi.** Une question **sans réponse** et un « oui » **sans précision écrite**
sont des obstacles au visa. Sans cela le questionnaire serait décoratif — exactement le défaut qu'on
cherchait à corriger.

**Ce que le seuil de `TIERS_UNIQUE` a coûté, parce qu'il dit ce que vaut un seuil.** Au premier essai
— part ≥ 25 %, sans autre garde — la règle levait **huit** facteurs. En regardant la distribution,
les quatre plus concentrés (77 %, 76 %, 62 %, 56 %) portaient tous **deux à quatre tiers** : avec
deux tiers, l'un des deux pèse forcément plus de la moitié. Le nombre était une conséquence
arithmétique de la population, pas une dépendance. Un **plancher de population** — cinq tiers — a
été ajouté, et la part absolue conservée, parce que c'est elle qui répond à la question de
l'auditeur : si ce tiers disparaît, le poste tient-il ? **Quatre facteurs** restent ; deux seront
sans doute écartés au triage, avec un motif.

**Mesure d'arrivée** : **onze règles, cinq quantitatives et six qualitatives — 45,5 % de règles
quantitatives**, contre 83 %. Sur les facteurs réellement levés : **neuf qualitatifs pour sept
quantitatifs**. Le registre passe de huit à seize facteurs, **au-delà de la cible de quinze** : le
garde-fou de volume le dit, et il a raison de le dire.

**Vocabulaire.** Les natures — changement, complexité, incertitude, biais possible de la direction —
sont celles des facteurs de risque inhérent des référentiels d'audit. **[UNVERIFIED]** : sources
secondaires seulement, aucun texte primaire n'ayant pu être atteint.

---

## ADR-056 — Le pilotage d'abord, et la couleur ne dit qu'un problème

**Décision.** L'espace **Pilotage passe en premier** et devient l'espace d'ouverture. Un associé qui
ouvre l'outil doit voir l'état du dossier, pas un écran de travail. Corollaire trouvé en le faisant :
`aller()` **déduit désormais l'espace de la vue** — naviguer vers une vue d'un autre espace la
rendait dans l'espace courant, bandeau de seuils absent et rail incohérent. Le cas ne se produisait
pas tant que l'espace auditeur était celui d'ouverture.

**Cinq représentations** : avancement par section, budget contre réalisé, achèvements dans le temps
rapportés à l'échéance, charge par personne, âge des demandes en retard.

**La contrainte décide de tout.** Les graphiques se tracent **à l'encre** — les trois gris du texte
et le filet — et la **couleur reste réservée aux problèmes**. Aucune palette de graphique, aucun
dégradé, aucune teinte hors jetons. Conséquence de conception : ce sont des **barres et des lignes,
jamais des secteurs**, parce qu'une série sans couleur ne se distingue que par sa **position**, sa
**longueur** et sa **densité** — d'où les hachures pour ce qui est fait.

Un harnais mesure la contrainte au lieu de la promettre : il relève toute teinte employée dans un
`<svg>` qui n'est pas un jeton du système, tout dégradé, tout filtre, **dans les deux thèmes**. Il a
relevé au premier passage le noir par défaut de SVG sur des traits et des `<defs>` — des éléments qui
ne peignent rien, mais dont la teinte n'était pas voulue. Elle a été retirée plutôt qu'excusée.

**Compteurs de design après cette passe : 2 / 0 / 5 / 0.** Le quatrième était à **1** avant :
`var(--topH,180px)` était écrit sur cinq sites, autant de littéraux hors échelle. La hauteur du
bandeau collant est désormais un **jeton déclaré** (`--sTop`) — c'est un espacement du système au
même titre que les six autres, simplement mesuré au rendu plutôt que choisi.

---

## ADR-057 — Un testing déroulé de bout en bout, et les deux défauts qu'il a trouvés

**Demande du fondateur.** « Je veux voir ce que le produit rend, pas la machinerie vide. » Le test de
détail du chiffre d'affaires est donc **déroulé dans l'état initial du fichier** : échantillon,
requête, dépôts, états dérivés, champs relevés, un écart résolu, un écart laissé au cumul, une note
posée puis close, travail achevé par son préparateur et revu par sa réviseuse, papier imprimable.

**Décision de méthode : rien n'est fabriqué.** Chaque étape passe par la **même fonction que le clic
correspondant** — `affecter`, `requeteJustificatifsProc`, `deposer`, les champs du papier,
`conclureResolution`, `ajouterNote`, `changerStatut`. Si une règle refusait une étape, l'amorce
échouerait au lieu de produire un faux papier. C'est la seule façon de garantir que ce qu'on montre
est ce que l'outil fait.

**LE DÉROULÉ A TROUVÉ DEUX DÉFAUTS RÉELS, dont un grave.**

1. **Soixante-seize écarts sur cent quinze factures parfaitement normales.** La règle de date
   `dans l'exercice` est écrite en JSON avec l'apostrophe **droite** ; le `switch` du moteur était
   écrit avec l'apostrophe **typographique**. Aucun cas ne correspondait, l'exécution filait au
   **défaut silencieux** — comparaison à la tolérance, ici nulle — et toute facture datée d'un jour
   avant sa comptabilisation devenait une anomalie. *Le vrai défaut n'est pas la lettre : c'est
   qu'une règle inconnue tombe silencieusement sur autre chose.* Le schéma du catalogue déclare
   désormais l'énumération des règles de date, le validateur **arrête l'assemblage** sur une règle
   inconnue (vérifié en le provoquant), et la comparaison normalise l'apostrophe. **76 écarts → 1**,
   et celui qui reste est la vraie anomalie de cut-off du jeu de données.
2. **Un panneau replié s'imprimait replié.** La règle CSS `details:not([open]) > * { display:block }`
   **ne suffit pas** : le navigateur supprime le rendu au niveau du `<details>` lui-même. Mesuré :
   le contenu sortait à **zéro caractère** au papier alors que le `display` de l'enfant était bien
   `block`. Il faut **ouvrir** les panneaux à `beforeprint` et les refermer à `afterprint`, en ne
   refermant que ceux qu'on a ouverts. Mesuré après correction : 1 907 caractères au papier pour un
   panneau qui en rendait 0 à l'écran.

**Le résultat, et ce qu'il dit de l'échantillonnage.** La strate exhaustive retenait 115 éléments sur
269 — 73 % de la masse — **sans rencontrer aucune des deux anomalies de montant présentes dans la
population**. C'est l'ADR-047 reproduit sur le dossier vivant. Le déroulé applique donc ce que
l'écran recommande : sondage en unités monétaires à la taille qui ramène l'intervalle au seuil de
planification. **167 éléments — plus de travail, pas moins — et les deux anomalies rencontrées.**

L'une, une remise commerciale de 620 €, est expliquée, corroborée par l'avoir et l'écriture, et
résolue ; sous le seuil de remontée, elle n'entrait pas au cumul — ce qui ne dispense pas de la
documenter. L'autre, un retour de marchandise de 4 850 €, reste **non résolue et au cumul**. Neuf
écarts non chiffrés (signatures, quantités, livraisons) restent ouverts : le travail est *achevé et
revu*, la **section n'est pas visée** — et cette distinction est précisément ce que le dossier doit
montrer.

---

## ADR-058 — Le rail se partitionne par NATURE d'objet, et n'en déploie qu'un groupe

**Le constat du fondateur, et sa cause.** Quarante-six destinations dans le rail, dont **quinze sous
« 1 · Planification »**. La cause n'est pas la largeur : « Planification » n'était plus une phase,
c'était un **fourre-tout** mêlant cinq natures — la mise en place de la mission, les données du
dossier, la planification proprement dite, des **procédures transverses** et des **sorties**. « Le
test des écritures n'est pas de la planification, c'est un travail. La synthèse des anomalies non
plus, c'est un résultat. »

**Décision. Un groupe réunit des objets de même nature**, et rien d'autre :

| Groupe | Ce qu'il réunit | n |
|---|---|---|
| Mission | équipe et indépendance · **jalons et échéances** · programme de travail · jeu de données · principes | 5 |
| Données du dossier | import et rapprochement · versions du fichier · ajustements et retraitements | 3 |
| Planification | matérialité · scoping · revue analytique préliminaire · facteurs de risque · analyse sectorielle · parties liées · LCB-FT | 7 |
| Travaux transverses | test des écritures · circularisations · revues de processus | 3 |
| Bilan / Compte de résultat | les sections, inchangées | 12 / 9 |
| Achèvement | les huit, inchangés | 8 |

**Synthèse des anomalies** et **piste d'audit** quittent la planification pour le **Pilotage** : ce
sont des **états du dossier**, pas des travaux de planification.

**Deux écarts assumés par rapport à la proposition reçue.** *Programme de travail* rejoint **Mission**
— c'est le roster des travaux, donc de la mise en place. Et les **jalons deviennent leur propre
destination** : quatre dates dont **toutes** les échéances se déduisent sont un réglage de mission,
pas la tête d'un tableau de soixante lignes qu'on ouvre pour autre chose. Renommés **« Jalons et
échéances »** : trois destinations finissant par « de la mission » se lisent mal hors contexte, et le
nom retenu dit en plus ce que les quatre dates commandent. Le harnais de libellés l'a exigé.

**Un seul groupe déployé.** Le rail **suit la destination courante** : aller quelque part déploie son
groupe, d'où qu'on vienne. Ouvrir un en-tête à la main n'est qu'un cas particulier de la même règle,
et une destination sans groupe (« Mes travaux ») ne le défait pas. La première version pinglait le
groupe ouvert **au-dessus** de la navigation : ouvrir une section depuis « Mes travaux » laissait
alors le rail déployé ailleurs, et la destination courante devenait invisible. Le harnais l'a relevé.

**Mesure, avant et après**, sur le fichier livré :

| | avant | après |
|---|---|---|
| destinations visibles au premier écran (1500 × 900) | **18 sur 46** | **13 sur 13** — 7 en-têtes + les 6 du groupe déployé |
| hauteur du rail | **1 624 px** (fenêtre : 900) | **436 px** |
| hauteur du rail à 390 px de large | **1 608 px** | **436 px** |
| options du sélecteur mobile | 46 | 48 |

Le rail ne défile plus : il tient dans la fenêtre, et l'arborescence complète reste à un clic.

**Ce que la mesure ne dit pas.** Le nombre total de destinations a **augmenté** (46 → 48 : « Mes
travaux », les jalons, et les deux sections hors périmètre désormais atteignables). Ce n'est pas une
contradiction : le problème n'a jamais été le nombre de portes, c'était le nombre de portes ouvertes
en même temps.

**Une dépendance à déclarer.** Les quatre dates de l'écran des jalons sont des `<input type="date">`
natifs : leur format d'affichage suit la **locale du navigateur**, pas le `lang="fr"` du document. Sur
un navigateur configuré en anglais — ceux des harnais, notamment — elles se lisent `MM/JJ/AAAA`. Tous
les autres affichages de date du prototype passent par `frDate()` et sont en `JJ/MM/AAAA`, y compris
la même date rendue juste en dessous dans le tableau des règles.

---

## ADR-059 — « Mes travaux » : on ouvre sa liste, pas l'arborescence du dossier

Le rail est organisé selon la structure du **dossier**. C'est la bonne organisation pour retrouver un
objet — ce n'est pas celle avec laquelle on travaille. **« Mes travaux » est donc la première entrée,
au-dessus des groupes**, et l'espace auditeur **s'y ouvre par défaut**.

Elle porte quatre blocs, tous en **lecture** de ce que les autres écrans ont produit : à préparer
(triés par échéance, puis par nombre d'obstacles), à revoir, mes notes de revue ouvertes, les visas
que je peux poser. Chaque ligne dit **ce qui la bloque** en toutes lettres — déclaration
d'indépendance non signée, travail à reconfirmer sur la version courante, obstacle de procédure,
absence de réviseur, notes ouvertes — et porte le lien **direct vers le papier** : la section s'ouvre
sur sa destination « Procédures d'audit », la procédure déjà dépliée. Trois clics deviennent un.

Un tableau de bord personnel qui porterait un état à lui serait un **second dossier** : rien ne s'y
saisit.

**JAMAIS dans le portail client.** « Mes travaux » porte les affectations, les statuts de revue et
les visas de l'équipe. La première version la rendait dans les trois espaces — le harnais du rail
l'a relevée comme fuite, et le portail est un environnement distinct, pas un filtre d'affichage.

**Amorce.** Le senior du cycle des ventes n'a pas attendu qu'on ouvre l'outil pour avoir ses travaux :
une seconde affectation d'amorce pose la section CA sur Karim Benali. Contrairement à celle d'Inès —
posée hors règle, exprès, pour produire l'obstacle au visa — elle **emprunte `affecter()`** et subit
donc toutes les règles. Sans elle, « Mes travaux » s'ouvrait vide : ce n'est pas l'état d'une mission
en mars, et une porte d'entrée vide ne démontre rien.

---

## ADR-060 — Chercher et filtrer les sections sans re-rendre le rail

Dix-neuf sections dans deux groupes, c'est trop pour l'œil nu. Le groupe des sections porte donc une
**recherche** — nom, code, ou **numéro de compte** (`411` isole « Clients ») — et cinq filtres :
sections retenues (défaut) · avec obstacles au visa · affectées à moi · non visées · **hors
périmètre**.

**Le filtre masque, il ne re-rend pas.** Toutes les sections sont dans le DOM ; la recherche pose
`hidden` sur celles qu'elle écarte et met à jour les deux en-têtes. Re-rendre à chaque frappe
sortirait le curseur du champ — le harnais le vérifie caractère par caractère.

**Un défaut trouvé en écrivant le filtre.** `postesDeMasse()` filtrait déjà sur le périmètre : sortir
un poste du périmètre le faisait **disparaître du rail**, et on ne pouvait plus l'ouvrir pour relire
le motif de sa sortie. Un « dans le périmètre seulement » n'aurait donc rien filtré du tout. Corrigé
par `postesDeMasseTous()`, et l'option devient son inverse — « hors périmètre ». L'en-tête dit
désormais **« Bilan — 11 / 12 poste(s) »** : un poste sorti existe toujours, et le rail doit le dire.

---

## ADR-061 — Le portail client s'ouvre sur la DETTE, pas sur un inventaire

« Un client qui ouvre le portail doit voir sa dette, pas un inventaire. » L'ordre par défaut n'est
donc ni celui de création, ni celui des sections d'audit : c'est celui dans lequel il doit s'y mettre.
**Quatre rangs** — en retard · à rendre avant la prochaine relance · ensuite · déjà déposées — chacun
trié par échéance croissante, le dernier **replié** : c'est de l'archive, elle n'occupe pas le haut de
l'écran de quelqu'un qui a du retard. En tête, la dette chiffrée : *« il vous reste 9 documents à
déposer, sur 4 demandes »*.

**Le seuil de « bientôt » n'est pas un nombre choisi pour faire joli** : c'est la **cadence de
relance du portail** (5 jours ouvrés). Ce qui rend une demande visible dans ce rang est exactement ce
qui déclenchera son rappel. Bouger la cadence bouge le rang.

**Filtre par DOMAINE MÉTIER, jamais par code de section.** « CLIENTS » et « CA » sont deux sections
d'audit ; pour la DAF, c'est un seul sujet — les ventes. Chaque poste porte donc un `dom` parmi neuf
domaines, et le portail ne propose que ceux réellement représentés. Un poste sans domaine, ou avec un
domaine inconnu du registre, **empêche le démarrage** : le filtre deviendrait silencieusement
incomplet et une demande introuvable sans qu'aucun écran ne le dise.

**Un défaut trouvé en écrivant la règle des jours ouvrés.** `ancienneteRetard()` écrivait « pas un
week-end, sauf samedi ouvré » — formulation qui compte le **dimanche** comme ouvré dès qu'on ouvre le
samedi. Une règle de jours ouvrés, **une seule écriture** : `ouvrePortail()`, partagée, et le harnais
vérifie les deux configurations.

**Deux demandes non échues ont été ajoutées à l'amorce** (inventaire physique à +3 jours,
immobilisations à +20). Sans elles le portail n'avait que du retard et du soldé, et l'ordre de la
dette ne se lisait sur aucun écran.

---

## ADR-062 — Le questionnaire résiduel de risque rejoint `methodology/`

Il était écrit dans `11_state.js` du prototype : dix questions, cinq natures de risque inhérent, la
raison d'exister de chacune. **C'est de la méthode, pas du code de démonstration** — au même titre
que les 56 procédures. Il vit désormais dans `methodology/questionnaire.json`, validé contre
`methodology/schema-questionnaire.json` par le **même** `valider.mjs`, consommé par l'application
(`app/src/lib/methodology/`) et intégré au prototype à la construction.

**Ce que le déplacement a permis de rendre opposable.**

- **La portée et la nature sont des énumérations déclarées, et le validateur arrête l'assemblage.**
  C'est la leçon de l'ADR-057 appliquée avant l'accident : un `portee` mal orthographié tomberait
  silencieusement du côté « section », et la question d'entité serait posée dix-neuf fois au lieu
  d'une. Une portée entière vide est refusée aussi — elle rendrait un écran vide sans rien dire.
- **`disparait_quand`** nomme la condition qui rendra une question inutile : `CI` s'en va le jour où
  le module de contrôle interne existe, `GOUVERNANCE` le jour où les procès-verbaux entrent au
  dossier. C'est le seul moyen qu'un questionnaire résiduel ne devienne pas un questionnaire de
  confort.
- **Les sources sont au registre, et non vérifiées.** Le vocabulaire des natures (changement,
  complexité, incertitude, biais possible de la direction) vient des référentiels d'audit : une
  entrée `ISA-315` a été ajoutée à `sources.json`, `verifie: false`, comme les dix-huit autres.
  L'accès aux textes primaires a été **retenté le 2026-08-26** : `iaasb.org` et `legifrance.gouv.fr`
  répondent toujours par un refus du proxy (CONNECT 403). Chaque question **affiche désormais à
  l'écran** sa source et la mention `[UNVERIFIED]`.

**Un test écarté.** Une assertion vérifiait par expression régulière que la raison d'exister « oppose
quelque chose au reste du dossier ». Elle a recalé une raison parfaitement écrite. Un motif sur de la
prose française recale les bonnes formulations et laisse passer les mauvaises : remplacé par ce qui
se vérifie vraiment — aucune raison n'est recopiée d'une autre question, et l'effet ne répète pas la
raison.

---

## ADR-063 — Les harnais du prototype entrent au dépôt

Ils vivaient dans un répertoire de travail éphémère. STATUS.md affirmait « 29 harnais sans échec »
et **rien dans le dépôt ne permettait de le rejouer** : une vérification que personne ne peut refaire
n'est pas une vérification, c'est une affirmation. `prototype/pw/` porte désormais les **31 harnais**
et leur lanceur, avec un README qui dit pour chacun **ce qu'il empêche de casser** — et ce qu'aucun
d'eux ne prouve.

Deux défauts corrigés en les déplaçant, tous deux du même genre — un chemin en dur qui marche ici et
nulle part ailleurs :

- Le chemin du navigateur était écrit **trente et une fois**. Il est écrit une fois, dans `_nav.mjs`,
  et se résout par `OTTO_CHROMIUM`, puis `PLAYWRIGHT_BROWSERS_PATH`, puis la résolution par défaut
  de Playwright.
- `'file://' + process.argv[2]` exige un chemin **absolu** : donné relatif, le navigateur rend
  `ERR_INVALID_URL` sans dire pourquoi. `cible()` résout, vérifie l'existence du fichier, et dit
  lequel manque.

**Et le lanceur lui-même avait le défaut qu'il est censé attraper.** Trois harnais importaient
`{ chromium, devices }` : la réécriture d'import ne les a pas touchés, ils sont morts à la première
ligne — et `tout.sh` les a rendus **« ok + PLANTAGE »**, l'« ok » venant de ce qu'aucune ligne
`ÉCHEC` n'avait pu être écrite. Un harnais **muet** passait donc pour vert. `tout.sh` compte
désormais les lignes rendues : **zéro ligne est un échec**, et un plantage n'est plus précédé d'un
« ok ». C'est le même défaut qu'ailleurs dans ce dépôt — le silence lu comme un succès.

---

## ADR-064 — La persistance, refusée sept fois, acceptée pour une autre raison

Elle a été écartée à chaque passe, et pour un motif qui tenait : un prototype qui garde un état est
un prototype dont on ne sait plus dans quel état il est, et la fidélité au produit ne se joue pas là.

**Ce n'est plus l'argument qui compte.** Le prototype n'a plus qu'un emploi — être montré à des
auditeurs — et un rafraîchissement accidentel renvoyait le dossier entier à son état d'amorce, devant
le confrère. La décision ne renverse pas la précédente : elle change de critère.

**Ce qui est écrit : tout `S`, plus l'horloge.** Pas de liste blanche — une liste blanche oublie un
jour une décision, et l'oubli est silencieux. Mesuré : **1,3 Mo**, ~13 ms de sérialisation, ~35 ms
d'écriture ; sous le plafond usuel de `localStorage` (≈ 5 Mo) et invisible derrière une temporisation
d'inactivité de 700 ms. Les caches dérivés ne sont **pas** rangés : les restituer serait garantir
qu'ils reviennent un jour périmés.

**On écoute les gestes, pas les rendus.** Plusieurs gestes ne re-rendent rien — le germe d'une
sélection, une conclusion en cours de frappe — et un `sauver()` posé dans `render()` les aurait
perdus. Les écouteurs sont donc sur `input`, `change` et `click`, **en capture**, plus un écrit
immédiat sur `pagehide` et sur le passage en arrière-plan : c'est exactement le moment que la
temporisation ne couvre pas, et exactement celui qu'on cherche à couvrir.

**L'empreinte.** Un instantané pris sur une version antérieure du fichier rendrait un dossier à
moitié cohérent — pire qu'un dossier vide. L'instantané porte la liste des clés de `S` et un numéro
de schéma ; au moindre écart il est **écarté, effacé, et l'écran le dit**.

**Trois échecs possibles, trois messages.** Quota dépassé, stockage refusé (fenêtre privée), état non
sérialisable. « Échec » tout court n'aiderait personne ; l'indicateur nomme la cause. Vérifié en
provoquant le refus : le prototype **fonctionne** sans stockage, et affiche `NON ENREGISTRÉ`.

**Le défaut que le harnais a trouvé, et qui aurait ruiné la fonction.** « Repartir de zéro » efface
puis recharge — et le rechargement déclenche `pagehide`, donc une **dernière écriture**, qui remettait
aussitôt en place l'état qu'on venait d'effacer. Le bouton ne repartait de rien. Un verrou
`_razEnCours` interdit toute écriture dès que la remise à zéro est engagée.

---

## ADR-065 — Plus un seul `<input type="date">` : les dates sont françaises

Un `<input type="date">` affiche le format de la **locale du navigateur**, jamais celui du document :
le `lang="fr"` n'y change rien. Sur un navigateur configuré en anglais, la date de rapport d'un
dossier français s'écrit `04/15/2026`.

L'ambiguïté n'est pas cosmétique. **« 04/03 » ne dit alors ni le 4 mars ni le 3 avril**, et c'est une
date d'échéance légale. Devant un confrère, c'est un tue-crédibilité.

**Décision : un champ TEXTE au format `JJ/MM/AAAA`**, rendu par `champDate()` et relu par
`isoDepuisFr()`. Une seule écriture de la règle, six sites de saisie, et un harnais qui vérifie qu'il
ne reste **aucun** `type="date"` dans le fichier livré et **aucune date non formatée à l'écran**.

**Le parseur refuse au lieu de deviner.** Le 31/02 n'est pas le 3 mars : il est **rejeté**. Un champ
vide reste une valeur ; une date illisible **marque le champ en rouge, garde la saisie fautive
visible pour qu'on la corrige, et n'écrit rien**. Garder silencieusement l'ancienne valeur ferait
croire que la saisie a été prise en compte — c'est le défaut silencieux de l'ADR-057, une fois de
plus.

**Ce que cela coûte, et qui est assumé** : le sélecteur de calendrier natif. Un auditeur tape une
date, et `inputmode="numeric"` donne le pavé numérique sur téléphone.

**Corollaire :** `build.sh` copie désormais lui-même le fichier assemblé vers `prototype/`. La copie
à la main avait déjà produit une mesure faite sur un fichier et une livraison d'un autre.

---

## ADR-066 — Le sélecteur d'identité passe à la ligne sur téléphone

À 390 px, la barre des espaces défilait horizontalement et le sélecteur d'identité débordait de
31 px : il n'était atteignable qu'en faisant défiler la barre. Or c'est la première chose qu'on
montre — « je suis Karim, préparateur ». **Une identité qu'il faut aller chercher n'est pas une
identité affichée.**

La barre **passe à la ligne** au lieu de défiler, et l'identité prend sa propre ligne entière. Coût :
une trentaine de pixels de chrome vertical sur téléphone, absorbés par `--sTop`, qui est mesuré au
rendu et non écrit en dur.

---

## ADR-067 — DEMO.md porte le parcours, et un harnais garantit qu'il dit vrai

Un script de démonstration qui cite des chiffres vieillit mal : le jour où une règle bouge, le
document promet un chiffre que l'écran ne rend plus, et on s'en aperçoit **devant l'auditeur**.

`prototype/pw/parcours.mjs` **rejoue le parcours de DEMO.md étape par étape** sur le fichier livré et
échoue si l'un des chiffres cités bouge : 5 lectures graphiques · 6 travaux dans « Mes travaux » ·
167 éléments retenus et 167 lignes de papier · les anomalies de 620 € et 4 850 € · **10 obstacles**
au visa du chiffre d'affaires alors que le travail est revu · 16 constatations sur 11 sections ·
le refus d'affecter Hugo Vasseur · la bascule **0 → 3 anomalies corrigées** et **127 980 € → 31 050 €**
de résiduel, **annoncée au centime avant** d'être jouée · 9 documents dus et 4 rangs au portail ·
l'absence totale de seuil dans l'espace client.

Le document porte aussi **la phrase à dire** à chaque étape, un tableau des questions qu'on reçoit
(« c'est de l'IA ? », « les normes sont justes ? ») avec leur réponse, et **ce que le parcours ne
montre pas** — à dire avant qu'on le demande.

---

## ADR-068 — DEMO.md fait écouter, pas parler

Le parcours ne comportait **aucun moment de silence**. Or ce n'est pas une démonstration qu'on va
faire : c'est un test d'hypothèse, et `docs/10_FALSIFICATION.md` existe depuis des semaines sans
avoir servi une seule fois.

**Trois pauses, à des endroits choisis, chacune rattachée à une question de falsification.**
Après le testing (« est-ce que c'est comme ça que vous le faites ? ») → **Q2**, les heures par cycle
et le grade de qui les passe. Après le visa refusé (« qu'est-ce qui vous arrêterait, vous, à ce
moment-là ? ») → **Q3**, l'acceptabilité du positionnement à côté du dossier. Après le portail
(« qu'est-ce qui manque pour que votre client s'en serve ? ») → **Q4**, le dépôt de pièces. Chaque
pause dit **de se taire**, donne une relance unique, et nomme ce qu'on cherche.

**Le budget de temps est ferme et vérifié** : neuf étapes (5 min 30), trois pauses (1 min), la
demande de fin (30 s) — **420 secondes exactement**, sur un entretien de vingt minutes. Il en reste
treize pour écouter. `pw/parcours.mjs` additionne les durées écrites dans le document et **échoue
au-delà de 420 s** : un script qui déborde n'est plus un script, c'est un monologue.

**Une feuille de capture, une page par entretien**, à remplir dans les dix minutes — ce qui n'est pas
écrit tout de suite devient un souvenir arrangé. Elle recueille ce sur quoi il s'est arrêté, **ce
qu'il a ignoré** (aussi instructif : c'est ce qu'on a construit pour rien), ce qu'il a demandé à
revoir, ses objections **mot pour mot**, son outillage et son coût, et le circuit de décision. Les
six questions y sont cochables `confirme / tue / sans réponse` — et « sans réponse » n'est pas une
demi-confirmation, c'est une question à reposer.

**Trois demandes de fin**, par engagement croissant : l'essai sur un dossier clos (risque nul pour
lui, seule demande qui produise une observation et non une opinion), deux confrères (**deux**, pas
« des » : un chiffre appelle des noms), puis le prix. Règle absolue : **ne jamais citer un chiffre en
premier** — Q5 ne compte comme confirmation que si le montant vient spontanément, et un ancrage rend
la réponse sans valeur. On s'arrête à la première demande qui reçoit un non franc.

Le tableau de dépouillement est recopié de `docs/10_FALSIFICATION.md`, qui reste la source, avec
trois règles qui valent autant que les seuils : une case vide ne compte pas et n'est pas neutre ; on
dépouille à douze entretiens, pas à quatre ; **le verbatim l'emporte sur la case cochée**.

---

## ADR-069 — Équipe et indépendance dans l'application, et l'isolation qu'on ÉPROUVE

**Une correction d'abord, sur l'état réel du dépôt.** L'isolation par cabinet **existait déjà** :
`tenant_id` sur toutes les tables racines, politiques RLS (migration 0004), garde applicative
(ADR-007). Il n'y avait pas de `firm_id` à poser. Ce qui manquait n'était pas la fondation, c'était
la **preuve** qu'elle tient — et un objet de plus pour l'éprouver.

**La règle, et rien qu'elle.** Aucun travail n'est attribué à qui n'a pas signé sa déclaration. Le
système refuse ; il ne rappelle pas. Même famille que « on ne clôt pas sa propre note » (0009) et que
l'ordre des visas (0009).

**Ce que la base garantit, plutôt que le code.** Une déclaration se signe **soi-même**
(`check (signed_by = user_id)`), une déclaration signée **ne se réécrit pas et ne se supprime pas**
(trigger), une révision **exige un motif écrit** (`check`). Les tests vérifient chacune en essayant
de la contourner **par SQL direct**, service court-circuité : une règle qui ne tient que dans la
couche applicative ne tient pas.

**La révision EMPILE.** `version` monotone, `superseded_by` sur la précédente, qui reste lisible avec
sa signature et son contenu. Tant que la révision n'est pas signée, l'indépendance ne tient plus — et
un membre **déjà affecté** dans cet état produit un **obstacle au visa**. Sans ce prolongement, il
suffirait d'affecter avant de réviser pour passer au travers.

**Deux défauts trouvés par les tests, tous deux réels.**

1. **L'ordre des refus était faux.** `assignMember` vérifiait la déclaration avant la sortie de
   mission. Une personne sortie qui avait aussi une révision en cours s'entendait dire « signez votre
   déclaration » : elle aurait signé, et aurait été refusée quand même. *Un motif de refus qui envoie
   corriger la mauvaise chose est pire qu'un refus sec.* La sortie se vérifie d'abord.
2. **Les horodatages revenaient en `Date` là où le type disait `string`.** `select *` mentait sur la
   forme des données et cassait à l'affichage. Les colonnes sont désormais castées en texte au bord
   de la requête, comme partout ailleurs dans le dépôt, et `select *` a disparu de ce service.

**L'amorce a changé, et c'est une décision.** Le jeu de démonstration affectait trois membres **sans
aucune déclaration** — un état que la règle refuserait aujourd'hui. Il sème désormais des
déclarations signées : on sème le dossier tel qu'il doit être, pas tel qu'il serait si la règle
n'existait pas. Et **Hugo Vasseur** rejoint le cabinet sans rien signer : il existe pour être refusé,
exactement comme dans le prototype — la règle se démontre en un clic.

**L'isolation s'éprouve, elle ne se suppose pas.** Le test crée un **second cabinet entier** et tente
la fuite dans les deux sens : affecter un étranger chez nous, affecter un des nôtres chez lui, ouvrir
une déclaration en travers, enregistrer un service non-audit sur la mission d'autrui — et vérifie que
**l'acteur** de l'opération est contrôlé lui aussi, pas seulement sa cible. Une requête finale compte
les lignes où `user.tenant_id <> engagement.tenant_id` : zéro.

**La déclaration est du contenu de cabinet.** Les sept rubriques, les quatre seuils et les huit
natures de services non-audit vivent dans `methodology/independance.json`, validés par le même
`valider.mjs`. Chaque seuil **nomme sa source et ce qu'il commande** ; les quatre sont
`verifie: false`, et l'écran affiche `UNVERIFIED` à côté du plafond de 70 %.

**Le ratio d'honoraires n'est PAS calculé** tant que les honoraires d'audit ne sont pas saisis. Un
ratio sur un dénominateur supposé serait pire que pas de ratio.

---

## ADR-070 — Le risque par assertion COMMANDE : le chaînon qui manquait

Le scoping disait quels postes travailler ; les travaux existaient. Entre les deux, rien. Le risque
s'écrivait et s'oubliait — il **décorait**. Il décide désormais de deux choses, et les deux se
vérifient à l'écran :

```
risque(assertion)  →  liste des procédures requises
risque(assertion)  →  taille du sondage de CETTE procédure
```

**La taille suit l'assertion TESTÉE**, jamais le risque le plus élevé du poste. Une procédure répond
à UNE assertion ; appliquer le maximum du poste reviendrait à traiter la séparation des exercices
comme l'exhaustivité sous prétexte qu'elles partagent un compte. Une section porte donc des
échantillons de tailles différentes — conséquence normale, pas incohérence.

**Le calcul et la décision sont DEUX COLONNES.** `computed_level` est re-dérivé à chaque évaluation
(il suit la matérialité, les données, les facteurs) ; `retained_level` est la décision humaine, et
elle **survit au recalcul**. Les confondre ferait disparaître l'arbitrage au premier ré-import — même
règle que le scoping confirmé qui survit à un ré-import de balance.

**Une surcharge sans motif écrit n'est pas une surcharge** : contrainte de base, pas convention.
Descendre un risque sans dire pourquoi est exactement le geste qu'un dossier doit rendre impossible.

**Une surcharge qui REJOINT le calcul cesse d'en être une** — elle est rangée à la ré-évaluation
suivante. L'afficher comme un arbitrage ferait croire à une décision qui n'existe plus. C'est le test
qui a imposé cette règle : ma première version de test « surchargeait » vers le niveau déjà calculé
et s'étonnait que rien ne soit retenu. Le test était faux, pas le code — mais le comportement méritait
d'être nommé.

**Les règles de facteur sont de la MÉTHODE** (`methodology/risque.json`) : cinq facteurs observés,
chacun nommant un **prédicat** que le code implémente, ses paramètres (200 écritures, 5 % d'OD, 15 %
sur le dernier mois) et **ce qu'il craint**. Plus l'échelle (0 → faible, 1 → moyen, 2+ → élevé) et la
table des tailles. Un cabinet remplace les siens sans qu'une ligne de code bouge.

**L'énumération des prédicats arrête l'assemblage, dans les DEUX SENS** : tout prédicat déclaré doit
être implémenté, tout prédicat implémenté doit être déclaré. La raison est plus lourde que pour les
règles de date (ADR-057) : un facteur nommé mais non implémenté serait silencieusement **toujours
inactif** — risque sous-évalué, étendue réduite, et **aucun écran ne le dirait**.

**Un facteur range sa MESURE, pas un booléen** : « 1 254 écritures (seuil 200) », jamais « vrai ».
Sans elle, relire un niveau six mois plus tard exigerait de rejouer le calcul — et une preuve qu'il
faut recalculer n'est pas une preuve. Un facteur **non évaluable** (balance N-1 absente, seuil non
arrêté) est **inactif et le dit** ; jamais supposé actif.

**L'écran montre aussi les procédures ÉCARTÉES**, avec le niveau atteint et le minimum exigé. Une
liste qui ne dit que ce qu'elle retient ne se conteste pas.

---

## ADR-071 — L'échelle de risque appartient au cabinet, pas au code

**La question qui a provoqué cette décision** : « un cabinet qui travaille à QUATRE niveaux, ou qui
les nomme *limité / normal / accru*, peut-il le faire ? » Réponse honnête après vérification :
**non**, et il fallait le dire plutôt que le supposer.

Trois endroits figeaient exactement `faible / moyen / eleve` : l'énumération de `risque_minimum` dans
`schema.json`, l'union TypeScript `NiveauRisque`, et surtout **une table `{ faible:0, moyen:1,
eleve:2 } écrite en dur** dans `catalogue.ts` — doublon de la même logique dans `risk.ts`, et le seul
endroit du dépôt qui interdisait une autre échelle.

**Ce que la validation devient** : `risque_minimum` n'est plus une énumération figée, il est comparé
à **l'échelle du cabinet**. C'est **plus strict** qu'avant, parce que cela attrape en plus une
divergence entre `procedures.json` et `risque.json` — une procédure exigeant un niveau que le cabinet
n'a pas arrête l'assemblage.

**Vérifié en le faisant** : un test charge réellement une méthode à **quatre niveaux nommés
autrement**, une autre à **deux**, et vérifie que trois incohérences arrêtent l'assemblage (niveau
absent de l'échelle, niveau sans taille d'échantillon, échelle ne couvrant pas zéro facteur).

**Ce qui reste impossible, et qui est écrit** : une taille d'échantillon **par formule** plutôt que
par table. Chiffré à une séance, à faire avec le point 6 — une formule a besoin de la population, et
la population est le point 6. `docs/12_CONFIGURABLE.md` le dit noir sur blanc plutôt que de le
laisser découvrir.

---

## ADR-072 — Le qualitatif entre dans l'application, et il COMMANDE

**Le constat qui l'a imposé** : après l'ADR-070, l'évaluation du risque de l'application était à
**100 % quantitative** — cinq facteurs calculés sur des écritures, rien d'autre. C'était l'état du
prototype qui avait été rejeté (83 %), en plus prononcé. Une évaluation qui ne voit que ce qui se
compte ne voit pas ce qui compte : un changement de dirigeant, une pression sur le résultat, un
litige non provisionné ne sont dans aucun grand livre.

**Ratio après cette passe : 5 règles calculées et 10 sources déclarées — 33,3 % de quantitatif**
(le prototype est à 45,5 %). Le chiffre est **mesuré par un test**, pas affirmé.

**Deux objets distincts, et c'est délibéré.**

- Le **questionnaire résiduel** — ce qu'aucune autre source du dossier ne peut lever. Il **ne coche
  rien** : une réponse « oui » **crée un facteur au registre**, avec sa nature, sa source et le texte
  écrit par l'auditeur. Une question d'entité vise **tous les postes retenus au périmètre**.
- Le **registre des facteurs déclarés** — les constatations qui **circulent**. Une constatation faite
  dans une procédure se pose seule sur les sections concernées, sans ressaisie. Sans lui, chaque
  section redécouvre ce que la voisine a déjà vu, et c'est la thèse du produit qui tombe.

**Le facteur déclaré compte comme un fait calculé.** C'est le point qui distingue une circulation
d'un affichage : un facteur **confirmé** visant (ce poste, cette assertion) monte le niveau, donc
fait entrer des procédures. **Proposé, il ne compte pas** — ce n'est pas parce qu'un moteur a levé
quelque chose qu'il a décidé.

**Trois règles qui bloquent par elles-mêmes** : une question sans réponse, un « oui » sans précision
écrite, un facteur non statué. Un « oui » sans précision est **accepté et gardé** — on répond d'abord,
on rédige ensuite, et refuser ferait perdre le fait — mais il bloque le visa, ce qui est la vraie
sanction.

**Trois défauts trouvés par les tests, tous réels.**

1. **Le compte et la liste divergeaient.** `risksFor` — le chemin de lecture de l'écran — ne rendait
   que les facteurs observés, alors que le niveau comptait aussi les déclarés. L'écran aurait affiché
   « 2 facteurs » au-dessus d'une liste qui n'en montre qu'un. Pire qu'un écran muet.
2. **Un test passait à vide** : aucun scoping n'avait été fait, donc un facteur d'entité ne visait
   aucun poste — et deux listes vides sont égales. Le périmètre est désormais posé, et une assertion
   vérifie qu'il n'est pas vide.
3. **Une contrainte testée sur la mauvaise ligne** : « écarter sans motif » était vérifié sur un
   facteur qui portait déjà un motif de confirmation, donc la contrainte était satisfaite. Elle se
   vérifie maintenant sur un facteur non encore statué.

---

## ADR-073 — Les assertions sont de la méthode, pas une constante du produit

**Contexte.** Le jeu de sept assertions était **énuméré dans les schémas** de `methodology/` :
`procedures.json`, `questionnaire.json` et `risque.json` validaient tous les trois leur champ
`assertion` contre la même liste fermée écrite dans le schéma. Le §4 de `docs/12_CONFIGURABLE.md`
portait la question comme « à discuter, ~½ séance ».

**Le défaut, et c'est exactement celui de l'échelle de risque (ADR-071).** Un cabinet qui sépare
« présentation » et « informations à fournir », ou qui suit le découpage PCAOB, voit son fichier
refusé. La promesse « votre méthode reste la vôtre » devient alors « à condition qu'elle ressemble
à la nôtre » — et un auditeur le teste en trente secondes. Laisser la question **ouverte dans un
document commercial** est le vrai risque : on ne découvre pas une limite pendant une démonstration.

**Décision.** Le jeu d'assertions est un fichier de méthode, `methodology/assertions.json`
(`code`, `libelle`, `definition`, `sens_naturel`), validé par `schema-assertions.json`. Les trois
autres schémas ne l'énumèrent plus : leur champ `assertion` est une chaîne, avec une description qui
renvoie au jeu du cabinet. Côté base, `0014_assertions_are_method.sql` retire le CHECK énuméré de
`fsli_assertion_risk.assertion` et le remplace par `btrim(assertion) <> ''`. Côté TypeScript,
`Assertion` est un alias de `string` et `libAssertion(cat, code)` résout le libellé depuis le
catalogue.

**Ce qui remplace l'énumération est PLUS strict qu'elle**, et c'est le point qui rend la décision
tenable. Une liste ouverte sans contrôle croisé serait pire qu'une liste fermée : une faute de frappe
passerait. `validerAssertions` + les contrôles croisés arrêtent l'assemblage dans six cas —
une procédure, une question ou un facteur observé visant une assertion **absente du jeu** (le message
donne le jeu réel) ; un `sens_naturel` inconnu du catalogue de sens de test, qui aurait produit un
libellé vide à l'écran ; deux assertions de même `code` ; un jeu **vide**, où plus aucune procédure
ne viserait quoi que ce soit et où **rien ne le dirait**.

L'énumération protégeait contre une faute de frappe dans **un** fichier ; le contrôle croisé protège
contre une **divergence entre quatre**.

**Vérification.** `echelle.test.ts` charge réellement un jeu à découpage `presentation` /
`informations` distinct, et vérifie que **chacun des six modes de défaillance** arrête l'assemblage —
un test par mode, pas un test qui les résume.

**Ce que ça n'ouvre pas.** Une assertion reste un **nom** : la méthode la nomme, le code sait ce que
la procédure qui la sert va lire. Un cabinet peut découper autrement ; il ne peut pas décréter qu'une
assertion se teste par un calcul que le moteur ne connaît pas. Même frontière qu'ADR-050.

---

## ADR-074 — Le format du papier de travail : dire où passe la frontière avant qu'on la découvre

**Contexte.** `docs/12_CONFIGURABLE.md` traitait des procédures, des seuils, de l'échelle, du
questionnaire et de l'indépendance — et pas du **format du papier de travail**. Or c'est la signature
d'un cabinet : ses colonnes, ses en-têtes, sa mise en page, ce qui entre dans son dossier et ce qu'un
inspecteur lit. Un « ah non, ça c'est en dur » après une page entière sur la configurabilité annule
la page.

**L'état réel, établi par inspection et non par mémoire.**

- **Configurable, mais dans un pack TypeScript** (`WorkpaperStrings`, `packs/types.ts`, implémenté
  dans `nep-fr.ts` et `pcaob-sox.ts`) : intitulés des huit sections, intitulés des cinq annexes,
  mentions d'attribution et de validation, langue. C'est de la **configuration**, mais elle exige un
  développeur et un déploiement.
- **Pas configurable du tout** : la liste et l'ordre des huit sections (`draft.ts`, clés `objective →
  scope → method → sampleTable → exceptions → evaluation → verification → conclusion`) ; les colonnes
  des deux tableaux (`draft.ts`, tableaux littéraux fr/en) ; la mise en page (tailles, couleurs,
  marges, filets, littéraux dans `render.ts`) ; l'en-tête de cabinet et le logo, qui **n'existent
  pas** ; le schéma de référencement des papiers, qui n'existe pas non plus.

**Décision.** Introduire un second marqueur dans le §1 du document — **⚠⚠ code** — pour ce qui est
configuré mais au mauvais endroit, distinct de **⚠ commun** qui marque une donnée non encore chargée
par cabinet. Les intitulés entrent au §1 avec **⚠⚠ code** ; l'ordre, les colonnes, la mise en page et
l'en-tête entrent au §2, chiffrés : **~3½ séances** (½ pour déplacer `WorkpaperStrings` dans
`methodology/papier.json`, 1 pour l'ordre des sections en données, 1 pour les colonnes, 1 pour
l'en-tête).

**Une limite assumée et écrite, plutôt que subie.** Le bloc de visas, la mention de version et
l'empreinte de population **ne deviendront pas optionnels**. Ce sont eux qui rendent un export
auto-portant, relisible sans OTTO des années plus tard (ADR-013, P7). Leur place et leur libellé sont
dans les 3½ séances ; leur **présence**, non. Une configurabilité qui permettrait d'exporter un
papier incapable de dire qui l'a signé et sur quelle population n'est pas une liberté, c'est une
régression.

**Corollaire sur l'ouverture du document.** L'ouverture promettait ce que le §3 démentait douze
lignes plus loin. Elle date maintenant l'état réel dans une subordonnée — les éléments sont des
données, le chargement par cabinet est chiffré à 2½ séances et **n'est pas fait** — sans retirer la
promesse. Une promesse datée se tient ; une promesse démentie au §3 se retourne.

---

## ADR-075 — La méthode d'un cabinet est une ligne de sa base, pas un fichier du dépôt

**Contexte.** Le catalogue — procédures, seuils, échelle de risque, jeu d'assertions, questionnaire,
rubriques d'indépendance — était lu depuis `methodology/`, sur le disque. Il était donc **commun** :
une seule méthode pour toutes les missions et tous les cabinets. La phrase de vente « votre méthode
reste la vôtre, vous la chargez, je ne la vois jamais » tenait sur sa première moitié et pas sur la
seconde, et `docs/12_CONFIGURABLE.md` portait un marqueur **⚠ commun** sur chacune de ses lignes.

**Décision.** Trois pièces, migration `0015`.

1. **`firm_methodology`** — le paquet JSON validé, par cabinet, avec son empreinte et les versions
   déclarées par chaque fichier. **Immuable** : republier crée une ligne. Un dossier doit pouvoir
   dire, des années plus tard, sous quelle méthode il a été exécuté ; une ligne réécrite le rendrait
   incapable de le dire.
2. **`engagement.methodology_id`** — la mission **désigne** son catalogue au lieu de prendre le
   dernier en date à chaque lecture. Une méthode publiée en mars ne doit pas changer
   rétroactivement les travaux requis d'un dossier planifié en janvier.
3. **`catalogueDeLaMission(engagementId)`** remplace `chargerCatalogue()` aux quatorze points
   d'appel des services et des écrans. La fonction du dépôt reste, avec un avertissement écrit
   au-dessus : aucun service ne doit l'appeler.

**L'isolation est dans la BASE, pas seulement dans l'application.** La clé étrangère est
**composite** — `(methodology_id, tenant_id)` vers `firm_methodology (id, tenant_id)`. Désigner le
catalogue d'un autre cabinet est **impossible**, pas seulement refusé. C'est le point qui distingue
cette table d'un champ de configuration : contrairement aux politiques RLS, une clé étrangère n'est
pas inerte en local (ADR-007). Le test le vérifie en **contournant le service** pour écrire
directement, et attend le rejet **par le nom de la contrainte** — pas n'importe quelle erreur.

**Le refus plutôt que le repli, et c'est le cœur.** Une mission sans méthodologie désignée est
**refusée** au chargement. Le repli — `?? chargerCatalogue()` — aurait été la faute : le dossier
tournerait sur la méthode de l'éditeur, les travaux requis seraient les nôtres, et **aucun écran ne
le dirait**. Même famille que le prédicat déclaré-non-implémenté d'ADR-050 : le silence lu comme un
succès.

**Deux choses que le paquet d'un cabinet ne peut pas contenir.**

- **Ses propres schémas.** Ils énumèrent ce que le *moteur* sait calculer. Un cabinet qui livrerait
  le sien désactiverait tous les contrôles en une ligne, et son fichier invalide passerait sans
  bruit. `assemblerCatalogue` n'a **aucun paramètre** par lequel un schéma pourrait arriver : il les
  lit lui-même dans le produit, et un paquet qui en contient un est refusé en nommant le fichier de
  trop plutôt qu'en l'ignorant — celui qui l'a mis croit qu'il agit.
- **Un fichier manquant.** Un paquet amputé est refusé, jamais complété en silence avec le nôtre.

**Un seul chemin de validation.** `valider.mjs` est scindé : `assembler(contenu, schemas)` fait
l'orchestration, `chargerCatalogue(racine)` la nourrit depuis le disque, `assemblerCatalogue(contenu)`
depuis une ligne de base. Deux entrées, **une** validation — un second chemin serait un chemin non
testé, et c'est celui-là qui laisserait passer une méthode invalide. Le catalogue est **revalidé au
chargement**, pas seulement à l'écriture : le produit évolue, et un prédicat retiré du moteur
rendrait invalide une méthode publiée hier.

**Un défaut évité par construction, écrit ici parce qu'il se serait vu tard.** Les quatre tests
d'isolation ne prouvent rien si le service refuse *tout* : un `designerMethodologie` cassé les
ferait tous passer. Le chemin normal est donc exercé explicitement — publier, désigner, charger, et
vérifier que c'est bien **ce** catalogue qui sort.

**Ce qui reste, et qui est dit dans le document** : il n'y a pas encore d'**écran** d'import. Le
mécanisme est éprouvé, la publication passe encore par nous — ~1 séance.

---

## ADR-076 — Les écrans de méthode rendaient 500 pendant que 278 tests étaient verts

**Ce qui s'est passé.** En conduisant le nouvel écran d'import dans un navigateur — pas en le
relisant — `/methodology` a rendu 500 : `Cannot find module 'file:///…/methodology/valider.mjs'`.
En vérifiant l'étendue, `/eng/[id]/risk` et `/eng/[id]/team` rendaient **500 aussi**. Introduit par
`cf94181`, plusieurs tranches plus tôt : depuis que le validateur est un `.mjs` partagé, **aucun
écran chargeant une méthode n'a jamais rendu dans l'application qui tourne.**

**Pourquoi les tests ne l'ont pas vu, et c'est le vrai sujet.** `await import(chemin)` avec un chemin
calculé est réécrit par le bundler de Next et échoue à l'exécution ; Vitest, qui tourne en ESM Node
transformé par Vite, le résout sans difficulté. Les deux exécutions ne sont pas la même, et la suite
ne couvrait que l'une. **Un test vert sur un chemin que la production n'emprunte pas ne prouve rien
de la production** — c'est le silence lu comme un succès, à un étage où il n'avait pas encore été
cherché.

**Décision, deux parties.**

1. **`importerValideur()` tente les deux chemins.** `new Function('u','return import(u)')` rend
   l'import opaque à l'analyse statique du bundler — c'est un import ESM réel, à l'exécution ;
   Vitest, dont le contexte vm n'a pas de « dynamic import callback », y lève une `TypeError`, et on
   retombe alors sur l'import transformé par Vite. Seule une `TypeError` est rattrapée : un vrai
   fichier manquant ressort du second appel, non avalé.
2. **`racineDepot()` cherche le dossier au lieu de le déduire.** Elle remontait quatre niveaux depuis
   `import.meta.url`, ce qui tombait juste en développement et pas dans un bundle de production. Elle
   essaie maintenant plusieurs candidats et **échoue en les nommant** si `methodology/valider.mjs`
   n'est trouvé nulle part — plutôt que de rendre un chemin plausible dont le seul symptôme serait un
   `MODULE_NOT_FOUND` illisible.

**Ce que ça change dans la méthode de travail, et c'est la partie à retenir.** Un écran qui compile
n'est pas un écran qui rend. `tsc --noEmit`, la suite verte et `next build` réussi ne disent **rien**
d'un module chargé à l'exécution hors du bundle. Tout écran neuf est désormais **conduit dans un
navigateur** avant d'être annoncé — c'est ce qui a trouvé celui-ci, et deux autres défauts dans la
même passe (ADR-077).

---

## ADR-077 — L'écran d'import : trois défauts trouvés en conduisant, pas en relisant

**Contexte.** Le mécanisme de méthodologie-par-cabinet (ADR-075) était éprouvé par 17 tests mais
n'avait pas d'écran : publier passait par nous. L'écart commercial est net — « je pourrais l'adapter »
contre « regardez, je l'adapte » pendant le rendez-vous.

**Décision.** Un écran `/methodology`, hors mission parce que la méthode est au-dessus d'elles
toutes : les versions publiées, quelle mission travaille sous laquelle, et le chargement.
**Vérifier sans publier** n'écrit rien, ni en succès ni en échec.

**Une propriété tenue par un test, pas par la vigilance** : ce que l'écran déclare valide, la
publication l'accepte ; ce qu'il déclare invalide, elle le refuse. `publierMethodologie` appelle
`verifierPaquet`, qui appelle `erreursDuPaquet` — **la seule** fonction qui produise des erreurs de
paquet. Deux listes écrites à deux endroits divergeraient un jour, et l'écran dirait « valide » là où
le moteur refuse ; un cabinet qui voit ça une fois ne croit plus ni l'un ni l'autre.

**Les trois défauts, tous trouvés dans le navigateur.**

1. **Le collage était perdu à chaque refus.** `useActionState` avait été choisi précisément pour
   l'éviter, et ne suffisait pas : React réinitialise le formulaire après une action, et un
   `defaultValue` n'est lu qu'au montage. Mesuré : 56 erreurs affichées, et le texte du cabinet
   effacé sous elles. Le champ est maintenant **contrôlé**. Le raisonnement était juste, la
   conséquence fausse — seule l'exécution le disait.
2. **Le mode « un seul fichier » était un piège.** Passer une échelle de trois à quatre niveaux exige
   `risque.json` **et** `procedures.json` dans la même publication : chacun seul est refusé par le
   contrôle croisé, à juste titre. Un mode qui rend impossible la modification la plus probable n'est
   pas une commodité. Le texte est désormais **toujours** un objet indexé par noms de fichiers —
   correctif d'un ou plusieurs fichiers posé sur la version en vigueur, ou paquet entier.
3. **Un refus qui envoyait corriger la mauvaise chose.** Une clé inconnue — presque toujours le
   contenu d'un fichier collé sans son nom — recevait le message sur les schémas qui appartiennent au
   produit. Deux causes, deux messages désormais. Même principe qu'ADR-069 sur l'ordre des refus
   d'affectation : *un refus qui égare est pire qu'un refus sec.*

---

## ADR-078 — Le balayage des écrans : la classe entière, fermée par un harnais

**Contexte.** ADR-076 avait trouvé que trois écrans rendaient 500 depuis plusieurs tranches, avec la
suite au vert. Le corriger un par un aurait laissé la classe ouverte : le défaut suivant serait
ressorti pareillement, découvert par hasard.

**Décision.** Un balayage qui ouvre **toutes** les routes dans un vrai navigateur et échoue sur ce
qui ne rend pas. Il tourne dans la suite (`tests/screens.test.ts`, serveur de développement) **et**
sur un build de production (`npm run screens`). Les deux, parce que les deux exécutions ne sont pas
la même : c'est précisément ce que disait ADR-076.

**Quatre propriétés, chacune payée par un défaut trouvé pendant sa construction.**

1. **La liste des routes se DÉCOUVRE**, lue dans `src/app`. Une liste écrite à la main oublie un jour
   une route, et l'oubli est silencieux : le balayage passe au vert en ne regardant pas l'écran
   cassé. Une route dont un paramètre ne se résout pas est un **échec**, pas une route à sauter.
2. **Le journal du serveur est lu**, et toute exception y est un échec — même si toutes les routes
   ont rendu 200. C'est ce contrôle qui a trouvé le défaut ci-dessous, invisible autrement.
3. **Le port occupé est un refus.** Un serveur oublié d'un lancement précédent tenait le port ; le
   nôtre est mort sur `EADDRINUSE`, l'attente a vu répondre l'**ancien**, et le balayage a validé un
   build qu'il n'avait pas produit. *Vérifier ce qu'on n'a pas démarré soi-même, c'est ne rien
   vérifier.*
4. **Un serveur mort n'est pas quarante écrans cassés.** Quand le serveur est tombé en cours de
   route, le rapport a déclaré 28 écrans en panne. Le balayage vérifie maintenant la liveness avant
   d'accuser, et s'arrête en disant après combien de routes il est tombé — un compteur qui ne compte
   pas ses plantages ment deux fois.

**LE DÉFAUT QUE ÇA A TROUVÉ, et il était pire qu'un 500.** Les six actions de `/eng/[id]/team`
étaient définies dans le composant et **capturaient un helper local**, `run`. En production, Next doit
encoder la fermeture d'une action inline ; une fonction capturée n'est pas encodable, et le serveur
levait à **chaque affichage** — pendant que la page rendait **200**. Les six formulaires de l'écran
équipe étaient donc **inertes en production**, et l'écran avait l'air normal. Un 500 se voit ; un
formulaire inerte sous une page qui rend, non.

Le helper est monté au niveau du module. Même correction préventive sur `/methodology`, dont les
actions vivent maintenant dans `actions.ts` — et qui y gagne une correction de fond : une action
définie dans le rendu **capture l'état du rendu**, donc lisait une version de méthode périmée si le
cabinet publiait entre l'affichage et l'envoi. Elle relit elle-même.

**UN SECOND DÉFAUT, AU MÊME ENDROIT, DE LA MÊME FAMILLE.** `run` calculait le motif de refus et le
**jetait**. Le commentaire au-dessus disait : *« une règle qui échoue en silence ne se distingue pas
d'un bouton cassé »* — et le code faisait exactement cela. La règle phare de la tranche équipe —
*aucun travail ne s'attribue sans déclaration signée* — refusait sans que rien ne s'affiche. Le motif
repart maintenant dans l'URL et l'écran le rend.

**Ce que le balayage ne couvre pas, dit ici pour ne pas être cru par omission** : il ouvre les
écrans, il ne clique sur rien. Un écran qui rend n'est pas un écran qui marche — c'est le parcours
rejouable de `DEMO_APP.md` qui vérifie que les actions agissent.

---

## ADR-079 — Le gabarit du papier de travail est de la méthode, pas du code

**Contexte, et c'est une incohérence reconnue avant d'être trouvée par un client.** Ce produit pose
une frontière — *la méthode NOMME, le code CALCULE* — et elle se tient pour un prédicat de risque ou
une population. Elle **ne dit rien** du format d'un papier : une colonne, un ordre de sections, un
logo, une référence de classement ne sont ni un nom ni un calcul, ce sont de la **présentation**.
Qu'ils vivent dans un pack TypeScript exigeant un déploiement n'était justifié par aucun principe :
c'était un reste d'architecture.

Et c'était le reste le plus visible. Un catalogue de procédures se lit dans OTTO ; **un papier de
travail sort d'OTTO** et va vivre dans le dossier du cabinet, sous les yeux de son réviseur puis d'un
inspecteur. Le **schéma de référencement** — ce dont un réviseur se sert pour savoir où les travaux
ont été faits — n'existait même pas.

**Décision.** `methodology/papier.json` devient le **septième fichier de contenu**, validé, publié et
chargé exactement comme les six autres : par cabinet, isolé, immuable une fois publié, refusé s'il
est invalide. Il porte l'ordre et les intitulés des sections, les colonnes des deux tableaux, les
intitulés d'annexes, les mentions d'attribution, l'en-tête et le logo, la mise en page, et le schéma
de référencement.

**La frontière est la même, et elle joue dans les deux sens.** La méthode nomme un **bloc**, le code
sait le **remplir**. Le validateur arrête l'assemblage quand :

- un bloc est **nommé et non implémenté** — la section sortirait **vide** ;
- un bloc est **implémenté et non nommé** — il **disparaîtrait** du papier (un contrôle de fiabilité
  effectué mais absent du document) ;
- une colonne nomme un **champ que la procédure ne relève pas** — la colonne sortirait vide ;
- une **variable de référence** est inconnue — elle laisserait un trou, et une référence trouée ne se
  cherche pas dans un dossier ;
- un bloc est **en double**, un corps de texte est **illisible imprimé** (< 6 pt), ou un logo est une
  **URL réseau** — un papier qui dépend d'un serveur pour s'afficher n'est pas auto-portant.

**Ce qui ne devient pas optionnel, et pourquoi c'est un argument.** Le bloc de visas, la mention de
version et l'empreinte de population restent sur chaque papier. Ce n'est pas une contrainte imposée :
c'est ce qui fait que **si OTTO disparaît demain, le papier dit encore à un inspecteur qui l'a signé,
sur quelle version et sur quelle population** — sans nous, sans licence, sans accès (ADR-013). Leur
**place** et leur **libellé** sont au cabinet ; leur **présence**, non. Un cabinet qui demanderait à
les retirer demanderait à rendre son propre dossier illisible sans nous.

**La référence est calculée puis FIGÉE.** Elle se calcule au premier projet, par le modèle du
cabinet, et se reprend d'une version à l'autre : un papier signé garde la référence sous laquelle il
a été signé, même si le cabinet change son plan de classement l'année suivante. Elle couvre **tous**
les papiers, y compris ceux du pack SOX gelé : un cabinet ne tient pas deux plans de classement selon
l'origine du papier.

**Une contrainte que la suite a attrapée, et qui disait le contraire de la règle voulue.** La règle
est : deux papiers **différents** ne partagent pas une référence, mais les **versions** d'un même
papier la partagent. `unique (engagement_id, code, reference)` interdisait précisément la seconde
moitié. Un index unique ne sait pas exprimer « pour une mission et une référence, un seul code » :
c'est une garde (`guard_workpaper_reference`).

**Un défaut de lecture, corrigé par le type.** `annexes` était un `Record<string, string>` : lire
`annexes.parameters` au lieu de `annexes.parametres` rendait `undefined` et faisait échouer l'export
sur « text is not iterable », très loin de la cause. Les annexes et les mentions sont désormais
**typées nommément** — le schéma garantit qu'elles sont présentes, le type garantit qu'on les lit
correctement.

**Coût, contre l'estimation précédente.** ~4½ séances contre les 3½ chiffrées pour la version
incohérente. L'écart n'est pas le prix de la cohérence : c'est le **schéma de référencement**, absent
des 3½ parce que la question avait été chiffrée comme « rendre configurable ce qui existe » et non
« rendre le papier celui du cabinet ». La plomberie économisée par le mécanisme de méthodologie-
comme-donnée (ADR-075) compense le travail de frontière en plus.

---

## ADR-080 — La taille d'échantillon par formule nommée (point 6)

**Contexte.** `tailles_echantillon` était une table `niveau → nombre`. C'était la seule des trois
questions à trente secondes du §5 de `docs/12_CONFIGURABLE.md` à laquelle la réponse était « pas
aujourd'hui ». Elle attendait le point 6 pour une raison de fond : **une formule a besoin de la
valeur de la population**, et la population n'est connue ni au chargement du catalogue, ni au
moment où le risque est évalué — seulement quand la procédure s'exécute sur un poste.

**Pourquoi une formule, et pas seulement une table.** Une table ignore la taille de la population :
trente lignes sur un chiffre d'affaires de 12 M€ ne couvrent pas la même chose que trente lignes sur
800 k€. C'est défendable au niveau faible ; ça ne l'est pas là où le risque est le plus élevé.

**Décision.** Un niveau porte **soit un nombre, soit une formule nommée** avec ses paramètres. La
méthode NOMME (`mus_intervalle_au_seuil`, `facteur_confiance: 3.0`, bornes 20–80), le code CALCULE
— même frontière qu'ADR-050, pour la même raison : une expression exécutable chargée par un cabinet
serait du code sans revue, et le jour où elle se trompe, elle se trompe sur un dossier signé.

**Trois refus, plutôt que trois chiffres plausibles.**

1. **Sans population, la taille est `null`**, pas une valeur par défaut. L'écran affiche l'obstacle
   nommé — « population du poste non évaluée », « seuil de planification non validé ». *Un chiffre
   affiché qui ne sait pas dire d'où il vient est pire qu'une absence.*
2. **Une population nulle ou un seuil nul lèvent**, au lieu de rendre zéro ou l'infini.
3. Le seuil lu est le seuil **validé**, pas le dernier proposé : une étendue réglée sur une
   proposition non validée serait réglée sur rien.

**Le chiffre porte ses entrées.** `taille.entrees` transporte la valeur de population et le seuil
utilisés, et l'écran les affiche sous le nombre — P7 s'applique à une taille d'échantillon comme à
un montant.

**UNE ERREUR DE FRONTIÈRE, CORRIGÉE PARCE QUE LA SUITE L'A FAIT TOMBER.** La première version
exigeait qu'un niveau **nomme chaque formule connue** — le « dans les deux sens » appliqué
mécaniquement. C'était faux, et du défaut même que ce produit passe son temps à retirer : cela aurait
forcé **chaque cabinet à utiliser toutes les formules que le moteur implémente**, laissant
l'implémentation du produit dicter la méthode. Un cabinet qui travaille à trois tailles fixes est
parfaitement en règle. Le contrôle bidirectionnel existe toujours, mais **un cran plus haut** : entre
le **schéma du produit** et le **moteur** (`assertFormulasImplemented`), où il a un sens — une formule
que le moteur calcule sans que le schéma la déclare est inatteignable par toute méthode.

*La leçon : « dans les deux sens » vaut entre deux parties du PRODUIT. Entre le produit et la méthode
d'un cabinet, un seul sens est légitime — ce qu'il nomme doit exister ; ce qui existe ne l'oblige à
rien.*

**Aussi, `sansNotes` est devenu récursif.** Une note posée dans un objet imbriqué — « pourquoi ce
niveau utilise une formule » — traversait jusqu'au moteur et serait arrivée dans les paramètres du
calcul. Rien n'aurait planté ; le paramètre inconnu aurait simplement été passé.

**La méthode s'affiche là où elle s'exécute.** Le tableau « ce que ce risque commande » porte
désormais, pour chaque procédure, sa **population** (prédicat et paramètres) et son mode de
**sélection**, à côté de la taille et de sa provenance. Une procédure sans population explicite est
une intention, pas une procédure.

---

## ADR-081 — La boucle comme objet (point 7)

**Contexte.** Chaque maillon existait et était testé : la demande, le portail, le dépôt,
l'extraction, le vouching, l'écart, la demande de clarification, la résolution probante, le cumul.
**La boucle, elle, n'existait pas.** Personne ne pouvait la voir tourner, dire où elle était bloquée,
ni combien de tours elle avait faits. Un produit dont la thèse est « la constatation circule » et qui
ne montre pas la circulation demande qu'on le croie sur parole.

**Décision.** Un service `loop.ts` et un écran `/eng/[id]/loop`. Neuf étapes ordonnées — sélection,
demande, dépôt, lecture, rapprochement, écart, clarification, résolution, cumul — chacune avec ce
qu'elle a **franchi**, ce qui est **arrêté** là, et **ce qu'on attend**, nommément.

**Le chiffre qui compte est le nombre de TOURS.** Une file d'étapes se parcourt une fois ; une boucle
repart. Un écart qui génère une demande de clarification, c'est la boucle qui refait un tour — et le
compteur est exactement le nombre de demandes **nées d'un écart** (`request_item.exception_id`). Sans
lui, on montre une file en prétendant montrer un cycle.

**Rien n'est stocké.** Tout est dérivé de l'état réel, et un test vérifie qu'aucune table ne porte cet
état. *Un compteur tenu à part diverge un jour de ce qu'il compte, et c'est toujours le compteur
qu'on croit.*

**Trois refus de complaisance.**

1. **Pas de pourcentage d'avancement.** Le chiffre utile est « combien sont arrêtés ici », pas
   « 73 % ». Un pourcentage se regarde ; un blocage se traite.
2. **Jamais « en cours ».** Chaque attente est nommée — « demandes émises sans pièce déposée »,
   « écarts ouverts sans demande de clarification ». Un écran qui dit « en cours » ne dit rien de ce
   qu'il faut faire ensuite.
3. **Sans échantillon, la boucle le dit** au lieu de rendre neuf zéros, qui se lisent comme un
   travail commencé et vide.

**La clarification compte les ÉCARTS, pas les demandes.** Une demande peut porter plusieurs écarts :
compter les demandes surestimerait la couverture. Vérifié par un test qui compare au compte distinct.

**Une correction de test, pas de code.** La première version supposait que le compteur de tours partait
de zéro. Il valait déjà 1 : le déroulé de démonstration fait tourner la boucle. Le test vérifie
désormais l'**invariant** — le compteur égale le nombre de demandes nées d'un écart — et, séparément,
qu'un nouveau tour le fait monter de un, ou que le service **refuse** quand il n'y a rien à clarifier
et que le compteur ne bouge pas. Supposer un état de départ est une manière de tester ce qu'on croit
plutôt que ce qui est.

---

## ADR-082 — L'acceptation commande le dossier (point 1)

**Contexte.** Toute démonstration commençait **au milieu** d'un dossier : l'entité, l'exercice et le
référentiel étaient semés, et rien ne disait comment on en arrive là. Or un dossier ne commence pas
par un import — il commence par une **décision** d'accepter ou de maintenir la mission, et cette
décision n'existait nulle part.

**Décision.** `engagement_acceptance` (une par mission), `engagement_milestone`, les critères et les
jalons dans `methodology/acceptation.json` — **septième et huitième fichiers de contenu**, validés
comme les autres.

**La règle qui refuse, et c'est elle qui fait de cette tranche autre chose qu'un formulaire.** Aucun
travail ne se planifie avant la décision : ni affectation d'un membre, ni évaluation du risque. Le
système refuse ; il ne rappelle pas. Même famille qu'ADR-068.

**La nature se DÉDUIT.** Première année = acceptation, renouvellement = maintien, et ce ne sont pas
les mêmes questions : le contact avec le confrère précédent ne vaut qu'en première année, les
difficultés de l'exercice précédent qu'en renouvellement. La nature vient de l'existence d'un
exercice antérieur — *une question dont la réponse est dans le dossier ne se pose pas.*

**« Bloquant » ne veut pas dire « interdit d'accepter ».** Une réponse défavorable sur un critère
bloquant exige un **motif écrit** ; elle n'interdit rien. *Un cabinet peut accepter une mission
difficile ; il ne peut pas l'accepter sans le dire.* Et le motif de la décision est exigé **dans les
deux sens** — accepter sans motif ne se relit pas plus que refuser sans motif. C'est la pièce qu'un
inspecteur demande en premier quand un dossier tourne mal ; la contrainte est aussi en base.

**Chaque critère porte SA RAISON D'ÊTRE**, affichée à l'écran. Sans elle, un questionnaire
d'acceptation devient une formalité qu'on remplit sans la lire — le même défaut que le questionnaire
résiduel évitait (ADR-062).

**Le jalon d'assemblage se DÉRIVE.** Quatre dates se posent ; la cinquième se calcule depuis la date
de rapport par la règle du référentiel (noyau `retention.ts`, ADR-014 rev. 2) et **ne se saisit pas**.
Une date dérivée qu'on pourrait saisir deviendrait fausse le jour où quelqu'un la corrige à la main.
La méthode NOMME la dérivation, le noyau la CALCULE ; une dérivation nommée et inconnue laisserait le
jalon **sans date**, et *un jalon sans date ne s'échoit jamais* — le dossier serait en retard sans que
rien ne le dise.

**Ce que la garde SQL peut et ne peut pas, dit plutôt que sous-entendu.** La base ne sait pas qui
l'appelle : elle ne distingue une saisie d'une dérivation que par un drapeau que le code pose. C'est
donc un **garde-fou**, pas la règle — la règle est dans `poserJalon`. (Et le drapeau est de session,
pas de transaction : posé en local, il disparaissait avant que l'UPDATE ne déclenche la garde, et le
peuplement refusait sa propre dérivation.)

**UN ORDRE DE REFUS CORRIGÉ PAR LA SUITE DE TESTS.** Le garde d'acceptation avait été placé **avant**
le garde d'isolation. Résultat : quelqu'un visant le dossier d'un **autre cabinet** s'entendait
répondre « faites accepter la mission » — on l'envoyait faire précisément ce qu'il ne doit jamais
faire, et on lui apprenait au passage que la mission existe. L'isolation passe désormais en premier.
Troisième fois que cette règle sert : *un refus qui égare est pire qu'un refus sec* (ADR-069).

**Un cycle d'imports évité.** `acceptance.ts` lisait le cabinet via `team.ts`, qui importe
`assertAccepte` : le cycle tenait peut-être aujourd'hui, il serait tombé le jour où l'ordre
d'évaluation change. La requête est faite sur place.

---

## ADR-083 — La reprise N-1 : proposée, jamais reprise en silence (point 2)

**Contexte.** Un dossier de deuxième année ne repart pas de zéro : le périmètre, les facteurs de
risque, les réponses au questionnaire et les décisions de non-significativité de l'an dernier sont le
point de départ du raisonnement de cette année. Les ressaisir coûte une journée ; les reprendre
**automatiquement** coûte beaucoup plus cher — c'est signer cette année une conclusion qu'on n'a pas
reprise.

**Décision, deux moitiés.**

**2a — un dossier N-1 RÉEL, construit par les mêmes services que les clics.** `flows/prior-year.ts`
crée la mission FY2024, l'accepte (« acceptation », première année sur cette entité), constitue
l'équipe avec ses déclarations **signées**, importe la balance 2024, décide le périmètre avec ses
motifs, évalue le risque et remplit le questionnaire. *Le fabriquer par insertions aurait produit un
dossier que les règles du produit n'auraient jamais accepté — pas d'acceptation, pas de déclaration
signée, pas de motif de non-significativité — et la reprise aurait alors repris de la fiction.*

**2b — le mécanisme.** `carry_forward` porte ce que N-1 propose à N : décisions de périmètre,
facteurs confirmés, réponses au questionnaire, papiers signés. Chaque proposition **nomme sa source**
et se lit sans ouvrir le dossier précédent — un identifiant ne se relit pas.

**Rien n'est repris automatiquement.** Tout arrive **proposé**, et une proposition non statuée est un
**obstacle au visa**. C'est toute la différence entre une reprise et une recopie : *la recopie ne
bloque rien, parce qu'elle ne demande rien à personne.*

**Reconfirmer sans motif est permis ; écarter sans motif ne l'est pas.** Reconfirmer, c'est dire
« j'ai regardé et c'est toujours vrai ». Écarter sans motif est **indistinguable d'un oubli** — la
contrainte est aussi en base.

**La mission précédente se trouve par le CHAÎNAGE des exercices** (`period.prior_period_id`), pas par
une date : un exercice de dix-huit mois, ou décalé, casserait toute heuristique de date.

**Idempotent, et dans le bon sens.** Relancer la proposition ne duplique rien **et n'écrase aucune
décision déjà prise** — une reprise qui se re-propose après avoir été écartée serait le pire des deux
mondes.

**UN DÉFAUT DE HARNAIS RÉVÉLÉ PAR LES NOUVELLES DONNÉES.** Le résolveur de paramètres du balayage
prenait `select … from engagement where kind = 'statutory_audit' limit 1`, sans ordre. Tant qu'il n'y
avait qu'un audit légal, c'était juste. Le jour où le dossier N-1 est arrivé, il a parfois été choisi
— un dossier de planification, sans demande ni papier — et six routes sont devenues « non
résolues », donc le balayage a échoué… en accusant les écrans. Le choix est désormais déterministe et
va au dossier **le plus riche** : *balayer un dossier vide ne prouve rien.* Un `limit` sans `order by`
est une décision qu'on n'a pas prise.

---

## ADR-084 — Le pointage des états financiers : trois natures, et elles ne se valent pas (point 9)

**Contexte.** Tous les travaux d'un dossier servent à conclure sur des **états financiers**, et rien
ne rattachait un chiffre de la plaquette à ce qui le fonde. *Un dossier qui teste le chiffre
d'affaires sans pointer la ligne « Chiffre d'affaires » du compte de résultat conclut sur quelque
chose qu'il n'a jamais regardé.*

**On pointe le montant PRÉSENTÉ, pas le sien.** Recalculer la ligne et la comparer à son propre
calcul ne pointe rien : ça vérifie qu'on sait additionner. En production, la plaquette est **déposée
par le client** — c'est son document. Le constructeur de plaquette de démonstration vit dans un
fichier **séparé** du service, pour que la différence reste visible : `tieout.ts` ne sait pas
fabriquer une plaquette, et ne doit pas savoir.

**Trois natures.**

1. **Solde de balance** — la ligne EST un compte : le rapprochement se **calcule**.
2. **Agrégat de comptes** — la ligne est une somme : il se calcule aussi.
3. **Calcul à documenter** — la ligne ne vient d'aucun compte (effectif moyen, résultat par action,
   variation retraitée). **Aucune somme ne la reproduit** : le seul pointage possible est une
   explication écrite **avec la pièce qui la porte**. Une justification sans pièce n'est pas une
   justification — même famille que la résolution probante d'un écart (ADR-024).

**La nature se DÉCLARE, elle ne se devine pas.** Deviner qu'une ligne est un agrégat parce qu'elle
ressemble à une somme produirait un pointage **plausible et faux** — et un pointage faux est pire
qu'un pointage absent. Le service refuse une ligne calculée sans compte, et un « calcul à documenter »
rattaché à des comptes : *si des comptes la fondent, c'est un agrégat, et il se calcule.*

**Le statut est DÉRIVÉ du calcul.** Le laisser saisir permettrait de déclarer « pointé » une ligne
qui ne l'est pas — précisément ce qu'un inspecteur cherche. Un écart **sans explication** ne prend
pas le statut « écart » : il reste **ouvert**, et il bloque.

---

## ADR-085 — Les obstacles au visa : une seule liste, calculée (point 8)

**Contexte.** Chaque tranche avait ses blocages, chacun affiché sur son propre écran : indépendance
sur l'écran équipe, questionnaire sur l'écran risque, reprise sur l'écran reprise, pointage sur
l'écran états financiers. Personne ne pouvait dire, **en un endroit**, ce qui empêche de signer — et
*un signataire qui doit visiter huit écrans pour le savoir finit par signer sans les avoir tous vus.*

**Décision.** `obstaclesAuVisa(engagementId)` interroge **chaque service qui connaît un blocage** et
rend une liste unique : acceptation, indépendance, reprise, questionnaire, boucle, pointage,
évaluation, jalons. Chaque obstacle porte **où aller le lever** — *un obstacle sans destination se
contemple.*

**Rien n'est stocké, rien n'est rédigé là.** Un test vérifie qu'aucune table ne porte cet état, et
que la liste est bien la **réunion** de ce que chaque service refuse. *Une liste tenue à part diverge
un jour de ce qu'elle liste — et c'est toujours la liste qu'on croit.*

**Le corollaire, dit franchement :** un obstacle qui n'apparaît pas dans cette liste **n'en est pas
un**. Si une règle bloque ailleurs sans figurer ici, c'est un défaut, pas une subtilité.

**Un dossier non accepté n'affiche QUE cet obstacle-là.** Lister quarante blocages sur une mission
qu'on n'a pas acceptée noierait le seul qui compte. Même principe que l'ordre des refus (ADR-069),
appliqué à une liste plutôt qu'à un message.

**Ce que la page n'affirme pas**, écrit à l'écran : « aucun obstacle » ne veut pas dire que le
dossier est **bon**. Il veut dire qu'aucune règle ne le **refuse**. Le jugement reste au signataire —
un produit qui laisserait croire l'inverse serait dangereux.

---

## ADR-086 — L'achèvement, le branchement sur la clôture, et le parcours complet (points 10 et 11)

**L'achèvement** (`completion_item`, migration `0020`). Le dossier savait tester, évaluer, documenter
et viser — mais pas **achever**. Or les travaux d'achèvement sont ceux qu'un inspecteur regarde en
premier quand une défaillance survient trois mois après le rapport.

**Ce ne sont pas des cases à cocher : chaque nature porte une règle qui refuse, et ces règles sont des
DATES.**

- **Événements postérieurs** : des travaux qui s'arrêtent avant la date du rapport laissent une
  période non couverte, et *le refus nomme la période* — « du 28/02 au 31/03 n'est couverte par aucun
  travail ». C'est exactement ce qu'on cherche après coup, et personne ne le voit à la lecture.
- **Lettre d'affirmation** : datée du jour du rapport ou après, **jamais avant** — une lettre
  antérieure ne couvre pas la période auditée. Et elle se clôt **avec la lettre** : *c'est une lettre,
  pas une conversation.* Elle est aussi la seule nature qu'on refuse de déclarer « sans objet » :
  *une mission sans lettre d'affirmation n'est pas allégée, elle est incomplète.*
- **Anomalies non corrigées** : conclure sur un cumul qu'on n'a pas calculé, c'est conclure sur une
  impression — l'évaluation doit avoir été menée.
- **« Sans objet » se motive**, et **rouvrir est prévu et tracé** : un fait nouveau se traite, il ne
  se cache pas.

**Le branchement sur la clôture (point 11).** `sealFile` ne vérifiait que la conclusion sur les
anomalies : c'était le dernier verrou d'une porte à huit serrures. Sceller un dossier dont la lettre
d'affirmation manque produisait **une archive complète d'un dossier incomplet** — et l'archive est
définitive. La clôture demande désormais **LA liste** (ADR-085), celle-là même que l'écran affiche :
deux vérités sur ce qui bloque en divergeraient un jour.

**L'ordre des deux verrous.** Le plus **spécifique** d'abord : « le grand livre est provisoire » dit
quoi faire, « 40 obstacles » fait chercher. *Un refus qui compte n'est pas un refus qui explique.*

**TROIS DÉFAUTS DE MON PROPRE CODE, TROUVÉS PAR LE PARCOURS COMPLET.**

1. **Une jointure décorative.** `boucle()` joignait `fsli` sur son code sans que rien ne contraigne
   l'échantillon : **seize postes recevaient la boucle du chiffre d'affaires**, et bloquaient la
   clôture pour des travaux qui n'existaient pas chez eux. Le lien réel passe par
   `procedure_instance.fsli_code`. *Une jointure qui ne joint rien est pire qu'une jointure absente :
   elle a l'air d'être là.*
2. **Un jalon qu'on ne pouvait pas cocher.** Tous les jalons passés restaient « échus et non faits »
   puisque rien ne les marquait faits, et le dossier ne pouvait plus se clore — *un retard fabriqué
   par l'outil, pas par le dossier.*
3. **Une file qui se débouchait d'un cran.** La boucle ne comptait « déposé » que sur un document.
   Or un élément sort de la file de trois manières : une pièce, une **explication** répondue (une
   demande d'explication n'attend aucun document), ou une **limitation de périmètre consignée** avec
   ses procédures alternatives — celle-là est **conclue**, pas en attente. Ne l'appliquer qu'au dépôt
   déplaçait le blocage à la lecture : *un élément qui a quitté la file l'a quittée pour de bon.*

**Le parcours complet** (`flows/parcours.ts`, `tests/parcours.test.ts`) déroule la fin de la mission
par les **mêmes services que les écrans** et s'achève sur une **archive scellée**. Il ne peut pas
passer tant qu'une règle reste insatisfaite. C'est la définition de « fini ».

---

## ADR-087 — Les trois retardataires : ce qui était déclaré et jamais calculé

**Trois paramètres écrits dans la méthode que personne n'évaluait.** Chacun était du **silence lu
comme un succès** : le dossier avait l'air de contrôler la familiarité, d'appliquer la rotation du
signataire et de faire circuler les constatations, et ne faisait rien de tout cela.

**L'ancienneté par client.** Elle se **compte**, elle ne se juge pas : les exercices **consécutifs**
sur la même entité, remontés par le chaînage des périodes. **Une rupture d'un an casse le compte**, et
c'est voulu — *revenir après une interruption ne recrée pas l'ancienneté d'avant.*

**La familiarité EXIGE une sauvegarde, elle n'interdit pas.** La traiter comme un empêchement rendrait
tout dossier ancien impossible ; ne pas la lever du tout la rendrait invisible. Elle apparaît donc
dans les obstacles **tant que personne n'a écrit ce qu'on fait** — ce qui a exigé d'ajouter la
rubrique `familiarite` à la déclaration du cabinet : la première version pointait une rubrique
**inexistante**, donc un obstacle qui n'aurait jamais pu se lever. Le défaut même que ce fichier
corrige, reproduit dans sa correction.

**La rotation du signataire** ne porte que sur les **habilités à signer** — l'appliquer à un
stagiaire viderait la règle de son sens — et un dépassement **bloque le visa** : *c'est une faute de
dossier, pas un oubli d'agenda.*

**`raiseFactor` est enfin appelé.** Il existait depuis la tranche 5b et **rien ne l'appelait** : le
registre n'était alimenté que par le questionnaire, donc une constatation faite dans une procédure ne
se posait nulle part ailleurs — et « la constatation circule » restait une phrase. La résolution d'un
écart accepte désormais un **fait qui dépasse l'élément testé** (« la facture était juste, mais le
contrôle d'autorisation a été contourné »), qui lève un facteur **proposé**, visant d'autres sections,
avec l'écart pour source.

**Un test qui allait passer à vide, attrapé par sa propre garde.** Le premier essai cherchait un écart
`open` après un flux qui les résout tous : la liste était vide, la boucle ne s'exécutait pas, et le
test aurait été vert. La garde `expect(…, 'le test vérifierait le vide').toBeTruthy()` l'a arrêté.
*Écrire la garde coûte une ligne ; ne pas l'écrire coûte une confiance.*

---

## ADR-088 — Le dossier créé que personne ne pouvait ouvrir

**Le défaut.** `creerMission` insérait la mission et s'arrêtait là. Le dossier existait — bonne
entité, bon exercice, méthode en vigueur désignée, ligne au journal — et **personne ne pouvait
l'atteindre** : la liste d'accueil joint `engagement_member`, `requireMember` garde l'écran
d'acceptation. Le dossier naissait donc **hors du champ de vision de son créateur**, sans erreur,
sans message : le clic « Créer » renvoyait à l'accueil, et l'accueil n'affichait rien de neuf.

**Comment il a été trouvé — et comment il ne l'a pas été.** 403 tests verts, `tsc` propre, 60 écrans
sur 60 rendus en production : **aucun** de ces harnais ne pouvait le voir. Les tests appellent le
service et interrogent la base, donc voient une mission qui existe ; le balayage ouvre des routes
avec des identifiants **déjà peuplés**, donc jamais une mission fraîchement créée. Il a fallu
*cliquer sur le bouton et chercher le dossier dans la liste*. C'est la règle 10 de CLAUDE.md prise au
mot : **un écran qui rend n'est pas un écran qui marche.**

**Pourquoi `assignMember` ne pouvait pas servir.** Il exige que la mission soit **acceptée** — et
l'acceptation ne peut être décidée que par quelqu'un capable d'**ouvrir** le dossier. La circularité
est réelle et se casse au seul endroit possible : **la personne qui crée le dossier y entre**, pour
pouvoir décider. Toute autre coupure affaiblirait une règle qui compte (accepter avant de travailler,
ou n'entrer dans un dossier que par affectation).

**Ce que ça n'affaiblit pas.** Le créateur entre `partner` **sans droit de signature** (`can_sign =
false`) et sa déclaration d'indépendance reste exigée comme celle de tout autre membre : les
obstacles au visa la réclameront. *Ouvrir un dossier n'est pas y travailler, et y travailler n'est pas
le signer.* L'insertion est `on conflict do nothing` : re-créer ne double pas l'appartenance.

**La leçon, pas le correctif.** La classe de défaut n'est pas « il manquait un insert » : c'est
**l'objet créé qui n'est relié à rien**. Un état neuf dont aucun chemin de lecture ne part est
invisible, et l'invisible passe tous les tests. La question à poser à toute création future est
*« par quel chemin l'utilisateur revient-il à ce qu'il vient de créer ? »* — et si la réponse est
« il ne revient pas », l'objet n'est pas créé, il est perdu.

---

## ADR-089 — Ce qu'une base recréée a révélé : trois silences en série

Le correctif d'ADR-088 a fait tomber cinq suites d'un coup, sur une erreur qui ne parlait pas de
lui : `update or delete on table "engagement" violates foreign key constraint`. Trois défauts
distincts se tenaient derrière, chacun **muet tant que rien ne le sollicitait**.

**1. Une clé primaire réécrite après coup.** Le dossier N-1 de démonstration voulait un identifiant
déterministe ; il appelait `creerMission`, puis faisait `update engagement set id = …`. Ça a marché
exactement tant que la création ne reliait la mission à **rien**. Le jour où elle y a relié son
premier membre, la clé étrangère a refusé — et elle avait raison : *déplacer une clé primaire déjà
référencée est un défaut, pas une commodité.* L'identifiant se choisit désormais **avant**
l'insertion (`CreationMission.id`), ce qui supprime la fragilité au lieu de la déplacer.

**2. Une branche de repli qui n'avait jamais tourné.** Le harnais d'écrans construit lui-même le
monde de démonstration s'il manque. Ce chemin ne s'emprunte que sur une base **sans** monde ; tant
qu'il en restait un d'un lancement précédent, la fonction rendait la main à la première ligne. La
première fois qu'il a tourné pour de vrai, il a échoué de **deux façons à la fois** : PGlite n'admet
qu'un écrivain, et le parent — qui avait déjà chargé le répertoire dans sa propre mémoire — aurait de
toute façon relu une base vide après le peuplement de l'enfant. Le harnais annonçait alors « six
routes non résolues » : un aveu, pas un diagnostic. Correctif : `closeDb()` avant de céder la main,
puis **vérification que le peuplement a produit ce qu'on attendait**. *Un chemin de repli qu'on
n'exécute jamais n'est pas un repli : c'est du code non testé placé là où on ne le vérifiera pas.*

**3. Une panne illisible.** Le répertoire de données, abîmé par un arrêt brutal du conteneur, faisait
sortir `RuntimeError: Aborted()` avec une pile de wasm — ni ce qui a échoué, ni quoi faire. Il a
coûté **deux exécutions complètes de la suite** avant d'être attribué au bon endroit, et il a
d'abord été imputé au changement en cours. `open()` traduit maintenant l'abandon en français, nomme
les deux causes possibles (un autre processus écrivain, un répertoire abîmé) et donne la commande.
*Une panne qu'on ne sait pas lire est une panne qu'on impute au mauvais changement.*

**Ce que ça dit du reste.** Les trois n'ont été visibles qu'après avoir **détruit et refait la base**.
Une base qui traîne d'un lancement à l'autre masque exactement les chemins de démarrage — et ce sont
ceux qu'un nouveau venu emprunte en premier.

---

## ADR-090 — Le parcours cliqué entre dans ce qu'on lance (`npm run clics`)

Le balayage ouvre les 60 routes et vérifie qu'elles **rendent**. Il ne clique sur rien. Les deux
défauts les plus coûteux du dépôt lui étaient donc invisibles : six formulaires **inertes** en
production (ADR-078) et un dossier créé **inatteignable** (ADR-088). Les deux fois, le contrôle
manquant n'était pas difficile — *il était absent de ce qu'on lance.*

`npm run clics` conduit le parcours dans Chromium sur un **build de production** : création et
acceptation, jalons, reprise N-1, pointage, achèvement, obstacles. Il hérite des garde-fous du
balayage (port occupé = refus, groupe de processus tué, serveur mort détecté) et en ajoute deux :
une exception côté navigateur est un **échec**, et moins de dix étapes conduites est une **panne du
harnais**, pas un parcours réussi. Il entre dans `npm run verify`.

**Ce que le parcours vérifie n'est presque jamais une réussite.** Une action qui aboutit prouve peu.
Ce qui prouve, c'est qu'une action **interdite** soit refusée **et que le refus s'affiche** : décider
sans motif, écarter une reprise sans motif, documenter un chiffre sans pièce, conclure sans
conclusion. Douze des quinze étapes sont de cette nature.

**Trois pièges du harnais lui-même, corrigés en le construisant** — ils valent d'être notés parce
qu'ils sont la version « outil » du défaut qu'ils cherchent :
- **Chercher le refus dans le texte de la page** attrape les explications de la méthode (« Le système
  refuse, il ne rappelle pas ») et annonce un refus là où l'action a **réussi**. Le refus voyage dans
  `?erreur=` : il se lit là, et nulle part ailleurs.
- **Répondre « au premier formulaire »** n'importe combien de fois : le formulaire d'un critère reste
  affiché après la réponse — on doit pouvoir se corriger — donc la boucle répondait douze fois au
  même. L'application refusait alors la décision en nommant les critères manquants : elle avait
  raison, mais la règle visée n'était jamais touchée.
- **Viser « le dernier bouton *Sans objet* »** tombait sur une autre nature, que le service accepte à
  juste titre, et annonçait « accepté » pour une règle jamais sollicitée. *Un contrôle qui vise à
  côté ne dit rien, mais il le dit d'un ton rassurant.*

**Deux écrans corrigés par la conduite, sur le même principe.** Le bouton « sans objet » n'était pas
offert sur la lettre d'affirmation — juste, mais **muet** : qui cherche l'action croit à un oubli
d'écran plutôt qu'à une règle. Et la reprise N-1 affirmait « aucune mission sur l'exercice précédent
pour cette entité » alors qu'elle cherche aussi la **même nature** de mission : sur un dossier
intégré dont le N-1 était un audit légal, elle affirmait faux. *Un écran qui affirme plus que ce
qu'il a vérifié se fait croire une fois, puis plus jamais.*

---

## ADR-091 — Le parcours cliqué jusqu'au scellé, et les six trous qu'il a trouvés

Le parcours cliqué s'arrêtait à mi-chemin : création, acceptation, jalons, reprise, pointage,
achèvement, obstacles. **Import, rapprochement, matérialité, périmètre, risque, sondage, requêtes,
portail, extraction, vouching, écarts, papier, notes, visas et scellement n'avaient jamais été
conduits dans un navigateur** — c'est-à-dire exactement la moitié qu'on montre à un auditeur. Il
couvre maintenant tout le chemin, en **54 étapes**, dont une trentaine vérifient un **refus**.

**Ce qu'il a trouvé, et rien de tout cela n'était visible autrement.**

1. **Dix écrans transformaient chaque refus en page 500.** Leurs actions n'avaient aucune gestion
   d'erreur : « une sélection tirée dépend du grand livre », « résoudre sans lien est refusé »,
   « la conclusion exige une réponse au dépassement » — tout remontait au rendu. Sur un build de
   production le message est même masqué. Les tests appelaient le service (refus correct), le
   balayage ouvrait la page (200), et personne ne cliquait le bouton. `src/app/refus.ts` porte
   désormais la règle, une fois, pour tous.
2. **La clôture n'avait aucun écran.** `closeFile` et `sealFile` existaient, l'archive était
   produite et empreintée — et `file_archive` **n'avait aucun chemin de lecture**. Le dernier geste
   du métier vivait dans du code appelé par des tests. `/eng/[id]/close` le rend, et
   `/api/archive/[engagementId]` sort le zip.
3. **« Marquer un jalon fait » n'avait pas de bouton.** Un jalon échu bloque le visa ; le seul moyen
   de le lever était d'écrire en base.
4. **La réponse au dépassement de l'anomalie tolérable n'avait pas d'écran.** Le service la réclame
   avant toute conclusion : le dossier ne pouvait donc pas se conclure depuis l'application.
5. **Une décision de périmètre ne se révisait pas.** L'écran n'affichait plus que « confirmed ». Un
   poste sorti à tort ne rentrait plus — et l'obstacle « périmètre sans programme » n'avait qu'une
   sortie sur deux. *Un jugement d'audit qui ne se révise pas n'est pas un jugement.*
6. **Le dossier ne pouvait se clore que par une écriture SQL.** Le drapeau « grand livre provisoire »
   n'était levé par rien ; le test le mettait à `false` à la main, en le disant. Voir ADR-092.

**Trois pièges du harnais lui-même**, notés parce qu'ils sont la version « outil » du défaut qu'ils
cherchent, et que chacun a d'abord accusé le produit :
- **Un formulaire que le navigateur refuse d'envoyer** (`required`) n'est pas une règle vérifiée. Le
  harnais lisait ce silence comme un succès. Le contrôle court-circuite maintenant la garde HTML
  pour prouver que le **serveur** refuse — ce que verrait un client d'API.
- **Attendre un délai au lieu d'attendre un effet** : 900 ms ne suffisent pas à un aller-retour en
  production, la boucle re-répondait deux cents fois à la même question et concluait « dix sans
  réponse ». On attend désormais que le compte DIMINUE.
- **Reprendre « la première ligne qui correspond »** : le champ de dépôt reste après un envoi, donc
  le client a déposé cent dix-sept fois sur trois lignes et l'obstacle « quatorze demandes sans
  réponse » a accusé le produit. Les lignes se parcourent par index.

**Et une affirmation corrigée.** STATUS.md disait « une résolution générique est rejetée par le
service ET par la base ». C'est faux : la contrainte exige une **structure** — explication non vide,
disposition, lien vers ce qui corrobore, qui a conclu et quand — pas un jugement sur la qualité
d'une phrase. « RAS » avec un lien passe. Une machine ne sait pas distinguer une platitude d'une
explication substantielle ; ce sont les notes de revue et les visas qui le font. *Affirmer plus que
ce qu'on vérifie est le même défaut qu'un écran qui affirme plus que ce qu'il a cherché.*

---

## ADR-092 — Le grand livre définitif s'IMPORTE, il ne se décrète plus

Le dossier de démonstration porte un grand livre **provisoire** : il ne contient pas l'écriture de
situation de 25 000 € que la balance contient déjà. C'est ce qui produit l'écart de rapprochement,
la limitation de périmètre, et le drapeau qui **bloque la conclusion définitive**. Le jeu de données
ne portait pas de second fichier : le seul moyen de lever ce drapeau était `update engagement set
ledger_is_provisional = false` — ce que le test faisait, honnêtement, en le disant. *Un dossier qui
ne peut se clore que par une écriture directe en base n'est pas un dossier qui se clôt.*

Le générateur produit désormais `dataset/definitif/` : le même grand livre **plus** l'écriture
manquante. Il porte le **même nom de fichier** — le format `SirenFECAAAAMMJJ` est imposé, notre
propre validateur refuse le reste, et un second envoi du client s'appelle comme le premier. C'est
précisément pourquoi le ré-import exige une confirmation explicite d'invalidation (ADR-016).

**La règle qui lève le drapeau est celle qu'un auditeur applique** : le fichier définitif arrive, on
**re-exécute le rapprochement**, et c'est SON résultat — pas une case à cocher — qui décide. Propre
⇒ le grand livre n'est plus provisoire. Encore différent ⇒ il le reste, et le dossier reste bloqué.

**La conséquence, assumée : les travaux se refont.** Le ré-import invalide la sélection tirée sur le
fichier provisoire, parce que la population a changé. Ce n'est pas un effet de bord : c'est ce que
la limitation de périmètre du dossier promet elle-même — *« le rapprochement sera re-exécuté sur le
FEC définitif avant conclusion définitive »*. Le parcours cliqué refait donc le sondage, la demande,
les dépôts, l'extraction, le vouching, la re-exécution en aveugle, l'évaluation et le papier **sur
le grand livre définitif**. Le dossier se conclut sur le fichier sur lequel il conclut.

**Et le jeu de données porte les pièces des DEUX tirages.** La seconde sélection désignait quatre
factures qui n'existaient nulle part : le client n'aurait pas pu répondre, le dossier n'aurait
jamais pu se clore, et ce trou du jeu de données se serait déguisé en constatation d'audit. Le
manifeste et la suite d'acceptation restent ceux du tirage **épinglé** ; seules les pièces sont
produites pour les deux.

---

## ADR-093 — Un poste retenu sans procédure planifiée est un obstacle au visa

**Le trou.** Un poste retenu au périmètre sur lequel AUCUNE procédure n'est planifiée ne produisait
aucun obstacle, et le dossier se clôturait dessus. Ce n'était pas une tolérance : c'était une
absence de règle. Le produit refuse partout ailleurs une conclusion sans explication, une résolution
sans pièce, un « sans objet » sans motif — et il acceptait un poste entier retenu puis jamais touché.

**Pourquoi il était invisible.** La boucle ne parle QUE des postes qui portent un échantillon
(`if (b.etapes.length === 0) continue`) : un poste sans rien du tout ne déclenchait rien. Le silence
exact que la règle 13 nomme — **l'absence lue comme un acquis**.

**La règle.** `programme` est la dixième famille d'obstacles : un FSLI `in_scope` ou
`in_scope_qualitative` sans `procedure_instance` bloque le visa. Elle se lève des **deux** façons
prévues, et le test vérifie les deux : on travaille le poste (une procédure planifiée suffit), ou on
le sort du périmètre avec un motif. La seconde sortie a exigé de rendre une décision de périmètre
**révisable depuis l'écran** — elle ne l'était pas (ADR-091, point 5).

**Le conflit qu'elle a révélé, et sa résolution.** Le dossier de démonstration retenait seize postes
et n'en travaillait qu'un : la nouvelle règle l'aurait rendu inclôturable, à raison. Le jeu de
données scope désormais **le seul poste qu'il déroule**, et le motif dit la vérité sur ce qu'il est :
« hors périmètre du jeu de démonstration ». **Ce n'est pas un jugement de significativité** — sur
cette entité, la paie pèse 2,6 M€ contre un seuil de planification de 27 000 €, et le moteur propose
ces postes DANS le périmètre. Écrire l'inverse aurait fait du dossier de démonstration un dossier
qu'un inspecteur rejetterait ; le motif est donc visible à l'écran, au journal et dans l'archive.

**Post-scriptum d'ADR-091 — deux défauts du harnais, notés parce qu'ils mentent bien.**
*Cibler « la première ligne qui correspond », puis « la ligne numéro n », puis « la référence de
pièce »* : chacune a échoué, et chacune a produit un obstacle qui accusait le produit. La dernière
est instructive — la facture de la **double comptabilisation** figure DEUX fois dans la sélection,
c'est l'anomalie même du jeu de données, et la seconde ligne était sautée comme un doublon. La
ligne porte son identifiant : c'est lui la clé. *Un harnais qui vise à côté ne dit rien, mais il le
dit d'un ton rassurant.*
Et *re-naviguer aussitôt après une action qui redirige déjà* fait courir deux chargements l'un
contre l'autre : React signalait une hydratation incohérente qu'il réparait seul, sur une page que
le balayage rend proprement. Ce n'était pas le produit — mais **un harnais qui produit ses propres
erreurs apprend à les ignorer**, et c'est ainsi qu'un vrai défaut passe.

---

## ADR-094 — La revue visuelle entre dans ce qu'on lance (`npm run visuel`)

Reportée depuis plusieurs passes, elle a trouvé ce qu'aucun autre harnais ne cherchait : le
balayage vérifie qu'une route **rend**, le parcours qu'elle **agit** — ni l'un ni l'autre ne
regarde ce qu'elle **donne à voir**.

**Le thème sombre n'existait pas.** L'application était en clair uniquement ; les captures sombres
que je montrais venaient du **prototype**. Il tient en une redéfinition de jetons parce que la
feuille de style ne cite plus une seule couleur en dur — c'est ce qui rend un thème possible, et son
absence qui les rend coûteux.

**Le texte « faint » était à 2,61:1.** C'est la voix du produit : chaque « pourquoi elle existe
encore », chaque règle expliquée. Sous le seuil où un texte se lit pour tout le monde. *Un discret
qui ne se lit pas n'est pas discret, il est absent.*

**Cent quatre vues débordaient à 390 px.** Un tableau d'audit a huit colonnes ; il ne rentre pas, et
le réduire le rendrait illisible. Ce qui n'est pas acceptable, c'est que la **page** parte de
travers — on lit une colonne en poussant le document, et le bandeau et le rail glissent avec. Chaque
panneau devient son propre défileur. Et le bandeau, à hauteur fixe, faisait sortir l'identité de
l'utilisateur par la droite : la seule chose qu'il ait à dire.

**Trois défauts vus à l'œil, pas mesurés** — c'est pourquoi la revue produit aussi les captures :
- l'écran **« Risque par assertion » était VIDE** dans la démonstration : `assessFsli` n'était appelé
  que par le dossier N-1. Il rendait 200, le balayage passait, les tests passaient — et l'écran qui
  porte le raisonnement le plus distinctif du produit ne montrait rien ;
- l'écran de clôture affichait les **codes** des familles d'obstacles (« achevement — 1 ») ; les
  titres existaient déjà ailleurs, ils vivent maintenant en un seul endroit ;
- le bandeau disait **« not signed in »**, en anglais, sur le portail client francophone — le seul
  écran où personne n'est connecté.

**Ce que la revue mesure, et ce qu'elle ne prétend pas mesurer.** Deux choses seulement, parce que ce
sont les deux qu'une machine juge honnêtement : le **débordement horizontal** (avec le coupable
nommé — « la page déborde » sans lui oblige à tout rouvrir) et le **contraste** du texte contre son
fond, refusé sous 3:1. Elle ne juge pas une mise en page : elle produit les captures, et un humain
les regarde. Elle entre dans `npm run verify`.

**Et le portail se regarde SANS le cookie auditeur.** La première version montrait le nom de
l'associé en haut d'un écran destiné au client : on relisait le mauvais écran.

**Post-scriptum d'ADR-094 — le onzième écran, et pourquoi il manquait.**
Dix écrans avaient été corrigés (ADR-091) ; `risque` avait été écarté parce qu'il *semblait*
gérer ses refus — le mot « refusée » y figure. Il figurait dans une PHRASE D'EXPLICATION, pas dans
un chemin de code : `overrideAction` levait, et la surcharge d'un niveau d'assertion **sans motif
écrit était acceptée** alors que l'écran, le service et STATUS.md affirmaient tous trois qu'elle
était refusée. Personne ne pouvait le voir : l'écran était VIDE dans la démonstration, donc le
contrôle ne s'exécutait jamais. Remplir l'écran a rendu la règle atteignable, et elle est tombée au
premier clic. *Chercher un mot n'est pas vérifier un chemin — et un contrôle qui ne s'exécute pas
n'a pas d'opinion.*

**Post-scriptum d'ADR-094 — attendre `load` après une action serveur n'attend rien.**
Une hydratation incohérente revenait au hasard, tantôt sur le portail, tantôt sur le papier de
travail : React la répare seule, mais un harnais ne doit pas apprendre à ignorer ses propres
erreurs. Le premier correctif attendait l'événement `load` après chaque envoi — et **une action
serveur n'en déclenche pas** : c'est une mise à jour côté client. L'attente rendait la main
immédiatement, le clic suivant partait dans un rendu en cours, et le défaut restait. C'est le
**silence réseau** qui marque la fin d'un aller-retour d'action. Deux exécutions consécutives à
zéro défaut depuis. *Attendre la mauvaise chose ressemble beaucoup à attendre.*

## ADR-095 — `npm run demo` : une commande, et un message d'accueil qui ne peut pas mentir

**Contexte.** Le propriétaire du produit va le montrer à des auditeurs et ne l'a **jamais lancé
lui-même**. Tout ce qui existait supposait un lecteur déjà installé : `db:setup` puis `dev` puis
un `demo-seed` séparé, trois commandes dont l'ordre compte, aucune ne disant qui est le
préparateur ni où est le portail. Un produit qu'on ne peut pas ouvrir devant quelqu'un n'existe
pas encore tout à fait.

**Décision.** `cd app && npm run demo` : base effacée, 20 migrations, monde de démonstration
déroulé, application construite, serveur lancé, puis un **panneau en clair** — l'adresse, les
trois rôles nommés et comment se connecter (cliquer le nom : il n'y a pas de mot de passe),
l'adresse du portail client, le dossier ouvert, et la commande de remise à zéro.

**Le panneau se LIT DANS LA BASE, il n'est pas écrit dans le script.** `scripts/demo/infos.ts`
interroge le dossier semé et réutilise `contexte()` du parcours cliqué : « qui est le
préparateur » a une seule source. Un panneau codé en dur aurait affiché « Karim Benali » même le
jour où la distribution des rôles change — c'est-à-dire aurait menti sans que rien ne casse
(règle 13).

**Le lanceur est en `.mjs`, pas en TypeScript.** C'est le premier fichier qu'exécute une machine
neuve : il doit pouvoir dire « lancez `npm install` ». Un script en TypeScript aurait eu besoin
de `tsx` pour démarrer — donc de ce qu'il est chargé de vérifier. *Un message d'accueil qui a
besoin de ce qu'il vérifie ne vérifie rien.*

**Chaque échec dit quoi faire, jamais une trace.** Un arrêt donne toujours trois choses : ce
qu'on tentait, ce que la machine a répondu (les 12 dernières lignes, pas 400), et **la commande
qui répare**. Contrôles avant tout effacement : Node ≥ 18.18, `node_modules` présent, `next` et
`tsx` présents, le fichier FEC du jeu de données présent, le port libre. Trois de ces chemins ont
été empruntés pour de vrai — port occupé, jeu de données absent, `node_modules` absent.

**Le verrou, trouvé en vérifiant mon propre conseil.** Le script disait, port occupé :
« choisissez un autre port : `PORT=3100 npm run demo` ». Suivi à la lettre, ce conseil **efface
la base sous la démonstration en cours** : PGlite n'admet qu'un écrivain, et changer de port n'y
change rien. Un fichier `.data/demo.lock` (pid, port, adresse) est donc posé avant l'effacement
et levé à la sortie ; un verrou dont le processus est mort est ignoré en silence. Vérifié à deux
instances : la seconde refuse, `.data/pg` reste à 1 331 fichiers, la première sert toujours 200 ;
Ctrl-C lève le verrou. *Un conseil qu'on n'a pas suivi soi-même est une hypothèse.*

**Aucune durée n'est inventée.** Une première rédaction annonçait « trois à quatre minutes » pour
une étape de 14 secondes. Le panneau ne cite plus que le **temps mesuré du lancement en cours**
(« Ce lancement-ci a pris 01:02 »). `OTTO_OCR_ADAPTER=mock` et `OTTO_QUERY_PLANNER=mock` sont
imposés : une démonstration ne dépense pas d'argent.

## ADR-096 — Portabilité Windows : plus jamais `npx` dans un spawn, et un message par cause

**Le défaut, payé par le premier utilisateur réel.** Windows 11, PowerShell, dépôt fraîchement
cloné : `npm run demo` meurt à l'étape 1/5 sur `spawn npx ENOENT`. Sur Windows, `npx` est un
script `npx.cmd`, qu'un `spawn` sans shell ne résout pas (et que le correctif de sécurité de
Node CVE-2024-27980 refuse de toute façon hors shell). L'auteur avait écrit noir sur blanc
« je n'ai pas testé Windows » — c'était ça.

**Le second défaut, pire que le premier.** Le message d'erreur disait « vérifiez que rien
n'utilise `app/.data` » : il a envoyé un débutant chercher un conflit de base alors que le
programme n'avait pas démarré. Un message qui envoie corriger la mauvaise chose est pire qu'un
message sec — c'est le défaut que ce dépôt traque partout ailleurs, et il était dans son
propre lanceur.

**Décision 1 — ne plus jamais lancer `npx`, nulle part.** Chaque outil (next, tsx) est un
fichier JavaScript dans node_modules ; le Node courant l'exécute directement :
`spawn(process.execPath, [binaireDe('next', racine), 'build'])`. Le chemin est lu dans le
champ `bin` du package.json du paquet, jamais deviné. Pas de `shell: true` — le shell ouvre
les problèmes de guillemets. `scripts/lib/portable.mjs` porte cette logique, en JavaScript nu
(le lanceur l'importe avant de savoir si `npm install` a été lancé) ; le lanceur, les trois
harnais (screens, clics, visuel) et le balayage de la suite l'utilisent tous.

**Décision 2 — la plateforme est un PARAMÈTRE.** Tuer un arbre de processus (`taskkill /T`
contre `-pid` de groupe), `detached` (POSIX seulement), la syntaxe des conseils (`&&` et
`PORT=x cmd` n'existent pas dans le PowerShell 5.1 livré avec Windows ; `;` et
`$env:PORT=x;` y marchent), le chemin de Chromium (`/opt/pw-browsers` était codé en dur —
un chemin POSIX-seulement) : chaque fonction prend la plateforme en paramètre, et
tests/portable.test.ts EXÉCUTE la branche Windows depuis Linux. Sans cela, cette moitié du
fichier serait du code que personne n'exécute avant un utilisateur.

**Décision 3 — un échec de lancement n'est jamais raconté comme un échec de migration.**
`lancer()` distingue l'erreur de démarrage (l'exécutable n'a pas pu être lancé : le travail
n'a PAS commencé) du code de sortie non nul ; et `causeEchecBase()` classe la sortie d'un
db-setup échoué — disque plein, base tenue (l'`Aborted()` de PGlite, l'`EBUSY` de Windows),
installation cassée — en réservant explicitement « inconnue » : une cause non reconnue est
rapportée comme telle, jamais déguisée en cause probable. Les deux sont testées.

**Ce qui est vérifié, et d'où.** Depuis Linux : le lancement complet (01:15), le verrou à
deux instances, Ctrl-C, l'outil manquant, les deux branches de plateforme de chaque fonction,
la classification des causes, `tsc`, la suite. Depuis Windows : RIEN — ce dépôt n'a pas de
machine Windows, et une relecture n'est pas une exécution. La commande de confirmation est
`cd app; npm run demo`, et STATUS.md le dit.

**Sur Windows, `rmSync` d'un fichier ouvert échoue** (EBUSY/EPERM) là où Linux l'accepte :
l'effacement de `.data` est gardé et parle (« un processus tient encore ces fichiers »)
au lieu de dérouler une trace.

## ADR-097 — Les notes de revue s'ancrent sur l'objet métier, jamais sur une position d'écran

**Contexte.** ADR-028 avait décidé l'ancrage obligatoire des notes — mais il n'existait que
dans le prototype (`prototype/src/13_notes.js`). L'application, elle, portait des notes
rattachées au mieux à un papier entier : « sur QUOI porte la note » restait dans le texte.
Le fondateur demande l'ancrage dans le produit : cellule du tableau de testing, zone de
texte, paramètre, réponse de questionnaire, montant, conclusion — avec trois gestes (clic
droit, appui long, puce au survol) et le jeton d'attention existant.

**La décision structurante — l'identité, pas la position.** Une ancre est `(type, référence
métier, champ, étiquette)` :

| type | référence | survit à |
|---|---|---|
| `sample_item` | `gl_entry.natural_key` | ré-imports (Gate 2) ET re-tirages : le nouvel échantillon qui reprend la même écriture reprend la note à son bord |
| `workpaper_section` | `code du papier:clé de section` | nouvelles versions du papier (redraft) |
| `questionnaire_answer` | code de la question | millésimes de la méthode |
| `materiality_param` | nom du paramètre | recalculs de seuils |

**« Objet retiré » est un statut DÉRIVÉ, pas stocké.** La résolution
(`services/notes/ancres.ts`) confronte chaque ancre à l'état ACTUEL du dossier ; une note
dont l'objet est sorti de l'échantillon ne disparaît pas — elle remonte dans la vue
transverse (`/eng/[id]/notes`) marquée « objet retiré », avec son histoire. Un drapeau
stocké aurait menti au recalcul suivant. Le test le prouve en l'exerçant : pose, re-tirage
simulé, retiré ; retour du tirage, la note se ré-attache SEULE.

**On ne pose pas sur un objet qui n'existe pas.** `assertAncrePosable` refuse à la pose une
référence que la résolution ne trouve pas : l'ancre imaginaire serait la position d'écran
par un autre chemin. La base double la garde (`review_note_anchor_complete`) : une ancre à
moitié posée est refusée par contrainte.

**Les réponses entrent au dossier.** `review_note_reply` (0021) : répondre à une note
ouverte la passe « adressée » ; une note close ne se rouvre pas. La clôture reste à
l'AUTEUR de la note — dans l'application l'auteur d'une note est le réviseur qui l'a posée,
et le fondateur a demandé « comme aujourd'hui » ; la règle « jamais l'auteur » du prototype
(ADR-028 §3) n'est pas reprise, et c'est consigné ici plutôt que d'exister en divergence
silencieuse. L'attribution admet OTTO (`assignee_kind`, sans id humain — la contrainte
l'interdit) ; son comportement d'exécution est la tranche suivante.

**Le geste.** `Annotable` (composant client) : clic droit, appui long 550 ms, puce ✎ au
survol et au clavier — le clic droit seul est inaccessible au doigt. Le marqueur est le
jeton `--amber` existant : le système de couleurs est fermé, on n'y ajoute rien. Le panneau
de pose est fixe et centré — un popover absolu débordait à 390 px, et la revue visuelle
mesure le débordement. Écrans porteurs : papier (cellules par champ du gabarit + sections),
risque (réponses du questionnaire), seuils (les quatre paramètres). Le parcours cliqué pose
une note AU CLIC DROIT sur la conclusion, vérifie le marqueur, répond, essuie le refus de
clôture par un non-auteur, et clôt dans la vue transverse.

## ADR-098 — Une note pour OTTO est une instruction exécutée — jamais close par lui, jamais devinée

**Contexte.** Les notes savent désormais viser un objet (ADR-097) et être attribuées à OTTO.
Le fondateur fixe trois règles non négociables : OTTO répond et ne clôt pas ; il refuse ce
qui n'est pas de son ressort avec la liste de ce qu'il sait faire ; sa réponse entre au
dossier — demandé, fait, sur quelles pièces, reste à vérifier.

**La compréhension est DÉTERMINISTE (P4).** Trois capacités à catalogue fermé
(`notes/otto.ts`) : reprendre la lecture des pièces (extraction), rejouer le vouching L0,
dresser l'état de complétude d'un élément. La correspondance est par mots-clés, comme le
planificateur d'« Interroger » — pas de LLM pour deviner une intention quand une règle
suffit. Et le refus a TROIS visages, chacun le sien : le refus de PRINCIPE (« conclus »,
« estime », « signe » — hors de son ressort, plafond L2, même si le reste de la phrase
matche une capacité), le refus d'IGNORANCE (instruction inconnue), et le refus de DOUTE
(deux capacités possibles — « je n'exécute pas sur un doute » : une donnée fausse dans un
papier est le pire défaut possible du produit).

**Un refus laisse la note OUVERTE.** Rien n'a été traité ; un refus qui ferait avancer
l'état serait un silence lu comme un succès (règle 13). Une exécution passe la note
« adressée » — et s'arrête là : la clôture exige un humain (`transitionNote` exige un
app_user, OTTO n'en est pas un). Le périmètre d'exécution est l'ANCRE de la note — « ces
trois lignes », c'est l'ancre qui le dit — sinon la mission.

**Tout entre au dossier.** La réponse (`review_note_reply`, author_kind 'otto') porte le
texte ET le compte rendu structuré {demandé, fait, pièces, reste à vérifier} ; l'export PDF
imprime les réponses sous chaque note ; l'event_log trace `review_note_otto_executed` /
`_refused` en `actor_kind='ai'`. Ce qu'OTTO relit repasse par la file de vérification
humaine — la confiance ordonne la file, elle ne l'évite jamais (ADR-012). L'exécution est
SYNCHRONE à la pose, sous les yeux de qui la pose : une file d'attente silencieuse serait
un objet qu'aucun chemin de lecture n'atteint.

## ADR-099 — La colonne ajoutée au testing : OTTO propose, l'humain confirme, jamais l'inverse

**Le piège central, nommé par le fondateur.** Le titre d'une colonne ajoutée est du texte
libre — « BL signé ? », « date livraison », « qté livrée ». Si OTTO devine mal et remplit
quand même, une donnée FAUSSE entre dans un papier de travail : le pire défaut possible de
ce produit. La réponse est un ÉTAT, pas une prudence : `proposee → confirmee → remplie`,
et RIEN ne se cherche avant la confirmation. La proposition est une phrase complète (« je
cherche la date figurant sur le bon de livraison, dans les pièces de type bon de
livraison ») ; confirmer, corriger (dans le catalogue fermé des champs que l'échelle
d'extraction sait lire), ou annuler. Un titre que les règles ne savent pas interpréter est
un AVEU affiché — jamais une devinette exécutée ; deux règles qui matchent sont un doute —
même refus.

**Deux issues par cellule, jamais une seule.** Trouvée : la valeur AVEC sa provenance
(pièce + extraction — la contrainte SQL refuse une « trouvée » sans pièce, P7), héritant de
la file de vérification (un échelon OCR non attesté reste « à vérifier », ADR-012).
Introuvable : la case le DIT, et une demande de clarification se PROPOSE — brouillon, un
élément par ligne, circuit d'approbation L2 existant, jamais d'envoi automatique.

**La colonne suit le CODE du papier** (même identité métier que les ancres, ADR-097) : elle
survit aux versions. Elle ne se supprime pas, elle s'ANNULE — remplie, plus du tout : elle
fait partie du papier et de son export (tableau, marqueur « colonne ajoutée », justification
en annexe des modifications). Un export qui tairait une colonne visible à l'écran serait un
document différent de celui que le réviseur a relu.

**Le coût.** L'interprétation v1 est par règles : zéro appel payant, et l'écran le DIT
(« 0,00 $ — interprétation par règles »). Le jour où un interprète LLM proposera sur les
titres illisibles, il passera par un adaptateur avec garde de budget et coût affiché — et il
ne fera toujours que PROPOSER : la confirmation restera humaine, le remplissage ne lira que
les champs du catalogue. La colonne porte déjà cout_usd et ai_run_id pour ce jour-là.

## ADR-100 — La bascule porte sur les missions, groupées par client — et chaque bascule se journalise

**Contexte.** Un client peut être un groupe : UN client, PLUSIEURS entités, parfois plusieurs
mandats par entité. L'accueil listait les missions à plat, et passer d'un dossier à l'autre
était une navigation muette.

**Décision.** Le « client » d'une mission est le GROUPE quand son entité en fait partie
(corp_group via component), sinon l'entité elle-même — et cette hiérarchie est LA structure
des deux surfaces : l'accueil (panneaux client → entité → mandats) et le sélecteur « Changer
de dossier » en tête de chaque écran de mission. Jamais une liste plate de clients.

**La bascule est une ACTION, pas un lien.** Ouvrir un dossier d'audit est un acte de
consultation : chaque changement écrit `engagement.switched` au journal, avec sa provenance
(`payload.depuis`). Les gardes, dans l'ordre des refus les plus informatifs : l'ISOLATION
d'abord (« cette mission appartient à un autre cabinet — bascule refusée »), l'AFFECTATION
ensuite (membre actif de la mission cible, sinon « demandez l'affectation à l'associé »).
Le tenant vient de la session, jamais d'un champ. Le refus renvoie sur le dossier de
DÉPART — pas sur la cible, où l'utilisateur n'a précisément pas accès.

**Le test TENTE la fuite, dans les deux sens** (modèle team.test.ts) : un second cabinet est
semé, Claire essaie de basculer vers sa mission (refus, et RIEN au journal), son associé
essaie vers Vermeil (refus) ; Hugo, du même cabinet mais non affecté, est refusé pour
l'affectation, pas pour l'isolation. Le parcours cliqué ouvre le sélecteur, lit le
groupement (Meridian → Altiverre → deux mandats), bascule, et LIT l'événement au journal.

## ADR-101 — Les invitations de réunion : tout le déterministe, derrière deux adaptateurs simulés

**Lucidité d'abord.** Lire les agendas Outlook de l'équipe suppose une inscription
d'application Microsoft, un consentement administrateur sur le locataire du cabinet et des
permissions déléguées — un chantier, indémontrable sans locataire réel. Donc TOUT le
déterministe se construit maintenant, testé et hors ligne, exactement comme l'échelle
d'extraction : la lecture d'agendas et l'envoi vivent derrière `AgendaAdapter` et
`TransportInvitationAdapter` (défaut simulé, nom inconnu qui lève), et l'écran DIT que
c'est simulé — le transport simulé rend `remis: false` : il n'affirme pas plus que ce
qu'il fait.

**La contrainte de fond, dans le TYPE.** On lit les DISPONIBILITÉS (libre/occupé), jamais
le contenu des agendas — donnée personnelle des collègues, minimum nécessaire.
`CreneauOccupe` n'a que `debut` et `fin` : il n'existe pas de champ pour un titre, un lieu
ou des participants, et le test l'affirme.

**Le déterminisme partout.** L'adaptateur simulé place ses blocs occupés par hachage
FNV-1a (adresse + jour) : mêmes entrées, mêmes occupations, sur toute machine — une
démonstration qui change à chaque ouverture ne se rejoue pas (règle 12).
`creneauxCommuns()` est pure : intersection des libertés, heures ouvrées, jamais le
week-end, testée sans adaptateur. Le `.ics` (RFC 5545 : échappement, repli des lignes à
75 octets, METHOD:REQUEST) sort d'un générateur pur du noyau.

**Les humains aux deux portes.** Le CHOIX du créneau est humain, obligatoire — le service
refuse un destinataire vide en le disant (« le choix est humain, toujours ») ; l'ENVOI est
un second geste explicite, refusé la seconde fois. Les COPIES suivent l'ordre exact et
calculé, figé dans l'invitation : le contact client clé de la mission, puis l'équipe du
plus senior au moins senior, à grade égal par ordre alphabétique. Le rang de séniorité est
NOMMÉ (`RANG_SENIORITE`) — avant lui, le seul tri sur eng_role du dépôt était alphabétique
(manager < partner < senior < staff) et mentait en silence. Le contact clé et les contacts
par domaine sont des données DE LA MISSION (`engagement_contact`, une seule clé par
contrainte), pas de l'entité.

**Le chiffrage du branchement Microsoft réel** est dans STATUS.md (file d'attente) : ce
qu'il faut (app registration, consentement admin, `Schedule.Read.All` ou équivalent
libre/occupé, `Calendars.ReadWrite` pour émettre), et ce qu'on refusera (tout scope qui
lit le contenu des agendas).
