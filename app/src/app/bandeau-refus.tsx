// LE BANDEAU DE REFUS, le même partout : un refus qui s'affiche différemment
// selon l'écran se lit comme un incident, pas comme une règle.
//
// LE MOT « refusé » EST AU CATALOGUE ; le MOTIF, lui, vient du service et reste
// dans la langue où le service l'a écrit. C'est dit plutôt que caché : les
// messages de refus des services sont un chantier de codes paramétrés, pas une
// passe de traduction (voir langue.test.ts).
//
// D.6 point 1 (mandat, épreuve de l'épure) : « Aucun identifiant technique en
// première position d'un message vu par un auditeur. Le refus dit la chose en
// français ; le code vient après, en petit. » Chaque service écrit encore
// « CODE : phrase » (des dizaines de sites d'appel, non réécrits — règle 8) ;
// c'est donc CET ENDROIT UNIQUE, partagé par tous les écrans, qui réordonne à
// l'affichage. `separerCode` NE VÉRIFIE PAS que le code existe au catalogue
// des erreurs ni qu'il est bien formé au sens métier : elle reconnaît une
// FORME (« MAJUSCULES[-MAJUSCULES...] : ») en tête de chaîne, rien de plus —
// un motif qui commencerait par un mot entièrement capitalisé suivi de « : »
// sans être un code technique serait, lui aussi, réordonné. `separerCode` vit
// dans refus.ts (un module .ts ordinaire) et non ici : ce fichier est un
// composant serveur (JSX, tsconfig en `jsx: "preserve"`) que Vitest/esbuild ne
// sait pas transformer pour un test — aucun fichier .tsx n'est importé par un
// test dans ce dépôt, et ce n'est pas cette tranche qui change la config
// globale pour la première fois.

import { tr } from '@/lib/i18n';
import { separerCode } from './refus';

export async function BandeauRefus({ erreur }: { erreur?: string }) {
  if (!erreur) return null;
  const t = await tr();
  const { code, phrase } = separerCode(erreur);
  return (
    <div className="panel warn">
      <p>
        <span className="badge amber">{t('commun.refuse')}</span> {phrase}
        {code && <span className="faint mono"> ({code})</span>}
      </p>
      <p className="faint">{t('commun.rienEnregistre')}</p>
    </div>
  );
}
