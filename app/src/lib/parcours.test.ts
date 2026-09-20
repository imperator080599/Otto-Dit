import { describe, it, expect } from 'vitest';
import { direVide } from './parcours';

/**
 * P0-03 (AUD-17). `direVide` dénonce toute assertion `dire(nom, true, …)` du
 * parcours cliqué — un littéral qui ne teste rien, contrairement à un booléen
 * calculé qui peut réellement être faux. Éprouvé contre son cas connu mauvais
 * (règle 17) : un site vide DOIT être détecté ; un site avec un vrai prédicat
 * ne doit JAMAIS l'être, même quand ce prédicat vaut `true` à l'exécution.
 */
describe('direVide', () => {
  it('CAS CONNU MAUVAIS : dénonce dire(nom, true, note) sur une seule ligne', () => {
    const code = `dire('une station vide de sens', true, 'note');`;
    expect(direVide(code)).toEqual(['une station vide de sens']);
  });

  it('CAS CONNU MAUVAIS : dénonce dire(nom, true, note) réparti sur plusieurs lignes', () => {
    const code = [
      "dire('une station vide de sens',",
      '  true, note);',
    ].join('\n');
    expect(direVide(code)).toEqual(['une station vide de sens']);
  });

  it('ne dénonce PAS un booléen calculé, même littéralement vrai à la lecture', () => {
    const code = `dire('une vraie assertion', enAttente === 0, 'note');`;
    expect(direVide(code)).toEqual([]);
  });

  it('ne dénonce PAS un booléen calculé qui contient le mot true ailleurs dans l’expression', () => {
    const code = `dire('vérifie un drapeau', estVraiment === true, 'note');`;
    expect(direVide(code)).toEqual([]);
  });

  it('dénonce chaque site, avec son propre nom, sur plusieurs occurrences', () => {
    const code = [
      `dire('premier site vide', true, 'a');`,
      `dire('un site réel', compte > 0, 'b');`,
      `dire('second site vide', true, 'c');`,
    ].join('\n');
    expect(direVide(code)).toEqual(['premier site vide', 'second site vide']);
  });

  it('le vrai scenario.ts du dépôt ne porte plus aucun site vide', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { repoRoot } = await import('./db/client');
    const code = fs.readFileSync(
      path.join(repoRoot(), 'app', 'scripts', 'clics', 'scenario.ts'), 'utf8',
    );
    expect(direVide(code)).toEqual([]);
  });
});
