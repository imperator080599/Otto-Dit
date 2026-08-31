-- 0029 — COUVERTURE RLS EXHAUSTIVE (ADR-109, P0a ; correction de CLASSE).
--
-- 0004 a posé la sécurité par ligne sur les tables d'alors — et RIEN n'a
-- suivi : 46 tables (les enfants de 0002, puis tout 0017→0028) n'avaient ni
-- RLS ni politique. Localement c'est invisible (PGlite se connecte en
-- propriétaire, qui contourne RLS sans FORCE) ; sur une base HÉBERGÉE avec
-- une URL publique, c'était la moitié du schéma hors du filet. La classe se
-- corrige deux fois : ici (chaque table couverte, par sa vraie jointure), et
-- par un test qui échoue dès qu'une table future arrive sans politique
-- (rls-couverture.test.ts) — l'oubli redevient impossible.
--
-- Trois familles :
--  1. colonne tenant_id      → tenant_id = otto_tenant()
--  2. colonne engagement_id  → engagement_id in (select otto_engagements())
--  3. enfants                → EXISTS vers le parent porteur du périmètre
-- Les tables d'infrastructure sans périmètre métier (_migrations, app_state,
-- blob_store, itgc_area, notification) prennent RLS SANS politique : seul le
-- propriétaire (l'application) y accède ; un rôle tiers ne lit rien.

do $$
declare
  t text;
begin
  -- 1. tenant_id direct
  execute 'alter table engine_run enable row level security';
  execute 'create policy engine_run_tenant on engine_run using (tenant_id = otto_tenant())';

  -- 2. engagement_id direct
  foreach t in array array[
    'aux_balance_file','coa_map_rule','estimation','evaluation_response','file_archive',
    'process_change_decision','process_interview','process_model','rcm_row','verification_run'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;

  -- 3. enfants — un saut vers le parent au périmètre
  execute 'alter table account enable row level security';
  execute 'create policy account_eng on account using (exists (
    select 1 from tb_snapshot p where p.id = account.tb_snapshot_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table attribute_def enable row level security';
  execute 'create policy attribute_def_eng on attribute_def using (exists (
    select 1 from control p where p.id = attribute_def.control_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table aux_balance_row enable row level security';
  execute 'create policy aux_balance_row_eng on aux_balance_row using (exists (
    select 1 from aux_balance_file p where p.id = aux_balance_row.file_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table client_contact enable row level security';
  execute 'create policy client_contact_tenant on client_contact using (exists (
    select 1 from entity p where p.id = client_contact.entity_id
      and p.tenant_id = otto_tenant()))';
  execute 'alter table component enable row level security';
  execute 'create policy component_tenant on component using (exists (
    select 1 from corp_group p where p.id = component.corp_group_id
      and p.tenant_id = otto_tenant()))';
  execute 'alter table control_instance enable row level security';
  execute 'create policy control_instance_eng on control_instance using (exists (
    select 1 from control p where p.id = control_instance.control_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table control_test enable row level security';
  execute 'create policy control_test_eng on control_test using (exists (
    select 1 from control p where p.id = control_test.control_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table estimation_ligne enable row level security';
  execute 'create policy estimation_ligne_eng on estimation_ligne using (exists (
    select 1 from estimation p where p.id = estimation_ligne.estimation_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table estimation_parametre enable row level security';
  execute 'create policy estimation_parametre_eng on estimation_parametre using (exists (
    select 1 from estimation p where p.id = estimation_parametre.estimation_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table export_record enable row level security';
  execute 'create policy export_record_eng on export_record using (exists (
    select 1 from workpaper p where p.id = export_record.workpaper_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table extraction enable row level security';
  execute 'create policy extraction_eng on extraction using (exists (
    select 1 from evidence p where p.id = extraction.evidence_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table followup enable row level security';
  execute 'create policy followup_eng on followup using (exists (
    select 1 from request p where p.id = followup.request_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table interview_participant enable row level security';
  execute 'create policy interview_participant_eng on interview_participant using (exists (
    select 1 from process_interview p where p.id = interview_participant.interview_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table interview_transcript enable row level security';
  execute 'create policy interview_transcript_eng on interview_transcript using (exists (
    select 1 from process_interview p where p.id = interview_transcript.interview_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table match enable row level security';
  execute 'create policy match_tenant on match using (exists (
    select 1 from engine_run p where p.id = match.engine_run_id
      and p.tenant_id = otto_tenant()))';
  execute 'alter table period enable row level security';
  execute 'create policy period_tenant on period using (exists (
    select 1 from entity p where p.id = period.entity_id
      and p.tenant_id = otto_tenant()))';
  execute 'alter table process_ctrl enable row level security';
  execute 'create policy process_ctrl_eng on process_ctrl using (exists (
    select 1 from process_model p where p.id = process_ctrl.process_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table process_step enable row level security';
  execute 'create policy process_step_eng on process_step using (exists (
    select 1 from process_model p where p.id = process_step.process_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table reconciliation_item enable row level security';
  execute 'create policy reconciliation_item_eng on reconciliation_item using (exists (
    select 1 from reconciliation p where p.id = reconciliation_item.reconciliation_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table reminder enable row level security';
  execute 'create policy reminder_eng on reminder using (exists (
    select 1 from request p where p.id = reminder.request_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table request_item enable row level security';
  execute 'create policy request_item_eng on request_item using (exists (
    select 1 from request p where p.id = request_item.request_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table sample_evaluation enable row level security';
  execute 'create policy sample_evaluation_eng on sample_evaluation using (exists (
    select 1 from sample p where p.id = sample_evaluation.sample_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table sample_item enable row level security';
  execute 'create policy sample_item_eng on sample_item using (exists (
    select 1 from sample p where p.id = sample_item.sample_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table signoff enable row level security';
  execute 'create policy signoff_eng on signoff using (exists (
    select 1 from workpaper p where p.id = signoff.workpaper_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table transcript_gap enable row level security';
  execute 'create policy transcript_gap_eng on transcript_gap using (exists (
    select 1 from process_interview p where p.id = transcript_gap.interview_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table walkthrough enable row level security';
  execute 'create policy walkthrough_eng on walkthrough using (exists (
    select 1 from process p where p.id = walkthrough.process_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table workpaper_edit enable row level security';
  execute 'create policy workpaper_edit_eng on workpaper_edit using (exists (
    select 1 from workpaper p where p.id = workpaper_edit.workpaper_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table wp_attachment enable row level security';
  execute 'create policy wp_attachment_eng on wp_attachment using (exists (
    select 1 from workpaper p where p.id = wp_attachment.workpaper_id
      and p.engagement_id in (select otto_engagements())))';

  -- 3 bis. deux sauts
  execute 'alter table attribute_result enable row level security';
  execute 'create policy attribute_result_eng on attribute_result using (exists (
    select 1 from sample_item i join sample s on s.id = i.sample_id
    where i.id = attribute_result.sample_item_id
      and s.engagement_id in (select otto_engagements())))';
  execute 'alter table referral_instruction enable row level security';
  execute 'create policy referral_instruction_tenant on referral_instruction using (exists (
    select 1 from component c join corp_group g on g.id = c.corp_group_id
    where c.id = referral_instruction.component_id
      and g.tenant_id = otto_tenant()))';

  -- 4. infrastructure sans périmètre métier : RLS sans politique (propriétaire seul)
  foreach t in array array['_migrations','app_state','blob_store','itgc_area','notification'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
