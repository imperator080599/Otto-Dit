import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { obstaclesMaterialite } from './obstacles';
import { detecterBasculesMaterialite } from './fsli';
import { numToCents, centsToNum } from '@/lib/util/num';

// MAT-01/MAT-02 (mandat 2026-09-09, §2.4) — LES OBSTACLES AU VISA.
//
// MAT-01 : une bascule sans section ouverte — DÉFENSE EN PROFONDEUR, le chemin normal
// (`detecterBasculesMaterialite`, §2.2) garantit déjà la section ; ce test force le manque en SQL
// direct, hors du chemin gardé, pour prouver que l'obstacle sait ATTRAPER la régression (règle 17).
// MAT-02 : une bascule avec des comptes au-dessus du CTT mais sans demande — même discipline.

describe('MAT-01/MAT-02 : les obstacles au visa de la bascule de matérialité', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('une bascule correctement traitée (section ET demande posées par le chemin gardé) ne lève AUCUN obstacle', async () => {
    /* Le monde de démonstration porte de vraies bascules, toutes passées par
       `detecterBasculesMaterialite` (bootstrapNep) — le cas connu BON, protecteur du faux positif
       (règle 25) : une famille neuve ne doit jamais rendre la démonstration insignable. */
    const obstacles = await obstaclesMaterialite(IDS.engNep);
    expect(obstacles.map((o) => o.cle)).not.toContain('obst.basculeSansSection');
    expect(obstacles.map((o) => o.cle)).not.toContain('obst.basculeSansDemandeCtt');
  });

  it('MAT-01, cas connu mauvais (règle 17) : une bascule posée SANS section (SQL direct, hors du chemin gardé) est un obstacle', async () => {
    const code = 'SONDE-MAT01';
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-mat01.csv', 'sonde-sha-mat01', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    await q(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, $2, $3, 'ns_confirmed', 100000, 27000)`,
      [IDS.engNep, code, fichier.id],
    );
    try {
      const obstacles = await obstaclesMaterialite(IDS.engNep);
      const trouve = obstacles.find((o) => o.cle === 'obst.basculeSansSection' && o.vars?.code === code);
      expect(trouve, 'MAT-01 doit lever quand la section manque').toBeDefined();
    } finally {
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, code]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });

  it('MAT-02, cas connu mauvais (règle 17) : une bascule avec un compte au-dessus du CTT mais sans demande est un obstacle', async () => {
    const poste = (await q1<{ code: string }>(
      `select f.code from fsli f
       where f.engagement_id = $1 and f.scoping = 'ns_confirmed'
         and not exists (select 1 from fsli_materiality_bascule b where b.engagement_id = f.engagement_id and b.fsli_code = f.code)
       limit 1`,
      [IDS.engNep],
    ));
    const mat = (await q1<{ ctt_amount: string }>(
      `select ctt_amount::text from materiality where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
      [IDS.engNep],
    ));
    const cttCents = numToCents(mat.ctt_amount);
    const snap = (await q1<{ id: string }>(
      `select id::text from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'`,
      [IDS.engNep],
    ));
    const prefix = 'SONDEMAT02';
    const fs = (await q1<{ accounting_map: string }>(
      `select framework_set->>'accounting_map' accounting_map from engagement where id = $1`,
      [IDS.engNep],
    ));
    /* Même précaution que materialite-bascule.test.ts : poser le `coa_map_rule` en SQL direct,
       jamais via `addMappingOverride` (fsli.ts), qui termine par un `rebuildFslis` réinitialisant
       tout FSLI sans `confirmed_by` (REVENUE) — non pertinent ici mais évité par principe. */
    await q(
      `insert into coa_map_rule (pack_id, engagement_id, account_prefix, fsli_code, priority) values ($1,$2,$3,$4,$5)`,
      [fs.accounting_map, IDS.engNep, prefix, poste.code, 1000 + prefix.length],
    );
    await q(
      `insert into account (tb_snapshot_id, number, label, debit, credit, balance) values ($1, $2, 'Sonde MAT-02', $3, 0, $3)`,
      [snap.id, `${prefix}01`, centsToNum(cttCents + 10000)],
    );
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-mat02.csv', 'sonde-sha-mat02', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    /* Bascule posée EN SQL DIRECT — jamais par `detecterBasculesMaterialite`, qui aurait aussi
       créé la demande CTT et rendrait ce cas mauvais irréalisable (règle 17 : le cas doit
       échapper au chemin gardé pour prouver que l'obstacle, pas le chemin, attrape le manque). */
    await q(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, $2, $3, 'ns_confirmed', 100000, 27000)`,
      [IDS.engNep, poste.code, fichier.id],
    );
    await q(
      `insert into section_state (engagement_id, kind, ref, label) values ($1, 'poste', $2, 'Sonde MAT-02')
       on conflict (engagement_id, kind, ref) do nothing`,
      [IDS.engNep, poste.code],
    );
    try {
      const obstacles = await obstaclesMaterialite(IDS.engNep);
      const trouve = obstacles.find((o) => o.cle === 'obst.basculeSansDemandeCtt' && o.vars?.code === poste.code);
      expect(trouve, 'MAT-02 doit lever quand un compte dépasse le CTT sans demande').toBeDefined();
      /* MAT-01 ne doit PAS lever ici — la section existe, seule la demande manque. */
      expect(obstacles.find((o) => o.cle === 'obst.basculeSansSection' && o.vars?.code === poste.code)).toBeUndefined();
    } finally {
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, poste.code]);
      await q(`delete from section_state where engagement_id = $1 and kind = 'poste' and ref = $2`, [IDS.engNep, poste.code]);
      await q(`delete from account where tb_snapshot_id = $1 and number like $2`, [snap.id, `${prefix}%`]);
      await q(`delete from coa_map_rule where engagement_id = $1 and account_prefix = $2`, [IDS.engNep, prefix]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });

  it('une bascule dont le poste a depuis été confirmé AU PÉRIMÈTRE (in_scope) ne lève plus MAT-01/MAT-02', async () => {
    /* Résolue par le programme normal (§2.4, en-tête de obstaclesMaterialite) : la ligne
       `fsli_materiality_bascule` reste PERMANENTE (règle 28), mais l'obstacle spécifique s'efface
       une fois qu'un humain a confirmé le poste au périmètre — le programme normal (obstacle
       `programme`/`boucle`) prend le relais. */
    const code = 'SONDE-MAT-RESOLUE';
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping)
       values ($1, $2, 'Poste de sonde, résolu', 'BS', 100000, 'in_scope')`,
      [IDS.engNep, code],
    );
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-mat-resolue.csv', 'sonde-sha-resolue', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    await q(
      `insert into fsli_materiality_bascule (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1, $2, $3, 'ns_confirmed', 100000, 27000)`,
      [IDS.engNep, code, fichier.id],
    );
    try {
      const obstacles = await obstaclesMaterialite(IDS.engNep);
      expect(obstacles.find((o) => o.vars?.code === code)).toBeUndefined();
    } finally {
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, code]);
      await q(`delete from fsli where engagement_id = $1 and code = $2`, [IDS.engNep, code]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });
});
