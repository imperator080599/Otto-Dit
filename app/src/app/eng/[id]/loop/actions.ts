'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { draftClarificationRequest } from '@/lib/services/matching';

// Les actions vivent dans leur propre fichier : une action définie dans le
// rendu et passée plus loin n'est pas encodable en production (ADR-078).

export async function boucleAction(formData: FormData): Promise<void> {
  const id = String(formData.get('engagement_id') ?? '');
  const poste = String(formData.get('poste') ?? '');
  const { user } = await requireMember(id);
  let message = '';
  let erreur = '';
  try {
    await draftClarificationRequest(id, user.id);
    message = 'demande de clarification créée depuis les écarts ouverts — la boucle repart';
  } catch (e) {
    /* Le service LÈVE quand il n'y a rien à clarifier. Ce n'est pas une panne :
       c'est une réponse, et elle se dit à l'écran plutôt que de laisser un
       bouton sans effet apparent. */
    const m = (e as Error).message;
    erreur = /no open exceptions/.test(m)
      ? 'aucun écart ouvert à clarifier : la boucle n’a rien à relancer'
      : m;
  }
  revalidatePath(`/eng/${id}/loop`);
  const qs = new URLSearchParams({ poste });
  if (erreur) qs.set('erreur', erreur); else qs.set('ok', message);
  redirect(`/eng/${id}/loop?${qs.toString()}`);
}
