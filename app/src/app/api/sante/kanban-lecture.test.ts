import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { recordScopeLimitation, resolveException } from '@/lib/services/matching';
import { ingestEvidence } from '@/lib/services/evidence';
import { GET } from './route';

// LE KANBAN DES ÉCARTS (mandat contrôle interne, §5, §7.4, seconde moitié) — LA LECTURE
// /api/sante.
//
// LE CAS CONNU MAUVAIS QUE CETTE LECTURE EXISTE POUR ATTRAPER n'est PAS accessible par un
// contournement du produit : `exception.status` porte un CHECK constraint SQL fermé sur exactement
// six valeurs (0009_probative_gates.sql) — un septième statut ne peut pas s'écrire, application ou
// SQL direct confondus. Ce que cette lecture peut donc réellement rater n'est pas une DONNÉE
// invalide mais une DIVERGENCE DE CODE : que sa propre requête SQL (« in (...) ») cesse de nommer
// les cinq mêmes valeurs que le kanban affiche. Ce test le prouve par COUVERTURE POSITIVE : une
// ligne réelle dans CHACUN des six statuts, et la lecture doit les compter tous, sans exception
// perdue — si la requête de la lecture omettait ou mal-orthographiait une valeur (« expained » au
// lieu de « explained »), cette ligne tomberait hors des deux familles comptées et le total
// diverger : le test échouerait. CE QUE CE TEST NE PROUVE PAS (règle 19) : qu'un septième statut
// futur (une migration qui étendrait l'enum) ferait rougir cette lecture — impossible à simuler
// sans désactiver la contrainte SQL elle-même.

async function poserEcart(seq: string, status: string): Promise<string> {
  const id = (await q1<{ id: string }>(
    `insert into exception (engagement_id, taxonomy_code, kind, description, status)
     values ($1, 'amount_mismatch', 'substantive', $2, $3) returning id::text`,
    [IDS.engNep, `écart de sonde kanban ${seq}`, status],
  )).id;
  return id;
}

describe('kanban des écarts : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  const poses: string[] = [];
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = AVANT;
    if (poses.length) await q(`delete from exception where id = any($1::uuid[])`, [poses]);
  });

  it('couverture positive : une ligne réelle dans CHACUN des six statuts, tous comptés, rien perdu', async () => {
    /* open, clarification_requested, explained, escalated : AUCUNE contrainte probative
       au-delà du statut lui-même (0009_probative_gates.sql) — un statut posé en SQL direct
       suffit à représenter une ligne réelle de ces quatre familles. */
    for (const status of ['open', 'clarification_requested', 'explained', 'escalated']) {
      poses.push(await poserEcart(status, status));
    }
    /* resolved : `exception_resolution_is_probative` exige tout le paquet probant
       (explication, conclusion, disposition, corroboration) — posé par le VRAI chemin gardé
       (resolveException), pas par un statut SQL nu qui violerait la contrainte. */
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'sonde-kanban-resolved.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('pièce de sonde'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    const resolvedId = await poserEcart('resolved', 'open');
    poses.push(resolvedId);
    await resolveException(resolvedId, IDS.users.karim, {
      explanation: 'explication de sonde', conclusion: 'conclusion de sonde',
      disposition: 'no_misstatement', corroboration: { evidenceId },
    });
    /* scope_limitation : de même, le VRAI chemin gardé (recordScopeLimitation) — R71 : aucun
       écran ne l'appelle encore, mais le service, lui, est réel et testé (matching.ts). */
    const limId = await poserEcart('avant-limitation', 'open');
    poses.push(limId);
    await recordScopeLimitation(limId, IDS.users.karim, {
      explanation: 'pièce jamais archivée (sonde)', alternativeProcedures: 'aucune procédure alternative possible (sonde)',
    });

    const total = (await q1<{ n: string }>(`select count(*) n from exception`)).n;

    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('kanban des écarts'));
    expect(lecture.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(lecture.detail).toContain(`${total} écart(s)`);
    expect(lecture.detail).toContain('1 en scope_limitation');
  });
});
