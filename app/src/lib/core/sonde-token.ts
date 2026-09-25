// LA GARDE DU DÉTAIL DE SONDE (P2-03c, AUD-07, mandat §11 « Surface publique »).
//
// `/api/sante?detail=1` et `/api/erreur` exposent des piles, des messages internes
// et (pour sante) le résultat détaillé de chaque lecture — une information de
// diagnostic utile à l'exploitant, jamais destinée à un visiteur anonyme de la
// démonstration publique (tout déploiement Vercel EST la démonstration publique,
// DA-10). `OTTO_SANTE_TOKEN` est OPTIONNELLE : absente, le détail reste désactivé
// pour tout le monde — jamais un défaut ouvert. Posée (geste fondateur H-8), elle
// doit être présentée dans l'en-tête `X-Otto-Sante` pour débloquer le détail.
//
// CE QUE CETTE GARDE NE VÉRIFIE PAS : elle ne protège que la PROFONDEUR de la
// réponse (détail vs résumé), jamais son ACCESSIBILITÉ — `/api/erreur` reste
// entièrement fermé hors démonstration publique par `demoPublique()`, vérifié
// séparément par son propre appelant.
export function detailAutorise(req: { headers: { get(name: string): string | null } }): boolean {
  const attendu = process.env.OTTO_SANTE_TOKEN;
  if (!attendu) return false;
  const fourni = req.headers.get('x-otto-sante');
  if (!fourni || fourni.length !== attendu.length) return false;
  // comparaison à temps constant — la longueur des deux chaînes vient d'être égalée
  let diff = 0;
  for (let k = 0; k < fourni.length; k++) diff |= fourni.charCodeAt(k) ^ attendu.charCodeAt(k);
  return diff === 0;
}
