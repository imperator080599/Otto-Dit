import { describe, it, expect } from 'vitest';
import { hacherJetonPortail } from './jeton-portail';

// P2-03b (AUD-07) : LE HACHAGE DU JETON PORTAIL.
//
// Règle 17 : la fonction s'éprouve contre des cas connus — déterminisme (le
// même jeton hache toujours pareil, sinon `portalSession` ne retrouverait
// jamais un contact réel), et discrimination (deux jetons différents, même
// proches d'un caractère, ne doivent JAMAIS produire le même hachage — sinon
// deux contacts distincts partageraient une identité).
describe('hacherJetonPortail', () => {
  it('est déterministe : le même jeton hache toujours à l’identique', () => {
    expect(hacherJetonPortail('demo-sophie-altiverre')).toBe(hacherJetonPortail('demo-sophie-altiverre'));
  });

  it('rend un hex sha256 (64 caractères hexadécimaux), jamais le jeton en clair', () => {
    const h = hacherJetonPortail('demo-sophie-altiverre');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('sophie');
  });

  it('cas connu mauvais : deux jetons distincts, même proches d’un caractère, hachent différemment', () => {
    const a = hacherJetonPortail('demo-sophie-altiverre');
    const b = hacherJetonPortail('demo-sophie-altiverrf');
    expect(a).not.toBe(b);
  });

  it('cas connu mauvais : une chaîne vide n’est pas confondue avec un jeton réel', () => {
    expect(hacherJetonPortail('')).not.toBe(hacherJetonPortail('demo-sophie-altiverre'));
  });
});
