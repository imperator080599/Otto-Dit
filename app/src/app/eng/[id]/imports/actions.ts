'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { importTb, importFec, detectTbMapping, type CaptureIpe } from '@/lib/services/imports';
import { lireDateFr } from '@/lib/services/engagement';
import { rebuildFslis } from '@/lib/services/fsli';

// LES ACTIONS D'IMPORT, DANS LEUR PROPRE MODULE — et avec leurs refus RENDUS.
//
// Elles vivaient dans le composant, en `'use server'` inline (le motif qui a
// rendu six formulaires inertes en production, ADR-078), et surtout SANS
// aucune gestion d'erreur : un refus du service — ADR-016 « une sélection tirée
// dépend du grand livre », un FEC rejeté par le validateur, une balance
// illisible — remontait jusqu'au rendu et produisait une PAGE 500.
//
// Un refus affiché en 500 n'est pas un refus : c'est une panne. L'utilisateur
// ne voit ni ce qui a été refusé, ni pourquoi, ni ce qu'il doit faire — et sur
// un build de production le message est même masqué. C'est le défaut trouvé par
// le parcours cliqué : le balayage ouvrait la page (200), les tests appelaient
// le service (refus correct), et personne ne cliquait le bouton (ADR-091).

async function executer(id: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    await fn();
  } catch (e) {
    /* `redirect()` de Next SIGNALE en levant : le laisser passer est
       obligatoire, sinon une navigation réussie s'affiche en refus. */
    const d = (e as { digest?: unknown } | null)?.digest;
    if (typeof d === 'string' && d.startsWith('NEXT_')) throw e;
    /* Tout refus est capturé : ces services lèvent des `Error` nues, pas une
       classe dédiée, et attraper « seulement les bonnes » reviendrait à laisser
       les autres en 500. */
    erreur = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(`/eng/${id}/imports`);
  redirect(`/eng/${id}/imports${erreur ? `?erreur=${encodeURIComponent(erreur)}` : ''}`);
}

/** L'IPE capturée à l'import (1.8) — cinq champs facultatifs, lus tels quels ;
 *  la date d'extraction au format français, ou vide. */
function captureIpe(formData: FormData): CaptureIpe {
  const champ = (n: string) => String(formData.get(n) ?? '').trim();
  const extrait = champ('ipe_extrait_le');
  const extraitLe = extrait ? lireDateFr(extrait) : null;
  if (extrait && !extraitLe) throw new Error('import : la date d’extraction se saisit au format jj/mm/aaaa');
  return {
    systemeSource: champ('ipe_systeme_source') || null,
    natureIpe: (champ('ipe_nature') || null) as CaptureIpe['natureIpe'],
    identifiantRapport: champ('ipe_identifiant') || null,
    extraitLe,
    extraitPar: champ('ipe_extrait_par') || null,
  };
}

export async function uploadTbAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  const file = formData.get('file') as File;
  const periodKind = String(formData.get('period_kind')) as 'current' | 'prior';
  return executer(id, async () => {
    const content = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const mapping = detectTbMapping(content.split(/\r?\n/)[0] ?? '');
    await importTb({ engagementId: id, userId: user.id, filename: file.name, content, mapping, periodKind, ipe: captureIpe(formData) });
    await rebuildFslis(id, user.id).catch(() => undefined);
  });
}

export async function uploadFecAction(formData: FormData): Promise<never> {
  const id = String(formData.get('engagement_id') ?? '');
  const { user } = await requireMember(id);
  const file = formData.get('file') as File;
  const confirm = formData.get('confirm_invalidation') === 'on';
  return executer(id, async () => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await importFec({ engagementId: id, userId: user.id, filename: file.name, bytes, confirmInvalidation: confirm, ipe: captureIpe(formData) });
  });
}
