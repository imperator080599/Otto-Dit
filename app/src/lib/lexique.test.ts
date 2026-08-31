import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LE LEXIQUE S'APPLIQUE, IL NE SE CONSULTE PAS (docs/LEXIQUE.md, §3.D).
// Un concept = un mot : les synonymes interdits dans les LIBELLÉS d'écran
// font échouer la suite. Le test grep les chaînes des .tsx d'écran — pas les
// identifiants : chaque règle est un motif choisi pour ne matcher que du
// texte utilisateur (accents, espaces, casse française). Limite dite dans
// LEXIQUE.md : chercher un mot n'est pas vérifier un chemin — la revue
// visuelle reste le filet, et toute collision trouvée devient une règle ici.

const ECRANS = path.join(__dirname, '..', 'app');

/** motif → message. Chaque motif vise du TEXTE FRANÇAIS d'écran. */
const REGLES: { motif: RegExp; regle: string; sauf?: RegExp; saufFichier?: RegExp; siFrancais?: boolean }[] = [
  { motif: /matérialité/i, regle: '« seuil de signification », jamais « matérialité » (LEXIQUE)' },
  { motif: /feuille de travail/i, regle: '« papier », jamais « feuille de travail » (LEXIQUE)' },
  { motif: /[Rr]equête/, regle: '« demande » pour le client — « requête » est réservé à Interroger (LEXIQUE)',
    sauf: /query|interroger/i, saufFichier: /(^|\/)ask\// },
  /* FSLI interdit dans un libellé FRANÇAIS seulement : l'heuristique de
     langue est la présence d'un caractère accentué sur la ligne — les écrans
     encore en anglais (héritage) gardent leur terme technique, et leur
     francisation est un chantier du lexique, pas une exception. */
  { motif: /\bFSLI\b/, regle: '« poste » dans un libellé français — FSLI reste un identifiant de code (LEXIQUE)',
    sauf: /fsli[_.]|[_.]fsli|fsliCode|'FSLI'|"FSLI"|fsli_code/i, siFrancais: true },
];

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('lexique appliqué (docs/LEXIQUE.md)', () => {
  it('aucun synonyme interdit dans les écrans', () => {
    const infractions: string[] = [];
    for (const f of fichiers(ECRANS)) {
      const rel = path.relative(ECRANS, f);
      const lignes = fs.readFileSync(f, 'utf8').split('\n');
      lignes.forEach((l, i) => {
        for (const r of REGLES) {
          if (r.saufFichier && r.saufFichier.test(rel.replace(/\\/g, '/'))) continue;
          if (r.siFrancais && !/[àâéèêëîïôùûçÉÈÀÔ]/.test(l)) continue;
          if (r.motif.test(l) && !(r.sauf && r.sauf.test(l))) {
            infractions.push(`${rel}:${i + 1} — ${r.regle}`);
          }
        }
      });
    }
    expect(infractions, 'libellés hors lexique — corriger le libellé, ou motiver une exception DANS LEXIQUE.md').toEqual([]);
  });
});
