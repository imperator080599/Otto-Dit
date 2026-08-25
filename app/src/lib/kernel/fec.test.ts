import { describe, it, expect } from 'vitest';
import { parseFec, FEC_FIELDS, decodeFecBytes } from './fec';

const OPTS = {
  filename: '999888777FEC20251231.txt',
  expectedSiren: '999888777',
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
};

function makeFec(rows: string[][], header: string[] = [...FEC_FIELDS]): string {
  return [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
}

const row = (over: Partial<Record<string, string>> = {}): string[] => {
  const base: Record<string, string> = {
    JournalCode: 'VE', JournalLib: 'Ventes', EcritureNum: 'VE-0001', EcritureDate: '20250616',
    CompteNum: '411000', CompteLib: 'Clients', CompAuxNum: 'C001', CompAuxLib: 'Bâtiplace',
    PieceRef: 'FA2025-0101', PieceDate: '20250616', EcritureLib: 'Facture FA2025-0101',
    Debit: '1200,00', Credit: '', EcritureLet: '', DateLet: '', ValidDate: '20250630',
    Montantdevise: '', Idevise: '',
  };
  return FEC_FIELDS.map((f) => over[f] ?? base[f]);
};

describe('FEC adapter', () => {
  it('parses a valid balanced file (tab, Debit/Credit)', () => {
    const content = makeFec([
      row(),
      row({ CompteNum: '701000', CompteLib: 'Ventes', Debit: '', Credit: '1000,00' }),
      row({ CompteNum: '445710', CompteLib: 'TVA collectée', Debit: '', Credit: '200,00' }),
    ]);
    const res = parseFec(content, OPTS);
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(3);
    expect(res.rows[0].debitCents).toBe(120000);
    expect(res.rows[0].naturalKey).toBe('VE|VE-0001|1');
    expect(res.rows[1].naturalKey).toBe('VE|VE-0001|2');
    expect(res.meta.totalDebitCents).toBe(res.meta.totalCreditCents);
  });

  it('accepts the Montant/Sens variant and pipe separator', () => {
    const header = FEC_FIELDS.map((f) => (f === 'Debit' ? 'Montant' : f === 'Credit' ? 'Sens' : f));
    const lines = [
      header.join('|'),
      ['VE', 'Ventes', 'VE-1', '20250616', '411000', 'Clients', '', '', 'FA-1', '20250616', 'lib', '1200,00', 'D', '', '', '20250630', '', ''].join('|'),
      ['VE', 'Ventes', 'VE-1', '20250616', '701000', 'Ventes', '', '', 'FA-1', '20250616', 'lib', '1200,00', 'C', '', '', '20250630', '', ''].join('|'),
    ].join('\n');
    const res = parseFec(lines, OPTS);
    expect(res.ok).toBe(true);
    expect(res.meta.variant).toBe('montant_sens');
    expect(res.meta.separator).toBe('pipe');
    expect(res.rows[0].debitCents).toBe(120000);
    expect(res.rows[1].creditCents).toBe(120000);
  });

  it('rejects a wrong header order', () => {
    const header = [...FEC_FIELDS].reverse();
    const res = parseFec(makeFec([row()], header), OPTS);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'header_fields')).toBe(true);
  });

  it('reports field-count, bad dates and unbalanced entries with line numbers', () => {
    const bad = makeFec([
      row(),
      row({ CompteNum: '701000', Debit: '', Credit: '1100,00' }), // unbalances the entry
      row({ EcritureNum: 'VE-0002', EcritureDate: '20251301' }), // invalid date
    ]) + '\nshort\tline';
    const res = parseFec(bad, OPTS);
    expect(res.ok).toBe(false);
    const codes = res.violations.map((v) => v.code);
    expect(codes).toContain('entry_unbalanced');
    expect(codes).toContain('bad_date');
    expect(codes).toContain('field_count');
    const badDate = res.violations.find((v) => v.code === 'bad_date');
    expect(badDate?.line).toBe(4);
  });

  it('checks filename pattern, SIREN and closing date', () => {
    const content = makeFec([row(), row({ CompteNum: '701000', Debit: '', Credit: '1200,00' })]);
    const wrongName = parseFec(content, { ...OPTS, filename: 'export.txt' });
    expect(wrongName.violations.some((v) => v.code === 'filename_format')).toBe(true);
    const wrongSiren = parseFec(content, { ...OPTS, filename: '111222333FEC20251231.txt' });
    expect(wrongSiren.violations.some((v) => v.code === 'filename_siren')).toBe(true);
    const wrongDate = parseFec(content, { ...OPTS, filename: '999888777FEC20250630.txt' });
    expect(wrongDate.violations.some((v) => v.code === 'filename_date' && v.severity === 'warning')).toBe(true);
  });

  it('warns on out-of-period dates and decodes ISO 8859-15 bytes', () => {
    const content = makeFec([
      row({ EcritureDate: '20240315' }),
      row({ CompteNum: '701000', Debit: '', Credit: '1200,00' }),
    ]);
    const res = parseFec(content, OPTS);
    expect(res.violations.some((v) => v.code === 'date_out_of_period' && v.severity === 'warning')).toBe(true);

    const latin = new Uint8Array([0x43, 0x6c, 0xe9, 0x6d]); // "Clém" in ISO 8859-15
    const dec = decodeFecBytes(latin);
    expect(dec.encoding).toBe('iso-8859-15');
    expect(dec.content).toBe('Clém');
  });
});
