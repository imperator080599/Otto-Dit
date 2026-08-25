import type { FlaggedGlRow, GlRow, JeFlag } from './types';

// Deterministic JE risk flags (ADR-003). Pure rules — no AI (P4). Flag definitions are
// documented in the workpaper when flags drive selections.

export interface FlagConfig {
  manualJournalCodes: string[]; // e.g. ['OD']
  roundAmountCents: number; // multiples of this (≥ this) are "round"
  periodEndDays: number; // last N days of the period
  creditNoteMinCount: number; // ≥ N credit notes for one counterparty ⇒ pattern
  periodEnd: string; // ISO date of period end
}

export const defaultFlagConfig = (periodEnd: string): FlagConfig => ({
  manualJournalCodes: ['OD'],
  roundAmountCents: 100000, // 1 000,00 €
  periodEndDays: 5,
  creditNoteMinCount: 3,
  periodEnd,
});

function isWeekend(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** A credit note in a revenue population: credit-note journal or negative revenue posting
 *  (debit on a 70x account) or piece marked AV. */
export function isCreditNote(row: GlRow): boolean {
  if (row.accountNo.startsWith('70') && row.debitCents > 0) return true;
  if ((row.pieceRef ?? '').toUpperCase().startsWith('AV')) return true;
  return false;
}

export function computeFlags(rows: GlRow[], cfg: FlagConfig): FlaggedGlRow[] {
  // credit-note pattern: counterparties with ≥ N credit notes in the population
  const cnCounts = new Map<string, number>();
  for (const r of rows) {
    if (isCreditNote(r) && r.auxNo) {
      cnCounts.set(r.auxNo, (cnCounts.get(r.auxNo) ?? 0) + 1);
    }
  }
  const patternParties = new Set(
    [...cnCounts.entries()].filter(([, n]) => n >= cfg.creditNoteMinCount).map(([p]) => p),
  );

  return rows.map((r) => {
    const flags: JeFlag[] = [];
    if (isWeekend(r.entryDate)) flags.push('weekend');
    const amount = Math.max(r.debitCents, r.creditCents);
    if (amount >= cfg.roundAmountCents && amount % cfg.roundAmountCents === 0) flags.push('round_amount');
    if (cfg.manualJournalCodes.includes(r.journalCode)) flags.push('manual_journal');
    if (daysBetween(r.entryDate, cfg.periodEnd) < cfg.periodEndDays && daysBetween(r.entryDate, cfg.periodEnd) >= 0) {
      flags.push('period_end');
    }
    if (r.auxNo && patternParties.has(r.auxNo) && isCreditNote(r)) flags.push('credit_note_pattern');
    return { ...r, flags };
  });
}
