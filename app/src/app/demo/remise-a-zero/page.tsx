import Link from 'next/link';
import { notFound } from 'next/navigation';
import { demoPublique } from '@/lib/core/demo-public';
import { requireUser } from '@/lib/core/auth';
import { comparaison, etatInstantane } from '@/lib/services/monde-demo';
import { BandeauRefus } from '@/app/bandeau-refus';
import { remettreAZeroAction } from './actions';

// L'ÉCRAN DE CONFIRMATION DE LA REMISE À ZÉRO.
//
// Il ne demande pas « êtes-vous sûr ? » : il MONTRE, ligne par ligne, ce qu'il
// y a aujourd'hui et ce qui reviendra. Une confirmation qui ne chiffre rien
// n'informe personne.

export const dynamic = 'force-dynamic';

export default async function RemiseAZero({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  if (!demoPublique()) notFound();
  await requireUser();
  const { erreur } = await searchParams;
  const etat = await etatInstantane();
  const lignes = await comparaison();
  const fr = (iso: string | null) =>
    (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} à ${iso.slice(11, 16)}` : '—');

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <div className="faint"><Link href="/">Missions</Link> / Remise à zéro</div>
      <h1>Remettre le monde de démonstration à zéro</h1>

      <BandeauRefus erreur={erreur} />

      <div className="panel">
        <p>
          Le monde revient exactement à l’état du dernier déploiement, pris le{' '}
          <strong>{fr(etat.prisLe)}</strong>. Tout ce qui a été fait depuis est effacé :
          missions rouvertes, pièces déposées, notes posées, visas, écarts, dossiers scellés.
        </p>
        <table className="data">
          <thead>
            <tr><th>Ce qu’il y a</th><th className="num">aujourd’hui</th><th className="num">après</th></tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.table}>
                <td>{l.libelle}</td>
                <td className="num">{l.actuel}</td>
                <td className="num">
                  {l.instantane}
                  {l.actuel !== l.instantane && (
                    <span className={`badge ${l.actuel > l.instantane ? 'amber' : 'gray'}`} style={{ marginLeft: 6 }}>
                      {l.actuel > l.instantane ? `−${l.actuel - l.instantane}` : `+${l.instantane - l.actuel}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {etat.aJour ? (
          <form action={remettreAZeroAction} className="mt">
            <button className="btn danger">Effacer et restaurer l’instantané</button>
            <Link href="/" className="btn secondary" style={{ marginLeft: 8 }}>Annuler</Link>
          </form>
        ) : (
          <p className="mt">
            <span className="badge amber">indisponible</span>{' '}
            {etat.desaccords.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
