-- 0173 — CORRECTIF RÈGLE 26 : le fix de sécurité FK sur le backfill `materiality` de 0170 était
-- édité EN PLACE dans 0170_proposition.sql (commit 22f93dc, revue hostile de P1-01), qui avait
-- déjà été APPLIQUÉE à la base réseau de démonstration par un déploiement d'APERÇU antérieur
-- (commit ea98c68) — `migrate()` a correctement refusé de continuer au déploiement de P1-02
-- (« 1 migration(s) ÉDITÉE(S) APRÈS APPLICATION : 0170_proposition.sql »), exactement le garde-fou
-- que règle 26 pose depuis l'incident 0153/0154. 0170_proposition.sql est restauré ICI (même
-- commit) à son contenu EXACT d'ea98c68 (empreinte vérifiée identique par `git diff`) ; ce fichier
-- porte le correctif EN AVANT, comme règle 26 l'exige.
--
-- CE QUE 0170 FAISAIT, SANS CE CORRECTIF : `insert into proposition (..., ai_run_id, ...) select
-- ..., m.proposed_by_ai_run, ...` — `materiality.proposed_by_ai_run` (0001_core.sql) ne porte
-- AUCUNE contrainte FK, donc rien ne garantissait qu'une valeur qui s'y trouve pointe encore vers
-- une ligne `ai_run` réelle ; `proposition.ai_run_id`, lui, EST contraint (`references ai_run(id)`)
-- — une valeur orpheline aurait fait échouer l'INSERT (et donc toute la migration 0170, sur PGlite
-- comme sur node-postgres depuis P1-00, transactionnel par fichier).
--
-- CE CORRECTIF NE RÉPARE AUCUNE DONNÉE EXISTANTE : le backfill de 0170 (idempotent, `not exists`)
-- a déjà tourné sur toute base qui porte 0170 dans `_migrations` — sur la base réseau de
-- démonstration, l'INSERT original (non sécurisé) a RÉUSSI, ce qui prouve qu'aucune valeur
-- orpheline n'existait dans `materiality.proposed_by_ai_run` à ce moment-là (une valeur orpheline
-- aurait fait échouer l'INSERT, jamais laissé une ligne `ai_run_id` invalide en place). L'UPDATE
-- ci-dessous est donc un NO-OP mesuré sur toute base connue de ce dépôt — un filet de sécurité
-- pour une base FUTURE, jamais une réparation d'un défaut observé (règle 13 : n'affirme jamais
-- plus que ce qui est vérifié).
update proposition p
set ai_run_id = null,
    source_kind = case when p.source_kind = 'ai_run' then 'engine_run' else p.source_kind end
where p.object_type = 'materiality'
  and p.ai_run_id is not null
  and not exists (select 1 from ai_run a where a.id = p.ai_run_id);
