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
create table control_population_reconciliation (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references control(id) on delete restrict,
  row_count int not null,
  conclusion text not null,
  rapprochee_by uuid not null references app_user(id),
  rapprochee_at timestamptz not null default now()
);

create index control_population_reconciliation_control_idx
  on control_population_reconciliation (control_id, rapprochee_at desc);
