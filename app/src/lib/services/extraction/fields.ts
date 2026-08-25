import type { DeliveryFields, InvoiceFields } from '@/lib/kernel/types';

// Extraction field format shared by ladder rungs, fixtures and matching:
// [{ name, value, confidence, page }]. Converters into kernel shapes.

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  page: number;
}

export function getField(fields: ExtractedField[], name: string): string | undefined {
  return fields.find((f) => f.name === name)?.value || undefined;
}

export function fieldsToInvoice(fields: ExtractedField[]): InvoiceFields {
  const lines: NonNullable<InvoiceFields['lines']> = [];
  for (const f of fields) {
    if (f.name.startsWith('line')) {
      try {
        lines.push(JSON.parse(f.value));
      } catch {
        // ignore unparseable line payloads
      }
    }
  }
  const num = (n: string) => {
    const v = getField(fields, n);
    return v !== undefined ? Number(v) : undefined;
  };
  return {
    invoiceNumber: getField(fields, 'invoiceNumber'),
    invoiceDate: getField(fields, 'invoiceDate'),
    buyerName: getField(fields, 'buyerName'),
    sellerName: getField(fields, 'sellerName'),
    totalNetCents: num('totalNetCents'),
    vatCents: num('vatCents'),
    totalGrossCents: num('totalGrossCents'),
    lines: lines.length ? lines : undefined,
  };
}

export function fieldsToDelivery(fields: ExtractedField[]): DeliveryFields {
  const qty = getField(fields, 'qtyTotal');
  return {
    deliveryNoteNumber: getField(fields, 'deliveryNoteNumber'),
    deliveryDate: getField(fields, 'deliveryDate'),
    invoiceRef: getField(fields, 'invoiceRef'),
    buyerName: getField(fields, 'buyerName'),
    qtyTotal: qty !== undefined ? Number(qty) : undefined,
  };
}
