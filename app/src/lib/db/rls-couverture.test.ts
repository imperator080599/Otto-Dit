import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';

// LA COUVERTURE RLS NE DOIT PLUS POUVOIR DÉRIVER (ADR-109). 0004 avait posé
// le filet, puis 46 tables sont arrivées sans politique — invisible en local
// (le propriétaire contourne RLS), réel sur une base hébergée. Ce test
// échoue le jour où une table future arrive sans politique : l'oubli
// redevient un test rouge, pas un trou silencieux.

/** Tables d'infrastructure sans périmètre métier : RLS activée, AUCUNE
 *  politique — seul le propriétaire (l'application) les lit. Toute addition
 *  ici se justifie par écrit, pas par commodité. */
const PROPRIETAIRE_SEUL = new Set([
  '_migrations',   // registre des migrations — aucun contenu métier
  'app_state',     // préférences locales d'affichage
  'blob_store',    // octets adressés par contenu, servis uniquement par l'app
  'itgc_area',     // référentiel ITGC non rattaché à une mission
  'notification',  // file technique de notifications
]);

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

  it('la liste propriétaire-seul ne porte que des tables qui existent — pas de justification fantôme', async () => {
    const tables = new Set((await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename));
    for (const t of PROPRIETAIRE_SEUL) expect(tables.has(t), t).toBe(true);
  });
});
