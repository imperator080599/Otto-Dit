import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '@/lib/db/client';
import { sha256 } from './hash';

// Content-addressed evidence blob store (docs/04 §9.2): blobs never mutate; re-upload of
// identical content maps to the same blob (dedupe is detected at the evidence layer and
// FLAGGED, not merged — a duplicate invoice is audit information).

export function blobRoot(): string {
  const dir = path.join(dataDir(), 'blobs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveBlob(bytes: Uint8Array): { sha256: string; storagePath: string; size: number } {
  const hash = sha256(bytes);
  const rel = path.join(hash.slice(0, 2), hash);
  const abs = path.join(blobRoot(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, bytes);
  return { sha256: hash, storagePath: rel, size: bytes.byteLength };
}

export function readBlob(storagePath: string): Uint8Array {
  return fs.readFileSync(path.join(blobRoot(), storagePath));
}

export function blobExists(storagePath: string): boolean {
  return fs.existsSync(path.join(blobRoot(), storagePath));
}
