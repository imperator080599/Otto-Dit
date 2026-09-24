// SIGNATURE DE L'IDENTITÉ DE SESSION (P2-03a, AUD-07).
//
// AVANT CE MODULE : le cookie `otto_user` portait l'identifiant NU. `curl -H
// "Cookie: otto_user=<uuid>"` authentifiait comme n'importe qui — le cookie n'était
// pas lié au serveur qui l'avait posé, seulement bien formé.
//
// CE QUE CE MODULE FAIT : signe l'identifiant (HMAC-SHA256, Web Crypto — le MÊME
// code tourne dans le runtime Edge de `middleware.ts` et le runtime Node des
// actions serveur ; aucune double implémentation, `crypto.subtle`/`btoa` sont
// disponibles dans les deux). Format du cookie : `<uuid>.<signature base64url>`.
//
// CE QUE CE MODULE NE FAIT PAS (règle 19). Sans `OTTO_SESSION_SECRET` posé
// (jamais le cas en local sans `.env.local`, jamais le cas en production une
// fois le geste fondateur H-1 fait), la signature retombe sur une constante
// FIXE, écrite ici en clair — un antidote au cookie mal formé ou tronqué,
// JAMAIS une protection contre quiconque lit ce dépôt. Le bac à sable (règle 29
// de CLAUDE.md, le sélecteur d'identité sans mot de passe) ne prétend pas être
// plus sûr que ça tant qu'il reste. La lecture `/api/sante` « session signée »
// dit lequel des deux cas est en vigueur, plutôt que de le taire.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_LOCAL_NON_PROTEGE = 'otto-session-non-signee-en-local — voir OTTO_SESSION_SECRET';

function secretActif(): string {
  return process.env.OTTO_SESSION_SECRET || SECRET_LOCAL_NON_PROTEGE;
}

/** Lu par la lecture `/api/sante` « session signée » — jamais le secret lui-même. */
export function secretDeSessionPose(): boolean {
  return Boolean(process.env.OTTO_SESSION_SECRET);
}

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacBase64Url(valeur: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(valeur));
  return toBase64Url(sig);
}

/** Pose la signature sur un identifiant déjà connu (un `id::text` d'`app_user`) —
 *  n'existe QUE pour signer ; ne vérifie jamais que l'identifiant existe en base
 *  (l'appelant l'a déjà fait, ou le fait juste après). */
export async function signerIdentite(id: string): Promise<string> {
  const sig = await hmacBase64Url(id, secretActif());
  return `${id}.${sig}`;
}

/** Vérifie un cookie `<uuid>.<signature>` : rend l'identifiant si la forme est un
 *  UUID ET que la signature correspond au secret actif, sinon `null` — jamais une
 *  exception (un cookie forgé ou tronqué doit rendre une session ABSENTE, pas un
 *  500 — même doctrine que `getSessionUser` avant ce module). */
export async function verifierIdentite(cookie: string | undefined | null): Promise<string | null> {
  if (!cookie) return null;
  const i = cookie.lastIndexOf('.');
  if (i <= 0 || i === cookie.length - 1) return null;
  const id = cookie.slice(0, i);
  const sig = cookie.slice(i + 1);
  if (!UUID.test(id)) return null;
  const attendu = await hmacBase64Url(id, secretActif());
  if (sig.length !== attendu.length) return null;
  // comparaison à temps constant — la longueur des deux chaînes vient d'être égalée
  let diff = 0;
  for (let k = 0; k < sig.length; k++) diff |= sig.charCodeAt(k) ^ attendu.charCodeAt(k);
  return diff === 0 ? id : null;
}
