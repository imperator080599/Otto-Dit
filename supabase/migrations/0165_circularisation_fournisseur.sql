-- 0165 — LA CIRCULARISATION GÉNÉRALISÉE AUX FOURNISSEURS (Lot 5, poste 4).
--
-- `confirmation_campaign.kind` (0030) ne portait que 'banque' et 'avocat' —
-- les deux natures du mandat d'origine. Le poste Fournisseurs (TRADE_PAYABLES,
-- Lot 5 poste 4) commande FOURN-CIRC (confirmation_externe) sur ce dossier,
-- mesuré par exécution (requiredProcedures), et une confirmation de solde
-- fournisseur suit EXACTEMENT le même mécanisme qu'une confirmation de solde
-- bancaire (montant confirmé, tout écart se dit) — pas celui d'un cabinet
-- d'avocat (litiges, seuil CTT). C'est de la MÉCANIQUE (règle 9 de CLAUDE.md :
-- contenu et configuration, jamais une bifurcation de code), pas un contenu
-- de procédure neuf : aucune norme, aucun seuil, aucune table n'est ajoutée
-- ici — seule la troisième valeur que `kind` peut porter.
--
-- Étendue au CODE, pas seulement à la colonne : `circularisations.ts` rekeys
-- son discriminant binaire de `kind === 'banque'` à `kind !== 'avocat'` —
-- banque ET fournisseur partagent désormais le même comportement (montant
-- confirmé, tout écart remonte), avocat reste seul sur le sien (litiges,
-- seuil CTT). Cette tranche touche le modèle de données ET du code de refus
-- (règle 30) : soumise à deux réfutateurs indépendants avant expédition, pas
-- seulement décrite comme telle ici — le compte rendu de leurs constats et
-- des correctifs vit dans STATUS.md et docs/BACKLOG_REPORTE.md (R96), jamais
-- dans ce commentaire, pour ne pas affirmer ici une vérification que le
-- fichier lui-même ne peut pas prouver avoir eu lieu (règle 13).
--
-- LIMITE CONNUE, NON RÉSOLUE PAR CETTE MIGRATION (R96) : `TRADE_PAYABLES` ne
-- porte qu'UN SEUL compte collectif au grand livre, partagé par tous les
-- fournisseurs — contrairement à banque (un compte par tiers) et avocat (un
-- seul cabinet sur ce dossier). Le rapprochement générique compare le solde
-- d'un tiers au solde ENTIER du compte : voir le commentaire dans
-- `circularisations.ts` près de `rapprochement()`/`completude()`.

alter table confirmation_campaign drop constraint confirmation_campaign_kind_check;
alter table confirmation_campaign add constraint confirmation_campaign_kind_check
  check (kind in ('banque','avocat','fournisseur'));
