import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { importRcm } from '@/lib/services/sox';
import { q, q1, repoRoot } from '@/lib/db/client';
import { GET } from './route';

// H-5, tranche 1 (Lot 7, docs/REGISTRE_IDEES.md §H, ligne 273) — LA LECTURE /api/sante « la
// provenance RCM cohérente avec le fichier importé ». Ajoutée LE MÊME JOUR que la tranche
// (règle 22).
//
// La lecture RE-DÉRIVE indépendamment (règle 16) : (1) aucun rcm_row orphelin de provenance,
// (2) le row_count stocké sur import_file coïncide avec un COMPTE DIRECT des rcm_row qui le
// citent. Les deux ne peuvent diverger que par une mutation directe hors du chemin gardé
// (règle 17) — importRcm() lui-même ne peut jamais produire cet état.

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; vide?: boolean; detail: string }[];
  return lectures.find((l) => l.nom.startsWith('H-5 tranche 1'))!;
}

describe('H-5 tranche 1 : la lecture /api/sante sur la provenance RCM', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await runPart1UpToWorkpaper();
    const csv = fs.readFileSync(ds('sox', 'rcm.csv'), 'utf8');
    await importRcm(IDS.engNep, csv, IDS.users.karim, 'rcm.csv');
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration, avec sa RCM réellement importée, ne rougit pas', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.vide).toBeFalsy();
    expect(lecture.detail).toContain('rattachées');
    expect(res.status).toBe(200);
  });

  it("cas connu mauvais (règle 17) : un rcm_row rendu orphelin (import_file_id vidé) hors du chemin gardé fait échouer la lecture", async () => {
    const cible = await q1<{ id: string; import_file_id: string }>(
      `select id::text, import_file_id::text from rcm_row where engagement_id = $1 and import_file_id is not null limit 1`,
      [IDS.engNep],
    );
    await q(`update rcm_row set import_file_id = null where id = $1`, [cible.id]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter la ligne RCM orpheline').toBe(false);
      expect(res.status).toBe(500);
    } finally {
      await q(`update rcm_row set import_file_id = $2 where id = $1`, [cible.id, cible.import_file_id]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });

  it('cas connu mauvais (règle 17) : un row_count désynchronisé (édité hors du chemin gardé) fait échouer la lecture', async () => {
    const cible = await q1<{ id: string; row_count: number }>(
      `select id::text, row_count from import_file where engagement_id = $1 and kind = 'rcm' limit 1`,
      [IDS.engNep],
    );
    /* Mutation SQL DIRECTE, hors du chemin gardé : `importRcm()` ne désynchronise JAMAIS
       row_count du compte réel de rcm_row — exactement le scénario que la lecture doit attraper
       (une future extension qui supprimerait un rcm_row sans tenir row_count à jour, par
       exemple). */
    await q(`update import_file set row_count = row_count + 1 where id = $1`, [cible.id]);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok, 'la lecture doit détecter le row_count désynchronisé').toBe(false);
      expect(res.status).toBe(500);
    } finally {
      await q(`update import_file set row_count = $2 where id = $1`, [cible.id, cible.row_count]);
    }
    const apresRevert = await GET();
    const bodyApres = await apresRevert.json();
    expect(trouver(bodyApres).ok, 'la lecture doit redevenir ok après le revert').toBe(true);
  });
});
