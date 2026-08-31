// `?comme=` — la règle, et ses refus, sans serveur.
import { describe, it, expect } from 'vitest';
import { identiteDeLUrl } from './middleware';

const UN = 'e4f6dc10-2b93-45b7-a671-2425eddd7801';

describe('identité passée par l’URL (démonstration publique seulement)', () => {
  it('hors démonstration publique, elle est IGNORÉE — quoi qu’on passe', () => {
    expect(identiteDeLUrl(UN, false)).toBeNull();
  });
  it('sur la démonstration publique, un identifiant valide est retenu', () => {
    expect(identiteDeLUrl(UN, true)).toBe(UN);
  });
  it('tout ce qui n’est pas un identifiant est refusé — un prénom, une injection, un vide', () => {
    for (const v of ['claire', '', "' or 1=1--", '../../etc/passwd', `${UN} `]) {
      expect(identiteDeLUrl(v, true)).toBeNull();
    }
    expect(identiteDeLUrl(null, true)).toBeNull();
  });
});
