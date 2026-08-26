// L'ACHÈVEMENT (point 10).
//
// Ce qui se vérifie : que les règles sont des DATES et qu'elles refusent. Une
// lettre d'affirmation antérieure au rapport, des travaux sur les événements
// postérieurs qui s'arrêtent avant le rapport : ce sont les deux défauts qu'on
// cherche après coup, et ils se voient sur des dates — pas sur du jugement.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import {
  assurerAchevement, travaux, conclure, sansObjet, rouvrir,
  obstaclesAchevement, dateRapport, NATURES,
} from './completion';
import { computeSampleEvaluation } from './evaluation';
import { obstaclesAuVisa } from './obstacles';

async function unePiece(): Promise<string> {
  const e = await q1<{ id: string }>(
    `select id from evidence where engagement_id = $1 and quarantined = false limit 1`, [IDS.engNep]);
  return e.id;
}

describe('l’achèvement : des règles de DATE, pas des rappels', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    await assurerAchevement(IDS.engNep);
  });

  it('les cinq travaux existent, chacun avec sa raison d’être', async () => {
    const t = await travaux(IDS.engNep);
    expect(t).toHaveLength(5);
    expect(t.every((x) => x.status === 'open')).toBe(true);
    for (const n of NATURES) expect(n.pourquoi.length).toBeGreaterThan(30);
  });

  it('la date de rapport vient du JALON, pas d’un champ oublié', async () => {
    const d = await dateRapport(IDS.engNep);
    expect(d).toBe('2026-03-31');
  });

  it('conclure sans écrire est refusé', async () => {
    await expect(conclure(IDS.engNep, IDS.users.claire, 'gouvernance', { conclusion: '  ' }))
      .rejects.toThrow(/une conclusion d’achèvement s’écrit/);
  });

  /* ═══ LA RÈGLE DES ÉVÉNEMENTS POSTÉRIEURS : LE TROU ══════════════════ */

  it('des travaux qui s’arrêtent AVANT le rapport laissent un trou, et le trou est NOMMÉ', async () => {
    await expect(conclure(IDS.engNep, IDS.users.claire, 'evenements_posterieurs', {
      conclusion: 'Aucun événement postérieur significatif.',
      coveredThrough: '2026-02-28',
    })).rejects.toThrow(/du 2026-02-28 au 2026-03-31 n’est couverte par aucun travail/);
  });

  it('… et sans date de fin, on ne sait pas ce qui est couvert', async () => {
    await expect(conclure(IDS.engNep, IDS.users.claire, 'evenements_posterieurs', {
      conclusion: 'Rien à signaler.',
    })).rejects.toThrow(/jusqu’à quelle date/);
  });

  it('des travaux menés jusqu’à la date du rapport passent', async () => {
    await conclure(IDS.engNep, IDS.users.claire, 'evenements_posterieurs', {
      findings: 'Revue des procès-verbaux, des relevés bancaires postérieurs et des factures reçues après clôture.',
      conclusion: 'Aucun événement postérieur nécessitant un ajustement ou une information en annexe.',
      coveredThrough: '2026-03-31',
    });
    const x = (await travaux(IDS.engNep)).find((y) => y.nature === 'evenements_posterieurs')!;
    expect(x.status).toBe('done');
    expect(x.covered_through).toBe('2026-03-31');
  });

  /* ═══ LA RÈGLE DE LA LETTRE D'AFFIRMATION ═══════════════════════════ */

  it('une lettre datée AVANT le rapport ne couvre pas la période auditée', async () => {
    await expect(conclure(IDS.engNep, IDS.users.claire, 'lettre_affirmation', {
      conclusion: 'Lettre reçue.', signedOn: '2026-03-15', evidenceId: await unePiece(),
    })).rejects.toThrow(/ne couvre pas la période auditée/);
  });

  it('une lettre sans LA LETTRE est refusée — c’est une lettre, pas une conversation', async () => {
    await expect(conclure(IDS.engNep, IDS.users.claire, 'lettre_affirmation', {
      conclusion: 'Reçue par téléphone.', signedOn: '2026-03-31',
    })).rejects.toThrow(/c’est une lettre, pas une conversation/);
  });

  it('et elle ne se déclare pas « sans objet »', async () => {
    /* Une mission sans lettre d'affirmation n'est pas une mission allégée. */
    await expect(sansObjet(IDS.engNep, IDS.users.claire, 'lettre_affirmation', 'client indisponible'))
      .rejects.toThrow(/elle est incomplète/);
  });

  it('datée du jour du rapport, avec la lettre, elle passe', async () => {
    await conclure(IDS.engNep, IDS.users.claire, 'lettre_affirmation', {
      conclusion: 'Lettre d’affirmation reçue signée du directeur général.',
      signedOn: '2026-03-31', evidenceId: await unePiece(),
    });
    const x = (await travaux(IDS.engNep)).find((y) => y.nature === 'lettre_affirmation')!;
    expect(x.status).toBe('done');
    expect(x.evidence_id).toBeTruthy();
  });

  it('la base refuse aussi une lettre conclue sans pièce', async () => {
    await expect(q(
      `update completion_item set evidence_id = null where engagement_id = $1 and nature = 'lettre_affirmation'`,
      [IDS.engNep],
    )).rejects.toThrow(/representation_letter_needs_the_letter/);
  });

  /* ═══ LES ANOMALIES NON CORRIGÉES ═══════════════════════════════════ */

  it('conclure sur un cumul qu’on n’a pas calculé est refusé', async () => {
    const vierge = '00000000-0000-4000-8000-0000000000c9';
    const per = await q1<{ id: string }>(
      `select id from period where entity_id = $1 order by end_date limit 1`, [IDS.entity]);
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id, report_date)
       values ($1,$2,$3,$4,'integrated','Mission vierge (achèvement)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}','setup',$5,'2026-06-30')`,
      [vierge, IDS.tenant, IDS.entity, per.id, IDS.methodology]);
    await assurerAchevement(vierge);
    await expect(conclure(vierge, IDS.users.claire, 'anomalies_non_corrigees', {
      conclusion: 'Aucune incidence sur l’opinion.',
    })).rejects.toThrow(/le cumul n’a pas été calculé/);
  });

  it('avec l’évaluation menée, la conclusion passe', async () => {
    await computeSampleEvaluation(IDS.engNep, IDS.users.karim);
    await conclure(IDS.engNep, IDS.users.claire, 'anomalies_non_corrigees', {
      findings: 'Cumul des anomalies non corrigées repris de l’état des anomalies.',
      conclusion: 'Le cumul reste inférieur au seuil de signification ; sans incidence sur l’opinion.',
    });
    const x = (await travaux(IDS.engNep)).find((y) => y.nature === 'anomalies_non_corrigees')!;
    expect(x.status).toBe('done');
  });

  /* ═══ SANS OBJET, RÉOUVERTURE, OBSTACLES ════════════════════════════ */

  it('« sans objet » se motive', async () => {
    await expect(sansObjet(IDS.engNep, IDS.users.claire, 'continuite', '  '))
      .rejects.toThrow(/indistinguable d’un travail oublié/);
    await sansObjet(IDS.engNep, IDS.users.claire, 'continuite',
      'Entité largement bénéficiaire, trésorerie nette positive, aucun indicateur de doute relevé.');
    const x = (await travaux(IDS.engNep)).find((y) => y.nature === 'continuite')!;
    expect(x.status).toBe('na');
  });

  it('un travail non conclu bloque, et il apparaît dans LA liste des obstacles', async () => {
    const propres = await obstaclesAchevement(IDS.engNep);
    expect(propres.some((o) => /Communication à la gouvernance/.test(o))).toBe(true);

    const tous = await obstaclesAuVisa(IDS.engNep);
    expect(tous.some((o) => o.famille === 'achevement')).toBe(true);
    /* Le corollaire d'ADR-085 : un obstacle qui n'est pas dans LA liste n'en
       est pas un. On vérifie donc qu'ils y sont tous. */
    for (const p of propres) expect(tous.map((o) => o.libelle)).toContain(p);
  });

  it('tout conclure ferme les obstacles d’achèvement', async () => {
    await conclure(IDS.engNep, IDS.users.claire, 'gouvernance', {
      findings: 'Points communiqués : anomalies non corrigées, limitation sur le grand livre provisoire.',
      conclusion: 'Communication faite au président le 31/03/2026, sans observation en retour.',
    });
    expect(await obstaclesAchevement(IDS.engNep)).toEqual([]);
  });

  it('rouvrir est prévu et tracé — un fait nouveau se traite, il ne se cache pas', async () => {
    await rouvrir(IDS.engNep, IDS.users.claire, 'gouvernance',
      'Fait nouveau porté à notre connaissance après la communication.');
    const x = (await travaux(IDS.engNep)).find((y) => y.nature === 'gouvernance')!;
    expect(x.status).toBe('open');
    const ev = await q<{ verb: string }>(
      `select verb from event_log where verb = 'completion.reopened'`);
    expect(ev.length).toBeGreaterThan(0);
  });
});
