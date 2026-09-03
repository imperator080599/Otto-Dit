// LES JOURS OUVRÉS (mandat de nuit n°2, 1.3). L'ancienneté d'une note de revue
// se compte en jours OUVRÉS : « posée il y a deux jours » un lundi ne veut pas
// dire la même chose qu'un mercredi, et une revue qui traîne trois week-ends
// n'a pas traîné vingt-et-un jours de travail.
//
// CE QUE CE CALCUL NE FAIT PAS, ET LE DIT : il ne connaît AUCUN jour férié —
// ni français, ni américain, ni ceux du cabinet. Un férié est une donnée de
// cabinet (calendrier local, conventions collectives) ; l'inventer ici serait
// une constante légale sortie de nulle part. Il ne compte que le samedi et le
// dimanche, et les écrans disent « jours ouvrés » sans prétendre à plus.

const WEEKEND = new Set([0, 6]);

/** La date d'il y a `n` jours ouvrés (samedi et dimanche sautés). */
export function joursOuvresAvant(n: number, depuis: Date = new Date()): Date {
  const d = new Date(depuis);
  let reste = n;
  while (reste > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!WEEKEND.has(d.getUTCDay())) reste--;
  }
  return d;
}

/**
 * Le nombre de jours OUVRÉS écoulés entre deux instants (bornes exclues au
 * départ, incluses à l'arrivée) : l'inverse de `joursOuvresAvant`. Une date
 * dans le futur rend 0 — une note ne peut pas être posée demain.
 */
export function joursOuvresEntre(depuis: Date | string, jusqua: Date = new Date()): number {
  const a = new Date(depuis);
  const b = new Date(jusqua);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a >= b) return 0;
  const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let n = 0;
  const curseur = new Date(jour(a));
  const fin = jour(b);
  while (curseur.getTime() < fin) {
    curseur.setUTCDate(curseur.getUTCDate() + 1);
    if (!WEEKEND.has(curseur.getUTCDay())) n++;
  }
  return n;
}
