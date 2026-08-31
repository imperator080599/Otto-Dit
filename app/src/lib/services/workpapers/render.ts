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
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { engagementCtx } from '../imports';
import { getWorkpaper, listEdits, listNotes, listSignoffs, listReplies } from './lifecycle';
import { colonnesDuPapier, cellulesDuPapier } from './colonne';
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
/**
 * LA MISE EN PAGE VIENT DE LA MÉTHODE DU CABINET (ADR-079).
 *
 * Les tailles, couleurs et marges étaient des littéraux dispersés dans ce
 * fichier, et il n'y avait ni en-tête de cabinet ni logo : le papier sortait
 * avec notre allure, pas la sienne. Or c'est LUI qui entre dans son dossier.
 */
export interface Allure {
  corps: number; titre: number; section: number; tableau: number;
  couleurTitre: [number, number, number];
  couleurTexte: [number, number, number];
  couleurDiscrete: [number, number, number];
  gauche: number; droite: number;
  cabinet: string; sousTitre: string; logo: string | null; pied: string;
}

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

  allure!: Allure;

  static async create(stamp: string, allure: Allure): Promise<PdfWriter> {
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
    w.allure = allure;
    w.newPage();
    return w;
  }

  newPage() {
    this.pageNo += 1;
    this.page = this.doc.addPage([595, 842]);
    this.y = 800;
    const a = this.allure;
    /* Le pied porte l'empreinte et le numéro de page. Il ne devient PAS
       optionnel : c'est lui qui rend un papier relisible sans OTTO. Son
       libellé, en revanche, est au cabinet. */
    const pied = a.pied ? `${a.pied} — ${this.stamp}` : this.stamp;
    this.page.drawText(assertRenderable(this.font, pied) + ` - page ${this.pageNo}`, {
      x: a.gauche, y: 16, size: 6.5, font: this.font, color: rgb(...a.couleurDiscrete),
    });
  }

  /** L'en-tête du cabinet, en tête du document. */
  async entete() {
    const a = this.allure;
    if (a.logo) {
      try {
        const brut = a.logo.split(',')[1] ?? '';
        const octets = Buffer.from(brut, 'base64');
        const img = /^data:image\/png/.test(a.logo)
          ? await this.doc.embedPng(octets) : await this.doc.embedJpg(octets);
        const h = 26;
        this.page.drawImage(img, { x: a.gauche, y: this.y - h + 8, width: (img.width / img.height) * h, height: h });
      } catch {
        /* Un logo illisible ne doit pas empêcher un papier de sortir : le
           document reste complet et l'en-tête textuel suffit. */
      }
    }
    this.text(a.cabinet, { size: a.section, bold: true, color: a.couleurTitre, gap: 0 });
    if (a.sousTitre) this.text(a.sousTitre, { size: a.corps - 1, color: a.couleurDiscrete, gap: 2 });
    this.page.drawLine({
      start: { x: a.gauche, y: this.y + 2 }, end: { x: a.droite, y: this.y + 2 },
      thickness: 0.8, color: rgb(...a.couleurTitre),
    });
    this.y -= 8;
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
    const a = this.allure;
    const size = opts.size ?? a.corps;
    const font = opts.bold ? this.bold : this.font;
    const x = a.gauche + (opts.indent ?? 0);
    for (const line of this.wrap(t, size, a.droite - x, font)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color: rgb(...(opts.color ?? a.couleurTexte)) });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 3;
  }

  heading(t: string) {
    const a = this.allure;
    this.ensure(30);
    this.y -= 6;
    this.text(t, { size: a.section, bold: true, color: a.couleurTitre, gap: 2 });
    this.page.drawLine({ start: { x: a.gauche, y: this.y + 2 }, end: { x: a.droite, y: this.y + 2 }, thickness: 0.6, color: rgb(0.75, 0.8, 0.86) });
    this.y -= 6;
  }
}

