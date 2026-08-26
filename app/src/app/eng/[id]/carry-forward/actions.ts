'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { proposerReprise, deciderReprise, CarryForwardError } from '@/lib/services/carryforward';

async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof CarryForwardError)) throw e;
    erreur = e.message;
  }
  revalidatePath(`/eng/${id}/carry-forward`);
  redirect(`/eng/${id}/carry-forward${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export async function proposerAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => proposerReprise(id, user.id));
}

export async function deciderAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => deciderReprise(
    String(formData.get('reprise_id')),
    user.id,
    String(formData.get('status')) as 'reconfirmed' | 'dismissed',
    String(formData.get('reason') ?? ''),
  ));
}
