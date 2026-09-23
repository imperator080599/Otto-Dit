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
| `engagement` | tenant_id, entity_id, period_id, kind(statutory_audit\|sox_component\|integrated), **classe**(eip\|cotee\|composante\|autre, 0035), framework_set jsonb{assurance_packs[], accounting_map, language, **materiality_benchmark?**(pbt\|revenue)}, status(setup\|fieldwork\|review\|locked\|archived), locked_at, retention_until, component_id?, methodology_id, **automation_level?**(L0\|L1\|L2, 0164) | Demo: TWO engagements on one entity (Q6): NEP statutory + SOX component. `automation_level` (mandat 2026-09-14, §2.2): mission override of the firm pack's automation ceiling, downward only (AUTO-01), null = inherit the pack default. |
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
| `procedure_instance` | engagement_id, pack_id, template_code, kind(substantive\|control_test\|analytical), fsli_code?, control_id?, title, params jsonb, status, nature(P1-04), deplanned_at?/by?/motif?(P1-04) | Instantiated from pack templates. **Corrigé P1-08 (AUD-23)** : ce tableau nommait `procedure` — cette table n'a jamais existé (aucune migration ne la crée) ; `procedure_instance` est la vraie table, avec les mêmes colonnes d'origine plus `nature`/`deplanned_*` ajoutées depuis. Trouvé par le générateur `scripts/docs/data-model.ts` en confrontant ce nom à la DDL réelle. |

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

### `account_detail_import`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | non | — |
| evidence_id | uuid | non | — |
| row_count | integer | non | 0 |
| total_cents | bigint | non | 0 |
| gl_attendu_cents | bigint | oui | — |
| ecart_cents | bigint | oui | — |
| ecart_explication | text | oui | — |
| rapprochee | boolean | non | false |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |
| rapprochee_by | uuid | oui | — |
| rapprochee_at | timestamp with time zone | oui | — |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `rapprochee_by` → `app_user(id)` on delete no action

Index : `account_detail_import_eng_idx`

Politiques RLS : `account_detail_import_eng` (ALL, {public})

### `account_detail_row`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| import_id | uuid | non | — |
| seq | integer | non | — |
| reference | text | non | — |
| label | text | non | — |
| amount_cents | bigint | non | — |

FK : `import_id` → `account_detail_import(id)` on delete restrict

Index : `account_detail_row_import_id_reference_key`, `account_detail_row_import_idx`

Politiques RLS : `account_detail_row_eng` (ALL, {public})

### `aux_balance_file`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| cote | text | non | — |
| exercice | text | non | — |
| evidence_id | uuid | non | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action

Index : `aux_balance_file_engagement_id_cote_exercice_key`, `idx_aux_balance_eng`

Politiques RLS : `aux_balance_file_eng` (ALL, {public})

### `aux_balance_row`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| file_id | uuid | non | — |
| seq | integer | non | — |
| aux_no | text | non | — |
| aux_label | text | non | — |
| non_echu | numeric | non | — |
| j0_30 | numeric | non | — |
| j31_60 | numeric | non | — |
| j61_90 | numeric | non | — |
| plus_90 | numeric | non | — |

FK : `file_id` → `aux_balance_file(id)` on delete restrict

Index : `aux_balance_row_file_id_aux_no_key`, `idx_aux_balance_rows`

Politiques RLS : `aux_balance_row_eng` (ALL, {public})

### `cell_disposition`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| cell_id | uuid | non | — |
| reason | text | non | — |
| state_at_decision | text | non | — |
| delta_at_decision | numeric | oui | — |
| decided_by | uuid | non | — |
| decided_at | timestamp with time zone | non | now() |
| couvre_encore | boolean | non | true |

