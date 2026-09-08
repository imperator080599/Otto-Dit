-- 0147 — LOT 4, TRANCHE 1 : LA DÉPLANIFICATION D'UNE PROCÉDURE (mandat,
-- Partie D.1, « Lot 4 — L'épure … et les écrans qui manquent : … déplanification
-- d'une procédure … »).
--
-- `planifierProcedure` (programme.ts) n'avait AUCUN contre-geste : une fois
-- planifiée, une procédure ne pouvait plus jamais redevenir « non planifiée »
-- par un geste humain — seul un changement de RISQUE la faisait glisser vers
-- « hors commande » (Lot 3, tranche 2), jamais une décision directe de
-- l'auditeur (« je me suis trompé de procédure », « celle-ci fait doublon »).
--
-- TROIS COLONNES, JAMAIS UN `delete` (règle 28 — un recalcul ou une décision
-- humaine ne détruit ni n'invalide jamais en silence du travail humain, et les
-- données produites par l'agent ne sont jamais supprimées par le système) :
-- `deplanned_at`/`deplanned_by`/`deplanned_motif` marquent la ligne SANS
-- l'effacer — son papier, ses visas, ses pièces restent atteignables par leur
-- lien, exactement comme une ligne « hors commande » reste visible plutôt que
-- disparaître (même philosophie, Lot 3 tranche 2). Une procédure déplanifiée
-- REDEVIENT planifiable : `planifierProcedure` crée alors une ligne NEUVE
-- (jamais une réanimation de l'ancienne, qui resterait un témoin honnête de
-- ce qui s'est passé — même discipline que le re-tirage, ADR-133).
--
-- Toutes trois NULLABLES, toutes trois posées ENSEMBLE ou pas du tout —
-- jamais l'une sans les autres (la lecture /api/sante de cette tranche vérifie
-- précisément cette cohérence, pas seulement l'existence des colonnes).

alter table procedure_instance add column deplanned_at timestamptz;
alter table procedure_instance add column deplanned_by uuid references app_user(id);
alter table procedure_instance add column deplanned_motif text;
