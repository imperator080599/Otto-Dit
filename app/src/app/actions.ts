'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/core/auth';
import { creerMission, EngagementRuleError } from '@/lib/services/engagement';

// Action dans son propre fichier (ADR-078). Le refus repart à l'écran : une
// règle qui échoue en silence ne se distingue pas d'un bouton cassé.

export async function creerAction(formData: FormData): Promise<never> {
  const u = await requireUser();
  let id = '';
  let erreur = '';
  try {
    const row = await creerMission({
      tenantId: u.tenant_id,
      entityId: String(formData.get('entity_id') ?? ''),
      periodId: String(formData.get('period_id') ?? ''),
      kind: String(formData.get('kind') ?? 'statutory_audit') as 'statutory_audit',
      name: String(formData.get('name') ?? ''),
      packs: [String(formData.get('pack') ?? 'nep-fr')],
      accountingMap: 'pcg',
      language: String(formData.get('language') ?? 'fr') as 'fr' | 'en',
      actorUserId: u.id,
    });
    id = row.id;
  } catch (e) {
    if (!(e instanceof EngagementRuleError)) throw e;
    erreur = e.message;
  }
  revalidatePath('/');
  // Un dossier neuf s'ouvre sur son ACCEPTATION : c'est par là qu'il commence.
  redirect(erreur ? `/?erreur=${encodeURIComponent(erreur)}` : `/eng/${id}/acceptance`);
}
