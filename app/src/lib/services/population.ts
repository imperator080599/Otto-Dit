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

// NEP 240 populations (MANUEL, FRAUDE — methodology/procedures.json). Both predicates are
// journal-entry-level, not account-balance-level, and both are generic across FSLI codes —
// unlike revenuePopulation() above (REV-SUBST only, hardcoded '70%'), this filters by the
// FSLI's actual mapped accounts (fsliAccounts). "saisie par la direction" (management entry,
// methodology/procedures.json's own population.filtre wording for both MANUEL and FRAUDE) is
// NOT computed here: gl_entry carries no entered-by/role column (checked against
// 0001_core.sql before writing this), so this predicate is structurally uncomputable with the
// current schema — disclosed, not silently dropped (R-nn, docs/BACKLOG_REPORTE.md).
export type JournalEntryPredicate = 'ecritures_manuelles' | 'ecritures_marqueurs_fraude';

const PREDICATE_FLAGS: Record<JournalEntryPredicate, readonly string[]> = {
  ecritures_manuelles: ['manual_journal'],
  ecritures_marqueurs_fraude: ['weekend', 'round_amount', 'late_validation'],
};

export async function journalEntryPopulation(
  engagementId: string,
  fsliCode: string,
  predicate: JournalEntryPredicate,
): Promise<{
  rows: PopulationRow[];
  units: SampleUnit[];
  hash: string;
  totalCents: number;
}> {
  const accounts = await fsliAccounts(engagementId, fsliCode);
  const accountNos = accounts.map((a) => a.number);
  if (accountNos.length === 0) {
    return { rows: [], units: [], hash: populationHash([]), totalCents: 0 };
  }

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
     where engagement_id = $1 and status = 'active' and account_no = any($2::text[])
     order by entry_date, entry_no, line_no`,
    [engagementId, accountNos],
  );
  const wantedFlags = new Set(PREDICATE_FLAGS[predicate]);
  const rows: PopulationRow[] = dbRows
    .map((r) => ({
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
    }))
    .filter((r) => r.flags.some((f) => wantedFlags.has(f)));
  const units: SampleUnit[] = rows.map((r) => ({
    id: r.naturalKey,
    amountCents: Math.abs(r.creditCents - r.debitCents),
    flags: r.flags.filter((f) => wantedFlags.has(f)),
  }));
  return {
    rows,
    units,
    hash: populationHash(rows),
    totalCents: units.reduce((s, u) => s + u.amountCents, 0),
  };
}
