import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { GET } from './route';

// P2-02 (AUD-05) — LA LECTURE « déclencheur EQUIPE-01 sur engagement_member » DE /api/sante.
//
// Contrairement à la lecture d'étanchéité (P2-01), qui balaie du TEXTE, celle-ci interroge la
// base : `pg_trigger` peut vraiment changer (une migration qui le recrée mal, une commande
// manuelle). Le cas connu mauvais (règle 17) DÉSACTIVE le déclencheur réel dans la base de
// test, en chemin — jamais un mock — puis le réactive dans un `finally`.
describe('déclencheur EQUIPE-01 sur engagement_member (P2-02, AUD-05) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => {
    process.env.OTTO_DEMO_PUBLIC = AVANT;
  });

  it('en l’état réel du dépôt : le déclencheur existe et est actif — la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('déclencheur EQUIPE-01'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toMatch(/déclencheur actif/);
  });

  it('cas connu mauvais (règle 17) : le déclencheur désactivé fait rougir la lecture', async () => {
    await q(`alter table engagement_member disable trigger equipe01_acteur_manager_partner`);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('déclencheur EQUIPE-01'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toMatch(/DÉSACTIVÉ/);
      expect(rouge.status).toBe(500);
    } finally {
      await q(`alter table engagement_member enable trigger equipe01_acteur_manager_partner`);
    }
    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('déclencheur EQUIPE-01'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });
});
