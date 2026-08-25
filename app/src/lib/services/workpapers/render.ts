import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getAssurancePack } from '@/lib/packs';
import ExcelJS from 'exceljs';
import { q, q1, repoRoot } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject, sha256 } from '@/lib/core/hash';
import { saveBlob } from '@/lib/core/storage';
import { engagementCtx } from '../imports';
import { getWorkpaper, listEdits, listNotes, listSignoffs } from './lifecycle';
import type { WpSection } from './draft';

// ADR-013 — exports are terminal, versioned, hash-stamped and SELF-CONTAINED: embedded
// sample parameters, per-item evidence sha256s, modification history, review trail and
// sign-off block. The archived artifact answers P7 without OTTO access.

/**
 * Character coverage (ADR-023). The previous renderer replaced anything outside Latin-1
 * with "?", so a French audit file printed « l?état des anomalies » and « ? 25 000 € ».
 * Patching the euro sign fixed one instance of a class; this replaces the class.
 *
 * The document font is now a vendored Unicode face (Liberation Sans, app/assets/fonts),
 * so typographic apostrophes, guillemets, €, ≥, ≤, — and the rest simply render. Nothing
 * is transliterated. If a character has no glyph even there, the export FAILS LOUDLY
 * rather than shipping a substitute into an audit file — a workpaper that quietly alters
 * its own text is not a workpaper.
 */
export class UnrenderableCharacterError extends Error {
  constructor(readonly characters: string[], readonly sample: string) {
    super(
      `the document font has no glyph for ${characters.map((c) => `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')} ` +
      `— refusing to export a workpaper with substituted characters. Context: "${sample.slice(0, 80)}"`,
    );
    this.name = 'UnrenderableCharacterError';
  }
}

// Glyph coverage is read from the font itself. `encodeText` does NOT fail on a missing
// glyph — it maps to .notdef and the PDF shows a blank or a box — which is precisely the
// silent substitution this check exists to stop.
let coverage: { hasGlyphForCodePoint(cp: number): boolean } | null = null;

function fontCoverage(): { hasGlyphForCodePoint(cp: number): boolean } {
  if (coverage) return coverage;
  const file = path.join(repoRoot(), 'app', 'assets', 'fonts', 'DejaVuSans.ttf');
  coverage = fontkit.create(fs.readFileSync(file)) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
  return coverage;
}

function assertRenderable(_font: PDFFont, text: string): string {
  const cov = fontCoverage();
  const missing = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10 || cp === 13 || cp === 9) continue;
    if (!cov.hasGlyphForCodePoint(cp)) missing.add(ch);
  }
  if (missing.size > 0) throw new UnrenderableCharacterError([...missing], text);
  return text;
}

class PdfWriter {
  doc!: PDFDocument;
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    private font: PDFFont,
    private bold: PDFFont,
    private stamp: string,
  ) {}

  static async create(stamp: string): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setCreationDate(new Date('2026-02-01T09:00:00Z'));
    doc.setModificationDate(new Date('2026-02-01T09:00:00Z'));
    doc.setProducer('OTTO documentation engine');
    // vendored so an export is byte-identical on any machine (assets/fonts/README.md).
    // Subsetting keeps a workpaper ~40 kB instead of ~940 kB; the byte-identical
    // regeneration test is what proves the subsetter is deterministic for our input.
    const dir = path.join(repoRoot(), 'app', 'assets', 'fonts');
    const font = await doc.embedFont(fs.readFileSync(path.join(dir, 'DejaVuSans.ttf')), { subset: true });
    const bold = await doc.embedFont(fs.readFileSync(path.join(dir, 'DejaVuSans-Bold.ttf')), { subset: true });
    const w = new PdfWriter(font, bold, stamp);
    w.doc = doc;
    w.newPage();
    return w;
  }

  newPage() {
    this.pageNo += 1;
    this.page = this.doc.addPage([595, 842]);
    this.y = 800;
    this.page.drawText(assertRenderable(this.font, this.stamp) + ` - page ${this.pageNo}`, {
      x: 40, y: 16, size: 6.5, font: this.font, color: rgb(0.45, 0.5, 0.58),
    });
  }

  ensure(h: number) {
    if (this.y - h < 40) this.newPage();
  }

  wrap(text: string, size: number, maxWidth: number, font: PDFFont): string[] {
    const words = assertRenderable(font, text).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const probe = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(probe, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  text(t: string, opts: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.bold : this.font;
    const x = 40 + (opts.indent ?? 0);
    for (const line of this.wrap(t, size, 555 - x, font)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.12, 0.16) });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 3;
  }

  heading(t: string) {
    this.ensure(30);
    this.y -= 6;
    this.text(t, { size: 11, bold: true, color: [0.12, 0.3, 0.55], gap: 2 });
    this.page.drawLine({ start: { x: 40, y: this.y + 2 }, end: { x: 555, y: this.y + 2 }, thickness: 0.6, color: rgb(0.75, 0.8, 0.86) });
    this.y -= 6;
  }
}

