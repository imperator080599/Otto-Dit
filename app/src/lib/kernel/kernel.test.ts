import { describe, it, expect } from 'vitest';
import { parseAmountCents, centsToStr, fecDateToIso, populationHash, normalizeParty, naturalKey } from './canon';
import { computeFlags, defaultFlagConfig } from './flags';
import { monetaryDraw, attributeDraw, verificationDraw } from './sampling';
import { benchmarkAggregates, proposeMateriality, roundThresholdCents } from './materiality';
import { mapAccount, fsliBalances } from './fsli-map';
import { vouchRevenueLine, checksToExceptionCodes, findDuplicateInvoices } from './matching';
import { evaluateSample } from './projection';
import { proposeDeficiencySeverity } from './deficiency';
import { nepFr } from '@/lib/packs/nep-fr';
import { pcg } from '@/lib/packs/coa/pcg';
import type { GlRow, SampleUnit, TbRow } from './types';

const glRow = (over: Partial<GlRow> = {}): GlRow => ({
  naturalKey: naturalKey('VE', 'VE-1', 1),
  lineNo: 1,
  journalCode: 'VE',
  entryNo: 'VE-1',
  entryDate: '2025-06-16',
  accountNo: '411000',
  auxNo: 'C001',
  auxLabel: 'Bâtiplace SARL',
  pieceRef: 'FA2025-0101',
  pieceDate: '2025-06-16',
  debitCents: 120000,
  creditCents: 0,
  ...over,
});

describe('canon', () => {
  it('parses decimal-comma and point amounts to cents', () => {
    expect(parseAmountCents('1234,56')).toBe(123456);
    expect(parseAmountCents('1234.56')).toBe(123456);
    expect(parseAmountCents('')).toBe(0);
    expect(parseAmountCents('0,10')).toBe(10);
    expect(() => parseAmountCents('abc')).toThrow();
    expect(centsToStr(123456)).toBe('1234.56');
    expect(centsToStr(-5)).toBe('-0.05');
  });

  it('converts FEC dates and rejects invalid calendars', () => {
    expect(fecDateToIso('20251231')).toBe('2025-12-31');
    expect(() => fecDateToIso('20251301')).toThrow();
    expect(() => fecDateToIso('2025123')).toThrow();
  });

  it('population hash is order-independent and content-sensitive', () => {
    const a = glRow({ naturalKey: 'VE|1|1', entryNo: '1', entryDate: '2025-01-02' });
    const b = glRow({ naturalKey: 'VE|2|1', entryNo: '2', entryDate: '2025-01-03' });
    const h1 = populationHash([a, b]);
    const h2 = populationHash([b, a]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^pophash-v1:/);
    const h3 = populationHash([a, { ...b, creditCents: 999 }]);
    expect(h3).not.toBe(h1);
  });

  it('normalizes party names (accents, legal forms, punctuation)', () => {
    expect(normalizeParty('Bâtiplace SARL')).toBe('BATIPLACE');
    expect(normalizeParty('BATIPLACE S.A.R.L.')).toBe('BATIPLACE');
    expect(normalizeParty('Vitrage & Co SAS')).toBe('VITRAGE'); // '& Co' + 'SAS' are legal-form noise
  });
});

