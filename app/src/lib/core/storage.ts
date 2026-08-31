import fs from 'node:fs';
import path from 'node:path';
import { dataDir, q, q01 } from '@/lib/db/client';
import { sha256 } from './hash';
import { demoPublique } from './demo-public';

// Content-addressed evidence blob store (docs/04 §9.2): blobs never mutate; re-upload of
// identical content maps to the same blob (dedupe is detected at the evidence layer and
// FLAGGED, not merged — a duplicate invoice is audit information).
//
// DEUX MODES (ADR-109, P0a) : `fs` (défaut local — app/.data/blobs) et `db`
// (OTTO_STORAGE=db — table blob_store, pour le déploiement serverless où le
// disque est éphémère et par instance). Même clé dans les deux : aa/sha256.
// OTTO_STORAGE promis par DEPLOY.md n'avait AUCUN chemin de code (règle 13) ;
// il en a un maintenant, et un mode inconnu REFUSE au lieu de retomber en
// silence sur le disque.

function mode(): 'fs' | 'db' {
  /* Sur la démo publique (Vercel), le disque est éphémère et par instance :
     'db' est le seul défaut qui ne perd pas de pièces (DA-08/DA-10) — sans
     dépendre d'une variable de tableau de bord qu'on peut oublier. */
  const m = process.env.OTTO_STORAGE ?? (demoPublique() ? 'db' : 'fs');
  if (m === 'fs' || m === 'db') return m;
  throw new Error(`OTTO_STORAGE « ${m} » inconnu — 'fs' (disque local) ou 'db' (table blob_store). `
    + `Le bucket Supabase Storage est une étape du runbook, pas encore un mode du code (DEPLOY.md).`);
}

export function blobRoot(): string {
  const dir = path.join(dataDir(), 'blobs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveBlob(bytes: Uint8Array): Promise<{ sha256: string; storagePath: string; size: number }> {
  const hash = sha256(bytes);
  const rel = path.join(hash.slice(0, 2), hash);
  if (mode() === 'db') {
    await q(
      `insert into blob_store (storage_path, sha256, size, bytes)
       values ($1,$2,$3,$4) on conflict (storage_path) do nothing`,
      [rel, hash, bytes.byteLength, Buffer.from(bytes)],
    );
    return { sha256: hash, storagePath: rel, size: bytes.byteLength };
  }
  const abs = path.join(blobRoot(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, bytes);
  return { sha256: hash, storagePath: rel, size: bytes.byteLength };
}

export async function readBlob(storagePath: string): Promise<Uint8Array> {
  if (mode() === 'db') {
    const row = await q01<{ bytes: Uint8Array | Buffer }>(
      `select bytes from blob_store where storage_path = $1`, [storagePath]);
    if (!row) throw new Error(`pièce absente du magasin : ${storagePath}`);
    return new Uint8Array(row.bytes);
  }
  return fs.readFileSync(path.join(blobRoot(), storagePath));
}

export async function blobExists(storagePath: string): Promise<boolean> {
  if (mode() === 'db') {
    return Boolean(await q01(`select 1 from blob_store where storage_path = $1`, [storagePath]));
  }
  return fs.existsSync(path.join(blobRoot(), storagePath));
}
