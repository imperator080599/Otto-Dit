import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep, samplingAndRequest } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// Étape 5 (plan d'autonomie, Partie B) — LA LECTURE « aucune demande typée
// sans pièce » DE /api/sante, cas connu mauvais (règle 17) : preuve rejouable
// (règle 12) qu'elle rougit bien si une demande typée vide existe — chose que
// `demanderPiecesEnLot` (requests.ts) ne produit jamais lui-même, donc
// atteignable ici uniquement par un contournement direct de la base, comme
// l'en-tête de la lecture le documente.

describe('étape 5 : la lecture /api/sante rougit sur une demande typée vide', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
    await samplingAndRequest();
  }, 180000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune demande typée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('étape 5'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune demande typée');
  });

  it('une demande typée SANS AUCUN élément (contournement direct) fait rougir la lecture', async () => {
    const seq = await q1<{ n: string }>(`select coalesce(max(seq_no), 0) + 1 n from request where engagement_id = $1`, [IDS.engNep]);
    await q(
      `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code)
       values ($1,$2,'sonde étape 5','fr','draft','invoice')`,
      [IDS.engNep, Number(seq.n)],
    );
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('étape 5'));
    expect(lecture.ok).toBe(false);
    expect(lecture.detail).toContain('SANS AUCUN élément');
    expect(res.status).toBe(500);
  });
});
