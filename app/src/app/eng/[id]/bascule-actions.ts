'use server';

import { conduire } from '@/lib/core/sonde';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/core/auth';
import { basculer } from '@/lib/services/bascule';

// LA BASCULE EST UNE ACTION, PAS UN LIEN (ADR-100) : chaque changement de
// dossier est journalisé avec sa provenance. Le refus revient sur le dossier
// de DÉPART — pas sur la cible, où l'utilisateur n'a précisément pas accès.

export async function basculerAction(fd: FormData): Promise<never> {
  const vers = String(fd.get('vers') ?? '');
  const depuis = String(fd.get('depuis') ?? '') || null;
  const user = await requireUser();
  let erreur = '';
  try {
    await conduire(() => basculer(user.id, vers, depuis));
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }
  if (erreur) {
    redirect(`${depuis ? `/eng/${depuis}` : '/'}?erreur=${encodeURIComponent(erreur)}`);
  }
  redirect(`/eng/${vers}`);
}
