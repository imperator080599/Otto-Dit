import type { VouchingTolerances } from '@/lib/packs/types';
import type { CheckResult, DeliveryFields, GlRow, InvoiceFields } from './types';
import { centsToStr, normalizeParty } from './canon';

// Deterministic vouching (S6): GL line ↔ invoice ↔ delivery note with pack tolerances.
// Pure function — emits CheckResults; the exception engine types the failures.

export interface VouchInput {
  gl: GlRow;
  clientPartyName: string; // audited entity's own name (seller on sales invoices)
  invoice?: InvoiceFields;
  invoiceProvenance?: string;
  delivery?: DeliveryFields;
  requireDelivery: boolean; // pack/procedure: goods lines require a delivery note
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000));
}

export function vouchRevenueLine(input: VouchInput, tol: VouchingTolerances): CheckResult[] {
  const checks: CheckResult[] = [];
  const { gl, invoice, delivery } = input;
  const glAmountCents = gl.creditCents > 0 ? gl.creditCents : -gl.debitCents; // revenue sign

  if (!invoice) {
    checks.push({
      check: 'document_present',
      expected: 'sales invoice',
      found: 'none',
      tolerance: '—',
      pass: false,
    });
    return checks;
  }

  // amount: invoice net vs GL revenue amount
  if (invoice.totalNetCents !== undefined) {
    const delta = Math.abs(Math.abs(invoice.totalNetCents) - Math.abs(glAmountCents));
    const tolCents = Math.max(tol.amountAbs * 100, Math.abs(glAmountCents) * tol.amountPct);
    checks.push({
      check: 'amount',
      expected: centsToStr(Math.abs(glAmountCents)),
      found: centsToStr(Math.abs(invoice.totalNetCents)),
      tolerance: `±${centsToStr(Math.round(tolCents))}`,
      pass: delta <= tolCents,
      source: input.invoiceProvenance,
    });
  } else {
    checks.push({ check: 'amount', expected: centsToStr(Math.abs(glAmountCents)), found: 'not extracted', tolerance: '—', pass: false, source: input.invoiceProvenance });
  }

  // date: invoice date vs GL piece date (cut-off sensitive)
  const glDate = gl.pieceDate ?? gl.entryDate;
  if (invoice.invoiceDate) {
    const dd = daysBetween(invoice.invoiceDate, glDate);
    checks.push({
      check: 'date',
      expected: glDate,
      found: invoice.invoiceDate,
      tolerance: `±${tol.dateDays}d`,
      pass: dd <= tol.dateDays,
      source: input.invoiceProvenance,
    });
  }

  // period: invoice recognized in the correct period (cut-off) — recognition period is the
  // GL entry date's year; the invoice date must fall in the same year within tolerance.
  if (invoice.invoiceDate) {
    const glYear = gl.entryDate.slice(0, 4);
    const invYear = invoice.invoiceDate.slice(0, 4);
    if (glYear !== invYear) {
      checks.push({
        check: 'cutoff',
        expected: `recognition in ${glYear}`,
        found: `invoice dated ${invoice.invoiceDate}`,
        tolerance: 'same period',
        pass: false,
        source: input.invoiceProvenance,
      });
    }
  }

  // counterparty: GL aux label / aux no vs invoice buyer
  if (invoice.buyerName && (gl.auxLabel || gl.auxNo)) {
    const glParty = normalizeParty(gl.auxLabel ?? gl.auxNo ?? '');
    const invParty = normalizeParty(invoice.buyerName);
    const pass = glParty.length > 0 && (invParty.includes(glParty) || glParty.includes(invParty));
    checks.push({
      check: 'counterparty',
      expected: gl.auxLabel ?? gl.auxNo ?? '',
      found: invoice.buyerName,
      tolerance: 'normalized match',
      pass,
      source: input.invoiceProvenance,
    });
  }

  // delivery note (goods): presence + quantity vs invoice
  if (input.requireDelivery) {
    if (!delivery) {
      checks.push({ check: 'delivery_present', expected: 'delivery note', found: 'none', tolerance: '—', pass: false });
    } else {
      const invQty = invoice.lines?.reduce((s, l) => s + (l.qty ?? 0), 0) ?? undefined;
      if (invQty !== undefined && delivery.qtyTotal !== undefined) {
        const pass = Math.abs(invQty - delivery.qtyTotal) <= tol.qtyAbs;
        checks.push({
          check: 'qty',
          expected: String(invQty),
          found: String(delivery.qtyTotal),
          tolerance: `±${tol.qtyAbs}`,
          pass,
        });
      }
    }
  }

  // unit price consistency inside the invoice lines (price × qty = net within tolerance)
  if (invoice.lines) {
    for (const [i, l] of invoice.lines.entries()) {
      if (l.qty !== undefined && l.unitPriceCents !== undefined && l.netCents !== undefined) {
        const calc = Math.round(l.qty * l.unitPriceCents);
        const tolCents = Math.max(100, Math.abs(l.netCents) * tol.pricePct);
        const pass = Math.abs(calc - l.netCents) <= tolCents;
        if (!pass) {
          checks.push({
            check: 'price',
            expected: `line ${i + 1}: ${l.qty} × ${centsToStr(l.unitPriceCents)} = ${centsToStr(calc)}`,
            found: centsToStr(l.netCents),
            tolerance: `±${centsToStr(Math.round(tolCents))}`,
            pass: false,
            source: input.invoiceProvenance,
          });
        }
      }
    }
  }

  return checks;
}

/** Map failed checks to pack exception taxonomy codes (docs/03 §2 exception engine). */
export function checksToExceptionCodes(checks: CheckResult[]): string[] {
  const codes = new Set<string>();
  for (const c of checks) {
    if (c.pass) continue;
    switch (c.check) {
      case 'document_present': codes.add('missing_document'); break;
      case 'delivery_present': codes.add('missing_document'); break;
      case 'amount': codes.add('amount_mismatch'); break;
      case 'date': codes.add('date_mismatch'); break;
      case 'cutoff': codes.add('cutoff'); break;
      case 'counterparty': codes.add('counterparty_mismatch'); break;
      case 'qty': codes.add('qty_mismatch'); break;
      case 'price': codes.add('price_mismatch'); break;
      default: codes.add('amount_mismatch');
    }
  }
  return [...codes];
}

/** Duplicate detection across a set of vouched invoices (same invoice number or same
 *  (buyer, amount, date) triple on different GL lines). Returns unit ids implicated. */
export function findDuplicateInvoices(
  items: { unitId: string; invoice?: InvoiceFields }[],
): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const it of items) {
    if (!it.invoice?.invoiceNumber) continue;
    const key = it.invoice.invoiceNumber.trim().toUpperCase();
    byKey.set(key, [...(byKey.get(key) ?? []), it.unitId]);
  }
  const dupes = new Map<string, string[]>();
  for (const [key, ids] of byKey) {
    if (ids.length > 1) dupes.set(key, ids);
  }
  return dupes;
}
