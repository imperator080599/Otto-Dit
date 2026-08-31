import { q, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { ingestEvidence } from '../evidence';

// LES ANNEXES DU PAPIER (point 11c, ADR-106). La table `wp_attachment` existe
// depuis la PREMIÈRE migration (0002) — demandée dès le début pour joindre un
// tableur de calcul à un papier — et AUCUN chemin de code ne l'atteignait :
// ni écriture, ni lecture, ni écran (règle 13 : l'objet créé qu'aucun chemin
// n'atteint). La voici branchée : le fichier entre par le MÊME moteur de
// pièces que tout le reste (empreinte, provenance `source='auditor'`,
// journal), puis se lie au papier.

export interface AnnexeDePapier {
  id: string;
  evidenceId: string;
  filename: string;
  mime: string;
  sha256: string;
  sizeBytes: number;
  joinedAt: string;
}

export async function joindreAnnexe(
  workpaperId: string,
  fichier: { filename: string; mime: string; bytes: Uint8Array },
  userId: string,
): Promise<string> {
  if (!fichier.bytes.length) throw new Error('annexe : le fichier est vide — rien à joindre');
  const wp = await q1<{ id: string; engagement_id: string; tenant_id: string }>(
    `select w.id, w.engagement_id, e.tenant_id from workpaper w
     join engagement e on e.id = w.engagement_id where w.id = $1`,
    [workpaperId],
  );
  const { evidenceId } = await ingestEvidence({
    engagementId: wp.engagement_id,
    filename: fichier.filename,
    mime: fichier.mime,
    bytes: fichier.bytes,
    source: 'auditor',
    audience: 'internal', // un calcul de travail n'est pas une pièce fournie par la cliente
    uploadedBy: { kind: 'app_user', id: userId },
  });
  const row = await q1<{ id: string }>(
    `insert into wp_attachment (workpaper_id, evidence_id) values ($1, $2) returning id`,
    [workpaperId, evidenceId],
  );
  await logEvent({
    tenantId: wp.tenant_id,
    engagementId: wp.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'workpaper_attachment_added',
    objectType: 'workpaper',
    objectId: workpaperId,
    payload: { evidenceId, filename: fichier.filename },
  });
  return row.id;
}

export async function annexesDuPapier(workpaperId: string): Promise<AnnexeDePapier[]> {
  return (await q<{ id: string; evidence_id: string; filename: string; mime: string; sha256: string; size_bytes: string; created_at: string }>(
    `select a.id::text id, e.id::text evidence_id, e.filename, e.mime, e.sha256,
            e.size_bytes::text, e.created_at::text
     from wp_attachment a join evidence e on e.id = a.evidence_id
     where a.workpaper_id = $1 order by e.created_at`,
    [workpaperId],
  )).map((r) => ({
    id: r.id, evidenceId: r.evidence_id, filename: r.filename, mime: r.mime,
    sha256: r.sha256, sizeBytes: Number(r.size_bytes), joinedAt: r.created_at,
  }));
}