export async function renderWorkpaperPdf(workpaperId: string): Promise<{ bytes: Uint8Array; contentHash: string }> {
  const wp = await getWorkpaper(workpaperId);
  if (!wp) throw new Error('workpaper not found');
  const edits = await listEdits(workpaperId);
  const notes = await listNotes(workpaperId);
  const signoffs = await listSignoffs(workpaperId);
  const eng = await q1<{ name: string; entity: string; period: string }>(
    `select e.name, en.name entity, p.label period from engagement e
     join entity en on en.id = e.entity_id join period p on p.id = e.period_id where e.id = $1`,
    [wp.engagement_id],
  );
  const contentHash = hashObject({ sections: wp.sections, version: wp.version, code: wp.code });
  const stamp = `OTTO export - ${wp.code} v${wp.version} - hash ${contentHash.slice(0, 16)}`;
  const w = await PdfWriter.create(stamp);

  w.text(eng.entity + ' - ' + eng.period, { size: 9, color: [0.4, 0.45, 0.55] });
  w.text(wp.title, { size: 15, bold: true, gap: 2 });
  w.text(`${wp.pack_id} - v${wp.version} - ${wp.status.toUpperCase()}`, { size: 8, color: [0.4, 0.45, 0.55], gap: 4 });
  // Attribution comes from the pack (ADR-012.4), never from the renderer: an English SOX
  // workpaper must not carry French chrome, and vice versa.
  const pack = getAssurancePack(wp.pack_id);
  const fr = pack.language === 'fr';
  w.text(
    `${pack.wp.performedBy} ${wp.engine_run_id ?? '-'} (${fr ? 'empreinte du dossier' : 'facts hash'} ${wp.based_on_hash?.slice(0, 20) ?? '-'}). ` +
    (signoffs.length
      ? `${pack.wp.validatedBy} : ` + signoffs.map((s) => `${s.user_name} (${s.sign_role}, ${s.signed_at.slice(0, 10)})`).join(' ; ')
      : fr ? 'NON VALIDE - projet.' : 'NOT VALIDATED - draft.'),
    { size: 8, color: [0.35, 0.25, 0.55], gap: 6 },
  );
  if (edits.length > 0) {
    w.text(
      fr
        ? `DOCUMENT MODIFIE MANUELLEMENT - ${edits.length} modification(s) justifiee(s), voir annexe.`
        : `MANUALLY MODIFIED - ${edits.length} justified modification(s), see appendix.`,
      { size: 8, bold: true, color: [0.6, 0.4, 0.05], gap: 6 },
    );
  }

  for (const s of wp.sections as WpSection[]) {
    w.heading(s.title);
    if (s.body) w.text(s.body, { size: 9 });
    if (s.table) {
      w.text(s.table.headers.join('  |  '), { size: 7.5, bold: true, gap: 2 });
      for (const row of s.table.rows) {
        const main = row.cells.slice(0, 5).map(String).join('  |  ');
        w.text('- ' + main, { size: 8, bold: true, indent: 4, gap: 0 });
        const rest = row.cells.slice(5).map(String).filter(Boolean);
        for (const [i, cell] of rest.entries()) {
          w.text(`${s.table.headers[5 + i] ?? ''}: ${cell}`, { size: 7.5, indent: 14, gap: 0 });
        }
        if (row.refs?.evidenceIds?.length) {
          w.text(`refs evidence: ${row.refs.evidenceIds.map((x) => x.slice(0, 8)).join(', ')}`, { size: 6.5, indent: 14, color: [0.5, 0.55, 0.62], gap: 1 });
        }
        w.y -= 2;
      }
    }
  }

  // ---------- self-contained appendix (ADR-013) ----------
  // Appendix titles come from the pack, like the body: an English workpaper with French
  // appendix headings is the same defect as a French attribution line on it (ADR-023).
  const ap = pack.wp.appendices;
  w.newPage();
  w.heading(ap.parameters);
  const method = (wp.sections as WpSection[]).find((s) => s.key === 'method');
  w.text((fr ? 'Paramètres d’échantillonnage : ' : 'Sampling parameters: ') + JSON.stringify(method?.meta?.params ?? {}), { size: 8 });
  w.text((fr ? 'Empreinte de population : ' : 'Population hash: ') + String(method?.meta?.populationHash ?? '-'), { size: 8, gap: 6 });

  // Appendix B is built from what the workpaper CITES, not from one hard-coded join. The
  // previous query walked sample_item → sample, so the SOX paper — whose evidence hangs off
  // control instances — cited two reconciliations and printed an empty appendix. Citing a
  // document without carrying its fingerprint is the one thing this appendix exists to
  // prevent, so a missing one is now an error, not a blank page.
  const citedIds = [...new Set(
    (wp.sections as WpSection[]).flatMap((s) => s.table?.rows?.flatMap((r) => r.refs?.evidenceIds ?? []) ?? []),
  )];
  const evidences = citedIds.length
    ? await q<{ id: string; filename: string; sha256: string; doc_type: string | null }>(
        `select id, filename, sha256, doc_type from evidence where id = any($1::uuid[]) order by filename`,
        [citedIds],
      )
    : [];
  const unresolved = citedIds.filter((id) => !evidences.some((e) => e.id === id));
  if (unresolved.length > 0) {
    throw new Error(
      `workpaper ${wp.code} cites ${unresolved.length} evidence item(s) that cannot be resolved for the appendix ` +
      `(${unresolved.map((i) => i.slice(0, 8)).join(', ')}) — refusing to export a paper whose citations have no fingerprint`,
    );
  }
  w.heading(`${ap.evidence} (${evidences.length})`);
  if (evidences.length === 0) {
    w.text(fr ? 'Aucune pièce citée dans le corps du document.' : 'No evidence cited in the body of this workpaper.', { size: 8 });
  }
  for (const e of evidences) {
    w.text(`${e.filename} [${e.doc_type ?? '-'}] ${e.sha256}`, { size: 6.8, gap: 0 });
  }

  w.heading(ap.modifications);
  if (edits.length === 0) w.text(fr ? 'Aucune.' : 'None.', { size: 8 });
  for (const e of edits) {
    w.text(`${e.edited_at.slice(0, 16)} - ${e.user_name} - section ${e.section} - ${fr ? 'justification' : 'justification'} : ${e.justification}`, { size: 7.5, gap: 1 });
  }

  w.heading(ap.reviewNotes);
  if (notes.length === 0) w.text(fr ? 'Aucune.' : 'None.', { size: 8 });
  for (const n of notes) {
    w.text(`[${n.status}] ${n.author_name}${n.assignee_name ? ' -> ' + n.assignee_name : ''} : ${n.text}`, { size: 7.5, gap: 1 });
  }

  w.heading(ap.signoffs);
  if (signoffs.length === 0) w.text(fr ? 'Aucun visa - document non validé.' : 'No sign-off - document not validated.', { size: 8 });
  for (const s of signoffs) {
    w.text(`${s.sign_role} : ${s.user_name} ${fr ? 'le' : 'on'} ${s.signed_at.slice(0, 16)}`, { size: 8, gap: 1 });
  }

  const bytes = await w.doc.save({ useObjectStreams: false });
  return { bytes, contentHash };
}

