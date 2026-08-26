-- 0014_assertions_are_method: le jeu d'assertions appartient au cabinet.
--
-- 0012 énumérait les sept assertions dans une contrainte CHECK. C'était le même
-- défaut que l'échelle de risque, un cran plus bas : certains cabinets séparent
-- « présentation » et « informations à fournir », d'autres suivent le découpage
-- PCAOB. Une contrainte de base qui énumère un découpage de MÉTHODE fige la
-- méthode dans le produit.
--
-- CE QUI REMPLACE L'ÉNUMÉRATION EST PLUS STRICT, pas moins : procédures,
-- questions et facteurs sont tous validés contre methodology/assertions.json au
-- CHARGEMENT, donc une divergence entre deux fichiers arrête l'assemblage — ce
-- qu'une contrainte CHECK par table ne pouvait pas voir.
--
-- Ce que la base continue de garantir : une assertion non vide. Le reste est
-- une question de cohérence entre fichiers, et cela se vérifie là où les
-- fichiers sont lus.

alter table fsli_assertion_risk drop constraint fsli_assertion_risk_assertion_check;
alter table fsli_assertion_risk add constraint assertion_is_not_blank
  check (btrim(assertion) <> '');

comment on column fsli_assertion_risk.assertion is
  'Code du jeu d''assertions du cabinet (methodology/assertions.json). La cohérence est vérifiée au chargement de la méthode, pas par une énumération figée ici.';
