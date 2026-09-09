-- LOT CONTRÔLE INTERNE, §3.1 (mandat 2026-09-08) : LA POPULATION D'OCCURRENCES.
--
-- Pour une fréquence RÉGULIÈRE (annuelle, trimestrielle, mensuelle, hebdomadaire, quotidienne),
-- la population d'occurrences OE se DÉRIVE de la fréquence et de la période — le système la
-- calcule, aucune demande client n'est nécessaire. `control_instance.source` n'avait que
-- 'listing' (import CSV du client) et 'evidence' — cette migration ajoute 'derived', la valeur
-- posée par `deriverPopulationControle` (sox.ts). Même patron que 0150 sur `risk.source` : le nom
-- de la contrainte auto-générée par 0002 n'est jamais supposé, recherché dans `pg_constraint`.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle ne crée aucune table de rapprochement
-- (CTRL-04, tranche suivante) ni aucune colonne sur `request` pour la demande client d'un
-- contrôle `adhoc`/`many_daily` (CTRL-05, après). Elle ne dérive rien elle-même — c'est du SQL,
-- pas la logique de date, qui vit dans `sox.ts` où elle est testable.
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'control_instance'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%';
  if cname is not null then
    execute format('alter table control_instance drop constraint %I', cname);
  end if;
  execute $sql$alter table control_instance add constraint control_instance_source_check
    check (source in ('listing','evidence','derived'))$sql$;
end $$;
