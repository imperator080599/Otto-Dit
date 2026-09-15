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
-- son discriminant binaire de `kind === 'banque'` à `kind === 'avocat'` —
-- banque ET fournisseur partagent désormais le même comportement (montant
-- confirmé, tout écart remonte), avocat reste seul sur le sien (litiges,
-- seuil CTT). Vérifié par exécution avant et après que banque/avocat ne
-- changent pas (revue hostile, deux voix — règle 30, cette migration touche
-- le modèle de données ET du code de refus).

alter table confirmation_campaign drop constraint confirmation_campaign_kind_check;
alter table confirmation_campaign add constraint confirmation_campaign_kind_check
  check (kind in ('banque','avocat','fournisseur'));
