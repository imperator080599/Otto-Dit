import { createHash } from 'crypto';

// LE HACHAGE DU JETON PORTAIL (P2-03b, AUD-07, plan §7.9).
//
// AVANT CE MODULE : `client_contact.portal_token` était comparé EN CLAIR, à la
// fois par `core/auth.ts::portalSession` (une requête SQL directe) et par les
// fonctions RLS `SECURITY DEFINER` de la migration 0141
// (`otto_portal_contact`/`otto_portal_entity`) — une fuite de la base (sauvegarde,
// journal de requêtes, copie de développement) aurait rendu chaque jeton client
// directement utilisable.
//
// CE QUE CE MODULE FAIT : sha256 hex, SANS SEL — la possession du jeton EN CLAIR
// est elle-même le secret (un lien de partage, ADR-006 ; PAS un mot de passe à
// faible entropie qu'un sel protégerait contre une table arc-en-ciel). Le hachage
// protège contre UNE fuite de la colonne elle-même, jamais contre un jeton déjà
// connu de quiconque.
//
// POURQUOI EN JAVASCRIPT, PAS EN SQL (`sha256()`/`digest()` de pgcrypto) : PGlite
// (utilisé en local et en CI) ne porte pas pgcrypto de façon fiable — aucune des
// migrations existantes n'appelle `digest()`. Le hachage se fait donc ICI, une
// fois, et tout le reste (la colonne `portal_token_hash`, la comparaison RLS de
// `otto_portal_contact()`) ne manipule plus qu'une chaîne opaque, jamais un calcul
// cryptographique côté base.
//
// CE QUE CE MODULE NE FAIT PAS (règle 19) : il ne génère aucun jeton (aucun
// générateur de contact client n'existe encore dans ce dépôt — seul
// `lib/seed.ts` pose des jetons de démonstration en dur) ; il ne vérifie pas la
// FORME du jeton reçu, seulement son empreinte. LE CHOIX « SANS SEL » SUPPOSE
// qu'un futur générateur produira des jetons à HAUTE ENTROPIE (128 bits
// aléatoires ou plus) — les jetons de démonstration actuels
// (`demo-sophie-altiverre`) sont des chaînes lisibles, acceptables sous la
// règle 2 (données synthétiques) mais qui NE DOIVENT PAS servir de modèle
// d'entropie pour un générateur réel : sans un sel, une table arc-en-ciel
// précalculée sur un espace de jetons prévisible retrouverait l'original
// depuis le seul hachage (revue hostile P2-03b, V1-03).
export function hacherJetonPortail(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}
