import { freshMemoryDb, _setDbForTests } from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { seedBase } from '@/lib/seed';

// Test harness: fresh in-memory PGlite with schema (+ optional demo seed). Zero network.

export async function initTestDb(opts: { seed?: boolean } = {}): Promise<void> {
  const db = await freshMemoryDb();
  _setDbForTests(db);
  await migrate(db);
  if (opts.seed !== false) await seedBase();
}
