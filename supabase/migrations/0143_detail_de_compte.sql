-- 0143 — LE CYCLE DE TESTING COMPLET, ÉTAPE 1 : LE DÉTAIL DU COMPTE (plan
-- d'autonomie du fondateur, Partie B). Une colonne de test sera liée à un
-- type de pièce, un type de pièce à une demande (B.1) ; cette migration ne
-- pose que ce qu'Étape 1 exige : la demande du détail nait DU poste, pas
-- d'une saisie, et elle sait de quel type de pièce et de quel poste elle
-- parle. Les étapes suivantes (rapprochement, population dérivée, POP-01)
-- viennent dans une migration ultérieure, une fois celle-ci prouvée au clic.

alter table request
  add column evidence_type_code text,
  add column fsli_code text;

-- Même choix que procedure_instance.fsli_code (0001_core.sql) : PAS de clé
-- étrangère vers fsli, dont la clé naturelle est (engagement_id, code) et
-- dont les lignes sont recréées par rebuildFslis (delete + insert) — une FK
-- casserait à chaque recalcul du périmètre. L'appartenance au dossier se
-- vérifie par la requête, pas par la contrainte.
create index request_fsli_idx on request (engagement_id, fsli_code) where fsli_code is not null;
