import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT } from '@/lib/services/requests';
import { GET } from './route';

// LA DEMANDE DE DÉTAIL AU-DESSUS DU CTT (mandat 2026-09-09, §2.3) — LA LECTURE /api/sante.
//
// Le SEUL chemin qui pose `EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT` est
// `requests.ts::demanderDetailAuDessusDuCtt`, appelée uniquement par `detecterBasculesMaterialite`
// pour une bascule nouvellement posée. Cette lecture ne peut rougir que si une demande sous ce
// code existe SANS bascule réelle derrière — un cas connu mauvais construit ici en SQL direct,
// hors du chemin gardé.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('demande de détail au-dessus du CTT'))!;
}

describe('demande de détail au-dessus du CTT : la lecture /api/sante (§2.3)', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('les demandes CTT du monde de démonstration sont toutes rattachées à une bascule réelle : la lecture passe', async () => {
    /* GARDE-FOU DU TEST LUI-MÊME (revue hostile, constat 2) : `lecture.ok === true` seul est
       aussi satisfait par « aucune demande CTT pour l'instant » — un monde de démonstration qui
       aurait régressé à zéro demande CTT (par exemple si §2.3 cessait de se déclencher) passerait
       ce test SANS RIEN PROUVER. Le compte réel est donc vérifié directement contre la base. */
    const total = await q1<{ n: string }>(
      `select count(*)::text n from request where evidence_type_code = $1`,
      [EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT],
    );
    expect(Number(total!.n), 'bootstrapNep doit produire de vraies demandes CTT — sinon ce test n’éprouve rien').toBeGreaterThan(0);

    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toBe(`${total!.n} demande(s) de détail au-dessus du CTT, toutes rattachées à une bascule réelle`);
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17) : une demande CTT posée SANS bascule (SQL direct, hors detecterBasculesMaterialite) fait rougir /api/sante entier', async () => {
    const req = (await q1<{ id: string }>(
      `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code, fsli_code)
       values ($1, (select coalesce(max(seq_no),0)+1 from request where engagement_id = $1), 'Sonde CTT orpheline', 'fr', 'draft', $2, 'SONDE-CTT-ORPHELINE')
       returning id::text`,
      [IDS.engNep, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT],
    ));
    /* Garde-fou du test lui-même : aucune bascule ne doit préexister pour ce code inventé. */
    const preexistante = await q1<{ n: string }>(
      `select count(*)::text n from fsli_materiality_bascule where engagement_id = $1 and fsli_code = 'SONDE-CTT-ORPHELINE'`,
      [IDS.engNep],
    );
    expect(Number(preexistante!.n)).toBe(0);
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('SONDE-CTT-ORPHELINE');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from request where id = $1`, [req.id]);
    }
  });
});
