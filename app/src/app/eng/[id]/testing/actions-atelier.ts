'use server';

import { requireMember } from '@/lib/core/auth';
import { q1 } from '@/lib/db/client';
import { verifyExtraction } from '@/lib/services/extraction/ladder';
import { demandeClarificationLignes } from '@/lib/services/requests';
import { conclureLigne, disposerCellule } from '@/lib/services/testing/grille';
import type { ExtractedField } from '@/lib/services/extraction/fields';
import { executer } from '@/app/refus';

// LES ACTIONS DE L'ATELIER (ADR-104, actions dans leur propre module —
// ADR-078). L'attestation reste un ACTE HUMAIN EXPLICITE (plafond L2) : ce
// que l'auditeur a tapé dans les champs part AVEC l'attestation — corriger et
// attester sont le même geste, pas deux écrans.

export async function attesterAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const item = String(fd.get('sample_item_id') ?? '');
  const chemin = `/eng/${engagementId}/testing${item ? `?item=${item}` : ''}`;
  return executer(chemin, async () => {
    const { user } = await requireMember(engagementId);
    const extractionId = String(fd.get('extraction_id') ?? '');
    const existante = await q1<{ fields: ExtractedField[] }>(
      `select fields from extraction where id = $1`, [extractionId],
    );
    /* Les corrections tapées remplacent la valeur machine, champ par champ ;
       un champ laissé tel quel garde sa valeur. Rien ne se perd, rien ne
       s'invente. */
    let corrige = false;
    const fields = existante.fields.map((f) => {
      const saisi = fd.get(`champ_${f.name}`);
      if (saisi !== null && String(saisi) !== f.value) { corrige = true; return { ...f, value: String(saisi) }; }
      return f;
    });
    await verifyExtraction(extractionId, user.id, corrige ? fields : undefined);
  });
}

export async function clarifierLotAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  return executer(`/eng/${engagementId}/testing`, async () => {
    const { user } = await requireMember(engagementId);
    const ids = String(fd.get('lignes') ?? '').split(',').filter(Boolean);
    await demandeClarificationLignes(engagementId, ids, String(fd.get('motif') ?? ''), user.id);
  });
}

/* LA GRILLE (W1) : conclure une ligne (touche V) et disposer une cellule sont
   des ACTES HUMAINS, et leurs refus (TEST-02, TEST-03, TEST-04) voyagent dans
   `?erreur=` pour que l'écran les dise — jamais en 500. La ligne reste ouverte
   (`?item=`) : le refus se lit à côté de ce qu'il refuse. */
export async function conclureAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const item = String(fd.get('sample_item_id') ?? '');
  return executer(`/eng/${engagementId}/testing${item ? `?item=${item}` : ''}`, async () => {
    const { user } = await requireMember(engagementId);
    await conclureLigne(engagementId, item, user.id);
  });
}

export async function disposerAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const item = String(fd.get('sample_item_id') ?? '');
  return executer(`/eng/${engagementId}/testing${item ? `?item=${item}` : ''}`, async () => {
    const { user } = await requireMember(engagementId);
    await disposerCellule(engagementId, String(fd.get('cell_id') ?? ''), user.id, String(fd.get('motif') ?? ''));
  });
}
