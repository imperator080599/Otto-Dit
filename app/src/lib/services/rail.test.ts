import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { railDuDossier } from './rail';

// LE RAIL MONTRE L'ÉTAT, PAS LE CATALOGUE (ADR-103) — et cela se prouve aux
// deux bouts : un dossier qui VIENT D'ÊTRE CRÉÉ montre cinq destinations,
// chacune des autres porte sa raison en une ligne ; le dossier déroulé les
// montre presque toutes. Entre les deux, chaque porte s'ouvre sur le fait qui
// la commande.

describe('le rail d\'état (ADR-103)', () => {
  const NEUF = 'cccc3333-0000-4000-8000-000000000001';

  beforeAll(async () => {
    await initTestDb();
    /* Un dossier NEUF, même entité, même exercice — rien n'y a été fait. */
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
       values ($1, $2, $3, $4, 'statutory_audit', 'Dossier neuf (test rail)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', $5)`,
      [NEUF, IDS.tenant, IDS.entity, IDS.periodFY2025, IDS.methodology],
    );
  }, 120000);

  it('un dossier qui vient d\'être créé montre CINQ destinations, le reste grisé avec sa raison', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr']);
    const ouvertes = rail.filter((x) => x.atteignable).map((x) => x.label);
    expect(ouvertes).toEqual([
      'Vue d\'ensemble', 'Acceptation', 'Équipe et indépendance', 'Réunions',
      'Journal du dossier',
    ]);
    /* Le monde de BASE n'a pas de dossier antérieur (seul le monde de
       démonstration en construit un) : la reprise est grisée, avec sa raison. */
    expect(rail.find((x) => x.label === 'Reprise du dossier N-1')!.raison).toMatch(/antérieur/);
    for (const x of rail.filter((r) => !r.atteignable)) {
      expect(x.raison, `raison manquante pour ${x.label}`).toBeTruthy();
      expect(x.raison!.length).toBeLessThan(90); // une ligne, pas un paragraphe
    }
    /* Les portes fermées le sont VRAIMENT : imports avant acceptation, non. */
    expect(rail.find((x) => x.label.startsWith('Imports'))!.atteignable).toBe(false);
    expect(rail.find((x) => x.label.startsWith('Imports'))!.raison).toMatch(/acceptation/);
    expect(rail.find((x) => x.label === 'Contrôle sur pièces (testing)')!.raison).toMatch(/tirage/);
  });

  it('chaque phrase dit ce qu\'un auditeur y trouvera — aucune entrée muette', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr']);
    for (const x of rail) {
      expect(x.phrase.length, x.label).toBeGreaterThan(20);
    }
  });

  it('le dossier déroulé ouvre presque tout ; la clôture attend l\'achèvement', async () => {
    await runPart1UpToWorkpaper();
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const { signWorkpaper } = await import('./workpapers/lifecycle');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    const rail = await railDuDossier(IDS.engNep, ['nep-fr']);
    const fermee = rail.filter((x) => !x.atteignable).map((x) => x.label);
    /* Restent fermées : la clôture (pas d'achèvement conclu) — et rien d'autre
       d'essentiel au parcours. */
    expect(fermee).toContain('Clôture et archive');
    expect(rail.find((x) => x.label === 'Contrôle sur pièces (testing)')!.atteignable).toBe(true);
    expect(rail.find((x) => x.label === 'Pointage des états financiers')!.atteignable).toBe(true);
    const sox = await railDuDossier(IDS.engSox, ['pcaob-sox']);
    expect(sox.find((x) => x.label === 'Contrôles internes (SOX)')!.atteignable).toBe(true);
    expect(sox.some((x) => x.label === 'Contrôle sur pièces (testing)')).toBe(false); // pack-dépendant
  });
});
