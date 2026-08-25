import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q01 } from '@/lib/db/client';

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
  const id = store.get('otto_user')?.value;
  if (!id) return null;
  return q01<SessionUser>(`select id, tenant_id, name, email, firm_role from app_user where id = $1`, [id]);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/');
  return u;
}

export interface Membership {
  engagement_id: string;
  eng_role: string;
  can_sign: boolean;
}

/** Auditor-side guard: session user must be a member of the engagement (ADR-007). */
export async function requireMember(engagementId: string): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireUser();
  const membership = await q01<Membership>(
    `select engagement_id, eng_role, can_sign from engagement_member
     where engagement_id = $1 and user_id = $2`,
    [engagementId, user.id],
  );
  if (!membership) redirect('/');
  return { user, membership };
}

export interface PortalSession {
  contact: { id: string; entity_id: string; name: string; email: string };
  engagements: { id: string; name: string; language: string }[];
}

/** Client-portal guard: resolves a magic token to contact + entity engagements.
 *  The portal surface reads ONLY the client-safe whitelist (docs/04 §9.7). */
export async function portalSession(token: string): Promise<PortalSession | null> {
  const contact = await q01<{ id: string; entity_id: string; name: string; email: string }>(
    `select id, entity_id, name, email from client_contact where portal_token = $1 and active`,
    [token],
  );
  if (!contact) return null;
  const { q } = await import('@/lib/db/client');
  const engagements = await q<{ id: string; name: string; language: string }>(
    `select id, name, framework_set->>'language' as language from engagement
     where entity_id = $1 and status <> 'archived' order by name`,
    [contact.entity_id],
  );
  return { contact, engagements };
}
