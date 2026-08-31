import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';

// LA BASE, DEUX PILOTES, UNE SURFACE (ADR-109, P0a du mandat).
//
// Local-first inchangé : sans DATABASE_URL, PGlite (postgres en wasm, fichier
// app/.data/pg, mémoire pour les tests) — zéro compte externe. Avec
// DATABASE_URL, un vrai Postgres réseau (Supabase en production) par
// node-postgres. DEPLOY.md promettait ce second chemin depuis le début SANS
// qu'aucun code ne l'implémente — une capacité documentée que rien n'exécute
// (règle 13) ; ce fichier la rend vraie. Les services ne voient que q/q1/q01/tx.

/** Ce que toute base doit savoir faire — PGlite le satisfait nativement. */
export interface OttoDb {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (t: { query<R>(sql: string, params?: unknown[]) : Promise<{ rows: R[] }> }) => Promise<T>): Promise<T | undefined>;
  close(): Promise<void>;
}

type G = typeof globalThis & { __ottoDb?: OttoDb; __ottoDbReady?: Promise<OttoDb>; __ottoDbKind?: 'pglite' | 'pg' };
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

/** Quel pilote sert cette exécution ? 'pg' dès que DATABASE_URL est posée. */
export function dbKind(): 'pglite' | 'pg' {
  return process.env.DATABASE_URL ? 'pg' : 'pglite';
}

// ── Pilote réseau (node-postgres) ────────────────────────────────────────────

/** Import paresseux : le bundle local/démo ne paie jamais le poids de pg, et
 *  PGlite reste le seul chemin quand DATABASE_URL est absente. */
async function openPg(url: string): Promise<OttoDb> {
  const { Pool } = await import('pg');
  /* TLS : Supabase signe ses certificats serveur avec sa propre AC. Le mode
     strict exige cette AC : OTTO_DB_CA_CERT (chemin d'un .crt, fourni par le
     tableau de bord Supabase — DEPLOY.md §1). Sans elle, la connexion reste
     chiffrée mais la chaîne n'est pas vérifiée — accepté pour la DÉMO à
     données fictives, REFUSÉ en production réelle : poser l'AC. */
  const ca = process.env.OTTO_DB_CA_CERT && fs.existsSync(process.env.OTTO_DB_CA_CERT)
    ? fs.readFileSync(process.env.OTTO_DB_CA_CERT, 'utf8')
    : undefined;
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.OTTO_DB_POOL_MAX ?? 5),
    ssl: ca ? { ca } : { rejectUnauthorized: false },
  });
  const db: OttoDb = {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params as never[]);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      // protocole simple : plusieurs ordres dans une seule chaîne (migrations)
      await pool.query(sql);
    },
    async transaction<T>(fn: (t: { query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }> }) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params as never[]);
            return { rows: r.rows as R[] };
          },
        });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
  // Échouer MAINTENANT et lisiblement, pas au premier écran.
  try {
    await db.query('select 1');
  } catch (e) {
    throw new Error(
      `DATABASE_URL est posée mais la base réseau ne répond pas.\n`
      + `  • hôte injoignable (pare-feu sortant, port 5432/6543) ?\n`
      + `  • identifiants ou nom de base erronés ?\n`
      + `  cause d'origine : ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return db;
}

// ── Pilote local (PGlite) ────────────────────────────────────────────────────

async function openPglite(): Promise<PGlite> {
  const target = process.env.OTTO_DB === 'memory' ? undefined : path.join(dataDir(), 'pg');
  const db = target ? new PGlite(target) : new PGlite();
  try {
    await db.waitReady;
  } catch (e) {
    /* TRADUIRE L'ABANDON DU WASM. Quand le répertoire de données est tenu par
       un autre processus (PGlite n'admet QU'UN écrivain) ou abîmé par un arrêt
       brutal, postgres s'arrête et l'appelant reçoit `RuntimeError: Aborted()`
       avec une pile de wasm — un message qui ne dit ni ce qui a échoué ni quoi
       faire. Il m'a coûté deux exécutions complètes de la suite avant d'être
       attribué. Une panne qu'on ne sait pas lire est une panne qu'on impute au
       mauvais changement (règle 13). */
    if (!target) throw e;
    throw new Error(
      `la base locale ne s'ouvre pas (${target}). Deux causes, et une seule commande :\n`
      + `  • un autre processus la tient — PGlite n'admet QU'UN écrivain : un `
      + `\`next dev\`/\`next start\` ou un script encore vivant. Arrêtez-le.\n`
      + `  • elle a été abîmée par un arrêt brutal (conteneur tué en cours d'écriture).\n`
      + `  \`npm run db:setup\` la recrée : elle ne contient que des données `
      + `synthétiques, régénérables par construction.\n`
      + `  cause d'origine : ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return db;
}

async function open(): Promise<OttoDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    g.__ottoDbKind = 'pg';
    return openPg(url);
  }
  g.__ottoDbKind = 'pglite';
  return openPglite() as Promise<OttoDb>;
}

export async function getDb(): Promise<OttoDb> {
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
  const res = await db.query<T>(sql, params);
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
    result = await fn(async (sql, params = []) => (await t.query(sql, params)).rows);
  });
  return result;
}

/**
 * FERMER LA BASE, ET POURQUOI CE N'EST PAS DE L'HYGIÈNE MAIS UNE CORRECTION.
 *
 * PGlite est un postgres complet en wasm : le répertoire de données est chargé
 * DANS le processus. Un processus enfant qui écrit sur le même répertoire n'est
 * donc pas vu par le parent — et il n'admet qu'un écrivain. Un harnais qui
 * ouvre la base, puis lance un script de peuplement en enfant, puis relit,
 * relit sa PROPRE mémoire : le monde a été construit sur le disque et le
 * parent voit toujours une base vide. Il ne plante pas, il constate à tort.
 *
 * Fermer avant de céder la main est le seul moyen de relire ce que l'autre a
 * écrit. Le prochain accès rouvre depuis le disque. (Pilote réseau : ferme le
 * pool — même geste, même raison de propreté.)
 */
export async function closeDb(): Promise<void> {
  const db = g.__ottoDb;
  g.__ottoDb = undefined;
  g.__ottoDbReady = undefined;
  if (db) await db.close();
}

/** Test helper: fresh in-memory database (caller applies migrations). */
export async function freshMemoryDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  return db;
}

/** Test helper: point the singleton at a given PGlite instance. */
export function _setDbForTests(db: PGlite): void {
  g.__ottoDb = db as unknown as OttoDb;
  g.__ottoDbReady = Promise.resolve(db as unknown as OttoDb);
  g.__ottoDbKind = 'pglite';
}
