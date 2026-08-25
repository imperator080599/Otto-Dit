import fs from 'node:fs';
import path from 'node:path';
import { getDb, dataDir } from '../src/lib/db/client';
import { migrate } from '../src/lib/db/migrate';
import { seedBase } from '../src/lib/seed';

// npm run db:setup [-- --reset]: apply migrations to the local PGlite store and seed the
// base demo world. --reset wipes app/.data first.

async function main() {
  if (process.argv.includes('--reset')) {
    const dir = dataDir();
    fs.rmSync(path.join(dir, 'pg'), { recursive: true, force: true });
    fs.rmSync(path.join(dir, 'blobs'), { recursive: true, force: true });
    console.log('reset: cleared', dir);
  }
  const applied = await migrate();
  console.log(applied.length ? `migrations applied: ${applied.join(', ')}` : 'migrations: up to date');
  await seedBase();
  console.log('seed: base demo world ready (Vermeil Audit / Altiverre SAS, 2 engagements)');
  const db = await getDb();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
