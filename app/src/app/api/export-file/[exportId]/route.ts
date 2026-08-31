import { NextRequest, NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { readBlob } from '@/lib/core/storage';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const exp = await q01<{ storage_path: string; format: string; workpaper_code: string }>(
    `select er.storage_path, er.format, w.code workpaper_code
     from export_record er
     join workpaper w on w.id = er.workpaper_id
     join engagement_member m on m.engagement_id = w.engagement_id and m.user_id = $2
     where er.id = $1`,
    [exportId, user.id],
  );
  if (!exp || !exp.storage_path) return new NextResponse('not found', { status: 404 });
  const bytes = await readBlob(exp.storage_path);
  const mime = exp.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${exp.workpaper_code}.${exp.format}"`,
    },
  });
}
