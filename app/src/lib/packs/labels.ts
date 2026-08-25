// ADR-021 — the label dictionary. This file is CONTENT, not code: adding a language or a
// vendor's wording means adding strings here, never a new parser. That is the whole point.
//
// The deterministic rung is allowed to grow only along this axis. A per-layout parser is
// O(layouts) of code and does not survive layouts → ∞; a dictionary is O(layouts) of data
// with one code path, and anything it cannot resolve escalates to the layout-agnostic rung.

import type { DocType } from '@/lib/services/extraction/textlayer';

export type ValueKind = 'text' | 'date' | 'amount' | 'int';

export interface FieldLabels {
  field: string;
  kind: ValueKind;
  /** Accent-insensitive, case-insensitive; matched as a label before ':' or '='. */
  labels: string[];
}

/** Invoice / credit note. Synonyms across fr, de, es, it, en. */
export const INVOICE_LABELS: FieldLabels[] = [
  {
    field: 'invoiceNumber', kind: 'text',
    labels: [
      'numero', 'numero de facture', 'n de facture', 'no de facture', 'facture n',
      'rechnungsnummer', 'rechnung nr', 'numero de factura', 'numero fattura',
      'invoice number', 'invoice no', 'invoice #',
    ],
  },
  {
    field: 'invoiceDate', kind: 'date',
    labels: [
      'date', "date d'emission", 'date de facture', 'rechnungsdatum', 'datum',
      'fecha', 'fecha de factura', 'data', 'data fattura', 'invoice date',
    ],
  },
  {
    field: 'buyerName', kind: 'text',
    labels: [
      'client', 'destinataire', 'kunde', 'kundenname', 'cliente', 'customer',
      'bill to', 'sold to',
    ],
  },
  {
    field: 'totalNetCents', kind: 'amount',
    labels: [
      'total ht', 'montant ht', 'nettobetrag', 'netto', 'base imponible', 'imponibile',
      'net amount', 'subtotal', 'net total',
    ],
  },
  {
    field: 'vatCents', kind: 'amount',
    labels: [
      'tva', 't v a', 'mwst', 'ust', 'iva', 'vat', 'sales tax',
    ],
  },
  {
    field: 'totalGrossCents', kind: 'amount',
    labels: [
      'total ttc', 'net a payer', 'gesamtbetrag', 'bruttobetrag', 'total', 'totale',
      'total due', 'amount due', 'grand total',
    ],
  },
];

export type DateOrder = 'dmy' | 'mdy' | 'unknown';

/** Wording that reveals the document's date convention. Distinctive terms only, and the
 *  evidence must be unanimous: 05/03/2025 is a different day in Lyon and in Chicago, so a
 *  document showing both families of wording is left to the model rung (ADR-021). */
export const DATE_ORDER_MARKERS: Record<'dmy' | 'mdy', string[]> = {
  dmy: [
    'facture', 'rechnung', 'factura', 'fattura', 'total ht', 'montant ht', 'nettobetrag',
    'gesamtbetrag', 'base imponible', 'imponibile', "date d'emission", 'rechnungsdatum',
    'net a payer', 'total ttc', 'destinataire', 'kunde', 'cliente',
  ],
  mdy: ['invoice number', 'invoice date', 'net amount', 'total due', 'bill to', 'sold to'],
};

/** Document classification by content keyword, per language. Content, not code. */
export const DOC_TYPE_KEYWORDS: { docType: DocType; words: string[] }[] = [
  { docType: 'delivery_note', words: ['bon de livraison', 'lieferschein', 'albaran', 'documento di trasporto', 'delivery note', 'packing slip'] },
  { docType: 'credit_note', words: ['avoir', 'note de credit', 'gutschrift', 'nota de credito', 'nota di credito', 'credit note'] },
  { docType: 'invoice', words: ['facture', 'rechnung', 'factura', 'fattura', 'invoice'] },
  { docType: 'bank_statement', words: ['releve de compte', 'kontoauszug', 'extracto de cuenta', 'estratto conto', 'bank statement', 'account statement'] },
  { docType: 'reconciliation_sheet', words: ['bank reconciliation', 'rapprochement bancaire', 'kontenabstimmung'] },
  { docType: 'approval_record', words: ['credit approval', 'approbation', 'genehmigung', 'aprobacion', 'approval form'] },
];

/** Fields a document type must resolve before the deterministic rung may claim it.
 *  A partial deterministic read would silently cost recall the model rung already has —
 *  so it is all of them, or escalate (ADR-021). */
export const REQUIRED_FIELDS: Partial<Record<DocType, string[]>> = {
  invoice: ['invoiceNumber', 'invoiceDate', 'buyerName', 'totalNetCents', 'vatCents', 'totalGrossCents'],
  credit_note: ['invoiceNumber', 'invoiceDate', 'buyerName', 'totalNetCents', 'vatCents', 'totalGrossCents'],
};
