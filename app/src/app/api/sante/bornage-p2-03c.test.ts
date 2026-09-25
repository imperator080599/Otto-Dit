import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { initTestDb } from '@/lib/test/setup';
import { GET } from './route';

// P2-03c (AUD-07, mandat §11 « Surface publique ») — LE BORNAGE DE /api/sante.
//
// Un appel HTTP RÉEL (NextRequest fourni) doit rendre un corps PUBLIC pauvre
// par défaut — jamais le détail de chaque lecture, jamais même son NOM
// (CORRIGÉ après la revue hostile, voix 1 : un nom de lecture nomme souvent
// une table, un déclencheur ou une tranche de sécurité — ce n'est PAS un
// « code » au sens du mandat, « comptes et codes seulement ») — et le détail
// complet ne s'ouvre qu'avec `?detail=1` ET l'en-tête `X-Otto-Sante` égal à
// `OTTO_SANTE_TOKEN`. Sans la variable posée, le détail reste désactivé même
// avec un en-tête présent (§11 : « absente ⇒ détail désactivé »). L'appel
// INTERNE (`GET()`, zéro argument — la forme que 161 tests « cas connu
// mauvais » utilisent déjà, règle 4/17) reste inchangé : corps complet,
// jamais caché.

function requete(url: string, entetes?: Record<string, string>): NextRequest {
  return new NextRequest(new Request(url, { headers: entetes }));
}

describe('P2-03c : bornage de /api/sante', () => {
  const AVANT_DEMO = process.env.OTTO_DEMO_PUBLIC;
  const AVANT_TOKEN = process.env.OTTO_SANTE_TOKEN;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterEach(() => { process.env.OTTO_SANTE_TOKEN = AVANT_TOKEN; });
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT_DEMO; });

  it('un appel HTTP réel, sans rien demander, rend un corps public — comptes seulement, aucun nom', async () => {
    delete process.env.OTTO_SANTE_TOKEN;
    const res = await GET(requete('http://localhost/api/sante'));
    const body = await res.json();
    expect(body.sha).toBeDefined();
    expect(body.verdict === 'vert' || body.verdict === 'rouge').toBe(true);
    expect(body.lectures).toEqual({
      total: expect.any(Number),
      ok: expect.any(Number),
      cassees: expect.any(Number),
    });
    expect(body.lectures.total).toBeGreaterThan(0);
    expect(body.instance).toBeUndefined();
  });

  it('?detail=1 SANS en-tête (OTTO_SANTE_TOKEN posée) reste public', async () => {
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete('http://localhost/api/sante?detail=1'));
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(false);
  });

  it('?detail=1 avec un en-tête FAUX reste public', async () => {
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete('http://localhost/api/sante?detail=1', { 'x-otto-sante': 'un-autre-jeton' }));
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(false);
  });

  it('?detail=1 avec le bon en-tête ouvre le détail complet — noms et messages inclus', async () => {
    process.env.OTTO_SANTE_TOKEN = 'jeton-de-sonde-assez-long-pour-le-test';
    const res = await GET(requete('http://localhost/api/sante?detail=1', { 'x-otto-sante': 'jeton-de-sonde-assez-long-pour-le-test' }));
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(true);
    expect(body.lectures[0]).toHaveProperty('nom');
    expect(body.lectures[0]).toHaveProperty('detail');
    expect(body.instance).toBeDefined();
  });

  it('OTTO_SANTE_TOKEN absente : ?detail=1 + en-tête ne débloquent rien (cas connu mauvais)', async () => {
    delete process.env.OTTO_SANTE_TOKEN;
    const res = await GET(requete('http://localhost/api/sante?detail=1', { 'x-otto-sante': 'peu-importe-quoi' }));
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(false);
  });

  it('OTTO_SANTE_TOKEN posée à une chaîne VIDE : refuse comme si absente (cas connu mauvais, voix 2)', async () => {
    process.env.OTTO_SANTE_TOKEN = '';
    const res = await GET(requete('http://localhost/api/sante?detail=1', { 'x-otto-sante': '' }));
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(false);
  });

  it('porte Cache-Control: max-age=60 sur un appel HTTP réel', async () => {
    delete process.env.OTTO_SANTE_TOKEN;
    const res = await GET(requete('http://localhost/api/sante'));
    expect(res.headers.get('cache-control')).toBe('max-age=60');
  });

  it('l’appel interne (zéro argument) reste inchangé : corps complet, sans en-tête Cache-Control', async () => {
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.lectures)).toBe(true);
    expect(body.lectures[0]).toHaveProperty('detail');
    expect(body.instance).toBeDefined();
    expect(res.headers.get('cache-control')).toBeNull();
  });
});
