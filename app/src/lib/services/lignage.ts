// LE LIGNAGE D'UNE LIGNE D'ÉCHANTILLON (ADR-133, étage 1.2).
//
// Une ligne du tirage courant DÉSIGNE celle dont elle reprend le travail
// (`sample_item.repris_de`) : c'est ainsi qu'un ré-import du grand livre
// définitif, qui recrée chaque écriture avec un nouvel identifiant, ne fait pas
// disparaître les pièces déjà obtenues du client. Le fragment vit ici, en UN
// endroit, parce que la revue hostile de la nuit a mesuré ce qui arrive quand
// il ne vit que dans un chemin : l'atelier trouvait deux pièces sur la ligne
// pendant que la grille de test et le papier de travail n'en trouvaient
// AUCUNE. Deux fonctions de production, le même objet, deux réponses
// contraires — pire que le défaut d'origine, parce que l'une des deux rassure.
//
// `union` et non `union all` : la première forme termine même si un jour un
// `repris_de` pointait en cycle. Aucun écrivain ne peut en créer aujourd'hui
// (le tirage ne désigne qu'un échantillon superseded, et un échantillon ne se
// tire qu'une fois) — mais une requête qui boucle bloque le processus entier,
// et ce n'est pas le genre de pari qu'on tient dans une lecture d'écran.
//
// USAGE : le premier paramètre de la requête DOIT être l'identifiant de la
// ligne. `${LIGNAGE} select … where x.sample_item_id in (select id from lignage)`.
export const LIGNAGE = `with recursive lignage(id) as (
  select $1::uuid
  union
  select si.repris_de from sample_item si join lignage l on l.id = si.id
   where si.repris_de is not null
)`;

/**
 * LE LIGNAGE DE TOUTES LES LIGNES D'UN ÉCHANTILLON, en une seule table
 * (racine → chaque ancêtre, elle-même comprise). Le fragment ci-dessus répond
 * pour UNE ligne ; celui-ci répond pour un tirage entier, ce dont ont besoin
 * les comptes de la boucle : « combien de lignes ont reçu une pièce ? » ne peut
 * pas se poser ligne à ligne sans une requête par ligne.
 *
 * USAGE : le premier paramètre DOIT être l'identifiant de l'échantillon.
 * `${LIGNEE} select … join request_item ri on ri.sample_item_id in
 *  (select id from lignee where racine = si.id)`.
 */
export const LIGNEE = `with recursive lignee(racine, id) as (
  select si.id, si.id from sample_item si where si.sample_id = $1
  union
  select l.racine, si.repris_de from sample_item si join lignee l on l.id = si.id
   where si.repris_de is not null
)`;
