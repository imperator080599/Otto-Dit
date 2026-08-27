'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import {
  ouvrirAcceptation, repondreCritere, decider, assurerJalons, poserJalon, marquerJalonFait,
  AcceptanceRuleError,
} from '@/lib/services/acceptance';

// Actions dans leur propre fichier (ADR-078), et chaque refus rendu À L'ÉCRAN :
// une règle qui échoue en silence ne se distingue pas d'un bouton cassé.

async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof AcceptanceRuleError)) throw e;
    erreur = e.message;
  }
  revalidatePath(`/eng/${id}/acceptance`);
  redirect(`/eng/${id}/acceptance${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

export async function ouvrirAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, async () => {
    await ouvrirAcceptation(id, user.id);
    await assurerJalons(id);
  });
}

export async function repondreAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => repondreCritere(
    id, user.id,
    String(formData.get('code')),
    String(formData.get('answer')) as 'oui' | 'non',
    String(formData.get('detail') ?? ''),
  ));
}

export async function deciderAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => decider(
    id, user.id,
    String(formData.get('status')) as 'accepted' | 'declined',
    String(formData.get('reason') ?? ''),
  ));
}

export async function jalonAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => poserJalon(
    id, user.id, String(formData.get('code')), String(formData.get('date')),
  ));
}

/* MARQUER UN JALON FAIT — le service existait, AUCUN écran ne l'appelait.
   Un jalon échu et non fait est un obstacle au visa : sans ce geste, le seul
   moyen de le lever était d'écrire en base. Un état qu'aucun chemin d'écriture
   n'atteint depuis l'application n'est pas un état du produit (ADR-091). */
export async function jalonFaitAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  return executer(id, () => marquerJalonFait(id, user.id, String(formData.get('code'))));
}
