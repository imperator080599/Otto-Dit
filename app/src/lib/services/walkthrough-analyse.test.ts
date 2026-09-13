import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox } from '@/lib/flows/part2';
import { attacherWalkthrough, ajouterTacheControle, listerTachesControle } from './sox';
import { ingestEvidence } from './evidence';
import { _reinitialiserGardeBudgetEnBasePourSonde } from './extraction/budget';
import {
  deposerTranscriptWalkthrough, analyserWalkthrough, statuerEcartWalkthrough, walkthroughDuControle,
} from './walkthrough-analyse';

// §4 POINT 3 (mandat du 10 septembre 2026, point 1 ; R74) — L'ANALYSE DE WALKTHROUGH.
//
// Même forme qu'entretiens.test.ts (ADR-108) : un transcript déposé, des
// écarts CANDIDATS rejoués (dataset/fixtures/walkthroughs.json), chacun
// statué par une personne — jamais une conclusion automatique. Zéro réseau.

const TRANSCRIPT = "Auditeur : Pouvez-vous me décrire ce que vous faites quand un client demande un avoir ?\nPropriétaire du contrôle : Le commercial saisit la demande d'avoir dans le système, puis moi je la valide avant qu'elle parte en compta. Je regarde toujours le motif et je vérifie le montant par rapport à la facture d'origine.\nAuditeur : Et pour les avoirs au-delà d'un certain montant ?\nPropriétaire du contrôle : Au-dessus de 5 000 euros, j'envoie systématiquement un mail au directeur financier pour qu'il valide aussi, avant que je ne finalise. C'est comme ça depuis le début de l'année, on a resserré le contrôle après un souci l'an dernier.\nAuditeur : Est-ce que vous faites autre chose de régulier sur ce cycle ?\nPropriétaire du contrôle : Oui, une fois par trimestre je fais un point avec la compta sur les avoirs en attente de plus de trente jours, pour être sûr qu'aucun ne traîne. On regarde la liste ensemble.";

async function controleAvecVideo(code: string): Promise<{ controlId: string; evidenceId: string }> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde R74', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engSox, code],
  )).id;
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engSox, filename: `walkthrough-${code}.txt`, mime: 'text/plain',
    bytes: new TextEncoder().encode('synthetic walkthrough video placeholder'), source: 'auditor',
    uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
  });
  await attacherWalkthrough(controlId, IDS.users.karim, evidenceId);
  return { controlId, evidenceId };
}

async function nettoyerControle(controlId: string): Promise<void> {
  await q(`delete from control_walkthrough_gap where control_id = $1`, [controlId]);
  await q(`delete from control_walkthrough_transcript where control_id = $1`, [controlId]);
  await q(`delete from control_task_procedure where task_id in (select id from control_task where control_id = $1)`, [controlId]);
  await q(`delete from control_task where control_id = $1`, [controlId]);
  await q(`delete from control where id = $1`, [controlId]);
}

