-- LOT CONTRÔLE INTERNE, §3.3 (mandat 2026-09-08), TRANCHE 7 — CTRL-06.
--
-- « On fait la même chose que pour le D&I. L'inquiry est de nouveau systématique — mais :
-- L'inquiry de l'OE est une inquiry NEUVE. Elle ne réutilise jamais celle du D&I : son objet est
-- précisément de s'assurer que rien n'a changé depuis l'occurrence documentée au D&I. Elle porte
-- sa propre date, postérieure. Réutiliser l'enregistrement du D&I est refusé. Et, comme au D&I,
-- au moins une procédure parmi inspection, observation, reperformance (CTRL-01 s'applique
-- identiquement). »
--
-- MÊME FORME que `control_task_procedure` (0148) — DÉLIBÉRÉMENT, pas une table neuve inventée :
-- le D&I documente ses procédures PAR TÂCHE (`control_task`) ; l'OE n'a pas de décomposition en
-- tâches dans ce mandat (le cycle OE est UN tirage, UNE conclusion), donc l'ancrage est le
-- CONTRÔLE lui-même, pas une tâche. `engagement_id` dénormalisé pour la MÊME raison que
-- `control_task_procedure` (pas `account_detail_row`) : `assert_engagement_unlocked()` lit
-- `NEW.engagement_id` littéralement, et `documenterProcedureOe` écrit dans une transaction
-- séparée de tout ce qui a créé le contrôle.
--
-- UNIQUE (control_id, procedure) : même discipline que `control_task_procedure` — un second appel
-- sur la même (contrôle, procédure) ÉDITE la ligne (upsert), une correction n'est pas une seconde
-- preuve. `performed_at` est un CHAMP DISTINCT de `created_at` — c'est la date que l'auditeur
-- affirme avoir mené la procédure (postérieure à l'inquiry D&I, mandat), jamais confondue avec la
-- date d'écriture en base.
create table control_oe_procedure (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  procedure text not null check (procedure in ('inquiry', 'inspection', 'observation', 'reperformance')),
  notes text not null,
  evidence_id uuid references evidence(id),
  performed_at timestamptz not null,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique (control_id, procedure)
);

create index control_oe_procedure_control_idx on control_oe_procedure (control_id);

create trigger control_oe_procedure_lock_guard before insert or update or delete on control_oe_procedure
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('control_oe_procedure', 'garde', 'les procédures d''efficacité opérationnelle (OE) documentées par contrôle sont du contenu du dossier');

do $$ begin
  execute 'alter table control_oe_procedure enable row level security';
  execute 'create policy control_oe_procedure_eng on control_oe_procedure using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_oe_procedure force row level security';
end $$;
