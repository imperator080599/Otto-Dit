import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { drawAttributeSample, populationControleRapprochee, rapprocherPopulationControle } from './sox';

// LOT CONTRÔLE INTERNE, §3.1 (mandat), TRANCHE 6 — CTRL-04.
//
// « Tirer sur une population d'occurrences non rapprochée. Miroir exact de POP-01. » Le garde vit
// dans `drawAttributeSample` (sox.ts) ; `rapprocherPopulationControle`/`populationControleRapprochee`
// reprennent la mécanique de `rapprocherDetailDeCompte`/`populationDuDetailRapproche`
// (account-detail.ts) — une conclusion humaine, écrite, dont la fraîcheur se revérifie contre un
// compte FRAIS de `control_instance`, jamais supposée.

async function poserControleAvecPopulation(code: string, n = 2): Promise<string> {
  const controlId = (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde CTRL-04', 'fictif', 'monthly', 'manual', 'preventive', 'effective')
     returning id::text`,
    [IDS.engNep, code])).id;
  for (let i = 1; i <= n; i++) {
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,$2,null,null,'listing')`,
      [controlId, `INV-${i}`],
    );
  }
  return controlId;
}

describe('CTRL-04 : rapprochement de la population d’OE (service)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('populationControleRapprochee : aucun rapprochement conclu → null', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-VIDE');
    expect(await populationControleRapprochee(controlId)).toBeNull();
  });

  it('rapprocherPopulationControle conclut un VRAI rapprochement (row_count figé), retrouvé ensuite', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-CONCLU', 3);
    await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de trois occurrences revue et complète.');
    const rapprochee = await populationControleRapprochee(controlId);
    expect(rapprochee).not.toBeNull();
    expect(rapprochee!.rowCount).toBe(3);
    expect(rapprochee!.conclusion).toBe('Population de trois occurrences revue et complète.');
    expect(rapprochee!.rapprocheePar).toBe(IDS.users.karim);
  });

  it('cas connu mauvais (règle 17) : tirer sur une population non rapprochée refuse, en nommant CTRL-04', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-A');
    await expect(drawAttributeSample(controlId, IDS.users.lea, 1, 'sonde'))
      .rejects.toThrow(/CTRL-04/);
  });

  it('cas connu mauvais, moitié protectrice (règle 17) : un rapprochement conclu débloque le tirage', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-B');
    await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de deux occurrences revue et complète.');
    const draw = await drawAttributeSample(controlId, IDS.users.lea, 1, 'Table du cabinet non fournie (sonde) — taille justifiée.');
    expect(draw.selected.length).toBe(1);
  });

  it('la fraîcheur se vérifie, pas seulement à la conclusion : une population qui grossit APRÈS un rapprochement le rend PÉRIMÉ (null), et le tirage suivant refuse à nouveau', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-PERIME', 2);
    await rapprocherPopulationControle(controlId, IDS.users.karim, 'Population de deux occurrences revue et complète.');
    expect(await populationControleRapprochee(controlId)).not.toBeNull();
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-3',null,null,'listing')`,
      [controlId],
    );
    expect(await populationControleRapprochee(controlId)).toBeNull();
    await expect(drawAttributeSample(controlId, IDS.users.lea, 1, 'sonde'))
      .rejects.toThrow(/CTRL-04/);
  });

  it('POP-03 (même famille) : un rapprochement déjà conclu, sur la MÊME population fraîche, ne se réécrit pas en silence', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-POP03');
    await rapprocherPopulationControle(controlId, IDS.users.karim, 'Première conclusion, population complète.');
    await expect(rapprocherPopulationControle(controlId, IDS.users.lea, 'Seconde tentative de conclusion.'))
      .rejects.toThrow(/CTRL-04.*déjà conclu/);
  });

  it('une population VIDE ne se rapproche pas — il n’y a rien à conclure', async () => {
    const controlId = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1, 'SONDE-CTRL04-VIDE2', 'Contrôle de sonde', 'fictif', 'monthly', 'manual', 'preventive', 'effective')
       returning id::text`,
      [IDS.engNep])).id;
    await expect(rapprocherPopulationControle(controlId, IDS.users.karim, 'Conclusion sur du vide.'))
      .rejects.toThrow(/CTRL-04.*aucune population/);
  });

  it('une conclusion trop courte (< 10 caractères) est refusée — une case cochée sans texte ne dit rien', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-COURT');
    await expect(rapprocherPopulationControle(controlId, IDS.users.karim, 'ok'))
      .rejects.toThrow(/CTRL-04.*conclusion/);
  });

  it('étanchéité (ETANCH) : un intrus d’un autre cabinet ne peut pas rapprocher la population d’un contrôle qui n’est pas le sien', async () => {
    const controlId = await poserControleAvecPopulation('SONDE-CTRL04-ETANCH');
    const cabinet = await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet Étranger (sonde CTRL-04)') returning id::text`);
    const intrus = (await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1, 'Sonde Intrus', 'intrus-ctrl04@sonde.test', 'partner') returning id::text`,
      [cabinet.id],
    )).id;
    await expect(rapprocherPopulationControle(controlId, intrus, 'Conclusion d’un intrus.')).rejects.toThrow(/ETANCH/);
    expect(await populationControleRapprochee(controlId)).toBeNull();
  });
});
