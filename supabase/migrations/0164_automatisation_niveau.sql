-- 0164 — mandat 2026-09-14, §2 : le degré d'automatisation de l'agent IA
-- (L0-L3, AUTO-01/AUTO-02).
--
-- DEUX COLONNES, DEUX RÔLES DISTINCTS :
--   - `engagement.automation_level` : le RÉGLAGE de la mission, réglable
--     UNIQUEMENT vers le bas par rapport au plafond du pack (jamais au-delà
--     de L2, plafond permanent du projet — le service `automatisation.ts`
--     le refuse, AUTO-01). NULL = « hérite du plafond du pack ». Jamais
--     'L3' — la colonne l'exclut à la racine, le refus n'a jamais besoin de
--     s'exercer contre une valeur qu'elle ne peut pas recevoir.
--   - `ai_run.niveau_automatisation` : la DONNÉE immuable de PRODUCTION —
--     le niveau réellement en vigueur à l'INSTANT où CET élément précis a
--     été produit (§2.3). NOT NULL, SANS DÉFAUT : tout futur chemin qui
--     insère dans `ai_run` sans le fournir échoue à l'écriture — c'est la
--     défense en profondeur d'AUTO-02, la même forme que
--     `deficiency_magnitude_is_justified` (0009) refuse déjà un statut sans
--     sa justification. Baisser le niveau plus tard ne réécrit JAMAIS cette
--     colonne : l'historique reste lisible sous le régime où il est entré.

alter table engagement add column automation_level text
  check (automation_level in ('L0', 'L1', 'L2'));

alter table ai_run add column niveau_automatisation text
  check (niveau_automatisation in ('L0', 'L1', 'L2'));
update ai_run set niveau_automatisation = 'L2' where niveau_automatisation is null;
alter table ai_run alter column niveau_automatisation set not null;
