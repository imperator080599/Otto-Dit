// LE CATALOGUE DE LIBELLÉS — un concept, une entrée, dans chaque locale servie
// (revue utilisateur n°2 §2 ; DA-15 étendu à la langue).
//
// POURQUOI UN CATALOGUE ET PAS UNE TRADUCTION. Passer la plateforme en anglais
// « en dur » reproduirait le défaut que le fondateur dénonce partout ailleurs :
// du non modulable. Une plateforme qui vise plusieurs référentiels vise
// plusieurs langues — c'est la même dimension que le pack. L'anglais est le
// DÉFAUT ; le français reste servi aux cabinets français, et la démonstration
// se montre dans la langue du cabinet à qui on la montre.
//
// LE MOMENT COMPTE, et c'est pour ça que ce fichier existe avant la verticale :
// introduire un catalogue après avoir écrit trois cents libellés, c'est faire
// le travail deux fois. Les écrans migrent quand ils sont TOUCHÉS, jamais en
// une passe de traduction séparée — une passe séparée touche tout sans rien
// éprouver.
//
// CE QUE LE CATALOGUE NE COUVRE PAS ENCORE : les écrans non migrés portent
// leurs libellés en clair, en français. `i18n.test.ts` garde la complétude de
// ce qui EST catalogué ; `lexique.test.ts` continue de tenir la règle « un
// concept = un mot » sur ce qui ne l'est pas. Les deux coexistent tant que la
// migration n'est pas finie — retirer le second maintenant laisserait les
// écrans non migrés sans règle du tout.

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

type Entree = Record<Locale, string>;

