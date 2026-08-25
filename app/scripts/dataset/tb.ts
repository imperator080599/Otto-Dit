import { seededRng } from '../../src/lib/core/rng';
import type { GlRow, TbRow } from '../../src/lib/kernel/types';
import { SEED } from './config';

// TB builder: FY2025 TB aggregated from the FEC (guaranteed consistent), then the seeded
// A7 mismatch applied to ONE account (706000, +25 000,00 € credit in the TB only —
// documented in ANOMALIES.md); FY2024 comparative fabricated with plausible variances.

export const TB_MISMATCH = { account: '706000', deltaCents: 2500000 }; // TB credit > FEC by 25k€

export function aggregateTb(rows: GlRow[]): TbRow[] {
  const map = new Map<string, TbRow>();
  for (const r of rows) {
    const t = map.get(r.accountNo) ?? {
      accountNo: r.accountNo,
      label: r.accountLabel ?? r.accountNo,
      debitCents: 0,
      creditCents: 0,
      balanceCents: 0,
    };
    t.debitCents += r.debitCents;
    t.creditCents += r.creditCents;
    t.balanceCents = t.debitCents - t.creditCents;
    if ((r.accountLabel ?? '').length > (t.label?.length ?? 0)) t.label = r.accountLabel!;
    map.set(r.accountNo, t);
  }
  return [...map.values()].sort((a, b) => (a.accountNo < b.accountNo ? -1 : 1));
}

/** Apply the seeded TB↔FEC mismatch (A7): the TB credits 706000 by 25k more than the FEC
 *  supports (as if a late top-side landed only in the TB export). */
export function applyTbMismatch(tb: TbRow[]): TbRow[] {
  return tb.map((t) =>
    t.accountNo === TB_MISMATCH.account
      ? { ...t, creditCents: t.creditCents + TB_MISMATCH.deltaCents, balanceCents: t.balanceCents - TB_MISMATCH.deltaCents }
      : t,
  );
}

/** FY2024 comparative: scale FY2025 with seeded per-account jitter, balanced via 110000. */
export function priorYearTb(tb2025: TbRow[]): TbRow[] {
  const rng = seededRng(SEED + ':py');
  const rows: TbRow[] = [];
  for (const t of tb2025) {
    if (t.accountNo === '110000') continue; // plug computed at the end
    const factor = 0.82 + rng() * 0.22; // 0.82–1.04 of current year
    const debit = Math.round(t.debitCents * factor);
    const credit = Math.round(t.creditCents * factor);
    rows.push({ accountNo: t.accountNo, label: t.label, debitCents: debit, creditCents: credit, balanceCents: debit - credit });
  }
  const imbalance = rows.reduce((s, r) => s + r.balanceCents, 0);
  rows.push({
    accountNo: '110000',
    label: 'Report à nouveau',
    debitCents: imbalance < 0 ? -imbalance : 0,
    creditCents: imbalance > 0 ? imbalance : 0,
    balanceCents: -imbalance,
  });
  return rows.sort((a, b) => (a.accountNo < b.accountNo ? -1 : 1));
}

/** TB CSV: semicolon-separated, decimal comma, header in French — exercises the generic
 *  importer's column mapping (docs/05 §1). */
export function serializeTbCsv(tb: TbRow[]): string {
  const fmt = (c: number) => {
    const sign = c < 0 ? '-' : '';
    const abs = Math.abs(c);
    return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  };
  const lines = ['Compte;Intitulé;Débit;Crédit'];
  for (const t of tb) {
    lines.push(`${t.accountNo};${t.label};${fmt(t.debitCents)};${fmt(t.creditCents)}`);
  }
  return lines.join('\n') + '\n';
}
