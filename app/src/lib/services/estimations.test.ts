import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import {
  importerEstimation, tirerBase, demanderJustificatifs, detailEstimation, listeEstimations,
} from './estimations';

// LES ESTIMATIONS (point 11a, ADR-106) — importer le fichier de calcul du
// client, rapprocher à la comptabilité, recalculer, sonder, demander les
// justificatifs de la base ET de chaque taux. Les refus sont TENTÉS : un
// fichier faux, une écriture inconnue, une demande avant tirage.

const octets = (s: string) => new TextEncoder().encode(s);

describe('estimations comptables (ADR-106)', () => {
  let estId: string;

  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 180000);

  it('le fichier de la cliente s\'importe, se rapproche à l\'écriture, se recalcule au centime', async () => {
    const fichier = fs.readFileSync(path.join(repoRoot(), 'dataset', 'estimations', 'fae-2025.csv'));
    estId = await importerEstimation({
      engagementId: IDS.engNep,
      titre: 'Factures à établir 2025',
      pieceRef: 'OD-2025-089',
      filename: 'fae-2025.csv',
      contenu: new Uint8Array(fichier),
      userId: IDS.users.karim,
    });
    const d = await detailEstimation(estId);
    expect(d.lignes).toHaveLength(10);
    expect(d.lignes.every((l) => l.conforme)).toBe(true);            // montant = base × taux, au centime
    expect(d.declareTotalCents).toBe(5_000_000);                     // 50 000,00 €
    expect(d.montantComptabiliseCents).toBe(5_000_000);              // dérivé du grand livre ACTIF
    expect(d.ecartCents).toBe(0);                                    // la base explique l'écriture
    expect(d.parametres).toHaveLength(11);                           // 10 taux + la formule
    expect(d.parametres.some((p) => p.nom === 'formule')).toBe(true);
    // le fichier est entré comme PIÈCE, avec provenance
    const ev = await q1<{ source: string }>(`select source from evidence where id = $1`, [d.sourceEvidenceId]);
    expect(ev.source).toBe('auditor');
    expect((await listeEstimations(IDS.engNep))).toHaveLength(1);
  });

  it('une écriture inconnue du grand livre actif est refusée, en la nommant', async () => {
    await expect(importerEstimation({
      engagementId: IDS.engNep, titre: 'x', pieceRef: 'OD-9999-999',
      filename: 'x.csv', contenu: octets('a;b;c;d\nk;1;2;2\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/OD-9999-999/);
  });

  it('un fichier mal formé est refusé en nommant la ligne et la colonne fautives', async () => {
    await expect(importerEstimation({
      engagementId: IDS.engNep, titre: 'x', pieceRef: 'OD-2025-089',
      filename: 'x.csv', contenu: octets('a;b;c\nk;1;2\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/quatre colonnes/);
    await expect(importerEstimation({
      engagementId: IDS.engNep, titre: 'x', pieceRef: 'OD-2025-089',
      filename: 'x.csv', contenu: octets('a;b;c;d\nk;douze;2;24\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/ligne 2.*douze/);
    await expect(importerEstimation({
      engagementId: IDS.engNep, titre: 'x', pieceRef: 'OD-2025-089',
      filename: 'x.csv', contenu: octets('a;b;c;d\nk;1;2;2\nk;3;4;12\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/deux fois/);
  });

  it('demander les justificatifs AVANT le tirage est refusé — la sélection se décide d\'abord', async () => {
    await expect(demanderJustificatifs(estId, IDS.users.karim)).rejects.toThrow(/tirez d'abord/i);
  });

  it('le tirage est déterministe : couverture au seuil + aléa germé, rejouable à l\'identique', async () => {
    const p = { coverageCapCents: 1_000_000, randomSize: 3, seed: 'test-estim-1' };
    await tirerBase(estId, p, IDS.users.karim);
    const premiere = (await detailEstimation(estId)).lignes.filter((l) => l.retenu);
    // couverture : la seule ligne ≥ 10 000 € (Groupe Immovance, 20 900 €)
    expect(premiere.filter((l) => l.motif === 'high_value').map((l) => l.cle)).toEqual(['Groupe Immovance SA']);
    expect(premiere).toHaveLength(4); // 1 couverture + 3 aléa
    await tirerBase(estId, p, IDS.users.karim);
    const seconde = (await detailEstimation(estId)).lignes.filter((l) => l.retenu);
    expect(seconde.map((l) => l.cle)).toEqual(premiere.map((l) => l.cle)); // même germe, même tirage
  });

  it('la demande naît en BROUILLON : base des lignes tirées + chaque taux + la formule', async () => {
    const requestId = await demanderJustificatifs(estId, IDS.users.karim);
    const req = await q1<{ status: string; title: string }>(`select status, title from request where id = $1`, [requestId]);
    expect(req.status).toBe('draft');                                 // rien ne part sans approbation (L2)
    expect(req.title).toContain('Factures à établir');
    const items = await q<{ description: string }>(`select description from request_item where request_id = $1`, [requestId]);
    expect(items).toHaveLength(4 + 11);                               // lignes tirées + 10 taux + formule
    expect(items.some((i) => /note de méthode/.test(i.description))).toBe(true);
    expect(items.filter((i) => /justificatif du/.test(i.description))).toHaveLength(10);
    // chaque ligne tirée et chaque paramètre portent le lien vers leur élément
    const lies = await q1<{ n: string }>(
      `select count(*)::text n from estimation_ligne where estimation_id = $1 and retenu and request_item_id is not null`,
      [estId],
    );
    expect(Number(lies.n)).toBe(4);
  });

  it('après la demande : re-tirer est refusé, re-demander est refusé', async () => {
    await expect(tirerBase(estId, { coverageCapCents: 1, randomSize: 1, seed: 'x' }, IDS.users.karim))
      .rejects.toThrow(/déjà demandés/);
    await expect(demanderJustificatifs(estId, IDS.users.karim)).rejects.toThrow(/déjà demandés/);
  });
});
