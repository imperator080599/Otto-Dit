import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { ENTITY } from './config';
import type { SalesInvoice } from './ledger';

// Evidence PDF renderers. Layouts use unambiguous "Label : value" lines so the S5
// text-layer rung parses them deterministically. Metadata pinned for byte-identical
// regeneration (ADR-008). All companies/IBANs fictional.

const FIXED_DATE = new Date('2026-01-15T09:00:00Z');

async function newDoc(): Promise<{ doc: PDFDocument; font: PDFFont; bold: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('OTTO synthetic dataset generator');
  doc.setCreator('OTTO (fictional data)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

function fmtFr(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${euros},${String(abs % 100).padStart(2, '0')} EUR`;
}

function frDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

class Writer {
  y: number;
  constructor(public page: PDFPage, public font: PDFFont, public bold: PDFFont, startY = 800) {
    this.y = startY;
  }
  line(text: string, opts: { size?: number; bold?: boolean; x?: number; gap?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    this.page.drawText(text, {
      x: opts.x ?? 50,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.12, 0.16),
    });
    this.y -= opts.gap ?? size + 6;
  }
  gap(h = 10) {
    this.y -= h;
  }
  rule() {
    this.page.drawLine({
      start: { x: 50, y: this.y + 4 },
      end: { x: 545, y: this.y + 4 },
      thickness: 0.7,
      color: rgb(0.6, 0.65, 0.72),
    });
    this.y -= 10;
  }
}

function sellerBlock(w: Writer) {
  w.line(ENTITY.name, { bold: true, size: 12 });
  w.line(ENTITY.address, { size: 9 });
  w.line(`SIREN : ${ENTITY.siren} — TVA : ${ENTITY.vat}`, { size: 9 });
  w.line('Document fictif — données synthétiques (démo OTTO)', { size: 7.5, color: [0.55, 0.35, 0.1] });
  w.gap(6);
}

export async function renderInvoicePdf(inv: SalesInvoice): Promise<Uint8Array> {
  const { doc, font, bold } = await newDoc();
  const page = doc.addPage([595, 842]);
  const w = new Writer(page, font, bold);
  sellerBlock(w);
  w.line(inv.isCreditNote ? 'AVOIR' : 'FACTURE', { bold: true, size: 18, gap: 26 });
  w.line(`Numero : ${inv.number}`, { bold: true, size: 11 });
  w.line(`Date : ${frDate(inv.date)}`);
  w.line(`Client : ${inv.customer.name}`);
  w.line(`Ville : ${inv.customer.city}`);
  if (inv.deliveryNote) w.line(`Bon de livraison : ${inv.deliveryNote.number}`);
  w.gap(8);
  w.rule();
  w.line('Designation', { bold: true, size: 9.5 });
  for (const l of inv.lines) {
    const unit = (l.unitPriceCents / 100).toFixed(2).replace('.', ',');
    const net = fmtFr(l.netCents);
    w.line(`${l.label}   ${l.qty} x ${unit} = ${net}`, { size: 9.5 });
  }
  w.rule();
  w.gap(4);
  w.line(`Total HT : ${fmtFr(inv.totalNetCents)}`, { bold: true, size: 11 });
  w.line(`TVA (20%) : ${fmtFr(inv.vatCents)}`, { size: 10 });
  w.line(`Total TTC : ${fmtFr(inv.ttcCents)}`, { bold: true, size: 12 });
  w.gap(12);
  w.line(inv.isCreditNote
    ? 'Avoir a valoir sur vos prochaines commandes.'
    : 'Conditions de reglement : 45 jours date de facture.', { size: 9 });
  return doc.save({ useObjectStreams: false });
}

export async function renderDeliveryNotePdf(inv: SalesInvoice): Promise<Uint8Array> {
  const { doc, font, bold } = await newDoc();
  const page = doc.addPage([595, 842]);
  const w = new Writer(page, font, bold);
  sellerBlock(w);
  const dn = inv.deliveryNote!;
  w.line('BON DE LIVRAISON', { bold: true, size: 18, gap: 26 });
  w.line(`Numero : ${dn.number}`, { bold: true, size: 11 });
  w.line(`Date : ${frDate(dn.date)}`);
  w.line(`Client : ${inv.customer.name}`);
  w.line(`Reference facture : ${inv.number}`);
  w.gap(8);
  w.rule();
  for (const l of inv.lines) {
    w.line(`${l.label}`, { size: 9.5 });
  }
  w.rule();
  w.line(`Quantite totale livree : ${dn.qtyPrinted}`, { bold: true, size: 11 });
  w.gap(16);
  w.line('Recu par le client (signature) : S. Marchand', { size: 9 });
  return doc.save({ useObjectStreams: false });
}

export interface BankStatementSpec {
  label: string; // "Décembre 2025"
  periodStart: string;
  periodEnd: string;
  openingCents: number;
  movements: { date: string; label: string; debitCents?: number; creditCents?: number }[];
}

export async function renderBankStatementPdf(spec: BankStatementSpec): Promise<Uint8Array> {
  const { doc, font, bold } = await newDoc();
  const page = doc.addPage([595, 842]);
  const w = new Writer(page, font, bold);
  w.line('Banque Lyonnaise de Credit (etablissement fictif)', { bold: true, size: 12 });
  w.line('IBAN : FR76 9999 8888 7777 6666 5555 444 (fictif)', { size: 9 });
  w.line('Document fictif — donnees synthetiques (demo OTTO)', { size: 7.5, color: [0.55, 0.35, 0.1] });
  w.gap(8);
  w.line('RELEVE DE COMPTE', { bold: true, size: 16, gap: 24 });
  w.line(`Titulaire : ${ENTITY.name}`);
  w.line(`Periode : ${frDate(spec.periodStart)} au ${frDate(spec.periodEnd)}`);
  w.line(`Solde d'ouverture : ${fmtFr(spec.openingCents)}`, { bold: true });
  w.gap(6);
  w.rule();
  let solde = spec.openingCents;
  for (const m of spec.movements) {
    solde += (m.creditCents ?? 0) - (m.debitCents ?? 0);
    const amt = m.creditCents ? `+${fmtFr(m.creditCents)}` : `-${fmtFr(m.debitCents ?? 0)}`;
    w.line(`${frDate(m.date)}  ${m.label}  ${amt}`, { size: 9 });
  }
  w.rule();
  w.line(`Solde de cloture : ${fmtFr(solde)}`, { bold: true, size: 11 });
  return doc.save({ useObjectStreams: false });
}

export interface BankRecSpec {
  month: string; // '2025-03'
  preparedBy: string;
  preparedOn: string;
  approvedBy?: string;
  approvedOn?: string;
  bankBalanceCents: number;
  glBalanceCents: number;
  reconcilingItems: { label: string; amountCents: number }[];
}

export async function renderBankRecPdf(spec: BankRecSpec): Promise<Uint8Array> {
  const { doc, font, bold } = await newDoc();
  const page = doc.addPage([595, 842]);
  const w = new Writer(page, font, bold);
  w.line(`${ENTITY.name} — Meridian Industrial Group (fictional)`, { bold: true, size: 11 });
  w.line('Fictional document — synthetic data (OTTO demo)', { size: 7.5, color: [0.55, 0.35, 0.1] });
  w.gap(8);
  w.line('MONTHLY BANK RECONCILIATION', { bold: true, size: 15, gap: 22 });
  w.line(`Month : ${spec.month}`, { bold: true, size: 11 });
  w.line(`Account : 512100 — Banque Lyonnaise de Credit (fictive)`);
  w.gap(6);
  w.line(`Balance per bank statement : ${fmtFr(spec.bankBalanceCents)}`);
  w.line(`Balance per general ledger : ${fmtFr(spec.glBalanceCents)}`);
  w.rule();
  w.line('Reconciling items :', { bold: true });
  for (const it of spec.reconcilingItems) {
    w.line(`- ${it.label} : ${fmtFr(it.amountCents)}`, { size: 9.5 });
  }
  if (spec.reconcilingItems.length === 0) w.line('- none', { size: 9.5 });
  w.rule();
  w.gap(10);
  w.line(`Prepared by : ${spec.preparedBy}`);
  w.line(`Prepared on : ${frDate(spec.preparedOn)}`);
  w.line(`Approved by : ${spec.approvedBy ?? ''}`);
  w.line(`Approved on : ${spec.approvedOn ? frDate(spec.approvedOn) : ''}`);
  w.gap(14);
  w.line('Signatures on file (fictional).', { size: 8.5 });
  return doc.save({ useObjectStreams: false });
}

export interface ApprovalSpec {
  ref: string; // 'CA-2025-W14'
  week: string;
  customer: string;
  creditLimitCents: number;
  reviewedBy: string;
  approvedBy: string;
  date: string;
  unlabeled?: boolean; // scanned-note style without machine-readable labels (OCR demo)
}

export async function renderApprovalPdf(spec: ApprovalSpec): Promise<Uint8Array> {
  const { doc, font, bold } = await newDoc();
  const page = doc.addPage([595, 842]);
  const w = new Writer(page, font, bold);
  w.line(`${ENTITY.name}`, { bold: true, size: 11 });
  w.line('Fictional document — synthetic data (OTTO demo)', { size: 7.5, color: [0.55, 0.35, 0.1] });
  w.gap(8);
  if (spec.unlabeled) {
    // deliberately unstructured (simulates a scanned handwritten note): the text-layer
    // parser finds no labels ⇒ ladder falls through to the OCR adapter (mock fixture).
    w.line('Approbation credit', { bold: true, size: 14, gap: 22 });
    w.line(`${spec.week} — ${spec.customer}`, { size: 10 });
    w.line(`limite ${fmtFr(spec.creditLimitCents)} ok`, { size: 10 });
    w.line(`${spec.reviewedBy} / ${spec.approvedBy}`, { size: 10 });
    w.line(`${frDate(spec.date)}`, { size: 10 });
  } else {
    w.line('CREDIT APPROVAL FORM', { bold: true, size: 15, gap: 22 });
    w.line(`Reference : ${spec.ref}`, { bold: true });
    w.line(`Week : ${spec.week}`);
    w.line(`Customer : ${spec.customer}`);
    w.line(`Credit limit : ${fmtFr(spec.creditLimitCents)}`);
    w.line(`Reviewed by : ${spec.reviewedBy}`);
    w.line(`Approved by : ${spec.approvedBy}`);
    w.line(`Date : ${frDate(spec.date)}`);
  }
  return doc.save({ useObjectStreams: false });
}
