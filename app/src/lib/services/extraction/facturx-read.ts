import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import type { ExtractedField } from './fields';

// Rung 1 — Factur-X / CII embedded XML (docs/05 §3). Exact by construction: every field
// carries confidence 1.0. Reads the PDF's embedded file directly (pdf-lib attachment
// layout) without a full PDF object model.

export function findEmbeddedFacturx(pdfBytes: Uint8Array): string | null {
  // Locate the embedded factur-x.xml payload. pdf-lib writes attachments as
  // (possibly Flate-compressed) EmbeddedFile streams; we try the raw bytes first, then
  // inflate every stream block and look for the CII root element.
  const buf = Buffer.from(pdfBytes);
  const latin = buf.toString('latin1');
  if (!latin.includes('factur-x.xml')) return null;

  const endTag = '</rsm:CrossIndustryInvoice>';
  const rawStart = latin.indexOf('<?xml');
  const rawEnd = latin.indexOf(endTag);
  if (rawStart >= 0 && rawEnd > rawStart) {
    return Buffer.from(latin.slice(rawStart, rawEnd + endTag.length), 'latin1').toString('utf8');
  }

  // compressed path: inflate each stream…endstream block (skip the 'stream' inside
  // 'endstream' tokens)
  let idx = 0;
  while (true) {
    const s = latin.indexOf('stream', idx);
    if (s < 0) break;
    idx = s + 6;
    if (latin.slice(s - 3, s) === 'end') continue;
    let dataStart = s + 'stream'.length;
    if (latin[dataStart] === '\r') dataStart++;
    if (latin[dataStart] === '\n') dataStart++;
    const e = latin.indexOf('endstream', dataStart);
    if (e < 0) break;
    const chunk = buf.subarray(dataStart, e);
    try {
      const inflated = zlib.inflateSync(chunk).toString('utf8');
      if (inflated.includes('<rsm:CrossIndustryInvoice')) {
        const start = inflated.indexOf('<?xml');
        const end = inflated.indexOf(endTag);
        if (end > 0) return inflated.slice(Math.max(0, start), end + endTag.length);
      }
    } catch {
      // not a flate stream — skip
    }
  }
  return null;
}

export function parseCiiXml(xml: string): ExtractedField[] {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const doc = parser.parse(xml);
  const root = doc.CrossIndustryInvoice;
  const exchanged = root?.ExchangedDocument;
  const tx = root?.SupplyChainTradeTransaction;
  const agreement = tx?.ApplicableHeaderTradeAgreement;
  const settlement = tx?.ApplicableHeaderTradeSettlement;
  const totals = settlement?.SpecifiedTradeSettlementHeaderMonetarySummation;

  const fields: ExtractedField[] = [];
  const push = (name: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      fields.push({ name, value: String(value), confidence: 1, page: 1 });
    }
  };
  push('invoiceNumber', exchanged?.ID);
  const dateRaw = String(exchanged?.IssueDateTime?.DateTimeString?.['#text'] ?? exchanged?.IssueDateTime?.DateTimeString ?? '');
  if (/^\d{8}$/.test(dateRaw)) push('invoiceDate', `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`);
  push('sellerName', agreement?.SellerTradeParty?.Name);
  push('buyerName', agreement?.BuyerTradeParty?.Name);
  const toCents = (v: unknown) => (v !== undefined && v !== null ? String(Math.round(Number(typeof v === 'object' ? (v as { '#text': string })['#text'] : v) * 100)) : undefined);
  push('totalNetCents', toCents(totals?.LineTotalAmount));
  push('vatCents', toCents(totals?.TaxTotalAmount));
  push('totalGrossCents', toCents(totals?.GrandTotalAmount));

  const lineItems = tx?.IncludedSupplyChainTradeLineItem;
  const arr = Array.isArray(lineItems) ? lineItems : lineItems ? [lineItems] : [];
  arr.forEach((li, i) => {
    const qtyNode = li?.SpecifiedLineTradeDelivery?.BilledQuantity;
    const qty = Number(typeof qtyNode === 'object' ? qtyNode['#text'] : qtyNode);
    const unit = Number(li?.SpecifiedLineTradeAgreement?.NetPriceProductTradePrice?.ChargeAmount);
    const net = Number(li?.SpecifiedLineTradeSettlement?.SpecifiedTradeSettlementLineMonetarySummation?.LineTotalAmount);
    fields.push({
      name: `line${i + 1}`,
      value: JSON.stringify({
        description: String(li?.SpecifiedTradeProduct?.Name ?? ''),
        qty,
        unitPriceCents: Math.round(unit * 100),
        netCents: Math.round(net * 100),
      }),
      confidence: 1,
      page: 1,
    });
  });
  return fields;
}
