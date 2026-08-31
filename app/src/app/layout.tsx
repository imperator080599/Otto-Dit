import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSessionUser } from '@/lib/core/auth';
import { demoPublique } from '@/lib/core/demo-public';

export const metadata: Metadata = {
  title: 'OTTO — AI-native assurance platform',
  description: 'Financial-statement audit & SOX/ICFR assurance — demo (synthetic data only)',
  /* URL publique : jamais indexée — c'est une démonstration, pas un site. */
  robots: demoPublique() ? { index: false, follow: false } : undefined,
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
          <span className="demo-badge">{demoPublique()
            ? 'DÉMONSTRATION PUBLIQUE — données fictives uniquement, reconstruites à chaque déploiement'
            : 'DEMO MODE — synthetic data only'}</span>
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
