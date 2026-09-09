import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { drawAttributeSample } from './sox';
import { demanderPopulationControle, derniereDemandePopulationControle } from './requests';

// LOT CONTRÔLE INTERNE, §3.1 (mandat), TRANCHE 5 — CTRL-05.
//
// « Atteindre le tirage d'OE d'un contrôle as_needed (adhoc/many_daily dans ce dépôt) sans
// qu'une demande client de la population des occurrences existe. » Le garde vit dans
// `drawAttributeSample` (sox.ts) ; `demanderPopulationControle`/`derniereDemandePopulationControle`
// (requests.ts) réutilisent le mécanisme request/request_item existant (Partie B), aucun chemin
// neuf.

async function poserControleAdhoc(code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde CTRL-05', 'fictif', 'adhoc', 'manual', 'preventive', 'effective')
     returning id::text`,
    [IDS.engNep, code])).id;
}

describe('CTRL-05 : demande client de la population (service)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('derniereDemandePopulationControle : aucune demande → null', async () => {
    const controlId = await poserControleAdhoc('SONDE-CTRL05-VIDE');
    const demande = await derniereDemandePopulationControle(controlId);
    expect(demande).toBeNull();
  });

  it('demanderPopulationControle crée une VRAIE demande (request + request_item, kind=listing), retrouvée ensuite', async () => {
    const controlId = await poserControleAdhoc('SONDE-CTRL05-DEMANDE');
    const requestId = await demanderPopulationControle(controlId, IDS.users.karim);
    const req = await q1<{ id: string; status: string; control_id: string; kind_count: string }>(
      `select r.id, r.status, r.control_id::text control_id,
              (select count(*) from request_item ri where ri.request_id = r.id and ri.kind = 'listing') kind_count
       from request r where r.id = $1`,
      [requestId],
    );
    expect(req.control_id).toBe(controlId);
    expect(req.status).toBe('draft');
    expect(Number(req.kind_count)).toBe(1);
    const demande = await derniereDemandePopulationControle(controlId);
    expect(demande!.id).toBe(requestId);
  });

  it('cas connu mauvais (règle 17) : tirer sur un contrôle adhoc SANS demande refuse, en nommant CTRL-05 et la fréquence', async () => {
    const controlId = await poserControleAdhoc('SONDE-CTRL05-A');
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing')`,
      [controlId],
    );
    await expect(drawAttributeSample(controlId, IDS.users.lea, 1, 'sonde'))
      .rejects.toThrow(/CTRL-05.*adhoc/);
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : une demande existante débloque le tirage (le reste des gardes, CTRL-07 compris, s’applique normalement ensuite)', async () => {
    const controlId = await poserControleAdhoc('SONDE-CTRL05-B');
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing'), ($1,'INV-2',null,null,'listing')`,
      [controlId],
    );
    await demanderPopulationControle(controlId, IDS.users.karim);
    const draw = await drawAttributeSample(controlId, IDS.users.lea, 1, 'Table du cabinet non fournie (sonde) — taille justifiée.');
    expect(draw.selected.length).toBe(1);
  });

  it('cas connu mauvais : une demande d’un AUTRE contrôle ne compte pas pour celui-ci — la comparaison porte sur control_id, jamais sur « une demande existe quelque part »', async () => {
    const controlAvecDemande = await poserControleAdhoc('SONDE-CTRL05-AUTRE');
    const controlSansDemande = await poserControleAdhoc('SONDE-CTRL05-CIBLE');
    await demanderPopulationControle(controlAvecDemande, IDS.users.karim);
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing')`,
      [controlSansDemande],
    );
    await expect(drawAttributeSample(controlSansDemande, IDS.users.lea, 1, 'sonde'))
      .rejects.toThrow(/CTRL-05/);
  });

  it('étanchéité (ETANCH) : un intrus d’un autre cabinet ne peut pas demander la population d’un contrôle qui n’est pas le sien', async () => {
    const controlId = await poserControleAdhoc('SONDE-CTRL05-ETANCH');
    const cabinet = await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet Étranger (sonde CTRL-05)') returning id::text`);
    const intrus = (await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1, 'Sonde Intrus', 'intrus-ctrl05@sonde.test', 'partner') returning id::text`,
      [cabinet.id],
    )).id;
    await expect(demanderPopulationControle(controlId, intrus)).rejects.toThrow(/ETANCH/);
    const demande = await derniereDemandePopulationControle(controlId);
    expect(demande).toBeNull();
  });

  it('une fréquence DÉRIVABLE (monthly) n’est jamais bloquée par CTRL-05 — le garde ne porte que sur les fréquences non dérivables', async () => {
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-CTRL05-MENSUEL', 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', 'effective')
       returning id::text`,
      [IDS.engNep])).id;
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing')`,
      [controlId],
    );
    // Aucune demande n'est créée : si CTRL-05 s'appliquait à tort ici, ceci rejetterait CTRL-05
    // au lieu de la garde ADR-010 attendue (aucune taille, aucune dérogation).
    await expect(drawAttributeSample(controlId, IDS.users.lea))
      .rejects.toThrow(/CTRL-07/);
  });
});
