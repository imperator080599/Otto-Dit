import Link from 'next/link';
import { requireUser } from '@/lib/core/auth';
import { mesTravaux, type LigneTravail } from '@/lib/services/travaux';
import { tr } from '@/lib/i18n';

// MES TRAVAUX — l'écran d'où l'on part (ADR-110).
//
// Le critère de navigation du mandat se compte « depuis Mes travaux » : il
// fallait donc que Mes travaux existe. Rien n'y est stocké — tout est dérivé
// (notes adressées, papiers en attente de visa, demandes échues) : une liste
// de travail qui se maintient à la main ment le jour où on oublie de la
// tenir. Une ligne, un clic, l'objet.

const TITRES: Record<LigneTravail['nature'], string> = {
  note: 'Notes qui m’attendent',
  visa: 'Papiers en attente d’un visa',
  demande: 'Demandes au client échues',
};

const SOUS_TITRES: Record<LigneTravail['nature'], string> = {
  note: 'Les notes de revue qui me sont adressées et qui ne sont pas closes. Une note « à corriger » bloque le visa du papier qu’elle vise.',
  visa: 'Sur mes dossiers, les papiers dont le prochain visa n’est pas posé. Qui doit poser quel visa n’est pas encore un droit modélisé : la ligne le dit sans l’inventer.',
  demande: 'Les demandes envoyées au client dont l’échéance est passée, et qui ne sont pas complètes.',
};

export default async function MesTravaux() {
  const user = await requireUser();
  const t = await tr();
  const lignes = await mesTravaux(user.id);
  const natures: LigneTravail['nature'][] = ['note', 'visa', 'demande'];

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('commun.mesTravaux')}</h1>
        <span className="faint">{user.name} · {lignes.length} ligne(s)</span>
      </div>

      {lignes.length === 0 && (
        <div className="panel">
          <p>
            <span className="badge green">{t('trav.nothingIsWaitingForYou')}</span> {t('trav.noNoteAddressedToYouNo')}
          </p>
        </div>
      )}

      {natures.map((nature) => {
        const groupe = lignes.filter((l) => l.nature === nature);
        if (groupe.length === 0) return null;
        return (
          <div className="panel" key={nature}>
            <h2>{TITRES[nature]} <span className="faint">({groupe.length})</span></h2>
            <p className="faint">{SOUS_TITRES[nature]}</p>
            <table className="data">
              <thead>
                <tr><th>Mission</th><th>Objet</th><th>{t('trav.whereItStands')}</th><th>Date</th></tr>
              </thead>
              <tbody>
                {groupe.map((l, i) => (
                  <tr key={`${l.nature}-${i}`}>
                    <td className="faint">{l.mission}</td>
                    <td><Link href={l.href}>{l.titre}</Link></td>
                    <td>
                      {l.retard && <span className="badge amber" style={{ marginRight: 6 }}>{t('trav.toHandle')}</span>}
                      {l.detail}
                    </td>
                    <td className="faint">{l.quand ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

    </div>
  );
}