export async function renderWorkpaperPdf(workpaperId: string): Promise<{ bytes: Uint8Array; contentHash: string }> {
  const wp = await getWorkpaper(workpaperId);
  if (!wp) throw new Error('workpaper not found');
  const edits = await listEdits(workpaperId);
  const notes = await listNotes(workpaperId);
  /* Les colonnes AJOUTÉES au modèle (ADR-099) sortent dans l'export : un
     export qui tairait une colonne visible à l'écran serait un document
     différent de celui que le réviseur a relu. */
  const colonnesX = (await colonnesDuPapier(wp.engagement_id, wp.code)).filter((c) => c.statut === 'remplie');
  const cellulesX = new Map(
    (await cellulesDuPapier(wp.engagement_id, wp.code)).map((c) => [`${c.column_id}|${c.sample_item_id}`, c]),
  );
  const signoffs = await listSignoffs(workpaperId);
  const eng = await q1<{ name: string; entity: string; period: string }>(
    `select e.name, en.name entity, p.label period from engagement e
     join entity en on en.id = e.entity_id join period p on p.id = e.period_id where e.id = $1`,
    [wp.engagement_id],
  );
  const contentHash = hashObject({ sections: wp.sections, version: wp.version, code: wp.code });
  /* Le tampon porte la RÉFÉRENCE du cabinet en plus du code : c'est ce qu'un
     réviseur cherche dans un dossier. La version et l'empreinte restent :
     elles font l'auto-portance. */
  const stamp = `${wp.reference ?? wp.code} - ${wp.code} v${wp.version} - hash ${contentHash.slice(0, 16)}`;

  const cat = await catalogueDeLaMission(wp.engagement_id);
  const m = cat.papier.miseEnPage;
  const e = cat.papier.entete;
  const allure: Allure = {
    corps: m.corps_pt, titre: m.titre_pt, section: m.section_pt, tableau: m.tableau_pt,
    couleurTitre: m.couleur_titre, couleurTexte: m.couleur_texte, couleurDiscrete: m.couleur_discrete,
    gauche: m.marge_gauche, droite: m.marge_droite,
    cabinet: e.cabinet, sousTitre: e.sous_titre ?? '', logo: e.logo_data_uri ?? null, pied: e.pied ?? '',
  };
  const w = await PdfWriter.create(stamp, allure);
  await w.entete();

  w.text(eng.entity + ' - ' + eng.period, { size: allure.corps, color: allure.couleurDiscrete });
  w.text(`${wp.reference ? wp.reference + ' — ' : ''}${wp.title}`, { size: allure.titre, bold: true, gap: 2 });
  w.text(`${wp.pack_id} - v${wp.version} - ${wp.status.toUpperCase()}`, { size: allure.corps - 1, color: allure.couleurDiscrete, gap: 4 });
  // Attribution comes from the pack (ADR-012.4), never from the renderer: an English SOX
  // workpaper must not carry French chrome, and vice versa.
  const pack = getAssurancePack(wp.pack_id);
  const fr = pack.language === 'fr';
  /* Les mentions d'attribution viennent du GABARIT DU CABINET (ADR-079) : ce
     sont ses mots, sur son papier. Le pack ne porte plus que la langue. */
  const mentions = cat.papier.mentions;
  w.text(
    `${mentions.etabli_par} ${wp.engine_run_id ?? '-'} (${fr ? 'empreinte du dossier' : 'facts hash'} ${wp.based_on_hash?.slice(0, 20) ?? '-'}). ` +
    (signoffs.length
      ? `${mentions.valide_par} : ` + signoffs.map((s) => `${s.user_name} (${s.sign_role}, ${s.signed_at.slice(0, 10)})`).join(' ; ')
      : fr ? 'NON VALIDE - projet.' : 'NOT VALIDATED - draft.'),
    { size: allure.corps - 1, color: [0.35, 0.25, 0.55], gap: 6 },
  );
  if (edits.length > 0) {
    w.text(
      fr
        ? `DOCUMENT MODIFIE MANUELLEMENT - ${edits.length} modification(s) justifiee(s), voir annexe.`
        : `MANUALLY MODIFIED - ${edits.length} justified modification(s), see appendix.`,
      { size: allure.corps - 1, bold: true, color: [0.6, 0.4, 0.05], gap: 6 },
    );
  }

  for (const s of wp.sections as WpSection[]) {
    w.heading(s.title);
    if (s.body) w.text(s.body, { size: allure.corps });
    if (s.table) {
      w.text(s.table.headers.join('  |  '), { size: allure.tableau, bold: true, gap: 2 });
      /* Les premières colonnes tiennent sur une ligne, les suivantes passent
         en détail. Le point de coupe suit le NOMBRE de colonnes du cabinet :
         il était figé à 5, donc un gabarit à trois colonnes aurait tout mis
         sur une ligne et un gabarit à douze aurait débordé. */
      const enTete = Math.min(5, Math.max(2, Math.ceil(s.table.headers.length / 2)));
      for (const row of s.table.rows) {
        const main = row.cells.slice(0, enTete).map(String).join('  |  ');
        w.text('- ' + main, { size: allure.corps - 1, bold: true, indent: 4, gap: 0 });
        const rest = row.cells.slice(enTete).map(String);
        for (const [i, cell] of rest.entries()) {
          if (!cell) continue;
          w.text(`${s.table.headers[enTete + i] ?? ''}: ${cell}`, { size: allure.tableau, indent: 14, gap: 0 });
        }
        if (s.key === 'tableau_echantillon' && row.refs?.sampleItemId) {
          for (const cx of colonnesX) {
            const cel = cellulesX.get(`${cx.id}|${row.refs.sampleItemId}`);
            if (!cel) continue;
            const val = cel.outcome === 'trouvee'
              ? `${cel.valeur}${cel.verifie ? '' : (fr ? ' [A VERIFIER]' : ' [TO VERIFY]')}`
              : (fr ? 'absente des pieces recues' : 'not in received evidence')
                + (cel.clarification_request_item_id ? (fr ? ' (clarification proposee)' : ' (clarification proposed)') : '');
            w.text(`${cx.titre} (${fr ? 'colonne ajoutee' : 'added column'}): ${val}`, { size: allure.tableau, indent: 14, gap: 0 });
          }
        }
        if (row.refs?.evidenceIds?.length) {
          w.text(`refs evidence: ${row.refs.evidenceIds.map((x) => x.slice(0, 8)).join(', ')}`, { size: 6.5, indent: 14, color: [0.5, 0.55, 0.62], gap: 1 });
        }
        w.y -= 2;
      }
    }
  }

  // ---------- self-contained appendix (ADR-013) ----------
  // Les intitulés d'annexes viennent du GABARIT DU CABINET (ADR-079), comme le corps.
  // Ils sont typés nommément : lire `parameters` au lieu de `parametres` rendait
  // `undefined` et faisait échouer l'export loin de la cause.
  const ap = cat.papier.annexes;
  w.newPage();
  w.heading(ap.parametres);
  /* Deux vocabulaires cohabitent : le papier substantif suit les blocs NOMMÉS
     par le gabarit du cabinet (« methode »), le papier d'efficacité SOX suit
     les clés du pack, gelé (« method »). Chercher une seule des deux aurait
     vidé l'annexe A de l'autre — sans erreur, juste sans paramètres. */
  const method = (wp.sections as WpSection[]).find((s) => s.key === 'methode' || s.key === 'method');
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
  for (const cx of colonnesX) {
    w.text(
      (fr ? 'Colonne ajoutee au modele standard : ' : 'Column added to the standard template: ')
      + `"${cx.titre}" - ${fr ? 'justification' : 'justification'} : ${cx.justification}`,
      { size: 7.5, gap: 1 },
    );
  }
  if (edits.length === 0 && colonnesX.length === 0) w.text(fr ? 'Aucune.' : 'None.', { size: 8 });
  for (const e of edits) {
    w.text(`${e.edited_at.slice(0, 16)} - ${e.user_name} - section ${e.section} - ${fr ? 'justification' : 'justification'} : ${e.justification}`, { size: 7.5, gap: 1 });
  }

  w.heading(ap.reviewNotes);
  if (notes.length === 0) w.text(fr ? 'Aucune.' : 'None.', { size: 8 });
  for (const n of notes) {
    const dest = n.assignee_kind === 'otto' ? 'OTTO' : n.assignee_name;
    const ancre = n.anchor_label ? ` [${n.anchor_label}]` : '';
    w.text(`[${n.status} | ${n.note_type}] ${n.author_name}${dest ? ' -> ' + dest : ''}${ancre} : ${n.text}`, { size: 7.5, gap: 1 });
    /* Les RÉPONSES entrent au dossier — celle d'OTTO surtout : chaque
       instruction donnée à la machine reste documentée dans l'export. */
    for (const r of await listReplies(n.id)) {
      w.text(`    ↳ ${r.author_kind === 'otto' ? 'OTTO' : r.author_name} : ${r.text}`, { size: 7, gap: 1 });
    }
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
