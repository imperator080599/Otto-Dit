import { describe, it, expect } from 'vitest';
import { amountToCents, dateToIso, detectDateOrder, parseByLabels, classify } from './textlayer';

// ADR-021. The deterministic rung grows by dictionary entries, so its failure modes are
// dictionary failure modes: a short label matching mid-word, and a date whose order the
// page does not settle. Both are pinned here — they are the reasons this rung is allowed
// to exist next to a layout-agnostic model rung.

describe('label-dictionary reader (ADR-021)', () => {
  it('reads amounts in every grouping convention, and refuses the undecidable', () => {
    expect(amountToCents('1 234,56 EUR')).toBe(123456); // fr
    expect(amountToCents('1.234,56 EUR')).toBe(123456); // de/es/it
    expect(amountToCents('1,234.56 EUR')).toBe(123456); // en
    expect(amountToCents('739.11 EUR')).toBe(73911);
    expect(amountToCents('42')).toBe(4200);
    expect(amountToCents('')).toBeUndefined();
    expect(amountToCents('n/a')).toBeUndefined();
  });

  it('abstains on a date the page does not settle, and reads it once the page does', () => {
    expect(dateToIso('14/03/2025')).toBe('2025-03-14'); // 14 cannot be a month
    expect(dateToIso('03/14/2025')).toBe('2025-03-14');
    expect(dateToIso('05/03/2025')).toBeUndefined();    // ambiguous, unattributed
    expect(dateToIso('05/03/2025', 'dmy')).toBe('2025-03-05');
    expect(dateToIso('05/03/2025', 'mdy')).toBe('2025-05-03');
    expect(dateToIso('2025-03-05')).toBe('2025-03-05');
    expect(dateToIso('le 3 mars')).toBeUndefined();
  });

  it('attributes date order only on unanimous evidence', () => {
    expect(detectDateOrder('FACTURE\nTotal HT : 10,00 EUR')).toBe('dmy');
    expect(detectDateOrder('INVOICE\nInvoice date : 1/2/2025\nNet amount : 10.00')).toBe('mdy');
    // a bilingual page settles nothing → the model rung decides
    expect(detectDateOrder('FACTURE / INVOICE\nTotal HT / Net amount')).toBe('unknown');
    expect(detectDateOrder('nothing recognisable')).toBe('unknown');
  });

  it('never matches a label inside a longer word', () => {
    // "ust" (German VAT) occurs inside "Customer" — this exact collision made an English
    // invoice read a buyer name as a VAT amount before boundaries were enforced
    const en = [
      'Northgate Glazing Ltd', 'INVOICE',
      'Invoice number : EN-2025-1018',
      'Invoice date : 07/02/2025',
      'Customer : Bauzentrum Hollerbach GmbH',
      'Net amount : 739.11 EUR',
      'VAT (20%) : 147.82 EUR',
      'Total due : 886.93 EUR',
    ].join('\n');
    const fields = parseByLabels('invoice', en);
    expect(fields).not.toBeNull();
    const by = Object.fromEntries(fields!.map((f) => [f.name, f.value]));
    expect(by.vatCents).toBe('14782');
    expect(by.buyerName).toBe('Bauzentrum Hollerbach GmbH');
    expect(by.invoiceDate).toBe('2025-07-02'); // mdy, attributed from the wording
    expect(by.totalNetCents).toBe('73911');
    expect(by.totalGrossCents).toBe('88693');
  });

  it('prefers the longest label: "Total TTC" is not "Total"', () => {
    const fr = [
      'Verrerie Baudin SAS', 'FACTURE',
      'Numero : FR-2025-1021',
      'Date : 14/03/2025',
      'Client : Menuiseries Caillat SARL',
      'Total HT : 12 340,50 EUR',
      'TVA (20%) : 2 468,10 EUR',
      'Total TTC : 14 808,60 EUR',
    ].join('\n');
    const by = Object.fromEntries(parseByLabels('invoice', fr)!.map((f) => [f.name, f.value]));
    expect(by.totalNetCents).toBe('1234050');
    expect(by.totalGrossCents).toBe('1480860');
    expect(by.vatCents).toBe('246810');
  });

  it('returns null rather than a partial read, so the document escalates', () => {
    const partial = 'FACTURE\nNumero : X-1\nClient : Y\nTotal HT : 10,00 EUR'; // no VAT, no total
    expect(parseByLabels('invoice', partial)).toBeNull();
  });

  it('classifies by content in every dictionary language', () => {
    expect(classify('RECHNUNG\nRechnungsnummer : 1', 'x.pdf').docType).toBe('invoice');
    expect(classify('FATTURA\nNumero fattura : 1', 'x.pdf').docType).toBe('invoice');
    expect(classify('LIEFERSCHEIN', 'x.pdf').docType).toBe('delivery_note');
    expect(classify('', 'unknown.pdf').docType).toBe('other');
  });
});
