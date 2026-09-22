-- 0174 — P1-03 (AUD-03, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §7.3, §426-433-adjacent).
-- Numérotée 0174, pas 0172 comme l'esquisse du plan le nomme : 0172 est déjà consommée par
-- P1-02 (sections_et_notes) et 0173 par le correctif R143 (règle 26, urgence de déploiement,
-- docs/BACKLOG_REPORTE.md) — la bande 0170-0179 glisse d'autant, comme 0171 l'a déjà fait pour
-- P1-01 (voir son propre en-tête).
--
-- CE QUE CETTE MIGRATION FAIT, DANS L'ORDRE :
--   1. process_model : code stable (indépendant du cycle_ref/exercice), fsli_code, statut actif/
--      supersédé, provenance (humain/client/engendre), lien flowchart client — supersede réel
--      remplace le `delete` de `importerProcessus` (P1-06 la câblera dans le service).
--   2. process_step : lien vers la proposition qui l'a fait naître (Phase 4), système et
--      pictogramme pour la légende du diagramme engendré.
--   3. control : lien vers process_model (rattaché par nom normalisé, migration de données,
--      jamais inventé sinon null) ; control_fsli, la vraie table de scoping poste↔contrôle.
--   4. risk : fsli_code, level devient nullable — le niveau déduit d'un drapeau `is_key` est
--      retiré (AUD-03 : « automatisation factice retirée »).
--   5. cascades → restrict (04 §1).
--
-- DÉCISION DE PÉRIMÈTRE, CONSIGNÉE (pas devinée) : le plan (ligne 230) liste, à la suite de
-- `process_step.proposition_id`, « + systeme text (ERP nommé) ». `process_step.system_name`
-- (0027_processus.sql, `not null`) porte DÉJÀ exactement cette information — vérifié en lisant
-- le schéma ET les données réelles du dépôt (`dataset/processus/revenus_2025.json` :
-- `"systeme": "Vela ERP"`, `"WMS Corex"`, etc., déjà consommées par `processus.ts::EtapeProcessus.
-- systeme` ↔ `system_name`). Ajouter une SECONDE colonne `systeme` dupliquerait ce champ sans
-- qu'aucun besoin nouveau ne soit nommé ailleurs dans le plan. Lu comme une redondance de
-- rédaction (le plan reprend le nom métier « systeme » sans se souvenir que 0027 l'a déjà posé
-- sous `system_name`), PAS comme une colonne à ajouter — reporté, pas deviné (R-nn à suivre si
-- le fondateur juge autrement). `pictogramme`, lui, EST nouveau (aucune colonne existante ne le
-- couvre) et EST ajouté ci-dessous.

-- ===== process_model =====

alter table process_model
  add column code text,
  add column fsli_code text,
  add column status text not null default 'active' check (status in ('active', 'superseded')),
  add column supersedes_id uuid references process_model(id),
  add column client_flowchart_evidence_id uuid references evidence(id),
  add column origine text not null default 'humain' check (origine in ('humain', 'client', 'engendre'));

-- MIGRATION DE DONNÉES (avant le `drop constraint`/`not null` : chaque ligne existante reçoit
-- un code stable dérivé de ce qu'elle a toujours porté, jamais inventé). `code` = `cycle_ref ||
-- '-1'` (le plan le dit littéralement : la première version d'un cycle porte le suffixe -1,
-- une future tranche gérera un cycle avec plusieurs processus actifs). `fsli_code` : depuis
-- l'ancienne constante TS `FSLI_DU_CYCLE` (processus.ts), posée ici comme DONNÉES DE MIGRATION
-- — la table ne porte qu'UN poste par cycle (le premier de la liste), fidèle à ce que la
-- constante servait réellement (`raiseFactor` visait toutes les cibles, mais `process_model.
-- fsli_code` est un champ singulier de rattachement, pas une liste).
update process_model set code = cycle_ref || '-1' where code is null;
update process_model set fsli_code = 'REVENUE' where fsli_code is null and cycle_ref = 'REVENUE';

alter table process_model
  alter column code set not null,
  drop constraint process_model_engagement_id_cycle_ref_exercice_key;

create unique index process_model_actif on process_model (engagement_id, code, exercice)
  where status = 'active';

-- ===== process_step =====

alter table process_step
  add column proposition_id uuid references proposition(id),
  add column pictogramme text check (pictogramme in
    ('etape', 'controle', 'systeme', 'acteur', 'entree', 'sortie', 'decision'));

-- ===== control =====

alter table control
  add column process_model_id uuid references process_model(id);

-- MIGRATION DE DONNÉES : rattachement par égalité normalisée `process.name` ↔ `process_model.
-- name` (plan, ligne 231 : « quand elle existe, sinon null (jamais inventé) »). Normalisation :
-- espaces superflus retirés, casse ignorée — un contrôle dont le processus RCM (`Order to Cash`)
-- ne correspond à AUCUN nom de `process_model` importé (`Cycle ventes — de la commande à
-- l'encaissement`, en français) reste NULL, honnêtement : le monde semé actuel ne partage AUCUN
-- nom entre les deux tables (vérifié par lecture directe des deux jeux de données avant
-- d'écrire cette migration), donc cette UPDATE est un NO-OP mesuré sur ce dépôt — le
-- rattachement réel se fera par un geste explicite (`lierControleAuPoste`, service P1-03) que
-- le semeur posera pour ses propres contrôles (accepté d'avance dans l'acceptation de la tâche).
update control c
set process_model_id = pm.id
from process p
join process_model pm
  on lower(btrim(pm.name)) = lower(btrim(p.name))
where c.process_id = p.id
  and pm.engagement_id = c.engagement_id
  and c.process_model_id is null;

create table control_fsli (
  control_id uuid not null references control(id) on delete restrict,
  fsli_code text not null,
  assertions text[] not null default '{}',
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  primary key (control_id, fsli_code)
);

-- RLS (ADR-109) : `control_fsli` ne porte pas son propre `engagement_id` — même patron que
-- `attribute_def`/`control_instance`/`control_test` (0029), un saut vers le parent `control` au
-- périmètre. Trouvé par `rls-couverture.test.ts` (règle 17 : l'instrument mesure, il n'a pas
-- besoin d'être averti à l'avance — c'est justement ce qu'il existe pour attraper).
do $$
begin
  execute 'alter table control_fsli enable row level security';
  execute 'alter table control_fsli force row level security';
  execute 'create policy control_fsli_eng on control_fsli using (exists (
    select 1 from control p where p.id = control_fsli.control_id
      and p.engagement_id in (select otto_engagements())))';
