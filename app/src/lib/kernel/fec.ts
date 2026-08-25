import type { GlRow, Violation } from './types';
import { fecDateToIso, naturalKey, parseAmountCents } from './canon';

// FEC adapter (France pack, docs/05 §2): strict parser/validator per art. A.47 A-1 LPF.
// 18 fields in exact order, tab- or pipe-separated, dates AAAAMMJJ, decimal comma,
// Montant+Sens variant accepted, filename SirenFECAAAAMMJJ. Pure function: decoded string
// in, canonical rows + violation report out. Tolerant parse, strict report (03 §2):
// structural breaks are errors; anomalies that can be represented parse with warnings.

export const FEC_FIELDS = [
  'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
  'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
  'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
] as const;

export const FEC_FIELDS_MONTANT_SENS = FEC_FIELDS.map((f) =>
  f === 'Debit' ? 'Montant' : f === 'Credit' ? 'Sens' : f,
);

export interface FecParseOptions {
  filename: string;
  expectedSiren: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
}

export interface FecParseResult {
  rows: GlRow[];
  violations: Violation[];
  meta: {
    separator: 'tab' | 'pipe';
    variant: 'debit_credit' | 'montant_sens';
    rowCount: number;
    totalDebitCents: number;
    totalCreditCents: number;
    journals: Record<string, { debitCents: number; creditCents: number; count: number }>;
  };
  ok: boolean; // no error-severity violations
}

/** Decode FEC bytes: try UTF-8 (fatal), fall back to ISO 8859-15 (latin1-compatible for
 *  the characters FEC uses). */
export function decodeFecBytes(bytes: Uint8Array): { content: string; encoding: 'utf-8' | 'iso-8859-15' } {
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { content, encoding: 'utf-8' };
  } catch {
    const content = new TextDecoder('iso-8859-15').decode(bytes);
    return { content, encoding: 'iso-8859-15' };
  }
}

