import { freshMemoryDb, getDb, _setDbForTests, dbKind, type OttoDb } from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { seedBase } from '@/lib/seed';

// Test harness: fresh in-memory PGlite with schema (+ optional demo seed). Zero network.
//
// ET LE MODE RÉSEAU (Groupe 0 du mandat de nuit, item 106). Avec
// OTTO_CI_DATABASE_URL posée, la MÊME suite tourne contre un Postgres réseau
// par le pooler de transaction, sous le rôle que l'URI désigne — la base que
// la production emprunte, pas celle que le développeur a sous la main. Le
// schéma est migré UNE fois par le `globalSetup` de vitest (chaque fichier de
// test le remigrer coûterait des minutes de réseau) ; chaque fichier repart
// d'une base VIDÉE puis resemée — l'équivalent fonctionnel de la base neuve
// que PGlite donne pour rien.
//
// CE MODE N'EST PAS ENCORE ÉPROUVÉ : écrit sans pouvoir l'exécuter (aucune
// route réseau vers le pooler depuis la machine qui l'a écrit). Il est nommé
// tel quel dans la déclaration de fin de nuit ; le premier lancement de la CI
// « rôle de production » avec le secret posé sera sa première exécution.

export function modeReseau(): boolean {
  return Boolean(process.env.OTTO_CI_DATABASE_URL);
}

export async function initTestDb(opts: { seed?: boolean } = {}): Promise<void> {
  if (modeReseau()) {
    process.env.DATABASE_URL = process.env.OTTO_CI_DATABASE_URL;
    const db = await getDb();
    if (dbKind() !== 'pg') throw new Error('mode réseau demandé, pilote PGlite obtenu — DATABASE_URL n’a pas été prise');
    await refuserLaDemoPublique(db);
    await viderLesTables(db);
  } else {
    const db = await freshMemoryDb();
    _setDbForTests(db);
    await migrate(db);
  }
  if (opts.seed !== false) await seedBase();
}

/**
 * LA SUITE VIDE LA BASE QU'ON LUI DONNE — ELLE REFUSE DONC LA DÉMO PUBLIQUE.
 * Deux gardes, parce qu'un TRUNCATE sur le monde de démonstration détruirait
 * le seul fichier que le fondateur ouvre : (1) la déclaration explicite
 * OTTO_CI_BASE_JETABLE=1 — le secret seul ne suffit pas ; (2) la base de la
 * démo publique porte le schéma `demo_instantane` (l'instantané du monde,
 * DA-17) : une base qui le porte n'est JAMAIS une base de CI, quoi qu'on
 * déclare. Une garde qui n'est qu'un message d'erreur de droits n'est pas une
 * règle — celle-ci refuse par CE QUE LA BASE EST.
 */
async function refuserLaDemoPublique(db: OttoDb): Promise<void> {
  if (process.env.OTTO_CI_BASE_JETABLE !== '1') {
    throw new Error('mode réseau : la suite VIDE la base visée — déclarez-la jetable (OTTO_CI_BASE_JETABLE=1) ou ne posez pas OTTO_CI_DATABASE_URL');
  }
  const r = await db.query<{ n: string }>(
    `select count(*)::text n from information_schema.schemata where schema_name = 'demo_instantane'`);
  if (r.rows[0].n !== '0') {
    throw new Error('mode réseau : cette base porte le schéma demo_instantane — c’est la DÉMONSTRATION PUBLIQUE, jamais une base de CI. Refusé.');
  }
}

/** Toutes les tables publiques sauf le registre des migrations, vidées en un
 *  ordre — TRUNCATE … CASCADE règle les dépendances — avec les séquences
 *  remises à zéro : un identifiant qui continue de monter entre deux fichiers
 *  ferait dévier des attentes écrites sur une base neuve. */
async function viderLesTables(db: OttoDb): Promise<void> {
  const r = await db.query<{ t: string }>(
    `select tablename t from pg_tables where schemaname = 'public' and tablename <> '_migrations'`);
  if (r.rows.length === 0) throw new Error('mode réseau : aucune table — le globalSetup n’a pas migré');
  const noms = r.rows.map((x) => `"${x.t}"`).join(', ');
  await db.exec(`truncate table ${noms} restart identity cascade`);
}
