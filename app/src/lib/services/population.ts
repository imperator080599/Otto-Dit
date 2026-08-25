import { q } from '@/lib/db/client';
import type { GlRow, SampleUnit } from '@/lib/kernel/types';
import { populationHash } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { fsliRecoGate } from './reconciliation';
import { fsliAccounts } from './fsli';

// S3 population service: the revenue population = active GL lines on the tested FSLI's
// accounts. The population is a deterministic derivation (query + hash), persisted on the
// sample at draw time (docs/03 §2). JE risk flags were computed at import (ADR-003).

export const SELECTION_FLAGS = ['weekend', 'round_amount', 'manual_journal', 'credit_note_pattern'] as const;

export interface PopulationRow extends GlRow {
  id: string; // gl_entry uuid
  flags: string[];
}

export async function revenuePopulation(engagementId: string): Promise<{
  rows: PopulationRow[];
  units: SampleUnit[];
  hash: string;
  totalCents: number;
  gate: { ok: boolean; blocking: string[] };
}> {
  const accounts = await fsliAccounts(engagementId, 'REVENUE');
  const accountNos = accounts.map((a) => a.number);
  const gate = await fsliRecoGate(engagementId, accountNos);

  const dbRows = await q<{
    id: string; line_no: number; natural_key: string; journal_code: string; journal_lib: string | null;
    entry_no: string; entry_date: string; account_no: string; account_label: string | null;
    aux_no: string | null; aux_label: string | null; piece_ref: string | null; piece_date: string | null;
    label: string | null; debit: string; credit: string; flags: string[];
  }>(
    `select id, line_no, natural_key, journal_code, journal_lib, entry_no, entry_date::text,
            account_no, account_label, aux_no, aux_label, piece_ref, piece_date::text, label,
            debit::text, credit::text, flags
     from gl_entry
     where engagement_id = $1 and status = 'active' and account_no like '70%'
     order by entry_date, entry_no, line_no`,
    [engagementId],
  );
  const rows: PopulationRow[] = dbRows.map((r) => ({
    id: r.id,
    naturalKey: r.natural_key,
    lineNo: r.line_no,
    journalCode: r.journal_code,
    journalLib: r.journal_lib ?? undefined,
    entryNo: r.entry_no,
    entryDate: r.entry_date,
    accountNo: r.account_no,
    accountLabel: r.account_label ?? undefined,
    auxNo: r.aux_no ?? undefined,
    auxLabel: r.aux_label ?? undefined,
    pieceRef: r.piece_ref ?? undefined,
    pieceDate: r.piece_date ?? undefined,
    label: r.label ?? undefined,
    debitCents: numToCents(r.debit),
    creditCents: numToCents(r.credit),
    flags: r.flags ?? [],
  }));
  const selectionSet = new Set<string>(SELECTION_FLAGS);
  const units: SampleUnit[] = rows.map((r) => ({
    id: r.naturalKey,
    amountCents: Math.abs(r.creditCents - r.debitCents),
    flags: r.flags.filter((f) => selectionSet.has(f)),
  }));
  return {
    rows,
    units,
    hash: populationHash(rows),
    totalCents: units.reduce((s, u) => s + u.amountCents, 0),
    gate,
  };
}

export async function flaggedRows(engagementId: string): Promise<PopulationRow[]> {
  const pop = await revenuePopulation(engagementId);
  return pop.rows.filter((r) => r.flags.length > 0);
}
