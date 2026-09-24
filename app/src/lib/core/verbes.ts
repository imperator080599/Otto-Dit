// LE REGISTRE DES VERBES (P1-10, AUD-12).
//
// CE QUI MANQUAIT : `EventInput.verb` (lib/core/events.ts) est un `string` nu — rien
// n'empêchait deux services de nommer le MÊME fait différemment. C'est arrivé une fois,
// mesuré par balayage direct (pas cité de mémoire, règle 31) : `engagement.created`
// (services/engagement.ts, le chemin réel) et `engagement_created` (seed.ts, le
// semeur) désignent tous les deux « une mission a été créée », mais un consommateur
// qui filtre `event_log` sur l'un des deux spellings manque l'autre. Un type nommé
// (`Verbe`) et un registre FERMÉ empêchent une TROISIÈME graphie de naître demain.
//
// CE REGISTRE EST ENGENDRÉ, PAS DEVINÉ — ET SA PREMIÈRE MESURE ÉTAIT FAUSSE (règle 13,
// corrigée le jour même). Un premier balayage (`grep -oh "verb: '...'"`) ne voyait que
// les verbes écrits en LITTÉRAL DIRECT après `verb:` — 158 trouvés, 159 avec les deux
// verbes neufs de cette tranche. Il manquait TOUT verbe choisi par un TERNAIRE
// (`verb: statut === 'x' ? 'a.b' : 'a.c'`, le patron le plus courant de ce dépôt pour
// distinguer deux issues d'un même geste — 13 fichiers, 26 verbes) et un verbe construit
// par GABARIT (`` verb: `review_note_${to}` ``, workpapers/lifecycle.ts — `to` est un
// type fermé `'addressed' | 'closed'`, donc ENUMÉRABLE : les deux résolutions sont au
// registre, jamais le gabarit lui-même). Un second balayage, qui lit tout le texte entre
// `verb:` et le `objectType:` qui suit TOUJOURS dans ce dépôt (vérifié : aucune
// exception), puis extrait CHAQUE littéral qu'il contient, trouve 189 verbes réels — 187
// ici (deux, `test_event`/`essai_garde`, sont des sondes de harnais, voir plus bas).
//
// CE QUE CE FICHIER NE FAIT PAS (règle 19) : il ne choisit AUCUNE convention entre
// `snake_case` et `dot.notation` — les deux cohabitent, historiques, jamais
// renommées en masse (un renommage silencieux casserait toute requête déjà écrite
// contre `event_log`). Il ferme seulement la porte à un DOUBLON futur du même fait. Il
// ne peut pas non plus garantir qu'un FUTUR verbe construit par gabarit avec une
// variable non fermée (un type `string` large, pas une union) reste énumérable — ce
// cas-là devra être résolu au cas par cas, comme `review_note_${to}` l'a été ici.

