// LE CLIQUET DES TESTS — la part qu'on peut ÉPROUVER (1.7, revue hostile n°6).
//
// La première version comptait les `it(` d'un fichier par expression
// régulière : sept `it(` textuels pour vingt tests réels dans gardes.test.ts
// (une boucle), zéro pour `test.each`, et `it.skipIf(true)` passait pour un
// test vivant. Le compte vient désormais de vitest lui-même (`vitest list`,
// qui COLLECTE les tests sans les exécuter — boucles et `each` compris) ; ce
// module ne garde que la détection des formes ÉTEINTES, qui se lit dans le
// code, et son cas connu mauvais est dans plancher.test.ts.

/** LES EXCEPTIONS DÉCLARÉES — un fichier, une raison. Une forme éteinte y est
 *  permise parce qu'elle garde une ressource OPTIONNELLE, pas un test qu'on
 *  n'a pas envie de voir ; elle est comptée, jamais tue. */
export const EXCEPTIONS: Record<string, string> = {
  'tests/pieces-neuves.test.ts':
    'les tests du jeu de pièces ENGENDRÉ ne tournent que si le jeu est là (dataset/pieces_neuves, produit par npm run pieces:neuves) — skipIf sur sa présence',
};

/** Les formes qui éteignent ou isolent un test, dans le texte d'un fichier.
 *  `fichier` (chemin relatif au dépôt) permet l'exception déclarée. */
export function interdits(code: string, fichier?: string): string[] {
  if (fichier && fichier in EXCEPTIONS) return [];
  const out: string[] = [];
  const formes: [RegExp, string][] = [
    [/^\s*(?:it|test|describe)\.(skip|only|todo|skipIf|runIf|concurrent\.skip|concurrent\.only)\(/gm, 'modificateur'],
    [/^\s*(?:it|test|describe)\.each\([^)]*\)\.(skip|only|todo)\(/gm, 'each.modificateur'],
    [/^\s*x(?:it|test|describe)\(/gm, 'x-préfixe'],
    [/^\s*f(?:it|test|describe)\(/gm, 'f-préfixe'],
  ];
  for (const [re, nature] of formes) {
    for (const m of code.matchAll(re)) out.push(`${nature} : ${m[0].trim()}`);
  }
  return out;
}
