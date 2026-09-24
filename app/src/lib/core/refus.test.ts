import { describe, it, expect } from 'vitest';
import { refus, Refus, REGISTRE_REFUS } from './refus';

// P1-09 (AUD-14). Deux choses à prouver : (1) un code catalogué produit un
// `Refus` qui garde EXACTEMENT le format `CODE : détail` que `separerCode`
// (app/refus.ts) attendait déjà, et (2) un code NON catalogué ne se pose pas
// — règle 13 : un refus qu'on invente au site d'appel, jamais vu par le
// registre, est le silence que cette classe existe pour empêcher.
describe('refus() / Refus', () => {
  it('un code catalogué produit un Refus avec le format « CODE : détail »', () => {
    const r = refus('ETANCH-01', 'ce dossier n’est pas de ce cabinet');
    expect(r).toBeInstanceOf(Refus);
    expect(r).toBeInstanceOf(Error);
    expect(r.message).toBe('ETANCH-01 : ce dossier n’est pas de ce cabinet');
    expect(r.code).toBe('ETANCH-01');
    expect(r.cle).toBe('refus.ETANCH-01');
    expect(r.vars.detail).toBe('ce dossier n’est pas de ce cabinet');
  });

  it('cas connu mauvais (règle 17) : un code absent du registre ne lève PAS un Refus', () => {
    expect(() => refus('CODE-QUI-N-EXISTE-PAS', 'x')).toThrow(/absent de REGISTRE_REFUS/);
    try {
      refus('CODE-QUI-N-EXISTE-PAS', 'x');
    } catch (e) {
      expect(e).not.toBeInstanceOf(Refus);
      /* Revue hostile (voix 1, P1-09) : ce cas doit être un TypeError, pas un
         Error nu — sinon `estUnePanneTechnique` (app/refus.ts) le classe comme
         un refus « historique » et fuit ce message INTERNE brut à l'écran. */
      expect(e).toBeInstanceOf(TypeError);
    }
  });

  it('chaque code du registre a une entrée de catalogue i18n déclarée (refus.<CODE>)', async () => {
    const { LIBELLES } = await import('@/lib/i18n/catalogue');
    for (const [code, def] of Object.entries(REGISTRE_REFUS)) {
      expect(def.cle, `code ${code}`).toBe(`refus.${code}`);
      expect(Object.prototype.hasOwnProperty.call(LIBELLES, def.cle), `catalogue manque ${def.cle}`).toBe(true);
    }
  });
});
