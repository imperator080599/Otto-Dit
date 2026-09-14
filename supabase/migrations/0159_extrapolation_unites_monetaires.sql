-- §1.2-1.3 (mandat 2026-09-14, extrapolation ISA 530) : `sample_evaluation.projection_method`
-- (0002_testing.sql) n'admettait que 'ratio'/'difference'/'none' — la troisième méthode du
-- mandat, `unites_monetaires` (la forme cohérente avec le tirage déjà en place, Partie B étape 4 :
-- unités monétaires, germe), n'a jamais eu de valeur possible dans la colonne. Élargie ici ;
-- aucune ligne existante n'utilise cette valeur (aucun code ne l'écrivait avant cette tranche),
-- donc pas de migration de données.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle n'ajoute AUCUNE colonne de paramètre de
-- cabinet — le choix de méthode vit dans `methodology`/`packs/types.ts` (`extrapolationMethod`,
-- `undefined` = non vérifié, même forme que `videoRetentionDays`), jamais dans la base ; cette
-- migration touche uniquement la forme que `projection_method` peut prendre UNE FOIS le choix
-- posé et une évaluation calculée. Elle ne câble aucun refus (EXTRAP-01/02/04) — ça vit dans
-- `evaluation.ts`, testable, pas en SQL.
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'sample_evaluation'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%projection_method%';
  if cname is not null then
    execute format('alter table sample_evaluation drop constraint %I', cname);
  end if;
  execute $sql$alter table sample_evaluation add constraint sample_evaluation_projection_method_check
    check (projection_method in ('unites_monetaires','ratio','difference','none'))$sql$;
end $$;
