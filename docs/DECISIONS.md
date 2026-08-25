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
