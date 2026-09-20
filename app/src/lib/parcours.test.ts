import { describe, it, expect } from 'vitest';
import {
  direVide, classifierIncident, classerPageerrors, depassementsDePlafond,
  type SignatureAvertissement,
} from './parcours';

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

/**
 * P0-02 (AUD-16). `classifierIncident` ne classe une erreur en avertissement que si l'incident
 * tient en UNE SEULE divergence dont le motif connu apparaît CÔTÉ CLIENT et JAMAIS côté serveur —
 * jamais « toute erreur #418 », jamais une signature qui matcherait par accident une vraie
 * divergence de contenu, et jamais sur la PREMIÈRE d'une liste plus longue (revue hostile
 * 2026-09-20 : la version initiale ne lisait que `ecarts[0]`, exactement le défaut que
 * `divergences()` — `src/lib/core/hydratation.ts` — existe pour refuser). Cas connus mauvais
 * (règle 17) : un motif absent, présent DES DEUX côtés, ou porté par un incident à PLUSIEURS
 * divergences (même si la première matche), ne doit jamais être classé.
 */
describe('classifierIncident', () => {
  const sigs: SignatureAvertissement[] = [
    { id: 'rail-astuce-hydratation', motif: 'rail-astuce', plafond: 4, raison: 'r', depuis: '2026-09-20' },
  ];

  it('classe un incident À UNE SEULE divergence dont le motif est côté client seul', () => {
    const ecarts = [{ serveur: '(rien)', client: '<div class="rail-astuce">…</div>' }];
    expect(classifierIncident(ecarts, sigs)).toBe('rail-astuce-hydratation');
  });

  it('CAS CONNU MAUVAIS : ne classe pas un incident sans divergence', () => {
    expect(classifierIncident(undefined, sigs)).toBeNull();
  });

  it('CAS CONNU MAUVAIS : ne classe pas un incident dont le motif est absent des deux côtés', () => {
    const ecarts = [{ serveur: '<div>autre chose</div>', client: '<div>encore autre chose</div>' }];
    expect(classifierIncident(ecarts, sigs)).toBeNull();
  });

  it('CAS CONNU MAUVAIS : ne classe pas un motif présent des DEUX côtés (vraie divergence possible)', () => {
    const ecarts = [{ serveur: '<div class="rail-astuce">A</div>', client: '<div class="rail-astuce">B</div>' }];
    expect(classifierIncident(ecarts, sigs)).toBeNull();
  });

  it('sans signature connue (fichier absent/vide), rien ne se classe jamais', () => {
    const ecarts = [{ serveur: '(rien)', client: '<div class="rail-astuce">…</div>' }];
    expect(classifierIncident(ecarts, [])).toBeNull();
  });

  it('CAS CONNU MAUVAIS (revue hostile) : ne classe PAS un incident à PLUSIEURS divergences même si la première matche une signature connue', () => {
    const ecarts = [
      { serveur: '(rien)', client: '<div class="rail-astuce">…</div>' },
      { serveur: '<div>montant : 100</div>', client: '<div>montant : 999</div>' },
    ];
    expect(classifierIncident(ecarts, sigs)).toBeNull();
  });
});

describe('classerPageerrors', () => {
  const sigs: SignatureAvertissement[] = [
    { id: 'rail-astuce-hydratation', motif: 'rail-astuce', plafond: 4, raison: 'r', depuis: '2026-09-20' },
  ];
  const incidentConnu = { ecarts: [{ serveur: '(rien)', client: '<div class="rail-astuce">…</div>' }] };
  const incidentInconnu = { ecarts: [{ serveur: '<div>A</div>', client: '<div>B</div>' }] };

  it('classe les pageerror connues, laisse le reste (console/5xx) dans dursReels', () => {
    const durs = ['CONSOLE sur /x : bruit', 'EXCEPTION sur /rcm : Minified React error #418; …'];
    const pageerrors = ['EXCEPTION sur /rcm : Minified React error #418; …'];
    const r = classerPageerrors(durs, pageerrors, [incidentConnu], sigs);
    expect(r.avertissementsComptes).toEqual({ 'rail-astuce-hydratation': 1 });
    expect(r.dursReels).toEqual(['CONSOLE sur /x : bruit']);
  });

  it('CAS CONNU MAUVAIS : une pageerror #418 dont l’incident ne matche aucune signature reste bloquante', () => {
    const pageerrors = ['EXCEPTION sur /autre : Minified React error #418; …'];
    const r = classerPageerrors(pageerrors, pageerrors, [incidentInconnu], sigs);
    expect(r.avertissementsComptes).toEqual({});
    expect(r.dursReels).toEqual(pageerrors);
  });

  it('CAS CONNU MAUVAIS : une pageerror d’un AUTRE code (jamais capté par la sonde) reste bloquante', () => {
    const pageerrors = ['EXCEPTION sur /x : TypeError: réellement cassé'];
    const r = classerPageerrors(pageerrors, pageerrors, [], sigs);
    expect(r.avertissementsComptes).toEqual({});
    expect(r.dursReels).toEqual(pageerrors);
  });

  it('sans fichier de signatures (liste vide), toute #418 reste bloquante', () => {
    const pageerrors = ['EXCEPTION sur /rcm : Minified React error #418; …'];
    const r = classerPageerrors(pageerrors, pageerrors, [incidentConnu], []);
    expect(r.avertissementsComptes).toEqual({});
    expect(r.dursReels).toEqual(pageerrors);
  });
});

describe('depassementsDePlafond', () => {
  const sigs: SignatureAvertissement[] = [
    { id: 'rail-astuce-hydratation', motif: 'rail-astuce', plafond: 4, raison: 'r', depuis: '2026-09-20' },
  ];

  it('un compte SOUS le plafond ne rougit rien', () => {
    expect(depassementsDePlafond({ 'rail-astuce-hydratation': 4 }, sigs)).toEqual([]);
  });

  it('CAS CONNU MAUVAIS : un compte AU-DESSUS du plafond rougit, nommé', () => {
    expect(depassementsDePlafond({ 'rail-astuce-hydratation': 5 }, sigs))
      .toEqual(['rail-astuce-hydratation : 5 > plafond 4']);
  });
});
