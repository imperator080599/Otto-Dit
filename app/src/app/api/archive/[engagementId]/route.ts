import { NextRequest, NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { readBlob } from '@/lib/core/storage';

// LE DOSSIER SCELLÉ SE TÉLÉCHARGE — sinon il n'existe que dans la base.
//
// `file_archive` n'avait AUCUN chemin de lecture dans l'application : l'archive
// était produite, empreintée, conservée… et personne ne pouvait la voir. C'est
// exactement « un objet créé qu'aucun chemin de lecture n'atteint » (règle 13,
// ADR-088). Une archive qu'on ne peut pas sortir ne prouve rien à un inspecteur.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  /* L'appartenance, comme partout : l'archive porte tout le dossier, c'est la
     pièce la moins partageable qui soit. */
  const a = await q01<{ storage_path: string; sha256: string; sealed_at: string }>(
    `select a.storage_path, a.sha256, a.sealed_at::text
     from file_archive a
     join engagement_member m on m.engagement_id = a.engagement_id and m.user_id = $2
     where a.engagement_id = $1 order by a.sealed_at desc limit 1`,
    [engagementId, user.id],
  );
  if (!a) return new NextResponse('not found', { status: 404 });
  const bytes = readBlob(a.storage_path);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/zip',
      /* L'empreinte DANS le nom du fichier : une archive renommée reste
         reconnaissable, et deux exports du même dossier ne se confondent pas. */
      'Content-Disposition': `attachment; filename="dossier-${engagementId.slice(0, 8)}-${a.sha256.slice(0, 12)}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
