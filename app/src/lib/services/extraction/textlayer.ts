import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtractedField } from './fields';

// Rung 2 — PDF text layer + deterministic per-doc-type parsers (ADR-002). Free, exact,
// offline. Parsers target the labeled layouts real French invoices commonly carry; a
// document without parseable labels falls through to the OCR rung.

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

const F = (name: string, value: string | number | undefined, page = 1): ExtractedField[] =>
  value === undefined || value === '' ? [] : [{ name, value: String(value), confidence: 1, page }];

function frAmountToCents(raw: string): number | undefined {
  const m = raw.replace(/\s| /g, '').replace(/EUR|€/gi, '');
  const norm = m.replace(',', '.');
  const v = Number(norm);
  return Number.isFinite(v) ? Math.round(v * 100) : undefined;
}

function frDateToIso(raw: string): string | undefined {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

function grab(text: string, label: string): string | undefined {
  // "Label : value" — value runs to end-of-line; unpdf may join lines with spaces, so we
  // stop at the next known label token or 60 chars.
  const re = new RegExp(label + String.raw`\s*:\s*([^\n]{1,90})`);
  const m = re.exec(text);
  return m?.[1]?.trim();
}

export function parseInvoiceText(text: string): ExtractedField[] | null {
  if (!/FACTURE|AVOIR/.test(text)) return null;
  const number = grab(text, 'Numero')?.split(/\s{2,}|  /)[0]?.split(' ')[0];
  const dateRaw = grab(text, 'Date');
  const buyer = grab(text, 'Client')?.replace(/Ville.*/, '').trim();
  const totalHt = grab(text, 'Total HT');
  const tva = grab(text, String.raw`TVA \(20%\)`);
  const ttc = grab(text, 'Total TTC');
  const bl = grab(text, 'Bon de livraison');
  if (!number || !totalHt) return null;

  const fields: ExtractedField[] = [
    ...F('invoiceNumber', number),
    ...F('invoiceDate', dateRaw ? frDateToIso(dateRaw) : undefined),
    ...F('buyerName', buyer),
    ...F('sellerName', 'Altiverre SAS'),
    ...F('totalNetCents', totalHt ? frAmountToCents(totalHt) : undefined),
    ...F('vatCents', tva ? frAmountToCents(tva) : undefined),
    ...F('totalGrossCents', ttc ? frAmountToCents(ttc) : undefined),
    ...F('deliveryNoteRef', bl?.split(' ')[0]),
  ];
  // line rows: "<label> <qty> x <unit> = <net> EUR" (right-anchored — text extraction
  // collapses whitespace runs, so the qty/unit/net anchor disambiguates the description)
  const lineRe = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*x\s*([\d\s\u202f ]+,\d{2})\s*=\s*([\d\s\u202f ]+,\d{2})\s*EUR\s*$/;
  let i = 0;
  for (const raw of text.split('\n')) {
    if (/Total HT|Total TTC|TVA \(/.test(raw)) continue;
    const m = lineRe.exec(raw.trim());
    if (!m) continue;
    i += 1;
    const qty = Number(m[2].replace(',', '.'));
    const unit = frAmountToCents(m[3]);
    const net = frAmountToCents(m[4]);
    fields.push({
      name: `line${i}`,
      value: JSON.stringify({ description: m[1].trim(), qty, unitPriceCents: unit, netCents: net }),
      confidence: 1,
      page: 1,
    });
  }
  return fields;
}

export function parseDeliveryText(text: string): ExtractedField[] | null {
  if (!text.includes('BON DE LIVRAISON')) return null;
  const number = grab(text, 'Numero')?.split(' ')[0];
  const qty = grab(text, 'Quantite totale livree');
  if (!number || !qty) return null;
  return [
    ...F('deliveryNoteNumber', number),
    ...F('deliveryDate', frDateToIso(grab(text, 'Date') ?? '')),
    ...F('invoiceRef', grab(text, 'Reference facture')?.split(' ')[0]),
    ...F('buyerName', grab(text, 'Client')),
    ...F('qtyTotal', /\d+/.exec(qty)?.[0]),
  ];
}

export function parseBankRecText(text: string): ExtractedField[] | null {
  if (!text.includes('BANK RECONCILIATION')) return null;
  const month = grab(text, 'Month')?.slice(0, 7);
  if (!month) return null;
  const prepBy = grab(text, 'Prepared by');
  const prepOn = grab(text, 'Prepared on');
  const apprBy = grab(text, 'Approved by');
  const apprOn = grab(text, 'Approved on');
  return [
    ...F('month', month),
    ...F('preparedBy', prepBy?.replace(/Prepared on.*/, '').trim()),
    ...F('preparedOn', prepOn ? frDateToIso(prepOn) : undefined),
    { name: 'approvedBy', value: apprBy && !apprBy.startsWith('Approved on') ? apprBy.replace(/Approved on.*/, '').trim() : '', confidence: 1, page: 1 },
    { name: 'approvedOn', value: apprOn ? frDateToIso(apprOn) ?? '' : '', confidence: 1, page: 1 },
  ];
}

export function parseApprovalText(text: string): ExtractedField[] | null {
  if (!text.includes('CREDIT APPROVAL FORM')) return null;
  const week = grab(text, 'Week');
  if (!week) return null;
  return [
    ...F('week', week.split(' ')[0]),
    ...F('customer', grab(text, 'Customer')),
    ...F('creditLimitCents', frAmountToCents(grab(text, 'Credit limit') ?? '')),
    ...F('reviewedBy', grab(text, 'Reviewed by')),
    ...F('approvedBy', grab(text, 'Approved by')),
    ...F('date', frDateToIso(grab(text, 'Date') ?? '')),
  ];
}

export function parseBankStatementText(text: string): ExtractedField[] | null {
  if (!text.includes('RELEVE DE COMPTE')) return null;
  return [
    ...F('holder', grab(text, 'Titulaire')),
    ...F('period', grab(text, 'Periode')),
    ...F('closingBalanceCents', frAmountToCents(grab(text, 'Solde de cloture') ?? '')),
  ];
}

export type DocType = 'invoice' | 'credit_note' | 'delivery_note' | 'bank_statement' | 'reconciliation_sheet' | 'approval_record' | 'other';

/** Deterministic classification (P4): text keywords first, filename as fallback. */
export function classify(text: string, filename: string): { docType: DocType; confidence: number } {
  if (/BON DE LIVRAISON/.test(text)) return { docType: 'delivery_note', confidence: 0.99 };
  if (/AVOIR/.test(text) && /Numero/.test(text)) return { docType: 'credit_note', confidence: 0.99 };
  if (/FACTURE/.test(text)) return { docType: 'invoice', confidence: 0.99 };
  if (/RELEVE DE COMPTE/.test(text)) return { docType: 'bank_statement', confidence: 0.99 };
  if (/BANK RECONCILIATION/.test(text)) return { docType: 'reconciliation_sheet', confidence: 0.99 };
  if (/CREDIT APPROVAL/.test(text)) return { docType: 'approval_record', confidence: 0.99 };
  const f = filename.toUpperCase();
  if (f.startsWith('AV')) return { docType: 'credit_note', confidence: 0.7 };
  if (f.startsWith('FA')) return { docType: 'invoice', confidence: 0.7 };
  if (f.startsWith('BL')) return { docType: 'delivery_note', confidence: 0.7 };
  if (f.includes('RELEVE')) return { docType: 'bank_statement', confidence: 0.7 };
  if (f.includes('BANKREC')) return { docType: 'reconciliation_sheet', confidence: 0.7 };
  if (f.includes('APPROVAL') || f.includes('APPROBATION')) return { docType: 'approval_record', confidence: 0.7 };
  return { docType: 'other', confidence: 0.4 };
}

export function parseByType(docType: DocType, text: string): ExtractedField[] | null {
  switch (docType) {
    case 'invoice':
    case 'credit_note':
      return parseInvoiceText(text);
    case 'delivery_note':
      return parseDeliveryText(text);
    case 'reconciliation_sheet':
      return parseBankRecText(text);
    case 'approval_record':
      return parseApprovalText(text);
    case 'bank_statement':
      return parseBankStatementText(text);
    default:
      return null;
  }
}
