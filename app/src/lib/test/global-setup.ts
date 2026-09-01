// Le `globalSetup` de vitest : NE FAIT RIEN hors mode réseau (PGlite se migre
// par fichier, en mémoire, gratuitement). En mode réseau, migre la base UNE
// fois avant tous les fichiers — voir setup.ts.
export default async function () {
  if (!process.env.OTTO_CI_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.OTTO_CI_DATABASE_URL;
  const { getDb, closeDb, hote } = await import('../db/client');
  const { migrate } = await import('../db/migrate');
  console.log(`mode réseau : migration de ${hote(process.env.DATABASE_URL)}`);
  await getDb();
  const appliquees = await migrate();
  console.log(`mode réseau : ${appliquees.length} migration(s) appliquée(s)`);
  await closeDb();
}
