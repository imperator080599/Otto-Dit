// LA REPRISE DU DOSSIER N-1 (point 2).
//
// Ce qui se vérifie : que RIEN n'est repris automatiquement, que tout arrive
// PROPOSÉ avec sa source, et qu'une proposition non statuée BLOQUE. Une reprise
// qui ne bloque rien est une recopie — elle ne demande rien à personne.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { construireDossierN1, ID_MISSION_N1 } from '@/lib/flows/prior-year';
import {
  missionPrecedente, proposerReprise, reprises, deciderReprise,
  obstaclesReprise, reprisesRetenues, CarryForwardError,
} from './carryforward';

describe('on ne reprend pas des chiffres, on reprend des conclusions', () => {
  beforeAll(async () => {
    await initTestDb();
    await construireDossierN1();
  });

  /* ═══ 1. LE DOSSIER N-1 EST RÉEL ═════════════════════════════════════ */

  it('le dossier N-1 porte de VRAIES conclusions, pas des lignes fabriquées', async () => {
    /* S'il avait été fabriqué par insertions, il n'aurait passé aucune règle du
       produit : ni acceptation, ni déclaration signée, ni motif de
       non-significativité. La reprise aurait alors repris de la fiction. */
    const acc = await q1<{ status: string; kind: string }>(
      `select status, kind from engagement_acceptance where engagement_id = $1`, [ID_MISSION_N1]);
    expect(acc.status).toBe('accepted');
    expect(acc.kind).toBe('acceptation');   // première année sur cette entité

    const signees = await q1<{ n: string }>(
      `select count(*) n from independence_declaration
       where engagement_id = $1 and signed_at is not null`, [ID_MISSION_N1]);
    expect(Number(signees.n)).toBeGreaterThan(0);

    const motives = await q1<{ n: string }>(
      `select count(*) n from fsli
       where engagement_id = $1 and scoping = 'ns_confirmed' and btrim(coalesce(scoping_basis,'')) <> ''`,
      [ID_MISSION_N1]);
    expect(Number(motives.n)).toBeGreaterThan(0);
  });

  it('la mission précédente se trouve par le CHAÎNAGE des exercices, pas par une date', async () => {
    /* Un exercice de dix-huit mois, ou décalé, casserait toute heuristique de date. */
    const prev = await missionPrecedente(IDS.engNep);
    expect(prev?.id).toBe(ID_MISSION_N1);
  });

  it('une première année n’a rien à reprendre, et le DIT', async () => {
    await expect(proposerReprise(ID_MISSION_N1, IDS.users.claire))
      .rejects.toThrow(/Une première année se planifie, elle ne se reprend pas/);
  });

  /* ═══ 2. TOUT ARRIVE PROPOSÉ ═════════════════════════════════════════ */

  it('la reprise PROPOSE — elle n’applique rien', async () => {
    const liste = await proposerReprise(IDS.engNep, IDS.users.lea);
    expect(liste.length).toBeGreaterThan(0);
    expect(liste.every((r) => r.status === 'proposed')).toBe(true);
    // chaque proposition SAIT d'où elle vient
    expect(liste.every((r) => r.source_engagement_id === ID_MISSION_N1)).toBe(true);
    // et se lit sans ouvrir le dossier N-1 : un identifiant ne se relit pas
    expect(liste.every((r) => r.label.length > 10)).toBe(true);

    // les quatre natures sont couvertes, sinon la reprise est partielle sans le dire
    const natures = new Set(liste.map((r) => r.kind));
    expect(natures.has('scoping')).toBe(true);
    expect(natures.has('risk_factor')).toBe(true);
    expect(natures.has('question_answer')).toBe(true);
  });

  it('RIEN n’a été appliqué au dossier N — c’est la définition d’une proposition', async () => {
    /* Le périmètre de N ne doit pas avoir bougé du seul fait de la reprise. */
    const nonStatues = await q1<{ n: string }>(
      `select count(*) n from carry_forward where engagement_id = $1 and status = 'proposed'`,
      [IDS.engNep]);
    expect(Number(nonStatues.n)).toBeGreaterThan(0);
    const confirmesN = await q1<{ n: string }>(
      `select count(*) n from risk_factor_declared where engagement_id = $1 and source = 'manual'`,
      [IDS.engNep]);
    expect(Number(confirmesN.n)).toBe(0);
  });

  it('relancer la proposition ne duplique rien et n’écrase aucune décision', async () => {
    const avant = await reprises(IDS.engNep);
    const cible = avant.find((r) => r.kind === 'scoping')!;
    await deciderReprise(cible.id, IDS.users.lea, 'reconfirmed');

    await proposerReprise(IDS.engNep, IDS.users.lea);
    const apres = await reprises(IDS.engNep);
    expect(apres.length).toBe(avant.length);
    expect(apres.find((r) => r.id === cible.id)?.status).toBe('reconfirmed');
  });

  /* ═══ 3. LA PROPOSITION NON STATUÉE BLOQUE ═══════════════════════════ */

  it('une proposition non statuée est un OBSTACLE AU VISA', async () => {
    /* Toute la différence entre une reprise et une recopie : la recopie ne
       bloque rien, parce qu'elle ne demande rien à personne. */
    const obstacles = await obstaclesReprise(IDS.engNep);
    expect(obstacles.length).toBeGreaterThan(0);
    expect(obstacles[0].cle).toBe('obst.repriseNonStatuee');
  });

  it('ÉCARTER sans motif est refusé ; RECONFIRMER sans motif ne l’est pas', async () => {
    /* Reconfirmer, c'est dire « j'ai regardé et c'est toujours vrai ».
       Écarter sans motif est indistinguable d'un oubli. */
    const enAttente = (await reprises(IDS.engNep)).filter((r) => r.status === 'proposed');
    expect(enAttente.length).toBeGreaterThan(1);

    await expect(deciderReprise(enAttente[0].id, IDS.users.lea, 'dismissed', '   '))
      .rejects.toThrow(/indistinguable d’un oubli/);
    await expect(deciderReprise(enAttente[0].id, IDS.users.lea, 'reconfirmed'))
      .resolves.toBeTruthy();

    await expect(deciderReprise(enAttente[1].id, IDS.users.lea, 'dismissed',
      'Poste devenu significatif en 2025 : la décision de 2024 ne se reconduit pas.'))
      .resolves.toBeTruthy();
  });

  it('la base refuse aussi un écart sans motif', async () => {
    const enAttente = (await reprises(IDS.engNep)).filter((r) => r.status === 'proposed');
    await expect(q(
      `update carry_forward set status = 'dismissed', decided_by = $2 where id = $1`,
      [enAttente[0].id, IDS.users.lea],
    )).rejects.toThrow(/dismissal_needs_a_written_reason/);
  });

  it('une proposition déjà statuée ne se re-statue pas', async () => {
    const statuee = (await reprises(IDS.engNep)).find((r) => r.status !== 'proposed')!;
    await expect(deciderReprise(statuee.id, IDS.users.lea, 'reconfirmed'))
      .rejects.toThrow(/déjà statuée/);
  });

  it('tout statuer ferme les obstacles, et le dossier dit ce qu’il a repris', async () => {
    for (const r of (await reprises(IDS.engNep)).filter((x) => x.status === 'proposed')) {
      await deciderReprise(r.id, IDS.users.lea, 'reconfirmed');
    }
    expect(await obstaclesReprise(IDS.engNep)).toEqual([]);
    const retenues = await reprisesRetenues(IDS.engNep);
    expect(retenues.length).toBeGreaterThan(0);
    expect(retenues.every((r) => r.status === 'reconfirmed')).toBe(true);
  });

  it('la reprise laisse une trace au journal', async () => {
    const rows = await q<{ verb: string }>(
      `select verb from event_log where verb like 'carry_forward.%'`);
    const verbes = rows.map((r) => r.verb);
    expect(verbes).toContain('carry_forward.proposed');
    expect(verbes).toContain('carry_forward.reconfirmed');
    expect(verbes).toContain('carry_forward.dismissed');
  });
});
