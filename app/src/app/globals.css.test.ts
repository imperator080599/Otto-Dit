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
   pour lui dans ce fichier, 300 est recopié tel quel sur les deux règles.

   Lot 7, H-6 tranche 9 (2026-09-18) : première tranche à migrer une
   déclaration en dur DANS `globals.css` lui-même plutôt que dans un `.tsx`
   (recherche dédiée : le cluster identifié par la tranche 8 comme « ~43
   déclarations » mesurait en réalité 49 sites à valeur unique et jeton
   EXACT — 22 d'espacement, 27 de taille de police, mesurés par script, pas
   supposés). Sous-scopé au plus gros cluster homogène : `font-size: 11px`
   en dur, 13 occurrences, chacune une déclaration ISOLÉE dans sa règle
   (aucun raccourci CSS partagé), migrées vers `font-size: var(--t0)` — le
   même jeton, la même valeur, une identité stricte. Seuil baissé de 58 à
   45. CE QUE CETTE TRANCHE NE COUVRE PAS (règle 19) : les 36 autres sites
   à valeur unique et jeton exact (14 de `font-size` à d'autres valeurs :
   9× 12px, 3× 12.5px, 1× 15px, 1× 13.5px ; 22 d'espacement `margin*`/
   `padding*`/`gap` DANS ce fichier), ni les ~13 déclarations de police ou
   d'espacement dont la valeur ne correspond à AUCUN jeton existant
   (10px, 18px, 20px, 26px, etc.) — celles-ci resteraient hors périmètre
   même après une migration complète du cluster mesuré, sauf à inventer un
   nouveau jeton, ce qu'aucune tranche H-6 n'a fait depuis --t0/--t7.

   Lot 7, H-6 tranche 10 (2026-09-18) : suite mécanique directe de la
   tranche 9 — `font-size: 12px` en dur, 9 occurrences, chacune une
   déclaration ISOLÉE dans sa règle (même vérification que la tranche 9 :
   aucun raccourci `font:` partagé), migrées vers `font-size: var(--t1)` —
   le même jeton, la même valeur (le token `--t1: 12px` est déjà la
   valeur par défaut de `.faint`, inchangé par cette tranche). Seuil
   baissé de 45 à 36 (45 − 9 = 36, confirmé par le détecteur lui-même).
   CE QUE CETTE TRANCHE NE COUVRE PAS (règle 19) : les 5 autres sites de
   `font-size` à valeur unique et jeton exact (3× 12.5px, 1× 15px, 1×
   13.5px), les 22 sites d'espacement `margin*`/`padding*`/`gap` DANS ce
   fichier, et les déclarations sans jeton correspondant — mêmes
   candidats que ceux nommés par la tranche 9, réduits d'autant.

   Lot 7, H-6 tranche 11 (2026-09-18) : CLÔTURE du cluster `font-size` à
   jeton exact DANS `globals.css` — les 3 dernières valeurs restantes,
   chacune trop petite (1 à 3 sites) pour son propre rituel d'expédition,
   batchées en une tranche consolidée (5 sites, 5 fichiers, même
   raisonnement que la tranche 8 pour `margin*`/`padding*`) : `12.5px` →
   `--t2` (3 sites : `.etape`, `.entete-poste-sous`, `.ancres`), `15px` →
   `--t5` (1 site : `.topbar .brand`), `13.5px` → `--t3` (1 site :
   `details.repli > summary h3`). Chacune une déclaration ISOLÉE dans sa
   règle, aucun raccourci `font:` partagé. Seuil baissé de 36 à 31 (36 −
   5 = 31, confirmé par le détecteur lui-même). MESURÉ APRÈS cette
   tranche, pas supposé : les 31 déclarations `font-size` restantes DANS
   ce fichier (13× 13px, 9× 11.5px, 5× 10px, 1× 9px, 1× 26px, 1× 18px, 1×
   10.5px) ne correspondent plus à AUCUN jeton `--tN` existant — le
   cluster à jeton exact est donc CLOS, ce qui reste exigerait d'inventer
   un nouveau jeton, ce qu'aucune tranche H-6 n'a fait depuis --t0/--t7.
   CE QUE CETTE TRANCHE NE COUVRE PAS (règle 19) : les 22 sites
   d'espacement `margin*`/`padding*`/`gap` DANS ce fichier — seul cluster
   restant du mandat de tranche 9, candidat pour une tranche future. */

