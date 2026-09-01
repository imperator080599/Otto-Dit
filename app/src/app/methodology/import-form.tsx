'use client';

import { useActionState, useState } from 'react';
import { useT } from '@/lib/i18n/client';

// Le formulaire d'import, côté client — et il l'est pour UNE raison.
//
// Un cabinet colle son catalogue pendant un rendez-vous. Si la validation
// échoue et que le collage est perdu, la démonstration l'est avec.
//
// DEUX CHOSES SONT NÉCESSAIRES, ET LA SECONDE A ÉTÉ TROUVÉE EN CONDUISANT
// L'ÉCRAN DANS UN NAVIGATEUR, PAS EN LE RELISANT.
//   · `useActionState` rend la liste d'erreurs sans quitter la page.
//   · Le texte doit être CONTRÔLÉ. React réinitialise le formulaire après une
//     action ; un `defaultValue` n'est lu qu'au montage, donc le collage
//     revenait au gabarit à chaque refus. Mesuré : 56 erreurs affichées, et le
//     texte de l'utilisateur effacé sous elles.

export interface Retour {
  erreurs: string[];
  message: string;
  fichiers: string[];
}

const VIDE: Retour = { erreurs: [], message: '', fichiers: [] };

export function ImportForm({
  action, attendus, gabarit, fichier,
}: {
  action: (etat: Retour, formData: FormData) => Promise<Retour>;
  attendus: string[];
  gabarit: string;
  /** Le fichier édité, ou « * » pour le paquet entier. */
  fichier: string;
}) {
  const t = useT();
  const [etat, envoyer, enCours] = useActionState(action, VIDE);
  const [texte, setTexte] = useState(gabarit);
  const seul = fichier !== '*';
  return (
    <form action={envoyer}>
      <input type="hidden" name="fichier" value={fichier} />
      <p>
        <label className="faint">{t('imp.nomVersion')}</label>
        <br />
        <input name="label" defaultValue={t('imp.millesime')} style={{ width: '100%', maxWidth: 480 }} />
      </p>
      <p>
        <label className="faint">
          {seul
            ? <>{t('imp.correctifPrerempli')} <span className="mono">{fichier}</span>. {t('imp.ajoutezDautresCles')}{' '}
              <span className="mono">{attendus.join(', ')}</span></>
            : <>{t('imp.paquetEntier', { n: attendus.length })}{' '}
              <span className="mono">{attendus.join(', ')}</span></>}
        </label>
        <br />
        <textarea
          name="paquet"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          spellCheck={false}
          rows={14}
          className="mono"
          style={{ width: '100%', fontSize: 12 }}
        />
      </p>
      <p className="row" style={{ gap: 8 }}>
        <button className="btn secondary" name="intention" value="verifier" disabled={enCours}>
          {t('imp.verifierSansPublier')}
        </button>
        {texte !== gabarit && (
          <button type="button" className="btn secondary" onClick={() => setTexte(gabarit)} disabled={enCours}>
            {t('imp.revenirVersionEnVigueur')}
          </button>
        )}
        <button className="btn" name="intention" value="publier" disabled={enCours}>
          {t('imp.publierPourMonCabinet')}
        </button>
      </p>

      {etat.erreurs.length > 0 && (
        <div className="panel" style={{ borderColor: 'var(--amber)' }}>
          <p>
            <span className="badge amber">{t('commun.refuse')}</span>{' '}
            <strong>{t('imp.nErreurs', { n: etat.erreurs.length })}</strong> {t('imp.rienEcrit')}
          </p>
          <ul className="mono" style={{ fontSize: 12 }}>
            {etat.erreurs.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {etat.message && (
        <p>
          <span className="badge green">ok</span> {etat.message}
        </p>
      )}
    </form>
  );
}
