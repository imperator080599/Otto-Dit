import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { importTb, detectTbMapping } from '@/lib/services/imports';
import {
  assemblerLeadsheet, leadsheetDuPoste, lireAnalytique, enregistrerAnalytique, proposerAnalytique,
  revueAnalytiqueGlobale, versionsAnalytique, pourcentage,
} from './analytique';

// LA LEADSHEET N / N-1 ET LA REVUE ANALYTIQUE DU POSTE (mandat de la soirée,
// §2.2 ; migration 0130).
//
// Ce que ces tests prouvent, et rien de plus : d'où vient N-1 et que l'origine
// est DITE ; qu'une variation est signée et son pourcentage calculé sur |N-1| ;
// que la revue analytique est un objet versionné — le vide refusé, la
// proposition sans run refusée, une version jamais réécrite ni effacée
// (les trois refus, joués ici par le service et par la base) ; que la
// proposition du moteur est déterministe, tracée, et ne compte qu'enregistrée
// par une personne ; et qu'un solde qui bouge rend la rédaction PÉRIMÉE sans
// l'effacer (règle du recalcul, §0.3).

const POSTE = 'REVENUE';
const N1 = { source: 'balance_n1' as const, mission: null };

describe('assemblerLeadsheet — pure', () => {
  it('variation signée, pourcentage sur |N-1|, présence des comptes, empreinte des soldes', () => {
    const courants = [
      { number: '706000', label: 'Ventes (fictif)', balanceCents: 120000 },
      { number: '708000', label: 'Produits annexes (fictif)', balanceCents: 5000 },
    ];
    const anterieurs = [
      { number: '706000', label: 'Ventes (fictif)', balanceCents: 100000 },
      { number: '707000', label: 'Marchandises (fictif)', balanceCents: -2000 },
    ];
    const a = assemblerLeadsheet(courants, anterieurs, N1);
    expect(a.lignes.map((l) => l.number)).toEqual(['706000', '707000', '708000']);
    expect(a.lignes[0]).toMatchObject({ variationCents: 20000, variationPct: 20, presence: 'les_deux' });
    /* Un compte soldé cette année reste sur la leadsheet, à zéro en N. */
    expect(a.lignes[1]).toMatchObject({ balanceCents: 0, balanceN1Cents: -2000, variationCents: 2000, variationPct: 100, presence: 'n1_seul' });
    /* Un compte nouveau : N-1 à zéro, pas de pourcentage (division par zéro n'est pas « +∞ »). */
    expect(a.lignes[2]).toMatchObject({ balanceN1Cents: 0, variationCents: 5000, variationPct: null, presence: 'n_seul' });
    expect(a.totalCents).toBe(125000);
    expect(a.totalN1Cents).toBe(98000);
    expect(a.variationCents).toBe(27000);
    expect(a.variationPct).toBe(27.6);
    /* Mêmes soldes → même empreinte ; un centime de plus → une autre. */
    expect(assemblerLeadsheet(courants, anterieurs, N1).empreinte).toBe(a.empreinte);
    const bouge = [{ ...courants[0], balanceCents: 120001 }, courants[1]];
    expect(assemblerLeadsheet(bouge, anterieurs, N1).empreinte).not.toBe(a.empreinte);
    /* Sans N-1 : la colonne est NULLE, pas zéro — « 0 » serait un chiffre inventé. */
    const sans = assemblerLeadsheet(courants, [], { source: 'aucune', mission: null });
    expect(sans.lignes[0].balanceN1Cents).toBeNull();
    expect(sans.totalN1Cents).toBeNull();
    expect(sans.variationCents).toBeNull();
    expect(pourcentage(50, 0)).toBeNull();
    expect(pourcentage(-50, -100)).toBe(50);
  });
});

