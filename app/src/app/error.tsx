'use client';

import { useT } from '@/lib/i18n/client';

// L'ÉCRAN D'ERREUR MONTRE LE DIGEST ET OÙ LE COLLER (Groupe 0, item 106).
//
// Le gabarit par défaut de Next affiche « Application error » et un chiffre.
// Celui-ci affiche le même chiffre — c'est la clé de `server_error` — et le
// lien qui le résout en route et en pile. Un écran blanc sans issue est le
// défaut ; un écran qui dit où chercher n'en est plus un.

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const digest = error.digest ?? null;
  return (
    <div className="shell" style={{ maxWidth: 640 }}>
      <div className="panel">
        <h1>{t('erreur.titre')}</h1>
        <p className="muted">{t('erreur.explication')}</p>
        {digest && (
          <p>
            {t('erreur.digest')} <code className="mono">{digest}</code>
            {' · '}
            <a href={`/api/erreur?digest=${encodeURIComponent(digest)}`}>{t('erreur.resoudre')}</a>
          </p>
        )}
        <p>
          <button type="button" className="btn" onClick={() => reset()}>{t('erreur.reessayer')}</button>
        </p>
      </div>
    </div>
  );
}
