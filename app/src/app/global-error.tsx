'use client';

import { useEffect, useState } from 'react';
import { traduire, type Locale } from '@/lib/i18n/catalogue';

// LA PANNE QUE `error.tsx` NE PEUT PAS ATTRAPER : celle du LAYOUT RACINE —
// une base injoignable, une DATABASE_URL mal posée. C'est la classe la plus
// grave, et sans ce fichier elle n'a pas d'écran : Next rend son gabarit nu.
// Ici, aucun fournisseur de langue (la base est peut-être la cause) : la
// langue vient du navigateur, et le catalogue reste le seul endroit où une
// phrase s'écrit.

export default function ErreurGlobale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /* LA LANGUE SE CHOISIT APRÈS L'HYDRATATION, PAS PENDANT (ADR-132).
     `typeof navigator !== 'undefined' ? … : 'en'` au rendu est une divergence
     SERVEUR/CLIENT par construction : le serveur rend « en », un navigateur
     français rend « fr », et tout le texte de cet écran change — y compris
     l'attribut `lang` de `<html>`. C'était le SEUL divergent statique du dépôt,
     trouvé en instruisant le #418 ; il ne pouvait pas être notre #418 (cet
     écran ne rend que si le layout racine jette), mais un défaut qu'aucune
     exécution n'atteint reste un défaut. Le premier rendu est donc le même des
     deux côtés, et la langue du navigateur s'applique ensuite. */
  const [l, setL] = useState<Locale>('en');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /^fr/i.test(navigator.language)) setL('fr');
  }, []);
  const t = (cle: Parameters<typeof traduire>[1]) => traduire(l, cle);
  const digest = error.digest ?? null;
  return (
    <html lang={l}>
      <body>
        <div className="shell" style={{ maxWidth: 640, padding: 24 }}>
          <h1>{t('erreur.titre')}</h1>
          <p>{t('erreur.explication')}</p>
          {digest && (
            <p>
              {t('erreur.digest')} <code>{digest}</code>
              {' · '}
              <a href={`/api/erreur?digest=${encodeURIComponent(digest)}`}>{t('erreur.resoudre')}</a>
            </p>
          )}
          <p><button type="button" onClick={() => reset()}>{t('erreur.reessayer')}</button></p>
        </div>
      </body>
    </html>
  );
}
