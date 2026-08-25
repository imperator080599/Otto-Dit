import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getSessionUser } from '@/lib/core/auth';

export const metadata: Metadata = {
  title: 'OTTO — AI-native assurance platform',
  description: 'Financial-statement audit & SOX/ICFR assurance — demo (synthetic data only)',
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
          <span className="demo-badge">DEMO MODE — synthetic data only</span>
          <span className="spacer" />
          {user ? (
            <span>
              {user.name} <span style={{ opacity: 0.6 }}>({user.firm_role})</span>
            </span>
          ) : (
            <span style={{ opacity: 0.7 }}>not signed in</span>
          )}
        </div>
        {children}
      </body>
    </html>
  );
}
