# 04 — Data model

Postgres (Supabase in production, PGlite locally — ADR-001). Authoritative DDL lives in
`supabase/migrations/`; this doc is the shape + rules. Conventions: `id uuid pk` default
`gen_random_uuid()` unless noted; `created_at timestamptz` everywhere; FKs `on delete
restrict` (provenance must never cascade away); soft state via `status` enums; **no hard
deletes** anywhere provenance flows — supersede with versions.

## 1. Tenancy, people, engagement

| Table | Key fields | Notes |
|---|---|---|
| `tenant` | name | = audit firm. RLS root. |
| `app_user` | tenant_id, name, email, firm_role(partner\|manager\|senior\|staff\|admin) | Auditor-side identities. |
| `entity` | tenant_id, name, country, registry_type(siren\|ein\|fictional), registry_no, currency | Audited entity. Synthetic-only data. |
| `corp_group` | tenant_id, name | Fictional US-listed parent for demo. |
| `component` | corp_group_id, entity_id, role(parent\|component), significance | Group structure. |
| `referral_instruction` | component_id, title, body, issued_by, received_at, status | Group-auditor instructions (data-model-only MVP). |
| `period` | entity_id, label(FY2025), start_date, end_date, prior_period_id | Roll-forward spine (D9): `prior_period_id` + `rolled_from` refs on facts. |
| `engagement` | tenant_id, entity_id, period_id, kind(statutory_audit\|sox_component\|integrated), **classe**(eip\|cotee\|composante\|autre, 0035), framework_set jsonb{assurance_packs[], accounting_map, language, **materiality_benchmark?**(pbt\|revenue)}, status(setup\|fieldwork\|review\|locked\|archived), locked_at, retention_until, component_id?, methodology_id | Demo: TWO engagements on one entity (Q6): NEP statutory + SOX component. |
| `engagement_member` | engagement_id, user_id, eng_role(partner\|manager\|senior\|staff), can_sign bool | Membership drives authorization (ADR-007). |
| `client_contact` | entity_id, name, email, portal_token, active | Portal identity; token = magic-link auth (ADR-006). |

## 2. Financial data

| Table | Key fields | Notes |
|---|---|---|
| `import_file` | engagement_id, kind(tb\|gl_generic\|fec\|rcm\|listing), filename, sha256, mapping_profile jsonb, validation_report jsonb, status(validated\|rejected), row_count | One row per upload attempt; report lists every violation (FEC 18-field checks etc.). | **0036** : + systeme_source, nature_ipe(systeme\|systeme_modifie\|manuelle), identifiant_rapport, extrait_le, extrait_par — l’IPE capturée à l’import, facultative.
| `tb_snapshot` | engagement_id, period_kind(current\|prior), version, import_file_id, status(active\|superseded) | Re-import supersedes, never overwrites. |
| `account` | tb_snapshot_id, number, label, debit, credit, balance | |
| `gl_entry` | engagement_id, import_file_id, line_no, journal_code, journal_lib, entry_no, entry_date, account_no, account_label, aux_no?, aux_label?, piece_ref, piece_date, label, debit, credit, lettering?, lettering_date?, valid_date?, amount_ccy?, ccy?, flags jsonb | Canonical superset of FEC 18 fields; generic imports map into it. `flags` = deterministic JE risk flags (ADR-003): weekend, round_amount, manual_journal, period_end, credit_note_pattern. |
| `coa_map_rule` | pack_id, engagement_id?(null=pack default), account_prefix, fsli_code, priority | PCG/IFRS/US-GAAP prefix maps + engagement overrides. |
| `fsli` | engagement_id, code, name, statement(BS\|IS), balance, scoping(in_scope\|ns_proposed\|ns_confirmed\|in_scope_qualitative), scoping_basis, confirmed_by/at | Scoping is propose-and-confirm (D9), never silent. |
| `reconciliation` | engagement_id, kind(tb_gl\|tb_py\|base_gl), status, computed_at, diffs jsonb[{account, tb_amount, gl_amount, delta}] | Deterministic; per-account diffs listed, never netted. |

## 3. Assurance config

