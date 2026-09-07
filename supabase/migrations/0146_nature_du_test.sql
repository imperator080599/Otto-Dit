-- 0146 — LOT 3, TRANCHE 1 : LA NATURE DU TEST (plan d'autonomie du fondateur,
-- Partie C.1). « Le produit ne connaît aujourd'hui qu'une seule façon de
-- tester : sonder des pièces. C'est ce qui bloque tous les autres postes. »
--
-- `procedure_instance` gagne `nature` — un axe DIFFÉRENT de `kind`
-- (substantive/control_test/analytical, la PLACE de la procédure dans le
-- programme) et de `sens` du catalogue (gl_vers_piece/piece_vers_gl/…, la
-- DIRECTION de la preuve) : `nature` dit la FORME de l'atelier qui
-- l'exécute — ce qu'il demande, ce qu'il affiche, ce qui y constitue un
-- écart (mandat, table C.1). `RAPPRO` en est la preuve la plus nette :
-- `sens: recalcul`, `nature: rapprochement` — les deux axes divergent
-- légitimement, methodology/procedures.json v1.4.0 porte désormais les deux
-- pour ses 56 procédures (classification faite à la main, procédure par
-- procédure, jamais copiée depuis `sens`).
--
-- HUIT VALEURS, closes ici comme dans le catalogue (methodology/schema.json,
-- app/src/lib/methodology/types.ts::NatureDeTest) : la nature est un concept
-- PRODUIT fixe, pas une donnée de méthode de cabinet (contrairement à
-- l'assertion ou au niveau de risque, qui vivent en JSON parce qu'ils
-- varient par cabinet) — une chaîne bornée par CHECK est donc juste ici,
-- alors qu'elle ne le serait pas pour `kind` de méthode.
--
-- DEFAULT 'sondage_pieces', PAS NULL : la seule nature qui a aujourd'hui un
-- atelier réel (le cycle de testing du chiffre d'affaires, Lot 2) est aussi
-- la plus commune dans le catalogue (16 procédures sur 56) — un défaut
-- honnête, jamais une devinette, pour les lignes déjà en base et pour les
-- fixtures de test qui créent une procedure_instance sans se soucier de sa
-- nature. Les TROIS points d'écriture réels (programme.ts::planifierProcedure,
-- sampling.ts::ensureRevenueProcedure, sox.ts) posent leur propre valeur
-- EXPLICITEMENT dans le même commit — jamais en s'appuyant sur ce défaut en
-- silence (règle 13).
--
-- PAS DANS CETTE MIGRATION, et volontairement : aucun contenu de procédure
-- NOUVEAU (règle 14, périmètre gelé — la classification ci-dessus porte sur
-- des procédures qui existaient déjà dans le catalogue avant ce jour) ; aucun
-- atelier pour les natures autres que sondage_pieces (Lot 3, tranches
-- suivantes) ; aucune ouverture de poste au-delà du chiffre d'affaires
-- (Partie C.3, Lot 5) — cette tranche pose la MÉCANIQUE (« la mécanique est
-- le produit », règle 14) que ces lots ultérieurs consommeront.

alter table procedure_instance add column nature text not null default 'sondage_pieces'
  check (nature in (
    'sondage_pieces', 'recalcul_parametre', 'confirmation_externe',
    'revue_analytique_substantive', 'test_exhaustif', 'tests_de_controles',
    'rapprochement', 'observation_documentee'
  ));
