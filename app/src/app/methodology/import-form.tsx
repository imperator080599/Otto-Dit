'use client';

import { useActionState, useState } from 'react';

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
  const [etat, envoyer, enCours] = useActionState(action, VIDE);
  const [texte, setTexte] = useState(gabarit);
  const seul = fichier !== '*';
  return (
    <form action={envoyer}>
      <input type="hidden" name="fichier" value={fichier} />
      <p>
        <label className="faint">Nom de la version</label>
        <br />
        <input name="label" defaultValue="Méthode du cabinet — millésime 2026" style={{ width: '100%', maxWidth: 480 }} />
      </p>
      <p>
        <label className="faint">
          {seul
            ? <>Correctif — pré-rempli avec <span className="mono">{fichier}</span>. Ajoutez d’autres
              clés si la modification en demande plusieurs. Fichiers reconnus :{' '}
              <span className="mono">{attendus.join(', ')}</span></>
            : <>Le paquet entier : un objet portant les {attendus.length} fichiers —{' '}
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
          Vérifier sans publier
        </button>
        {texte !== gabarit && (
          <button type="button" className="btn secondary" onClick={() => setTexte(gabarit)} disabled={enCours}>
            Revenir à la version en vigueur
          </button>
        )}
        <button className="btn" name="intention" value="publier" disabled={enCours}>
          Publier pour mon cabinet
        </button>
      </p>

      {etat.erreurs.length > 0 && (
        <div className="panel" style={{ borderColor: '#c96' }}>
          <p>
            <span className="badge amber">refusé</span>{' '}
            <strong>{etat.erreurs.length} erreur(s)</strong> — rien n’a été écrit.
          </p>
          <ul className="mono" style={{ fontSize: 12 }}>
            {etat.erreurs.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p className="faint">
            C’est la liste exacte que le moteur produirait au chargement : l’écran ne re-dérive
            rien, sinon il pourrait dire « valide » là où la publication refuse.
          </p>
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
