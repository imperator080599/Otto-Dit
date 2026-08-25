import { PDFDocument, AFRelationship } from 'pdf-lib';
import { ENTITY } from './config';
import type { SalesInvoice } from './ledger';
import { renderInvoicePdf } from './pdf';

// Factur-X builder: hybrid PDF with embedded CII XML (EN 16931-shaped, simplified for the
// demo — profile marker BASIC). The S5 rung-1 parser reads the embedded XML exactly.
// True PDF/A-3 conformance (color profiles, XMP) is out of scope for the prototype and
// noted in docs/05 §3.

function cents(c: number): string {
  return (c / 100).toFixed(2);
}

export function buildCiiXml(inv: SalesInvoice): string {
  const lines = inv.lines
    .map(
      (l, i) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct><ram:Name>${escapeXml(l.label)}</ram:Name><ram:SellerAssignedID>${l.sku}</ram:SellerAssignedID></ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice><ram:ChargeAmount>${cents(l.unitPriceCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="MTK">${l.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${cents(l.netCents)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:basic</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${inv.number}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${inv.date.replace(/-/g, '')}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${escapeXml(ENTITY.name)}</ram:Name>
        <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${ENTITY.siren}</ram:ID></ram:SpecifiedLegalOrganization>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${ENTITY.vat}</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${escapeXml(inv.customer.name)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${cents(inv.vatCents)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:RateApplicablePercent>20</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${cents(inv.totalNetCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${cents(inv.totalNetCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${cents(inv.vatCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${cents(inv.ttcCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${cents(inv.ttcCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function renderFacturxPdf(inv: SalesInvoice): Promise<Uint8Array> {
  const visual = await renderInvoicePdf(inv);
  const doc = await PDFDocument.load(visual);
  const xml = buildCiiXml(inv);
  await doc.attach(new TextEncoder().encode(xml), 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X invoice data (CII XML) — fictional',
    creationDate: new Date('2026-01-15T09:00:00Z'),
    modificationDate: new Date('2026-01-15T09:00:00Z'),
    afRelationship: AFRelationship.Data,
  });
  doc.setCreationDate(new Date('2026-01-15T09:00:00Z'));
  doc.setModificationDate(new Date('2026-01-15T09:00:00Z'));
  return doc.save({ useObjectStreams: false });
}
