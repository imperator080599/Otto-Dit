import type { AccountingMapPack, FsliDef } from '../types';

// PCG (Plan Comptable Général) → FSLI default mapping. Engagement-level overrides live in
// coa_map_rule (docs/04 §2). Longest-prefix-wins via priority = prefix length.

const fslis: FsliDef[] = [
  { code: 'REVENUE', statement: 'IS', name: { fr: "Chiffre d'affaires", en: 'Revenue' } },
  { code: 'OTHER_INCOME', statement: 'IS', name: { fr: 'Autres produits', en: 'Other income' } },
  { code: 'PURCHASES', statement: 'IS', name: { fr: 'Achats consommés', en: 'Purchases / COGS' } },
  { code: 'EXTERNAL_EXPENSES', statement: 'IS', name: { fr: 'Charges externes', en: 'External expenses' } },
  { code: 'PAYROLL', statement: 'IS', name: { fr: 'Charges de personnel', en: 'Payroll expenses' } },
  { code: 'TAXES_EXPENSE', statement: 'IS', name: { fr: 'Impôts et taxes', en: 'Taxes other than income tax' } },
  { code: 'DEPRECIATION', statement: 'IS', name: { fr: 'Dotations amort. et prov.', en: 'D&A and provisions' } },
  { code: 'FINANCIAL_RESULT', statement: 'IS', name: { fr: 'Résultat financier', en: 'Financial result' } },
  { code: 'EXCEPTIONAL', statement: 'IS', name: { fr: 'Résultat exceptionnel', en: 'Exceptional items' } },
  { code: 'INCOME_TAX', statement: 'IS', name: { fr: 'Impôt sur les bénéfices', en: 'Income tax' } },
  { code: 'INTANGIBLES', statement: 'BS', name: { fr: 'Immobilisations incorporelles', en: 'Intangible assets' } },
  { code: 'PPE', statement: 'BS', name: { fr: 'Immobilisations corporelles', en: 'Property, plant & equipment' } },
  { code: 'FINANCIAL_ASSETS', statement: 'BS', name: { fr: 'Immobilisations financières', en: 'Financial assets' } },
  { code: 'INVENTORY', statement: 'BS', name: { fr: 'Stocks', en: 'Inventory' } },
  { code: 'TRADE_RECEIVABLES', statement: 'BS', name: { fr: 'Clients et comptes rattachés', en: 'Trade receivables' } },
  { code: 'OTHER_RECEIVABLES', statement: 'BS', name: { fr: 'Autres créances', en: 'Other receivables' } },
  { code: 'CASH', statement: 'BS', name: { fr: 'Trésorerie', en: 'Cash & equivalents' } },
  { code: 'EQUITY', statement: 'BS', name: { fr: 'Capitaux propres', en: 'Equity' } },
  { code: 'PROVISIONS', statement: 'BS', name: { fr: 'Provisions', en: 'Provisions' } },
  { code: 'FINANCIAL_DEBT', statement: 'BS', name: { fr: 'Emprunts et dettes financières', en: 'Borrowings' } },
  { code: 'TRADE_PAYABLES', statement: 'BS', name: { fr: 'Fournisseurs et comptes rattachés', en: 'Trade payables' } },
  { code: 'TAX_SOCIAL_PAYABLES', statement: 'BS', name: { fr: 'Dettes fiscales et sociales', en: 'Tax & social payables' } },
  { code: 'OTHER_PAYABLES', statement: 'BS', name: { fr: 'Autres dettes', en: 'Other payables' } },
  { code: 'ACCRUALS', statement: 'BS', name: { fr: 'Comptes de régularisation', en: 'Accruals & deferrals' } },
];

const r = (prefix: string, fsli: string) => ({ prefix, fsli, priority: prefix.length });

export const pcg: AccountingMapPack = {
  id: 'pcg',
  name: 'Plan Comptable Général (France)',
  fslis,
  rules: [
    r('10', 'EQUITY'), r('11', 'EQUITY'), r('12', 'EQUITY'), r('13', 'EQUITY'), r('14', 'EQUITY'),
    r('15', 'PROVISIONS'),
    r('16', 'FINANCIAL_DEBT'), r('17', 'FINANCIAL_DEBT'), r('18', 'FINANCIAL_DEBT'),
    r('20', 'INTANGIBLES'), r('280', 'INTANGIBLES'),
    r('21', 'PPE'), r('22', 'PPE'), r('23', 'PPE'), r('281', 'PPE'), r('282', 'PPE'),
    r('26', 'FINANCIAL_ASSETS'), r('27', 'FINANCIAL_ASSETS'), r('29', 'FINANCIAL_ASSETS'),
    r('3', 'INVENTORY'),
    r('40', 'TRADE_PAYABLES'), r('409', 'OTHER_RECEIVABLES'),
    r('41', 'TRADE_RECEIVABLES'), r('419', 'OTHER_PAYABLES'), r('491', 'TRADE_RECEIVABLES'),
    r('42', 'TAX_SOCIAL_PAYABLES'), r('43', 'TAX_SOCIAL_PAYABLES'), r('44', 'TAX_SOCIAL_PAYABLES'),
    r('45', 'OTHER_PAYABLES'), r('46', 'OTHER_RECEIVABLES'), r('467', 'OTHER_PAYABLES'),
    r('47', 'ACCRUALS'), r('48', 'ACCRUALS'), r('486', 'ACCRUALS'), r('487', 'ACCRUALS'),
    r('50', 'CASH'), r('51', 'CASH'), r('519', 'FINANCIAL_DEBT'), r('53', 'CASH'), r('58', 'CASH'),
    r('60', 'PURCHASES'), r('603', 'PURCHASES'),
    r('61', 'EXTERNAL_EXPENSES'), r('62', 'EXTERNAL_EXPENSES'),
    r('63', 'TAXES_EXPENSE'),
    r('64', 'PAYROLL'),
    r('65', 'OTHER_INCOME'), r('66', 'FINANCIAL_RESULT'), r('67', 'EXCEPTIONAL'),
    r('68', 'DEPRECIATION'), r('69', 'INCOME_TAX'),
    r('70', 'REVENUE'), r('709', 'REVENUE'),
    r('71', 'PURCHASES'), r('72', 'OTHER_INCOME'), r('74', 'OTHER_INCOME'),
    r('75', 'OTHER_INCOME'), r('76', 'FINANCIAL_RESULT'), r('77', 'EXCEPTIONAL'),
    r('78', 'DEPRECIATION'), r('79', 'OTHER_INCOME'),
  ],
};
