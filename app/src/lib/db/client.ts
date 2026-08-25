import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';

// PGlite singleton. File-persisted for dev/demo (app/.data/pg), memory for tests.
// Cached on globalThis to survive Next.js HMR reloads (single connection rule).

type G = typeof globalThis & { __ottoDb?: PGlite; __ottoDbReady?: Promise<PGlite> };
const g = globalThis as G;

export function repoRoot(): string {
  // Walk upwards until we find supabase/migrations (works from app/, repo root, tests).
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'supabase', 'migrations'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('repo root with supabase/migrations not found from ' + process.cwd());
}

export function dataDir(): string {
  const root = repoRoot();
  const dir = process.env.OTTO_DATA_DIR ?? path.join(root, 'app', '.data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function open(): Promise<PGlite> {
  const target = process.env.OTTO_DB === 'memory' ? undefined : path.join(dataDir(), 'pg');
  const db = target ? new PGlite(target) : new PGlite();
  await db.waitReady;
  return db;
}

export async function getDb(): Promise<PGlite> {
  if (g.__ottoDb) return g.__ottoDb;
  if (!g.__ottoDbReady) {
    g.__ottoDbReady = open().then((db) => {
      g.__ottoDb = db;
      return db;
    });
  }
  return g.__ottoDbReady;
}

/** Query returning rows. Placeholders: $1, $2… */
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params as never[]);
  return res.rows;
}

/** Query returning the single row (throws if none). */
export async function q1<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length === 0) throw new Error(`expected a row: ${sql.slice(0, 120)}`);
  return rows[0];
}

/** Query returning the single row or null. */
export async function q01<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** Run statements inside a transaction. */
export async function tx<T>(fn: (run: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<T>): Promise<T> {
  const db = await getDb();
  let result!: T;
  await db.transaction(async (t) => {
    result = await fn(async (sql, params = []) => (await t.query(sql, params as never[])).rows);
  });
  return result;
}

/** Test helper: fresh in-memory database (caller applies migrations). */
export async function freshMemoryDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  return db;
}

/** Test helper: point the singleton at a given PGlite instance. */
export function _setDbForTests(db: PGlite): void {
  g.__ottoDb = db;
  g.__ottoDbReady = Promise.resolve(db);
}
