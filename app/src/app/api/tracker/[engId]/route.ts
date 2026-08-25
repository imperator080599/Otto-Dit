import { NextRequest, NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { trackerXlsx, type TrackerAudience } from '@/lib/services/dashboard';

export async function GET(req: NextRequest, ctx: { params: Promise<{ engId: string }> }) {
  const { engId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const member = await q01(`select 1 from engagement_member where engagement_id = $1 and user_id = $2`, [engId, user.id]);
  if (!member) return new NextResponse('forbidden', { status: 403 });
  const audience = (req.nextUrl.searchParams.get('audience') ?? 'team') as TrackerAudience;
  const bytes = await trackerXlsx(engId, audience);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="otto-tracker-${audience}.xlsx"`,
    },
  });
}