describe('la leadsheet N/N-1 et la revue analytique (0130)', () => {
  beforeAll(async () => { await initTestDb(); await bootstrapNep(); }, 180000);

  it('N-1 vient de la balance comparative tant que le dossier N-1 n’a pas de balance, puis du dossier N-1 — et l’origine le dit', async () => {
    const avant = await leadsheetDuPoste(IDS.engNep, POSTE);
    expect(avant.origine.source).toBe('balance_n1');
    expect(avant.origine.mission?.id).toBe(IDS.engNepN1);
    expect(avant.totalN1Cents).not.toBeNull();
    expect(avant.lignes.length).toBeGreaterThan(0);
    expect(avant.lignes.every((l) => l.balanceN1Cents !== null)).toBe(true);
    const tb = fs.readFileSync(path.join(repoRoot(), 'dataset', 'tb_2024.csv'), 'utf8');
    await importTb({
      engagementId: IDS.engNepN1, userId: IDS.users.karim, filename: 'tb_2024.csv', content: tb,
      mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current',
    });
    const apres = await leadsheetDuPoste(IDS.engNep, POSTE);
    expect(apres.origine.source).toBe('dossier_n1');
    expect(apres.origine.mission?.id).toBe(IDS.engNepN1);
    /* Le même fichier des deux côtés : les chiffres, donc l'empreinte, sont les mêmes. */
    expect(apres.totalN1Cents).toBe(avant.totalN1Cents);
    expect(apres.empreinte).toBe(avant.empreinte);
  });

  it('refuse le vide (ANA-01) et la proposition sans run (ANA-02) ; enregistrer écrit une version NOUVELLE et la précédente reste (ANA-03)', async () => {
    await expect(enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, '   ', { origine: 'humaine' })).rejects.toThrow(/ANA-01/);
    await expect(enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, 'Texte.', { origine: 'proposee_validee' })).rejects.toThrow(/ANA-02/);
    await expect(enregistrerAnalytique(IDS.engNep, 'POSTE-INCONNU', IDS.users.karim, 'Texte.', { origine: 'humaine' })).rejects.toThrow(/inconnu/);
    expect(await lireAnalytique(IDS.engNep, POSTE)).toBeNull();

    const v1 = await enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, 'Première rédaction (fictive).', { origine: 'humaine' });
    expect(v1.version).toBe(1);
    const v2 = await enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.lea, 'Seconde rédaction (fictive).', { origine: 'humaine' });
    expect(v2.version).toBe(2);
    const lea = await q01<{ name: string }>(`select name from app_user where id = $1`, [IDS.users.lea]);
    const r = await lireAnalytique(IDS.engNep, POSTE);
    expect(r).toMatchObject({ version: 2, texte: 'Seconde rédaction (fictive).', auteur: lea!.name, origine: 'humaine', perimee: false, anterieures: 1 });
    expect((await versionsAnalytique(IDS.engNep, POSTE)).map((x) => x.version)).toEqual([2, 1]);

    /* CAS CONNUS MAUVAIS : réécrire ou effacer une version est refusé par la base elle-même. */
    await expect(q(`update fsli_analytique set text = 'réécrite en silence' where engagement_id = $1 and fsli_code = $2 and version = 1`, [IDS.engNep, POSTE]))
      .rejects.toThrow(/ANA-03/);
    await expect(q(`delete from fsli_analytique where engagement_id = $1 and fsli_code = $2 and version = 1`, [IDS.engNep, POSTE]))
      .rejects.toThrow(/ANA-03/);
    expect((await versionsAnalytique(IDS.engNep, POSTE))[1].text).toBe('Première rédaction (fictive).');

    /* La piste : un événement par version enregistrée. */
    const ev = await q01<{ n: string }>(
      `select count(*)::text n from event_log where engagement_id = $1 and verb = 'analytique.redigee'`, [IDS.engNep]);
    expect(Number(ev!.n)).toBe(2);
  });

  it('la proposition est déterministe, tracée par un engine_run, et ne compte qu’enregistrée par une personne', async () => {
    const p1 = await proposerAnalytique(IDS.engNep, POSTE);
    const p2 = await proposerAnalytique(IDS.engNep, POSTE);
    expect(p1.texte).toBe(p2.texte);
    expect(p1.texte).toContain('N-1');
    expect(p1.engineRunId).not.toBe(p2.engineRunId);
    const run = await q01<{ engine: string; config_hash: string }>(
      `select engine, config_hash from engine_run where id = $1`, [p1.engineRunId]);
    expect(run).toEqual({ engine: 'revue_analytique', config_hash: (await leadsheetDuPoste(IDS.engNep, POSTE)).empreinte });
    /* CAS CONNU MAUVAIS (revue hostile) : un run d'un autre moteur, ou d'un autre
       dossier, cité comme « proposition » — refusé, nommé ANA-02. */
    const autre = await q01<{ id: string }>(
      `select id::text from engine_run where engagement_id = $1 and engine <> 'revue_analytique' order by started_at limit 1`, [IDS.engNep]);
    expect(autre).not.toBeNull();
    await expect(enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, 'Texte attribué au moteur.', { origine: 'proposee_validee', engineRunId: autre!.id }))
      .rejects.toThrow(/ANA-02/);
    await expect(enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, 'Texte attribué au moteur.', { origine: 'proposee_validee', engineRunId: '00000000-0000-4000-8000-00000000dead' }))
      .rejects.toThrow(/ANA-02/);
    /* Proposer n'enregistre RIEN : la dernière version est encore la seconde. */
    expect((await lireAnalytique(IDS.engNep, POSTE))!.version).toBe(2);
    const v3 = await enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, p1.texte, { origine: 'proposee_validee', engineRunId: p1.engineRunId });
    expect(v3.version).toBe(3);
    expect(await lireAnalytique(IDS.engNep, POSTE)).toMatchObject({ version: 3, origine: 'proposee_validee', engineRunId: p1.engineRunId, texte: p1.texte });
  });

  it('un solde qui change rend la rédaction PÉRIMÉE sans l’effacer (§0.3) ; une rédaction nouvelle la remet à jour ; la revue du dossier lit le même objet', async () => {
    const avant = await lireAnalytique(IDS.engNep, POSTE);
    expect(avant!.perimee).toBe(false);
    await q(
      `update account set balance = balance + 1
       where id = (select a.id from account a join tb_snapshot s on s.id = a.tb_snapshot_id
                   where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active' and a.number like '70%'
                   order by a.number limit 1)`,
      [IDS.engNep]);
    const apres = await lireAnalytique(IDS.engNep, POSTE);
    expect(apres).toMatchObject({ version: avant!.version, texte: avant!.texte, perimee: true });

    const g = await revueAnalytiqueGlobale(IDS.engNep);
    expect(g.origine.source).toBe('dossier_n1');
    const rev = g.postes.find((p) => p.code === POSTE)!;
    expect(rev.retenu).toBe(true);
    expect(rev.revue).toMatchObject({ version: avant!.version, texte: avant!.texte, perimee: true });
    /* Tous les postes du pack y sont, retenus ou non — jamais la seule liste des retenus. */
    expect(g.postes.length).toBeGreaterThan(g.postes.filter((p) => p.retenu).length);
    expect(g.postes.some((p) => p.statement === 'BS') && g.postes.some((p) => p.statement === 'IS')).toBe(true);

    await enregistrerAnalytique(IDS.engNep, POSTE, IDS.users.karim, 'Relue après le ré-import (fictive).', { origine: 'humaine' });
    expect((await lireAnalytique(IDS.engNep, POSTE))!.perimee).toBe(false);
  });
});
