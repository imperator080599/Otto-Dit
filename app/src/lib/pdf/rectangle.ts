import { inflateSync } from 'node:zlib';

// LA PREUVE DU RECTANGLE (mandat du jour, W1 ; revue hostile du jour).
//
// « Le PDF ancré diffère de la pièce nue » ne prouvait rien : pdf-lib
// re-sérialise un fichier différemment sans rien dessiner. Ce module lit ce
// que le fichier CONTIENT : les flux de contenu (déflatés s'ils le sont), et
// cherche le chemin que pdf-lib trace pour un rectangle — une translation
// `1 0 0 1 x y cm` (puis des matrices nulles) suivie de `0 0 m` — à l'abscisse annoncée par l'en-tête
// `X-Otto-Ancre` (x de l'ancre moins la marge de 3 points). Un `re` nu à la
// même abscisse est accepté aussi.
//
// Le détecteur est éprouvé sur un cas connu BON et un cas connu MAUVAIS
// (rectangle.test.ts, règle 17).

const MARGE = 3;

/** Les flux de contenu d'un PDF, décodés quand ils sont déflatés — en latin1. */
export function fluxDecodes(pdf: Uint8Array): string[] {
  const brut = Buffer.from(pdf).toString('latin1');
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const m of brut.matchAll(re)) {
    const corps = Buffer.from(m[1], 'latin1');
    try { out.push(inflateSync(corps).toString('latin1')); } catch { out.push(m[1]); }
  }
  return out;
}

/** Le PDF porte-t-il un rectangle dont l'abscisse est celle de l'ancre (moins la marge) ? */
export function porteLeRectangle(pdf: Uint8Array, enTeteAncre: string): boolean {
  const x = Number(enTeteAncre.match(/x=(-?[\d.]+)/)?.[1]);
  if (!Number.isFinite(x)) return false;
  const attendu = x - MARGE;
  const proche = (v: string) => Math.abs(Number(v) - attendu) < 0.01;
  for (const flux of fluxDecodes(pdf)) {
    /* pdf-lib trace : `1 0 0 1 x y cm` (translation), puis deux matrices de
       rotation/inclinaison nulles (`1 0 0 1 0 0 cm`), puis `0 0 m`. */
    for (const m of flux.matchAll(/1 0 0 1 (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) cm(?:\s+1 0 0 1 0 0 cm)*\s+0 0 m\b/g)) {
      if (proche(m[1])) return true;
    }
    for (const m of flux.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) re\b/g)) {
      if (proche(m[1])) return true;
    }
  }
  return false;
}
