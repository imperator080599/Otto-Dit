// ADR-051 — Adjustments, restatements, and their reconciliation with the misstatement summary.
//
// A trial-balance version carries entries. Each entry declares its NATURE:
//   'closing'      — the client finishing its year end (inventory, accruals, provisions)
//   'restatement'  — a reclassification, a change in estimate, or an error the client or
//                    its accountant found on its own
//   'audit_fix'    — a correction the client passed BECAUSE WE RAISED SOMETHING
//
// Only the third one reconciles with the misstatement summary. It names the DOCUMENT
// (piece reference) it corrects; the misstatement carried on that document leaves the
// uncorrected accumulation for exactly what the entry carries — no more, and never with
// the sign reversed. Nobody ticks a "corrected" box: a checkbox would remove an amount
// from the accumulation with no entry behind it, which is the rule already written for
// exception resolution (ADR-013), applied here.
//
// An audit_fix in a version that has been RECEIVED but NOT TAKEN INTO ACCOUNT has
// corrected nothing. That is the versioning rule (ADR-030), and it holds here too.
//
// Two signals, and they do not say the same thing:
//   1. a misstatement the file calls "corrected" with no entry carrying it — either the
//      correction was never passed, or it was not sent to us. Either way the accumulation
//      is wrong.
//   2. an entry presenting itself as answering a finding our file does not carry — either
//      we failed to record the finding, or the client is correcting something else.
//
// Pure, deterministic, integer cents. No I/O.

export type AdjustmentNature = 'closing' | 'restatement' | 'audit_fix';

export interface AdjustmentLine {
  account: string;
  debitCents: number;
  creditCents: number;
}

export interface Adjustment {
  ref: string;
  version: number;
  nature: AdjustmentNature;
  label: string;
  /** Why it was passed. Required by the file, not by the type system. */
  reason?: string;
  /** Supporting document held by the client. */
  support?: string;
  /** Who passed it, on the client side. */
  author?: string;
  /** For 'audit_fix' only: the document reference the correction answers. */
  answers?: string;
  lines: AdjustmentLine[];
}

export interface Misstatement {
  key: string;
  label: string;
  /** Document reference the misstatement is carried on, when there is one. */
  piece?: string;
  /** Signed, as identified. */
  identifiedCents: number;
  /** Removed by a probative resolution recorded where the exception arose. */
  explainedCents: number;
  /** Set when the auditor qualified the exception as "corrected". */
  disposition?: string;
}

export interface ReconciledMisstatement extends Misstatement {
  /** Removed by an adjusting entry, bounded to the misstatement and its sign. */
  correctedCents: number;
  correctedBy: Array<{ ref: string; version: number; amountCents: number }>;
  /** identified − explained − corrected. */
  residualCents: number;
}

export interface Reconciliation {
  misstatements: ReconciledMisstatement[];
  matched: Array<{ adjustment: Adjustment; misstatements: string[]; appliedCents: number; unappliedCents: number }>;
  /** Signal 2: an audit_fix answering a finding the file does not carry. */
  fixesWithoutMisstatement: Adjustment[];
  /** Signal 1: a misstatement called "corrected" with no entry carrying it. */
  misstatementsWithoutEntry: ReconciledMisstatement[];
  /** Corrections announced in a received but not-yet-taken-into-account version. */
  announced: Adjustment[];
  totals: {
    identifiedCents: number;
    explainedCents: number;
    correctedCents: number;
    residualCents: number;
  };
}

/** Amount of a (balanced) entry: the sum of its debits. */
export function adjustmentAmountCents(a: Adjustment): number {
  return a.lines.reduce((t, l) => t + l.debitCents, 0);
}

/**
 * Impact of an entry on profit and on net assets.
 * Δ profit     = Σ (credit − debit) over classes 6 and 7.
 * Δ net assets = Σ (debit − credit) over classes 1 to 5.
 * The two are EQUAL by construction — that is double entry, and `balanced` checks it
 * rather than asserting it.
 * Δ equity     = Δ profit + movements taken directly to capital accounts (10, 11).
 */
export function adjustmentImpact(a: Adjustment): {
  profitCents: number; netAssetsCents: number; equityCents: number; balanced: boolean;
  byAccount: Array<{ account: string; deltaCents: number }>;
} {
  let profit = 0, net = 0, directEquity = 0;
  const byAccount = new Map<string, number>();
  for (const l of a.lines) {
    const delta = l.debitCents - l.creditCents;
    byAccount.set(l.account, (byAccount.get(l.account) ?? 0) + delta);
    if (/^[67]/.test(l.account)) profit += l.creditCents - l.debitCents;
    else net += delta;
    if (/^(10|11)/.test(l.account)) directEquity += l.creditCents - l.debitCents;
  }
  return {
    profitCents: profit, netAssetsCents: net, equityCents: profit + directEquity,
    balanced: profit === net,
    byAccount: [...byAccount].map(([account, deltaCents]) => ({ account, deltaCents })),
  };
}

/**
 * Reconcile corrections with the misstatement summary.
 *
 * @param adjustments   every entry of every version
 * @param misstatements the file's misstatements, before any entry is applied
 * @param takenVersion  the version the file is on — entries above it have corrected nothing
 * @param receivedVersions versions received (whether taken into account or not)
 */
export function reconcile(
  adjustments: Adjustment[],
  misstatements: Misstatement[],
  takenVersion: number,
  receivedVersions: number[] = [],
): Reconciliation {
  const out: ReconciledMisstatement[] = misstatements.map((m) => ({
    ...m, correctedCents: 0, correctedBy: [], residualCents: m.identifiedCents - m.explainedCents,
  }));
  const inForce = adjustments.filter((a) => a.nature === 'audit_fix' && a.version <= takenVersion);
  const matched: Reconciliation['matched'] = [];
  const fixesWithoutMisstatement: Adjustment[] = [];

  for (const a of inForce) {
    const targets = out.filter((m) => m.piece !== undefined && m.piece === a.answers);
    if (targets.length === 0) { fixesWithoutMisstatement.push(a); continue; }
    // Served largest residual first: otherwise list order would decide what stays
    // in the accumulation. Bounded to each residual and to its sign.
    let left = adjustmentAmountCents(a);
    let applied = 0;
    for (const m of [...targets].sort((x, y) => Math.abs(y.residualCents) - Math.abs(x.residualCents))) {
      if (left <= 0 || m.residualCents === 0) continue;
      const take = Math.min(left, Math.abs(m.residualCents));
      const signed = m.residualCents >= 0 ? take : -take;
      m.correctedCents += signed;
      m.residualCents -= signed;
      m.correctedBy.push({ ref: a.ref, version: a.version, amountCents: signed });
      left -= take;
      applied += take;
    }
    matched.push({
      adjustment: a, misstatements: targets.map((m) => m.key),
      appliedCents: applied, unappliedCents: adjustmentAmountCents(a) - applied,
    });
  }

  const misstatementsWithoutEntry = out.filter(
    (m) => m.disposition === 'corrected' && m.correctedBy.length === 0,
  );
  const announced = adjustments.filter(
    (a) => a.nature === 'audit_fix' && a.version > takenVersion && receivedVersions.includes(a.version),
  );

  return {
    misstatements: out, matched, fixesWithoutMisstatement, misstatementsWithoutEntry, announced,
    totals: {
      identifiedCents: out.reduce((t, m) => t + m.identifiedCents, 0),
      explainedCents: out.reduce((t, m) => t + m.explainedCents, 0),
      correctedCents: out.reduce((t, m) => t + m.correctedCents, 0),
      residualCents: out.reduce((t, m) => t + m.residualCents, 0),
    },
  };
}