export const VERBES = [
  'acceptance.accepted',
  'acceptance.answered',
  'acceptance.declined',
  'acceptance.opened',
  'account_detail_imported',
  'account_detail_rapproche',
  'analytique.proposee',
  'analytique.redigee',
  'attribute_sample_drawn',
  'attribute_testing_completed',
  'automation_level.changed',
  'aux_balance_imported',
  'aux_balance_questions_drafted',
  'carry_forward.dismissed',
  'carry_forward.proposed',
  'carry_forward.reconfirmed',
  'circularisation.ecart_explique',
  'circularisation.envoi_simule',
  'circularisation.listing_importe',
  'circularisation.questions_redigees',
  'circularisation.reponse_saisie',
  'clarification_batch_drafted',
  'clarification_drafted',
  'coa_override_added',
  'colonne_grille_ajoutee',
  'completion.concluded',
  'completion.na',
  'completion.reopened',
  'control_design_factor_documented',
  'control_fsli_lie',
  'control_instances_imported',
  'control_iuc_declared',
  'control_iuc_preuve_documented',
  'control_oe_procedure_documented',
  'control_population_derived',
  'control_population_reconciled',
  'control_population_requested',
  'control_risk_linked',
  'control_risk_unlinked',
  'control_task_added',
  'control_task_procedure_documented',
  'control_test_completed',
  'control_test_extension_required',
  'control_test_extension_waived',
  'deficiency_decided',
  'deficiency_proposed',
  'demo.world.reset',
  'demo_scoping_seeded',
  'detail_de_compte_ctt_echec',
  'detail_de_compte_demande',
  'detail_de_compte_demande_ctt',
  'deviation_explained',
  'di_assessed',
  'engagement.created',
  'engagement.switched',
  'entity.created',
  'estimation_imported',
  'estimation_requests_drafted',
  'estimation_sample_drawn',
  'evaluation_response_recorded',
  'evidence_attached_to_item',
  'evidence_quarantined',
  'evidence_received',
  'evidence_unquarantined',
  'exception_escalated',
  'exception_resolved',
  'exception_scope_limitation',
  'explanation_answered',
  'extraction_completed',
  'extraction_verified',
  'file_closed',
  'file_sealed',
  'fs.difference_explained',
  'fs.line_documented',
  'fs.lines_declared',
  'fs.lines_tied',
  'fslis_rebuilt',
  'gl_import_rejected',
  'gl_imported',
  'inbound_email_processed',
  'inbound_email_quarantined',
  'independence.declaration.opened',
  'independence.declaration.revised',
  'independence.declaration.signed',
  'independence.nas.recorded',
  'interview_created',
  'interview_understanding_written',
  'ipe.recorded',
  'ipe_rapport.created',
  'ledger_no_longer_provisional',
  'listing_imported',
  'matching_completed',
  'materialite_bascule_echec',
  'materialite_basculee',
  'materiality_proposed',
  'materiality_validated',
  'methodology.designated',
  'methodology.published',
  'milestone.done',
  'milestone.set',
  'misstatement_dismissed_as_anomaly',
  'nl_query_executed',
  'nl_query_refused',
  'period.created',
  'piece_demandee',
  'pieces_demandees_en_lot',
  'point_action_client_assigne',
  'point_action_client_relance',
  'procedure_deplanned',
  'procedure_planned',
  'process_change_decided',
  'process_flowchart_client_depose',
  'process_imported',
  'process_replaced',
  'proposition.acceptee',
  'proposition.creee',
  'proposition.modifiee',
  'proposition.perimee',
  'proposition.refusee',
  'questionnaire.answered',
  'rcm_imported',
  'reconciliation_computed',
  'reconciliation_difference_documented',
  'reconciliation_scope_limitation',
  'reimport_invalidation',
  'reminders_paused',
  'request_generated',
  'request_marked_submitted',
  'request_sent',
  'reunion.contact_cle',
  'reunion.contact_domaine',
  'reunion.creneau_choisi',
  'reunion.envoi_simule',
  'review_note_added',
  'review_note_addressed',
  'review_note_backdated',
  'review_note_closed',
  'review_note_otto_executed',
  'review_note_otto_refused',
  'review_note_replied',
  'risk.assessed',
  'risk.factor.confirmed',
  'risk.factor.dismissed',
  'risk.factor.raised',
  'risk.override.cleared',
  'risk.override.set',
  'sample_drawn',
  'sample_evaluation_computed',
  'sample_evaluation_concluded',
  'sample_item_sortie_statuee',
  'sample_params_validated',
  'sample_proposed',
  'scoping_confirmed',
  'scoping_proposed',
  'section.assigned',
  'section.sent',
  'signoff.hash_backfill',
  'tb_import_rejected',
  'tb_imported',
  'team.member.assigned',
  'team.member.exited',
  'test_cell_dispositioned',
  'test_grid_computed',
  'test_grid_frozen',
  'test_line_concluded',
  'transcript_analyzed',
  'transcript_deposited',
  'transcript_gap_decided',
  'transcript_purged',
  'verification_check_performed',
  'verification_run_started',
  'walkthrough_analyzed',
  'walkthrough_attached',
  'walkthrough_deleted',
  'walkthrough_gap_decided',
  'walkthrough_transcript_deposited',
  'workpaper_attachment_added',
  'workpaper_drafted',
  'workpaper_edited',
  'workpaper_exported',
  'workpaper_signed',
  'wp_column_added',
  'wp_column_cancelled',
  'wp_column_clarification_proposed',
  'wp_column_confirmed',
  'wp_column_filled',
  'wp_column_interpreted',
] as const;

export type Verbe = (typeof VERBES)[number];

const REGISTRE = new Set<string>(VERBES);

/** LE SEUL DOUBLON TROUVÉ À CE JOUR : `engagement_created` (seed.ts) était un second
 *  nom pour `engagement.created` (services/engagement.ts, le chemin réel — corrigé pour
 *  émettre le nom canonique directement, cet alias ne sert donc plus qu'à une LECTURE
 *  qui chercherait l'ancien nom dans de l'historique). */
export const ALIAS_VERBES: Readonly<Record<string, Verbe>> = {
  engagement_created: 'engagement.created',
};

/** DEUX SONDES DE HARNAIS, PAS DES VERBES MÉTIER — `schema.test.ts` éprouve la chaîne de
 *  hachage elle-même (n'importe quel verbe ferait l'affaire, celui-ci n'a aucun sens
 *  d'audit) ; `tenant.test.ts` éprouve que `logEvent` reste gardé par LOC-01 même sous
 *  ce registre neuf. Séparées de `VERBES` pour ne jamais polluer le registre réel avec un
 *  mot qui n'existe QUE dans un test — mais recensées ici, jamais laissées faire
 *  échouer leur propre test en silence (règle 24 : un fichier de sonde se nomme). */
const VERBES_SONDE_TEST = new Set(['test_event', 'essai_garde']);

/** Un verbe est valide s'il est au registre, un alias connu, ou une sonde de harnais
 *  déclarée — jamais un troisième cas deviné au site d'appel. */
export function verbeConnu(verb: string): boolean {
  return REGISTRE.has(verb) || Object.prototype.hasOwnProperty.call(ALIAS_VERBES, verb)
    || VERBES_SONDE_TEST.has(verb);
}

/** Le verbe canonique pour un verbe donné — lui-même s'il est déjà canonique, sa
 *  cible s'il est un alias. Ne lève jamais : un appelant qui veut REFUSER un verbe
 *  inconnu appelle `verbeConnu` d'abord (voir `events.ts::logEvent`). */
export function verbeCanonique(verb: string): string {
  return ALIAS_VERBES[verb] ?? verb;
}
