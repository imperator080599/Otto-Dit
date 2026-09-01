// LE BANDEAU DE REFUS, le même partout : un refus qui s'affiche différemment
// selon l'écran se lit comme un incident, pas comme une règle.
//
// LE MOT « refusé » EST AU CATALOGUE ; le MOTIF, lui, vient du service et reste
// dans la langue où le service l'a écrit. C'est dit plutôt que caché : les
// messages de refus des services sont un chantier de codes paramétrés, pas une
// passe de traduction (voir langue.test.ts).

import { tr } from '@/lib/i18n';

export async function BandeauRefus({ erreur }: { erreur?: string }) {
  if (!erreur) return null;
  const t = await tr();
  return (
    <div className="panel warn">
      <p><span className="badge amber">{t('commun.refuse')}</span> {erreur}</p>
      <p className="faint">{t('commun.rienEnregistre')}</p>
    </div>
  );
}
