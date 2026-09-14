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
--     été produit (§2.3). NOT NULL, SANS DÉFAUT pour tout INSERT à venir :
--     tout futur chemin qui insère dans `ai_run` sans le fournir échoue à
--     l'écriture — c'est la défense en profondeur d'AUTO-02, la même forme
--     que `deficiency_magnitude_is_justified` (0009) refuse déjà un statut
--     sans sa justification. Baisser le niveau plus tard ne réécrit JAMAIS
--     cette colonne : l'historique reste lisible sous le régime où il est
--     entré.
--
-- PAS D'UPDATE SUR ai_run — CORRIGÉ AVANT TOUTE APPLICATION RÉELLE.
-- ai_run porte un déclencheur append-only depuis 0003 (« table % is
-- append-only », for each row — il ne réagit qu'aux lignes RÉELLEMENT
-- mutées). La première écriture de cette migration faisait `update ai_run
-- set niveau_automatisation = 'L2' where … is null` pour peupler les
-- lignes existantes : verte en local (la base de test y arrive VIDE,
-- l'UPDATE ne touche aucune ligne, le déclencheur ne s'exécute jamais —
-- for each row), ROUGE en production ET en aperçu (ai_run y porte déjà de
-- vraies lignes : le déclencheur a bloqué toute la migration — DEUX
-- déploiements ERROR le 2026-09-14, ai_run le disait dans le journal de
-- build : « table ai_run is append-only »). Confirmé par requête directe
-- sur les deux bases (locale ET réseau) : `_migrations` ne porte AUCUNE
-- ligne pour ce fichier nulle part — le protocole simple de Postgres
-- (plusieurs ordres, un seul message) a annulé tout le lot, colonnes
-- comprises, dès l'échec de l'UPDATE (règle 18/26 : vérifié, pas supposé).
-- Exactement le défaut que règle 11 nomme : un test vert sur un chemin que
-- la production n'emprunte pas ne prouve rien.
--
-- Le correctif : `ADD COLUMN … DEFAULT 'L2'` peuple les lignes EXISTANTES
-- par le mécanisme de défaut rapide de Postgres (métadonnées de catalogue,
-- depuis PG 11 — aucun UPDATE, aucune ligne réécrite, le déclencheur ne
-- voit rien passer), puis `DROP DEFAULT` retire le défaut pour les INSERT
-- à venir : NOT NULL sans défaut continue de s'appliquer à tout nouvel
-- enregistrement, exactement comme voulu.

alter table engagement add column automation_level text
  check (automation_level in ('L0', 'L1', 'L2'));

alter table ai_run add column niveau_automatisation text not null default 'L2'
  check (niveau_automatisation in ('L0', 'L1', 'L2'));
alter table ai_run alter column niveau_automatisation drop default;
