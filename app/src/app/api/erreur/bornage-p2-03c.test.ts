import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { initTestDb } from '@/lib/test/setup';
import { GET } from './route';

// P2-03c (AUD-07, mandat §11) — /api/erreur exige désormais l'en-tête
// X-Otto-Sante EN PLUS de demoPublique(), pour ne jamais rendre une pile ni
// un chemin de fonction à un visiteur anonyme de la démonstration publique.

function requete(entetes?: Record<string, string>): NextRequest {
  return new NextRequest(new Request('http://localhost/api/erreur', { headers: entetes }));
}

describe('P2-03c : bornage de /api/erreur', () => {
  const AVANT_DEMO = process.env.OTTO_DEMO_PUBLIC;
  const AVANT_TOKEN = process.env.OTTO_SANTE_TOKEN;
  beforeAll(async () => { await initTestDb(); }, 60000);
  afterEach(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT_DEMO;
    process.env.OTTO_SANTE_TOKEN = AVANT_TOKEN;
  });

  it('rend 404 sans OTTO_SANTE_TOKEN posée, même en démonstration publique', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    delete process.env.OTTO_SANTE_TOKEN;
    const res = await GET(requete());
    expect(res.status).toBe(404);
  });

  it('rend 404 avec OTTO_SANTE_TOKEN posée mais sans en-tête', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete());
    expect(res.status).toBe(404);
  });

  it('rend 404 avec un en-tête FAUX', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete({ 'x-otto-sante': 'un-autre-jeton' }));
    expect(res.status).toBe(404);
  });

  it('répond (pas 404 pour cause de garde) avec le bon en-tête et le bon jeton', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete({ 'x-otto-sante': 'jeton-de-sonde-assez-long-pour-le-test' }));
    // 200 (aucune erreur enregistrée) — jamais 404, qui signalerait la garde X-Otto-Sante.
    expect(res.status).toBe(200);
  });
});
