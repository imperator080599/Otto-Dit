// ADR-017 — CLOSED catalogue of parameterized queries. The LLM may only pick an `id` from
// this file and fill typed params; it never emits SQL and never writes prose about the
// answer. Every SQL string here is hand-written and reviewed.

export type ParamType = 'int' | 'money_eur' | 'threshold_ref' | 'date_ref' | 'enum';

export interface ParamSpec {
  name: string;
  type: ParamType;
  label: { fr: string; en: string };
  default?: string | number;
  min?: number;
  max?: number;
  options?: string[]; // for enum / threshold_ref

}

export interface QueryTemplate {
  id: string;
  label: { fr: string; en: string };
  /** Natural-language examples — shown to the user AND given to the planner. */
  examples: { fr: string; en: string };
  params: ParamSpec[];
  columns: { key: string; label: { fr: string; en: string }; kind?: 'money' | 'date' | 'badge' }[];
  /** $1 is always engagement_id; further params are bound in `params` order. */
  sql: string;
  /** Builds a click-through link for a result row, or null. */
  link?: (row: Record<string, unknown>, engagementId: string) => string | null;
}

const THRESHOLDS = ['materiality', 'performance_materiality', 'clearly_trivial', 'tolerable_misstatement', 'zero'];

export const CATALOG: QueryTemplate[] = [
  {
    id: 'exceptions_open_above_threshold',
    label: {
      fr: 'Exceptions non résolues dont l’impact dépasse un seuil',
      en: 'Unresolved exceptions with impact above a threshold',
    },
    examples: {
      fr: 'quelles sections ont des exceptions non résolues au-dessus du seuil de signification ?',
      en: 'which sections have unresolved exceptions above materiality?',
    },
    params: [
      { name: 'threshold', type: 'threshold_ref', label: { fr: 'Seuil', en: 'Threshold' }, default: 'clearly_trivial', options: THRESHOLDS },
    ],
    columns: [
      { key: 'fsli_or_control', label: { fr: 'Section', en: 'Section' } },
      { key: 'taxonomy_code', label: { fr: 'Type', en: 'Type' }, kind: 'badge' },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
      { key: 'amount_impact', label: { fr: 'Impact', en: 'Impact' }, kind: 'money' },
      { key: 'description', label: { fr: 'Description', en: 'Description' } },
    ],
    sql: `select x.id,
                 coalesce(p.fsli_code, c.code, '—') fsli_or_control,
                 x.taxonomy_code, x.status, x.amount_impact::text, x.description
          from exception x
          left join sample_item si on si.id = x.sample_item_id
          left join sample s on s.id = si.sample_id
          left join procedure_instance p on p.id = s.procedure_id
          left join control c on c.id = p.control_id
          where x.engagement_id = $1
            and x.status in ('open','clarification_requested','explained')
            and coalesce(x.amount_impact, 0) >= $2
          order by coalesce(x.amount_impact,0) desc, x.created_at`,
    link: (_r, eng) => `/eng/${eng}/exceptions`,
  },
  {
    id: 'requests_overdue',
    label: { fr: 'Demandes en retard de plus de N jours', en: 'Requests more than N days overdue' },
    examples: {
      fr: 'quelles demandes sont en retard de plus de 10 jours ?',
      en: 'which requests are more than 10 days late?',
    },
    params: [
      { name: 'days', type: 'int', label: { fr: 'Jours de retard', en: 'Days late' }, default: 10, min: 0, max: 365 },
      // lateness is measured against the engagement clock, not the server's wall clock:
      // an answer about a file is always "as of" a date, and that date is shown with it
      { name: 'as_of', type: 'date_ref', label: { fr: 'Au', en: 'As of' }, default: 'today' },
    ],
    columns: [
      { key: 'seq', label: { fr: 'N°', en: '#' } },
      { key: 'title', label: { fr: 'Demande', en: 'Request' } },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
      { key: 'due_date', label: { fr: 'Échéance', en: 'Due' }, kind: 'date' },
      { key: 'days_late', label: { fr: 'Retard (j)', en: 'Days late' } },
      { key: 'pending_items', label: { fr: 'Éléments manquants', en: 'Pending items' } },
    ],
    sql: `select r.id, 'R-' || lpad(r.seq_no::text, 3, '0') seq, r.title, r.status, r.due_date::text,
                 ($3::date - r.due_date)::text days_late,
                 (select count(*) from request_item i where i.request_id = r.id and i.status = 'pending')::text pending_items
          from request r
          where r.engagement_id = $1
            and r.due_date is not null
            and r.status in ('sent','partially_submitted','reopened')
            and ($3::date - r.due_date) > $2
          order by r.due_date`,
    link: (r, eng) => `/eng/${eng}/requests/${r.id}`,
  },
  {
    id: 'request_items_missing',
    label: { fr: 'Éléments demandés non reçus', en: 'Requested items not received' },
    examples: { fr: 'quels justificatifs manquent encore ?', en: 'which supporting documents are still missing?' },
    params: [],
    columns: [
      { key: 'seq', label: { fr: 'N°', en: '#' } },
      { key: 'description', label: { fr: 'Élément', en: 'Item' } },
      { key: 'kind', label: { fr: 'Nature', en: 'Kind' }, kind: 'badge' },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
    ],
    sql: `select i.id, 'R-' || lpad(r.seq_no::text, 3, '0') seq, i.description, i.kind, i.status
          from request_item i join request r on r.id = i.request_id
          where r.engagement_id = $1 and i.status = 'pending' and r.status <> 'draft'
          order by r.seq_no, i.created_at`,
    link: (_r, eng) => `/eng/${eng}/requests`,
  },
  {
    id: 'misstatements_uncorrected',
    label: { fr: 'Anomalies non corrigées', en: 'Uncorrected misstatements' },
    examples: { fr: 'quelles anomalies restent non corrigées ?', en: 'which misstatements are uncorrected?' },
    params: [],
    columns: [
      { key: 'kind', label: { fr: 'Nature', en: 'Kind' }, kind: 'badge' },
      { key: 'amount', label: { fr: 'Montant', en: 'Amount' }, kind: 'money' },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
      { key: 'notes', label: { fr: 'Note', en: 'Note' } },
    ],
    sql: `select m.id, m.kind, m.amount::text, m.status, m.notes
          from misstatement m
          where m.engagement_id = $1 and m.corrected = false and m.status <> 'dismissed'
          order by m.amount desc`,
    link: (_r, eng) => `/eng/${eng}/exceptions`,
  },
  {
    id: 'workpapers_unsigned',
    label: { fr: 'Papiers de travail non signés ou périmés', en: 'Workpapers unsigned or outdated' },
    examples: { fr: 'quelles feuilles de travail ne sont pas signées ?', en: 'which workpapers are not signed yet?' },
    params: [],
    columns: [
      { key: 'code', label: { fr: 'Code', en: 'Code' } },
      { key: 'title', label: { fr: 'Titre', en: 'Title' } },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
      { key: 'signoffs', label: { fr: 'Visas', en: 'Sign-offs' } },
      { key: 'open_notes', label: { fr: 'Notes ouvertes', en: 'Open notes' } },
    ],
    sql: `select w.id, w.code, w.title, w.status,
                 (select count(*) from signoff s where s.workpaper_id = w.id)::text signoffs,
                 (select count(*) from review_note n where n.workpaper_id = w.id and n.status = 'open')::text open_notes
          from workpaper w
          where w.engagement_id = $1 and w.status in ('draft','in_review','reviewed','outdated')
          order by w.code`,
    link: (r, eng) => `/eng/${eng}/workpapers/${r.id}`,
  },
  {
    id: 'review_notes_open',
    label: { fr: 'Notes de revue ouvertes (par destinataire)', en: 'Open review notes (by assignee)' },
    examples: { fr: 'quelles notes de revue restent ouvertes et pour qui ?', en: 'which review notes are still open and for whom?' },
    params: [],
    columns: [
      { key: 'assignee', label: { fr: 'Destinataire', en: 'Assignee' } },
      { key: 'author', label: { fr: 'Auteur', en: 'Author' } },
      { key: 'code', label: { fr: 'Feuille', en: 'Workpaper' } },
      { key: 'text', label: { fr: 'Note', en: 'Note' } },
    ],
    sql: `select n.id, coalesce(a.name,'—') assignee, u.name author, coalesce(w.code,'—') code, n.text
          from review_note n
          join app_user u on u.id = n.author_id
          left join app_user a on a.id = n.assignee_id
          left join workpaper w on w.id = n.workpaper_id
          where n.engagement_id = $1 and n.status = 'open'
          order by assignee, n.created_at`,
    link: (_r, eng) => `/eng/${eng}/workpapers`,
  },
  {
    id: 'extractions_pending_verification',
    label: { fr: 'Extractions en attente de vérification humaine', en: 'Extractions awaiting human verification' },
    examples: { fr: 'que reste-t-il à vérifier sur les extractions ?', en: 'what extraction verification is still pending?' },
    params: [],
    columns: [
      { key: 'filename', label: { fr: 'Document', en: 'Document' } },
      { key: 'rung', label: { fr: 'Barreau', en: 'Rung' }, kind: 'badge' },
      { key: 'overall_confidence', label: { fr: 'Confiance', en: 'Confidence' } },
      { key: 'doc_type', label: { fr: 'Type', en: 'Type' }, kind: 'badge' },
    ],
    sql: `select x.id, e.filename, x.rung, x.overall_confidence::text, e.doc_type
          from extraction x join evidence e on e.id = x.evidence_id
          where e.engagement_id = $1 and x.status = 'pending_verify'
          order by x.overall_confidence nulls first`,
    link: (_r, eng) => `/eng/${eng}/testing`,
  },
  {
    id: 'sample_items_without_evidence',
    label: { fr: 'Éléments sélectionnés sans justificatif reçu', en: 'Sampled items with no evidence received' },
    examples: { fr: 'quels éléments de l’échantillon n’ont aucun justificatif ?', en: 'which sampled items have no evidence at all?' },
    params: [],
    columns: [
      { key: 'piece_ref', label: { fr: 'Pièce', en: 'Piece' } },
      { key: 'aux_label', label: { fr: 'Tiers', en: 'Counterparty' } },
      { key: 'amount', label: { fr: 'Montant', en: 'Amount' }, kind: 'money' },
      { key: 'selection_reason', label: { fr: 'Sélection', en: 'Selection' }, kind: 'badge' },
    ],
    sql: `select si.id, g.piece_ref, g.aux_label, si.amount::text, si.selection_reason
          from sample_item si
          join sample s on s.id = si.sample_id
          join gl_entry g on g.id = si.unit_id
          where s.engagement_id = $1 and s.status = 'drawn' and si.unit_kind = 'gl_entry'
            and not exists (
              select 1 from request_item ri join evidence e on e.request_item_id = ri.id
              where ri.sample_item_id = si.id and e.quarantined = false)
          order by si.amount desc`,
    link: (_r, eng) => `/eng/${eng}/sampling`,
  },
  {
    id: 'controls_with_deviations',
    label: { fr: 'Contrôles présentant des déviations', en: 'Controls with deviations' },
    examples: { fr: 'quels contrôles ont des déviations ?', en: 'which controls have deviations?' },
    params: [],
    columns: [
      { key: 'code', label: { fr: 'Contrôle', en: 'Control' } },
      { key: 'name', label: { fr: 'Intitulé', en: 'Name' } },
      { key: 'deviations', label: { fr: 'Déviations', en: 'Deviations' } },
      { key: 'open_deviations', label: { fr: 'Non traitées', en: 'Open' } },
      { key: 'severity', label: { fr: 'Déficience', en: 'Deficiency' }, kind: 'badge' },
    ],
    sql: `select c.id, c.code, c.name,
                 (select count(*) from deviation d where d.control_id = c.id)::text deviations,
                 (select count(*) from deviation d where d.control_id = c.id and d.status = 'open')::text open_deviations,
                 coalesce((select coalesce(f.severity_final, f.severity_proposed) from deficiency f
                           where f.control_id = c.id order by f.created_at desc limit 1), '—') severity
          from control c
          where c.engagement_id = $1
            and exists (select 1 from deviation d where d.control_id = c.id)
          order by c.code`,
    link: (r, eng) => `/eng/${eng}/rcm/${r.id}`,
  },
  {
    id: 'controls_not_tested',
    label: { fr: 'Contrôles clés non encore testés', en: 'Key controls not yet tested' },
    examples: { fr: 'quels contrôles clés ne sont pas encore testés ?', en: 'which key controls have not been tested yet?' },
    params: [],
    columns: [
      { key: 'code', label: { fr: 'Contrôle', en: 'Control' } },
      { key: 'name', label: { fr: 'Intitulé', en: 'Name' } },
      { key: 'frequency', label: { fr: 'Fréquence', en: 'Frequency' }, kind: 'badge' },
      { key: 'di_status', label: { fr: 'Conception', en: 'D&I' }, kind: 'badge' },
    ],
    sql: `select c.id, c.code, c.name, c.frequency, c.di_status
          from control c
          where c.engagement_id = $1 and c.is_key = true
            and not exists (select 1 from control_test t where t.control_id = c.id and t.status = 'complete')
          order by c.code`,
    link: (r, eng) => `/eng/${eng}/rcm/${r.id}`,
  },
  {
    id: 'deficiencies_by_severity',
    label: { fr: 'Déficiences par gravité', en: 'Deficiencies by severity' },
    examples: { fr: 'où en est-on des déficiences de contrôle interne ?', en: 'what is the deficiency position?' },
    params: [],
    columns: [
      { key: 'severity', label: { fr: 'Gravité', en: 'Severity' }, kind: 'badge' },
      { key: 'code', label: { fr: 'Contrôle', en: 'Control' } },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
      { key: 'narrative', label: { fr: 'Motivation', en: 'Narrative' } },
    ],
    sql: `select f.id, coalesce(f.severity_final, f.severity_proposed) severity, c.code, f.status, f.narrative
          from deficiency f join control c on c.id = f.control_id
          where f.engagement_id = $1
          order by case coalesce(f.severity_final, f.severity_proposed)
                   when 'material_weakness' then 0 when 'significant_deficiency' then 1 else 2 end`,
    link: (_r, eng) => `/eng/${eng}/rcm`,
  },
  {
    id: 'reconciliation_open_differences',
    label: { fr: 'Écarts de rapprochement non documentés', en: 'Undocumented reconciliation differences' },
    examples: { fr: 'reste-t-il des écarts balance/grand livre ouverts ?', en: 'are there open TB/GL differences?' },
    params: [],
    columns: [
      { key: 'account_no', label: { fr: 'Compte', en: 'Account' } },
      { key: 'tb_amount', label: { fr: 'Balance', en: 'TB' }, kind: 'money' },
      { key: 'gl_amount', label: { fr: 'Grand livre', en: 'GL' }, kind: 'money' },
      { key: 'delta', label: { fr: 'Écart', en: 'Delta' }, kind: 'money' },
      { key: 'status', label: { fr: 'Statut', en: 'Status' }, kind: 'badge' },
    ],
    sql: `select ri.id, ri.account_no, ri.tb_amount::text, ri.gl_amount::text, ri.delta::text, ri.status
          from reconciliation_item ri join reconciliation r on r.id = ri.reconciliation_id
          where r.engagement_id = $1 and r.status <> 'superseded' and ri.status = 'open'
          order by abs(ri.delta) desc`,
    link: (_r, eng) => `/eng/${eng}/reconciliation`,
  },
  {
    id: 'ai_involvement',
    label: { fr: 'Interventions de l’IA sur le dossier', en: 'AI involvement on the engagement' },
    examples: { fr: 'où l’IA est-elle intervenue sur ce dossier ?', en: 'where has AI been involved in this engagement?' },
    params: [],
    columns: [
      { key: 'purpose', label: { fr: 'Objet', en: 'Purpose' }, kind: 'badge' },
      { key: 'adapter', label: { fr: 'Fournisseur', en: 'Adapter' } },
      { key: 'model', label: { fr: 'Modèle', en: 'Model' } },
      { key: 'created_at', label: { fr: 'Quand', en: 'When' }, kind: 'date' },
      { key: 'cost_usd', label: { fr: 'Coût ($)', en: 'Cost ($)' } },
    ],
    sql: `select a.id, a.purpose, a.adapter, a.model, a.created_at::text, a.cost_usd::text
          from ai_run a where a.engagement_id = $1 order by a.created_at desc`,
    link: (_r, eng) => `/eng/${eng}/events`,
  },
  {
    id: 'scoping_unconfirmed',
    label: { fr: 'Postes dont le périmètre n’est pas confirmé', en: 'FSLIs with unconfirmed scoping' },
    examples: { fr: 'quels postes attendent encore une confirmation de périmètre ?', en: 'which FSLIs still await a scoping decision?' },
    params: [],
    columns: [
      { key: 'code', label: { fr: 'Poste', en: 'FSLI' } },
      { key: 'name', label: { fr: 'Intitulé', en: 'Name' } },
      { key: 'balance', label: { fr: 'Solde', en: 'Balance' }, kind: 'money' },
      { key: 'scoping', label: { fr: 'Périmètre', en: 'Scoping' }, kind: 'badge' },
    ],
    sql: `select f.id, f.code, f.name, f.balance::text, f.scoping
          from fsli f where f.engagement_id = $1 and f.confirmed_by is null
          order by abs(f.balance) desc`,
    link: (_r, eng) => `/eng/${eng}/scoping`,
  },
];

export function getTemplate(id: string): QueryTemplate | undefined {
  return CATALOG.find((t) => t.id === id);
}
