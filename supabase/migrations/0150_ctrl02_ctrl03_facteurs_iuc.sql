-- 0150 — LOT CONTRÔLE INTERNE, TRANCHE 2 : LES IUC ET LES FACTEURS DE DESIGN
-- (mandat docs/MANDATS/2026-09-08_mandat_controle_interne.md, §2.3, §2.4, §7.2).
--
-- RECHERCHE PRÉALABLE (2026-09-08, agent dédié) : trois tables représentent « le risque »
-- dans ce dépôt — `risk` (0001, une ligne = un risque identifié au risk assessment,
-- fsli_code/assertion/level/description), `fsli_assertion_risk` (0012, un NIVEAU CALCULÉ
-- par fsli+assertion qui COMMANDE l'étendue substantive — pas lui-même « un risque »), et
-- `rcm_row.risk_desc` (0002, EXACTEMENT le décor que ce mandat interdit : du texte libre
-- attaché à un contrôle, aucune FK vers un objet risque réel). Aucune table de ce dépôt ne
-- porte de FK réelle vers `risk` ou `fsli_assertion_risk` avant cette migration — confirmé
-- par recherche exhaustive. Le facteur 1 (§2.4.1, « réponse au risque ») pointe donc `risk`
-- (l'objet risque lui-même, scopé par dossier), jamais `fsli_assertion_risk` (un niveau
-- calculé qui sert le programme substantif ISA/NEP, un axe orthogonal — même distinction déjà
-- faite pour `procedures.json` vs le vocabulaire CTRL-01, CLAUDE.md règle 14 amendée).
--
-- QUATRE FACTEURS (§2.4), UNE TABLE, UNE LIGNE PAR FACTEUR : `control_design_factor`, clé
-- `unique (control_id, factor)` — un service fait un upsert (même patron que
-- `control_task_procedure`, 0148), jamais un doublon muet. Le facteur « réponse au risque »
-- exige EN PLUS un lien réel (§2.4.1 : « jamais du texte libre seul ») : `control_risk`,
-- table de jointure control↔risk séparée de la conclusion elle-même — un contrôle peut
-- répondre à plusieurs risques, et le lien peut être posé avant, pendant ou après que la
-- conclusion du facteur soit rédigée. CTRL-02 (service, pas ici) exige les DEUX : au moins
-- une ligne `control_risk` ET une ligne `control_design_factor` pour `reponse_risque`.
--
-- IUC (§2.3), DEUX TABLES : `control_iuc` (la déclaration elle-même — utilisée ou non, une
-- ligne par contrôle, `unique(control_id)`) et `control_iuc_preuve` (la preuve d'exactitude
-- OU d'exhaustivité, une ligne par volet, `unique(iuc_id, volet)`) — séparées parce que la
-- déclaration peut précéder les preuves de plusieurs jours, dans des transactions distinctes
-- (même raisonnement que `control_task`/`control_task_procedure`, 0148).
--
-- DÉNORMALISATION : les QUATRE tables ci-dessous portent leur PROPRE `engagement_id`, jamais
-- une colonne dérivée par jointure. `assert_engagement_unlocked()` (0003) lit
-- `NEW.engagement_id` littéralement. Aucune de ces quatre tables ne s'écrit forcément dans la
-- MÊME transaction que son parent (`control`/`control_iuc`) — le facteur 1 aujourd'hui, le
-- facteur 4 la semaine prochaine, la preuve d'exhaustivité longtemps après la déclaration —
-- donc le précédent `account_detail_row` (lignes nées dans la même transaction que leur
-- parent) NE s'applique PAS ici, exactement le raisonnement déjà écrit pour
-- `control_task_procedure` (0148). Une garde qui ne regarde jamais le bon champ n'est pas une
-- garde (règle 17).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle ne touche pas l'efficacité
-- opérationnelle (CTRL-04/05/06/07, tranche suivante — population, tirage, table de pack
-- vide, inquiry neuve) ni le suivi de mission (kanban, tableau de bord, tranche d'après). Les
-- gardes CTRL-02/CTRL-03 elles-mêmes vivent dans `sox.ts` (`setDiStatus`), pas en SQL : le
-- prédicat exact (quatre facteurs présents, lien de risque réel, IUC déclarée puis les deux
-- volets si utilisée) est plus lisible et plus testable côté service que dans un `check`.

-- Deux corrections sur `risk` (0001), trouvées par la revue hostile du 2026-09-08 (voix 2) sur
-- `importRcm` (sox.ts), qui crée désormais un vrai risque par assertion importée du RCM :
--   1. `source` n'avait aucune valeur qui décrive honnêtement « synthétisé à l'import » — poser
--      'manual' (une valeur existante) aurait menti sur la provenance (règle 3 : la provenance
--      ne se rattrape pas après coup, et un mensonge de provenance n'est pas moins un mensonge
--      qu'un mensonge de contenu). Le nom de la contrainte auto-générée par 0001 n'est jamais
--      supposé : recherchée dans `pg_constraint`, comme le fait déjà ce dépôt pour les policies
--      RLS dynamiques (`execute format(...)`).
--   2. `risk` n'avait AUCUNE contrainte d'unicité — deux appels concurrents à `importRcm` (ou un
--      import rejoué après un échec partiel) pouvaient créer deux lignes `risk` identiques en
--      silence (vérification-puis-écriture, jamais atomique). `unique(engagement_id, assertion,
--      description)` rend la double-création impossible AU NIVEAU BASE, pas seulement au niveau
--      service — et rend le futur upsert de `importRcm` (INSERT ... ON CONFLICT) possible.
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'risk'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%';
  if cname is not null then
    execute format('alter table risk drop constraint %I', cname);
  end if;
  execute $sql$alter table risk add constraint risk_source_check
    check (source in ('pack_default','questionnaire','manual','rcm_import'))$sql$;
end $$;

alter table risk add constraint risk_assertion_description_uniq unique (engagement_id, assertion, description);

create table control_risk (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  risk_id uuid not null references risk(id) on delete restrict,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (control_id, risk_id)
);

create table control_design_factor (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  factor text not null check (factor in
    ('reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation')),
  conclusion text not null,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (control_id, factor)
);

create table control_iuc (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  utilisee boolean not null,
  description text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (control_id)
);

create table control_iuc_preuve (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  iuc_id uuid not null references control_iuc(id) on delete restrict,
  volet text not null check (volet in ('exactitude', 'exhaustivite')),
  conclusion text not null,
  evidence_id uuid references evidence(id),
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (iuc_id, volet)
);

create trigger control_risk_lock_guard before insert or update or delete on control_risk
  for each row execute function assert_engagement_unlocked();
create trigger control_design_factor_lock_guard before insert or update or delete on control_design_factor
  for each row execute function assert_engagement_unlocked();
create trigger control_iuc_lock_guard before insert or update or delete on control_iuc
  for each row execute function assert_engagement_unlocked();
create trigger control_iuc_preuve_lock_guard before insert or update or delete on control_iuc_preuve
  for each row execute function assert_engagement_unlocked();

insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('control_risk', 'garde', 'le lien entre un contrôle et le(s) risque(s) réel(s) qu''il adresse est du contenu du dossier (CTRL-02, facteur « réponse au risque »)'),
  ('control_design_factor', 'garde', 'la conclusion de chacun des quatre facteurs de design est du contenu du dossier, écrite potentiellement en plusieurs passages séparés'),
  ('control_iuc', 'garde', 'la déclaration IUC (utilisée ou non) est du contenu du dossier'),
  ('control_iuc_preuve', 'garde', 'la preuve d''exactitude ou d''exhaustivité d''une IUC est du contenu du dossier, écrite potentiellement bien après la déclaration elle-même');

do $$
begin
  execute 'alter table control_risk enable row level security';
  execute 'alter table control_risk force row level security';
  execute 'create policy control_risk_eng on control_risk using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_design_factor enable row level security';
  execute 'alter table control_design_factor force row level security';
  execute 'create policy control_design_factor_eng on control_design_factor using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_iuc enable row level security';
  execute 'alter table control_iuc force row level security';
  execute 'create policy control_iuc_eng on control_iuc using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_iuc_preuve enable row level security';
  execute 'alter table control_iuc_preuve force row level security';
  execute 'create policy control_iuc_preuve_eng on control_iuc_preuve using (engagement_id in (select otto_engagements()))';
end $$;
