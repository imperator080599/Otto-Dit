import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LE POOLER DE TRANSACTION NE PARDONNE PAS LES FONCTIONNALITÉS DE SESSION
// (DA-12). Le runtime hébergé passe par le pooler Supabase en mode
// transaction (port 6543) : pg_advisory_lock (portée SESSION), les requêtes
// préparées nommées et LISTEN/NOTIFY y meurent en silence ou en erreur — en
// production seulement. Ce test interdit leur entrée dans src/ : la variante
// TRANSACTION (pg_advisory_xact_lock) reste la seule permise, et un besoin
// de session futur se traite par connexion dédiée, documentée en DA-12.

const RACINE = path.join(__dirname, '..', '..');

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('compatibilité pooler de transaction (DA-12)', () => {
  it('aucune fonctionnalité de session dans src/ — verrou session, préparée nommée, listen/notify', () => {
    const infractions: string[] = [];
    for (const f of fichiers(RACINE)) {
      const s = fs.readFileSync(f, 'utf8');
      const rel = path.relative(RACINE, f);
      // pg_advisory_lock( — mais PAS pg_advisory_xact_lock(
      if (/pg_advisory_(?:unlock|lock)\s*\(/.test(s)) infractions.push(`${rel} : verrou consultatif de SESSION`);
      if (/\blisten\s+[a-z_"']/i.test(s) && /notify/i.test(s)) infractions.push(`${rel} : LISTEN/NOTIFY`);
      if (/query\s*\(\s*\{\s*name\s*:/.test(s)) infractions.push(`${rel} : requête préparée NOMMÉE`);
    }
    expect(infractions, 'fonctionnalités de session interdites sur le pooler de transaction — DA-12').toEqual([]);
  });
});
