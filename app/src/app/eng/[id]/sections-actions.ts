'use server';

import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { envoyerA, attribuerA, suivre } from '@/lib/services/sections';

/* LES TROIS GESTES DE SECTION, chacun distinct — c'est tout l'intérêt du
   modèle : envoyer déplace le DÉTENTEUR, attribuer change le RESPONSABLE,
   suivre est un abonnement. Les confondre rendrait les listes identiques. */

async function acteur(engagementId: string) {
  const { user } = await requireMember(engagementId);
  return user.id;
}

function retour(engagementId: string, e: unknown): never {
  const m = e instanceof Error ? e.message : String(e);
  redirect(`/eng/${engagementId}?erreur=${encodeURIComponent(m)}`);
}

export async function envoyerAction(fd: FormData): Promise<void> {
  const eng = String(fd.get('engagement_id') ?? '');
  const moi = await acteur(eng);
  try {
    await envoyerA(String(fd.get('section_id') ?? ''), String(fd.get('vers') ?? ''), moi);
  } catch (e) { retour(eng, e); }
  redirect(`/eng/${eng}`);
}

export async function attribuerAction(fd: FormData): Promise<void> {
  const eng = String(fd.get('engagement_id') ?? '');
  const moi = await acteur(eng);
  try {
    await attribuerA(String(fd.get('section_id') ?? ''), String(fd.get('owner') ?? ''), moi);
  } catch (e) { retour(eng, e); }
  redirect(`/eng/${eng}`);
}

export async function suivreAction(fd: FormData): Promise<void> {
  const eng = String(fd.get('engagement_id') ?? '');
  const moi = await acteur(eng);
  try {
    await suivre(String(fd.get('section_id') ?? ''), moi, fd.get('suivre') === '1');
  } catch (e) { retour(eng, e); }
  redirect(`/eng/${eng}`);
}
