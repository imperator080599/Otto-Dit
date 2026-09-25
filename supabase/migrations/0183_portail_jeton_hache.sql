-- 0183 — LE JETON PORTAIL, HACHÉ ET EXPIRANT (P2-03b, AUD-07, plan §7.9).
--
-- AVANT CETTE MIGRATION : `client_contact.portal_token` était comparé EN CLAIR,
-- à la fois par `core/auth.ts::portalSession` (requête SQL directe) et par
-- `otto_portal_contact()` (0141, SECURITY DEFINER) — une fuite de la colonne
-- (sauvegarde, journal de requêtes) rendait chaque jeton client directement
-- utilisable, et un jeton, une fois posé, ne périmait jamais.
--
-- CE QUE CETTE MIGRATION AJOUTE : `portal_token_hash` (l'empreinte sha256 hex du
-- jeton, calculée EN TYPESCRIPT — `core/jeton-portail.ts::hacherJetonPortail` —
-- jamais en SQL : PGlite ne porte pas pgcrypto de façon fiable, aucune migration
-- de ce dépôt n'appelle `digest()`), `expires_at` (null = n'expire jamais, le cas
-- du contact de démonstration), `rotated_at` (traçabilité d'une rotation future,
-- non exploitée ici).
--
-- `portal_token` (en clair) N'EST PAS RETIRÉE ICI — le plan la garde jusqu'en
-- Phase 7 (§7.9) : cette migration change QUI LA LIT à des fins
-- D'AUTHENTIFICATION, pas le schéma final. Après cette tranche, plus aucun
-- CODE ne COMPARE `portal_token` pour authentifier un jeton — mais des
-- harnais de démonstration LISENT encore la colonne en clair, légitimement
-- (affichage, balayage de production, jamais une comparaison) : `scripts/
-- clics/contexte.ts`, `scripts/demo/infos.ts`, `scripts/screens/routes.ts`.
-- Affirmation corrigée après mesure (revue hostile P2-03b, V2-02) — une
-- version antérieure de ce commentaire disait « plus aucun CODE ne lit »,
-- ce qui était faux ; cette ligne ne se réédite plus une fois la migration
-- appliquée (règle 26), donc corrigée maintenant plutôt que jamais.
--
-- `otto_portal_contact()` (0141) comparait `c.portal_token` au réglage de
-- session posé par `withJeton()`. `withJeton()` pose désormais le HACHAGE du
-- jeton (jamais le jeton en clair) dans `otto.portal_token` — la fonction SQL
-- n'a donc JAMAIS besoin de calculer un sha256 elle-même : la comparaison reste
-- une égalité de chaîne pure, comme avant, seulement sur la colonne hachée. Elle
-- exclut désormais aussi un jeton EXPIRÉ (`expires_at`), ce qu'elle ne faisait
-- pas du tout avant cette migration — la garde le plus bas niveau (RLS) était
-- donc aveugle à l'expiration tant que seul `portalSession` (côté application)
-- la vérifiait ; une action posée directement via `withJeton()` (dépôt de
-- pièces, réponse à une clarification) après expiration du lien passait malgré
-- le refus déjà rendu au client sur l'ÉCRAN — corrigé ici, au même niveau que
-- la lecture.
--
-- BACKFILL : `portal_token_hash` reste NULLABLE (comme `sections_hash`, 0176) —
-- aucun calcul sha256 fiable en SQL pur sur PGlite. `lib/seed.ts` pose
-- désormais le hachage à la création des contacts de démonstration (arbre
-- FRAÎCHE, le cas courant de ce dépôt — règle 2, données synthétiques
-- uniquement, aucune base réelle à faire migrer). `scripts/backfill-portal-
-- token-hash.ts` (nouveau, hors `migrate()`, même patron que
-- `backfill-signoff-hash.ts`) referme le cas d'une base PERSISTANTE qui
-- porterait encore une ligne `portal_token_hash is null` — un filet, pas un
-- chemin attendu sur ce dépôt (la démonstration publique est reconstruite à
-- chaque déploiement, ADR-109).

alter table client_contact
  add column if not exists portal_token_hash text unique,
  add column if not exists expires_at timestamptz,
  add column if not exists rotated_at timestamptz;

create or replace function otto_portal_contact() returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from client_contact c
  where c.portal_token_hash = nullif(current_setting('otto.portal_token', true), '')
    and c.active
    and (c.expires_at is null or c.expires_at > now())
$$;
