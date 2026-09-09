import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox } from '@/lib/flows/part2';
import {
  attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus,
  documenterFacteurDesign, lierRisqueControle, declarerIuc,
  supprimerVideoWalkthrough, compteurConservationVideo,
} from './sox';
import { ingestEvidence } from './evidence';

// MANDAT DU 9 SEPTEMBRE, §3 — LE DÉPÔT ET LA SUPPRESSION MANUELS DE LA VIDÉO DU WALKTHROUGH
// (§3.1 point 1), LE COMPTEUR DE CONSERVATION (§3.2) ET LE CODE DE REFUS VID-01.
//
// Le DÉPÔT (`attacherWalkthrough`) est déjà couvert par s8.test.ts (mandat du 8 septembre) — cette
// suite couvre ce qui est NEUF : la SUPPRESSION (0157, `deleted_at`/`deleted_by`/`deleted_reason`,
// symétrique de `quarantined`), le garde VID-01 à la conclusion (`setDiStatus`), et le compteur de
// conservation informatif.

async function controleAvecTacheMinimale(engagementId: string, code: string, karim: string): Promise<{ controlId: string; evidenceId: string }> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde VID-01/§3.1', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [engagementId, code],
  )).id;
  const { evidenceId } = await ingestEvidence({
    engagementId, filename: `walkthrough-${code}.txt`, mime: 'text/plain',
    bytes: new TextEncoder().encode('synthetic walkthrough transcript'), source: 'auditor',
    uploadedBy: { kind: 'app_user', id: karim }, audience: 'internal',
  });
  await attacherWalkthrough(controlId, karim, evidenceId);
  const taskId = await ajouterTacheControle(controlId, karim, 'tâche de sonde');
  await documenterProcedureTache(taskId, karim, 'inspection', 'inspection de sonde');
  return { controlId, evidenceId };
}

/** Conclut le D&I en entier (les quatre facteurs, un risque réel lié, IUC déclarée non utilisée)
 *  — le même préalable que s8.test.ts pour C-TR-01/C-ITGC-01, réduit à ce dont cette suite a
 *  besoin : un contrôle réellement CONCLU, pour éprouver VID-01 sur le chemin réel. */
async function conclureDiComplet(controlId: string, engagementId: string, karim: string): Promise<void> {
  for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
    await documenterFacteurDesign(controlId, karim, f, `Conclusion pour ${f}.`);
  }
  const risque = await q1<{ id: string }>(
    `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id::text`,
    [engagementId],
  );
  await lierRisqueControle(controlId, karim, risque.id);
  await declarerIuc(controlId, karim, false);
  await setDiStatus(controlId, karim, 'effective', 'D&I effective — sonde.');
}

