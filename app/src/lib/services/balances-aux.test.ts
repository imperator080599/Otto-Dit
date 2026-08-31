import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import {
  importerBalanceAux, analyseAux, proposerCandidat, redigerQuestionsClient, attenduGl,
} from './balances-aux';

// LES BALANCES AUXILIAIRES (point 1, ADR-107) — les exports âgés du client se
// rapprochent au grand livre, l'analyse est dérivée, les constats CANDIDATS
// se proposent au registre (un humain confirme) et se questionnent au client
// en brouillon. Les chiffres attendus sont ceux du jeu de données — exacts.

const lire = (f: string) => new Uint8Array(fs.readFileSync(path.join(repoRoot(), 'dataset', 'balances_aux', f)));
const octets = (s: string) => new TextEncoder().encode(s);

describe('balances auxiliaires (ADR-107)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    for (const [cote, exercice, fichier] of [
      ['clients', 'n', 'clients_2025.csv'], ['clients', 'n1', 'clients_2024.csv'],
      ['fournisseurs', 'n', 'fournisseurs_2025.csv'], ['fournisseurs', 'n1', 'fournisseurs_2024.csv'],
    ] as const) {
      await importerBalanceAux({
        engagementId: IDS.engNep, cote, exercice, filename: fichier,
        contenu: lire(fichier), userId: IDS.users.karim,
      });
    }
  }, 180000);

  it('chaque fichier se RAPPROCHE au grand livre : N au solde actif, N-1 aux à-nouveaux — au centime', async () => {
    for (const cote of ['clients', 'fournisseurs'] as const) {
      const a = await analyseAux(IDS.engNep, cote);
      expect(a.fichiers.n!.totalCents).toBe(a.fichiers.n!.attenduCents);
      expect(a.fichiers.n1!.totalCents).toBe(a.fichiers.n1!.attenduCents);
    }
    expect((await attenduGl(IDS.engNep, 'clients', 'n1'))).toBe(94_000_000);   // à-nouveaux 940 000,00
    expect((await attenduGl(IDS.engNep, 'fournisseurs', 'n1'))).toBe(61_000_000);
  });

  it('apparus et disparus sont NOMMÉS, jamais déduits d\'un silence', async () => {
    const clients = await analyseAux(IDS.engNep, 'clients');
    expect(clients.apparus.map((l) => l.aux).sort()).toEqual(['C008', 'C012']);
    expect(clients.disparus.map((l) => l.aux).sort()).toEqual(['C013', 'C014']);
    const fournisseurs = await analyseAux(IDS.engNep, 'fournisseurs');
    expect(fournisseurs.apparus.map((l) => l.aux)).toEqual(['F008']);
    expect(fournisseurs.disparus.map((l) => l.aux)).toEqual(['F009']);
  });

  it('le déplacement de part au-delà du seuil sort Groupe Immovance ; le seuil COMMANDE', async () => {
    const a3 = await analyseAux(IDS.engNep, 'clients', 3);
    expect(a3.deplacements.some((l) => l.aux === 'C004' && l.deltaPts > 3)).toBe(true);
    const a20 = await analyseAux(IDS.engNep, 'clients', 20);
    expect(a20.deplacements).toHaveLength(0);                 // un seuil monté éteint les constats
    expect(a20.candidats.filter((c) => c.code.includes(':part:'))).toHaveLength(0);
  });

  it('la déformation du vieillissement est mesurée : la part > 90 jours monte, et le candidat la porte', async () => {
    const a = await analyseAux(IDS.engNep, 'clients');
    expect(a.vieillissement).not.toBeNull();
    expect(a.vieillissement!.partsN1[4]).toBeLessThan(3);
    expect(a.vieillissement!.partsN[4]).toBeGreaterThan(8);
    const cand = a.candidats.find((c) => c.code === 'baux:clients:vieillissement');
    expect(cand).toBeDefined();
    expect(cand!.description).toMatch(/90 jours/);
    expect(cand!.description).toMatch(/Immovance|Peyrelle/);  // les porteurs sont nommés
  });

  it('un candidat SE PROPOSE au registre (statut proposé — un humain confirme), jamais deux fois', async () => {
    const avant = await analyseAux(IDS.engNep, 'clients');
    const code = avant.candidats[0].code;
    await proposerCandidat(IDS.engNep, 'clients', code, 3, IDS.users.karim);
    const f = await q1<{ status: string; source_ref: string }>(
      `select status, source_ref from risk_factor_declared where engagement_id = $1 and source_ref = $2`,
      [IDS.engNep, code],
    );
    expect(f.status).toBe('proposed');                        // le constat CIRCULE, il ne s'applique pas seul
    expect((await analyseAux(IDS.engNep, 'clients')).proposes).toContain(code);
    await expect(proposerCandidat(IDS.engNep, 'clients', code, 3, IDS.users.karim))
      .rejects.toThrow(/déjà proposé/);
  });

  it('les questions au client naissent en BROUILLON, une par constat', async () => {
    const a = await analyseAux(IDS.engNep, 'clients');
    const rid = await redigerQuestionsClient(IDS.engNep, 'clients', 3, IDS.users.karim);
    const req = await q1<{ status: string }>(`select status from request where id = $1`, [rid]);
    expect(req.status).toBe('draft');                         // rien ne part sans approbation (L2)
    const items = await q<{ description: string }>(`select description from request_item where request_id = $1`, [rid]);
    expect(items).toHaveLength(a.candidats.length);
    expect(items.every((i) => i.description.endsWith('?'))).toBe(true);
  });

  it('les refus : fichier mal formé (ligne nommée), double import, second exemplaire', async () => {
    await expect(importerBalanceAux({
      engagementId: IDS.engNep, cote: 'clients', exercice: 'n', filename: 'x.csv',
      contenu: lire('clients_2025.csv'), userId: IDS.users.karim,
    })).rejects.toThrow(/déjà importée/);
    await expect(importerBalanceAux({
      engagementId: IDS.engSox, cote: 'clients', exercice: 'n', filename: 'x.csv',
      contenu: octets('a;b;c\nk;x;1\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/sept colonnes/);
    await expect(importerBalanceAux({
      engagementId: IDS.engSox, cote: 'clients', exercice: 'n', filename: 'x.csv',
      contenu: octets('a;b;c;d;e;f;g\nC1;X;un;0;0;0;0\n'), userId: IDS.users.karim,
    })).rejects.toThrow(/ligne 2.*un/);
  });
});