end $$;

-- MIGRATION DE DONNÉES : depuis `rcm_row` — mais `rcm_row` (0002) ne porte AUJOURD'HUI aucune
-- colonne de poste (vérifié : `risk_desc text, assertions text[], coso_component text,
-- import_file_id`, rien d'autre) et `dataset/sox/rcm.csv` ne porte pas non plus de colonne
-- `fsli` — le CSV normatif du plan (§7.3, `sox.ts::importRcm` future : « colonne optionnelle
-- fsli du CSV ») n'existe pas encore sur ce dépôt. Rien à backfiller aujourd'hui : la table naît
-- vide, un contrôle sans poste s'affiche dans la RCM de mission (comportement déjà acceptable
-- par le plan lui-même, ligne 232) — `importRcm` (service, cette même tranche) commence à la
-- peupler pour les imports futurs si la colonne `fsli` est présente dans le CSV.

-- ===== risk =====

-- `risk.fsli_code` EXISTE DÉJÀ (0001_core.sql, jamais retiré depuis) — vérifié par lecture
-- directe du schéma avant d'écrire cette migration (règle 15), pas supposé absent parce que le
-- plan le liste comme « + fsli_code text » : rien à ajouter ici, seul `level` change.
alter table risk
  alter column level drop not null;

-- AUD-03 : « le niveau high/medium déduit d'un drapeau (is_key) est retiré ». `sox.ts::importRcm`
-- (service, cette même tranche) cesse d'écrire un niveau déduit pour les `risk` qu'il crée ; les
-- lignes EXISTANTES créées par ce chemin (`source = 'rcm_import'`) sont mises à `level = null`
-- ici, une fois, par cette migration.
update risk set level = null where source = 'rcm_import' and level is not null;

-- ===== cascades → restrict (04 §1) =====
-- Cinq tables : process_step, process_ctrl (cascade depuis process_model) ; interview_participant,
-- interview_transcript, transcript_gap (cascade depuis process_interview). Le plan (ligne 234)
-- nomme littéralement « process_step, process_ctrl, process_interview, interview_transcript,
-- transcript_gap » — mais `process_interview` lui-même n'a AUCUNE FK `on delete cascade»
-- (vérifié : sa seule FK, vers `engagement`, est déjà `on delete restrict` depuis 0027) : rien à
-- changer là. Le compte (cinq tables nommées) ne colle qu'en lisant `interview_participant` à la
-- place de `process_interview` dans cette liste — la seule table cascadant réellement depuis
-- `process_interview` que le plan omet. Traité comme une coquille du plan (même raisonnement que
-- la décision « systeme », ci-dessus), pas une instruction à suivre à la lettre contre le schéma
-- réel.

alter table process_step drop constraint process_step_process_id_fkey,
  add constraint process_step_process_id_fkey foreign key (process_id) references process_model(id) on delete restrict;

alter table process_ctrl drop constraint process_ctrl_process_id_fkey,
  add constraint process_ctrl_process_id_fkey foreign key (process_id) references process_model(id) on delete restrict;

alter table interview_participant drop constraint interview_participant_interview_id_fkey,
  add constraint interview_participant_interview_id_fkey foreign key (interview_id) references process_interview(id) on delete restrict;

alter table interview_transcript drop constraint interview_transcript_interview_id_fkey,
  add constraint interview_transcript_interview_id_fkey foreign key (interview_id) references process_interview(id) on delete restrict;

alter table transcript_gap drop constraint transcript_gap_interview_id_fkey,
  add constraint transcript_gap_interview_id_fkey foreign key (interview_id) references process_interview(id) on delete restrict;
