import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Bitmap, blur, drawText, encodePng, gradient, line, mulberry32, noise, quantize, rotate, speckle } from './raster';

// ADR-018 — the SYNTHETIC half of the extraction eval corpus. Every company, number and
// document below is fabricated (CLAUDE.md rule 2) and stamped SPECIMEN. The corpus exists
// to measure where the extraction ladder breaks: foreign layouts, foreign date and number
// formats, and scans with no text layer at all.
//
// The PUBLIC half is not generated and not committed: see dataset/eval/public/README.md.

export type Rendering = 'text_layer' | 'bitmap';

export interface EvalDoc {
  id: string;
  filename: string;
  variant: string;
  rendering: Rendering;
  degradation: string | null;
  truth: {
    docType: string;
    invoiceNumber: string;
    invoiceDate: string; // ISO
    buyerName: string;
    sellerName: string;
    totalNetCents: string;
    vatCents: string;
    totalGrossCents: string;
  };
}

const FIXED_DATE = new Date('2026-02-01T09:00:00Z');

interface Locale {
  code: string;
  title: string;
  labels: { number: string; date: string; buyer: string; net: string; vat: string; gross: string };
  vatRate: number;
  fmtDate: (iso: string) => string;
  fmtAmount: (cents: number) => string;
}

const grp = (s: string, sep: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const frAmount = (c: number) => `${grp(String(Math.floor(c / 100)), ' ')},${String(c % 100).padStart(2, '0')} EUR`;
const deAmount = (c: number) => `${grp(String(Math.floor(c / 100)), '.')},${String(c % 100).padStart(2, '0')} EUR`;
const enAmount = (c: number) => `${grp(String(Math.floor(c / 100)), ',')}.${String(c % 100).padStart(2, '0')} EUR`;
const dmy = (iso: string, sep: string) => `${iso.slice(8, 10)}${sep}${iso.slice(5, 7)}${sep}${iso.slice(0, 4)}`;
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

const LOCALES: Record<string, Locale> = {
  'fr-canonical': {
    code: 'fr', title: 'FACTURE', vatRate: 0.2,
    labels: { number: 'Numero', date: 'Date', buyer: 'Client', net: 'Total HT', vat: 'TVA (20%)', gross: 'Total TTC' },
    fmtDate: (i) => dmy(i, '/'), fmtAmount: frAmount,
  },
  'fr-variant': {
    code: 'fr', title: 'FACTURE', vatRate: 0.2,
    labels: { number: 'N de facture', date: "Date d'emission", buyer: 'Destinataire', net: 'Montant HT', vat: 'T.V.A. 20 %', gross: 'Net a payer' },
    fmtDate: (i) => dmy(i, '.'), fmtAmount: frAmount,
  },
  de: {
    code: 'de', title: 'RECHNUNG', vatRate: 0.19,
    labels: { number: 'Rechnungsnummer', date: 'Rechnungsdatum', buyer: 'Kunde', net: 'Nettobetrag', vat: 'MwSt (19%)', gross: 'Gesamtbetrag' },
    fmtDate: (i) => dmy(i, '.'), fmtAmount: deAmount,
  },
  es: {
    code: 'es', title: 'FACTURA', vatRate: 0.21,
    labels: { number: 'Numero de factura', date: 'Fecha', buyer: 'Cliente', net: 'Base imponible', vat: 'IVA (21%)', gross: 'Total' },
    fmtDate: (i) => dmy(i, '/'), fmtAmount: deAmount,
  },
  it: {
    code: 'it', title: 'FATTURA', vatRate: 0.22,
    labels: { number: 'Numero fattura', date: 'Data', buyer: 'Cliente', net: 'Imponibile', vat: 'IVA (22%)', gross: 'Totale' },
    fmtDate: (i) => dmy(i, '/'), fmtAmount: deAmount,
  },
  en: {
    code: 'en', title: 'INVOICE', vatRate: 0.2,
    labels: { number: 'Invoice number', date: 'Invoice date', buyer: 'Customer', net: 'Net amount', vat: 'VAT (20%)', gross: 'Total due' },
    fmtDate: mdy, fmtAmount: enAmount,
  },
};

const SELLERS = [
  'Verrerie Baudin SAS', 'Nordglas Fenster GmbH', 'Cristales Duero SL',
  'Vetri Lombardi Srl', 'Northgate Glazing Ltd', 'Atelier Peyrat SARL',
];
const BUYERS = [
  'Menuiseries Caillat SARL', 'Bauzentrum Hollerbach GmbH', 'Obras Ribadeo SL',
  'Edilizia Marradi Srl', 'Kestrel Facades Ltd', 'Comptoir Vasseur SAS',
];

interface Doc {
  variant: string;
  rendering: Rendering;
  degradation: string | null;
  count: number;
}

// Deliberately unbalanced: the FR canonical layout is what rung 2 was written for; every
// other row is a documented blind spot we want the numbers to expose.
const PLAN: Doc[] = [
  { variant: 'fr-canonical', rendering: 'text_layer', degradation: null, count: 4 },
  { variant: 'fr-variant', rendering: 'text_layer', degradation: null, count: 4 },
  { variant: 'de', rendering: 'text_layer', degradation: null, count: 3 },
  { variant: 'es', rendering: 'text_layer', degradation: null, count: 3 },
  { variant: 'it', rendering: 'text_layer', degradation: null, count: 3 },
  { variant: 'en', rendering: 'text_layer', degradation: null, count: 3 },
  { variant: 'fr-canonical', rendering: 'bitmap', degradation: 'clean', count: 2 },
  { variant: 'fr-canonical', rendering: 'bitmap', degradation: 'noise+rotation', count: 2 },
  { variant: 'fr-canonical', rendering: 'bitmap', degradation: 'photo', count: 2 },
  { variant: 'fr-canonical', rendering: 'bitmap', degradation: 'handwritten', count: 2 },
];

export async function buildCorpus(outDir: string): Promise<EvalDoc[]> {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.pdf')) fs.unlinkSync(path.join(outDir, f));

  const rnd = mulberry32(20260201);
  const docs: EvalDoc[] = [];
  let n = 0;

  for (const spec of PLAN) {
    for (let k = 0; k < spec.count; k++) {
      n += 1;
      const loc = LOCALES[spec.variant];
      const netCents = 45_000 + Math.floor(rnd() * 855_000);
      const vatCents = Math.round(netCents * loc.vatRate);
      const iso = `2025-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
      const truth = {
        docType: 'invoice',
        invoiceNumber: `${loc.code.toUpperCase()}-2025-${String(1000 + n)}`,
        invoiceDate: iso,
        buyerName: BUYERS[Math.floor(rnd() * BUYERS.length)],
        sellerName: SELLERS[Math.floor(rnd() * SELLERS.length)],
        totalNetCents: String(netCents),
        vatCents: String(vatCents),
        totalGrossCents: String(netCents + vatCents),
      };
      // neutral filename: the classifier must work from content, not from the name
      const filename = `eval-${String(n).padStart(4, '0')}.pdf`;
      const bytes =
        spec.rendering === 'text_layer'
          ? await textLayerPdf(loc, truth)
          : await bitmapPdf(loc, truth, spec.degradation!, mulberry32(1000 + n));
      fs.writeFileSync(path.join(outDir, filename), bytes);
      docs.push({
        id: `eval-${String(n).padStart(4, '0')}`,
        filename,
        variant: spec.variant,
        rendering: spec.rendering,
        degradation: spec.degradation,
        truth,
      });
    }
  }

  fs.writeFileSync(path.join(outDir, 'ground_truth.json'), JSON.stringify(docs, null, 2) + '\n');
  return docs;
}

function bodyLines(loc: Locale, t: EvalDoc['truth']): string[] {
  const c = (s: string) => Number(s);
  return [
    `${loc.labels.number} : ${t.invoiceNumber}`,
    `${loc.labels.date} : ${loc.fmtDate(t.invoiceDate)}`,
    `${loc.labels.buyer} : ${t.buyerName}`,
    '',
    `${loc.labels.net} : ${loc.fmtAmount(c(t.totalNetCents))}`,
    `${loc.labels.vat} : ${loc.fmtAmount(c(t.vatCents))}`,
    `${loc.labels.gross} : ${loc.fmtAmount(c(t.totalGrossCents))}`,
  ];
}

async function textLayerPdf(loc: Locale, t: EvalDoc['truth']): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('OTTO extraction-eval corpus (synthetic)');
  doc.setCreator('OTTO (fictional data)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 790;
  const put = (text: string, size = 10, b = false) => {
    page.drawText(text, { x: 50, y, size, font: b ? bold : font, color: rgb(0.1, 0.12, 0.16) });
    y -= size + 8;
  };
  put(t.sellerName, 12, true);
  put('SPECIMEN — donnees fictives / fictional specimen', 8);
  y -= 12;
  put(loc.title, 18, true);
  y -= 6;
  for (const l of bodyLines(loc, t)) {
    if (l === '') { y -= 10; continue; }
    put(l);
  }
  return doc.save({ useObjectStreams: false });
}

async function bitmapPdf(
  loc: Locale,
  t: EvalDoc['truth'],
  degradation: string,
  rnd: () => number,
): Promise<Uint8Array> {
  const W = 1000, H = 1414; // ~120 dpi A4
  let bm = new Bitmap(W, H);
  const hand = degradation === 'handwritten';

  drawText(bm, 70, 80, t.sellerName, { scale: 4, bold: true });
  drawText(bm, 70, 130, 'SPECIMEN - donnees fictives', { scale: 2, ink: 90 });
  drawText(bm, 70, 200, loc.title, { scale: 6, bold: true });
  line(bm, 70, 250, W - 70);

  let y = 300;
  for (const l of bodyLines(loc, t)) {
    if (l === '') { y += 30; continue; }
    // the label stays printed; the value is handwritten in the handwriting variant
    const [label, ...rest] = l.split(' : ');
    const x = drawText(bm, 70, y, `${label} : `, { scale: 3 });
    drawText(bm, x, y, rest.join(' : '), { scale: 3, hand, rnd, ink: hand ? 45 : 25 });
    y += 46;
  }

  if (degradation === 'noise+rotation') {
    bm = rotate(bm, 1.8);
    bm = speckle(bm, 220, rnd);
    bm = noise(bm, 42, rnd);
  } else if (degradation === 'photo') {
    bm = rotate(bm, -0.9);
    bm = blur(bm);
    bm = gradient(bm, 0.42);
    bm = noise(bm, 26, rnd);
  } else if (degradation === 'handwritten') {
    bm = speckle(bm, 60, rnd);
    bm = noise(bm, 14, rnd);
  } else {
    bm = noise(bm, 6, rnd);
  }
  bm = quantize(bm, 16);

  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('OTTO extraction-eval corpus (synthetic scan)');
  doc.setCreator('OTTO (fictional data)');
  const png = await doc.embedPng(encodePng(bm));
  const page = doc.addPage([595, 842]);
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save({ useObjectStreams: false });
}
