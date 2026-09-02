import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { obstaclesAuVisa, type Famille } from '@/lib/services/obstacles';
import { FAMILLES } from '../familles';
import { tr } from '@/lib/i18n';

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
  const t = await tr();
  await requireMember(id);
  const liste = await obstaclesAuVisa(id);

  const parFamille = new Map<Famille, string[]>();
  for (const o of liste) {
    if (!parFamille.has(o.famille)) parFamille.set(o.famille, []);
    parFamille.get(o.famille)!.push(t(o.motif.cle, o.motif.vars));
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2>{t('obst.titre')}</h2>
        {liste.length === 0 ? (
          <p><span className="badge green">{t('obst.aucun')}</span></p>
        ) : (
          /* LE COMPTE, ET SUR COMBIEN DE FAMILLES. Sans lui l'écran montrait des
             panneaux sans jamais dire combien il en reste au total. */
          <p><span className="badge amber">{t('obst.nObstacles', { n: liste.length })}</span>{' '}
            {t('obst.repartis', { n: parFamille.size })}</p>
        )}
      </div>

      {[...parFamille.entries()].map(([famille, libelles]) => (
        <div className="panel warn" key={famille}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              {t(FAMILLES[famille].titre)}{' '}
              <span className="badge amber">{libelles.length}</span>
            </h2>
            <Link
              href={`/eng/${id}/${liste.find((o) => o.famille === famille)!.ou}`}
              className="btn secondary small"
            >{t('obst.aller')}</Link>
          </div>
          <p className="faint">{t(FAMILLES[famille].pourquoi)}</p>
          <ul>{libelles.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
