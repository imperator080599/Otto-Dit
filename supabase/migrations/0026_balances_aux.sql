-- 0026 — LES BALANCES AUXILIAIRES ÂGÉES (point 1, ADR-107).
--
-- Le FEC ne porte aucun lettrage : la balance âgée vient de l'EXPORT DU
-- CLIENT (clients / fournisseurs, N / N-1, cinq tranches d'ancienneté), et
-- chaque fichier se RAPPROCHE au grand livre — le fichier N au solde actif
-- du collectif, le fichier N-1 aux à-nouveaux. Seuls le fichier (pièce à
-- part entière) et ses lignes sont stockés : concentration, apparus/disparus,
-- déplacements de part et déformation du vieillissement sont DÉRIVÉS à la
-- lecture — jamais copiés (statuts dérivés).

create table aux_balance_file (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  cote text not null check (cote in ('clients','fournisseurs')),
  exercice text not null check (exercice in ('n','n1')),
  evidence_id uuid not null references evidence(id),
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, cote, exercice)
);

create table aux_balance_row (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references aux_balance_file(id) on delete restrict,
  seq int not null,
  aux_no text not null,
  aux_label text not null,
  non_echu numeric(18,2) not null,
  j0_30 numeric(18,2) not null,
  j31_60 numeric(18,2) not null,
  j61_90 numeric(18,2) not null,
  plus_90 numeric(18,2) not null,
  unique (file_id, aux_no)
);

create index idx_aux_balance_eng on aux_balance_file(engagement_id);
create index idx_aux_balance_rows on aux_balance_row(file_id);
