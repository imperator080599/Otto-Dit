'use server';

import { requireMember } from '@/lib/core/auth';
import { addReviewNote, repondreNote, transitionNote } from '@/lib/services/workpapers/lifecycle';
import type { Ancre, AncreKind } from '@/lib/services/notes/ancres';
import { executer } from '@/app/refus';

// LES ACTIONS DES NOTES ANCRÉES — un seul module pour tous les écrans
// porteurs (ADR-078 : les actions vivent dans leur propre fichier ; ADR-097 :
// l'ancre vient de l'écran, la règle vit dans le service). Le tenant et
// l'identité viennent de la session, jamais du formulaire.

export async function poserNoteAncreeAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const chemin = String(fd.get('chemin') ?? `/eng/${engagementId}/notes`);
  return executer(chemin, async () => {
    const { user } = await requireMember(engagementId);
    const ancre: Ancre = {
      kind: String(fd.get('kind')) as AncreKind,
      ref: String(fd.get('aref') ?? ''),
      field: String(fd.get('field') ?? '') || null,
      label: String(fd.get('label') ?? ''),
    };
    await addReviewNote(
      engagementId,
      String(fd.get('workpaper_id') ?? '') || null,
      user.id,
      String(fd.get('assignee') ?? '') || null,
      String(fd.get('texte') ?? ''),
      { ancre },
    );
  });
}

export async function repondreNoteAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const chemin = `/eng/${engagementId}/notes`;
  return executer(chemin, async () => {
    const { user } = await requireMember(engagementId);
    await repondreNote(String(fd.get('note_id')), user.id, String(fd.get('texte') ?? ''));
  });
}

export async function transitionNoteAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const chemin = `/eng/${engagementId}/notes`;
  return executer(chemin, async () => {
    const { user } = await requireMember(engagementId);
    await transitionNote(String(fd.get('note_id')), user.id, String(fd.get('to')) as 'addressed' | 'closed');
  });
}
