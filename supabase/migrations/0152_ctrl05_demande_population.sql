-- LOT CONTRÔLE INTERNE, §3.1 (mandat 2026-09-08), TRANCHE 5 — CTRL-05.
--
-- « Atteindre le tirage d'OE d'un contrôle `as_needed` sans qu'une demande client de la
-- population des occurrences existe. » (`as_needed` = `adhoc`/`many_daily` dans ce dépôt, aucune
-- autre valeur de `Frequency` n'existe pour ce concept — voir sox.ts, FREQUENCES_DERIVABLES.)
-- « Cette demande RÉUTILISE le mécanisme de la Partie B : `client_request` typée, destinataire
-- déduit, lien cliquable vers l'espace de demandes. Aucun chemin neuf, aucun formulaire
-- parallèle. » — `request`/`request_item` SONT ce mécanisme (il n'existe aucune table
-- `client_request` littérale dans ce schéma) ; `request.control_id` est la seule pièce manquante
-- pour retrouver « la demande de ce contrôle », même patron que `request.fsli_code` (0143) pour
-- « la demande de ce poste ».
--
-- FK PLEINE (contrairement à `fsli_code`, DÉLIBÉRÉMENT sans FK dans 0143) : `control` n'est
-- JAMAIS supprimé ni recréé en masse par `importRcm` (un simple insert, pas un delete+insert
-- comme `rebuildFslis` pour `fsli`) — une FK est donc sûre ici, et corrige plutôt que répète le
-- trou déjà nommé pour `procedure_instance.control_id` (R66, BACKLOG_REPORTE.md).
alter table request
  add column control_id uuid references control(id) on delete restrict;

create index request_control_idx on request (engagement_id, control_id) where control_id is not null;
