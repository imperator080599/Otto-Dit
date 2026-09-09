import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// LOT CONTRÔLE INTERNE, §3.1 (mandat), TRANCHE 4 — LA LECTURE « population dérivée » DE /api/sante.
//
// Cette lecture recalcule FRAÎCHEMENT, à chaque appel, ce que `occurrencesDeLaPeriode` produirait
// pour un contrôle qui porte au moins une ligne `source='derived'`, et compare au contenu réel.
// Elle ne peut rougir que si ce lien a été rompu APRÈS coup — la seule façon de le provoquer dans
// ce test est une écriture directe qui contourne `deriverPopulationControle` (comme CTRL-01/02/03
// le font déjà pour leurs propres cas connus mauvais).

async function poserControleMensuel(code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde population dérivée (lecture)', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code])).id;
}

describe('population dérivée : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune population dérivée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('population dérivée'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune population dérivée');
  });

  it('le vrai chemin gardé (deriverPopulationControle) reste vert', async () => {
    const { deriverPopulationControle } = await import('@/lib/services/sox');
    const controlId = await poserControleMensuel('SONDE-POPLEC-A');
    try {
      await deriverPopulationControle(controlId, IDS.users.karim);
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('population dérivée'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toContain('recalculables à l’identique');
    } finally {
      await q(`delete from control_instance where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais (règle 17) : une ligne dérivée éditée à la main (date décalée) fait rougir /api/sante entier', async () => {
    const { deriverPopulationControle } = await import('@/lib/services/sox');
    const controlId = await poserControleMensuel('SONDE-POPLEC-B');
    try {
      await deriverPopulationControle(controlId, IDS.users.karim);
      // Contournement direct : une ligne dérivée est éditée hors du service (seul moyen de
      // produire ce cas, puisque le service ne réécrit jamais une population déjà présente).
      await q(
        `update control_instance set occurred_on = occurred_on + interval '1 day' where control_id = $1 and label = 'Mois 1, clos le 2025-01-31'`,
        [controlId],
      );
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('population dérivée'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-POPLEC-B');
      expect(lectureRouge.detail).toContain('divergentes');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_instance where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : une population « listing » (source ≠ derived) n’est jamais lue par cette lecture', async () => {
    const { importInstances } = await import('@/lib/services/sox');
    const controlId = await poserControleMensuel('SONDE-POPLEC-C');
    try {
      // Un listing client délibérément « faux » du point de vue d'un dériveur (dates non
      // dérivables) — s'il était lu par erreur, il rougirait ; il ne doit PAS l'être.
      await importInstances(controlId, 'label;occurred_on;performer_name\nn’importe quoi;2025-06-15;Bob\n', IDS.users.karim);
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('population dérivée'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
    } finally {
      await q(`delete from control_instance where control_id = $1`, [controlId]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
