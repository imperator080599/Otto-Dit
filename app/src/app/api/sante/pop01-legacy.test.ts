import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import { GET } from './route';

// R47 (docs/BACKLOG_REPORTE.md) — LA LISTE LEGACY_AVANT_POP01 DE LA LECTURE
// POP-01 N'AVAIT AUCUNE PREUVE REJOUABLE (règle 12), trouvé par la revue
// hostile (workflow, 2 réviseurs indépendants, convergents) avant le push :
// la démonstration « un id différent rougit encore, l'id exact du legacy
// passe » n'existait que dans un journal de session manuel. CE TEST EST
// CETTE PREUVE, rejouable par `npm test`, sur l'id RÉEL de production
// (`5d1df8b7-…`) — s'il est un jour retiré de `LEGACY_AVANT_POP01`
// (route.ts), ce fichier rougit pour le dire. CE QU'IL NE FAIT PAS (règle
// 19) : il n'éprouve pas la donnée de production elle-même (base en
// mémoire, engagement recréé par bootstrapNep) — seulement que le CODE de
// la lecture réagit à cet id précis comme prévu.

async function semerUnSampleOrphelin(engagementId: string, id: string): Promise<void> {
  await q(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, status)
     values ($1, 'ISA-2024', 'REV-SUBST', 'substantive', 'REVENUE', 'sonde R47', 'in_progress')`,
    [engagementId],
  );
  const pi = await q<{ id: string }>(
    `select id from procedure_instance where engagement_id = $1 and title = 'sonde R47'`,
    [engagementId],
  );
  await q(
    `insert into sample (id, engagement_id, procedure_id, method, params, seed, population_hash, population_size, status)
     values ($1, $2, $3, 'monetary_coverage_random', '{}', 'x', 'y', 0, 'drawn')`,
    [id, engagementId, pi[0].id],
  );
}

describe('R47 : la liste LEGACY_AVANT_POP01 de /api/sante, cas connu mauvais (règle 17)', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(() => { process.env.OTTO_DEMO_PUBLIC = '1'; });
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('un sample orphelin dont l’id N’EST PAS dans la liste rougit toujours (« hors R47 »)', async () => {
    await initTestDb();
    await bootstrapNep(); // AUCUNE réconciliation : populationDuDetailRapproche(engNep, REVENUE) reste null
    await semerUnSampleOrphelin(IDS.engNep, '22222222-2222-4222-8222-222222222222'); // id absent de LEGACY_AVANT_POP01
    const res = await GET();
    const body = await res.json();
    const pop01 = body.lectures.find((l: { nom: string }) => l.nom.startsWith('POP-01'));
    expect(pop01.ok).toBe(false);
    expect(pop01.detail).toContain('hors R47');
    expect(res.status).toBe(500);
  });

  it('le MÊME cas, avec l’id EXACT du legacy R47 de production, ne rougit plus', async () => {
    // Volontairement l'id RÉEL de LEGACY_AVANT_POP01 (route.ts), pas un id de
    // test : ce test protège CETTE entrée précise (celle qui existe pour de
    // vrai en production, `docs/BACKLOG_REPORTE.md` R47), pas la forme
    // générale de l'exclusion — si cette entrée est un jour retirée du
    // tableau, ce test doit ROUGIR pour le dire, pas rester vert par
    // hasard sur une liste devenue vide.
    await initTestDb();
    await bootstrapNep();
    await semerUnSampleOrphelin(IDS.engNep, '5d1df8b7-4ba8-4d55-8f8d-1f2d45de6710');
    const res = await GET();
    const body = await res.json();
    const pop01 = body.lectures.find((l: { nom: string }) => l.nom.startsWith('POP-01'));
    expect(pop01.ok).toBe(true);
    expect(pop01.detail).toContain('legacy R47');
    expect(res.status).toBe(200);
  });
});