describe('JE risk flags (ADR-003)', () => {
  const cfg = defaultFlagConfig('2025-12-31');

  it('flags weekend, round amount, manual journal, period end', () => {
    const rows = computeFlags(
      [
        glRow({ entryDate: '2025-06-14', journalCode: 'OD', debitCents: 0, creditCents: 500000 }), // Sat + OD + round 5000,00
        glRow({ naturalKey: 'VE|2|1', entryNo: '2', entryDate: '2025-12-30' }), // period end
        glRow({ naturalKey: 'VE|3|1', entryNo: '3', entryDate: '2025-06-16' }), // clean
      ],
      cfg,
    );
    expect(rows[0].flags).toEqual(expect.arrayContaining(['weekend', 'round_amount', 'manual_journal']));
    expect(rows[1].flags).toContain('period_end');
    expect(rows[2].flags).toEqual([]);
  });

  it('flags credit-note patterns per counterparty (≥3 credit notes)', () => {
    const cn = (n: number) =>
      glRow({
        naturalKey: `VE|cn${n}|1`,
        entryNo: `cn${n}`,
        accountNo: '701000',
        debitCents: 10000,
        creditCents: 0,
        pieceRef: `AV2025-${n}`,
        auxNo: 'C009',
      });
    const rows = computeFlags([cn(1), cn(2), cn(3), glRow({ auxNo: 'C009' })], cfg);
    expect(rows[0].flags).toContain('credit_note_pattern');
    expect(rows[3].flags).not.toContain('credit_note_pattern');
  });

  /* Lot 6, tranche 3 (NEP 240) : `late_validation` — précédent SQL déjà exercé
   * par `risk.ts:177` (« validation après la clôture »), repris ici comme
   * comparaison pure. CAS CONNU MAUVAIS (règle 17) : une ligne validée AVANT
   * la clôture ne doit PAS porter le drapeau — sans cette assertion, un
   * comparateur inversé (`<` au lieu de `>`) passerait la première moitié du
   * test tout en marquant TOUT le monde en retard. */
  it('flags late validation (valid_date after period end, ADR-003 — précédent risk.ts:177)', () => {
    const rows = computeFlags(
      [
        glRow({ naturalKey: 'VE|late|1', entryNo: 'late', entryDate: '2025-06-16', validDate: '2026-01-15' }),
        glRow({ naturalKey: 'VE|ontime|1', entryNo: 'ontime', entryDate: '2025-06-16', validDate: '2025-12-20' }),
        glRow({ naturalKey: 'VE|unvalidated|1', entryNo: 'unvalidated', entryDate: '2025-06-16', validDate: undefined }),
      ],
      cfg,
    );
    expect(rows[0].flags).toContain('late_validation');
    expect(rows[1].flags).not.toContain('late_validation');
    expect(rows[2].flags).not.toContain('late_validation');
  });
});

describe('sampling engine', () => {
  const units: SampleUnit[] = Array.from({ length: 100 }, (_, i) => ({
    id: `u${String(i).padStart(3, '0')}`,
    amountCents: (i + 1) * 10000,
    flags: i === 7 ? ['weekend'] : [],
  }));

  it('monetary draw: coverage + risk flags + seeded random, deterministic', () => {
    const params = { coverageCapCents: 900000, randomSize: 10, seed: 'demo-1' };
    const r1 = monetaryDraw(units, params, 'pophash-v1:x');
    const r2 = monetaryDraw(units, params, 'pophash-v1:x');
    expect(r1.selections).toEqual(r2.selections);
    const high = r1.selections.filter((s) => s.reason === 'high_value');
    expect(high.length).toBe(11); // (i+1)*10000 ≥ 900000 ⇒ i ∈ [89..99] ⇒ 11 items
    expect(high.every((s) => s.amountCents >= 900000)).toBe(true);
    expect(r1.selections.filter((s) => s.reason === 'risk_flag').map((s) => s.id)).toEqual(['u007']);
    expect(r1.selections.filter((s) => s.reason === 'random').length).toBe(10);
    // different population hash ⇒ different random draw
    const r3 = monetaryDraw(units, params, 'pophash-v1:y');
    expect(r3.selections.filter((s) => s.reason === 'random')).not.toEqual(
      r1.selections.filter((s) => s.reason === 'random'),
    );
  });

  it('attribute draw is deterministic and sized', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
    const d1 = attributeDraw(labels, 3, 'seed-a', 'pophash-v1:c');
    const d2 = attributeDraw(labels, 3, 'seed-a', 'pophash-v1:c');
    expect(d1.selected).toEqual(d2.selected);
    expect(d1.selected.length).toBe(3);
  });

  it('verification draw respects rate and minimum', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
    const v = verificationDraw(ids, 0.1, 3, 'seed-v');
    expect(v.selected.length).toBe(3);
    const v2 = verificationDraw(ids, 0.5, 3, 'seed-v');
    expect(v2.selected.length).toBe(10);
  });
});

