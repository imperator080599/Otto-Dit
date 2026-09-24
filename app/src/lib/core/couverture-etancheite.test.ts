import { describe, it, expect } from 'vitest';
import { inventaire, PAR_PERSONNE } from './couverture-etancheite';

/**
 * AUCUNE FONCTION DE SERVICE PRENANT UN ACTEUR NE PEUT EXISTER SANS GARDE
 * (mandat du soir, étage 0.1 : « le compteur qui refuse la 38ᵉ devient un
 * compteur qui refuse LA PREMIÈRE »).
 *
 * CE QUI A CHANGÉ, ET POURQUOI (P2-01, AUD-04). Le balayage lui-même (`inventaire()`, le
 * regex `ACTEUR`, le regex `GARDE`, la liste `PAR_PERSONNE`) a été EXTRAIT vers
 * `core/couverture-etancheite.ts` (une logique, non plus un test) pour que `/api/sante`
 * rejoue EXACTEMENT le même calcul que ce fichier — jamais une copie qui pourrait diverger.
 *
 * CE QU'IL NE PROUVE PAS, ET IL LE DIT : c'est un balayage de TEXTE. Il
 * constate qu'un appel de garde FIGURE dans le corps — jamais qu'il s'exécute
 * sur le bon dossier (règle 15). La preuve, elle, est dans
 * `etancheite-executee.test.ts`, qui APPELLE chaque fonction avec un acteur
 * d'un autre cabinet et observe le refus.
 */
describe('la couverture des gardes d’étanchéité dans les services', () => {
  it('l’instrument VOIT quelque chose — un balayage muet dirait « zéro nue » et aurait l’air vert', () => {
    const { gardees, nues } = inventaire();
    expect(gardees.length + nues.length, 'aucune fonction à acteur trouvée : l’instrument mesure à côté').toBeGreaterThan(100);
    expect(gardees.length, 'aucune garde reconnue : l’instrument ne lit plus les appels').toBeGreaterThan(95);
  });

  it('AUCUNE fonction à acteur sans garde — la première rougit, pas la trente-huitième', () => {
    const { nues } = inventaire();
    const fautives = nues.filter((n) => !(n in PAR_PERSONNE));
    expect(fautives, 'fonctions de service prenant un acteur SANS garde d’étanchéité :\n  ' + fautives.join('\n  ')).toEqual([]);
  });

  it('aucune ligne PÉRIMÉE dans la liste « par personne », et chacune porte sa raison', () => {
    const { gardees, nues } = inventaire();
    const vues = new Set(nues);
    const toutes = new Set([...gardees, ...nues]);
    const perimees = Object.keys(PAR_PERSONNE).filter((k) => !vues.has(k))
      .map((k) => k + (toutes.has(k) ? ' (elle est GARDÉE désormais)' : ' (elle n’existe plus)'));
    expect(perimees, 'lignes périmées dans la liste « par personne »').toEqual([]);
    for (const [k, raison] of Object.entries(PAR_PERSONNE)) {
      expect(raison.length, `${k} : inscrit sans raison écrite`).toBeGreaterThan(30);
    }
  });
});
