-- 0148 — LOT CONTRÔLE INTERNE, TRANCHE 1 : LE WALKTHROUGH ET SES TÂCHES
-- (mandat docs/MANDATS/2026-09-08_mandat_controle_interne.md, §2, §7.1).
--
-- CE QUI EXISTAIT DÉJÀ (recherche du 2026-09-08, avant d'écrire cette
-- migration) : `control` (0002) porte déjà `frequency`/`owner_name`/
-- `is_key`/`di_status`/`di_conclusion` — le point d'ancrage correct, ÉTENDU
-- ici, jamais dupliqué. `di_status`/`di_conclusion` restent DEUX CHAMPS
-- TEXTE ; le mandat exige une décomposition PAR TÂCHE (§2.1) que ces deux
-- colonnes ne peuvent pas porter — d'où les deux tables neuves ci-dessous.
-- `walkthrough` (0002:217-224) existe aussi, mais ancrée sur `process_id`
-- (un processus peut porter PLUSIEURS contrôles) alors que le mandat
-- documente le walkthrough PAR CONTRÔLE (« un contrôle à partir d'un
-- walkthrough filmé ») ; elle est MORTE en code depuis sa création (aucun
-- service, aucune route — confirmé par la recherche, seule mention hors SQL
-- dans un commentaire libre) et déjà nommée décor dans
-- `semeur/registre.ts:171`. Plutôt que la repartir avec le mauvais ancrage,
-- l'enregistrement vidéo devient un LIEN DIRECT sur `control` — plus simple,
-- correctement ancré, et `walkthrough` (0002) reste ce qu'elle est : une
-- table jamais câblée, ni supprimée ni réutilisée à tort (aucune migration
-- n'éditera jamais 0002, règle 26 ; l'arbitrage est consigné dans
-- docs/DECISIONS.md, pas seulement ici).
--
-- CTRL-01 (§2.2) : « toute tâche exige au moins une procédure parmi
-- inspection/observation/reperformance — l'inquiry seule ne conclut rien. »
-- L'inquiry est dite SYSTÉMATIQUE (§2.2, répété §3.3) : elle est donc posée
-- AUTOMATIQUEMENT (par le service, pas ici en SQL) à la création de chaque
-- tâche, citant la vidéo du walkthrough — CTRL-01 se lit alors comme un
-- prédicat SQL simple : au moins une ligne `control_task_procedure` du
-- groupe dont `procedure <> 'inquiry'`.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle ne touche ni l'IUC ni
-- les quatre facteurs de conception (CTRL-02/CTRL-03, tranche suivante), ni
-- l'efficacité opérationnelle (CTRL-04/05/06/07, tranche d'après) — l'ordre
-- de construction du mandat (§7) les traite dans cet ordre, pas ensemble.

alter table control add column di_walkthrough_evidence_id uuid references evidence(id);

create table control_task (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  seq_no int not null,
  description text not null,
  /* Repère libre dans la vidéo (« 12:34 »), tel que tapé par l'auditeur —
     jamais un lecteur vidéo scrutable : hors périmètre de cette tranche. */
  video_timestamp text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (control_id, seq_no)
);

create table control_task_procedure (
  id uuid primary key default gen_random_uuid(),
  /* DÉNORMALISÉ, comme `deviation`/`rcm_row`/`deficiency` du même bloc ICFR
     (0002) : `assert_engagement_unlocked()` (0003) lit `NEW.engagement_id`
     littéralement, jamais par jointure — sans cette colonne ICI, la garde de
     verrou serait posée sur `control_task` (la tâche, créée une fois) mais
     RESTERAIT MUETTE sur `documenterProcedureTache`, qui peut écrire bien
     après, dans une transaction SÉPARÉE de la création de la tâche (à la
     différence d'`account_detail_row`, dont le précédent NE s'applique PAS
     ici — ses lignes naissent dans la MÊME transaction que leur parent). Une
     garde qui ne regarde jamais le bon champ n'est pas une garde (règle 17). */
  engagement_id uuid not null references engagement(id) on delete restrict,
  task_id uuid not null references control_task(id) on delete restrict,
  procedure text not null check (procedure in ('inquiry', 'inspection', 'observation', 'reperformance')),
  notes text not null,
  evidence_id uuid references evidence(id),
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  /* Une seule ligne par (tâche, procédure) : documenter deux fois la même
     inspection sur la même tâche est une édition de la première, pas une
     seconde ligne — le service fait un `upsert`, jamais un doublon muet. */
  unique (task_id, procedure)
);

create trigger control_task_lock_guard before insert or update or delete on control_task
  for each row execute function assert_engagement_unlocked();
create trigger control_task_procedure_lock_guard before insert or update or delete on control_task_procedure
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('control_task', 'garde', 'les tâches du walkthrough sont du contenu du dossier — le D&I d''un contrôle'),
  ('control_task_procedure', 'garde', 'les procédures documentées par tâche sont du contenu du dossier, écrites potentiellement bien après la tâche elle-même (transaction séparée)');

do $$
begin
  execute 'alter table control_task enable row level security';
  execute 'alter table control_task force row level security';
  execute 'create policy control_task_eng on control_task using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_task_procedure enable row level security';
  execute 'alter table control_task_procedure force row level security';
  execute 'create policy control_task_procedure_eng on control_task_procedure using (engagement_id in (select otto_engagements()))';
end $$;