describe('materiality (NEP pack)', () => {
  const tb: TbRow[] = [
    { accountNo: '701000', label: 'Ventes', debitCents: 0, creditCents: 850000000, balanceCents: -850000000 },
    { accountNo: '601000', label: 'Achats', debitCents: 500000000, creditCents: 0, balanceCents: 500000000 },
    { accountNo: '641000', label: 'Salaires', debitCents: 280000000, creditCents: 0, balanceCents: 280000000 },
    { accountNo: '411000', label: 'Clients', debitCents: 120000000, creditCents: 0, balanceCents: 120000000 },
    { accountNo: '101000', label: 'Capital', debitCents: 0, creditCents: 50000000, balanceCents: -50000000 },
  ];

  it('aggregates benchmarks and proposes PBT when meaningful', () => {
    const agg = benchmarkAggregates(tb);
    expect(agg.revenueCents).toBe(850000000);
    expect(agg.pbtCents).toBe(70000000); // 8.5M - 5.0M - 2.8M = 0.7M €
    const prop = proposeMateriality(tb, nepFr);
    expect(prop.benchmarkCode).toBe('pbt');
    expect(prop.amountCents).toBe(roundThresholdCents(70000000 * 0.05));
    expect(prop.teAmountCents).toBe(prop.perfAmountCents); // TE default = PM (pack)
    expect(prop.cttAmountCents).toBeLessThan(prop.amountCents);
  });

  /* LA PRÉFÉRENCE POSÉE À LA CRÉATION (1.1) : suivie quand elle est
     représentative, NOMMÉE quand elle ne l'est pas. Le cas mauvais : « PBT »
     préféré sur une entité en perte donnait 1 000 € de seuil sur une base
     négative (revue hostile n°4). */
  it('a creation-time benchmark preference is followed when representative, refused and named otherwise', () => {
    const pref = proposeMateriality(tb, nepFr, 'revenue');
    expect(pref.benchmarkCode).toBe('revenue');
    expect(pref.basis.rule).toMatch(/preferred at engagement creation/);
    expect(pref.basis.rule).toMatch(/would have chosen pbt/);
    expect(pref.basis.rule).not.toMatch(/0000000/);           // 0.7000000000000001% is not a percentage

    const enPerte = tb.map((r) => r.accountNo === '601000'
      ? { ...r, debitCents: 900000000, balanceCents: 900000000 } : r);   // charges > produits : perte
    const perte = benchmarkAggregates(enPerte);
    expect(perte.pbtCents).toBeLessThan(0);
    const refus = proposeMateriality(enPerte, nepFr, 'pbt');
    expect(refus.benchmarkCode).toBe('revenue');
    expect(refus.benchmarkAmountCents).toBe(perte.revenueCents);
    expect(refus.basis.rule).toMatch(/NOT applied/);
    expect(refus.amountCents).toBeGreaterThan(100000);       // pas le plancher d'arrondi sur une base négative
  });
});

describe('FSLI mapping (PCG)', () => {
  it('maps by longest prefix and applies overrides', () => {
    expect(mapAccount('701000', pcg.rules)).toBe('REVENUE');
    expect(mapAccount('709000', pcg.rules)).toBe('REVENUE');
    expect(mapAccount('411000', pcg.rules)).toBe('TRADE_RECEIVABLES');
    expect(mapAccount('419000', pcg.rules)).toBe('OTHER_PAYABLES');
    expect(mapAccount('512000', pcg.rules)).toBe('CASH');
    expect(mapAccount('519000', pcg.rules)).toBe('FINANCIAL_DEBT');
    expect(mapAccount('999999', pcg.rules)).toBeNull();
    const balances = fsliBalances(
      [
        { accountNo: '701000', balanceCents: -100 },
        { accountNo: '706000', balanceCents: -50 },
      ],
      pcg,
    );
    expect(balances.get('REVENUE')).toBe(-150);
  });
});

