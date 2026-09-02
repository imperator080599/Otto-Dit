import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { sha256 } from '@/lib/core/hash';
import { parseAmountCents } from '@/lib/kernel/canon';
import { decodeFecBytes, parseFec } from '@/lib/kernel/fec';
import { computeFlags, defaultFlagConfig } from '@/lib/kernel/flags';
import type { Violation } from '@/lib/kernel/types';
import { centsToNum } from '@/lib/util/num';

// S1 import services: generic TB importer (column mapping) + FEC adapter wiring.
// Re-import supersedes, never overwrites; ADR-016 guards drawn samples.

export interface TbMapping {
  separator: ';' | ',' | '\t';
  account: string; // header name
  label: string;
  debit?: string;
  credit?: string;
  balance?: string;
}

export interface EngagementCtx {
  id: string;
  tenant_id: string;
  entity_registry_no: string | null;
  period_start: string;
  period_end: string;
}

export async function engagementCtx(engagementId: string): Promise<EngagementCtx> {
  return q1<EngagementCtx>(
    `select e.id, e.tenant_id, en.registry_no as entity_registry_no,
            p.start_date::text as period_start, p.end_date::text as period_end
     from engagement e join entity en on en.id = e.entity_id join period p on p.id = e.period_id
     where e.id = $1`,
    [engagementId],
  );
}

export function detectTbMapping(headerLine: string): TbMapping {
  const sep = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const headers = headerLine.split(sep).map((h) => h.trim());
  const find = (...cands: string[]) =>
    headers.find((h) => cands.some((c) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(c)));
  return {
    separator: sep as TbMapping['separator'],
    account: find('compte', 'account', 'numero') ?? headers[0],
    label: find('intitul', 'libell', 'label', 'name') ?? headers[1],
    debit: find('debit'),
    credit: find('credit'),
    balance: find('solde', 'balance'),
  };
}

export interface TbParseResult {
  rows: { accountNo: string; label: string; debitCents: number; creditCents: number; balanceCents: number }[];
  violations: Violation[];
}

export function parseTbCsv(content: string, mapping: TbMapping): TbParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0].split(mapping.separator).map((h) => h.trim());
  const idx = (name?: string) => (name ? headers.indexOf(name) : -1);
  const iAcc = idx(mapping.account);
  const iLab = idx(mapping.label);
  const iDeb = idx(mapping.debit);
  const iCre = idx(mapping.credit);
  const iBal = idx(mapping.balance);
  const violations: Violation[] = [];
  const rows: TbParseResult['rows'] = [];
  if (iAcc < 0) violations.push({ code: 'mapping_account', severity: 'error', message: `account column "${mapping.account}" not found` });
  if (iDeb < 0 && iCre < 0 && iBal < 0) violations.push({ code: 'mapping_amounts', severity: 'error', message: 'need debit/credit or balance columns' });
  if (violations.length) return { rows, violations };

  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(mapping.separator);
    const accountNo = (parts[iAcc] ?? '').trim();
    if (!accountNo) {
      violations.push({ code: 'missing_account', severity: 'warning', line: i + 1, message: 'empty account number' });
      continue;
    }
    if (seen.has(accountNo)) {
      violations.push({ code: 'duplicate_account', severity: 'error', line: i + 1, message: `account ${accountNo} appears twice` });
      continue;
    }
    seen.add(accountNo);
    try {
      const debitCents = iDeb >= 0 ? parseAmountCents(parts[iDeb] ?? '') : 0;
      const creditCents = iCre >= 0 ? parseAmountCents(parts[iCre] ?? '') : 0;
      const balanceCents = iBal >= 0 ? parseAmountCents(parts[iBal] ?? '') : debitCents - creditCents;
      rows.push({ accountNo, label: (parts[iLab] ?? '').trim() || accountNo, debitCents, creditCents, balanceCents });
    } catch (e) {
      violations.push({ code: 'bad_amount', severity: 'error', line: i + 1, message: String(e) });
    }
  }
  const total = rows.reduce((s, r) => s + (r.debitCents - r.creditCents), 0);
  if (total !== 0) {
    violations.push({ code: 'tb_unbalanced', severity: 'error', message: `TB does not balance: net ${total} cents` });
  }
  return { rows, violations };
}

/** CE QUE L'IMPORT CAPTURE SUR L'INFORMATION PRODUITE PAR L'ENTITÉ (1.8), au
 *  moment de l'import : système source, généré par le système ou manuel,
 *  identifiant du rapport, date et auteur de l'extraction. Facultatif — rien
 *  ne bloque un import sans (règle 2 de la nuit) ; un rapport IPE créé sur ce
 *  fichier le reprend. */
