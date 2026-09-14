// Sample evaluation & misstatement projection (Gate 2, audit-partner lens; ISA/NEP 530 —
// mandat 2026-09-14, docs/MANDATS/2026-09-14_mandat_extrapolation_automatisation_notifications.md,
// §1, citant ISA 530 §12-15/§A20/§5(e) mot pour mot). Trois quantités, jamais confondues (§1.2) :
//
//   écart connu    — les écarts RÉELS des lignes testées à 100 % (la strate EXHAUSTIVE)
//   écart projeté  — la projection des écarts de la strate SONDÉE à SA population
//   écart total    — connu + projeté, comparé au seuil (TE)
//
// EXTRAP-02 : ON NE PROJETTE JAMAIS SUR LA STRATE EXHAUSTIVE — une ligne testée à 100 % porte
// son écart réel ; lui appliquer une projection compterait deux fois. `projectMisstatement`
// ne reçoit QUE les écarts de la strate sondée (`randomMisstatements`) ; il n'a même pas accès
// aux montants de la strate exhaustive pour les projeter par erreur — la garde est structurelle,
// pas seulement testée après coup.
//
// EXTRAP-04 : la méthode (`unites_monetaires` | `ratio` | `difference`) est un PARAMÈTRE DE
// CABINET (`SubstantiveConfig.extrapolationMethod`, packs/types.ts), jamais une constante du
// dépôt — ISA 530 §14 EXIGE la projection mais NE DONNE AUCUNE FORMULE (§1.1). `method: null`
// (le paramètre n'est pas posé) ⇒ `method:'none'`, `projectedCents:0` : aucune projection ne
// s'affiche tant que le cabinet ne l'a pas fixée.
//
// CE QUE CE FICHIER NE FAIT PAS (règle 19) : il ne lit RIEN de la base et ne connaît rien du
// pack — ce sont les APPELANTS (`evaluation.ts`) qui résolvent `extrapolationMethod` et
// rassemblent les montants par strate. Il ne gère pas non plus l'anomalie ÉCARTÉE (EXTRAP-03,
// §1.4) — un écart qu'un auditeur retire de la projection reste une décision humaine documentée
// ailleurs (evaluation.ts) ; ce fichier projette ce qu'on lui donne, rien de plus.

export type ExtrapolationMethod = 'unites_monetaires' | 'ratio' | 'difference';

export interface MisstatementLine {
  /** `misstatement.amount` — le montant DÉJÀ SIGNÉ (valeur comptable − valeur auditée) de
   *  cette ligne d'écart. */
  amountCents: number;
  /** `sample_item.amount` — la valeur comptable de l'ÉLÉMENT échantillonné portant cette
   *  ligne (nécessaire pour l'entachement de la méthode « unités monétaires »). */
  itemAmountCents: number;
}

export interface ProjectionInput {
  /** `undefined`/`null` : paramètre de cabinet non posé (EXTRAP-04). */
  method: ExtrapolationMethod | null | undefined;
  populationAmountCents: number; // sample.population_amount — la population ENTIÈRE
  coverageAmountCents: number;   // sample.coverage_amount — la strate EXHAUSTIVE (100 % testée)
  populationSize: number;        // sample.population_size — le compte TOTAL de la population
  coverageCount: number;         // compte d'éléments dans la strate exhaustive (high_value+risk_flag)
  randomTestedAmountCents: number; // valeur comptable réellement testée, strate SONDÉE
  randomTestedCount: number;       // compte d'éléments testés, strate SONDÉE
  /** Écarts de la strate SONDÉE UNIQUEMENT — jamais ceux de la strate exhaustive (EXTRAP-02). */
  randomMisstatements: MisstatementLine[];
}

export interface ProjectionResult {
  method: ExtrapolationMethod | 'none';
  projectedCents: number;
}

/** La population « sondée » — celle dont la strate aléatoire est un échantillon, jamais
 *  la population entière (qui inclurait la strate exhaustive, comptée à part). */
function populationSondee(input: Pick<ProjectionInput, 'populationAmountCents' | 'coverageAmountCents' | 'populationSize' | 'coverageCount'>) {
  return {
    amountCents: Math.max(0, input.populationAmountCents - input.coverageAmountCents),
    count: Math.max(0, input.populationSize - input.coverageCount),
  };
}

