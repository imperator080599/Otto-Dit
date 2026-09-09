-- CORRECTIF DE PRODUCTION, 2026-09-09 — RLS/verrou manquants sur
-- control_population_reconciliation (0153).
--
-- INCIDENT. 0153 a été appliquée à la base réseau par son PREMIER build d'aperçu (c654f40,
-- 2026-09-09 08:48:00Z), dans sa forme d'ORIGINE — sans `engagement_id`, sans garde de verrou,
-- sans RLS. Le déploiement s'est arrêté au bloc d'assertions rôle/RLS de `deploy:reconstruire`
-- (« 2 défaut(s) de couverture RLS ») — le garde a fonctionné, règle 17. Une session a ensuite
-- ÉDITÉ 0153 EN PLACE (a9e88ef) pour ajouter ce qui manquait, en jugeant — à tort — que la règle
-- 26 (« on n'édite pas une migration appliquée ») ne s'appliquait pas puisque « servi en
-- production » n'avait jamais eu lieu (le premier `deploye` avait rougi). Cette édition corrige
-- une base FRAÎCHE (`db:reset` part toujours de zéro) mais NE FAIT RIEN à la base réseau, qui
-- garde la table dans sa forme d'origine en PERMANENCE : `migrate()` reconnaît 0153 par son NOM
-- dans `_migrations`, ne la rejoue jamais, et refuserait même de continuer si son empreinte ne
-- correspondait plus au fichier sur disque (`MigrationEditee`) — CE QUE 0153-ÉDITÉE AURAIT DÛ
-- DÉCLENCHER À CHAQUE DÉPLOIEMENT SUIVANT, et qui explique à lui seul pourquoi les cinq
-- déploiements suivants (a9e88ef, 3659901, 7395e55, 409e1b7…) sont TOUS restés en ERROR — même
-- classe d'aveuglement structurel que l'incident daf18e0 : une branche déjà semée (ici, déjà
-- MIGRÉE) que le harnais local, qui repart toujours de zéro, ne peut jamais exercer.
--
-- CORRECTION. 0153 est REVENUE À SON CONTENU D'ORIGINE, octet pour octet — vérifié : son
-- empreinte SHA-256 est de nouveau `8f603898315493405d3ac97e7cee6d880fcc3ed52515209f2b4a220b70b548f6`,
-- IDENTIQUE à celle enregistrée dans `_migrations` sur la base réseau (confirmé par
-- `mcp__Supabase__execute_sql` avant d'écrire ce fichier, jamais supposé). `migrate()` ne verra
-- donc plus jamais 0153 comme éditée. TOUT ce qui manquait vient ICI, en ALTER — sur une base
-- FRAÎCHE (où 0153 vient de créer la table sans RLS) comme sur la base RÉSEAU (où elle existe
-- déjà, vide, dans la même forme) : les deux convergent sur EXACTEMENT le même geste.
--
-- `engagement_id` DÉNORMALISÉ (comme `control_task_procedure`, 0148, PAS comme `account_detail_row`,
-- 0144) : `assert_engagement_unlocked()` (0003) lit `NEW.engagement_id` littéralement, jamais par
-- jointure, et `rapprocherPopulationControle` écrit dans une transaction séparée de la création de
-- la population — le précédent d'`account_detail_row` (protégée par le verrou de son PARENT, née
-- dans la MÊME transaction) ne s'applique pas ici.
--
-- Backfill défensif avant le NOT NULL : la table est VIDE en production au moment de ce correctif
-- (vérifié), mais le geste reste celui qu'on ferait sur une table peuplée — jamais un NOT NULL nu
-- sur une hypothèse.
alter table control_population_reconciliation add column engagement_id uuid references engagement(id) on delete restrict;
update control_population_reconciliation r
  set engagement_id = c.engagement_id
  from control c
  where c.id = r.control_id and r.engagement_id is null;
alter table control_population_reconciliation alter column engagement_id set not null;

-- LA GARDE DE VERROU (0003) ET SON VERDICT (0042) : le rapprochement de la population d'OE est du
-- contenu du dossier — rien ne s'y écrit après le scellé, même précédent qu'account_detail_import.
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
