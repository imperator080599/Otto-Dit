import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { obstaclesAnalytique } from './obstacles';
import { fsliAccounts } from './fsli';

// ANA-04 (Lot 6, mandat 2026-09-05 plan d'autonomie, Partie D.1 : « revue analytique périmée qui
// bloque le visa ») — LES OBSTACLES AU VISA.
//
// La détection de péremption (`analytique.ts::lireAnalytique`, comparaison du `soldes_hash` figé à
// l'empreinte courante de la leadsheet) existait déjà, affichée sur l'écran du poste ; seul le
// BLOCAGE au visa manquait. Ce test éprouve le blocage lui-même, en mutant un solde HORS du chemin
// gardé (SQL direct sur `account`, jamais par un ré-import) pour prouver que l'obstacle ATTRAPE la
// péremption (règle 17) — et le revert dans le même test prouve qu'il s'efface une fois résolue.

describe('ANA-04 : la revue analytique périmée bloque le visa', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('les huit revues analytiques du monde de démonstration, fraîchement rédigées, ne lèvent AUCUN obstacle', async () => {
    /* Cas connu BON, protecteur du faux positif (règle 25) : une famille neuve ne doit jamais
       rendre la démonstration insignable. Les huit postes du Lot 5 rédigent leur revue analytique
       à la fin de leur propre `planifier*()`, contre le solde du moment — elles ne sont donc
       jamais périmées à la sortie de `runPart1UpToWorkpaper()`. */
    const obstacles = await obstaclesAnalytique(IDS.engNep);
    expect(obstacles).toEqual([]);
  });

  it('ANA-04, cas connu mauvais (règle 17) : un solde qui bouge APRÈS la rédaction rend la revue périmée, et ça bloque', async () => {
    const comptes = await fsliAccounts(IDS.engNep, 'CASH');
    expect(comptes.length, 'CASH doit porter au moins un compte pour ce test').toBeGreaterThan(0);
    const compte = comptes[0];
    const snap = await q1<{ id: string }>(
      `select id::text from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'`,
      [IDS.engNep],
    );
    /* Mutation SQL DIRECTE, hors du chemin gardé (jamais un ré-import) — le seul moyen de faire
       bouger la leadsheet sans que rien ne rédige une nouvelle version de la revue, exactement le
       scénario qu'ANA-04 doit attraper. */
    await q(`update account set balance = balance + 100 where tb_snapshot_id = $1 and number = $2`, [snap.id, compte.number]);
    try {
      const obstacles = await obstaclesAnalytique(IDS.engNep);
      const trouve = obstacles.find((o) => o.cle === 'obst.analytiquePerimee' && o.vars?.code === 'CASH');
      expect(trouve, 'ANA-04 doit lever quand la revue de CASH est périmée').toBeDefined();
      expect(trouve?.vars?.version).toBe(1);
    } finally {
      await q(`update account set balance = balance - 100 where tb_snapshot_id = $1 and number = $2`, [snap.id, compte.number]);
    }
    /* Le revert restaure l'empreinte d'origine : l'obstacle doit s'effacer de lui-même, sans
       rédaction manuelle — la preuve que le prédicat compare bien contre les soldes COURANTS,
       jamais contre un instantané figé au moment de la détection. */
    const apresRevert = await obstaclesAnalytique(IDS.engNep);
    expect(apresRevert.find((o) => o.vars?.code === 'CASH')).toBeUndefined();
  });

  it('un poste RETENU sans AUCUNE revue analytique rédigée ne bloque pas ici (règle 19 : le périmètre de cette famille)', async () => {
    /* REVENUE ne reçoit pas de revue analytique par ce chemin (`runPart1UpToWorkpaper()`) — un cas
       naturel, jamais fabriqué. Le mandat nomme « périmée », pas « manquante » : une revue jamais
       rédigée n'est pas de cette famille. Si REVENUE recevait un jour sa propre revue par un autre
       chemin, ce test cesserait de prouver la frontière et devrait être refait sur un autre poste
       — c'est voulu, pas fragile : mieux vaut qu'il échoue bruyamment que de garder un test qui ne
       prouve plus rien en silence. */
    const aUneRevue = await q1<{ n: string }>(
      `select count(*)::text n from fsli_analytique where engagement_id = $1 and fsli_code = 'REVENUE'`,
      [IDS.engNep],
    );
    expect(aUneRevue.n, 'ce test suppose REVENUE sans revue analytique par ce chemin').toBe('0');
    const obstacles = await obstaclesAnalytique(IDS.engNep);
    expect(obstacles.find((o) => o.vars?.code === 'REVENUE')).toBeUndefined();
  });
});