describe('walkthrough : dépôt, analyse (rejeu), écarts candidats statués (§4 point 3, R74)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapSox();
  }, 180000);

  it('deposerTranscriptWalkthrough refuse sans vidéo attachée, un texte vide, et un second dépôt', async () => {
    const sansVideo = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'SONDE-R74-NUE','x','x','monthly','manual','preventive','not_assessed') returning id::text`,
      [IDS.engSox],
    )).id;
    try {
      await expect(deposerTranscriptWalkthrough(sansVideo, TRANSCRIPT, IDS.users.karim))
        .rejects.toThrow(/aucun enregistrement vidéo attaché/);
    } finally {
      await q(`delete from control where id = $1`, [sansVideo]);
    }

    const { controlId } = await controleAvecVideo('SONDE-R74-A');
    try {
      await expect(deposerTranscriptWalkthrough(controlId, '   ', IDS.users.karim))
        .rejects.toThrow(/vide/);
      await deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim);
      await expect(deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim))
        .rejects.toThrow(/déjà déposé/);
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('analyserWalkthrough exige un transcript déposé ; le rejeu REFUSE un transcript inconnu en le disant', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-B');
    try {
      await expect(analyserWalkthrough(controlId, IDS.users.karim)).rejects.toThrow(/aucun transcript déposé/);
      await deposerTranscriptWalkthrough(controlId, 'Un walkthrough que personne n\'a enregistré dans les fixtures.', IDS.users.karim);
      await expect(analyserWalkthrough(controlId, IDS.users.karim))
        .rejects.toThrow(/rejeu enregistré ne connaît pas/);
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('le rejeu retrouve les écarts ENREGISTRÉS, écrit un ai_run purpose=walkthrough_gaps, et ne se relance pas par-dessus', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-C');
    try {
      await deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim);
      const r = await analyserWalkthrough(controlId, IDS.users.karim);
      expect(r.ajoutes).toBe(2);
      expect(r.adapter).toBe('mock');
      const lu = await walkthroughDuControle(controlId);
      expect(lu.transcriptDepose).toBe(true);
      expect(lu.ecarts.map((e) => e.kind)).toEqual(['omission_doc', 'contradiction']);
      expect(lu.ecarts[0].description).toMatch(/trimestrielle/);
      const run = await q1<{ purpose: string; adapter: string }>(
        `select purpose, adapter from ai_run where id = (select ai_run_id from control_walkthrough_gap where id = $1)`,
        [lu.ecarts[0].id],
      );
      expect(run.purpose).toBe('walkthrough_gaps');
      expect(run.adapter).toBe('mock');
      await expect(analyserWalkthrough(controlId, IDS.users.karim)).rejects.toThrow(/déjà analysé/);
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('chaque écart se STATUE par une personne : question en BROUILLON, NOUVELLE TÂCHE documentée, ou écarté avec motif — jamais deux fois', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-D');
    try {
      await deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim);
      await analyserWalkthrough(controlId, IDS.users.karim);
      const [omission, contradiction] = (await walkthroughDuControle(controlId)).ecarts;

      const avantTaches = await listerTachesControle(controlId);
      await statuerEcartWalkthrough({ gapId: omission.id, decision: 'task', userId: IDS.users.lea });
      const apresTaches = await listerTachesControle(controlId);
      expect(apresTaches.length).toBe(avantTaches.length + 1);
      expect(apresTaches.at(-1)!.description).toMatch(/trimestrielle/);
      const lienTache = await q1<{ control_task_id: string | null }>(
        `select control_task_id::text from control_walkthrough_gap where id = $1`, [omission.id]);
      expect(lienTache.control_task_id).toBe(apresTaches.at(-1)!.id);

      await statuerEcartWalkthrough({ gapId: contradiction.id, decision: 'question', userId: IDS.users.lea });
      const rid = await q1<{ request_id: string }>(
        `select request_id::text from control_walkthrough_gap where id = $1`, [contradiction.id]);
      const req = await q1<{ status: string; title: string }>(`select status, title from request where id = $1`, [rid.request_id]);
      expect(req.status).toBe('draft');
      expect(req.title).toMatch(/Walkthrough du contrôle/);

      await expect(statuerEcartWalkthrough({ gapId: omission.id, decision: 'dismissed', reason: 'x', userId: IDS.users.lea }))
        .rejects.toThrow(/déjà statué/);
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('écarter un écart sans motif écrit refuse — motif requis', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-E');
    try {
      await deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim);
      await analyserWalkthrough(controlId, IDS.users.karim);
      const [omission] = (await walkthroughDuControle(controlId)).ecarts;
      await expect(statuerEcartWalkthrough({ gapId: omission.id, decision: 'dismissed', userId: IDS.users.lea }))
        .rejects.toThrow(/motif requis/);
      await statuerEcartWalkthrough({
        gapId: omission.id, decision: 'dismissed', reason: 'Couvert autrement — voir la tâche 3.', userId: IDS.users.lea,
      });
      const lu = await walkthroughDuControle(controlId);
      expect(lu.ecarts.find((e) => e.id === omission.id)!.status).toBe('dismissed');
    } finally {
      await nettoyerControle(controlId);
    }
  });

  it('respecte l’étanchéité entre cabinets (ETANCH)', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-F');
    let autreCabinet: string | undefined;
    let intrus: string | undefined;
    try {
      autreCabinet = (await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet de sonde R74') returning id::text`)).id;
      intrus = (await q1<{ id: string }>(
        `insert into app_user (tenant_id, name, email, firm_role) values ($1,'Intrus','intrus-r74@sonde.test','staff') returning id::text`,
        [autreCabinet],
      )).id;
      await expect(deposerTranscriptWalkthrough(controlId, TRANSCRIPT, intrus)).rejects.toThrow(/ETANCH-01/);
    } finally {
      if (intrus) await q(`delete from app_user where id = $1`, [intrus]);
      if (autreCabinet) await q(`delete from tenant where id = $1`, [autreCabinet]);
      await nettoyerControle(controlId);
    }
  });

  /* CAS CONNU MAUVAIS (règle 17) : le chemin RÉEL (adaptateur ≠ mock) doit refuser tant que la
     garde de budget EN BASE (IA-BUDGET-01) n'est pas ouverte — câblée pour la première fois dans
     ce dépôt ici. `entretiens.ts` portait le même trou (trouvé par la revue hostile de cette
     tranche) et a été corrigé dans la foulée, avec son propre cas connu mauvais miroir
     (entretiens.test.ts). Éprouvé sans qu'AUCUN octet ne parte sur le réseau : la garde refuse
     AVANT tout `fetch`. */
  it('CAS CONNU MAUVAIS : le chemin réel (OTTO_WALKTHROUGH_ADAPTER=anthropic) refuse IA-BUDGET-01 tant que la garde en base n’est pas ouverte — zéro appel réseau', async () => {
    const { controlId } = await controleAvecVideo('SONDE-R74-G');
    const avant = process.env.OTTO_WALKTHROUGH_ADAPTER;
    process.env.OTTO_WALKTHROUGH_ADAPTER = 'anthropic';
    try {
      await deposerTranscriptWalkthrough(controlId, TRANSCRIPT, IDS.users.karim);
      await expect(analyserWalkthrough(controlId, IDS.users.karim)).rejects.toThrow(/IA-BUDGET-01/);
      const gaps = await q<{ id: string }>(`select id from control_walkthrough_gap where control_id = $1`, [controlId]);
      expect(gaps).toEqual([]);   // le refus est AVANT toute écriture — rien de partiel
    } finally {
      if (avant === undefined) delete process.env.OTTO_WALKTHROUGH_ADAPTER; else process.env.OTTO_WALKTHROUGH_ADAPTER = avant;
      await _reinitialiserGardeBudgetEnBasePourSonde();
      await nettoyerControle(controlId);
    }
  });

  afterEach(async () => {
    // Ceinture : au cas où un test échoué laisserait la garde ouverte pour le suivant.
    await _reinitialiserGardeBudgetEnBasePourSonde();
  });
});
