import type { Instrumentation } from 'next';

// CHAQUE EXCEPTION DE RENDU S'ÉCRIT EN BASE, CLÉ PAR DIGEST (Groupe 0, item 106).
//
// Un écran qui tombe en ligne montre « Digest: 1444035093 » et rien d'autre.
// La cause vit dans un journal d'hébergeur que le fondateur ne lit pas, et
// trois écrans ont rendu 500 pendant une journée avec ce seul chiffre. Next
// appelle ce crochet pour toute erreur de rendu ou de route ; `erreurs-serveur`
// enregistre route, chemin, mission, version — et `/api/erreur?digest=…` la
// rend lisible.
//
// LE PATRON EST CELUI QUE NEXT DOCUMENTE : la condition sur le runtime PUIS
// l'import dynamique. Ce fichier est compilé pour Edge aussi (le middleware
// existe) ; un import de `db/client` hors de la branche Node tirerait pglite
// et node:fs dans le bundle Edge. Ce crochet ne fait jamais tomber quoi que ce
// soit : `erreurs-serveur` avale ses propres erreurs.

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ecrireErreur } = await import('./lib/erreurs-serveur');
    await ecrireErreur(err, { path: request.path, method: request.method }, { routePath: context.routePath });
  }
};
