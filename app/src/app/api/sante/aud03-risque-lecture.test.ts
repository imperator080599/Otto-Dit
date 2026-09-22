import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// P1-03 (AUD-03) — LA LECTURE /api/sante « risque : niveau non déduit d'un drapeau RCM ».
//
// `importRcm` (sox.ts) n'écrit plus `level = 'high'|'medium'` depuis un drapeau `is_key` du CSV
// (automatisation factice retirée). Cette lecture attrape ce qu'aucune contrainte SQL ne peut
// voir (`risk.level` reste une colonne ordinaire, nullable) : une ligne `source='rcm_import'`
// avec un `level` non nul — construite ici par une écriture SQL DIRECTE, jamais par le chemin
// réel `importRcm`.
//
// `route.ts` ne boucle PAS sur tous les dossiers : il en choisit UN SEUL (le plus récent
// `statutory_audit`, par date de fin de période). Sur le monde de test bâti par `bootstrapNep()`
// seul, c'est `IDS.engNep` qui est choisi — vérifié en lisant `route.ts`, pas supposé — donc la
// ligne connue mauvaise est insérée sur CE dossier, jamais sur un autre qui ne serait pas lu.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('risque : niveau non déduit'));
}

describe('risque : niveau non déduit d\'un drapeau RCM (AUD-03) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('aucun risk du dossier lu n\'a un niveau deviné : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture!.ok).toBe(true);
    expect(lecture!.detail).toContain('niveau deviné');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : un risk rcm_import avec un level posé (SQL direct) fait rougir /api/sante entier', async () => {
    const devine = await q1<{ id: string }>(
      `insert into risk (engagement_id, assertion, level, description, source)
       values ($1, 'realite', 'high', 'Risque deviné (sonde).', 'rcm_import') returning id::text`,
      [IDS.engNep],
    );
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge).toBeDefined();
      expect(lectureRouge!.ok).toBe(false);
      expect(lectureRouge!.detail).toContain('is_key');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from risk where id = $1`, [devine.id]);
    }
  });
});
