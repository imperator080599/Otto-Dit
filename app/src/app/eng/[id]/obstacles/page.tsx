import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { obstaclesAuVisa, avertissementsAuVisa, type Famille } from '@/lib/services/obstacles';
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
  /* LES AVERTISSEMENTS — ce qui bloquerait si le pack le déclarait bloquant.
     `avertissementsAuVisa` était CALCULÉ et lu par AUCUN écran : une
     fonction dont le résultat n'atteignait personne, « un objet créé qu'aucun
     chemin de lecture n'atteint » (règle 13). Il atteint désormais l'écran
     que le signataire lit en premier, et il y est dit pour ce qu'il est :
     un avertissement, jamais compté parmi les obstacles. */
  const avertissements = await avertissementsAuVisa(id);

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

      {/* CE QUI N'EST PAS UN OBSTACLE, ET QUI SE DIT QUAND MÊME. Une famille que
          le pack ne déclare pas bloquante ne compte pas dans la liste — mais la
          taire reviendrait à cacher au signataire un travail inachevé sous
          prétexte qu'il ne l'empêche pas de signer. Elle est donc ici, à part,
          nommée avertissement, et le compte des obstacles ne l'inclut pas. */}
      {avertissements.length > 0 && (
        <div className="panel" data-avertissements>
          <h3 style={{ marginTop: 0 }}>
            {t('obst.avertissementsTitre')}{' '}
            <span className="badge blue">{avertissements.length}</span>
          </h3>
          <p className="faint">{t('obst.avertissementsAide')}</p>
          <ul>
            {avertissements.map((a, i) => (
              <li key={i}>
                {t(a.motif.cle, a.motif.vars)}{' '}
                <Link href={`/eng/${id}/${a.ou}`}>{t('obst.aller')}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {[...parFamille.entries()].map(([famille, libelles]) => (
        /* LA FAMILLE EST NOMMÉE DANS LE DOM, et c'est une réponse à la règle 15 :
           un harnais qui cherche un bout de phrase dans la page vérifie que ce
           texte existe, jamais qu'une règle s'applique. Avec l'attribut, il
           compte des obstacles d'une famille précise. */
        <div className="panel warn" key={famille} data-famille={famille}>
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
