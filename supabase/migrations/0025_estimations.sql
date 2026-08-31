-- 0025 — LES ESTIMATIONS COMPTABLES HORS LITIGE (point 11a, ADR-106).
--
-- Le client fournit un FICHIER DE CALCUL avec sa base ; l'auditeur doit
-- pouvoir : l'importer (le fichier entre au moteur de pièces — empreinte,
-- provenance), RAPPROCHER la base à la comptabilité (l'écriture visée, par sa
-- référence métier), RECALCULER ligne à ligne, SONDER la base, et demander le
-- justificatif de CHAQUE taux/formule par le circuit de requêtes habituel.
-- La procédure ESTIM existait au catalogue ; le parcours n'existait pas.
--
-- Le montant comptabilisé n'est PAS stocké : il se dérive de l'écriture visée
-- (piece_ref) sur le grand livre ACTIF — un ré-import du grand livre change
-- l'écart affiché sans qu'une copie stockée puisse mentir (statuts dérivés).

create table estimation (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  titre text not null,
  -- l'écriture comptable visée, par référence métier (survit aux ré-imports)
  piece_ref text not null,
  -- les libellés de colonnes tels que le FICHIER DU CLIENT les nomme
  libelles jsonb not null,
  base_total numeric(18,2) not null,
  declare_total numeric(18,2) not null,
  recalcul_total numeric(18,2) not null,
  source_evidence_id uuid not null references evidence(id),
  statut text not null default 'importee' check (statut in ('importee','tiree','demandee')),
  seed text,
  request_id uuid references request(id),
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, piece_ref)
);

create table estimation_ligne (
  id uuid primary key default gen_random_uuid(),
  estimation_id uuid not null references estimation(id) on delete restrict,
  seq int not null,
  cle text not null,
  base numeric(14,3) not null,
  taux numeric(14,4) not null,
  declare numeric(18,2) not null,
  recalcul numeric(18,2) not null,
  conforme boolean not null,
  retenu boolean not null default false,
  motif text check (motif in ('high_value','risk_flag','random')),
  request_item_id uuid references request_item(id),
  unique (estimation_id, cle)
);

create table estimation_parametre (
  id uuid primary key default gen_random_uuid(),
  estimation_id uuid not null references estimation(id) on delete restrict,
  nom text not null,
  valeur text not null,
  request_item_id uuid references request_item(id),
  unique (estimation_id, nom)
);

create index idx_estimation_eng on estimation(engagement_id);
create index idx_estimation_ligne on estimation_ligne(estimation_id);
