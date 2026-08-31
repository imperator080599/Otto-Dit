import { NextResponse, type NextRequest } from 'next/server';
import { demoPublique } from '@/lib/core/demo-public';

// LE LIEN QUI OUVRE UN ÉCRAN, SANS REDIRECTION — `?comme=<identifiant>`.
//
// POURQUOI CE CHEMIN EXISTE. Sur la démonstration publique, l'identité vit
// dans un cookie posé par une action serveur : un lien ne peut donc pas ouvrir
// un écran de mission directement. `/demo/<prénom>` le fait par une
// REDIRECTION — parfait pour un humain, inutilisable pour un outil qui ne
// suit pas les cookies à travers une redirection (c'est exactement le mur
// contre lequel la preuve de P0(a) a buté). Ici, l'identité est lue DANS la
// requête et posée AVANT le rendu : la page répond 200 du premier coup.
//
// CE QUE ÇA NE DONNE PAS. Aucun droit de plus que le sélecteur d'identité de
// l'accueil, qui propose déjà de devenir n'importe qui sans mot de passe :
// c'est le principe du bac à sable, et le garde est le MÊME que celui qui
// coupe l'IA payante (demoPublique, DA-10). Hors démonstration publique, ce
// code ne fait RIEN — pas d'exception, pas de variable à oublier.
//
// Et la valeur doit être un IDENTIFIANT : le middleware ne parle pas à la
// base (runtime Edge), donc il ne devine aucun prénom ; un identifiant qui
// n'existe pas ne connecte personne — l'application renvoie à l'accueil.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La règle, isolée pour être testable sans serveur (règle 11). */
export function identiteDeLUrl(valeur: string | null, publique: boolean): string | null {
  if (!publique || !valeur) return null;
  return UUID.test(valeur) ? valeur : null;
}

export function middleware(req: NextRequest) {
  const id = identiteDeLUrl(req.nextUrl.searchParams.get('comme'), demoPublique());
  if (!id) return NextResponse.next();
  /* Poser le cookie sur la REQUÊTE fait voir l'identité à la page rendue
     maintenant ; le poser sur la RÉPONSE la garde pour les suivantes. */
  req.cookies.set('otto_user', id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set('otto_user', id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
