// LA GARDE IA-BUDGET-01 SUR extractEvidence() — cas connu mauvais (règle 17).
//
// Trouvé le 2026-09-13 par l'audit de surface (scripts/audit/ia-vivante.ts, en réponse à une
// question directe du fondateur) : ce chemin n'appelait QUE `gardeBudget()` (le plafond de
// dépense CUMULÉE), jamais `assertBudgetActifEnBase()` (IA-BUDGET-01, le DROIT même de
// tenter). Aucun test n'exerçait `extractEvidence()` avant celui-ci — le premier, écrit avec
// le correctif, pas après.

import { describe, it, expect, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { saveBlob } from '@/lib/core/storage';
import { extractEvidence } from './ladder';
import { _reinitialiserGardeBudgetEnBasePourSonde } from './budget';

async function pieceReelle(nom: string): Promise<string> {
  const { storagePath } = await saveBlob(new TextEncoder().encode(`sonde IA-BUDGET-01 — ${nom}`));
  const r = await q1<{ id: string }>(
    `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path,
                           source, audience, uploaded_by_kind)
     values ($1,$2,'application/pdf','sha-sonde',10,$3,'email','client_provided','client_contact')
     returning id::text`,
    [IDS.engNep, nom, storagePath]);
  return r.id;
}

describe('extractEvidence : la garde IA-BUDGET-01', () => {
  afterEach(async () => {
    // Ceinture : au cas où un test échoué laisserait la garde ouverte pour le suivant.
    await _reinitialiserGardeBudgetEnBasePourSonde();
  });

  it('CAS CONNU MAUVAIS : le chemin réel (OTTO_OCR_ADAPTER=anthropic) refuse IA-BUDGET-01 tant que la garde en base n’est pas ouverte — zéro appel réseau', async () => {
    await initTestDb();
    await bootstrapNep();
    const evidenceId = await pieceReelle('sonde-ia-budget-01.pdf');
    const avant = process.env.OTTO_OCR_ADAPTER;
    process.env.OTTO_OCR_ADAPTER = 'anthropic';
    try {
      const avantRuns = await q1<{ n: string }>(`select count(*)::text n from ai_run where engagement_id = $1`, [IDS.engNep]);
      await expect(extractEvidence(evidenceId, IDS.users.karim)).rejects.toThrow(/IA-BUDGET-01/);
      const ev = await q1<{ doc_type: string | null }>(`select doc_type from evidence where id = $1`, [evidenceId]);
      expect(ev.doc_type).toBeNull();   // le refus est AVANT toute écriture — rien de partiel
      const apresRuns = await q1<{ n: string }>(`select count(*)::text n from ai_run where engagement_id = $1`, [IDS.engNep]);
      expect(apresRuns.n).toBe(avantRuns.n);   // zéro ai_run écrit par ce refus
    } finally {
      if (avant === undefined) delete process.env.OTTO_OCR_ADAPTER; else process.env.OTTO_OCR_ADAPTER = avant;
    }
  }, 30000);
});