| Table | Key fields | Notes |
|---|---|---|
| `materiality` | engagement_id, version, benchmark_code, benchmark_amount, pct, amount, perf_pct, perf_amount, ctt_pct, ctt_amount, rationale, proposed_by_ai_run?, validated_by, validated_at, status(proposed\|validated\|superseded) | L3: proposal + written rationale per pack; arithmetic L0. |
| `risk` | engagement_id, fsli_code?, process_id?, assertion, level(low\|medium\|high\|significant), description, source(pack_default\|questionnaire\|manual) | |
| `procedure` | engagement_id, pack_id, template_code, kind(substantive\|control_test\|analytical), fsli_code?, control_id?, title, params jsonb, status | Instantiated from pack templates. |

## 4. Requests & evidence

| Table | Key fields | Notes |
|---|---|---|
| `request` | engagement_id, seq_no, procedure_id?, title, language, status(draft\|sent\|partially_submitted\|submitted\|accepted\|reopened), due_date, sent_at, approved_by | L2 send gate. Portal shows seq_no ("R-003") — the founder's tracker-linkage idea (#30). |
| `request_item` | request_id, kind(document\|listing\|explanation), description, sample_item_id?, control_instance_id?, exception_id?(for clarifications), status(pending\|uploaded\|complete\|na) | Item ↔ tested unit link = provenance root. |
| `reminder` | request_id, scheduled_for, sent_at?, channel(portal\|email), status | Cadence per Q8; auditor-visible log; pausable. |
| `inbound_email` | engagement_id, from_addr, subject, received_at, raw_path, status(pending\|processed\|quarantined) | Stub in MVP (fixtures); interface real (D6). |
| `evidence` | engagement_id, request_item_id?, filename, mime, sha256, size, storage_path, source(portal\|email\|auditor), audience(client_provided\|internal), uploaded_by_kind+id, doc_type(invoice\|delivery_note\|credit_note\|bank_statement\|reconciliation_sheet\|approval_record\|listing\|other), class_confidence, quarantined bool, quarantine_reason | sha256 dedupe **flags** duplicates (a duplicate invoice is audit information, not noise). |
| `extraction` | evidence_id, rung(xml\|text_layer\|ocr\|llm\|human), status, ai_run_id?, fields jsonb[{name,value,confidence,page,zone}], overall_confidence, verified_by?, verified_at? | L2 verify below pack threshold; provenance per field. |

## 5. Sampling & testing

| Table | Key fields | Notes |
|---|---|---|
| `sample` | engagement_id, procedure_id, method(monetary_coverage_random\|attribute_frequency), params jsonb, seed, population_hash, population_size, population_amount, coverage_amount, status(proposed\|validated\|drawn), rationale, validated_by/at | Deterministic: same (population_hash, seed, params) ⇒ same draw. |
| `sample_item` | sample_id, unit_kind(gl_entry\|control_instance), unit_id, selection_reason(high_value\|random\|risk_flag), amount?, status(pending\|tested\|exception\|complete) | |
| `match` | sample_item_id, status(matched\|exception\|pending_evidence\|pending_verify), checks jsonb[{check, expected, found, tolerance, pass, source_extraction_field}] | Deterministic vouching detail — renders as the workpaper sample table. |
| `exception` | engagement_id, taxonomy_code(pack), kind(substantive), sample_item_id?, match_id?, evidence_id?, severity, status(open\|clarification_requested\|explained\|resolved\|escalated), description, amount_impact?, resolution?, resolved_by/at | Typed; lifecycle logged. |
| `followup` | exception_id?/deviation_id?, request_id, drafted_by_ai_run?, approved_by, status | Auto-drafted clarification, L2 approve-to-send. |
| `misstatement` | engagement_id, exception_id?, kind(factual\|judgmental\|projected), amount, corrected bool, status(proposed\|confirmed\|dismissed), notes | ADR-011; feeds ISA 450 aggregation view. |
| `verification_check` | engagement_id, procedure_id, sample_item_id, verifier_id, result(agree\|disagree), disagreement_note?, seconds_spent?, performed_at | ADR-012.3: blind human re-performance of a seeded random subsample of machine-PASSED items — the engagement-level tool-reliability control; rendered in the workpaper. |

## 6. ICFR / SOX set