export const LIBELLES = {
  // ── Le rail ────────────────────────────────────────────────────────────
  'rail.groupe.dossier': { en: 'Engagement', fr: 'Le dossier' },
  'rail.groupe.comptes': { en: 'Accounts', fr: 'Les comptes' },
  'rail.groupe.postes': { en: 'Areas', fr: 'Les postes' },
  'rail.groupe.transverse': { en: 'Cross-cutting', fr: 'Travaux transverses' },
  'rail.groupe.demandes': { en: 'Client requests', fr: 'Demandes au client' },
  'rail.groupe.fin': { en: 'Completion', fr: 'Fin de mission' },
  'rail.tout': { en: 'show all', fr: 'tout afficher' },
  'rail.reduire': { en: 'collapse', fr: 'réduire' },
  'rail.aVenir': { en: '{n} not yet available', fr: '{n} à venir' },
  // Les DESTINATIONS du rail. Leurs infobulles restent en français pour
  // l'instant — migration progressive, et c'est dit plutôt que caché.
  'rail.vue': { en: 'Overview', fr: 'Vue d’ensemble' },
  'rail.acceptation': { en: 'Acceptance', fr: 'Acceptation' },
  'rail.equipe': { en: 'Team and independence', fr: 'Équipe et indépendance' },
  'rail.reunions': { en: 'Meetings', fr: 'Réunions' },
  'rail.reprise': { en: 'Prior-year carry-forward', fr: 'Reprise du dossier N-1' },
  'rail.imports': { en: 'Trial balance and general ledger', fr: 'Balance et grand livre' },
  'rail.rapprochement': { en: 'TB / GL reconciliation', fr: 'Rapprochement comptable' },
  'rail.balancesAux': { en: 'Sub-ledgers', fr: 'Balances auxiliaires' },
  'rail.postesRetenus': { en: 'Areas in scope', fr: 'Postes retenus' },
  'rail.processus': { en: 'Processes', fr: 'Processus' },
  'rail.controleInterne': { en: 'Internal control', fr: 'Contrôle interne' },
  'rail.estimations': { en: 'Accounting estimates', fr: 'Estimations comptables' },
  'rail.circularisations': { en: 'Confirmations', fr: 'Circularisations' },
  'rail.ecarts': { en: 'Exceptions', fr: 'Écarts relevés' },
  'rail.deviations': { en: 'Control deviations', fr: 'Déviations (SOX)' },
  'rail.notes': { en: 'Review notes', fr: 'Notes de revue' },
  'rail.demandes': { en: 'Client requests', fr: 'Demandes au client' },
  'rail.pieces': { en: 'Evidence received', fr: 'Pièces reçues' },
  'rail.pointage': { en: 'Financial statement tie-out', fr: 'Pointage des états financiers' },
  'rail.achevement': { en: 'Completion', fr: 'Achèvement' },
  'rail.cloture': { en: 'Closing and archive', fr: 'Clôture et archive' },
  'rail.journal': { en: 'Engagement log', fr: 'Journal du dossier' },

  // ── La vue d'ensemble ──────────────────────────────────────────────────
  'vue.titre': { en: 'Overview', fr: 'Vue d’ensemble' },
  'vue.assignments': { en: 'My assignments', fr: 'Mes attributions' },
  'vue.currentlyWithMe': { en: 'Currently with me', fr: 'Dans mon camp' },
  'vue.assignedToMe': { en: 'Assigned to me', fr: 'Qui m’est attribué' },
  'vue.trackedByMe': { en: 'Tracked by me', fr: 'Que je suis' },
  'vue.recent': { en: 'Recent', fr: 'Ouvert récemment' },
  'vue.engagementStatus': { en: 'Engagement status', fr: 'Avancement de la mission' },
  'vue.reviewNotes': { en: 'Review notes', fr: 'Notes de revue' },
  'vue.byMember': { en: 'By team member', fr: 'Par membre de l’équipe' },
  'vue.blocking': { en: 'What prevents signing', fr: 'Ce qui empêche de signer' },
  'vue.nothing': { en: 'Nothing here', fr: 'Rien ici' },
  'vue.sendTo': { en: 'Send to', fr: 'Envoyer à' },
  'vue.track': { en: 'Track', fr: 'Suivre' },
  'vue.untrack': { en: 'Stop tracking', fr: 'Ne plus suivre' },
  'vue.owner': { en: 'Owner', fr: 'Responsable' },
  'vue.holder': { en: 'Held by', fr: 'Détenue par' },
  'vue.section': { en: 'Section', fr: 'Section' },
  'vue.status': { en: 'Status', fr: 'Statut' },

  // ── Les statuts (l'échelle unique) ─────────────────────────────────────
  'statut.not_started': { en: 'Not started', fr: 'Non commencé' },
  'statut.in_preparation': { en: 'In preparation', fr: 'En préparation' },
  'statut.completed': { en: 'Completed', fr: 'Terminé' },
  'statut.reviewed': { en: 'Reviewed', fr: 'Revu' },

  // ── Les notes de revue ─────────────────────────────────────────────────
  'note.priority': { en: 'Blocking', fr: 'Bloquante' },
  'note.open': { en: 'Open', fr: 'Ouverte' },
  'note.closed': { en: 'Closed', fr: 'Close' },

  // ── Le poste ───────────────────────────────────────────────────────────
  'poste.leadsheet': { en: 'Leadsheet', fr: 'Leadsheet' },
  'poste.account': { en: 'Account', fr: 'Compte' },
  'poste.caption': { en: 'Caption', fr: 'Libellé' },
  'poste.balance': { en: 'Balance', fr: 'Solde' },
  'poste.xref': { en: 'XREF', fr: 'XREF' },
  'poste.total': { en: 'Total', fr: 'Total' },
  'poste.trialBalance': { en: 'Trial balance', fr: 'Balance générale' },
  'poste.process': { en: 'Process', fr: 'Processus' },
  'poste.internalControl': { en: 'Internal control', fr: 'Contrôle interne' },
  'poste.riskAssessment': { en: 'Risk assessment', fr: 'Évaluation des risques' },
  'poste.sample': { en: 'Sample', fr: 'Échantillon' },
  'poste.testing': { en: 'Testing', fr: 'Testing' },
  'poste.openItems': { en: 'Still open', fr: 'Ce qui reste ouvert' },
  'poste.exceptions': { en: 'Exceptions', fr: 'Écarts' },
  'poste.reviewNotes': { en: 'Review notes', fr: 'Notes de revue' },
  'poste.requests': { en: 'Client requests', fr: 'Demandes au client' },

  // ── Le papier de travail ───────────────────────────────────────────────
  'wp.testing': { en: 'Testing', fr: 'Testing' },
  'wp.selected': { en: 'Selected items', fr: 'Éléments sélectionnés' },
  'wp.work': { en: 'Work performed', fr: 'Travaux réalisés' },
  'wp.ipe': { en: 'Internal information', fr: 'Information produite par l’entité' },
  'wp.ipe.question': {
    en: 'Did this work rely on information produced by the entity (order listings, delivery notes, a system report)?',
    fr: 'Ce travail s’appuie-t-il sur une information produite par l’entité (listing de commandes, bons de livraison, état extrait du système) ?',
  },
  'wp.ipe.yes': { en: 'Yes', fr: 'Oui' },
  'wp.ipe.no': { en: 'No', fr: 'Non' },
  'wp.ipe.nature': { en: 'Nature', fr: 'Nature' },
  'wp.ipe.manual': { en: 'Manual', fr: 'Manuelle' },
  'wp.ipe.system': { en: 'System-generated', fr: 'Générée par le système' },
  'wp.ipe.reportCode': { en: 'Report code', fr: 'Code du rapport' },
  'wp.ipe.file': { en: 'File used', fr: 'Fichier utilisé' },
  'wp.ipe.completeness': { en: 'How completeness was validated', fr: 'Comment l’exhaustivité a été validée' },
  'wp.ipe.accuracy': { en: 'How accuracy was validated', fr: 'Comment l’exactitude a été validée' },
  'wp.ipe.date': { en: 'Document date', fr: 'Date du document' },
  'wp.ipe.appropriate': { en: 'Appropriate for this test', fr: 'Approprié au test réalisé' },
  'wp.ipe.record': { en: 'Record', fr: 'Enregistrer' },
  'wp.ipe.draft': { en: 'Propose wording', fr: 'Proposer la rédaction' },
  'wp.ipe.proposed': { en: 'Proposed by OTTO — review before it counts', fr: 'Proposé par OTTO — à revoir avant que ça compte' },

  // ── Commun ─────────────────────────────────────────────────────────────
  'commun.language': { en: 'Language', fr: 'Langue' },
  'commun.none': { en: '—', fr: '—' },
} satisfies Record<string, Entree>;

export type CleLibelle = keyof typeof LIBELLES;

/** Le libellé, dans la locale demandée, avec ses variables. */
export function traduire(locale: Locale, cle: CleLibelle, vars: Record<string, string | number> = {}): string {
  const s = (LIBELLES as Record<string, Entree>)[cle][locale];
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
