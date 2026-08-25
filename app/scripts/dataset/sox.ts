import { attributeDraw } from '../../src/lib/kernel/sampling';
import { controlPopulationHash } from '../../src/lib/kernel/canon';
import { DEMO_SAMPLING } from './config';
import type { ApprovalSpec, BankRecSpec } from './pdf';

// SOX side of the dataset: RCM (7 controls incl. 1 ITGC), instance populations, and
// control evidence with seeded deviations placed INSIDE the pinned attribute draw
// (ADR-015: the generator imports the same sampling kernel the app runs).

export interface RcmControl {
  code: string;
  name: string;
  description: string;
  frequency: 'many_daily' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'adhoc';
  nature: 'manual' | 'automated' | 'itdm';
  effect: 'preventive' | 'detective';
  isKey: boolean;
  itgcArea?: 'access' | 'change' | 'operations';
  owner: string;
  process: 'Order to Cash' | 'Treasury' | 'ITGC';
  riskDesc: string;
  assertions: string[];
  cosoComponent: string;
  diStatus: 'not_assessed' | 'effective' | 'deficient';
}

export const RCM: RcmControl[] = [
  {
    code: 'C-REV-01', name: 'Customer credit approval', process: 'Order to Cash',
    description: 'New orders above €20k require documented credit review and approval before shipment.',
    frequency: 'weekly', nature: 'manual', effect: 'preventive', isKey: true, owner: 'S. Marchand (CFO)',
    riskDesc: 'Revenue recognized on non-creditworthy customers; uncollectible receivables.',
    assertions: ['valuation'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
  {
    code: 'C-REV-02', name: 'Invoice-to-shipping match', process: 'Order to Cash',
    description: 'Billing system blocks invoices without a matching shipping record (automated three-way check).',
    frequency: 'many_daily', nature: 'automated', effect: 'preventive', isKey: true, owner: 'ERP (fictional)',
    riskDesc: 'Invoices issued for goods not shipped — revenue overstated (occurrence).',
    assertions: ['occurrence'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
  {
    code: 'C-REV-03', name: 'Monthly revenue analytics review', process: 'Order to Cash',
    description: 'Controller reviews monthly revenue vs budget/prior year, investigates variances > 10%.',
    frequency: 'monthly', nature: 'manual', effect: 'detective', isKey: false, owner: 'T. Girard (chef comptable)',
    riskDesc: 'Misstated revenue not detected timely.',
    assertions: ['completeness', 'accuracy'], cosoComponent: 'Monitoring', diStatus: 'not_assessed',
  },
  {
    code: 'C-REV-04', name: 'Price master change approval', process: 'Order to Cash',
    description: 'Changes to the price master require CFO approval; system logs all changes.',
    frequency: 'adhoc', nature: 'itdm', effect: 'preventive', isKey: false, owner: 'S. Marchand (CFO)',
    riskDesc: 'Unauthorized price changes distort revenue accuracy.',
    assertions: ['accuracy'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
  {
    code: 'C-BR-01', name: 'Monthly bank reconciliation', process: 'Treasury',
    description: 'Bank account 512100 reconciled to the GL within 10 days of month end; preparer and independent approver sign.',
    frequency: 'monthly', nature: 'manual', effect: 'detective', isKey: true, owner: 'T. Girard (chef comptable)',
    riskDesc: 'Cash misstatements or unrecorded transactions not detected.',
    assertions: ['existence', 'completeness'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
  {
    code: 'C-TR-01', name: 'Payment dual authorization', process: 'Treasury',
    description: 'Outgoing payments above €10k require two authorized signatories in the banking portal.',
    frequency: 'daily', nature: 'manual', effect: 'preventive', isKey: true, owner: 'S. Marchand (CFO)',
    riskDesc: 'Unauthorized or fraudulent disbursements.',
    assertions: ['existence'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
  {
    code: 'C-ITGC-01', name: 'Quarterly user access review', process: 'ITGC',
    description: 'ERP user access rights reviewed quarterly; terminations and role conflicts remediated.',
    frequency: 'quarterly', nature: 'manual', effect: 'detective', isKey: true, itgcArea: 'access', owner: 'IT manager (fictional)',
    riskDesc: 'Inappropriate access undermines automated controls and segregation of duties.',
    assertions: ['occurrence', 'accuracy'], cosoComponent: 'Control Activities', diStatus: 'effective',
  },
];

// The two OE-tested controls in the demo (07 §6 part 2): the monthly bank reconciliation
// (deviations seeded) and the weekly credit approval (clean run + the OCR-mock evidence).
export const TESTED_CONTROLS = ['C-BR-01', 'C-REV-01'] as const;
export const APPROVAL_CONTROL_CODE = 'C-REV-01';

export interface SoxDataset {
  bankRecInstances: { label: string; occurredOn: string; performer: string }[];
  bankRecSampled: string[];
  bankRecSpecs: BankRecSpec[]; // evidence PDFs to render (missing-evidence month excluded)
  approvalInstances: { label: string; occurredOn: string; performer: string }[];
  approvalSampled: string[];
  approvalSpecs: ApprovalSpec[];
  deviations: { id: string; control: string; instance: string; taxonomy: string; note: string }[];
}

function mondayOfWeek(week: number): string {
  // 2025-01-06 is the Monday of ISO week 2; week 1 starts 2024-12-30 → use Jan 6 anchor
  const base = Date.parse('2025-01-06T00:00:00Z');
  return new Date(base + (week - 2) * 7 * 86400000).toISOString().slice(0, 10);
}

export function buildSox(): SoxDataset {
  // --- C-BR-01: 12 monthly reconciliations ---
  const bankRecInstances = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const label = `2025-${String(m).padStart(2, '0')}`;
    const eom = new Date(Date.UTC(2025, m, 0));
    const occurred = new Date(eom.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return { label, occurredOn: occurred, performer: 'T. Girard' };
  });
  const brHash = controlPopulationHash(bankRecInstances.map((i) => ({ label: i.label, occurredOn: i.occurredOn, performerName: i.performer })));
  const brDraw = attributeDraw(bankRecInstances.map((i) => i.label), 3, `${DEMO_SAMPLING.sox.seed}:C-BR-01`, brHash);
  const [mA, mB, mC] = brDraw.selected;

  const deviations: SoxDataset['deviations'] = [
    { id: 'D1', control: 'C-BR-01', instance: mA, taxonomy: 'missing_approval', note: 'Reconciliation prepared but never approved (Approved by empty).' },
    { id: 'D2', control: 'C-BR-01', instance: mB, taxonomy: 'late_performance', note: 'Prepared 25 days after month end (requirement: ≤10 days).' },
    { id: 'D3', control: 'C-BR-01', instance: mB, taxonomy: 'wrong_performer', note: 'Prepared and approved by the same person (SoD conflict).' },
    { id: 'D4', control: 'C-BR-01', instance: mC, taxonomy: 'missing_evidence', note: 'No reconciliation could be provided for this month.' },
  ];

  function eomOf(label: string): Date {
    const m = Number(label.slice(5, 7));
    return new Date(Date.UTC(2025, m, 0));
  }
  // Every month of the population gets a reconciliation EXCEPT the seeded missing one
  // (D4). Only two existed before, which made an extension to the full population
  // meaningless — nine of the twelve months had nothing to test (founder review 2026-08-25).
  const bankRecSpecs: BankRecSpec[] = bankRecInstances
    .map((i) => i.label)
    .filter((label) => label !== mC)
    .map((label) => {
    const eom = eomOf(label);
    const isLate = label === mB;
    const preparedOn = new Date(eom.getTime() + (isLate ? 25 : 6) * 86400000).toISOString().slice(0, 10);
    const approvedOn = new Date(eom.getTime() + (isLate ? 26 : 8) * 86400000).toISOString().slice(0, 10);
    const missingApproval = label === mA;
    const samePerson = label === mB;
    return {
      month: label,
      preparedBy: 'T. Girard',
      preparedOn,
      approvedBy: missingApproval ? undefined : samePerson ? 'T. Girard' : 'S. Marchand',
      approvedOn: missingApproval ? undefined : approvedOn,
      bankBalanceCents: 41230000 + eom.getUTCMonth() * 1730000,
      glBalanceCents: 41230000 + eom.getUTCMonth() * 1730000 - 462000,
      reconcilingItems: [
        { label: 'Outstanding checks (fictional)', amountCents: -312000 },
        { label: 'Deposit in transit (fictional)', amountCents: -150000 },
      ],
    };
  });

  // --- C-REV-01 weekly credit approvals: 52 instances ---
  const approvalInstances = Array.from({ length: 52 }, (_, i) => ({
    label: `2025-W${String(i + 1).padStart(2, '0')}`,
    occurredOn: mondayOfWeek(i + 1),
    performer: 'S. Marchand',
  }));
  const apHash = controlPopulationHash(approvalInstances.map((i) => ({ label: i.label, occurredOn: i.occurredOn, performerName: i.performer })));
  const apDraw = attributeDraw(approvalInstances.map((i) => i.label), 5, `${DEMO_SAMPLING.sox.seed}:${APPROVAL_CONTROL_CODE}`, apHash);

  const approvalSpecs: ApprovalSpec[] = apDraw.selected.map((label, i) => ({
    ref: `CA-${label}`,
    week: label,
    customer: ['Groupe Immovance SA', 'Tertiaire Bâtir SAS', 'Constructions Peyrelle SAS', 'Habitat Confluence SAS', 'Promoteurs du Forez SA'][i],
    creditLimitCents: [4500000, 2500000, 6000000, 3000000, 8000000][i],
    reviewedBy: 'T. Girard',
    approvedBy: 'S. Marchand',
    date: mondayOfWeek(Number(label.slice(6, 8)) || 1),
    unlabeled: i === 3, // one scanned-note-style form ⇒ OCR-mock + verify UI demo
  }));

  return {
    bankRecInstances,
    bankRecSampled: brDraw.selected,
    bankRecSpecs,
    approvalInstances,
    approvalSampled: apDraw.selected,
    approvalSpecs,
    deviations,
  };
}

/** RFC4180-style quoting so free-text fields (which contain ';' and ',') survive. */
function csvCell(v: string): string {
  return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function serializeRcmCsv(): string {
  const head = 'code;name;description;frequency;nature;effect;is_key;itgc_area;owner;process;risk_desc;assertions;coso_component;di_status';
  const rows = RCM.map((c) =>
    [c.code, c.name, c.description, c.frequency, c.nature, c.effect, c.isKey ? 'yes' : 'no',
      c.itgcArea ?? '', c.owner, c.process, c.riskDesc, c.assertions.join('|'), c.cosoComponent, c.diStatus]
      .map(csvCell).join(';'),
  );
  return [head, ...rows].join('\n') + '\n';
}

export function serializeInstancesCsv(instances: { label: string; occurredOn: string; performer: string }[]): string {
  const head = 'label;occurred_on;performer';
  return [head, ...instances.map((i) => `${i.label};${i.occurredOn};${i.performer}`)].join('\n') + '\n';
}
