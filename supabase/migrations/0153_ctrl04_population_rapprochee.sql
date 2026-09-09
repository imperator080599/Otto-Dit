-- LOT CONTRÔLE INTERNE, §3.1 (mandat 2026-09-08), TRANCHE 6 — CTRL-04.
--
-- « Tirer sur une population d'occurrences non rapprochée. Miroir exact de POP-01. » POP-01
-- (0144_rapprochement_detail_de_compte.sql, account-detail.ts) gate `proposeRevenueSample` sur un
-- rapprochement HUMAIN, conclu et daté, jamais sur un simple calcul — même mécanique reprise ici
-- pour la population d'OE, quelle que soit son origine (dérivée ou demandée au client, CTRL-05) :
-- une population dérivée est déjà auto-cohérente avec la fréquence (lecture /api/sante « population
-- dérivée », tranche 4), mais CTRL-04 exige en plus la CONCLUSION de l'auditeur — un jugement
-- professionnel, pas seulement un calcul qui tombe juste.
--
-- Une ligne par rapprochement CONCLU, jamais réécrite (même discipline que POP-03/TIRAGE-04) — le
-- plus récent fait foi ; la fraîcheur se vérifie en comparant `row_count` à un compte FRAIS de
-- `control_instance` au moment de la lecture (control-population.ts), jamais supposée à jour (même
-- défaut que POP-01 aurait eu sans sa propre vérification de fraîcheur contre le grand livre).
--
-- `engagement_id` DÉNORMALISÉ (comme `control_task_procedure`, 0148, PAS comme `account_detail_row`,
-- 0144) — délibéré, pas copié au hasard : `assert_engagement_unlocked()` (0003) lit
-- `NEW.engagement_id` littéralement, jamais par jointure, et `rapprocherPopulationControle` peut
-- écrire bien après la création de la population elle-même (une transaction séparée, exactement le
-- cas que le commentaire de `control_task_procedure` nomme) — le précédent d'`account_detail_row`
-- (protégée par le VERROU DE SON PARENT, née dans la MÊME transaction) ne s'applique pas ici.
create table control_population_reconciliation (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  control_id uuid not null references control(id) on delete restrict,
  row_count int not null,
  conclusion text not null,
  rapprochee_by uuid not null references app_user(id),
  rapprochee_at timestamptz not null default now()
);

create index control_population_reconciliation_control_idx
  on control_population_reconciliation (control_id, rapprochee_at desc);

-- LA GARDE DE VERROU (0003) ET SON VERDICT (0042) : le rapprochement de la population d'OE est du
-- contenu du dossier — rien ne s'y écrit après le scellé, même précédent qu'account_detail_import.
-- Trouvé manquant par rls-couverture.test.ts et gardes.test.ts sur le premier passage de cette
-- migration (règle 17 : la chaîne verify a rougi sur son propre cas avant ce correctif, pas après —
-- la garde a fait son travail, exactement le précédent que 0144 documente déjà pour elle-même).
create trigger control_population_reconciliation_lock_guard
  before insert or update or delete on control_population_reconciliation
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('control_population_reconciliation', 'garde', 'le rapprochement de la population d''OE est du contenu du dossier — une conclusion d''auditeur');

do $$ begin
  execute 'alter table control_population_reconciliation enable row level security';
  execute 'create policy control_population_reconciliation_eng on control_population_reconciliation using (engagement_id in (select otto_engagements()))';
  execute 'alter table control_population_reconciliation force row level security';
end $$;
