-- LES NOTES DE REVUE SUR TOUT ÉCRAN, ET DEUX NATURES CLOISONNÉES (revue n°3 §2).
--
-- DEUX CHOSES MANQUAIENT.
--
-- 1. L'ANCRE « ÉCRAN ». Les six ancres existantes visent un OBJET MÉTIER — un
--    élément d'échantillon, une section de papier, un écart. C'est la bonne
--    règle et elle ne bouge pas. Mais elle laisse sans recours la remarque qui
--    porte sur l'ÉCRAN lui-même : « cette colonne est illisible », « ce bouton
--    manque ici ». Faute d'ancre, ces remarques n'avaient nulle part où aller —
--    et une remarque qui n'a nulle part où aller se dit à l'oral, puis se perd.
--    L'ancre d'écran est la ROUTE (identité stable) plus, si l'on veut, une
--    section de la page. Ce n'est pas une position : une route survit à un
--    changement de mise en page, un pixel non.
--
-- 2. LA NATURE. Une note de PRODUIT — le retour du fondateur sur la plateforme —
--    n'a rien à faire dans un dossier d'audit. Elle n'y entre pas, elle ne
--    bloque aucun visa, elle ne se mêle jamais aux notes de la mission. Le
--    cloisonnement est ici, en base, et non dans un usage discipliné : une
--    note de produit attachée à un papier de travail serait précisément la
--    manière dont un retour de fondateur finirait dans un dossier scellé.
--
-- LES DEUX NATURES ONT DES RÈGLES DE CLÔTURE OPPOSÉES, et c'est ce qui les rend
-- visiblement distinctes :
--   · note d'AUDIT   — l'auteur ne clôt JAMAIS ; seul un réviseur (ADR-028) ;
--   · note de PRODUIT — SEUL l'auteur clôt. Celui qui l'a posée est le seul à
--     savoir si la réponse le satisfait. Personne d'autre, et surtout pas la
--     machine : OTTO répond, il ne clôt pas.

alter table review_note add column scope text not null default 'audit'
  check (scope in ('audit', 'produit'));

-- CLOISONNEMENT 1 : une note de produit n'est attachée à AUCUN papier de
-- travail. C'est le chemin par lequel elle entrerait au dossier.
alter table review_note add constraint review_note_produit_hors_dossier
  check (scope = 'audit' or workpaper_id is null);

-- CLOISONNEMENT 2 : une note de produit ne porte pas de type BLOQUANT. Le
-- visa d'un dossier d'audit ne dépend pas d'un avis sur le produit.
alter table review_note add constraint review_note_produit_ne_bloque_pas
  check (scope = 'audit' or note_type <> 'a_corriger');

-- CLOISONNEMENT 3 : une note de produit ne s'ancre que sur un ÉCRAN. S'ancrer
-- sur un élément d'échantillon la rendrait indiscernable d'une note de revue
-- pour tout écran qui affiche les marqueurs d'un objet métier.
alter table review_note add constraint review_note_produit_ancre_ecran
  check (scope = 'audit' or anchor_kind = 'ecran');

alter table review_note drop constraint review_note_anchor_kind_check;
alter table review_note add constraint review_note_anchor_kind_check
  check (anchor_kind in ('sample_item','workpaper_section','questionnaire_answer',
                         'materiality_param','exception','deviation','ecran'));

-- LA CLÔTURE, PAR NATURE. Le garde d'ADR-028 devient conditionnel : il tient
-- toujours pour l'audit, et il est INVERSÉ pour le produit.
create or replace function assert_note_close_by_reviewer() returns trigger
language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.closed_by is null then
      raise exception 'une clôture de note porte son signataire (closed_by) — ADR-028';
    end if;
    if new.scope = 'produit' then
      -- SEUL L'AUTEUR CLÔT UNE NOTE DE PRODUIT. Celui qui a posé le retour est
      -- le seul à savoir si la réponse le satisfait ; la machine qui répond ne
      -- décide pas que sa réponse suffit.
      if new.closed_by <> new.author_id then
        raise exception 'une note de produit se clôt par son auteur, et par personne d''autre — celui qui répond ne décide pas que sa réponse suffit';
      end if;
    else
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
  end if;
  if old.status = 'closed' and new.status is distinct from 'closed' then
    raise exception 'une note close ne se rouvre pas — posez une nouvelle note (ADR-028)';
  end if;
  return new;
end $$;

-- L'ancre d'écran se lit vite : c'est la clé de l'affichage des marqueurs.
create index if not exists review_note_ecran_idx
  on review_note (engagement_id, anchor_ref) where anchor_kind = 'ecran';
create index if not exists review_note_scope_idx on review_note (engagement_id, scope);
