// H-4 tranche 1 (Lot 7, docs/REGISTRE_IDEES.md §H, ligne 272) : `syntheseComite` AGRÈGE ce que le
// dossier sait déjà de lui-même — elle ne recalcule AUCUN obstacle, AUCUNE règle. Cette suite
// prouve que l'AGRÉGATION coïncide avec une re-dérivation SQL directe des mêmes tables, contre la
// population RÉELLEMENT construite par le monde de démonstration.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1, q01 } from '@/lib/db/client';
import { syntheseComite } from './gouvernance';
import { obstaclesAuVisa } from './obstacles';
import { assurerAchevement, conclure } from './completion';

describe('syntheseComite (H-4 tranche 1) : le périmètre d’audience comité, en pure agrégation', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('obstaclesTotal et visaPossible coïncident exactement avec obstaclesAuVisa', async () => {
    const s = await syntheseComite(IDS.engNep);
    const obstacles = await obstaclesAuVisa(IDS.engNep);
    expect(s.obstaclesTotal).toBe(obstacles.length);
    expect(s.visaPossible).toBe(obstacles.length === 0);
    const parFamilleDirect = new Map<string, number>();
    for (const o of obstacles) parFamilleDirect.set(o.famille, (parFamilleDirect.get(o.famille) ?? 0) + 1);
    for (const f of s.parFamille) expect(f.n).toBe(parFamilleDirect.get(f.famille));
    expect(s.parFamille.length).toBe(parFamilleDirect.size);
  });

  it('papiers signés/total coïncide avec une jointure SQL directe sur workpaper', async () => {
    const s = await syntheseComite(IDS.engNep);
    const direct = await q1<{ signed: string; total: string }>(
      `select count(*) filter (where status = 'signed') signed, count(*) total
       from workpaper where engagement_id = $1 and status <> 'outdated'`,
      [IDS.engNep],
    );
    expect(s.papiers.signes).toBe(Number(direct.signed));
    expect(s.papiers.total).toBe(Number(direct.total));
    expect(s.papiers.total, 'le monde de démonstration porte des papiers — population non vide').toBeGreaterThan(0);
  });

  it('cas connu mauvais (règle 17) : un papier basculé OUTDATED sort immédiatement du compte', async () => {
    const before = await syntheseComite(IDS.engNep);
    const any = await q1<{ id: string; status: string }>(
      `select id::text, status from workpaper where engagement_id = $1 and status <> 'outdated' limit 1`,
      [IDS.engNep],
    );
    await q(`update workpaper set status = 'outdated' where id = $1`, [any.id]);
    try {
      const after = await syntheseComite(IDS.engNep);
      expect(after.papiers.total, 'un papier basculé outdated doit immédiatement quitter le total').toBe(before.papiers.total - 1);
      if (any.status === 'signed') expect(after.papiers.signes).toBe(before.papiers.signes - 1);
      else expect(after.papiers.signes).toBe(before.papiers.signes);
    } finally {
      await q(`update workpaper set status = $2 where id = $1`, [any.id, any.status]);
    }
  });

  it('sans travail d’achèvement ouvert, achevement est un tableau vide — jamais une erreur', async () => {
    // Un dossier fraîchement importé n'a pas encore ouvert l'achèvement (`assurerAchevement`
    // n'a jamais tourné) : l'agrégation doit rester silencieuse, pas planter. DOIT tourner AVANT
    // le test suivant, qui ouvre l'achèvement pour de vrai (assurerAchevement est idempotent mais
    // irréversible dans cette suite — l'ordre des tests vitest est séquentiel par fichier).
    const s = await syntheseComite(IDS.engNep);
    expect(Array.isArray(s.achevement)).toBe(true);
    expect(s.achevement).toHaveLength(0);
  });

  it('le travail d’achèvement « gouvernance » apparaît, conclu, avec son texte — dérivé de completion_item, jamais rédigé ici', async () => {
    await assurerAchevement(IDS.engNep);
    const rapport = await q01<{ report_date: string | null }>(
      `select report_date::text as report_date from engagement where id = $1`, [IDS.engNep],
    );
    if (!rapport?.report_date) {
      // Sans date de rapport, conclure() refuse (completion.ts) — rien à statuer ici.
      const s = await syntheseComite(IDS.engNep);
      const gouv = s.achevement.find((a) => a.nature === 'gouvernance');
      expect(gouv?.status).toBe('open');
      return;
    }
    await conclure(IDS.engNep, IDS.users.claire, 'gouvernance', {
      conclusion: 'synthèse communiquée au comité (fixture de test)',
    });
    const s = await syntheseComite(IDS.engNep);
    const gouv = s.achevement.find((a) => a.nature === 'gouvernance');
    expect(gouv).toBeDefined();
    expect(gouv!.status).toBe('done');
    expect(gouv!.conclusion).toBe('synthèse communiquée au comité (fixture de test)');
  });

  it('jalonsEnRetard coïncide avec engagement_milestone filtré directement en SQL', async () => {
    const s = await syntheseComite(IDS.engNep);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const direct = await q1<{ n: string }>(
      `select count(*) n from engagement_milestone
       where engagement_id = $1 and due_date is not null and done_at is null and due_date < $2`,
      [IDS.engNep, aujourdhui],
    );
    expect(s.jalonsEnRetard).toBe(Number(direct.n));
  });

  it('cas connu mauvais (règle 17) : un jalon EN RETARD ne devient jamais « jalonProchain », même s’il est chronologiquement le plus proche', async () => {
    // Un tri naïf par due_date croissant (sans filtrer les jalons déjà échus) choisirait CE jalon
    // comme « prochain » — c'est exactement le bug que ce cas doit attraper. Un jalon en retard
    // compte dans jalonsEnRetard, jamais dans jalonProchain : les deux se partagent la population,
    // ils ne se recouvrent jamais.
    const bogus = await q1<{ id: string }>(
      `insert into engagement_milestone (engagement_id, code, label, due_date, derived, sort_order)
       values ($1, 'sonde-h4-jalon-passe', 'sonde H-4 : jalon délibérément en retard', '2000-01-01', false, 999)
       returning id::text`,
      [IDS.engNep],
    );
    try {
      const s = await syntheseComite(IDS.engNep);
      expect(s.jalonProchain?.code, 'le jalon en retard ne doit JAMAIS être choisi comme prochain').not.toBe('sonde-h4-jalon-passe');
      const direct = await q1<{ n: string }>(
        `select count(*) n from engagement_milestone
         where engagement_id = $1 and due_date is not null and done_at is null and due_date < $2`,
        [IDS.engNep, new Date().toISOString().slice(0, 10)],
      );
      expect(s.jalonsEnRetard, 'le jalon sonde doit en revanche compter dans jalonsEnRetard').toBe(Number(direct.n));
    } finally {
      await q(`delete from engagement_milestone where id = $1`, [bogus.id]);
    }
  });
});
