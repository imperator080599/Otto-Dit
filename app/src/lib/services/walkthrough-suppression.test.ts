import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox } from '@/lib/flows/part2';
import {
  attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, setDiStatus,
  documenterFacteurDesign, lierRisqueControle, declarerIuc,
  supprimerVideoWalkthrough, compteurConservationVideo, calculerConservationVideo,
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
 *  besoin : un contrôle réellement CONCLU, pour éprouver VID-01 sur le chemin réel. Rend l'id du
 *  risque créé, pour que l'appelant le nettoie (règle de ce fichier depuis la revue hostile). */
async function conclureDiComplet(controlId: string, engagementId: string, karim: string): Promise<{ riskId: string }> {
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
  return { riskId: risque.id };
}

/** Nettoyage commun (règle 24 : un sous-agent hostile a trouvé trois des quatre tests de ce
 *  fichier sans `finally` — pas de pollution AUJOURD'HUI, chaque fichier vitest a sa propre base
 *  en mémoire (CLAUDE.md §7), mais une incohérence réelle avec la discipline du fichier sœur
 *  (vid01-lecture.test.ts) livré dans le MÊME commit — corrigée ici plutôt que reportée. */
async function nettoyerControle(controlId: string, riskId?: string): Promise<void> {
  await q(`delete from control_iuc where control_id = $1`, [controlId]);
  await q(`delete from control_risk where control_id = $1`, [controlId]);
  await q(`delete from control_design_factor where control_id = $1`, [controlId]);
  await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
  await q(`delete from control_task where control_id = $1`, [controlId]);
  await q(`delete from control where id = $1`, [controlId]);
  if (riskId) await q(`delete from risk where id = $1`, [riskId]);
}

describe('walkthrough : suppression manuelle, provenance, garde VID-01, compteur de conservation (mandat §3)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapSox();
  }, 180000);

  it('supprimerVideoWalkthrough refuse sans motif, sur un contrôle sans vidéo, et sur une vidéo déjà supprimée', async () => {
    const { controlId, evidenceId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-A', IDS.users.karim);
    let sansVideo: string | undefined;
    try {
      await expect(supprimerVideoWalkthrough(controlId, IDS.users.karim, ''))
        .rejects.toThrow(/motif écrit/);
      await expect(supprimerVideoWalkthrough(controlId, IDS.users.karim, '   '))
        .rejects.toThrow(/motif écrit/);

      sansVideo = (await q1<{ id: string }>(
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
    } finally {
      await nettoyerControle(controlId);
      if (sansVideo) await q(`delete from control where id = $1`, [sansVideo]);
    }
  });

  it('supprimerVideoWalkthrough refuse la course : deux suppressions concurrentes sur la MÊME pièce — une seule gagne, l’autre est refusée (jamais un écrasement silencieux)', async () => {
    // CAS CONNU MAUVAIS (règle 17), constat de la revue hostile (deux voix indépendantes, convergent)
    // sur la PREMIÈRE forme de cette fonction : un contrôle « déjà supprimé ? » lu AVANT `tx()`,
    // puis une écriture sans reposer la même condition, laissait deux appels concurrents passer
    // tous les deux — le second écrasant silencieusement le `deleted_by`/`deleted_reason` du
    // premier. Éprouvé directement ici, pas seulement affirmé.
    const { controlId, evidenceId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-COURSE', IDS.users.karim);
    try {
      const [a, b] = await Promise.allSettled([
        supprimerVideoWalkthrough(controlId, IDS.users.karim, 'Premier appel — karim.'),
        supprimerVideoWalkthrough(controlId, IDS.users.lea, 'Second appel — lea.'),
      ]);
      const statuts = [a.status, b.status].sort();
      expect(statuts).toEqual(['fulfilled', 'rejected']);
      const echec = a.status === 'rejected' ? a : (b as PromiseRejectedResult);
      expect(String((echec as PromiseRejectedResult).reason)).toMatch(/déjà supprimé/);

      // La pièce ne porte qu'UNE provenance de suppression — celle de l'appel qui a réellement
      // gagné la course, jamais un mélange ni un écrasement muet.
      const ev = await q1<{ deleted_by: string | null; deleted_reason: string | null }>(
        `select deleted_by::text, deleted_reason from evidence where id = $1`, [evidenceId],
      );
      expect([IDS.users.karim, IDS.users.lea]).toContain(ev.deleted_by);
      expect(['Premier appel — karim.', 'Second appel — lea.']).toContain(ev.deleted_reason);
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('supprimerVideoWalkthrough emprunte le couloir d’amendement post-verrou (0003 §9.4) sur un dossier VERROUILLÉ — cas connu mauvais d’abord (règle 17)', async () => {
    // §3.2 : « la purge d'archivage vise justement l'après-signature » — le seul scénario réel
    // pour lequel ce couloir existe. Aucun des autres tests de ce fichier ne verrouille jamais
    // l'engagement : sans CE test, la garde de verrou existante d'`evidence` (0003) aurait pu être
    // contournée, retirée, ou le `set_config` oublié, et la suite entière serait restée verte —
    // exactement le silence que la règle 17 interdit sur l'instrument le plus neuf de la tranche.
    const { controlId, evidenceId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-VERROU', IDS.users.karim);
    const avantStatut = await q1<{ status: string }>(`select status from engagement where id = $1`, [IDS.engSox]);
    // La pièce qui prouvera l'absence de fuite est déposée AVANT le verrou — `ingestEvidence`
    // n'emprunte pas le couloir d'amendement (elle n'a aucune raison de s'exercer post-clôture),
    // son propre insert échouerait sinon sur la MÊME garde que ce test vérifie plus bas.
    const { evidenceId: autrePieceId } = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'sonde-fuite-verrou.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('x'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    try {
      await q(`update engagement set status = 'locked', locked_at = now() where id = $1`, [IDS.engSox]);

      // CAS CONNU MAUVAIS (règle 17) : sans le couloir d'amendement, une écriture DIRECTE sur
      // `evidence` d'un dossier verrouillé est refusée — la garde de verrou EXISTANTE (0003),
      // pas une garde neuve (0157 n'en pose aucune, par construction — voir son en-tête).
      await expect(q(
        `update evidence set deleted_at = now(), deleted_by = $2, deleted_reason = 'contournement de sonde' where id = $1`,
        [evidenceId, IDS.users.karim],
      )).rejects.toThrow(/locked/);

      // Le chemin réel emprunte le couloir et réussit MALGRÉ le verrou.
      await supprimerVideoWalkthrough(controlId, IDS.users.karim, 'Retrait post-clôture — sonde §3.2.');
      const ev = await q1<{ deleted_at: string | null }>(`select deleted_at::text from evidence where id = $1`, [evidenceId]);
      expect(ev.deleted_at).not.toBeNull();

      // Le réglage ne FUIT PAS : une écriture SANS RAPPORT sur le même dossier, juste après, sans
      // avoir reposé le drapeau, reste refusée — `is_local=true` (tx()) l'a bien effacé au commit.
      await expect(q(
        `update evidence set quarantined = true, quarantine_reason = 'sonde fuite' where id = $1`,
        [autrePieceId],
      )).rejects.toThrow(/locked/);
    } finally {
      await q(`update engagement set status = $2, locked_at = null where id = $1`, [IDS.engSox, avantStatut.status]);
      if (autrePieceId) await q(`delete from evidence where id = $1`, [autrePieceId]);
      await nettoyerControle(controlId);
    }
  });

  it('supprimerVideoWalkthrough respecte l’étanchéité entre cabinets (ETANCH)', async () => {
    const { controlId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-B', IDS.users.karim);
    let autreCabinet: string | undefined;
    let intrus: string | undefined;
    try {
      autreCabinet = (await q1<{ id: string }>(
        `insert into tenant (name) values ('Cabinet de sonde VID-01') returning id::text`,
      )).id;
      intrus = (await q1<{ id: string }>(
        `insert into app_user (tenant_id, name, email, firm_role) values ($1,'Intrus','intrus@sonde.test','staff') returning id::text`,
        [autreCabinet],
      )).id;
      await expect(supprimerVideoWalkthrough(controlId, intrus, 'tentative depuis un autre cabinet'))
        .rejects.toThrow(/ETANCH-01/);
    } finally {
      if (intrus) await q(`delete from app_user where id = $1`, [intrus]);
      if (autreCabinet) await q(`delete from tenant where id = $1`, [autreCabinet]);
      await nettoyerControle(controlId);
    }
  });

  it('VID-01 : conclure un D&I dont la vidéo d’inquiry a été supprimée refuse, sans qu’une autre preuve la remplace', async () => {
    const { controlId } = await controleAvecTacheMinimale(IDS.engSox, 'SONDE-VID01-C', IDS.users.karim);
    let riskId: string | undefined;
    try {
      riskId = (await conclureDiComplet(controlId, IDS.engSox, IDS.users.karim)).riskId;
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
    } finally {
      await nettoyerControle(controlId, riskId);
    }
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

  it('calculerConservationVideo : l’arithmétique PURE (jours restants, purgeable) — exercée directement, sans fabriquer de pack de sonde (règle 17)', () => {
    // Revue hostile (voix 1) : `videoRetentionDays` n'étant JAMAIS posé dans le pack PCAOB/SOX
    // livré (mandat §3.2), la branche `duree.verifie === true` de `compteurConservationVideo`
    // n'était exercée nulle part — ni service ni test. `calculerConservationVideo`, extraite en
    // fonction pure, se teste directement avec une durée FABRIQUÉE ici (le pack réel, lui, reste
    // non posé — ceci n'invente rien au dossier, ce n'est qu'un nombre de sonde pour l'arithmétique).
    const verifie = { valeur: 30, verifie: true as const };
    const nonVerifie = { valeur: null, verifie: false as const };

    // Non éligible : pas de calcul, quoi que porte `duree`.
    expect(calculerConservationVideo(false, false, null, verifie)).toEqual({ eligible: false, joursRestants: null, purgeable: false });

    // Éligible, mais durée non vérifiée : pas de calcul non plus.
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(calculerConservationVideo(true, true, hier, nonVerifie)).toEqual({ eligible: true, joursRestants: null, purgeable: false });

    // Éligible, durée vérifiée, point de départ AUJOURD'HUI : 30 jours restants (arrondi au jour
    // supérieur — un calcul lancé n'importe quand dans la journée ne doit jamais rendre 29).
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const r1 = calculerConservationVideo(true, true, aujourdhui, verifie);
    expect(r1.eligible).toBe(true);
    expect(r1.joursRestants).toBe(30);
    expect(r1.purgeable).toBe(false);

    // Point de départ ANTÉRIEUR de 31 jours à une durée de 30 : la fenêtre est dépassée, purgeable.
    const ilYA31Jours = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
    const r2 = calculerConservationVideo(true, true, ilYA31Jours, verifie);
    expect(r2.joursRestants).toBeLessThanOrEqual(0);
    expect(r2.purgeable).toBe(true);
  });
});
