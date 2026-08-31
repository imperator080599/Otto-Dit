import Link from 'next/link';
import { requireUser } from '@/lib/core/auth';
import { mesTravaux, type LigneTravail } from '@/lib/services/travaux';

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
  const lignes = await mesTravaux(user.id);
  const natures: LigneTravail['nature'][] = ['note', 'visa', 'demande'];

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Mes travaux</h1>
        <span className="faint">{user.name} · {lignes.length} ligne(s)</span>
      </div>

      {lignes.length === 0 && (
        <div className="panel">
          <p>
            <span className="badge green">rien ne vous attend</span> — aucune note adressée,
            aucun papier en attente de visa sur vos dossiers, aucune demande échue.
          </p>
          <p className="faint">
            Cet écran ne stocke rien : il relit à chaque ouverture. Une liste de travail tenue
            à la main ment le jour où personne ne la tient.
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
                <tr><th>Mission</th><th>Objet</th><th>Où en est-ce</th><th>Date</th></tr>
              </thead>
              <tbody>
                {groupe.map((l, i) => (
                  <tr key={`${l.nature}-${i}`}>
                    <td className="faint">{l.mission}</td>
                    <td><Link href={l.href}>{l.titre}</Link></td>
                    <td>
                      {l.retard && <span className="badge amber" style={{ marginRight: 6 }}>à traiter</span>}
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

      <p className="faint">
        Ce que cet écran ne montre PAS, et qui est dit plutôt que caché : les lignes
        d’échantillon ne portent pas encore de destinataire (le produit propose une
        répartition, il ne l’attribue pas nominativement au niveau de la ligne), et les
        obstacles au visa se lisent dossier par dossier, sur leur écran.
      </p>
    </div>
  );
}
