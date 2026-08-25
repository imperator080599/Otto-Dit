import type { AccountingMapPack, CoaMapRule } from '@/lib/packs/types';

// Account → FSLI mapping: longest matching prefix wins (priority = prefix length by
// convention); engagement-level override rules carry priority 1000 + prefix length.

export function mapAccount(accountNo: string, rules: CoaMapRule[]): string | null {
  let best: CoaMapRule | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (accountNo.startsWith(r.prefix)) {
      const score = r.priority ?? r.prefix.length;
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
  }
  return best?.fsli ?? null;
}

export function mapAccounts(
  accounts: { accountNo: string; balanceCents: number }[],
  map: AccountingMapPack,
  overrides: CoaMapRule[] = [],
): Map<string, { fsli: string | null; balanceCents: number }> {
  const rules = [...map.rules, ...overrides.map((o) => ({ ...o, priority: 1000 + o.prefix.length }))];
  const out = new Map<string, { fsli: string | null; balanceCents: number }>();
  for (const a of accounts) {
    out.set(a.accountNo, { fsli: mapAccount(a.accountNo, rules), balanceCents: a.balanceCents });
  }
  return out;
}

/** FSLI balances from mapped accounts (sign: BS assets positive-debit; IS naturally). */
export function fsliBalances(
  accounts: { accountNo: string; balanceCents: number }[],
  map: AccountingMapPack,
  overrides: CoaMapRule[] = [],
): Map<string, number> {
  const mapped = mapAccounts(accounts, map, overrides);
  const out = new Map<string, number>();
  for (const [, v] of mapped) {
    if (!v.fsli) continue;
    out.set(v.fsli, (out.get(v.fsli) ?? 0) + v.balanceCents);
  }
  return out;
}
