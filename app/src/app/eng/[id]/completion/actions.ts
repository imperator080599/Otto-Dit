'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import {
  assurerAchevement, conclure, sansObjet, rouvrir, CompletionError,
  type NatureAchevement,
} from '@/lib/services/completion';

async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof CompletionError)) throw e;
    erreur = e.message;
  }
  revalidatePath(`/eng/${id}/completion`);
  redirect(`/eng/${id}/completion${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export async function ouvrirAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  await requireMember(id);
  return executer(id, () => assurerAchevement(id));
}

export async function conclureAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => conclure(id, user.id, String(formData.get('nature')) as NatureAchevement, {
    findings: String(formData.get('findings') ?? ''),
    conclusion: String(formData.get('conclusion') ?? ''),
    coveredThrough: String(formData.get('covered_through') ?? '') || undefined,
    signedOn: String(formData.get('signed_on') ?? '') || undefined,
    evidenceId: String(formData.get('evidence_id') ?? '') || undefined,
  }));
}

export async function sansObjetAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => sansObjet(
    id, user.id, String(formData.get('nature')) as NatureAchevement,
    String(formData.get('reason') ?? ''),
  ));
}

export async function rouvrirAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => rouvrir(
    id, user.id, String(formData.get('nature')) as NatureAchevement,
    String(formData.get('reason') ?? 'fait nouveau'),
  ));
}
