import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { getDb } from '@/lib/db/client';
import { etatRole, tablesRls, verdictRls, bloc } from './assertions-role';

// LE BLOC D'ASSERTIONS S'ÉPROUVE CONTRE UN CAS CONNU MAUVAIS (règle 17) —
// ici, sur PGlite, avant de tourner sur la base réseau au build.

describe('assertions rôle / RLS', () => {
  beforeAll(async () => { await initTestDb({ seed: false }); }, 120000);

  it('sur la base migrée, aucun défaut — et le rôle local est dit pour ce qu’il est', async () => {
    const db = await getDb();
    const role = await etatRole(db);
    const tables = await tablesRls(db);
    expect(tables.length).toBeGreaterThan(90);
    expect(verdictRls(tables)).toEqual([]);
    /* PGlite sert un superutilisateur : le bloc doit le DIRE, pas afficher une
       RLS « forcée » comme si elle s'appliquait. */
    /* PGlite sert `postgres`, superutilisateur : le bloc DOIT dire qu'il
       contourne la RLS. Une assertion conditionnelle n'affirmerait rien le
       jour où ce fait changerait — on l'affirme. */
    expect(role.bypass).toBe(true);
    expect(bloc(role, tables, []).join('\n')).toContain('CONTOURNE la RLS');
  });

  it('cas connu mauvais — une base VIDE n’est pas verte : le plancher de tables la dénonce', () => {
    expect(verdictRls([])).toEqual(['base non migrée : 0 table(s) publique(s) seulement (le schéma en compte une centaine)']);
    const texte = bloc({ utilisateur: 'otto_ci', bypass: false, superutilisateur: false }, [], verdictRls([])).join('\n');
    expect(texte).toContain('base non migrée');
  });

  it('cas connu mauvais — une table dont FORCE est retiré est nommée', async () => {
    const db = await getDb();
    await db.exec('alter table engagement no force row level security');
    try {
      const d = verdictRls(await tablesRls(db));
      expect(d.some((x) => x.startsWith('engagement : RLS non FORCÉE'))).toBe(true);
    } finally {
      await db.exec('alter table engagement force row level security');
    }
    expect(verdictRls(await tablesRls(db))).toEqual([]);
  });

  it('cas connu mauvais — une politique supprimée sur une table hors liste est nommée', async () => {
    const db = await getDb();
    const pol = (await db.query<{ policyname: string }>(
      `select policyname from pg_policies where tablename = 'workpaper' limit 1`)).rows[0].policyname;
    await db.exec(`drop policy "${pol}" on workpaper`);
    try {
      const d = verdictRls(await tablesRls(db));
      expect(d.some((x) => x.startsWith('workpaper : aucune politique'))).toBe(true);
    } finally {
      await db.exec(`create policy "${pol}" on workpaper using (engagement_id in (select otto_engagements()))`);
    }
    expect(verdictRls(await tablesRls(db))).toEqual([]);
  });

  it('cas connu mauvais — RLS désactivée sur une table', async () => {
    const db = await getDb();
    await db.exec('alter table risk disable row level security');
    try {
      expect(verdictRls(await tablesRls(db))).toContain('risk : RLS non activée');
    } finally {
      await db.exec('alter table risk enable row level security');
    }
  });
});
