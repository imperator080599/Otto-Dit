import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';
import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { readBlob } from '@/lib/core/storage';

// LA PIÈCE, AVEC LE RECTANGLE DE LA CELLULE (mandat du jour, W1).
//
// `/api/piece/<evidenceId>/ancre?cellule=<cellId>` rend le PDF de la pièce sur
// lequel le rectangle de l'ancre est DESSINÉ — côté serveur, dans le fichier,
// par pdf-lib. Rien n'est écrit : la pièce d'origine reste intacte (son
// empreinte en fait foi), et le rectangle n'existe que dans la réponse. La
// visionneuse est l'iframe de l'atelier, ouverte à la page de l'ancre
// (`#page=N`, honoré par la visionneuse PDF du navigateur).
//
// Pourquoi côté serveur : aucune bibliothèque de rendu PDF côté client dans
// le produit (pas de canvas, pas de pdf.js embarqué) ; et un rectangle dessiné
// dans le fichier se vérifie par un harnais qui lit le fichier — un rectangle
// dessiné en HTML par-dessus un iframe ne se vérifie qu'à l'œil.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const cellId = req.nextUrl.searchParams.get('cellule') ?? '';
  /* Un identifiant qui n'en est pas un est un 4xx, jamais un 500 (règle 13 :
     un refus rendu en page 500). Sans `cellule`, il n'y a rien à dessiner. */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(evidenceId)) return new NextResponse('not found', { status: 404 });
  if (!cellId) return new NextResponse('cellule requise : /api/piece/<pièce>/ancre?cellule=<cellule>', { status: 400 });
  if (!UUID.test(cellId)) return new NextResponse('cellule inconnue sur cette pièce', { status: 404 });
  const ev = await q01<{ storage_path: string; mime: string; filename: string }>(
    `select e.storage_path, e.mime, e.filename from evidence e
     join engagement_member m on m.engagement_id = e.engagement_id and m.user_id = $2
     where e.id = $1`,
    [evidenceId, user.id],
  );
  if (!ev) return new NextResponse('not found', { status: 404 });
  const cell = await q01<{ page: number | null; rect: { x: number; y: number; w: number; h: number } | null; column_code: string }>(
    `select page, rect, column_code from test_cell where id = $1 and evidence_id = $2`,
    [cellId, evidenceId],
  );
  if (!cell) return new NextResponse('cellule inconnue sur cette pièce', { status: 404 });
  if (!cell.page || !cell.rect) return new NextResponse('cette cellule n’a pas d’ancre', { status: 409 });
  if (ev.mime !== 'application/pdf') return new NextResponse('la pièce n’est pas un PDF', { status: 415 });

  const bytes = await readBlob(ev.storage_path);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  if (cell.page < 1 || cell.page > pages.length) return new NextResponse('page hors de la pièce', { status: 409 });
  const page = pages[cell.page - 1];
  const r = cell.rect;
  const marge = 3;
  page.drawRectangle({
    x: r.x - marge, y: r.y - marge, width: r.w + 2 * marge, height: r.h + 2 * marge,
    borderColor: rgb(0.82, 0.12, 0.12), borderWidth: 1.5,
    color: rgb(1, 0.86, 0.25), opacity: 0.18, borderOpacity: 0.95,
  });
  const sortie = await doc.save({ useObjectStreams: false });
  return new NextResponse(Buffer.from(sortie), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${ev.filename.replace(/\.pdf$/i, '')}-ancre-${cell.column_code}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Otto-Ancre': `page=${cell.page};x=${r.x};y=${r.y};w=${r.w};h=${r.h}`,
    },
  });
}