export interface CaptureIpe {
  systemeSource?: string | null;
  natureIpe?: 'systeme' | 'systeme_modifie' | 'manuelle' | null;
  identifiantRapport?: string | null;
  extraitLe?: string | null;
  extraitPar?: string | null;
}
const CAPTURE_VIDE: Required<CaptureIpe> = { systemeSource: null, natureIpe: null, identifiantRapport: null, extraitLe: null, extraitPar: null };
function capture(c?: CaptureIpe): unknown[] {
  const x = { ...CAPTURE_VIDE, ...(c ?? {}) };
  if (x.natureIpe && !['systeme', 'systeme_modifie', 'manuelle'].includes(x.natureIpe)) {
    throw new Error('import : la nature IPE est « systeme », « systeme_modifie » ou « manuelle »');
  }
  return [x.systemeSource || null, x.natureIpe || null, x.identifiantRapport || null, x.extraitLe || null, x.extraitPar || null];
}

export async function importTb(opts: {
  engagementId: string;
  userId: string;
  filename: string;
  content: string;
  mapping: TbMapping;
  periodKind: 'current' | 'prior';
  ipe?: CaptureIpe;
}): Promise<{ importFileId: string; snapshotId?: string; violations: Violation[]; ok: boolean }> {
  const ctx = await engagementCtx(opts.engagementId);
  const parsed = parseTbCsv(opts.content, opts.mapping);
  const ok = !parsed.violations.some((v) => v.severity === 'error');
  const file = await q1<{ id: string }>(
    `insert into import_file (engagement_id, kind, filename, sha256, mapping_profile, validation_report, status, row_count,
                              systeme_source, nature_ipe, identifiant_rapport, extrait_le, extrait_par)
     values ($1,'tb',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [
      opts.engagementId,
      opts.filename,
      sha256(opts.content),
      JSON.stringify(opts.mapping),
      JSON.stringify({ violations: parsed.violations }),
      ok ? (parsed.violations.length ? 'validated_with_warnings' : 'validated') : 'rejected',
      parsed.rows.length,
      ...capture(opts.ipe),
    ],
  );
  let snapshotId: string | undefined;
  if (ok) {
    const prev = await q<{ id: string; version: number }>(
      `select id, version from tb_snapshot where engagement_id = $1 and period_kind = $2 and status = 'active'`,
      [opts.engagementId, opts.periodKind],
    );
    for (const p of prev) {
      await q(`update tb_snapshot set status = 'superseded' where id = $1`, [p.id]);
    }
    const version = (prev[0]?.version ?? 0) + 1;
    const snap = await q1<{ id: string }>(
      `insert into tb_snapshot (engagement_id, period_kind, version, import_file_id) values ($1,$2,$3,$4) returning id`,
      [opts.engagementId, opts.periodKind, version, file.id],
    );
    snapshotId = snap.id;
    for (const r of parsed.rows) {
      await q(
        `insert into account (tb_snapshot_id, number, label, debit, credit, balance) values ($1,$2,$3,$4,$5,$6)`,
        [snap.id, r.accountNo, r.label, centsToNum(r.debitCents), centsToNum(r.creditCents), centsToNum(r.balanceCents)],
      );
    }
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: opts.engagementId,
    actorKind: 'user',
    actorId: opts.userId,
    verb: ok ? 'tb_imported' : 'tb_import_rejected',
    objectType: 'import_file',
    objectId: file.id,
    payload: { filename: opts.filename, periodKind: opts.periodKind, rows: parsed.rows.length, violations: parsed.violations.length },
  });
  return { importFileId: file.id, snapshotId, violations: parsed.violations, ok };
}

/** ADR-016: importing a new GL while samples are drawn requires explicit invalidation. */
export async function drawnSamples(engagementId: string): Promise<{ id: string }[]> {
  return q<{ id: string }>(
    `select id from sample where engagement_id = $1 and status in ('validated','drawn')`,
    [engagementId],
  );
}

export async function importFec(opts: {
  engagementId: string;
  userId: string;
  filename: string;
  bytes: Uint8Array;
  confirmInvalidation?: boolean;
  ipe?: CaptureIpe;
}): Promise<{ importFileId: string; violations: Violation[]; ok: boolean; rowCount: number; invalidatedSamples?: number }> {
  const ctx = await engagementCtx(opts.engagementId);
  const affected = await drawnSamples(opts.engagementId);
  if (affected.length > 0 && !opts.confirmInvalidation) {
    throw new Error(
      `ADR-016: ${affected.length} drawn sample(s) depend on the current ledger. Re-importing requires explicit downstream invalidation.`,
    );
  }

  const { content } = decodeFecBytes(opts.bytes);
  const parsed = parseFec(content, {
    filename: opts.filename,
    expectedSiren: ctx.entity_registry_no ?? '',
    periodStart: ctx.period_start,
    periodEnd: ctx.period_end,
  });
  const ok = parsed.ok;
  const file = await q1<{ id: string }>(
    `insert into import_file (engagement_id, kind, filename, sha256, validation_report, status, row_count,
                              systeme_source, nature_ipe, identifiant_rapport, extrait_le, extrait_par)
     values ($1,'fec',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      opts.engagementId,
      opts.filename,
      sha256(opts.bytes),
      JSON.stringify({ violations: parsed.violations, meta: parsed.meta }),
      ok ? (parsed.violations.length ? 'validated_with_warnings' : 'validated') : 'rejected',
      parsed.rows.length,
      ...capture(opts.ipe),
    ],
  );

  let invalidatedSamples = 0;
  if (ok) {
    // supersede previous active GL rows + record carry-forward by natural key (ADR-016)
    const old = await q<{ id: string; natural_key: string }>(
      `select id, natural_key from gl_entry where engagement_id = $1 and status = 'active'`,
      [opts.engagementId],
    );
    if (old.length > 0) {
      await q(`update gl_entry set status = 'superseded' where engagement_id = $1 and status = 'active'`, [opts.engagementId]);
    }
    // flags computed at import (ADR-003) on the revenue-relevant view of the whole ledger
    const flagged = computeFlags(parsed.rows, defaultFlagConfig(ctx.period_end));
    const oldByNk = new Map(old.map((o) => [o.natural_key, o.id]));
    for (const r of flagged) {
      const inserted = await q1<{ id: string }>(
        `insert into gl_entry (engagement_id, import_file_id, line_no, natural_key, journal_code,
           journal_lib, entry_no, entry_date, account_no, account_label, aux_no, aux_label,
           piece_ref, piece_date, label, debit, credit, lettering, lettering_date, valid_date,
           amount_ccy, ccy, flags)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         returning id`,
        [
          opts.engagementId, file.id, r.lineNo, r.naturalKey, r.journalCode,
          r.journalLib ?? null, r.entryNo, r.entryDate, r.accountNo, r.accountLabel ?? null,
          r.auxNo ?? null, r.auxLabel ?? null, r.pieceRef ?? null, r.pieceDate ?? null,
          r.label ?? null, centsToNum(r.debitCents), centsToNum(r.creditCents),
          r.letteringCode ?? null, r.letteringDate ?? null, r.validDate ?? null,
          r.amountCcyCents !== undefined ? centsToNum(r.amountCcyCents) : null, r.ccy ?? null,
          JSON.stringify(r.flags),
        ],
      );
      const oldId = oldByNk.get(r.naturalKey);
      if (oldId) {
        await q(
          `insert into gl_entry_supersession (engagement_id, old_gl_entry_id, new_gl_entry_id) values ($1,$2,$3)`,
          [opts.engagementId, oldId, inserted.id],
        );
      }
    }
    if (opts.confirmInvalidation && affected.length > 0) {
      await q(`update sample set status = 'superseded' where engagement_id = $1 and status in ('validated','drawn')`, [opts.engagementId]);
      await q(`update workpaper set status = 'outdated' where engagement_id = $1 and status in ('draft','in_review','reviewed')`, [opts.engagementId]);
      invalidatedSamples = affected.length;
      await logEvent({
        tenantId: ctx.tenant_id,
        engagementId: opts.engagementId,
        actorKind: 'user',
        actorId: opts.userId,
        verb: 'reimport_invalidation',
        objectType: 'sample',
        payload: { invalidatedSamples: affected.length, reason: 'GL re-import (ADR-016)' },
      });
    }
  }

  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: opts.engagementId,
    actorKind: 'user',
    actorId: opts.userId,
    verb: ok ? 'gl_imported' : 'gl_import_rejected',
    objectType: 'import_file',
    objectId: file.id,
    payload: { filename: opts.filename, rows: parsed.rows.length, violations: parsed.violations.length },
  });
  return { importFileId: file.id, violations: parsed.violations, ok, rowCount: parsed.rows.length, invalidatedSamples };
}

export async function listImports(engagementId: string) {
  return q<{ id: string; kind: string; filename: string; status: string; row_count: number; created_at: string; validation_report: { violations: Violation[] } }>(
    `select id, kind, filename, status, row_count, created_at::text, validation_report
     from import_file where engagement_id = $1 order by created_at desc`,
    [engagementId],
  );
}

export async function activeTb(engagementId: string, periodKind: 'current' | 'prior') {
  const snap = await q01<{ id: string }>(
    `select id from tb_snapshot where engagement_id = $1 and period_kind = $2 and status = 'active'`,
    [engagementId, periodKind],
  );
  if (!snap) return null;
  const accounts = await q<{ number: string; label: string; debit: string; credit: string; balance: string }>(
    `select number, label, debit::text, credit::text, balance::text from account where tb_snapshot_id = $1 order by number`,
    [snap.id],
  );
  return { snapshotId: snap.id, accounts };
}
