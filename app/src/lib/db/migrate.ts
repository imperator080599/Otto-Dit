import fs from 'node:fs';
import path from 'node:path';
import { getDb, repoRoot, type OttoDb } from './client';

// Applies supabase/migrations/*.sql in lexical order; tracks applied files in _migrations.
// The same .sql files are applied to Supabase in production (DEPLOY.md) — and by the same
// code : `migrate()` roule sur les DEUX pilotes (PGlite local, DATABASE_URL réseau).

export async function migrate(db?: OttoDb): Promise<string[]> {
  const conn = db ?? (await getDb());
  await conn.exec(`create table if not exists _migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(repoRoot(), 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(
    (await conn.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name),
  );
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await conn.exec(sql);
    await conn.query('insert into _migrations(name) values ($1)', [f]);
    applied.push(f);
  }
  return applied;
}