FK : `cell_id` → `test_cell(id)` on delete restrict ; `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `cell_disposition_cell_id_key`, `cell_disposition_eng_idx`

Politiques RLS : `cell_disposition_eng` (ALL, {public})

### `confirmation_campaign`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| kind | text | non | — |
| as_of | date | non | — |
| listing_evidence_id | uuid | oui | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `listing_evidence_id` → `evidence(id)` on delete no action

Index : `confirmation_campaign_engagement_id_kind_key`, `idx_conf_campaign_eng`

Politiques RLS : `confirmation_campaign_eng` (ALL, {public})

### `confirmation_party`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| campaign_id | uuid | non | — |
| nom | text | non | — |
| email | text | non | — |
| reference | text | non | — |
| compte | text | oui | — |
| sent_at | timestamp with time zone | oui | — |
| sent_by | uuid | oui | — |
| received_at | timestamp with time zone | oui | — |
| evidence_id | uuid | oui | — |
| montant_confirme | numeric | oui | — |
| litiges | jsonb | oui | — |
| saisi_par | uuid | oui | — |
| explication | text | oui | — |
| explique_par | uuid | oui | — |
| explique_le | timestamp with time zone | oui | — |

FK : `campaign_id` → `confirmation_campaign(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `explique_par` → `app_user(id)` on delete no action ; `saisi_par` → `app_user(id)` on delete no action ; `sent_by` → `app_user(id)` on delete no action

Index : `confirmation_party_campaign_id_reference_key`, `idx_conf_party_campaign`

Politiques RLS : `confirmation_party_eng` (ALL, {public})

### `exception`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| taxonomy_code | text | non | — |
| kind | text | non | 'substantive'::text |
| sample_item_id | uuid | oui | — |
| match_id | uuid | oui | — |
| evidence_id | uuid | oui | — |
| reconciliation_item_id | uuid | oui | — |
| severity | text | non | 'normal'::text |
| status | text | non | 'open'::text |
| description | text | non | — |
| amount_impact | numeric | oui | — |
| resolution | text | oui | — |
| resolved_by | uuid | oui | — |
| resolved_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| client_explanation | text | oui | — |
| corroboration_evidence_id | uuid | oui | — |
| corroboration_gl_entry_id | uuid | oui | — |
| disposition | text | oui | — |
| alternative_procedures | text | oui | — |

FK : `corroboration_evidence_id` → `evidence(id)` on delete no action ; `corroboration_gl_entry_id` → `gl_entry(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `match_id` → `match(id)` on delete no action ; `reconciliation_item_id` → `reconciliation_item(id)` on delete no action ; `resolved_by` → `app_user(id)` on delete no action ; `sample_item_id` → `sample_item(id)` on delete no action

Index : `exception_eng_idx`, `exception_sample_item_id_idx`

Politiques RLS : `exception_eng` (ALL, {public})

### `followup`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| exception_id | uuid | oui | — |
| deviation_id | uuid | oui | — |
| request_id | uuid | non | — |
| drafted_by_ai_run | uuid | oui | — |
| approved_by | uuid | oui | — |
| status | text | non | 'draft'::text |
| created_at | timestamp with time zone | non | now() |

FK : `approved_by` → `app_user(id)` on delete no action ; `deviation_id` → `deviation(id)` on delete no action ; `exception_id` → `exception(id)` on delete no action ; `request_id` → `request(id)` on delete no action

Politiques RLS : `followup_eng` (ALL, {public})

### `match`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| sample_item_id | uuid | non | — |
| status | text | non | 'pending_evidence'::text |
| checks | jsonb | non | '[]'::jsonb |
| computed_at | timestamp with time zone | non | now() |
| engine_run_id | uuid | oui | — |

FK : `engine_run_id` → `engine_run(id)` on delete no action ; `sample_item_id` → `sample_item(id)` on delete restrict

Index : `match_item_idx`

Politiques RLS : `match_tenant` (ALL, {public})

### `misstatement`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| exception_id | uuid | oui | — |
| kind | text | non | — |
| amount | numeric | non | — |
| corrected | boolean | non | false |
| status | text | non | 'proposed'::text |
| notes | text | oui | — |
| created_at | timestamp with time zone | non | now() |
| sample_evaluation_id | uuid | oui | — |
| dismissed_reason | text | oui | — |
| dismissed_evidence_id | uuid | oui | — |
| dismissed_by | uuid | oui | — |
| dismissed_at | timestamp with time zone | oui | — |
| rolled_into_projection | boolean | non | false |

FK : `dismissed_by` → `app_user(id)` on delete no action ; `dismissed_evidence_id` → `evidence(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `exception_id` → `exception(id)` on delete no action ; `sample_evaluation_id` → `sample_evaluation(id)` on delete no action

Index : `misstatement_engagement_id_idx`, `misstatement_sample_evaluation_projected_idx`

Politiques RLS : `misstatement_eng` (ALL, {public})

### `reconciliation_item`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| reconciliation_id | uuid | non | — |
| account_no | text | non | — |
| tb_amount | numeric | non | — |
| gl_amount | numeric | non | — |
| delta | numeric | non | — |
| status | text | non | 'open'::text |
| note | text | oui | — |
| resolved_by | uuid | oui | — |
| resolved_at | timestamp with time zone | oui | — |
| client_explanation | text | oui | — |
| corroboration_evidence_id | uuid | oui | — |
| corroboration_gl_entry_id | uuid | oui | — |
| disposition | text | oui | — |
| alternative_procedures | text | oui | — |

FK : `corroboration_evidence_id` → `evidence(id)` on delete no action ; `corroboration_gl_entry_id` → `gl_entry(id)` on delete no action ; `reconciliation_id` → `reconciliation(id)` on delete restrict ; `resolved_by` → `app_user(id)` on delete no action

Index : `reconciliation_item_reconciliation_id_idx`

Politiques RLS : `reconciliation_item_eng` (ALL, {public})

### `sample`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| procedure_id | uuid | non | — |
| method | text | non | — |
| params | jsonb | non | '{}'::jsonb |
| seed | text | non | — |
| population_hash | text | non | — |
| population_size | integer | non | — |
| population_amount | numeric | oui | — |
| coverage_amount | numeric | oui | — |
| rationale | text | oui | — |
| status | text | non | 'proposed'::text |
| supersedes_sample_id | uuid | oui | — |
| validated_by | uuid | oui | — |
| validated_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| engine_run_id | uuid | oui | — |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `procedure_id` → `procedure_instance(id)` on delete restrict ; `supersedes_sample_id` → `sample(id)` on delete no action ; `validated_by` → `app_user(id)` on delete no action

Index : `sample_drawn_unique`, `sample_engagement_id_idx`

Politiques RLS : `sample_eng` (ALL, {public})

### `sample_evaluation`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| sample_id | uuid | non | — |
| version | integer | non | 1 |
| known_misstatement | numeric | non | 0 |
| projected_misstatement | numeric | non | 0 |
| projection_method | text | non | 'ratio'::text |
| tested_coverage_amount | numeric | non | 0 |
| tested_random_amount | numeric | non | 0 |
| untested_amount | numeric | non | 0 |
| te_amount | numeric | non | — |
| conclusion_basis | text | oui | — |
| status | text | non | 'draft'::text |
| concluded_by | uuid | oui | — |
| concluded_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| random_misstatement | numeric | non | 0 |
| random_misstatement_count | integer | non | 0 |

FK : `concluded_by` → `app_user(id)` on delete no action ; `sample_id` → `sample(id)` on delete restrict

Politiques RLS : `sample_evaluation_eng` (ALL, {public})

### `sample_item`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| sample_id | uuid | non | — |
| unit_kind | text | non | — |
| unit_id | uuid | non | — |
| selection_reason | text | non | — |
| amount | numeric | oui | — |
| carried_from_item_id | uuid | oui | — |
| status | text | non | 'pending'::text |
| repris_de | uuid | oui | — |
| sortie_decision | text | oui | — |
| sortie_motif | text | oui | — |
| sortie_par | uuid | oui | — |
| sortie_le | timestamp with time zone | oui | — |

FK : `carried_from_item_id` → `sample_item(id)` on delete no action ; `repris_de` → `sample_item(id)` on delete no action ; `sample_id` → `sample(id)` on delete restrict ; `sortie_par` → `app_user(id)` on delete no action

Index : `sample_item_repris_de`, `sample_item_sample_idx`

Politiques RLS : `sample_item_eng` (ALL, {public})

### `test_cell`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| grid_id | uuid | non | — |
| sample_item_id | uuid | non | — |
| column_code | text | non | — |
| expected | text | oui | — |
| found | text | oui | — |
| delta_signed | numeric | oui | — |
| delta_unit | text | oui | — |
| tolerance | text | non | — |
| state | text | non | — |
| evidence_id | uuid | oui | — |
| extraction_id | uuid | oui | — |
| page | integer | oui | — |
| rect | jsonb | oui | — |
| field_name | text | oui | — |
| engine_run_id | uuid | oui | — |
| computed_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `evidence_id` → `evidence(id)` on delete no action ; `extraction_id` → `extraction(id)` on delete no action ; `grid_id` → `test_grid(id)` on delete restrict ; `sample_item_id` → `sample_item(id)` on delete restrict

Index : `test_cell_eng_idx`, `test_cell_grid_id_sample_item_id_column_code_key`, `test_cell_item_idx`

Politiques RLS : `test_cell_eng` (ALL, {public})

### `test_column`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| procedure_code | text | non | 'REV-SUBST'::text |
| evidence_type_code | text | non | — |
| field_code | text | non | — |
| libelle | text | non | — |
| tolerance | text | non | — |
| origine | text | non | 'ajoutee_par'::text |
| ajoutee_par_user_id | uuid | oui | — |
| ajoutee_le | timestamp with time zone | non | now() |

FK : `ajoutee_par_user_id` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `test_column_eng_idx`, `test_column_engagement_id_procedure_code_field_code_key`

Politiques RLS : `test_column_eng` (ALL, {public})

### `test_grid`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| procedure_code | text | non | 'REV-SUBST'::text |
| pack_id | text | non | — |
| version | integer | non | 1 |
| columns | jsonb | non | — |
| columns_hash | text | non | — |
| frozen_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict

Index : `test_grid_eng_idx`, `test_grid_engagement_id_procedure_code_version_key`

Politiques RLS : `test_grid_eng` (ALL, {public})

### `test_line_conclusion`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| grid_id | uuid | non | — |
| sample_item_id | uuid | non | — |
| cells_hash | text | non | — |
| concluded_by | uuid | non | — |
| concluded_at | timestamp with time zone | non | now() |

FK : `concluded_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `grid_id` → `test_grid(id)` on delete restrict ; `sample_item_id` → `sample_item(id)` on delete restrict

Index : `test_line_conclusion_eng_idx`, `test_line_conclusion_sample_item_id_key`

Politiques RLS : `test_line_conclusion_eng` (ALL, {public})

## 6. ICFR / SOX set

### `attribute_def`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| control_id | uuid | non | — |
| code | text | non | — |
| description | text | non | — |
| required | boolean | non | true |
| expected_evidence | text | oui | — |

FK : `control_id` → `control(id)` on delete restrict

Index : `attribute_def_control_id_code_key`

Politiques RLS : `attribute_def_eng` (ALL, {public})

### `attribute_result`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| sample_item_id | uuid | non | — |
| attribute_code | text | non | — |
| result | text | non | — |
| basis | text | non | — |
| extraction_field_ref | jsonb | oui | — |
| note | text | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `sample_item_id` → `sample_item(id)` on delete restrict

Index : `attribute_result_sample_item_id_attribute_code_key`

Politiques RLS : `attribute_result_eng` (ALL, {public})

### `control`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| process_id | uuid | oui | — |
| code | text | non | — |
| name | text | non | — |
| description | text | non | — |
| frequency | text | non | — |
| nature | text | non | — |
| effect | text | non | — |
| is_key | boolean | non | true |
| itgc_area_id | uuid | oui | — |
| owner_name | text | oui | — |
| di_status | text | non | 'not_assessed'::text |
| di_conclusion | text | oui | — |
| created_at | timestamp with time zone | non | now() |
| di_walkthrough_evidence_id | uuid | oui | — |
| process_model_id | uuid | oui | — |

FK : `di_walkthrough_evidence_id` → `evidence(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `itgc_area_id` → `itgc_area(id)` on delete no action ; `process_id` → `process(id)` on delete no action ; `process_model_id` → `process_model(id)` on delete no action

Index : `control_engagement_id_code_key`

Politiques RLS : `control_eng` (ALL, {public})

### `control_design_factor`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| factor | text | non | — |
| conclusion | text | non | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `control_design_factor_control_id_factor_key`, `control_design_factor_engagement_id_idx`

Politiques RLS : `control_design_factor_eng` (ALL, {public})

### `control_fsli`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| control_id (PK) | uuid | non | — |
| fsli_code (PK) | text | non | — |
| assertions | ARRAY | non | '{}'::text[] |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action

Politiques RLS : `control_fsli_eng` (ALL, {public})

### `control_instance`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| control_id | uuid | non | — |
| label | text | non | — |
| occurred_on | date | oui | — |
| performer_name | text | oui | — |
| source | text | non | 'listing'::text |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict

Index : `control_instance_control_id_label_key`

Politiques RLS : `control_instance_eng` (ALL, {public})

### `control_iuc`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| utilisee | boolean | non | — |
| description | text | oui | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `control_iuc_control_id_key`, `control_iuc_engagement_id_idx`

Politiques RLS : `control_iuc_eng` (ALL, {public})

### `control_iuc_preuve`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| iuc_id | uuid | non | — |
| volet | text | non | — |
| conclusion | text | non | — |
| evidence_id | uuid | oui | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `iuc_id` → `control_iuc(id)` on delete restrict

Index : `control_iuc_preuve_engagement_id_idx`, `control_iuc_preuve_iuc_id_volet_key`

Politiques RLS : `control_iuc_preuve_eng` (ALL, {public})

### `control_oe_procedure`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| procedure | text | non | — |
| notes | text | non | — |
| evidence_id | uuid | oui | — |
| performed_at | timestamp with time zone | non | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action

Index : `control_oe_procedure_control_id_procedure_key`, `control_oe_procedure_control_idx`, `control_oe_procedure_engagement_id_idx`

Politiques RLS : `control_oe_procedure_eng` (ALL, {public})

### `control_population_reconciliation`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| control_id | uuid | non | — |
| row_count | integer | non | — |
| conclusion | text | non | — |
| rapprochee_by | uuid | non | — |
| rapprochee_at | timestamp with time zone | non | now() |
| engagement_id | uuid | non | — |

FK : `control_id` → `control(id)` on delete restrict ; `engagement_id` → `engagement(id)` on delete restrict ; `rapprochee_by` → `app_user(id)` on delete no action

Index : `control_population_reconciliation_control_idx`, `control_population_reconciliation_engagement_id_idx`

Politiques RLS : `control_population_reconciliation_eng` (ALL, {public})

### `control_risk`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| risk_id | uuid | non | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `risk_id` → `risk(id)` on delete restrict

Index : `control_risk_control_id_risk_id_key`, `control_risk_engagement_id_idx`

Politiques RLS : `control_risk_eng` (ALL, {public})

### `control_task`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| seq_no | integer | non | — |
| description | text | non | — |
| video_timestamp | text | oui | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `control_task_control_id_seq_no_key`, `control_task_engagement_id_idx`

Politiques RLS : `control_task_eng` (ALL, {public})

### `control_task_procedure`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| task_id | uuid | non | — |
| procedure | text | non | — |
| notes | text | non | — |
| evidence_id | uuid | oui | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `task_id` → `control_task(id)` on delete restrict

Index : `control_task_procedure_engagement_id_idx`, `control_task_procedure_task_id_procedure_key`

Politiques RLS : `control_task_procedure_eng` (ALL, {public})

### `control_test`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| control_id | uuid | non | — |
| procedure_id | uuid | oui | — |
| sample_id | uuid | oui | — |
| status | text | non | 'draft'::text |
| conclusion | text | oui | — |
| concluded_by | uuid | oui | — |
| concluded_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| extension_required | boolean | non | false |
| extension_reason | text | oui | — |
| extension_waived_by | uuid | oui | — |
| extension_waiver_reason | text | oui | — |

FK : `concluded_by` → `app_user(id)` on delete no action ; `control_id` → `control(id)` on delete restrict ; `extension_waived_by` → `app_user(id)` on delete no action ; `procedure_id` → `procedure_instance(id)` on delete no action ; `sample_id` → `sample(id)` on delete no action

Politiques RLS : `control_test_eng` (ALL, {public})

### `control_walkthrough_gap`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| seq | integer | non | — |
| kind | text | non | — |
| citation | text | non | ''::text |
| description | text | non | — |
| ai_run_id | uuid | oui | — |
| status | text | non | 'candidate'::text |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| decision_reason | text | oui | — |
| request_id | uuid | oui | — |
| control_task_id | uuid | oui | — |

FK : `ai_run_id` → `ai_run(id)` on delete no action ; `control_id` → `control(id)` on delete restrict ; `control_task_id` → `control_task(id)` on delete no action ; `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `request_id` → `request(id)` on delete no action

Index : `control_walkthrough_gap_control_id_seq_key`, `control_walkthrough_gap_engagement_id_idx`, `idx_control_walkthrough_gap_control`

Politiques RLS : `control_walkthrough_gap_eng` (ALL, {public})

### `control_walkthrough_transcript`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| contenu | text | non | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `control_id` → `control(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `control_walkthrough_transcript_control_id_key`, `control_walkthrough_transcript_engagement_id_idx`

Politiques RLS : `control_walkthrough_transcript_eng` (ALL, {public})

### `deficiency`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| severity_proposed | text | non | — |
| severity_final | text | oui | — |
| basis | jsonb | non | '{}'::jsonb |
| narrative | text | non | — |
| status | text | non | 'proposed'::text |
| aggregation_group | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| engine_run_id | uuid | oui | — |
| narrative_ai_run_id | uuid | oui | — |
| magnitude_basis | text | oui | — |

FK : `control_id` → `control(id)` on delete restrict ; `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `narrative_ai_run_id` → `ai_run(id)` on delete no action

Index : `deficiency_engagement_id_idx`

Politiques RLS : `deficiency_eng` (ALL, {public})

### `deviation`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| sample_item_id | uuid | oui | — |
| attribute_code | text | non | — |
| taxonomy_code | text | non | — |
| status | text | non | 'open'::text |
| description | text | non | — |
| resolution | text | oui | — |
| resolved_by | uuid | oui | — |
| resolved_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| client_explanation | text | oui | — |
| corroboration_evidence_id | uuid | oui | — |
| disposition | text | oui | — |

FK : `control_id` → `control(id)` on delete restrict ; `corroboration_evidence_id` → `evidence(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `resolved_by` → `app_user(id)` on delete no action ; `sample_item_id` → `sample_item(id)` on delete no action

Index : `deviation_engagement_id_idx`

Politiques RLS : `deviation_eng` (ALL, {public})

### `interview_participant`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| interview_id | uuid | non | — |
| seq | integer | non | — |
| nom | text | non | — |
| qualite | text | non | ''::text |
| consent_recording | boolean | non | false |
| consent_at | timestamp with time zone | oui | — |

FK : `interview_id` → `process_interview(id)` on delete restrict

Index : `interview_participant_interview_id_seq_key`

Politiques RLS : `interview_participant_eng` (ALL, {public})

### `interview_transcript`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| interview_id | uuid | non | — |
| contenu | text | non | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `interview_id` → `process_interview(id)` on delete restrict

Index : `interview_transcript_interview_id_key`

Politiques RLS : `interview_transcript_eng` (ALL, {public})

### `itgc_area`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| code | text | non | — |
| name | text | non | — |

Index : `itgc_area_code_key`

Politiques RLS : `itgc_area_applicatif` (ALL, {public})

### `process`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| name | text | non | — |
| description | text | oui | — |

FK : `engagement_id` → `engagement(id)` on delete restrict

Index : `process_engagement_id_idx`

Politiques RLS : `process_eng` (ALL, {public})

### `process_change_decision`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| change_code | text | non | — |
| significance | text | non | — |
| reason | text | non | — |
| decided_by | uuid | non | — |
| decided_at | timestamp with time zone | non | now() |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `process_change_decision_engagement_id_change_code_key`

Politiques RLS : `process_change_decision_eng` (ALL, {public})

### `process_ctrl`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| process_id | uuid | non | — |
| step_code | text | non | — |
| code | text | non | — |
| label | text | non | — |
| frequency | text | non | — |
| owner_name | text | non | — |

FK : `process_id` → `process_model(id)` on delete restrict

Index : `process_ctrl_process_id_code_key`

Politiques RLS : `process_ctrl_eng` (ALL, {public})

### `process_interview`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| cycle_ref | text | non | — |
| date_entretien | date | non | — |
| sujet | text | non | — |
| support | text | non | — |
| comprehension | text | non | ''::text |
| retention_until | date | oui | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `idx_process_interview_eng`

Politiques RLS : `process_interview_eng` (ALL, {public})

### `process_model`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| cycle_ref | text | non | — |
| exercice | text | non | — |
| name | text | non | — |
| evidence_id | uuid | non | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |
| code | text | non | — |
| fsli_code | text | oui | — |
| status | text | non | 'active'::text |
| supersedes_id | uuid | oui | — |
| client_flowchart_evidence_id | uuid | oui | — |
| origine | text | non | 'humain'::text |

FK : `client_flowchart_evidence_id` → `evidence(id)` on delete no action ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `supersedes_id` → `process_model(id)` on delete no action

Index : `idx_process_model_eng`, `process_model_actif`

Politiques RLS : `process_model_eng` (ALL, {public})

### `process_step`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| process_id | uuid | non | — |
| code | text | non | — |
| seq | integer | non | — |
| label | text | non | — |
| actor_name | text | non | — |
| system_name | text | non | — |
| inputs | text | non | ''::text |
| outputs | text | non | ''::text |
| proposition_id | uuid | oui | — |
| pictogramme | text | oui | — |

FK : `process_id` → `process_model(id)` on delete restrict ; `proposition_id` → `proposition(id)` on delete no action

Index : `process_step_process_id_code_key`

Politiques RLS : `process_step_eng` (ALL, {public})

### `rcm_row`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| control_id | uuid | non | — |
| risk_desc | text | non | — |
| assertions | ARRAY | non | '{}'::text[] |
| coso_component | text | oui | — |
| import_file_id | uuid | oui | — |

FK : `control_id` → `control(id)` on delete restrict ; `engagement_id` → `engagement(id)` on delete restrict ; `import_file_id` → `import_file(id)` on delete no action

Index : `rcm_row_engagement_id_idx`

Politiques RLS : `rcm_row_eng` (ALL, {public})

### `transcript_gap`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| interview_id | uuid | non | — |
| seq | integer | non | — |
| kind | text | non | — |
| citation | text | non | ''::text |
| description | text | non | — |
| ai_run_id | uuid | oui | — |
| status | text | non | 'candidate'::text |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| decision_reason | text | oui | — |
| request_id | uuid | oui | — |

FK : `ai_run_id` → `ai_run(id)` on delete no action ; `decided_by` → `app_user(id)` on delete no action ; `interview_id` → `process_interview(id)` on delete restrict ; `request_id` → `request(id)` on delete no action

Index : `idx_transcript_gap_itv`, `transcript_gap_interview_id_seq_key`

Politiques RLS : `transcript_gap_eng` (ALL, {public})

### `walkthrough`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| process_id | uuid | non | — |
| status | text | non | 'not_started'::text |
| performed_by | uuid | oui | — |
| performed_at | timestamp with time zone | oui | — |
| notes | text | oui | — |

FK : `performed_by` → `app_user(id)` on delete no action ; `process_id` → `process(id)` on delete restrict

Politiques RLS : `walkthrough_eng` (ALL, {public})

## 7. Documentation

### `export_record`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| workpaper_id | uuid | non | — |
| format | text | non | — |
| content_hash | text | non | — |
| supersedes_export_id | uuid | oui | — |
| exported_by | uuid | oui | — |
| exported_at | timestamp with time zone | non | now() |
| storage_path | text | oui | — |
| size_bytes | bigint | non | 0 |

FK : `exported_by` → `app_user(id)` on delete no action ; `supersedes_export_id` → `export_record(id)` on delete no action ; `workpaper_id` → `workpaper(id)` on delete restrict

Politiques RLS : `export_record_eng` (ALL, {public})

### `ipe`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| workpaper_id | uuid | non | — |
| utilisee | boolean | non | — |
| nature | text | oui | — |
| rapport_code | text | oui | — |
| evidence_id | uuid | oui | — |
| import_file_id | uuid | oui | — |
| exhaustivite | text | oui | — |
| exactitude | text | oui | — |
| date_document | date | oui | — |
| approprie | boolean | oui | — |
| redige_par_ia | boolean | non | false |
| valide_par | uuid | oui | — |
| valide_le | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| rapport_id | uuid | oui | — |

FK : `evidence_id` → `evidence(id)` on delete no action ; `import_file_id` → `import_file(id)` on delete no action ; `rapport_id` → `ipe_rapport(id)` on delete no action ; `valide_par` → `app_user(id)` on delete no action ; `workpaper_id` → `workpaper(id)` on delete restrict

Index : `ipe_workpaper_id_key`

Politiques RLS : `ipe_eng` (ALL, {public})

### `ipe_rapport`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| nom | text | non | — |
| code_rapport | text | oui | — |
| systeme_source | text | oui | — |
| parametres | text | oui | — |
| periode_debut | date | oui | — |
| periode_fin | date | non | — |
| genere_par | text | oui | — |
| genere_le | date | oui | — |
| empreinte | text | oui | — |
| nature | text | non | — |
| evidence_id | uuid | oui | — |
| import_file_id | uuid | oui | — |
| exhaustivite | text | non | — |
| exactitude | text | non | — |
| redige_par_ia | boolean | non | false |
| valide_par | uuid | oui | — |
| valide_le | timestamp with time zone | oui | — |
| created_by | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `import_file_id` → `import_file(id)` on delete no action ; `valide_par` → `app_user(id)` on delete no action

Index : `ipe_rapport_eng`, `ipe_rapport_engagement_id_nom_periode_fin_key`

Politiques RLS : `ipe_rapport_eng` (ALL, {public})

### `review_note`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| workpaper_id | uuid | oui | — |
| author_id | uuid | non | — |
| assignee_id | uuid | oui | — |
| status | text | non | 'open'::text |
| text | text | non | — |
| addressed_at | timestamp with time zone | oui | — |
| closed_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| anchor_kind | text | oui | — |
| anchor_ref | text | oui | — |
| anchor_field | text | oui | — |
| anchor_label | text | oui | — |
| assignee_kind | text | non | 'user'::text |
| note_type | text | non | 'a_corriger'::text |
| closed_by | uuid | oui | — |
| scope | text | non | 'audit'::text |
| section_id | uuid | oui | — |

FK : `assignee_id` → `app_user(id)` on delete no action ; `author_id` → `app_user(id)` on delete no action ; `closed_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `section_id` → `section_state(id)` on delete restrict ; `workpaper_id` → `workpaper(id)` on delete no action

Index : `review_note_eng_status`, `review_note_scope_idx`, `review_note_section_status`, `review_note_workpaper_id_idx`

Politiques RLS : `review_note_eng` (ALL, {public})

### `review_note_reply`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| note_id | uuid | non | — |
| engagement_id | uuid | non | — |
| author_kind | text | non | — |
| author_id | uuid | oui | — |
| text | text | non | — |
| payload | jsonb | non | '{}'::jsonb |
| created_at | timestamp with time zone | non | now() |
| proposition_id | uuid | oui | — |

FK : `author_id` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `note_id` → `review_note(id)` on delete restrict ; `proposition_id` → `proposition(id)` on delete no action

Index : `review_note_reply_engagement_id_idx`, `review_note_reply_note_idx`

Politiques RLS : `review_note_reply_eng` (ALL, {public})

### `section_state`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| kind | text | non | — |
| ref | text | non | — |
| label | text | non | — |
| owner_id | uuid | oui | — |
| holder_id | uuid | oui | — |
| updated_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `holder_id` → `app_user(id)` on delete no action ; `owner_id` → `app_user(id)` on delete no action

Index : `section_state_engagement_id_kind_ref_key`, `section_state_holder`, `section_state_owner`

Politiques RLS : `section_state_eng` (ALL, {public})

### `section_visit`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | bigint | non | nextval('section_visit_id_seq'::regclass) |
| section_id | uuid | non | — |
| user_id | uuid | non | — |
| visited_at | timestamp with time zone | non | now() |

FK : `section_id` → `section_state(id)` on delete cascade ; `user_id` → `app_user(id)` on delete no action

Index : `section_visit_user`

Politiques RLS : `section_visit_eng` (ALL, {public})

### `section_watch`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| section_id (PK) | uuid | non | — |
| user_id (PK) | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `section_id` → `section_state(id)` on delete cascade ; `user_id` → `app_user(id)` on delete no action

Politiques RLS : `section_watch_eng` (ALL, {public})

### `signoff`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| workpaper_id | uuid | non | — |
| user_id | uuid | non | — |
| sign_role | text | non | — |
| signed_at | timestamp with time zone | non | now() |
| sections_hash | text | oui | — |

FK : `user_id` → `app_user(id)` on delete no action ; `workpaper_id` → `workpaper(id)` on delete restrict

Index : `signoff_workpaper_id_idx`

Politiques RLS : `signoff_eng` (ALL, {public})

### `ui_repli`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| tenant_id | uuid | non | — |
| user_id (PK) | uuid | non | — |
| cle (PK) | text | non | — |
| ouvert | boolean | non | — |
| updated_at | timestamp with time zone | non | now() |

FK : `tenant_id` → `tenant(id)` on delete cascade ; `user_id` → `app_user(id)` on delete cascade

Index : `ui_repli_tenant`

Politiques RLS : `ui_repli_tenant` (ALL, {public})

### `workpaper`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| pack_id | text | non | — |
| code | text | non | — |
| procedure_id | uuid | oui | — |
| control_test_id | uuid | oui | — |
| title | text | non | — |
| language | text | non | 'en'::text |
| sections | jsonb | non | '[]'::jsonb |
| status | text | non | 'draft'::text |
| version | integer | non | 1 |
| based_on_hash | text | oui | — |
| engine_run_ref | text | oui | — |
| post_lock | boolean | non | false |
| created_at | timestamp with time zone | non | now() |
| engine_run_id | uuid | oui | — |
| reference | text | oui | — |
| row_version | integer | non | 1 |

FK : `control_test_id` → `control_test(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `procedure_id` → `procedure_instance(id)` on delete no action

Index : `workpaper_code_actif_unique`, `workpaper_engagement_id_code_version_key`

Politiques RLS : `workpaper_eng` (ALL, {public})

### `workpaper_edit`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| workpaper_id | uuid | non | — |
| user_id | uuid | non | — |
| section | text | non | — |
| before_value | text | oui | — |
| after_value | text | oui | — |
| justification | text | non | — |
| edited_at | timestamp with time zone | non | now() |

FK : `user_id` → `app_user(id)` on delete no action ; `workpaper_id` → `workpaper(id)` on delete restrict

Politiques RLS : `workpaper_edit_eng` (ALL, {public})

### `wp_attachment`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| workpaper_id | uuid | non | — |
| evidence_id | uuid | non | — |

FK : `evidence_id` → `evidence(id)` on delete no action ; `workpaper_id` → `workpaper(id)` on delete restrict

Politiques RLS : `wp_attachment_eng` (ALL, {public})

### `wp_extra_cell`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| column_id | uuid | non | — |
| engagement_id | uuid | non | — |
| sample_item_id | uuid | non | — |
| outcome | text | non | — |
| valeur | text | oui | — |
| evidence_id | uuid | oui | — |
| extraction_id | uuid | oui | — |
| verifie | boolean | non | false |
| clarification_request_item_id | uuid | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `clarification_request_item_id` → `request_item(id)` on delete no action ; `column_id` → `wp_extra_column(id)` on delete restrict ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action ; `extraction_id` → `extraction(id)` on delete no action ; `sample_item_id` → `sample_item(id)` on delete restrict

Index : `wp_extra_cell_col_idx`, `wp_extra_cell_column_id_sample_item_id_key`, `wp_extra_cell_engagement_id_idx`

Politiques RLS : `wp_extra_cell_eng` (ALL, {public})

### `wp_extra_column`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| workpaper_code | text | non | — |
| titre | text | non | — |
| justification | text | non | — |
| interpretation | jsonb | oui | — |
| statut | text | non | 'proposee'::text |
| cout_usd | numeric | non | 0 |
| ai_run_id | uuid | oui | — |
| created_by | uuid | non | — |
| confirmed_by | uuid | oui | — |
| confirmed_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `ai_run_id` → `ai_run(id)` on delete no action ; `confirmed_by` → `app_user(id)` on delete no action ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `wp_extra_column_eng_idx`

Politiques RLS : `wp_extra_column_eng` (ALL, {public})

## 7bis. Run identity & verification

### `engine_run`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| tenant_id | uuid | non | — |
| engagement_id | uuid | oui | — |
| engine | text | non | — |
| engine_version | text | non | — |
| pack_id | text | oui | — |
| config_hash | text | non | — |
| params | jsonb | non | '{}'::jsonb |
| started_at | timestamp with time zone | non | now() |
| finished_at | timestamp with time zone | oui | — |

FK : `engagement_id` → `engagement(id)` on delete restrict

Index : `engine_run_eng_idx`

Politiques RLS : `engine_run_tenant` (ALL, {public})

### `verification_check`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| procedure_id | uuid | non | — |
| sample_item_id | uuid | non | — |
| verifier_id | uuid | non | — |
| result | text | non | — |
| disagreement_note | text | oui | — |
| exception_id | uuid | oui | — |
| seconds_spent | integer | oui | — |
| performed_at | timestamp with time zone | non | now() |
| verification_run_id | uuid | oui | — |
| blind_values | jsonb | oui | — |
| escalation | text | oui | — |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `exception_id` → `exception(id)` on delete no action ; `procedure_id` → `procedure_instance(id)` on delete no action ; `sample_item_id` → `sample_item(id)` on delete no action ; `verification_run_id` → `verification_run(id)` on delete no action ; `verifier_id` → `app_user(id)` on delete no action

Index : `verification_check_engagement_id_idx`

Politiques RLS : `verification_check_eng` (ALL, {public})

### `verification_run`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| procedure_id | uuid | non | — |
| engine_run_id | uuid | oui | — |
| seed | text | non | — |
| rate | numeric | non | — |
| min_items | integer | non | — |
| machine_passed_population_hash | text | non | — |
| machine_passed_count | integer | non | — |
| drawn_count | integer | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `procedure_id` → `procedure_instance(id)` on delete no action

Index : `verification_run_engagement_id_idx`

Politiques RLS : `verification_run_eng` (ALL, {public})

## 8. Infrastructure

### `_migrations`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| name (PK) | text | non | — |
| applied_at | timestamp with time zone | non | now() |
| empreinte | text | oui | — |

### `ai_run`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| tenant_id | uuid | non | — |
| engagement_id | uuid | oui | — |
| purpose | text | non | — |
| adapter | text | non | — |
| model | text | non | — |
| prompt_id | text | non | — |
| prompt_version | text | non | — |
| input_hash | text | non | — |
| output_hash | text | non | — |
| tokens_in | integer | non | 0 |
| tokens_out | integer | non | 0 |
| cost_usd | numeric | non | 0 |
| latency_ms | integer | non | 0 |
| created_at | timestamp with time zone | non | now() |
| niveau_automatisation | text | non | — |

Index : `ai_run_eng_idx`

Politiques RLS : `ai_run_tenant` (ALL, {public})

### `app_state`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| key (PK) | text | non | — |
| value | jsonb | non | — |
| updated_at | timestamp with time zone | non | now() |

Politiques RLS : `app_state_applicatif` (ALL, {public})

### `blob_store`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| storage_path (PK) | text | non | — |
| sha256 | text | non | — |
| size | integer | non | — |
| bytes | bytea | non | — |
| created_at | timestamp with time zone | non | now() |

Politiques RLS : `blob_store_par_reference` (ALL, {public})

### `carry_forward`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| source_engagement_id | uuid | non | — |
| kind | text | non | — |
| source_ref | text | non | — |
| label | text | non | — |
| detail | text | non | ''::text |
| payload | jsonb | non | '{}'::jsonb |
| status | text | non | 'proposed'::text |
| decision_reason | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `source_engagement_id` → `engagement(id)` on delete restrict

Index : `carry_forward_by_engagement`, `carry_forward_engagement_id_kind_source_ref_key`

Politiques RLS : `carry_forward_eng` (ALL, {public})

### `completion_item`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| nature | text | non | — |
| status | text | non | 'open'::text |
| findings | text | non | ''::text |
| conclusion | text | non | ''::text |
| covered_through | date | oui | — |
| signed_on | date | oui | — |
| evidence_id | uuid | oui | — |
| done_by | uuid | oui | — |
| done_at | timestamp with time zone | oui | — |
| na_reason | text | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `done_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evidence_id` → `evidence(id)` on delete no action

Index : `completion_item_engagement_id_nature_key`

Politiques RLS : `completion_item_eng` (ALL, {public})

### `engagement_lock_verdict`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| table_name (PK) | text | non | — |
| verdict | text | non | — |
| reason | text | non | — |
| proposed_by | text | non | 'agent'::text |
| proposed_at | timestamp with time zone | non | now() |
| confirmed_by | uuid | oui | — |
| confirmed_at | timestamp with time zone | oui | — |

FK : `confirmed_by` → `app_user(id)` on delete no action

Politiques RLS : `engagement_lock_verdict_applicatif` (ALL, {public})

### `event_log`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | bigint | non | nextval('event_log_id_seq'::regclass) |
| tenant_id | uuid | non | — |
| engagement_id | uuid | oui | — |
| actor_kind | text | non | — |
| actor_id | uuid | oui | — |
| verb | text | non | — |
| object_type | text | non | — |
| object_id | text | oui | — |
| payload | jsonb | non | '{}'::jsonb |
| prev_hash | text | non | ''::text |
| hash | text | non | — |
| created_at | timestamp with time zone | non | now() |

Index : `event_log_eng_idx`, `event_log_obj_idx`

Politiques RLS : `event_log_tenant` (ALL, {public})

### `file_archive`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| sealed_at | timestamp with time zone | non | now() |
| sealed_by | uuid | non | — |
| storage_path | text | non | — |
| sha256 | text | non | — |
| size_bytes | bigint | non | — |
| manifest | jsonb | non | — |
| retention_until | date | non | — |
| legal_basis | jsonb | non | — |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `sealed_by` → `app_user(id)` on delete no action

Index : `file_archive_eng_idx`

Politiques RLS : `file_archive_eng` (ALL, {public})

### `firm_methodology`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| tenant_id | uuid | non | — |
| label | text | non | — |
| content | jsonb | non | — |
| content_hash | text | non | — |
| versions | jsonb | non | '{}'::jsonb |
| published_by | uuid | non | — |
| published_at | timestamp with time zone | non | now() |

FK : `published_by` → `app_user(id)` on delete restrict ; `tenant_id` → `tenant(id)` on delete restrict

Index : `firm_methodology_by_tenant`, `firm_methodology_id_tenant_id_key`

Politiques RLS : `firm_methodology_tenant` (ALL, {public})

### `fs_line`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| statement | text | non | — |
| ref | text | non | — |
| label | text | non | — |
| presented | numeric | non | — |
| sort_order | integer | non | 0 |
| created_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict

Index : `fs_line_engagement_id_statement_ref_key`

Politiques RLS : `fs_line_eng` (ALL, {public})

### `fs_tie`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| fs_line_id | uuid | non | — |
| nature | text | non | — |
| accounts | ARRAY | non | '{}'::text[] |
| computed | numeric | oui | — |
| difference | numeric | oui | — |
| status | text | non | 'open'::text |
| explanation | text | oui | — |
| evidence_id | uuid | oui | — |
| tied_by | uuid | oui | — |
| tied_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `evidence_id` → `evidence(id)` on delete no action ; `fs_line_id` → `fs_line(id)` on delete restrict ; `tied_by` → `app_user(id)` on delete no action

Index : `fs_tie_fs_line_id_key`

Politiques RLS : `fs_tie_eng` (ALL, {public})

### `fsli_analytique`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | non | — |
| version | integer | non | — |
| text | text | non | — |
| origine | text | non | — |
| engine_run_id | uuid | oui | — |
| soldes_hash | text | non | — |
| author_id | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `author_id` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action

Index : `fsli_analytique_eng_idx`, `fsli_analytique_engagement_id_fsli_code_version_key`

Politiques RLS : `fsli_analytique_eng` (ALL, {public})

### `fsli_assertion_risk`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | non | — |
| assertion | text | non | — |
| computed_level | text | non | — |
| factor_count | integer | non | 0 |
| retained_level | text | oui | — |
| override_reason | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| methodology_version | text | non | — |
| computed_at | timestamp with time zone | non | now() |
| justification | text | oui | — |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `fsli_assertion_risk_by_fsli`, `fsli_assertion_risk_engagement_id_fsli_code_assertion_key`

Politiques RLS : `fsli_assertion_risk_eng` (ALL, {public})

### `fsli_assertion_risk_decision`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| fsli_assertion_risk_id | uuid | non | — |
| retained_level | text | oui | — |
| justification | text | oui | — |
| decided_by | uuid | non | — |
| decided_at | timestamp with time zone | non | now() |
| supersedes_id | uuid | oui | — |

FK : `decided_by` → `app_user(id)` on delete no action ; `fsli_assertion_risk_id` → `fsli_assertion_risk(id)` on delete restrict ; `supersedes_id` → `fsli_assertion_risk_decision(id)` on delete no action

Index : `fsli_assertion_risk_decision_by_risk`

Politiques RLS : `fsli_assertion_risk_decision_eng` (ALL, {public})

### `fsli_materiality_bascule`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | non | — |
| import_file_id | uuid | non | — |
| scoping_avant | text | non | — |
| solde | numeric | non | — |
| seuil_performance | numeric | non | — |
| detectee_le | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `import_file_id` → `import_file(id)` on delete no action

Index : `fsli_materiality_bascule_engagement_id_fsli_code_key`, `fsli_materiality_bascule_engagement_idx`

Politiques RLS : `fsli_materiality_bascule_eng` (ALL, {public})

### `gl_entry_supersession`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| old_gl_entry_id | uuid | non | — |
| new_gl_entry_id | uuid | oui | — |
| reason | text | non | 'reimport'::text |
| created_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `new_gl_entry_id` → `gl_entry(id)` on delete no action ; `old_gl_entry_id` → `gl_entry(id)` on delete no action

Index : `gl_entry_supersession_engagement_id_idx`

Politiques RLS : `gl_entry_supersession_eng` (ALL, {public})

### `notification`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| recipient_kind | text | non | — |
| recipient_id | uuid | non | — |
| kind | text | non | — |
| payload | jsonb | non | '{}'::jsonb |
| read_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

### `proposition`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| object_type | text | non | — |
| object_id | uuid | non | — |
| field | text | oui | — |
| valeur_proposee | jsonb | non | '{}'::jsonb |
| valeur_retenue | jsonb | oui | — |
| status | text | non | 'proposee'::text |
| ai_run_id | uuid | oui | — |
| review_note_id | uuid | oui | — |
| decision_reason | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |
| section_id | uuid | oui | — |
| source_kind | text | non | — |
| engine_run_id | uuid | oui | — |
| niveau_automatisation | text | non | 'L2'::text |
| note_id | uuid | oui | — |
| tenant_id | uuid | non | — |

FK : `ai_run_id` → `ai_run(id)` on delete no action ; `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `engine_run_id` → `engine_run(id)` on delete no action ; `note_id` → `review_note(id)` on delete no action ; `review_note_id` → `review_note(id)` on delete no action ; `section_id` → `section_state(id)` on delete restrict ; `tenant_id` → `tenant(id)` on delete no action

Index : `idx_proposition_engagement`, `idx_proposition_objet`, `proposition_engine_run`, `proposition_section`, `uq_proposition_en_attente`

Politiques RLS : `proposition_eng` (ALL, {public})

### `risk_factor_declared`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| source | text | non | — |
| source_ref | text | oui | — |
| nature | text | non | — |
| description | text | non | — |
| targets | jsonb | non | '[]'::jsonb |
| status | text | non | 'proposed'::text |
| decision_reason | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `risk_factor_declared_by_engagement`, `risk_factor_declared_questionnaire_unique`

Politiques RLS : `risk_factor_declared_eng` (ALL, {public})

### `risk_factor_observed`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | non | — |
| assertion | text | non | — |
| factor_code | text | non | — |
| label | text | non | — |
| evidence | text | non | — |
| predicate | text | non | — |
| computed_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict

Index : `risk_factor_observed_engagement_id_fsli_code_assertion_fact_key`

Politiques RLS : `risk_factor_observed_eng` (ALL, {public})

### `risk_question_answer`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| fsli_code | text | oui | — |
| question_code | text | non | — |
| answer | text | non | — |
| detail | text | non | ''::text |
| answered_by | uuid | non | — |
| answered_at | timestamp with time zone | non | now() |
| methodology_version | text | non | — |

FK : `answered_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `risk_question_answer_entity`, `risk_question_answer_section`

Politiques RLS : `risk_question_answer_eng` (ALL, {public})

### `rls_definer_justifiee`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| nom (PK) | text | non | — |
| raison | text | non | — |
| inscrite_le | timestamp with time zone | non | now() |

### `server_error`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| digest | text | non | — |
| route | text | oui | — |
| path | text | oui | — |
| method | text | oui | — |
| engagement_id | uuid | oui | — |
| tenant_id | uuid | oui | — |
| release_sha | text | oui | — |
| message | text | non | — |
| stack | text | oui | — |
| occurred_at | timestamp with time zone | non | now() |

Index : `server_error_digest_idx`, `server_error_engagement_id_idx`, `server_error_recent_idx`

Politiques RLS : `server_error_applicatif` (ALL, {public})

## 9. Immutability, versioning, lock, retention

Ces invariants sont des RÈGLES, pas une forme de table — non introspectables depuis la DDL seule (rien ne stocke littéralement « re-import supersedes »). Rédigés à la main, tenus à jour par la même discipline que §1–§4, reproduits ici verbatim par ce générateur pour que le fichier entier reste un seul artefact engendré :

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

## 10. Autres tables (non classées par ce script)

Trouvées en base sans groupe assigné dans `scripts/docs/data-model.ts` — jamais tues (règle 13). Ajouter la table à un groupe de `GROUPES` (ou à `TABLES_SECTION_1_4` si elle est déjà décrite en prose plus haut) fait disparaître cette section.

### `engagement_acceptance`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| kind | text | non | — |
| answers | jsonb | non | '{}'::jsonb |
| status | text | non | 'open'::text |
| decision_reason | text | oui | — |
| decided_by | uuid | oui | — |
| decided_at | timestamp with time zone | oui | — |
| methodology_version | text | non | ''::text |
| created_at | timestamp with time zone | non | now() |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `engagement_acceptance_une_par_mission`

Politiques RLS : `engagement_acceptance_eng` (ALL, {public})

### `engagement_contact`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| client_contact_id | uuid | non | — |
| role | text | non | — |
| domaine | text | oui | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `client_contact_id` → `client_contact(id)` on delete restrict ; `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `engagement_contact_cle`, `engagement_contact_engagement_id_client_contact_id_key`

Politiques RLS : `engagement_contact_eng` (ALL, {public})

### `engagement_milestone`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| code | text | non | — |
| label | text | non | — |
| due_date | date | oui | — |
| done_at | timestamp with time zone | oui | — |
| done_by | uuid | oui | — |
| derived | boolean | non | false |
| basis | text | oui | — |
| sort_order | integer | non | 0 |
| created_at | timestamp with time zone | non | now() |

FK : `done_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict

Index : `engagement_milestone_engagement_id_code_key`

Politiques RLS : `engagement_milestone_eng` (ALL, {public})

### `estimation`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| titre | text | non | — |
| piece_ref | text | non | — |
| libelles | jsonb | non | — |
| base_total | numeric | non | — |
| declare_total | numeric | non | — |
| recalcul_total | numeric | non | — |
| source_evidence_id | uuid | non | — |
| statut | text | non | 'importee'::text |
| seed | text | oui | — |
| request_id | uuid | oui | — |
| created_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `request_id` → `request(id)` on delete no action ; `source_evidence_id` → `evidence(id)` on delete no action

Index : `estimation_engagement_id_piece_ref_key`, `idx_estimation_eng`

Politiques RLS : `estimation_eng` (ALL, {public})

### `estimation_ligne`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| estimation_id | uuid | non | — |
| seq | integer | non | — |
| cle | text | non | — |
| base | numeric | non | — |
| taux | numeric | non | — |
| declare | numeric | non | — |
| recalcul | numeric | non | — |
| conforme | boolean | non | — |
| retenu | boolean | non | false |
| motif | text | oui | — |
| request_item_id | uuid | oui | — |

FK : `estimation_id` → `estimation(id)` on delete restrict ; `request_item_id` → `request_item(id)` on delete no action

Index : `estimation_ligne_estimation_id_cle_key`, `idx_estimation_ligne`

Politiques RLS : `estimation_ligne_eng` (ALL, {public})

### `estimation_parametre`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| estimation_id | uuid | non | — |
| nom | text | non | — |
| valeur | text | non | — |
| request_item_id | uuid | oui | — |

FK : `estimation_id` → `estimation(id)` on delete restrict ; `request_item_id` → `request_item(id)` on delete no action

Index : `estimation_parametre_estimation_id_nom_key`

Politiques RLS : `estimation_parametre_eng` (ALL, {public})

### `evaluation_response`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| evaluation_id | uuid | non | — |
| kind | text | non | — |
| rationale | text | non | — |
| decided_by | uuid | non | — |
| decided_at | timestamp with time zone | non | now() |

FK : `decided_by` → `app_user(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `evaluation_id` → `sample_evaluation(id)` on delete restrict

Index : `evaluation_response_engagement_id_idx`, `evaluation_response_eval_idx`

Politiques RLS : `evaluation_response_eng` (ALL, {public})

### `independence_declaration`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| tenant_id | uuid | non | — |
| engagement_id | uuid | non | — |
| user_id | uuid | non | — |
| version | integer | non | — |
| reason | text | non | ''::text |
| answers | jsonb | non | '{}'::jsonb |
| opened_at | timestamp with time zone | non | now() |
| signed_at | timestamp with time zone | oui | — |
| signed_by | uuid | oui | — |
| superseded_by | uuid | oui | — |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `signed_by` → `app_user(id)` on delete no action ; `superseded_by` → `independence_declaration(id)` on delete no action ; `tenant_id` → `tenant(id)` on delete restrict ; `user_id` → `app_user(id)` on delete restrict

Index : `independence_declaration_engagement_id_user_id_version_key`, `independence_declaration_lookup`

Politiques RLS : `independence_declaration_eng` (ALL, {public})

### `meeting_invitation`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| engagement_id | uuid | non | — |
| objet | text | non | — |
| debut | timestamp with time zone | non | — |
| fin | timestamp with time zone | non | — |
| destinataire_contact_id | uuid | non | — |
| copies | jsonb | non | — |
| corps | text | non | — |
| ics | text | non | — |
| statut | text | non | 'choisie'::text |
| created_by | uuid | non | — |
| sent_by | uuid | oui | — |
| sent_at | timestamp with time zone | oui | — |
| created_at | timestamp with time zone | non | now() |

FK : `created_by` → `app_user(id)` on delete no action ; `destinataire_contact_id` → `client_contact(id)` on delete no action ; `engagement_id` → `engagement(id)` on delete restrict ; `sent_by` → `app_user(id)` on delete no action

Index : `meeting_invitation_eng_idx`

Politiques RLS : `meeting_invitation_eng` (ALL, {public})

### `non_audit_service`

| Colonne | Type | Nullable | Défaut |
|---|---|---|---|
| id (PK) | uuid | non | gen_random_uuid() |
| tenant_id | uuid | non | — |
| engagement_id | uuid | non | — |
| nature | text | non | — |
| label | text | non | — |
| amount_cents | bigint | non | — |
| provided_on | date | non | — |
| provider | text | non | — |
| recorded_by | uuid | non | — |
| created_at | timestamp with time zone | non | now() |

FK : `engagement_id` → `engagement(id)` on delete restrict ; `recorded_by` → `app_user(id)` on delete no action ; `tenant_id` → `tenant(id)` on delete restrict

Index : `non_audit_service_by_engagement`

Politiques RLS : `non_audit_service_eng` (ALL, {public})
