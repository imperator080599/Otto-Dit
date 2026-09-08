import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT 4, TRANCHE 1 (mandat, Partie D.1) — LA LECTURE « déplanification
// cohérente » DE /api/sante, cas connu mauvais (règle 17) : preuve rejouable
// (règle 12) qu'elle rougit quand `deplanned_at` est posé SANS `deplanned_by`
// — un état que le SEUL point d'écriture réel (`deplanifierProcedure`) ne
// produit jamais (il pose toujours les deux ensemble), donc contourné ici par
// une écriture DIRECTE en base, exactement comme cette lecture le documente
// en tête de route.ts. `bootstrapNep()` seul ne plante AUCUNE
// `procedure_instance` (même limite que les lectures jumelles d'atelier) :
// ce fichier pose lui-même chaque ligne dont il a besoin.

async function poserProcedure(): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
     values ($1, 'nep-fr', 'SONDE-DEPLAN', 'substantive', 'REVENUE', 'sonde déplanification', 'sondage_pieces')
     returning id::text`,
    [IDS.engNep])).id;
}

describe('déplanification cohérente : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure déplanifiée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('déplanification cohérente'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure déplanifiée');
  });

  it('cas connu mauvais (règle 17) : deplanned_at SANS deplanned_by fait rougir /api/sante entier', async () => {
    const procedureId = await poserProcedure();
    await q(
      `update procedure_instance set deplanned_at = now(), deplanned_by = null where id = $1`,
      [procedureId]);

    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('déplanification cohérente'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('incohéremment');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from procedure_instance where id = $1`, [procedureId]);
    }

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('déplanification cohérente'));
    expect(lectureVerte.ok).toBe(true);
    expect(vert.status).toBe(200);
  });

  it('une procédure réellement déplanifiée (le point d’écriture réel) reste verte, comptée', async () => {
    const cible = await poserProcedure();
    try {
      const { deplanifierProcedure } = await import('@/lib/services/programme');
      await deplanifierProcedure({ procedureId: cible, userId: IDS.users.karim, motif: 'Sonde de lecture.' });

      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('déplanification cohérente'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('1 procédure(s) déplanifiée(s)');
      expect(lecture.detail).toContain('cohérentes');
    } finally {
      await q(`delete from procedure_instance where id = $1`, [cible]);
    }
  });
});