| Table | Key fields | Notes |
|---|---|---|
| `process` | engagement_id, name, description | e.g. Order-to-Cash. |
| `walkthrough` | process_id, status, performed_by?, performed_at?, notes | Data-model-only MVP. |
| `itgc_area` | code(access\|change\|operations), name | Reference list. |
| `control` | engagement_id, process_id, code, name, description, frequency(many_daily\|daily\|weekly\|monthly\|quarterly\|annual\|adhoc), nature(manual\|automated\|itdm), effect(preventive\|detective), is_key bool, itgc_area_id?, owner_name, di_status(not_assessed\|effective\|deficient), di_conclusion? | D&I is a **gate**: OE testing blocked while `di_status='not_assessed'` or `deficient`. |
| `rcm_row` | engagement_id, control_id, risk_desc, assertions text[], coso_component | The RCM view = join over this. |
| `control_instance` | control_id, label(2025-03), occurred_on, performer_name, source(listing\|evidence) | Population unit for attribute sampling. |
| `control_test` | control_id, sample_id, status(draft\|testing\|complete), conclusion?, concluded_by/at | |
| `attribute_def` | control_id, code, description, required bool, expected_evidence | Pack/RCM-defined test attributes (approval present, performed on time, correct performer, evidence attached…). |
| `attribute_result` | sample_item_id, attribute_code, result(pass\|fail\|na), basis(extraction_field\|human), extraction_field_ref?, note | |
| `deviation` | engagement_id, control_id, sample_item_id, attribute_code, taxonomy_code(pack), status(open\|clarification_requested\|explained\|resolved\|escalated), description, resolution? | Mirror of `exception` for controls. |
| `deficiency` | engagement_id, control_id, severity_proposed(deficiency\|significant_deficiency\|material_weakness), severity_final?, basis jsonb(rule inputs: magnitude, likelihood, compensating controls, key-control flag), narrative, status(proposed\|confirmed\|dismissed\|communicated), aggregation_group? | L3: rules-first proposal (Q7) + drafted narrative; human decides. |

## 7. Documentation

