-- 0177 — P1-05 (AUD-08, partie modèle — §7.5 du plan maître, renumérotée : la bande 0170+ est
-- déjà consommée par P1-01..04 et leurs correctifs ; contenu et ordre du plan conservés, règle 26).
--
-- CE QUI MANQUAIT (0042, en-tête) : 21 tables portaient un verdict PROPOSÉ (« garde_proposee »)
-- depuis le 2026-09-03, jamais confirmé — rien n'était réellement attaché. Cette migration les
-- CONFIRME (verdict → 'garde', déclencheur posé) et étend la même discipline à une catégorie que
-- 0042 n'avait jamais vue : les tables FILLES qui ne portent pas `engagement_id` en direct, mais
-- l'atteignent par une jointure (une ligne `signoff` n'a que `workpaper_id`, par exemple) — un
-- dossier scellé les laissait s'écrire librement, puisque `assert_engagement_unlocked()` (0003)
-- lit `NEW.engagement_id` littéralement et ne trouve rien à ces tables-là.
--
-- DEUX FONCTIONS, DEUX FORMES DU MÊME REFUS :
--   assert_engagement_unlocked()      (0003, inchangée) — engagement_id est une COLONNE directe.
--   assert_engagement_unlocked_via()  (neuve) — engagement_id se résout par une requête paramétrée :
--     tg_argv[0] = le nom de la colonne qui porte la clé étrangère (ex. 'workpaper_id') ;
--     tg_argv[1] = une requête `select engagement_id from ... where id = $1`, jouée avec cette clé.
--   Écart au DDL normatif §7.5, délibéré et écrit ici (règle 19) : le plan décrit `tg_argv[0]`
--   comme « une expression SQL vers engagement_id » directement interpolée (ex. littéralement
--   `(select engagement_id from sample where id = new.sample_id)`) — une chaîne EXÉCUTÉE par
--   `EXECUTE` ne voit PAS la variable plpgsql `new` par son nom : ce texte-là lèverait une erreur
--   de colonne inconnue à l'exécution. La forme ci-dessus fait la même chose correctement :
--   la clé étrangère est LUE depuis `NEW`/`OLD` par le moteur (via `to_jsonb`), passée en
--   paramètre `$1` à une requête ORDINAIRE (elle-même sans référence à `new`).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle ne pose aucune RLS (chaque table listée
-- ici a déjà sa politique ou figure sur la liste propriétaire-seul — `rls-couverture.test.ts`,
-- INCHANGÉ, un sujet différent que celui-ci malgré le mot commun « couverture » ; voir
-- `couverture-verrou.test.ts`, neuf, pour CE verrou-ci — décision de périmètre consignée dans
-- STATUS.md, le texte du plan §7.5 qui suggérait de renommer/réutiliser rls-couverture.test.ts
-- pour ce sujet était une coquille, pas une instruction à suivre à la lettre). Elle ne touche pas
-- au drapeau `otto.post_lock_amendment` (Phase 2, `amenderApresVerrou()`) : il reste PRÉPARÉ, posé
-- par la fonction existante, jamais activé par un chemin nouveau ici.

create or replace function assert_engagement_unlocked_via() returns trigger
language plpgsql security invoker as $$
declare
  id_col text := tg_argv[0];
  lookup_sql text := tg_argv[1];
  ref_id uuid;
  eng uuid;
  eng_status text;
begin
  ref_id := (to_jsonb(coalesce(new, old)) ->> id_col)::uuid;
  if ref_id is null then
    return coalesce(new, old);
  end if;
  execute lookup_sql into eng using ref_id;
  if eng is null then
    return coalesce(new, old);
  end if;
  select status into eng_status from engagement where id = eng;
  if eng_status in ('locked','archived')
     and coalesce(current_setting('otto.post_lock_amendment', true), '') <> 'on' then
    raise exception 'engagement % is % — writes rejected (post-lock amendments require justification flow)', eng, eng_status;
  end if;
  return coalesce(new, old);
end $$;

-- ===== les 21 tables « garde_proposee » de 0042, CONFIRMÉES : engagement_id direct, même
-- fonction que 0003, même patron de boucle. `verification_check` s'y ajoute — verdict 'journal'
-- depuis 0042 (ajout seul, 0003), mais jamais gardée contre l'ÉCRITURE d'une ligne NOUVELLE sur
-- un dossier scellé ; append-only et verrouillée ne sont pas la même question. =====

do $$
declare
  t text;
