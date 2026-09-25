import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q01 } from '@/lib/db/client';
import { sansLocataire, enregistrerPoseurDeLocataire } from '@/lib/db/sans-locataire';
import { verifierIdentite } from '@/lib/core/session-jeton';
import { hacherJetonPortail } from '@/lib/core/jeton-portail';
import { refus } from '@/lib/core/refus';

// Demo auth (ADR-006): auditor side = dev user switcher setting an httpOnly cookie;
// client side = per-contact magic token in the portal URL. Authorization (engagement
// membership, audience) is enforced in the data-access layer regardless (ADR-007).

export interface SessionUser {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  firm_role: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  /* P2-03a (AUD-07) : le cookie porte `<uuid>.<signature>` (session-jeton.ts) —
     un cookie forgé (id nu, signature absente ou fausse) rend `null` ICI, jamais
     une exception : même doctrine que le reste de ce fichier (jamais un 500 sur
     une session absente). */
  const id = await verifierIdentite(store.get('otto_user')?.value);
  if (!id) return null;
  /* SANS LOCATAIRE, ET C'EST L'ORDRE DES CHOSES : c'est en lisant cette ligne
     qu'on APPREND de quel cabinet est la personne. Poser le locataire avant
     serait le supposer. Chemin inscrit sous la clé « session »
     (app/src/lib/db/sans-locataire.ts). */
  return sansLocataire('session', () =>
    q01<SessionUser>(`select id, tenant_id, name, email, firm_role from app_user where id = $1`, [id]));
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/');
  return u;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P2-03a (AUD-07) : `page.tsx::loginAction` recevait n'importe quelle chaîne
 *  comme identité — l'EXISTENCE se vérifie avant de poser le cookie, sous la
 *  même dérogation « choix-identite » que la liste des identités (aucune
 *  session encore posée à ce point). La FORME se vérifie AVANT la requête :
 *  une chaîne qui n'est même pas un uuid ferait lever `id = $1` — une PANNE
 *  Postgres (« invalid input syntax for type uuid »), jamais un simple
 *  « non trouvé » (règle 13 : aucun message technique brut à l'écran). */
export async function identifiantExisteEnBase(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const row = await sansLocataire('choix-identite', () =>
    q01<{ id: string }>(`select id from app_user where id = $1`, [id]));
  return Boolean(row);
}

export interface Membership {
  engagement_id: string;
  eng_role: string;
  can_sign: boolean;
}

/** La lecture qu'utilise `requireMember`, isolée pour être éprouvée sans `cookies()`/`redirect()`.
 *  R40 : un membre SORTI (`exited_on` posé) n'a plus d'appartenance active — ne regarde pas
 *  si la personne existe encore au dossier (team.ts la garde, elle n'est jamais supprimée). */
export async function activeMembership(engagementId: string, userId: string): Promise<Membership | null> {
  return q01<Membership>(
    `select engagement_id, eng_role, can_sign from engagement_member
     where engagement_id = $1 and user_id = $2 and exited_on is null`,
    [engagementId, userId],
  );
}

/** Auditor-side guard: session user must be an ACTIVE member of the engagement (ADR-007). */
export async function requireMember(engagementId: string): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireUser();
  const membership = await activeMembership(engagementId, user.id);
  if (!membership) redirect('/');
  return { user, membership };
}

export interface PortalSession {
  contact: { id: string; entity_id: string; name: string; email: string };
  engagements: { id: string; name: string; language: string }[];
}

/** Client-portal guard: resolves a magic token to contact + entity engagements.
 *  The portal surface reads ONLY the client-safe whitelist (docs/04 §9.7).
 *
 *  P2-03b (AUD-07, migration 0183) : la comparaison se fait désormais sur
 *  `portal_token_hash` (jamais le jeton en clair — `core/jeton-portail.ts`),
 *  et un jeton dont `expires_at` est dépassé lève `refus('PORTAIL-02', …)`
 *  plutôt que de rendre `null` : l'appelant (les deux pages `/portal`) DOIT
 *  l'attraper — un `Refus` non catché ici tomberait en page 500, exactement ce
 *  que règle 13 interdit (voir les deux sites d'appel, `portal/[token]/
 *  page.tsx` et `portal/[token]/[rid]/page.tsx`). `null` reste réservé au
 *  jeton INCONNU ou au contact désactivé — la distinction existe pour les
 *  tests et les stations, l'écran, lui, affiche le même message accueillant
 *  déjà les deux cas (« lien invalide ou expiré », `catalogue.ts`). */
export async function portalSession(token: string): Promise<PortalSession | null> {
  /* LE PORTAIL N'A PAS DE CABINET : le contact client est authentifié PAR
     JETON. Chemin inscrit sous la clé « portail-client », avec sa dette —
     sa politique par jeton n'est pas écrite (docs/PLAN_RLS.md). */
  return sansLocataire('portail-client', async () => {
    const hash = hacherJetonPortail(token);
    const contact = await q01<{ id: string; entity_id: string; name: string; email: string; expires_at: string | null }>(
      `select id, entity_id, name, email, expires_at from client_contact where portal_token_hash = $1 and active`,
      [hash],
    );
    if (!contact) return null;
    if (contact.expires_at && new Date(contact.expires_at).getTime() <= Date.now()) {
      throw refus('PORTAIL-02', 'ce lien a expiré — demandez à votre contact au cabinet d’audit de vous en renvoyer un');
    }
    const { q } = await import('@/lib/db/client');
    const engagements = await q<{ id: string; name: string; language: string }>(
      `select id, name, framework_set->>'language' as language from engagement
       where entity_id = $1 and status <> 'archived' order by name`,
      [contact.entity_id],
    );
    return { contact: { id: contact.id, entity_id: contact.entity_id, name: contact.name, email: contact.email }, engagements };
  });
}

/* ── LE POSEUR DE LOCATAIRE DU RUNTIME NEXT (PLAN_RLS étape 1, option (a)) ──
   Enregistré à l'import de ce module, que tout écran traverse. Il rend le
   cabinet de la personne connectée — et RIEN quand personne ne l'est : à ce
   moment-là, ce sont les chemins écrits (sans-locataire.ts) qui parlent.

   PAS DE RÉCURSION : `getSessionUser` lit sous la dérogation « session », qui
   ouvre une portée — le garde de `q()` rend donc la main avant de redemander.
   Ce module importe déjà `next/headers` ; `db/client.ts`, lui, ne le pourra
   jamais (les scripts, les tests et les migrations l'importent), et c'est
   pourquoi le poseur est ENREGISTRÉ plutôt qu'appelé. */
enregistrerPoseurDeLocataire(async () => {
  const u = await getSessionUser();
  return u?.tenant_id ?? null;
});
