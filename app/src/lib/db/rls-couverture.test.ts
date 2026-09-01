import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { PROPRIETAIRE_SEUL } from './assertions-role';

// LA COUVERTURE RLS NE DOIT PLUS POUVOIR DÉRIVER (ADR-109). 0004 avait posé
// le filet, puis 46 tables sont arrivées sans politique — invisible en local
// (le propriétaire contourne RLS), réel sur une base hébergée. Ce test
// échoue le jour où une table future arrive sans politique : l'oubli
// redevient un test rouge, pas un trou silencieux.
//
// La liste propriétaire-seul vit dans `assertions-role.ts` : c'est le MÊME
// ensemble que le bloc d'assertions imprimé au build contre la base réseau,
// pour qu'une justification ne puisse pas exister ici et manquer là.

describe('couverture RLS (ADR-109)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  it('chaque table publique a RLS activée', async () => {
    const sans = await q<{ tablename: string }>(
      `select t.tablename from pg_tables t join pg_class c on c.relname = t.tablename
       where t.schemaname = 'public' and not c.relrowsecurity order by 1`);
    expect(sans.map((r) => r.tablename)).toEqual([]);
  });

  it('chaque table publique porte une politique — ou figure sur la liste propriétaire-seul, justifiée', async () => {
    const tables = await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by 1`);
    const avec = new Set((await q<{ tablename: string }>(
      `select distinct tablename from pg_policies`)).map((r) => r.tablename));
    const trous = tables
      .map((t) => t.tablename)
      .filter((t) => !avec.has(t) && !PROPRIETAIRE_SEUL.has(t));
    expect(trous, 'tables sans politique RLS ni justification — en ajouter une dans la MIGRATION, pas dans la liste').toEqual([]);
  });

  it('chaque table à RLS l’a FORCÉE — le propriétaire ne la contourne plus (0033, 0034)', async () => {
    const molles = await q<{ relname: string }>(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and c.relrowsecurity and not c.relforcerowsecurity order by 1`);
    expect(molles.map((r) => r.relname)).toEqual([]);
  });

  it('la liste propriétaire-seul ne porte que des tables qui existent — pas de justification fantôme', async () => {
    const tables = new Set((await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename));
    for (const t of PROPRIETAIRE_SEUL) expect(tables.has(t), t).toBe(true);
  });
});