export function projectMisstatement(input: ProjectionInput): ProjectionResult {
  if (!input.method || input.randomTestedCount === 0 || input.randomTestedAmountCents === 0) {
    return { method: 'none', projectedCents: 0 };
  }
  const sondee = populationSondee(input);
  const randomMisstatementTotalCents = input.randomMisstatements.reduce((s, m) => s + m.amountCents, 0);

  if (input.method === 'unites_monetaires') {
    // entachement = (valeur comptable − valeur auditée) ÷ valeur comptable, PAR LIGNE ;
    // projection = somme des entachements × intervalle de sondage (mandat §1.3).
    const intervalCents = sondee.amountCents / input.randomTestedCount;
    const taintSum = input.randomMisstatements.reduce((s, m) => (
      m.itemAmountCents === 0 ? s : s + m.amountCents / m.itemAmountCents
    ), 0);
    return { method: 'unites_monetaires', projectedCents: Math.round(taintSum * intervalCents) };
  }
  if (input.method === 'ratio') {
    // projection = (écart total de l'échantillon ÷ valeur comptable de l'échantillon)
    //            × valeur comptable de la population (mandat §1.3) — « la population », ici,
    // c'est celle de la strate SONDÉE (§1.2 : « la projection des écarts de la strate sondée
    // à SA population ») — jamais la population entière, qui recompterait la strate exhaustive.
    const projected = (randomMisstatementTotalCents / input.randomTestedAmountCents) * sondee.amountCents;
    return { method: 'ratio', projectedCents: Math.round(projected) };
  }
  // difference : projection = (écart total de l'échantillon ÷ n) × N — n et N sont des
  // COMPTES d'éléments, pas des montants (mandat §1.3).
  const avgDiffCents = randomMisstatementTotalCents / input.randomTestedCount;
  return { method: 'difference', projectedCents: Math.round(avgDiffCents * sondee.count) };
}

export interface EvaluationInput {
  method: ExtrapolationMethod | null | undefined;
  populationAmountCents: number;
  coverageAmountCents: number;
  populationSize: number;
  coverageCount: number;
  randomTestedAmountCents: number;
  randomTestedCount: number;
  /** Écarts CONNUS — strate exhaustive uniquement (mandat §1.2). */
  coverageMisstatementCents: number;
  /** Écarts de la strate sondée — projetés, jamais comptés deux fois comme « connus ». */
  randomMisstatements: MisstatementLine[];
  teAmountCents: number;
}

export interface EvaluationResult {
  knownMisstatementCents: number;
  projectedMisstatementCents: number;
  projectionMethod: ExtrapolationMethod | 'none';
  /** L'écart BRUT (non projeté) de la strate sondée — révisé le 2026-09-14 (revue hostile, deux
   *  voix indépendantes) : `projectionMethod === 'none'` a DEUX causes (aucune strate sondée,
   *  OU une strate sondée avec un écart mais une méthode non vérifiée, EXTRAP-04) que rien
   *  d'autre dans ce résultat ne distingue — la méthode `'none'` ne dit pas laquelle. Ce champ
   *  tranche : nul ⇒ rien à extrapoler (les deux premières causes) ; non nul avec
   *  `projectionMethod === 'none'` ⇒ EXTRAP-04 (la vraie cause d'EXTRAP-01, mandat §1.6 point 1
   *  : « un poste sondé AVEC UN ÉCART »). */
  randomMisstatementCents: number;
  /** Ce qui reste au-delà de ce qui a été RÉELLEMENT testé dans la strate sondée — jamais la
   *  population sondée entière (qui inclut le testé). Nom conservé identique à la colonne
   *  `sample_evaluation.untested_amount` (0002_testing.sql) : renommer la colonne pour y loger
   *  autre chose aurait menti sur ce qu'elle contient (règle 13). */
  untestedAmountCents: number;
  totalKnownPlusProjectedCents: number;
  teAmountCents: number;
  withinTolerable: boolean;
}

export function evaluateSample(input: EvaluationInput): EvaluationResult {
  const projection = projectMisstatement({
    method: input.method,
    populationAmountCents: input.populationAmountCents,
    coverageAmountCents: input.coverageAmountCents,
    populationSize: input.populationSize,
    coverageCount: input.coverageCount,
    randomTestedAmountCents: input.randomTestedAmountCents,
    randomTestedCount: input.randomTestedCount,
    randomMisstatements: input.randomMisstatements,
  });
  const known = input.coverageMisstatementCents;
  const total = known + projection.projectedCents;
  const sondee = populationSondee(input);
  return {
    knownMisstatementCents: known,
    projectedMisstatementCents: projection.projectedCents,
    projectionMethod: projection.method,
    randomMisstatementCents: input.randomMisstatements.reduce((s, m) => s + m.amountCents, 0),
    untestedAmountCents: Math.max(0, sondee.amountCents - input.randomTestedAmountCents),
    totalKnownPlusProjectedCents: total,
    teAmountCents: input.teAmountCents,
    withinTolerable: Math.abs(total) <= input.teAmountCents,
  };
}
