// LE LIEN DE DÉMONSTRATION : ce qu'il REFUSE, d'abord.
//
// Un chemin qui pose une identité en GET est une commodité de bac à sable et
// une faille partout ailleurs. Ces tests fixent les trois refus : hors démo
// publique il n'existe pas, une destination absolue ne le détourne pas, un
// inconnu n'ouvre rien.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { GET } from './[qui]/route';

const params = (qui: string) => ({ params: Promise.resolve({ qui }) });
const req = (url: string) => new Request(url);

describe('lien de démonstration — les refus d’abord', () => {
  beforeAll(async () => { await initTestDb(); });
  afterEach(() => { delete process.env.OTTO_DEMO_PUBLIC; delete process.env.VERCEL; });

  it('hors démonstration publique, le chemin N’EXISTE PAS', async () => {
    const r = await GET(req('http://x/demo/claire'), params('claire'));
    expect(r.status).toBe(404);
    expect(await r.text()).toMatch(/démonstration publique/);
  });

  it('sur la démo publique, il pose l’identité et redirige', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    const r = await GET(req('http://x/demo/claire'), params('claire'));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('http://x/');
    expect(r.headers.get('set-cookie') ?? '').toContain(IDS.users.claire);
    expect(r.headers.get('set-cookie') ?? '').toContain('HttpOnly');
  });

  it('il suit une destination RELATIVE, jamais une absolue (redirection ouverte)', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    const ok = await GET(req('http://x/demo/claire?vers=/eng/42/testing'), params('claire'));
    expect(ok.headers.get('location')).toBe('http://x/eng/42/testing');

    for (const piege of ['https://exemple-malveillant.fr/', '//exemple-malveillant.fr/']) {
      const r = await GET(req(`http://x/demo/claire?vers=${encodeURIComponent(piege)}`), params('claire'));
      expect(r.headers.get('location')).toBe('http://x/');
    }
  });

  it('un inconnu est refusé, et la réponse DIT qui existe', async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    const r = await GET(req('http://x/demo/personne'), params('personne'));
    expect(r.status).toBe(404);
    const t = await r.text();
    expect(t).toMatch(/claire/);
    expect(t).toMatch(/karim/);
  });
});
