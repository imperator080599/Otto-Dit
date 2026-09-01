import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import {
  importerProcessus, lireProcessus, diffProcessus, diffVersions, statuerChangement,
  layoutDiagramme, obstaclesProcessus,
} from './processus';

// LE PROCESSUS EN DONNÉES STRUCTURÉES (point 2, ADR-108). On ne lit pas le
// flowchart : la plateforme héberge étapes, acteurs, systèmes et contrôles,
// GÉNÈRE le diagramme, et la comparaison N/N-1 est une différence EXACTE.
// Chaque changement se statue ; « significatif » lève un facteur PROPOSÉ.

const lire = (f: string) => new Uint8Array(fs.readFileSync(path.join(repoRoot(), 'dataset', 'processus', f)));
const octets = (s: string) => new TextEncoder().encode(s);

describe('processus en données structurées (ADR-108)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n1', filename: 'revenus_2024.json',
      contenu: lire('revenus_2024.json'), userId: IDS.users.karim,
    });
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'revenus_2025.json',
      contenu: lire('revenus_2025.json'), userId: IDS.users.karim,
    });
  }, 180000);

  it('l\'import refuse : JSON illisible, champ vide NOMMÉ, contrôle rattaché à une étape inconnue', async () => {
    await expect(importerProcessus({
      engagementId: IDS.engSox, exercice: 'n', filename: 'x.json',
      contenu: octets('pas du json'), userId: IDS.users.karim,
    })).rejects.toThrow(/JSON lisible/);
    await expect(importerProcessus({
      engagementId: IDS.engSox, exercice: 'n', filename: 'x.json',
      contenu: octets(JSON.stringify({ cycle: 'REVENUE', nom: 'x', etapes: [{ code: 'A', libelle: 'a', acteur: '', systeme: 's' }] })),
      userId: IDS.users.karim,
    })).rejects.toThrow(/étape 1 \(A\), l'acteur/);
    await expect(importerProcessus({
      engagementId: IDS.engSox, exercice: 'n', filename: 'x.json',
      contenu: octets(JSON.stringify({
        cycle: 'REVENUE', nom: 'x',
        etapes: [{ code: 'A', libelle: 'a', acteur: 'b', systeme: 's' }],
        controles: [{ code: 'C1', etape: 'ZZ', libelle: 'c', frequence: 'f', proprietaire: 'p' }],
      })),
      userId: IDS.users.karim,
    })).rejects.toThrow(/ZZ.*n'existe pas/);
  });

  it('le remplacement d\'une version décrite se CONFIRME — rien ne s\'écrase en silence', async () => {
    await expect(importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'revenus_2025.json',
      contenu: lire('revenus_2025.json'), userId: IDS.users.karim,
    })).rejects.toThrow(/se CONFIRME/);
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'revenus_2025.json',
      contenu: lire('revenus_2025.json'), userId: IDS.users.karim, confirmerRemplacement: true,
    });
  });

  it('la différence N/N-1 est EXACTE — cinq changements, chacun son code stable et ses valeurs', async () => {
    const diff = await diffProcessus(IDS.engNep, 'REVENUE');
    expect(diff).not.toBeNull();
    expect(diff!.changements.map((c) => c.code).sort()).toEqual([
      'proc:REVENUE:controle~:CP-01:proprietaire',
      'proc:REVENUE:controle~:CP-03:frequence',
      'proc:REVENUE:etape+:EDI',
      'proc:REVENUE:etape-:REL',
      'proc:REVENUE:etape~:FAC:systeme',
    ]);
    const fac = diff!.changements.find((c) => c.code === 'proc:REVENUE:etape~:FAC:systeme')!;
    expect(fac.avant).toMatch(/saisie manuelle/);
    expect(fac.apres).toMatch(/module Facturation/);
    const cp01 = diff!.changements.find((c) => c.code === 'proc:REVENUE:controle~:CP-01:proprietaire')!;
    expect(cp01.avant).toBe('Théo Girard');
    expect(cp01.apres).toBe('Nadia Bellec');
  });

  it('l\'ordre des étapes n\'est PAS un changement — déplacer une ligne ne modifie pas le processus', async () => {
    const v = await lireProcessus(IDS.engNep, 'REVENUE');
    const renverse = { ...v.n!, etapes: [...v.n!.etapes].reverse() };
    expect(diffVersions(renverse, v.n!, 'REVENUE')).toEqual([]);
  });

  it('statuer : sans motif refusé, changement inconnu refusé, deux fois refusé', async () => {
    await expect(statuerChangement({
      engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: 'proc:REVENUE:etape+:EDI',
      significance: 'non_significatif', reason: '  ', userId: IDS.users.lea,
    })).rejects.toThrow(/motif requis/);
    await expect(statuerChangement({
      engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: 'proc:REVENUE:etape-:XXX',
      significance: 'non_significatif', reason: 'x', userId: IDS.users.lea,
    })).rejects.toThrow(/n'existe pas/);
    await statuerChangement({
      engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: 'proc:REVENUE:etape+:EDI',
      significance: 'non_significatif', reason: 'Canal de prise de commande supplémentaire, même contrôle d\'encours en aval.',
      userId: IDS.users.lea,
    });
    await expect(statuerChangement({
      engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: 'proc:REVENUE:etape+:EDI',
      significance: 'non_significatif', reason: 'encore', userId: IDS.users.lea,
    })).rejects.toThrow(/déjà statué/);
  });

  it('« significatif » LÈVE un facteur PROPOSÉ sur les postes du cycle — proposé, pas appliqué', async () => {
    await statuerChangement({
      engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: 'proc:REVENUE:etape~:FAC:systeme',
      significance: 'significatif', reason: 'La facturation passe en génération automatique : le risque se déplace vers le paramétrage.',
      userId: IDS.users.lea,
    });
    const f = await q01<{ status: string; description: string }>(
      `select status, description from risk_factor_declared
       where engagement_id = $1 and source_ref = 'proc:REVENUE:etape~:FAC:systeme'`,
      [IDS.engNep],
    );
    expect(f).not.toBeNull();
    expect(f!.status).toBe('proposed');                 // un humain confirme au registre
    expect(f!.description).toMatch(/module Facturation/);
    // non significatif : AUCUN facteur
    const sans = await q01<{ id: string }>(
      `select id from risk_factor_declared where engagement_id = $1 and source_ref = 'proc:REVENUE:etape+:EDI'`,
      [IDS.engNep],
    );
    expect(sans).toBeNull();
  });

  it('les changements non statués sont un OBSTACLE au visa, et il s\'éteint en statuant tout', async () => {
    const avant = await obstaclesProcessus(IDS.engNep);
    expect(avant).toHaveLength(1);
    expect(avant[0]).toMatchObject({ cle: 'obst.processusChangementsNonStatues', vars: { n: 3 } });
    for (const code of ['proc:REVENUE:etape-:REL', 'proc:REVENUE:controle~:CP-01:proprietaire', 'proc:REVENUE:controle~:CP-03:frequence']) {
      await statuerChangement({
        engagementId: IDS.engNep, cycle: 'REVENUE', changeCode: code,
        significance: 'non_significatif', reason: 'Statué pour le test : porté par l\'entretien et la doc.',
        userId: IDS.users.lea,
      });
    }
    expect(await obstaclesProcessus(IDS.engNep)).toEqual([]);
  });

  it('le diagramme est GÉNÉRÉ depuis les données : une boîte par étape, une flèche entre chaque, les contrôles rattachés', async () => {
    const v = await lireProcessus(IDS.engNep, 'REVENUE');
    const d = layoutDiagramme(v.n!);
    expect(d.etapes).toHaveLength(v.n!.etapes.length);
    expect(d.fleches).toHaveLength(v.n!.etapes.length - 1);
    expect(d.controles).toHaveLength(v.n!.controles.length);
    expect(d.attaches).toHaveLength(v.n!.controles.length);
    // positions déterministes et finies — un NaN ne se voit pas dans un SVG
    for (const b of [...d.etapes, ...d.controles]) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
    }
    // les y des étapes croissent strictement
    const ys = d.etapes.map((b) => b.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });
});
