-- 0028 — LE MAGASIN DE PIÈCES EN BASE (ADR-109, P0a).
--
-- En local, les octets des pièces vivent sur le disque (app/.data/blobs,
-- adressés par contenu). Sur un déploiement serverless, le disque est
-- éphémère et par instance : les octets doivent vivre dans un substrat
-- durable. Pour la DÉMO déployée, ils vivent ICI, dans Postgres
-- (OTTO_STORAGE=db) — un seul substrat, un seul identifiant, les mêmes
-- sauvegardes. Le bucket Supabase Storage reste la voie « échelle
-- production » du runbook (DEPLOY.md) : des pièces par gigaoctets n'ont
-- rien à faire dans une table.
--
-- Adressé par contenu comme le disque : même clé (aa/sha256), jamais de
-- mutation — le ré-envoi d'un contenu identique retombe sur la même ligne.

create table blob_store (
  storage_path text primary key,
  sha256 text not null,
  size int not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
