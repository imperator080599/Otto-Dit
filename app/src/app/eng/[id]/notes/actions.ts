'use server';

import { requireMember } from '@/lib/core/auth';
import { addReviewNote, repondreNote, transitionNote } from '@/lib/services/workpapers/lifecycle';
import { executerNoteOtto } from '@/lib/services/notes/otto';
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
    const assignee = String(fd.get('assignee') ?? '');
    const noteId = await addReviewNote(
      engagementId,
      String(fd.get('workpaper_id') ?? '') || null,
      user.id,
      assignee === 'otto' ? null : assignee || null,
      String(fd.get('texte') ?? ''),
      { ancre, assigneeKind: assignee === 'otto' ? 'otto' : 'user' },
    );
    /* Une note pour OTTO s'exécute À LA POSE, sous les yeux de qui la pose :
       une file silencieuse serait un objet qu'aucun chemin de lecture
       n'atteint (règle 13). Refus compris — il s'affiche en réponse. */
    if (assignee === 'otto') await executerNoteOtto(noteId);
  });
}

export async function executerNoteOttoAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const chemin = `/eng/${engagementId}/notes`;
  return executer(chemin, async () => {
    await requireMember(engagementId);
    await executerNoteOtto(String(fd.get('note_id')));
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
