import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { propose, validate } from '@/lib/services/materiality';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// SUPERSEDE (P1-06, AUD-10, migration 0178) — LA LECTURE /api/sante.
//
// L'invariant « au plus une version courante à la fois » (materiality « validated »,
// process_model « active ») tient PAR CONSTRUCTION dans le service (materiality.ts::validate,
// processus.ts::importerProcessus) et, pour process_model, aussi par l'index partiel SQL
// `process_model_actif`. Cette lecture ne peut rougir sur `materiality` que par un cas connu
// mauvais construit hors du chemin gardé (règle 17) — rien dans le monde de démonstration ne le
// déclenche normalement.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('supersede (P1-06, AUD-10)'))!;
}

describe('supersede (P1-06, AUD-10) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 60000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration ne porte jamais deux matérialités validées simultanées : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('0 doublon');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une deuxième ligne « validated » posée en SQL direct (hors materiality.ts::validate) fait rougir /api/sante entier', async () => {
    /* bootstrapNep() pose déjà une matérialité validée (version 1) — on en propose et valide
       une seconde PAR LE CHEMIN NORMAL (v2), puis on la force ENSUITE à 'validated' EN SQL
       DIRECT, hors service : c'est exactement le bogue que la lecture doit attraper — un
       chemin d'écriture qui contournerait `validate()` et laisserait deux lignes « validated »
       à la fois. Depuis P1-08 (migration 0180), `materiality_validated_unique` REFUSE déjà ce
       contournement au niveau SQL — index retiré ici, comme risk01-lecture.test.ts le fait pour
       sa contrainte, pour reproduire le cas que la LECTURE (défense en profondeur) doit encore
       attraper si l'index était un jour contourné. */
    const v2 = await propose(IDS.engNep, IDS.users.lea);
    await validate(v2, IDS.users.lea); // tel quel — supersède v1 normalement, invariant intact ici
    const v3 = await propose(IDS.engNep, IDS.users.lea);
    await q(`drop index materiality_validated_unique`);
    await q(`update materiality set status = 'validated' where id = $1`, [v3]); // le contournement, exprès
    try {
      const doublons = await q1<{ n: string }>(
        `select count(*)::text n from materiality where engagement_id = $1 and status = 'validated'`, [IDS.engNep]);
      expect(Number(doublons.n)).toBe(2); // garde-fou du test lui-même
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('validated');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`update materiality set status = 'superseded' where id = $1`, [v3]);
      await q(`create unique index materiality_validated_unique on materiality(engagement_id) where status = 'validated'`);
    }
  });
});
