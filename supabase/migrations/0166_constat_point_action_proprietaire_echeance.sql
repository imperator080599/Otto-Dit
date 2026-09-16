-- 0166 — H-2 SLICE 2 : PROPRIÉTAIRE ET ÉCHÉANCE PROPRES AU POINT D'ACTION CLIENT.
--
-- Lot 7, H-2 (docs/REGISTRE_IDEES.md ligne 270 : « le cycle de vie du constat vis-à-vis du
-- client — propriétaire, échéance, état, relance »). La slice 1 (commit 4e60d9b) a affiché
-- « état » (exception.status vs request_item.status, déjà distincts). Il manquait
-- « propriétaire » et « échéance » PROPRES au point d'action — H-1 slice 2 (obstaclesDemandes)
-- bloque déjà au grain de la DEMANDE entière (request.due_date), jamais au grain du constat
-- individuel.
--
-- DÉCISION (recherche préalable, sous-agent, disclosed dans STATUS.md) : ÉTENDRE `request_item`
-- directement plutôt que réhabiliter `followup`. `followup` (0002_testing.sql) est un DÉCOR —
-- deux usages dans tout le dépôt, `approved_by` toujours NULL, aucun SELECT nulle part, aucune
-- politique RLS, les états `approved`/`sent` de son propre `check` jamais atteints. La
-- réhabiliter demanderait de lui donner `engagement_id` (absent), sa RLS, ET tout son chemin de
-- lecture/écriture — un mécanisme mort à reconstruire de zéro derrière un nom déjà occupé.
-- `request_item`/`request`/`approveSend` est le mécanisme RÉELLEMENT vivant (H-1 tout entier s'y
-- appuie) : l'étendre est une extension de règle 9 (mécanique, jamais une bifurcation), pas une
-- nouvelle mécanique. `followup` reste un décor non retiré (règle 26 interdit d'éditer une
-- migration appliquée, pas de laisser tomber une table) — disclosed R-nn (BACKLOG_REPORTE.md).
--
-- `owner_contact_id` référence `client_contact` (jamais `engagement_contact`, un contact
-- CABINET) — le propriétaire d'un point d'action client est, par construction, quelqu'un côté
-- ENTITÉ. NULL par défaut : assigner un propriétaire est un geste humain, jamais déduit.
-- `due_date` NULL par défaut, même raison que `request.due_date` (requests.ts) : une échéance
-- non posée n'est jamais bloquante par défaut.

alter table request_item add column owner_contact_id uuid references client_contact(id);
alter table request_item add column due_date date;
