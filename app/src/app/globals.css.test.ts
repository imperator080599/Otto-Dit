import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '@/lib/db/client';

function listerFichiersTsx(dir: string): string[] {
  const resultats: string[] = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const chemin = path.join(dir, entree.name);
    if (entree.isDirectory()) resultats.push(...listerFichiersTsx(chemin));
    else if (entree.name.endsWith('.tsx')) resultats.push(chemin);
  }
  return resultats;
}

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

/* Lot 7, H-6 tranche 3 (2026-09-18). Le garde ci-dessus ne couvre QUE globals.css (dit
   explicitement à sa création, ligne 15) — un `fontSize` en dur sur `className="faint"` dans un
   fichier .tsx (style inline, qui écrase la valeur `var(--t1)` que `.faint` porte déjà en CSS)
   lui échappait entièrement. Recherche dédiée (sous-agent, lecture directe) : 25 sites, 17
   fichiers, avant cette tranche. 15 valaient 11px → migrés vers le nouveau jeton `--t0` ; 6
   valaient 12px → redondants avec la valeur par défaut de `.faint`, l'override inline est
   supprimé. CE QUE CE GARDE NE VÉRIFIE PAS (règle 19) : les attributs SVG `fontSize="N"` (hors
   sujet, ce ne sont pas des `style={{}}` React) ni les `fontSize` sur une classe autre que
   `.faint` (labels, badges — hors périmètre de cette tranche). Quatre sites restent délibérément
   en dur : `risk/page.tsx:440,449` (10px), `testing/atelier.tsx:441` (11.5px) et
   `testing/page.tsx:492` (13px, un élément `"v faint"` qui cumule déjà trois déclarations de
   taille en conflit) — aucune de ces valeurs ne vaut 11px ni 12px, et `testing/*` est le fichier
   où H-6 tranche 2 a cassé deux fois sur `fmtEur` : le seuil ci-dessous les compte comme
   acceptés, nommément, jamais comme un oubli. */
describe('.faint + fontSize en dur dans les .tsx (Lot 7, H-6 tranche 3)', () => {
  const SEUIL_TSX = 4;

  function compterFaintFontSizeEnDur(): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(/className="[^"]*\bfaint\b[^"]*"\s+style=\{\{\s*fontSize:\s*[0-9.]+/g);
      if (m) compte += m.length;
    }
    return compte;
  }

  it('le compte de `.faint` avec `fontSize` numérique en dur ne remonte jamais au-dessus du seuil gardé (règle 17 : cas connu mauvais)', () => {
    const compteAvant = compterFaintFontSizeEnDur();
    expect(compteAvant).toBeLessThanOrEqual(SEUIL_TSX);

    // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
    // défaut doit être vu par le VRAI détecteur (`compterFaintFontSizeEnDur`, pas une copie du
    // regex) — écrit puis supprimé dans le même test, jamais laissé sur le disque (règle 24).
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const fichierSonde = path.join(racineApp, '__sonde_h6_tranche3__.tsx');
    fs.writeFileSync(
      fichierSonde,
      `export const Sonde = () => <div className="faint" style={{ fontSize: 11 }}>x</div>;\n`
    );
    try {
      const compteAvecSonde = compterFaintFontSizeEnDur();
      expect(compteAvecSonde).toBe(compteAvant + 1);
      expect(compteAvecSonde).toBeGreaterThan(SEUIL_TSX);
    } finally {
      fs.rmSync(fichierSonde, { force: true });
    }
    expect(compterFaintFontSizeEnDur()).toBe(compteAvant);
  });
});