describe('vouching (kernel matching)', () => {
  const tol = nepFr.substantive!.tolerances;

  it('passes a clean invoice within tolerances', () => {
    const checks = vouchRevenueLine(
      {
        gl: glRow({ accountNo: '701000', debitCents: 0, creditCents: 120000 }),
        clientPartyName: 'Altiverre SAS',
        invoice: {
          invoiceNumber: 'FA2025-0101',
          invoiceDate: '2025-06-16',
          buyerName: 'Bâtiplace SARL',
          totalNetCents: 120000,
          lines: [{ qty: 4, unitPriceCents: 30000, netCents: 120000 }],
        },
        requireDelivery: true,
        delivery: { deliveryNoteNumber: 'BL-1', qtyTotal: 4, deliveryDate: '2025-06-14' },
      },
      tol,
    );
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it('detects amount, qty, cutoff, missing-document failures with the right taxonomy', () => {
    const base = {
      gl: glRow({ accountNo: '701000', debitCents: 0, creditCents: 120000, entryDate: '2025-12-30', pieceDate: '2025-12-30' }),
      clientPartyName: 'Altiverre SAS',
      requireDelivery: true,
    };
    const missing = vouchRevenueLine({ ...base, invoice: undefined }, tol);
    expect(checksToExceptionCodes(missing)).toContain('missing_document');

    const wrongAmount = vouchRevenueLine(
      { ...base, invoice: { invoiceDate: '2025-12-30', totalNetCents: 150000 }, delivery: { qtyTotal: 4 } },
      tol,
    );
    expect(checksToExceptionCodes(wrongAmount)).toContain('amount_mismatch');

    const cutoff = vouchRevenueLine(
      { ...base, invoice: { invoiceDate: '2026-01-05', totalNetCents: 120000 }, delivery: { qtyTotal: 1 } },
      tol,
    );
    expect(checksToExceptionCodes(cutoff)).toContain('cutoff');

    const qty = vouchRevenueLine(
      {
        ...base,
        invoice: { invoiceDate: '2025-12-30', totalNetCents: 120000, lines: [{ qty: 4, unitPriceCents: 30000, netCents: 120000 }] },
        delivery: { qtyTotal: 3 },
      },
      tol,
    );
    expect(checksToExceptionCodes(qty)).toContain('qty_mismatch');
  });

  it('finds duplicate invoice numbers across items', () => {
    const dupes = findDuplicateInvoices([
      { unitId: 'a', invoice: { invoiceNumber: 'FA-1' } },
      { unitId: 'b', invoice: { invoiceNumber: 'FA-1' } },
      { unitId: 'c', invoice: { invoiceNumber: 'FA-2' } },
    ]);
    expect(dupes.get('FA-1')).toEqual(['a', 'b']);
    expect(dupes.has('FA-2')).toBe(false);
  });
});

describe('sample evaluation / projection (Gate 2, ISA/NEP 530 — mandat 2026-09-14 §1)', () => {
  // Trois quantités jamais confondues (§1.2) : known = strate EXHAUSTIVE seulement (jamais
  // la strate sondée, EXTRAP-02) ; projected = extrapolation de la strate SONDÉE ; total =
  // known + projected.
  it('ratio : projette (écart / valeur comptable échantillon) × valeur comptable population SONDÉE', () => {
    const r = evaluateSample({
      method: 'ratio',
      populationAmountCents: 1000000,
      coverageAmountCents: 600000,
      populationSize: 100,
      coverageCount: 10,
      randomTestedAmountCents: 100000,
      randomTestedCount: 20,
      coverageMisstatementCents: 5000,
      randomMisstatements: [{ amountCents: 2000, itemAmountCents: 5000 }],
      teAmountCents: 50000,
    });
    // population sondée = 1 000 000 − 600 000 = 400 000 ; projection = (2000/100000) × 400000
    expect(r.projectedMisstatementCents).toBe(8000);
    expect(r.knownMisstatementCents).toBe(5000); // la strate exhaustive SEULE — jamais +2000
    expect(r.totalKnownPlusProjectedCents).toBe(13000);
    expect(r.untestedAmountCents).toBe(300000); // 400 000 sondée − 100 000 réellement testé
    expect(r.projectionMethod).toBe('ratio');
    expect(r.withinTolerable).toBe(true);
  });

  it('ratio : flags totals above tolerable misstatement', () => {
    const r = evaluateSample({
      method: 'ratio',
      populationAmountCents: 1000000,
      coverageAmountCents: 0,
      populationSize: 100,
      coverageCount: 0,
      randomTestedAmountCents: 100000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [{ amountCents: 10000, itemAmountCents: 10000 }],
      teAmountCents: 50000,
    });
    expect(r.projectedMisstatementCents).toBe(100000); // (10000/100000) × 1 000 000
    expect(r.withinTolerable).toBe(false);
  });

  it('difference : projette (écart total ÷ n) × N — des COMPTES, jamais des montants', () => {
    const r = evaluateSample({
      method: 'difference',
      populationAmountCents: 500000,
      coverageAmountCents: 0,
      populationSize: 50,
      coverageCount: 0,
      randomTestedAmountCents: 50000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [
        { amountCents: 1000, itemAmountCents: 5000 },
        { amountCents: -200, itemAmountCents: 5000 },
      ],
      teAmountCents: 50000,
    });
    // écart total échantillon = 800 ; ÷ n(10) × N(50) = 4000
    expect(r.projectedMisstatementCents).toBe(4000);
    expect(r.projectionMethod).toBe('difference');
  });

  it('unités monétaires : entachement PAR LIGNE (écart ÷ valeur comptable) × intervalle de sondage', () => {
    const r = evaluateSample({
      method: 'unites_monetaires',
      populationAmountCents: 500000,
      coverageAmountCents: 0,
      populationSize: 50,
      coverageCount: 0,
      randomTestedAmountCents: 50000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [{ amountCents: 500, itemAmountCents: 5000 }], // entachement 10 %
      teAmountCents: 50000,
    });
    // intervalle = 500 000 (population sondée) ÷ 10 (n) = 50 000 ; projection = 10 % × 50 000
    expect(r.projectedMisstatementCents).toBe(5000);
    expect(r.projectionMethod).toBe('unites_monetaires');
  });

  it('unités monétaires : une ligne sans valeur comptable (0) est exclue, jamais une division par zéro', () => {
    const r = evaluateSample({
      method: 'unites_monetaires',
      populationAmountCents: 500000,
      coverageAmountCents: 0,
      populationSize: 50,
      coverageCount: 0,
      randomTestedAmountCents: 50000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [{ amountCents: 500, itemAmountCents: 0 }],
      teAmountCents: 50000,
    });
    expect(Number.isFinite(r.projectedMisstatementCents)).toBe(true);
    expect(r.projectedMisstatementCents).toBe(0);
  });

  it('EXTRAP-02 : un écart de la strate EXHAUSTIVE ne change jamais la projection', () => {
    const base = {
      method: 'ratio' as const,
      populationAmountCents: 1000000,
      coverageAmountCents: 600000,
      populationSize: 100,
      coverageCount: 10,
      randomTestedAmountCents: 100000,
      randomTestedCount: 20,
      randomMisstatements: [{ amountCents: 2000, itemAmountCents: 5000 }],
      teAmountCents: 50000,
    };
    const petit = evaluateSample({ ...base, coverageMisstatementCents: 1000 });
    const grand = evaluateSample({ ...base, coverageMisstatementCents: 900000 });
    // seul le CONNU bouge — la projection ne voit jamais coverageMisstatementCents
    expect(petit.projectedMisstatementCents).toBe(grand.projectedMisstatementCents);
    expect(petit.knownMisstatementCents).toBe(1000);
    expect(grand.knownMisstatementCents).toBe(900000);
  });

  it('EXTRAP-04 : méthode non vérifiée (null/undefined) ⇒ aucune projection, jamais devinée', () => {
    const input = {
      populationAmountCents: 1000000,
      coverageAmountCents: 0,
      populationSize: 100,
      coverageCount: 0,
      randomTestedAmountCents: 100000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [{ amountCents: 10000, itemAmountCents: 10000 }],
      teAmountCents: 50000,
    };
    for (const method of [null, undefined]) {
      const r = evaluateSample({ ...input, method });
      expect(r.projectionMethod).toBe('none');
      expect(r.projectedMisstatementCents).toBe(0);
      // randomMisstatementCents/randomMisstatementCount restent calculés MÊME méthode non
      // vérifiée (règle 19 : la donnée qui distingue les deux causes de 'none' — EXTRAP-01,
      // evaluation.ts — doit survivre au court-circuit d'EXTRAP-04, sinon rien ne pourrait
      // jamais les départager en aval).
      expect(r.randomMisstatementCents).toBe(10000);
      expect(r.randomMisstatementCount).toBe(1);
    }
  });

  it('EXTRAP-01 : `randomMisstatementCount` distingue une strate sondée PROPRE (rien à extrapoler) d’une strate qui PORTE un écart — même méthode non vérifiée dans les deux cas', () => {
    const base = {
      method: null,
      populationAmountCents: 1000000,
      coverageAmountCents: 0,
      populationSize: 100,
      coverageCount: 0,
      randomTestedAmountCents: 100000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      teAmountCents: 50000,
    };
    const propre = evaluateSample({ ...base, randomMisstatements: [] });
    expect(propre.projectionMethod).toBe('none');
    expect(propre.randomMisstatementCents).toBe(0); // mandat §1.6 point 1 : PAS d’écart ⇒ conclûable
    expect(propre.randomMisstatementCount).toBe(0);
    const porteEcart = evaluateSample({ ...base, randomMisstatements: [{ amountCents: 500, itemAmountCents: 5000 }] });
    expect(porteEcart.projectionMethod).toBe('none');
    expect(porteEcart.randomMisstatementCents).toBe(500); // mandat §1.6 point 1 : un écart ⇒ EXTRAP-01 bloque
    expect(porteEcart.randomMisstatementCount).toBe(1);
  });

  it('EXTRAP-01 (revue hostile, round 2, DEUX voix indépendantes convergentes) : deux écarts RÉELS qui se compensent exactement (+500/-500) ne doivent PAS se lire comme une strate propre — `randomMisstatementCount` reste 2 quand `randomMisstatementCents` retombe à 0', () => {
    // Cas fabriqué exact des deux revues hostiles du 2026-09-14 : une facture survalorisée de
    // 500 et une autre sous-valorisée de 500, deux lignes DISTINCTES, chacune un vrai écart non
    // corrigé et non investigué. La somme SIGNÉE (randomMisstatementCents) est 0 — si EXTRAP-01
    // se branchait dessus (round 1 du correctif), la strate se lirait PROPRE à tort. Le mandat
    // (§1.6 point 1 : « un poste sondé AVEC UN ÉCART ») parle de la PRÉSENCE d'écarts, jamais de
    // leur somme nette : `randomMisstatementCount` (le nombre de lignes) est le signal correct.
    const r = evaluateSample({
      method: null,
      populationAmountCents: 1000000,
      coverageAmountCents: 0,
      populationSize: 100,
      coverageCount: 0,
      randomTestedAmountCents: 100000,
      randomTestedCount: 10,
      coverageMisstatementCents: 0,
      randomMisstatements: [
        { amountCents: 50000, itemAmountCents: 500000 },
        { amountCents: -50000, itemAmountCents: 500000 },
      ],
      teAmountCents: 50000,
    });
    expect(r.projectionMethod).toBe('none');
    expect(r.randomMisstatementCents).toBe(0); // la somme signée trompe — ce n'est PAS le signal du refus
    expect(r.randomMisstatementCount).toBe(2); // le compte dit la vérité : deux écarts existent
  });

  it('un échantillon ENTIÈREMENT exhaustif (aucune strate sondée) ne projette rien, même méthode posée', () => {
    const r = evaluateSample({
      method: 'ratio',
      populationAmountCents: 1000000,
      coverageAmountCents: 1000000,
      populationSize: 100,
      coverageCount: 100,
      randomTestedAmountCents: 0,
      randomTestedCount: 0,
      coverageMisstatementCents: 5000,
      randomMisstatements: [],
      teAmountCents: 50000,
    });
    expect(r.projectionMethod).toBe('none');
    expect(r.projectedMisstatementCents).toBe(0);
    expect(r.knownMisstatementCents).toBe(5000);
  });
});

describe('deficiency ladder (Q7)', () => {
  const ladder = { significantPctOfMateriality: 0.2, materialPctOfMateriality: 1.0 };

  it('escalates by magnitude, key-control and compensating-control facts', () => {
    const low = proposeDeficiencySeverity({
      deviationsCount: 1, sampleSize: 3, isKeyControl: true, compensatingControl: true,
      magnitudeExposureCents: 10000, materialityCents: 100000, ladder,
    });
    expect(low.severity).toBe('deficiency');

    const sig = proposeDeficiencySeverity({
      deviationsCount: 1, sampleSize: 3, isKeyControl: false, compensatingControl: false,
      magnitudeExposureCents: 30000, materialityCents: 100000, ladder,
    });
    expect(sig.severity).toBe('significant_deficiency');

    const mw = proposeDeficiencySeverity({
      deviationsCount: 2, sampleSize: 3, isKeyControl: true, compensatingControl: false,
      magnitudeExposureCents: 120000, materialityCents: 100000, ladder,
    });
    expect(mw.severity).toBe('material_weakness');
    expect(mw.basis.rule).toMatch(/material weakness/);
  });
});
