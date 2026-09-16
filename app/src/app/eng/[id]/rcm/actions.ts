'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { importRcm } from '@/lib/services/sox';

/* Lot 7, H-5 tranche 1 (`docs/REGISTRE_IDEES.md` §H, ligne 273) : le vrai geste d'upload, à la
 * place du bouton de démonstration qui relisait `dataset/sox/rcm.csv` depuis le disque du
 * serveur (`fs.readFileSync`, jamais un fichier reçu). Même patron que
 * `eng/[id]/imports/actions.ts` (ADR-078/ADR-091 : un refus non capturé rendait une page 500 —
 * `executer` ci-dessous capture tout, jamais seulement « les bonnes » erreurs). */
async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    const d = (e as { digest?: unknown } | null)?.digest;
    if (typeof d === 'string' && d.startsWith('NEXT_')) throw e;
    erreur = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(`/eng/${id}/rcm`);
  redirect(`/eng/${id}/rcm${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export async function uploadRcmAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  const file = formData.get('file') as File;
  return executer(id, async () => {
    const content = Buffer.from(await file.arrayBuffer()).toString('utf8');
    await importRcm(id, content, user.id, file.name);
  });
}
