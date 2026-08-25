// Dataset world configuration — ALL FICTIONAL (CLAUDE.md rule 2). Deterministic: every
// random choice flows from SEED via the kernel RNG.

export const SEED = 'otto-altiverre-fy2025-v1';

export const ENTITY = {
  name: 'Altiverre SAS',
  siren: '999888777',
  address: '18 rue des Verriers, 69007 Lyon, France',
  vat: 'FR00999888777',
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
};

export const CUSTOMERS: { code: string; name: string; siren: string; city: string }[] = [
  { code: 'C001', name: 'Bâtiplace SARL', siren: '911111111', city: 'Lyon' },
  { code: 'C002', name: 'Verrería del Sur SL', siren: 'ESX1111111', city: 'Barcelona' },
  { code: 'C003', name: 'Menuiseries Chartier SAS', siren: '922222222', city: 'Villeurbanne' },
  { code: 'C004', name: 'Groupe Immovance SA', siren: '933333333', city: 'Paris' },
  { code: 'C005', name: 'Façades Rhôdaniennes SARL', siren: '944444444', city: 'Vienne' },
  { code: 'C006', name: 'Constructions Peyrelle SAS', siren: '955555555', city: 'Grenoble' },
  { code: 'C007', name: 'Atelier Lumière & Verre EURL', siren: '966666666', city: 'Annecy' },
  { code: 'C008', name: 'Habitat Confluence SAS', siren: '977777777', city: 'Lyon' },
  { code: 'C009', name: 'Négoce Vitrages Réunis SARL', siren: '988888888', city: 'Saint-Étienne' },
  { code: 'C010', name: 'Promoteurs du Forez SA', siren: '999999911', city: 'Montbrison' },
  { code: 'C011', name: 'Serres & Vérandas Alpines SAS', siren: '999999922', city: 'Chambéry' },
  { code: 'C012', name: 'Tertiaire Bâtir SAS', siren: '999999933', city: 'Bron' },
];

export const SUPPLIERS: { code: string; name: string }[] = [
  { code: 'F001', name: 'Float Glass Industries GmbH' },
  { code: 'F002', name: 'Silices de Loire SARL' },
  { code: 'F003', name: 'Profilés Aluminium Roussel SAS' },
  { code: 'F004', name: 'Énergie Rhône Distribution SA' },
  { code: 'F005', name: 'Transports Cantagrel SARL' },
  { code: 'F006', name: 'Maintenance Fours Vidal EURL' },
  { code: 'F007', name: 'Assurances Mutuelles du Verre' },
  { code: 'F008', name: 'Intérim Provalor SAS' },
];

export const PRODUCTS: { sku: string; label: string; unitPriceCents: number; account: '701000' | '706000' }[] = [
  { sku: 'VIT-DBL-STD', label: 'Vitrage isolant double 4/16/4 (m²)', unitPriceCents: 8650, account: '701000' },
  { sku: 'VIT-TRP-ARG', label: 'Triple vitrage argon 4/12/4/12/4 (m²)', unitPriceCents: 14320, account: '701000' },
  { sku: 'VIT-FEU-EI30', label: 'Vitrage coupe-feu EI30 (m²)', unitPriceCents: 28750, account: '701000' },
  { sku: 'VIT-TRE-SEC', label: 'Vitrage trempé sécurit 10mm (m²)', unitPriceCents: 11890, account: '701000' },
  { sku: 'VIT-ACOU-44', label: 'Vitrage acoustique 44.2/16/10 (m²)', unitPriceCents: 16540, account: '701000' },
  { sku: 'SRV-POSE', label: 'Prestation de pose et calage (h)', unitPriceCents: 6200, account: '706000' },
  { sku: 'SRV-ETUDE', label: "Étude technique et calepinage (forfait)", unitPriceCents: 48000, account: '706000' },
  { sku: 'SRV-MAINT', label: 'Maintenance façade vitrée (forfait)', unitPriceCents: 92000, account: '706000' },
];

export const VAT_RATE = 0.2;

// Pinned demo parameters (ADR-015): the demo script validates the proposal at exactly
// these values; the generator computes the draw with them. Emitted to
// dataset/demo-params.json with the computed materiality amounts.
export const DEMO_SAMPLING = {
  revenue: { seed: 'otto-demo-rev-1', randomSize: 4 }, // coverageCapCents = PM (computed)
  sox: { seed: 'otto-demo-sox-1' },
  verification: { seed: 'otto-demo-verif-1', rate: 0.1, min: 3 },
};

// Monthly revenue seasonality (industrial glazing: strong Q2/Q3, weak January/August).
export const SEASONALITY = [0.7, 0.85, 1.0, 1.05, 1.1, 1.15, 1.1, 0.6, 1.15, 1.1, 1.05, 1.2];

export const INVOICES_PER_MONTH_BASE = 58;
export const PURCHASE_INVOICES_PER_MONTH = 22;

export const DATASET_DIR_RELATIVE = 'dataset';