/* Lot 7, H-6 tranche 4 (2026-09-18). Recherche dédiée (sous-agent, H-6 tranche 3) : l'échelle
   d'espacement `--e1..--e6` (ADR-125, `--e1: 4px` … `--e6: 32px`) était définie mais avait ZÉRO
   usage de `var(--eN)` hors de `globals.css` lui-même — 94 sites `.tsx` candidats dans 36
   fichiers, trop large pour une tranche verticale (règle 5). Sous-scopée par VALEUR plutôt que
   par zone (le sous-agent recommandait l'inverse pour une tranche future, mais la valeur `gap: 4`
   seule est un cas mécaniquement non ambigu — contrairement à `.faint`/`fontSize`, un `gap` en
   style inline n'a pas de risque de cascade, la substitution `4` → `var(--e1)` = 4px est une
   identité stricte) : les 45 occurrences EXACTES de `gap: 4` (mot entier, jamais `gap: 40` etc.)
   dans 18 fichiers `.tsx`, migrées vers `gap: 'var(--e1)'`. CE QUE CE GARDE NE VÉRIFIE PAS
   (règle 19), délibérément : `gap: 8` (14 sites → `--e2`), les `marginTop`/`marginLeft`/
   `marginRight`/`paddingLeft`/`marginBottom` en dur (avec des valeurs 4/8/12/16/24px, ~49 sites
   restants) et les ~43 déclarations en dur DANS `globals.css` lui-même — tous hors périmètre de
   cette tranche, candidats pour une tranche future. */
describe('gap: 4 en dur dans les .tsx (Lot 7, H-6 tranche 4)', () => {
  const SEUIL_GAP4 = 0;

  function compterGap4EnDur(): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(/gap: 4\b/g);
      if (m) compte += m.length;
    }
    return compte;
  }

  it('le compte de `gap: 4` numérique en dur ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)', () => {
    const compteAvant = compterGap4EnDur();
    expect(compteAvant).toBe(SEUIL_GAP4);

    // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
    // défaut doit être vu par le VRAI détecteur — écrit puis supprimé dans le même test, jamais
    // laissé sur le disque (règle 24).
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const fichierSonde = path.join(racineApp, '__sonde_h6_tranche4__.tsx');
    fs.writeFileSync(
      fichierSonde,
      `export const Sonde = () => <div className="row" style={{ gap: 4 }}>x</div>;\n`
    );
    try {
      const compteAvecSonde = compterGap4EnDur();
      expect(compteAvecSonde).toBe(compteAvant + 1);
      expect(compteAvecSonde).toBeGreaterThan(SEUIL_GAP4);
    } finally {
      fs.rmSync(fichierSonde, { force: true });
    }
    expect(compterGap4EnDur()).toBe(compteAvant);
  });
});

/* Lot 7, H-6 tranche 5 (2026-09-18). Suite mécanique de la tranche 4 : les 14 occurrences EXACTES
   de `gap: 8` (mot entier) dans 9 fichiers `.tsx` (dont trois hors `eng/[id]` : `page.tsx`,
   `nouvelle-mission.tsx`, `methodology/import-form.tsx`), migrées vers `gap: 'var(--e2)'` (`--e2`
   = 8px, ADR-125, jamais redéfini). Même raisonnement que `gap: 4` : identité stricte, aucun
   risque de cascade. CE QUE CE GARDE NE VÉRIFIE PAS (règle 19), délibérément : les `margin*`/
   `padding*` en dur restants (~49 sites, `.tsx`) et les ~43 déclarations en dur DANS
   `globals.css` lui-même — candidats pour une tranche future. */
describe('gap: 8 en dur dans les .tsx (Lot 7, H-6 tranche 5)', () => {
  const SEUIL_GAP8 = 0;

  function compterGap8EnDur(): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(/gap: 8\b/g);
      if (m) compte += m.length;
    }
    return compte;
  }

  it('le compte de `gap: 8` numérique en dur ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)', () => {
    const compteAvant = compterGap8EnDur();
    expect(compteAvant).toBe(SEUIL_GAP8);

    // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
    // défaut doit être vu par le VRAI détecteur — écrit puis supprimé dans le même test, jamais
    // laissé sur le disque (règle 24).
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const fichierSonde = path.join(racineApp, '__sonde_h6_tranche5__.tsx');
    fs.writeFileSync(
      fichierSonde,
      `export const Sonde = () => <div className="row" style={{ gap: 8 }}>x</div>;\n`
    );
    try {
      const compteAvecSonde = compterGap8EnDur();
      expect(compteAvecSonde).toBe(compteAvant + 1);
      expect(compteAvecSonde).toBeGreaterThan(SEUIL_GAP8);
    } finally {
      fs.rmSync(fichierSonde, { force: true });
    }
    expect(compterGap8EnDur()).toBe(compteAvant);
  });
});