| Table | Key fields | Notes |
|---|---|---|
| `workpaper` | engagement_id, pack_id, code(REV-01\|OE-C03), procedure_id?/control_test_id?, title, language, sections jsonb, status(draft\|in_review\|reviewed\|signed\|outdated), version, based_on_hash | `based_on_hash` = hash of linked upstream facts → auto-flag `outdated` when upstream changes after draft. |
| `workpaper_edit` | workpaper_id, user_id, section, before, after, justification **not null**, edited_at | Visible modification flag = existence of rows here (idea #14). |
| `wp_attachment` | workpaper_id, evidence_id | Auditor Excel/file attachments (audience=internal). |
| `review_note` | engagement_id, workpaper_id?, author_id, assignee_id?, status(open\|addressed\|closed), text, addressed_at?, closed_at? | Human-only (idea #17); never client-visible; excluded from exports by audience rules. |
| `signoff` | workpaper_id, user_id, sign_role(preparer\|reviewer\|partner), signed_at | **Append-only, immutable.** Re-draft after sign-off ⇒ new version requiring re-sign. |

## 7bis. Run identity & verification (Gate 2 / ADR-012)

| Table | Key fields | Notes |
|---|---|---|
| `engine_run` | engagement_id, engine(importer\|reconciliation\|population\|sampling\|matching\|attribute_testing\|workpaper_draft\|deficiency_rules\|projection), engine_version, pack_id, config_hash, params, started/finished | Identity for deterministic runs; referenced from sample, reconciliation, match, workpaper, deficiency. Workpaper attribution cites this run. |
| `verification_run` | procedure_id, engine_run_id, seed, rate, min_items, machine_passed_population_hash, counts | The spot-check subsample is itself a seeded reproducible draw — stored, never recomputed. |
| `verification_check` (+) | verification_run_id, **blind_values jsonb** (verifier's independent values captured before machine-result reveal), result computed, escalation(none\|expand_subsample\|reperform_procedure), exception_id on disagree | Blind re-performance, with a consequence flow. |
| `sample_evaluation` | sample_id, known_misstatement, projected_misstatement, projection_method(ratio\|difference\|none), tested coverage/random amounts, untested_amount, te_amount, conclusion_basis, concluded_by/at | ISA/NEP 530-shaped evaluation inside the procedure workpaper; conclusion gate = all exceptions dispositioned AND known+projected evaluated vs TE (human concludes, L4). |

**population_hash canonical spec (v1)**: rows sorted by (entry_date, entry_no, line_no);
serialized fields `[natural_key, account_no, debit_cents, credit_cents]` (amounts as
integer cents); joined with `\n`, sha256, prefixed `pophash-v1:`. One kernel module defines
it; generator and app both import that module (ADR-015). For control populations: rows
sorted by (label), fields `[label, occurred_on, performer_name]`.

## 8. Infrastructure

| Table | Key fields | Notes |
|---|---|---|
| `event_log` | id bigserial, tenant_id, engagement_id?, actor_kind(user\|system\|ai), actor_id?, verb, object_type, object_id, payload jsonb, prev_hash, hash, created_at | **Append-only, hash-chained** per engagement. Every state change in this doc writes here. |
| `ai_run` | tenant_id, engagement_id?, purpose(extraction\|classification\|drafting\|suggestion), adapter(anthropic\|mistral_ocr\|mock), model, prompt_id, prompt_version, input_hash, output_hash, tokens_in, tokens_out, cost_usd, latency_ms | FRC-guidance-as-feature; COST.md is derived from this table. |
| `notification` | recipient_kind+id, kind, payload jsonb, read_at? | Portal + auditor inbox. |

## 9. Immutability, versioning, lock, retention

1. **Append-only**: `event_log`, `ai_run`, `signoff`, `workpaper_edit`, `reminder`,
   `extraction` (new attempt = new row). DB triggers reject UPDATE/DELETE (prod: revoked
   privileges; local: same triggers).
2. **Content-addressed evidence**: files stored by sha256; re-upload = new evidence row,
   same blob; blobs never mutated.
3. **Supersede pattern**: `tb_snapshot`, `materiality`, `sample`, `workpaper` version via
   `status='superseded'` + `version` int; readers always resolve latest-active, history
   remains queryable.
4. **Documentation lock (Q2/ADR-014)**: `engagement.status='locked'` (assembly deadline
   per pack: France report date + 60 days config; PCAOB ≤14 days after report release,
   45d legacy tier) ⇒ all writes on engagement-scoped tables rejected except: review-note
   closure, and **amendment events** — justified additions recorded as `event_log`
   verb=`post_lock_amendment` + new versioned rows flagged `post_lock=true` carrying
   date added, preparer, reason (matches AS 1215.16 verbatim). Enforced by trigger on
   every engagement-scoped table.
5. **Retention (ADR-014 rev. 2)**: `engagement.retention_until` and
   `engagement.doc_completion_due` are computed from the engagement's own facts and stored
   with `engagement.legal_basis` (the provision behind each date, and its verification
   status). France **6 years** per C. com. art. **R. 820-42** (in force 2024-02-01) and
   **60 days** to close the file per art. **D. 821-186 III-IV**; PCAOB **7 years** from report release per
   AS 1215.14); nothing is deletable before it (enforced procedurally + prod ops runbook);
   superseded analyses reflecting differing professional judgments are never purged
   (SEC Rule 2-06(c)-shaped).
6. **Roll-forward (D9)**: fact tables carry `rolled_from uuid?` — next-year engagement
   proposes prior-year structures (requests, RCM, mappings, materiality basis) as *drafts
   requiring revalidation*; never silently active.
7. **Audience rule**: client-visible surfaces read only: `request`, `request_item`,
   `reminder`, `evidence(audience=client_provided, own uploads)`, dashboard aggregates
   flagged `client_safe`. Everything else is auditor-only — enforced in the data-access
   layer locally and RLS in production (ADR-007).

## 0036 — L'information produite par l'entité, au niveau du rapport (ADR-118)

| Table | Colonnes | Notes |
|---|---|---|
| `ipe_rapport` | engagement_id, nom, code_rapport, systeme_source, parametres, periode_debut, periode_fin, genere_par, genere_le, empreinte, nature(systeme\|systeme_modifie\|manuelle), evidence_id ⊕ import_file_id, exhaustivite, exactitude, redige_par_ia, valide_par, valide_le, created_by | UN objet par rapport, partagé par les papiers ; unique (engagement_id, nom, periode_fin) ; contrainte `ipe_rapport_documente` (G-12) ; RLS forcée. |
| `ipe` (0031) | + rapport_id → ipe_rapport | Le papier DÉSIGNE le rapport ; `ipe_documente` devient « utilisee = false ou rapport_id posé » (G-08). Les colonnes de documentation de 0031 restent, lues par compatibilité. |
