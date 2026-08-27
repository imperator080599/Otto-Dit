'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { closeFile } from '@/lib/services/retention';

/* Toute action dans son propre module `'use server'` (ADR-078) : une action
   déclarée dans le composant capture sa portée et n'est pas encodable dans un
   build de production — six formulaires ont été inertes pour cette raison. */
export async function cloreAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user, membership } = await requireMember(id);

  let erreur = '';
  /* LE DROIT DE SIGNATURE, VÉRIFIÉ ICI ET PAS AILLEURS. Clore, c'est signer :
     la personne qui a créé le dossier y entre sans ce droit (ADR-088), et rien
     n'empêchait jusqu'ici de croire que « membre » suffisait. */
  if (!membership.can_sign) {
    erreur = 'clore le dossier revient à le signer : cela demande le droit de signature sur cette mission';
  } else {
    try {
      await closeFile(id, user.id, String(formData.get('report_date') ?? ''));
    } catch (e) {
      const d = (e as { digest?: unknown } | null)?.digest;
      if (typeof d === 'string' && d.startsWith('NEXT_')) throw e;
      /* Le refus de la clôture vient du service — obstacles au visa, grand
         livre provisoire, conclusion manquante — et il DOIT s'afficher : un
         refus calculé puis jeté est le défaut que ce dépôt traque. */
      erreur = e instanceof Error ? e.message : String(e);
    }
  }
  revalidatePath(`/eng/${id}/close`);
  redirect(`/eng/${id}/close${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}
