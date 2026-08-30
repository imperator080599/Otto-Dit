import { q01 } from '@/lib/db/client';
import { requireMember } from '@/lib/core/auth';

// LE .ICS SORT DU PRODUIT — au format que tous les agendas lisent. L'accès
// passe par l'appartenance à la mission, comme tout le dossier.

export async function GET(_req: Request, ctx: { params: Promise<{ iid: string }> }) {
  const { iid } = await ctx.params;
  const inv = await q01<{ engagement_id: string; ics: string; objet: string }>(
    `select engagement_id, ics, objet from meeting_invitation where id = $1`,
    [iid],
  );
  if (!inv) return new Response('introuvable', { status: 404 });
  await requireMember(inv.engagement_id);
  return new Response(inv.ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="invitation.ics"`,
    },
  });
}