describe('walkthrough : suppression manuelle, provenance, garde VID-01, compteur de conservation (mandat §3)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapSox();
  }, 180000);

  it('supprimerVideoWalkthrough refuse sans motif, sur un contrôle sans vidéo, et sur une vidéo déjà supprimée', async () => {
    const { controlId, evidenceId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-A', IDS.users.karim);
    await expect(supprimerVideoWalkthrough(controlId, IDS.users.karim, ''))
      .rejects.toThrow(/motif écrit/);
    await expect(supprimerVideoWalkthrough(controlId, IDS.users.karim, '   '))
      .rejects.toThrow(/motif écrit/);

    const sansVideo = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'SONDE-VID01-A-NUE','x','x','monthly','manual','preventive','not_assessed') returning id::text`,
      [IDS.engSox],
    )).id;
    await expect(supprimerVideoWalkthrough(sansVideo, IDS.users.karim, 'motif'))
      .rejects.toThrow(/aucun enregistrement de walkthrough à supprimer/);

    // Défaut retiré : un motif réel supprime la pièce, marque who/when/why, jamais la ligne elle-même.
    await supprimerVideoWalkthrough(controlId, IDS.users.karim, 'Mauvais fichier déposé par erreur.');
    const ev = await q1<{ deleted_at: string | null; deleted_by: string | null; deleted_reason: string | null }>(
      `select deleted_at::text, deleted_by::text, deleted_reason from evidence where id = $1`, [evidenceId],
    );
    expect(ev.deleted_at).not.toBeNull();
    expect(ev.deleted_by).toBe(IDS.users.karim);
    expect(ev.deleted_reason).toBe('Mauvais fichier déposé par erreur.');
    // La ligne evidence n'est JAMAIS détruite (règle 28) — control.di_walkthrough_evidence_id pointe toujours dessus.
    const c = await q1<{ di_walkthrough_evidence_id: string | null }>(`select di_walkthrough_evidence_id from control where id = $1`, [controlId]);
    expect(c.di_walkthrough_evidence_id).toBe(evidenceId);

    // CAS CONNU MAUVAIS (règle 17) : supprimer une seconde fois refuse — déjà supprimée.
    await expect(supprimerVideoWalkthrough(controlId, IDS.users.karim, 'encore'))
      .rejects.toThrow(/déjà supprimé/);

    const evenement = await q1<{ payload: Record<string, unknown> }>(
      `select payload from event_log where verb = 'walkthrough_deleted' and object_id = $1 order by id desc limit 1`,
      [controlId],
    );
    expect(evenement.payload.raison).toBe('Mauvais fichier déposé par erreur.');
  });

  it('supprimerVideoWalkthrough respecte l’étanchéité entre cabinets (ETANCH)', async () => {
    const { controlId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-B', IDS.users.karim);
    const autreCabinet = await q1<{ id: string }>(
      `insert into tenant (name) values ('Cabinet de sonde VID-01') returning id::text`,
    );
    const intrus = await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1,'Intrus','intrus@sonde.test','staff') returning id::text`,
      [autreCabinet.id],
    );
    await expect(supprimerVideoWalkthrough(controlId, intrus.id, 'tentative depuis un autre cabinet'))
      .rejects.toThrow(/ETANCH-01/);
  });

  it('VID-01 : conclure un D&I dont la vidéo d’inquiry a été supprimée refuse, sans qu’une autre preuve la remplace', async () => {
    const { controlId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-C', IDS.users.karim);
    await conclureDiComplet(controlId, IDS.engSox, IDS.users.karim);
    const apresConclusion = await q1<{ di_status: string }>(`select di_status from control where id = $1`, [controlId]);
    expect(apresConclusion.di_status).toBe('effective');

    // La vidéo est supprimée APRÈS coup (le bouton reste disponible à tout moment, §3.1).
    await supprimerVideoWalkthrough(controlId, IDS.users.karim, 'Retrait pour vérification.');

    // CAS CONNU MAUVAIS (règle 17) : re-statuer (ré-évaluer la même conclusion) refuse maintenant — VID-01.
    await expect(setDiStatus(controlId, IDS.users.karim, 'effective', 'Ré-évaluation.'))
      .rejects.toThrow(/VID-01/);

    // Défaut retiré : un NOUVEL enregistrement remplace le lien — plus aucune table de preuve
    // séparée à consulter, `di_walkthrough_evidence_id` pointe déjà sur la pièce neuve.
    const { evidenceId: remplacement } = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'walkthrough-vid01-c-remplacement.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('nouvel enregistrement'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await attacherWalkthrough(controlId, IDS.users.karim, remplacement);
    await setDiStatus(controlId, IDS.users.karim, 'effective', 'Ré-évaluation après remplacement.');
    const apresRemplacement = await q1<{ di_status: string; di_walkthrough_evidence_id: string }>(
      `select di_status, di_walkthrough_evidence_id from control where id = $1`, [controlId],
    );
    expect(apresRemplacement.di_status).toBe('effective');
    expect(apresRemplacement.di_walkthrough_evidence_id).toBe(remplacement);
  });

  it('compteurConservationVideo : non éligible tant que le rapport n’est pas signé ET les notes de revue closes ; verifie:false tant que le cabinet n’a rien fourni (§3.2)', async () => {
    // Emprunte IDS.engSox (déjà équipé, membres et rôles réels — la fermeture d'une note de
    // revue exige un réviseur manager/partner de LA mission, ADR-028) plutôt qu'une mission de
    // sonde qu'il faudrait entièrement ré-équiper. État d'origine restauré en `finally`.
    const avant = await q1<{ report_date: string | null }>(`select report_date::text from engagement where id = $1`, [IDS.engSox]);
    let noteId: string | null = null;
    try {
      // Aucun rapport signé, aucune note : non éligible. `bootstrapSox()` peut avoir déjà posé un
      // `report_date` sur ce dossier (une autre tranche du même monde de démonstration) —
      // l'état de départ de CE test est forcé, jamais supposé (règle 18).
      await q(`update engagement set report_date = null where id = $1`, [IDS.engSox]);
      let compteur = await compteurConservationVideo(IDS.engSox);
      expect(compteur.rapportSigne).toBe(false);
      expect(compteur.eligible).toBe(false);
      expect(compteur.depuis).toBeNull();
      expect(compteur.joursRestants).toBeNull();
      expect(compteur.purgeable).toBe(false);

      // Rapport signé, mais une note de revue reste OUVERTE : toujours non éligible.
      await q(`update engagement set report_date = current_date where id = $1`, [IDS.engSox]);
      noteId = (await q1<{ id: string }>(
        `insert into review_note (engagement_id, author_id, status, text) values ($1,$2,'open','à corriger — sonde VID-01') returning id::text`,
        [IDS.engSox, IDS.users.karim],
      )).id;
      compteur = await compteurConservationVideo(IDS.engSox);
      expect(compteur.rapportSigne).toBe(true);
      expect(compteur.notesClosesToutes).toBe(false);
      expect(compteur.eligible).toBe(false);

      // La note close (par un manager de la mission, jamais son propre auteur — ADR-028) : les
      // deux conditions sont réunies — éligible, mais la durée n'est PAS vérifiée (le pack
      // PCAOB/SOX livre `videoRetentionDays` non posé, mandat §3.2 : « aucune durée n'est
      // inventée ») — le compteur le DIT plutôt que de fabriquer un nombre de jours.
      await q(`update review_note set status = 'closed', closed_at = now(), closed_by = $2 where id = $1`, [noteId, IDS.users.lea]);
      compteur = await compteurConservationVideo(IDS.engSox);
      expect(compteur.notesClosesToutes).toBe(true);
      expect(compteur.eligible).toBe(true);
      expect(compteur.depuis).not.toBeNull();
      expect(compteur.duree.verifie).toBe(false);
      expect(compteur.joursRestants).toBeNull();
      expect(compteur.purgeable).toBe(false);
    } finally {
      if (noteId) await q(`delete from review_note where id = $1`, [noteId]);
      await q(`update engagement set report_date = $2 where id = $1`, [IDS.engSox, avant.report_date]);
    }
  });
});
