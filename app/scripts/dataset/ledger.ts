import { seededRng } from '../../src/lib/core/rng';
import { CUSTOMERS, ENTITY, INVOICES_PER_MONTH_BASE, PRODUCTS, PURCHASE_INVOICES_PER_MONTH, SEASONALITY, SEED, SUPPLIERS, VAT_RATE } from './config';

// Ledger builder: fictional business events → balanced journal entries. Every amount in
// integer cents; every random draw seeded. Anomalies are injected explicitly (not via
// RNG) so their placement is stable and documented (ADR-015).

export interface EntryLine {
  account: string;
  accountLabel: string;
  auxNo?: string;
  auxLabel?: string;
  debitCents: number;
  creditCents: number;
}

export interface Entry {
  journal: 'AN' | 'VE' | 'AC' | 'BQ' | 'OD';
  journalLib: string;
  entryNo: string;
  date: string;
  pieceRef: string;
  pieceDate: string;
  label: string;
  lines: EntryLine[];
}

export interface InvoiceLine {
  sku: string;
  label: string;
  qty: number;
  unitPriceCents: number;
  netCents: number;
}

export interface SalesInvoice {
  number: string;
  date: string; // invoice date as printed on the PDF
  customer: (typeof CUSTOMERS)[number];
  kind: 'goods' | 'service';
  lines: InvoiceLine[];
  totalNetCents: number;
  vatCents: number;
  ttcCents: number;
  entryNo: string;
  entryDate: string; // GL recognition date (differs for the cutoff anomaly)
  revenueAccount: '701000' | '706000' | '709000';
  deliveryNote?: { number: string; date: string; qtyTotal: number; qtyPrinted: number };
  anomaly?: string; // manifest anomaly id
  isCreditNote?: boolean;
  paid?: { date: string };
}

const JOURNAL_LIBS = { AN: 'À-nouveaux', VE: 'Ventes', AC: 'Achats', BQ: 'Banque', OD: 'Opérations diverses' } as const;

const r2 = (n: number) => Math.round(n);
const vatOf = (net: number) => r2(net * VAT_RATE);

