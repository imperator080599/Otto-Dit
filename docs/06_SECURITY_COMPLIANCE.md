# 06 — Security & compliance

Day-one architecture, not features (P11). Local demo enforces the same model in the
data-access layer; production adds infrastructure enforcement (RLS, storage policies).

## 1. Multi-tenant isolation

- **Tenant = audit firm.** Every table carries `tenant_id` (directly or via engagement).
  Production: Postgres RLS on every table — `tenant_id = auth.jwt claim` AND engagement
  membership (`engagement_member`) for engagement-scoped rows. Local: the data-access layer
  applies identical predicates (ADR-007) — defense in depth, both layers ship.
- **Engagement-level membership**: auditors see only engagements they are members of;
  `can_sign` gates sign-off writes; firm_role gates administration.
- **Client portal scoping**: client contacts authenticate via magic token → session scoped
  to (entity, engagement, audience=client). Readable surface is a whitelist (04 §9.7):
  requests, own uploads, reminders, client-safe dashboard aggregates. Audit documentation
  (workpapers, samples, exceptions, notes, event log) is not reachable by any client-side
  query path — separate route group + data-layer audience checks + RLS in production.
  **The client never sees audit documentation (D6) is enforced by construction, not UI.**

## 2. Encryption & storage

- Production (DEPLOY.md): Supabase Postgres encryption at rest, TLS in transit, Storage
  buckets private with signed URLs (short TTL), evidence bucket per tenant prefix; secrets
  in Vercel/Supabase env vaults. Local: file storage under `app/.data/` (gitignored),
  content-addressed by sha256.
- Evidence blobs immutable + content-addressed (04 §9.2); integrity re-verifiable at any
  time against stored sha256 (exports include hashes).

## 3. Data residency (ADR-009)

- Region per tenant market: Supabase Paris (eu-west-3) + Vercel cdg1/fra1 for EU tenants;
  US regions for US tenants. Inference: Anthropic API behind `LlmClient`; EU-resident
  engagements → Bedrock EU (zero-retention mode) or Vertex EU; US engagements → US
  inference. OCR default Mistral (EU vendor). Logged per-run in `ai_run.adapter`.

## 4. Immutable audit trail

- `event_log`: append-only, hash-chained per engagement (`hash = H(prev_hash ‖ row)`),
  covering every state change named in 03/04. Production: INSERT-only privileges; local:
  triggers reject UPDATE/DELETE. Chain verification job + UI indicator.
- `ai_run`, `signoff`, `workpaper_edit`: append-only (same enforcement).

## 5. Documentation lock & retention (per pack)

- Lock at assembly deadline (ADR-014): France pack report date + 60 days (config); PCAOB
  pack ≤14 days after report release (AS 1000-era amendment; 45-day legacy tier per
  engagement FY/firm size). Lock semantics per Q2: writes rejected except justified
  post-lock amendments, recorded as `post_lock_amendment` events with author/date/reason —
  matching AS 1215.16's added-documentation requirements verbatim.
- Retention (ADR-014): France **10 years** (Code de commerce former art. R.823-10, "même
  après la cessation des fonctions"); PCAOB **7 years** from report release (AS 1215.14);
  SEC Rule 2-06 extends scope to qualifying correspondence/communications and requires
  keeping records inconsistent with final conclusions → supersede-never-delete +
  production store includes portal messages/review notes in retention. Deletion impossible
  before `retention_until` (procedural + ops runbook; legal-hold flag overrides).

## 6. AI governance

1. **Client documents are UNTRUSTED content.** Extraction/classification prompts treat
   document text strictly as data: system prompts forbid instruction-following from
   documents; structured-output schemas constrain responses; no tool access from
   extraction contexts; anomalous content (instructions to the system, absurd fields,
   parse-breaking payloads) → `evidence.quarantined=true` + exception for a human. The
   deterministic rungs (XML, text-layer parse) are immune by construction — one more
   reason they lead the ladder.
2. **Per-output logging**: every LLM/OCR call = `ai_run` row (adapter, model, prompt id +
   version, input/output hash, tokens, cost). Prompts are versioned files in-repo.
   Any file-bound artifact renders its AI involvement ("drafted by AI, approved by X on
   date") — FRC-guidance-as-feature.
3. **Human validation gates per the L2 evidence contract (ADR-012)**: deterministic rungs
   L0/L1 under a spot-check control; OCR/LLM extractions item-verified side-by-side
   (confidence = triage, never bypass); blind re-performance of a seeded subsample of
   machine-passed items per procedure (`verification_check`) as the engagement-level
   tool-reliability control; drafted prose, clarification requests and workpapers carry
   `validated_by` before they count; parameters L3; conclusions/sign-offs L4/L5 human.
   Workpapers attribute honestly: "Performed by OTTO engine run #x — Validated by [name,
   date]".
4. **No training on client data, ever** (D9). Provider zero-retention modes in production
   config. Synthetic data only in this repo.
5. **Regulatory anchors** (verified, 10_D13_RESEARCH §D): FRC "AI in Audit" (26 June 2025)
   + FRC Generative & Agentic AI factsheet (March 2026) — central-vs-file documentation
   split and human accountability via ISQM (UK) 1 / ISA (UK) 220 map onto OTTO's central
   tool docs + per-engagement `ai_run` log; CNCC "IA & Audit : Bonnes pratiques" fiches
   (June 2025; advanced 2025/2026 edition) — good-practice guidance expecting systematized
   human supervision and traceable AI documentation (prompts, model version, human
   review) per NEP 500 and the EU AI Act (guidance, not a norme d'exercice professionnel).

## 7. Inspection defensibility summary (H2A / PCAOB)

An inspector can ask, for any workpaper: who prepared, reviewed, signed and when
(`signoff`, dated, immutable); what evidence supports each figure (click-through
provenance, P7); where AI was involved and whether a human approved it (`ai_run` +
validation fields); what changed after drafting (`workpaper_edit` with justification);
what happened after lock (amendment events); whether the sample is reproducible
(seed + params + population hash). Every answer is a stored fact, not a reconstruction.

## 8. Threats explicitly considered

| Threat | Answer |
|---|---|
| Cross-tenant leak | RLS + data-layer predicates + per-tenant storage prefixes; tests assert isolation |
| Client reaches audit docs | whitelist surface + audience checks + RLS; tests assert the negative |
| Prompt injection via evidence | §6.1 quarantine + structured outputs + no tool access |
| Tampering with the trail | append-only + hash chain + verification job |
| AI output slipping into file unreviewed | schema-level `validated_by` gates; UI renders unvalidated drafts as drafts only |
| Evidence substitution after testing | content-addressing; match stores extraction refs bound to sha256 |
| Token/portal link leak | short-TTL signed URLs; portal tokens revocable per contact; scope-limited |

Pre-pilot legal task (A13): secret professionnel / GDPR sub-processing analysis and a
standard DPA before any real client data touches a deployed instance.
