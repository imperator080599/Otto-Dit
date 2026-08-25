// ADR-017 — deterministic signals used to translate a question into a catalogue entry
// WITHOUT an LLM (P4: no LLM where a rule suffices). The LLM planner is the fallback for
// phrasings the rules miss, never the first resort.
//
// `core` = the subject the question is about (weight 2, at least one hit required).
// `qualifier` = the condition/state narrowing it (weight 1).
// Matching is substring-based on the accent-folded, lowercased question.

export interface TemplateSignals {
  core: string[];
  qualifier: string[];
}

export const SIGNALS: Record<string, TemplateSignals> = {
  exceptions_open_above_threshold: {
    core: ['exception', 'anomalie de test', 'ecart de vouching', 'discrepanc'],
    qualifier: ['non resolue', 'non resolues', 'ouverte', 'unresolved', 'open', 'seuil', 'threshold', 'signification', 'materiality', 'section', 'au-dessus', 'above', 'superieur'],
  },
  requests_overdue: {
    core: ['demande', 'request', 'relance'],
    qualifier: ['retard', 'overdue', 'late', 'echeance', 'due', 'jours', 'days', 'depasse'],
  },
  request_items_missing: {
    core: ['justificatif', 'piece', 'document', 'supporting', 'item'],
    qualifier: ['manque', 'manquant', 'missing', 'pas recu', 'non recu', 'not received', 'en attente', 'outstanding', 'pending'],
  },
  misstatements_uncorrected: {
    core: ['anomalie', 'misstatement', 'ajustement', 'adjustment'],
    qualifier: ['non corrigee', 'non corrigees', 'uncorrected', 'not corrected', 'passee en revue', 'accumul'],
  },
  workpapers_unsigned: {
    core: ['feuille de travail', 'feuilles de travail', 'workpaper', 'papier de travail', 'dossier de travail'],
    qualifier: ['non signee', 'non signees', 'pas signee', 'unsigned', 'not signed', 'sans visa', 'visa', 'perime', 'outdated', 'a revoir'],
  },
  review_notes_open: {
    core: ['note de revue', 'notes de revue', 'review note', 'point de revue'],
    qualifier: ['ouverte', 'ouvertes', 'open', 'non traitee', 'unresolved', 'pour qui', 'assignee', 'destinataire'],
  },
  extractions_pending_verification: {
    core: ['extraction', 'extractions', 'ocr', 'lecture automatique'],
    qualifier: ['verifier', 'verification', 'a valider', 'pending', 'en attente', 'awaiting', 'non verifiee'],
  },
  sample_items_without_evidence: {
    core: ['echantillon', 'element selectionne', 'elements selectionnes', 'sample', 'sampled item', 'selection'],
    qualifier: ['sans justificatif', 'aucun justificatif', 'no evidence', 'without evidence', 'sans piece', 'rien recu', 'manque'],
  },
  controls_with_deviations: {
    core: ['controle', 'controles', 'control', 'controls'],
    qualifier: ['deviation', 'deviations', 'ecart', 'exception de controle', 'defaillance'],
  },
  controls_not_tested: {
    core: ['controle', 'controles', 'control', 'controls'],
    qualifier: ['non teste', 'pas encore', 'jamais teste', 'not tested', 'not yet', 'untested', 'reste a tester', 'sans test'],
  },
  deficiencies_by_severity: {
    core: ['deficience', 'deficiences', 'deficiency', 'deficiencies', 'faiblesse', 'material weakness'],
    qualifier: ['gravite', 'severity', 'significative', 'ou en est', 'position', 'classement'],
  },
  reconciliation_open_differences: {
    core: ['rapprochement', 'reconciliation', 'balance', 'grand livre', 'trial balance'],
    qualifier: ['ecart', 'ecarts', 'difference', 'differences', 'ouvert', 'open', 'non documente', 'undocumented'],
  },
  ai_involvement: {
    core: [' ia ', 'intelligence artificielle', ' ai ', 'llm', 'modele', 'model', 'otto a fait'],
    qualifier: ['intervenu', 'intervention', 'involved', 'involvement', 'utilise', 'used', 'ou ', 'where', 'cout', 'cost'],
  },
  scoping_unconfirmed: {
    core: ['perimetre', 'scoping', 'scope', 'poste', 'postes', 'fsli'],
    qualifier: ['non confirme', 'pas confirme', 'unconfirmed', 'a confirmer', 'attente', 'awaiting', 'decision'],
  },
};
