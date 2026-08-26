-- 0015_firm_methodology : la méthode d'un cabinet lui appartient, comme ses dossiers.
--
-- CE QUE CETTE MIGRATION CORRIGE. Jusqu'ici le catalogue — procédures, seuils,
-- échelle de risque, jeu d'assertions, questionnaire, rubriques d'indépendance —
-- était lu depuis le DÉPÔT. Il était donc COMMUN : une seule méthode pour toutes
-- les missions et tous les cabinets. La promesse « votre méthode reste la vôtre,
-- vous la chargez, je ne la vois jamais » ne tenait pas sur sa seconde moitié.
--
-- TROIS PIÈCES, ET LA TROISIÈME EST LA PLUS IMPORTANTE.
--
--   1. firm_methodology — le paquet JSON validé, par cabinet, versionné et
--      empreint. Une méthode publiée ne se modifie pas : on en publie une
--      nouvelle. Un dossier doit pouvoir dire des années plus tard SOUS QUELLE
--      MÉTHODE il a été exécuté, et une ligne réécrite le rendrait incapable.
--
--   2. engagement.methodology_id — la mission DÉSIGNE son catalogue. Elle ne
--      prend pas « le dernier en date » à chaque lecture : une méthode publiée
--      en mars ne doit pas changer rétroactivement les travaux requis d'un
--      dossier planifié en janvier.
--
--   3. L'ISOLATION, ET ELLE EST DANS LA BASE. La clé étrangère est COMPOSITE
--      (methodology_id, tenant_id) : désigner le catalogue d'un AUTRE cabinet
--      est impossible au niveau de la base, pas seulement refusé par
--      l'application. C'est le point qui distingue cette table d'un simple
--      champ de configuration — contrairement aux politiques RLS, une clé
--      étrangère n'est pas inerte en local (ADR-007).

create table firm_methodology (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  -- ce que le cabinet lit dans une liste : « Méthode d'audit légal 2026 »
  label text not null check (btrim(label) <> ''),
  -- le paquet des six fichiers de CONTENU, validé AVANT d'arriver ici.
  -- Les SCHÉMAS n'y sont pas : ils énumèrent ce que le moteur sait faire, ils
  -- appartiennent au produit. Un cabinet qui livrerait son propre schéma
  -- pourrait désactiver tous les contrôles en une ligne.
  content jsonb not null,
  -- empreinte du contenu canonicalisé : c'est elle qu'un papier de travail cite
  content_hash text not null check (char_length(content_hash) = 64),
  -- les versions déclarées par chaque fichier, pour la lecture humaine
  versions jsonb not null default '{}'::jsonb,
  published_by uuid not null references app_user(id) on delete restrict,
  published_at timestamptz not null default now(),
  -- Support de la clé étrangère composite ci-dessous. Redondante avec la clé
  -- primaire, et c'est le prix de l'isolation vérifiée par la base.
  unique (id, tenant_id)
);
create index firm_methodology_by_tenant on firm_methodology (tenant_id, published_at desc);

comment on table firm_methodology is
  'La méthode d''un cabinet, validée à l''écriture. Une méthode publiée ne se modifie pas : on en publie une nouvelle, et les dossiers en cours gardent la leur.';
comment on column firm_methodology.content is
  'Les six fichiers de contenu. Les schémas sont au produit : ils énumèrent ce que le moteur sait calculer.';

-- La mission désigne son catalogue.
--
-- COLONNE NULLABLE, ET C'EST DÉLIBÉRÉ : les missions existantes n'en ont pas
-- encore. Mais le chargeur REFUSE une mission sans méthodologie désignée au
-- lieu de retomber silencieusement sur celle du dépôt. Un repli silencieux
-- ferait tourner un dossier sur la méthode de l'éditeur sans qu'aucun écran ne
-- le dise — exactement le défaut que ce produit passe son temps à interdire.
alter table engagement add column methodology_id uuid;
alter table engagement add constraint engagement_methodology_same_firm
  foreign key (methodology_id, tenant_id) references firm_methodology (id, tenant_id);

comment on column engagement.methodology_id is
  'Le catalogue sous lequel CE dossier est exécuté. La clé étrangère est composite avec tenant_id : désigner la méthode d''un autre cabinet est impossible, pas seulement refusé.';

alter table firm_methodology enable row level security;
create policy firm_methodology_tenant on firm_methodology using (tenant_id = otto_tenant());
