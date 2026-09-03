import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSessionUser } from '@/lib/core/auth';
import { locale, traduire } from '@/lib/i18n';
import { FournisseurLocale } from '@/lib/i18n/client';
import { FournisseurReplis } from './replis-contexte';
import { lireReplis } from '@/lib/services/replis';

/* LE TITRE D'ONGLET SUIT LA LANGUE SERVIE. `metadata` est statique ; c'est
   `generateMetadata` qui peut lire la locale du cabinet. Un titre figé en
   anglais sur une instance française est la même incohérence que le reste. */
export async function generateMetadata(): Promise<Metadata> {
  const l = await locale();
  return {
    title: traduire(l, 'meta.titre'),
    description: traduire(l, 'meta.description'),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const l = await locale();
  /* LA MÉMOIRE DES REPLIS (1.2, migration 0132) : lue ici, une fois par
     requête, pour la personne connectée ; chaque section repliable la trouve
     au premier rendu. Personne de connecté (portail client) : rien à lire. */
  const replis = user ? await lireReplis(user.id) : {};
  return (
    <html lang={l}>
      <body>
        <FournisseurLocale locale={l}>
        <FournisseurReplis replis={replis} connecte={Boolean(user)}>
        <div className="topbar">
          <Link href="/" className="brand">
            OTTO<small>{traduire(l, 'meta.baseline')}</small>
          </Link>
          {/* PERMANENT ET CONSTANT (fil n°7, expérience du 2026-08-31) : le
              layout racine ne porte AUCUNE conditionnelle d'environnement —
              quatre chaînes sur quatre émettaient un #418 erratique avec un
              ternaire ici, zéro sans. Et le fond est plus juste ainsi : les
              données sont fictives dans TOUS les modes, pas seulement en
              public. */}
          <span className="demo-badge">{traduire(l, 'commun.demoBandeau')}</span>
          {/* MES TRAVAUX — le point d'origine de la navigation (ADR-110). Le
              lien est CONSTANT : aucune conditionnelle dans le layout racine
              (fil n°7), et la page elle-même renvoie à l'accueil si personne
              n'est connecté. */}
          <Link href="/travaux" className="topbar-lien">{traduire(l, 'commun.mesTravaux')}</Link>
          <span className="spacer" />
          {user ? (
            <span>
              {user.name} <span style={{ opacity: 0.6 }}>({user.firm_role})</span>
            </span>
          ) : (
            /* RIEN, plutôt qu'un « not signed in » anglais. Le seul écran où
               personne n'est connecté est le PORTAIL CLIENT, en français, et
               ce bandeau n'a rien à y dire : le client n'a pas de compte, c'est
               le produit. Une mention d'état vide est du bruit ; une mention
               dans la mauvaise langue est une erreur. */
            null
          )}
        </div>
        {children}
        </FournisseurReplis>
        </FournisseurLocale>
      </body>
    </html>
  );
}
