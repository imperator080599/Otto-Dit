'use server';

import { requireMember } from '@/lib/core/auth';
import { demanderDetailDeCompte } from '@/lib/services/requests';
import { importerDetailDeCompte, rapprocherDetailDeCompte } from '@/lib/services/account-detail';
import { executer } from '@/app/refus';

/* Lot 7, priorité 1 (R98) : l'atelier « détail du compte : rapprochement » générique par
 * fsliCode, réutilisant SANS DUPLICATION les mêmes fonctions de service que /sampling
 * (REVENUE) — account-detail.ts et requests.ts::demanderDetailDeCompte sont déjà
 * paramétrées par fsliCode depuis leur origine ; seul l'écran manquait pour un poste hors
 * REVENUE. Même patron que rcm/actions.ts : l'identité du dossier/poste vient de champs
 * cachés du formulaire, jamais d'un argument de fonction lié. */

function chemin(engagementId: string, fsliCode: string): string {
  return `/eng/${engagementId}/poste/${encodeURIComponent(fsliCode)}/detail-compte`;
}

export async function demanderDetailAction(formData: FormData): Promise<never> {
  const engagementId = String(formData.get('engagement_id') ?? '');
  const fsliCode = String(formData.get('fsli_code') ?? '');
  return executer(chemin(engagementId, fsliCode), async () => {
    const { user } = await requireMember(engagementId);
    await demanderDetailDeCompte(engagementId, fsliCode, user.id);
  });
}

export async function importerDetailAction(formData: FormData): Promise<never> {
  const engagementId = String(formData.get('engagement_id') ?? '');
  const fsliCode = String(formData.get('fsli_code') ?? '');
  return executer(chemin(engagementId, fsliCode), async () => {
    const { user } = await requireMember(engagementId);
    const fichier = formData.get('fichier') as File;
    if (!fichier || !fichier.size) throw new Error('détail du compte : choisissez le fichier reçu du client');
    await importerDetailDeCompte({
      engagementId, fsliCode, filename: fichier.name,
      contenu: new Uint8Array(await fichier.arrayBuffer()), userId: user.id,
    });
  });
}

export async function rapprocherAction(formData: FormData): Promise<never> {
  const engagementId = String(formData.get('engagement_id') ?? '');
  const fsliCode = String(formData.get('fsli_code') ?? '');
  return executer(chemin(engagementId, fsliCode), async () => {
    const { user } = await requireMember(engagementId);
    await rapprocherDetailDeCompte(String(formData.get('import_id')), user.id, String(formData.get('explication') ?? ''));
  });
}
