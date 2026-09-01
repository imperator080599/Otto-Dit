import { NextResponse, type NextRequest } from 'next/server';
import { q } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';

// LE DIGEST D'UN ÉCRAN EN ERREUR SE COLLE ICI ET RÉSOUT EN ROUTE + PILE.
//
// `/api/erreur?digest=1444035093` rend les occurrences de ce digest ; sans
// paramètre, les vingt dernières erreurs — « qu'est-ce qui a cassé récemment »
// en un appel. Réservé à la démonstration publique — et sur Vercel, TOUT
// déploiement est la démonstration publique (DA-10) : ce chemin y est donc
// ouvert, sans authentification, avec des piles et des chemins de fonction.
// Acceptable sur des données fictives ; à REVOIR avant une instance réelle,
// où une pile n'est pas un contenu public.

export const dynamic = 'force-dynamic';

interface Ligne {
  digest: string; route: string | null; path: string | null; method: string | null;
  engagement_id: string | null; release_sha: string | null; message: string;
  stack: string | null; occurred_at: string;
}

export async function GET(req: NextRequest) {
  if (!demoPublique()) {
    return new NextResponse('Ce chemin n’existe que sur la démonstration publique.', { status: 404 });
  }
  const digest = req.nextUrl.searchParams.get('digest')?.trim() || null;
  const lignes = await q<Ligne>(
    `select digest, route, path, method, engagement_id::text, release_sha, message,
            stack, occurred_at::text
     from server_error
     where ($1::text is null or digest = $1)
     order by occurred_at desc limit 20`,
    [digest],
  );
  return NextResponse.json({
    digest,
    trouvees: lignes.length,
    erreurs: lignes.map((l) => ({ ...l, stack: l.stack ? l.stack.split('\n').slice(0, 30).join('\n') : null })),
  }, { status: digest && lignes.length === 0 ? 404 : 200 });
}
