import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { primaryPack } from '@/lib/packs';
import {
  computeFileDeadlines, type FileDeadlines, type PcaobFirmProfile,
} from '@/lib/kernel/retention';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';

// ADR-014 rev. 2 — file deadlines are computed from the engagement's own facts and stored
// with the provision that produced them. Nothing here is a hardcoded duration: the pack
// names the regime, the kernel holds the cited rule, this service supplies the facts.

/** The firm-level fact the AS 1215.15 phase-in turns on. Unknown ⇒ 0, which resolves to
 *  the later (smaller-firm) phase-in — never assume a shorter deadline already applies. */
async function firmProfile(tenantId: string): Promise<PcaobFirmProfile> {
  const row = await q01<{ issuer_reports_2024: number | null }>(
    `select issuer_reports_2024 from tenant where id = $1`,
    [tenantId],
  );
  return { issuerReports2024: row?.issuer_reports_2024 ?? 0 };
}

export async function fileDeadlines(engagementId: string, reportDate?: string): Promise<FileDeadlines> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const eng = await q1<{ report_date: string | null }>(
    `select report_date::text from engagement where id = $1`,
    [engagementId],
  );
  // absent an actual report date, the period end is the planning proxy
  const effectiveReportDate = reportDate ?? eng.report_date ?? ctx.period_end;
  return computeFileDeadlines({
    ruleSet: pack.docRules.ruleSet,
    reportDate: effectiveReportDate,
    fiscalYearStart: ctx.period_start,
    firm: await firmProfile(ctx.tenant_id),
  });
}

/** Signing the report starts both clocks. Writes the two dates and the provision behind
 *  each, then locks the file — after this the lock guard rejects further writes. */
export async function closeFile(engagementId: string, userId: string, reportDate: string): Promise<FileDeadlines> {
  const ctx = await engagementCtx(engagementId);
  const d = await fileDeadlines(engagementId, reportDate);
  await q(
    `update engagement set report_date = $2, doc_completion_due = $3, retention_until = $4,
            legal_basis = $5, status = 'locked', locked_at = now()
     where id = $1`,
    [
      engagementId, reportDate, d.completionDue, d.retentionUntil,
      JSON.stringify({
        rule_set: d.ruleSet,
        completion: { days: d.completion.days, ...d.completion.source, determined_by: d.completion.determinedBy },
        retention: { years: d.retention.years, ...d.retention.source },
        any_unverified: d.anyUnverified,
      }),
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: 'file_closed',
    objectType: 'engagement',
    objectId: engagementId,
    payload: {
      report_date: reportDate,
      doc_completion_due: d.completionDue,
      retention_until: d.retentionUntil,
      completion_basis: d.completion.source.citation,
      retention_basis: d.retention.source.citation,
      any_unverified: d.anyUnverified,
    },
  });
  return d;
}