export function parseFec(content: string, opts: FecParseOptions): FecParseResult {
  const violations: Violation[] = [];
  const rows: GlRow[] = [];
  const journals: Record<string, { debitCents: number; creditCents: number; count: number }> = {};

  // filename: SirenFECAAAAMMJJ(.txt)
  const fnMatch = /^(\d{9})FEC(\d{8})(\.(txt|csv))?$/i.exec(opts.filename.trim());
  if (!fnMatch) {
    violations.push({
      code: 'filename_format',
      severity: 'error',
      message: `filename "${opts.filename}" does not match SirenFECAAAAMMJJ`,
    });
  } else {
    if (fnMatch[1] !== opts.expectedSiren) {
      violations.push({
        code: 'filename_siren',
        severity: 'error',
        message: `filename SIREN ${fnMatch[1]} ≠ entity SIREN ${opts.expectedSiren}`,
      });
    }
    const fnDate = `${fnMatch[2].slice(0, 4)}-${fnMatch[2].slice(4, 6)}-${fnMatch[2].slice(6, 8)}`;
    if (fnDate !== opts.periodEnd) {
      violations.push({
        code: 'filename_date',
        severity: 'warning',
        message: `filename closing date ${fnDate} ≠ period end ${opts.periodEnd}`,
      });
    }
  }

  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    violations.push({ code: 'empty_file', severity: 'error', message: 'no data rows' });
    return { rows, violations, meta: emptyMeta(), ok: false };
  }

  // separator + variant detection from header
  const header = lines[0];
  const separator: 'tab' | 'pipe' = header.includes('\t') ? 'tab' : 'pipe';
  const sep = separator === 'tab' ? '\t' : '|';
  const headerFields = header.split(sep).map((h) => h.trim().replace(/^﻿/, ''));

  let variant: 'debit_credit' | 'montant_sens' = 'debit_credit';
  const matchesStd = FEC_FIELDS.every((f, i) => headerFields[i]?.toLowerCase() === f.toLowerCase());
  const matchesMs = FEC_FIELDS_MONTANT_SENS.every((f, i) => headerFields[i]?.toLowerCase() === f.toLowerCase());
  if (matchesMs && !matchesStd) variant = 'montant_sens';
  if (!matchesStd && !matchesMs) {
    violations.push({
      code: 'header_fields',
      severity: 'error',
      line: 1,
      message: `header does not match the 18 mandatory FEC fields in order (got: ${headerFields.slice(0, 6).join(', ')}…)`,
    });
    return { rows, violations, meta: emptyMeta(separator, variant), ok: false };
  }
  if (headerFields.length !== 18) {
    violations.push({
      code: 'header_count',
      severity: 'error',
      line: 1,
      message: `expected 18 fields, got ${headerFields.length}`,
    });
  }

  const lineNoByEntry = new Map<string, number>();
  const entryBalance = new Map<string, { debit: number; credit: number; journal: string; firstLine: number }>();
  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const parts = lines[i].split(sep);
    if (parts.length !== 18) {
      violations.push({
        code: 'field_count',
        severity: 'error',
        line: lineNum,
        message: `expected 18 fields, got ${parts.length}`,
      });
      continue;
    }
    const [journalCode, journalLib, entryNo, ecritureDate, compteNum, compteLib, auxNo, auxLib,
      pieceRef, pieceDate, ecritureLib, f12, f13, lettering, dateLet, validDate, montantDevise, idevise] =
      parts.map((p) => p.trim());

    let entryDate: string;
    try {
      entryDate = fecDateToIso(ecritureDate);
    } catch {
      violations.push({ code: 'bad_date', severity: 'error', line: lineNum, message: `EcritureDate "${ecritureDate}" is not AAAAMMJJ` });
      continue;
    }
    let pieceDateIso: string | undefined;
    if (pieceDate) {
      try { pieceDateIso = fecDateToIso(pieceDate); } catch {
        violations.push({ code: 'bad_piece_date', severity: 'warning', line: lineNum, message: `PieceDate "${pieceDate}" is not AAAAMMJJ` });
      }
    }
    let validDateIso: string | undefined;
    if (validDate) {
      try { validDateIso = fecDateToIso(validDate); } catch {
        violations.push({ code: 'bad_valid_date', severity: 'warning', line: lineNum, message: `ValidDate "${validDate}" is not AAAAMMJJ` });
      }
    }
    let letteringDateIso: string | undefined;
    if (dateLet) {
      try { letteringDateIso = fecDateToIso(dateLet); } catch {
        violations.push({ code: 'bad_lettering_date', severity: 'warning', line: lineNum, message: `DateLet "${dateLet}" is not AAAAMMJJ` });
      }
    }

    if (!compteNum) {
      violations.push({ code: 'missing_account', severity: 'error', line: lineNum, message: 'CompteNum empty' });
      continue;
    }

    let debitCents = 0;
    let creditCents = 0;
    try {
      if (variant === 'debit_credit') {
        debitCents = parseAmountCents(f12);
        creditCents = parseAmountCents(f13);
      } else {
        const montant = parseAmountCents(f12);
        const sens = f13.toUpperCase();
        if (sens === 'D') debitCents = montant;
        else if (sens === 'C') creditCents = montant;
        else {
          violations.push({ code: 'bad_sens', severity: 'error', line: lineNum, message: `Sens "${f13}" is neither D nor C` });
          continue;
        }
      }
    } catch (e) {
      violations.push({ code: 'bad_amount', severity: 'error', line: lineNum, message: String(e) });
      continue;
    }

    if (entryDate < opts.periodStart || entryDate > opts.periodEnd) {
      violations.push({
        code: 'date_out_of_period',
        severity: 'warning',
        line: lineNum,
        message: `EcritureDate ${entryDate} outside period ${opts.periodStart}..${opts.periodEnd}`,
      });
    }
    if (!validDate) {
      violations.push({ code: 'missing_valid_date', severity: 'warning', line: lineNum, message: 'ValidDate empty (entry not validated?)' });
    }

    const entryKey = `${journalCode}|${entryNo}`;
    const lineNo = (lineNoByEntry.get(entryKey) ?? 0) + 1;
    lineNoByEntry.set(entryKey, lineNo);

    const bal = entryBalance.get(entryKey) ?? { debit: 0, credit: 0, journal: journalCode, firstLine: lineNum };
    bal.debit += debitCents;
    bal.credit += creditCents;
    entryBalance.set(entryKey, bal);

    const j = (journals[journalCode] ??= { debitCents: 0, creditCents: 0, count: 0 });
    j.debitCents += debitCents;
    j.creditCents += creditCents;
    j.count += 1;
    totalDebit += debitCents;
    totalCredit += creditCents;

    rows.push({
      naturalKey: naturalKey(journalCode, entryNo, lineNo),
      lineNo,
      journalCode,
      journalLib: journalLib || undefined,
      entryNo,
      entryDate,
      accountNo: compteNum,
      accountLabel: compteLib || undefined,
      auxNo: auxNo || undefined,
      auxLabel: auxLib || undefined,
      pieceRef: pieceRef || undefined,
      pieceDate: pieceDateIso,
      label: ecritureLib || undefined,
      debitCents,
      creditCents,
      letteringCode: lettering || undefined,
      letteringDate: letteringDateIso,
      validDate: validDateIso,
      amountCcyCents: montantDevise ? parseAmountCents(montantDevise) : undefined,
      ccy: idevise || undefined,
    });
  }

  for (const [key, bal] of entryBalance) {
    if (bal.debit !== bal.credit) {
      violations.push({
        code: 'entry_unbalanced',
        severity: 'error',
        line: bal.firstLine,
        message: `entry ${key} unbalanced: D ${bal.debit} ≠ C ${bal.credit} (cents)`,
      });
    }
  }
  if (totalDebit !== totalCredit) {
    violations.push({
      code: 'global_unbalanced',
      severity: 'error',
      message: `file unbalanced: total D ${totalDebit} ≠ total C ${totalCredit} (cents)`,
    });
  }

  const ok = !violations.some((v) => v.severity === 'error');
  return {
    rows,
    violations,
    meta: { separator, variant, rowCount: rows.length, totalDebitCents: totalDebit, totalCreditCents: totalCredit, journals },
    ok,
  };
}

function emptyMeta(separator: 'tab' | 'pipe' = 'tab', variant: 'debit_credit' | 'montant_sens' = 'debit_credit'): FecParseResult['meta'] {
  return { separator, variant, rowCount: 0, totalDebitCents: 0, totalCreditCents: 0, journals: {} };
}
