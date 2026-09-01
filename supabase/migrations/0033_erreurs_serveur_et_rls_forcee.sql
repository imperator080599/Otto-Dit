-- 0033 — LES ERREURS SERVEUR ONT UNE TABLE, ET LA RLS EST FORCÉE (Groupe 0 du
-- mandat de nuit, item 106).
--
-- 1. `server_error`. Un écran qui tombe en ligne montre un DIGEST (« Digest:
--    1444035093 ») et rien d'autre : la cause vit dans un journal Vercel que
--    le fondateur ne lit pas. Trois écrans ont rendu 500 pendant une journée
--    avec ce seul chiffre à l'écran. Chaque exception de rendu est désormais
--    ÉCRITE ici par `instrumentation.ts` (crochet `onRequestError` de Next),
--    clé par digest, avec la route, le chemin, la mission, le SHA de la
--    version — et `/api/erreur?digest=…` la rend lisible. Table technique :
--    RLS activée, AUCUNE politique — seul le propriétaire (l'application) y
--    écrit et y lit ; un rôle tiers ne voit rien.
--
-- 2. FORCE ROW LEVEL SECURITY sur chaque table qui porte une politique. Sans
--    FORCE, le PROPRIÉTAIRE de la table contourne la RLS — et c'est le
--    propriétaire qui sert l'application, en local comme en ligne. Aujourd'hui
--    l'application se connecte avec un rôle BYPASSRLS (`postgres` sur
--    Supabase, superutilisateur sous PGlite) : FORCE est donc INERTE pour elle,
--    et c'est dit ainsi dans le bloc d'assertions du build. Ce qu'il change :
--    le jour où l'application passe sous un rôle sans BYPASSRLS (le chantier
--    nommé au registre — elle doit d'abord poser le locataire par transaction),
--    aucune table ne restera ouverte parce qu'elle appartient au rôle. On pose
--    la contrainte AVANT d'en dépendre, pas après.

create table if not exists server_error (
  id uuid primary key default gen_random_uuid(),
  digest text not null,
  route text,
  path text,
  method text,
  engagement_id uuid,
  tenant_id uuid,
  release_sha text,
  message text not null,
  stack text,
  occurred_at timestamptz not null default now()
);
create index if not exists server_error_digest_idx on server_error (digest, occurred_at desc);
create index if not exists server_error_recent_idx on server_error (occurred_at desc);
alter table server_error enable row level security;

do $$
declare
  t text;
begin
  for t in
    select distinct c.relname
    from pg_class c
    join pg_policy p on p.polrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  loop
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
