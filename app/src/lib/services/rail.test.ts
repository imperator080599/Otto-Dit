import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { repoRoot } from '@/lib/db/client';
import { railDuDossier, postesRetenus, GROUPES } from './rail';
import { destinationsDuPoste } from './poste';

// LE RAIL MONTRE L'ÉTAT, PAS LE CATALOGUE (ADR-103) — et depuis ADR-112 il
// suit le DOSSIER : groupé, vertical, les POSTES au premier rang. Cela se
// prouve aux deux bouts : un dossier qui vient d'être créé montre cinq
// destinations, chacune des autres porte sa raison en une ligne ; le dossier
// déroulé ouvre ses postes.
//
// ET IL SE PROUVE UNE TROISIÈME FOIS, par le garde de COUVERTURE : sortir un
// écran du rail est le geste qui rend un écran injoignable en silence — le
// défaut exact de la règle 13. Le test lit donc l'arborescence des routes et
// exige que chacune soit atteignable depuis le rail, depuis un poste, ou
// déclarée ici avec sa raison.

describe('le rail du dossier (ADR-103, ADR-112)', () => {
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
    expect(rail.find((x) => x.label === 'Reprise du dossier N-1')!.raison).toMatch(/antérieur/);
    for (const x of rail.filter((r) => !r.atteignable)) {
      expect(x.raison, `raison manquante pour ${x.label}`).toBeTruthy();
      expect(x.raison!.length).toBeLessThan(90); // une ligne, pas un paragraphe
    }
    expect(rail.find((x) => x.label.startsWith('Balance et grand livre'))!.atteignable).toBe(false);
    expect(rail.find((x) => x.label.startsWith('Balance et grand livre'))!.raison).toMatch(/acceptation/);
  });

  it('chaque entrée porte un GROUPE connu et une phrase — aucune entrée muette', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr']);
    for (const x of rail) {
      expect(x.phrase.length, x.label).toBeGreaterThan(20);
      expect(GROUPES, `groupe inconnu pour ${x.label}`).toContain(x.groupe);
    }
  });

  it('le VOCABULAIRE vient du pack, jamais du code (DA-15)', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr']);
    const labels = rail.map((x) => x.label);
    expect(labels).toContain('Matérialité');
    expect(labels).toContain('Scoping');
    expect(labels).toContain('Ce qui empêche de signer');
    /* L'ancien vocabulaire ne survit nulle part : deux mots pour un concept
       sur le même écran est exactement ce que DA-15 interdit. */
    expect(labels.some((l) => /seuil de signification/i.test(l))).toBe(false);
    expect(labels.some((l) => /Périmètre \(postes retenus\)/i.test(l))).toBe(false);
    expect(labels.some((l) => /Obstacles au visa/i.test(l))).toBe(false);
  });

  it('les POSTES retenus sont des destinations de premier rang', async () => {
    await runPart1UpToWorkpaper();
    const postes = await postesRetenus(IDS.engNep);
    expect(postes.length).toBeGreaterThan(0);
    const rail = await railDuDossier(IDS.engNep, ['nep-fr']);
    const groupePostes = rail.filter((x) => x.groupe === 'Les postes');
    expect(groupePostes.length).toBe(postes.length);
    for (const p of postes) {
      const e = groupePostes.find((x) => x.label === p.name);
      expect(e, `poste ${p.code} absent du rail`).toBeTruthy();
      expect(e!.atteignable).toBe(true);
      expect(e!.href).toContain(`/poste/${encodeURIComponent(p.code)}`);
    }
    /* Le rail neuf, lui, annonce les postes AVANT qu'ils existent, avec la
       raison — jamais un groupe qui apparaît de nulle part. */
    const neuf = await railDuDossier(NEUF, ['nep-fr']);
    expect(neuf.find((x) => x.groupe === 'Les postes')!.raison).toMatch(/scoping/i);
  });

  it('le dossier déroulé ouvre presque tout ; la clôture attend l\'achèvement', async () => {
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const { signWorkpaper } = await import('./workpapers/lifecycle');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    const rail = await railDuDossier(IDS.engNep, ['nep-fr']);
    expect(rail.filter((x) => !x.atteignable).map((x) => x.label)).toContain('Clôture et archive');
    expect(rail.find((x) => x.label === 'Pointage des états financiers')!.atteignable).toBe(true);
    const sox = await railDuDossier(IDS.engSox, ['pcaob-sox']);
    expect(sox.find((x) => x.label === 'Contrôle interne')!.atteignable).toBe(true);
    expect(sox.find((x) => x.label === 'Déviations (SOX)')).toBeTruthy();
  });

  /**
   * LE GARDE DE COUVERTURE.
   *
   * Réorganiser une navigation, c'est retirer des entrées. Une entrée retirée
   * dont l'écran n'est repris nulle part devient un objet qu'aucun chemin de
   * lecture n'atteint — et rien ne le signale : la page rend toujours 200
   * pour qui connaît son URL. On lit donc les routes sur le DISQUE et on
   * exige que chacune soit atteignable.
   */
  it('aucun écran de dossier n\'est injoignable : rail, poste, ou déclaré', async () => {
    /* Les écrans qu'on atteint autrement, et par où. Une exception sans
       destination écrite serait une excuse. */
    const AILLEURS: Record<string, string> = {
      '/eng/[id]/requests/[rid]': 'depuis la liste des demandes au client',
      '/eng/[id]/workpapers/[wid]': 'depuis la liste des papiers et depuis « Mes travaux »',
      '/eng/[id]/rcm/[cid]': 'depuis la matrice des contrôles',
      '/eng/[id]/poste/[code]': 'c\'est la destination du groupe « Les postes »',
    };
    const racine = path.join(repoRoot(), 'app', 'src', 'app', 'eng', '[id]');
    const routes: string[] = [];
    const marcher = (dir: string, prefixe: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) marcher(path.join(dir, e.name), `${prefixe}/${e.name}`);
        else if (e.name === 'page.tsx') routes.push(prefixe || '/eng/[id]');
      }
    };
    marcher(racine, '/eng/[id]');

    const rail = await railDuDossier(IDS.engNep, ['nep-fr']);
    const railSox = await railDuDossier(IDS.engSox, ['pcaob-sox']);
    const atteintes = new Set<string>();
    for (const e of [...rail, ...railSox]) {
      atteintes.add(e.href.replace(IDS.engNep, '[id]').replace(IDS.engSox, '[id]').split('?')[0]);
    }
    for (const d of destinationsDuPoste('[id]', 'X')) atteintes.add(d.split('?')[0]);

    const injoignables = routes.filter((r) => {
      const motif = r.replace(/\/poste\/\[code\]$/, '/poste/X');
      return !atteintes.has(motif) && !(r in AILLEURS);
    });
    expect(injoignables, `écran(s) qu'aucun chemin de lecture n'atteint : ${injoignables.join(', ')}`).toEqual([]);
  });
});
