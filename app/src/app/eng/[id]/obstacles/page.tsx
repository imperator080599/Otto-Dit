import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { obstaclesAuVisa } from '@/lib/services/obstacles';
import { FAMILLES } from '../familles';

// LES OBSTACLES AU VISA — une seule liste, calculée (point 8).
//
// Chaque tranche avait ses blocages sur son propre écran. Personne ne pouvait
// dire, en UN endroit, ce qui empêche de signer — et un signataire qui doit
// visiter huit écrans pour le savoir finit par signer sans les avoir tous vus.
//
// Rien n'est stocké : chaque obstacle est demandé au service qui le connaît.

export const dynamic = 'force-dynamic';


export default async function ObstaclesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);
  const liste = await obstaclesAuVisa(id);

  const parFamille = new Map<string, string[]>();
  for (const o of liste) {
    if (!parFamille.has(o.famille)) parFamille.set(o.famille, []);
    parFamille.get(o.famille)!.push(o.libelle);
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2>Ce qui empêche de viser ce dossier</h2>
        {liste.length === 0 ? (
          <>
            <p><span className="badge green">Aucun obstacle</span></p>
            <p className="faint">
              Toutes les règles du dossier sont satisfaites. Cette page n’affirme rien d’autre :
              elle ne dit pas que le dossier est <em>bon</em>, elle dit qu’aucune règle ne le
              <strong> refuse</strong>. Le jugement reste au signataire.
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="badge amber">{liste.length} obstacle(s)</span>{' '}
              répartis sur {parFamille.size} famille(s).
            </p>
            <p className="faint">
              Chaque obstacle est <strong>calculé</strong> par le service qui le connaît — aucun
              n’est rédigé ici. Un obstacle qui n’apparaît pas dans cette liste n’en est pas un :
              si une règle bloque ailleurs sans figurer ici, c’est un défaut, pas une subtilité.
            </p>
          </>
        )}
      </div>

      {[...parFamille.entries()].map(([famille, libelles]) => (
        <div className="panel warn" key={famille}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              {FAMILLES[famille]?.titre ?? famille}{' '}
              <span className="badge amber">{libelles.length}</span>
            </h2>
            <Link
              href={`/eng/${id}/${liste.find((o) => o.famille === famille)!.ou}`}
              className="btn secondary small"
            >Aller le lever</Link>
          </div>
          <p className="faint">{FAMILLES[famille]?.pourquoi}</p>
          <ul>{libelles.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
