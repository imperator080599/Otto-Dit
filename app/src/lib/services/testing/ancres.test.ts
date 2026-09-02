import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { elementsDePage, rectangleDe, ancre } from './ancres';

// LES ANCRES (W1) : le rectangle vient de la couche texte, à l'endroit où le
// fichier place le texte — et un libellé absent donne NULL, jamais un
// rectangle inventé (règle 17 : le détecteur est éprouvé sur un cas mauvais).

async function pdfAvec(lignes: { texte: string; x: number; y: number; taille?: number }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  for (const l of lignes) page.drawText(l.texte, { x: l.x, y: l.y, size: l.taille ?? 11, font });
  return doc.save({ useObjectStreams: false });
}

describe('ancres — le rectangle d’une valeur sur la pièce', () => {
  it('trouve la ligne « Total HT » là où le fichier l’a dessinée, en points PDF', async () => {
    const bytes = await pdfAvec([
      { texte: 'FACTURE', x: 50, y: 780, taille: 18 },
      { texte: 'Numero : VE-2025-0001', x: 50, y: 740 },
      { texte: 'Total HT : 1 000,00 EUR', x: 50, y: 600 },
    ]);
    const elements = await elementsDePage(bytes, 1);
    expect(elements.some((e) => /Total HT/.test(e.str))).toBe(true);
    const r = rectangleDe(elements, /^Total HT\b/);
    expect(r).not.toBeNull();
    /* L'origine est celle du fichier : x = 50, la ligne de base y = 600 (le
       rectangle descend un peu sous la ligne de base pour couvrir les
       jambages), largeur et hauteur strictement positives. */
    expect(Math.abs(r!.x - 50)).toBeLessThan(1.5);
    expect(r!.y).toBeLessThan(600);
    expect(r!.y).toBeGreaterThan(590);
    expect(r!.w).toBeGreaterThan(60);
    expect(r!.h).toBeGreaterThan(8);
    /* Et le rectangle du numéro est AU-DESSUS de celui du total : deux ancres,
       deux endroits — pas un même rectangle pour tout. */
    const rn = rectangleDe(elements, /^Numero\b/);
    expect(rn!.y).toBeGreaterThan(r!.y + 100);
  });

  it('CAS MAUVAIS — un libellé absent de la pièce ne reçoit aucun rectangle', async () => {
    const bytes = await pdfAvec([{ texte: 'Total HT : 1 000,00 EUR', x: 50, y: 600 }]);
    expect(await ancre(bytes, 1, /^Quantite totale livree\b/)).toBeNull();
    /* Une page qui n'existe pas non plus. */
    expect(await ancre(bytes, 2, /^Total HT\b/)).toBeNull();
  });

  it('fusionne les morceaux d’une même ligne de base en un seul rectangle', async () => {
    /* Deux textes dessinés séparément sur la même ligne : le rectangle va du
       premier au bord droit du second. */
    const bytes = await pdfAvec([
      { texte: 'Client :', x: 50, y: 700 },
      { texte: 'Nordbrise Distribution SAS (fictif)', x: 120, y: 700 },
    ]);
    const r = rectangleDe(await elementsDePage(bytes, 1), /^Client\s*:/);
    expect(r).not.toBeNull();
    expect(r!.x + r!.w).toBeGreaterThan(200);
  });
});
