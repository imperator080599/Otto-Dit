-- P2-01 (AUD-04) — le tirage du contrôle de fiabilité (ADR-012.3) n'était porté QUE par le
-- payload de l'événement `verification_run_started` (event_log) : `submitBlindCheck` n'avait
-- donc aucun moyen de vérifier, dans une requête SQL directe, que `sample_item_id` appartient
-- réellement au tirage du run désigné — la seule façon de le savoir était de relire event_log,
-- ce que `submitBlindCheck` ne faisait pas (trouvé par la recherche de P2-01 : aucune garde
-- d'étanchéité sur cette fonction). `selected` devient une colonne de `verification_run`
-- elle-même, posée par `startVerificationRun` dans le MÊME insert que le reste du tirage —
-- `event_log` garde sa ligne (aucune migration ne touche l'historique déjà écrit, règle 26),
-- mais `currentVerificationRun`/`submitBlindCheck` lisent désormais la colonne, pas l'événement.

alter table verification_run add column selected jsonb not null default '[]'::jsonb;
