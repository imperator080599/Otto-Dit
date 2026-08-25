import { q, q1 } from '@/lib/db/client';
import ExcelJS from 'exceljs';
import { aiSpend } from '@/lib/core/airuns';

// S10 — engagement dashboard + tracker exports in AUDIENCE VARIANTS (P6, idea #30):
// the Excel tracker is a generated view, never a maintained file.

export interface DashboardData {
  requests: { seq_no: number; title: string; status: string; item_count: number; done_count: number; reminders: number; due_date: string | null }[];
  itemsByStatus: Record<string, number>;
  exceptions: { open: number; total: number; escalated: number };
  deviations: { open: number; total: number };
  deficiencies: { severity: string; n: number }[];
  workpapers: { code: string; status: string; version: number; reviewer: string | null }[];
  evidence: { total: number; extracted: number; pendingVerify: number };
  ai: { runs: number; costUsd: number };
  progressPct: number;
}

export async function dashboard(engagementId: string, tenantId: string): Promise<DashboardData> {
  const requests = await q<{ seq_no: number; title: string; status: string; item_count: string; done_count: string; reminders: string; due_date: string | null }>(
    `select r.seq_no, r.title, r.status, r.due_date::text,
            (select count(*) from request_item i where i.request_id = r.id) item_count,
            (select count(*) from request_item i where i.request_id = r.id and i.status in ('uploaded','complete','na')) done_count,
            (select count(*) from reminder m where m.request_id = r.id and m.status = 'sent') reminders
     from request r where r.engagement_id = $1 order by r.seq_no`,
    [engagementId],
  );
  const itemStatuses = await q<{ status: string; n: string }>(
    `select i.status, count(*) n from request_item i join request r on r.id = i.request_id
     where r.engagement_id = $1 group by i.status`,
    [engagementId],
  );
  const exc = await q1<{ total: string; open: string; escalated: string }>(
    `select count(*) total,
            count(*) filter (where status in ('open','clarification_requested','explained')) open,
            count(*) filter (where status = 'escalated') escalated
     from exception where engagement_id = $1`,
    [engagementId],
  );
  const dev = await q1<{ total: string; open: string }>(
    `select count(*) total, count(*) filter (where status = 'open') open from deviation where engagement_id = $1`,
    [engagementId],
  );
  const defs = await q<{ severity: string; n: string }>(
    `select coalesce(severity_final, severity_proposed) severity, count(*) n
     from deficiency where engagement_id = $1 group by 1`,
    [engagementId],
  );
  const wps = await q<{ code: string; status: string; version: number; reviewer: string | null }>(
    `select w.code, w.status, w.version,
            (select u.name from signoff s join app_user u on u.id = s.user_id
             where s.workpaper_id = w.id order by s.signed_at desc limit 1) reviewer
     from workpaper w where w.engagement_id = $1 and w.status <> 'outdated' order by w.code`,
    [engagementId],
  );
  const evid = await q1<{ total: string; extracted: string; pending: string }>(
    `select count(*) total,
            count(*) filter (where exists (select 1 from extraction x where x.evidence_id = e.id and x.status in ('complete','verified'))) extracted,
            count(*) filter (where exists (select 1 from extraction x where x.evidence_id = e.id and x.status = 'pending_verify')) pending
     from evidence e where e.engagement_id = $1`,
    [engagementId],
  );
  const spend = await aiSpend(tenantId);
  const totalItems = requests.reduce((s, r) => s + Number(r.item_count), 0);
  const doneItems = requests.reduce((s, r) => s + Number(r.done_count), 0);

  return {
    requests: requests.map((r) => ({
      seq_no: r.seq_no, title: r.title, status: r.status, due_date: r.due_date,
      item_count: Number(r.item_count), done_count: Number(r.done_count), reminders: Number(r.reminders),
    })),
    itemsByStatus: Object.fromEntries(itemStatuses.map((s) => [s.status, Number(s.n)])),
    exceptions: { open: Number(exc.open), total: Number(exc.total), escalated: Number(exc.escalated) },
    deviations: { open: Number(dev.open), total: Number(dev.total) },
    deficiencies: defs.map((d) => ({ severity: d.severity, n: Number(d.n) })),
    workpapers: wps,
    evidence: { total: Number(evid.total), extracted: Number(evid.extracted), pendingVerify: Number(evid.pending) },
    ai: { runs: spend.runs, costUsd: spend.costUsd },
    progressPct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
  };
}

export type TrackerAudience = 'team' | 'client' | 'group';

/** Excel tracker in audience variants (idea #30): the client version carries no internal
 *  review statuses, no exceptions and no workpaper state. */
