// P1-01 (AUD-01, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §Phase 1). Le catalogue COMPLET
// des types de proposition que la table `proposition` (0170_proposition.sql) sait porter — le
// même catalogue que le plan maître liste au complet, pour que la colonne `object_type` n'ait
// jamais besoin d'un ALTER quand une future tranche branche un type de plus.
//
// TOUS LES TYPES NE SONT PAS BRANCHÉS AUJOURD'HUI (règle 13 : jamais plus que ce qui est
// construit). `WIRED` dit lesquels ont un applicateur réel dans `applicateurs.ts` — les quatre
// familles qui existent déjà dans `notifications.ts` (materiality, deficiency, walkthrough_gap,
// extraction_field), parce que ce sont les seules pour lesquelles P1-01 backfille des lignes
// (0170_proposition.sql, la partie `insert ... select`) et pour lesquelles AUD-01 mesure une
// parité de compte. Les neuf autres sont CATALOGUÉS (la colonne les accepte, `assertMembreDe`
// n'a rien à en faire puisque `proposition` résout son dossier par sa propre colonne
// `engagement_id`) mais leur applicateur n'existe pas : `proposer()`/`accepter()`/`modifier()`
// dessus lèvent PROP-03, nommément, plutôt que d'échouer en silence ou de deviner un geste.
// Reporté : R136 (docs/BACKLOG_REPORTE.md), un par type, à lever quand la tâche qui le nomme
// (P1-06, P1-07, P3-01, Phase 4) le branche réellement.

export type ObjectType =
  | 'materiality'
  | 'fsli_analytique'
  | 'extraction_field'
  | 'assertion_risk'
  | 'deficiency'
  | 'walkthrough_gap'
  | 'transcript_gap'
  | 'process_step'
  | 'wp_extra_cell'
  | 'scoping'
  | 'carry_forward'
  | 'risk_factor'
  | 'fs_tie';

export const OBJECT_TYPES: readonly ObjectType[] = [
  'materiality', 'fsli_analytique', 'extraction_field', 'assertion_risk', 'deficiency',
  'walkthrough_gap', 'transcript_gap', 'process_step', 'wp_extra_cell', 'scoping',
  'carry_forward', 'risk_factor', 'fs_tie',
];

/** Les quatre familles dont l'applicateur est réellement branché (applicateurs.ts). */
export const WIRED: readonly ObjectType[] = ['materiality', 'deficiency', 'walkthrough_gap', 'extraction_field'];
