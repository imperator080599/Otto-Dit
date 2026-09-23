import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { assessFsli, overrideLevel } from '@/lib/services/risk';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// RISK-01 ET LES DÉCISIONS VERSIONNÉES (P1-07, AUD-11, migration 0179) — LA LECTURE /api/sante.
//
// La contrainte `risk01_nrpmm_justifie` refuse déjà toute écriture directe ; cette lecture ne
// peut rougir que par un cas connu mauvais construit hors du chemin gardé (règle 17) — un
// contournement de la contrainte elle-même (RLS désactivée, un rôle qui l'ignore) n'est pas
// reproductible ici sans désactiver la contrainte, alors on simule ce cas exact : la contrainte
// retirée, l'écriture directe posée, la lecture doit rougir.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('RISK-01 et les décisions versionnées'))!;
}

describe('RISK-01 et les décisions versionnées (P1-07, AUD-11) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 60000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration ne porte aucun nrpmm sans justification : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('0 sans justification');
    expect(res.status).toBe(200);
  });

  it('une vraie surcharge nrpmm justifiée, par le chemin normal, reste comptée « avec justification » — la lecture reste verte', async () => {
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    await overrideLevel(IDS.engNep, 'REVENUE', 'presentation', 'nrpmm',
      'Motif de l’écart.', IDS.users.lea,
      'Assertion sans risque raisonnablement possible pour l’épreuve de la lecture /api/sante.');
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = trouver(body);
      expect(lecture.ok).toBe(true);
      expect(lecture.detail).toContain('1 assertion(s) retenue(s) à nrpmm');
      expect(lecture.detail).toContain('0 sans justification');
    } finally {
      await overrideLevel(IDS.engNep, 'REVENUE', 'presentation', null, '', IDS.users.lea);
    }
  });

  it('cas connu mauvais (règle 17) : nrpmm sans justification, posé hors service (contrainte retirée), fait rougir /api/sante entier', async () => {
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    const row = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'droits'`,
      [IDS.engNep],
    );
    await q(`alter table fsli_assertion_risk drop constraint risk01_nrpmm_justifie`);
    try {
      await q(`update fsli_assertion_risk
                 set retained_level = 'nrpmm', override_reason = 'contournement, exprès',
                     decided_by = $2, decided_at = now()
               where id = $1`, [row.id, IDS.users.lea]);
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = trouver(bodyRouge);
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('RISK-01');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`update fsli_assertion_risk
                 set retained_level = null, override_reason = null, decided_by = null, decided_at = null
               where id = $1`, [row.id]);
      await q(`alter table fsli_assertion_risk add constraint risk01_nrpmm_justifie check (
        lower(coalesce(retained_level, computed_level)) <> 'nrpmm'
        or btrim(coalesce(justification, '')) <> ''
      )`);
    }
  });
});
