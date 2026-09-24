import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { exitMember } from '@/lib/services/team';
import { activeMembership, identifiantExisteEnBase } from '@/lib/core/auth';

/**
 * R40 — le cas connu MAUVAIS (règle 17) : avant le correctif, `requireMember`
 * lisait `engagement_member` sans filtrer `exited_on`, donc un membre SORTI
 * de la mission gardait ses écrans et ses boutons — refusé seulement plus
 * tard, au geste, par le service. Ce fichier éprouve la lecture qui décide,
 * pas le geste qui la suit.
 */
describe('R40 — activeMembership ne rend plus un membre sorti', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  it('un membre actif est rendu', async () => {
    const m = await activeMembership(IDS.engNep, IDS.users.lea);
    expect(m).not.toBeNull();
    expect(m!.engagement_id).toBe(IDS.engNep);
  });

  it('un membre SORTI n’est plus une appartenance active — requireMember redirigerait', async () => {
    await exitMember(IDS.engNep, IDS.users.lea, '2026-03-20', IDS.users.claire);
    const m = await activeMembership(IDS.engNep, IDS.users.lea);
    expect(m).toBeNull();
  });
});

/**
 * P2-03a (AUD-07) — le cas connu MAUVAIS (règle 17) : `loginAction` posait le
 * cookie pour N'IMPORTE QUELLE chaîne reçue du formulaire, jamais vérifiée
 * contre `app_user`. `identifiantExisteEnBase` est le contrôle qui ferme ce
 * trou — éprouvé ici avant d'être cru sur un id forgé.
 */
describe('P2-03a — identifiantExisteEnBase refuse un identifiant forgé', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  it('un identifiant réel existe', async () => {
    expect(await identifiantExisteEnBase(IDS.users.claire)).toBe(true);
  });

  it('cas connu mauvais : un uuid bien formé mais jamais semé n’existe pas', async () => {
    expect(await identifiantExisteEnBase('00000000-0000-4000-8000-0000000000ff')).toBe(false);
  });

  it('cas connu mauvais : une chaîne forgée, pas même un uuid, n’existe pas', async () => {
    expect(await identifiantExisteEnBase("'; drop table app_user; --")).toBe(false);
  });
});
