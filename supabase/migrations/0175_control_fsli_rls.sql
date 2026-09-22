-- 0175 — correctif RLS pour `control_fsli`, RE-PORTÉ EN AVANT (règle 26).
--
-- INCIDENT, consigné ici et dans docs/BACKLOG_REPORTE.md (R145) : 0174 a été appliquée à la base
-- RÉSEAU de démonstration par un déploiement d'APERÇU (commit 84f3123, mesuré : `_migrations`
-- porte son empreinte, `applied_at` 2026-09-22 18:02:11 UTC) SANS le bloc RLS pour `control_fsli`
-- — ce bloc n'a été écrit que dans un commit SUIVANT (f336d85), en éditant 0174 EN PLACE après
-- son application. Exactement l'erreur que règle 26 existe pour interdire (le même mécanisme que
-- 0153/0154 et R143, dans la MÊME tranche où R143 a été corrigé). `migrate()` a refusé, comme
-- conçu, tous les déploiements suivants avec « 1 migration(s) ÉDITÉE(S) APRÈS APPLICATION :
-- 0174_processus_et_controles.sql » (mesuré sur les build logs Vercel des commits f336d85 et
-- 4512776) — jamais rejoué en silence. 0174 a été restaurée OCTET POUR OCTET à son contenu
-- `84f3123` (empreinte vérifiée identique à celle de `_migrations` sur la base réseau par une
-- requête directe : `787fb257...b43b6` — jamais supposée) ; le correctif RLS est ici, en avant,
-- idempotent au sens où il ne s'applique qu'une fois (comme toute migration).
--
-- Vérifié directement contre la base réseau avant d'écrire ce fichier (jamais une inférence
-- depuis un statut de déploiement, règle 26) : `control_fsli` y existe (créée par 0174 d'origine)
-- mais `relrowsecurity`/`relforcerowsecurity` = false, 0 ligne dans `pg_policies` — la fenêtre
-- d'exposition (table multi-tenant sans RLS) n'a jamais été SERVIE par un déploiement RÉUSSI
-- (tous ERROR depuis 84f3123, aucun n'a atteint `next build`/l'alias de production), mais elle
-- existait bel et bien dans le schéma de la base de démonstration partagée.
--
-- CORRECTIF DE DOCUMENTATION, consigné ici puisque 0174 est désormais immuable : son commentaire
-- juste avant le backfill `update control c set process_model_id = pm.id ...` affirme « le
-- rattachement réel se fera par un geste explicite (lierControleAuPoste, service P1-03) » — FAUX
-- tel qu'implémenté (constat REFUT2-03, revue hostile voix 2) : `lierControleAuPoste` écrit
-- exclusivement `control_fsli` (control↔poste/assertions), JAMAIS `control.process_model_id`
-- (control↔process_model — un lien différent, que 0174 elle-même distingue dans son point 3
-- d'en-tête). `control.process_model_id` reste donc une colonne posée, backfillée une fois
-- (NO-OP mesuré), jamais relue ni réécrite par aucun chemin applicatif aujourd'hui — dit
-- honnêtement ici plutôt que de laisser l'affirmation d'origine, qui décrit un mécanisme qui
-- n'existe pas.

alter table control_fsli enable row level security;
alter table control_fsli force row level security;

create policy control_fsli_eng on control_fsli using (exists (
  select 1 from control p where p.id = control_fsli.control_id
    and p.engagement_id in (select otto_engagements())));