const CSS_PATH = path.join(repoRoot(), 'app', 'src', 'app', 'globals.css');
const SEUIL_ACTUEL = 31;

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

  it('les 13 sites migrés par H-6 tranche 9 lisent tous var(--t0), plus aucun 11px en dur parmi eux', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const selecteurs = [
      /\.topbar \.demo-badge\s*\{[^}]*\}/,
      /\.rail-lien\.grise \.raison\s*\{[^}]*\}/,
      /\.lien-piece\s*\{[^}]*\}/,
      /\.etape-detail\s*\{[^}]*\}/,
      /\.ai-flag\s*\{[^}]*\}/,
      /\.mod-flag\s*\{[^}]*\}/,
      /\.annotable > \.puce-note\s*\{[^}]*\}/s,
      /summary\.repli-action::before\s*\{[^}]*\}/,
      /\.visa-quand\s*\{[^}]*\}/,
      /details\.repli > summary \.chevron\s*\{[^}]*\}/,
      /\.rail-defaut\s*\{[^}]*\}/,
      /\.epure-mono\s*\{[^}]*\}/,
      /\.epure-badge\s*\{[^}]*\}/,
    ];
    for (const motif of selecteurs) {
      const m = css.match(motif);
      expect(m, `motif introuvable : ${motif}`).not.toBeNull();
      expect(m![0]).toMatch(/font-size:\s*var\(--t0\)/);
    }
  });

  it('les 9 sites migrés par H-6 tranche 10 lisent tous var(--t1), plus aucun 12px en dur parmi eux', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const selecteurs = [
      /\.rail-tout\s*\{[^}]*\}/,
      /\.rail-bascule\s*\{[^}]*\}/,
      /\.legende\s*\{[^}]*\}/,
      /table\.data th\s*\{[^}]*\}/s,
      /\.btn\.small\s*\{[^}]*\}/,
      /label\.fld span\s*\{[^}]*\}/,
      /\.kpi \.l\s*\{[^}]*\}/,
      /\.note-cible\s*\{[^}]*\}/,
      /\.repli-resume\s*\{[^}]*\}/,
    ];
    for (const motif of selecteurs) {
      const m = css.match(motif);
      expect(m, `motif introuvable : ${motif}`).not.toBeNull();
      expect(m![0]).toMatch(/font-size:\s*var\(--t1\)/);
    }
  });

  it('les 5 sites migrés par H-6 tranche 11 (CLÔTURE du cluster font-size) lisent tous leur jeton, plus aucune valeur en dur parmi eux', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const cas: Array<{ motif: RegExp; jeton: string }> = [
      { motif: /\.etape\s*\{[^}]*\}/, jeton: '--t2' },
      { motif: /\.entete-poste-sous\s*\{[^}]*\}/, jeton: '--t2' },
      { motif: /\.ancres\s*\{[^}]*\}/, jeton: '--t2' },
      { motif: /\.topbar \.brand\s*\{[^}]*\}/, jeton: '--t5' },
      { motif: /details\.repli > summary h3\s*\{[^}]*\}/, jeton: '--t3' },
    ];
    for (const { motif, jeton } of cas) {
      const m = css.match(motif);
      expect(m, `motif introuvable : ${motif}`).not.toBeNull();
      expect(m![0]).toMatch(new RegExp(`font-size:\\s*var\\(${jeton.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
    }
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

/* Lot 7, H-6 tranche 6 (2026-09-18). Premier pas dans le cluster `margin*`/`padding*` en dur
   (identifié par la recherche de H-6 tranche 3, ~49 sites au total, hétérogène — plusieurs
   propriétés CSS distinctes, plusieurs valeurs). Sous-scopé à la propriété+valeur la plus
   fréquente : `marginTop: 4` (10 sites, 6 fichiers), migrée vers `marginTop: 'var(--e1)'`. Même
   raisonnement que `gap` (identité stricte 4 === 4px, aucun risque de cascade — `marginTop` en
   style inline n'est jamais partiellement écrasé par une règle `.faint`/`.mono` du fichier CSS).
   CE QUE CE GARDE NE VÉRIFIE PAS (règle 19), délibérément : les autres propriétés/valeurs du
   cluster (`marginTop: 8/12`, `marginLeft: 4/8`, `marginRight: 4`, `marginBottom: 4/8`,
   `paddingLeft: 8/16`, ~39 sites restants) et les ~43 déclarations en dur DANS `globals.css`
   lui-même — tranches futures. */
describe('marginTop: 4 en dur dans les .tsx (Lot 7, H-6 tranche 6)', () => {
  const SEUIL_MARGINTOP4 = 0;

  function compterMarginTop4EnDur(): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(/marginTop: 4\b/g);
      if (m) compte += m.length;
    }
    return compte;
  }

  it('le compte de `marginTop: 4` numérique en dur ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)', () => {
    const compteAvant = compterMarginTop4EnDur();
    expect(compteAvant).toBe(SEUIL_MARGINTOP4);

    // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
    // défaut doit être vu par le VRAI détecteur — écrit puis supprimé dans le même test, jamais
    // laissé sur le disque (règle 24).
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const fichierSonde = path.join(racineApp, '__sonde_h6_tranche6__.tsx');
    fs.writeFileSync(
      fichierSonde,
      `export const Sonde = () => <div style={{ marginTop: 4 }}>x</div>;\n`
    );
    try {
      const compteAvecSonde = compterMarginTop4EnDur();
      expect(compteAvecSonde).toBe(compteAvant + 1);
      expect(compteAvecSonde).toBeGreaterThan(SEUIL_MARGINTOP4);
    } finally {
      fs.rmSync(fichierSonde, { force: true });
    }
    expect(compterMarginTop4EnDur()).toBe(compteAvant);
  });
});

/* Lot 7, H-6 tranche 7 (2026-09-18). Suite mécanique du cluster `margin*`/`padding*` : la
   propriété+valeur suivante par fréquence, `marginLeft: 4` (7 sites, 4 fichiers, dont un via un
   composant — `IaFlag style={{ marginLeft: 4 }}`, dont le prop `style?: CSSProperties` est
   forwardé tel quel, vérifié dans `ia-flag.tsx`), migrée vers `marginLeft: 'var(--e1)'`. Même
   vérification que la tranche 6 (aucun raccourci `margin` sur le même objet de style). CE QUE CE
   GARDE NE VÉRIFIE PAS (règle 19), délibérément : `marginTop: 8/12`, `marginLeft: 8`,
   `marginRight: 4`, `marginBottom: 4/8`, `paddingLeft: 8/16` (~32 sites restants) et les ~43
   déclarations en dur DANS ce fichier lui-même — tranches futures. */
describe('marginLeft: 4 en dur dans les .tsx (Lot 7, H-6 tranche 7)', () => {
  const SEUIL_MARGINLEFT4 = 0;

  function compterMarginLeft4EnDur(): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(/marginLeft: 4\b/g);
      if (m) compte += m.length;
    }
    return compte;
  }

  it('le compte de `marginLeft: 4` numérique en dur ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)', () => {
    const compteAvant = compterMarginLeft4EnDur();
    expect(compteAvant).toBe(SEUIL_MARGINLEFT4);

    // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
    // défaut doit être vu par le VRAI détecteur — écrit puis supprimé dans le même test, jamais
    // laissé sur le disque (règle 24).
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const fichierSonde = path.join(racineApp, '__sonde_h6_tranche7__.tsx');
    fs.writeFileSync(
      fichierSonde,
      `export const Sonde = () => <div style={{ marginLeft: 4 }}>x</div>;\n`
    );
    try {
      const compteAvecSonde = compterMarginLeft4EnDur();
      expect(compteAvecSonde).toBe(compteAvant + 1);
      expect(compteAvecSonde).toBeGreaterThan(SEUIL_MARGINLEFT4);
    } finally {
      fs.rmSync(fichierSonde, { force: true });
    }
    expect(compterMarginLeft4EnDur()).toBe(compteAvant);
  });
});

/* Lot 7, H-6 tranche 8 (2026-09-18). Clôture du cluster `margin*`/`padding*` identifié par la
   tranche 3 : les 8 paires propriété+valeur restantes, chacune trop petite (1 à 4 sites) pour
   justifier sa propre tranche/son propre rituel d'expédition — batchées en UNE tranche
   consolidée, 20 sites au total, 15 fichiers. Chaque paire garde son propre test (règle 17 :
   chaque motif est réellement exercé par son propre cas connu mauvais, pas une seule assertion
   groupée qui masquerait laquelle des 8 a régressé) :
   - `marginTop: 8` → `--e2` (2 sites) · `marginTop: 12` → `--e3` (1 site, premier usage de
     `--e3` hors `globals.css` lui-même)
   - `marginLeft: 8` → `--e2` (2 sites)
   - `marginRight: 4` → `--e1` (4 sites)
   - `marginBottom: 4` → `--e1` (3 sites) · `marginBottom: 8` → `--e2` (3 sites)
   - `paddingLeft: 8` → `--e2` (3 sites) · `paddingLeft: 16` → `--e4` (2 sites, premier usage de
     `--e4` hors `globals.css` lui-même)
   CE QUE CE GARDE NE VÉRIFIE PAS (règle 19) : les ~43 déclarations en dur DANS ce fichier
   lui-même (`globals.css`) — hors périmètre de toute tranche H-6 jusqu'ici, la dernière frontière
   du cluster margin/padding. */
describe('cluster margin*/padding* restant en dur dans les .tsx (Lot 7, H-6 tranche 8)', () => {
  function compterEnDur(prop: string, val: number): number {
    const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
    const motif = new RegExp(`${prop}: ${val}\\b`, 'g');
    let compte = 0;
    for (const fichier of listerFichiersTsx(racineApp)) {
      const texte = fs.readFileSync(fichier, 'utf8');
      const m = texte.match(motif);
      if (m) compte += m.length;
    }
    return compte;
  }

  const PAIRES: Array<{ prop: string; val: number }> = [
    { prop: 'marginTop', val: 8 },
    { prop: 'marginTop', val: 12 },
    { prop: 'marginLeft', val: 8 },
    { prop: 'marginRight', val: 4 },
    { prop: 'marginBottom', val: 4 },
    { prop: 'marginBottom', val: 8 },
    { prop: 'paddingLeft', val: 8 },
    { prop: 'paddingLeft', val: 16 },
  ];

  for (const { prop, val } of PAIRES) {
    it(`le compte de \`${prop}: ${val}\` numérique en dur ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)`, () => {
      const compteAvant = compterEnDur(prop, val);
      expect(compteAvant).toBe(0);

      // CAS CONNU MAUVAIS (règle 17) : un fichier RÉEL, DANS l'arbre balayé, qui réintroduit le
      // défaut doit être vu par le VRAI détecteur — écrit puis supprimé dans le même test,
      // jamais laissé sur le disque (règle 24).
      const racineApp = path.join(repoRoot(), 'app', 'src', 'app');
      const fichierSonde = path.join(racineApp, `__sonde_h6_tranche8_${prop}_${val}__.tsx`);
      fs.writeFileSync(
        fichierSonde,
        `export const Sonde = () => <div style={{ ${prop}: ${val} }}>x</div>;\n`
      );
      try {
        const compteAvecSonde = compterEnDur(prop, val);
        expect(compteAvecSonde).toBe(compteAvant + 1);
        expect(compteAvecSonde).toBeGreaterThan(0);
      } finally {
        fs.rmSync(fichierSonde, { force: true });
      }
      expect(compterEnDur(prop, val)).toBe(compteAvant);
    });
  }
});

