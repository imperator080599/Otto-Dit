import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSessionUser } from '@/lib/core/auth';

export const metadata: Metadata = {
  title: 'OTTO — AI-native assurance platform',
  description: 'Financial-statement audit & SOX/ICFR assurance — demo (synthetic data only)',
  /* URL publique : jamais indexée — c'est une démonstration, pas un site.
     (Toujours noindex : la seule instance indexable serait une production
     réelle, qui n'existe pas — et une constante ne peut pas diverger entre
     construction et exécution, expérience fil n°7.) */
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <Link href="/" className="brand">
            OTTO<small>assurance platform</small>
          </Link>
          {/* PERMANENT ET CONSTANT (fil n°7, expérience du 2026-08-31) : le
              layout racine ne porte AUCUNE conditionnelle d'environnement —
              quatre chaînes sur quatre émettaient un #418 erratique avec un
              ternaire ici, zéro sans. Et le fond est plus juste ainsi : les
              données sont fictives dans TOUS les modes, pas seulement en
              public. */}
          <span className="demo-badge">DÉMONSTRATION — données fictives uniquement · synthetic data only</span>
          {/* MES TRAVAUX — le point d'origine de la navigation (ADR-110). Le
              lien est CONSTANT : aucune conditionnelle dans le layout racine
              (fil n°7), et la page elle-même renvoie à l'accueil si personne
              n'est connecté. */}
          <Link href="/travaux" className="topbar-lien">Mes travaux</Link>
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
      </body>
    </html>
  );
}
