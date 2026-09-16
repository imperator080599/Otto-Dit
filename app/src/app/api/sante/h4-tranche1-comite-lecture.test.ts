import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { GET } from './route';

// H-4, tranche 1 (Lot 7, docs/REGISTRE_IDEES.md §H, ligne 272) — LA LECTURE /api/sante « la
// synthèse comité cohérente avec le dossier ». Ajoutée LE MÊME JOUR que la tranche (règle 22).
//
// Cette lecture reste INFORMATIVE (voir son commentaire dans route.ts, règle 19) : le seul
// invariant qu'on aurait pu revérifier ici (aucune conclusion vide sur un travail d'achèvement
// conclu) est DÉJÀ un check constraint SQL (`done_needs_substance`, migration 0020) — une garde
// ici ne pourrait jamais échouer (règle 17). Le calcul non trivial de `gouvernance.ts`
// (`jalonProchain`) est, lui, éprouvé contre un cas connu mauvais dans `gouvernance.test.ts`.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-4 tranche 1'))!;
}

describe('H-4 tranche 1 : la lecture /api/sante sur la synthèse comité', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, avec ses papiers réellement importés, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.vide).toBeFalsy();
    expect(lecture.detail).toContain('papier');
    expect(res.status).toBe(200);
  });
});