/* Lot 7, H-6 tranche 12 (2026-09-18). CLÔTURE du mandat entier ouvert par la tranche 9 : le
   dernier cluster hors périmètre DANS `globals.css` lui-même — les 22 sites d'espacement
   (`margin*`/`padding*`/`gap`) à valeur unique et jeton `--eN` exact, en 15 paires
   propriété+valeur distinctes (jusqu'ici jamais migrées, contrairement aux mêmes propriétés
   dans les `.tsx`, closes par les tranches 4-8). Migrées : `gap: 16px` (3 sites) → `--e4`,
   `margin-left: 8px` → `--e2`, `gap: 24px` → `--e5`, `gap: 8px` (4 sites) → `--e2`,
   `margin-top: 8px` → `--e2`, `margin-bottom: 16px` (2 sites) → `--e4`, `row-gap: 4px` →
   `--e1`, `padding: 12px` (2 sites) → `--e3`, `gap: 12px` → `--e3`, `margin-left: 4px` →
   `--e1`, `padding: 16px` → `--e4`, `margin-bottom: 8px` → `--e2`, `padding-top: 8px` →
   `--e2`, `margin-bottom: 12px` → `--e3`, `gap: 4px` → `--e1`. DEUX sites (pas un seul —
   correctif au constat MOYEN du réfutateur, règle 21 : le compte doit être exact) sont des
   raccourcis à DEUX valeurs et n'ont PAS été touchés : `padding: 12px 18px` (ligne ~743,
   `details.repli.niveau-2 > summary`) et `padding: 16px 18px` (ligne ~268, `.panel`, dont le
   PREMIER jeton — 16px — est lui-même l'une des 15 valeurs ciblées, exactement la même classe
   de risque que le premier). La substitution exigeait une correspondance EXACTE bornée par le
   `;` (règle `(?<![-\w])PROP\s*:\s*VAL(?=\s*;)`), vérifiée en exécutant avant de committer (le
   premier essai, sans cette borne, avait accidentellement matché le site de la ligne 743 :
   corrigé avant tout commit, jamais expédié) — cette même borne protège aussi le site de la
   ligne 268, mais SEULEMENT PAR PARTAGE de la même regex : le réfutateur a relevé, à raison,
   que le commit d'origine ne le NOMMAIT pas et qu'aucun test dédié ne le couvrait (protection
   incidente, pas nommée — contraire à la règle 17). Les deux ont désormais leur propre
   assertion nommée ci-dessous.

   Contrairement au garde `font-size` ci-dessus (qui écrit un VRAI fichier `.tsx` pour sonder,
   parce que son détecteur scanne un RÉPERTOIRE de fichiers), ce garde sonde en injectant la
   ligne dans une COPIE EN MÉMOIRE du texte de `globals.css` — jamais sur disque : le
   détecteur relit CE fichier précis, pas un répertoire, donc la sonde n'a besoin d'exister
   que dans la chaîne testée (même discipline que le garde `font-size` original, tranche 1).

   CE QUE CE GARDE NE VÉRIFIE PAS (règle 19) : les déclarations d'espacement dont la valeur
   ne correspond à AUCUN jeton `--eN` existant (4/8/12/16/24/32px) restent hors périmètre,
   sauf à inventer un nouveau jeton — aucune tranche H-6 ne l'a fait pour `--eN` depuis
   ADR-125. Avec cette tranche, le mandat entier de la tranche 9 (« ~43 déclarations en dur
   DANS globals.css », mesuré à 49 sites à jeton exact : 27 de police + 22 d'espacement) est
   CLOS — les deux clusters à jeton exact sont désormais migrés en totalité. */
