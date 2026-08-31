import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { importerProcessus } from './processus';
import {
  creerEntretien, consignerComprehension, deposerTranscript, analyserTranscript,
  statuerEcart, lireEntretiens, purgerTranscriptsEchus, obstaclesEntretiens,
} from './entretiens';

// L'ENTRETIEN (point 2, ADR-108) — consentement tracé, module qui fonctionne
// SANS enregistrement, transcript → écarts CANDIDATS (omissions d'abord),
// chaque écart statué par une personne. Zéro réseau : l'analyste est le rejeu
// enregistré (dataset/fixtures/entretiens.json).

const TRANSCRIPT = fs.readFileSync(
  path.join(repoRoot(), 'dataset', 'entretiens', 'transcript-revenus-2025.txt'), 'utf8');
const lireDs = (f: string) => new Uint8Array(fs.readFileSync(path.join(repoRoot(), 'dataset', 'processus', f)));

const PARTICIPANTS = [
  { nom: 'Théo Girard', qualite: 'chef comptable', consentement: true },
  { nom: 'Karim Bensalem', qualite: 'auditeur', consentement: true },
];

describe('entretiens et écarts candidats (ADR-108)', () => {
  let itvId: string;

  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n1', filename: 'revenus_2024.json',
      contenu: lireDs('revenus_2024.json'), userId: IDS.users.karim,
    });
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'revenus_2025.json',
      contenu: lireDs('revenus_2025.json'), userId: IDS.users.karim,
    });
    itvId = await creerEntretien({
      engagementId: IDS.engNep, cycle: 'REVENUE', date: '2026-01-12',
      sujet: 'Cycle ventes — compréhension du processus', support: 'enregistrement',
      participants: PARTICIPANTS, retentionUntil: '2026-07-12', userId: IDS.users.karim,
    });
  }, 180000);

  it('le mode « notes » fonctionne SANS consentement — et refuse un transcript', async () => {
    const notes = await creerEntretien({
      engagementId: IDS.engNep, cycle: 'REVENUE', date: '2026-01-05',
      sujet: 'Point préparatoire', support: 'notes',
      participants: [{ nom: 'Sophie Marchand', qualite: 'DAF', consentement: false }],
      userId: IDS.users.karim,
    });
    await consignerComprehension(notes, 'Notes manuscrites reprises : le module facturation est entré en service à l\'été.', IDS.users.karim);
    await expect(deposerTranscript(notes, 'texte', IDS.users.karim))
      .rejects.toThrow(/support « notes »/);
  });

  it('l\'enregistrement exige le consentement de CHAQUE participant et une conservation écrite — tracés', async () => {
    await expect(creerEntretien({
      engagementId: IDS.engNep, cycle: 'REVENUE', date: '2026-01-12', sujet: 'x',
      support: 'enregistrement',
      participants: [{ nom: 'A', qualite: '', consentement: true }, { nom: 'B', qualite: '', consentement: false }],
      retentionUntil: '2026-07-12', userId: IDS.users.karim,
    })).rejects.toThrow(/consentement EXPLICITE.*B/);
    await expect(creerEntretien({
      engagementId: IDS.engNep, cycle: 'REVENUE', date: '2026-01-12', sujet: 'x',
      support: 'enregistrement', participants: [{ nom: 'A', qualite: '', consentement: true }],
      userId: IDS.users.karim,
    })).rejects.toThrow(/durée de conservation/);
    const [lu] = (await lireEntretiens(IDS.engNep)).filter((i) => i.id === itvId);
    expect(lu.participants.every((p) => p.consentement && p.quand)).toBe(true);  // qui, et quand
    expect(lu.retentionUntil).toBe('2026-07-12');
  });

  it('l\'analyse exige un transcript ; le rejeu REFUSE un transcript inconnu en le disant', async () => {
    await expect(analyserTranscript(itvId, IDS.users.karim)).rejects.toThrow(/aucun transcript/);
    const autre = await creerEntretien({
      engagementId: IDS.engNep, cycle: 'REVENUE', date: '2026-01-20', sujet: 'suite',
      support: 'enregistrement', participants: PARTICIPANTS, retentionUntil: '2026-07-20',
      userId: IDS.users.karim,
    });
    await deposerTranscript(autre, 'Un entretien que personne n\'a enregistré dans les fixtures.', IDS.users.karim);
    await expect(analyserTranscript(autre, IDS.users.karim))
      .rejects.toThrow(/rejeu enregistré ne connaît pas/);
  });

  it('le rejeu retrouve les écarts ENREGISTRÉS — les omissions d\'abord — et écrit un ai_run', async () => {
    await deposerTranscript(itvId, TRANSCRIPT, IDS.users.karim);
    await expect(deposerTranscript(itvId, TRANSCRIPT, IDS.users.karim)).rejects.toThrow(/déjà déposé/);
    const r = await analyserTranscript(itvId, IDS.users.karim);
    expect(r.ajoutes).toBe(3);
    expect(r.adapter).toBe('mock');
    const [lu] = (await lireEntretiens(IDS.engNep)).filter((i) => i.id === itvId);
    expect(lu.ecarts.map((e) => e.kind)).toEqual(['omission_doc', 'omission_orale', 'contradiction']);
    expect(lu.ecarts[0].description).toMatch(/revue analytique/);
    expect(lu.ecarts[1].description).toMatch(/CP-02/);
    const run = await q1<{ purpose: string; adapter: string }>(
      `select purpose, adapter from ai_run where id = (select ai_run_id from transcript_gap where id = $1)`,
      [lu.ecarts[0].id],
    );
    expect(run.purpose).toBe('transcript_gaps');
    expect(run.adapter).toBe('mock');
    await expect(analyserTranscript(itvId, IDS.users.karim)).rejects.toThrow(/déjà analysé/);
  });

  it('chaque écart se STATUE par une personne : facteur PROPOSÉ, question en BROUILLON, écarté avec motif — jamais deux fois', async () => {
    const [lu] = (await lireEntretiens(IDS.engNep)).filter((i) => i.id === itvId);
    const [omissionDoc, omissionOrale, contradiction] = lu.ecarts;

    expect((await obstaclesEntretiens(IDS.engNep))[0]).toMatch(/3 écart\(s\) candidat\(s\)/);

    await statuerEcart({ gapId: omissionDoc.id, decision: 'factor', userId: IDS.users.lea });
    const f = await q01<{ status: string }>(
      `select status from risk_factor_declared where engagement_id = $1 and source_ref = $2`,
      [IDS.engNep, `entretien:${itvId}:1`],
    );
    expect(f?.status).toBe('proposed');                 // proposé — un humain confirme au registre

    await statuerEcart({ gapId: omissionOrale.id, decision: 'question', userId: IDS.users.lea });
    const apres = (await lireEntretiens(IDS.engNep)).find((i) => i.id === itvId)!;
    const rid = await q1<{ request_id: string }>(
      `select request_id::text from transcript_gap where id = $1`, [omissionOrale.id]);
    const req = await q1<{ status: string; title: string }>(
      `select status, title from request where id = $1`, [rid.request_id]);
    expect(req.status).toBe('draft');                   // rien ne part sans approbation (L2)
    expect(req.title).toMatch(/Entretien du 2026-01-12/);
    const items = await q<{ description: string }>(
      `select description from request_item where request_id = $1`, [rid.request_id]);
    expect(items).toHaveLength(1);
    expect(items[0].description).toMatch(/CP-02/);

    await expect(statuerEcart({ gapId: contradiction.id, decision: 'dismissed', userId: IDS.users.lea }))
      .rejects.toThrow(/motif requis/);
    await statuerEcart({
      gapId: contradiction.id, decision: 'dismissed',
      reason: 'La fréquence documentée sera corrigée avec le client — suivie par la question posée sur CP-01.',
      userId: IDS.users.lea,
    });
    await expect(statuerEcart({ gapId: contradiction.id, decision: 'question', userId: IDS.users.lea }))
      .rejects.toThrow(/déjà statué/);

    expect(await obstaclesEntretiens(IDS.engNep)).toEqual([]);
    expect(apres.ecarts.filter((e) => e.status === 'candidate').length).toBeLessThan(3);
  });

  it('la purge à l\'échéance : le transcript disparaît, la compréhension et les écarts RESTENT', async () => {
    await consignerComprehension(itvId, 'Compréhension documentée : facturation automatisée depuis les BL, contrôles espacés depuis l\'été.', IDS.users.karim);
    expect(await purgerTranscriptsEchus(IDS.engNep, '2026-06-30', IDS.users.karim)).toBe(0);
    expect(await purgerTranscriptsEchus(IDS.engNep, '2026-07-13', IDS.users.karim)).toBeGreaterThanOrEqual(1);
    const lu = (await lireEntretiens(IDS.engNep)).find((i) => i.id === itvId)!;
    expect(lu.transcriptDepose).toBe(false);
    expect(lu.transcriptPurge).toBe(true);              // l'écran le DIT, il ne le tait pas
    expect(lu.ecarts.length).toBe(3);
    expect(lu.comprehension).toMatch(/facturation automatisée/);
  });
});
