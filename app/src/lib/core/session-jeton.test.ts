import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signerIdentite, verifierIdentite, secretDeSessionPose } from './session-jeton';

// P2-03a (AUD-07) : LA SIGNATURE DU COOKIE DE SESSION.
//
// Règle 17 : chaque garde s'éprouve d'abord contre un cas connu MAUVAIS —
// un cookie forgé, tronqué, ou signé avec un secret différent — avant d'être
// crue.

const UUID_VALIDE = '00000000-0000-4000-8000-000000000001';

describe('session-jeton : signature du cookie', () => {
  const AVANT = process.env.OTTO_SESSION_SECRET;
  afterEach(() => { process.env.OTTO_SESSION_SECRET = AVANT; });

  it('signe puis vérifie : l’identifiant revient inchangé', async () => {
    const cookie = await signerIdentite(UUID_VALIDE);
    expect(cookie.startsWith(`${UUID_VALIDE}.`)).toBe(true);
    await expect(verifierIdentite(cookie)).resolves.toBe(UUID_VALIDE);
  });

  it('cas connu mauvais : un cookie nu (sans signature) est refusé', async () => {
    await expect(verifierIdentite(UUID_VALIDE)).resolves.toBeNull();
  });

  it('cas connu mauvais : une signature tronquée est refusée', async () => {
    const cookie = await signerIdentite(UUID_VALIDE);
    await expect(verifierIdentite(cookie.slice(0, -4))).resolves.toBeNull();
  });

  it('cas connu mauvais : une signature d’un AUTRE identifiant, collée ici, est refusée', async () => {
    const cookieA = await signerIdentite(UUID_VALIDE);
    const sigA = cookieA.split('.')[1];
    const autre = '00000000-0000-4000-8000-000000000002';
    await expect(verifierIdentite(`${autre}.${sigA}`)).resolves.toBeNull();
  });

  it('cas connu mauvais : un identifiant qui n’est pas un UUID est refusé, même bien signé', async () => {
    const cookie = await signerIdentite('drop table app_user');
    await expect(verifierIdentite(cookie)).resolves.toBeNull();
  });

  it('cas connu mauvais : absent, vide, ou sans point est refusé', async () => {
    await expect(verifierIdentite(undefined)).resolves.toBeNull();
    await expect(verifierIdentite('')).resolves.toBeNull();
    await expect(verifierIdentite(UUID_VALIDE + '.')).resolves.toBeNull();
  });

  it('un secret DIFFÉRENT ne vérifie plus un cookie signé sous l’ancien secret', async () => {
    process.env.OTTO_SESSION_SECRET = 'premier-secret-de-sonde';
    const cookie = await signerIdentite(UUID_VALIDE);
    process.env.OTTO_SESSION_SECRET = 'second-secret-de-sonde-different';
    await expect(verifierIdentite(cookie)).resolves.toBeNull();
  });

  it('secretDeSessionPose : reflète OTTO_SESSION_SECRET, jamais le secret lui-même', () => {
    delete process.env.OTTO_SESSION_SECRET;
    expect(secretDeSessionPose()).toBe(false);
    process.env.OTTO_SESSION_SECRET = 'un-secret-de-sonde';
    expect(secretDeSessionPose()).toBe(true);
  });
});
