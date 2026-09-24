import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, activeMembership } from '@/lib/core/auth';
import { trackerXlsx, type TrackerAudience } from '@/lib/services/dashboard';

// P2-01 (AUD-04) : `activeMembership` REMPLACE une vérification maison qui n'excluait
// pas `exited_on` — un membre sorti de l'équipe pouvait encore télécharger le tracker.

export async function GET(req: NextRequest, ctx: { params: Promise<{ engId: string }> }) {
  const { engId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  if (!(await activeMembership(engId, user.id))) return new NextResponse('forbidden', { status: 403 });
  const audience = (req.nextUrl.searchParams.get('audience') ?? 'team') as TrackerAudience;
  const bytes = await trackerXlsx(engId, audience);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="otto-tracker-${audience}.xlsx"`,
    },
  });
}
