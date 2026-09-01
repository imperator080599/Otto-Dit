import { getDb, closeDb, dbKind, hote } from '../../src/lib/db/client';
import { etatRole, tablesRls, verdictRls, bloc } from '../../src/lib/db/assertions-role';

// npx tsx scripts/db/assertions.ts — LE BLOC D'ASSERTIONS RÔLE / RLS, contre
// la base que DATABASE_URL (ou OTTO_CI_DATABASE_URL) désigne. C'est ce que le
// build Vercel imprime avant de semer ; ici, la même chose depuis la CI
// « rôle de production », sans rien construire.
//
// Il ne tourne JAMAIS contre PGlite : un bloc qui dirait « superutilisateur,
// contourne la RLS » sur la base locale ne prouverait rien de la production.

async function main() {
  if (!process.env.DATABASE_URL && process.env.OTTO_CI_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.OTTO_CI_DATABASE_URL;
  }
  if (dbKind() !== 'pg') {
    console.error('assertions : ni DATABASE_URL ni OTTO_CI_DATABASE_URL — ce bloc ne se lit que contre une base RÉSEAU.');
    process.exit(1);
  }
  console.log(`base réseau : ${hote(process.env.DATABASE_URL!)}`);
  const db = await getDb();
  /* SUR LA BASE DE CI — jetable par définition (DEPLOY.md §0) — le schéma se
     migre d'abord : un bloc lu sur une base vide bénirait le vide (plancher
     dans `verdictRls`), et la suite qui suit en a besoin. Jamais sur la base
     de la démo publique : `DATABASE_URL` posée à la main n'est pas migrée ici,
     c'est le build qui s'en charge. */
  if (process.env.OTTO_CI_DATABASE_URL) {
    const { migrate } = await import('../../src/lib/db/migrate');
    const appliquees = await migrate();
    console.log(`base de CI : ${appliquees.length} migration(s) appliquée(s)`);
  }
  const role = await etatRole(db);
  const tables = await tablesRls(db);
  const defauts = verdictRls(tables);
  for (const l of bloc(role, tables, defauts)) console.log(l);
  await closeDb();
  process.exit(defauts.length ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
