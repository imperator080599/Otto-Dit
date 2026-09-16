-- 0167 — LE FILET MANQUANT SUR `owner_contact_id`/`due_date` (Lot 7, H-2 slice 2, revue hostile
-- voix 1, réfutateur indépendant, règle 30).
--
-- 0166 a ajouté `request_item.owner_contact_id`/`due_date` sans contrainte `check` — la garde
-- « seul un point d'action client (kind='explanation', exception_id non nul) peut porter un
-- propriétaire/une échéance » vivait UNIQUEMENT dans `assignerProprietairePointAction`
-- (matching.ts). Reproduit en exécution par la revue hostile : une mutation SQL directe hors de
-- ce chemin (`update request_item set owner_contact_id = …, due_date = … where kind = 'document'`)
-- était ACCEPTÉE sans erreur par la base. Le même fichier de migrations porte pourtant un
-- précédent direct pour l'inverse : `engagement_contact_domaine_coherent`
-- (0023_reunions.sql:18-19) pose exactement ce genre de contrainte same-row. Corrigé ici, jamais
-- en éditant 0166 (règle 26 : jamais éditer une migration appliquée, même pour ajouter une
-- contrainte).
--
-- Inerte aujourd'hui pour le seul chemin applicatif existant (`assignerProprietairePointAction`
-- refuse déjà le même cas en amont) — un filet de sécurité contre un futur service ou un accès
-- direct, pas une correction d'un défaut observable en production.

alter table request_item add constraint request_item_owner_only_for_explanation
  check (kind = 'explanation' or (owner_contact_id is null and due_date is null));
