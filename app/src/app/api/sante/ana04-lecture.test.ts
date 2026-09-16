import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { fsliAccounts } from '@/lib/services/fsli';
import { GET } from './route';

// ANA-04 (Lot 6, mandat 2026-09-05 plan d'autonomie, Partie D.1) — LA LECTURE /api/sante.
//
// La lecture rejoue `obstaclesAnalytique` (obstacles.ts) sur l'état RÉEL du dossier — le même
// chemin que `/obstacles`. Cette suite prouve DEUX choses : le monde de démonstration, où les
// huit revues analytiques du Lot 5 sont fraîchement rédigées, ne rougit pas (VIDE, informatif) ;
// et un solde mué HORS du chemin gardé (SQL direct, jamais un ré-import) fait apparaître le
// compte dans CETTE lecture, non vide, sans pour autant la faire échouer (`ok: true`) — une
// revue périmée est le travail normal d'un dossier en cours, pas une panne (règle 17).

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('ANA-04'))!;
}

describe('ANA-04 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('les huit revues analytiques du monde de démonstration, fraîchement rédigées, ne rougissent pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toBe('VIDE — aucune revue analytique périmée');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : un solde mué hors du chemin gardé fait apparaître le poste dans la lecture, sans la faire échouer', async () => {
    const comptes = await fsliAccounts(IDS.engNep, 'CASH');
    const compte = comptes[0];
    const snap = await q1<{ id: string }>(
      `select id::text from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'`,
      [IDS.engNep],
    );
    await q(`update account set balance = balance + 100 where tb_snapshot_id = $1 and number = $2`, [snap.id, compte.number]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'une revue périmée est informative, jamais une panne de CETTE lecture').toBe(true);
      expect(lecture.vide).toBeFalsy();
      expect(lecture.detail).toContain('CASH');
      expect(res.status).toBe(200);
    } finally {
      await q(`update account set balance = balance - 100 where tb_snapshot_id = $1 and number = $2`, [snap.id, compte.number]);
    }
  });
});
