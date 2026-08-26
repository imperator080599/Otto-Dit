import { q } from '@/lib/db/client';
import type { LigneAPointer } from './tieout';

// LA PLAQUETTE, DÉRIVÉE DE LA BALANCE POUR LA DÉMONSTRATION.
//
// EN PRODUCTION, elle est DÉPOSÉE PAR LE CLIENT — c'est son document, pas le
// nôtre, et c'est tout l'intérêt du pointage : on rapproche ce qu'il présente
// de ce que la comptabilité porte. La dériver serait vérifier qu'on sait
// additionner.
//
// Ici, faute d'un dépôt de plaquette dans le jeu de démonstration, les lignes
// sont construites depuis la balance — et ce fichier existe SÉPARÉ du service
// pour que la différence soit visible : le service `tieout.ts` ne sait pas
// fabriquer une plaquette, et ne doit pas savoir.

export async function plaquetteDemo(engagementId: string): Promise<LigneAPointer[]> {
  const comptes = await q<{ number: string; balance: string }>(
    `select a.number, a.balance::text as balance from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  );
  const parPrefixe = (p: string) => comptes.filter((c) => c.number.startsWith(p));
  const somme = (p: string) => Math.abs(
    parPrefixe(p).reduce((t, c) => t + Number(c.balance), 0),
  );
  const numeros = (p: string) => parPrefixe(p).map((c) => c.number);

  const lignes: LigneAPointer[] = [];
  if (numeros('70').length) {
    lignes.push({
      statement: 'IS', ref: 'CA', label: 'Chiffre d’affaires net',
      presented: Number(somme('70').toFixed(2)), sortOrder: 1,
      nature: 'agregat_comptes', accounts: numeros('70'),
    });
  }
  if (numeros('60').length) {
    lignes.push({
      statement: 'IS', ref: 'ACH', label: 'Achats consommés',
      presented: Number(somme('60').toFixed(2)), sortOrder: 2,
      nature: 'agregat_comptes', accounts: numeros('60'),
    });
  }
  if (numeros('411').length) {
    lignes.push({
      statement: 'BS_ASSET', ref: 'CLI', label: 'Créances clients et comptes rattachés',
      presented: Number(somme('411').toFixed(2)), sortOrder: 1,
      nature: 'solde_balance', accounts: numeros('411'),
    });
  }
  if (numeros('512').length) {
    lignes.push({
      statement: 'BS_ASSET', ref: 'BQ', label: 'Disponibilités',
      presented: Number(somme('512').toFixed(2)), sortOrder: 2,
      nature: 'solde_balance', accounts: numeros('512'),
    });
  }
  /* La ligne qui ne se calcule PAS : aucune somme de comptes ne la reproduit.
     C'est elle qui rend la troisième nature démontrable. */
  lignes.push({
    statement: 'NOTES', ref: 'EFF', label: 'Effectif moyen de l’exercice',
    presented: 42, sortOrder: 1, nature: 'calcul_documente',
  });
  return lignes;
}
