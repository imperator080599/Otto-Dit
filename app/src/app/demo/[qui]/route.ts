import { NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';
import { sansLocataire } from '@/lib/db/sans-locataire';

// LE LIEN DE DÉMONSTRATION — `/demo/claire?vers=/eng/<id>/testing`.
//
// POURQUOI IL EXISTE. Sur la démo publique, l'écran d'accueil propose déjà de
// devenir n'importe qui d'un clic : il n'y a pas de mot de passe, c'est le
// principe du bac à sable. Mais l'identité voyage dans un COOKIE posé par une
// action serveur (POST), donc aucun lien ne peut ouvrir un écran de mission
// directement — ni celui qu'on envoie à quelqu'un, ni celui qu'un outil
// automatique charge pour VÉRIFIER que l'écran rend. Ce chemin le permet, en
// GET, et il ne donne AUCUN droit de plus que le bouton d'à côté.
//
// CE QU'IL REFUSE, et pourquoi c'est le cœur du sujet :
//   · hors démo publique, il n'existe pas — 404. Une authentification par
//     simple URL serait une faille dans un produit réel ; ici c'est une
//     commodité de bac à sable, et le garde est le MÊME que celui qui coupe
//     l'IA payante (demoPublique, DA-10) ;
//   · la destination doit être un chemin RELATIF commençant par « / » et sans
//     « // » — sinon c'est une redirection ouverte offerte à un inconnu ;
//   · un utilisateur inconnu est refusé, avec la liste des prénoms.

function destination(vers: string | null): string {
  if (!vers) return '/';
  if (!vers.startsWith('/') || vers.startsWith('//')) return '/';
  return vers;
}

export async function GET(req: Request, ctx: { params: Promise<{ qui: string }> }) {
  if (!demoPublique()) {
    return new NextResponse(
      'Ce chemin n’existe que sur la démonstration publique (données fictives, aucun mot de passe).',
      { status: 404 },
    );
  }
  const { qui } = await ctx.params;
  const cle = decodeURIComponent(qui).trim().toLowerCase();
  /* Par identifiant, ou par PRÉNOM — un lien qu'on envoie à quelqu'un se lit :
     /demo/claire vaut mieux que /demo/e4f6dc10-2b93-…. */
  /* CE CHEMIN CRÉE LA SESSION : il n'y a pas encore de cabinet à poser.
     Dérogation NOMMÉE, clé « lien-demo » (app/src/lib/db/sans-locataire.ts). */
  const u = await sansLocataire('lien-demo', () => q01<{ id: string; name: string }>(
    `select id::text, name from app_user
     where id::text = $1 or lower(split_part(name, ' ', 1)) = $1
     order by name limit 1`,
    [cle],
  ));
  if (!u) {
    const tous = await sansLocataire('lien-demo', () => q01<{ noms: string }>(
      `select string_agg(lower(split_part(name, ' ', 1)), ', ' order by name) noms from app_user`));
    return new NextResponse(
      `Personne ne s’appelle « ${cle} » dans ce dossier de démonstration. Essayez : ${tous?.noms ?? '—'}.`,
      { status: 404 },
    );
  }
  /* Le cookie est posé SUR LA RÉPONSE, pas par `cookies()` : un gestionnaire
     de route en a le droit, et la règle reste vérifiable hors d'un serveur
     Next — un test qui ne peut pas appeler le code ne le vérifie pas. */
  const res = NextResponse.redirect(
    new URL(destination(new URL(req.url).searchParams.get('vers')), req.url), 303);
  res.cookies.set('otto_user', u.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
