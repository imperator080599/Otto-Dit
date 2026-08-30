'use server';

import { requireMember } from '@/lib/core/auth';
import {
  declarerContactCle, declarerContactDomaine, choisirCreneau, envoyer,
} from '@/lib/services/reunions';
import { executer } from '@/app/refus';

export async function declarerCleAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  return executer(`/eng/${engagementId}/reunions`, async () => {
    const { user } = await requireMember(engagementId);
    await declarerContactCle(engagementId, String(fd.get('contact') ?? ''), user.id);
  });
}

export async function declarerDomaineAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  return executer(`/eng/${engagementId}/reunions`, async () => {
    const { user } = await requireMember(engagementId);
    await declarerContactDomaine(engagementId, String(fd.get('contact') ?? ''), String(fd.get('domaine') ?? ''), user.id);
  });
}

export async function choisirCreneauAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  return executer(`/eng/${engagementId}/reunions`, async () => {
    const { user } = await requireMember(engagementId);
    await choisirCreneau({
      engagementId, userId: user.id,
      debut: String(fd.get('debut') ?? ''), fin: String(fd.get('fin') ?? ''),
      objet: String(fd.get('objet') ?? ''),
      destinataireContactId: String(fd.get('destinataire') ?? ''),
    });
  });
}

export async function envoyerAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  return executer(`/eng/${engagementId}/reunions`, async () => {
    const { user } = await requireMember(engagementId);
    await envoyer(String(fd.get('invitation_id') ?? ''), user.id);
  });
}