describe('cluster espacement (margin*/padding*/gap) en dur DANS globals.css (Lot 7, H-6 tranche 12)', () => {
  function compterEnDurSpacing(texte: string, prop: string, val: string): number {
    const motif = new RegExp(`(?<![-\\w])${prop}\\s*:\\s*${val}(?=\\s*;)`, 'g');
    const m = texte.match(motif);
    return m ? m.length : 0;
  }

  const PAIRES: Array<{ prop: string; val: string }> = [
    { prop: 'gap', val: '16px' },
    { prop: 'margin-left', val: '8px' },
    { prop: 'gap', val: '24px' },
    { prop: 'gap', val: '8px' },
    { prop: 'margin-top', val: '8px' },
    { prop: 'margin-bottom', val: '16px' },
    { prop: 'row-gap', val: '4px' },
    { prop: 'padding', val: '12px' },
    { prop: 'gap', val: '12px' },
    { prop: 'margin-left', val: '4px' },
    { prop: 'padding', val: '16px' },
    { prop: 'margin-bottom', val: '8px' },
    { prop: 'padding-top', val: '8px' },
    { prop: 'margin-bottom', val: '12px' },
    { prop: 'gap', val: '4px' },
  ];

  for (const { prop, val } of PAIRES) {
    it(`le compte de \`${prop}: ${val}\` numérique en dur (limité au ";") ne remonte jamais au-dessus de zéro (règle 17 : cas connu mauvais)`, () => {
      const css = fs.readFileSync(CSS_PATH, 'utf8');
      const compteAvant = compterEnDurSpacing(css, prop, val);
      expect(compteAvant).toBe(0);

      // CAS CONNU MAUVAIS (règle 17) : injecté dans une COPIE EN MÉMOIRE du texte, jamais sur
      // disque — voir le commentaire de tranche ci-dessus pour la raison.
      const cssAvecSonde = css + `\n.sonde-h6-tranche12 { ${prop}: ${val}; }\n`;
      const compteApresSonde = compterEnDurSpacing(cssAvecSonde, prop, val);
      expect(compteApresSonde).toBe(compteAvant + 1);
      expect(compteApresSonde).toBeGreaterThan(0);
    });
  }

  it('le raccourci `padding: 12px 18px` (deux valeurs, ligne ~743) reste EN DUR — pas une régression, un cas hors périmètre nommé', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/padding:\s*12px 18px/);
  });

  it('le raccourci `padding: 16px 18px` (deux valeurs, ligne ~268, `.panel`) reste EN DUR — même classe de risque que le précédent, nommé et testé séparément (constat du réfutateur, règle 17)', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/padding:\s*16px 18px/);
    // Le PREMIER jeton (16px) est l'une des 15 valeurs ciblées par cette tranche (padding: 16px
    // -> --e4) : vérifier explicitement qu'aucune substitution partielle ne s'est produite ici.
    expect(css).not.toMatch(/padding:\s*var\(--e4\)\s+18px/);
  });
});
