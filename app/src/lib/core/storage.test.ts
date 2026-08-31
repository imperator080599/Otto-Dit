import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { saveBlob, readBlob, blobExists } from './storage';

// LE MAGASIN DE PIÈCES À DEUX MODES (ADR-109, P0a). OTTO_STORAGE était promis
// par DEPLOY.md sans aucun chemin de code (règle 13) ; le mode 'db' vit dans
// blob_store — et se teste ICI, hors ligne, parce que PGlite EST postgres.

const octets = (s: string) => new TextEncoder().encode(s);

describe('magasin de pièces (ADR-109)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);
  afterEach(() => { delete process.env.OTTO_STORAGE; });

  it('mode db : aller-retour au bit près, ré-envoi idempotent, existence honnête', async () => {
    process.env.OTTO_STORAGE = 'db';
    const contenu = octets('pièce de démonstration — contenu fictif ⚙');
    const a = await saveBlob(contenu);
    const b = await saveBlob(contenu);                    // même contenu → même clé, pas d'erreur
    expect(b.storagePath).toBe(a.storagePath);
    expect(await blobExists(a.storagePath)).toBe(true);
    expect(await blobExists('zz/inexistant')).toBe(false);
    expect(Buffer.from(await readBlob(a.storagePath))).toEqual(Buffer.from(contenu));
    await expect(readBlob('zz/inexistant')).rejects.toThrow(/absente du magasin/);
  });

  it('un mode inconnu REFUSE — jamais un repli silencieux sur le disque', async () => {
    process.env.OTTO_STORAGE = 'supabase';
    await expect(saveBlob(octets('x'))).rejects.toThrow(/OTTO_STORAGE « supabase » inconnu/);
  });

  it('mode fs (défaut) : aller-retour inchangé', async () => {
    const contenu = octets('sur le disque, comme avant');
    const a = await saveBlob(contenu);
    expect(await blobExists(a.storagePath)).toBe(true);
    expect(Buffer.from(await readBlob(a.storagePath))).toEqual(Buffer.from(contenu));
  });
});
