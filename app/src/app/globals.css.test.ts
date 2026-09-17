import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '@/lib/db/client';

/* Lot 7, H-6 tranche 1 (2026-09-17). globals.css portait 69 déclarations
   `font-size:` en dur avant cette tranche (mesuré par grep, jamais supposé) —
   aucune échelle nommée, alors que l'espacement en a une depuis ADR-125
   (--e1..--e6). Cette tranche nomme --t1..--t6 et migre h1/h2/h3/.faint/
   body/code — 9 déclarations — dessus. CE QUE CE GARDE NE VÉRIFIE PAS
   (règle 19) : il ne juge ni la HIÉRARCHIE visuelle, ni si les six valeurs
   choisies sont les bonnes — seulement que le compte de tailles encore en
   dur ne REMONTE jamais sans qu'une tranche future ne l'ait sciemment
   décidé (en baissant le seuil ici même). Il ne couvre que globals.css :
   un `font-size` en dur dans un fichier `.tsx` (style inline) lui échappe.

   Lot 7, H-6 tranche 2 (2026-09-17) : --t7 (40px) ajouté, `.kpi .v` et
   `.epure-chiffre` unifiés dessus (même rôle sémantique — le chiffre unique
   d'une carte-résumé — deux traitements visuels incompatibles avant cette
   tranche : 22px/700 contre 40px/300). Seuil baissé de 60 à 58 (les deux
   déclarations en dur convergent vers le même jeton). Ce que CE test ajoute
   ne vérifie toujours PAS le poids (`font-weight`) : aucune échelle n'existe
   pour lui dans ce fichier, 300 est recopié tel quel sur les deux règles. */

const CSS_PATH = path.join(repoRoot(), 'app', 'src', 'app', 'globals.css');
const SEUIL_ACTUEL = 58;

function compterFontSizeEnDur(texte: string): number {
  const m = texte.match(/font-size:\s*[0-9.]+px/g);
  return m ? m.length : 0;
}

describe('globals.css : échelle typographique (Lot 7, H-6 tranche 1)', () => {
  it('h1/h2/h3/.faint/body/code lisent la nouvelle échelle --t1..--t6, jamais un px en dur', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    // Les deux points de déclaration de h1/h2/h3 (base + repass ADR-125) doivent TOUS DEUX
    // référencer les jetons — un seul migré et l'autre oublié serait une demi-mesure silencieuse.
    const h1 = [...css.matchAll(/^h1\s*\{([^}]*)\}/gm)];
    const h2 = [...css.matchAll(/^h2\s*\{([^}]*)\}/gm)];
    const h3 = [...css.matchAll(/^h3\s*\{([^}]*)\}/gm)];
    expect(h1.length).toBeGreaterThanOrEqual(2);
    expect(h2.length).toBeGreaterThanOrEqual(2);
    expect(h3.length).toBeGreaterThanOrEqual(2);
    for (const [, corps] of h1) expect(corps).toMatch(/font-size:\s*var\(--t6\)/);
    for (const [, corps] of h2) expect(corps).toMatch(/font-size:\s*var\(--t5\)/);
    for (const [, corps] of h3) expect(corps).toMatch(/font-size:\s*var\(--t3\)/);
    expect(css).toMatch(/\.faint\s*\{[^}]*font-size:\s*var\(--t1\)/);
    expect(css).toMatch(/body\s*\{[^}]*font-size:\s*var\(--t4\)/s);
    expect(css).toMatch(/code,\s*\.mono\s*\{[^}]*font-size:\s*var\(--t2\)/);
  });

  it('.kpi .v et .epure-chiffre (même rôle sémantique, H-6 tranche 2) lisent le MÊME jeton --t7 et le même poids', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const kpiV = css.match(/\.kpi \.v\s*\{([^}]*)\}/);
    const epureChiffre = css.match(/\.epure-chiffre\s*\{([^}]*)\}/);
    expect(kpiV).not.toBeNull();
    expect(epureChiffre).not.toBeNull();
    expect(kpiV![1]).toMatch(/font-size:\s*var\(--t7\)/);
    expect(epureChiffre![1]).toMatch(/font-size:\s*var\(--t7\)/);
    expect(kpiV![1]).toMatch(/font-weight:\s*300/);
    expect(epureChiffre![1]).toMatch(/font-weight:\s*300/);
  });

  it('le compte de `font-size: Npx` en dur ne remonte jamais au-dessus du seuil gardé (règle 17 : cas connu mauvais)', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const compteReel = compterFontSizeEnDur(css);
    expect(compteReel).toBeLessThanOrEqual(SEUIL_ACTUEL);

    // CAS CONNU MAUVAIS (règle 17) : si on réintroduit ne serait-ce qu'UNE déclaration en dur
    // au-delà du seuil gardé, le détecteur doit la voir — prouvé ici en l'injectant dans une
    // copie de texte, jamais dans le vrai fichier (aucune trace laissée sur disque).
    const cssAvecRegression = css + `\n.sonde-h6 { font-size: 17px; }\n`.repeat(SEUIL_ACTUEL + 1 - compteReel);
    const compteApresRegression = compterFontSizeEnDur(cssAvecRegression);
    expect(compteApresRegression).toBeGreaterThan(SEUIL_ACTUEL);
  });
});
