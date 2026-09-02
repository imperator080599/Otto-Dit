import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { porteLeRectangle, fluxDecodes } from './rectangle';

// LE DÉTECTEUR DE RECTANGLE, ÉPROUVÉ (règle 17) : un fichier où pdf-lib a
// dessiné le rectangle à l'abscisse annoncée (connu BON), le même fichier
// re-sérialisé SANS rectangle (connu MAUVAIS — c'est le cas que « la taille
// diffère » laissait passer), et un rectangle dessiné AILLEURS.

async function piece(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Total HT : 1 000,00 EUR', { x: 50, y: 600, size: 11, font });
  return doc.save({ useObjectStreams: false });
}

const EN_TETE = 'page=1;x=50;y=597.58;w=128.99;h=13.75';

describe('porteLeRectangle — la preuve du rectangle dans le fichier', () => {
  it('CONNU BON : le rectangle dessiné par pdf-lib à x − 3 est trouvé, flux déflaté compris', async () => {
    const doc = await PDFDocument.load(await piece());
    const page = doc.getPages()[0];
    page.drawRectangle({ x: 47, y: 594.58, width: 134.99, height: 19.75, borderColor: rgb(0.8, 0.1, 0.1), borderWidth: 1.5, color: rgb(1, 0.86, 0.25), opacity: 0.18 });
    const bytes = await doc.save({ useObjectStreams: false });
    expect(fluxDecodes(bytes).some((f) => /0 0 m/.test(f))).toBe(true);
    expect(porteLeRectangle(bytes, EN_TETE)).toBe(true);
  });

  it('CONNU MAUVAIS : le même fichier re-sérialisé SANS rectangle est refusé — même si sa taille a changé', async () => {
    const original = await piece();
    const doc = await PDFDocument.load(original);
    const reserialise = await doc.save({ useObjectStreams: true });
    expect(reserialise.length).not.toBe(original.length);
    expect(porteLeRectangle(reserialise, EN_TETE)).toBe(false);
    expect(porteLeRectangle(original, EN_TETE)).toBe(false);
  });

  it('CONNU MAUVAIS : un rectangle dessiné AILLEURS ne vaut pas pour cette ancre', async () => {
    const doc = await PDFDocument.load(await piece());
    doc.getPages()[0].drawRectangle({ x: 300, y: 100, width: 50, height: 20, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    expect(porteLeRectangle(await doc.save({ useObjectStreams: false }), EN_TETE)).toBe(false);
  });

  it('un en-tête illisible ne prouve rien', async () => {
    expect(porteLeRectangle(await piece(), '')).toBe(false);
    expect(porteLeRectangle(await piece(), 'page=1')).toBe(false);
  });
});
