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
// La lecture RE-DÉRIVE indépendamment (règle 16) que le row_count stocké sur import_file
// coïncide avec un COMPTE DIRECT des rcm_row qui le citent — ne peut diverger que par une
// mutation directe hors du chemin gardé (règle 17) désormais que la boucle d'import tourne dans
// une transaction (correctif de revue hostile).
//
// Un rcm_row SANS import_file_id (rcm_row n'a pas de created_at, 0002) est rendu
// INFORMATIVEMENT, jamais comme un refus — trouvé BLOQUANT par la revue hostile (voix 1) sur la
// première version de cette lecture, qui aurait rougi /api/sante en production sur tout dossier
// dont la RCM avait été importée AVANT cette tranche (migration 0169).

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
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('cas connu bon (règle 17) : un rcm_row SANS provenance (legacy, antérieur à cette tranche) ne fait JAMAIS rougir la lecture', async () => {
    /* Simule un dossier dont la RCM a été importée par une version ANTÉRIEURE à cette tranche —
       exactement l'état réel de tout dossier de production semé avant la migration 0169 : un
       control + rcm_row insérés directement, sans jamais passer par importRcm(), donc sans
       import_file_id. */
    const process1 = await q1<{ id: string }>(
      `insert into process (engagement_id, name) values ($1, 'Sonde legacy') returning id::text`,
      [IDS.engNep],
    );
    const control = await q1<{ id: string }>(
      `insert into control (engagement_id, process_id, code, name, description, frequency, nature, effect, is_key)
       values ($1,$2,'C-LEGACY-01','Contrôle legacy','sonde',  'monthly','manual','preventive', true) returning id::text`,
      [IDS.engNep, process1.id],
    );
    await q(
      `insert into rcm_row (engagement_id, control_id, risk_desc, assertions, coso_component) values ($1,$2,'risque legacy','{}','Control Activities')`,
      [IDS.engNep, control.id],
    );
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture.ok, 'un rcm_row legacy sans provenance ne doit JAMAIS bloquer la lecture').toBe(true);
    expect(lecture.detail).toContain('antérieure');
    expect(res.status).toBe(200);
  });

  it('le monde de démonstration, avec sa RCM réellement importée (provenance), ne rougit pas', async () => {
    const csv = fs.readFileSync(ds('sox', 'rcm.csv'), 'utf8');
    await importRcm(IDS.engNep, csv, IDS.users.karim, 'rcm.csv');
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.vide).toBeFalsy();
    expect(lecture.detail).toContain('rattachée');
    expect(res.status).toBe(200);
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
