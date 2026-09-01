import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { vuePoste, type EtatBloc } from '@/lib/services/poste';

// L'ESPACE DE TRAVAIL D'UN POSTE (R-03, ADR-112).
//
// Six étapes dans l'ordre où l'on travaille un poste : leadsheet, processus,
// contrôle interne, évaluation des risques, échantillon, contrôle sur pièces.
// Chaque étape porte des CHIFFRES — ce qu'elle a produit — et un lien vers
// l'endroit où l'on agit. C'est ici que vivent désormais les écrans qui
// occupaient le rail sans lui appartenir.

export const dynamic = 'force-dynamic';

const BADGE: Record<EtatBloc, { classe: string; mot: string }> = {
  fait: { classe: 'green', mot: 'fait' },
  en_cours: { classe: 'amber', mot: 'en cours' },
  a_faire: { classe: 'gray', mot: 'à faire' },
  sans_objet: { classe: 'gray', mot: 'sans objet' },
};

const euros = (cents: number) =>
  `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function PostePage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = await params;
  await requireMember(id);
  const v = await vuePoste(id, decodeURIComponent(code));
  if (!v) notFound();

  const base = `/eng/${id}`;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{v.fsli.name}</h2>
        <span className="row">
          <span className="mono faint">{v.fsli.code}</span>
          <span className={`badge ${v.fsli.scoping.startsWith('in_scope') ? 'green' : 'gray'}`}>
            {v.fsli.scoping.startsWith('in_scope') ? 'retenu' : v.fsli.scoping}
          </span>
        </span>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Leadsheet</h3>
          <table className="data">
            <thead><tr><th>Compte</th><th>Libellé</th><th className="num">Solde</th></tr></thead>
            <tbody>
              {v.comptes.map((c) => (
                <tr key={c.number}>
                  <td className="mono">{c.number}</td>
                  <td>{c.label}</td>
                  <td className="num">{euros(c.balanceCents)}</td>
                </tr>
              ))}
              {v.comptes.length === 0 && (
                <tr><td colSpan={3} className="faint">Aucun compte rattaché à ce poste.</td></tr>
              )}
            </tbody>
            {v.comptes.length > 0 && (
              <tfoot>
                <tr>
                  <th colSpan={2}>Total</th>
                  <th className="num">{euros(v.totalCents)}</th>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="faint">
            <Link href={`${base}/reconciliation`}>Rapprochement balance / grand livre</Link>
            {' · '}
            <Link href={`${base}/provenance`}>D’où viennent ces chiffres</Link>
          </p>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Le travail sur ce poste</h3>
          <table className="data">
            <tbody>
              {v.blocs.map((b) => (
                <tr key={b.cle}>
                  <td style={{ width: 150 }}>
                    {b.href ? <Link href={b.href} title={b.quoi}>{b.titre}</Link> : <span title={b.quoi}>{b.titre}</span>}
                  </td>
                  <td><span className={`badge ${BADGE[b.etat].classe}`}>{BADGE[b.etat].mot}</span></td>
                  <td className="faint">{b.resume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {v.boucle && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>
            La boucle{' '}
            <span className={`badge ${v.boucle.fermee ? 'green' : 'amber'}`}>
              {v.boucle.fermee ? 'fermée' : `bloquée à « ${v.boucle.bloqueA ?? '—'} »`}
            </span>
          </h3>
          <table className="data">
            <thead><tr><th>Étape</th><th className="num">franchi</th><th className="num">en attente</th><th>on attend</th></tr></thead>
            <tbody>
              {v.boucle.etapes.map((e) => (
                <tr key={e.code}>
                  <td>{e.libelle}</td>
                  <td className="num">{e.franchi}</td>
                  <td className="num">{e.enAttente}</td>
                  <td className="faint">{e.enAttente > 0 ? e.attendQuoi : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint">
            {v.boucle.tours} tour(s) — un tour est un écart reparti en demande.
            {' '}<Link href={`${base}/loop?poste=${encodeURIComponent(v.fsli.code)}`}>Voir la boucle en détail</Link>
          </p>
        </div>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Papiers de travail</h3>
          <table className="data">
            <thead><tr><th>Code</th><th>Titre</th><th>État</th></tr></thead>
            <tbody>
              {v.papiers.map((w) => (
                <tr key={w.id}>
                  <td className="mono"><Link href={`${base}/workpapers/${w.id}`}>{w.code}</Link></td>
                  <td>{w.title} <span className="faint">v{w.version}</span></td>
                  <td><span className={`badge ${w.status === 'signed' ? 'green' : w.status === 'draft' ? 'gray' : 'amber'}`}>{w.status}</span></td>
                </tr>
              ))}
              {v.papiers.length === 0 && (
                <tr><td colSpan={3} className="faint">Aucun papier de travail sur ce poste.</td></tr>
              )}
            </tbody>
          </table>
          <p className="faint"><Link href={`${base}/workpapers`}>Tous les papiers du dossier</Link></p>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Ce qui reste ouvert</h3>
          <table className="data">
            <tbody>
              <tr>
                <td><Link href={`${base}/exceptions`}>Écarts</Link></td>
                <td className="num">{v.ecarts.ouverts} ouvert(s)</td>
                <td className="faint">sur {v.ecarts.total} relevé(s)</td>
              </tr>
              <tr>
                <td><Link href={`${base}/notes`}>Notes de revue</Link></td>
                <td className="num">{v.notes} ouverte(s)</td>
                <td className="faint">une note « à corriger » bloque le visa</td>
              </tr>
              <tr>
                <td><Link href={`${base}/requests`}>Demandes au client</Link></td>
                <td colSpan={2} className="faint">ce qui a été demandé pour ce poste, et ce qui manque</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
