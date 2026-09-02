import { describe, it, expect } from 'vitest';
import { interdits } from './plancher';

// LE DÉTECTEUR DE TESTS ÉTEINTS, ÉPROUVÉ CONTRE SES CAS MAUVAIS (règle 17) :
// la première version ne voyait ni `skipIf`, ni `runIf`, ni `xit`, ni
// `describe.skip` — la revue hostile n°6 les a déposés, et le cliquet a dit
// « aucun .skip/.only/.todo ».

describe('le cliquet voit les formes qui éteignent un test', () => {
  it('dénonce chaque forme connue mauvaise', () => {
    const code = [
      "it.skipIf(true)('a', () => {});",
      "it.runIf(false)('b', () => {});",
      "describe.skipIf(true)('c', () => {});",
      "  xit('d', () => {});",
      "test.only('e', () => {});",
      "it.todo('f');",
      "describe.skip('g', () => {});",
      "it.each([1, 2])('h %i', () => {});",   // vivant : compté par vitest, pas interdit
      "it('i', () => {});",
    ].join('\n');
    const trouves = interdits(code);
    expect(trouves).toHaveLength(7);
    expect(trouves.join('\n')).toMatch(/skipIf/);
    expect(trouves.join('\n')).toMatch(/runIf/);
    expect(trouves.join('\n')).toMatch(/xit/);
    expect(trouves.join('\n')).toMatch(/describe\.skip/);
  });

  it('une exception DÉCLARÉE ne vaut que pour son fichier', () => {
    const code = "it.skipIf(!disponible)('a', () => {});";
    expect(interdits(code, 'tests/pieces-neuves.test.ts')).toEqual([]);
    expect(interdits(code, 'tests/autre.test.ts')).toHaveLength(1);
  });

  it('ne dénonce pas un test vivant', () => {
    expect(interdits("it('a', () => {});\ntest.each([1])('b', () => {});\nfor (const g of L) { it(g, () => {}); }")).toEqual([]);
  });
});
