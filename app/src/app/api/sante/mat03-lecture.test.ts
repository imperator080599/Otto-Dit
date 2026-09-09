import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep, samplingAndRequest } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// MAT-03 (mandat 2026-09-09, §2.4) — LA LECTURE /api/sante.
//
// `sample_item.unit_id` (quand `unit_kind = 'gl_entry'`) est la SEULE colonne polymorphe de ce
// dossier SANS clé étrangère déclarée — le seul endroit où un orphelin pourrait apparaître sans
// qu'une contrainte de base ne le refuse d'abord. Cette lecture ne peut rougir que si un tel
// orphelin existe — construit ici en SQL direct (un `sample_item` pointant une `gl_entry`
// inexistante), hors de tout chemin réel d'import.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('MAT-03'))!;
}

describe('MAT-03 : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
    /* `bootstrapNep` seul ne tire aucun échantillon (ADR/part1.ts : le tirage vit dans une
       fonction SÉPARÉE, appelée par `demo-seed.ts` mais pas par `bootstrapNep` lui-même) — sans
       cet appel, aucune ligne `sample_item` n'existe pour que ce test ait quoi que ce soit à
       éprouver (trouvé par ce test lui-même : « expected a row » sur la première tentative). */
    await samplingAndRequest();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('aucune ligne de tirage ne pointe une écriture disparue : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('ligne(s) de tirage');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : un sample_item pointant une gl_entry inexistante (SQL direct) fait rougir /api/sante entier', async () => {
    const sample = (await q1<{ id: string }>(
      `select s.id::text from sample s where s.engagement_id = $1 limit 1`,
      [IDS.engNep],
    ));
    expect(sample, 'le monde de démonstration doit déjà porter un tirage — sinon ce test n’a rien à éprouver').toBeDefined();
    const orphelin = (await q1<{ id: string }>(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason, amount, status)
       values ($1, 'gl_entry', gen_random_uuid(), 'random', 1, 'pending') returning id::text`,
      [sample!.id],
    ));
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain(orphelin!.id);
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from sample_item where id = $1`, [orphelin!.id]);
    }
  });
});