export async function renderWorkpaperXlsx(workpaperId: string): Promise<{ bytes: Uint8Array; contentHash: string }> {
  const wp = await getWorkpaper(workpaperId);
  if (!wp) throw new Error('workpaper not found');
  const edits = await listEdits(workpaperId);
  const signoffs = await listSignoffs(workpaperId);
  const contentHash = hashObject({ sections: wp.sections, version: wp.version, code: wp.code });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OTTO';
  wb.created = new Date('2026-02-01T09:00:00Z');
  wb.modified = new Date('2026-02-01T09:00:00Z');
  const info = wb.addWorksheet('Workpaper');
  info.addRow([wp.title]);
  info.addRow([`${wp.pack_id} v${wp.version} — ${wp.status} — content hash ${contentHash}`]);
  info.addRow([]);
  for (const s of wp.sections as WpSection[]) {
    info.addRow([s.title]).font = { bold: true };
    if (s.body) info.addRow([s.body]);
    if (s.table) {
      const sheet = wb.addWorksheet(s.key.slice(0, 28));
      sheet.addRow(s.table.headers).font = { bold: true };
      for (const row of s.table.rows) {
        sheet.addRow(row.cells.map((c) => String(c)));
      }
      info.addRow([`(table → sheet "${s.key.slice(0, 28)}", ${s.table.rows.length} rows)`]);
    }
    info.addRow([]);
  }
  const trail = wb.addWorksheet('Trail');
  trail.addRow(['Edits (visible modification flag)']).font = { bold: true };
  trail.addRow(['when', 'who', 'section', 'justification']);
  for (const e of edits) trail.addRow([e.edited_at, e.user_name, e.section, e.justification]);
  trail.addRow([]);
  trail.addRow(['Sign-offs']).font = { bold: true };
  for (const s of signoffs) trail.addRow([s.signed_at, s.user_name, s.sign_role]);

  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return { bytes, contentHash };
}