begin
  foreach t in array array[
    'aux_balance_file','carry_forward','coa_map_rule','completion_item','confirmation_campaign',
    'engagement_acceptance','engagement_member','estimation','evaluation_response','fs_line',
    'fsli_assertion_risk','gl_entry_supersession','independence_declaration','non_audit_service',
    'process_change_decision','process_interview','process_model','rcm_row',
    'risk_factor_declared','risk_factor_observed','risk_question_answer',
    'verification_check'
  ] loop
    execute format(
      'create trigger %I_lock_guard before insert or update or delete on %I
         for each row execute function assert_engagement_unlocked()', t, t);
  end loop;
end $$;

update engagement_lock_verdict
   set verdict = 'garde'
 where table_name in (
    'aux_balance_file','carry_forward','coa_map_rule','completion_item','confirmation_campaign',
    'engagement_acceptance','engagement_member','estimation','evaluation_response','fs_line',
    'fsli_assertion_risk','gl_entry_supersession','independence_declaration','non_audit_service',
    'process_change_decision','process_interview','process_model','rcm_row',
    'risk_factor_declared','risk_factor_observed','risk_question_answer'
 ) and verdict = 'garde_proposee';

update engagement_lock_verdict
   set verdict = 'garde'
 where table_name = 'verification_check' and verdict = 'journal';

-- ===== les 16 tables FILLES, jamais vues par 0042 (pas de colonne engagement_id) : chacune
-- gagne son déclencheur ET sa ligne au registre — 0042 n'en portait aucune trace, ce n'est donc
-- pas une confirmation mais une PREMIÈRE entrée. =====

create trigger extraction_lock_guard before insert or update or delete on extraction
  for each row execute function assert_engagement_unlocked_via(
    'evidence_id', 'select engagement_id from evidence where id = $1');

create trigger sample_item_lock_guard before insert or update or delete on sample_item
  for each row execute function assert_engagement_unlocked_via(
    'sample_id', 'select engagement_id from sample where id = $1');

create trigger match_lock_guard before insert or update or delete on match
  for each row execute function assert_engagement_unlocked_via(
    'sample_item_id',
    'select s.engagement_id from sample_item si join sample s on s.id = si.sample_id where si.id = $1');

create trigger attribute_result_lock_guard before insert or update or delete on attribute_result
  for each row execute function assert_engagement_unlocked_via(
    'sample_item_id',
    'select s.engagement_id from sample_item si join sample s on s.id = si.sample_id where si.id = $1');

create trigger control_test_lock_guard before insert or update or delete on control_test
  for each row execute function assert_engagement_unlocked_via(
    'control_id', 'select engagement_id from control where id = $1');

create trigger control_instance_lock_guard before insert or update or delete on control_instance
  for each row execute function assert_engagement_unlocked_via(
    'control_id', 'select engagement_id from control where id = $1');

create trigger request_item_lock_guard before insert or update or delete on request_item
  for each row execute function assert_engagement_unlocked_via(
    'request_id', 'select engagement_id from request where id = $1');

create trigger reminder_lock_guard before insert or update or delete on reminder
  for each row execute function assert_engagement_unlocked_via(
    'request_id', 'select engagement_id from request where id = $1');

create trigger signoff_lock_guard before insert or update or delete on signoff
  for each row execute function assert_engagement_unlocked_via(
    'workpaper_id', 'select engagement_id from workpaper where id = $1');

create trigger workpaper_edit_lock_guard before insert or update or delete on workpaper_edit
  for each row execute function assert_engagement_unlocked_via(
    'workpaper_id', 'select engagement_id from workpaper where id = $1');

create trigger reconciliation_item_lock_guard before insert or update or delete on reconciliation_item
  for each row execute function assert_engagement_unlocked_via(
    'reconciliation_id', 'select engagement_id from reconciliation where id = $1');

create trigger fs_tie_lock_guard before insert or update or delete on fs_tie
  for each row execute function assert_engagement_unlocked_via(
    'fs_line_id', 'select engagement_id from fs_line where id = $1');

create trigger process_step_lock_guard before insert or update or delete on process_step
  for each row execute function assert_engagement_unlocked_via(
    'process_id', 'select engagement_id from process_model where id = $1');

create trigger process_ctrl_lock_guard before insert or update or delete on process_ctrl
  for each row execute function assert_engagement_unlocked_via(
    'process_id', 'select engagement_id from process_model where id = $1');

create trigger interview_transcript_lock_guard before insert or update or delete on interview_transcript
  for each row execute function assert_engagement_unlocked_via(
    'interview_id', 'select engagement_id from process_interview where id = $1');

create trigger transcript_gap_lock_guard before insert or update or delete on transcript_gap
  for each row execute function assert_engagement_unlocked_via(
    'interview_id', 'select engagement_id from process_interview where id = $1');

insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('extraction', 'garde', 'une extraction de champs sur pièce est un fait du dossier, atteint via evidence_id (0177)'),
  ('sample_item', 'garde', 'une ligne d’échantillon sélectionnée est le cœur du sondage, atteinte via sample_id (0177)'),
  ('match', 'garde', 'le résultat du rapprochement d’une ligne est une conclusion de contrôle, atteinte via sample_item_id (0177)'),
  ('attribute_result', 'garde', 'un résultat de test d’attribut est une conclusion de contrôle, atteint via sample_item_id (0177)'),
  ('control_test', 'garde', 'un test de contrôle et sa conclusion, atteints via control_id (0177)'),
  ('control_instance', 'garde', 'une occurrence de contrôle testée, atteinte via control_id (0177)'),
  ('request_item', 'garde', 'un élément de demande au client est du contenu du dossier, atteint via request_id (0177)'),
  ('reminder', 'garde', 'une relance planifiée engage le dossier, atteinte via request_id (0177)'),
  ('signoff', 'garde', 'un visa append-only pouvait encore être INSÉRÉ sur un dossier scellé — l’ajout seul et le verrou sont deux questions distinctes ; atteint via workpaper_id (0177)'),
  ('workpaper_edit', 'garde', 'une édition de section de papier, atteinte via workpaper_id (0177)'),
  ('reconciliation_item', 'garde', 'un écart de rapprochement TB↔GL par compte, atteint via reconciliation_id (0177)'),
  ('fs_tie', 'garde', 'le pointage d’une ligne des états financiers, atteint via fs_line_id (0177)'),
  ('process_step', 'garde', 'une étape de processus décrite, atteinte via process_id (0177)'),
  ('process_ctrl', 'garde', 'un contrôle rattaché à une étape de processus, atteint via process_id (0177)'),
  ('interview_transcript', 'garde', 'la retranscription d’un entretien, atteinte via interview_id (0177)'),
  ('transcript_gap', 'garde', 'un écart candidat entre le dit et le documenté, atteint via interview_id (0177)');
