import { NextRequest, NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { readBlob } from '@/lib/core/storage';

// Auditor-side evidence blob viewer (membership-checked; short-path equivalent of the
// production signed-URL flow, 06 §2).

export async function GET(_req: NextRequest, ctx: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const ev = await q01<{ storage_path: string; mime: string; filename: string; engagement_id: string }>(
    `select e.storage_path, e.mime, e.filename, e.engagement_id from evidence e
     join engagement_member m on m.engagement_id = e.engagement_id and m.user_id = $2
     where e.id = $1`,
    [evidenceId, user.id],
  );
  if (!ev) return new NextResponse('not found', { status: 404 });
  const bytes = readBlob(ev.storage_path);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': ev.mime,
      'Content-Disposition': `inline; filename="${ev.filename}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
