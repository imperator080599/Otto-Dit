import type { GlRow } from '../../src/lib/kernel/types';
import { isoToFecDate, naturalKey } from '../../src/lib/kernel/canon';
import type { Entry } from './ledger';

// Entry[] → kernel GlRows + FEC text file (tab-separated, decimal comma, AAAAMMJJ).

function centsToFec(cents: number): string {
  if (cents === 0) return '0,00';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function endOfMonth(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function entriesToGlRows(entries: Entry[]): GlRow[] {
  const rows: GlRow[] = [];
  for (const e of entries) {
    e.lines.forEach((l, idx) => {
      const lineNo = idx + 1;
      rows.push({
        naturalKey: naturalKey(e.journal, e.entryNo, lineNo),
        lineNo,
        journalCode: e.journal,
        journalLib: e.journalLib,
        entryNo: e.entryNo,
        entryDate: e.date,
        accountNo: l.account,
        accountLabel: l.accountLabel,
        auxNo: l.auxNo,
        auxLabel: l.auxLabel,
        pieceRef: e.pieceRef,
        pieceDate: e.pieceDate,
        label: e.label,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        validDate: endOfMonth(e.date),
      });
    });
  }
  return rows;
}

export function serializeFec(entries: Entry[]): string {
  const header = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
    'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
  ].join('\t');
  const lines: string[] = [header];
  for (const e of entries) {
    for (const l of e.lines) {
      lines.push([
        e.journal,
        e.journalLib,
        e.entryNo,
        isoToFecDate(e.date),
        l.account,
        l.accountLabel,
        l.auxNo ?? '',
        l.auxLabel ?? '',
        e.pieceRef,
        isoToFecDate(e.pieceDate),
        e.label,
        centsToFec(l.debitCents),
        centsToFec(l.creditCents),
        '', '', // EcritureLet, DateLet
        isoToFecDate(endOfMonth(e.date)),
        '', '', // Montantdevise, Idevise
      ].join('\t'));
    }
  }
  return lines.join('\n') + '\n';
}
