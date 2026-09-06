import { describe, it, expect } from 'vitest';
import { violationsDeCoherence } from './coherence';
import { SECTIONS } from './registre';
import type { ObjetSemeur, SectionSemeur } from './registre';

/** Règle 17 : le cas connu MAUVAIS d'abord — le garde doit ÉCHOUER dessus. */
describe('R44 — la cohérence du registre semeur/chemin', () => {
  it('cas connu mauvais : etat=prouve avec clique=null est détecté', () => {
    const mauvais: SectionSemeur[] = [{
      fichier: 'fixture.ts',
      titre: 'fixture',
      objets: [{
        objet: 'objet fautif', semeur: 'fixture.ts:1',
        cheminHumain: 'quelque-part.ts:1', clique: null, etat: 'prouve',
      } as ObjetSemeur],
    }];
    const erreurs = violationsDeCoherence(mauvais);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]).toMatch(/objet fautif/);
  });

  it('cas connu mauvais : etat=decor avec un cheminHumain renseigné est détecté', () => {
    const mauvais: SectionSemeur[] = [{
      fichier: 'fixture.ts',
      titre: 'fixture',
      objets: [{
        objet: 'objet fautif 2', semeur: 'fixture.ts:1',
        cheminHumain: 'quelque-part.ts:1', clique: null, etat: 'decor',
      } as ObjetSemeur],
    }];
    const erreurs = violationsDeCoherence(mauvais);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]).toMatch(/objet fautif 2/);
  });

  it('un objet cohérent ne lève rien', () => {
    const bon: SectionSemeur[] = [{
      fichier: 'fixture.ts',
      titre: 'fixture',
      objets: [
        { objet: 'a', semeur: 'x:1', cheminHumain: null, clique: null, etat: 'decor' },
        { objet: 'b', semeur: 'x:2', cheminHumain: 'y:1', clique: null, etat: 'non_prouve' },
        { objet: 'c', semeur: 'x:3', cheminHumain: 'y:2', clique: 'z:1', etat: 'prouve' },
      ],
    }];
    expect(violationsDeCoherence(bon)).toEqual([]);
  });

  it('le registre RÉEL (src/lib/semeur/registre.ts) est cohérent', () => {
    expect(violationsDeCoherence(SECTIONS)).toEqual([]);
  });
});
