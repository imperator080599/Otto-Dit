// Kernel types: pure typed rows, amounts in INTEGER CENTS (no floats in audit math).
// The kernel has zero DB/network dependencies — the generator (C1b) and the app services
// import the same functions (ADR-015).

export interface GlRow {
  naturalKey: string; // journal|entryNo|lineNo
  lineNo: number;
  journalCode: string;
  journalLib?: string;
  entryNo: string;
  entryDate: string; // ISO yyyy-mm-dd
  accountNo: string;
  accountLabel?: string;
  auxNo?: string;
  auxLabel?: string;
  pieceRef?: string;
  pieceDate?: string; // ISO
  label?: string;
  debitCents: number;
  creditCents: number;
  letteringCode?: string;
  letteringDate?: string;
  validDate?: string;
  amountCcyCents?: number;
  ccy?: string;
}

export interface TbRow {
  accountNo: string;
  label: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number; // debit - credit sign convention
}

export type JeFlag =
  | 'weekend'
  | 'round_amount'
  | 'manual_journal'
  | 'period_end'
  | 'credit_note_pattern';

export interface FlaggedGlRow extends GlRow {
  flags: JeFlag[];
}

export interface Violation {
  code: string;
  severity: 'error' | 'warning';
  line?: number;
  message: string;
}

export interface SampleUnit {
  id: string; // unit identity (natural key or instance label)
  amountCents: number;
  flags?: string[];
}

export type SelectionReason = 'high_value' | 'random' | 'risk_flag';

export interface Selection {
  id: string;
  reason: SelectionReason;
  amountCents: number;
}

export interface MonetaryDrawParams {
  coverageCapCents: number; // items ≥ cap are individually selected
  randomSize: number;
  seed: string;
}

export interface MonetaryDrawResult {
  selections: Selection[];
  populationHash: string;
  populationSize: number;
  populationAmountCents: number;
  coverageAmountCents: number;
  params: MonetaryDrawParams;
}

export interface CheckResult {
  check: string; // 'amount' | 'date' | 'counterparty' | 'qty' | 'price' | 'document_present' | 'duplicate'
  expected: string;
  found: string;
  tolerance: string;
  pass: boolean;
  source?: string; // extraction field provenance ref
}

export interface InvoiceFields {
  invoiceNumber?: string;
  invoiceDate?: string; // ISO
  sellerName?: string;
  buyerName?: string;
  totalNetCents?: number;
  totalGrossCents?: number;
  vatCents?: number;
  currency?: string;
  lines?: { description?: string; qty?: number; unitPriceCents?: number; netCents?: number }[];
}

export interface DeliveryFields {
  deliveryNoteNumber?: string;
  deliveryDate?: string;
  qtyTotal?: number;
  buyerName?: string;
  invoiceRef?: string;
}