function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function businessDay(year: number, month: number, day: number): string {
  // clamp to a weekday (shift Sat→Fri, Sun→Mon within month bounds)
  const date = new Date(Date.UTC(year, month - 1, Math.min(day, 28)));
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (dow === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export interface World {
  entries: Entry[];
  invoices: SalesInvoice[];
  stats: { revenueCents: number; pbtCents: number; lineCount: number };
}

export function buildWorld(): World {
  const rng = seededRng(SEED);
  const entries: Entry[] = [];
  const invoices: SalesInvoice[] = [];
  const seq: Record<string, number> = { AN: 0, VE: 0, AC: 0, BQ: 0, OD: 0 };
  let invoiceSeq = 0;
  let blSeq = 0;

  const nextEntryNo = (j: keyof typeof seq) => `${j}-2025-${String(++seq[j]).padStart(4, '0')}`;
  const nextInvoiceNo = () => `FA2025-${String(++invoiceSeq).padStart(4, '0')}`;
  const nextBlNo = () => `BL2025-${String(++blSeq).padStart(4, '0')}`;

  function push(journal: keyof typeof seq, date: string, pieceRef: string, pieceDate: string, label: string, lines: EntryLine[]): string {
    const entryNo = nextEntryNo(journal);
    const d = lines.reduce((s, l) => s + l.debitCents, 0);
    const c = lines.reduce((s, l) => s + l.creditCents, 0);
    if (d !== c) throw new Error(`unbalanced entry ${entryNo}: ${d} vs ${c} (${label})`);
    entries.push({ journal, journalLib: JOURNAL_LIBS[journal], entryNo, date, pieceRef, pieceDate, label, lines });
    return entryNo;
  }

  // ---------- opening balances (AN, 2025-01-01) ----------
  const opening: [string, string, number, number][] = [
    ['205000', 'Licences et logiciels', 1800000, 0],
    ['280500', 'Amort. licences et logiciels', 0, 600000],
    ['213500', 'Installations techniques', 240000000, 0],
    ['218300', 'Matériel de bureau et informatique', 12000000, 0],
    ['281350', 'Amort. installations techniques', 0, 115000000],
    ['281830', 'Amort. matériel de bureau', 0, 8000000],
    ['301000', 'Stocks matières premières', 42000000, 0],
    ['355000', 'Stocks produits finis', 38000000, 0],
    ['411000', 'Clients — collectif', 94000000, 0],
    ['401000', 'Fournisseurs — collectif', 0, 61000000],
    ['421000', 'Personnel — rémunérations dues', 0, 11500000],
    ['431000', 'Sécurité sociale', 0, 9200000],
    ['437000', 'Autres organismes sociaux', 0, 1000000],
    ['445510', 'TVA à décaisser', 0, 9600000],
    ['512100', 'Banque Lyonnaise de Crédit (fictive)', 38500000, 0],
    ['164000', 'Emprunts auprès des éts de crédit', 0, 80000000],
    ['151000', 'Provisions pour risques', 0, 6000000],
    ['101000', 'Capital social', 0, 50000000],
    ['106100', 'Réserve légale', 0, 5000000],
    ['110000', 'Report à nouveau', 0, 109400000],
  ];
  push('AN', '2025-01-01', 'AN-2025', '2025-01-01', 'Reprise des à-nouveaux',
    opening.map(([account, accountLabel, debitCents, creditCents]) => ({ account, accountLabel, debitCents, creditCents })));

  // opening AR collected in Jan/Feb; opening AP paid in Jan/Feb
  push('BQ', '2025-01-20', 'REL-2025-01A', '2025-01-20', 'Encaissements clients ouverture', [
    { account: '512100', accountLabel: 'Banque', debitCents: 55000000, creditCents: 0 },
    { account: '411000', accountLabel: 'Clients', debitCents: 0, creditCents: 55000000 },
  ]);
  push('BQ', '2025-02-14', 'REL-2025-02A', '2025-02-14', 'Encaissements clients ouverture (solde)', [
    { account: '512100', accountLabel: 'Banque', debitCents: 39000000, creditCents: 0 },
    { account: '411000', accountLabel: 'Clients', debitCents: 0, creditCents: 39000000 },
  ]);
  push('BQ', '2025-01-25', 'REG-2025-01A', '2025-01-25', 'Règlements fournisseurs ouverture', [
    { account: '401000', accountLabel: 'Fournisseurs', debitCents: 40000000, creditCents: 0 },
    { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 40000000 },
  ]);
  push('BQ', '2025-02-25', 'REG-2025-02A', '2025-02-25', 'Règlements fournisseurs ouverture (solde)', [
    { account: '401000', accountLabel: 'Fournisseurs', debitCents: 21000000, creditCents: 0 },
    { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 21000000 },
  ]);
  // opening payroll/social/VAT liabilities settled in January
  push('BQ', '2025-01-03', 'VIR-PAIE-2412', '2025-01-03', 'Paie décembre 2024 — virement', [
    { account: '421000', accountLabel: 'Personnel', debitCents: 11500000, creditCents: 0 },
    { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 11500000 },
  ]);
  push('BQ', '2025-01-15', 'CHG-SOC-2412', '2025-01-15', 'Charges sociales décembre 2024', [
    { account: '431000', accountLabel: 'Sécurité sociale', debitCents: 9200000, creditCents: 0 },
    { account: '437000', accountLabel: 'Autres organismes', debitCents: 1000000, creditCents: 0 },
    { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 10200000 },
  ]);
  push('BQ', '2025-01-20', 'TVA-2412', '2025-01-20', 'TVA décembre 2024', [
    { account: '445510', accountLabel: 'TVA à décaisser', debitCents: 9600000, creditCents: 0 },
    { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 9600000 },
  ]);

  // ---------- sales ----------
  const goodsProducts = PRODUCTS.filter((p) => p.account === '701000');
  const serviceProducts = PRODUCTS.filter((p) => p.account === '706000');
  const monthlyVat: number[] = Array(12).fill(0);
  const monthlyVatDeductible: number[] = Array(12).fill(0);

  function bookSalesInvoice(inv: SalesInvoice): void {
    const accountLabel = inv.revenueAccount === '701000' ? 'Ventes de produits finis'
      : inv.revenueAccount === '706000' ? 'Prestations de services' : 'RRR accordés';
    if (!inv.isCreditNote) {
      inv.entryNo = push('VE', inv.entryDate, inv.number, inv.date, `Facture ${inv.number} — ${inv.customer.name}`, [
        { account: '411000', accountLabel: 'Clients', auxNo: inv.customer.code, auxLabel: inv.customer.name, debitCents: inv.ttcCents, creditCents: 0 },
        { account: inv.revenueAccount, accountLabel, auxNo: inv.customer.code, auxLabel: inv.customer.name, debitCents: 0, creditCents: inv.totalNetCents },
        { account: '445710', accountLabel: 'TVA collectée', debitCents: 0, creditCents: inv.vatCents },
      ]);
      monthlyVat[Number(inv.entryDate.slice(5, 7)) - 1] += inv.vatCents;
    } else {
      inv.entryNo = push('VE', inv.entryDate, inv.number, inv.date, `Avoir ${inv.number} — ${inv.customer.name}`, [
        { account: '709000', accountLabel: 'RRR accordés par l’entreprise', auxNo: inv.customer.code, auxLabel: inv.customer.name, debitCents: inv.totalNetCents, creditCents: 0 },
        { account: '445710', accountLabel: 'TVA collectée', debitCents: inv.vatCents, creditCents: 0 },
        { account: '411000', accountLabel: 'Clients', auxNo: inv.customer.code, auxLabel: inv.customer.name, debitCents: 0, creditCents: inv.ttcCents },
      ]);
      monthlyVat[Number(inv.entryDate.slice(5, 7)) - 1] -= inv.vatCents;
    }
    invoices.push(inv);
  }

  function makeInvoice(month: number, day: number, opts: Partial<SalesInvoice> & { kind: 'goods' | 'service' }): SalesInvoice {
    const date = businessDay(2025, month, day);
    const customer = opts.customer ?? CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)];
    let lines: InvoiceLine[];
    if (opts.lines) {
      lines = opts.lines;
    } else if (opts.kind === 'goods') {
      const p = goodsProducts[Math.floor(rng() * goodsProducts.length)];
      // ordinary invoices stay below ~22k€ HT so the high-value stratum (≥ PM ≈ 26k€)
      // contains exactly the seeded/clean high-value invoices (ADR-015 placement)
      const qtyMax = Math.max(6, Math.floor(2200000 / p.unitPriceCents));
      const qty = 5 + Math.floor(Math.pow(rng(), 1.1) * (qtyMax - 5));
      lines = [{ sku: p.sku, label: p.label, qty, unitPriceCents: p.unitPriceCents, netCents: qty * p.unitPriceCents }];
    } else {
      const p = serviceProducts[Math.floor(rng() * serviceProducts.length)];
      const qty = p.sku === 'SRV-POSE' ? 8 + Math.floor(rng() * 110) : 1;
      lines = [{ sku: p.sku, label: p.label, qty, unitPriceCents: p.unitPriceCents, netCents: qty * p.unitPriceCents }];
    }
    const totalNetCents = opts.totalNetCents ?? lines.reduce((s, l) => s + l.netCents, 0);
    const vatCents = vatOf(totalNetCents);
    const inv: SalesInvoice = {
      number: opts.number ?? nextInvoiceNo(),
      date: opts.date ?? date,
      customer,
      kind: opts.kind,
      lines,
      totalNetCents,
      vatCents,
      ttcCents: totalNetCents + vatCents,
      entryNo: '',
      entryDate: opts.entryDate ?? date,
      revenueAccount: opts.revenueAccount ?? (opts.kind === 'goods' ? '701000' : '706000'),
      deliveryNote: opts.deliveryNote,
      anomaly: opts.anomaly,
      isCreditNote: opts.isCreditNote,
    };
    if (inv.kind === 'goods' && !inv.isCreditNote && !inv.deliveryNote && !opts.anomaly) {
      const qtyTotal = inv.lines.reduce((s, l) => s + l.qty, 0);
      inv.deliveryNote = { number: nextBlNo(), date: isoAddDays(inv.date, -2), qtyTotal, qtyPrinted: qtyTotal };
    }
    return inv;
  }

  for (let m = 1; m <= 12; m++) {
    const count = Math.round(INVOICES_PER_MONTH_BASE * SEASONALITY[m - 1]);
    for (let i = 0; i < count; i++) {
      const day = 2 + Math.floor(rng() * 24);
      const kind = rng() < 0.68 ? 'goods' : 'service';
      bookSalesInvoice(makeInvoice(m, day, { kind }));
    }
  }

  // ---------- seeded anomalies (explicit, high-value ⇒ deterministic stratum) ----------
  // A1 duplicate invoice: same invoice booked twice (June + July), same piece ref.
  const dupLines: InvoiceLine[] = [{ sku: 'VIT-FEU-EI30', label: 'Vitrage coupe-feu EI30 (m²)', qty: 128, unitPriceCents: 28750, netCents: 128 * 28750 }];
  const dupNumber = nextInvoiceNo();
  const dupA = makeInvoice(6, 17, { kind: 'goods', number: dupNumber, customer: CUSTOMERS[3], lines: dupLines, anomaly: 'A1', deliveryNote: { number: nextBlNo(), date: '2025-06-13', qtyTotal: 128, qtyPrinted: 128 } });
  bookSalesInvoice(dupA);
  const dupB = makeInvoice(7, 15, { kind: 'goods', number: dupNumber, customer: CUSTOMERS[3], lines: dupLines, anomaly: 'A1', date: dupA.date, deliveryNote: dupA.deliveryNote });
  bookSalesInvoice(dupB);

  // A2 missing delivery note (high-value goods invoice, no BL will be provided).
  bookSalesInvoice(makeInvoice(4, 10, {
    kind: 'goods', customer: CUSTOMERS[5], anomaly: 'A2',
    lines: [{ sku: 'VIT-ACOU-44', label: 'Vitrage acoustique 44.2/16/10 (m²)', qty: 210, unitPriceCents: 16540, netCents: 210 * 16540 }],
  }));

  // A3 price mismatch: printed line net ≠ qty × unit price (invoice total = GL, so only
  // the price check fails).
  bookSalesInvoice(makeInvoice(9, 12, {
    kind: 'goods', customer: CUSTOMERS[0], anomaly: 'A3',
    lines: [{ sku: 'VIT-TRP-ARG', label: 'Triple vitrage argon 4/12/4/12/4 (m²)', qty: 240, unitPriceCents: 14320, netCents: 240 * 14320 + 180000 }],
    deliveryNote: { number: nextBlNo(), date: '2025-09-09', qtyTotal: 240, qtyPrinted: 240 },
  }));

  // A4 quantity mismatch: delivery note shows fewer units than invoiced.
  bookSalesInvoice(makeInvoice(10, 8, {
    kind: 'goods', customer: CUSTOMERS[7], anomaly: 'A4',
    lines: [{ sku: 'VIT-TRE-SEC', label: 'Vitrage trempé sécurit 10mm (m²)', qty: 260, unitPriceCents: 11890, netCents: 260 * 11890 }],
    deliveryNote: { number: nextBlNo(), date: '2025-10-06', qtyTotal: 260, qtyPrinted: 238 },
  }));

  // A5 cut-off: invoice dated January 2026, revenue recognized 31/12/2025.
  bookSalesInvoice(makeInvoice(12, 31, {
    kind: 'goods', customer: CUSTOMERS[9], anomaly: 'A5', date: '2026-01-06', entryDate: '2025-12-31',
    lines: [{ sku: 'VIT-DBL-STD', label: 'Vitrage isolant double 4/16/4 (m²)', qty: 420, unitPriceCents: 8650, netCents: 420 * 8650 }],
    deliveryNote: { number: nextBlNo(), date: '2026-01-05', qtyTotal: 420, qtyPrinted: 420 },
  }));

  // Clean high-value invoices (goods with BL; Factur-X service invoice).
  bookSalesInvoice(makeInvoice(5, 20, {
    kind: 'goods', customer: CUSTOMERS[2],
    lines: [{ sku: 'VIT-FEU-EI30', label: 'Vitrage coupe-feu EI30 (m²)', qty: 110, unitPriceCents: 28750, netCents: 110 * 28750 }],
    deliveryNote: { number: nextBlNo(), date: '2025-05-16', qtyTotal: 110, qtyPrinted: 110 },
  }));
  const facturx = makeInvoice(11, 6, {
    kind: 'service', customer: CUSTOMERS[11],
    lines: [
      { sku: 'SRV-MAINT', label: 'Maintenance façade vitrée (forfait annuel)', qty: 1, unitPriceCents: 3120000, netCents: 3120000 },
      { sku: 'SRV-ETUDE', label: 'Étude technique et calepinage (forfait)', qty: 2, unitPriceCents: 48000, netCents: 96000 },
    ],
  });
  (facturx as SalesInvoice & { facturx?: boolean }).facturx = true;
  bookSalesInvoice(facturx);

  // A8 credit-note pattern: 3 avoirs to C009 across the year.
  for (const [i, [month, day, qty]] of ([[3, 14, 30], [7, 22, 42], [10, 17, 25]] as const).entries()) {
    const net = qty * 8650;
    bookSalesInvoice(makeInvoice(month, day, {
      kind: 'goods', customer: CUSTOMERS[8], anomaly: 'A8', isCreditNote: true, revenueAccount: '709000',
      number: `AV2025-000${i + 1}`,
      lines: [{ sku: 'VIT-DBL-STD', label: `Retour vitrages — avoir sur facture (lot ${i + 1})`, qty, unitPriceCents: 8650, netCents: net }],
    }));
  }

  // A6 weekend round-amount manual JE (2025-11-15 is a Saturday).
  push('OD', '2025-11-15', 'OD-2025-089', '2025-11-15', 'Ajustement manuel chiffre d’affaires', [
    { account: '411000', accountLabel: 'Clients', auxNo: 'C004', auxLabel: CUSTOMERS[3].name, debitCents: 5000000, creditCents: 0 },
    { account: '706000', accountLabel: 'Prestations de services', auxNo: 'C004', auxLabel: CUSTOMERS[3].name, debitCents: 0, creditCents: 5000000 },
  ]);

  // ---------- customer receipts ----------
  for (const inv of invoices) {
    if (inv.isCreditNote) continue;
    const dateNum = Number(inv.entryDate.slice(5, 7));
    const settleWithinYear = dateNum <= 10 ? rng() < 0.93 : rng() < 0.35;
    if (!settleWithinYear) continue;
    const payDate = isoAddDays(inv.entryDate, 25 + Math.floor(rng() * 35));
    if (payDate > ENTITY.periodEnd) continue;
    inv.paid = { date: payDate };
    push('BQ', payDate, `VIR-${inv.number}`, payDate, `Virement ${inv.customer.name} — ${inv.number}`, [
      { account: '512100', accountLabel: 'Banque', debitCents: inv.ttcCents, creditCents: 0 },
      { account: '411000', accountLabel: 'Clients', auxNo: inv.customer.code, auxLabel: inv.customer.name, debitCents: 0, creditCents: inv.ttcCents },
    ]);
  }

  // ---------- purchases ----------
  const expenseBysupplier: Record<string, [string, string]> = {
    F001: ['601000', 'Achats matières premières — verre'],
    F002: ['601100', 'Achats matières — silices et intercalaires'],
    F003: ['602100', 'Achats profilés et consommables'],
    F004: ['606100', 'Fournitures non stockables — énergie'],
    F005: ['624100', 'Transports sur ventes'],
    F006: ['615500', 'Entretien et maintenance des fours'],
    F007: ['616000', "Primes d'assurances"],
    F008: ['621100', 'Personnel intérimaire'],
  };
  const supplierWeights = [0.42, 0.08, 0.12, 0.1, 0.07, 0.06, 0.04, 0.11];
  let apSeq = 0;
  // P&L control (ADR-015): purchases absorb what keeps PBT ≈ 700k€ so the pinned
  // materiality (PBT @5% ⇒ M ≈ 35k, PM ≈ 26k) brackets the seeded high-value anomalies.
  const totalRevenue = invoices.filter((i) => !i.isCreditNote).reduce((s, i) => s + i.totalNetCents, 0)
    - invoices.filter((i) => i.isCreditNote).reduce((s, i) => s + i.totalNetCents, 0)
    + 5000000; // manual JE booked below
  const payrollYear = 12 * Math.round(15500000 * 1.4);
  const purchasesTargetYear = totalRevenue - payrollYear - 24000000 - 4 * 800000 - 70000000;
  if (purchasesTargetYear < 12 * PURCHASE_INVOICES_PER_MONTH * 30000) {
    throw new Error('P&L targets inconsistent: purchases target too small');
  }
  for (let m = 1; m <= 12; m++) {
    const monthRevenue = invoices
      .filter((i) => Number(i.entryDate.slice(5, 7)) === m && !i.isCreditNote)
      .reduce((s, i) => s + i.totalNetCents, 0);
    const target = Math.round(purchasesTargetYear * (monthRevenue / totalRevenue));
    // raw seeded weights → exact normalization to the monthly target
    const raws: { sIdx: number; raw: number }[] = [];
    for (let i = 0; i < PURCHASE_INVOICES_PER_MONTH; i++) {
      const pick = rng();
      let acc = 0;
      let sIdx = 0;
      for (let k = 0; k < supplierWeights.length; k++) {
        acc += supplierWeights[k];
        if (pick <= acc) { sIdx = k; break; }
      }
      raws.push({ sIdx, raw: supplierWeights[sIdx] * (0.5 + rng()) });
    }
    const rawSum = raws.reduce((s, r) => s + r.raw, 0);
    let allocated = 0;
    for (let i = 0; i < raws.length; i++) {
      const { sIdx, raw } = raws[i];
      const supplier = SUPPLIERS[sIdx];
      const [account, accountLabel] = expenseBysupplier[supplier.code];
      const net = i === raws.length - 1
        ? Math.max(30000, target - allocated)
        : Math.max(30000, Math.round((target * raw) / rawSum));
      allocated += net;
      const vat = vatOf(net);
      monthlyVatDeductible[m - 1] += vat;
      const day = 3 + Math.floor(rng() * 22);
      const date = businessDay(2025, m, day);
      const piece = `FF2025-${String(++apSeq).padStart(4, '0')}`;
      push('AC', date, piece, date, `Facture ${supplier.name}`, [
        { account, accountLabel, debitCents: net, creditCents: 0 },
        { account: '445660', accountLabel: 'TVA déductible', debitCents: vat, creditCents: 0 },
        { account: '401000', accountLabel: 'Fournisseurs', auxNo: supplier.code, auxLabel: supplier.name, debitCents: 0, creditCents: net + vat },
      ]);
      const payDate = isoAddDays(date, 30 + Math.floor(rng() * 20));
      if (payDate <= ENTITY.periodEnd) {
        push('BQ', payDate, `REG-${piece}`, payDate, `Règlement ${supplier.name} — ${piece}`, [
          { account: '401000', accountLabel: 'Fournisseurs', auxNo: supplier.code, auxLabel: supplier.name, debitCents: net + vat, creditCents: 0 },
          { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: net + vat },
        ]);
      }
    }
  }

  // ---------- payroll ----------
  for (let m = 1; m <= 12; m++) {
    const jitter = Math.floor(rng() * 400000) - 200000;
    const gross = 15500000 + jitter;
    const employer = Math.round(gross * 0.4);
    const net = Math.round(gross * 0.74);
    const urssaf = Math.round(gross * 0.55);
    const other = gross + employer - net - urssaf;
    const date = businessDay(2025, m, 28);
    push('OD', date, `PAIE-2025-${String(m).padStart(2, '0')}`, date, `Paie ${date.slice(0, 7)}`, [
      { account: '641000', accountLabel: 'Rémunérations du personnel', debitCents: gross, creditCents: 0 },
      { account: '645000', accountLabel: 'Charges de sécurité sociale', debitCents: employer, creditCents: 0 },
      { account: '421000', accountLabel: 'Personnel — rémunérations dues', debitCents: 0, creditCents: net },
      { account: '431000', accountLabel: 'Sécurité sociale', debitCents: 0, creditCents: urssaf },
      { account: '437000', accountLabel: 'Autres organismes sociaux', debitCents: 0, creditCents: other },
    ]);
    if (m < 12) {
      const payDate = businessDay(2025, m + 1, 2);
      push('BQ', payDate, `VIR-PAIE-25${String(m).padStart(2, '0')}`, payDate, `Virement salaires ${date.slice(0, 7)}`, [
        { account: '421000', accountLabel: 'Personnel', debitCents: net, creditCents: 0 },
        { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: net },
      ]);
      const socDate = businessDay(2025, m + 1, 15);
      push('BQ', socDate, `CHG-SOC-25${String(m).padStart(2, '0')}`, socDate, `Charges sociales ${date.slice(0, 7)}`, [
        { account: '431000', accountLabel: 'Sécurité sociale', debitCents: urssaf, creditCents: 0 },
        { account: '437000', accountLabel: 'Autres organismes', debitCents: other, creditCents: 0 },
        { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: urssaf + other },
      ]);
    }
  }

  // ---------- VAT settlements ----------
  let carryCollected = 0; // months where deductible ≥ collected roll into the next settlement
  let carryDeductible = 0;
  for (let m = 1; m <= 12; m++) {
    const collected = monthlyVat[m - 1] + carryCollected;
    const deductible = monthlyVatDeductible[m - 1] + carryDeductible;
    const due = collected - deductible;
    const lastDay = new Date(Date.UTC(2025, m, 0)).toISOString().slice(0, 10);
    if (due <= 0) {
      carryCollected = collected;
      carryDeductible = deductible;
      continue; // no settlement this month; both sides carry forward
    }
    carryCollected = 0;
    carryDeductible = 0;
    push('OD', lastDay, `TVA-2025-${String(m).padStart(2, '0')}`, lastDay, `Liquidation TVA ${lastDay.slice(0, 7)}`, [
      { account: '445710', accountLabel: 'TVA collectée', debitCents: collected, creditCents: 0 },
      { account: '445660', accountLabel: 'TVA déductible', debitCents: 0, creditCents: deductible },
      { account: '445510', accountLabel: 'TVA à décaisser', debitCents: 0, creditCents: due },
    ]);
    if (m < 12) {
      const payDate = businessDay(2025, m + 1, 20);
      push('BQ', payDate, `TVA-REG-25${String(m).padStart(2, '0')}`, payDate, `Paiement TVA ${lastDay.slice(0, 7)}`, [
        { account: '445510', accountLabel: 'TVA à décaisser', debitCents: due, creditCents: 0 },
        { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: due },
      ]);
    }
  }

  // ---------- loan + depreciation ----------
  for (const q of [3, 6, 9, 12]) {
    const date = businessDay(2025, q, 30);
    push('BQ', date, `EMP-2025-T${q / 3}`, date, `Échéance emprunt T${q / 3}`, [
      { account: '164000', accountLabel: 'Emprunts', debitCents: 2000000, creditCents: 0 },
      { account: '661100', accountLabel: 'Intérêts des emprunts', debitCents: 800000, creditCents: 0 },
      { account: '512100', accountLabel: 'Banque', debitCents: 0, creditCents: 2800000 },
    ]);
  }
  push('BQ', '2025-06-10', 'DIV-2025-01', '2025-06-10', 'Produits divers de gestion courante', [
    { account: '512100', accountLabel: 'Banque', debitCents: 840000, creditCents: 0 },
    { account: '758000', accountLabel: 'Produits divers de gestion courante', debitCents: 0, creditCents: 840000 },
  ]);
  push('OD', '2025-12-31', 'DOT-2025', '2025-12-31', 'Dotations aux amortissements 2025', [
    { account: '681100', accountLabel: 'Dotations amortissements', debitCents: 24000000, creditCents: 0 },
    { account: '281350', accountLabel: 'Amort. installations techniques', debitCents: 0, creditCents: 22000000 },
    { account: '281830', accountLabel: 'Amort. matériel de bureau', debitCents: 0, creditCents: 2000000 },
  ]);

  // ---------- stats ----------
  let revenue = 0;
  let products = 0;
  let charges = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.account.startsWith('70')) revenue += l.creditCents - l.debitCents;
      if (l.account[0] === '7') products += l.creditCents - l.debitCents;
      if (l.account[0] === '6') charges += l.debitCents - l.creditCents;
    }
  }
  const lineCount = entries.reduce((s, e) => s + e.lines.length, 0);
  return { entries, invoices, stats: { revenueCents: revenue, pbtCents: products - charges, lineCount } };
}
