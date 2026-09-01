'use server';

import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { q1 } from '@/lib/db/client';
import { enregistrerIpe, proposerRedaction, decouperCle } from '@/lib/services/ipe';

/* L'IPE S'ENREGISTRE ICI, et le refus REVIENT À L'ÉCRAN — jamais une page 500
   (règle 13). La proposition de rédaction est un geste SÉPARÉ : elle remplit
   les deux zones, elle n'enregistre rien. */

async function contexte(workpaperId: string) {
  const wp = await q1<{ engagement_id: string }>(
    `select engagement_id::text from workpaper where id = $1`, [workpaperId]);
  const { user } = await requireMember(wp.engagement_id);
  return { engagementId: wp.engagement_id, userId: user.id };
}

export async function ipeAction(fd: FormData): Promise<void> {
  const wid = String(fd.get('workpaper_id') ?? '');
  const { engagementId, userId } = await contexte(wid);
  const url = `/eng/${engagementId}/workpapers/${wid}`;
  const utilisee = fd.get('utilisee') === 'oui';
  try {
    await enregistrerIpe(wid, {
      utilisee,
      nature: (String(fd.get('nature') ?? '') || null) as 'manuelle' | 'systeme' | null,
      rapportCode: String(fd.get('rapport_code') ?? '') || null,
      ...decouperCle(String(fd.get('evidence_id') ?? '')),
      exhaustivite: String(fd.get('exhaustivite') ?? '') || null,
      exactitude: String(fd.get('exactitude') ?? '') || null,
      dateDocument: String(fd.get('date_document') ?? '') || null,
      approprie: fd.get('approprie') === null || String(fd.get('approprie')) === ''
        ? null : String(fd.get('approprie')) === 'oui',
      redigeParIa: fd.get('redige_par_ia') === '1',
    }, userId);
  } catch (e) {
    redirect(`${url}?erreur=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  redirect(url);
}

/**
 * PROPOSER la rédaction. Elle est écrite à partir des FAITS déjà saisis, elle
 * n'enregistre rien, et l'écran la marque comme proposée : c'est une
 * conclusion d'audit, donc un humain la relit et la valide (plafond L2).
 */
export async function proposerIpeAction(fd: FormData): Promise<void> {
  const wid = String(fd.get('workpaper_id') ?? '');
  const { engagementId } = await contexte(wid);
  const url = `/eng/${engagementId}/workpapers/${wid}`;
  const nature = String(fd.get('nature') ?? '') as 'manuelle' | 'systeme';
  const evidenceId = String(fd.get('evidence_id') ?? '');
  if (!nature || !evidenceId) {
    redirect(`${url}?erreur=${encodeURIComponent(
      'Pour proposer une rédaction, il faut d’abord la nature de l’information et le fichier concerné : '
      + 'une phrase écrite sans ces deux faits serait une phrase inventée.')}`);
  }
  const { evidenceId: eid, importFileId: fid } = decouperCle(evidenceId);
  const nom = eid
    ? (await q1<{ filename: string }>(`select filename from evidence where id = $1`, [eid])).filename
    : (await q1<{ filename: string }>(`select filename from import_file where id = $1`, [fid])).filename;
  const p = proposerRedaction({ nature, rapportCode: String(fd.get('rapport_code') ?? ''), nomFichier: nom });
  const qs = new URLSearchParams({
    propose: '1', nature, evidence_id: evidenceId,
    exhaustivite: p.exhaustivite, exactitude: p.exactitude,
  });
  redirect(`${url}?${qs.toString()}`);
}
