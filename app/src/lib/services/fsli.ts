import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { getAccountingMap } from '@/lib/packs';
import { mapAccount } from '@/lib/kernel/fsli-map';
import type { CoaMapRule } from '@/lib/packs/types';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';

// S1/S2: account→FSLI mapping (pack default + engagement overrides) and FSLI scoping
// with propose-and-confirm NS statuses (D9 — never silently descoped).

export async function frameworkSet(engagementId: string): Promise<{ assurance_packs: string[]; accounting_map: string; language: 'fr' | 'en' }> {
  const row = await q1<{ framework_set: { assurance_packs: string[]; accounting_map: string; language: 'fr' | 'en' } }>(
    `select framework_set from engagement where id = $1`,
    [engagementId],
  );
  return row.framework_set;
}

export async function engagementRules(engagementId: string): Promise<CoaMapRule[]> {
  const fs = await frameworkSet(engagementId);
  const map = getAccountingMap(fs.accounting_map);
  const overrides = await q<{ account_prefix: string; fsli_code: string; priority: number }>(
    `select account_prefix, fsli_code, priority from coa_map_rule where engagement_id = $1`,
    [engagementId],
  );
  return [
    ...map.rules,
    ...overrides.map((o) => ({ prefix: o.account_prefix, fsli: o.fsli_code, priority: 1000 + o.account_prefix.length })),
  ];
}

/** Rebuild FSLI rows from the active current TB. Preserves confirmed scoping decisions. */
export async function rebuildFslis(engagementId: string, userId: string | null): Promise<void> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const map = getAccountingMap(fs.accounting_map);
  const rules = await engagementRules(engagementId);
  const accounts = await q<{ number: string; balance: string }>(
    `select a.number, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  );
  const balances = new Map<string, number>();
  for (const a of accounts) {
    const f = mapAccount(a.number, rules);
    if (!f) continue;
    balances.set(f, (balances.get(f) ?? 0) + numToCents(a.balance));
  }
  const existing = await q<{ code: string; scoping: string; scoping_basis: string | null; confirmed_by: string | null }>(
    `select code, scoping, scoping_basis, confirmed_by from fsli where engagement_id = $1`,
    [engagementId],
  );
  const keep = new Map(existing.map((e) => [e.code, e]));
  await q(`delete from fsli where engagement_id = $1`, [engagementId]);
  for (const def of map.fslis) {
    const bal = balances.get(def.code) ?? 0;
    if (bal === 0 && !keep.has(def.code)) continue;
    const prev = keep.get(def.code);
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping, scoping_basis, confirmed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        engagementId,
        def.code,
        def.name[fs.language],
        def.statement,
        centsToNum(bal),
        prev?.confirmed_by ? prev.scoping : 'unscoped',
        prev?.confirmed_by ? prev.scoping_basis : null,
        prev?.confirmed_by ?? null,
      ],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: userId ? 'user' : 'system',
    actorId: userId,
    verb: 'fslis_rebuilt',
    objectType: 'fsli',
    payload: { count: balances.size },
  });
}

/** Propose scoping: |balance| < performance materiality ⇒ ns_proposed; else in_scope
 *  (still to confirm — D9). CTT governs misstatement accumulation, not scoping. */
export async function proposeScoping(engagementId: string, userId: string): Promise<void> {
  const ctx = await engagementCtx(engagementId);
  const mat = await q01<{ perf_amount: string }>(
    `select perf_amount::text from materiality where engagement_id = $1 and status = 'validated'
     order by version desc limit 1`,
    [engagementId],
  );
  if (!mat) throw new Error('validated materiality required before scoping (L3 order)');
  const ctt = numToCents(mat.perf_amount);
  const fslis = await q<{ id: string; code: string; balance: string; confirmed_by: string | null }>(
    `select id, code, balance::text, confirmed_by from fsli where engagement_id = $1`,
    [engagementId],
  );
  for (const f of fslis) {
    if (f.confirmed_by) continue; // human decisions are never overwritten (D9)
    const proposed = Math.abs(numToCents(f.balance)) < ctt ? 'ns_proposed' : 'in_scope';
    await q(
      `update fsli set scoping = $2, scoping_basis = $3 where id = $1`,
      [f.id, proposed, proposed === 'ns_proposed' ? `|balance| < performance materiality (${mat.perf_amount} €) — proposed NS, to confirm` : 'above performance materiality — in scope'],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'system',
    actorId: null,
    verb: 'scoping_proposed',
    objectType: 'fsli',
    payload: { thresholdCents: ctt, requestedBy: userId },
  });
}

export async function confirmScoping(
  fsliId: string,
  userId: string,
  decision: 'ns_confirmed' | 'in_scope' | 'in_scope_qualitative',
  basis?: string,
): Promise<void> {
  const f = await q1<{ id: string; engagement_id: string; code: string; scoping: string }>(
    `select id, engagement_id, code, scoping from fsli where id = $1`,
    [fsliId],
  );
  if (decision === 'in_scope_qualitative' && !basis?.trim()) {
    throw new Error('qualitative in-scope override requires a written basis');
  }
  const ctx = await engagementCtx(f.engagement_id);
  await q(
    `update fsli set scoping = $2, scoping_basis = coalesce($3, scoping_basis), confirmed_by = $4, confirmed_at = now() where id = $1`,
    [fsliId, decision, basis ?? null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: f.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'scoping_confirmed',
    objectType: 'fsli',
    objectId: fsliId,
    payload: { code: f.code, from: f.scoping, to: decision, basis },
  });
}

export async function listFslis(engagementId: string) {
  return q<{ id: string; code: string; name: string; statement: string; balance: string; scoping: string; scoping_basis: string | null; confirmed_by: string | null }>(
    `select id, code, name, statement, balance::text, scoping, scoping_basis, confirmed_by
     from fsli where engagement_id = $1 order by statement, code`,
    [engagementId],
  );
}

/** Accounts composing one FSLI under current rules (per-section lead sheet + gates). */
export async function fsliAccounts(engagementId: string, fsliCode: string): Promise<{ number: string; label: string; balanceCents: number }[]> {
  const rules = await engagementRules(engagementId);
  const accounts = await q<{ number: string; label: string; balance: string }>(
    `select a.number, a.label, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'
     order by a.number`,
    [engagementId],
  );
  return accounts
    .filter((a) => mapAccount(a.number, rules) === fsliCode)
    .map((a) => ({ number: a.number, label: a.label, balanceCents: numToCents(a.balance) }));
}

export async function addMappingOverride(engagementId: string, userId: string, prefix: string, fsliCode: string): Promise<void> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  await q(
    `insert into coa_map_rule (pack_id, engagement_id, account_prefix, fsli_code, priority) values ($1,$2,$3,$4,$5)`,
    [fs.accounting_map, engagementId, prefix, fsliCode, 1000 + prefix.length],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: 'coa_override_added',
    objectType: 'coa_map_rule',
    payload: { prefix, fsliCode },
  });
  await rebuildFslis(engagementId, userId);
}
