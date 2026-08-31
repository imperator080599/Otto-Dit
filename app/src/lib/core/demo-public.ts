// LE DÉPLOIEMENT PUBLIC (ADR-109, P0a du mandat). OTTO_DEMO_PUBLIC=1 marque
// une instance exposée au monde : données fictives reconstruites à chaque
// déploiement, et IA RÉELLE COUPÉE — quel que soit le reste de
// l'environnement. Une seule fonction, importée par chaque fabrique
// d'adaptateur, pour que la règle ne puisse pas être oubliée sur l'un d'eux :
// le mode payant ne se réactive pas par une variable posée par accident.

export function demoPublique(): boolean {
  /* Sur Vercel, TOUT déploiement est la démo publique — VERCEL=1 y est posée
     par la plateforme elle-même, donc le garde ne dépend d'aucun réglage de
     tableau de bord qu'on peut oublier (DA-10). Le jour d'une vraie
     production hébergée, cette ligne se REVOIT — elle ne se contourne pas. */
  return process.env.OTTO_DEMO_PUBLIC === '1' || process.env.VERCEL === '1';
}