export async function exportWorkpaper(workpaperId: string, userId: string, format: 'pdf' | 'xlsx'): Promise<{ exportId: string; sha256: string }> {
  const wp = await getWorkpaper(workpaperId);
  if (!wp) throw new Error('workpaper not found');
  const ctx = await engagementCtx(wp.engagement_id);
  const rendered = format === 'pdf' ? await renderWorkpaperPdf(workpaperId) : await renderWorkpaperXlsx(workpaperId);
  const blob = saveBlob(rendered.bytes);
  const prev = await q<{ id: string }>(
    `select id from export_record where workpaper_id = $1 and format = $2 order by exported_at desc limit 1`,
    [workpaperId, format],
  );
  const row = await q1<{ id: string }>(
    `insert into export_record (workpaper_id, format, content_hash, supersedes_export_id, exported_by, storage_path, size_bytes)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [workpaperId, format, sha256(rendered.bytes), prev[0]?.id ?? null, userId, blob.storagePath, blob.size],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: wp.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'workpaper_exported', objectType: 'export_record', objectId: row.id,
    payload: { format, sha256: sha256(rendered.bytes), supersedes: prev[0]?.id ?? null, contentHash: rendered.contentHash },
  });
  return { exportId: row.id, sha256: sha256(rendered.bytes) };
}

export async function listExports(workpaperId: string) {
  return q<{ id: string; format: string; content_hash: string; exported_at: string; supersedes_export_id: string | null }>(
    `select id, format, content_hash, exported_at::text, supersedes_export_id
     from export_record where workpaper_id = $1 order by exported_at desc`,
    [workpaperId],
  );
}
