-- P1-08 — AUD-23 (intégrité référentielle) et AUD-15, partie modèle (unicité « ligne courante »).
-- Trois FK manquantes vers ai_run, index sur les engagement_id sans index et sur les FK filles
-- chaudes nommées par le plan (§7.8), quatre index partiels uniques précédés d'un dédoublonnage
-- qui REFUSE la migration si des doublons existent (règle 26 : jamais de suppression silencieuse,
-- le message nomme les lignes), et workpaper.row_version pour le verrou optimiste (AUD-15, à venir).
--
-- Mesuré sur l'arbre courant (pas cité de mémoire, règle 31) : 30 tables portent engagement_id
-- sans index dont il est la colonne de tête — pas 32 comme l'annonçait AUD-23 (audit du
-- 2026-09-20, avant P1-06/P1-07 qui ont ajouté des tables déjà indexées à leur création). Le
-- chiffre exact vient d'une requête sur pg_index/pg_attribute rejouée avant d'écrire cette
-- migration, pas de l'audit. Corrigé après revue hostile (voix 1) : `event_log(engagement_id, id)`
-- existe déjà (`event_log_eng_idx`, 0003) et n'est pas répété ici ; `procedure_instance` n'avait
-- PAS d'index sur `engagement_id` avant cette migration — il fait partie des 30 créés en §2,
-- pas d'une exclusion. Le commentaire d'origine l'affirmait à tort, sans l'avoir vérifié.

-- 1. FK manquantes vers ai_run (AUD-23).
alter table extraction add constraint extraction_ai_run_fk
  foreign key (ai_run_id) references ai_run(id);
alter table wp_extra_column add constraint wp_extra_column_ai_run_fk
  foreign key (ai_run_id) references ai_run(id);
alter table materiality add constraint materiality_ai_run_fk
  foreign key (proposed_by_ai_run) references ai_run(id);

-- 2. Index sur les 30 tables dont engagement_id n'est en tête d'aucun index (mesuré ci-dessus).
create index if not exists coa_map_rule_engagement_id_idx on coa_map_rule(engagement_id);
create index if not exists control_design_factor_engagement_id_idx on control_design_factor(engagement_id);
create index if not exists control_iuc_engagement_id_idx on control_iuc(engagement_id);
create index if not exists control_iuc_preuve_engagement_id_idx on control_iuc_preuve(engagement_id);
create index if not exists control_oe_procedure_engagement_id_idx on control_oe_procedure(engagement_id);
create index if not exists control_population_reconciliation_engagement_id_idx on control_population_reconciliation(engagement_id);
create index if not exists control_risk_engagement_id_idx on control_risk(engagement_id);
create index if not exists control_task_engagement_id_idx on control_task(engagement_id);
create index if not exists control_task_procedure_engagement_id_idx on control_task_procedure(engagement_id);
create index if not exists control_walkthrough_gap_engagement_id_idx on control_walkthrough_gap(engagement_id);
create index if not exists control_walkthrough_transcript_engagement_id_idx on control_walkthrough_transcript(engagement_id);
create index if not exists deficiency_engagement_id_idx on deficiency(engagement_id);
create index if not exists deviation_engagement_id_idx on deviation(engagement_id);
create index if not exists evaluation_response_engagement_id_idx on evaluation_response(engagement_id);
create index if not exists gl_entry_supersession_engagement_id_idx on gl_entry_supersession(engagement_id);
create index if not exists import_file_engagement_id_idx on import_file(engagement_id);
create index if not exists inbound_email_engagement_id_idx on inbound_email(engagement_id);
create index if not exists materiality_engagement_id_idx on materiality(engagement_id);
create index if not exists misstatement_engagement_id_idx on misstatement(engagement_id);
create index if not exists procedure_instance_engagement_id_idx on procedure_instance(engagement_id);
create index if not exists process_engagement_id_idx on process(engagement_id);
create index if not exists rcm_row_engagement_id_idx on rcm_row(engagement_id);
create index if not exists reconciliation_engagement_id_idx on reconciliation(engagement_id);
create index if not exists review_note_reply_engagement_id_idx on review_note_reply(engagement_id);
create index if not exists sample_engagement_id_idx on sample(engagement_id);
create index if not exists server_error_engagement_id_idx on server_error(engagement_id);
create index if not exists tb_snapshot_engagement_id_idx on tb_snapshot(engagement_id);
create index if not exists verification_check_engagement_id_idx on verification_check(engagement_id);
create index if not exists verification_run_engagement_id_idx on verification_run(engagement_id);
create index if not exists wp_extra_cell_engagement_id_idx on wp_extra_cell(engagement_id);