export async function trackerXlsx(engagementId: string, audience: TrackerAudience): Promise<Uint8Array> {
  const eng = await q1<{ name: string; entity: string; period: string }>(
    `select e.name, en.name entity, p.label period from engagement e
     join entity en on en.id = e.entity_id join period p on p.id = e.period_id where e.id = $1`,
    [engagementId],
  );
  const rows = await q<{
    seq_no: number; request_title: string; request_status: string; due_date: string | null;
    description: string; kind: string; item_status: string; evidence_count: string;
    reviewer: string | null; wp_code: string | null; wp_status: string | null;
  }>(
    `select r.seq_no, r.title request_title, r.status request_status, r.due_date::text,
            i.description, i.kind, i.status item_status,
            (select count(*) from evidence e where e.request_item_id = i.id) evidence_count,
            (select u.name from review_note n join app_user u on u.id = n.assignee_id
             where n.engagement_id = r.engagement_id and n.status = 'open' limit 1) reviewer,
            w.code wp_code, w.status wp_status
     from request r
     join request_item i on i.request_id = r.id
     left join workpaper w on w.procedure_id = r.procedure_id and w.status <> 'outdated'
     where r.engagement_id = $1 order by r.seq_no, i.created_at`,
    [engagementId],
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OTTO';
  wb.created = new Date('2026-02-01T09:00:00Z');
  wb.modified = new Date('2026-02-01T09:00:00Z');
  const sheet = wb.addWorksheet('Tracker');
  sheet.addRow([`${eng.entity} — ${eng.period} — ${eng.name}`]).font = { bold: true, size: 13 };
  sheet.addRow([`Audience: ${audience} · generated by OTTO (single source of truth — do not maintain separately)`]);
  sheet.addRow([]);

  const headers = audience === 'client'
    ? ['Request #', 'Request', 'Item', 'Status', 'Files received', 'Due']
    : ['Request #', 'Request', 'Item', 'Kind', 'Status', 'Files', 'Awaiting review from', 'Workpaper', 'WP status', 'Due'];
  sheet.addRow(headers).font = { bold: true };

  const clientStatus = (s: string) => (s === 'pending' ? 'Not received' : s === 'uploaded' ? 'Received' : s === 'complete' ? 'Complete' : 'N/A');
  const teamStatus = (s: string, reviewer: string | null) =>
    s === 'pending' ? 'Not received' : s === 'uploaded' ? 'In progress' : s === 'complete' ? (reviewer ? `Awaiting review from ${reviewer}` : 'Documented') : 'N/A';

  for (const r of rows) {
    if (audience === 'client') {
      sheet.addRow([`R-${String(r.seq_no).padStart(3, '0')}`, r.request_title, r.description, clientStatus(r.item_status), Number(r.evidence_count), r.due_date ?? '']);
    } else {
      sheet.addRow([
        `R-${String(r.seq_no).padStart(3, '0')}`, r.request_title, r.description, r.kind,
        teamStatus(r.item_status, r.reviewer), Number(r.evidence_count), r.reviewer ?? '',
        r.wp_code ?? '', r.wp_status ?? '', r.due_date ?? '',
      ]);
    }
  }
  sheet.columns.forEach((c) => { c.width = 26; });

  if (audience !== 'client') {
    const exceptions = await q<{ taxonomy_code: string; status: string; description: string; resolution: string | null }>(
      `select taxonomy_code, status, description, resolution from exception where engagement_id = $1 order by created_at`,
      [engagementId],
    );
    if (exceptions.length) {
      const s2 = wb.addWorksheet('Exceptions');
      s2.addRow(['Type', 'Status', 'Description', 'Disposition']).font = { bold: true };
      for (const e of exceptions) s2.addRow([e.taxonomy_code, e.status, e.description, e.resolution ?? '']);
      s2.columns.forEach((c) => { c.width = 40; });
    }
    const deviations = await q<{ control_code: string; instance: string | null; taxonomy_code: string; status: string }>(
      `select c.code control_code, ci.label instance, d.taxonomy_code, d.status
       from deviation d join control c on c.id = d.control_id
       left join sample_item si on si.id = d.sample_item_id
       left join control_instance ci on ci.id = si.unit_id
       where d.engagement_id = $1`,
      [engagementId],
    );
    if (deviations.length) {
      const s3 = wb.addWorksheet('Deviations');
      s3.addRow(['Control', 'Instance', 'Type', 'Status']).font = { bold: true };
      for (const d of deviations) s3.addRow([d.control_code, d.instance ?? '', d.taxonomy_code, d.status]);
      s3.columns.forEach((c) => { c.width = 26; });
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Client-safe dashboard slice (D6: no audit documentation, no exceptions). */
export async function clientSafeView(entityId: string) {
  return q<{ engagement_name: string; seq_no: number; title: string; status: string; due_date: string | null; item_count: string; done_count: string }>(
    `select e.name engagement_name, r.seq_no, r.title, r.status, r.due_date::text,
            (select count(*) from request_item i where i.request_id = r.id) item_count,
            (select count(*) from request_item i where i.request_id = r.id and i.status in ('uploaded','complete','na')) done_count
     from request r join engagement e on e.id = r.engagement_id
     where e.entity_id = $1 and r.status <> 'draft' order by e.name, r.seq_no`,
    [entityId],
  );
}
