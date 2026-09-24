import { NextRequest, NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { getSessionUser, activeMembership } from '@/lib/core/auth';
import { readBlob } from '@/lib/core/storage';

// Auditor-side evidence blob viewer (membership-checked; short-path equivalent of the
// production signed-URL flow, 06 §2).
//
// P2-01 (AUD-04) : `activeMembership` REMPLACE UNE JOINTURE MAISON qui n'excluait pas
// `exited_on` — un membre sorti de l'équipe pouvait continuer à lire les pièces de ce
// dossier tant que la ligne `engagement_member` existait encore. Même refus (404, pas
// 403) pour « la pièce n'existe pas » et « vous n'êtes pas de ce dossier » — ETANCH-01/
// ETANCH-03 posent la même doctrine : distinguer les deux apprendrait à un intrus que
// l'objet existe.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const ev = await q01<{ storage_path: string; mime: string; filename: string; engagement_id: string }>(
    `select storage_path, mime, filename, engagement_id from evidence where id = $1`,
    [evidenceId],
  );
  if (!ev || !(await activeMembership(ev.engagement_id, user.id))) return new NextResponse('not found', { status: 404 });
  const bytes = await readBlob(ev.storage_path);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': ev.mime,
      'Content-Disposition': `inline; filename="${ev.filename}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