-- 3. Index sur les FK filles chaudes nommées par le plan (§7.8) — celles qui n'en ont pas déjà.
create index if not exists request_item_request_id_idx on request_item(request_id);
create index if not exists signoff_workpaper_id_idx on signoff(workpaper_id);
create index if not exists review_note_workpaper_id_idx on review_note(workpaper_id);
create index if not exists exception_sample_item_id_idx on exception(sample_item_id);
create index if not exists reconciliation_item_reconciliation_id_idx on reconciliation_item(reconciliation_id);

-- 4. Index partiels uniques (AUD-15, partie modèle) — chacun précédé d'un dédoublonnage qui
-- REFUSE la migration si des doublons existent (règle 26 : jamais de suppression silencieuse).
do $$
declare doublons text;
begin
  select string_agg(format('%s (%s ligne(s))', engagement_id, n), ', ')
    into doublons
    from (select engagement_id, count(*) as n from materiality where status = 'validated'
          group by engagement_id having count(*) > 1) d;
  if doublons is not null then
    raise exception 'P1-08 : plus d''une materiality validated pour le(s) dossier(s) — %', doublons;
  end if;
end $$;
create unique index if not exists materiality_validated_unique
  on materiality(engagement_id) where status = 'validated';

do $$
declare doublons text;
begin
  select string_agg(format('%s/%s (%s ligne(s))', engagement_id, period_kind, n), ', ')
    into doublons
    from (select engagement_id, period_kind, count(*) as n from tb_snapshot where status = 'active'
          group by engagement_id, period_kind having count(*) > 1) d;
  if doublons is not null then
    raise exception 'P1-08 : plus d''un tb_snapshot active pour le(s) couple(s) engagement_id/period_kind — %', doublons;
  end if;
end $$;
create unique index if not exists tb_snapshot_active_unique
  on tb_snapshot(engagement_id, period_kind) where status = 'active';

do $$
declare doublons text;
begin
  select string_agg(format('%s (%s ligne(s))', procedure_id, n), ', ')
    into doublons
    from (select procedure_id, count(*) as n from sample where status = 'drawn'
          group by procedure_id having count(*) > 1) d;
  if doublons is not null then
    raise exception 'P1-08 : plus d''un sample drawn pour la/les procédure(s) — %', doublons;
  end if;
end $$;
create unique index if not exists sample_drawn_unique
  on sample(procedure_id) where status = 'drawn';

do $$
declare doublons text;
begin
  select string_agg(format('%s/%s (%s ligne(s))', engagement_id, code, n), ', ')
    into doublons
    from (select engagement_id, code, count(*) as n from workpaper where status <> 'outdated'
          group by engagement_id, code having count(*) > 1) d;
  if doublons is not null then
    raise exception 'P1-08 : plus d''un workpaper non périmé pour le(s) couple(s) engagement_id/code — %', doublons;
  end if;
end $$;
create unique index if not exists workpaper_code_actif_unique
  on workpaper(engagement_id, code) where status <> 'outdated';

-- 5. Verrou optimiste (AUD-15, partie modèle — le `where row_version = $n` applicatif reste
-- une tranche à venir, cette migration ne pose que la colonne).
alter table workpaper add column if not exists row_version int not null default 1;
