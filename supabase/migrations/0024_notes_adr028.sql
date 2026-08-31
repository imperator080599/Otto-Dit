-- ADR-102 : LA RÈGLE D'ADR-028 RÉTABLIE DANS LE PRODUIT.
-- « Comme aujourd'hui » voulait dire « comme dans le prototype » : LE
-- PRÉPARATEUR RÉPOND, SEUL LE RÉVISEUR CLÔT — ET JAMAIS L'AUTEUR de la note.
-- Un préparateur qui clôt lui-même la note qu'on lui a adressée vide la revue
-- de sa substance, et c'est ce qu'un inspecteur cherche en premier dans un
-- dossier. La règle vit EN BASE (trigger), pas seulement dans le service :
-- une écriture qui la contourne est refusée par la table elle-même.

-- Le TYPE de la note (ADR-028 §2). Sans lui, « seul le réviseur clôt » serait
-- un cérémonial imposé à des remarques qui ne le méritent pas. Défaut
-- 'a_corriger' : les notes existantes bloquaient toutes le visa, elles
-- continuent — le typage ne relâche rien rétroactivement.
alter table review_note add column note_type text not null default 'a_corriger'
  check (note_type in ('a_corriger','a_documenter','question','remarque_n1'));

-- Qui a clos : sans cette colonne, « jamais l'auteur » serait invérifiable
-- en base — il n'y aurait pas de fait à contraindre.
alter table review_note add column closed_by uuid references app_user(id);

create or replace function assert_note_close_by_reviewer() returns trigger
language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.closed_by is null then
      raise exception 'une clôture de note porte son signataire (closed_by) — ADR-028';
    end if;
    if new.closed_by = new.author_id then
      raise exception 'l''auteur d''une note ne la clôt jamais — un auteur qui clôt sa propre note vide la revue de sa substance (ADR-028)';
    end if;
    if not exists (
      select 1 from engagement_member m
      where m.engagement_id = new.engagement_id and m.user_id = new.closed_by
        and m.eng_role in ('manager','partner') and m.exited_on is null
    ) then
      raise exception 'seul un réviseur de la mission (manager ou associé) clôt une note de revue (ADR-028)';
    end if;
  end if;
  -- Une note close ne se rouvre pas : on en pose une nouvelle.
  if old.status = 'closed' and new.status is distinct from 'closed' then
    raise exception 'une note close ne se rouvre pas — posez une nouvelle note (ADR-028)';
  end if;
  return new;
end $$;

create trigger review_note_close_guard
  before update on review_note
  for each row execute function assert_note_close_by_reviewer();

-- Les ancres s'étendent aux ÉCARTS (ADR-102) : « pourquoi as-tu considéré
-- celui-ci comme résolu ? » est la note de revue la plus fréquente en
-- pratique, et c'était le seul type d'objet vraiment manquant.
alter table review_note drop constraint review_note_anchor_kind_check;
alter table review_note add constraint review_note_anchor_kind_check
  check (anchor_kind in ('sample_item','workpaper_section','questionnaire_answer','materiality_param','exception','deviation'));
