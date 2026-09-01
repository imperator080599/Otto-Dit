-- 0034 — FORCE ROW LEVEL SECURITY SUR TOUTE TABLE À RLS, pas seulement sur
-- celles qui portent une politique.
--
-- 0033 forçait la RLS là où une politique existe. Le bloc d'assertions du
-- premier build l'a montré du doigt : `server_error` porte un `tenant_id`, une
-- RLS activée, aucune politique (propriétaire-seul) — et pas de FORCE. Le
-- mandat dit « chaque table à tenant_id a relrowsecurity ET
-- relforcerowsecurity », sans exception. Pour une table propriétaire-seul,
-- FORCE veut dire : le jour où l'application passe sous un rôle sans
-- BYPASSRLS, ces tables lui sont FERMÉES jusqu'à ce qu'une politique le dise
-- — c'est le comportement voulu, pas un accident. Aujourd'hui, inerte pour
-- `postgres` (BYPASSRLS) comme pour le superutilisateur de PGlite.

do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
