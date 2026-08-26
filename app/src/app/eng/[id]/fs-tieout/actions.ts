'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { pointer, documenter, expliquerEcart, declarerLignes, TieOutError } from '@/lib/services/tieout';
import { plaquetteDemo } from '@/lib/services/tieout-demo';

async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof TieOutError)) throw e;
    erreur = e.message;
  }
  revalidatePath(`/eng/${id}/fs-tieout`);
  redirect(`/eng/${id}/fs-tieout${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export async function chargerAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, async () => {
    await declarerLignes(id, user.id, await plaquetteDemo(id));
  });
}

export async function pointerAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => pointer(id, user.id));
}

export async function documenterAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => documenter(
    id, user.id, String(formData.get('ligne_id')),
    String(formData.get('explanation') ?? ''), String(formData.get('evidence_id') ?? ''),
  ));
}

export async function expliquerAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => expliquerEcart(
    id, user.id, String(formData.get('ligne_id')), String(formData.get('explanation') ?? ''),
  ));
}
