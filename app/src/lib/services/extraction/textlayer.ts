import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtractedField } from './fields';
import { DATE_ORDER_MARKERS, DOC_TYPE_KEYWORDS, INVOICE_LABELS, REQUIRED_FIELDS, type DateOrder, type FieldLabels } from '@/lib/packs/labels';

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
  // the issuer is the first standalone header line — reading it beats hardcoding one
  // seller, which the ADR-018 eval corpus (six fictional issuers) would score as a
  // confident wrong value on every document
  const seller = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 2 && !l.includes(':') && !/^(FACTURE|AVOIR)$/i.test(l) && !/SPECIMEN/i.test(l));

  const fields: ExtractedField[] = [
    ...F('invoiceNumber', number),
    ...F('invoiceDate', dateRaw ? frDateToIso(dateRaw) : undefined),
    ...F('buyerName', buyer),
    ...F('sellerName', seller),
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

// ─────────────────────────────────────────────────────────────────────────────
// Generic label-driven reader (ADR-021). One code path; the languages it covers are
// data in packs/labels.ts. It abstains rather than guesses — an ambiguous date is left
// unread so the document escalates to the layout-agnostic rung, exactly as the model
// abstains on the same input.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y',
};

/** Length-PRESERVING fold: accents flattened, punctuation turned into spaces, lowercased.
 *  Length matters — the reader slices the original line at an offset found in the folded
 *  one, so a fold that changes length silently misreads every accented label. */
function fold(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) {
    if (ACCENTS[ch]) out += ACCENTS[ch];
    else if ('.\'\u2019-_/'.includes(ch)) out += ' ';
    else out += ch;
  }
  return out;
}

/** "1 234,56" / "1.234,56" / "1,234.56" → cents. Returns undefined when the grouping and
 *  decimal separators cannot be told apart. */
export function amountToCents(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return undefined;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');       // 1.234,56
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');                          // 1,234.56
  } else {
    return undefined;
  }
  const v = Number(normalized);
  return Number.isFinite(v) ? Math.round(v * 100) : undefined;
}

/** Reads a date only when the order is unambiguous. dd/mm vs mm/dd with both parts ≤ 12
 *  is undecidable from the page alone, so it abstains (ADR-021). */
export function dateToIso(raw: string, order: DateOrder = 'unknown'): string | undefined {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(raw);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const iso2 = (d: number, mo: number) =>
    d >= 1 && d <= 31 && mo >= 1 && mo <= 12
      ? `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : undefined;
  // the numbers themselves settle it when one part cannot be a month
  if (a > 12 && b <= 12) return iso2(a, b);
  if (b > 12 && a <= 12) return iso2(b, a);
  // otherwise only the document's own language may settle it
  if (order === 'dmy') return iso2(a, b);
  if (order === 'mdy') return iso2(b, a);
  return undefined; // ambiguous and unattributable → abstain, never guess
}

/** Which date order the document's own wording implies. Unanimous evidence only: if both
 *  families of markers appear, the document does not settle it and the reader abstains. */
export function detectDateOrder(text: string): DateOrder {
  const folded = fold(text);
  const hit = (words: string[]) => words.some((w) => folded.includes(fold(w)));
  const dmy = hit(DATE_ORDER_MARKERS.dmy);
  const mdy = hit(DATE_ORDER_MARKERS.mdy);
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return 'unknown';
}

const isWordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

/** Word-boundary search. Substring matching is not good enough here: the German VAT label
 *  `ust` occurs inside `Customer`, and a dictionary that reads a buyer name as a VAT
 *  amount is worse than one that reads nothing. Boundaries are the difference between a
 *  dictionary that scales and one that rots as entries accumulate (ADR-021). */
function findLabel(folded: string, label: string): number {
  const needle = fold(label);
  let from = 0;
  for (;;) {
    const at = folded.indexOf(needle, from);
    if (at === -1) return -1;
    const before = at === 0 ? undefined : folded[at - 1];
    const after = folded[at + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return at;
    from = at + 1;
  }
}

function readLabel(text: string, spec: FieldLabels): string | undefined {
  const lines = text.split('\n').map((l) => [l, fold(l)] as const);
  // Label priority is DOCUMENT-wide, not per line: the most specific label wins wherever
  // it sits on the page. Scanning line-first instead lets the generic `Total` on the
  // `Total HT` line claim the gross amount before `Total TTC` is ever tried.
  const labels = [...spec.labels].sort((a, b) => b.length - a.length);
  for (const label of labels) {
    for (const [line, folded] of lines) {
      const at = findLabel(folded, label);
      if (at === -1) continue;
      const after = line.slice(at + label.length);
      const sep = after.search(/[:=]/);
      if (sep === -1) continue;
      const value = after.slice(sep + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

/** Reads a document from the label dictionary. Returns null unless EVERY required field
 *  for the type resolves — a partial read would cost recall the model rung already has. */
export function parseByLabels(docType: DocType, text: string): ExtractedField[] | null {
  const required = REQUIRED_FIELDS[docType];
  if (!required) return null;
  const order = detectDateOrder(text);
  const specs = INVOICE_LABELS;
  const out: ExtractedField[] = [];
  for (const spec of specs) {
    const raw = readLabel(text, spec);
    if (raw === undefined) continue;
    let value: string | undefined;
    if (spec.kind === 'amount') {
      const c = amountToCents(raw);
      value = c === undefined ? undefined : String(c);
    } else if (spec.kind === 'date') {
      value = dateToIso(raw, order);
    } else {
      value = raw.replace(/\s{2,}.*$/, '').trim() || undefined;
    }
    if (value !== undefined) out.push({ name: spec.field, value, confidence: 1, page: 1 });
  }
  const seller = text.split('\n').map((l) => l.trim())
    .find((l) => l.length > 2 && !l.includes(':') && !/SPECIMEN/i.test(l) && !DOC_TYPE_KEYWORDS.some((k) => k.words.includes(fold(l))));
  if (seller) out.push({ name: 'sellerName', value: seller, confidence: 1, page: 1 });
  const got = new Set(out.map((f) => f.name));
  return required.every((f) => got.has(f)) ? out : null;
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
  // multilingual content keywords (ADR-021): data, so a new language is a dictionary entry
  const folded = fold(text);
  for (const k of DOC_TYPE_KEYWORDS) {
    if (k.words.some((w) => folded.includes(w))) return { docType: k.docType, confidence: 0.9 };
  }
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
      // the existing layout parser first (it also reads line items), then the generic
      // dictionary reader; anything neither resolves escalates to the model rung
      return parseInvoiceText(text) ?? parseByLabels(docType, text);
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
