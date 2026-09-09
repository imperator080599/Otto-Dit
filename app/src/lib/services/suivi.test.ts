import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend, requestsEnAttente } from './requests';
import { listDeviations } from './sox';
import { warp, resetClock, DAY_MS } from '@/lib/core/clock';
import { ingestEvidence } from './evidence';

// LE SUIVI DE MISSION (mandat contrôle interne, §5, §7.4) — `requestsEnAttente`
// (l'âge des demandes en attente) et `control_id` sur `listDeviations` (le lien
// réel des écarts non conclus), les deux lectures neuves du tableau de bord.
//
// CE QUE CES TESTS NE COUVRENT PAS (règle 19) : le rendu de l'écran lui-même
// (`.epure`, les quatre panneaux) — c'est la station clics qui le prouve, en
// cliquant vraiment la carte. Ici, seulement le calcul.

describe('suivi de mission (service) — âge des demandes, lien des écarts', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    await resetClock();
  }, 120000);

  it('requestsEnAttente : une demande jamais envoyée (draft) ne compte pas', async () => {
    await demanderDetailDeCompte(IDS.engNep, 'REVENUE', IDS.users.karim);
    const avant = await requestsEnAttente(IDS.engNep);
    // Toute demande DRAFT créée par ce test ou un autre reste hors de la liste —
    // seule l'assertion sur les statuts compte, jamais un total absolu.
    expect(avant.every((d) => d.status !== 'draft')).toBe(true);
  });

  it('requestsEnAttente : une demande ENVOYÉE compte, avec son âge en jours depuis sent_at', async () => {
    const reqId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(reqId, IDS.users.lea);
    const avant = await requestsEnAttente(IDS.engNep);
    const ligne = avant.find((d) => d.id === reqId);
    expect(ligne).toBeDefined();
    expect(ligne!.ageJours).toBe(0);

    await warp(9 * DAY_MS);
    const apres = await requestsEnAttente(IDS.engNep);
    expect(apres.find((d) => d.id === reqId)!.ageJours).toBe(9);
    await resetClock();
  });

  it('cas connu mauvais (règle 17) : une demande CLOSE (submitted) sort de l’attente', async () => {
    const reqId = await demanderDetailDeCompte(IDS.engNep, 'REVENUE', IDS.users.karim);
    await approveSend(reqId, IDS.users.lea);
    expect((await requestsEnAttente(IDS.engNep)).some((d) => d.id === reqId)).toBe(true);
    await q(`update request set status = 'submitted' where id = $1`, [reqId]);
    expect((await requestsEnAttente(IDS.engNep)).some((d) => d.id === reqId)).toBe(false);
  });

  it('listDeviations : control_id résout un contrôle réel — le lien du suivi n’est jamais mort', async () => {
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-SUIVI-01', 'Contrôle de sonde suivi', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
       returning id::text`,
      [IDS.engNep])).id;
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'sonde-suivi.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('pièce de sonde'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    const devId = (await q1<{ id: string }>(
      `insert into deviation (engagement_id, control_id, attribute_code, taxonomy_code, status, description)
       values ($1, $2, 'A1', 'exception', 'open', 'écart de sonde') returning id::text`,
      [IDS.engNep, controlId])).id;
    void evidenceId;

    const liste = await listDeviations(IDS.engNep);
    const ligne = liste.find((d) => d.id === devId);
    expect(ligne).toBeDefined();
    expect(ligne!.control_id).toBe(controlId);

    // Le contrôle que control_id désigne existe RÉELLEMENT — c'est ce qui rend
    // le lien du tableau de bord vivant, jamais une chaîne qui ressemble à un id.
    const verif = await q1<{ n: string }>(`select count(*)::text n from control where id = $1`, [ligne!.control_id]);
    expect(Number(verif.n)).toBe(1);
  });
});
