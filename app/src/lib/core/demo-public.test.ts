import { describe, it, expect, afterEach } from 'vitest';
import { getOcrAdapter } from '@/lib/services/extraction/adapters';
import { getAnalyste } from '@/lib/services/entretiens-analyste';
import { getQueryPlanner } from '@/lib/services/query/adapter';

// LE DÉPLOIEMENT PUBLIC COUPE L'IA RÉELLE (ADR-109) — quoi que disent les
// autres variables. Le chemin se TESTE, il ne se déclare pas : chaque
// fabrique est appelée avec l'environnement le plus payant possible, et doit
// rendre le rejeu quand même.

afterEach(() => {
  delete process.env.OTTO_DEMO_PUBLIC;
  delete process.env.VERCEL;
  delete process.env.OTTO_OCR_ADAPTER;
  delete process.env.OTTO_TRANSCRIPT_ADAPTER;
  delete process.env.OTTO_QUERY_PLANNER;
});

describe('démo publique : IA réelle coupée par construction (ADR-109)', () => {
  it('les trois fabriques rendent le rejeu même quand tout demande le payant', () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    process.env.OTTO_OCR_ADAPTER = 'anthropic';
    process.env.OTTO_TRANSCRIPT_ADAPTER = 'anthropic';
    process.env.OTTO_QUERY_PLANNER = 'anthropic';
    expect(getOcrAdapter().name).toBe('mock');
    expect(getAnalyste().name).toBe('mock');
    expect(getQueryPlanner().name).toBe('disabled');
  });

  it('sur Vercel (VERCEL=1), la coupure tient SANS aucun réglage de tableau de bord', () => {
    process.env.VERCEL = '1';
    process.env.OTTO_OCR_ADAPTER = 'anthropic';
    expect(getOcrAdapter().name).toBe('mock');
    expect(getAnalyste().name).toBe('mock');
  });

  it('hors démo publique, les choix d\'environnement gardent la main', () => {
    process.env.OTTO_OCR_ADAPTER = 'anthropic';
    process.env.OTTO_TRANSCRIPT_ADAPTER = 'anthropic';
    expect(getOcrAdapter().name).toBe('anthropic');
    expect(getAnalyste().name).toBe('anthropic');
  });
});
