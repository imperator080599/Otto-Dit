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

/**
 * LIRE UNE PIÈCE, ET VÉRIFIER QU'ELLE EST BIEN CELLE QU'ON DEMANDE
 * (revue hostile n°9, constat 9).
 *
 * Le magasin est ADRESSÉ PAR CONTENU : le chemin EST le sha256. Cette
 * propriété n'était affirmée nulle part et vérifiée nulle part — et
 * `saveBlob` fait `on conflict (storage_path) do nothing`, donc le PREMIER
 * qui dépose un chemin le tient. Sous `otto_app` (étape 3 de PLAN_RLS), un
 * cabinet aurait pu pré-insérer un couple chemin/octets et faire relire SES
 * octets à la place de la pièce d'un autre : une substitution de preuve dans
 * un fichier d'audit, sans une ligne de journal.
 *
 * Le contrat se vérifie donc à la lecture, des deux côtés (base ET disque) :
 * si le contenu ne rend pas l'adresse qu'on a demandée, on REFUSE. Coût : un
 * sha256 sur des octets déjà chargés.
 *
 * OÙ CETTE VÉRIFICATION CESSE DE REGARDER : elle protège la LECTURE, pas la
 * lecture croisée. La politique de `blob_store` reste `using (true)` : sous
 * `otto_app`, `select bytes from blob_store` rend les pièces de tous les
 * cabinets. Dette nommée dans 0140 et docs/PLAN_RLS.md, à fermer avant l'étape 3.
 */
export async function readBlob(storagePath: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  if (mode() === 'db') {
    const row = await q01<{ bytes: Uint8Array | Buffer }>(
      `select bytes from blob_store where storage_path = $1`, [storagePath]);
    if (!row) throw new Error(`pièce absente du magasin : ${storagePath}`);
    bytes = new Uint8Array(row.bytes);
  } else {
    bytes = new Uint8Array(fs.readFileSync(path.join(blobRoot(), storagePath)));
  }
  verifierAdresse(storagePath, bytes);
  return bytes;
}

/** BLOB-01 — le contenu doit rendre l'adresse par laquelle on l'a demandé. */
export function verifierAdresse(storagePath: string, bytes: Uint8Array): void {
  /* Un chemin qui ne suit pas la convention `aa/sha256` n'est pas adressé par
     contenu : on ne prétend pas le vérifier (les magasins d'avant 0028, s'il
     en reste). La règle dit où elle cesse de regarder. */
  const attendu = storagePath.split(/[\\/]/).pop() ?? '';
  if (!/^[0-9a-f]{64}$/.test(attendu)) return;
  const reel = sha256(bytes);
  if (reel !== attendu) {
    throw new Error(
      `BLOB-01 : la pièce « ${storagePath} » ne rend pas son adresse — le magasin est adressé par CONTENU, `
      + `et le contenu lu a pour empreinte ${reel.slice(0, 12)}…. Contenu substitué, ou magasin corrompu : `
      + `la pièce n’est pas servie.`);
  }
}

export async function blobExists(storagePath: string): Promise<boolean> {
  if (mode() === 'db') {
    return Boolean(await q01(`select 1 from blob_store where storage_path = $1`, [storagePath]));
  }
  return fs.existsSync(path.join(blobRoot(), storagePath));
}
