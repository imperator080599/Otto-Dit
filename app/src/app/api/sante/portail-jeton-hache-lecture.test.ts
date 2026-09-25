import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS, PORTAL_TOKENS } from '@/lib/seed';
import { hacherJetonPortail } from '@/lib/core/jeton-portail';
import { GET } from './route';

// P2-03b (AUD-07, migration 0183) — LA LECTURE « jeton portail : haché pour tout
// contact actif » DE /api/sante.
//
// Cas connu mauvais (règle 17) : on met RÉELLEMENT `portal_token_hash` à NULL sur
// un contact actif du monde semé, jamais un mock — puis on le restaure.
describe('jeton portail : haché pour tout contact actif (P2-03b, AUD-07) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT;
  });

  it('en l’état réel du dépôt : tous les contacts actifs sont hachés — la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('jeton portail'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toMatch(/contact\(s\) actif\(s\), tous hachés/);
  });

  it('cas connu mauvais (règle 17) : un contact actif sans hachage fait rougir la lecture', async () => {
    await q(`update client_contact set portal_token_hash = null where id = $1`, [IDS.contacts.sophie]);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('jeton portail'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toMatch(/sans portal_token_hash/);
      expect(rouge.status).toBe(500);
    } finally {
      // Restauration par calcul JS — la même fonction que le service (core/jeton-portail.ts) ;
      // PGlite ne porte pas pgcrypto/sha256 de façon fiable (voir 0183_portail_jeton_hache.sql).
      await q(`update client_contact set portal_token_hash = $2 where id = $1`,
        [IDS.contacts.sophie, hacherJetonPortail(PORTAL_TOKENS.sophie)]);
    }
    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('jeton portail'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });
});
