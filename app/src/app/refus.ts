import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// UN REFUS S'AFFICHE — IL NE TOMBE PAS EN 500.
//
// CE QUE LE PARCOURS CLIQUÉ A TROUVÉ. Dix écrans exécutaient leurs actions sans
// aucune gestion d'erreur : tout refus du service — « une sélection tirée dépend
// du grand livre », « une résolution générique est rejetée », « la conclusion
// exige une réponse au dépassement » — remontait jusqu'au rendu et produisait
// une PAGE 500. Sur un build de production, le message est même masqué :
// l'utilisateur voit une page cassée là où le produit lui parlait.
//
// C'était invisible aux trois harnais : les tests appellent le service (le refus
// est correct), le balayage OUVRE la page (200), et personne ne cliquait le
// bouton. Il a fallu cliquer pour le voir (ADR-091).
//
// La règle du dépôt était déjà écrite — « un refus calculé puis jeté est le
// défaut à traquer » — mais elle n'était appliquée qu'aux écrans qui avaient un
// module d'actions. Elle vaut partout, donc elle vit ici.

/* `redirect()` et `notFound()` de Next SIGNALENT en levant. Une action qui
   redirige elle-même — la génération de demande part sur la demande créée —
   lève donc un « NEXT_REDIRECT » qui n'est pas une erreur. Ne pas le laisser
   passer transforme une navigation réussie en refus affiché : le parcours
   cliqué a montré « refusé : NEXT_REDIRECT » à l'utilisateur.
   C'est le défaut que ce fichier corrige, reproduit dans sa correction. */
function estUnSignalDeNext(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === 'string'
    && (d.startsWith('NEXT_REDIRECT') || d === 'NEXT_NOT_FOUND' || d.startsWith('NEXT_HTTP_ERROR_FALLBACK'));
}

export async function executer(chemin: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (estUnSignalDeNext(e)) throw e;
    /* On attrape TOUT : ces services lèvent des `Error` nues autant que des
       classes dédiées, et n'attraper « que les bonnes » revient à laisser les
       autres tomber en 500 — c'est-à-dire à recréer le défaut pour les cas
       qu'on n'a pas prévus, qui sont précisément ceux qui comptent. */
    erreur = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(chemin);
  /* `redirect` lève, volontairement, et DOIT être hors du `try` : l'attraper
     transformerait chaque succès en « refus » silencieux. */
  redirect(`${chemin}${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}
