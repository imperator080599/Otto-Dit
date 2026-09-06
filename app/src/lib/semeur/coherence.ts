import type { ObjetSemeur, SectionSemeur } from './registre';

/** L'invariant du registre R44 (constat E1, relecture hostile du 2026-09-06) :
 *  rien ne vérifiait `etat === 'decor' ⟺ cheminHumain === null`, ni
 *  `etat === 'prouve' ⟹ clique !== null`. Une édition future qui écrirait
 *  `etat: 'prouve', clique: null` serait publiée sans une plainte — et une ligne
 *  `non_prouve` à chemin nul afficherait la chaîne littérale `null` dans la
 *  liste « non prouvé » (docs/SEMEUR_VS_CHEMIN.md). Cette fonction lève le nom
 *  de l'objet fautif au lieu de laisser passer.
 *
 *  CE QU'ELLE NE VÉRIFIE PAS : que les citations fichier:ligne sont EXACTES
 *  (ça, seule une relecture hostile qui ouvre les fichiers le sait — règle 24) ;
 *  que `clique` désigne bien le bon geste et pas seulement la bonne page. */
export function violationsDeCoherence(sections: SectionSectionCompat[]): string[] {
  const erreurs: string[] = [];
  for (const section of sections) {
    for (const o of section.objets) {
      if (o.etat === 'decor' && o.cheminHumain !== null) {
        erreurs.push(`« ${o.objet} » (${section.fichier}) : etat=decor mais cheminHumain est renseigné (${o.cheminHumain}) — devrait être non_prouve ou prouve`);
      }
      if (o.etat !== 'decor' && o.cheminHumain === null) {
        erreurs.push(`« ${o.objet} » (${section.fichier}) : etat=${o.etat} mais cheminHumain est null — devrait être decor`);
      }
      if (o.etat === 'prouve' && o.clique === null) {
        erreurs.push(`« ${o.objet} » (${section.fichier}) : etat=prouve mais clique est null — devrait être non_prouve`);
      }
      if (o.etat !== 'prouve' && o.clique !== null) {
        erreurs.push(`« ${o.objet} » (${section.fichier}) : etat=${o.etat} mais clique est renseigné (${o.clique}) — devrait être prouve, ou clique devrait être null`);
      }
    }
  }
  return erreurs;
}

// Type structurel plutôt qu'un import direct de SectionSemeur, pour que le
// test puisse fabriquer des fixtures sans dépendre du registre réel.
type SectionSectionCompat = Pick<SectionSemeur, 'fichier'> & { objets: ObjetSemeur[] };
